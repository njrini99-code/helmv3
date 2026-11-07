import { describe, expect, it } from 'vitest';
import { missSplit } from '../miss-split';

const cells = { approachMissShortPct: 54, approachMissLongPct: 20 };

describe('missSplit', () => {
  it('reads the calculator figure alone, its corners already inside it (03 problem 1)', () => {
    expect(missSplit(cells)).toEqual({ short: 54, long: 20 });
  });
  it('a missing cell reads as none', () => {
    expect(missSplit({ approachMissShortPct: null, approachMissLongPct: null } as unknown as typeof cells)).toEqual({ short: 0, long: 0 });
  });
});
