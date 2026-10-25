import { describe, expect, it } from 'vitest';
import { turningStretch, type FlowPoint } from '../round-insights';

/** Points in play order from strokes to par per hole; `start` numbers them as a round started on that hole. */
const pts = (deltas: number[], start = 1): FlowPoint[] => {
  let cum = 0;
  return deltas.map((delta, i) => {
    cum += delta;
    return { n: ((start - 1 + i) % 18) + 1, par: 4, score: 4 + delta, delta, cum, result: 'par' };
  });
};

describe('turningStretch (P-7)', () => {
  it('finds the run that moved the score most, and says nothing under 2', () => {
    expect(turningStretch(pts([0, 1, 0, 0, 0, 1, 0]))).toBeNull();
    expect(turningStretch(pts([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0]))).toMatchObject({ from: 13, to: 15, sum: 3, words: 'Lost 3 on 13 to 15' });
    expect(turningStretch(pts([0, -1, -1, 0, 0]))).toMatchObject({ sum: -2, words: 'Got 2 back on 2 to 3' });
  });

  it('a loss beats a gain of the same size, then the shorter run, then the later one', () => {
    expect(turningStretch(pts([-1, -1, 0, 1, 1]))!.words).toBe('Lost 2 on 4 to 5');
    expect(turningStretch(pts([1, 1, 0, 0, 1, 1]))!.words).toBe('Lost 2 on 5 to 6');
    expect(turningStretch(pts([2, 0, 0, 0, 1, 1]))!.words).toBe('Lost 2 on 5 to 6');
  });

  it('a run that wraps past 18 lists its holes', () => {
    const r = pts([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], 10);
    expect(turningStretch(r)!.words).toBe('Lost 3 on 17, 18 and 1');
  });
});
