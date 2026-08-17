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
import { isGolfTaskOverdue, isGolfTaskOverdueInZone } from '@/lib/golf/task-overdue';

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

/**
 * The SERVER half. `isGolfTaskOverdue` reads the ambient clock, which is right
 * in a browser and wrong in a server component or server action — on Vercel that
 * clock is UTC, not the team's zone.
 *
 * `player-hub-data.ts:198` had the raw form (`new Date(due) < new Date()`), and
 * under TZ=UTC it answered TRUE in all four rows below. The correct answer is
 * false in all four: the player's home screen showed every dated task as overdue
 * from the evening before it was due, and then all the way through its due day.
 *
 * Every instant below is written as an absolute `Z` timestamp and every expected
 * value is derived from the ZONE argument, never from the runtime zone — so these
 * hold identically under TZ=UTC, Pacific/Kiritimati (+14) and Pacific/Midway (-11).
 */
describe('isGolfTaskOverdueInZone — the team wall clock decides, not the server', () => {
  const NY = 'America/New_York';
  const DUE = '2026-08-17';

  it('is not overdue at any hour of its due day in the team zone', () => {
    for (const iso of [
      '2026-08-17T04:15:00Z', // 00:15 New York — first minutes of the due day
      '2026-08-17T13:00:00Z', // 09:00 New York
      '2026-08-18T01:00:00Z', // 21:00 New York — UTC has already rolled over
      '2026-08-18T03:59:00Z', // 23:59 New York — last minute of the due day
    ]) {
      expect(isGolfTaskOverdueInZone(DUE, NY, new Date(iso)), iso).toBe(false);
    }
  });

  it('is not overdue the evening BEFORE, when UTC has already rolled over', () => {
    // 21:00 New York on Aug 16 is 01:00Z on Aug 17. The old expression compared
    // UTC midnight of the due date against that and said "overdue".
    expect(isGolfTaskOverdueInZone(DUE, NY, new Date('2026-08-17T01:00:00Z'))).toBe(false);
  });

  it('becomes overdue once the team zone rolls past the due day', () => {
    // 00:05 New York on Aug 18.
    expect(isGolfTaskOverdueInZone(DUE, NY, new Date('2026-08-18T04:05:00Z'))).toBe(true);
  });

  it('gives OPPOSITE answers for two teams at the same instant — which is the point', () => {
    // 2026-08-18T09:00Z: already Aug 18 in New York (05:00), still Aug 17 in
    // Honolulu (23:00). A shared "server today" cannot be right for both.
    const instant = new Date('2026-08-18T09:00:00Z');
    expect(isGolfTaskOverdueInZone(DUE, NY, instant)).toBe(true);
    expect(isGolfTaskOverdueInZone(DUE, 'Pacific/Honolulu', instant)).toBe(false);
  });

  it('falls back to the UTC day on a missing or unusable zone rather than throwing', () => {
    // A bad golf_teams.timezone must not take the player hub down.
    const instant = new Date('2026-08-18T01:00:00Z'); // still Aug 17 in NY, Aug 18 in UTC
    for (const tz of [null, undefined, '', 'Not/AZone']) {
      expect(isGolfTaskOverdueInZone(DUE, tz, instant), JSON.stringify(tz)).toBe(true);
    }
  });

  it('treats a missing or malformed due date as never overdue', () => {
    const instant = new Date('2026-12-25T12:00:00Z');
    for (const v of [null, undefined, '', 'not-a-date', '2026-8-2']) {
      expect(isGolfTaskOverdueInZone(v, NY, instant), JSON.stringify(v)).toBe(false);
    }
  });

  it('reads the calendar day out of a full timestamp', () => {
    const instant = new Date('2026-08-18T01:00:00Z'); // 21:00 Aug 17 in New York
    expect(isGolfTaskOverdueInZone('2026-08-17T09:00:00Z', NY, instant)).toBe(false);
    expect(isGolfTaskOverdueInZone('2026-08-10T09:00:00Z', NY, instant)).toBe(true);
  });
});
