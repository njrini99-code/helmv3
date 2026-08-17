/**
 * `anomaly-detector.ts` had no test naming any of its exports, and it is live
 * on a coach-visible path:
 *
 *   src/app/golf/actions/coachhelm-data.ts:680  detectAnomalies(...)
 *   src/app/golf/actions/coachhelm-data.ts:683  calculateVolatility(...)
 *   src/lib/coachhelm/v2/orchestrator.ts:572    detectAnomalies(...)
 *
 * That combination — statistics, live, untested — is the worst case for silent
 * wrongness, because a wrong number looks exactly like a right one. Nothing
 * downstream can tell that a z-score was computed against the wrong divisor.
 *
 * Every expectation below is hand-computed from the definition rather than
 * captured from the implementation, so these are known-answer tests: if someone
 * swaps population for sample variance, or shifts the quartile interpolation,
 * these fail rather than re-baselining to the new behaviour.
 *
 * Filed as part of #1481.
 */
import { describe, it, expect } from 'vitest';
import {
  detectAnomalies,
  detectIQRAnomalies,
  calculateVolatility,
  detectSlopeChange,
} from '@/lib/coachhelm/v2/stats/anomaly-detector';
import type { BaselineMetric } from '@/lib/coachhelm/v2/stats/baselines';

function baseline(over: Partial<BaselineMetric> = {}): BaselineMetric {
  return { ewma: 0, mean: 0, stdDev: 1, trend: 0, volatility: 0, sampleSize: 20, ...over };
}

