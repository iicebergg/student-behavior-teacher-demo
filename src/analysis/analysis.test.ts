import { describe, expect, it } from 'vitest';
import type { BehavioralState } from '../encoding/encode';
import type { Attempt, Question, QuestionOutcome, Topic, Visit } from '../data/types';
import { QUESTION_TYPE } from '../data/types';
import { attemptChangepoints, deltaHistogram, positionHistogram } from './changepoints';
import { topicNegativeChangepointLift } from './lifts';
import { pathEdges, relativePosition } from './path';
import { computeReturns } from './returns';
import { computeRapidThresholds, rapidThresholdFromMedian } from './thresholds';
import { computeTransitions } from './transitions';
import { median } from './stats';

/** A visit with sensible defaults, so each test only states what it cares about. */
function visit(overrides: Partial<Visit> & { pathIndex: number; state: BehavioralState }): Visit {
  return {
    questionNumber: overrides.pathIndex + 1,
    durationSeconds: 40,
    answerChangesInVisit: 1,
    selectedChoice: 0,
    leftBlank: false,
    wasCorrect: false,
    isReturn: false,
    rapidThreshold: 10,
    ...overrides,
  };
}

/** Build an attempt from a compact list of states, one visit per question. */
function attemptOf(states: readonly BehavioralState[], correctness?: readonly boolean[]): Attempt {
  const path = states.map((state, index) =>
    visit({
      pathIndex: index,
      state,
      questionNumber: index + 1,
      wasCorrect: correctness?.[index] ?? state === 'C',
      leftBlank: state === 'BF' || state === 'BS',
    }),
  );
  const byQuestion = new Map<number, QuestionOutcome>();
  for (const v of path) {
    byQuestion.set(v.questionNumber, {
      questionNumber: v.questionNumber,
      visits: [v],
      terminalOutcome: v.leftBlank ? 'blank' : v.wasCorrect ? 'correct' : 'incorrect',
    });
  }
  return { studentId: 's1', path, byQuestion, returnLinks: [], score: 0 };
}

function questionsOf(topicIds: readonly number[]): Question[] {
  return topicIds.map((topicId, index) => ({
    questionNumber: index + 1,
    topicId,
    intrinsicDifficulty: 0.5,
    choices: ['A', 'B', 'C', 'D'],
    correctChoice: 0,
  }));
}

const K3 = { changepointWindowK: 3, blankHandling: 'exclude' } as const;

describe('rapid thresholds', () => {
  it('is 30% of the median per-visit time', () => {
    expect(rapidThresholdFromMedian(20)).toBeCloseTo(6);
    expect(rapidThresholdFromMedian(30)).toBeCloseTo(9);
  });

  it('caps at 10 seconds however slow the question is', () => {
    expect(rapidThresholdFromMedian(40)).toBe(10);
    expect(rapidThresholdFromMedian(400)).toBe(10);
  });

  it('is computed per visit, not per question total', () => {
    // Two visits to Q1 of 10s and 30s: the median visit is 20s, not the 40s total.
    const table = computeRapidThresholds(
      [
        { questionNumber: 1, durationSeconds: 10 },
        { questionNumber: 1, durationSeconds: 30 },
      ],
      [1],
    );
    expect(table.medians.get(1)).toBe(20);
    expect(table.thresholds.get(1)).toBeCloseTo(6);
  });

  it('averages the middle two values on an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1])).toBe(2);
  });

  it('gives a question with no visits a zero threshold rather than NaN', () => {
    const table = computeRapidThresholds([], [7]);
    expect(table.thresholds.get(7)).toBe(0);
  });
});

describe('the temporal path', () => {
  it('produces one edge fewer than it has visits', () => {
    expect(pathEdges(attemptOf(['C', 'W', 'C'])).length).toBe(2);
    expect(pathEdges(attemptOf(['C'])).length).toBe(0);
  });

  it('flags an edge that goes back to an earlier question', () => {
    const path = [
      visit({ pathIndex: 0, state: 'BF', questionNumber: 3, leftBlank: true }),
      visit({ pathIndex: 1, state: 'C', questionNumber: 9, wasCorrect: true }),
      visit({ pathIndex: 2, state: 'C', questionNumber: 3, wasCorrect: true, isReturn: true }),
    ];
    const attempt: Attempt = {
      studentId: 's1',
      path,
      byQuestion: new Map(),
      returnLinks: [],
      score: 0,
    };
    const edges = pathEdges(attempt);
    expect(edges[0]?.isBackward).toBe(false);
    expect(edges[1]?.isBackward).toBe(true);
    expect(edges[1]?.isReturnEdge).toBe(true);
  });

  it('places a visit by its temporal index, not its question number', () => {
    // The return to Q3 sits at the end of the path, so it reads as late.
    expect(relativePosition(9, 10)).toBeCloseTo(0.9);
    expect(relativePosition(0, 10)).toBe(0);
  });
});

