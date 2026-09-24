/**
 * utils.ts — Package 11 (#1933 bug, confirmed present on main, fixed here).
 * Card/Hero/Inline all call toScalePct/formatValue with no NaN guard
 * beforehand; a NaN input used to print the literal string "NaN%" and
 * drive a marker to `left: NaN%`.
 */
import { describe, expect, it } from 'vitest';

import { fitScale, formatValue, toScalePct } from './utils';

describe('toScalePct — NaN guard', () => {
  it('returns 0 instead of NaN for a NaN value', () => {
    expect(toScalePct(Number.NaN, { min: 0, max: 100 })).toBe(0);
  });

  it('still clamps ±Infinity to the rail edge (unchanged, pre-existing, correct behavior)', () => {
    // Math.max/Math.min already clamp a genuinely extreme value to 0/100 —
    // only NaN needed a guard, so this scoped fix must not touch Infinity.
    expect(toScalePct(Number.POSITIVE_INFINITY, { min: 0, max: 100 })).toBe(100);
    expect(toScalePct(Number.NEGATIVE_INFINITY, { min: 0, max: 100 })).toBe(0);
  });

  it('still computes normally for a finite value', () => {
    expect(toScalePct(50, { min: 0, max: 100 })).toBe(50);
  });
});

describe('formatValue — non-finite guard', () => {
  it('renders an em dash instead of "NaN%" for a NaN percent value', () => {
    expect(formatValue(Number.NaN, 'percent')).toBe('—');
  });

  it('renders an em dash instead of "NaNyd"/"Infinity yd" for a non-finite yards value', () => {
    expect(formatValue(Number.POSITIVE_INFINITY, 'yards')).toBe('—');
  });

  it('still formats normally for a finite value', () => {
    expect(formatValue(64.6, 'percent')).toBe('65%');
  });
});

describe('fitScale', () => {
  const sg = { min: -1.5, max: 1.5 };

  it('keeps the default scale when every value fits', () => {
    expect(fitScale(sg, [-0.8, 0.2, 0])).toBe(sg);
  });

  it('grows a zero-centred scale so an off-range value is not pinned to the edge', () => {
    const scale = fitScale(sg, [-2.93, -1.6, 0]);
    expect(scale).toEqual({ min: -3.5, max: 3.5 });
    const you = toScalePct(-2.93, scale);
    const team = toScalePct(-1.6, scale);
    expect(you).toBeGreaterThan(0);
    expect(team - you).toBeGreaterThan(15);
    expect(toScalePct(0, scale)).toBe(50);
  });

  it('pads a one-sided scale on the side that overflows', () => {
    const scale = fitScale({ min: 60, max: 100 }, [48, null, Number.NaN]);
    expect(scale.max).toBe(100);
    expect(scale.min).toBeLessThan(48);
  });
});
