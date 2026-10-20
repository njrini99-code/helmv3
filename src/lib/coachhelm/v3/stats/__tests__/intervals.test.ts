import { describe, it, expect } from 'vitest';
import {
  proportionDiffInterval,
  tCritical95,
  welchStandardError,
  wilsonInterval,
} from '../intervals';

describe('wilsonInterval', () => {
  it('matches the textbook Wilson bounds for 8 of 10', () => {
    const ci = wilsonInterval(8, 10)!;
    expect(ci.low).toBeCloseTo(49.0, 0);
    expect(ci.high).toBeCloseTo(94.3, 0);
  });
  it('stays inside [0, 100] at 0/n and n/n', () => {
    expect(wilsonInterval(0, 5)!.low).toBe(0);
    expect(wilsonInterval(5, 5)!.high).toBeCloseTo(100, 6);
    expect(wilsonInterval(5, 5)!.low).toBeLessThan(100);
  });
  it('is wide at 5 attempts (a 20-point step per shot is noise)', () => {
    const ci = wilsonInterval(2, 5)!;
    expect(ci.high - ci.low).toBeGreaterThan(50);
  });
  it('is null on an empty denominator', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe('proportionDiffInterval', () => {
  it('contains the observed difference', () => {
    const ci = proportionDiffInterval(12, 20, 20, 25)!;
    expect(ci.low).toBeLessThan(60 - 80);
    expect(ci.high).toBeGreaterThan(60 - 80);
  });
  it('excludes zero for a large, well-sampled gap', () => {
    const ci = proportionDiffInterval(30, 100, 60, 100)!;
    expect(ci.high).toBeLessThan(0);
  });
  it('spans zero for 8 shots a side with a 15-point gap', () => {
    const ci = proportionDiffInterval(4, 8, 5, 8)!; // 50% vs 62.5%
    expect(ci.low).toBeLessThan(0);
    expect(ci.high).toBeGreaterThan(0);
  });
});

describe('welchStandardError', () => {
  it('needs two values a side', () => {
    expect(welchStandardError([1], [1, 2])).toBeNull();
  });
  it('computes sqrt(va/na + vb/nb)', () => {
    const r = welchStandardError([0, 2, 4], [1, 1, 1, 1])!;
    // var A = 4, n = 3; var B = 0
    expect(r.se).toBeCloseTo(Math.sqrt(4 / 3), 6);
  });
});

describe('tCritical95', () => {
  it('uses the t table at small df, not 1.96', () => {
    expect(tCritical95(4)).toBeCloseTo(2.776, 3);
    expect(tCritical95(4.7)).toBeCloseTo(2.776, 3); // rounds df down
  });
  it('approaches the normal value at large df', () => {
    expect(tCritical95(500)).toBeCloseTo(1.96, 2);
  });
});
