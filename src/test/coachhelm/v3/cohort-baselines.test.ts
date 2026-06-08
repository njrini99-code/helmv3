import { describe, it, expect } from 'vitest';
import {
  cohortAnchor,
  type CohortGender,
} from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';

describe('cohortAnchor', () => {
  it('returns the men\'s Tour value unchanged for mens (no behavior change)', () => {
    // Men's 3-5ft Tour make % is the existing PGA_MAKE_PCT_BY_BUCKET value.
    expect(cohortAnchor('putts_made_3_5ft_pct', 'mens')).toBe(90.5);
    expect(cohortAnchor('scrambling_pct_sand', 'mens')).toBe(50);
  });

  it('uses a realistic women\'s sand-save target (~38%), NOT the men\'s 50%', () => {
    const w = cohortAnchor('scrambling_pct_sand', 'womens');
    expect(w).toBeGreaterThanOrEqual(36);
    expect(w).toBeLessThanOrEqual(40);
    // strictly easier than the men's Tour anchor — the bug this fixes
    expect(w).toBeLessThan(cohortAnchor('scrambling_pct_sand', 'mens')!);
  });

  it('uses a higher women\'s 3-5ft make target than the synthetic cohort (62.8%) but below men\'s Tour', () => {
    const w = cohortAnchor('putts_made_3_5ft_pct', 'womens')!;
    expect(w).toBeGreaterThan(62.8);   // beats the synthetic app-population cohort
    expect(w).toBeLessThan(90.5);      // still below men's Tour
  });

  it('returns null for an unknown metric (caller falls back to pga_value)', () => {
    expect(cohortAnchor('not_a_metric' as never, 'womens' as CohortGender)).toBeNull();
  });
});
