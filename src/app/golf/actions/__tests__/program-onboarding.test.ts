import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Invariant tests for multi-team program onboarding:
 *
 *  1. completeCoachOnboarding writes gender + head_coach staff row.
 *  2. addSecondTeam creates a second team + staff row (is_primary=false) +
 *     unique join code; rejects when prerequisites are missing.
 *  3. processGolfTeamInvitation (join flow) routes the player to the SPECIFIC
 *     team that owns the join code — both teams of a 2-team org can have
 *     distinct, working codes.
 */

// ── Chainable Supabase mock builder ──────────────────────────────────────────

type MockData = unknown;

/**
 * Returns a per-table resolver and a chainable mock `from` function.
 * Each `from(table)` lookup returns the seeded data for that table via
 * `.single()` or `.maybeSingle()`. `.insert()` records the call and returns
 * the seeded result for the table.
 */
function buildSupabaseMock() {
  const resolvers = new Map<string, { data: MockData; error: null | { message: string } }>();
  const insertCalls: Array<{ table: string; rows: MockData }> = [];

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    const result = () => resolvers.get(table) ?? { data: null, error: null };

    chain.select = vi.fn(() => chain);
    chain.insert = vi.fn((rows: MockData) => {
      insertCalls.push({ table, rows });
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.upsert = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.filter = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.single = vi.fn(async () => result());
    chain.maybeSingle = vi.fn(async () => result());
    // Allow `await supabase.from(table).insert(row)` (PostgREST-style awaitable)
    chain.then = vi.fn((onFulfilled: (v: unknown) => void) => {
      const r = result();
      void Promise.resolve(r).then(onFulfilled);
    });

    return chain;
  }

  const from = vi.fn((table: string) => makeChain(table));

  const mock = {
    from,
    insertCalls,
    seed(table: string, data: MockData, error: null | { message: string } = null) {
      resolvers.set(table, { data, error });
    },
    /** Read a seeded row back — used by the rpc() mock to resolve a join code. */
    peek(table: string) {
      return resolvers.get(table);
    },
    reset() {
      resolvers.clear();
      insertCalls.length = 0;
      from.mockClear();
    },
  };

  return mock;
}

const serverMock = buildSupabaseMock();
const adminMock = buildSupabaseMock();

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: 'user-coach-1', email: 'coach@test.com', user_metadata: {} } },
  error: null,
}));

/**
 * #1257 — the join-code path no longer reads `golf_teams` directly. The old
 * lookup only worked because a policy read `USING (join_code IS NOT NULL)`,
 * which made every team row and every join code readable by any signed-in
 * user. Resolution moved into two SECURITY DEFINER functions:
 *
 *   golf_team_by_join_code(p_code)   -> the single matching team, never its code
 *   golf_join_team_with_code(p_code) -> re-resolves the team server-side and
 *                                       performs the membership INSERT, so the
 *                                       client never supplies the team id
 *
 * The mock resolves the lookup from the SAME `golf_teams` seed the tests
 * already use, so a seeded team still stands in for "this code matches this
 * team". Note what this means for the assertions below: the code -> team
 * mapping is now enforced in SQL, so a unit test can no longer observe it in
 * an insert payload. What it CAN still pin is that the flow goes through the
 * definer functions with the normalized code — which is the part that lives in
 * this file.
 */
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

const serverRpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  rpcCalls.push({ fn, args });
  if (fn === 'golf_team_by_join_code') {
    const seeded = serverMock.peek('golf_teams');
    if (!seeded?.data) return { data: [], error: null };
    return { data: [seeded.data], error: null };
  }
  if (fn === 'golf_join_team_with_code') {
    return { data: null, error: null };
  }
  return { data: null, error: null };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: serverMock.from,
    rpc: serverRpc,
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: adminMock.from,
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import AFTER mocks are set up
import { completeCoachOnboarding } from '../onboarding';
import { addSecondTeam, processGolfTeamInvitation } from '../teams';

// ── Suite 1: completeCoachOnboarding — gender + staff row ────────────────────

