import { describe, expect, it } from 'vitest';
import { seasonStartDate } from '../season';

/** B13: the season turns on the team's calendar, not the server's. */
describe('seasonStartDate', () => {
  it('10 PM on 31 July in New York is still last season, though it is 1 August in UTC', () => {
    expect(seasonStartDate(new Date('2026-08-01T02:00Z'), 'America/New_York')).toBe('2025-08-01');
  });
  it('turns at midnight on 1 August in the team zone', () => {
    expect(seasonStartDate(new Date('2026-08-01T04:00Z'), 'America/New_York')).toBe('2026-08-01');
    expect(seasonStartDate(new Date('2026-08-01T02:00Z'), 'UTC')).toBe('2026-08-01');
  });
  it('January belongs to the season that began the August before', () => {
    expect(seasonStartDate(new Date('2027-01-15T12:00Z'), 'America/Los_Angeles')).toBe('2026-08-01');
  });
});
