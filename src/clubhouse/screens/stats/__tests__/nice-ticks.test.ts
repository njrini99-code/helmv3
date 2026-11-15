import { describe, expect, it } from 'vitest';
import { niceTicks } from '../round-trend';

describe('niceTicks · an axis always has a scale', () => {
  it('scores from 70.5 to 78.4 print more than "75" alone', () => {
    const ticks = niceTicks(70.5, 78.4);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks).toEqual([72, 74, 76, 78]);
  });

  it('keeps the plain step when it already lands two or more', () => {
    expect(niceTicks(68, 80)).toEqual([70, 75, 80]);
    expect(niceTicks(-1.2, 0.4)).toEqual([-1, 0]);
  });

  it('every tick is inside the range it labels', () => {
    for (const [lo, hi] of [
      [70.5, 78.4],
      [71.2, 74.9],
      [-2.3, 1.1],
      [69, 90],
    ] as const)
      for (const t of niceTicks(lo, hi)) expect(t >= lo && t <= hi).toBe(true);
  });
});
