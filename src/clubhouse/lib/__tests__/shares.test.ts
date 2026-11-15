import { describe, expect, it } from 'vitest';
import { roundShares, roundSplit } from '../shares';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('roundShares', () => {
  it('rounds a split so it adds to exactly 100 (Braeden: Left 20.4, Fairway 60.2, Right 19.4 read 20 + 60 + 19)', () => {
    const r = roundShares([20.4, 60.2, 19.4]);
    expect(sum(r)).toBe(100);
    expect(r).toEqual([21, 60, 19]);
  });

  it('gives the spare point to the largest remainder, thirds included', () => {
    expect(roundShares([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('takes counts as well as percentages', () => {
    expect(sum(roundShares([12, 11, 25, 21, 13, 6, 8, 3, 3]))).toBe(100);
  });

  it('leaves an empty split empty', () => {
    expect(roundShares([0, 0])).toEqual([0, 0]);
    expect(roundShares([])).toEqual([]);
  });
});

describe('roundSplit', () => {
  it('rounds parts of a whole so they add to 100 with the unshown rest', () => {
    // 118 drives: 24 left, 71 fairway, 23 right, so nothing else; 20 + 60 + 19 would read 99.
    const r = roundSplit([24, 71, 23], 118);
    expect(r).toHaveLength(3);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('leaves the rest out of the parts when some drives had no side logged', () => {
    expect(roundSplit([1, 1, 1], 4)).toEqual([25, 25, 25]);
  });
});
