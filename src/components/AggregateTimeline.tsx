/**
 * The classroom view of the same timeline: one column per question, the whole
 * class stacked into it. The topic and changepoint toggles work exactly as they
 * do on the individual timeline, so a teacher can switch between "this student"
 * and "the class" without relearning the graph.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STATES, STATE_LABELS } from '../encoding/encode';
import type { BehavioralState } from '../encoding/encode';
import type { Question, Topic } from '../data/types';
import type { QuestionAggregate } from '../analysis/index';
import { percent } from '../analysis/stats';
import { useElementWidth } from '../state/useAppState';
import { stateColor, topicColor } from './palette';

export type AggregateMetric = 'state-mix' | 'rates';

const VIEW_WIDTH = 1180;
const MARGIN = { left: 42, right: 18, top: 44, bottom: 46 };
const PLOT_H = 168;
const STRIP_Y = MARGIN.top + PLOT_H + 8;
const STRIP_H = 9;
const AXIS_Y = STRIP_Y + STRIP_H + 7;
const LABEL_Y = AXIS_Y + 13;
const VIEW_HEIGHT = AXIS_Y + 42;
/** A 2px gap between stacked segments, in view units. */
const SEGMENT_GAP = 1.6;

export function AggregateTimeline({
  rows,
  questions,
  topics,
  showTopics,
  showChangepoints,
  metric,
}: {
  rows: readonly QuestionAggregate[];
  questions: readonly Question[];
  topics: readonly Topic[];
  showTopics: boolean;
  showChangepoints: boolean;
  metric: AggregateMetric;
}): ReactNode {
  const [wrapRef, wrapWidth] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<QuestionAggregate | null>(null);

  const columnWidth = (VIEW_WIDTH - MARGIN.left - MARGIN.right) / Math.max(1, questions.length);
  const barWidth = Math.max(3, columnWidth - 2.6);
  const scale = wrapWidth > 0 ? wrapWidth / VIEW_WIDTH : 1;
  const xFor = (index: number): number => MARGIN.left + index * columnWidth + columnWidth / 2;

  const rateSeries = useMemo(
    () => [
      {
        key: 'blankFirstShare' as const,
        label: 'left it blank on the first pass',
        color: 'var(--state-bf)',
      },
      {
        key: 'changepointShare' as const,
        label: 'changed behaviour here',
        color: 'var(--text-secondary)',
      },
      {
        key: 'negativeChangepointShare' as const,
        label: 'changed behaviour for the worse',
        color: 'var(--critical)',
      },
    ],
    [],
  );

  /** Every rate series is a share of the class, so they share one 0..1 axis. */
  const rateMax = useMemo(() => {
    let max = 0.2;
    for (const row of rows) {
      max = Math.max(max, row.blankFirstShare, row.changepointShare, row.negativeChangepointShare);
    }
    return Math.min(1, Math.ceil(max * 10) / 10);
  }, [rows]);

  return (
    <div className="chart-scroll">
      <div className="chart-wrap" ref={wrapRef}>
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label={
            metric === 'state-mix'
              ? 'Distribution of behavioural states per question across the class.'
              : 'Blank rate and changepoint incidence per question across the class.'
          }
        >
          {/* Gridlines */}
          <g aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = MARGIN.top + PLOT_H * (1 - fraction);
              return (
                <g key={fraction}>
                  <line
                    x1={MARGIN.left}
                    x2={VIEW_WIDTH - MARGIN.right}
                    y1={y}
                    y2={y}
                    style={{ stroke: 'var(--gridline)', strokeWidth: 1 }}
                  />
                  <text x={MARGIN.left - 6} y={y + 3} textAnchor="end" className="axis-label">
                    {metric === 'state-mix'
                      ? `${Math.round(fraction * 100)}%`
                      : `${Math.round(fraction * rateMax * 100)}%`}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Topic layer */}
          {showTopics && (
            <g aria-hidden="true">
              {questions.map((question, index) => (
                <g key={`topic-${question.questionNumber}`}>
                  <rect
                    x={MARGIN.left + index * columnWidth}
                    y={MARGIN.top}
                    width={columnWidth}
                    height={PLOT_H}
                    style={{
                      fill: topicColor(question.topicId),
                      opacity: 0.07,
                    }}
                  />
                  <rect
                    x={MARGIN.left + index * columnWidth + 0.5}
                    y={STRIP_Y}
                    width={Math.max(0.5, columnWidth - 1)}
                    height={STRIP_H}
                    rx={1.5}
                    style={{
                      fill: topicColor(question.topicId),
                      opacity: 0.85,
                    }}
                  />
                </g>
              ))}
            </g>
          )}

          {/* Stacked state mix, or the rate lines */}
          {metric === 'state-mix' ? (
            <g>
              {rows.map((row, index) => {
                const x = xFor(index) - barWidth / 2;
                let offset = 0;
                const segments = STATES.map((state) => {
                  const share = row.visits > 0 ? (row.stateCounts.get(state) ?? 0) / row.visits : 0;
                  const height = share * PLOT_H;
                  const y = MARGIN.top + PLOT_H - offset - height;
                  offset += height;
                  return { state, share, height, y };
                }).filter((segment) => segment.height > 0);

                return (
                  <g
                    key={row.questionNumber}
                    onMouseEnter={() => setHovered(row)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {segments.map((segment) => (
                      <rect
                        key={segment.state}
                        x={x}
                        y={segment.y}
                        width={barWidth}
                        height={Math.max(0.6, segment.height - SEGMENT_GAP)}
                        rx={1}
                        style={{ fill: stateColor(segment.state) }}
                      />
                    ))}
                    <rect
                      className="hit"
                      x={x - 1}
                      y={MARGIN.top}
                      width={barWidth + 2}
                      height={PLOT_H}
                    >
                      <title>{summaryFor(row)}</title>
                    </rect>
                  </g>
                );
              })}
            </g>
          ) : (
            <g>
              {rateSeries.map((series) => (
                <path
                  key={series.key}
                  d={rows
                    .map((row, index) => {
                      const y = MARGIN.top + PLOT_H * (1 - row[series.key] / rateMax);
                      return `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${y}`;
                    })
                    .join(' ')}
                  style={{
                    fill: 'none',
                    stroke: series.color,
                    strokeWidth: 2,
                    strokeLinejoin: 'round',
                  }}
                />
              ))}
              {rows.map((row, index) => (
                <g
                  key={row.questionNumber}
                  onMouseEnter={() => setHovered(row)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    className="hit"
                    x={xFor(index) - columnWidth / 2}
                    y={MARGIN.top}
                    width={columnWidth}
                    height={PLOT_H}
                  >
                    <title>{summaryFor(row)}</title>
                  </rect>
                </g>
              ))}
            </g>
          )}

          {/* Changepoint layer: incidence per question, on top of whichever metric is showing */}
          {showChangepoints && metric === 'state-mix' && (
            <g aria-hidden="true">
              {rows.map((row, index) => {
                const height =
                  Math.min(1, row.negativeChangepointShare / Math.max(0.05, rateMax)) * 26;
                return (
                  <rect
                    key={`cp-${row.questionNumber}`}
                    x={xFor(index) - 2}
                    y={MARGIN.top - 4 - height}
                    width={4}
                    height={height}
                    rx={1}
                    style={{ fill: 'var(--critical)' }}
                  />
                );
              })}
              <text x={MARGIN.left} y={MARGIN.top - 36} className="axis-label">
                share of the class whose behaviour turned down here ▲
              </text>
            </g>
          )}

          {/* Axis */}
          <g aria-hidden="true">
            <line
              x1={MARGIN.left}
              x2={VIEW_WIDTH - MARGIN.right}
              y1={AXIS_Y}
              y2={AXIS_Y}
              style={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            />
            {questions.map((question, index) => (
              <text
                key={question.questionNumber}
                x={xFor(index)}
                y={LABEL_Y}
                textAnchor="middle"
                className="axis-label"
              >
                {question.questionNumber}
              </text>
            ))}
            <text
              x={MARGIN.left + (VIEW_WIDTH - MARGIN.left - MARGIN.right) / 2}
              y={VIEW_HEIGHT - 8}
              textAnchor="middle"
              className="axis-title"
            >
              Question number
            </text>
          </g>
        </svg>

        {metric === 'rates' && (
          <div className="legend" style={{ marginTop: 8 }}>
            {rateSeries.map((series) => (
              <span className="legend-item" key={series.key}>
                <span
                  className="legend-swatch"
                  style={{
                    background: series.color,
                    height: 3,
                    borderRadius: 2,
                  }}
                />
                <span>{series.label}</span>
              </span>
            ))}
          </div>
        )}

        {hovered !== null && (
          <AggregateTooltip
            row={hovered}
            topics={topics}
            scale={scale}
            width={wrapWidth}
            columnWidth={columnWidth}
          />
        )}
      </div>
    </div>
  );
}

function summaryFor(row: QuestionAggregate): string {
  return [
    `Q${row.questionNumber}`,
    `${row.visits} visits from ${row.students} students`,
    `${percent(row.blankFirstShare, 0)} blank first pass`,
    `${percent(row.accuracy, 0)} finally correct`,
  ].join(' · ');
}

function AggregateTooltip({
  row,
  topics,
  scale,
  width,
  columnWidth,
}: {
  row: QuestionAggregate;
  topics: readonly Topic[];
  scale: number;
  width: number;
  columnWidth: number;
}): ReactNode {
  const topic = topics.find((candidate) => candidate.id === row.topicId);
  const left = (MARGIN.left + (row.questionNumber - 0.5) * columnWidth) * scale;
  const flip = width > 0 && left > width - 220;
  const top3 = STATES.map<[BehavioralState, number]>((state) => [
    state,
    row.visits > 0 ? (row.stateCounts.get(state) ?? 0) / row.visits : 0,
  ])
    .filter(([, share]) => share > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="tooltip" style={{ left: Math.max(0, flip ? left - 250 : left + 14), top: 10 }}>
      <div className="tooltip-title">
        Q{row.questionNumber} · {topic?.label ?? 'Topic'}
      </div>
      <dl>
        <dt>Visits</dt>
        <dd>{row.visits}</dd>
        <dt>Blank first pass</dt>
        <dd>{percent(row.blankFirstShare, 0)}</dd>
        <dt>Came back</dt>
        <dd>{row.blankFirstShare > 0 ? percent(row.returnShare, 0) : '—'}</dd>
        <dt>Changed behaviour</dt>
        <dd>{percent(row.changepointShare, 0)} of the class</dd>
        <dt>…for the worse</dt>
        <dd>{percent(row.negativeChangepointShare, 0)} of the class</dd>
        <dt>Finally correct</dt>
        <dd>{percent(row.accuracy, 0)}</dd>
        <dt>Median visit</dt>
        <dd>{row.medianSeconds.toFixed(0)}s</dd>
        <dt>Rapid threshold</dt>
        <dd>{row.rapidThreshold.toFixed(1)}s</dd>
      </dl>
      <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 11.5 }}>
        {top3.map(([state, share]) => `${state} ${percent(share, 0)}`).join(' · ')}
        <div className="muted" style={{ fontSize: 11 }}>
          {top3.length > 0 ? STATE_LABELS[top3[0]?.[0] ?? 'C'] : ''}
        </div>
      </div>
    </div>
  );
}
