import { parseDateOnly } from '@/lib/golf/date-only';

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
