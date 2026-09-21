/**
 * The data model for the demo.
 *
 * The key departure from the SOLace paper: the unit of analysis is a *visit*,
 * not a question. A student may leave a question blank and come back to it, so
 * one question can hold two visits, and each visit emits its own state and its
 * own transition. An attempt's `path` -- every visit in temporal order -- is
 * the Markov sequence everything downstream runs on.
 */
import type { BehavioralState } from '../encoding/encode';

/** Every question in this demo is multiple choice; kept explicit for the encoder. */
export const QUESTION_TYPE = 'multiple-choice';

export const QUESTION_COUNT = 40;
export const TOPIC_COUNT = 5;
export const CHOICE_COUNT = 4;

export interface Topic {
  /** 0-4. */
  id: number;
  /** Editable in the control panel. */
  label: string;
  /** Knob: how much this topic drags accuracy down (0 = neutral, 1 = hard). */
  difficultyWeight: number;
  /**
   * Knob: whether this topic acts as a difficulty trigger, i.e. meeting it
   * raises the chance of a negative changepoint on the visits that follow.
   * Mirrors the coordinate-plane and 2-D-geometry effects in the paper.
   */
  isTrigger: boolean;
}

export interface Question {
  /** 1-40, the number a teacher sees. */
  questionNumber: number;
  topicId: number;
  /** 0 (easy) to 1 (hard), before the topic weight is applied. */
  intrinsicDifficulty: number;
  choices: readonly string[];
  /** Index into `choices`. */
  correctChoice: number;
}

export interface Student {
  id: string;
  label: string;
  /** Latent ability on a logit scale; higher is stronger. */
  ability: number;
}

export interface Visit {
  questionNumber: number;
  /** Temporal order across the whole attempt, 0-based. This is the sequence index. */
  pathIndex: number;
  durationSeconds: number;
  answerChangesInVisit: number;
  /** Null on a blank visit. */
  selectedChoice: number | null;
  leftBlank: boolean;
  /** Always false for a blank visit. */
  wasCorrect: boolean;
  /** True when this visit returns to a question left blank on an earlier visit. */
  isReturn: boolean;
  /** The encoded state for this visit. */
  state: BehavioralState;
  /** The question's rapid threshold, carried for the tooltip. */
  rapidThreshold: number;
}

/**
 * A skipped-then-returned question, as a first-class edge: the blank state on
 * the way out and the state of the visit that came back. The two visits are
 * non-adjacent in the path, so this link is what the returns analysis walks.
 */
export interface ReturnLink {
  studentId: string;
  questionNumber: number;
  topicId: number;
  blankState: BehavioralState;
  returnState: BehavioralState;
  blankVisitPathIndex: number;
  returnVisitPathIndex: number;
  /** How many other visits happened in between. */
  gapInVisits: number;
  returnWasCorrect: boolean;
}

/** What a question ended up as for one student, for scoring and display only. */
export interface QuestionOutcome {
  questionNumber: number;
  visits: readonly Visit[];
  /** Final correctness after any return. */
  terminalOutcome: 'correct' | 'incorrect' | 'blank';
}

export interface Attempt {
  studentId: string;
  /** Every visit in temporal order. This is the Markov sequence. */
  path: readonly Visit[];
  /** Per question, its visits and the derived terminal outcome. */
  byQuestion: ReadonlyMap<number, QuestionOutcome>;
  returnLinks: readonly ReturnLink[];
  /** Share of questions finally answered correctly. */
  score: number;
}

export interface Dataset {
  seed: string;
  topics: readonly Topic[];
  questions: readonly Question[];
  students: readonly Student[];
  attempts: readonly Attempt[];
  /** questionNumber -> rapid threshold in seconds. */
  rapidThresholds: ReadonlyMap<number, number>;
  /** questionNumber -> median per-visit duration in seconds. */
  medianVisitSeconds: ReadonlyMap<number, number>;
}

/** Look up a question by its 1-based number. */
export function questionAt(questions: readonly Question[], questionNumber: number): Question {
  const q = questions[questionNumber - 1];
  if (q === undefined || q.questionNumber !== questionNumber) {
    const found = questions.find((candidate) => candidate.questionNumber === questionNumber);
    if (found === undefined) throw new Error(`no question numbered ${questionNumber}`);
    return found;
  }
  return q;
}

/** Look up a topic by id. */
export function topicAt(topics: readonly Topic[], topicId: number): Topic {
  const t = topics[topicId];
  if (t === undefined || t.id !== topicId) {
    const found = topics.find((candidate) => candidate.id === topicId);
    if (found === undefined) throw new Error(`no topic with id ${topicId}`);
    return found;
  }
  return t;
}
