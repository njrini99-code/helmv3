/**
 * Cohort-baseline counterfactual tests (2026-06-05 "smarter by context" build).
 *
 * The gap is measured to the college/division COHORT baseline (`cohort_value`)
 * when present, falling back to the Tour `pga_value` — so elite-amateur
 * weaknesses are sized realistically (domain doc §349 college-primary).
 */
import { describe, it, expect } from 'vitest';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';

describe('computeCounterfactual — cohort baseline', () => {
  it('falls back to pga_value when cohort_value is null (unchanged behavior)', () => {
    const withNull = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 50,
      cohort_value: null,
      player_30d_scoring_avg: 75,
    });
    const withoutField = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 30,
      pga_value: 50,
      player_30d_scoring_avg: 75,
    });
    expect(withNull.strokes_saved_per_round).toBeCloseTo(withoutField.strokes_saved_per_round);
  });

  it('uses the cohort baseline (smaller gap) over Tour when present', () => {
    // higher_better: player 30, college ~40, Tour 50. Gap to college (10) < gap to Tour (20).
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

  it('suppresses when the player is already at/above the cohort norm (no over-flagging)', () => {
    // player 45 > college 40 (higher_better) → no realistic gap, even though Tour is 50.
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 45,
      pga_value: 50,
      cohort_value: 40,
      player_30d_scoring_avg: 75,
    });
    expect(r.suppressed).toBe(true);
    expect(r.suppress_reason).toBe('no_gap');
  });

  it('handles lower_better metrics (proximity) against the cohort', () => {
    // lower_better: player 32ft, college 25ft, Tour 19ft. Gap to college = 7ft.
    const r = computeCounterfactual({
      metric_id: 'approach_proximity_50_125ft',
      direction: 'lower_better',
      player_value: 32,
      pga_value: 19,
      cohort_value: 25,
      player_30d_scoring_avg: 75,
    });
    expect(r.strokes_saved_per_round).toBeGreaterThan(0);
    // smaller than gapping all the way to Tour
    const tour = computeCounterfactual({
      metric_id: 'approach_proximity_50_125ft',
      direction: 'lower_better',
      player_value: 32,
      pga_value: 19,
      cohort_value: null,
      player_30d_scoring_avg: 75,
    });
    expect(r.strokes_saved_per_round).toBeLessThan(tour.strokes_saved_per_round);
  });
});