describe('detectIQRAnomalies', () => {
  /**
   * Hand-computed on [1..9, 100], n = 10, using linear interpolation between
   * order statistics (numpy default / R type 7), which is what
   * `percentileValue` implements:
   *
   *   q1: idx = 0.25 * 9 = 2.25 → 3 + 0.25*(4-3) = 3.25
   *   q3: idx = 0.75 * 9 = 6.75 → 7 + 0.75*(8-7) = 7.75
   *   iqr = 4.5, fences = 3.25 - 6.75 = -3.5 and 7.75 + 6.75 = 14.5
   */
  it('computes interpolated quartiles and flags only beyond the 1.5x fences', () => {
    const r = detectIQRAnomalies([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(r.q1).toBeCloseTo(3.25, 10);
    expect(r.q3).toBeCloseTo(7.75, 10);
    expect(r.iqr).toBeCloseTo(4.5, 10);
    expect(r.outliers).toEqual([100]);
  });

  it('reports zero IQR for a constant series and finds no outliers', () => {
    const r = detectIQRAnomalies([5, 5, 5, 5, 5]);
    expect(r.iqr).toBe(0);
    expect(r.outliers).toEqual([]);
  });

  it('is order-independent — the input need not be sorted', () => {
    const sorted = detectIQRAnomalies([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    const shuffled = detectIQRAnomalies([100, 5, 1, 9, 3, 7, 2, 8, 4, 6]);
    expect(shuffled.q1).toBeCloseTo(sorted.q1, 10);
    expect(shuffled.q3).toBeCloseTo(sorted.q3, 10);
    expect(shuffled.outliers).toEqual(sorted.outliers);
  });

  it('handles the empty set without throwing', () => {
    expect(detectIQRAnomalies([])).toEqual({ outliers: [], q1: 0, q3: 0, iqr: 0 });
  });
});

describe('calculateVolatility', () => {
  /**
   * [2,4,4,4,5,5,7,9] is the canonical population-stdDev example: mean 5,
   * squared deviations sum to 32, /8 = 4, sqrt = 2.
   *
   * Recent window (last 5) is [4,5,5,7,9]: mean 6, squared deviations sum to
   * 16, /5 = 3.2, sqrt = 1.78885…
   */
  it('uses POPULATION standard deviation (divide by n, not n-1)', () => {
    const v = calculateVolatility([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(v.historical).toBeCloseTo(2, 10);
    expect(v.current).toBeCloseTo(Math.sqrt(3.2), 10);
    expect(v.ratio).toBeCloseTo(Math.sqrt(3.2) / 2, 10);
    expect(v.isElevated).toBe(false);
  });

  it('flags elevated only past a 1.5x ratio', () => {
    // Calm early, wild late — recent spread must exceed the whole-series spread
    // by more than half again.
    const spiky = calculateVolatility([5, 5, 5, 5, 5, 5, 5, 5, 0, 10], 2);
    expect(spiky.ratio).toBeGreaterThan(1.5);
    expect(spiky.isElevated).toBe(true);
  });

  it('returns a neutral reading rather than dividing by zero on a flat series', () => {
    const flat = calculateVolatility([3, 3, 3, 3, 3, 3]);
    expect(flat.historical).toBe(0);
    expect(flat.ratio).toBe(1);
    expect(flat.isElevated).toBe(false);
  });

  it('cannot report elevation when the window covers the whole series', () => {
    // windowSize >= length ⇒ current === historical ⇒ ratio exactly 1. Worth
    // pinning: this is "not enough data to say", and it must not read as a
    // spike.
    const v = calculateVolatility([1, 9, 2, 8], 10);
    expect(v.ratio).toBe(1);
    expect(v.isElevated).toBe(false);
  });

  it('degrades safely below two points', () => {
    expect(calculateVolatility([])).toEqual({ current: 0, historical: 0, ratio: 1, isElevated: false });
    expect(calculateVolatility([4])).toEqual({ current: 0, historical: 0, ratio: 1, isElevated: false });
  });
});

describe('detectAnomalies', () => {
  it('scores the LATEST value against the baseline, not the extreme one', () => {
    // 40 is the largest value but 2 is last; the z-score must describe 2.
    const out = detectAnomalies([40, 1, 2], baseline({ ewma: 0, stdDev: 1 }), 'scoreToPar');
    const z = out.find((a) => a.type === 'zscore');
    expect(z?.value).toBe(2);
    expect(z?.deviation).toBeCloseTo(2, 10);
  });

  it('grades severity at the 1.5 / 2 / 3 sigma boundaries', () => {
    const sev = (latest: number) =>
      detectAnomalies([0, 0, 0, latest], baseline({ ewma: 0, stdDev: 1 }), 'm')
        .find((a) => a.type === 'zscore')?.severity;
    expect(sev(1.4)).toBeUndefined(); // below 1.5 → not an anomaly at all
    expect(sev(1.6)).toBe('low');
    expect(sev(2.5)).toBe('medium');
    expect(sev(3.5)).toBe('high');
  });

  it('detects a drop as readily as a spike', () => {
    const out = detectAnomalies([0, 0, 0, -4], baseline({ ewma: 0, stdDev: 1 }), 'm');
    const z = out.find((a) => a.type === 'zscore');
    expect(z?.deviation).toBeCloseTo(-4, 10);
    expect(z?.description).toContain('below');
  });

  it('emits nothing when the baseline has no spread to measure against', () => {
    // stdDev 0 would divide by zero; the guard must suppress, not emit Infinity.
    const out = detectAnomalies([0, 0, 99], baseline({ ewma: 0, stdDev: 0 }), 'm');
    expect(out.some((a) => a.type === 'zscore')).toBe(false);
    expect(out.every((a) => Number.isFinite(a.deviation))).toBe(true);
  });

  it('returns an empty list for no values', () => {
    expect(detectAnomalies([], baseline(), 'm')).toEqual([]);
  });
});

describe('detectSlopeChange', () => {
  it('refuses to guess without two full windows', () => {
    expect(detectSlopeChange([1, 2, 3, 4, 5], 3)).toBeNull();
  });

  it('finds the inflection where a rise turns into a fall', () => {
    // Up to index 4, then down.
    const r = detectSlopeChange([1, 2, 3, 4, 5, 4, 3, 2, 1], 3);
    expect(r).not.toBeNull();
    expect(r!.detected).toBe(true);
    expect(r!.oldSlope).toBeGreaterThan(0);
    expect(r!.newSlope).toBeLessThan(0);
  });

  it('returns null on a straight line — "no change" is null, never detected:false', () => {
    // Worth pinning because the shape invites a wrong assumption: the returned
    // `detected` field is ALWAYS true, since the function bails to null
    // whenever `maxDiff < 0.5`. A caller that reads `result.detected` without
    // first handling null will throw, and one that expects `detected: false`
    // for a flat series will never see it. I wrote that expectation myself
    // here and it failed — the contract is null-or-detected, nothing else.
    expect(detectSlopeChange([1, 2, 3, 4, 5, 6, 7, 8], 3)).toBeNull();
  });

  it('never returns detected:false in any branch', () => {
    const series: number[][] = [
      [1, 2, 3, 4, 5, 6, 7, 8], // straight
      [1, 2, 3, 4, 5, 4, 3, 2, 1], // inflection
      [5, 5, 5, 5, 5, 5], // flat
      [0, 10, 0, 10, 0, 10], // sawtooth
    ];
    for (const s of series) {
      const r = detectSlopeChange(s, 3);
      if (r !== null) expect(r.detected, JSON.stringify(s)).toBe(true);
    }
  });
});
