/**
 * A tournament that has started but not finished appears in NEITHER "Today"
 * nor "Upcoming" (#1496). It vanishes for days 2..N.
 *
 * Both sections filter on `start_time` alone. Day 3 of a four-day event
 * satisfies neither: its start is in the past (so not Upcoming) and not inside
 * today (so not Today).
 *
 * Measured against production — Guilford College, simulating 2026-04-20, day 3
 * of the ODAC Championship (stored Apr 18 -> Apr 21), using the team's own
 * Eastern day bounds:
 *
 *     shows_in_TODAY            0
 *     counted_as_UPCOMING      42   (42 future events, none of them the one
 *                                    happening now)
 *     actually_running_today     1
 *
 * All 14 multi-day all-day events in production are tournaments, and every one
 * is invisible after its first day. NCAA Championship (May 8-16) is missing on
 * eight of its nine days.
 *
 * Membership is the wrong test; OVERLAP is the right one. And the end bound is
 * the trap: `golf_events.end_time` for an all-day row is UTC midnight on the
 * INCLUSIVE last day (`golf.ts` writes the coach's End Date verbatim), so a
 * naive instant comparison still drops the final day — the one-day-early bug
 * #1493/#1494/#1495 each hit in turn. `eventDaySpan` is the settled answer and
 * this builds the day test on it rather than re-deriving one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { eventRunsOnDay } from '../timezone';

const TZ = 'America/New_York';
const ORIGINAL_TZ = process.env.TZ;

/** The ODAC Championship as production stores it: all-day, Apr 18 -> Apr 21. */
const TOURNAMENT = {
  start_time: '2026-04-18T00:00:00+00:00',
  end_time: '2026-04-21T00:00:00+00:00',
  all_day: true,
};

/** A normal timed practice on Apr 20, 3pm Eastern. */
const PRACTICE = {
  start_time: '2026-04-20T19:00:00+00:00',
  end_time: '2026-04-20T21:00:00+00:00',
  all_day: false,
};

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('eventRunsOnDay', () => {
  it('finds a multi-day tournament on its MIDDLE days — the #1496 case', () => {
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-19')).toBe(true);
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-20')).toBe(true);
  });

  it('finds it on the first day', () => {
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-18')).toBe(true);
  });

  it('finds it on the LAST day — end_time is inclusive, not exclusive', () => {
    // The one-day-early trap: treating end_time as an exclusive bound drops
    // the final round of every tournament.
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-21')).toBe(true);
  });

  it('excludes the day before and the day after', () => {
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-17')).toBe(false);
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-22')).toBe(false);
  });

  it('still works for an ordinary single-day timed event', () => {
    expect(eventRunsOnDay(PRACTICE, TZ, '2026-04-20')).toBe(true);
    expect(eventRunsOnDay(PRACTICE, TZ, '2026-04-19')).toBe(false);
    expect(eventRunsOnDay(PRACTICE, TZ, '2026-04-21')).toBe(false);
  });

  it('answers the same way whatever zone the SERVER happens to run in', () => {
    // The team's timezone decides the day, never the runtime's. CI runs UTC;
    // a Vercel region or a laptop must not change what a coach sees.
    for (const serverZone of ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway']) {
      process.env.TZ = serverZone;
      expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-20')).toBe(true);
      expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-22')).toBe(false);
    }
  });

  it('accepts a full ISO day bound as well as a bare date', () => {
    // `getTodayRange` hands back `${dateStr}T00:00:00` in the team zone.
    expect(eventRunsOnDay(TOURNAMENT, TZ, '2026-04-20T00:00:00')).toBe(true);
  });

  it('is false for an event with no start at all rather than throwing', () => {
    expect(eventRunsOnDay({ start_time: null, end_time: null }, TZ, '2026-04-20')).toBe(false);
  });

  it('collapses an inverted or unparseable end to a single day', () => {
    const corrupt = { start_time: '2026-04-18T00:00:00+00:00', end_time: 'nonsense', all_day: true };
    expect(eventRunsOnDay(corrupt, TZ, '2026-04-18')).toBe(true);
    expect(eventRunsOnDay(corrupt, TZ, '2026-04-19')).toBe(false);
  });
});
