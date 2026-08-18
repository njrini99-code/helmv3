/**
 * Resolve the DATE-only boundaries for a stats filter.
 *
 * `golf_rounds.round_date` is a Postgres `date` column: PostgREST serializes it
 * as a bare `YYYY-MM-DD` with no time-of-day and no offset, and the filter
 * bounds are compared against it as strings. The bounds therefore have to BE
 * calendar days — never an instant that gets sliced into one.
 *
 * Extracted from `stats-data.ts`'s private `getFilterConditions` so the
 * boundary arithmetic is reachable from a test: that file is `'use server'`,
 * where every export must be an async server action, so a pure helper cannot
 * live there.
 */

/**
 * Build a DATE-only `YYYY-MM-DD` string from calendar parts.
 *
 * No `Date` is constructed, so no runtime zone can shift the result. `month`
 * is 1-12 (the calendar month, matching `DateOnlyParts` in ./date-only.ts —
 * NOT the 0-indexed JS `Date` month).
 */
export function toDateOnly(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * The DATE-only day `years` before `now`, read in UTC.
 *
 * Goes through `Date.UTC` rather than string arithmetic so 29 Feb normalizes
 * to 1 Mar. Subtracting a year from the digits alone would emit `2027-02-29`,
 * a day that does not exist and an invalid literal for a DATE comparison.
 */
export function utcYearsAgo(now: Date, years: number): string {
  const shifted = new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()),
  );
  return toDateOnly(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export interface StatsDateRangeFilter {
  preset?: string;
  startDate?: string;
  endDate?: string;
  season?: number;
}

export interface StatsDateRange {
  startDate: string | null;
  endDate: string | null;
}

/**
 * `now` is injected rather than read, so the "this month" / "this year"
 * boundaries are assertable. Its UTC fields are what count: production runs on
 * Vercel in UTC, and reading local fields here made the boundary depend on the
 * runtime zone.
 */
export function resolveStatsDateRange(
  filter: StatsDateRangeFilter | undefined,
  now: Date,
): StatsDateRange {
  if (!filter) return { startDate: null, endDate: null };

  let startDate: string | null = null;
  let endDate: string | null = filter.endDate || null;

  if (filter.preset === 'thisMonth') {
    startDate = toDateOnly(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  } else if (filter.preset === 'thisYear') {
    startDate = toDateOnly(now.getUTCFullYear(), 1, 1);
  } else if (filter.startDate) {
    startDate = filter.startDate;
  }

  // A season is a calendar year: Jan 1 through Dec 31 inclusive.
  if (filter.season) {
    startDate = toDateOnly(filter.season, 1, 1);
    endDate = toDateOnly(filter.season, 12, 31);
  }

  return { startDate, endDate };
}
