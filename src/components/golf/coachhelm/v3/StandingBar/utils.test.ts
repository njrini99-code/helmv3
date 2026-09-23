/**
 * utils.ts — Package 11 (#1933 bug, confirmed present on main, fixed here).
 * Card/Hero/Inline all call toScalePct/formatValue with no NaN guard
 * beforehand; a NaN input used to print the literal string "NaN%" and
 * drive a marker to `left: NaN%`.
 */
import { describe, expect, it } from 'vitest';

import { formatValue, toScalePct } from './utils';

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
