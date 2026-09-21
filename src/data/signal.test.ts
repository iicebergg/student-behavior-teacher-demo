/**
 * The generator exists to make the paper's findings visible, so these are
 * regression tests on the *signal*, not on the mechanics: if a future change to
 * the model flattens one of these patterns, the demo stops demonstrating
 * anything and this file should fail.
 *
 * All of it is synthetic data with the effects deliberately baked in. These
 * assertions say the demo reproduces what it set out to reproduce; they say
 * nothing about real students.
 */
import { describe, expect, it } from 'vitest';
import { generateDataset } from './generator';
import { analyze } from '../analysis/index';
import { DEFAULT_SETTINGS } from '../state/settings';
import type { Settings } from '../state/settings';
import type { BehavioralState } from '../encoding/encode';

const settings: Settings = { ...DEFAULT_SETTINGS, studentCount: 60 };
const dataset = generateDataset(settings);
const analysis = analyze(dataset, settings);

/** Combined lift of "a blank follows a blank", pooling BF and BS. */
function blankToBlankLift(): number {
  const blanks: BehavioralState[] = ['BF', 'BS'];
  let fromBlank = 0;
  let blankToBlank = 0;
  for (const from of blanks) {
    fromBlank += analysis.transitions.rowTotals.get(from) ?? 0;
    for (const to of blanks) blankToBlank += analysis.transitions.get(from, to).count;
  }
  const blankShare = (analysis.stateShares.get('BF') ?? 0) + (analysis.stateShares.get('BS') ?? 0);
  if (fromBlank === 0 || blankShare === 0) return 0;
  return blankToBlank / fromBlank / blankShare;
}

describe('the class is legible to a teacher', () => {
  it('scores well above chance and below ceiling', () => {
    expect(analysis.meanScore).toBeGreaterThan(0.45);
    expect(analysis.meanScore).toBeLessThan(0.85);
  });

  it('uses all six states, none of them swamping the rest', () => {
    for (const share of analysis.stateShares.values()) {
      expect(share).toBeGreaterThan(0);
    }
    expect(analysis.stateShares.get('C') ?? 0).toBeLessThan(0.7);
  });
});

describe('Fig. 3 — stickiness', () => {
  it('makes a blank far likelier right after a blank', () => {
    expect(blankToBlankLift()).toBeGreaterThan(4);
  });

  it('makes rapid responding sticky too, but distinctly less so', () => {
    const rapid = analysis.transitions.get('R', 'R').lift ?? 0;
    expect(rapid).toBeGreaterThan(2);
    expect(rapid).toBeLessThan(blankToBlankLift());
  });

  it('counts the return transitions the forward-only study could not observe', () => {
    expect(analysis.transitions.returnEdgeCount).toBeGreaterThan(0);
    expect(analysis.transitions.backwardEdgeCount).toBeGreaterThan(0);
  });
});

describe('Fig. 5 — accuracy skews down after a changepoint', () => {
  it('has more negative changepoints than positive ones', () => {
    expect(analysis.changepointSummary.negative).toBeGreaterThan(
      analysis.changepointSummary.positive,
    );
  });

  it('has a mean accuracy shift below zero', () => {
    expect(analysis.changepointSummary.meanDelta).toBeLessThan(0);
  });
});

describe('Table III — trigger topics coincide with slumps', () => {
  it('ranks every trigger topic above every non-trigger topic', () => {
    const triggers = analysis.topicLifts.filter((row) => row.isTrigger);
    const others = analysis.topicLifts.filter((row) => !row.isTrigger);
    expect(triggers.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    const worstTrigger = Math.min(...triggers.map((row) => row.lift ?? 0));
    const bestOther = Math.max(...others.map((row) => row.lift ?? 0));
    expect(worstTrigger).toBeGreaterThan(bestOther);
    expect(worstTrigger).toBeGreaterThan(1);
  });

  it('flattens out when no topic is a trigger', () => {
    const flatSettings: Settings = {
      ...settings,
      topics: settings.topics.map((topic) => ({ ...topic, isTrigger: false })),
    };
    const flat = analyze(generateDataset(flatSettings), flatSettings);
    const lifts = flat.topicLifts.map((row) => row.lift ?? 0);
    const spread = Math.max(...lifts) - Math.min(...lifts);
    const triggered =
      Math.max(...analysis.topicLifts.map((row) => row.lift ?? 0)) -
      Math.min(...analysis.topicLifts.map((row) => row.lift ?? 0));
    expect(spread).toBeLessThan(triggered);
  });
});

describe('the returns expansion carries signal', () => {
  it('brings a majority of blanked questions back, but not all of them', () => {
    expect(analysis.returns.blankFirstQuestions).toBeGreaterThan(20);
    expect(analysis.returns.returnShare).toBeGreaterThan(0.3);
    expect(analysis.returns.returnShare).toBeLessThan(0.9);
  });

  it('makes a return visit more likely to be right than a first-pass answer', () => {
    expect(analysis.returns.correctnessGap).toBeGreaterThan(0);
  });

  it('attributes every return to the blank state it came from', () => {
    const total = analysis.returns.byBlankState.reduce((sum, row) => sum + row.total, 0);
    expect(total).toBe(analysis.returns.links.length);
  });

  it('produces no returns, and no return transitions, when the knob is zero', () => {
    const none: Settings = { ...settings, blankThenReturnProbability: 0 };
    const off = analyze(generateDataset(none), none);
    expect(off.returns.links.length).toBe(0);
    expect(off.transitions.returnEdgeCount).toBe(0);
    expect(off.returns.blankFirstQuestions).toBeGreaterThan(0);
  });
});

describe('the analysis knobs re-measure without reshuffling', () => {
  it('leaves the dataset untouched when only k changes', () => {
    const wide = analyze(dataset, { ...settings, changepointWindowK: 6 });
    expect(wide.totalVisits).toBe(analysis.totalVisits);
    expect(wide.transitions.total).toBe(analysis.transitions.total);
    expect(wide.changepoints.length).toBe(analysis.changepoints.length);
    // The windows move, so the verdicts can move with them.
    expect(wide.changepointSummary.negative).not.toBe(0);
  });

  it('changes only the window verdicts when blank handling changes', () => {
    const counted = analyze(dataset, { ...settings, blankHandling: 'incorrect' });
    expect(counted.changepoints.length).toBe(analysis.changepoints.length);
    expect(counted.changepointSummary.undecided).toBeLessThanOrEqual(
      analysis.changepointSummary.undecided,
    );
  });
});
