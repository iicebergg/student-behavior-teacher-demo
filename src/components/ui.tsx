/** Small shared pieces: cards, toggles, segmented controls, stat tiles. */
import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  note,
  footnote,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  note?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle !== undefined && (
            <p className="card-note" style={{ margin: '2px 0 0' }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions}
      </div>
      {note !== undefined && <p className="card-note">{note}</p>}
      {children}
      {footnote !== undefined && <p className="card-footnote">{footnote}</p>}
    </section>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
}): ReactNode {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          title={option.title ?? option.label}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  title?: string;
}): ReactNode {
  return (
    <label className="toggle" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): ReactNode {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  hint?: string;
  onChange: (value: number) => void;
}): ReactNode {
  const id = `slider-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        <span className="field-value">{format ? format(value) : value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}
