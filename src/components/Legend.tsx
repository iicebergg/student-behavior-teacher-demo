/**
 * Legends for the two categorical scales.
 *
 * Identity never rests on colour alone: each state carries its own mark shape
 * and its letter, and each topic carries its name.
 */
import type { ReactNode } from 'react';
import type { BehavioralState } from '../encoding/encode';
import { STATES, STATE_DESCRIPTIONS, STATE_LABELS } from '../encoding/encode';
import type { Topic } from '../data/types';
import { STATE_SHAPES, isHollow, markPath, stateColor, topicColor } from './palette';

/** The state's mark, at legend size. */
export function StateGlyph({ state, size = 13 }: { state: BehavioralState; size?: number }): ReactNode {
  const shape = STATE_SHAPES[state];
  const hollow = isHollow(shape);
  return (
    <svg width={size + 4} height={size + 4} viewBox={`0 0 ${size + 4} ${size + 4}`} aria-hidden="true" style={{ flex: 'none' }}>
      <path
        d={markPath(shape, (size + 4) / 2, (size + 4) / 2, size)}
        style={{
          fill: hollow ? 'transparent' : stateColor(state),
          stroke: stateColor(state),
          strokeWidth: hollow ? 2 : 1,
        }}
      />
    </svg>
  );
}

export function StateLegend({ compact = false }: { compact?: boolean }): ReactNode {
  return (
    <div className="legend">
      {STATES.map((state) => (
        <span className="legend-item" key={state} title={STATE_DESCRIPTIONS[state]}>
          <StateGlyph state={state} />
          <b>{state}</b>
          {!compact && <span>{STATE_LABELS[state]}</span>}
        </span>
      ))}
    </div>
  );
}

export function TopicLegend({ topics }: { topics: readonly Topic[] }): ReactNode {
  return (
    <div className="legend">
      {topics.map((topic) => (
        <span className="legend-item" key={topic.id}>
          <span
            className="legend-swatch"
            style={{
              background: `color-mix(in oklab, ${topicColor(topic.id)} 30%, var(--surface-1))`,
              border: `1px solid ${topicColor(topic.id)}`,
            }}
          />
          <span>{topic.label}</span>
          {topic.isTrigger && <span className="tag tag-trigger">trigger</span>}
        </span>
      ))}
    </div>
  );
}

/** What the marks on the path edges mean, when the changepoint layer is on. */
export function ChangepointLegend({ showReturns }: { showReturns: boolean }): ReactNode {
  return (
    <div className="legend">
      <span className="legend-item">
        <svg width={15} height={15} viewBox="0 0 15 15" aria-hidden="true" style={{ flex: 'none' }}>
          <circle cx={7.5} cy={7.5} r={2.8} style={{ fill: 'var(--surface-1)', stroke: 'var(--text-muted)', strokeWidth: 1.4 }} />
        </svg>
        <span>changepoint (the state changed)</span>
      </span>
      <span className="legend-item">
        <svg width={15} height={15} viewBox="0 0 15 15" aria-hidden="true" style={{ flex: 'none' }}>
          <path d={markPath('diamond', 7.5, 7.5, 9.5)} style={{ fill: 'var(--text-primary)' }} />
        </svg>
        <span>
          <b>negative</b> changepoint (accuracy fell across it)
        </span>
      </span>
      {showReturns && (
        <span className="legend-item">
          <svg width={22} height={15} viewBox="0 0 22 15" aria-hidden="true" style={{ flex: 'none' }}>
            <path d="M 1 11 C 6 1, 16 1, 21 11" style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }} />
          </svg>
          <span>return: the loop back to a question left blank</span>
        </span>
      )}
    </div>
  );
}
