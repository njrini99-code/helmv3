import { describe, expect, it } from 'vitest';
import { insightTeamFilter, scopeToTeams } from '../team-scope';

// Prod audit 2026-11-15, N13P-16: a player's feed read their insights by player alone, so a former team's reads showed on the new team's
// CoachHelm. The feed and the Hub card now read the teams the player is on, plus rows that carry no team.
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('insightTeamFilter', () => {
  it('scopes to the player’s current teams and keeps rows with no team', () => {
    expect(insightTeamFilter([A, B])).toBe(`team_id.in.(${A},${B}),team_id.is.null`);
  });

  it('a failed team read or no team leaves the read unscoped, never empty', () => {
    expect(insightTeamFilter(null)).toBeNull();
    expect(insightTeamFilter([])).toBeNull();
  });

  it('only ever writes ids into the filter', () => {
    expect(insightTeamFilter(['x),player_id.neq.(1', A])).toBe(`team_id.in.(${A}),team_id.is.null`);
  });
});

describe('scopeToTeams', () => {
  it('adds the filter to the query, or leaves the query as it is', () => {
    const calls: string[] = [];
    const q = { or: (f: string) => (calls.push(f), q) };
    expect(scopeToTeams(q, null)).toBe(q);
    expect(calls).toEqual([]);
    expect(scopeToTeams(q, 'team_id.is.null')).toBe(q);
    expect(calls).toEqual(['team_id.is.null']);
  });
});
