/**
 * Anchoring for date-only values.
 *
 * A bare `YYYY-MM-DD` string — the exact shape every date-only DB column
 * (`expense_date`, `round_date`, `due_date`, `game_date`, `session_date`, …)
 * hands back — carries no timezone offset, so the native `Date` parser reads
 * it as UTC midnight. Anywhere west of UTC that renders as the PREVIOUS
 * calendar day: a travel expense stored as `2026-07-08` displayed as
 * "Jul 7, 2026" for every US user, while the CSV export of the same row said
 * `2026-07-08`.
 *
 * Appending a bare time makes the parser treat it as LOCAL midnight instead,
 * which is what a date-only value means. This lives in one place because
 * "the callsite forgot to anchor" is exactly how the bug keeps recurring —
 * it has now been fixed independently in the baseball date formatter and the
 * baseball dev-plan client, and was still live in golf travel.
 *
 * Values that already carry a time or offset (a full ISO timestamp) do not
 * match the bare-date shape and pass through untouched.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a bare `YYYY-MM-DD` date-only string. */
export function isDateOnlyString(value: unknown): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value);
}

/**
 * Returns the input with a date-only string anchored to LOCAL midnight.
 * Non-date-only inputs (Date, number, full ISO string) are returned as-is.
 */
export function anchorDateOnly<T extends string | number | Date>(value: T): T | string {
  return isDateOnlyString(value) ? `${value}T00:00:00` : value;
}

/**
 * Parse a date-only string (or anything `Date` accepts) into a `Date` that
 * sits at LOCAL midnight rather than UTC midnight.
 */
export function parseDateOnly(value: string | number | Date): Date {
  const anchored = anchorDateOnly(value);
  return anchored instanceof Date ? anchored : new Date(anchored);
}
