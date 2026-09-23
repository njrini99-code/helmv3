/**
 * Shared editorial date formatting for Fairway surfaces.
 *
 * Fairway's house short-date style is already the de-facto convention across
 * the kit (FairwayTasks, FairwayRoundsLibrary, FairwayAnnouncements, etc.):
 * `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → "Jan 5".
 * A bare `date.toLocaleDateString()` with no locale/options silently falls
 * back to the runtime's default locale/format instead of that house style —
 * this helper centralizes the one-liner so call sites reach for the product's
 * actual convention instead of the locale default.
 */
/**
 * A bare `YYYY-MM-DD` — a Postgres `date` column as PostgREST serialises it.
 *
 * These must NOT go through `new Date(value)`, which reads them as UTC
 * midnight. Formatted in any zone west of Greenwich that renders the day
 * before, and across a month boundary it changes the month too:
 *
 *     TZ=America/New_York
 *     formatShortDate('2026-07-01')  ->  'Jun 30'
 *
 * A full timestamp is a real instant and, by default, renders in the local
 * zone. A caller with a stable metadata-date contract can supply its explicit
 * timezone instead.
 */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatShortDate(date: string | number | Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  };
  // Date-only strings are re-built as a LOCAL date so the formatter renders the
  // day that was stored. No current caller passes one — but this helper exists
  // to be reached for by new call sites, and the trap is one import away:
  // `golf_travel_itineraries.departure_date` and `return_date` are both `date`
  // columns, and the travel modal already imports this (for a timestamp).
  // The identical shape shipped for four months in `task-reminders.ts`, where
  // three sites rendered a task's due date a day early in any non-UTC runtime.
  if (typeof date === 'string') {
    const parts = DATE_ONLY_RE.exec(date.trim());
    if (parts) {
      const [, year, month, day] = parts;
      const local = new Date(Number(year), Number(month) - 1, Number(day));
      // This branch represents a date column, not an instant. Preserve its
      // stored day even if the caller requested a timezone for timestamps.
      return local.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', options);
}
