import { describe, it, expect } from 'vitest';
import { isoStartOfUtcDay } from '../_data';

describe('isoStartOfUtcDay', () => {
  it('returns UTC midnight for the given day with daysAgo=0', () => {
    const now = new Date('2026-07-02T18:34:12.000Z');
    expect(isoStartOfUtcDay(now)).toBe('2026-07-02T00:00:00.000Z');
  });

  it('steps back N days, crossing a month boundary correctly', () => {
    const now = new Date('2026-07-01T05:00:00.000Z');
    expect(isoStartOfUtcDay(now, 1)).toBe('2026-06-30T00:00:00.000Z');
  });

  it('steps back across a year boundary correctly', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(isoStartOfUtcDay(now, 1)).toBe('2025-12-31T00:00:00.000Z');
  });
});
