/**
 * Changepoints over the temporal visit path.
 *
 * A changepoint is simply a transition to a *different* state between adjacent
 * visits. It is negative when mean correctness over the k answering visits
 * after it is lower than over the k before it.
 *
 * Both windows clamp at the edges of the path, and blanks are handled by the
 * knob: dropped from the window (default) or counted as incorrect.
 */
import { isBlankState } from '../encoding/encode';
import type { BehavioralState } from '../encoding/encode';
import type { Attempt, Question, Visit } from '../data/types';
import { questionAt } from '../data/types';
import type { BlankHandling } from '../state/settings';
import { mean } from './stats';
import { pathEdges, relativePosition } from './path';

export interface Changepoint {
  studentId: string;
  /** Index of the visit *before* the change; the edge is index -> index + 1. */
  edgeIndex: number;
  fromState: BehavioralState;
  toState: BehavioralState;
  /** The visit the new state starts on. Its question is the changepoint's topic. */
  anchor: Visit;
  previous: Visit;
  questionNumber: number;
  topicId: number;
  /** Mean correctness in the k-visit window before, or null when the window is empty. */
  meanBefore: number | null;
  meanAfter: number | null;
  /** meanAfter - meanBefore; null when either window is empty. */
  delta: number | null;
  isNegative: boolean;
  /** pathIndex / path length, so returns land at their true temporal position. */
  position: number;
}

/** Does this visit count towards the accuracy window, and as what? */
function windowValue(visit: Visit, blankHandling: BlankHandling): number | null {
  if (isBlankState(visit.state)) {
    return blankHandling === 'incorrect' ? 0 : null;
  }
  return visit.wasCorrect ? 1 : 0;
}

/** Walk outward from an index, collecting up to k qualifying correctness values. */
function collectWindow(
  path: readonly Visit[],
  start: number,
  step: -1 | 1,
  k: number,
  blankHandling: BlankHandling,
): number[] {
  const values: number[] = [];
  for (let i = start; i >= 0 && i < path.length && values.length < k; i += step) {
    const visit = path[i];
    if (visit === undefined) continue;
    const value = windowValue(visit, blankHandling);
    if (value !== null) values.push(value);
  }
  return values;
}

export interface ChangepointOptions {
  changepointWindowK: number;
  blankHandling: BlankHandling;
}

/** Every changepoint in one attempt. */
export function attemptChangepoints(
  attempt: Attempt,
  questions: readonly Question[],
  options: ChangepointOptions,
): Changepoint[] {
  const { changepointWindowK: k, blankHandling } = options;
  const path = attempt.path;

  return pathEdges(attempt)
    .filter((edge) => edge.from.state !== edge.to.state)
    .map((edge) => {
      const before = collectWindow(path, edge.index, -1, k, blankHandling);
      const after = collectWindow(path, edge.index + 1, 1, k, blankHandling);
      const meanBefore = before.length > 0 ? mean(before) : null;
      const meanAfter = after.length > 0 ? mean(after) : null;
      const delta = meanBefore === null || meanAfter === null ? null : meanAfter - meanBefore;
      const question = questionAt(questions, edge.to.questionNumber);

      return {
        studentId: attempt.studentId,
        edgeIndex: edge.index,
        fromState: edge.from.state,
        toState: edge.to.state,
        anchor: edge.to,
        previous: edge.from,
        questionNumber: edge.to.questionNumber,
        topicId: question.topicId,
        meanBefore,
        meanAfter,
        delta,
        isNegative: delta !== null && delta < 0,
        position: relativePosition(edge.to.pathIndex, path.length),
      };
    });
}

/** Every changepoint across every attempt. */
export function computeChangepoints(
  attempts: readonly Attempt[],
  questions: readonly Question[],
  options: ChangepointOptions,
): Changepoint[] {
  return attempts.flatMap((attempt) => attemptChangepoints(attempt, questions, options));
}

export interface HistogramBin {
  /** Lower edge, inclusive. */
  start: number;
  /** Upper edge, exclusive (inclusive for the last bin). */
  end: number;
  count: number;
  label: string;
}

