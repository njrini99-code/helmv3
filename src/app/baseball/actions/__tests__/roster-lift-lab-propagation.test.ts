// =============================================================================
// src/app/baseball/actions/__tests__/roster-lift-lab-propagation.test.ts
//
// Team D — roster deactivation must propagate to Lift Lab
// (docs/baseballhelm-overnight/ISSUE_LEDGER.md #9).
//
// Removing/declining a baseball player left their helm_lifting_athletes row
// (linked via sport_player_id = baseball_players.id, scoped to
// organization_id + sport='baseball') is_active=true forever: still eligible
// for dynamic group membership, still visible in the Live Weight Room, still
// counted in coach compliance views.
//
// This suite locks in:
//   1. removePlayerFromTeam deactivates (never deletes) the athlete row when
//      one exists.
//   2. The propagation is idempotent / never throws when the player has no
//      athlete row, or when the team has no organization_id at all.
//   3. helm_lifting_athletes is only ever UPDATEd (is_active), never DELETEd.
//   4. A Lift Lab write failure (query error OR createAdminClient() throwing)
//      never fails the primary roster mutation.
//   5. Tenant scoping: the UPDATE is filtered to
//      (organization_id, sport='baseball', sport_player_id) for exactly this
//      player — never a broader match.
//   6. The reactivation judgment call: a brand-new membership
//      (assignPlayerToTeam's insert branch) reactivates the athlete row;
//      an EDIT of an already-rostered player does not touch it.
//   7. rejectPendingMember (a removal) deactivates; approvePendingMember (an
//      activation) reactivates — same symmetry as remove/re-add.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
}

/** Generic chainable/thenable PostgREST-shaped stub (mirrors the pattern used
 * across src/app/lifting/actions/__tests__/*.test.ts). `.then` makes the
 * builder itself awaitable so `await x.update(...).eq().eq().eq()` resolves
 * to `finalResult` regardless of how many `.eq()` calls precede the await. */
function makeQueryBuilder(finalResult: FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const m of ['select', 'eq']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.eqCalls = [] as Array<[string, unknown]>;
  builder.eq = vi.fn((col: string, val: unknown) => {
    builder.eqCalls.push([col, val]);
    return builder;
  });
  builder.updateArgs = null as unknown;
  builder.update = vi.fn((patch: unknown) => {
    builder.updateArgs = patch;
    return builder;
  });
  builder.insertArgs = null as unknown;
  builder.insert = vi.fn((payload: unknown) => {
    builder.insertArgs = payload;
    return builder;
  });
  // Present so a test can assert it was NEVER called — helm_lifting_athletes
  // must only ever be deactivated (UPDATE), never DELETEd.
  builder.delete = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.single = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const TEAM_ID = 'team-1';

const getUser = vi.fn();
const resolveBaseballLiftingOrg = vi.fn();
const logServerError = vi.fn(async (..._args: unknown[]) => {});
const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();

let baseballFromTables: Record<string, ReturnType<typeof makeQueryBuilder>>;
let liftAthletesBuilder: ReturnType<typeof makeQueryBuilder>;

function resetTables() {
  baseballFromTables = {};
  liftAthletesBuilder = makeQueryBuilder({ error: null, data: null });
}
resetTables();

/** Default createClient() resolution: dispatches purely off the static
 * baseballFromTables map. Tests that need a table to return DIFFERENT
 * builders across successive `.from()` calls within one action invocation
 * (e.g. assignPlayerToTeam's existence-check-then-insert) override with
 * createClientMock.mockResolvedValueOnce(...) instead. */
function defaultCreateClientImpl() {
  return Promise.resolve({
    auth: { getUser },
    from: vi.fn((table: string) => baseballFromTables[table]),
  });
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, args: unknown) => unknown) =>
    (args: unknown) =>
      fn({ user: { id: 'coach-user-1' }, targetTeamId: TEAM_ID }, args),
}));

vi.mock('@/lib/baseball/capabilities', () => ({
  requireBaseballCapability: vi.fn(async () => {}),
}));

vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendRosterTimelineEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveBaseballLiftingOrg: (...args: unknown[]) => resolveBaseballLiftingOrg(...args),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (...args: unknown[]) => logServerError(...args),
}));