describe('completeCoachOnboarding', () => {
  beforeEach(() => {
    serverMock.reset();
    adminMock.reset();

    // Happy-path seeds
    serverMock.seed('users', { id: 'user-coach-1' });
    serverMock.seed('organizations', { id: 'org-1' });
    serverMock.seed('golf_coaches', { id: 'coach-1' });
    serverMock.seed('golf_teams', {
      id: 'team-1',
      join_code: 'ABCD1234',
    });
    adminMock.seed('golf_team_coach_staff', null);
  });

  it('passes gender=womens to golf_teams insert', async () => {
    const result = await completeCoachOnboarding({
      orgName: 'State University',
      fullName: 'Jane Coach',
      gender: 'womens',
    });

    expect(result.success).toBe(true);

    // The golf_teams insert goes through the server client
    const teamRow = serverMock.insertCalls.find((c) => c.table === 'golf_teams');
    expect(teamRow).toBeDefined();
    expect((teamRow!.rows as Record<string, unknown>).gender).toBe('womens');
  });

  it('defaults gender to mens when undefined is passed', async () => {
    const result = await completeCoachOnboarding({
      orgName: 'State University',
      fullName: 'John Coach',
      // gender: undefined — Zod default('mens') should fill it in
      gender: undefined as unknown as 'mens',
    });

    expect(result.success).toBe(true);

    const teamRow = serverMock.insertCalls.find((c) => c.table === 'golf_teams');
    expect(teamRow).toBeDefined();
    expect((teamRow!.rows as Record<string, unknown>).gender).toBe('mens');
  });

  it('inserts a head_coach is_primary=true staff row via admin client', async () => {
    await completeCoachOnboarding({
      orgName: 'State University',
      fullName: 'John Coach',
      gender: 'mens' as const,
    });

    const staffInsert = adminMock.insertCalls.find((c) => c.table === 'golf_team_coach_staff');
    expect(staffInsert).toBeDefined();
    const row = staffInsert!.rows as Record<string, unknown>;
    expect(row.role).toBe('head_coach');
    expect(row.is_primary).toBe(true);
  });

  it('trims the organization name before insert (whitespace-variant dup guard)', async () => {
    const result = await completeCoachOnboarding({
      orgName: '  State University  ',
      fullName: 'Jane Coach',
      gender: 'mens' as const,
    });

    expect(result.success).toBe(true);
    const orgInsert = serverMock.insertCalls.find((c) => c.table === 'organizations');
    expect((orgInsert!.rows as Record<string, unknown>).name).toBe('State University');
    // The team-name fallback uses the trimmed org name too.
    const teamInsert = serverMock.insertCalls.find((c) => c.table === 'golf_teams');
    expect((teamInsert!.rows as Record<string, unknown>).name).toBe('State University Golf');
  });

  it('returns a friendly error (no duplicate org) when the name already exists', async () => {
    // Simulate the 23505 raised by organizations_normalized_name_uidx.
    const dupErr = {
      message: 'duplicate key value violates unique constraint "organizations_normalized_name_uidx"',
      code: '23505',
    };
    serverMock.seed('organizations', null, dupErr);

    const result = await completeCoachOnboarding({
      orgName: 'Duke University ',
      fullName: 'Jane Coach',
      gender: 'mens' as const,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists/i);
    // Must NOT proceed to create a coach/team after the org collision.
    expect(serverMock.insertCalls.find((c) => c.table === 'golf_coaches')).toBeUndefined();
  });

  it('returns success: false when team creation fails', async () => {
    serverMock.seed('golf_teams', null, { message: 'DB error: insert failed' });

    const result = await completeCoachOnboarding({
      orgName: 'State University',
      fullName: 'John Coach',
      gender: 'mens' as const,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── Suite 2: addSecondTeam ────────────────────────────────────────────────────

describe('addSecondTeam', () => {
  const TEAM_ID = 'team-2';
  const JOIN_CODE = 'WXYZ9876';

  beforeEach(() => {
    serverMock.reset();
    adminMock.reset();

    // Coach exists with org + at least one primary staff row
    serverMock.seed('golf_coaches', { id: 'coach-1', organization_id: 'org-1' });
    // Returning the primary staff row signals the prerequisite is met
    serverMock.seed('golf_team_coach_staff', { id: 'staff-primary', is_primary: true });
    // No gender conflict in existing teams. organization_id is echoed back on the
    // insert's .select() (real Supabase behaviour) so the addSecondTeam org-match
    // assertion before the privileged staff insert passes.
    serverMock.seed('golf_teams', {
      id: TEAM_ID,
      name: "Women's Golf",
      season: '2025-2026',
      join_code: JOIN_CODE,
      created_at: new Date().toISOString(),
      organization_id: 'org-1',
    });
    adminMock.seed('golf_team_coach_staff', null);
  });

  it('creates a new team with the specified gender', async () => {
    const result = await addSecondTeam("Women's Golf", 'womens');

    expect(result.success).toBe(true);
    const teamRow = serverMock.insertCalls.find((c) => c.table === 'golf_teams');
    expect(teamRow).toBeDefined();
    expect((teamRow!.rows as Record<string, unknown>).gender).toBe('womens');
  });

  it('inserts a head_coach is_primary=false staff row on the new team', async () => {
    await addSecondTeam("Women's Golf", 'womens');

    const staffInsert = adminMock.insertCalls.find((c) => c.table === 'golf_team_coach_staff');
    expect(staffInsert).toBeDefined();
    const row = staffInsert!.rows as Record<string, unknown>;
    expect(row.role).toBe('head_coach');
    expect(row.is_primary).toBe(false);
  });

  it('returns an error when coach has no primary team yet', async () => {
    // Override: no primary staff row exists
    serverMock.seed('golf_team_coach_staff', null);

    const result = await addSecondTeam("Women's Golf", 'womens');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/primary team/i);
  });

  it('returns an error when coach has no organization', async () => {
    serverMock.seed('golf_coaches', { id: 'coach-1', organization_id: null });

    const result = await addSecondTeam("Women's Golf", 'womens');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/organization/i);
  });

  it('returns an error when coach is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'not authenticated' } } as never);

    const result = await addSecondTeam("Women's Golf", 'womens');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authenticated/i);
  });
});

// ── Suite 3: processGolfTeamInvitation — join code routes to exact team ──────

describe('processGolfTeamInvitation — dual-team org routing', () => {
  beforeEach(() => {
    serverMock.reset();
    adminMock.reset();
    rpcCalls.length = 0;
    serverRpc.mockClear();
  });

  it('routes MENS1234 to the mens team (team-mens), not team-womens', async () => {
    // The join code lookup finds team-mens
    serverMock.seed('golf_teams', { id: 'team-mens', name: "Men's Golf", join_code: 'MENS1234' });
    // Player is not yet on any team
    serverMock.seed('golf_team_members', null);
    // Player profile
    serverMock.seed('golf_players', {
      id: 'player-1',
      user_id: 'user-coach-1',
      onboarding_completed: true,
    });

    const result = await processGolfTeamInvitation('MENS1234', 'player-1');

    expect(result.success).toBe(true);

    // #1257 — the membership INSERT moved into golf_join_team_with_code, which
    // re-resolves the team from the code in SQL instead of trusting a team id
    // from the client. So the routing guarantee is no longer observable in an
    // insert payload; what this file can still pin is that the flow resolves
    // through the definer function with the exact code, and never falls back to
    // a client-supplied team id.
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'golf_team_by_join_code',
      'golf_join_team_with_code',
    ]);
    expect(rpcCalls[0]?.args).toEqual({ p_code: 'MENS1234' });
    expect(rpcCalls[1]?.args).toEqual({ p_code: 'MENS1234' });
    expect(serverMock.insertCalls.find((c) => c.table === 'golf_team_members')).toBeUndefined();
  });

  it('routes WOMN5678 to the womens team (team-womens), not team-mens', async () => {
    serverMock.seed('golf_teams', { id: 'team-womens', name: "Women's Golf", join_code: 'WOMN5678' });
    serverMock.seed('golf_team_members', null);
    serverMock.seed('golf_players', {
      id: 'player-2',
      user_id: 'user-coach-1',
      onboarding_completed: true,
    });

    const result = await processGolfTeamInvitation('WOMN5678', 'player-2');

    expect(result.success).toBe(true);

    expect(rpcCalls.map((c) => c.fn)).toEqual([
      'golf_team_by_join_code',
      'golf_join_team_with_code',
    ]);
    expect(rpcCalls[0]?.args).toEqual({ p_code: 'WOMN5678' });
    expect(rpcCalls[1]?.args).toEqual({ p_code: 'WOMN5678' });
  });

  it('rejects an invalid/unknown join code', async () => {
    serverMock.seed('golf_teams', null);

    const result = await processGolfTeamInvitation('BADCODE1', 'player-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it('rejects a player already on a team', async () => {
    serverMock.seed('golf_teams', { id: 'team-a', name: 'Team A', join_code: 'CODEA123' });
    serverMock.seed('golf_team_members', { team_id: 'team-b' }); // already on team-b
    serverMock.seed('golf_players', {
      id: 'player-3',
      user_id: 'user-coach-1',
      onboarding_completed: true,
    });

    const result = await processGolfTeamInvitation('CODEA123', 'player-3');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already/i);
  });

  it('normalizes the join code to uppercase before lookup', async () => {
    serverMock.seed('golf_teams', { id: 'team-x', name: 'Team X', join_code: 'ABCD1234' });
    serverMock.seed('golf_team_members', null);
    serverMock.seed('golf_players', {
      id: 'player-4',
      user_id: 'user-coach-1',
      onboarding_completed: true,
    });

    // Pass lowercase — should succeed because processGolfTeamInvitation normalizes
    const result = await processGolfTeamInvitation('abcd1234', 'player-4');

    expect(result.success).toBe(true);
    // Now directly observable: the definer function is asked for the UPPERCASED
    // code, not the raw input.
    expect(rpcCalls[0]).toEqual({ fn: 'golf_team_by_join_code', args: { p_code: 'ABCD1234' } });
  });
});
