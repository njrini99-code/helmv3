import { parseDateOnly } from '@/lib/golf/date-only';
import { todayIsoInZone } from '@/lib/golf/timezone';

/**
 * Is a golf task's due date in the past — meaning the day it was due has ENDED?
 *
 * `golf_tasks.due_date` is a DATE column (verified 2026-08-17; all 16 rows with
 * a due date are bare `YYYY-MM-DD`), and two surfaces compared that calendar
 * date against an instant:
 *
 *   FairwayTeamInfo.tsx:343   parseDateOnly(task.due_date) < now  // local midnight
 *   team-hub/page.tsx:249     new Date(t.due_date) < new Date()   // UTC midnight
 *
 * Measured in America/New_York for a task due 2026-08-17:
 *
 *   evening BEFORE due date (Aug 16, 9pm)   TeamInfo false   TeamHub TRUE
 *   morning OF due date     (Aug 17, 8am)   TeamInfo TRUE    TeamHub TRUE
 *   afternoon OF due date   (Aug 17, 3pm)   TeamInfo TRUE    TeamHub TRUE
 *
 * The right answer is false in all three. A due date means "due by the END of
 * that day", so the comparison has to be day-vs-day, not day-vs-instant. Team
 * Hub was the worse of the two: `new Date('2026-08-17')` is UTC midnight, so in
 * US zones the task flipped to overdue the evening BEFORE it was due.
 *
 * BOTH SIDES ARE REDUCED TO A LOCAL CALENDAR DAY. The due date's Y/M/D come from
 * the string itself (never from a zone-shifted `new Date`), and "today" comes
 * from the viewer's own clock — so the answer changes at the reader's midnight,
 * which is what a coach looking at a due date means by it.
 *
 * DO NOT APPLY THIS TO BASEBALL. `baseball_tasks.due_date` is `timestamptz` and
 * its values carry real times of day, so `parseDateOnly(due) < now` there is
 * correctly instant-vs-instant. The same expression is a bug in one sport and
 * right in the other, decided entirely by the column type. A previous attempt to
 * "fix" the baseball side was a regression and was reverted.
 *
 * ONLY USABLE IN THE BROWSER. "Today" comes from the ambient clock, which on a
 * server component or server action is the deploy's zone — UTC on Vercel — not
 * the team's. Use `isGolfTaskOverdueInZone` for anything that runs on the
 * server; see its docblock for the measured difference.
 *
 * AND IT IS NOT THE PRODUCT'S RULE, ONLY THE ONE THIS SURFACE CAN REACH.
 * `dashboard-data.ts:292` and both hub surfaces decide overdue on the TEAM's
 * zone, deliberately: a coach setting "due Aug 17" means Aug 17 where the team
 * is, not where the reader happens to be standing. This function answers on the
 * VIEWER's zone, so for a player travelling outside the team's zone the same
 * task can carry a different badge here than on their hub — up to one day apart.
 *
 * Its one call site (`FairwayTeamInfo.tsx`, a client component) is stuck with
 * that because its `team` prop carries only `{id, name, season, created_at}` —
 * no timezone — and threading one through means touching `TeamForClient`, three
 * `golf_teams` selects and seven test call sites. Tracked; until then this is a
 * known divergence, not the intended rule. Prefer the zone form wherever a zone
 * is reachable.
 *
 * Callers combine this with completion status; it answers only the date question.
 */
export function isGolfTaskOverdue(
  dueDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const parts = parseDateOnly(dueDate);
  // Unknown is not overdue — and never throw, these render inside components.
  if (!parts) return false;

  const dueDay = new Date(parts.year, parts.month - 1, parts.day);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDay < startOfToday;
}

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
