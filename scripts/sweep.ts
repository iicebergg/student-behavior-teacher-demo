/** Dev-only: check the knobs behave across their range, and that seeds reproduce. */
import { generateDataset } from '../src/data/generator';
import { analyze } from '../src/analysis/index';
import { DEFAULT_SETTINGS } from '../src/state/settings';
import type { Settings } from '../src/state/settings';
import { STATES } from '../src/encoding/encode';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function report(name: string, overrides: Partial<Settings>): void {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...overrides };
  const dataset = generateDataset(settings);
  const a = analyze(dataset, settings);
  const blankShare = (a.stateShares.get('BF') ?? 0) + (a.stateShares.get('BS') ?? 0);
  const blankToBlank =
    ((a.transitions.get('BF', 'BF').count + a.transitions.get('BF', 'BS').count +
      a.transitions.get('BS', 'BF').count + a.transitions.get('BS', 'BS').count) /
      Math.max(1, (a.transitions.rowTotals.get('BF') ?? 0) + (a.transitions.rowTotals.get('BS') ?? 0))) /
    Math.max(1e-9, blankShare);
  console.log(
    `${name.padEnd(28)} score=${pct(a.meanScore)} blank=${pct(blankShare)} ` +
      `b2b-lift=${blankToBlank.toFixed(1)} r2r=${(a.transitions.get('R', 'R').lift ?? 0).toFixed(1)} ` +
      `cp=${pct(a.changepointSummary.rate)} neg/pos=${a.changepointSummary.negative}/${a.changepointSummary.positive} ` +
      `ret=${pct(a.returns.returnShare)} gap=${pct(a.returns.correctnessGap)} links=${a.returns.links.length}`,
  );
}

report('defaults', {});
report('interleaved returns', { returnTiming: 'interleaved' });
report('blank rate 0', { blankRate: 0 });
report('blank rate 0.01', { blankRate: 0.01 });
report('blank rate 0.20', { blankRate: 0.2 });
report('blank rate 0.40', { blankRate: 0.4 });
report('rapid rate 0', { rapidRate: 0 });
report('rapid rate 0.40', { rapidRate: 0.4 });
report('revision 0', { revisionPropensity: 0 });
report('revision 0.6', { revisionPropensity: 0.6 });
report('no returns', { blankThenReturnProbability: 0 });
report('always return', { blankThenReturnProbability: 1 });
report('4 students', { studentCount: 4 });
report('200 students', { studentCount: 200 });
report('k=1', { changepointWindowK: 1 });
report('k=8', { changepointWindowK: 8 });
report('blanks as incorrect', { blankHandling: 'incorrect' });
report('no triggers', { topics: DEFAULT_SETTINGS.topics.map((t) => ({ ...t, isTrigger: false })) });
report('all triggers', { topics: DEFAULT_SETTINGS.topics.map((t) => ({ ...t, isTrigger: true })) });
report('flat difficulty', { topics: DEFAULT_SETTINGS.topics.map((t) => ({ ...t, difficultyWeight: 0.4 })) });
report('seed alpha', { seed: 'alpha' });
report('seed beta', { seed: 'beta' });

// Determinism: the same seed must reproduce the dataset exactly.
const a1 = generateDataset(DEFAULT_SETTINGS);
const a2 = generateDataset({ ...DEFAULT_SETTINGS });
const same = JSON.stringify(a1.attempts.map((x) => x.path)) === JSON.stringify(a2.attempts.map((x) => x.path));
console.log(`\ndeterministic: ${same ? 'yes' : 'NO'}`);

// No state should ever be impossible to reach at defaults.
const d = generateDataset(DEFAULT_SETTINGS);
const an = analyze(d, DEFAULT_SETTINGS);
console.log('states present:', STATES.filter((s) => (an.stateShares.get(s) ?? 0) > 0).join(','));

// Every student must visit every question at least once.
const missing = d.attempts.filter((att) => [...att.byQuestion.values()].some((o) => o.visits.length === 0));
console.log(`attempts missing a question: ${missing.length}`);
// Path indices must be contiguous.
const badPaths = d.attempts.filter((att) => att.path.some((v, i) => v.pathIndex !== i));
console.log(`attempts with broken path indices: ${badPaths.length}`);
