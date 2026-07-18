/**
 * Regression test for #920 (insight-staleness engine, fix 4/4): the Brief's
 * "updated" freshness label used to render a fabricated time-of-day (e.g.
 * "Jun 8, 8:00 PM") from `lastAnalyzed`, which is actually a plain
 * 'YYYY-MM-DD' calendar date (`golf_rounds.round_date` — a DATE column with
 * no time component; see getTeamCategoryInsights in team-category-insights.ts).
 *
 * The old implementation did `new Date(dateOnly).toISOString()` upstream,
 * then `new Date(iso).toLocaleString(..., { hour, minute })` here — parsing
 * the date-only string as UTC MIDNIGHT and localizing that fabricated
 * instant to the viewer's timezone. That (a) invented a specific clock time
 * the round never had, and (b) for viewers west of UTC, silently shifted the
 * calendar date itself back a day (UTC midnight → the previous evening
 * local).
 *
 * `formatAnalyzed` must show the DATE ONLY, and must be immune to the
 * viewer's local timezone (both the parse and the format are UTC-anchored).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatAnalyzed } from './FairwayBrief';

describe('FairwayBrief formatAnalyzed (#920 fix 4 — fake timestamp)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the date only — no time-of-day', () => {
    const label = formatAnalyzed('2026-06-08');
    expect(label).toBe('Jun 8');
    // Never a clock time.
    expect(label).not.toMatch(/\d{1,2}:\d{2}/);
    expect(label).not.toMatch(/AM|PM/i);
  });

  it('does not shift the calendar date for a viewer WEST of UTC', () => {
    // The old bug: `new Date('2026-06-08')` parses as 2026-06-08T00:00:00Z,
    // and formatting that WITHOUT an explicit UTC timeZone falls back to the
    // runtime's local zone — pushing the displayed date back to "Jun 7" for
    // a viewer west of UTC (midnight UTC = the previous evening locally).
    // Stub TZ to a real west-of-UTC zone and confirm the UTC-anchored
    // implementation is immune to it.
    vi.stubEnv('TZ', 'Etc/GMT+12'); // UTC-12 (POSIX Etc/GMT signs are inverted)
    expect(formatAnalyzed('2026-06-08')).toBe('Jun 8');
  });

  it('does not shift the calendar date for a viewer EAST of UTC', () => {
    // Symmetric case: a viewer east of UTC must also see the SAME calendar
    // day, not a fabricated "Jun 9".
    vi.stubEnv('TZ', 'Etc/GMT-14'); // UTC+14
    expect(formatAnalyzed('2026-06-08')).toBe('Jun 8');
  });

  it('handles a single-digit day and end-of-month/year boundaries', () => {
    expect(formatAnalyzed('2026-01-05')).toBe('Jan 5');
    expect(formatAnalyzed('2026-12-31')).toBe('Dec 31');
  });

  it('returns empty string for an invalid or empty date', () => {
    expect(formatAnalyzed('')).toBe('');
    expect(formatAnalyzed('not-a-date')).toBe('');
  });
});
