/**
 * Synthetic data generator.
 *
 * The patterns the SOLace paper reports are baked in on purpose, so the
 * graphs show real signal rather than noise:
 *
 *  - Blank stickiness: once a student goes blank on the forward pass, the
 *    chance of blanking the next question jumps sharply (Fig. 3's blank-to-
 *    blank lift is the largest effect in the paper).
 *  - Rapid stickiness: the same effect for R, but much weaker.
 *  - Topic triggers: meeting a trigger topic raises the chance of a negative
 *    changepoint on the visits that follow (the coordinate-plane and 2-D
 *    geometry effects in Table III).
 *  - Post-changepoint skew: when behaviour changes, accuracy drifts down more
 *    often than up (Fig. 5).
 *  - Returns that help: coming back to a skipped question beats answering it
 *    cold on the first pass.
 *
 * The generator emits raw visits only. Rapid thresholds are derived from the
 * generated durations afterwards, and states come from the encode.py port --
 * the generator never assigns a state directly. What it does track is a
 * *behaviour mode*, which is what the stickiness and drift rules key off.
 */
import { encodeState } from '../encoding/encode';
import type { BehavioralState } from '../encoding/encode';
import { clamp, logistic, logit } from '../analysis/stats';
import { computeRapidThresholds } from '../analysis/thresholds';
import type { ThresholdTable } from '../analysis/thresholds';
import { createRng } from './prng';
import type { Rng } from './prng';
import type {
  Attempt,
  Dataset,
  Question,
  QuestionOutcome,
  ReturnLink,
  Student,
  Topic,
  Visit,
} from './types';
import { CHOICE_COUNT, QUESTION_COUNT, QUESTION_TYPE, TOPIC_COUNT } from './types';
import type { GenerationSettings } from '../state/settings';

/**
 * Blank and rapid stickiness are modelled as two-regime Markov chains: an
 * *entry* rate from normal answering, and a *persistence* rate once the run
 * has started. For a chain like that the observed lift is roughly
 * persistence / share, so targeting a lift is the same as fixing persistence
 * at `liftTarget * rate` -- which keeps the paper's headline numbers stable as
 * the rate knobs move. Fig. 3 puts blank-to-blank around 20x and rapid-to-
 * rapid around 5x.
 */
const BLANK_LIFT_TARGET = 20;
const RAPID_LIFT_TARGET = 8;
/** No run may be stickier than this, or blank students never answer again. */
const MAX_PERSISTENCE = 0.68;
/**
 * Once a run is under way the per-question modifiers count for less: a blank
 * run is a state of mind, not a fresh decision on every question.
 */
const RUN_MODIFIER_DAMPING = 0.35;
/** Extra blank pressure while a trigger topic's effect is still live. */
const TRIGGER_BLANK_PRESSURE = 0.8;
/** Chance a trigger topic actually sets off a slump when it is met. */
const TRIGGER_FIRE_PROBABILITY = 0.7;
/** How many following visits a trigger keeps affecting. */
const TRIGGER_HEAT_MIN = 2;
const TRIGGER_HEAT_MAX = 3;
/** Ability hit a firing trigger lands, immediately, on the question itself. */
const TRIGGER_DRIFT_MIN = 0.45;
const TRIGGER_DRIFT_MAX = 1.05;
/** On a behaviour change, accuracy drifts down this often, and up this often. */
const DRIFT_DOWN_PROBABILITY = 0.7;
const DRIFT_UP_PROBABILITY = 0.15;
const DRIFT_DOWN_MIN = 0.15;
const DRIFT_DOWN_MAX = 0.8;
const DRIFT_UP_MIN = 0.05;
const DRIFT_UP_MAX = 0.24;
/** Drift decays back towards baseline each visit, so a slump can be recovered. */
const DRIFT_DECAY = 0.68;
const DRIFT_FLOOR = -2.5;
const DRIFT_CEILING = 1.0;
/** Late in the test, blanking and rushing both get likelier, and accuracy slips. */
const FATIGUE_BLANK = 0.7;
const FATIGUE_RAPID = 0.6;
const FATIGUE_ACCURACY = 0.35;
/** Baseline accuracy offset, so an average student on an average item is ~60%. */
const ABILITY_BASELINE = 3.0;
/** Ability bonus on a return visit -- the gap between visits pays off. */
const RETURN_IMPROVEMENT = 1.35;
/** Extra bonus when the skip was a slow abandonment: they had already engaged. */
const RETURN_BONUS_AFTER_SLOW_BLANK = 0.3;
/** Rapid visits are close to guessing. */
const RAPID_CORRECT_PROBABILITY = 0.29;
/** Longest a rapid visit lasts, in seconds. Thresholds land at or above this. */
const RAPID_MAX_SECONDS = 7;