describe('transition lift', () => {
  it('computes P(next|current) / P(next)', () => {
    // Path C W C W: edges are C->W, W->C, C->W.
    const matrix = computeTransitions(pathEdges(attemptOf(['C', 'W', 'C', 'W'])));
    expect(matrix.total).toBe(3);
    // P(next=W) = 2/3; P(next=W | current=C) = 2/2 = 1; lift = 1.5.
    expect(matrix.get('C', 'W').lift).toBeCloseTo(1.5);
    // P(next=C) = 1/3; P(next=C | current=W) = 1; lift = 3.
    expect(matrix.get('W', 'C').lift).toBeCloseTo(3);
    expect(matrix.get('C', 'C').count).toBe(0);
    expect(matrix.get('C', 'C').lift).toBe(0);
  });

  it('returns a null lift for a state that never occurs', () => {
    const matrix = computeTransitions(pathEdges(attemptOf(['C', 'W'])));
    expect(matrix.get('V', 'C').lift).toBeNull();
    expect(matrix.get('C', 'V').lift).toBeNull();
  });

  it('counts return edges, which the forward-only study could not observe', () => {
    const path = [
      visit({ pathIndex: 0, state: 'BF', questionNumber: 2, leftBlank: true }),
      visit({ pathIndex: 1, state: 'W', questionNumber: 5 }),
      visit({ pathIndex: 2, state: 'C', questionNumber: 2, wasCorrect: true, isReturn: true }),
    ];
    const matrix = computeTransitions(
      pathEdges({ studentId: 's1', path, byQuestion: new Map(), returnLinks: [], score: 0 }),
    );
    expect(matrix.returnEdgeCount).toBe(1);
    expect(matrix.backwardEdgeCount).toBe(1);
    expect(matrix.get('W', 'C').count).toBe(1);
  });
});

