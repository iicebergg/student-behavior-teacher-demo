/**
 * One pass over a dataset, producing everything the views need.
 *
 * Split from generation on purpose: changing the changepoint window or the
 * blank-handling rule re-runs this without shuffling the class.
 */
import type { BehavioralState } from '../encoding/encode';
import { STATES } from '../encoding/encode';
import type { Dataset } from '../data/types';
import type { AnalysisSettings } from '../state/settings';
import type { AggregateTable } from './aggregate';
import { computeAggregate } from './aggregate';
import type { Changepoint, ChangepointSummary, HistogramBin } from './changepoints';
import {
  computeChangepoints,
  deltaHistogram,
  positionHistogram,
  summarizeChangepoints,
} from './changepoints';
import type { TopicLift } from './lifts';
import { topicNegativeChangepointLift } from './lifts';
import type { PathEdge } from './path';
import { allPathEdges } from './path';
import type { ReturnsSummary } from './returns';
import { computeReturns } from './returns';
import type { TransitionMatrix } from './transitions';
import { computeTransitions } from './transitions';

export interface Analysis {
  edges: readonly PathEdge[];
  transitions: TransitionMatrix;
  changepoints: readonly Changepoint[];
  changepointsByStudent: ReadonlyMap<string, readonly Changepoint[]>;
  changepointSummary: ChangepointSummary;
  positionBins: readonly HistogramBin[];
  deltaBins: readonly HistogramBin[];
  topicLifts: readonly TopicLift[];
  returns: ReturnsSummary;
  aggregate: AggregateTable;
  /** Overall share of each state across every visit. */
  stateShares: ReadonlyMap<BehavioralState, number>;
  totalVisits: number;
  /** Mean final score across the class. */
  meanScore: number;
}

export function analyze(dataset: Dataset, settings: AnalysisSettings): Analysis {
  const edges = allPathEdges(dataset.attempts);
  const transitions = computeTransitions(edges);
  const changepoints = computeChangepoints(dataset.attempts, dataset.questions, settings);

  const changepointsByStudent = new Map<string, Changepoint[]>();
  for (const attempt of dataset.attempts) changepointsByStudent.set(attempt.studentId, []);
  for (const changepoint of changepoints) {
    changepointsByStudent.get(changepoint.studentId)?.push(changepoint);
  }

  const counts = new Map<BehavioralState, number>();
  for (const state of STATES) counts.set(state, 0);
  let totalVisits = 0;
  for (const attempt of dataset.attempts) {
    for (const visit of attempt.path) {
      counts.set(visit.state, (counts.get(visit.state) ?? 0) + 1);
      totalVisits += 1;
    }
  }
  const stateShares = new Map<BehavioralState, number>();
  for (const state of STATES) {
    stateShares.set(state, totalVisits > 0 ? (counts.get(state) ?? 0) / totalVisits : 0);
  }

  const meanScore =
    dataset.attempts.length > 0
      ? dataset.attempts.reduce((sum, attempt) => sum + attempt.score, 0) / dataset.attempts.length
      : 0;

  return {
    edges,
    transitions,
    changepoints,
    changepointsByStudent,
    changepointSummary: summarizeChangepoints(changepoints, edges.length),
    positionBins: positionHistogram(changepoints),
    deltaBins: deltaHistogram(changepoints),
    topicLifts: topicNegativeChangepointLift(
      dataset.attempts,
      dataset.questions,
      dataset.topics,
      changepoints,
    ),
    returns: computeReturns(dataset.attempts, dataset.students, dataset.questions, dataset.topics),
    aggregate: computeAggregate(
      dataset.attempts,
      dataset.questions,
      changepoints,
      dataset.medianVisitSeconds,
      dataset.rapidThresholds,
    ),
    stateShares,
    totalVisits,
    meanScore,
  };
}

export type { Changepoint, ChangepointSummary, HistogramBin } from './changepoints';
export type { PathEdge } from './path';
export type { TopicLift } from './lifts';
export type { TransitionCell, TransitionMatrix } from './transitions';
export type { ReturnsSummary } from './returns';
export type { AggregateTable, QuestionAggregate } from './aggregate';
