import { describe, expect, it } from 'vitest';
import { generateDataset } from './generator';
import { QUESTION_COUNT, TOPIC_COUNT } from './types';
import { createRng } from './prng';
import { DEFAULT_SETTINGS } from '../state/settings';
import type { GenerationSettings } from '../state/settings';
import { encodeState, isBlankState } from '../encoding/encode';
import { QUESTION_TYPE } from './types';

const settings: GenerationSettings = { ...DEFAULT_SETTINGS, studentCount: 12 };

describe('seeded generation', () => {
  it('reproduces a dataset exactly for the same seed', () => {
    const a = generateDataset(settings);
    const b = generateDataset({ ...settings });
    expect(JSON.stringify(a.attempts)).toBe(JSON.stringify(b.attempts));
    expect(JSON.stringify(a.questions)).toBe(JSON.stringify(b.questions));
  });

  it('produces a different dataset for a different seed', () => {
    const a = generateDataset(settings);
    const b = generateDataset({ ...settings, seed: 'a-different-seed' });
    expect(JSON.stringify(a.attempts)).not.toBe(JSON.stringify(b.attempts));
  });

  it('accepts a word seed as well as a number-like one', () => {
    expect(createRng('hello').next()).not.toBe(createRng('world').next());
    expect(createRng('hello').next()).toBe(createRng('hello').next());
  });
});

describe('question and topic layout', () => {
  it('builds 40 numbered questions', () => {
    const dataset = generateDataset(settings);
    expect(dataset.questions.length).toBe(QUESTION_COUNT);
    dataset.questions.forEach((question, index) => {
      expect(question.questionNumber).toBe(index + 1);
      expect(question.choices.length).toBe(4);
      expect(question.correctChoice).toBeGreaterThanOrEqual(0);
      expect(question.correctChoice).toBeLessThan(4);
    });
  });

  it('disperses all five topics across the 40 positions', () => {
    const dataset = generateDataset(settings);
    const counts = new Map<number, number>();
    for (const question of dataset.questions) {
      counts.set(question.topicId, (counts.get(question.topicId) ?? 0) + 1);
    }
    expect(counts.size).toBe(TOPIC_COUNT);
    // Balanced multiset, so every topic gets exactly 40 / 5 positions.
    for (const count of counts.values()) expect(count).toBe(QUESTION_COUNT / TOPIC_COUNT);
    // ...but not in blocks: consecutive questions should often differ in topic.
    const switches = dataset.questions.filter(
      (question, index) => index > 0 && question.topicId !== dataset.questions[index - 1]?.topicId,
    ).length;
    expect(switches).toBeGreaterThan(QUESTION_COUNT / 2);
  });
});

describe('the visit path', () => {
  it('visits every question at least once, in contiguous temporal order', () => {
    const dataset = generateDataset(settings);
    for (const attempt of dataset.attempts) {
      attempt.path.forEach((visit, index) => expect(visit.pathIndex).toBe(index));
      expect(attempt.byQuestion.size).toBe(QUESTION_COUNT);
      for (const outcome of attempt.byQuestion.values()) {
        expect(outcome.visits.length).toBeGreaterThanOrEqual(1);
      }
      expect(attempt.path.length).toBeGreaterThanOrEqual(QUESTION_COUNT);
    }
  });

  it('keeps blank visits at zero answer changes and answering visits above zero', () => {
    const dataset = generateDataset(settings);
    for (const attempt of dataset.attempts) {
      for (const visit of attempt.path) {
        if (visit.leftBlank) {
          expect(visit.answerChangesInVisit).toBe(0);
          expect(visit.selectedChoice).toBeNull();
          expect(visit.wasCorrect).toBe(false);
          expect(isBlankState(visit.state)).toBe(true);
        } else {
          // A zero-change answering visit would encode as a blank, which would be wrong.
          expect(visit.answerChangesInVisit).toBeGreaterThanOrEqual(1);
          expect(visit.selectedChoice).not.toBeNull();
          expect(isBlankState(visit.state)).toBe(false);
        }
      }
    }
  });

  it('assigns each visit the state the encoder gives for that visit alone', () => {
    const dataset = generateDataset(settings);
    for (const attempt of dataset.attempts) {
      for (const visit of attempt.path) {
        const threshold = dataset.rapidThresholds.get(visit.questionNumber) ?? 0;
        expect(visit.rapidThreshold).toBeCloseTo(threshold);
        expect(visit.state).toBe(
          encodeState(
            visit.durationSeconds,
            visit.answerChangesInVisit,
            visit.wasCorrect,
            QUESTION_TYPE,
            threshold,
          ),
        );
      }
    }
  });

  it('gives every question a threshold of at most 10 seconds', () => {
    const dataset = generateDataset(settings);
    for (const threshold of dataset.rapidThresholds.values()) {
      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThanOrEqual(10);
    }
  });
});

