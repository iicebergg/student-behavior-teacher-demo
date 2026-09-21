/**
 * Encode each item response into one of six behavioral states.
 *
 * Direct port of `reference/encode.py` (the authoritative spec from the SOLace
 * paper). The function itself is unchanged; this demo simply applies it *per
 * visit* rather than once per question, and builds each student's Markov
 * sequence in temporal visit order.
 *
 * The encoding is scoped to multiple-choice only, exactly like the
 * heavy-revision state V, because `answerChanges` doesn't carry the same
 * meaning elsewhere: free-response items are ALWAYS 0, while
 * drag-drop/multiple-select/point-select regularly reach nonzero values. So
 * "0 changes" only means "never answered" on MC; elsewhere it's either
 * uninformative or just a normal low value.
 *
 * The blank state is further split by speed: BF (blank fast) is a skip -- the
 * student never engaged with the item at all -- while BS (blank slow) is
 * abandonment -- the student worked the item (or at least sat with it open)
 * and then quit without picking anything. Both still require isMc and
 * answerChanges === 0; only the rapidThreshold comparison distinguishes them.
 *
 * The blank check runs before the rapid check: a blank response can still take
 * a long time, so a blank must not be swallowed by the rapid check just
 * because it also happened to be fast. The rapidThreshold comparison happens
 * inside the blank branch itself, to decide BF vs BS.
 *
 * Unknown item type is treated as non-multiple-choice (conservative): such
 * items can never be V, BF, or BS. Every question in this demo is MC, but the
 * guards are kept so the port stays faithful.
 */

/** The six behavioral states. */
export type BehavioralState = 'C' | 'W' | 'V' | 'R' | 'BF' | 'BS';

/** All six states, in the canonical display order used across the app. */
export const STATES: readonly BehavioralState[] = ['C', 'W', 'V', 'R', 'BF', 'BS'] as const;

export const MC_TYPES: ReadonlySet<string> = new Set([
  'multiple-choice',
  'multiple_choice',
  'mc',
  'single_select',
  'multiplechoice',
]);

export const REVISION_MIN = 3;

/**
 * A question type as it may arrive from an export: a string, or missing.
 * `null`/`undefined` stand in for Python's `None`/`NaN`.
 */
export type QuestionType = string | null | undefined;

/** True only for known multiple-choice types. null/undefined -> false. */
export function isMc(questionType: QuestionType): boolean {
  if (questionType === null || questionType === undefined) return false;
  return MC_TYPES.has(questionType.trim().toLowerCase());
}

/**
 * Encode one response (here: one *visit*) into a behavioral state.
 *
 * Branches are evaluated in order; the first match wins.
 *
 * @param timeSeconds    duration of this visit, in whole seconds
 * @param answerChanges  answer changes during this visit (0 means never answered, on MC)
 * @param wasCorrect     whether the submitted answer was correct (irrelevant for a blank visit)
 * @param questionType   item type; only known MC types unlock V/BF/BS
 * @param rapidThreshold this question's rapid-response threshold, in seconds
 */
export function encodeState(
  timeSeconds: number,
  answerChanges: number,
  wasCorrect: boolean,
  questionType: QuestionType,
  rapidThreshold: number,
): BehavioralState {
  if (isMc(questionType) && answerChanges === 0) {
    return timeSeconds <= rapidThreshold ? 'BF' : 'BS';
  }
  if (timeSeconds <= rapidThreshold) return 'R';
  if (isMc(questionType) && answerChanges >= REVISION_MIN) return 'V';
  return wasCorrect ? 'C' : 'W';
}

/** True for the two blank states. */
export function isBlankState(state: BehavioralState): boolean {
  return state === 'BF' || state === 'BS';
}

/** True for states that come from a visit where the student actually answered. */
export function isAnsweringState(state: BehavioralState): boolean {
  return !isBlankState(state);
}

/** Human-readable name for each state, for legends and tooltips. */
export const STATE_LABELS: Readonly<Record<BehavioralState, string>> = {
  C: 'Correct, engaged',
  W: 'Wrong, engaged',
  V: 'Heavy revision',
  R: 'Rapid response',
  BF: 'Blank fast (skip)',
  BS: 'Blank slow (abandon)',
};

/** One-line description of what each state means for a teacher. */
export const STATE_DESCRIPTIONS: Readonly<Record<BehavioralState, string>> = {
  C: 'Took a normal amount of time, answered, and got it right.',
  W: 'Took a normal amount of time, answered, and got it wrong.',
  V: 'Changed the answer 3+ times — visible uncertainty.',
  R: 'Answered at or under the rapid threshold — too fast to have read it properly.',
  BF: 'Left blank almost instantly — skipped without engaging.',
  BS: 'Sat with the question, then left it blank — worked it and gave up.',
};