/** Entry and persistence rates for one sticky behaviour. */
interface Regime {
  entry: number;
  persistence: number;
}

function regimeFor(rate: number, liftTarget: number): Regime {
  if (rate <= 0) return { entry: 0, persistence: 0 };
  const persistence = clamp(liftTarget * rate, rate, MAX_PERSISTENCE);
  return { entry: (rate * (1 - persistence)) / Math.max(1e-6, 1 - rate), persistence };
}

/** What the student did on a visit, before the encoder sees it. */
type Mode = 'blank-fast' | 'blank-slow' | 'rapid' | 'revise' | 'answer';

/** A visit before thresholds are known, so before it can be encoded. */
interface RawVisit {
  questionNumber: number;
  pathIndex: number;
  durationSeconds: number;
  answerChangesInVisit: number;
  selectedChoice: number | null;
  leftBlank: boolean;
  wasCorrect: boolean;
  isReturn: boolean;
  mode: Mode;
}

const NAME_POOL: readonly string[] = [
  'Amara', 'Beatriz', 'Caleb', 'Dev', 'Elena', 'Farid', 'Grace', 'Hana',
  'Ibrahim', 'Jonas', 'Kaia', 'Leo', 'Maya', 'Noor', 'Oscar', 'Priya',
  'Quinn', 'Rosa', 'Samir', 'Tessa', 'Uma', 'Victor', 'Wen', 'Ximena',
  'Yusuf', 'Zoe', 'Aditya', 'Brianna', 'Cyrus', 'Daniela', 'Emeka', 'Freya',
  'Gabriel', 'Hyeon', 'Ines', 'Jamal', 'Kenji', 'Lucia', 'Marcus', 'Nadia',
  'Omar', 'Paloma', 'Ravi', 'Sofia', 'Theo', 'Ubah', 'Vera', 'Wesley',
  'Xiulan', 'Yara', 'Zane', 'Anika', 'Bodhi', 'Camille', 'Diego', 'Esme',
];

function buildTopics(settings: GenerationSettings): Topic[] {
  return settings.topics.map((topic) => ({
    id: topic.id,
    label: topic.label,
    difficultyWeight: topic.difficultyWeight,
    isTrigger: topic.isTrigger,
  }));
}

/**
 * Spread the five topics across the 40 positions: a balanced multiset, then a
 * seeded shuffle, so each topic appears about eight times in random places.
 */
function buildQuestions(rng: Rng): Question[] {
  const slots: number[] = [];
  for (let i = 0; i < QUESTION_COUNT; i += 1) slots.push(i % TOPIC_COUNT);
  const dispersed = rng.shuffle(slots);

  return Array.from({ length: QUESTION_COUNT }, (_unused, index) => {
    const topicId = dispersed[index] ?? 0;
    return {
      questionNumber: index + 1,
      topicId,
      intrinsicDifficulty: clamp(rng.normal(0.5, 0.18), 0.05, 0.95),
      choices: Array.from({ length: CHOICE_COUNT }, (_c, i) => String.fromCharCode(65 + i)),
      correctChoice: rng.int(0, CHOICE_COUNT - 1),
    };
  });
}

function buildStudents(rng: Rng, count: number): Student[] {
  const names = rng.shuffle(NAME_POOL);
  return Array.from({ length: count }, (_unused, index) => {
    const base = names[index % names.length] ?? 'Student';
    const suffix = index >= names.length ? ` ${Math.floor(index / names.length) + 1}` : '';
    return {
      id: `s${String(index + 1).padStart(3, '0')}`,
      label: `${base}${suffix}`,
      ability: rng.normal(0, 0.95),
    };
  });
}

/** Difficulty of a question once its topic weight is folded in, on 0..1. */
function effectiveDifficulty(question: Question, topic: Topic): number {
  return clamp(question.intrinsicDifficulty * 0.72 + topic.difficultyWeight * 0.42, 0.02, 0.99);
}

/** One student's walk through the test, in temporal order. */
interface Simulation {
  visits: RawVisit[];
  /** questionNumber -> the path index of the blank visit it returned from. */
  returnOrigins: Map<number, number>;
}

interface PendingReturn {
  questionNumber: number;
  blankPathIndex: number;
  blankWasSlow: boolean;
  forwardPosition: number;
}