function emptyBins(min: number, max: number, binCount: number, format: (v: number) => string) {
  const width = (max - min) / binCount;
  return Array.from({ length: binCount }, (_unused, i) => {
    const start = min + i * width;
    const end = start + width;
    return { start, end, count: 0, label: `${format(start)}–${format(end)}` };
  });
}

function fill(bins: HistogramBin[], values: readonly number[], min: number, max: number): void {
  const width = (max - min) / bins.length;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const raw = Math.floor((value - min) / width);
    const index = Math.min(bins.length - 1, Math.max(0, raw));
    const bin = bins[index];
    if (bin !== undefined) bin.count += 1;
  }
}

/** Fig. 4: where in the attempt changepoints land, on a 0..1 temporal axis. */
export function positionHistogram(
  changepoints: readonly Changepoint[],
  binCount = 10,
): HistogramBin[] {
  const bins = emptyBins(0, 1, binCount, (v) => v.toFixed(1));
  fill(bins, changepoints.map((cp) => cp.position), 0, 1);
  return bins;
}

/**
 * Fig. 5: the accuracy delta either side of each changepoint.
 *
 * Exactly-zero deltas get their own bar. With a small window the deltas are
 * multiples of 1/k, so zero would otherwise sit on a bin edge and read as a
 * small positive -- which is precisely the asymmetry this chart is meant to
 * show.
 */
export function deltaHistogram(
  changepoints: readonly Changepoint[],
  binsPerSide = 4,
): HistogramBin[] {
  const width = 1 / binsPerSide;
  const format = (v: number) => (v === 0 ? '0' : v.toFixed(1));

  const negative: HistogramBin[] = Array.from({ length: binsPerSide }, (_u, i) => {
    const start = -1 + i * width;
    const end = start + width;
    return { start, end, count: 0, label: `${format(start)}…${format(end)}` };
  });
  const zero: HistogramBin = { start: 0, end: 0, count: 0, label: 'no change' };
  const positive: HistogramBin[] = Array.from({ length: binsPerSide }, (_u, i) => {
    const start = i * width;
    const end = start + width;
    return { start, end, count: 0, label: `${format(start)}…${format(end)}` };
  });

  for (const changepoint of changepoints) {
    const delta = changepoint.delta;
    if (delta === null || !Number.isFinite(delta)) continue;
    if (delta === 0) {
      zero.count += 1;
    } else if (delta < 0) {
      const index = Math.min(binsPerSide - 1, Math.max(0, Math.floor((delta + 1) / width)));
      const bin = negative[index];
      if (bin !== undefined) bin.count += 1;
    } else {
      const index = Math.min(binsPerSide - 1, Math.max(0, Math.floor(delta / width)));
      const bin = positive[index];
      if (bin !== undefined) bin.count += 1;
    }
  }

  return [...negative, zero, ...positive];
}

export interface ChangepointSummary {
  total: number;
  negative: number;
  positive: number;
  /** Changepoints whose window was empty on one side, so they carry no delta. */
  undecided: number;
  /** Share of adjacent visit pairs that are a changepoint. */
  rate: number;
  /** Share of changepoints with a delta that are negative. */
  negativeShare: number;
  meanDelta: number;
}

export function summarizeChangepoints(
  changepoints: readonly Changepoint[],
  edgeCount: number,
): ChangepointSummary {
  const withDelta = changepoints.filter((cp) => cp.delta !== null);
  const negative = withDelta.filter((cp) => cp.isNegative).length;
  const positive = withDelta.filter((cp) => (cp.delta ?? 0) > 0).length;
  return {
    total: changepoints.length,
    negative,
    positive,
    undecided: changepoints.length - withDelta.length,
    rate: edgeCount > 0 ? changepoints.length / edgeCount : 0,
    negativeShare: withDelta.length > 0 ? negative / withDelta.length : 0,
    meanDelta: withDelta.length > 0 ? mean(withDelta.map((cp) => cp.delta ?? 0)) : 0,
  };
}
