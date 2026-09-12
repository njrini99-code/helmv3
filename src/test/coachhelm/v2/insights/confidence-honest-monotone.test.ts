/**
 * Honest-mode confidence must be a monotone function of freshness.
 *
 * Production reproduction (2026-09-12): with sample_adequacy 0.24 and
 * factors_measured=false the shipped formula returned 0.24 at recency 1.0
 * but 0.56 at recency 0.99 — losing a little freshness more than DOUBLED the
 * score because the implementation switched formulas at recency < 1. 41 of
 * the 208 tentative rows above the 0.4 floor cleared it only through that
 * jump. These fixtures pin the contract: recency 1 → exactly sample
 * adequacy; less freshness never means more confidence; no discontinuity.
 */
import { describe, expect, it } from 'vitest';
import { calcConfidence } from '@/lib/coachhelm/v2/insights/types';

function honest(sample_adequacy: number, recency: number) {
  return calcConfidence({
    confidence_factors: { sample_adequacy, recency, variance: 0.5, factors_measured: false },
  });
}

describe('calcConfidence honest mode (factors_measured === false)', () => {
  it('equals sample adequacy exactly when the evidence is fully fresh', () => {
    for (const sa of [0, 0.1, 0.24, 0.4, 0.75, 1]) {
      expect(honest(sa, 1)).toBe(sa);
    }
  });

  it('never increases as the same evidence gets older', () => {
    const recencies = [1, 0.999, 0.99, 0.9, 0.75, 0.5, 0.25, 0.1, 0];
    for (const sa of [0.24, 0.4, 0.6, 1]) {
      const scores = recencies.map((r) => honest(sa, r));
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]!);
      }
    }
  });

  it('has no jump at the recency=1 boundary (the shipped 0.24 → 0.56 defect)', () => {
    expect(honest(0.24, 0.99)).toBeLessThan(0.3);
    expect(Math.abs(honest(0.24, 0.999) - honest(0.24, 1))).toBeLessThan(0.01);
  });

  it('clamps inputs so an over-adequate sample cannot exceed 1', () => {
    expect(honest(1.6, 1)).toBe(1);
    expect(honest(1.6, 0.5)).toBeLessThanOrEqual(1);
  });

  it('leaves the legacy blend and the measured blend unchanged', () => {
    const legacy = calcConfidence({
      confidence_factors: { sample_adequacy: 0.5, recency: 0.8, variance: 0.6 },
    });
    expect(legacy).toBeCloseTo(0.4 * 0.5 + 0.3 * 0.8 + 0.3 * 0.6, 10);
    const measured = calcConfidence({
      confidence_factors: { sample_adequacy: 0.5, recency: 0.8, variance: 0.6, factors_measured: true },
    });
    expect(measured).toBeCloseTo(0.4 * 0.5 + 0.3 * 0.8 + 0.3 * 0.6, 10);
  });
});
