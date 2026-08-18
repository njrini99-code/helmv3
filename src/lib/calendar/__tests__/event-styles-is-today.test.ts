/**
 * `isToday` is on the calendar's hot path and had NO test of any kind.
 *
 * Found 2026-08-18 by sweeping every exported function under `src/lib/golf`,
 * `src/lib/calendar`, `src/lib/coachhelm` and `src/lib/recruiting` for symbols
 * no test file so much as names — 161 of them. This one ranked first because
 * its three call sites are the calendar itself:
 *
 *     DayView.tsx:241    isToday(date.toISOString())
 *     WeekView.tsx:329   isToday(date.toISOString())
 *     MonthView.tsx:290  isToday(date.toISOString())
 *
 * (A repo-wide grep for `isToday(` also hits CalendarView, MobileEventCard and
 * CalendarDayViewSwipeable — those import date-fns' `isToday`, a different
 * function, and are not covered here.)
 *
 * WHAT IS AND IS NOT BROKEN. All three live callers hand it
 * `someDate.toISOString()`. `new Date(d.toISOString())` reconstructs the very
 * same instant, so reading local getters off it answers the same local day `d`
 * was in — lossless, and correct in every zone. **The calendar is not showing
 * the wrong day today**, and the first four tests below pin that so a
 * "cleanup" cannot quietly take it away.
 *
 * The trap is the parameter: it is typed and named `dateString`, documented as
 * nothing more specific, and a bare `"2026-08-18"` is the single input shape
 * that breaks it. JS parses a date-only string at UTC midnight, and the
 * comparison then reads LOCAL fields off that instant, so west of Greenwich
 * every date-only day resolves to the one before:
 *
 *     TZ=America/New_York
 *     new Date('2026-08-18').getDate()   ->  17
 *
 * That is the exact one-day-early shape `eventCalendarDay` in ./timezone.ts was
 * written for after the Guilford all-day-event report.
 *
 * TO BE PRECISE ABOUT HOW REACHABLE THAT IS — measured against production
 * 2026-08-18, not assumed. `golf_events` has NO date-only column at all: it
 * carries `all_day boolean` plus `start_time` / `end_time` as `timestamptz`.
 * So no calendar caller can produce a bare `YYYY-MM-DD` today, and the branch
 * below has zero live callers. What makes it worth six lines rather than a
 * comment is that 29 `date` columns DO exist across `golf_*`, several of them
 * on things that get drawn onto a calendar — `golf_qualifiers.start_date` /
 * `end_date`, `golf_travel_itineraries.departure_date` / `return_date`,
 * `golf_tasks.due_date` — and PostgREST hands those back as exactly that bare
 * string. The trap is one import away, not in flight.
 *
 * A full timestamp is deliberately left alone: `2026-08-18T00:00:00+00:00` is a
 * real instant, a timed event genuinely means its local moment, and only the
 * `allDay` flag — which this function does not receive — could say otherwise.
 * Guessing there is how the ical writer got it wrong in both directions at once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isToday } from '../event-styles';

const ORIGINAL_TZ = process.env.TZ;

/** Node re-reads `process.env.TZ` on assignment, so this really moves the zone. */
function useZone(tz: string): void {
  process.env.TZ = tz;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** 2026-08-18, mid-morning UTC — a normal weekday, no DST edge involved. */
const NOW = new Date('2026-08-18T14:00:00.000Z');

/** The zones the audit loop requires for anything time-related, plus CI's own. */
const ZONES = ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway'];

describe('isToday — the three live callers pass an instant, and that must keep working', () => {
  for (const tz of ZONES) {
    it(`round-trips a Date through toISOString correctly in ${tz}`, () => {
      useZone(tz);
      vi.setSystemTime(NOW);

      // Exactly what DayView / WeekView / MonthView do.
      const today = new Date();
      expect(isToday(today.toISOString())).toBe(true);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isToday(tomorrow.toISOString())).toBe(false);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday.toISOString())).toBe(false);
    });
  }
});

describe('isToday — a date-only string is a CALENDAR DAY, not a UTC instant', () => {
  it('is true for the local calendar day west of Greenwich (America/New_York)', () => {
    useZone('America/New_York');
    vi.setSystemTime(NOW); // 10:00 EDT on the 18th

    // new Date('2026-08-18').getDate() is 17 in this zone.
    expect(isToday('2026-08-18')).toBe(true);
  });

  it('is true for the local calendar day at the far western edge (Pacific/Midway, -11)', () => {
    useZone('Pacific/Midway');
    // 03:00Z on the 18th is 16:00 on the 17th in Midway.
    vi.setSystemTime(new Date('2026-08-18T03:00:00.000Z'));

    expect(isToday('2026-08-17')).toBe(true);
    expect(isToday('2026-08-18')).toBe(false);
  });

  it('is true for the local calendar day east of Greenwich (Pacific/Kiritimati, +14)', () => {
    useZone('Pacific/Kiritimati');
    // 14:00Z on the 18th is 04:00 on the 19th in Kiritimati.
    vi.setSystemTime(NOW);

    expect(isToday('2026-08-19')).toBe(true);
    expect(isToday('2026-08-18')).toBe(false);
  });

  it('is true under CI’s own zone (UTC)', () => {
    useZone('UTC');
    vi.setSystemTime(NOW);

    expect(isToday('2026-08-18')).toBe(true);
    expect(isToday('2026-08-19')).toBe(false);
  });

  it('rejects a neighbouring day rather than smearing across the boundary', () => {
    useZone('America/New_York');
    vi.setSystemTime(NOW);

    expect(isToday('2026-08-17')).toBe(false);
    expect(isToday('2026-08-19')).toBe(false);
  });
});

describe('isToday — malformed input stays falsy rather than throwing', () => {
  it('returns false for an unparseable string', () => {
    useZone('UTC');
    vi.setSystemTime(NOW);

    expect(isToday('not a date')).toBe(false);
    expect(isToday('')).toBe(false);
  });
});