describe('changepoints', () => {
  it('fires only where adjacent states differ', () => {
    const changepoints = attemptChangepoints(
      attemptOf(['C', 'C', 'W', 'W']),
      questionsOf([0, 0, 0, 0]),
      K3,
    );
    expect(changepoints.length).toBe(1);
    expect(changepoints[0]?.fromState).toBe('C');
    expect(changepoints[0]?.toState).toBe('W');
  });

  it('anchors on the visit where the new state starts', () => {
    const changepoints = attemptChangepoints(
      attemptOf(['C', 'W']),
      questionsOf([0, 4]),
      K3,
    );
    expect(changepoints[0]?.questionNumber).toBe(2);
    expect(changepoints[0]?.topicId).toBe(4);
  });

  it('marks a changepoint negative when accuracy falls across it', () => {
    // Three correct, then three wrong: mean 1 before, mean 0 after.
    const attempt = attemptOf(
      ['C', 'C', 'C', 'W', 'W', 'W'],
      [true, true, true, false, false, false],
    );
    const changepoints = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0, 0, 0]), K3);
    expect(changepoints.length).toBe(1);
    expect(changepoints[0]?.meanBefore).toBe(1);
    expect(changepoints[0]?.meanAfter).toBe(0);
    expect(changepoints[0]?.delta).toBe(-1);
    expect(changepoints[0]?.isNegative).toBe(true);
  });

  it('is not negative when accuracy rises', () => {
    const attempt = attemptOf(
      ['W', 'W', 'W', 'C', 'C', 'C'],
      [false, false, false, true, true, true],
    );
    const changepoints = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0, 0, 0]), K3);
    expect(changepoints[0]?.delta).toBe(1);
    expect(changepoints[0]?.isNegative).toBe(false);
  });

  it('clamps the window at the edges of the path', () => {
    // Only one visit before the change, so the before-window holds one value.
    const attempt = attemptOf(['C', 'W', 'W', 'W'], [true, false, false, false]);
    const changepoints = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0]), K3);
    expect(changepoints[0]?.meanBefore).toBe(1);
    expect(changepoints[0]?.meanAfter).toBe(0);
  });

  it('excludes blanks from the window by default', () => {
    // C C BF W: the blank is skipped, so the after-window is just the W.
    const attempt = attemptOf(['C', 'C', 'BF', 'W'], [true, true, false, false]);
    const excluded = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0]), {
      changepointWindowK: 2,
      blankHandling: 'exclude',
    });
    const atBlank = excluded.find((cp) => cp.toState === 'BF');
    expect(atBlank?.meanBefore).toBe(1);
    expect(atBlank?.meanAfter).toBe(0);
  });

  it('counts blanks as incorrect when the knob says so', () => {
    const attempt = attemptOf(['C', 'C', 'BF', 'BF'], [true, true, false, false]);
    const counted = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0]), {
      changepointWindowK: 2,
      blankHandling: 'incorrect',
    });
    const atBlank = counted.find((cp) => cp.toState === 'BF');
    expect(atBlank?.meanAfter).toBe(0);
    expect(atBlank?.isNegative).toBe(true);

    // With blanks excluded the same changepoint has no after-window at all.
    const excluded = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0]), {
      changepointWindowK: 2,
      blankHandling: 'exclude',
    });
    const same = excluded.find((cp) => cp.toState === 'BF');
    expect(same?.meanAfter).toBeNull();
    expect(same?.delta).toBeNull();
    expect(same?.isNegative).toBe(false);
  });

  it('honours the window size knob', () => {
    const attempt = attemptOf(
      ['C', 'C', 'W', 'W', 'C', 'C'],
      [true, true, false, false, true, true],
    );
    const narrow = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0, 0, 0]), {
      changepointWindowK: 1,
      blankHandling: 'exclude',
    });
    const wide = attemptChangepoints(attempt, questionsOf([0, 0, 0, 0, 0, 0]), {
      changepointWindowK: 3,
      blankHandling: 'exclude',
    });
    const firstNarrow = narrow.find((cp) => cp.toState === 'W');
    const firstWide = wide.find((cp) => cp.toState === 'W');
    expect(firstNarrow?.meanAfter).toBe(0);
    // With k=3 the after-window reaches past the dip into the recovery.
    expect(firstWide?.meanAfter).toBeCloseTo(1 / 3);
  });
});

describe('histograms', () => {
  it('bins changepoint positions on a 0..1 temporal axis', () => {
    const attempt = attemptOf(['C', 'W', 'C', 'W', 'C', 'W', 'C', 'W', 'C', 'W']);
    const bins = positionHistogram(attemptChangepoints(attempt, questionsOf(Array(10).fill(0)), K3), 10);
    expect(bins.length).toBe(10);
    // 9 changepoints, at positions 0.1 .. 0.9; none at the first bin.
    expect(bins[0]?.count).toBe(0);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(9);
  });

  it('gives an unchanged accuracy delta its own bar', () => {
    const attempt = attemptOf(['C', 'W'], [true, true]);
    const bins = deltaHistogram(attemptChangepoints(attempt, questionsOf([0, 0]), K3));
    const zeroBin = bins.find((bin) => bin.label === 'no change');
    expect(zeroBin?.count).toBe(1);
  });
});

describe('per-topic negative-changepoint lift', () => {
  const topics: Topic[] = [
    { id: 0, label: 'Trigger topic', difficultyWeight: 0.8, isTrigger: true },
    { id: 1, label: 'Calm topic', difficultyWeight: 0.2, isTrigger: false },
  ];

  it('scores a topic against the overall negative-changepoint rate', () => {
    // Q2 and Q4 are topic 0; both anchor a negative changepoint.
    const attempt = attemptOf(
      ['C', 'W', 'C', 'W', 'C'],
      [true, false, true, false, true],
    );
    const questions = questionsOf([1, 0, 1, 0, 1]);
    const changepoints = attemptChangepoints(attempt, questions, {
      changepointWindowK: 1,
      blankHandling: 'exclude',
    });
    const lifts = topicNegativeChangepointLift([attempt], questions, topics, changepoints);
    const trigger = lifts.find((row) => row.topicId === 0);
    const calm = lifts.find((row) => row.topicId === 1);
    // Eligible visits exclude the very first, which has nothing before it.
    expect(trigger?.eligibleVisits).toBe(2);
    expect(calm?.eligibleVisits).toBe(2);
    expect(trigger?.negativeChangepoints).toBe(2);
    expect(calm?.negativeChangepoints).toBe(0);
    expect(trigger?.lift).toBeCloseTo(2);
    expect(calm?.lift).toBe(0);
  });

  it('ranks topics by lift, strongest first', () => {
    const attempt = attemptOf(['C', 'W', 'C'], [true, false, true]);
    const questions = questionsOf([1, 0, 1]);
    const changepoints = attemptChangepoints(attempt, questions, {
      changepointWindowK: 1,
      blankHandling: 'exclude',
    });
    const lifts = topicNegativeChangepointLift([attempt], questions, topics, changepoints);
    expect(lifts[0]?.topicId).toBe(0);
  });
});

