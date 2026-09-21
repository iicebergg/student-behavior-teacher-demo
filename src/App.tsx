/**
 * SOLace Behavioural Insights — teacher demo.
 *
 * Two scopes over one dataset: a single student's test, and the whole class.
 * The layer toggles above the primary timeline are the point of the demo — a
 * teacher turns the topic layer and the changepoint layer on and off over the
 * same graph to see where the two line up.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STATES } from './encoding/encode';
import { percent } from './analysis/stats';
import { useAppState, useTheme } from './state/useAppState';
import { AggregateTimeline } from './components/AggregateTimeline';
import type { AggregateMetric } from './components/AggregateTimeline';
import { ControlPanel } from './components/ControlPanel';
import { DeltaHistogram, PositionHistogram } from './components/Histograms';
import { ChangepointLegend, StateLegend, TopicLegend } from './components/Legend';
import { ReturnsPanel } from './components/ReturnsPanel';
import { ScopeSwitch } from './components/ScopeSwitch';
import type { Scope } from './components/ScopeSwitch';
import { StudentPicker } from './components/StudentPicker';
import { Timeline, TimelineTable } from './components/Timeline';
import type { TimelineLayers, TimelineViewMode } from './components/Timeline';
import { TopicLiftTable } from './components/TopicLiftTable';
import { TransitionHeatmap } from './components/TransitionHeatmap';
import { Card, Segmented, Stat, Toggle } from './components/ui';
import { topLifts } from './analysis/transitions';

export default function App(): ReactNode {
  const { settings, dataset, analysis, update, updateTopic, regenerate, reset } = useAppState();
  const [theme, toggleTheme] = useTheme();
  const [scope, setScope] = useState<Scope>('individual');
  const [studentId, setStudentId] = useState<string>('');
  const [viewMode, setViewMode] = useState<TimelineViewMode>('by-question');
  const [showTable, setShowTable] = useState(false);
  const [metric, setMetric] = useState<AggregateMetric>('state-mix');
  const [layers, setLayers] = useState<TimelineLayers>({
    topics: true,
    changepoints: true,
    returns: false,
  });

  // Keep the selection valid when the class is regenerated or resized, and open
  // on a student who actually skipped and came back — that is the behaviour the
  // timeline is built to show.
  useEffect(() => {
    const exists = dataset.students.some((student) => student.id === studentId);
    if (exists) return;
    // A typical student who came back, rather than the most extreme one.
    const withReturns = dataset.attempts
      .filter((candidate) => candidate.returnLinks.length > 0)
      .sort((a, b) => a.returnLinks.length - b.returnLinks.length);
    const typical = withReturns[Math.floor(withReturns.length * 0.6)];
    setStudentId(typical?.studentId ?? dataset.students[0]?.id ?? '');
  }, [dataset.students, dataset.attempts, studentId]);

  const attempt = useMemo(
    () => dataset.attempts.find((candidate) => candidate.studentId === studentId),
    [dataset.attempts, studentId],
  );
  const student = dataset.students.find((candidate) => candidate.id === studentId);
  const studentChangepoints = analysis.changepointsByStudent.get(studentId) ?? [];

  const blankShare = (analysis.stateShares.get('BF') ?? 0) + (analysis.stateShares.get('BS') ?? 0);
  const rapidShare = analysis.stateShares.get('R') ?? 0;
  const highlights = topLifts(analysis.transitions, 3, Math.max(5, analysis.edges.length / 400));

  const setLayer = (key: keyof TimelineLayers) => (value: boolean) =>
    setLayers((previous) => ({ ...previous, [key]: value }));

  const negativeShare = analysis.changepointSummary.negativeShare;
  const returnsInPath = analysis.transitions.returnEdgeCount;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>SOLace Behavioural Insights</h1>
          <p>
            A teacher's view of how testing behaviour and question topics interact across a
            40-question practice test. Synthetic class, seeded — built on the SOLace six-state
            encoding, extended so a skipped question can be returned to.
          </p>
        </div>
        <div className="header-actions">
          <ScopeSwitch scope={scope} onChange={setScope} />
          <button type="button" className="button" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <div className="layout">
        <div className="control-column">
          <ControlPanel
            settings={settings}
            onChange={update}
            onTopicChange={updateTopic}
            onRegenerate={regenerate}
            onReset={reset}
            observedBlankShare={blankShare}
            observedRapidShare={rapidShare}
          />
        </div>

        <div className="main-column">
          {/* ------------------------------------------------ primary graph */}
          {scope === 'individual' ? (
            <Card
              title={student === undefined ? 'Timeline' : `${student.label}'s test`}
              subtitle={
                attempt === undefined
                  ? undefined
                  : `${attempt.path.length} visits · ${percent(attempt.score, 0)} finally correct · ${
                      attempt.returnLinks.length
                    } returns`
              }
              actions={
                <StudentPicker
                  students={dataset.students}
                  attempts={dataset.attempts}
                  selectedId={studentId}
                  onChange={setStudentId}
                />
              }
              note={
                <>
                  Every visit is a marker at its question. A question that was skipped and later
                  answered stacks two markers — the blank on the lower lane, the return above — and
                  the path between them is drawn in <strong>temporal order</strong>, so the return
                  loops back along the question axis.
                </>
              }
              footnote="Hover any marker for the visit's duration, answer changes, rapid threshold and outcome."
            >
              <div className="toggle-row">
                <Toggle checked={layers.topics} onChange={setLayer('topics')}>
                  <span className="toggle-key">Topic layer</span>
                </Toggle>
                <Toggle checked={layers.changepoints} onChange={setLayer('changepoints')}>
                  <span className="toggle-key">Changepoints</span>
                </Toggle>
                <Toggle checked={layers.returns} onChange={setLayer('returns')}>
                  <span className="toggle-key">Emphasise returns</span>
                </Toggle>
                <span className="toggle-sep" />
                <Segmented<TimelineViewMode>
                  label="View mode"
                  value={viewMode}
                  options={[
                    {
                      value: 'by-question',
                      label: 'By question',
                      title: 'Question number on the x axis, with back-arcs for returns',
                    },
                    {
                      value: 'by-visit',
                      label: 'By visit order',
                      title: 'The same path straightened left to right',
                    },
                  ]}
                  onChange={setViewMode}
                />
                <span className="toggle-sep" />
                <Toggle checked={showTable} onChange={setShowTable}>
                  Table
                </Toggle>
              </div>

              {attempt === undefined ? (
                <p className="empty-note">No student selected.</p>
              ) : showTable ? (
                <TimelineTable
                  attempt={attempt}
                  questions={dataset.questions}
                  topics={dataset.topics}
                  changepoints={studentChangepoints}
                />
              ) : (
                <Timeline
                  attempt={attempt}
                  questions={dataset.questions}
                  topics={dataset.topics}
                  changepoints={studentChangepoints}
                  layers={layers}
                  viewMode={viewMode}
                />
              )}

              <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                <StateLegend />
                {(layers.changepoints || layers.returns) && (
                  <ChangepointLegend showReturns={layers.returns} />
                )}
                {layers.topics && <TopicLegend topics={dataset.topics} />}
              </div>
            </Card>
          ) : (
            <Card
              title="The class, question by question"
              subtitle={`${dataset.students.length} students · ${analysis.totalVisits.toLocaleString()} visits`}
              note={
                <>
                  The same two layers over the whole class. Each column is one question: the stack
                  shows which behavioural states its visits encoded to, and the topic and
                  changepoint layers toggle exactly as they do for a single student.
                </>
              }
            >
              <div className="toggle-row">
                <Toggle checked={layers.topics} onChange={setLayer('topics')}>
                  <span className="toggle-key">Topic layer</span>
                </Toggle>
                <Toggle checked={layers.changepoints} onChange={setLayer('changepoints')}>
                  <span className="toggle-key">Changepoints</span>
                </Toggle>
                <span className="toggle-sep" />
                <Segmented<AggregateMetric>
                  label="Metric"
                  value={metric}
                  options={[
                    { value: 'state-mix', label: 'State mix' },
                    { value: 'rates', label: 'Blank & changepoint rates' },
                  ]}
                  onChange={setMetric}
                />
              </div>

              <div className="stat-row">
                <Stat
                  label="Changepoint rate"
                  value={percent(analysis.changepointSummary.rate, 0)}
                  sub="of adjacent visit pairs"
                />
                <Stat
                  label="Negative share"
                  value={percent(negativeShare, 0)}
                  sub={`${analysis.changepointSummary.negative} of ${
                    analysis.changepointSummary.negative + analysis.changepointSummary.positive
                  } with a measurable change`}
                />
                <Stat
                  label="Return rate"
                  value={percent(analysis.returns.returnShare, 0)}
                  sub={`${analysis.returns.returnedQuestions} of ${analysis.returns.blankFirstQuestions} blank-first questions`}
                />
                <Stat
                  label="Class average"
                  value={percent(analysis.meanScore, 0)}
                  sub="final correctness"
                />
              </div>

              <AggregateTimeline
                rows={analysis.aggregate.questions}
                questions={dataset.questions}
                topics={dataset.topics}
                showTopics={layers.topics}
                showChangepoints={layers.changepoints}
                metric={metric}
              />

              <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                {metric === 'state-mix' && <StateLegend />}
                {layers.topics && <TopicLegend topics={dataset.topics} />}
              </div>
            </Card>
          )}

          {/* ------------------------------------------ supporting panels */}
          <div className="panel-grid">
            <Card
              title="Transition lift"
              note={
                <>
                  How much each state changes the odds of the next one. Over{' '}
                  {analysis.edges.length.toLocaleString()} adjacent visit pairs, of which{' '}
                  {returnsInPath.toLocaleString()} land on a return visit.
                </>
              }
              footnote={
                <>
                  <strong>This diverges from the paper's Fig. 3 by design.</strong> SOLace is
                  forward-only, so it could never observe a transition into a return visit; those
                  transitions are in this matrix. Lift also scales inversely with how common a state
                  is — the rarer blanks get, the higher the blank-to-blank lift climbs.
                </>
              }
            >
              <TransitionHeatmap matrix={analysis.transitions} />
              {highlights.length > 0 && (
                <p className="card-footnote" style={{ marginTop: 10 }}>
                  Strongest right now:{' '}
                  {highlights
                    .map((cell) => `${cell.from}→${cell.to} ${cell.lift?.toFixed(1)}×`)
                    .join(', ')}
                  .
                </p>
              )}
            </Card>

            <Card
              title="Blank, then back"
              note={
                <>
                  The expansion. In the paper a blank is terminal; here it can be revisited, and the
                  pair (blank state → return state) is its own edge alongside the two visits' own
                  path transitions.
                </>
              }
            >
              <ReturnsPanel summary={analysis.returns} />
            </Card>

            <Card
              title="Where changepoints land"
              subtitle="Fig. 4"
              note="Position is the visit's index divided by the path length, so a return sits at the moment it happened, not at its question's place on the paper."
            >
              <PositionHistogram bins={analysis.positionBins} />
            </Card>

            <Card
              title="What happens to accuracy"
              subtitle="Fig. 5"
              note={`Mean correctness over the ${settings.changepointWindowK} answering visits after each changepoint, minus the ${settings.changepointWindowK} before. Blanks are ${
                settings.blankHandling === 'exclude' ? 'excluded from' : 'counted as wrong in'
              } the window.`}
              footnote={`Mean shift ${analysis.changepointSummary.meanDelta >= 0 ? '+' : '−'}${Math.abs(
                analysis.changepointSummary.meanDelta,
              ).toFixed(3)} · ${analysis.changepointSummary.negative} down, ${
                analysis.changepointSummary.positive
              } up, ${analysis.changepointSummary.undecided} with an empty window.`}
            >
              <DeltaHistogram bins={analysis.deltaBins} />
            </Card>

            <Card
              title="Which topics coincide with a slump"
              subtitle="Table III"
              note="A topic's share of visits that anchor a negative changepoint, against the same share across every visit. Above 1 means behaviour turns down on that topic more often than elsewhere."
            >
              <TopicLiftTable rows={analysis.topicLifts} />
            </Card>

            <Card
              title="State mix"
              note="How the whole class's visits encoded, across every question and every return."
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Share</th>
                    <th>Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {STATES.map((state) => {
                    const share = analysis.stateShares.get(state) ?? 0;
                    return (
                      <tr key={state}>
                        <td>
                          <span className="row-name">
                            <span
                              className="legend-swatch"
                              style={{
                                background: `var(--state-${state.toLowerCase()})`,
                                width: 10,
                                height: 10,
                              }}
                            />
                            {state}
                          </span>
                        </td>
                        <td>{percent(share, 1)}</td>
                        <td>{Math.round(share * analysis.totalVisits)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="card-footnote">
                Rapid thresholds run from {Math.min(...dataset.rapidThresholds.values()).toFixed(1)}
                s to {Math.max(...dataset.rapidThresholds.values()).toFixed(1)}s, each one 30% of
                that question's median per-visit time, capped at 10s.
              </p>
            </Card>
          </div>

          <p className="card-footnote" style={{ textAlign: 'center' }}>
            Synthetic data throughout. Built on the SOLace paper by Vivien Berg and Jessica Lin
            (George Mason University) — <a href="https://learnsolace.org">learnsolace.org</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
