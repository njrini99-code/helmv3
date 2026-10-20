import { describe, expect, it } from 'vitest';
import { benjaminiHochberg, BH_Q } from '../multiplicity';
import { KAPPA, keptShare, shrinkToward, splitHalfStability } from '../shrink';

describe('benjaminiHochberg', () => {
  it('uses the owner default q = 0.10', () => {
    expect(BH_Q).toBe(0.1);
  });

  it('computes step-up adjusted values in input order', () => {
    const r = benjaminiHochberg([0.01, 0.04, 0.03, 0.005], 0.05);
    expect(r.m).toBe(4);
    expect(r.qAdj[0]).toBeCloseTo(0.02, 12);
    expect(r.qAdj[1]).toBeCloseTo(0.04, 12);
    expect(r.qAdj[2]).toBeCloseTo(0.04, 12);
    expect(r.qAdj[3]).toBeCloseTo(0.02, 12);
    expect(r.rejected).toEqual([true, true, true, true]);
  });

  it('matches the "largest i with p(i) <= i·q/m" rule', () => {
    const ps = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216];
    const r = benjaminiHochberg(ps, 0.05);
    // i/m·q: 0.005, 0.01, 0.015, 0.02, ... → only the first two pass.
    expect(r.rejected.filter(Boolean)).toHaveLength(2);
    expect(r.rejected[0]).toBe(true);
    expect(r.rejected[1]).toBe(true);
    expect(r.rejected[2]).toBe(false);
  });

  it('counts an untestable hypothesis in m (as p = 1) and leaves its q null', () => {
    const tested = benjaminiHochberg([0.03, 0.04]);
    const withNull = benjaminiHochberg([0.03, null, 0.04]);
    expect(withNull.m).toBe(3);
    expect(withNull.qAdj[1]).toBeNull();
    expect(withNull.rejected[1]).toBe(false);
    // The untestable one makes the others HARDER to support, never easier.
    expect(withNull.qAdj[0]!).toBeGreaterThan(tested.qAdj[0]!);
  });

  it('is empty-safe and caps at 1', () => {
    expect(benjaminiHochberg([]).m).toBe(0);
    const r = benjaminiHochberg([0.9, 0.95]);
    expect(r.qAdj.every((q) => q !== null && q <= 1)).toBe(true);
  });
});

describe('shrinkage', () => {
  it('uses the owner-default κ by unit', () => {
    expect(KAPPA).toEqual({ attempts: 30, shots: 20, per_round_rate: 5, par_scoring_rounds: 8 });
  });
  it('is half and half at n = κ', () => {
    expect(shrinkToward(50, 30, 70, 30)).toBeCloseTo(60, 12);
    expect(keptShare(30, 30)).toBeCloseTo(0.5, 12);
  });
  it('steadies a 58% putter from 31 attempts toward a 72% team', () => {
    expect(shrinkToward(58, 31, 72, 30)).toBeCloseTo((31 * 58 + 30 * 72) / 61, 10);
  });
  it('returns the prior with no data', () => {
    expect(shrinkToward(10, 0, 70, 30)).toBe(70);
  });
});

describe('splitHalfStability', () => {
  it('agrees when both halves are worse and the newer half keeps half the gap', () => {
    expect(splitHalfStability({ gapOld: 12, gapNew: 8, gapFull: 10, nOld: 20, nNew: 20 }).agrees).toBe(true);
  });
  it('does not agree when the newer half fades below half the gap', () => {
    expect(splitHalfStability({ gapOld: 16, gapNew: 4, gapFull: 10, nOld: 20, nNew: 20 }).agrees).toBe(false);
  });
  it('does not agree on a sign change or an empty half', () => {
    expect(splitHalfStability({ gapOld: -2, gapNew: 12, gapFull: 6, nOld: 20, nNew: 20 }).agrees).toBe(false);
    expect(splitHalfStability({ gapOld: 5, gapNew: 5, gapFull: 5, nOld: 0, nNew: 20 }).agrees).toBe(false);
  });
});