function simulateStudent(
  rng: Rng,
  student: Student,
  questions: readonly Question[],
  topics: readonly Topic[],
  settings: GenerationSettings,
): Simulation {
  const visits: RawVisit[] = [];
  const returnOrigins = new Map<number, number>();
  const pending: PendingReturn[] = [];
  const blankRegime = regimeFor(settings.blankRate, BLANK_LIFT_TARGET);
  const rapidRegime = regimeFor(settings.rapidRate, RAPID_LIFT_TARGET);

  /** Accumulated ability drift: the slump (or recovery) that follows a changepoint. */
  let drift = 0;
  let lastMode: Mode | null = null;
  let triggerHeat = 0;
  /** How far through the test the student is, 0..1 — drives fatigue. */
  let progress = 0;

  const push = (visit: Omit<RawVisit, 'pathIndex'>): RawVisit => {
    const withIndex: RawVisit = { ...visit, pathIndex: visits.length };
    visits.push(withIndex);
    return withIndex;
  };

  /** Apply the post-changepoint accuracy skew and the slow decay back to baseline. */
  const advanceDrift = (mode: Mode): void => {
    if (lastMode !== null && mode !== lastMode) {
      const roll = rng.next();
      if (roll < DRIFT_DOWN_PROBABILITY) {
        drift -= rng.uniform(DRIFT_DOWN_MIN, DRIFT_DOWN_MAX);
      } else if (roll < DRIFT_DOWN_PROBABILITY + DRIFT_UP_PROBABILITY) {
        drift += rng.uniform(DRIFT_UP_MIN, DRIFT_UP_MAX);
      }
    }
    drift = clamp(drift * DRIFT_DECAY, DRIFT_FLOOR, DRIFT_CEILING);
    lastMode = mode;
    triggerHeat = Math.max(0, triggerHeat - 1);
  };

  /**
   * A trigger topic can set off a slump. It fires *before* the visit it belongs
   * to, so the behaviour change lands on the trigger question itself -- which is
   * what Table III's per-topic lift measures.
   */
  const applyTrigger = (topic: Topic): void => {
    if (!topic.isTrigger) return;
    if (!rng.chance(TRIGGER_FIRE_PROBABILITY)) return;
    triggerHeat = rng.int(TRIGGER_HEAT_MIN, TRIGGER_HEAT_MAX);
    drift = clamp(
      drift - rng.uniform(TRIGGER_DRIFT_MIN, TRIGGER_DRIFT_MAX),
      DRIFT_FLOOR,
      DRIFT_CEILING,
    );
  };

  const correctnessProbability = (difficulty: number, bonus: number): number =>
    logistic(
      ABILITY_BASELINE +
        1.85 * (student.ability + drift + bonus) -
        2.9 * (difficulty - 0.45) -
        FATIGUE_ACCURACY * progress,
    );

  /** Build one answering visit (rapid, revision, or a plain answer). */
  const answerVisit = (
    question: Question,
    topic: Topic,
    isReturn: boolean,
    bonus: number,
  ): Omit<RawVisit, 'pathIndex'> => {
    const difficulty = effectiveDifficulty(question, topic);
    const inRapidRun = lastMode === 'rapid';
    const rapidBase = inRapidRun ? rapidRegime.persistence : rapidRegime.entry;
    const rapidModifiers =
      (triggerHeat > 0 ? 0.75 : 0) +
      (isReturn ? 0.3 : 0) +
      FATIGUE_RAPID * progress -
      0.25 * student.ability;
    const rapidChance =
      rapidBase <= 0
        ? 0
        : logistic(logit(rapidBase) + rapidModifiers * (inRapidRun ? RUN_MODIFIER_DAMPING : 1));

    if (rng.chance(rapidChance)) {
      const correct = rng.chance(RAPID_CORRECT_PROBABILITY);
      return {
        questionNumber: question.questionNumber,
        durationSeconds: rng.int(1, RAPID_MAX_SECONDS),
        answerChangesInVisit: rng.int(1, 2),
        selectedChoice: correct
          ? question.correctChoice
          : (question.correctChoice + rng.int(1, CHOICE_COUNT - 1)) % CHOICE_COUNT,
        leftBlank: false,
        wasCorrect: correct,
        isReturn,
        mode: 'rapid',
      };
    }

    const reviseLogit =
      logit(settings.revisionPropensity) +
      1.5 * (difficulty - 0.45) +
      (triggerHeat > 0 ? 0.5 : 0) +
      (isReturn ? 0.55 : 0);
    const revising = settings.revisionPropensity > 0 && rng.chance(logistic(reviseLogit));

    // Revision is a visible uncertainty signal, so it costs a little accuracy.
    const correct = rng.chance(correctnessProbability(difficulty, bonus + (revising ? -0.3 : 0)));
    const medianSeconds = (revising ? 74 : 40) * (0.7 + 0.6 * difficulty) * (isReturn ? 0.78 : 1);

    return {
      questionNumber: question.questionNumber,
      durationSeconds: rng.duration(medianSeconds, 0.42, RAPID_MAX_SECONDS + 3, 320),
      answerChangesInVisit: revising ? rng.int(3, 6) : rng.int(1, 2),
      selectedChoice: correct
        ? question.correctChoice
        : (question.correctChoice + rng.int(1, CHOICE_COUNT - 1)) % CHOICE_COUNT,
      leftBlank: false,
      wasCorrect: correct,
      isReturn,
      mode: revising ? 'revise' : 'answer',
    };
  };

  /** Build one blank visit: a fast skip or a slow abandonment. */
  const blankVisit = (question: Question, inBlankRun: boolean): Omit<RawVisit, 'pathIndex'> => {
    // A run of skips tends to be fast; an isolated blank is more often an abandonment.
    const fast = rng.chance(inBlankRun ? 0.78 : 0.5);
    return {
      questionNumber: question.questionNumber,
      durationSeconds: fast ? rng.int(1, RAPID_MAX_SECONDS) : rng.duration(46, 0.5, 14, 240),
      answerChangesInVisit: 0,
      selectedChoice: null,
      leftBlank: true,
      wasCorrect: false,
      isReturn: false,
      mode: fast ? 'blank-fast' : 'blank-slow',
    };
  };

  const makeReturnVisit = (entry: PendingReturn): void => {
    const question = questions[entry.questionNumber - 1];
    if (question === undefined) return;
    const topic = topics[question.topicId];
    if (topic === undefined) return;
    const bonus = RETURN_IMPROVEMENT + (entry.blankWasSlow ? RETURN_BONUS_AFTER_SLOW_BLANK : 0);
    const visit = answerVisit(question, topic, true, bonus);
    push(visit);
    returnOrigins.set(entry.questionNumber, entry.blankPathIndex);
    advanceDrift(visit.mode);
  };

  // --- Forward pass over Q1..Q40 ------------------------------------------
  let inBlankRun = false;

  for (let position = 0; position < questions.length; position += 1) {
    const question = questions[position];
    if (question === undefined) continue;
    const topic = topics[question.topicId];
    if (topic === undefined) continue;
    progress = position / Math.max(1, questions.length - 1);

    // The trigger fires before the visit, so its effect lands on this question.
    applyTrigger(topic);

    const difficulty = effectiveDifficulty(question, topic);
    const blankBase = inBlankRun ? blankRegime.persistence : blankRegime.entry;
    const blankModifiers =
      2.3 * (difficulty - 0.45) -
      0.5 * student.ability +
      (triggerHeat > 0 ? TRIGGER_BLANK_PRESSURE : 0) +
      FATIGUE_BLANK * progress;
    const blankChance =
      blankBase <= 0
        ? 0
        : logistic(logit(blankBase) + blankModifiers * (inBlankRun ? RUN_MODIFIER_DAMPING : 1));

    if (rng.chance(blankChance)) {
      const visit = blankVisit(question, inBlankRun);
      const pushed = push(visit);
      inBlankRun = true;
      if (rng.chance(returnProbability(settings, visit.mode === 'blank-slow'))) {
        pending.push({
          questionNumber: question.questionNumber,
          blankPathIndex: pushed.pathIndex,
          blankWasSlow: visit.mode === 'blank-slow',
          forwardPosition: position,
        });
      }
      advanceDrift(visit.mode);
    } else {
      const visit = answerVisit(question, topic, false, 0);
      push(visit);
      inBlankRun = false;
      advanceDrift(visit.mode);
    }

    // Interleaved returns: come back mid-test, a few questions after the skip.
    if (settings.returnTiming === 'interleaved') {
      const readyIndex = pending.findIndex((entry) => position - entry.forwardPosition >= 4);
      const ready = readyIndex >= 0 ? pending[readyIndex] : undefined;
      if (ready !== undefined && rng.chance(0.34)) {
        pending.splice(readyIndex, 1);
        makeReturnVisit(ready);
        inBlankRun = false;
      }
    }
  }

  // --- Return pass ---------------------------------------------------------
  // Not in strict question order: students go back to the ones they think they
  // can still get, so the sweep back jumps around. That is also what makes the
  // return block a run of real transitions rather than one long march forward.
  progress = 1;
  for (const entry of rng.shuffle(pending)) {
    makeReturnVisit(entry);
  }

  return { visits, returnOrigins };
}

