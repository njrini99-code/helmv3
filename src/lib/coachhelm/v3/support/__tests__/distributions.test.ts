import { describe, expect, it } from 'vitest';
import {
  binomialCdf,
  binomialSf,
  logGamma,
  normalCdf,
  normalSf,
  poissonCdf,
  poissonExactInterval,
  poissonSf,
  studentTSf,
  tQuantile975,
} from '../distributions';

describe('normal tails', () => {
  it('matches reference values', () => {
    expect(normalCdf(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(normalSf(3)).toBeCloseTo(0.0013498980316301, 14);
    expect(normalSf(5)).toBeCloseTo(2.866515718791939e-7, 16);
    expect(normalSf(-1)).toBeCloseTo(0.8413447460685429, 13);
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
  });
  it('is symmetric and monotone', () => {
    for (const z of [-4, -2.5, -1, 0.3, 1.7, 3.2]) {
      expect(normalCdf(z) + normalSf(z)).toBeCloseTo(1, 14);
      expect(normalCdf(z)).toBeLessThan(normalCdf(z + 0.01));
    }
  });
  it('handles infinities', () => {
    expect(normalSf(Infinity)).toBe(0);
    expect(normalCdf(-Infinity)).toBe(0);
  });
});

describe('logGamma', () => {
  it('matches factorials and Γ(1/2)', () => {
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 9);
    expect(Math.exp(logGamma(11))).toBeCloseTo(3628800, 3);
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 12);
  });
});

describe('Student t', () => {
  it('matches table values', () => {
    expect(studentTSf(2, 10)).toBeCloseTo(0.036694, 5);
    expect(tQuantile975(5)).toBeCloseTo(2.5706, 3);
    expect(tQuantile975(30)).toBeCloseTo(2.0423, 3);
    expect(tQuantile975(Infinity)).toBeCloseTo(1.96, 2);
  });
  it('falls back to the normal for infinite df', () => {
    expect(studentTSf(1.5, Infinity)).toBeCloseTo(normalSf(1.5), 12);
  });
  it('is symmetric', () => {
    expect(studentTSf(-1.2, 7) + studentTSf(1.2, 7)).toBeCloseTo(1, 12);
  });
});

describe('binomial', () => {
  it('sums exactly', () => {
    expect(binomialCdf(3, 10, 0.5)).toBeCloseTo(0.171875, 12);
    expect(binomialSf(8, 10, 0.5)).toBeCloseTo(56 / 1024, 12);
    expect(binomialCdf(4, 10, 0.3) + binomialSf(5, 10, 0.3)).toBeCloseTo(1, 12);
  });
  it('handles edges', () => {
    expect(binomialCdf(-1, 10, 0.5)).toBe(0);
    expect(binomialCdf(10, 10, 0.5)).toBe(1);
    expect(binomialSf(0, 10, 0.5)).toBe(1);
  });
});

describe('Poisson', () => {
  it('cdf and sf agree', () => {
    expect(poissonCdf(2, 1.5) + poissonSf(3, 1.5)).toBeCloseTo(1, 12);
    expect(poissonCdf(0, 2)).toBeCloseTo(Math.exp(-2), 12);
  });
  it('gives the Garwood exact interval', () => {
    const five = poissonExactInterval(5);
    expect(five.low).toBeCloseTo(1.6235, 3);
    expect(five.high).toBeCloseTo(11.6683, 3);
    const zero = poissonExactInterval(0);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeCloseTo(3.6889, 3);
  });
});
