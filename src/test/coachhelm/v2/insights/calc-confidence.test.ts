/**
 * SV-1 regression tests for calcConfidence honesty.
 *
 * The historical blend `0.4·sample + 0.3·recency + 0.3·variance` added a
 * fabricated +0.45 floor whenever generators stamped the recency=1.0 /
 * variance=0.5 placeholders. `factors_measured` makes that honest without
 * breaking the legacy (undefined) path that v2 miners + the lifecycle cron use.
 */
import { describe, it, expect } from 'vitest';
import { calcConfidence } from '@/lib/coachhelm/v2/insights/types';
import type { InsightConfidenceFactors } from '@/lib/coachhelm/v2/insights/types';

const factors = (f: Partial<InsightConfidenceFactors>): { confidence_factors: InsightConfidenceFactors } => ({
  confidence_factors: { sample_adequacy: 0.7, recency: 1.0, variance: 0.5, ...f },
});

describe('calcConfidence — legacy (factors_measured undefined)', () => {
  it('keeps the contract blend 0.4·sa + 0.3·rec + 0.3·var (backward-compatible)', () => {
    expect(calcConfidence(factors({ sample_adequacy: 1, recency: 0.5, variance: 0.5 }))).toBeCloseTo(
      0.4 * 1 + 0.3 * 0.5 + 0.3 * 0.5,
    );
  });

  it('reproduces the fabricated +0.45 floor on placeholders (the SV-1 bug, pre-flag)', () => {
    // sample 0.7 + placeholder recency 1.0 + placeholder variance 0.5
    expect(calcConfidence(factors({ sample_adequacy: 0.7 }))).toBeCloseTo(0.4 * 0.7 + 0.45);
  });
});

describe('calcConfidence — honest mode (factors_measured: false)', () => {
  it('collapses to sample-adequacy when recency/variance are flagged placeholders', () => {
    // No fabricated +0.45 — confidence == sample adequacy.
    expect(calcConfidence(factors({ sample_adequacy: 0.7, factors_measured: false }))).toBe(0.7);
  });

  it('does not inflate a small sample with the placeholder floor', () => {
    // 1 round / 30 target → 0.033 sample adequacy. Legacy would have read 0.478.
    expect(
      calcConfidence(factors({ sample_adequacy: 1 / 30, factors_measured: false })),
    ).toBeCloseTo(1 / 30);
  });

  it('clamps sample adequacy to 0..1', () => {
    expect(calcConfidence(factors({ sample_adequacy: 1.4, factors_measured: false }))).toBe(1);
    expect(calcConfidence(factors({ sample_adequacy: -0.2, factors_measured: false }))).toBe(0);
  });

  it('still honors a genuinely age-decayed recency (< 1) from the lifecycle cron', () => {
    // recency decayed to 0.4 by the cron; variance placeholder dropped.
    // (0.4·0.7 + 0.3·0.4) / 0.7 = 0.5714…
    expect(
      calcConfidence(factors({ sample_adequacy: 0.7, recency: 0.4, factors_measured: false })),
    ).toBeCloseTo((0.4 * 0.7 + 0.3 * 0.4) / 0.7);
  });

  it('a fresh row (recency 1.0) ignores the placeholder recency entirely', () => {
    expect(
      calcConfidence(factors({ sample_adequacy: 0.5, recency: 1.0, factors_measured: false })),
    ).toBe(0.5);
  });
});

describe('calcConfidence — fully measured (factors_measured: true)', () => {
  it('blends real factors identically to the legacy formula', () => {
    expect(
      calcConfidence(factors({ sample_adequacy: 0.8, recency: 0.9, variance: 0.7, factors_measured: true })),
    ).toBeCloseTo(0.4 * 0.8 + 0.3 * 0.9 + 0.3 * 0.7);
  });
});
