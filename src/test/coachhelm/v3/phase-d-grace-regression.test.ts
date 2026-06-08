import { describe, it, expect } from 'vitest';
import { computeCounterfactual, formatCounterfactualLine } from '@/lib/coachhelm/v3/counterfactual/compute';
import { leveragePriorityFloor } from '@/lib/coachhelm/v3/engine/generator-base';

describe('Phase D — Grace Saunders (womens) regression', () => {
  it('sand-save: own 1.6 attempts/rd → ~0.5 strokes, not the fabricated 1.5', () => {
    const r = computeCounterfactual({
      metric_id: 'scrambling_pct_sand', direction: 'higher_better',
      player_value: 0, pga_value: 50, cohort_value: 14.8, // synthetic → rejected (below 25 bound)
      cohort_gender: 'womens', player_attempts_per_round: 13 / 8,
      player_30d_scoring_avg: 79.13, confidence: 0.65,
    });
    expect(r.strokes_saved_per_round).toBeGreaterThan(0.4);
    expect(r.strokes_saved_per_round).toBeLessThan(0.7);
    // sand-save IS a real leak for Grace → still surfaces (medium), but not a
    // double-leverage men's-anchored over-claim. 3rd arg = metric, 4th = confidence.
    expect(leveragePriorityFloor('low', r, 'scrambling_pct_sand', 0.65)).toBe('medium');
  });

  it('par_4 @ confidence 0.27 (n=8) is NOT auto-floored to high + copy is softened', () => {
    const r = computeCounterfactual({
      metric_id: 'scoring_par_4', direction: 'lower_better',
      player_value: 4.47, pga_value: 3.97, cohort_value: 4.31,
      cohort_gender: 'womens', player_attempts_per_round: 10, // par-4 holes/round
      player_30d_scoring_avg: 79.13, confidence: 0.27,
    });
    expect(leveragePriorityFloor('low', r, 'scoring_par_4', 0.27)).not.toBe('high');
    expect(formatCounterfactualLine(r).toLowerCase()).toContain('roughly');
  });
});
