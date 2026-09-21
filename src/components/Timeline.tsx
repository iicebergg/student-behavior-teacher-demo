/**
 * The per-test timeline: one student, every visit, in temporal order.
 *
 * This is the graph the layer toggles act on. The x axis is the question number
 * a teacher recognises (1..40), so a return visit has to travel backwards along
 * it -- which is exactly the point. The path is drawn in temporal order, so a
 * return produces a connector that loops back to an earlier question, and that
 * loop-back is the visible form of the transition the analysis counts.
 *
 * Switching to "by visit order" straightens the same path left to right: the
 * back-arcs disappear and the sequence the Markov analysis actually walks is
 * laid out in a line.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BehavioralState } from '../encoding/encode';
import { STATE_LABELS } from '../encoding/encode';
import type { Attempt, Question, Topic, Visit } from '../data/types';
import { questionAt, topicAt } from '../data/types';
import type { Changepoint } from '../analysis/index';
import { useElementWidth } from '../state/useAppState';
import { STATE_SHAPES, isHollow, markPath, stateColor, topicColor } from './palette';

export type TimelineViewMode = 'by-question' | 'by-visit';

export interface TimelineLayers {
  topics: boolean;
  changepoints: boolean;
  returns: boolean;
}

const VIEW_WIDTH = 1180;
const MARGIN = { left: 42, right: 18, top: 10, bottom: 46 };
const STRIP_H = 9;
const MARK_SIZE = 9.5;

/**
 * Height for the back-arcs is only reserved when there are arcs to draw: with no
 * returns, or with the path straightened, the chart collapses to a single lane
 * instead of leaving an empty band across the top.
 */
interface Layout {
  laneReturn: number;
  laneFirst: number;
  stripY: number;
  axisY: number;
  labelY: number;
  height: number;
  arcCeiling: number;
}

function layoutFor(twoLane: boolean, headroom: boolean): Layout {
  const laneReturn = headroom ? 116 : 34;
  const laneFirst = twoLane ? 162 : headroom ? 116 : 34;
  const stripY = laneFirst + 24;
  const axisY = stripY + STRIP_H + 7;
  return {
    laneReturn,
    laneFirst,
    stripY,
    axisY,
    labelY: axisY + 13,
    height: axisY + 42,
    arcCeiling: MARGIN.top + 6,
  };
}

interface Placed {
  visit: Visit;
  x: number;
  y: number;
  topicId: number;
}

/** Cubic that humps above both ends; used for every backward or lane-changing edge. */
function arcPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ceiling: number,
): { d: string; apex: [number, number] } {
  const rise = Math.max(20, Math.abs(x2 - x1) * 0.34 + 16);
  const top = Math.max(ceiling, Math.min(y1, y2) - rise);
  const apexX = (x1 + x2) / 2;
  const apexY = (y1 + y2 + 6 * top) / 8;
  return { d: `M ${x1} ${y1} C ${x1} ${top}, ${x2} ${top}, ${x2} ${y2}`, apex: [apexX, apexY] };
}

