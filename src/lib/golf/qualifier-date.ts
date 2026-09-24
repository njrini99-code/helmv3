/**
 * Date sanity for qualifiers (NUMC-07). A qualifier whose start date is not a
 * real near-term date (prod has one dated year 60824) must not count as
 * "active" or become the hero. It stays visible in the list so a coach can
 * fix it. Pure.
 */

/** Earliest believable qualifier year. */
export const MIN_QUALIFIER_YEAR = 2000;
/** How many years ahead a qualifier can reasonably be scheduled. */
export const MAX_QUALIFIER_YEARS_AHEAD = 2;

function yearOf(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const m = /^(-?\d+)-\d{2}-\d{2}/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

export function isPlausibleQualifierDate(startDate: string | null | undefined, today: Date = new Date()): boolean {
  const y = yearOf(startDate);
  if (y == null) return false;
  return y >= MIN_QUALIFIER_YEAR && y <= today.getUTCFullYear() + MAX_QUALIFIER_YEARS_AHEAD;
}

/** Inclusive YYYY-MM-DD bounds for a database filter on start_date. */
export function plausibleQualifierDateBounds(today: Date = new Date()): { from: string; to: string } {
  return {
    from: `${MIN_QUALIFIER_YEAR}-01-01`,
    to: `${today.getUTCFullYear() + MAX_QUALIFIER_YEARS_AHEAD}-12-31`,
  };
}
