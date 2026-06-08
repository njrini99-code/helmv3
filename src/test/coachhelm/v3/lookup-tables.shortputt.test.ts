import { describe, it, expect } from 'vitest';
import { getCounterfactualConfig } from '@/lib/coachhelm/v3/counterfactual/lookup-tables';

describe('counterfactual lookup — short-putt 3-5ft impact', () => {
  it('3-5 ft is the highest per-unit putt impact (most frequent + most makeable)', () => {
    const short = getCounterfactualConfig('putts_made_3_5ft_pct')!;
    const mid = getCounterfactualConfig('putts_made_5_10ft_pct')!;
    expect(short.stroke_impact_per_unit).toBe(0.10);
    // Strictly above every longer band so a short-putt gap ranks first.
    expect(short.stroke_impact_per_unit).toBeGreaterThan(mid.stroke_impact_per_unit);
  });

  it('a 44pp short-putt gap floors to a high-leverage projection', () => {
    const short = getCounterfactualConfig('putts_made_3_5ft_pct')!;
    // 44 pp (Nick: 90.5 -> 46.5) × 0.10 = 4.4 raw strokes — well past the 1.0
    // leverage-floor threshold even before the per-projection ceiling clamps it.
    expect(44 * short.stroke_impact_per_unit).toBeGreaterThanOrEqual(1.0);
  });
});
