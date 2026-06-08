import { describe, it, expect } from 'vitest';
import { twoProportionZTest, DISTANCE_BANDS, bandFor } from '../proportion-test';

describe('bandFor', () => {
  it('buckets putt distances into the four comparison bands (ft)', () => {
    expect(bandFor(5)).toBe('4-6 ft');
    expect(bandFor(8)).toBe('7-10 ft');
    expect(bandFor(15)).toBe('11-20 ft');
    expect(bandFor(30)).toBe('20+ ft');
  });
  it('returns null below the shortest comparison band (tap-ins are not break tests)', () => {
    expect(bandFor(2)).toBeNull();
  });
  it('DISTANCE_BANDS are ordered and non-overlapping', () => {
    expect(DISTANCE_BANDS.map((b) => b.label)).toEqual([
      '4-6 ft', '7-10 ft', '11-20 ft', '20+ ft',
    ]);
  });
});

describe('twoProportionZTest', () => {
  it('flags a large, well-sampled gap as significant', () => {
    const r = twoProportionZTest(18, 30, 6, 30);
    expect(r.gapPp).toBeCloseTo(40, 0);
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.significant).toBe(true);
  });
  it('does NOT flag the real Nick L-vs-R signal (≈equal make rates)', () => {
    const r = twoProportionZTest(29, 139, 25, 116);
    expect(Math.abs(r.gapPp)).toBeLessThan(12);
    expect(r.significant).toBe(false);
  });
  it('returns significant=false when either side is below n=15', () => {
    const r = twoProportionZTest(8, 10, 1, 10);
    expect(r.significant).toBe(false);
    expect(r.reason).toBe('insufficient_n');
  });
  it('requires BOTH a 12pp effect size AND p<0.05 to be significant', () => {
    const r = twoProportionZTest(10, 40, 6, 40);
    expect(r.significant).toBe(false);
    expect(r.reason).toBe('effect_too_small');
  });
});
