/**
 * The blank-to-return panel: this demo's expansion of the paper.
 *
 * SOLace is forward-only, so BF and BS are terminal states there. Here a blank
 * can be revisited, and each ReturnLink pairs the state on the way out with the
 * state of the visit that came back. The lift compares each blank's return
 * outcomes against how often that state shows up across all answering visits.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { STATE_LABELS } from '../encoding/encode';
import type { BehavioralState } from '../encoding/encode';
import type { ReturnsSummary } from '../analysis/index';
import { RETURN_STATES } from '../analysis/returns';
import { percent } from '../analysis/stats';
import { Segmented, Stat } from './ui';
import { StateGlyph } from './Legend';
import { stateColor } from './palette';

type Breakdown = 'topic' | 'student';

export function ReturnsPanel({ summary }: { summary: ReturnsSummary }): ReactNode {
  const [breakdown, setBreakdown] = useState<Breakdown>('topic');

  if (summary.blankFirstQuestions === 0) {
    return (
      <p className="empty-note">
        Nobody left a question blank at these settings, so there is nothing to come back to. Raise
        the blank rate to see the returns analysis.
      </p>
    );
  }

  const noReturns = summary.links.length === 0;

  return (
    <div>
      <div className="stat-row">
        <Stat
          label="Blanks answered later"
          value={percent(summary.returnShare, 0)}
          sub={`${summary.returnedQuestions} of ${summary.blankFirstQuestions} blank-first questions`}
        />
        <Stat
          label="Return visits correct"
          value={noReturns ? '—' : percent(summary.returnCorrectRate, 0)}
          sub={noReturns ? 'no returns' : `${summary.links.length} return visits`}
        />
        <Stat
          label="First-pass correct"
          value={percent(summary.firstPassCorrectRate, 0)}
          sub="answering visits on the way through"
        />
        <Stat
          label="Difference"
          value={noReturns ? '—' : `${summary.correctnessGap >= 0 ? '+' : '−'}${percent(Math.abs(summary.correctnessGap), 0)}`}
          sub={noReturns ? '—' : summary.correctnessGap >= 0 ? 'returning helps' : 'returning hurts'}
        />
      </div>

      {!noReturns && (
        <>
          <h3 style={{ marginTop: 6, marginBottom: 8 }}>What a blank turns into</h3>
          {summary.byBlankState.map((row) => (
            <div key={row.blankState} style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 5,
                }}
              >
                <span className="row-name" style={{ fontSize: 12.5 }}>
                  <StateGlyph state={row.blankState} />
                  <b>{row.blankState}</b> — {STATE_LABELS[row.blankState]}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {row.total} returns · {percent(row.correctRate, 0)} correct
                </span>
              </div>

              {row.total === 0 ? (
                <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                  No returns from this state at these settings.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 2, height: 22 }}>
                    {RETURN_STATES.map((state) => {
                      const share = row.shares.get(state) ?? 0;
                      if (share <= 0) return null;
                      return (
                        <div
                          key={state}
                          title={`${row.blankState} → ${state}: ${percent(share, 1)} (${
                            row.counts.get(state) ?? 0
                          } returns), lift ${row.lifts.get(state)?.toFixed(2) ?? '—'}×`}
                          style={{
                            width: `${share * 100}%`,
                            background: stateColor(state),
                            borderRadius: 3,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--on-strong)',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {share > 0.1 ? state : ''}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      marginTop: 5,
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                      flexWrap: 'wrap',
                    }}
                  >
                    {RETURN_STATES.map((state) => (
                      <span key={state}>
                        <b style={{ color: 'var(--text-primary)' }}>{state}</b>{' '}
                        {percent(row.shares.get(state) ?? 0, 0)}
                        <span className="muted"> ({liftText(row.lifts.get(state))})</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      )}

      <div className="card-head" style={{ marginTop: 14 }}>
        <h3>Who comes back</h3>
        <Segmented
          label="Break returns down by"
          value={breakdown}
          options={[
            { value: 'topic', label: 'By topic' },
            { value: 'student', label: 'By student' },
          ]}
          onChange={setBreakdown}
        />
      </div>

      <div style={{ maxHeight: 230, overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{breakdown === 'topic' ? 'Topic' : 'Student'}</th>
              <th>Blank first</th>
              <th>Came back</th>
              <th>Correct on return</th>
            </tr>
          </thead>
          <tbody>
            {(breakdown === 'topic'
              ? summary.byTopic.map((row) => ({
                  key: String(row.topicId),
                  label: row.label,
                  blankFirst: row.blankFirstQuestions,
                  share: row.returnShare,
                  correct: row.returnCorrectRate,
                  returned: row.returnedQuestions,
                }))
              : [...summary.byStudent]
                  .filter((row) => row.blankFirstQuestions > 0)
                  .sort((a, b) => b.blankFirstQuestions - a.blankFirstQuestions)
                  .map((row) => ({
                    key: row.studentId,
                    label: row.label,
                    blankFirst: row.blankFirstQuestions,
                    share: row.returnShare,
                    correct: row.returnCorrectRate,
                    returned: row.returnedQuestions,
                  }))
            ).map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.blankFirst}</td>
                <td>
                  {row.blankFirst === 0 ? '—' : percent(row.share, 0)}
                  <span className="muted"> ({row.returned})</span>
                </td>
                <td>{row.returned === 0 ? '—' : percent(row.correct, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function liftText(lift: number | null | undefined): string {
  if (lift === null || lift === undefined) return 'lift —';
  return `${lift.toFixed(2)}× vs usual`;
}

export type { BehavioralState };
