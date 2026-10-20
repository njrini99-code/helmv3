/**
 * The significance gate behind the "moves with" relationships (audit rows
 * 33/34, owner decision "honest correlation", 2026-09-28).
 *
 * The old gate was |r| >= 0.3 on 10-29 rounds with two sub-tests that could
 * not fail, so on pure noise it passed at roughly the audit's 11-41% null rate.
 * These tests pin the replacement: a real t-test p-value, Benjamini-Hochberg
 * across a player's hypotheses, n >= 15, and a false-positive rate on random
 * uncorrelated data that sits near the nominal level instead.
 */
import { describe, it, expect } from 'vitest';
import {
  pearson,
  correlationPValue,
  benjaminiHochberg,
  studentTTwoSidedP,
  studentTCritical,
  passesCorrelationGate,
  lagOneCrossCorrelation,
  isScoreArithmetic,
  MIN_PAIRED_ROUNDS,
  FDR_Q,
} from './correlation-gate';

/** Deterministic PRNG so the false-positive test cannot flake. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe('pearson / correlationPValue', () => {
  it('keeps the sign', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    expect(pearson(xs, xs.map((x) => -2 * x + 1))).toBeCloseTo(-1, 10);
    expect(pearson(xs, xs.map((x) => 3 * x))).toBeCloseTo(1, 10);
  });

  it('is 0 for a constant series instead of NaN', () => {
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
  });

  it('matches the textbook t-test p-value', () => {
    // r = 0.5, n = 20 -> t = 2.449, df = 18 -> two-sided p ~= 0.0248.
    expect(correlationPValue(0.5, 20)).toBeCloseTo(0.0248, 3);
    // r = 0.3, n = 15 -> t = 1.134, df = 13 -> p ~= 0.277.
    expect(correlationPValue(0.3, 15)).toBeCloseTo(0.277, 2);
  });

  it('student t helpers agree with each other', () => {
    expect(studentTTwoSidedP(2.101, 18)).toBeCloseTo(0.05, 3);
    expect(studentTCritical(18)).toBeCloseTo(2.101, 2);
    expect(studentTCritical(1)).toBeCloseTo(12.706, 1);
  });
});

describe('benjaminiHochberg', () => {
  it('adjusts and keeps monotonicity in the original order', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03]);
    // sorted: 0.01*3/1=0.03, 0.03*3/2=0.045, 0.04*3/3=0.04 -> monotone min from top
    expect(q[0]).toBeCloseTo(0.03, 10);
    expect(q[1]).toBeCloseTo(0.04, 10);
    expect(q[2]).toBeCloseTo(0.04, 10);
  });

  it('never exceeds 1', () => {
    expect(benjaminiHochberg([0.9, 0.95]).every((v) => v <= 1)).toBe(true);
  });
});

describe('passesCorrelationGate', () => {
  it('rejects fewer than MIN_PAIRED_ROUNDS pairs even with a huge r', () => {
    expect(MIN_PAIRED_ROUNDS).toBe(15);
    expect(passesCorrelationGate({ r: 0.95, n: 14, q: 0.0001 })).toBe(false);
  });

  it('rejects a significant but weak correlation', () => {
    expect(passesCorrelationGate({ r: 0.2, n: 200, q: 0.001 })).toBe(false);
  });

  it('rejects when the FDR-adjusted q is above the bar', () => {
    expect(passesCorrelationGate({ r: 0.45, n: 15, q: 0.09 })).toBe(false);
  });

  it('accepts a negative correlation on the same terms as a positive one', () => {
    expect(passesCorrelationGate({ r: -0.7, n: 20, q: 0.002 })).toBe(true);
  });

  it('random uncorrelated data passes near the nominal rate, not the old ~28%', () => {
    const rand = mulberry32(20260928);
    const trials = 2000;
    let passed = 0;
    let oldGatePassed = 0;
    for (let t = 0; t < trials; t++) {
      const n = 15 + Math.floor(rand() * 15); // 15..29, the live range
      // Three independent hypotheses per "player", like the engine.
      const ps: number[] = [];
      const rs: number[] = [];
      for (let h = 0; h < 3; h++) {
        const xs = Array.from({ length: n }, () => gaussian(rand));
        const ys = Array.from({ length: n }, () => gaussian(rand));
        const r = pearson(xs, ys);
        rs.push(r);
        ps.push(correlationPValue(r, n));
      }
      const qs = benjaminiHochberg(ps);
      if (rs.some((r, i) => passesCorrelationGate({ r, n, q: qs[i]! }))) passed++;
      if (rs.some((r) => Math.abs(r) >= 0.3)) oldGatePassed++;
    }
    // Per-player family-wise false-positive rate under BH at q=0.05 over 3
    // true-null tests is <= 5%; allow sampling slack.
    expect(passed / trials).toBeLessThan(0.07);
    // And the old gate really was that loose on the same data.
    expect(oldGatePassed / trials).toBeGreaterThan(0.25);
    expect(FDR_Q).toBe(0.05);
  });
});

describe('lagOneCrossCorrelation (temporal precedence, centred)', () => {
  it('can FAIL: independent series give a small lagged r even for large positive values', () => {
    const rand = mulberry32(7);
    // Putts ~30, GIR ~8: raw products are ~240, which the old test called "> 0.2".
    const cause = Array.from({ length: 25 }, () => 8 + gaussian(rand));
    const effect = Array.from({ length: 25 }, () => 30 + gaussian(rand));
    const { r, supports } = lagOneCrossCorrelation(cause, effect, 1);
    expect(Math.abs(r)).toBeLessThan(0.5);
    expect(supports).toBe(false);
  });

  it('supports only when the previous cause predicts the next effect in the stated direction', () => {
    const cause = Array.from({ length: 30 }, (_, i) => Math.sin(i * 1.7) * 3 + 10);
    const effect = [0, ...cause.slice(0, -1).map((c) => 2 * c)];
    expect(lagOneCrossCorrelation(cause, effect, 1).supports).toBe(true);
    expect(lagOneCrossCorrelation(cause, effect, -1).supports).toBe(false);
  });
});

describe('isScoreArithmetic', () => {
  it('flags score components ending at score_to_par', () => {
    expect(isScoreArithmetic('total_gir', 'score_to_par')).toBe(true);
    expect(isScoreArithmetic('total_putts', 'score_to_par')).toBe(true);
    expect(isScoreArithmetic('total_fairways_hit', 'score_to_par')).toBe(true);
  });

  it('does not flag non-score effects or non-component causes', () => {
    expect(isScoreArithmetic('total_fairways_hit', 'total_gir')).toBe(false);
    expect(isScoreArithmetic('rounds_per_week', 'score_to_par')).toBe(false);
  });
});