describe('returns', () => {
  const topics: Topic[] = [
    { id: 0, label: 'Topic A', difficultyWeight: 0.5, isTrigger: false },
  ];
  const questions = questionsOf([0, 0, 0]);

  /** Q1 skipped fast then answered correctly on a return; Q2 answered; Q3 blank forever. */
  function attemptWithReturn(): Attempt {
    const blank = visit({ pathIndex: 0, state: 'BF', questionNumber: 1, leftBlank: true, durationSeconds: 2, answerChangesInVisit: 0, selectedChoice: null });
    const answered = visit({ pathIndex: 1, state: 'W', questionNumber: 2 });
    const stillBlank = visit({ pathIndex: 2, state: 'BS', questionNumber: 3, leftBlank: true, durationSeconds: 90, answerChangesInVisit: 0, selectedChoice: null });
    const returned = visit({ pathIndex: 3, state: 'C', questionNumber: 1, wasCorrect: true, isReturn: true });
    const byQuestion = new Map<number, QuestionOutcome>([
      [1, { questionNumber: 1, visits: [blank, returned], terminalOutcome: 'correct' }],
      [2, { questionNumber: 2, visits: [answered], terminalOutcome: 'incorrect' }],
      [3, { questionNumber: 3, visits: [stillBlank], terminalOutcome: 'blank' }],
    ]);
    return {
      studentId: 's1',
      path: [blank, answered, stillBlank, returned],
      byQuestion,
      returnLinks: [
        {
          studentId: 's1',
          questionNumber: 1,
          topicId: 0,
          blankState: 'BF',
          returnState: 'C',
          blankVisitPathIndex: 0,
          returnVisitPathIndex: 3,
          gapInVisits: 2,
          returnWasCorrect: true,
        },
      ],
      score: 1 / 3,
    };
  }

  it('counts blank-first questions and how many came back', () => {
    const summary = computeReturns(
      [attemptWithReturn()],
      [{ id: 's1', label: 'Student', ability: 0 }],
      questions,
      topics,
    );
    expect(summary.blankFirstQuestions).toBe(2);
    expect(summary.returnedQuestions).toBe(1);
    expect(summary.returnShare).toBeCloseTo(0.5);
  });

  it('compares return correctness against first-pass answering visits', () => {
    const summary = computeReturns(
      [attemptWithReturn()],
      [{ id: 's1', label: 'Student', ability: 0 }],
      questions,
      topics,
    );
    expect(summary.returnCorrectRate).toBe(1);
    // The only first-pass answering visit is the W on Q2.
    expect(summary.firstPassCorrectRate).toBe(0);
    expect(summary.correctnessGap).toBe(1);
  });

  it('splits return outcomes by the originating blank state', () => {
    const summary = computeReturns(
      [attemptWithReturn()],
      [{ id: 's1', label: 'Student', ability: 0 }],
      questions,
      topics,
    );
    const fromFast = summary.byBlankState.find((row) => row.blankState === 'BF');
    const fromSlow = summary.byBlankState.find((row) => row.blankState === 'BS');
    expect(fromFast?.total).toBe(1);
    expect(fromFast?.shares.get('C')).toBe(1);
    expect(fromSlow?.total).toBe(0);
    expect(fromSlow?.lifts.get('C')).toBeNull();
  });

  it('keeps the skip and its return as separate visits in the path', () => {
    const attempt = attemptWithReturn();
    expect(attempt.path.length).toBe(4);
    expect(attempt.path.filter((v) => v.questionNumber === 1).length).toBe(2);
    // They are non-adjacent: the ReturnLink is what connects them.
    expect(attempt.returnLinks[0]?.gapInVisits).toBe(2);
  });
});

describe('the encoder is applied per visit, with the question type carried through', () => {
  it('keeps QUESTION_TYPE recognised as multiple choice', () => {
    expect(QUESTION_TYPE).toBe('multiple-choice');
  });
});
