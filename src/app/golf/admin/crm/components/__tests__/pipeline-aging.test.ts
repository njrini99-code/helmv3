import { describe, it, expect } from 'vitest';
import { daysBetween, agingTier, median } from '../pipeline-aging';

describe('daysBetween', () => {
  it('returns 0 for a timestamp exactly now', () => {
    const now = Date.now();
    expect(daysBetween(new Date(now).toISOString(), now)).toBe(0);
  });

  it('returns whole days elapsed, floored', () => {
    const now = Date.now();
    const fiveAndAHalfDaysAgo = now - 5.6 * 24 * 60 * 60 * 1000;
    expect(daysBetween(new Date(fiveAndAHalfDaysAgo).toISOString(), now)).toBe(5);
  });

  it('clamps to 0 for a future timestamp (clock skew / bad data)', () => {
    const now = Date.now();
    const oneDayFromNow = now + 24 * 60 * 60 * 1000;
    expect(daysBetween(new Date(oneDayFromNow).toISOString(), now)).toBe(0);
  });

  it('returns 0 for an unparsable date string', () => {
    expect(daysBetween('not-a-date')).toBe(0);
  });
});

describe('agingTier', () => {
  it('classifies < 14 days as fresh', () => {
    expect(agingTier(0)).toBe('fresh');
    expect(agingTier(13)).toBe('fresh');
  });

  it('classifies 14-30 days (inclusive) as aging', () => {
    expect(agingTier(14)).toBe('aging');
    expect(agingTier(20)).toBe('aging');
    expect(agingTier(30)).toBe('aging');
  });

  it('classifies > 30 days as stale', () => {
    expect(agingTier(31)).toBe('stale');
    expect(agingTier(100)).toBe('stale');
  });
});

describe('median', () => {
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for an odd-length array', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('averages the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('does not mutate the input array', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it('handles a single-element array', () => {
    expect(median([7])).toBe(7);
  });
});
