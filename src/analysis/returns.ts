/**
 * The returns analysis -- this demo's expansion of the paper.
 *
 * SOLace is forward-only, so BF/BS are terminal there. Here a blank can be
 * revisited, and each ReturnLink pairs the blank state on the way out with the
 * state of the visit that came back. That pair is a first-class edge, on top of
 * the two visits' own path transitions.
 */
import type { BehavioralState } from '../encoding/encode';
import { STATES, isBlankState } from '../encoding/encode';
import type { Attempt, Question, ReturnLink, Student, Topic } from '../data/types';
import { questionAt } from '../data/types';

/** The states a return visit can land in (a return always answers). */
export const RETURN_STATES: readonly BehavioralState[] = ['C', 'W', 'V', 'R'] as const;
export const BLANK_STATES: readonly BehavioralState[] = ['BF', 'BS'] as const;

export interface ReturnOutcomeRow {
  blankState: BehavioralState;
  total: number;
  /** Counts of each return state given this blank state. */
  counts: ReadonlyMap<BehavioralState, number>;
  /** P(return = Y | blank = X). */
  shares: ReadonlyMap<BehavioralState, number>;
  /**
   * lift(X -> Y) = P(return = Y | blank = X) / P(Y among all answering visits).
   * Null when the baseline is zero.
   */
  lifts: ReadonlyMap<BehavioralState, number | null>;
  correctRate: number;
}

export interface TopicReturnRow {
  topicId: number;
  label: string;
  blankFirstQuestions: number;
  returnedQuestions: number;
  /** returnedQuestions / blankFirstQuestions. */
  returnShare: number;
  returnCorrectRate: number;
}

export interface StudentReturnRow {
  studentId: string;
  label: string;
  blankFirstQuestions: number;
  returnedQuestions: number;
  returnShare: number;
  returnCorrectRate: number;
}

export interface ReturnsSummary {
  links: readonly ReturnLink[];
  /** Questions whose first visit was blank, across the whole class. */
  blankFirstQuestions: number;
  /** Of those, how many were answered on a later visit. */
  returnedQuestions: number;
  returnShare: number;
  /** Correctness on return visits vs first-pass answering visits. */
  returnCorrectRate: number;
  firstPassCorrectRate: number;
  /** returnCorrectRate - firstPassCorrectRate. */
  correctnessGap: number;
  byBlankState: readonly ReturnOutcomeRow[];
  byTopic: readonly TopicReturnRow[];
  byStudent: readonly StudentReturnRow[];
  /** Baseline used for the lifts: P(state) over all answering visits. */
  answeringBaseline: ReadonlyMap<BehavioralState, number>;
  /** Median gap, in visits, between the skip and the return. */
  medianGapInVisits: number;
}

