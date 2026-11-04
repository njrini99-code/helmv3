import { describe, expect, it } from 'vitest';
import { missSplit } from '../miss-split';

const cells = { approachMissShortPct: 54, approachMissShortLeftPct: 12, approachMissShortRightPct: 8, approachMissLongPct: 20, approachMissLongLeftPct: 3, approachMissLongRightPct: 2 };

describe('missSplit', () => {
  it('with the flag on reads the calculator figure alone (03 problem 1)', () => {
    expect(missSplit(cells, true)).toEqual({ short: 54, long: 20 });
  });
  it('with the flag off keeps main formula', () => {
    expect(missSplit(cells, false)).toEqual({ short: 74, long: 25 });
  });
  it('a missing cell reads as none', () => {
    const none = { approachMissShortPct: null, approachMissShortLeftPct: null, approachMissShortRightPct: null, approachMissLongPct: null, approachMissLongLeftPct: null, approachMissLongRightPct: null } as unknown as typeof cells;
    expect(missSplit(none, true)).toEqual({ short: 0, long: 0 });
  });
});
