/**
 * "Find me another time this week" searched the RUNTIME's week, not the coach's.
 *
 * `checkEventConflicts` (conflicts.ts:176) goes to real trouble resolving the
 * attendees' team timezone — a membership query and a settings read — and then
 * computes the week to search with `getStartOfWeek(proposedStart)`, which reads
 * `getDay()`/`setDate()`/`setHours()` through the RUNTIME's calendar. On Vercel
 * that is UTC. The zone it just resolved is used for the hour-of-day inside
 * `generateTimeSlots` and for nothing else.
 *
 * The failure is not a few hours of drift, it is a whole week. An Eastern coach
 * proposing Saturday 21:00 is proposing at 01:00 UTC on SUNDAY, so the UTC
 * weekday is 0 and the search window snaps to the week that has not started
 * yet. The rest of the coach's own Saturday, and the six days before it, are
 * never considered.
 *
 * Live, not hypothetical: `FairwayEventEditor.tsx:1235` renders
 * `conflicts.suggestions` as chips, and `golf.ts:4431` maps
 * `result.suggestedTimes` into them. All ten production teams are
 * `America/New_York`.
 *
 * The fix is `zonedMidnight`, which already exists for this exact problem: it
 * returns a locally-CONSTRUCTED Date whose runtime getters reproduce the target
 * zone's calendar triple. Feeding one to the existing week helpers makes their
 * `getDay()` the team's weekday, and every downstream step — the day cursor in
 * `generateTimeSlots`, the date key in `wallClockInZone` — is already
 * local-getter based, so it inherits the corrected triple on any runtime.
 */
import { describe, it, expect } from 'vitest';
import { getWeekWindowInZone } from '@/lib/calendar/availability';

/** The local calendar triple, which is what every downstream consumer reads. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Saturday 2026-08-15, 21:00 America/New_York — an evening team event, the
// same shape as the real "Under the Stars- MANDATORY" row on Guilford's
// calendar. In UTC this instant is already Sunday the 16th.
const SATURDAY_EVENING_ET = new Date('2026-08-16T01:00:00Z');

describe('getWeekWindowInZone', () => {
  it("returns the COACH's week for a Saturday-evening proposal, not the following one", () => {
    const { start, end } = getWeekWindowInZone(SATURDAY_EVENING_ET, 'America/New_York');

    // Sunday the 9th through Saturday the 15th — the week the coach is in.
    expect(localDay(start)).toBe('2026-08-09');
    expect(localDay(end)).toBe('2026-08-15');
  });

  it('is unchanged for a mid-week afternoon, where the two zones agree', () => {
    // Wednesday 2026-08-12, 14:00 ET = 18:00Z the same day. No date-line effect,
    // so this is the case that always worked and must keep working.
    const { start, end } = getWeekWindowInZone(new Date('2026-08-12T18:00:00Z'), 'America/New_York');
    expect(localDay(start)).toBe('2026-08-09');
    expect(localDay(end)).toBe('2026-08-15');
  });

  it('opens the window at midnight and closes it at the end of Saturday', () => {
    const { start, end } = getWeekWindowInZone(SATURDAY_EVENING_ET, 'America/New_York');
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
  });

  it('answers in the TEAM zone even when the runtime is on the other side of the date line', () => {
    // A team in Auckland proposing Sunday 09:00 local is at 21:00Z on SATURDAY.
    // Read in UTC that is the previous week; read in Auckland it is the first
    // morning of this one.
    const sundayMorningNZ = new Date('2026-08-15T21:00:00Z');
    const { start } = getWeekWindowInZone(sundayMorningNZ, 'Pacific/Auckland');
    expect(localDay(start)).toBe('2026-08-16');
  });

  it('falls back to a defined window rather than throwing on an unknown zone', () => {
    // getValidTimezone inside zonedMidnight coerces junk to the default; the
    // caller must still receive a usable seven-day window.
    const { start, end } = getWeekWindowInZone(SATURDAY_EVENING_ET, 'Not/AZone');
    expect(Number.isFinite(start.getTime())).toBe(true);
    expect(Number.isFinite(end.getTime())).toBe(true);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});
