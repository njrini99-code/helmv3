import { describe, it, expect } from 'vitest';
import { resolveStatsDateRange, toDateOnly, utcYearsAgo } from './stats-date-range';

/**
 * These bounds are compared against `golf_rounds.round_date`, a Postgres
 * `date` column. They must be the SAME calendar day in every runtime zone.
 *
 * The regression this guards: the boundaries were built as
 * `new Date(y, m, 1).toISOString().split('T')[0]` — a LOCAL midnight sliced in
 * UTC. Vercel runs UTC so production was right by accident; anywhere east of
 * Greenwich every bound moved a day earlier. Under TZ=Pacific/Kiritimati (+14)
 * the 2026 season resolved to 2025-12-31 .. 2026-12-30, silently dropping the
 * season's last day and pulling in one from the season before.
 */
describe('resolveStatsDateRange', () => {
  // Mid-month, mid-day UTC — far from any boundary, so a failure can only come
  // from the construction, not from the instant being genuinely near a cusp.
  const now = new Date('2026-05-15T12:00:00Z');

  it('starts "thisMonth" on the first of the UTC month', () => {
    expect(resolveStatsDateRange({ preset: 'thisMonth' }, now).startDate).toBe('2026-05-01');
  });

  it('starts "thisYear" on Jan 1 of the UTC year', () => {
    expect(resolveStatsDateRange({ preset: 'thisYear' }, now).startDate).toBe('2026-01-01');
  });

  it('spans a season from Jan 1 to Dec 31 inclusive', () => {
    expect(resolveStatsDateRange({ season: 2026 }, now)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });

  it('keeps the season bounds off the year either side', () => {
    const { startDate, endDate } = resolveStatsDateRange({ season: 2026 }, now);
    expect(startDate?.startsWith('2026-')).toBe(true);
    expect(endDate?.startsWith('2026-')).toBe(true);
  });

  it('a season overrides an explicit endDate rather than half-applying', () => {
    expect(resolveStatsDateRange({ season: 2025, endDate: '2026-03-01' }, now)).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
  });

  it('passes an explicit custom range through untouched', () => {
    expect(
      resolveStatsDateRange({ preset: 'custom', startDate: '2026-02-03', endDate: '2026-02-09' }, now),
    ).toEqual({ startDate: '2026-02-03', endDate: '2026-02-09' });
  });

  it('returns no bounds for a non-date preset', () => {
    expect(resolveStatsDateRange({ preset: 'tournaments' }, now)).toEqual({
      startDate: null,
      endDate: null,
    });
  });

  it('returns no bounds when there is no filter at all', () => {
    expect(resolveStatsDateRange(undefined, now)).toEqual({ startDate: null, endDate: null });
  });

  // The original bug only showed within the last hours of a local day, so an
  // instant near the UTC cusp is the case most likely to regress.
  it('holds at the UTC day cusp', () => {
    const cusp = new Date('2026-05-01T00:30:00Z');
    expect(resolveStatsDateRange({ preset: 'thisMonth' }, cusp).startDate).toBe('2026-05-01');
    expect(resolveStatsDateRange({ preset: 'thisYear' }, cusp).startDate).toBe('2026-01-01');
  });

  it('handles a December instant without rolling into the next year', () => {
    const dec = new Date('2026-12-31T23:59:00Z');
    expect(resolveStatsDateRange({ preset: 'thisMonth' }, dec).startDate).toBe('2026-12-01');
    expect(resolveStatsDateRange({ preset: 'thisYear' }, dec).startDate).toBe('2026-01-01');
  });
});

describe('utcYearsAgo', () => {
  it('returns the same calendar day one year earlier', () => {
    expect(utcYearsAgo(new Date('2026-05-15T12:00:00Z'), 1)).toBe('2025-05-15');
  });

  it('normalizes 29 Feb to 1 Mar rather than emitting a day that does not exist', () => {
    // 2028 is a leap year; 2027 is not. Subtracting from the digits alone
    // would produce "2027-02-29", an invalid literal for a DATE comparison.
    expect(utcYearsAgo(new Date('2028-02-29T12:00:00Z'), 1)).toBe('2027-03-01');
  });

  it('keeps 29 Feb when the target year is also a leap year', () => {
    expect(utcYearsAgo(new Date('2028-02-29T12:00:00Z'), 4)).toBe('2024-02-29');
  });

  it('reads UTC fields, so an instant near the day cusp does not shift', () => {
    expect(utcYearsAgo(new Date('2026-01-01T00:30:00Z'), 1)).toBe('2025-01-01');
  });
});

describe('toDateOnly', () => {
  it('zero-pads month and day', () => {
    expect(toDateOnly(2026, 1, 5)).toBe('2026-01-05');
  });

  it('takes a 1-12 calendar month, not a 0-indexed JS month', () => {
    expect(toDateOnly(2026, 12, 31)).toBe('2026-12-31');
  });
});
