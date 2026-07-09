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
  const d = date instanceof Date ? date : new Date(date);
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
