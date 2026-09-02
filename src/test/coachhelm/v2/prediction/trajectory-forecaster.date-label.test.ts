/**
 * `projectedPointDate` — the fix for the landmine documented on
 * `linearProjection`'s `date:` line (#1485).
 *
 * The bug: `linearProjection` built each point's future date with
 * `new Date(startDate)` + `setDate(+= week * 7)` — both RUNTIME-zone
 * operations — then labelled it with
 * `futureDate.toISOString().split('T')[0]`, which converts to UTC before
 * slicing the day off. West of Greenwich, from the evening onward, that UTC
 * day is TOMORROW: at 8pm Pacific the week-0 point (meant to read "today")
 * was labelled the next calendar day, and every later point inherited the
 * same one-day shift. It shipped invisibly because nothing read
 * `TrajectoryForecast.projections` until this issue wired the first consumer
 * (a coach-facing Trajectory card) and required fixing it first.
 *
 * The fix reads the label back with `localDayIso` — the SAME local getters
 * `setDate` wrote through — so the write and the read can never disagree,
 * regardless of what zone the process happens to run in.
 *
 * Uses the same `process.env.TZ` reassignment technique as
 * `src/lib/golf/__tests__/local-day.test.ts` (which fully covers `localDayIso`
 * itself); this file's job is only to prove `projectedPointDate` — the call
 * site that was actually broken — is wired to it correctly.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { projectedPointDate } from '@/lib/coachhelm/v2/prediction/trajectory-forecaster';

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('projectedPointDate — the #1485 landmine, now fixed', () => {
  it('labels the first point (week 0) as TODAY, not tomorrow, at 8pm Pacific — the bug comment\'s own scenario', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 03:00 UTC on 2026-08-21 is 8pm PDT the evening before (PDT = UTC-7).
    const now = new Date('2026-08-21T03:00:00.000Z');
    expect(projectedPointDate(now, 0)).toBe('2026-08-20');
  });

  it('disagrees with the shipped UTC-slice expression exactly where it was wrong', () => {
    process.env.TZ = 'America/Los_Angeles';
    const now = new Date('2026-08-21T03:00:00.000Z');
    const shippedBug = now.toISOString().split('T')[0];
    // The expression this replaces: proof the old code really did read tomorrow.
    expect(shippedBug).toBe('2026-08-21');
    expect(projectedPointDate(now, 0)).not.toBe(shippedBug);
  });

  it('agrees with the UTC slice on the server zone (UTC) — why this shipped unnoticed', () => {
    process.env.TZ = 'UTC';
    const now = new Date('2026-08-20T14:00:00.000Z');
    expect(projectedPointDate(now, 0)).toBe(now.toISOString().split('T')[0]);
  });

  it('advances by exactly 7 local days per week', () => {
    process.env.TZ = 'America/New_York';
    const now = new Date('2026-08-19T12:00:00.000Z'); // 08:00 EDT
    expect(projectedPointDate(now, 0)).toBe('2026-08-19');
    expect(projectedPointDate(now, 1)).toBe('2026-08-26');
    expect(projectedPointDate(now, 4)).toBe('2026-09-16');
  });

  it('is off by one east of Greenwich too, in the opposite direction, without the fix', () => {
    // Kiritimati (+14): early in the local day, the UTC calendar is still
    // YESTERDAY — the same write/read mismatch, inverted.
    process.env.TZ = 'Pacific/Kiritimati';
    const now = new Date('2026-08-18T12:00:00.000Z'); // 02:00 on Kiritimati, Aug 19
    const shippedBug = now.toISOString().split('T')[0];
    expect(shippedBug).toBe('2026-08-18');
    expect(projectedPointDate(now, 0)).toBe('2026-08-19');
    expect(projectedPointDate(now, 0)).not.toBe(shippedBug);
  });
});
