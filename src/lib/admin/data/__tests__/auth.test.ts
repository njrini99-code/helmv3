import { describe, it, expect } from 'vitest';
import { detectFailureBurst, parseAuthFilters, trailingUtcDays, bucketDailyCounts } from '@/lib/admin/data/auth';

const now = new Date('2026-07-01T12:00:00Z');
const at = (minAgo: number) => ({ created_at: new Date(now.getTime() - minAgo * 60000).toISOString() });

describe('detectFailureBurst', () => {
  it('flags >= threshold failures inside the window', () => {
    expect(detectFailureBurst([at(1), at(5), at(9), at(14)], 15, 4, now)).toBe(true);
  });
  it('ignores failures outside the window', () => {
    expect(detectFailureBurst([at(1), at(20), at(40), at(60)], 15, 4, now)).toBe(false);
  });
  it('quiet feed → no burst', () => {
    expect(detectFailureBurst([], 15, 4, now)).toBe(false);
  });
});

describe('parseAuthFilters', () => {
  it('accepts a valid sport/eventType/q combination', () => {
    expect(parseAuthFilters({ sport: 'golf', eventType: 'login', q: ' nick@example.com ' })).toEqual({
      sport: 'golf',
      eventType: 'login',
      q: 'nick@example.com',
    });
  });
  it('drops unknown/invalid values instead of throwing', () => {
    expect(parseAuthFilters({ sport: 'lacrosse', eventType: 'onboarding', q: '' })).toEqual({});
  });
  it('takes the first value when a param repeats', () => {
    expect(parseAuthFilters({ sport: ['golf', 'baseball'] })).toEqual({ sport: 'golf' });
  });
  it('empty searchParams → no filters', () => {
    expect(parseAuthFilters({})).toEqual({});
  });
});

describe('trailingUtcDays', () => {
  it('returns `days` UTC-midnight-aligned boundaries ending today, oldest → newest', () => {
    const days = trailingUtcDays(3, now); // now = 2026-07-01T12:00:00Z
    expect(days.map((d) => d.label)).toEqual(['06-29', '06-30', '07-01']);
    expect(days[0]?.startIso).toBe('2026-06-29T00:00:00.000Z');
    expect(days[0]?.endIso).toBe('2026-06-30T00:00:00.000Z');
    expect(days[2]?.startIso).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('bucketDailyCounts', () => {
  it('buckets rows into their UTC calendar day, zero-filling quiet days', () => {
    const rows = [
      { created_at: '2026-06-29T23:59:00Z' },
      { created_at: '2026-07-01T01:00:00Z' },
      { created_at: '2026-07-01T23:00:00Z' },
    ];
    expect(bucketDailyCounts(rows, 3, now)).toEqual([
      { x: '06-29', y: 1 },
      { x: '06-30', y: 0 },
      { x: '07-01', y: 2 },
    ]);
  });
  it('an empty row set → an explicit zero bucket per day, never a shorter series', () => {
    expect(bucketDailyCounts([], 3, now)).toEqual([
      { x: '06-29', y: 0 },
      { x: '06-30', y: 0 },
      { x: '07-01', y: 0 },
    ]);
  });
});
