// =============================================================================
// joinTeamByCode resolves the team through resolve_baseball_team_by_join_code
//
// The code redeemer is not a member of the target team yet, so once
// baseball_teams_select is tenant-scoped (20260729000200) a direct
// `.eq('join_code', ...)` read returns zero rows for every caller and the flow
// answers "Invalid invite code" to everybody. These tests pin the contract the
// SECURITY DEFINER resolver replaces it with: the code travels as an argument,
// the result is a set, and an empty set is still the same user-facing failure.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
    rpc,
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/validation/server-action-validator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation/server-action-validator')>();
  return {
    ...actual,
    formatSafeErrorResponse: vi.fn((err: unknown) => ({
      success: false,
      error: err instanceof Error ? err.message : 'error',
    })),
    logSecurityEvent: vi.fn(async () => {}),
  };
});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction: (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'player',
    activeCoachId: null,
    activePlayerId: 'player-1',
    fellBackFromStale: false,
  })),
}));
vi.mock('@/lib/baseball/capabilities', () => ({
  requireBaseballCapability: vi.fn(async () => {}),
}));

import { joinTeamByCode } from '@/app/baseball/actions/teams';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
const TEAM_ID = '22222222-2222-4222-8222-222222222222';
const JOIN_CODE = 'EAGLE123';

/**
 * Minimal PostgrestFilterBuilder stand-in. `resolve` is handed the columns the
 * caller selected so one mock can serve every read of a table (joinTeam reads
 * baseball_players twice with different column lists), and the builder is
 * itself thenable because list reads such as
 * `.select(...).eq('player_id', id)` are awaited with no terminal accessor.
 */
function builderFor(resolve: (selected: string | undefined) => unknown) {
  let selected: string | undefined;
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((columns?: string) => {
    selected = columns;
    return builder;
  });
  for (const method of ['eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => resolve(selected));
  builder.maybeSingle = vi.fn(async () => resolve(selected));
  builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (err: unknown) => unknown) =>
    Promise.resolve(resolve(selected)).then(onFulfilled, onRejected);
  return builder;
}

/** Every read joinTeam performs on the happy path for a high-school join. */
function wireHappyPathTables() {
  from.mockImplementation((table: string) => {
    if (table === 'baseball_players') {
      return builderFor((selected) =>
        selected?.includes('player_type')
          ? { data: { player_type: 'high_school' }, error: null }
          : { data: { id: PLAYER_ID, user_id: 'user-1' }, error: null },
      );
    }
    if (table === 'baseball_team_members') {
      // No select() ran => this is the membership INSERT, not the list read.
      return builderFor((selected) =>
        selected === undefined ? { error: null } : { data: [], error: null },
      );
    }
    // NOTE: deliberately no 'baseball_teams' branch. Every read of that table
    // in the join chain must go through an RPC — a `.from('baseball_teams')`
    // read would fall through to the empty default below and fail the flow,
    // which is exactly what migration B does to it in production.
    return builderFor(() => ({ data: null, error: null }));
  });
}

/**
 * Dispatch the three join-chain RPCs by name.
 *
 * Both `get_baseball_team_join_context` call sites are answered from one
 * fixture, because in production they are one function — the point of the
 * refactor is that the join chain has a single resolver, not two shapes that
 * can drift.
 */
function wireHappyPathRpcs() {
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'resolve_baseball_team_by_join_code') {
      return { data: [{ id: TEAM_ID, name: 'Eagles', team_type: 'high_school' }], error: null };
    }
    if (fn === 'get_baseball_team_join_context') {
      return {
        data: [
          {
            id: TEAM_ID,
            name: 'Eagles',
            team_type: 'high_school',
            invite_policy: 'open',
            require_coach_approval: false,
          },
        ],
        error: null,
      };
    }
    return { data: null, error: null };
  });
}

/** Names of every table read via `.from()` during the run. */
function tablesRead(): string[] {
  return from.mock.calls.map((c) => c[0] as string);
}

