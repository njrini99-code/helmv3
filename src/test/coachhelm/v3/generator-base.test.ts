/**
 * Regression tests for the generator-base lifecycle backfill — the keystone of
 * the 2026-06-05 insight-engine audit (H2 + leverage-priority). The full run()
 * path needs DB mocks; these cover the two PURE decisions it delegates to.
 */
import { describe, it, expect } from 'vitest';
import {
  backfilledStrokesImpact,
  leveragePriorityFloor,
  computeMeasuredFactors,
} from '@/lib/coachhelm/v3/engine/generator-base';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';

function cf(over: Partial<CounterfactualProjection>): CounterfactualProjection {
  return {
    current_baseline_score: 75,
    projected_score_if_closed: 74,
    strokes_saved_per_round: 1.0,
    weeks_to_typical_close: 4,
    suppressed: false,
    ...over,
  };
}

describe('backfilledStrokesImpact', () => {
  it('uses the counterfactual per-round value when live (generators stamp 0)', () => {
    expect(backfilledStrokesImpact(0, cf({ strokes_saved_per_round: 0.8 }))).toBe(0.8);
  });

  it('keeps the composed value when the counterfactual is suppressed', () => {
    expect(backfilledStrokesImpact(0, cf({ suppressed: true, strokes_saved_per_round: 0.8 }))).toBe(0);
  });

  it('keeps the composed value when there is no counterfactual (diagnostic generator)', () => {
    expect(backfilledStrokesImpact(0, null)).toBe(0);
  });

  it('keeps the composed value when the projection is zero/non-positive', () => {
    expect(backfilledStrokesImpact(0.3, cf({ strokes_saved_per_round: 0 }))).toBe(0.3);
  });

  it('ignores a non-finite projection', () => {
    expect(backfilledStrokesImpact(0, cf({ strokes_saved_per_round: NaN }))).toBe(0);
  });
});

describe('leveragePriorityFloor (upgrade-only)', () => {
  it('floors a descriptive low insight to high when ≥1.0 strokes/round', () => {
    expect(leveragePriorityFloor('low', cf({ strokes_saved_per_round: 1.2 }))).toBe('high');
  });

  it('floors to medium between 0.5 and 1.0', () => {
    expect(leveragePriorityFloor('low', cf({ strokes_saved_per_round: 0.6 }))).toBe('medium');
  });

  it('leaves low alone below 0.5', () => {
    expect(leveragePriorityFloor('low', cf({ strokes_saved_per_round: 0.4 }))).toBe('low');
  });

  it('never downgrades an already-higher priority', () => {
    expect(leveragePriorityFloor('urgent', cf({ strokes_saved_per_round: 0.6 }))).toBe('urgent');
    expect(leveragePriorityFloor('high', cf({ strokes_saved_per_round: 0.6 }))).toBe('high');
  });

  it('does not touch priority when the counterfactual is suppressed or absent', () => {
    expect(leveragePriorityFloor('low', cf({ suppressed: true }))).toBe('low');
    expect(leveragePriorityFloor('low', null)).toBe('low');
  });
});

describe('computeMeasuredFactors (SV-1 — real recency/variance, no fabrication)', () => {
  const NOW = Date.parse('2026-06-06T00:00:00Z');
  const daysAgo = (n: number) => new Date(NOW - n * 86400_000).toISOString();

  it('returns null unless BOTH a real stddev and ≥1 round date are present', () => {
    expect(computeMeasuredFactors(undefined, 30, NOW)).toBeNull();
    expect(computeMeasuredFactors({}, 30, NOW)).toBeNull();
    expect(computeMeasuredFactors({ round_dates: [] }, 30, NOW)).toBeNull();
    expect(computeMeasuredFactors({ stddev: 4 }, 30, NOW)).toBeNull(); // no dates
    expect(computeMeasuredFactors({ round_dates: [daysAgo(1)] }, 30, NOW)).toBeNull(); // no stddev
    expect(computeMeasuredFactors({ stddev: NaN, round_dates: [daysAgo(1)] }, 30, NOW)).toBeNull();
  });

  it('maps a tight stddev to high variance-confidence and flags measured', () => {
    // 4yd spread on the default 20 scale → 1 - 4/20 = 0.8; one fresh round → recency 1
    expect(computeMeasuredFactors({ stddev: 4, round_dates: [daysAgo(1)] }, 30, NOW)).toEqual({
      recency: 1,
      variance: 0.8,
      factors_measured: true,
    });
  });

  it('maps a loose stddev to low variance-confidence (clamped at 0)', () => {
    expect(
      computeMeasuredFactors({ stddev: 40, round_dates: [daysAgo(1)] }, 30, NOW)?.variance,
    ).toBe(0);
  });

  it('honors a custom stddev_scale', () => {
    // 5 spread on a 10 scale → 0.5
    expect(
      computeMeasuredFactors({ stddev: 5, stddev_scale: 10, round_dates: [daysAgo(1)] }, 30, NOW)
        ?.variance,
    ).toBe(0.5);
  });

  it('computes recency as the share of rounds inside the freshness half-window', () => {
    // window 30 → half-window 15 days. 3 of 4 rounds within 15d.
    const r = computeMeasuredFactors(
      { stddev: 4, round_dates: [daysAgo(1), daysAgo(5), daysAgo(14), daysAgo(28)] },
      30,
      NOW,
    );
    expect(r?.recency).toBeCloseTo(3 / 4);
    expect(r?.variance).toBe(0.8);
    expect(r?.factors_measured).toBe(true);
  });

  it('ignores unparseable round dates', () => {
    const r = computeMeasuredFactors(
      { stddev: 4, round_dates: ['not-a-date', daysAgo(2)] },
      30,
      NOW,
    );
    expect(r?.recency).toBe(1); // the single valid date is fresh
  });
});
