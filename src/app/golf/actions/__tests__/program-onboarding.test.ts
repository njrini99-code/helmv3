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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: serverMock.from,
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

    // The golf_team_members insert must use team-mens, not team-womens
    const memberInsert = serverMock.insertCalls.find((c) => c.table === 'golf_team_members');
    expect(memberInsert).toBeDefined();
    expect((memberInsert!.rows as Record<string, unknown>).team_id).toBe('team-mens');
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

    const memberInsert = serverMock.insertCalls.find((c) => c.table === 'golf_team_members');
    expect(memberInsert).toBeDefined();
    expect((memberInsert!.rows as Record<string, unknown>).team_id).toBe('team-womens');
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
  });
});