import { assignPlayerToTeam, removePlayerFromTeam, approvePendingMember, rejectPendingMember } from '@/app/baseball/actions/roster';

describe('roster.ts -> Lift Lab propagation (helm_lifting_athletes.is_active)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTables();
    getUser.mockResolvedValue({ data: { user: { id: 'coach-user-1' } } });
    resolveBaseballLiftingOrg.mockResolvedValue({ organizationId: ORG_ID, teamId: TEAM_ID });
    createClientMock.mockImplementation(defaultCreateClientImpl);
    createAdminClientMock.mockImplementation(() => ({
      from: vi.fn((table: string) => (table === 'helm_lifting_athletes' ? liftAthletesBuilder : makeQueryBuilder({ data: null, error: null }))),
    }));
  });

  describe('removePlayerFromTeam', () => {
    function setupMembership() {
      baseballFromTables.baseball_team_members = makeQueryBuilder({
        data: {
          id: 'membership-1',
          baseball_players: { id: PLAYER_ID, first_name: 'Riley', last_name: 'Bennett' },
        },
        error: null,
      });
    }

    it('deactivates the Lift Lab athlete row for a player who has one', async () => {
      setupMembership();

      const result = await removePlayerFromTeam({ playerId: PLAYER_ID });

      expect(result.success).toBe(true);
      expect(createAdminClientMock).toHaveBeenCalledTimes(1);
      expect(liftAthletesBuilder.update).toHaveBeenCalledTimes(1);
      expect(liftAthletesBuilder.updateArgs).toMatchObject({ is_active: false });
      // Deactivate, never delete.
      expect(liftAthletesBuilder.delete).not.toHaveBeenCalled();
    });

    it('scopes the update to (organization_id, sport, sport_player_id) for exactly this player', async () => {
      setupMembership();

      await removePlayerFromTeam({ playerId: PLAYER_ID });

      expect(liftAthletesBuilder.eqCalls).toContainEqual(['organization_id', ORG_ID]);
      expect(liftAthletesBuilder.eqCalls).toContainEqual(['sport', 'baseball']);
      expect(liftAthletesBuilder.eqCalls).toContainEqual(['sport_player_id', PLAYER_ID]);
    });

    it('does not throw and still succeeds when the player has no Lift Lab athlete row (zero-row UPDATE match)', async () => {
      setupMembership();
      // Supabase returns { error: null } for a zero-row UPDATE match — same
      // shape as a real match. This is the honest "most players have none" path.
      liftAthletesBuilder = makeQueryBuilder({ error: null, data: null });

      const result = await removePlayerFromTeam({ playerId: PLAYER_ID });

      expect(result.success).toBe(true);
      expect(logServerError).not.toHaveBeenCalled();
    });

    it('does not throw and still succeeds when the team has no organization_id at all', async () => {
      setupMembership();
      resolveBaseballLiftingOrg.mockResolvedValue(null);

      const result = await removePlayerFromTeam({ playerId: PLAYER_ID });

      expect(result.success).toBe(true);
      // No org resolved -> no admin write is even attempted.
      expect(createAdminClientMock).not.toHaveBeenCalled();
    });

    it('does not fail the roster removal when the Lift Lab UPDATE errors', async () => {
      setupMembership();
      liftAthletesBuilder = makeQueryBuilder({ error: { message: 'boom', code: 'XX000' }, data: null });

      const result = await removePlayerFromTeam({ playerId: PLAYER_ID });

      expect(result.success).toBe(true);
      expect(logServerError).toHaveBeenCalledTimes(1);
    });

    it('does not fail the roster removal when createAdminClient() throws (e.g. missing service-role env)', async () => {
      setupMembership();
      createAdminClientMock.mockImplementationOnce(() => {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');
      });

      const result = await removePlayerFromTeam({ playerId: PLAYER_ID });

      expect(result.success).toBe(true);
      expect(logServerError).toHaveBeenCalledTimes(1);
    });
  });

  describe('assignPlayerToTeam (reactivation judgment call)', () => {
    it('reactivates the Lift Lab athlete row when a BRAND-NEW membership is created', async () => {
      baseballFromTables.baseball_players = makeQueryBuilder({
        data: { id: PLAYER_ID, first_name: 'Quinn', last_name: 'Ortiz' },
        error: null,
      });
      // First .from('baseball_team_members') call (existence check) returns no
      // existing membership -> insert branch. A fresh builder per call, since
      // the existence-check builder only needs .select/.eq/.maybeSingle and
      // the insert builder only needs .insert.
      let teamMemberCalls = 0;
      const existingCheck = makeQueryBuilder({ data: null, error: null });
      const insertResult = makeQueryBuilder({ error: null, data: null });
      createClientMock.mockResolvedValueOnce({
        auth: { getUser },
        from: vi.fn((table: string) => {
          if (table === 'baseball_players') return baseballFromTables.baseball_players;
          if (table === 'baseball_team_members') {
            teamMemberCalls += 1;
            return teamMemberCalls === 1 ? existingCheck : insertResult;
          }
          return makeQueryBuilder({ data: null, error: null });
        }),
      });

      const result = await assignPlayerToTeam({ playerId: PLAYER_ID, jerseyNumber: 7, position: 'CF' });

      expect(result.success).toBe(true);
      expect(insertResult.insert).toHaveBeenCalledTimes(1);
      expect(liftAthletesBuilder.update).toHaveBeenCalledTimes(1);
      expect(liftAthletesBuilder.updateArgs).toMatchObject({ is_active: true });
    });

    it('does NOT touch the Lift Lab athlete row on an EDIT of an already-rostered player', async () => {
      baseballFromTables.baseball_players = makeQueryBuilder({
        data: { id: PLAYER_ID, first_name: 'Riley', last_name: 'Bennett' },
        error: null,
      });
      let teamMemberCalls = 0;
      const existingCheck = makeQueryBuilder({ data: { id: 'membership-1' }, error: null });
      const updateResult = makeQueryBuilder({ error: null, data: null });
      createClientMock.mockResolvedValueOnce({
        auth: { getUser },
        from: vi.fn((table: string) => {
          if (table === 'baseball_players') return baseballFromTables.baseball_players;
          if (table === 'baseball_team_members') {
            teamMemberCalls += 1;
            return teamMemberCalls === 1 ? existingCheck : updateResult;
          }
          return makeQueryBuilder({ data: null, error: null });
        }),
      });

      const result = await assignPlayerToTeam({ playerId: PLAYER_ID, jerseyNumber: 24, position: 'SS' });

      expect(result.success).toBe(true);
      expect(updateResult.update).toHaveBeenCalledTimes(1);
      // EDIT branch never resolves/writes Lift Lab at all.
      expect(createAdminClientMock).not.toHaveBeenCalled();
      expect(liftAthletesBuilder.update).not.toHaveBeenCalled();
    });
  });

  describe('approvePendingMember / rejectPendingMember symmetry', () => {
    function setupPendingMembership() {
      const membershipBuilder = makeQueryBuilder({
        data: {
          id: 'membership-2',
          team_id: TEAM_ID,
          player_id: PLAYER_ID,
          status: 'pending',
          baseball_players: { first_name: 'Sam', last_name: 'Diaz' },
        },
        error: null,
      });
      baseballFromTables.baseball_team_members = membershipBuilder;
      baseballFromTables.baseball_coaches = makeQueryBuilder({ data: { id: 'coach-1' }, error: null });
      return membershipBuilder;
    }

    it('approvePendingMember reactivates the Lift Lab athlete row', async () => {
      setupPendingMembership();

      const result = await approvePendingMember({ memberId: 'membership-2' });

      expect(result.success).toBe(true);
      expect(liftAthletesBuilder.update).toHaveBeenCalledTimes(1);
      expect(liftAthletesBuilder.updateArgs).toMatchObject({ is_active: true });
    });

    it('rejectPendingMember deactivates (never deletes) the Lift Lab athlete row', async () => {
      setupPendingMembership();

      const result = await rejectPendingMember({ memberId: 'membership-2' });

      expect(result.success).toBe(true);
      expect(liftAthletesBuilder.update).toHaveBeenCalledTimes(1);
      expect(liftAthletesBuilder.updateArgs).toMatchObject({ is_active: false });
      expect(liftAthletesBuilder.delete).not.toHaveBeenCalled();
    });
  });
});
