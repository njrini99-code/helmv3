import { describe, expect, it } from 'vitest';
import { confidenceLabel, confidenceTier } from './confidence-label';

describe('confidenceLabel', () => {
  it('never prints a percentage', () => {
    for (const c of [0, 0.1, 0.39, 0.4, 0.69, 0.7, 1, 100]) {
      expect(confidenceLabel(c, 8) ?? '').not.toMatch(/%/);
    }
  });

  it('maps the min(n/30, 1) ramp onto three words', () => {
    // 30+ putts → confidence 1 → used to read "100% confidence".
    expect(confidenceLabel(1)).toBe('Solid read');
    expect(confidenceLabel(0.7)).toBe('Solid read');
    expect(confidenceLabel(0.5)).toBe('Early read');
    expect(confidenceLabel(8 / 30, 8)).toBe('Thin read, n=8');
  });

  it('shows n only on a thin read', () => {
    expect(confidenceLabel(1, 44)).toBe('Solid read');
    expect(confidenceLabel(0.2)).toBe('Thin read');
  });

  it('accepts 0..100 input and rejects non-finite', () => {
    expect(confidenceTier(78)).toBe('solid');
    expect(confidenceTier(Number.NaN)).toBeNull();
    expect(confidenceLabel(null)).toBeNull();
  });
});
