import { describe, expect, it } from 'vitest';
import { welchStandardError } from '@/lib/coachhelm/v3/stats/intervals';
import { studentTSf, tQuantile975 } from '@/lib/coachhelm/v3/support/distributions';
import { MAD_TO_SD, meanSummary, median, medianAbsoluteDeviation, satterthwaiteDf, tQuantile, tRange95 } from '../stats';

describe('meanSummary', () => {
  it('gives the mean, the sample spread and the standard error', () => {
    // 1,2,3,4,5: mean 3. Squared deviations 4+1+0+1+4 = 10, over n − 1 = 4 → variance 2.5, sd 1.5811.
    // se = 1.5811 / √5 = 0.7071. df = 4.
    const s = meanSummary([1, 2, 3, 4, 5])!;
    expect(s.n).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(1.5811, 4);
    expect(s.se).toBeCloseTo(0.7071, 4);
    expect(s.df).toBe(4);
  });

  it('has no spread from one value, and nothing from none', () => {
    expect(meanSummary([7])).toEqual({ n: 1, mean: 7, sd: null, se: null, df: null });
    expect(meanSummary([])).toBeNull();
  });
});

describe('tRange95', () => {
  it('is value ± t(0.975, df) × se', () => {
    // t(0.975, 4) = 2.7764 (the printed t table). 3 ± 2.7764 × 0.7071 = 3 ± 1.9632 → 1.0368 to 4.9632.
    const r = tRange95(3, 0.7071, 4);
    expect(r.low).toBeCloseTo(1.0368, 3);
    expect(r.high).toBeCloseTo(4.9632, 3);
  });
});

describe('tQuantile', () => {
  it('matches the printed table at the usual level', () => {
    expect(tQuantile(0.025, 4)).toBeCloseTo(2.776, 3);
    expect(tQuantile(0.025, 9)).toBeCloseTo(2.262, 3);
    expect(tQuantile(0.025, 18)).toBeCloseTo(2.101, 3);
    expect(tQuantile(0.025, 9)).toBeCloseTo(tQuantile975(9), 6);
  });

  it('matches the printed table at other levels, and inverts the tail', () => {
    // t(0.995, 9) = 3.250 and t(0.99, 9) = 2.821 (printed table).
    expect(tQuantile(0.005, 9)).toBeCloseTo(3.25, 3);
    expect(tQuantile(0.01, 9)).toBeCloseTo(2.821, 3);
    // The level rule (c) uses: 0.05 / 4 two-sided, so 0.00625 above. It sits between the two table values.
    const t = tQuantile(0.00625, 9);
    expect(t).toBeGreaterThan(2.821);
    expect(t).toBeLessThan(3.25);
    expect(studentTSf(t, 9)).toBeCloseTo(0.00625, 8);
  });
});

describe('satterthwaiteDf', () => {
  it('is 2 × df for two equal estimates', () => {
    // (1 + 1)² / (1/9 + 1/9) = 4 / 0.2222 = 18.
    expect(satterthwaiteDf(1, 9, 1, 9)).toBeCloseTo(18, 10);
  });

  it('is Welch for two plain means', () => {
    const a = [71, 74, 69, 77, 72, 75];
    const b = [80, 71, 76, 90, 68, 73, 79, 85];
    const sa = meanSummary(a)!;
    const sb = meanSummary(b)!;
    const welch = welchStandardError(a, b)!;
    expect(satterthwaiteDf(sa.se!, sa.df!, sb.se!, sb.df!)).toBeCloseTo(welch.df, 9);
    expect(Math.sqrt(sa.se! ** 2 + sb.se! ** 2)).toBeCloseTo(welch.se, 12);
  });

  it('leans to the noisier side', () => {
    // seA = 3, dfA = 4; seB = 1, dfB = 20: (9 + 1)² / (81/4 + 1/20) = 100 / 20.3 = 4.926.
    expect(satterthwaiteDf(3, 4, 1, 20)).toBeCloseTo(4.926, 3);
  });
});

describe('median and MAD', () => {
  it('is not moved by one extreme value', () => {
    // 1,2,3,4,100: median 3. Distances from it 2,1,0,1,97 → sorted 0,1,1,2,97 → MAD 1.
    expect(median([100, 1, 4, 2, 3])).toBe(3);
    expect(medianAbsoluteDeviation([100, 1, 4, 2, 3])).toBe(1);
  });

  it('takes the middle pair for an even count', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(medianAbsoluteDeviation([])).toBeNull();
  });

  it('scales to a standard deviation with 1 / Φ⁻¹(0.75)', () => {
    expect(MAD_TO_SD).toBeCloseTo(1 / 0.6744897501960817, 4);
  });
});
