import { describe, it, expect } from 'vitest';
import { isFloorExemptMetric } from './score';

describe('isFloorExemptMetric', () => {
  it('exempts every par-scoring metric (descriptive, ×10 leverage family)', () => {
    expect(isFloorExemptMetric('scoring_par_3')).toBe(true);
    expect(isFloorExemptMetric('scoring_par_4')).toBe(true);
    expect(isFloorExemptMetric('scoring_par_5')).toBe(true);
  });

  it('exempts the warmup opening-hole metric', () => {
    expect(isFloorExemptMetric('opening_hole_delta')).toBe(true);
  });

  it('does NOT exempt an actionable diagnostic metric', () => {
    expect(isFloorExemptMetric('approach_proximity_175_plus_ft')).toBe(false);
    expect(isFloorExemptMetric('putts_made_5_10ft_pct')).toBe(false);
    expect(isFloorExemptMetric('scrambling_pct_sand')).toBe(false);
  });

  it('respects the anchored single-digit boundary of the par-scoring regex', () => {
    expect(isFloorExemptMetric('scoring_par_')).toBe(false); // no digit
    expect(isFloorExemptMetric('scoring_par_34')).toBe(false); // two digits
    expect(isFloorExemptMetric('scoring_par_3x')).toBe(false); // trailing junk
  });

  it('treats undefined / empty metric as not exempt (gets a floor)', () => {
    expect(isFloorExemptMetric(undefined)).toBe(false);
    expect(isFloorExemptMetric('')).toBe(false);
  });
});
