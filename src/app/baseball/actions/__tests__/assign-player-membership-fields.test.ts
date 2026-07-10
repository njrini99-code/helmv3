// =============================================================================
// assignPlayerToTeam — joined_at / status regression coverage (repair round)
//
// Bugs fixed:
//   1. joined_at was unconditionally reset to now() on EVERY call, including
//      an edit of an already-rostered player's jersey/position — corrupting
//      the public "Joined {month year}" profile field + roster sort order.
//   2. The insert branch never set status, so a brand-new manual "add
//      existing player" membership silently landed in the DB default
//      ('pending') instead of 'active', reintroducing the pending-joiner
//      confusion in the flow meant to bypass it.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
  })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction: (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (args: unknown) =>
      fn(
        {
          user: { id: 'coach-user-1' },
          targetTeamId: 'team-1',
        },
        args,
      ),
}));
vi.mock('@/lib/baseball/capabilities', () => ({
  requireBaseballCapability: vi.fn(async () => {}),
}));
vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendRosterTimelineEvent: vi.fn(async () => {}),
}));

import { assignPlayerToTeam } from '@/app/baseball/actions/roster';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';

function chain(resolver: () => unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'single', 'insert', 'update']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(resolver);
  return builder;
}

describe('assignPlayerToTeam — joined_at / status membership-field fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'coach-user-1' } } });
  });

  it('EDIT of an existing membership never touches joined_at or status', async () => {
    const playerChain = chain(() => ({
      data: { id: PLAYER_ID, first_name: 'Riley', last_name: 'Bennett' },
      error: null,
    }));
    const existingCheckChain = chain(() => ({ data: { id: 'membership-1' }, error: null }));
    const updateEq = vi.fn(async () => ({ error: null }));
    const updateSpy = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }));

    let teamMemberCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') return playerChain;
      if (table === 'baseball_team_members') {
        teamMemberCalls += 1;
        // First call is the existence check (select().eq().eq().maybeSingle()).
        if (teamMemberCalls === 1) return existingCheckChain;
        // Second call is the update itself.
        return { update: updateSpy };
      }
      return chain(() => ({ data: null, error: null }));
    });

    const result = await assignPlayerToTeam({
      playerId: PLAYER_ID,
      jerseyNumber: 24,
      position: 'SS',
    });

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith({ jersey_number: 24, position: 'SS' });
    // The regression: joined_at/status must NOT appear in the update payload.
    const updatePayload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload).not.toHaveProperty('joined_at');
    expect(updatePayload).not.toHaveProperty('status');
  });

  it('brand-new membership INSERTs with status "active" and a fresh joined_at', async () => {
    const playerChain = chain(() => ({
      data: { id: PLAYER_ID, first_name: 'Quinn', last_name: 'Ortiz' },
      error: null,
    }));
    const existingCheckChain = chain(() => ({ data: null, error: null }));
    const insertSpy = vi.fn(async (_payload: Record<string, unknown>) => ({ error: null }));

    let teamMemberCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') return playerChain;
      if (table === 'baseball_team_members') {
        teamMemberCalls += 1;
        if (teamMemberCalls === 1) return existingCheckChain;
        return { insert: insertSpy };
      }
      return chain(() => ({ data: null, error: null }));
    });

    const result = await assignPlayerToTeam({
      playerId: PLAYER_ID,
      jerseyNumber: 7,
      position: 'CF',
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertPayload = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertPayload.status).toBe('active');
    expect(typeof insertPayload.joined_at).toBe('string');
    expect(insertPayload).toMatchObject({
      team_id: 'team-1',
      player_id: PLAYER_ID,
      jersey_number: 7,
      position: 'CF',
    });
  });
});
