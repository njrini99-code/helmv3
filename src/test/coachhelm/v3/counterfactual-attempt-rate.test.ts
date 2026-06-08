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
});
