import { describe, expect, it } from 'vitest';
import { encodeState, isMc, MC_TYPES, REVISION_MIN, STATES } from './encode';

const MC = 'multiple-choice';
const THRESHOLD = 10;

describe('isMc', () => {
  it('accepts every known multiple-choice spelling', () => {
    for (const type of MC_TYPES) {
      expect(isMc(type)).toBe(true);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isMc('  Multiple-Choice ')).toBe(true);
    expect(isMc('MC')).toBe(true);
    expect(isMc('SINGLE_SELECT')).toBe(true);
  });

  it('treats null and undefined as non-multiple-choice', () => {
    expect(isMc(null)).toBe(false);
    expect(isMc(undefined)).toBe(false);
  });

  it('treats unknown types as non-multiple-choice', () => {
    expect(isMc('free-response')).toBe(false);
    expect(isMc('drag-drop')).toBe(false);
    expect(isMc('multiple select')).toBe(false);
  });
});

describe('encodeState — BF vs BS split by threshold', () => {
  it('returns BF when a blank is at or under the threshold', () => {
    expect(encodeState(3, 0, false, MC, THRESHOLD)).toBe('BF');
  });

  it('treats the threshold itself as fast (<=, not <)', () => {
    expect(encodeState(THRESHOLD, 0, false, MC, THRESHOLD)).toBe('BF');
  });

  it('returns BS one second past the threshold', () => {
    expect(encodeState(THRESHOLD + 1, 0, false, MC, THRESHOLD)).toBe('BS');
  });

  it('returns BS for a long abandonment', () => {
    expect(encodeState(212, 0, false, MC, THRESHOLD)).toBe('BS');
  });

  it('ignores wasCorrect on a blank visit', () => {
    expect(encodeState(2, 0, true, MC, THRESHOLD)).toBe('BF');
    expect(encodeState(90, 0, true, MC, THRESHOLD)).toBe('BS');
  });
});

describe('encodeState — blank is checked before rapid', () => {
  it('gives BS, not R, for a slow blank', () => {
    expect(encodeState(120, 0, false, MC, THRESHOLD)).toBe('BS');
  });

  it('gives BF, not R, for a fast blank', () => {
    expect(encodeState(1, 0, false, MC, THRESHOLD)).toBe('BF');
  });

  it('still gives R for a fast non-MC response with 0 changes', () => {
    // Off the MC path the blank branch cannot fire, so the rapid check wins.
    expect(encodeState(1, 0, false, 'free-response', THRESHOLD)).toBe('R');
    expect(encodeState(1, 0, false, null, THRESHOLD)).toBe('R');
  });
});

describe('encodeState — R takes precedence over V', () => {
  it('gives R when a rapid response also has 3+ changes', () => {
    expect(encodeState(4, 5, true, MC, THRESHOLD)).toBe('R');
    expect(encodeState(4, 5, false, MC, THRESHOLD)).toBe('R');
  });

  it('gives R at exactly the threshold', () => {
    expect(encodeState(THRESHOLD, 4, true, MC, THRESHOLD)).toBe('R');
  });

  it('gives V one second past the threshold with the same changes', () => {
    expect(encodeState(THRESHOLD + 1, 4, true, MC, THRESHOLD)).toBe('V');
  });

  it('gives R regardless of correctness or item type', () => {
    expect(encodeState(2, 1, true, 'free-response', THRESHOLD)).toBe('R');
    expect(encodeState(2, 1, false, MC, THRESHOLD)).toBe('R');
  });
});

describe('encodeState — V only when MC, changes >= REVISION_MIN, and not rapid', () => {
  it('fires at exactly REVISION_MIN changes', () => {
    expect(encodeState(45, REVISION_MIN, true, MC, THRESHOLD)).toBe('V');
  });

  it('does not fire one change below REVISION_MIN', () => {
    expect(encodeState(45, REVISION_MIN - 1, true, MC, THRESHOLD)).toBe('C');
    expect(encodeState(45, REVISION_MIN - 1, false, MC, THRESHOLD)).toBe('W');
  });

  it('does not fire on non-MC items, which fall through to C/W', () => {
    expect(encodeState(45, 7, true, 'free-response', THRESHOLD)).toBe('C');
    expect(encodeState(45, 7, false, 'drag-drop', THRESHOLD)).toBe('W');
    expect(encodeState(45, 7, false, undefined, THRESHOLD)).toBe('W');
  });

  it('outranks correctness: a correct answer with heavy revision is still V', () => {
    expect(encodeState(60, 9, true, MC, THRESHOLD)).toBe('V');
  });
});

describe('encodeState — C/W fallback by correctness', () => {
  it('gives C for a correct, engaged, unrevised answer', () => {
    expect(encodeState(52, 1, true, MC, THRESHOLD)).toBe('C');
  });

  it('gives W for a wrong, engaged, unrevised answer', () => {
    expect(encodeState(52, 1, false, MC, THRESHOLD)).toBe('W');
  });

  it('applies to non-MC items too', () => {
    expect(encodeState(52, 0, true, 'free-response', THRESHOLD)).toBe('C');
    expect(encodeState(52, 0, false, 'free-response', THRESHOLD)).toBe('W');
  });
});

describe('encodeState — branch ordering as a whole', () => {
  it('only ever returns one of the six states', () => {
    const seen = new Set<string>();
    for (const time of [0, 1, 10, 11, 45, 200]) {
      for (const changes of [0, 1, 2, 3, 9]) {
        for (const correct of [true, false]) {
          for (const type of [MC, 'free-response', null]) {
            const state = encodeState(time, changes, correct, type, THRESHOLD);
            expect(STATES).toContain(state);
            seen.add(state);
          }
        }
      }
    }
    expect(seen).toEqual(new Set(STATES));
  });

  it('matches the reference table of the four branches, in order', () => {
    // 1. blank (MC + 0 changes) -> BF/BS by time
    expect(encodeState(9, 0, true, MC, THRESHOLD)).toBe('BF');
    expect(encodeState(99, 0, true, MC, THRESHOLD)).toBe('BS');
    // 2. rapid
    expect(encodeState(9, 3, true, MC, THRESHOLD)).toBe('R');
    // 3. heavy revision
    expect(encodeState(99, 3, true, MC, THRESHOLD)).toBe('V');
    // 4. correctness fallback
    expect(encodeState(99, 2, true, MC, THRESHOLD)).toBe('C');
    expect(encodeState(99, 2, false, MC, THRESHOLD)).toBe('W');
  });
});
