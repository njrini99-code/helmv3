import { describe, it, expect } from 'vitest';
import { widthPct, stepConversion } from '../funnel-math';

describe('widthPct', () => {
  it('returns 0 when sent is 0 (zero-sent guard)', () => {
    expect(widthPct(0, 0)).toBe(0);
    expect(widthPct(5, 0)).toBe(0);
  });

  it('computes value/sent as a percentage', () => {
    expect(widthPct(50, 100)).toBe(50);
    expect(widthPct(100, 100)).toBe(100);
    expect(widthPct(0, 100)).toBe(0);
  });

  it('clamps to 100 when a downstream stage exceeds sent', () => {
    // Resend's image-proxy prefetch can register a click without a
    // matching open, so clicked can exceed opened (or even sent, in
    // pathological cases) — the bar must never overflow past 100%.
    expect(widthPct(120, 100)).toBe(100);
  });

  it('clamps negative results to 0', () => {
    expect(widthPct(-10, 100)).toBe(0);
  });

  it('treats a negative sent as the zero-sent guard', () => {
    expect(widthPct(10, -5)).toBe(0);
  });
});

describe('stepConversion', () => {
  it('returns null for the first bar (no previous stage)', () => {
    expect(stepConversion(100, null)).toBeNull();
  });

  it('returns null when the previous stage is 0', () => {
    expect(stepConversion(10, 0)).toBeNull();
  });

  it('computes value/previous as a rounded percentage', () => {
    expect(stepConversion(50, 100)).toBe(50);
    expect(stepConversion(1, 3)).toBe(33);
    expect(stepConversion(2, 3)).toBe(67);
  });

  it('allows conversions above 100% (clicked exceeding opened)', () => {
    expect(stepConversion(120, 100)).toBe(120);
  });
});
