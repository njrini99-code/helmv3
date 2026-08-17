/**
 * `src/lib/utils/timezone.ts` had ZERO tests, on a live path: all three of its
 * exports feed the golf home dashboard (`dashboard-data.ts`,
 * `(dashboard)/dashboard/page.tsx`, `FairwayCoachDashboard`, `DaySchedule`,
 * `DayScheduleSwipe`). Found 2026-08-17 by a reachability sweep for exported
 * functions no test file names.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE "FIXING THE TIMEZONE" IN `getTodayRangeForTz`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The docstring says "the start and end of today in the given timezone". It is
 * not true, and the tests below pin what is actually returned so nobody has to
 * re-derive it: a FLOATING, zone-less stamp — `2026-08-17T00:00:00` — carrying
 * the correct calendar DATE for that zone and no offset at all.
 *
 * Every consumer hands that string straight to PostgREST as a filter on
 * `golf_events.start_time`, which is `timestamptz`. Postgres casts a zone-less
 * literal in the SESSION zone, and this project's session zone is UTC
 * (verified against production: `current_setting('TimeZone')` = `UTC`). So the
 * window the database actually applies is the UTC day, not the team's day.
 *
 * Measured, not assumed. Asserting the docstring's own claim fails like this:
 *
 *     - Expected            + Received
 *     - "localHourOfStart": "0"
 *     + "localHourOfStart": "20"
 *
 * All ten teams in production are `America/New_York`, so "today" opens at 8pm
 * the previous evening and closes at 7:59:59pm — a four-hour skew on every
 * team, every day.
 *
 * THE TRAP: that skew is also the only reason all-day events are right.
 * An all-day `golf_event` is persisted at UTC midnight and the date AS WRITTEN
 * IN UTC is the intended calendar date (the doctrine `eventCalendarDay` in
 * `@/lib/calendar/timezone` states at length). There are 44 such rows. Under
 * today's zone-less window they land on the correct day. Re-zone this helper to
 * emit true local-day instants — `2026-08-17T04:00:00Z` — and all 44 fall out
 * of their own day and reappear the next one. The naive fix trades one
 * mis-sectioned timed event for forty-four wrong all-day events.
 *
 * So the window is deliberately NOT changed here. Correcting it needs a
 * semantics decision — do all-day rows bucket by UTC date or team-local date? —
 * and the same window is also passed to the `get_coach_today_schedule`
 * SECURITY DEFINER function, which declares both params `timestamptz` and does
 * no re-zoning of its own. That is queued with #1496's coach half, which
 * already wants a `p_today_date` parameter on that very function.
 *
 * The blast radius today is ONE event, and it is mis-sectioned rather than
 * lost: `.gte('start_time', todayEnd)` makes the player dashboard's Upcoming
 * list contiguous with Today, so a 9pm event renders under the wrong heading.
 */
import { describe, it, expect } from 'vitest';
import {
  getTodayRangeForTz,
  formatTimeInTz,
  getCurrentDecimalHourInTz,
} from '@/lib/utils/timezone';

/** How Postgres reads these strings: zone-less literal, session zone UTC. */
function asDatabaseInstant(floating: string): Date {
  return new Date(`${floating}Z`);
}

function hourIn(tz: string, at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(at),
  );
}

describe('getTodayRangeForTz — returns a floating stamp, not an instant', () => {
  it('carries no offset and no Z', () => {
    const { start, end } = getTodayRangeForTz('America/New_York');
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59$/);
  });

  it('both bounds carry the SAME calendar date, and it is that zone\'s date', () => {
    for (const tz of ['America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway', 'UTC']) {
      const { start, end } = getTodayRangeForTz(tz);
      const expected = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      expect(start.split('T')[0], tz).toBe(expected);
      expect(end.split('T')[0], tz).toBe(expected);
    }
  });

  it('the date half is what callers slice off for day comparisons', () => {
    // `dashboard-data.ts` does `todayStart.split('T')[0]` for the task-overdue
    // comparison. That half IS correct for the team's zone — it is only the
    // instant interpretation that skews.
    const { start } = getTodayRangeForTz('Pacific/Kiritimati');
    expect(start.split('T')[0]).toBe(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Kiritimati', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date()),
    );
  });

  it('DOES NOT bound the team-local day once the database reads it — the 4-hour skew', () => {
    // The failing assertion quoted in this file's header, kept as a live check
    // rather than a comment: if someone re-zones the helper, this flips and the
    // all-day guard below flips with it, which is the point.
    const { start } = getTodayRangeForTz('America/New_York');
    const opensAt = hourIn('America/New_York', asDatabaseInstant(start));
    expect(opensAt).not.toBe(0);
    // 20:00 under EDT (UTC-4), 19:00 under EST (UTC-5). Either way, the
    // previous evening.
    expect([19, 20]).toContain(opensAt);
  });
});

