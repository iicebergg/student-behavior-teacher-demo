/**
 * The 6x6 transition-lift matrix, over adjacent visits in the temporal path.
 *
 *     lift(X -> Y) = P(next = Y | current = X) / P(next = Y)
 *
 * A lift of 1 means X tells you nothing about Y. A lift of 8 means Y is eight
 * times likelier right after X than it is in general.
 *
 * This diverges from the paper's Fig. 3 by design: the forward-only study
 * could not observe return transitions, and here they are in the chain.
 */
import type { BehavioralState } from '../encoding/encode';
import { STATES } from '../encoding/encode';
import type { PathEdge } from './path';

export interface TransitionCell {
  from: BehavioralState;
  to: BehavioralState;
  count: number;
  /** P(next = to | current = from); null when `from` never occurs. */
  conditional: number | null;
  /** lift = conditional / marginal; null when either side is undefined. */
  lift: number | null;
}

export interface TransitionMatrix {
  cells: readonly TransitionCell[];
  /** Total adjacent pairs counted. */
  total: number;
  rowTotals: ReadonlyMap<BehavioralState, number>;
  /** Marginal P(next = Y) over every "next" slot. */
  marginals: ReadonlyMap<BehavioralState, number>;
  get(from: BehavioralState, to: BehavioralState): TransitionCell;
  /** How many of the counted pairs were return edges. */
  returnEdgeCount: number;
  /** How many went backwards on the question axis. */
  backwardEdgeCount: number;
}

export function computeTransitions(edges: readonly PathEdge[]): TransitionMatrix {
  const counts = new Map<string, number>();
  const rowTotals = new Map<BehavioralState, number>();
  const colTotals = new Map<BehavioralState, number>();
  let total = 0;
  let returnEdgeCount = 0;
  let backwardEdgeCount = 0;

  for (const state of STATES) {
    rowTotals.set(state, 0);
    colTotals.set(state, 0);
  }

  for (const edge of edges) {
    const key = `${edge.from.state}>${edge.to.state}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    rowTotals.set(edge.from.state, (rowTotals.get(edge.from.state) ?? 0) + 1);
    colTotals.set(edge.to.state, (colTotals.get(edge.to.state) ?? 0) + 1);
    total += 1;
    if (edge.isReturnEdge) returnEdgeCount += 1;
    if (edge.isBackward) backwardEdgeCount += 1;
  }

  const marginals = new Map<BehavioralState, number>();
  for (const state of STATES) {
    marginals.set(state, total > 0 ? (colTotals.get(state) ?? 0) / total : 0);
  }

  const cells: TransitionCell[] = [];
  for (const from of STATES) {
    const rowTotal = rowTotals.get(from) ?? 0;
    for (const to of STATES) {
      const count = counts.get(`${from}>${to}`) ?? 0;
      const conditional = rowTotal > 0 ? count / rowTotal : null;
      const marginal = marginals.get(to) ?? 0;
      const lift = conditional === null || marginal === 0 ? null : conditional / marginal;
      cells.push({ from, to, count, conditional, lift });
    }
  }

  const index = new Map<string, TransitionCell>();
  for (const cell of cells) index.set(`${cell.from}>${cell.to}`, cell);

  return {
    cells,
    total,
    rowTotals,
    marginals,
    returnEdgeCount,
    backwardEdgeCount,
    get: (from, to) => {
      const cell = index.get(`${from}>${to}`);
      if (cell === undefined) {
        return { from, to, count: 0, conditional: null, lift: null };
      }
      return cell;
    },
  };
}

/** The strongest lifts, for the "what stands out" line under the heatmap. */
export function topLifts(matrix: TransitionMatrix, limit = 3, minCount = 8): TransitionCell[] {
  return matrix.cells
    .filter((cell) => cell.lift !== null && cell.count >= minCount)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
    .slice(0, limit);
}
