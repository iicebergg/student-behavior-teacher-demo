/**
 * Seeded pseudo-random generation.
 *
 * mulberry32 — small, fast, and good enough for synthetic data. The point is
 * reproducibility: a given seed always yields the same dataset, so a teacher
 * (or a reviewer) can share a seed and see exactly the same class.
 */

/** A deterministic random source. */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  uniform(min: number, max: number): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Standard normal, via Box-Muller. */
  normal(mean: number, sd: number): number;
  /** Log-normal-ish positive draw, clamped to [min, max] and rounded to whole seconds. */
  duration(medianSeconds: number, sigma: number, min: number, max: number): number;
  /** Pick one element; throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** A new array, shuffled (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
}

/** Hash an arbitrary string seed into a 32-bit integer, so seeds can be words. */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Create a deterministic RNG from a numeric or string seed. */
export function createRng(seed: number | string): Rng {
  let a = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 1;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    uniform: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    normal: (mean, sd) => {
      // Box-Muller; u1 is nudged off zero so the log stays finite.
      const u1 = Math.max(next(), Number.EPSILON);
      const u2 = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    duration: (medianSeconds, sigma, min, max) => {
      const value = medianSeconds * Math.exp(rng.normal(0, sigma));
      return Math.round(Math.min(max, Math.max(min, value)));
    },
    pick: <T,>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick() called on an empty array');
      return item;
    },
    shuffle: <T,>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const oi = out[i] as T;
        const oj = out[j] as T;
        out[i] = oj;
        out[j] = oi;
      }
      return out;
    },
  };

  return rng;
}
