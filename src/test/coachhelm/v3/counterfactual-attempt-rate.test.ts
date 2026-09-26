import { describe, it, expect } from 'vitest';
import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';

describe('computeCounterfactual — own-attempt-rate sizing (DC-ATTEMPT-1)', () => {
  it('sizes Grace\'s sand-save off her OWN 1.6 attempts/round, not the global 0.03', () => {
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand',
      direction: 'higher_better',
      player_value: 0,
      pga_value: 50,
      cohort_value: 14.8,
      cohort_gender: 'womens',
      player_attempts_per_round: 1.625,
      player_30d_scoring_avg: 79.1,
    });
    expect(r.suppressed).toBe(false);
    expect(r.strokes_saved_per_round).toBeGreaterThan(0.4);
    expect(r.strokes_saved_per_round).toBeLessThan(0.7);
    expect(r.attempts_used).toBeCloseTo(1.625);
  });

  it('a high-volume player gets a proportionally larger (real) impact', () => {
    const lo = computeCounterfactual({
      metric_id: 'scrambling_pct_sand', direction: 'higher_better',
      player_value: 0, pga_value: 50, cohort_value: null, cohort_gender: 'womens',
      player_attempts_per_round: 1.0, player_30d_scoring_avg: 79,
    });
    const hi = computeCounterfactual({
      metric_id: 'scrambling_pct_sand', direction: 'higher_better',
      player_value: 0, pga_value: 50, cohort_value: null, cohort_gender: 'womens',
      player_attempts_per_round: 3.0, player_30d_scoring_avg: 79,
    });
    expect(hi.strokes_saved_per_round).toBeGreaterThan(lo.strokes_saved_per_round * 2.5);
  });

  it('falls back to the legacy gap×constant when no attempt rate is supplied (unchanged)', () => {
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand', direction: 'higher_better',
      player_value: 30, pga_value: 40, cohort_value: null,
      player_30d_scoring_avg: 75,
    });
    expect(r.strokes_saved_per_round).toBeCloseTo((40 - 30) * 0.03); // 0.30
  });

  it('targets the women\'s anchor (38%) over the men\'s pga_value when cohort is unusable', () => {
    const withAnchor = computeCounterfactual({
      metric_id: 'scrambling_pct_sand', direction: 'higher_better',
      player_value: 0, pga_value: 50, cohort_value: null, cohort_gender: 'womens',
      player_attempts_per_round: 2, player_30d_scoring_avg: 79,
    });
    const mensNoAnchor = computeCounterfactual({
      metric_id: 'scrambling_pct_sand', direction: 'higher_better',
      player_value: 0, pga_value: 50, cohort_value: null, cohort_gender: 'mens',
      player_attempts_per_round: 2, player_30d_scoring_avg: 79,
    });
    expect(withAnchor.strokes_saved_per_round).toBeLessThan(mensNoAnchor.strokes_saved_per_round);
  });

  // Reconciliation 2026-09-25 (player 49ffe06d…): 3-5 ft 47.7% vs Tour 90.5%,
  // 44 attempts over 21 rounds. The legacy path stated 42.8 × 0.10 = 2.28
  // (clamped/rounded to ~2.3) strokes/round; the direct count is
  // 0.428 × 44/21 ≈ 0.90 makes, i.e. strokes, per round.
  it('sizes a 3-5 ft putting gap off the player\'s real band attempts per round', () => {
    const attempts = 44 / 21;
    const r = computeCounterfactual({
      metric_id: 'putts_made_3_5ft_pct',
      direction: 'higher_better',
      player_value: 47.7,
      pga_value: 90.5,
      cohort_value: null,
      player_attempts_per_round: attempts,
      player_30d_scoring_avg: 72.8,
    });
    expect(r.suppressed).toBe(false);
    expect(r.attempts_used).toBeCloseTo(attempts, 6);
    expect(r.strokes_saved_per_round).toBeCloseTo(((90.5 - 47.7) / 100) * attempts * 1.0, 6);
    expect(r.strokes_saved_per_round).toBeCloseTo(0.897, 3);

    const legacy = computeCounterfactual({
      metric_id: 'putts_made_3_5ft_pct',
      direction: 'higher_better',
      player_value: 47.7,
      pga_value: 90.5,
      cohort_value: null,
      player_30d_scoring_avg: 72.8,
    });
    expect(legacy.attempts_used).toBeNull();
    expect(legacy.strokes_saved_per_round).toBeGreaterThan(2);
  });
});
