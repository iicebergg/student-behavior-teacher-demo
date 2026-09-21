/**
 * Rapid-response thresholds.
 *
 * The paper sets a per-item threshold; here it is computed from *per-visit*
 * times so it stays comparable to a single visit's duration rather than to the
 * total time a student spent on a question across two visits:
 *
 *     rapidThreshold(q) = min(0.30 * median(durationSeconds over all visits
 *                             to q across all students), 10)
 */
import { median } from './stats';

export const RAPID_THRESHOLD_FRACTION = 0.3;
export const RAPID_THRESHOLD_CAP_SECONDS = 10;

export function rapidThresholdFromMedian(medianSeconds: number): number {
  if (!Number.isFinite(medianSeconds)) return 0;
  return Math.min(RAPID_THRESHOLD_FRACTION * medianSeconds, RAPID_THRESHOLD_CAP_SECONDS);
}

export interface VisitDuration {
  questionNumber: number;
  durationSeconds: number;
}

export interface ThresholdTable {
  /** questionNumber -> threshold in seconds. */
  thresholds: Map<number, number>;
  /** questionNumber -> median per-visit duration in seconds. */
  medians: Map<number, number>;
}

/** Median per-visit time and rapid threshold for every question number given. */
export function computeRapidThresholds(
  visits: Iterable<VisitDuration>,
  questionNumbers: readonly number[],
): ThresholdTable {
  const durations = new Map<number, number[]>();
  for (const questionNumber of questionNumbers) durations.set(questionNumber, []);
  for (const visit of visits) {
    durations.get(visit.questionNumber)?.push(visit.durationSeconds);
  }

  const thresholds = new Map<number, number>();
  const medians = new Map<number, number>();
  for (const [questionNumber, list] of durations) {
    const med = list.length > 0 ? median(list) : 0;
    medians.set(questionNumber, med);
    thresholds.set(questionNumber, rapidThresholdFromMedian(med));
  }
  return { thresholds, medians };
}
