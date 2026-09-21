/**
 * Per-question classroom summaries, for the aggregate timeline.
 *
 * Everything here is still derived from the temporal visit path: a question's
 * state distribution counts every visit to it, first pass and return alike.
 */
import type { BehavioralState } from '../encoding/encode';
import { STATES, isBlankState } from '../encoding/encode';
import type { Attempt, Question, Visit } from '../data/types';
import type { Changepoint } from './changepoints';

export interface QuestionAggregate {
  questionNumber: number;
  topicId: number;
  /** Every visit to this question across the class. */
  visits: number;
  /** Students who reached this question at all. */
  students: number;
  stateCounts: ReadonlyMap<BehavioralState, number>;
  /** Share of visits to this question that were blank. */
  blankVisitShare: number;
  /** Share of students who left it blank on the first pass. */
  blankFirstShare: number;
  /** Of those, the share that came back and answered. */
  returnShare: number;
  /** Share of students with a changepoint anchored on this question. */
  changepointShare: number;
  negativeChangepointShare: number;
  /** Share of students whose final answer here was correct. */
  accuracy: number;
  medianSeconds: number;
  rapidThreshold: number;
}

export interface AggregateTable {
  questions: readonly QuestionAggregate[];
  /** Largest per-question visit count, for scaling the stacked bars. */
  maxVisits: number;
}

export function computeAggregate(
  attempts: readonly Attempt[],
  questions: readonly Question[],
  changepoints: readonly Changepoint[],
  medianVisitSeconds: ReadonlyMap<number, number>,
  rapidThresholds: ReadonlyMap<number, number>,
): AggregateTable {
  const visitsByQuestion = new Map<number, Visit[]>();
  const blankFirstByQuestion = new Map<number, number>();
  const returnedByQuestion = new Map<number, number>();
  const correctByQuestion = new Map<number, number>();
  const studentsByQuestion = new Map<number, number>();
  const changepointsByQuestion = new Map<number, number>();
  const negativeByQuestion = new Map<number, number>();

  for (const question of questions) {
    visitsByQuestion.set(question.questionNumber, []);
    blankFirstByQuestion.set(question.questionNumber, 0);
    returnedByQuestion.set(question.questionNumber, 0);
    correctByQuestion.set(question.questionNumber, 0);
    studentsByQuestion.set(question.questionNumber, 0);
    changepointsByQuestion.set(question.questionNumber, 0);
    negativeByQuestion.set(question.questionNumber, 0);
  }

  for (const attempt of attempts) {
    for (const visit of attempt.path) {
      visitsByQuestion.get(visit.questionNumber)?.push(visit);
    }
    for (const outcome of attempt.byQuestion.values()) {
      const n = outcome.questionNumber;
      if (outcome.visits.length === 0) continue;
      studentsByQuestion.set(n, (studentsByQuestion.get(n) ?? 0) + 1);
      if (outcome.terminalOutcome === 'correct') {
        correctByQuestion.set(n, (correctByQuestion.get(n) ?? 0) + 1);
      }
      const first = outcome.visits[0];
      if (first !== undefined && first.leftBlank) {
        blankFirstByQuestion.set(n, (blankFirstByQuestion.get(n) ?? 0) + 1);
        if (outcome.visits.some((visit) => visit.isReturn && !visit.leftBlank)) {
          returnedByQuestion.set(n, (returnedByQuestion.get(n) ?? 0) + 1);
        }
      }
    }
  }

  for (const changepoint of changepoints) {
    const n = changepoint.questionNumber;
    changepointsByQuestion.set(n, (changepointsByQuestion.get(n) ?? 0) + 1);
    if (changepoint.isNegative) {
      negativeByQuestion.set(n, (negativeByQuestion.get(n) ?? 0) + 1);
    }
  }

  const studentCount = attempts.length;
  let maxVisits = 0;

  const rows: QuestionAggregate[] = questions.map((question) => {
    const n = question.questionNumber;
    const visits = visitsByQuestion.get(n) ?? [];
    maxVisits = Math.max(maxVisits, visits.length);

    const stateCounts = new Map<BehavioralState, number>();
    for (const state of STATES) stateCounts.set(state, 0);
    let blankVisits = 0;
    for (const visit of visits) {
      stateCounts.set(visit.state, (stateCounts.get(visit.state) ?? 0) + 1);
      if (isBlankState(visit.state)) blankVisits += 1;
    }

    const reached = studentsByQuestion.get(n) ?? 0;
    const blankFirst = blankFirstByQuestion.get(n) ?? 0;

    return {
      questionNumber: n,
      topicId: question.topicId,
      visits: visits.length,
      students: reached,
      stateCounts,
      blankVisitShare: visits.length > 0 ? blankVisits / visits.length : 0,
      blankFirstShare: reached > 0 ? blankFirst / reached : 0,
      returnShare: blankFirst > 0 ? (returnedByQuestion.get(n) ?? 0) / blankFirst : 0,
      changepointShare: studentCount > 0 ? (changepointsByQuestion.get(n) ?? 0) / studentCount : 0,
      negativeChangepointShare:
        studentCount > 0 ? (negativeByQuestion.get(n) ?? 0) / studentCount : 0,
      accuracy: reached > 0 ? (correctByQuestion.get(n) ?? 0) / reached : 0,
      medianSeconds: medianVisitSeconds.get(n) ?? 0,
      rapidThreshold: rapidThresholds.get(n) ?? 0,
    };
  });

  return { questions: rows, maxVisits };
}
