/** Dev-only: print the headline numbers so the generator can be tuned against the paper. */
import { generateDataset } from '../src/data/generator';
import { analyze } from '../src/analysis/index';
import { DEFAULT_SETTINGS } from '../src/state/settings';
import { STATES } from '../src/encoding/encode';

const settings = DEFAULT_SETTINGS;
const dataset = generateDataset(settings);
const a = analyze(dataset, settings);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
console.log(
  `students=${dataset.students.length} visits=${a.totalVisits} edges=${a.edges.length} meanScore=${pct(a.meanScore)}`,
);
console.log('state shares:', STATES.map((s) => `${s}=${pct(a.stateShares.get(s) ?? 0)}`).join(' '));

const thr = [...dataset.rapidThresholds.values()];
const med = [...dataset.medianVisitSeconds.values()];
console.log(
  `threshold min/max=${Math.min(...thr).toFixed(1)}/${Math.max(...thr).toFixed(1)}  median-visit min/max=${Math.min(...med)}/${Math.max(...med)}`,
);

console.log('\nlift matrix (rows = current, cols = next):');
console.log(['     ', ...STATES.map((s) => s.padStart(6))].join(''));
for (const from of STATES) {
  const row = STATES.map((to) => {
    const cell = a.transitions.get(from, to);
    return (cell.lift === null ? '—' : cell.lift.toFixed(1)).padStart(6);
  });
  console.log([from.padEnd(5), ...row].join(''));
}

console.log('\nchangepoints:', JSON.stringify(a.changepointSummary, null, 0));
console.log('topic lifts:');
for (const t of a.topicLifts) {
  console.log(
    `  ${t.label.padEnd(24)} trigger=${t.isTrigger ? 'Y' : 'n'} rate=${pct(t.rate)} lift=${t.lift?.toFixed(2) ?? '—'} n=${t.negativeChangepoints}/${t.eligibleVisits}`,
  );
}
console.log(
  '\nreturns:',
  `blankFirst=${a.returns.blankFirstQuestions} returned=${a.returns.returnedQuestions} share=${pct(a.returns.returnShare)} returnCorrect=${pct(a.returns.returnCorrectRate)} firstPassCorrect=${pct(a.returns.firstPassCorrectRate)} gap=${pct(a.returns.correctnessGap)} medianGap=${a.returns.medianGapInVisits}`,
);
for (const row of a.returns.byBlankState) {
  console.log(
    `  ${row.blankState}: n=${row.total} ` +
      ['C', 'W', 'V', 'R'].map((s) => `${s}=${pct(row.shares.get(s as never) ?? 0)}`).join(' ') +
      ` correct=${pct(row.correctRate)}`,
  );
}
console.log('\nposition bins:', a.positionBins.map((b) => b.count).join(','));
console.log('delta bins:', a.deltaBins.map((b) => `${b.label}:${b.count}`).join(' '));
