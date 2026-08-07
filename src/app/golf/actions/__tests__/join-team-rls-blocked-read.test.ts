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
/** Simulates the code LOOKUP itself failing, as distinct from a bad code. */
let lookupRpcError: { message: string } | null = null;
/** Rows `golf_my_join_requests` returns — the definer view of the caller's requests. */
let myJoinRequests: Array<Record<string, unknown>> = [];

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
    // A bare awaited select resolves PostgREST-style: `data` is an ARRAY of
    // rows, never a bare object. The membership guard reads this way since it
    // dropped `.maybeSingle()`; a stub that hands back the naked object is
    // lying about the contract the real client keeps.
    const base = result();
    const value =
      table === 'golf_team_members'
        ? { ...base, data: base.data == null ? [] : Array.isArray(base.data) ? base.data : [base.data] }
        : base;
    void Promise.resolve(value).then(onFulfilled);
  });
  return chain;
}

const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  rpcCalls.push({ fn, args });
  // The definer functions see the team regardless of membership — that is the
  // entire point of them.
  if (fn === 'golf_team_by_join_code') {
    if (lookupRpcError) return { data: null, error: lookupRpcError };
    return { data: args.p_code === CODE ? [TEAM] : [], error: null };
  }
  if (fn === 'golf_join_team_with_code') {
    return { data: null, error: joinRpcError };
  }
  if (fn === 'golf_my_join_requests') {
    return { data: myJoinRequests, error: null };
  }
  return { data: null, error: null };
});

/** Rows written with the SERVICE-ROLE client, per table. */
const adminInserts: Array<{ table: string; rows: unknown }> = [];

function makeAdminChain(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'upsert', 'delete', 'eq', 'in', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.insert = vi.fn((rows: unknown) => {
    adminInserts.push({ table, rows });
    return chain;
  });
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  chain.then = vi.fn((onFulfilled: (v: unknown) => void) => {
    void Promise.resolve({ data: null, error: null }).then(onFulfilled);
  });
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => makeChain(table)),
    rpc,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => makeAdminChain(table)),
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { processGolfTeamInvitation, createTeamJoinRequest, getPlayerJoinRequests } from '../teams';

