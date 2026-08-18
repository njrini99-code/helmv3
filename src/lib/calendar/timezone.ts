/**
 * Timezone Utilities for Calendar Operations
 *
 * Provides consistent timezone handling across the calendar system.
 * All times are stored in UTC in the database and converted to local
 * timezone for display.
 *
 * Key principles:
 * 1. Store in UTC - All database timestamps are UTC
 * 2. Display in local - Convert to team/user timezone for display
 * 3. Handle DST - Use IANA timezone names (e.g., 'America/New_York')
 */

import { format } from 'date-fns';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default timezone used when no team or user timezone is set
 * This should match the most common user timezone
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Format just the date portion for iCal (all-day events)
 */
export function formatICalDate(date: Date): string {
  return format(date, 'yyyyMMdd');
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a string is a valid IANA timezone
 */
function isValidTimezone(timezone: string): boolean {
  try {
    // Attempt to use the timezone - will throw if invalid
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a valid timezone, falling back to default if invalid
 */
export function getValidTimezone(timezone: string | null | undefined): string {
  if (timezone && isValidTimezone(timezone)) {
    return timezone;
  }
  return DEFAULT_TIMEZONE;
}

/**
 * Format an ISO timestamp as a 12-hour wall-clock time ("6:00 PM") anchored to
 * `timezone` (falls back to DEFAULT_TIMEZONE via getValidTimezone).
 *
 * DETERMINISM (audit W1 — calendar times shift ~4h and disagree between the
 * Agenda row and the Event Detail drawer for the SAME event): the previous
 * call sites used `format(new Date(iso), 'h:mm a')` (date-fns), which reads
 * the EXECUTING environment's own local timezone. SSR on Vercel runs in UTC
 * while the browser (and this team) is America/New_York — the exact same
 * start_time therefore rendered ~4-5h apart depending on whether the string
 * came from the server-rendered HTML or a client re-render, and because
 * those spans were marked `suppressHydrationWarning`, React never patched the
 * server text to match — it stuck until something else forced a re-render.
 * An explicit `timeZone` in Intl.DateTimeFormat is NOT affected by the
 * runtime's own local zone, so server and client now always compute the
 * identical string for the identical instant.
 */
export function formatEventTime(iso: string, timezone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getValidTimezone(timezone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Compact variant with no AM/PM — for tight spaces (month-grid chips) that
 * previously used date-fns `format(date, 'h:mm')`.
 */
export function formatEventTimeCompact(iso: string, timezone: string | null | undefined): string {
  return formatEventTime(iso, timezone).replace(/\s?[AP]M$/i, '');
}

/**
 * Format an ISO timestamp as a long weekday+month+day label ("Monday, July
 * 20") anchored to `timezone` — the date-line sibling of formatEventTime.
 * Same determinism rationale: an evening event (e.g. 8 PM ET) is already the
 * next UTC day, so date-fns' implicit-local `format(date, 'EEEE, MMMM d')`
 * could disagree between an SSR (UTC) and client (ET) render of the exact
 * same instant just as easily as the time-of-day did.
 */
export function formatEventDateLabel(iso: string, timezone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getValidTimezone(timezone),
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * The {year, month, day} calendar fields of an ISO instant AS SEEN in
 * `timezone` — computed via `Intl.DateTimeFormat`'s explicit `timeZone`, so
 * the result never depends on the calling process's own ambient zone.
 */
export function getZonedDateParts(
  iso: string,
  timezone: string | null | undefined,
): { year: number; month: number; day: number } {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: getValidTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * The calendar-day "midnight" of an ISO instant, anchored to `timezone`, as a
 * plain local `Date` (constructed via `new Date(year, month - 1, day)`).
 *
 * WHY a "local" Date and not a UTC one: every downstream consumer (date-fns
 * `isSameDay` / `startOfDay` / `format('yyyy-MM-dd')` / `addDays`, etc.)
 * reads a Date's calendar fields through its OWN process's local getters
 * (`getFullYear`/`getMonth`/`getDate`). Those getters are the exact inverse
 * of the `new Date(y, m, d)` constructor WITHIN THE SAME PROCESS, so once the
 * (y, m, d) triple itself is derived deterministically (via the explicit
 * `timeZone` above, not the process's own ambient zone), every date-fns call
 * downstream reproduces that identical triple on server and client alike —
 * even though the two processes disagree about what absolute instant that
 * local Date object actually represents internally.
 *
 * ROOT CAUSE this guards against (calendar audit — React #418 on /calendar):
 * the previous seed was `new Date(year, month, date)` built directly from
 * `d.getFullYear()/d.getMonth()/d.getDate()` of an ISO-parsed instant — i.e.
 * implicit-local. SSR (Vercel, UTC) and the browser (America/New_York) read
 * DIFFERENT calendar fields for the same instant whenever that instant falls
 * within the ~4-5h UTC/ET offset window straddling midnight (a serverNow of
 * "10:30 PM ET" is already "the next day" in UTC), so `focusDate`/`nowRef`
 * — and every event bucketed by day — could silently disagree between the
 * server-rendered HTML and the first client render.
 */
export function zonedMidnight(iso: string, timezone: string | null | undefined): Date {
  const { year, month, day } = getZonedDateParts(iso, timezone);
  return new Date(year, month - 1, day);
}

/**
 * The calendar day an EVENT belongs on — the only correct way to bucket one
 * into a day cell, because all-day and timed events store their day
 * differently.
 *
 * An all-day event has no time of day. It is persisted as UTC midnight, so the
 * date *as written in UTC* IS the intended calendar date: "Freshman Move-In on
 * August 14" is stored `2026-08-14T00:00:00Z`. Running that through
 * `zonedMidnight` re-reads it as an instant and converts it to the viewer's
 * zone — 8 PM on August 13 in America/New_York — putting an all-day event one
 * cell too early for every user west of UTC. That is exactly what a Guilford
 * coach reported on 2026-08-04: five all-day events (move-in, check-in, first
 * day of class…) each rendered one day early on the month grid, while every
 * timed event on the same screen was correct.
 *
 * A timed event is a real instant and must be converted, or an 8 PM ET event
 * shows up on tomorrow's cell.
 *
 * So: branch on `all_day`. Do NOT "simplify" this back to a single
 * `zonedMidnight` call.
 */
/**
 * The inclusive range of calendar days an event OCCUPIES.
 *
 * The counterpart to `eventCalendarDay`, which answers "what day does this
 * start on". Every surface that buckets events by day needs this one instead,
 * because reading only the start makes a multi-day event visible on exactly one
 * day: a coach who opened the calendar on the Saturday of a four-day tournament
 * got "Nothing on the books for this day" (month grid, agenda day mode, agenda
 * range mode and the day-view hero count all had it). #1493 is the same
 * neglected column reaching the two ICS feeds.
 *
 * `end_time` is the INCLUSIVE last day — `golf.ts` writes the coach's End Date
 * field verbatim as `${endDate}T00:00:00+00:00` and the editor renders it back
 * as "Sep 3 → Sep 6". iCal's exclusive DTEND is the odd one out and converts on
 * the way out; nothing else should pre-shift it.
 *
 * An absent, unparseable or inverted end collapses to a single day. That is the
 * pre-existing behaviour and the right floor — a corrupt row costs its own
 * span, never an unbounded loop in the caller.
 *
 * Structural param rather than `CalendarEvent` so this stays free of any
 * component/hook import; every caller's row shape satisfies it.
 */
export function eventDaySpan(
  ev: {
    start_date?: string | null;
    start_time?: string | null;
    end_date?: string | null;
    end_time?: string | null;
    all_day?: boolean | null;
  },
  timezone: string | null | undefined,
): { first: Date; last: Date } | null {
  const startStr = ev.start_date || ev.start_time;
  if (!startStr) return null;
  const first = eventCalendarDay(startStr, ev.all_day, timezone);
  if (Number.isNaN(first.getTime())) return null;

  const endStr = ev.end_time || ev.end_date;
  if (!endStr) return { first, last: first };
  const last = eventCalendarDay(endStr, ev.all_day, timezone);
  if (Number.isNaN(last.getTime()) || last < first) return { first, last: first };
  return { first, last };
}

export function eventCalendarDay(
  iso: string,
  allDay: boolean | null | undefined,
  timezone: string | null | undefined,
): Date {
  if (allDay) {
    // Take the calendar date as WRITTEN, without ever parsing it as an instant.
    //
    // This has to be format-agnostic, because the SAME event reaches different
    // surfaces as different strings. The calendar page and `useCalendarEvents`
    // both normalize an all-day event into `start_date` as a zone-less
    // "2026-08-14T00:00:00" (local midnight), while `start_time` stays the raw
    // "2026-08-14T00:00:00+00:00" (UTC midnight). Parsing either as an instant
    // and converting it re-introduces the very shift being fixed — just in
    // opposite directions, so a fix aimed at one input silently breaks the
    // other (UTC-reading is right for `start_time` but wrong for `start_date`
    // east of UTC). The literal date prefix is the one thing both agree on,
    // and it is what an all-day event actually means.
    const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (parts) {
      return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    }
  }

  // An unparseable timestamp yields an Invalid Date rather than a throw.
  // `zonedMidnight` would raise RangeError here (Intl rejects an invalid
  // instant), which turns one malformed row into a blank calendar for the
  // whole team instead of one missing chip.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return date;

  return zonedMidnight(iso, timezone);
}

/**
 * Does `ev` run on the given calendar day, in the TEAM's timezone?
 *
 * Membership-on-start is the wrong test and it is what made a tournament in
 * progress vanish from both dashboards (#1496): day 3 of a four-day event has
 * a start in the past (so it is not Upcoming) and a start outside today (so it
 * is not Today). Measured on production, all 14 multi-day events — every one a
 * tournament — were invisible after their first day; the NCAA Championship
 * (May 8-16) was missing on eight of its nine days.
 *
 * Built on `eventDaySpan` rather than comparing instants, because
 * `golf_events.end_time` for an all-day row is UTC midnight on the INCLUSIVE
 * last day. Comparing instants drops the final round of every tournament —
 * the same one-day-early bug as #1493/#1494/#1495.
 *
 * `day` may be a bare `YYYY-MM-DD` or the `${dateStr}T00:00:00` form
 * `getTodayRange` returns; only the date prefix is read, so the runtime zone
 * cannot change the answer. The team's timezone decides the day, never the
 * server's.
 */
export function eventRunsOnDay(
  ev: {
    start_date?: string | null;
    start_time?: string | null;
    end_date?: string | null;
    end_time?: string | null;
    all_day?: boolean | null;
  },
  timezone: string | null | undefined,
  day: string,
): boolean {
  const span = eventDaySpan(ev, timezone);
  if (!span) return false;
  // `allDay: true` makes eventCalendarDay read the literal Y/M/D prefix, which
  // is exactly the semantics wanted for a calendar-day bound.
  const target = eventCalendarDay(day, true, timezone);
  if (Number.isNaN(target.getTime())) return false;
  return span.first.getTime() <= target.getTime() && target.getTime() <= span.last.getTime();
}
