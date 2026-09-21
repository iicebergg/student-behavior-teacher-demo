/**
 * Table III: which topics coincide with a behavioural slump.
 *
 * lift = (this topic's share of visits that anchor a negative changepoint)
 *        ÷ (the same share across all visits)
 *
 * The topic comes from the question at the changepoint visit — the visit where
 * the new state starts — so a topic is credited with the behaviour that begins
 * on it.
 */
import type { ReactNode } from 'react';
import type { TopicLift } from '../analysis/index';
import { percent } from '../analysis/stats';
import { topicColor } from './palette';

export function TopicLiftTable({ rows }: { rows: readonly TopicLift[] }): ReactNode {
  if (rows.length === 0) return <p className="empty-note">No topics to rank.</p>;
  const maxLift = Math.max(1.4, ...rows.map((row) => row.lift ?? 0));

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Topic</th>
          <th>Lift</th>
          <th>Rate</th>
          <th>Negative CPs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const lift = row.lift;
          const width = lift === null ? 0 : Math.min(100, (lift / maxLift) * 100);
          const baseline = (1 / maxLift) * 100;
          return (
            <tr key={row.topicId}>
              <td>
                <span className="row-name">
                  <span
                    className="legend-swatch"
                    style={{
                      background: topicColor(row.topicId),
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                    }}
                  />
                  {row.label}
                  {row.isTrigger && <span className="tag tag-trigger">trigger</span>}
                </span>
              </td>
              <td style={{ width: '42%' }}>
                <div
                  style={{
                    position: 'relative',
                    height: 18,
                    background: 'var(--surface-2)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: '0 auto 0 0',
                      width: `${width}%`,
                      background: topicColor(row.topicId),
                      opacity: 0.85,
                      borderRadius: 4,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `${baseline}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: 'var(--text-secondary)',
                    }}
                    title="lift of 1 — no different from the class as a whole"
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: 0,
                      lineHeight: '18px',
                      fontSize: 11.5,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {lift === null ? '—' : `${lift.toFixed(2)}×`}
                  </span>
                </div>
              </td>
              <td>{percent(row.rate, 1)}</td>
              <td>
                {row.negativeChangepoints}
                <span className="muted"> / {row.eligibleVisits}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
