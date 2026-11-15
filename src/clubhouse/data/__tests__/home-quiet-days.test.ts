import { describe, expect, it } from 'vitest';
import { quietDaysSince } from '../../screens/home/model';

// Prod audit 2026-11-15, HOME-P-01: Home and Roster counted a player's quiet days apart. Both now call `quietDaysSince`.
describe('the one quiet-day count', () => {
  it('counts whole team-local days from the round to today, never negative, from a date or a timestamp', () => {
    expect(quietDaysSince('2026-09-26', '2026-11-15')).toBe(50);
    expect(quietDaysSince('2026-09-26T23:30:00Z', '2026-11-15')).toBe(50);
    expect(quietDaysSince('2026-11-16', '2026-11-15')).toBe(0);
  });
});
