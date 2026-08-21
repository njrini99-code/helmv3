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
 * The correct answer is false whenever the task is due today, not late. Team
 * Hub was the worse of the two — `new Date('2026-08-17')` is UTC midnight, so
 * in US zones the task flipped to overdue the EVENING BEFORE it was due.
 *
 * WHY THIS WAS MISSED ONCE ALREADY. Three cycles ago I found this exact shape in
 * the BASEBALL task components, proved it with a bare date, and wrote a fix —
 * which was a regression, because `baseball_tasks.due_date` is `timestamptz`
 * and every value carries a real time, so its comparison was correctly
 * instant-vs-instant. I reverted it. The shape is only a bug where the column is
 * a DATE, and that is golf. Same expression, opposite verdicts, decided entirely
 * by the schema.
 *
 * `isGolfTaskOverdue` (the viewer-ambient-clock fix for the FairwayTeamInfo
 * side, with its own dedicated test coverage here) was REMOVED 2026-08-20
 * (#1487) once `FairwayTeamInfo` could reach `team.timezone` and switch to
 * `isGolfTaskOverdueInZone` below, the same zone-aware function Team Hub
 * already used — see that function's docblock. Both call sites now decide
 * overdue on the TEAM's wall clock, so there is nothing left for a
 * viewer-clock version to do.
 */
import { describe, it, expect } from 'vitest';
import {
  isGolfTaskOverdueInZone,
  formatTaskDueDate,
} from '@/lib/golf/task-overdue';

/**
 * The ambient clock (`new Date()`) is right in a browser and wrong in a server
 * component or server action — on Vercel that clock is UTC, not the team's
 * zone. `isGolfTaskOverdueInZone` answers on the wall clock of an explicit
 * `timeZone` argument instead, which is what makes it usable from either.
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

/**
 * The reminder-email half of #1487.
 *
 * `task-reminders.ts` built its human-readable due date three times over with
 * `new Date(task.due_date).toLocaleDateString(...)`. `due_date` is a DATE
 * column, so that is UTC midnight rendered in the runtime zone — the day BEFORE
 * anywhere west of Greenwich:
 *
 *     TZ=America/New_York
 *     new Date('2026-08-17').toLocaleDateString('en-US')  ->  '8/16/2026'
 *
 * Production runs UTC so it renders correctly today, which is exactly why it
 * survived: it is one config change from telling every player their task is due
 * a day early, in a notification they have no other copy of.
 *
 * These assertions are written against the STORED calendar day, so they mean
 * the same thing under TZ=UTC, Pacific/Kiritimati (+14) and Pacific/Midway (-11)
 * — the zones that would expose the bug in both directions.
 */
describe('formatTaskDueDate — renders the day that was stored, in any zone', () => {
  it('keeps the calendar day the column holds', () => {
    expect(formatTaskDueDate('2026-08-17')).toBe('8/17/2026');
    expect(formatTaskDueDate('2026-01-01')).toBe('1/1/2026');
    expect(formatTaskDueDate('2026-12-31')).toBe('12/31/2026');
  });

  it('honours format options without re-zoning the day', () => {
    expect(
      formatTaskDueDate('2026-08-17', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    ).toBe('Monday, August 17, 2026');
  });

  it('does NOT shift the day the way the expression it replaces does', () => {
    // The old form. Left in as the control: under TZ=UTC both agree, and it is
    // only the shifted-zone runs that separate them — so a green UTC-only run
    // proves nothing here, which was the whole problem.
    const stored = '2026-08-17';
    expect(formatTaskDueDate(stored)).toBe('8/17/2026');

    // The divergence is WEST of Greenwich only. `new Date(bare)` is UTC
    // midnight; east of UTC that instant is still the same calendar day
    // locally, so the broken expression accidentally agrees — Pacific/Kiritimati
    // (+14) renders 8/17 either way. `getTimezoneOffset()` is POSITIVE west of
    // UTC, and that is the only side where the old form loses a day. Guarding
    // on `!== 0` asserted the divergence at +14 as well and failed there, which
    // is the test being wrong about the bug, not the fix being wrong.
    if (new Date().getTimezoneOffset() > 0) {
      expect(new Date(stored).toLocaleDateString('en-US')).not.toBe(formatTaskDueDate(stored));
    }
  });

  it('returns null for a missing or unusable value so callers keep their "soon" fallback', () => {
    for (const v of [null, undefined, '', 'not-a-date', '2026-13-45']) {
      expect(formatTaskDueDate(v), JSON.stringify(v)).toBeNull();
    }
  });

  it('reads the calendar day out of a full timestamp too', () => {
    expect(formatTaskDueDate('2026-08-17T09:00:00Z')).toBe('8/17/2026');
  });
});
