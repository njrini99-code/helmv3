import { describe, it, expect } from 'vitest';
import { wilsonInterval, meanInterval, rateIntervalText } from './interval';

describe('wilsonInterval', () => {
  it('brackets the observed rate and stays inside 0-100', () => {
    const ci = wilsonInterval(4, 5);
    expect(ci.low).toBeGreaterThan(0);
    expect(ci.high).toBeLessThanOrEqual(100);
    expect(ci.low).toBeLessThan(80);
    expect(ci.high).toBeGreaterThan(80);
  });
  it('matches the textbook Wilson value for 8/20 (21.9%-61.3%)', () => {
    const ci = wilsonInterval(8, 20);
    expect(ci.low).toBeCloseTo(21.9, 1);
    expect(ci.high).toBeCloseTo(61.3, 1);
  });
  it('is uninformative at n = 0', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 100 });
  });
  it('formats as a prose clause', () => {
    expect(rateIntervalText({ low: 21.9, high: 61.3 })).toBe(' (95% range 22-61%)');
  });
});

describe('meanInterval', () => {
  it('is unbounded with fewer than two values', () => {
    expect(meanInterval([0.5]).low).toBe(-Infinity);
  });
  it('uses the sample SD', () => {
    const ci = meanInterval([0, 1, 0, 1]);
    expect(ci.mean).toBe(0.5);
    expect(ci.se).toBeCloseTo(Math.sqrt(1 / 3 / 4), 10);
  });
});
