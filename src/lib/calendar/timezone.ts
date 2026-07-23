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
