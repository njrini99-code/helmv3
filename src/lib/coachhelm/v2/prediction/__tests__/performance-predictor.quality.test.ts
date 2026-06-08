import { describe, it, expect } from 'vitest';
import {
  clampPatternAdjustment,
  bracketEstimate,
  PATTERN_ADJ_CI_FRACTION,
  isStale,
  STALENESS_DAYS,
  ciMultiplier,
  describeFactor,
} from '../performance-predictor';

describe('clampPatternAdjustment', () => {
  it('caps the pattern term at a fraction of the CI half-width', () => {
    const cap = 6 * PATTERN_ADJ_CI_FRACTION;
    expect(clampPatternAdjustment(99, 6)).toBeCloseTo(cap, 5);
    expect(clampPatternAdjustment(-99, 6)).toBeCloseTo(-cap, 5);
  });
  it('passes small adjustments through unchanged', () => {
    expect(clampPatternAdjustment(0.4, 6)).toBeCloseTo(0.4, 5);
  });
  it('is zero when the CI has zero width (no basis to add pattern signal)', () => {
    expect(clampPatternAdjustment(5, 0)).toBe(0);
  });
});

describe('bracketEstimate', () => {
  it('keeps the point estimate inside [low, high]', () => {
    expect(bracketEstimate(12, -2, 6)).toBe(6);
    expect(bracketEstimate(-9, -2, 6)).toBe(-2);
    expect(bracketEstimate(3, -2, 6)).toBe(3);
  });
});

describe('staleness gate', () => {
  it('refuses to predict when the most recent round is older than 21 days', () => {
    expect(STALENESS_DAYS).toBe(21);
    expect(isStale(22)).toBe(true);
    expect(isStale(21)).toBe(false);
    expect(isStale(3)).toBe(false);
  });
});

describe('ciMultiplier — small-sample widening', () => {
  it('widens the interval for small samples vs the asymptotic 1.28', () => {
    expect(ciMultiplier(5)).toBeGreaterThan(1.28);
    expect(ciMultiplier(30)).toBeCloseTo(1.28, 1);
  });
  it('is monotonically non-increasing as sample size grows', () => {
    expect(ciMultiplier(5)).toBeGreaterThanOrEqual(ciMultiplier(10));
    expect(ciMultiplier(10)).toBeGreaterThanOrEqual(ciMultiplier(30));
  });
});

describe('describeFactor — names the actual driver', () => {
  const features = {
    temporal: { recentFormScore: -0.8, daysSinceLastRound: 9 },
  } as unknown as Parameters<typeof describeFactor>[2];

  it('recent-form driver cites the form score and direction', () => {
    const d = describeFactor('recentForm', -1.2, features);
    expect(d.explanation).toMatch(/last 5 rounds/i);
    expect(d.explanation).toMatch(/below|better|sharper/i);
  });
  it('rest/rust driver cites the actual days off', () => {
    const d = describeFactor('restRust', 0.4, features);
    expect(d.explanation).toContain('9');
  });
  it('never returns the generic "Contributing factor" string', () => {
    const d = describeFactor('patterns', 0.6, features);
    expect(d.explanation).not.toBe('Contributing factor');
  });
});
