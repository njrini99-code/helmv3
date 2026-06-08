import { describe, it, expect } from 'vitest';
import { getCounterfactualConfig } from '@/lib/coachhelm/v3/counterfactual/lookup-tables';

describe('counterfactual lookup — attempt-rate config', () => {
  it('sand-save carries an attempt_metric + value_per_unit instead of a global constant', () => {
    const cfg = getCounterfactualConfig('scrambling_pct_sand')!;
    expect(cfg.attempt_metric).toBe('sand_attempts_per_round');
    expect(cfg.value_per_unit).toBeGreaterThan(0.7);
    expect(cfg.value_per_unit).toBeLessThanOrEqual(1.0);
  });

  it('GIR carries a green-miss attempt metric', () => {
    const cfg = getCounterfactualConfig('gir_pct')!;
    expect(cfg.attempt_metric).toBe('gir_misses_per_round');
  });

  it('SG metrics keep the legacy 1:1 stroke_impact_per_unit and NO attempt_metric', () => {
    const cfg = getCounterfactualConfig('sg_total')!;
    expect(cfg.stroke_impact_per_unit).toBe(1.0);
    expect(cfg.attempt_metric).toBeUndefined();
  });

  it('sand-save coachable timeframe is grounded (short-game, fast) and finite', () => {
    expect(getCounterfactualConfig('scrambling_pct_sand')!.coachable_timeframe_weeks)
      .toBeGreaterThanOrEqual(3);
    expect(getCounterfactualConfig('scrambling_pct_sand')!.coachable_timeframe_weeks)
      .toBeLessThanOrEqual(6);
  });
});
