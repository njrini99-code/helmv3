import { describe, expect, it } from 'vitest';
import { zonedWallClock } from '../timezone';
import { offsetMinutesFor } from '@/lib/golf/timezone';

// Fairway's calendar saved every event with TODAY's device offset and prefilled the editor in the device's zone. The
// clocks change on 1 Nov 2026 in New York: an event on 5 Nov saved from an EDT device landed an hour off.
describe('team-zone wall clock across the daylight-saving change', () => {
  it('uses the offset of the event date, not of today', () => {
    expect(offsetMinutesFor('2026-10-20', '15:00', 'America/New_York')).toBe(240); // EDT
    expect(offsetMinutesFor('2026-11-05', '15:00', 'America/New_York')).toBe(300); // EST
  });

  it('a 3 PM event on 5 Nov round-trips as 3 PM in the team zone', () => {
    const offset = offsetMinutesFor('2026-11-05', '15:00', 'America/New_York')!;
    const sign = offset > 0 ? '-' : '+';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    const stored = new Date(`2026-11-05T15:00:00${sign}${hh}:${mm}`).toISOString();
    expect(stored).toBe('2026-11-05T20:00:00.000Z');
    expect(zonedWallClock(stored, 'America/New_York')).toEqual({ date: '2026-11-05', time: '15:00' });
  });

  it('prefills in the team zone whatever zone the device is in', () => {
    // 1 PM in Los Angeles for a West Coast team, read on any device.
    expect(zonedWallClock('2026-06-15T20:00:00Z', 'America/Los_Angeles')).toEqual({ date: '2026-06-15', time: '13:00' });
    // Midnight renders as 00, never 24.
    expect(zonedWallClock('2026-06-15T04:00:00Z', 'America/New_York')).toEqual({ date: '2026-06-15', time: '00:00' });
  });

  it('returns null for an unreadable instant', () => {
    expect(zonedWallClock('not a date', 'America/New_York')).toBeNull();
  });
});
