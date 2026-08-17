/**
 * A golf task due TODAY was reported OVERDUE on both surfaces that show it.
 *
 *   src/components/fairway/pages/team/FairwayTeamInfo.tsx:343   (Team Info)
 *   src/app/golf/(dashboard)/dashboard/team-hub/page.tsx:249    (Team Hub tasks)
 *
 * `golf_tasks.due_date` is a DATE column — verified against production
 * 2026-08-17, and all 16 rows carrying a due date are bare `YYYY-MM-DD`. Both
 * surfaces compared that calendar date against an INSTANT:
 *
 *   FairwayTeamInfo  parseDateOnly(task.due_date) < now   // local midnight
 *   team-hub         new Date(t.due_date) < new Date()    // UTC midnight
 *
 * Measured in America/New_York for a task due 2026-08-17:
 *
 *   evening BEFORE due date (Aug 16, 9pm)   TeamInfo false   TeamHub TRUE
 *   morning OF due date     (Aug 17, 8am)   TeamInfo TRUE    TeamHub TRUE
 *   afternoon OF due date   (Aug 17, 3pm)   TeamInfo TRUE    TeamHub TRUE
 *
 * The correct answer is false in every row: the task is due today, not late.
 * Team Hub is the worse of the two — `new Date('2026-08-17')` is UTC midnight,
 * so in US zones the task flips to overdue the EVENING BEFORE it is due.
 *
 * WHY THIS WAS MISSED ONCE ALREADY. Three cycles ago I found this exact shape in
 * the BASEBALL task components, proved it with a bare date, and wrote a fix —
 * which was a regression, because `baseball_tasks.due_date` is `timestamptz`
 * and every value carries a real time, so its comparison was correctly
 * instant-vs-instant. I reverted it. The shape is only a bug where the column is
 * a DATE, and that is golf. Same expression, opposite verdicts, decided entirely
 * by the schema.
 *
 * Both sides of the comparison here are local, so these expectations hold in any
 * runtime zone; the suite is run under UTC, +14 and -11.
 */
import { describe, it, expect } from 'vitest';
import { isGolfTaskOverdue } from '@/lib/golf/task-overdue';

/** Local-constructed instants, so the test means the same thing in every zone. */
const eveningBefore = new Date(2026, 7, 16, 21, 0); // Aug 16, 9pm local
const morningOf = new Date(2026, 7, 17, 8, 0); // Aug 17, 8am local
const afternoonOf = new Date(2026, 7, 17, 15, 0); // Aug 17, 3pm local
const nextMorning = new Date(2026, 7, 18, 8, 0); // Aug 18, 8am local

const DUE_TODAY = '2026-08-17';

describe('isGolfTaskOverdue — a task due today is not late', () => {
  it('is not overdue the evening before its due date', () => {
    // The Team Hub failure: UTC midnight arrives at 8pm Eastern the day before.
    expect(isGolfTaskOverdue(DUE_TODAY, eveningBefore)).toBe(false);
  });

  it('is not overdue in the morning of its due date', () => {
    // The Team Info failure: local midnight has passed, but the day has not.
    expect(isGolfTaskOverdue(DUE_TODAY, morningOf)).toBe(false);
  });

  it('is not overdue in the afternoon of its due date', () => {
    expect(isGolfTaskOverdue(DUE_TODAY, afternoonOf)).toBe(false);
  });

  it('is not overdue in the last minute of its due date', () => {
    expect(isGolfTaskOverdue(DUE_TODAY, new Date(2026, 7, 17, 23, 59))).toBe(false);
  });
});

describe('isGolfTaskOverdue — but a genuinely late task still is', () => {
  it('becomes overdue once the day has passed', () => {
    expect(isGolfTaskOverdue(DUE_TODAY, nextMorning)).toBe(true);
  });

  it('reports a task from last week as overdue', () => {
    expect(isGolfTaskOverdue('2026-08-10', afternoonOf)).toBe(true);
  });

  it('does not report a future task as overdue', () => {
    expect(isGolfTaskOverdue('2026-08-18', afternoonOf)).toBe(false);
    expect(isGolfTaskOverdue('2026-12-25', afternoonOf)).toBe(false);
  });
});

describe('isGolfTaskOverdue — degenerate input', () => {
  it('treats a missing due date as never overdue', () => {
    for (const v of [null, undefined, '']) {
      expect(isGolfTaskOverdue(v, afternoonOf), JSON.stringify(v)).toBe(false);
    }
  });

  it('returns false rather than throwing on an unparseable value', () => {
    // These render inside components; a throw would blank the panel.
    expect(isGolfTaskOverdue('not-a-date', afternoonOf)).toBe(false);
    expect(isGolfTaskOverdue('2026-13-45', afternoonOf)).toBe(false);
  });

  it('tolerates a full timestamp by reading its calendar day', () => {
    expect(isGolfTaskOverdue('2026-08-17T09:00:00Z', afternoonOf)).toBe(false);
    expect(isGolfTaskOverdue('2026-08-10T09:00:00Z', afternoonOf)).toBe(true);
  });
});
