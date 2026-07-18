/**
 * ============================================================================
 * computeTrendYDomain — fit the y-axis to the data, not Recharts' `[0,'auto']`
 * ----------------------------------------------------------------------------
 * Bug (#950): the dashboard "Performance Trend" chart (a team scoring average
 * living in the 74-77 range) rendered on a 0-80 y-axis — Recharts' own
 * default `domain=[0,'auto']` floors every chart at zero, so a series that
 * never approaches zero collapses to a near-flat line pinned to the top,
 * ~85% dead space below it. `computeTrendYDomain` fits the axis to the
 * series' own min/max instead, with proportional padding.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { computeTrendYDomain } from './TrendChart';

describe('computeTrendYDomain', () => {
  it('returns undefined for an empty series (caller falls back to auto)', () => {
    expect(computeTrendYDomain([])).toBeUndefined();
  });

  it('pads a tight, far-from-zero band instead of flooring at 0 (the #950 case)', () => {
    const [min, max] = computeTrendYDomain([74, 75.5, 77, 76]) ?? [];
    expect(min).toBeGreaterThan(0);
    // The whole point: the axis floor sits close to the data, nowhere near 0.
    expect(min).toBeGreaterThan(60);
    expect(max).toBeLessThan(90);
    // Both ends still fully contain the series.
    expect(min).toBeLessThanOrEqual(74);
    expect(max).toBeGreaterThanOrEqual(77);
  });

  it('gives a single-point (or perfectly flat) series visible headroom, not a zero-height line', () => {
    const [min, max] = computeTrendYDomain([72, 72, 72]) ?? [];
    expect(max).toBeGreaterThan(min!);
    expect(min).toBeLessThan(72);
    expect(max).toBeGreaterThan(72);
  });

  it('extends the domain to cover a benchmark reference line, even if it falls outside the series', () => {
    const [min, max] = computeTrendYDomain([74, 75, 76], 50) ?? [];
    expect(min).toBeLessThanOrEqual(50);
    expect(max).toBeGreaterThanOrEqual(76);
  });

  it('ignores non-finite values (NaN/Infinity) rather than letting them blow up the domain', () => {
    const domain = computeTrendYDomain([74, Number.NaN, 76]);
    expect(domain).toBeDefined();
    const [min, max] = domain!;
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
  });
});
