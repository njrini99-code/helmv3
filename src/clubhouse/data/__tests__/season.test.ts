import { describe, expect, it } from 'vitest';
import { loadTeamZone, seasonStartDate } from '../season';

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

/** Owner decision 9: a Pacific team's season turns at its own midnight, three hours after New York's. */
describe('seasonStartDate on a Pacific team (row 116)', () => {
  it('11 PM on 31 July in Los Angeles is last season, though New York has turned', () => {
    const at = new Date('2026-08-01T06:00Z'); // 11 PM PDT on 31 July, 2 AM EDT on 1 August
    expect(seasonStartDate(at, 'America/Los_Angeles')).toBe('2025-08-01');
    expect(seasonStartDate(at, 'America/New_York')).toBe('2026-08-01');
  });
  it('turns at midnight Pacific', () => {
    expect(seasonStartDate(new Date('2026-08-01T07:00Z'), 'America/Los_Angeles')).toBe('2026-08-01');
  });
});

describe('loadTeamZone', () => {
  const client = (res: { data: unknown; error: unknown }) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => res }) }) }) }) as unknown as Parameters<typeof loadTeamZone>[0];
  it("reads the team's zone, and falls back to the default for a missing or unreal one", async () => {
    expect(await loadTeamZone(client({ data: { timezone: 'America/Los_Angeles' }, error: null }), 't1', 'stats')).toBe('America/Los_Angeles');
    expect(await loadTeamZone(client({ data: { timezone: 'Mars/Olympus' }, error: null }), 't1', 'stats')).toBe('America/New_York');
    expect(await loadTeamZone(client({ data: null, error: { message: 'boom' } }), 't1', 'stats')).toBe('America/New_York');
  });
});
