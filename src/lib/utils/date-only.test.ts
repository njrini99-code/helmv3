/**
 * #1265 / #1233 — date-only anchoring, and a static guard on the call sites.
 *
 * A Postgres `date` column arrives as a bare `YYYY-MM-DD`. `new Date(str)`
 * parses that as UTC MIDNIGHT, so any client component west of UTC formats it
 * as the previous calendar day — a task due Aug 4 renders "Aug 3" for every US
 * user. `parseDateOnly` anchors to LOCAL midnight instead, which makes the
 * calendar day round-trip exactly (and identically on server and client, so it
 * introduces no hydration mismatch).
 *
 * The second block is deliberately a source-text assertion rather than a
 * render test. This bug has now been fixed independently four times — in the
 * baseball date formatter, the baseball dev-plan client, golf travel (#1233),
 * and again at four more sites (#1265) — because nothing stops the next
 * callsite from typing `new Date(row.due_date)`. Pinning the known sites is
 * what actually catches the recurrence; a render test for each would pass the
 * moment someone adds a fifth.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDateOnlyString, anchorDateOnly, parseDateOnly } from './date-only';

describe('parseDateOnly — anchors bare date-only strings to local midnight', () => {
  it('keeps the calendar day when formatted in the local zone', () => {
    // Node runs this in whatever TZ the machine/CI uses; the point of the
    // helper is that the Y/M/D survives regardless, so assert on the parts.
    const d = parseDateOnly('2026-08-04');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-indexed August
    expect(d.getDate()).toBe(4);
  });

  it('is what a naive new Date() gets wrong west of UTC', () => {
    // Demonstrates the actual defect rather than asserting a tautology: the
    // naive parse lands on UTC midnight, so its LOCAL date can be the 3rd.
    const naive = new Date('2026-08-04');
    expect(naive.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    const anchored = parseDateOnly('2026-08-04');
    expect(anchored.getDate()).toBe(4); // never the 3rd, in any zone
  });

  it('recognises only the bare YYYY-MM-DD shape', () => {
    expect(isDateOnlyString('2026-08-04')).toBe(true);
    expect(isDateOnlyString('2026-08-04T12:00:00Z')).toBe(false);
    expect(isDateOnlyString('')).toBe(false);
    expect(isDateOnlyString(null)).toBe(false);
  });

  it('passes full timestamps through untouched', () => {
    const iso = '2026-08-04T12:30:00.000Z';
    expect(anchorDateOnly(iso)).toBe(iso);
    expect(parseDateOnly(iso).toISOString()).toBe(iso);
  });
});

describe('date-only call sites do not regress to a naive new Date()', () => {
  /**
   * Covers BOTH symptoms of the same root cause. Writing this guard is what
   * surfaced the second one: the four sites #1265 listed were display-only
   * (`toLocale*`), but the same files also compared a UTC-midnight-parsed due
   * date against `now` to decide OVERDUE. In a US zone that flips true on the
   * evening BEFORE the due date, and it disagreed with the canonical rule in
   * FairwayTasks.tsx (which already parses local-midnight via parseDueDate) —
   * so one task could read overdue on the team page and on-time on the tasks
   * page. These entries pin the alignment, not just the formatting.
   */
  const SITES: Array<[string, string[]]> = [
    ['src/components/fairway/pages/team/FairwayTeamInfo.tsx', ['due_date']],
    ['src/components/baseball/player-profile/PlayerProfileClient.tsx', ['due_date']],
    ['src/components/baseball/dev-plans/PlanDetail.tsx', ['target_date']],
    ['src/app/golf/admin/components/tracer/DataQualityIssueRow.tsx', ['round_date']],
    ['src/app/baseball/(dashboard)/dashboard/tasks/TasksClient.tsx', ['due_date']],
    ['src/components/baseball/tasks/TaskCard.tsx', ['due_date']],
    ['src/components/baseball/tasks/TasksList.tsx', ['due_date']],
  ];

  it.each(SITES)('%s formats its date-only fields through an anchoring helper', (file, fields) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    for (const field of fields) {
      const naive = new RegExp(`new Date\\([A-Za-z_$][\\w$]*\\.${field}\\)`, 'g');
      const hits = source.match(naive) ?? [];
      expect(
        hits,
        `${file} parses .${field} with a bare new Date() — that reads the DB ` +
          `date as UTC midnight and renders the previous day west of UTC. ` +
          `Use parseDateOnly() from @/lib/utils/date-only.`,
      ).toEqual([]);
    }
  });
});
