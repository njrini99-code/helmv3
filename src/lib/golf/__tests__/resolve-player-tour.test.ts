import { describe, it, expect } from 'vitest';
import { resolvePlayerTeamGender, resolvePlayerTour } from '../resolve-player-tour';

type Membership = { golf_teams: { gender?: string | null } | null } | null;

/** The chain resolvePlayerTeamGender runs: from().select().eq().eq().maybeSingle(). */
function clientReturning(data: Membership) {
  const calls: Array<[string, unknown[]]> = [];
  const chain = {
    select: (...a: unknown[]) => (calls.push(['select', a]), chain),
    eq: (...a: unknown[]) => (calls.push(['eq', a]), chain),
    maybeSingle: async () => ({ data, error: null }),
  };
  const supabase = { from: (t: string) => (calls.push(['from', [t]]), chain) };
  return { supabase: supabase as never, calls };
}

describe('resolvePlayerTour (owner decision Q-93: Tour-only, LPGA for women)', () => {
  it('reads the player\'s active team membership', async () => {
    const { supabase, calls } = clientReturning({ golf_teams: { gender: 'womens' } });
    await resolvePlayerTeamGender(supabase, 'p1');
    expect(calls).toContainEqual(['from', ['golf_team_members']]);
    expect(calls).toContainEqual(['eq', ['player_id', 'p1']]);
    expect(calls).toContainEqual(['eq', ['status', 'active']]);
  });

  it('a women\'s team is compared with the LPGA Tour', async () => {
    const { supabase } = clientReturning({ golf_teams: { gender: 'womens' } });
    expect(await resolvePlayerTour(supabase, 'p1')).toBe('lpga');
  });

  it('a men\'s team, an unset gender and no membership fall back to the PGA Tour', async () => {
    expect(await resolvePlayerTour(clientReturning({ golf_teams: { gender: 'mens' } }).supabase, 'p1')).toBe('pga');
    expect(await resolvePlayerTour(clientReturning({ golf_teams: { gender: null } }).supabase, 'p1')).toBe('pga');
    expect(await resolvePlayerTour(clientReturning(null).supabase, 'p1')).toBe('pga');
  });
});
