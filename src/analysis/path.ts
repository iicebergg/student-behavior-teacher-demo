/**
 * The temporal visit path is the sequence everything runs on.
 *
 * In the paper the sequence is question order, because the test was
 * forward-only. Here a student can skip a question and come back, so the
 * sequence is the order visits actually happened in: a skip and its later
 * return are two entries, each emitting its own state and its own transition.
 */
import type { BehavioralState } from '../encoding/encode';
import { isBlankState } from '../encoding/encode';
import type { Attempt, Dataset, Visit } from '../data/types';

/** One adjacent pair in a student's path: the unit the Markov analysis walks. */
export interface PathEdge {
  studentId: string;
  /** Index of `from` within the path; the edge sits between `index` and `index + 1`. */
  index: number;
  from: Visit;
  to: Visit;
  /** True when the next visit goes back to an earlier question on the paper. */
  isBackward: boolean;
  /** True when the next visit is a return to a question left blank earlier. */
  isReturnEdge: boolean;
}

/** Every adjacent pair in one attempt's path. */
export function pathEdges(attempt: Attempt): PathEdge[] {
  const edges: PathEdge[] = [];
  for (let i = 0; i < attempt.path.length - 1; i += 1) {
    const from = attempt.path[i];
    const to = attempt.path[i + 1];
    if (from === undefined || to === undefined) continue;
    edges.push({
      studentId: attempt.studentId,
      index: i,
      from,
      to,
      isBackward: to.questionNumber < from.questionNumber,
      isReturnEdge: to.isReturn,
    });
  }
  return edges;
}

/** Every adjacent pair across every attempt in the dataset. */
export function allPathEdges(attempts: readonly Attempt[]): PathEdge[] {
  return attempts.flatMap(pathEdges);
}

/** A visit tagged with the student it belongs to. */
export interface TaggedVisit {
  studentId: string;
  visit: Visit;
  /** Length of the path this visit sits in, for position maths. */
  pathLength: number;
}

export function allVisits(attempts: readonly Attempt[]): TaggedVisit[] {
  return attempts.flatMap((attempt) =>
    attempt.path.map((visit) => ({
      studentId: attempt.studentId,
      visit,
      pathLength: attempt.path.length,
    })),
  );
}

/**
 * Where a visit sits in its attempt, on 0..1, so returns land at their true
 * temporal position rather than at their question's position.
 */
export function relativePosition(pathIndex: number, pathLength: number): number {
  if (pathLength <= 0) return 0;
  return pathIndex / pathLength;
}

/** Count of each state across the given visits. */
export function stateCounts(visits: readonly Visit[]): Map<BehavioralState, number> {
  const counts = new Map<BehavioralState, number>();
  for (const visit of visits) {
    counts.set(visit.state, (counts.get(visit.state) ?? 0) + 1);
  }
  return counts;
}

/** Visits where the student actually answered (everything but BF/BS). */
export function answeringVisits(visits: readonly Visit[]): Visit[] {
  return visits.filter((visit) => !isBlankState(visit.state));
}

/** Look up one attempt by student id. */
export function attemptFor(dataset: Dataset, studentId: string): Attempt | undefined {
  return dataset.attempts.find((attempt) => attempt.studentId === studentId);
}

/** The visits for one question in one attempt, in temporal order. */
export function visitsForQuestion(attempt: Attempt, questionNumber: number): readonly Visit[] {
  return attempt.byQuestion.get(questionNumber)?.visits ?? [];
}
