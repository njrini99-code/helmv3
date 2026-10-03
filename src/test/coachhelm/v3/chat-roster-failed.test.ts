import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));

import { loadActiveRoster, loadActiveRosterResult, resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';

/**
 * A roster read that fails answers an empty roster, which was read as a team with nobody on it (the Clubhouse Ask page said
 * "Add players"). `loadActiveRosterResult` and `CoachChatContext.roster_failed` say it; `loadActiveRoster` and every caller that
 * ignores the flag are unchanged.
 */

type Answer = { data: unknown; error?: unknown };
function sbWith(responses: Record<string, Answer>, user: { id: string } | null = { id: 'u1' }) {
  const builder = (table: string) => {
    const result = { error: null, ...(responses[table] ?? { data: [] }) };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit']) chain[method] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => result);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return { from: vi.fn((table: string) => builder(table)), auth: { getUser: vi.fn(async () => ({ data: { user } })) } } as never;
}

describe('loadActiveRosterResult', () => {
  it('a membership read that fails is failed, with no roster: not a team with nobody on it', async () => {
    const sb = sbWith({ golf_team_members: { data: null, error: { message: 'boom' } } });
    expect(await loadActiveRosterResult(sb, 'team-1')).toEqual({ roster: [], failed: true });
    // The old function keeps its answer for its callers.
    expect(await loadActiveRoster(sb, 'team-1')).toEqual([]);
  });

  it('a team with nobody on it is an empty roster that did not fail', async () => {
    expect(await loadActiveRosterResult(sbWith({ golf_team_members: { data: [] } }), 'team-1')).toEqual({ roster: [], failed: false });
  });

  it('a profile read that fails is not a failed roster: the members are still on it, by placeholder', async () => {
    const sb = sbWith({ golf_team_members: { data: [{ player_id: 'p1' }] }, golf_players: { data: null, error: { message: 'boom' } } });
    const res = await loadActiveRosterResult(sb, 'team-1');
    expect(res.failed).toBe(false);
    expect(res.roster.map((p) => [p.id, p.name])).toEqual([['p1', 'Unnamed player']]);
  });
});

describe('resolveCoachChatContext', () => {
  const rows = { golf_coaches: { data: { id: 'c1', organization_id: 'o1' } }, golf_teams: { data: { id: 'team-1', name: 'Finley', timezone: 'America/New_York' } } };

  it('carries roster_failed only when the membership read failed', async () => {
    const failed = await resolveCoachChatContext(sbWith({ ...rows, golf_team_members: { data: null, error: { message: 'boom' } } }));
    expect(failed.roster).toEqual([]);
    expect(failed.roster_failed).toBe(true);
  });

  it('a roster that read has no such key at all (every existing caller sees what it always did)', async () => {
    const ok = await resolveCoachChatContext(sbWith({ ...rows, golf_team_members: { data: [{ player_id: 'p1' }] }, golf_players: { data: [{ id: 'p1', first_name: 'Nick', last_name: 'Rini', graduation_year: 2027 }] } }));
    expect(ok.roster).toHaveLength(1);
    expect('roster_failed' in ok).toBe(false);
  });
});
