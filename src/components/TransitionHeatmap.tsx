/**
 * The 6x6 transition-lift matrix.
 *
 * lift(X → Y) = P(next = Y | current = X) / P(next = Y), over adjacent visits
 * in the temporal path. A diverging scale centred on 1 reads the right way
 * round: warm means "likelier than usual right after X", cool means "rarer".
 */
import type { ReactNode } from 'react';
import { STATES, STATE_LABELS } from '../encoding/encode';
import type { TransitionMatrix } from '../analysis/index';
import { divergingColor, divergingInk, stateColor } from './palette';

/** Lift is a ratio, so the scale works on log2 — 2x and 0.5x are equal and opposite. */
const LOG_RANGE = 3;

export function TransitionHeatmap({ matrix }: { matrix: TransitionMatrix }): ReactNode {
  if (matrix.total === 0) {
    return (
      <p className="empty-note">
        No transitions yet — every attempt has at least two visits once the test runs.
      </p>
    );
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ minWidth: 340 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }}>
                <span className="muted">from \ to</span>
              </th>
              {STATES.map((state) => (
                <th key={state} style={{ textAlign: 'center' }} title={STATE_LABELS[state]}>
                  <span style={{ color: stateColor(state) }}>{state}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATES.map((from) => (
              <tr key={from}>
                <th scope="row" style={{ textAlign: 'left' }} title={STATE_LABELS[from]}>
                  <span style={{ color: stateColor(from) }}>{from}</span>
                </th>
                {STATES.map((to) => {
                  const cell = matrix.get(from, to);
                  const lift = cell.lift;
                  const signal = lift === null || lift <= 0 ? 0 : Math.log2(lift);
                  return (
                    <td
                      key={to}
                      style={{
                        textAlign: 'center',
                        background:
                          lift === null ? 'var(--surface-2)' : divergingColor(signal, LOG_RANGE),
                        color:
                          lift === null ? 'var(--text-muted)' : divergingInk(signal, LOG_RANGE),
                        fontWeight: lift !== null && lift >= 2 ? 600 : 400,
                        borderBottom: '2px solid var(--surface-1)',
                        borderRight: '2px solid var(--surface-1)',
                      }}
                      title={`${from} → ${to}: ${cell.count} transitions${
                        cell.conditional === null
                          ? ''
                          : `, P(${to} | ${from}) = ${(cell.conditional * 100).toFixed(1)}%`
                      }${lift === null ? '' : `, lift ${lift.toFixed(2)}×`}`}
                    >
                      {lift === null ? '—' : lift.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <span className="legend-item">
          <span
            className="legend-swatch"
            style={{ background: divergingColor(-LOG_RANGE, LOG_RANGE), width: 22 }}
          />
          rarer than usual (0.1×)
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--diverge-mid)', width: 22 }} />
          as usual (1×)
        </span>
        <span className="legend-item">
          <span
            className="legend-swatch"
            style={{ background: divergingColor(LOG_RANGE, LOG_RANGE), width: 22 }}
          />
          far likelier (8×)
        </span>
      </div>
    </div>
  );
}
