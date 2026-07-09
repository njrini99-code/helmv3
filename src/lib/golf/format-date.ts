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
export function formatShortDate(date: string | number | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