describe('returns', () => {
  it('marks a return visit as a second visit to a question blanked earlier', () => {
    const dataset = generateDataset(settings);
    for (const attempt of dataset.attempts) {
      for (const visit of attempt.path) {
        if (!visit.isReturn) continue;
        const outcome = attempt.byQuestion.get(visit.questionNumber);
        const first = outcome?.visits[0];
        expect(first?.leftBlank).toBe(true);
        expect(first?.pathIndex).toBeLessThan(visit.pathIndex);
        expect(visit.leftBlank).toBe(false);
      }
    }
  });

  it('pairs every return with a ReturnLink carrying both states', () => {
    const dataset = generateDataset(settings);
    for (const attempt of dataset.attempts) {
      const returnVisits = attempt.path.filter((visit) => visit.isReturn);
      expect(attempt.returnLinks.length).toBe(returnVisits.length);
      for (const link of attempt.returnLinks) {
        expect(isBlankState(link.blankState)).toBe(true);
        expect(isBlankState(link.returnState)).toBe(false);
        expect(link.returnVisitPathIndex).toBeGreaterThan(link.blankVisitPathIndex);
        expect(link.gapInVisits).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('produces no returns at all when the knob is zero', () => {
    const dataset = generateDataset({ ...settings, blankThenReturnProbability: 0 });
    for (const attempt of dataset.attempts) {
      expect(attempt.returnLinks.length).toBe(0);
      expect(attempt.path.length).toBe(QUESTION_COUNT);
    }
  });

  it('brings returns forward into the test when the timing knob says interleaved', () => {
    const endOfTest = generateDataset({ ...settings, returnTiming: 'end-of-test' });
    const interleaved = generateDataset({ ...settings, returnTiming: 'interleaved' });
    const meanGap = (dataset: typeof endOfTest): number => {
      const links = dataset.attempts.flatMap((attempt) => attempt.returnLinks);
      if (links.length === 0) return 0;
      return links.reduce((sum, link) => sum + link.gapInVisits, 0) / links.length;
    };
    expect(meanGap(interleaved)).toBeLessThan(meanGap(endOfTest));
  });
});

describe('knob edges', () => {
  it('produces no blanks when the blank rate is zero', () => {
    const dataset = generateDataset({ ...settings, blankRate: 0 });
    const blanks = dataset.attempts.flatMap((attempt) =>
      attempt.path.filter((visit) => visit.leftBlank),
    );
    expect(blanks.length).toBe(0);
  });

  it('produces no rapid visits when the rapid rate is zero', () => {
    const dataset = generateDataset({ ...settings, rapidRate: 0, blankRate: 0 });
    const rapid = dataset.attempts.flatMap((attempt) =>
      attempt.path.filter((visit) => visit.state === 'R'),
    );
    expect(rapid.length).toBe(0);
  });

  it('produces no heavy-revision visits when revision propensity is zero', () => {
    const dataset = generateDataset({ ...settings, revisionPropensity: 0 });
    const revised = dataset.attempts.flatMap((attempt) =>
      attempt.path.filter((visit) => visit.answerChangesInVisit >= 3),
    );
    expect(revised.length).toBe(0);
  });

  it('survives a single student and a large class', () => {
    expect(generateDataset({ ...settings, studentCount: 1 }).attempts.length).toBe(1);
    expect(generateDataset({ ...settings, studentCount: 200 }).attempts.length).toBe(200);
  });
});
