import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regression: a player could not join a team at all, on either entry point.
 *
 * `golf_teams_select` is `USING (is_golf_team_coach(id) OR is_golf_team_player(id))`.
 * A player who is about to join is neither yet, so every direct read of the
 * target team returned ZERO ROWS for exactly the people the join flow exists to
 * serve. `validateGolfPlayerCanJoinTeam` used such a read as its "does this team
 * exist?" check, concluded "Team not found", and abandoned the join before the
 * SECURITY DEFINER insert — which works fine — was ever called.
 *
 * Both `/golf/join/[code]` and the signup-code path funnel through
 * `processGolfTeamInvitation`, so both were dead.
 *
 * Why no existing unit test caught it: the shared mock returns seeded data for
 * every `from(table)` read, so `golf_teams` was always readable in tests. The
 * failure is a *denial*, and only a mock that can deny expresses it. These tests
 * therefore make the direct `golf_teams` read return null — the real RLS
 * behaviour — while the definer RPC still resolves the team.
 */

const TEAM = {
  id: 'team-uncw',
  name: 'UNC Wilmington Golf',
  organization_id: 'org-uncw',
};
const PLAYER_ID = 'player-1';
const USER_ID = 'user-player-1';
const CODE = 'ZAYMK5NC';

/** Tables the caller is allowed to read. `golf_teams` is deliberately absent. */
let readable: Record<string, unknown>;
let teamMembership: unknown;
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let joinRpcError: { message: string } | null = null;

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};

  const result = () => {
    if (table === 'golf_team_members') return { data: teamMembership, error: null };
    // RLS denial surfaces as zero rows, not as an error.
    const data = table in readable ? readable[table] : null;
    return { data, error: null };
  };

  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => result());
  chain.maybeSingle = vi.fn(async () => result());
  chain.then = vi.fn((onFulfilled: (v: unknown) => void) => {
    void Promise.resolve(result()).then(onFulfilled);
  });
  return chain;
}

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  rpcCalls.push({ fn, args });
  // The definer functions see the team regardless of membership — that is the
  // entire point of them.
  if (fn === 'golf_team_by_join_code') {
    return { data: args.p_code === CODE ? [TEAM] : [], error: null };
  }
  if (fn === 'golf_join_team_with_code') {
    return { data: null, error: joinRpcError };
  }
  return { data: null, error: null };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => makeChain(table)),
    rpc,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { processGolfTeamInvitation } from '../teams';

describe('joining a team when golf_teams is not readable by the joiner', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    joinRpcError = null;
    teamMembership = null;
    readable = {
      golf_players: {
        id: PLAYER_ID,
        user_id: USER_ID,
        onboarding_completed: true,
        first_name: 'QA',
        last_name: 'Recruit',
      },
      golf_coaches: [],
      // NOTE: no `golf_teams` entry — a prospective member cannot read it.
    };
  });

  it('joins successfully even though the target team is unreadable', async () => {
    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('performs the membership INSERT through the definer RPC, with the code', async () => {
    await processGolfTeamInvitation(CODE, PLAYER_ID);

    const join = rpcCalls.find((c) => c.fn === 'golf_join_team_with_code');
    expect(join).toBeDefined();
    expect(join!.args.p_code).toBe(CODE);
  });

  it('normalizes a lowercase code before resolving and joining', async () => {
    const result = await processGolfTeamInvitation(CODE.toLowerCase(), PLAYER_ID);

    expect(result.success).toBe(true);
    expect(rpcCalls.find((c) => c.fn === 'golf_join_team_with_code')!.args.p_code).toBe(CODE);
  });

  it('still rejects a code that resolves to no team', async () => {
    const result = await processGolfTeamInvitation('NOSUCHCD', PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid join code/i);
    expect(rpcCalls.find((c) => c.fn === 'golf_join_team_with_code')).toBeUndefined();
  });

  it('still refuses when the player already belongs to a different team', async () => {
    teamMembership = { team_id: 'team-other' };

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already on/i);
    expect(rpcCalls.find((c) => c.fn === 'golf_join_team_with_code')).toBeUndefined();
  });

  it('still refuses a second join of the same team', async () => {
    teamMembership = { team_id: TEAM.id };

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already a member/i);
  });

  it('still refuses when onboarding is not complete', async () => {
    (readable.golf_players as Record<string, unknown>).onboarding_completed = false;

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/complete your player profile/i);
  });

  it('still refuses to join on behalf of someone else’s player profile', async () => {
    (readable.golf_players as Record<string, unknown>).user_id = 'user-someone-else';

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/your own player profile/i);
    expect(rpcCalls.find((c) => c.fn === 'golf_join_team_with_code')).toBeUndefined();
  });

  it('reports failure when the definer insert itself is rejected', async () => {
    joinRpcError = { message: 'new row violates row-level security policy' };

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to join/i);
  });
});
