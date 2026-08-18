/**
 * The calendar day as it reads on the WALL CLOCK where the code is running.
 *
 * This exists for one narrow job: pre-filling a date input, or labelling
 * "today", in a CLIENT component — where the runtime zone IS the user's zone
 * and is therefore the right answer.
 *
 * The shape it replaces:
 *
 *     new Date().toISOString().split('T')[0]
 *
 * `new Date()` is an instant; `toISOString()` renders that instant in UTC; the
 * slice then takes UTC's calendar day. West of Greenwich the UTC day rolls over
 * before the local one, so from 20:00 EDT onward the "today" this produces is
 * TOMORROW. East of Greenwich it inverts and produces YESTERDAY for the early
 * part of the local day.
 *
 * `/golf/dashboard/rounds/new` had the sharpest version: its round-date default
 * is deliberately set on mount rather than during render, with the comment
 * "Set on mount to avoid hydration mismatch (server UTC vs client local)" — the
 * whole point being to read the USER's day rather than the server's. It then
 * called `.toISOString()`, which converts that local instant straight back to
 * UTC and throws the deferral away. A player logging a round at 8pm Eastern got
 * tomorrow's date pre-filled, and unless they noticed, the round was saved
 * under a day it did not happen on.
 *
 * Not to be confused with `todayIsoInZone` in ./timezone.ts, which answers the
 * same question for an EXPLICIT IANA zone (a team's zone, read on a server).
 * Use that one anywhere the runtime zone is not the user's — server actions,
 * cron, anything under /api.
 */
export function localDayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