describe('getTodayRangeForTz — the all-day guard', () => {
  /**
   * An all-day event for date D is stored at exactly `D 00:00:00Z`. The window
   * must contain that instant, or the event drops off its own day.
   *
   * This is the assertion that breaks if the helper is "corrected" to emit
   * local-day instants — which is exactly the warning this test exists to
   * deliver. 44 rows in production depend on it.
   */
  it('contains the UTC-midnight instant of its own date, which is where all-day rows live', () => {
    for (const tz of ['America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway']) {
      const { start, end } = getTodayRangeForTz(tz);
      const dateOnly = start.split('T')[0]!;
      const allDayStorageInstant = new Date(`${dateOnly}T00:00:00Z`);

      expect(asDatabaseInstant(start).getTime(), tz).toBeLessThanOrEqual(
        allDayStorageInstant.getTime(),
      );
      expect(asDatabaseInstant(end).getTime(), tz).toBeGreaterThan(allDayStorageInstant.getTime());
    }
  });
});

describe('formatTimeInTz', () => {
  it('renders the wall-clock time of the target zone, not the runtime zone', () => {
    const iso = '2026-08-17T18:30:00Z';
    expect(formatTimeInTz(iso, 'UTC')).toBe('6:30 PM');
    expect(formatTimeInTz(iso, 'America/New_York')).toBe('2:30 PM');
  });

  it('crosses the date line without losing the time', () => {
    const iso = '2026-08-17T12:00:00Z';
    expect(formatTimeInTz(iso, 'Pacific/Kiritimati')).toBe('2:00 AM'); // +14
    expect(formatTimeInTz(iso, 'Pacific/Midway')).toBe('1:00 AM');     // -11
  });

  it('honours DST rather than a fixed offset', () => {
    // Same wall clock in New York, one in EDT and one in EST.
    expect(formatTimeInTz('2026-07-01T16:00:00Z', 'America/New_York')).toBe('12:00 PM');
    expect(formatTimeInTz('2026-01-01T17:00:00Z', 'America/New_York')).toBe('12:00 PM');
  });
});

describe('getCurrentDecimalHourInTz', () => {
  /**
   * Contract test, not a fix. `Intl` with `hour12: false` on `en-US` has an
   * engine-dependent history of answering "24" for midnight (hourCycle h24 vs
   * h23); Node 22 answers "00", and no failure has been observed here. This
   * pins the range the consumers assume — `FairwayCoachDashboard` positions a
   * now-line from it — so a browser that disagrees is caught rather than
   * silently drawing the line off the bottom of the day.
   */
  it('is always within a single day', () => {
    for (const tz of ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway']) {
      const h = getCurrentDecimalHourInTz(tz);
      expect(h, tz).toBeGreaterThanOrEqual(0);
      expect(h, tz).toBeLessThan(24);
    }
  });

  it('carries the minute as a fraction', () => {
    const h = getCurrentDecimalHourInTz('UTC');
    const frac = h % 1;
    // Minutes only, so the fraction is always a sixtieth.
    expect(Math.abs(frac * 60 - Math.round(frac * 60))).toBeLessThan(1e-9);
  });

  it('differs between two zones by their offset', () => {
    const utc = getCurrentDecimalHourInTz('UTC');
    const ny = getCurrentDecimalHourInTz('America/New_York');
    // mod 24 so the comparison survives the day boundary.
    const delta = ((utc - ny) % 24 + 24) % 24;
    expect([4, 5]).toContain(Math.round(delta)); // EDT or EST
  });
});
