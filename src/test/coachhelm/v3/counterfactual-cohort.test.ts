/**
 * Counterfactual target (Q-88, 2026-09-30: "change it all to PGA").
 *
 * The gap is measured to the team's Tour: the LPGA value for a women's team,
 * the PGA value otherwise (`cohortAnchor`, from TOUR_STANDARDS), and the
 * standing row's `pga_value` for a metric with no anchor. The college cohort
 * average is never a target; `ComputeCounterfactualInput` no longer takes one.
 */
import { describe, it, expect } from 'vitest';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';

const sand = (player_value: number, cohort_gender?: 'mens' | 'womens') =>
  computeCounterfactual({
    metric_id: 'scrambling_pct_sand',
    direction: 'higher_better',
    player_value,
    pga_value: 50,
    player_30d_scoring_avg: 75,
    ...(cohort_gender ? { cohort_gender } : {}),
  });

describe('computeCounterfactual: the Tour target', () => {
  it("a men's team gaps to the PGA Tour sand save (50%)", () => {
    const r = sand(30, 'mens');
    expect(r.suppressed).toBe(false);
    expect(r.strokes_saved_per_round).toBeGreaterThan(0);
    // The same as gapping to the standing row's pga_value.
    expect(r.strokes_saved_per_round).toBeCloseTo(sand(30).strokes_saved_per_round);
  });

  it("a women's team gaps to the LPGA Tour sand save (45%), a smaller gap than the PGA's", () => {
    const womens = sand(30, 'womens');
    const mens = sand(30, 'mens');
    expect(womens.strokes_saved_per_round).toBeGreaterThan(0);
    expect(womens.strokes_saved_per_round).toBeLessThan(mens.strokes_saved_per_round);
  });

  it("a player at the team's Tour value has no gap", () => {
    expect(sand(46, 'womens').suppress_reason).toBe('no_gap');
    expect(sand(50, 'mens').suppress_reason).toBe('no_gap');
  });

  it("a metric with no anchor uses the standing row's pga_value", () => {
    const r = computeCounterfactual({
      metric_id: 'approach_proximity_50_125ft',
      direction: 'lower_better',
      player_value: 32,
      pga_value: 19,
      player_30d_scoring_avg: 75,
      cohort_gender: 'mens',
    });
    expect(r.strokes_saved_per_round).toBeGreaterThan(0);
  });
});
