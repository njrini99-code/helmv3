/**
 * Counterfactual cap + cohort-plausibility tests (audit CF-1/CF-2, DC-COHORT-1).
 *
 * CF-1/CF-2: every projection is clamped to a per-metric ceiling so a single
 * leak can't claim a double-digit stroke recovery (the factor-10 par-4 family
 * and the slow-to-close pressure deltas carry the tightest caps).
 *
 * DC-COHORT-1: an implausible COHORT `level_avg` (synthetic-data artifact) is
 * rejected as a counterfactual target and the gap falls back to Tour pga_value.
 */
import { describe, it, expect } from 'vitest';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';
import {
  COUNTERFACTUAL_MAX_STROKES_PER_ROUND,
} from '@/lib/coachhelm/v3/counterfactual/types';
import {
  getCounterfactualConfig,
  getCounterfactualCeiling,
} from '@/lib/coachhelm/v3/counterfactual/lookup-tables';

describe('computeCounterfactual — per-projection clamp (CF-1/CF-2)', () => {
  it('caps the par-4 factor-10 family at its tight per-metric ceiling', () => {
    // lower_better, factor 10: a 1.0-stroke gap → raw 10 strokes/round.
    const r = computeCounterfactual({
      metric_id: 'scoring_par_4',
      direction: 'lower_better',
      player_value: 5.0,
      pga_value: 4.0,
      cohort_value: null,
      player_30d_scoring_avg: 78,
    });
    const ceiling = getCounterfactualCeiling(getCounterfactualConfig('scoring_par_4')!);
    expect(ceiling).toBe(1.5);
    expect(r.strokes_saved_per_round).toBe(ceiling);
    expect(r.clamped).toBe(true);
    // projected score uses the capped value, not the raw 10.
    expect(r.projected_score_if_closed).toBeCloseTo(78 - ceiling);
  });

  it('caps no metric above the global default ceiling', () => {
    // A huge GIR gap (default ceiling applies): 0.09/pp × 100pp = 9 raw.
    const r = computeCounterfactual({
      metric_id: 'gir_pct',
      direction: 'higher_better',
      player_value: 0,
      pga_value: 100,
      cohort_value: null,
      player_30d_scoring_avg: 80,
    });
    expect(r.strokes_saved_per_round).toBe(COUNTERFACTUAL_MAX_STROKES_PER_ROUND);
    expect(r.clamped).toBe(true);
  });

  it('tightly caps the slow-to-close pressure delta', () => {
    // practice_tournament_delta factor 0.5, ceiling 1.0: a 6-stroke gap → raw 3.
    const r = computeCounterfactual({
      metric_id: 'practice_tournament_delta',
      direction: 'lower_better',
      player_value: 6,
      pga_value: 0,
      cohort_value: null,
      player_30d_scoring_avg: 76,
    });
    expect(r.strokes_saved_per_round).toBe(1.0);
    expect(r.clamped).toBe(true);
  });

  it('leaves an in-range projection unclamped', () => {
    // scrambling factor 0.03: a 10pp gap → 0.30 strokes/round, well under cap.
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 40,
      cohort_value: null,
      player_30d_scoring_avg: 75,
    });
    expect(r.suppressed).toBe(false);
    expect(r.clamped).toBe(false);
    expect(r.strokes_saved_per_round).toBeCloseTo(0.3);
  });
});

describe('computeCounterfactual — cohort plausibility fallback (DC-COHORT-1)', () => {
  it('rejects an implausibly-low sg_putting cohort and falls back to Tour', () => {
    // Cohort sg_putting −3.94 (synthetic artifact, below the −1.0 floor).
    // Player at −0.5 is "above" that bad cohort → would suppress (no_gap)
    // if the cohort were trusted. Falling back to Tour (0.5) yields a real gap.
    const implausible = computeCounterfactual({
      metric_id: 'sg_putting',
      direction: 'higher_better',
      player_value: -0.5,
      pga_value: 0.5,
      cohort_value: -3.94,
      player_30d_scoring_avg: 74,
    });
    const tourOnly = computeCounterfactual({
      metric_id: 'sg_putting',
      direction: 'higher_better',
      player_value: -0.5,
      pga_value: 0.5,
      cohort_value: null,
      player_30d_scoring_avg: 74,
    });
    expect(implausible.suppressed).toBe(false);
    expect(implausible.strokes_saved_per_round).toBeCloseTo(
      tourOnly.strokes_saved_per_round,
    );
  });

  it('rejects a sand-save cohort below 25% and falls back to Tour', () => {
    // Cohort sand-save 14.8% (below the 25% floor). Player at 30% is above it
    // → trusting the cohort suppresses. Tour (40%) keeps the real gap.
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 40,
      cohort_value: 14.8,
      player_30d_scoring_avg: 75,
    });
    expect(r.suppressed).toBe(false);
    expect(r.strokes_saved_per_round).toBeCloseTo((40 - 30) * 0.03);
  });

  it('rejects a proximity cohort better (tighter) than Tour', () => {
    // lower_better feet: cohort 15ft is tighter than the Tour 19ft — impossible
    // for a college cohort. Fall back to Tour, gapping player 32 → 19.
    const r = computeCounterfactual({
      metric_id: 'approach_proximity_50_125ft',
      direction: 'lower_better',
      player_value: 32,
      pga_value: 19,
      cohort_value: 15,
      player_30d_scoring_avg: 75,
    });
    const tourOnly = computeCounterfactual({
      metric_id: 'approach_proximity_50_125ft',
      direction: 'lower_better',
      player_value: 32,
      pga_value: 19,
      cohort_value: null,
      player_30d_scoring_avg: 75,
    });
    expect(r.strokes_saved_per_round).toBeCloseTo(tourOnly.strokes_saved_per_round);
  });

  it('still trusts a plausible cohort (smaller realistic gap preserved)', () => {
    // Cohort sand-save 40% is in-band → smaller gap than Tour 50%.
    const cohort = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 50,
      cohort_value: 40,
      player_30d_scoring_avg: 75,
    });
    const tour = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 50,
      cohort_value: null,
      player_30d_scoring_avg: 75,
    });
    expect(cohort.strokes_saved_per_round).toBeLessThan(tour.strokes_saved_per_round);
    expect(cohort.strokes_saved_per_round).toBeGreaterThan(0);
  });

  it('keeps the existing 0.3 lower suppression after cohort fallback', () => {
    // Tour fallback yields a tiny gap → still suppressed below_threshold.
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 47,
      pga_value: 50,
      cohort_value: 10, // implausible → rejected → Tour fallback
      player_30d_scoring_avg: 75,
    });
    // gap to Tour = 3pp × 0.03 = 0.09 < 0.3
    expect(r.suppressed).toBe(true);
    expect(r.suppress_reason).toBe('below_threshold');
  });
});
