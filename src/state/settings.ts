/**
 * Every knob in the demo, plus defaults and persistence.
 *
 * Settings split into two groups: the ones that shape the synthetic data
 * (`GenerationSettings`) and the ones that only change how the same data is
 * analysed (`AnalysisSettings`). Keeping them apart means moving the
 * changepoint window doesn't shuffle the class.
 */

export const RETURN_TIMING_MODES = ['end-of-test', 'interleaved'] as const;
export type ReturnTiming = (typeof RETURN_TIMING_MODES)[number];

export const BLANK_HANDLING_MODES = ['exclude', 'incorrect'] as const;
/** How blank visits count inside the changepoint accuracy window. */
export type BlankHandling = (typeof BLANK_HANDLING_MODES)[number];

export interface TopicSetting {
  id: number;
  label: string;
  /** 0 = neutral, 1 = this topic drags accuracy down hard. */
  difficultyWeight: number;
  /** Meeting this topic raises the chance of a negative changepoint after it. */
  isTrigger: boolean;
}

export interface GenerationSettings {
  seed: string;
  studentCount: number;
  topics: readonly TopicSetting[];
  /** Global chance a question is left blank on the forward pass, before modifiers. */
  blankRate: number;
  /** Global chance an answered question is answered at rapid speed. */
  rapidRate: number;
  /** Chance a blanked question is answered on a later return visit. */
  blankThenReturnProbability: number;
  /** When returns happen: one pass at the end, or sprinkled through the test. */
  returnTiming: ReturnTiming;
  /** Chance an answering visit turns into heavy revision (3+ changes). */
  revisionPropensity: number;
}

export interface AnalysisSettings {
  /** Visits either side of a changepoint used for the accuracy comparison. */
  changepointWindowK: number;
  /** Whether blanks are dropped from that window or counted as incorrect. */
  blankHandling: BlankHandling;
}

export type Settings = GenerationSettings & AnalysisSettings;

export const DEFAULT_TOPICS: readonly TopicSetting[] = [
  { id: 0, label: 'Coordinate plane', difficultyWeight: 0.72, isTrigger: true },
  { id: 1, label: '2-D geometry', difficultyWeight: 0.66, isTrigger: true },
  { id: 2, label: 'Ratios & proportions', difficultyWeight: 0.4, isTrigger: false },
  { id: 3, label: 'Linear equations', difficultyWeight: 0.34, isTrigger: false },
  { id: 4, label: 'Data & statistics', difficultyWeight: 0.22, isTrigger: false },
];

export const DEFAULT_SETTINGS: Settings = {
  seed: 'solace-2026',
  studentCount: 48,
  topics: DEFAULT_TOPICS,
  blankRate: 0.03,
  rapidRate: 0.07,
  blankThenReturnProbability: 0.55,
  returnTiming: 'end-of-test',
  revisionPropensity: 0.12,
  changepointWindowK: 3,
  blankHandling: 'exclude',
};

/** Bounds for each numeric knob, shared by the sliders and the URL parser. */
export const LIMITS = {
  studentCount: { min: 4, max: 200, step: 1 },
  blankRate: { min: 0, max: 0.4, step: 0.005 },
  rapidRate: { min: 0, max: 0.4, step: 0.005 },
  blankThenReturnProbability: { min: 0, max: 1, step: 0.01 },
  revisionPropensity: { min: 0, max: 0.6, step: 0.01 },
  changepointWindowK: { min: 1, max: 8, step: 1 },
  difficultyWeight: { min: 0, max: 1, step: 0.01 },
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const STORAGE_KEY = 'solace-demo-settings-v1';

/** Compact URL/query form. Topics ride along as `t0=label~weight~trigger`. */
export function settingsToParams(settings: Settings): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seed', settings.seed);
  params.set('n', String(settings.studentCount));
  params.set('blank', settings.blankRate.toFixed(3));
  params.set('rapid', settings.rapidRate.toFixed(3));
  params.set('ret', settings.blankThenReturnProbability.toFixed(2));
  params.set('timing', settings.returnTiming);
  params.set('rev', settings.revisionPropensity.toFixed(2));
  params.set('k', String(settings.changepointWindowK));
  params.set('blanks', settings.blankHandling);
  settings.topics.forEach((topic) => {
    params.set(
      `t${topic.id}`,
      `${topic.label}~${topic.difficultyWeight.toFixed(2)}~${topic.isTrigger ? 1 : 0}`,
    );
  });
  return params;
}

