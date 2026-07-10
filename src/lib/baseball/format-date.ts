/**
 * Shared editorial date formatting for BaseballHelm stats/schedule surfaces.
 *
 * Three competing grammars had accreted across the game log, session
 * history, and trend surfaces for the exact same kind of value (a game or
 * session date): `{ month: 'short', day: 'numeric' }` ("Jul 9"),
 * `{ weekday: 'short', month: 'short', day: 'numeric' }` ("Thu, Jul 9"), and
 * `{ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }`
 * ("Thu, Jul 9, 2026") — plus at least one bare `toLocaleDateString()` with
 * no locale/options, which silently falls back to the runtime's default
 * locale/format. This helper centralizes the one true editorial grammar
 * (short date) plus a near-term relative label, so a row reads the way an
 * editor would caption it ("Today" / "Yesterday" / "Tomorrow") instead of a
 * raw calendar date when that's genuinely more useful, while staying a
 * plain short date everywhere else (including inside charts/series labels,
 * where relative labels would make adjacent points read inconsistently —
 * pass `{ relative: false }` there).
 */
export interface FormatDateOptions {
  /** Show "Today" / "Yesterday" / "Tomorrow" for dates within a day of now. Default true. */
  relative?: boolean;
}

export function formatDate(date: string | number | Date, opts: FormatDateOptions = {}): string {
  const { relative = true } = opts;
  // A bare `YYYY-MM-DD` string — the exact shape every date-only DB column
  // (game_date, session_date, expense_date, ...) hands back — has no
  // timezone offset, so the native `Date` parser treats it as UTC midnight.
  // West of UTC that reads as the PREVIOUS calendar day. Anchor it at local
  // midnight here, once, so every caller gets the correct day without having
  // to remember to hand-append 'T00:00:00' themselves (a callsite that
  // forgets to is exactly how this bug keeps recurring). A string that
  // already carries a time/offset (e.g. a caller's own `+ 'T00:00:00'`, or a
  // full ISO timestamp) doesn't match the bare-date shape below and passes
  // through unchanged.
  const anchored =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date;
  const d = anchored instanceof Date ? anchored : new Date(anchored);
  if (Number.isNaN(d.getTime())) return '—';

  if (relative) {
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 1) return 'Tomorrow';
  }

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
