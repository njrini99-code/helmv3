import { describe, expect, it } from 'vitest';
import { tickValues } from './slider';

describe('tickValues', () => {
  it('walks by integer index, so a 0.5 step lands exactly on max', () => {
    // The old `for (v = min; v <= max; v += 0.5)` accumulated float error and
    // could drop the final mark. Integer indexing cannot.
    expect(tickValues(1, 3, 0.5)).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  it('lands exactly on max for a 0.1 step', () => {
    const t = tickValues(0, 1, 0.1, 20);
    expect(t[t.length - 1]).toBe(1);
  });

  it('emits one tick per step when the count is small', () => {
    expect(tickValues(1, 4, 1)).toEqual([1, 2, 3, 4]);
  });

  it('thins out rather than crowding the rail', () => {
    const t = tickValues(0, 100, 1, 6);
    expect(t.length).toBeLessThanOrEqual(7);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(100);
  });

  it('always includes both ends', () => {
    for (const [min, max, step] of [
      [1, 4, 1],
      [0.5, 3, 0.5],
      [0, 10, 3],
    ] as const) {
      const t = tickValues(min, max, step);
      expect(t[0]).toBe(min);
      expect(t[t.length - 1]).toBeCloseTo(max, 5);
    }
  });

  it('degrades honestly on a nonsense range', () => {
    expect(tickValues(5, 5, 1)).toEqual([5]);
    expect(tickValues(1, 4, 0)).toEqual([1, 4]);
  });
});