export function Timeline({
  attempt,
  questions,
  topics,
  changepoints,
  layers,
  viewMode,
}: {
  attempt: Attempt;
  questions: readonly Question[];
  topics: readonly Topic[];
  changepoints: readonly Changepoint[];
  layers: TimelineLayers;
  viewMode: TimelineViewMode;
}): ReactNode {
  const [wrapRef, wrapWidth] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<Placed | null>(null);

  const hasReturns = attempt.returnLinks.length > 0;
  /** Two lanes stack a blank and its return at the same question. */
  const twoLane = viewMode === 'by-question' && hasReturns;
  /** Arcs need space above the lanes: back-arcs here, return links there. */
  const headroom = twoLane || (hasReturns && layers.returns);
  const lay = useMemo(() => layoutFor(twoLane, headroom), [twoLane, headroom]);

  const placed = useMemo<Placed[]>(() => {
    const plotWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right;
    const byQuestion = viewMode === 'by-question';
    const columns = byQuestion ? questions.length : Math.max(1, attempt.path.length);
    const step = plotWidth / columns;

    return attempt.path.map((visit) => {
      const column = byQuestion ? visit.questionNumber - 1 : visit.pathIndex;
      return {
        visit,
        x: MARGIN.left + (column + 0.5) * step,
        y: byQuestion && visit.isReturn ? lay.laneReturn : lay.laneFirst,
        topicId: questionAt(questions, visit.questionNumber).topicId,
      };
    });
  }, [attempt.path, questions, viewMode, lay]);

  const columnWidth =
    (VIEW_WIDTH - MARGIN.left - MARGIN.right) /
    (viewMode === 'by-question' ? questions.length : Math.max(1, attempt.path.length));

  const changepointByEdge = useMemo(() => {
    const map = new Map<number, Changepoint>();
    for (const changepoint of changepoints) map.set(changepoint.edgeIndex, changepoint);
    return map;
  }, [changepoints]);

  /** Return links, so the skip and its return can be tied together on screen. */
  const links = attempt.returnLinks;
  const scale = wrapWidth > 0 ? wrapWidth / VIEW_WIDTH : 1;

  const edges = placed.slice(0, -1).map((from, index) => {
    const to = placed[index + 1];
    if (to === undefined) return null;
    const backward = to.x < from.x;
    const laneChange = to.y !== from.y;
    const isReturnEdge = to.visit.isReturn;
    const changepoint = changepointByEdge.get(index);
    const geometry =
      backward || laneChange
        ? arcPath(from.x, from.y, to.x, to.y, lay.arcCeiling)
        : {
            d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
            apex: [(from.x + to.x) / 2, (from.y + to.y) / 2] as [number, number],
          };
    return { index, from, to, backward, isReturnEdge, changepoint, geometry };
  });

  const dimOthers = layers.returns;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${lay.height}`}
        role="img"
        aria-label={`Behavioural timeline across ${questions.length} questions, ${attempt.path.length} visits in temporal order.`}
      >
        {/* Topic layer, behind everything else */}
        {layers.topics && (
          <g aria-hidden="true">
            {viewMode === 'by-visit' &&
              placed.map((item) => (
                <rect
                  key={`band-${item.visit.pathIndex}`}
                  x={item.x - columnWidth / 2}
                  y={MARGIN.top}
                  width={Math.max(0.5, columnWidth - 0.4)}
                  height={lay.stripY - MARGIN.top}
                  style={{ fill: topicColor(item.topicId), opacity: 0.075 }}
                />
              ))}
            {viewMode === 'by-question' &&
              questions.map((question) => {
                const x = MARGIN.left + (question.questionNumber - 1) * columnWidth;
                return (
                  <g key={`topic-${question.questionNumber}`}>
                    <rect
                      x={x}
                      y={MARGIN.top}
                      width={columnWidth}
                      height={lay.stripY - MARGIN.top}
                      style={{ fill: topicColor(question.topicId), opacity: 0.075 }}
                    />
                    <rect
                      x={x + 0.5}
                      y={lay.stripY}
                      width={Math.max(0.5, columnWidth - 1)}
                      height={STRIP_H}
                      rx={1.5}
                      style={{ fill: topicColor(question.topicId), opacity: 0.85 }}
                    />
                  </g>
                );
              })}
            {viewMode === 'by-visit' &&
              placed.map((item) => (
                <rect
                  key={`strip-${item.visit.pathIndex}`}
                  x={item.x - columnWidth / 2 + 0.3}
                  y={lay.stripY}
                  width={Math.max(0.5, columnWidth - 0.6)}
                  height={STRIP_H}
                  rx={1.5}
                  style={{ fill: topicColor(item.topicId), opacity: 0.85 }}
                />
              ))}
          </g>
        )}

        {/* Lane guides */}
        <g aria-hidden="true">
          {twoLane && (
            <line
              x1={MARGIN.left}
              x2={VIEW_WIDTH - MARGIN.right}
              y1={lay.laneReturn}
              y2={lay.laneReturn}
              style={{ stroke: 'var(--gridline)', strokeWidth: 1, strokeDasharray: '2 4' }}
            />
          )}
          <line
            x1={MARGIN.left}
            x2={VIEW_WIDTH - MARGIN.right}
            y1={lay.laneFirst}
            y2={lay.laneFirst}
            style={{ stroke: 'var(--gridline)', strokeWidth: 1 }}
          />
          {twoLane && (
            <>
              <text x={MARGIN.left - 6} y={lay.laneReturn + 3} textAnchor="end" className="axis-label">
                return
              </text>
              <text x={MARGIN.left - 6} y={lay.laneFirst + 3} textAnchor="end" className="axis-label">
                first
              </text>
            </>
          )}
        </g>

        {/* The path, in temporal order */}
        <g fill="none">
          {edges.map((edge) => {
            if (edge === null) return null;
            const highlight = layers.returns && edge.isReturnEdge;
            const dim = dimOthers && !edge.isReturnEdge;
            return (
              <path
                key={`edge-${edge.index}`}
                d={edge.geometry.d}
                style={{
                  stroke: highlight ? 'var(--accent)' : 'var(--text-muted)',
                  strokeWidth: highlight ? 2.4 : 1.4,
                  opacity: dim ? 0.18 : edge.backward ? 0.85 : 0.55,
                  strokeLinecap: 'round',
                }}
              />
            );
          })}
        </g>

        {/* Arrowheads on the loop-back edges, when returns are emphasised */}
        {layers.returns && (
          <g aria-hidden="true">
            {edges.map((edge) => {
              if (edge === null || !edge.isReturnEdge || !edge.backward) return null;
              const [ax, ay] = edge.geometry.apex;
              return (
                <path
                  key={`arrow-${edge.index}`}
                  d={`M ${ax + 5} ${ay - 4.5} L ${ax - 4} ${ay} L ${ax + 5} ${ay + 4.5} Z`}
                  style={{ fill: 'var(--accent)' }}
                />
              );
            })}
          </g>
        )}

        {/* Blank-to-return pairs: the two visits share a question but not a slot in the path */}
        {layers.returns && twoLane && (
          <g aria-hidden="true">
            {links.map((link) => {
              const target = placed.find(
                (item) => item.visit.pathIndex === link.returnVisitPathIndex,
              );
              if (target === undefined) return null;
              return (
                <line
                  key={`pair-${link.questionNumber}`}
                  x1={target.x}
                  x2={target.x}
                  y1={lay.laneReturn + 7}
                  y2={lay.laneFirst - 7}
                  style={{
                    stroke: 'var(--accent)',
                    strokeWidth: 1.2,
                    strokeDasharray: '2 3',
                    opacity: 0.8,
                  }}
                />
              );
            })}
          </g>
        )}

        {/* Return links in the straightened view: the pair the analysis walks */}
        {layers.returns && !twoLane && (
          <g fill="none" aria-hidden="true">
            {links.map((link) => {
              const from = placed.find(
                (item) => item.visit.pathIndex === link.blankVisitPathIndex,
              );
              const to = placed.find((item) => item.visit.pathIndex === link.returnVisitPathIndex);
              if (from === undefined || to === undefined) return null;
              const { d } = arcPath(from.x, from.y - 7, to.x, to.y - 7, lay.arcCeiling);
              return (
                <path
                  key={`link-${link.questionNumber}`}
                  d={d}
                  style={{
                    stroke: 'var(--accent)',
                    strokeWidth: 1.2,
                    strokeDasharray: '3 3',
                    opacity: 0.75,
                  }}
                />
              );
            })}
          </g>
        )}

        {/* Changepoint layer, on the path edges */}
        {layers.changepoints && (
          <g>
            {edges.map((edge) => {
              if (edge === null || edge.changepoint === undefined) return null;
              const [ax, ay] = edge.geometry.apex;
              const negative = edge.changepoint.isNegative;
              return (
                <g key={`cp-${edge.index}`} opacity={dimOthers && !edge.isReturnEdge ? 0.35 : 1}>
                  {negative ? (
                    <path
                      d={markPath('diamond', ax, ay, 9.5)}
                      style={{
                        fill: 'var(--text-primary)',
                        stroke: 'var(--surface-1)',
                        strokeWidth: 2.4,
                        paintOrder: 'stroke',
                      }}
                    >
                      <title>
                        {`Negative changepoint ${edge.changepoint.fromState} → ${edge.changepoint.toState} at Q${edge.changepoint.questionNumber}`}
                      </title>
                    </path>
                  ) : (
                    <circle
                      cx={ax}
                      cy={ay}
                      r={2.6}
                      style={{
                        fill: 'var(--surface-1)',
                        stroke: 'var(--text-muted)',
                        strokeWidth: 1.4,
                      }}
                    >
                      <title>
                        {`Changepoint ${edge.changepoint.fromState} → ${edge.changepoint.toState} at Q${edge.changepoint.questionNumber}`}
                      </title>
                    </circle>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Visit marks */}
        <g>
          {placed.map((item) => {
            const shape = STATE_SHAPES[item.visit.state];
            const hollow = isHollow(shape);
            const dim = dimOthers && !item.visit.isReturn && !isPairedBlank(item.visit, links);
            const active = hovered?.visit.pathIndex === item.visit.pathIndex;
            return (
              <g
                key={`mark-${item.visit.pathIndex}`}
                opacity={dim ? 0.3 : 1}
                onMouseEnter={() => setHovered(item)}
                onMouseLeave={() => setHovered(null)}
              >
                {active && (
                  <circle cx={item.x} cy={item.y} r={9.5} style={{ fill: 'var(--surface-2)' }} />
                )}
                <path
                  d={markPath(shape, item.x, item.y, MARK_SIZE)}
                  style={{
                    fill: hollow ? 'var(--surface-1)' : stateColor(item.visit.state),
                    stroke: stateColor(item.visit.state),
                    strokeWidth: hollow ? 2 : 1.4,
                    paintOrder: 'stroke',
                  }}
                />
                {!twoLane && item.visit.isReturn && (
                  <line
                    x1={item.x - 4}
                    x2={item.x + 4}
                    y1={item.y + 9}
                    y2={item.y + 9}
                    style={{ stroke: 'var(--accent)', strokeWidth: 1.6 }}
                  />
                )}
                <circle className="hit" cx={item.x} cy={item.y} r={Math.max(9, columnWidth / 2)}>
                  <title>{describe(item.visit, topics, questions)}</title>
                </circle>
              </g>
            );
          })}
        </g>

        {/* Axis */}
        <g aria-hidden="true">
          <line
            x1={MARGIN.left}
            x2={VIEW_WIDTH - MARGIN.right}
            y1={lay.axisY}
            y2={lay.axisY}
            style={{ stroke: 'var(--axis)', strokeWidth: 1 }}
          />
          {viewMode === 'by-question'
            ? questions.map((question) => (
                <text
                  key={`tick-${question.questionNumber}`}
                  x={MARGIN.left + (question.questionNumber - 0.5) * columnWidth}
                  y={lay.labelY}
                  textAnchor="middle"
                  className="axis-label"
                >
                  {question.questionNumber}
                </text>
              ))
            : placed
                .filter((_item, index) => index % 5 === 0)
                .map((item) => (
                  <text
                    key={`vtick-${item.visit.pathIndex}`}
                    x={item.x}
                    y={lay.labelY}
                    textAnchor="middle"
                    className="axis-label"
                  >
                    {item.visit.pathIndex + 1}
                  </text>
                ))}
          <text
            x={MARGIN.left + (VIEW_WIDTH - MARGIN.left - MARGIN.right) / 2}
            y={lay.height - 8}
            textAnchor="middle"
            className="axis-title"
          >
            {viewMode === 'by-question'
              ? 'Question number — a return travels back along this axis'
              : 'Visit order — the sequence the Markov analysis walks'}
          </text>
        </g>
      </svg>

      {hovered !== null && (
        <VisitTooltip placed={hovered} topics={topics} scale={scale} width={wrapWidth} />
      )}
    </div>
  );
}

/** True when this blank visit is the origin of one of the return links. */
function isPairedBlank(visit: Visit, links: Attempt['returnLinks']): boolean {
  return links.some((link) => link.blankVisitPathIndex === visit.pathIndex);
}

function describe(visit: Visit, topics: readonly Topic[], questions: readonly Question[]): string {
  const topic = topicAt(topics, questionAt(questions, visit.questionNumber).topicId);
  return `Q${visit.questionNumber} · ${topic.label} · ${visit.state} (${STATE_LABELS[visit.state]}) · ${visit.durationSeconds}s`;
}

function VisitTooltip({
  placed,
  topics,
  scale,
  width,
}: {
  placed: Placed;
  topics: readonly Topic[];
  scale: number;
  width: number;
}): ReactNode {
  const { visit } = placed;
  const topic = topicAt(topics, placed.topicId);
  const left = placed.x * scale;
  const flip = width > 0 && left > width - 200;
  return (
    <div
      className="tooltip"
      style={{
        left: Math.max(0, flip ? left - 232 : left + 16),
        top: Math.max(0, placed.y * scale - 12),
      }}
    >
      <div className="tooltip-title">
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            background: stateColor(visit.state),
            display: 'inline-block',
          }}
        />
        Q{visit.questionNumber} · {visit.state} — {STATE_LABELS[visit.state]}
      </div>
      <dl>
        <dt>Topic</dt>
        <dd>{topic.label}</dd>
        <dt>Visit</dt>
        <dd>
          {visit.isReturn ? 'return' : 'first pass'} (#{visit.pathIndex + 1})
        </dd>
        <dt>Duration</dt>
        <dd>{visit.durationSeconds}s</dd>
        <dt>Rapid threshold</dt>
        <dd>{visit.rapidThreshold.toFixed(1)}s</dd>
        <dt>Answer changes</dt>
        <dd>{visit.answerChangesInVisit}</dd>
        <dt>Outcome</dt>
        <dd>{visit.leftBlank ? 'left blank' : visit.wasCorrect ? 'correct' : 'incorrect'}</dd>
      </dl>
    </div>
  );
}

/** The same path as a table, for anyone who would rather read the numbers. */
export function TimelineTable({
  attempt,
  questions,
  topics,
  changepoints,
}: {
  attempt: Attempt;
  questions: readonly Question[];
  topics: readonly Topic[];
  changepoints: readonly Changepoint[];
}): ReactNode {
  const anchors = new Map<number, Changepoint>();
  for (const changepoint of changepoints) anchors.set(changepoint.anchor.pathIndex, changepoint);

  return (
    <div style={{ maxHeight: 340, overflowY: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Visit</th>
            <th>Q</th>
            <th>Topic</th>
            <th>State</th>
            <th>Secs</th>
            <th>Changes</th>
            <th>Return</th>
            <th>Outcome</th>
            <th>Changepoint</th>
          </tr>
        </thead>
        <tbody>
          {attempt.path.map((visit) => {
            const topic = topicAt(topics, questionAt(questions, visit.questionNumber).topicId);
            const changepoint = anchors.get(visit.pathIndex);
            return (
              <tr key={visit.pathIndex}>
                <td>{visit.pathIndex + 1}</td>
                <td>{visit.questionNumber}</td>
                <td>{topic.label}</td>
                <td>
                  <span className="row-name">
                    <span
                      className="legend-swatch"
                      style={{ background: stateColor(visit.state), width: 10, height: 10 }}
                    />
                    {visit.state}
                  </span>
                </td>
                <td>{visit.durationSeconds}</td>
                <td>{visit.answerChangesInVisit}</td>
                <td>{visit.isReturn ? 'yes' : '—'}</td>
                <td>{visit.leftBlank ? 'blank' : visit.wasCorrect ? 'correct' : 'wrong'}</td>
                <td>
                  {changepoint === undefined
                    ? '—'
                    : `${changepoint.fromState}→${changepoint.toState}${changepoint.isNegative ? ' ▼' : ''}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type { BehavioralState };