export function computeReturns(
  attempts: readonly Attempt[],
  students: readonly Student[],
  questions: readonly Question[],
  topics: readonly Topic[],
): ReturnsSummary {
  const links = attempts.flatMap((attempt) => attempt.returnLinks);

  // Baseline: how often each answering state shows up across all answering visits.
  const answeringCounts = new Map<BehavioralState, number>();
  let answeringTotal = 0;
  let firstPassCorrect = 0;
  let firstPassTotal = 0;
  for (const attempt of attempts) {
    for (const visit of attempt.path) {
      if (isBlankState(visit.state)) continue;
      answeringCounts.set(visit.state, (answeringCounts.get(visit.state) ?? 0) + 1);
      answeringTotal += 1;
      if (!visit.isReturn) {
        firstPassTotal += 1;
        if (visit.wasCorrect) firstPassCorrect += 1;
      }
    }
  }
  const answeringBaseline = new Map<BehavioralState, number>();
  for (const state of STATES) {
    answeringBaseline.set(
      state,
      answeringTotal > 0 ? (answeringCounts.get(state) ?? 0) / answeringTotal : 0,
    );
  }

  // Blank-first questions: the denominator for "how many came back".
  let blankFirstQuestions = 0;
  let returnedQuestions = 0;
  const topicBlankFirst = new Map<number, number>();
  const topicReturned = new Map<number, number>();
  const topicReturnCorrect = new Map<number, number>();
  const studentBlankFirst = new Map<string, number>();
  const studentReturned = new Map<string, number>();
  const studentReturnCorrect = new Map<string, number>();
  for (const topic of topics) {
    topicBlankFirst.set(topic.id, 0);
    topicReturned.set(topic.id, 0);
    topicReturnCorrect.set(topic.id, 0);
  }

  for (const attempt of attempts) {
    studentBlankFirst.set(attempt.studentId, 0);
    studentReturned.set(attempt.studentId, 0);
    studentReturnCorrect.set(attempt.studentId, 0);
    for (const outcome of attempt.byQuestion.values()) {
      const first = outcome.visits[0];
      if (first === undefined || !first.leftBlank) continue;
      const topicId = questionAt(questions, outcome.questionNumber).topicId;
      blankFirstQuestions += 1;
      topicBlankFirst.set(topicId, (topicBlankFirst.get(topicId) ?? 0) + 1);
      studentBlankFirst.set(attempt.studentId, (studentBlankFirst.get(attempt.studentId) ?? 0) + 1);

      const answered = outcome.visits.find((visit) => visit.isReturn && !visit.leftBlank);
      if (answered === undefined) continue;
      returnedQuestions += 1;
      topicReturned.set(topicId, (topicReturned.get(topicId) ?? 0) + 1);
      studentReturned.set(attempt.studentId, (studentReturned.get(attempt.studentId) ?? 0) + 1);
      if (answered.wasCorrect) {
        topicReturnCorrect.set(topicId, (topicReturnCorrect.get(topicId) ?? 0) + 1);
        studentReturnCorrect.set(
          attempt.studentId,
          (studentReturnCorrect.get(attempt.studentId) ?? 0) + 1,
        );
      }
    }
  }

  const byBlankState: ReturnOutcomeRow[] = BLANK_STATES.map((blankState) => {
    const rows = links.filter((link) => link.blankState === blankState);
    const counts = new Map<BehavioralState, number>();
    for (const state of RETURN_STATES) counts.set(state, 0);
    let correct = 0;
    for (const link of rows) {
      counts.set(link.returnState, (counts.get(link.returnState) ?? 0) + 1);
      if (link.returnWasCorrect) correct += 1;
    }
    const shares = new Map<BehavioralState, number>();
    const lifts = new Map<BehavioralState, number | null>();
    for (const state of RETURN_STATES) {
      const share = rows.length > 0 ? (counts.get(state) ?? 0) / rows.length : 0;
      shares.set(state, share);
      const baseline = answeringBaseline.get(state) ?? 0;
      lifts.set(state, rows.length === 0 || baseline === 0 ? null : share / baseline);
    }
    return {
      blankState,
      total: rows.length,
      counts,
      shares,
      lifts,
      correctRate: rows.length > 0 ? correct / rows.length : 0,
    };
  });

  const byTopic: TopicReturnRow[] = topics.map((topic) => {
    const blankFirst = topicBlankFirst.get(topic.id) ?? 0;
    const returned = topicReturned.get(topic.id) ?? 0;
    const correct = topicReturnCorrect.get(topic.id) ?? 0;
    return {
      topicId: topic.id,
      label: topic.label,
      blankFirstQuestions: blankFirst,
      returnedQuestions: returned,
      returnShare: blankFirst > 0 ? returned / blankFirst : 0,
      returnCorrectRate: returned > 0 ? correct / returned : 0,
    };
  });

  const byStudent: StudentReturnRow[] = students.map((student) => {
    const blankFirst = studentBlankFirst.get(student.id) ?? 0;
    const returned = studentReturned.get(student.id) ?? 0;
    const correct = studentReturnCorrect.get(student.id) ?? 0;
    return {
      studentId: student.id,
      label: student.label,
      blankFirstQuestions: blankFirst,
      returnedQuestions: returned,
      returnShare: blankFirst > 0 ? returned / blankFirst : 0,
      returnCorrectRate: returned > 0 ? correct / returned : 0,
    };
  });

  const returnCorrect = links.filter((link) => link.returnWasCorrect).length;
  const gaps = links.map((link) => link.gapInVisits).sort((a, b) => a - b);
  const medianGapInVisits = gaps.length === 0 ? 0 : (gaps[Math.floor(gaps.length / 2)] as number);

  const returnCorrectRate = links.length > 0 ? returnCorrect / links.length : 0;
  const firstPassCorrectRate = firstPassTotal > 0 ? firstPassCorrect / firstPassTotal : 0;

  return {
    links,
    blankFirstQuestions,
    returnedQuestions,
    returnShare: blankFirstQuestions > 0 ? returnedQuestions / blankFirstQuestions : 0,
    returnCorrectRate,
    firstPassCorrectRate,
    correctnessGap: returnCorrectRate - firstPassCorrectRate,
    byBlankState,
    byTopic,
    byStudent,
    answeringBaseline,
    medianGapInVisits,
  };
}
