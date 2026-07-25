/**
 * ============================================================================
 * computeSeriesTrend — regression coverage for AUDIT-0724 findings #2/#6/#7
 * ----------------------------------------------------------------------------
 * Locks in the ONE split-half-average algorithm (see seriesTrend.ts header
 * for the full justification) so Sparkline color and MetricCard delta-chip
 * tone can never again be computed two different ways off the same series.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { computeSeriesTrend } from './seriesTrend';

describe('computeSeriesTrend', () => {
  it('finding #2 — Coach GIR% [61,78,72,50,61]: reads declining, magnitude -8.5 (not "flat")', () => {
    // The old endpoint-diff read this as flat (61 -> 61, delta 0) while the
    // dashboard's own delta chip (split-half average) read it as a real
    // -8.5 decline — this is the case that produced the contradiction.
    const t = computeSeriesTrend([61, 78, 72, 50, 61], { goodDirection: 'up' });
    expect(t).not.toBeNull();
    expect(t!.value).toBeCloseTo(-8.5, 5);
    expect(t!.direction).toBe('declining');
    expect(t!.points).toBe(5);
  });

  it('finding #6 — Player Putts/Rd [32,38,32,33,35]: reads improving (lower is better), not declining', () => {
    // Endpoint diff (35-32=+3, worse) and split-half avg (33.33 vs 35.0,
    // better) flipped SIGN on this exact array — this locks in split-half.
    const t = computeSeriesTrend([32, 38, 32, 33, 35], { goodDirection: 'down' });
    expect(t).not.toBeNull();
    expect(t!.value).toBeCloseTo(-1.66667, 4);
    expect(t!.direction).toBe('improving');
    expect(t!.points).toBe(5);
  });

  it('requires >= minPoints (default 3) finite points — never a confident verdict off a shaky sample', () => {
    expect(computeSeriesTrend([61, 61])).toBeNull();
    expect(computeSeriesTrend([61])).toBeNull();
    expect(computeSeriesTrend([])).toBeNull();
    expect(computeSeriesTrend(undefined)).toBeNull();
    expect(computeSeriesTrend(null)).toBeNull();
  });

  it('drops non-finite entries before counting points toward the minimum', () => {
    const t = computeSeriesTrend([61, Number.NaN, 72, 50, 61], { goodDirection: 'up' });
    expect(t).not.toBeNull();
    expect(t!.points).toBe(4);
  });

  it('a magnitude below flatThreshold reads flat even with a nonzero split-half delta (#2 "consider a threshold")', () => {
    const t = computeSeriesTrend([70, 70, 71, 71, 71], { goodDirection: 'up', flatThreshold: 5 });
    expect(t).not.toBeNull();
    expect(t!.value).toBeCloseTo(1, 5);
    expect(t!.direction).toBe('flat');
  });

  it('goodDirection="down": a falling split-half average is improving, a rising one is declining', () => {
    expect(
      computeSeriesTrend([80, 80, 70, 70, 70], { goodDirection: 'down' })!.direction,
    ).toBe('improving');
    expect(
      computeSeriesTrend([70, 70, 80, 80, 80], { goodDirection: 'down' })!.direction,
    ).toBe('declining');
  });

  it('minPoints is never allowed below 2 (a split needs at least one point per side)', () => {
    const t = computeSeriesTrend([10, 20], { minPoints: 1 });
    expect(t).not.toBeNull();
    expect(t!.points).toBe(2);
  });
});
