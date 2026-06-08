import { describe, it, expect } from 'vitest';
import { getCohortPlausibilityBound } from '@/lib/coachhelm/v3/counterfactual/lookup-tables';

describe('COHORT_PLAUSIBILITY_BOUNDS — unbounded metrics now bounded', () => {
  it('putts_made_3_5ft_pct rejects an implausibly-low synthetic cohort (62.8% prod artifact)', () => {
    const b = getCohortPlausibilityBound('putts_made_3_5ft_pct')!;
    expect(b.min).toBeGreaterThanOrEqual(70); // 62.8% synthetic cohort falls below → rejected
    expect(b.not_better_than_pga).toBe(true);
  });

  it('gir_pct, big_number_rate, scoring_par_4 all carry bounds (no synthetic-mean gapping)', () => {
    expect(getCohortPlausibilityBound('gir_pct')).not.toBeNull();
    expect(getCohortPlausibilityBound('big_number_rate')).not.toBeNull();
    expect(getCohortPlausibilityBound('scoring_par_4')).not.toBeNull();
  });

  it('big_number_rate (lower_better %) bounds the cohort to a sane double-bogey rate', () => {
    const b = getCohortPlausibilityBound('big_number_rate')!;
    expect(b.max).toBeGreaterThan(0);
    expect(b.max).toBeLessThanOrEqual(30);
  });

  it('scoring_par_4 cohort cannot be better than (below) the Tour value', () => {
    expect(getCohortPlausibilityBound('scoring_par_4')!.not_better_than_pga).toBe(true);
  });
});
