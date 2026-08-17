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
 * A full timestamp is a real instant and is deliberately NOT matched here: its
 * correct answer is whatever day it is locally, which is what all three current
 * callers depend on (`feed.last_synced_at`, `feed.created_at`, `ev.start_time`
 * are all timestamptz).
 */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatShortDate(date: string | number | Date): string {
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
      return local.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
