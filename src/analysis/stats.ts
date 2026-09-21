/** Small numeric helpers shared by the generator and the analysis passes. */

/** Median of a numeric list. Returns NaN for an empty list. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Arithmetic mean. Returns NaN for an empty list. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Logistic function, for turning a logit into a probability. */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Inverse logistic. Clamped so p of exactly 0 or 1 stays finite. */
export function logit(p: number): number {
  const clamped = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(clamped / (1 - clamped));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Percentage string with one decimal, for panel labels. */
export function percent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}