describe('joining a team when golf_teams is not readable by the joiner', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    adminInserts.length = 0;
    joinRpcError = null;
    lookupRpcError = null;
    teamMembership = null;
    myJoinRequests = [{
      id: 'req-1',
      status: 'pending',
      message: null,
      created_at: '2026-08-07T00:00:00Z',
      team_id: TEAM.id,
      team_name: TEAM.name,
      organization_name: 'UNC Wilmington',
    }];
    readable = {
      golf_players: {
        id: PLAYER_ID,
        user_id: USER_ID,
        onboarding_completed: true,
        first_name: 'QA',
        last_name: 'Recruit',
      },
      golf_coaches: [{ id: 'coach-1', user_id: 'user-coach-1' }],
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

  it('treats a second join of the same team as SUCCESS — joining is idempotent', async () => {
    // The invite flow legitimately runs the join twice (onboarding auto-joins,
    // the join page confirms). The desired end state already holds, so this is
    // success — reporting it as a red error was losing brand-new players at
    // the signup door on 2026-08-06.
    teamMembership = { team_id: TEAM.id };

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(true);
    expect(result.alreadyMember).toBe(true);
    // The INSERT must not re-run — no duplicate "player joined" notification.
    expect(rpcCalls.find((c) => c.fn === 'golf_join_team_with_code')).toBeUndefined();
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

  it('notifies the coach, naming the team it could never have read', async () => {
    // Two separate reasons this used to produce nothing:
    //   1. the team lookup feeding the message ran before the INSERT, so it
    //      was RLS-denied and `team` was null — the whole block was skipped;
    //   2. notifications_insert_own is WITH CHECK (user_id = auth.uid()), so a
    //      player cannot address a row to their coach at all.
    await processGolfTeamInvitation(CODE, PLAYER_ID);

    const notify = adminInserts.find((i) => i.table === 'notifications');
    expect(notify).toBeDefined();
    const rows = notify!.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe('user-coach-1');
    expect(rows[0]!.type).toBe('team_join');
    expect(rows[0]!.body).toBe(`QA Recruit has joined ${TEAM.name}`);
  });

  it('sends the coach notification with the SERVICE-ROLE client, not the player’s', async () => {
    // If this ever regresses to the caller's client, RLS silently drops it and
    // the join still "succeeds" — which is exactly how it went unnoticed from
    // 2026-02-10 onward.
    await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(adminInserts.some((i) => i.table === 'notifications')).toBe(true);
  });

  it('does not notify anyone when the join itself failed', async () => {
    joinRpcError = { message: 'denied' };

    await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(adminInserts.find((i) => i.table === 'notifications')).toBeUndefined();
  });

  it('reports failure when the definer insert itself is rejected', async () => {
    joinRpcError = { message: 'new row violates row-level security policy' };

    const result = await processGolfTeamInvitation(CODE, PLAYER_ID);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to join/i);
  });

  /**
   * The SECOND entry point, which this harness never exercised.
   *
   * These tests exist because the suite above passed for the entire four days
   * `createTeamJoinRequest` was dead in production. The denying mock was
   * already the right harness — it was simply never pointed at this function.
   * A player typing their correct code into Settings → Join a Team got
   * "Invalid team code" every time, because the lookup was a direct
   * `.eq('join_code', …)` on a table RLS will not show a non-member.
   */
  describe('createTeamJoinRequest — the Settings entry point', () => {
    // These assert on the CODE-RESOLUTION step, not on the end-to-end result:
    // this harness returns one canned result per table, so it cannot tell an
    // INSERT ... RETURNING apart from the SELECT that precedes it. The
    // regression being pinned is precisely that a valid code no longer dies at
    // the golf_teams read, which is fully observable here.
    it('resolves the code through the definer RPC, not a direct read', async () => {
      const result = await createTeamJoinRequest(CODE, PLAYER_ID);

      expect(rpcCalls.find((c) => c.fn === 'golf_team_by_join_code')).toBeDefined();
      // The four-day outage was exactly this string, for a correct code.
      expect(result.error ?? '').not.toMatch(/invalid team code/i);
    });

    it('still rejects a code that resolves to no team', async () => {
      const result = await createTeamJoinRequest('NOSUCHCD', PLAYER_ID);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid team code/i);
    });

    it('does not blame the user when the LOOKUP ITSELF fails', async () => {
      // An infrastructure fault reported as "check your typing" sends the
      // player into a loop that cannot terminate and logs nothing actionable.
      lookupRpcError = { message: 'connection reset' };

      const result = await createTeamJoinRequest(CODE, PLAYER_ID);

      expect(result.success).toBe(false);
      expect(result.error).not.toMatch(/invalid team code/i);
      expect(result.error).toMatch(/try again/i);
    });
  });

  describe('getPlayerJoinRequests — resolving a team you are not yet on', () => {
    it('returns the team name for a pending request', async () => {
      const result = await getPlayerJoinRequests(PLAYER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.[0]?.team?.name).toBe(TEAM.name);
    });

    it('yields a NULL team rather than crashing when it cannot be resolved', async () => {
      // The old shape asserted `team` was non-null through an `as unknown as`
      // cast while the value was in fact always null, so the UI dereferenced
      // it and took the whole Settings page down.
      myJoinRequests = [{
        id: 'req-1', status: 'pending', message: null,
        created_at: '2026-08-07T00:00:00Z',
        team_id: TEAM.id, team_name: null, organization_name: null,
      }];

      const result = await getPlayerJoinRequests(PLAYER_ID);

      expect(result.success).toBe(true);
      expect(result.data?.[0]?.team).toBeNull();
    });
  });
});
