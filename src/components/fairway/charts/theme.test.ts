/**
 * ============================================================================
 * theme.ts — formatSigned never signs a value that rounds to zero
 * ----------------------------------------------------------------------------
 * Bug: `formatSigned` decided the sign from the RAW value's sign, then
 * rounded the magnitude separately. A hairline negative float (e.g. -1e-15,
 * the kind a "niced" d3/visx scale tick can produce right at the zero
 * benchmark) or any value too small to survive the requested decimal
 * precision rounded its magnitude down to "0" but STILL carried the minus
 * sign — rendering the nonsensical "−0.0" instead of an honest "0.0". This
 * showed up as a raw, unrounded-reading artifact on the StrokesGainedTornado
 * "impact chart" axis for small-magnitude data (audit W2).
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { formatSigned } from './theme';

describe('formatSigned — never signs a value that rounds to zero', () => {
  it('a hairline negative float that rounds to zero renders unsigned', () => {
    expect(formatSigned(-1e-15, 1)).toBe('0.0');
  });

  it('a hairline positive float that rounds to zero renders unsigned', () => {
    expect(formatSigned(1e-15, 1)).toBe('0.0');
  });

  it('a small negative value below the display precision renders unsigned', () => {
    // -0.0005 rounds to "0.0" at 1 decimal — must not print "−0.0".
    expect(formatSigned(-0.0005, 1)).toBe('0.0');
  });

  it('exact zero still renders unsigned', () => {
    expect(formatSigned(0, 2)).toBe('0.00');
  });

  it('genuine non-zero values keep their sign and precision (no regression)', () => {
    expect(formatSigned(4.1, 2)).toBe('+4.10');
    expect(formatSigned(-2.3, 2)).toBe('−2.30');
    expect(formatSigned(3, 0)).toBe('+3');
    expect(formatSigned(-3, 0)).toBe('−3');
  });
});
