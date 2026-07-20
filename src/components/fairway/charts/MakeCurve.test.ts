/**
 * ============================================================================
 * MakeCurve — pure geometry/scale helper tests
 * ----------------------------------------------------------------------------
 * Covers the n→radius saturation curve, the sub-floor hollow-dot rule, the
 * null-pct line-run splitting (a real gap, never interpolated), the x/y
 * scale helpers.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import {
  MAKE_CURVE_MAX_RADIUS,
  MAKE_CURVE_MIN_RADIUS,
  MAKE_CURVE_SATURATION_N,
  MAKE_CURVE_SUB_FLOOR_N,
  computeLineRuns,
  dotRadiusForN,
  isHollowDot,
  xForIndex,
  yForPct,
} from './MakeCurve';

describe('dotRadiusForN', () => {
  it('null/undefined/non-finite/zero/negative n → the floor radius', () => {
    expect(dotRadiusForN(null)).toBe(MAKE_CURVE_MIN_RADIUS);
    expect(dotRadiusForN(undefined)).toBe(MAKE_CURVE_MIN_RADIUS);
    expect(dotRadiusForN(0)).toBe(MAKE_CURVE_MIN_RADIUS);
    expect(dotRadiusForN(-4)).toBe(MAKE_CURVE_MIN_RADIUS);
    expect(dotRadiusForN(Number.NaN)).toBe(MAKE_CURVE_MIN_RADIUS);
  });

  it('is monotonically non-decreasing as n grows', () => {
    const small = dotRadiusForN(2);
    const mid = dotRadiusForN(20);
    const big = dotRadiusForN(MAKE_CURVE_SATURATION_N);
    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(big);
  });

  it('saturates at MAKE_CURVE_MAX_RADIUS once n reaches the saturation point (never grows unbounded)', () => {
    expect(dotRadiusForN(MAKE_CURVE_SATURATION_N)).toBeCloseTo(MAKE_CURVE_MAX_RADIUS);
    expect(dotRadiusForN(MAKE_CURVE_SATURATION_N * 10)).toBeCloseTo(MAKE_CURVE_MAX_RADIUS);
  });

  it('a genuinely small sample renders visibly small (well under the max)', () => {
    expect(dotRadiusForN(1)).toBeLessThan(MAKE_CURVE_MAX_RADIUS * 0.6);
  });
});

describe('isHollowDot', () => {
  it('unknown n is hollow (never a confident fill for an unknown sample size)', () => {
    expect(isHollowDot(null)).toBe(true);
    expect(isHollowDot(undefined)).toBe(true);
  });

  it('below MAKE_CURVE_SUB_FLOOR_N is hollow; at/above it is filled', () => {
    expect(isHollowDot(MAKE_CURVE_SUB_FLOOR_N - 1)).toBe(true);
    expect(isHollowDot(MAKE_CURVE_SUB_FLOOR_N)).toBe(false);
    expect(isHollowDot(MAKE_CURVE_SUB_FLOOR_N + 20)).toBe(false);
  });
});

describe('computeLineRuns', () => {
  it('a fully populated series is ONE run covering every index', () => {
    const runs = computeLineRuns([{ pct: 10 }, { pct: 20 }, { pct: 30 }]);
    expect(runs).toEqual([[0, 1, 2]]);
  });

  it('a null in the middle splits into two runs — a real gap, never bridged', () => {
    const runs = computeLineRuns([{ pct: 40 }, { pct: null }, { pct: 60 }, { pct: 70 }]);
    expect(runs).toEqual([[0], [2, 3]]);
  });

  it('leading/trailing nulls are excluded from every run', () => {
    const runs = computeLineRuns([{ pct: null }, { pct: 50 }, { pct: null }]);
    expect(runs).toEqual([[1]]);
  });

  it('an all-null series produces no runs at all', () => {
    expect(computeLineRuns([{ pct: null }, { pct: null }])).toEqual([]);
  });
});

describe('xForIndex', () => {
  it('spreads indices evenly across the full inner width', () => {
    expect(xForIndex(0, 5, 400)).toBe(0);
    expect(xForIndex(4, 5, 400)).toBe(400);
    expect(xForIndex(2, 5, 400)).toBeCloseTo(200);
  });

  it('a single point centers rather than dividing by zero', () => {
    expect(xForIndex(0, 1, 400)).toBe(200);
  });
});

describe('yForPct', () => {
  it('100% maps to the top (y=0); 0% maps to the bottom (y=innerH)', () => {
    expect(yForPct(100, 200)).toBe(0);
    expect(yForPct(0, 200)).toBe(200);
  });

  it('clamps out-of-range pct into [0, 100] rather than drawing off-chart', () => {
    expect(yForPct(150, 200)).toBe(0);
    expect(yForPct(-20, 200)).toBe(200);
  });
});
