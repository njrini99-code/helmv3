import { describe, expect, it } from 'vitest';

/** A8.2 and A8.11: trend ticks print each label once, and the par line is drawn only when every round in view shares one par. */

import { niceTicks, parLine, tickDigits, type TrendRound } from '../round-trend';
import { formatSigned } from '../../../lib/format';

const round = (i: number, value: number, par: number): TrendRound => ({ id: `r${i}`, label: `Sep ${i + 1}`, value, toPar: value - par, holes: 18 });

describe('trend ticks (A8.2)', () => {
  it('niceTicks labels are distinct round numbers', () => {
    for (const [lo, hi] of [
      [71.2, 76.1],
      [-1.6, 1.4],
      [-0.4, 0.9],
      [0, 100],
    ] as const) {
      const t = niceTicks(lo, hi, 3);
      expect(new Set(t).size).toBe(t.length);
    }
  });

  it('strokes gained ticks a half stroke apart print one decimal, so +0.5 and +1.0 never both read "+1"', () => {
    const t = niceTicks(-0.4, 0.9, 3);
    expect(t[1]! - t[0]!).toBe(0.5);
    expect(tickDigits(t)).toBe(1);
    const labels = t.map((v) => formatSigned(v, tickDigits(t)));
    expect(new Set(labels).size).toBe(labels.length);
    expect(tickDigits(niceTicks(-1.6, 1.4, 3))).toBe(0);
  });
});

describe('the par line (A8.11)', () => {
  it('is drawn at the one par every round shares', () => {
    expect(parLine([round(0, 74, 72), round(1, 71, 72)])).toBe(72);
  });

  it('is not drawn for a mix of par-71 and par-72 courses', () => {
    expect(parLine([round(0, 74, 72), round(1, 73, 71), round(2, 72, 72)])).toBeNull();
  });
});
