import { describe, expect, it } from 'vitest';
import { computeGap, rangeExcludesZero } from '../gap';

describe('computeGap: one proportion against a benchmark', () => {
  it('reports a positive gap when a higher-better rate is below the benchmark', () => {
    // 18 of 31 (58%) against a 72% team line.
    const g = computeGap({ kind: 'proportion', k: 18, n: 31, benchmark: 0.72, polarity: 'higher_better' })!;
    expect(g.direction).toBe('weakness');
    expect(g.gap).toBeCloseTo(72 - (18 / 31) * 100, 3);
    expect(g.gap_unit).toBe('pct_points');
    expect(g.method).toBe('wilson');
    expect(g.test).toBe('exact_binomial');
    // Wilson 95% for 18/31 is about 41-74%, so the gap range is about -2 to 31.
    expect(g.range_lo).toBeLessThan(0);
    expect(g.range_hi).toBeGreaterThan(29);
    expect(rangeExcludesZero(g)).toBe(false);
    // P(X <= 18 | n = 31, p = 0.72) is about 0.06.
    expect(g.p_one_sided).toBeGreaterThan(0.04);
    expect(g.p_one_sided).toBeLessThan(0.09);
  });

  it('runs the mirror test for a strength', () => {
    const g = computeGap({ kind: 'proportion', k: 40, n: 50, benchmark: 0.6, polarity: 'higher_better' })!;
    expect(g.direction).toBe('strength');
    expect(g.gap).toBeLessThan(0);
    expect(rangeExcludesZero(g)).toBe(true);
    expect(g.p_one_sided).toBeLessThan(0.01);
  });

  it('keeps the weakness test when strengths are not allowed', () => {
    const g = computeGap(
      { kind: 'proportion', k: 40, n: 50, benchmark: 0.6, polarity: 'higher_better' },
      { allowStrength: false },
    )!;
    expect(g.direction).toBe('weakness');
    expect(g.p_one_sided).toBeGreaterThan(0.99);
  });

  it('flips the sign for a lower-better rate', () => {
    const g = computeGap({ kind: 'proportion', k: 30, n: 100, benchmark: 0.2, polarity: 'lower_better' })!;
    expect(g.gap).toBeCloseTo(10, 6);
    expect(g.direction).toBe('weakness');
    expect(g.p_one_sided).toBeLessThan(0.02);
  });

  it('refuses an empty sample or a degenerate benchmark', () => {
    expect(computeGap({ kind: 'proportion', k: 0, n: 0, benchmark: 0.5, polarity: 'higher_better' })).toBeNull();
    expect(computeGap({ kind: 'proportion', k: 3, n: 10, benchmark: 1, polarity: 'higher_better' })).toBeNull();
    expect(computeGap({ kind: 'proportion', k: 3, n: 10, benchmark: 0, polarity: 'higher_better' })).toBeNull();
  });
});

describe('computeGap: two proportions within the player (02 §10.1 fixture)', () => {
  it('reproduces the downhill 4-6 ft numbers: gap ~24 points, Newcombe range ~3-43, p ~0.012', () => {
    // 18 of 31 downhill vs 36 of 44 on other putts from the same range.
    const g = computeGap({ kind: 'two_proportion', kA: 18, nA: 31, kB: 36, nB: 44, polarity: 'higher_better' })!;
    expect(g.gap).toBeCloseTo((36 / 44 - 18 / 31) * 100, 3);
    expect(g.range_lo).toBeGreaterThan(2);
    expect(g.range_lo).toBeLessThan(4);
    expect(g.range_hi).toBeGreaterThan(42);
    expect(g.range_hi).toBeLessThan(44);
    expect(g.method).toBe('newcombe');
    expect(g.test).toBe('pooled_z');
    expect(g.p_one_sided).toBeGreaterThan(0.01);
    expect(g.p_one_sided).toBeLessThan(0.015);
    expect(rangeExcludesZero(g)).toBe(true);
  });

  it('gives p = 1 for identical all-made sides', () => {
    const g = computeGap({ kind: 'two_proportion', kA: 10, nA: 10, kB: 10, nB: 10, polarity: 'higher_better' })!;
    expect(g.gap).toBe(0);
    expect(g.p_one_sided).toBe(1);
  });
});

describe('computeGap: a mean with a standard error', () => {
  it('uses t for the range and the one-sided p', () => {
    // Opening-hole delta 0.6 strokes, SE 0.2, 11 df, benchmark 0.1.
    const g = computeGap({ kind: 'mean', value: 0.6, se: 0.2, df: 11, benchmark: 0.1, polarity: 'lower_better' })!;
    expect(g.gap).toBeCloseTo(0.5, 6);
    expect(g.range_lo).toBeCloseTo(0.5 - 2.201 * 0.2, 2);
    expect(g.range_hi).toBeCloseTo(0.5 + 2.201 * 0.2, 2);
    expect(g.p_one_sided).toBeGreaterThan(0.01);
    expect(g.p_one_sided).toBeLessThan(0.02);
    expect(g.gap_unit).toBe('metric_unit');
  });
  it('refuses a zero standard error', () => {
    expect(computeGap({ kind: 'mean', value: 1, se: 0, df: 5, benchmark: 0, polarity: 'lower_better' })).toBeNull();
  });
});

describe('computeGap: a count per round', () => {
  it('uses the exact Poisson tail and interval', () => {
    // 12 penalties in 8 rounds (1.5 a round) against a 0.6 team rate.
    const g = computeGap({ kind: 'rate_per_round', events: 12, rounds: 8, benchmark: 0.6, polarity: 'lower_better' })!;
    expect(g.gap).toBeCloseTo(0.9, 6);
    expect(g.method).toBe('poisson');
    // P(X >= 12 | mu = 4.8) is about 0.0036.
    expect(g.p_one_sided).toBeGreaterThan(0.002);
    expect(g.p_one_sided).toBeLessThan(0.005);
    expect(rangeExcludesZero(g)).toBe(true);
  });
  it('treats fewer events than expected as a strength', () => {
    const g = computeGap({ kind: 'rate_per_round', events: 0, rounds: 10, benchmark: 0.8, polarity: 'lower_better' })!;
    expect(g.direction).toBe('strength');
    expect(g.p_one_sided).toBeCloseTo(Math.exp(-8), 8);
  });
});
