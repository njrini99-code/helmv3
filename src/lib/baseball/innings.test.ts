/**
 * Regression tests for innings-pitched arithmetic (#434).
 * `.1`/`.2` are outs (thirds of an inning), so summing with `+` is wrong.
 */
import { describe, it, expect } from 'vitest';
import { ipToOuts, outsToIp, ipToInnings, sumInningsPitched } from './innings';

describe('ipToOuts', () => {
  it('treats the tenths digit as outs, not a base-10 fraction', () => {
    expect(ipToOuts(6)).toBe(18);
    expect(ipToOuts(6.1)).toBe(19);
    expect(ipToOuts(6.2)).toBe(20);
    expect(ipToOuts(0.1)).toBe(1);
  });

  it('is null/NaN safe', () => {
    expect(ipToOuts(null)).toBe(0);
    expect(ipToOuts(undefined)).toBe(0);
    expect(ipToOuts(Number.NaN)).toBe(0);
  });
});

describe('outsToIp', () => {
  it('round-trips outs back into innings notation', () => {
    expect(outsToIp(18)).toBeCloseTo(6.0, 10);
    expect(outsToIp(19)).toBeCloseTo(6.1, 10);
    expect(outsToIp(20)).toBeCloseTo(6.2, 10);
    expect(outsToIp(39)).toBeCloseTo(13.0, 10);
  });
});

describe('sumInningsPitched — partial innings add via outs', () => {
  it('sums 6.1 + 6.2 to 13.0, not 12.3', () => {
    expect(sumInningsPitched([6.1, 6.2])).toBeCloseTo(13.0, 10);
  });

  it('carries thirds into whole innings', () => {
    expect(sumInningsPitched([2.1, 1.2])).toBeCloseTo(4.0, 10); // 7 + 5 outs = 12 outs
    expect(sumInningsPitched([0.1, 0.1, 0.1])).toBeCloseTo(1.0, 10);
    expect(sumInningsPitched([5.2, 1.2, 1.1])).toBeCloseTo(8.2, 10); // 17+5+4 = 26 outs
  });

  it('ignores null/undefined lines', () => {
    expect(sumInningsPitched([6.1, null, undefined, 6.2])).toBeCloseTo(13.0, 10);
    expect(sumInningsPitched([])).toBe(0);
  });
});

describe('derived ERA/WHIP/K9 use true innings', () => {
  // 6.1 + 6.2 = 39 outs = 13.0 innings exactly.
  it('computes ERA/WHIP over the correctly summed innings', () => {
    const totalIp = sumInningsPitched([6.1, 6.2]);
    const innings = ipToInnings(totalIp);
    expect(innings).toBeCloseTo(13, 10);
    // 4 earned runs over 13 innings.
    expect((9 * 4) / innings).toBeCloseTo(2.77, 2);
    // 8 hits + 4 walks over 13 innings.
    expect((8 + 4) / innings).toBeCloseTo(0.923, 3);
    // 14 strikeouts per 9 over 13 innings.
    expect((9 * 14) / innings).toBeCloseTo(9.69, 2);
  });

  it('uses true innings for a partial-inning total (not the notation value)', () => {
    // 6.1 + 6.1 = 38 outs → 12.2 notation, but 12.667 true innings.
    const totalIp = sumInningsPitched([6.1, 6.1]);
    expect(totalIp).toBeCloseTo(12.2, 10);
    const innings = ipToInnings(totalIp);
    expect(innings).toBeCloseTo(38 / 3, 10);
    // ERA over true innings differs from dividing by the 12.2 notation value.
    expect((9 * 6) / innings).toBeCloseTo(4.26, 2);
    expect((9 * 6) / innings).not.toBeCloseTo((9 * 6) / 12.2, 2);
  });
});