describe('joinTeamByCode join-code resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('resolves a valid code through the RPC and joins the returned team', async () => {
    wireHappyPathRpcs();
    wireHappyPathTables();

    const result = await joinTeamByCode(JOIN_CODE, PLAYER_ID);

    expect(result.success).toBe(true);
    // The team id the join proceeds with comes from the resolver, not from a
    // caller-supplied id — the code is the only thing the redeemer provides.
    const membershipInsert = from.mock.results
      .map((r) => r.value as Record<string, ReturnType<typeof vi.fn>>)
      .find((b) => b.insert?.mock.calls.length);
    expect(membershipInsert?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: TEAM_ID, player_id: PLAYER_ID }),
    );
  });

  it('passes the code as p_join_code, never as a query filter on baseball_teams', async () => {
    wireHappyPathRpcs();
    wireHappyPathTables();

    await joinTeamByCode(JOIN_CODE, PLAYER_ID);

    expect(rpc).toHaveBeenCalledWith('resolve_baseball_team_by_join_code', {
      p_join_code: JOIN_CODE,
    });
  });

  it('reads baseball_teams through RPCs ONLY — no `.from()` anywhere in the chain', async () => {
    // THE regression this whole file exists for. Repointing just the code
    // lookup left two more pre-membership `.from('baseball_teams')` reads
    // inside joinTeam (validatePlayerCanJoinTeam and the join-policy check).
    // Under migration B those return zero rows for a caller with no
    // membership — which every code redeemer is, by definition — so the flow
    // answered "Team not found" and join-by-code stayed just as broken, with
    // a more confusing message.
    //
    // Asserted as an absence across the WHOLE chain rather than per-call site,
    // so a fourth read added later fails here too.
    wireHappyPathRpcs();
    wireHappyPathTables();

    const result = await joinTeamByCode(JOIN_CODE, PLAYER_ID);

    expect(result.success).toBe(true);
    expect(tablesRead()).not.toContain('baseball_teams');
  });

  it('resolves the join context for the team it is actually joining', async () => {
    wireHappyPathRpcs();
    wireHappyPathTables();

    await joinTeamByCode(JOIN_CODE, PLAYER_ID);

    // The id must come from the code resolver, not from anything the caller
    // supplied — a redeemer provides a code and nothing else.
    expect(rpc).toHaveBeenCalledWith('get_baseball_team_join_context', {
      p_team_id: TEAM_ID,
    });
  });

  it('still fails closed when the join-context resolver returns nothing', async () => {
    // A team id that names no row must not fall through into a join with
    // defaulted policy values.
    rpc.mockImplementation(async (fn: string) =>
      fn === 'resolve_baseball_team_by_join_code'
        ? { data: [{ id: TEAM_ID, name: 'Eagles', team_type: 'high_school' }], error: null }
        : { data: [], error: null },
    );
    wireHappyPathTables();

    const result = await joinTeamByCode(JOIN_CODE, PLAYER_ID);

    expect(result.success).toBe(false);
  });

  it('reports the unchanged "Invalid invite code" copy when the set comes back empty', async () => {
    // An unknown code is not an error — the resolver simply matches no row.
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await joinTeamByCode('NOPE0000', PLAYER_ID);

    expect(result).toEqual({ success: false, error: 'Invalid invite code' });
    // Nothing may be read or written on the back of a code that resolved to
    // nothing — the flow stops before joinTeam is ever reached.
    expect(from).not.toHaveBeenCalled();
  });

  it('logs an RPC error instead of silently reporting it as an invalid code', async () => {
    // An RPC ERROR is not a typo — it is the resolver being unreachable, which
    // is exactly what a deploy landing before migration A looks like
    // (PostgREST answers PGRST202). Collapsing that into "Invalid invite code"
    // with no telemetry presents a total outage as a user mistake, for every
    // user at once. The user-facing copy is deliberately unchanged — "invalid
    // code" is still the only honest thing to tell someone whose join we could
    // not verify — but the failure has to be visible to us.
    const { logServerError } = await import('@/lib/server-error-logger');
    rpc.mockResolvedValue({ data: null, error: { message: 'PGRST202' } });

    const result = await joinTeamByCode(JOIN_CODE, PLAYER_ID);

    expect(result).toEqual({ success: false, error: 'Invalid invite code' });
    expect(from).not.toHaveBeenCalled();
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('join_code resolver failed'),
      expect.objectContaining({ action: 'teams.joinTeamByCode' }),
    );
  });

  it('does NOT log when the code simply matches nothing', async () => {
    // The distinction that makes the log above useful: a wrong code is a
    // normal, expected outcome. Logging it too would bury the outage signal
    // under every user typo.
    const { logServerError } = await import('@/lib/server-error-logger');
    rpc.mockResolvedValue({ data: [], error: null });

    await joinTeamByCode('NOPE0000', PLAYER_ID);

    expect(logServerError).not.toHaveBeenCalled();
  });
});
