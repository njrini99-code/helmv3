import { describe, expect, it } from 'vitest';
import { niceAxis, computeTrendYDomain } from './TrendChart';

/** Every gap between consecutive ticks, rounded past binary noise. */
function gaps(ticks: number[]): number[] {
  return ticks.slice(1).map((t, i) => Number((t - ticks[i]!).toFixed(6)));
}

describe('niceAxis', () => {
  it('produces UNIFORMLY spaced ticks — the actual M7 defect', () => {
    // The audit measured gridlines at 80.8 / 79.4 / 76.4 / 73.4 / 70.4:
    // gaps of 1.4, 3.0, 3.0, 3.0. The top band was half the others, so the
    // axis silently misreported distance.
    const { ticks } = niceAxis(70.4, 80.8);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    const g = gaps(ticks);
    expect(new Set(g).size).toBe(1);
  });

  it('lands on round numbers, not raw data bounds', () => {
    const { min, max, step } = niceAxis(70.4, 80.8);
    expect(Number.isInteger(min / step)).toBe(true);
    expect(Number.isInteger(max / step)).toBe(true);
  });

  it('always contains the requested range', () => {
    for (const [lo, hi] of [
      [70.4, 80.8],
      [0.13, 0.87],
      [-4.4, 2.1],
      [1000, 1003],
    ] as const) {
      const { min, max } = niceAxis(lo, hi);
      expect(min).toBeLessThanOrEqual(lo);
      expect(max).toBeGreaterThanOrEqual(hi);
    }
  });

  it('does not print binary noise', () => {
    const { ticks } = niceAxis(0.13, 0.87);
    for (const t of ticks) {
      expect(String(t)).not.toMatch(/\d{8,}/);
    }
  });

  it('degrades honestly on a nonsense range', () => {
    expect(niceAxis(5, 5).ticks).toEqual([]);
    expect(niceAxis(NaN, 3).ticks).toEqual([]);
  });
});

describe('computeTrendYDomain', () => {
  it('returns a snapped domain rather than raw padded decimals', () => {
    const d = computeTrendYDomain([74, 75.2, 76.4, 73.1]);
    expect(d).toBeDefined();
    const { step } = niceAxis(d![0], d![1]);
    expect(Number.isInteger(d![0] / step)).toBe(true);
    expect(Number.isInteger(d![1] / step)).toBe(true);
  });

  it('still contains every value AND the benchmark', () => {
    const values = [74, 75.2, 76.4, 73.1];
    const d = computeTrendYDomain(values, 71.5)!;
    for (const v of [...values, 71.5]) {
      expect(v).toBeGreaterThanOrEqual(d[0]);
      expect(v).toBeLessThanOrEqual(d[1]);
    }
  });

  it('never floors a high narrow band at zero', () => {
    // The whole reason this function exists — Recharts' [0, 'auto'] default
    // pinned a 74-77 series to the top of a 0-80 axis.
    const d = computeTrendYDomain([74, 75, 76, 77])!;
    expect(d[0]).toBeGreaterThan(50);
  });

  it('returns undefined for an empty series', () => {
    expect(computeTrendYDomain([])).toBeUndefined();
    expect(computeTrendYDomain([NaN, Infinity])).toBeUndefined();
  });
});
