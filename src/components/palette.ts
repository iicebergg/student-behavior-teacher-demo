/**
 * Colour and mark specs.
 *
 * Two categorical scales, both validated with the data-viz palette validator on
 * the strictest (all-pairs) pairlist, in light and dark, against the surfaces
 * this app actually renders on (#fcfcfb / #1a1a19):
 *
 *   states  light: worst CVD ΔE 8.1, worst normal-vision ΔE 16.9, all ≥ 3:1
 *           dark:  worst CVD ΔE 8.0, worst normal-vision ΔE 16.5, all ≥ 3:1
 *   topics  light: worst CVD ΔE 8.0, worst normal-vision ΔE 16.2, all ≥ 3:1
 *           dark:  worst CVD ΔE 8.0, worst normal-vision ΔE 16.0, all ≥ 3:1
 *
 * Each state keeps one hue across both themes; only the step changes, so a
 * state never changes colour identity when the theme does. The hues carry
 * meaning: green correct, red wrong, magenta revision, amber rapid, and the two
 * blanks on cool hues.
 *
 * Colour is never the only channel. Every state also has its own mark shape,
 * filled for an answered visit and hollow for a blank one, and every legend,
 * table and tooltip names the state in text.
 *
 * Topic colours render as low-alpha washes wherever they share a chart with
 * state marks, and at full strength only in panels where no state marks appear.
 * That keeps the topic layer readable as a locator without competing with the
 * state marks sitting on top of it.
 *
 * The values themselves live in styles.css as custom properties, so the theme
 * swaps in one place; this module hands out the variable references.
 */
import type { BehavioralState } from '../encoding/encode';

/** CSS variable holding this state's colour. */
export function stateColor(state: BehavioralState): string {
  return `var(--state-${state.toLowerCase()})`;
}

/** A translucent wash of a state's colour, for fills behind text. */
export function stateWash(state: BehavioralState, percent = 16): string {
  return `color-mix(in oklab, ${stateColor(state)} ${percent}%, var(--surface-1))`;
}

/** CSS variable holding a topic's colour. Topic ids wrap at 5. */
export function topicColor(topicId: number): string {
  return `var(--topic-${((topicId % 5) + 5) % 5})`;
}

/** The wash used for topic bands behind the timeline. */
export function topicWash(topicId: number, percent = 15): string {
  return `color-mix(in oklab, ${topicColor(topicId)} ${percent}%, var(--surface-1))`;
}

/** The mark shape for each state: filled = answered, hollow = blank. */
export type MarkShape = 'circle' | 'triangle-down' | 'diamond' | 'chevron' | 'ring' | 'hollow-square';

export const STATE_SHAPES: Readonly<Record<BehavioralState, MarkShape>> = {
  C: 'circle',
  W: 'triangle-down',
  V: 'diamond',
  R: 'chevron',
  BF: 'ring',
  BS: 'hollow-square',
};

/** True for the two hollow (blank) marks. */
export function isHollow(shape: MarkShape): boolean {
  return shape === 'ring' || shape === 'hollow-square';
}

/**
 * SVG path for a mark of the given shape, centred on (x, y).
 * `size` is the full width of the mark; 8 is the floor for a hit-friendly mark.
 */
export function markPath(shape: MarkShape, x: number, y: number, size: number): string {
  const r = size / 2;
  switch (shape) {
    case 'circle':
    case 'ring':
      // Two arcs make a full circle.
      return `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${size} 0 a ${r} ${r} 0 1 0 ${-size} 0`;
    case 'triangle-down':
      return `M ${x - r} ${y - r * 0.82} L ${x + r} ${y - r * 0.82} L ${x} ${y + r} Z`;
    case 'diamond':
      return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
    case 'chevron':
      // Points right: rapid responding runs ahead of the rest of the class.
      return `M ${x - r * 0.9} ${y - r} L ${x + r} ${y} L ${x - r * 0.9} ${y + r} L ${x - r * 0.25} ${y} Z`;
    case 'hollow-square':
      return `M ${x - r * 0.88} ${y - r * 0.88} h ${r * 1.76} v ${r * 1.76} h ${-r * 1.76} Z`;
    default:
      return '';
  }
}

/** Colour for a signed value on the diverging (blue ↔ red) scale. */
export function divergingColor(value: number, max: number): string {
  if (!Number.isFinite(value) || max <= 0) return 'var(--surface-2)';
  const t = Math.min(1, Math.abs(value) / max);
  const pole = value >= 0 ? 'var(--diverge-warm)' : 'var(--diverge-cool)';
  return `color-mix(in oklab, ${pole} ${(t * 100).toFixed(1)}%, var(--diverge-mid))`;
}

/** Ink that stays readable on top of a diverging cell. */
export function divergingInk(value: number, max: number): string {
  const t = max <= 0 ? 0 : Math.min(1, Math.abs(value) / max);
  return t > 0.62 ? 'var(--on-strong)' : 'var(--text-primary)';
}