/** Slow blanks return slightly more often: the student engaged, so they come back. */
function returnProbability(settings: GenerationSettings, blankWasSlow: boolean): number {
  const base = settings.blankThenReturnProbability;
  if (!blankWasSlow) return base;
  return clamp(base * 1.15, 0, 1);
}

/**
 * Rapid threshold per question, from per-visit times so it stays comparable to
 * a single visit's duration. The rule itself lives in analysis/thresholds.ts.
 */
function thresholdsFor(
  simulations: readonly Simulation[],
  questions: readonly Question[],
): ThresholdTable {
  return computeRapidThresholds(
    simulations.flatMap((simulation) => simulation.visits),
    questions.map((question) => question.questionNumber),
  );
}

function buildAttempt(
  student: Student,
  simulation: Simulation,
  questions: readonly Question[],
  thresholds: ReadonlyMap<number, number>,
): Attempt {
  const path: Visit[] = simulation.visits.map((raw) => {
    const rapidThreshold = thresholds.get(raw.questionNumber) ?? 0;
    const state: BehavioralState = encodeState(
      raw.durationSeconds,
      raw.answerChangesInVisit,
      raw.wasCorrect,
      QUESTION_TYPE,
      rapidThreshold,
    );
    return {
      questionNumber: raw.questionNumber,
      pathIndex: raw.pathIndex,
      durationSeconds: raw.durationSeconds,
      answerChangesInVisit: raw.answerChangesInVisit,
      selectedChoice: raw.selectedChoice,
      leftBlank: raw.leftBlank,
      wasCorrect: raw.wasCorrect,
      isReturn: raw.isReturn,
      state,
      rapidThreshold,
    };
  });

  const byQuestion = new Map<number, QuestionOutcome>();
  for (const question of questions) {
    const visits = path.filter((visit) => visit.questionNumber === question.questionNumber);
    const last = visits[visits.length - 1];
    const terminalOutcome: QuestionOutcome['terminalOutcome'] =
      last === undefined || last.leftBlank ? 'blank' : last.wasCorrect ? 'correct' : 'incorrect';
    byQuestion.set(question.questionNumber, {
      questionNumber: question.questionNumber,
      visits,
      terminalOutcome,
    });
  }

  const returnLinks: ReturnLink[] = [];
  for (const visit of path) {
    if (!visit.isReturn) continue;
    const blankPathIndex = simulation.returnOrigins.get(visit.questionNumber);
    if (blankPathIndex === undefined) continue;
    const blankVisit = path[blankPathIndex];
    if (blankVisit === undefined) continue;
    const question = questions[visit.questionNumber - 1];
    returnLinks.push({
      studentId: student.id,
      questionNumber: visit.questionNumber,
      topicId: question?.topicId ?? 0,
      blankState: blankVisit.state,
      returnState: visit.state,
      blankVisitPathIndex: blankVisit.pathIndex,
      returnVisitPathIndex: visit.pathIndex,
      gapInVisits: visit.pathIndex - blankVisit.pathIndex - 1,
      returnWasCorrect: visit.wasCorrect,
    });
  }

  let correct = 0;
  for (const outcome of byQuestion.values()) {
    if (outcome.terminalOutcome === 'correct') correct += 1;
  }

  return {
    studentId: student.id,
    path,
    byQuestion,
    returnLinks,
    score: byQuestion.size === 0 ? 0 : correct / byQuestion.size,
  };
}

/** Build a complete, reproducible dataset from the generation knobs. */
export function generateDataset(settings: GenerationSettings): Dataset {
  const rng = createRng(settings.seed);
  const topics = buildTopics(settings);
  const questions = buildQuestions(rng);
  const students = buildStudents(rng, settings.studentCount);

  const simulations = students.map((student) =>
    simulateStudent(rng, student, questions, topics, settings),
  );

  const { thresholds, medians } = thresholdsFor(simulations, questions);

  const attempts = students.map((student, index) => {
    const simulation = simulations[index];
    if (simulation === undefined) {
      return {
        studentId: student.id,
        path: [],
        byQuestion: new Map<number, QuestionOutcome>(),
        returnLinks: [],
        score: 0,
      } satisfies Attempt;
    }
    return buildAttempt(student, simulation, questions, thresholds);
  });

  return {
    seed: settings.seed,
    topics,
    questions,
    students,
    attempts,
    rapidThresholds: thresholds,
    medianVisitSeconds: medians,
  };
}
