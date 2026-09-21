/**
 * The two changepoint histograms.
 *
 *  - Position (Fig. 4): where in the attempt changepoints land, on a temporal
 *    0..1 axis, so a return sits at the moment it happened rather than at its
 *    question's place on the paper.
 *  - Accuracy delta (Fig. 5): how much accuracy moved across each changepoint.
 *    Bars left of centre are the slumps; the exactly-unchanged case gets its own
 *    bar so it can't be read as a small gain.
 */
import type { ReactNode } from 'react';
import type { HistogramBin } from '../analysis/index';

const VIEW_WIDTH = 520;
const VIEW_HEIGHT = 190;
const MARGIN = { left: 34, right: 12, top: 10, bottom: 42 };

function Bars({
  bins,
  colorFor,
  label,
  axisTitle,
  tickFor,
}: {
  bins: readonly HistogramBin[];
  colorFor: (bin: HistogramBin, index: number) => string;
  label: string;
  axisTitle: string;
  tickFor: (bin: HistogramBin, index: number) => string | null;
}): ReactNode {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const plotWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
  const step = plotWidth / Math.max(1, bins.length);
  const barWidth = Math.max(3, step - 4);

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} role="img" aria-label={label}>
      {[0, 0.5, 1].map((fraction) => {
        const y = MARGIN.top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line
              x1={MARGIN.left}
              x2={VIEW_WIDTH - MARGIN.right}
              y1={y}
              y2={y}
              style={{ stroke: 'var(--gridline)', strokeWidth: 1 }}
            />
            <text x={MARGIN.left - 5} y={y + 3} textAnchor="end" className="axis-label">
              {Math.round(max * fraction)}
            </text>
          </g>
        );
      })}

      {bins.map((bin, index) => {
        const height = (bin.count / max) * plotHeight;
        const x = MARGIN.left + index * step + (step - barWidth) / 2;
        const y = MARGIN.top + plotHeight - height;
        return (
          <g key={`${bin.label}-${index}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(bin.count > 0 ? 1.5 : 0, height)}
              rx={3}
              style={{ fill: colorFor(bin, index) }}
            >
              <title>{`${bin.label}: ${bin.count}`}</title>
            </rect>
            {bin.count > 0 && height > 16 && (
              <text x={x + barWidth / 2} y={y - 3} textAnchor="middle" className="value-label">
                {bin.count}
              </text>
            )}
          </g>
        );
      })}

      <line
        x1={MARGIN.left}
        x2={VIEW_WIDTH - MARGIN.right}
        y1={MARGIN.top + plotHeight}
        y2={MARGIN.top + plotHeight}
        style={{ stroke: 'var(--axis)', strokeWidth: 1 }}
      />
      {bins.map((bin, index) => {
        const tick = tickFor(bin, index);
        if (tick === null) return null;
        return (
          <text
            key={`tick-${index}`}
            x={MARGIN.left + index * step + step / 2}
            y={MARGIN.top + plotHeight + 14}
            textAnchor="middle"
            className="axis-label"
          >
            {tick}
          </text>
        );
      })}
      <text
        x={MARGIN.left + plotWidth / 2}
        y={VIEW_HEIGHT - 8}
        textAnchor="middle"
        className="axis-title"
      >
        {axisTitle}
      </text>
    </svg>
  );
}

export function PositionHistogram({ bins }: { bins: readonly HistogramBin[] }): ReactNode {
  return (
    <Bars
      bins={bins}
      label="Changepoints by position through the attempt"
      axisTitle="Position through the attempt (visit index ÷ path length)"
      colorFor={() => 'var(--accent)'}
      tickFor={(bin, index) => (index % 2 === 0 ? bin.start.toFixed(1) : null)}
    />
  );
}

export function DeltaHistogram({ bins }: { bins: readonly HistogramBin[] }): ReactNode {
  return (
    <Bars
      bins={bins}
      label="Accuracy change across each changepoint"
      axisTitle="Accuracy after minus accuracy before"
      colorFor={(bin) => {
        if (bin.start === 0 && bin.end === 0) return 'var(--text-muted)';
        return bin.start < 0 ? 'var(--diverge-warm)' : 'var(--diverge-cool)';
      }}
      tickFor={(bin) => {
        if (bin.start === 0 && bin.end === 0) return '0';
        if (bin.start === -1) return '−1';
        if (bin.end === 1) return '+1';
        if (bin.start === -0.5) return '−0.5';
        if (bin.start === 0.5) return '+0.5';
        return null;
      }}
    />
  );
}
