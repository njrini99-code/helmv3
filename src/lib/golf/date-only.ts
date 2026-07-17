/**
 * Timezone-safe formatting for DATE-only columns (e.g. `golf_rounds.round_date`,
 * `golf_qualifiers.start_date`).
 *
 * Postgres `date` columns serialize over PostgREST as a bare `YYYY-MM-DD`
 * string with no time-of-day or offset. Handed to `new Date(str)`, the JS spec
 * parses that as UTC midnight — so a formatter that then reads it back with
 * `toLocaleDateString()` (which defaults to the *local* timezone) prints the
 * PREVIOUS calendar day in every US timezone (west of UTC). Two Fairway rounds
 * surfaces disagreed on the very same `round_date` for exactly this reason:
 * one rendering pinned its formatter to UTC, the other didn't (#916).
 *
 * This module is the one parse path date-only round/qualifier fields should
 * go through: pull the Y/M/D digits directly out of the string (never through
 * a naive `new Date(str)` → local-timezone round trip) and format with
 * `timeZone: 'UTC'` explicitly, so the calendar day is identical in every
 * timezone and identical between SSR (server TZ) and hydration (client TZ) —
 * no hydration mismatch, no off-by-one.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export interface DateOnlyParts {
  year: number;
  /** 1-12 (calendar month, NOT the 0-indexed JS Date month). */
  month: number;
  day: number;
}

/**
 * Parse a bare `YYYY-MM-DD` value (or a full timestamp that starts with one,
 * e.g. `YYYY-MM-DDTHH:mm:ss.sssZ`) into its calendar parts, ignoring any
 * time-of-day/offset entirely. Returns `null` for unparseable input.
 */
export function parseDateOnly(value: string | null | undefined): DateOnlyParts | null {
  if (!value) return null;
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * A `Date` anchored at UTC midnight for the given calendar parts — a pure
 * formatting engine, never meant to be read back via local-timezone getters
 * (`getDate()`/`getMonth()`/`toLocaleDateString()` without `timeZone: 'UTC'`).
 * Always pair with `{ timeZone: 'UTC' }` when formatting.
 */
export function dateOnlyToUtcDate(parts: DateOnlyParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/**
 * Format a date-only value with explicit `Intl.DateTimeFormat` options,
 * always pinned to UTC so the result is identical in every timezone/host.
 * Returns `fallback` (default `'—'`) for unparseable input.
 */
export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback = '—',
): string {
  const parts = parseDateOnly(value);
  if (!parts) return fallback;
  return dateOnlyToUtcDate(parts).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
}

/** Short weekday, e.g. "Mon". */
export function formatDateOnlyWeekdayShort(value: string | null | undefined, fallback = '—'): string {
  return formatDateOnly(value, { weekday: 'short' }, fallback);
}

/** Long weekday, e.g. "Monday". */
export function formatDateOnlyWeekdayLong(value: string | null | undefined, fallback = '—'): string {
  return formatDateOnly(value, { weekday: 'long' }, fallback);
}

/** Short month + day, e.g. "Jun 2". */
export function formatDateOnlyShort(value: string | null | undefined, fallback = '—'): string {
  return formatDateOnly(value, { month: 'short', day: 'numeric' }, fallback);
}

/** Long month + day + year, e.g. "June 2, 2026". */
export function formatDateOnlyFull(value: string | null | undefined, fallback = '—'): string {
  return formatDateOnly(value, { month: 'long', day: 'numeric', year: 'numeric' }, fallback);
}
