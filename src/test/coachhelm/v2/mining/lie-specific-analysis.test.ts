import { describe, it, expect } from 'vitest';
import { normalizeMissDirection } from '@/lib/coachhelm/v2/mining/lie-specific-analysis';

describe('normalizeMissDirection', () => {
  it.each([
    ['left', 'left'],
    ['Left', 'left'],
    ['l', 'left'],
    ['right', 'right'],
    ['r', 'right'],
    ['short', 'short'],
    ['s', 'short'],
    ['long', 'long'],
    ['Long', 'long'],
    ['lng', 'long'],
    ['short_left', 'short_left'],
    ['long left', 'long_left'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeMissDirection(input)).toBe(expected);
  });

  it('returns "none" for null / empty / unknown', () => {
    expect(normalizeMissDirection(null)).toBe('none');
    expect(normalizeMissDirection('')).toBe('none');
    expect(normalizeMissDirection('sideways')).toBe('none');
  });

  it('never maps "long" to "left" (prior unreachable-branch bug LIVE-15)', () => {
    expect(normalizeMissDirection('long')).toBe('long');
    expect(normalizeMissDirection('LONG')).toBe('long');
    expect(normalizeMissDirection('lng')).toBe('long');
  });
});
