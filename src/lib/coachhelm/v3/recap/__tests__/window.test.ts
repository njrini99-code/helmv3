/**
 * The weekly coach recap counted EIGHT calendar days, not seven.
 *
 * `builder.ts`'s own docblock states the intent plainly:
 *
 *     "Window: the recap covers the 7 days ending on the Sunday this cron
 *      fires (Sunday 18:00 local per master plan)."
 *
 * The implementation was:
 *
 *     const weekEnd   = new Date(args.week_end_iso);
 *     const weekStart = new Date(weekEnd.getTime() - 7 * 86400_000);
 *     …
 *     .gte('round_date', weekStart.toISOString().slice(0, 10))
 *     .lte('round_date', weekEnd.toISOString().slice(0, 10));
 *
 * `round_date` is a DATE column and both bounds are inclusive, so subtracting a
 * full 7 days spans 8 calendar days. Verified by running the arithmetic for two
 * consecutive weekly fires:
 *
 *     run 2026-08-10  ->  round_date >= 2026-08-03 and <= 2026-08-10   (8 days)
 *     run 2026-08-17  ->  round_date >= 2026-08-10 and <= 2026-08-17   (8 days)
 *
 * 2026-08-10 falls in BOTH, so a round played on the boundary day is counted in
 * two consecutive recap emails — and the subject line renders the same 8-day
 * span as the week.
 *
 * SEVERITY, STATED HONESTLY: the `v3-weekly-coach-email` cron is not declared in
 * `vercel.json` and last ran 2026-07-26 (4 runs total), so it is dormant rather
 * than shipping this weekly today. The arithmetic is deterministic, the intent
 * is documented, and the job can be re-enabled — which is why it is fixed here
 * rather than only noted.
 */
import { describe, it, expect } from 'vitest';
import { recapDateWindow } from '@/lib/coachhelm/v3/recap/window';

/** A Sunday-evening fire, matching the documented schedule. */
const FIRE = '2026-08-17T22:00:00Z';

function daysInclusive(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86_400_000) + 1;
}

describe('recapDateWindow', () => {
  it('covers exactly seven calendar days', () => {
    const { startDate, endDate } = recapDateWindow(FIRE);
    expect(daysInclusive(startDate, endDate)).toBe(7);
  });

  it('ends on the day the cron fires', () => {
    expect(recapDateWindow(FIRE).endDate).toBe('2026-08-17');
  });

  it('starts six days earlier, not seven', () => {
    // Seven was the bug: it made the window inclusive of an eighth day.
    expect(recapDateWindow(FIRE).startDate).toBe('2026-08-11');
  });

  it('does not overlap the previous week', () => {
    const thisWeek = recapDateWindow('2026-08-17T22:00:00Z');
    const lastWeek = recapDateWindow('2026-08-10T22:00:00Z');

    expect(lastWeek.endDate).toBe('2026-08-10');
    expect(thisWeek.startDate).toBe('2026-08-11');
    expect(
      Date.parse(thisWeek.startDate) > Date.parse(lastWeek.endDate),
      'consecutive recaps must not both report the same day',
    ).toBe(true);
  });

  it('tiles consecutive weeks with no gap either', () => {
    // The inverse failure: over-correcting to -5 days would skip a day.
    const thisWeek = recapDateWindow('2026-08-17T22:00:00Z');
    const lastWeek = recapDateWindow('2026-08-10T22:00:00Z');
    const gapDays = Math.round(
      (Date.parse(thisWeek.startDate) - Date.parse(lastWeek.endDate)) / 86_400_000,
    );
    expect(gapDays).toBe(1); // adjacent, no hole
  });

  it('keeps the instant bound at the fire time for timestamp columns', () => {
    // `created_at` is a timestamp, so it is filtered on instants, not calendar
    // days. The end bound must stay the exact fire instant.
    expect(recapDateWindow(FIRE).endInstant).toBe(FIRE);
  });
});