function parseNumber(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function parseTopics(params: URLSearchParams): readonly TopicSetting[] {
  return DEFAULT_TOPICS.map((fallback) => {
    const raw = params.get(`t${fallback.id}`);
    if (raw === null) return fallback;
    const [label, weight, trigger] = raw.split('~');
    return {
      id: fallback.id,
      label: label !== undefined && label.trim() !== '' ? label.slice(0, 40) : fallback.label,
      difficultyWeight: parseNumber(weight ?? null, fallback.difficultyWeight, 0, 1),
      isTrigger: trigger === undefined ? fallback.isTrigger : trigger === '1',
    };
  });
}

function isOneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === raw) ?? fallback;
}

export function settingsFromParams(params: URLSearchParams): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    seed: params.get('seed')?.slice(0, 60) || d.seed,
    studentCount: Math.round(
      parseNumber(params.get('n'), d.studentCount, LIMITS.studentCount.min, LIMITS.studentCount.max),
    ),
    topics: parseTopics(params),
    blankRate: parseNumber(params.get('blank'), d.blankRate, LIMITS.blankRate.min, LIMITS.blankRate.max),
    rapidRate: parseNumber(params.get('rapid'), d.rapidRate, LIMITS.rapidRate.min, LIMITS.rapidRate.max),
    blankThenReturnProbability: parseNumber(
      params.get('ret'),
      d.blankThenReturnProbability,
      LIMITS.blankThenReturnProbability.min,
      LIMITS.blankThenReturnProbability.max,
    ),
    returnTiming: isOneOf(params.get('timing'), RETURN_TIMING_MODES, d.returnTiming),
    revisionPropensity: parseNumber(
      params.get('rev'),
      d.revisionPropensity,
      LIMITS.revisionPropensity.min,
      LIMITS.revisionPropensity.max,
    ),
    changepointWindowK: Math.round(
      parseNumber(
        params.get('k'),
        d.changepointWindowK,
        LIMITS.changepointWindowK.min,
        LIMITS.changepointWindowK.max,
      ),
    ),
    blankHandling: isOneOf(params.get('blanks'), BLANK_HANDLING_MODES, d.blankHandling),
  };
}

/** Read settings from the URL first, then localStorage, then defaults. */
export function loadSettings(): Settings {
  try {
    const fromUrl = new URLSearchParams(window.location.search);
    if (fromUrl.has('seed')) return settingsFromParams(fromUrl);
  } catch {
    // No window/search available; fall through.
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return settingsFromParams(new URLSearchParams(stored));
  } catch {
    // Storage blocked (private mode, disabled cookies); fall through to defaults.
  }
  return DEFAULT_SETTINGS;
}

/** Mirror settings into the URL and localStorage. Never throws. */
export function saveSettings(settings: Settings): void {
  const query = settingsToParams(settings).toString();
  try {
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`);
  } catch {
    // History unavailable; the app still works, links just won't carry state.
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, query);
  } catch {
    // Storage blocked; settings simply won't survive a reload.
  }
}

/** A shareable link for the current settings. */
export function shareableUrl(settings: Settings): string {
  const query = settingsToParams(settings).toString();
  try {
    return `${window.location.origin}${window.location.pathname}?${query}`;
  } catch {
    return `?${query}`;
  }
}
