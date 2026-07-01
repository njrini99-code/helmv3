/**
 * Shared, pure helpers for the camps surface (list + detail pages).
 *
 * - Date formatting: camp start/end dates are stored as date-only values
 *   (YYYY-MM-DD). Parsing those with `new Date(str)` treats them as UTC
 *   midnight, which renders the prior calendar day in US timezones west of UTC.
 *   Anchoring at local noon fixes it. (#447)
 * - Active registration counting: a cancelled registration must not consume a
 *   camp's capacity, so counts exclude `cancelled`. (#443)
 */

/** Whether a registration status counts toward a camp's capacity. */
export function isActiveCampRegistration(status: string | null | undefined): boolean {
  return status !== 'cancelled';
}

/**
 * Count active (non-cancelled) registrations per camp id. Cancelled rows are
 * ignored so a camp doesn't stay "full" after someone drops out.
 */
export function activeCampCountsByCamp(
  rows: { camp_id: string; status: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isActiveCampRegistration(row.status)) continue;
    counts.set(row.camp_id, (counts.get(row.camp_id) ?? 0) + 1);
  }
  return counts;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Format a camp date for display. Date-only values are anchored at local noon
 * so US timezones west of UTC don't show the prior day. Full timestamps are
 * passed through unchanged.
 */
export function formatCampDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  const anchored = DATE_ONLY.test(dateString) ? `${dateString}T12:00:00` : dateString;
  return new Date(anchored).toLocaleDateString('en-US', options);
}
