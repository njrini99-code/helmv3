import { parseDateOnly } from '@/lib/golf/date-only';
import { todayIsoInZone } from '@/lib/golf/timezone';

// `isGolfTaskOverdue` (viewer-ambient-clock overdue check) was removed
// 2026-08-20 (#1487). It existed only because `FairwayTeamInfo.tsx`'s `team`
// prop carried no timezone, so its one call site was stuck deciding overdue
// on the READER's clock instead of the team's — a known divergence from every
// other surface (`dashboard-data.ts:292`, Team Hub's Tasks tab, the player
// hub), which all decide on the TEAM's wall clock: a coach setting "due Aug
// 17" means Aug 17 where the team is, not where a travelling player happens
// to be standing. Threading `timezone` through `TeamForClient`'s selects and
// into `FairwayTeamInfo` let that call site switch to `isGolfTaskOverdueInZone`
// below, leaving this function with zero callers. See
// `git log -- src/lib/golf/task-overdue.ts` for the removed implementation.

/**
 * A golf task's due date, formatted for a human, in ANY runtime zone.
 *
 * The three reminder senders in `task-reminders.ts` each wrote
 * `new Date(task.due_date).toLocaleDateString(...)`. `due_date` is a DATE
 * column, so `new Date('2026-08-17')` is UTC midnight, and `toLocaleDateString`
 * then renders it in the runtime zone — which is the day BEFORE anywhere west
 * of Greenwich:
 *
 *     TZ=America/New_York
 *     new Date('2026-08-17').toLocaleDateString('en-US')  ->  '8/16/2026'
 *
 * Production servers run UTC, so this renders correctly today and is one
 * config change away from telling every player their task is due a day early.
 * These strings go into notification rows, reminder emails and push payloads —
 * the places a wrong date is least recoverable, because the reader has no
 * other copy to check it against.
 *
 * Reads the calendar day out of the string and rebuilds it as a LOCAL date, so
 * the formatter renders the day that was stored rather than an instant that
 * happens to be near it. Returns null for a missing or unparseable value; every
 * caller already has a "soon" fallback for that.
 */
export function formatTaskDueDate(
  dueDate: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  locale: string = 'en-US',
): string | null {
  const parts = parseDateOnly(dueDate);
  if (!parts) return null;
  const localDay = new Date(parts.year, parts.month - 1, parts.day);
  return localDay.toLocaleDateString(locale, options);
}

/**
 * The same question, answered on the wall clock of `timeZone` — for SERVER code.
 *
 * A server component or server action has no viewer clock. `new Date()` there is
 * the deploy's zone, which on Vercel is UTC, so the ambient-zone form silently
 * asks "is it overdue in Greenwich?" of a task belonging to a team in New York.
 *
 * Measured with `TZ=UTC` (production's server zone) for a task due 2026-08-17
 * belonging to an `America/New_York` team, against the expression this replaces
 * (`new Date(due) < new Date()`, `player-hub-data.ts:198`):
 *
 *   21:00 New York, day BEFORE          current=true   correct=false
 *   00:15 New York, ON the due day      current=true   correct=false
 *   09:00 New York, ON the due day      current=true   correct=false
 *   21:00 New York, ON the due day      current=true   correct=false
 *
 * Wrong in every row — a due date read as overdue from the evening before, then
 * for the whole of the day it was actually due. `new Date('2026-08-17')` is UTC
 * midnight, so it is already behind "now" the instant UTC rolls over.
 *
 * Both sides are strings here on purpose: `due_date` arrives as `YYYY-MM-DD` and
 * `todayIsoInZone` returns the same shape, so the comparison is a plain
 * lexicographic date compare with no `Date` in the middle to re-zone it. This is
 * the pattern `dashboard-data.ts:770` already uses and documents.
 *
 * An unknown/empty `timeZone` falls back to the UTC day inside `todayIsoInZone`
 * — the pre-existing behaviour — rather than throwing. Resolve it the way the
 * rest of golf does: `golf_teams.timezone`, defaulting to `'America/New_York'`.
 */
export function isGolfTaskOverdueInZone(
  dueDate: string | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!dueDate) return false;
  const dueDay = String(dueDate).slice(0, 10);
  // Guard the shape rather than trusting it: a malformed value must read "not
  // overdue", not win a string compare against a well-formed today.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) return false;
  return dueDay < todayIsoInZone(timeZone, now);
}
