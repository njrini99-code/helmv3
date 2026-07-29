// =============================================================================
// src/app/lifting/actions/__tests__/assignments.test.ts
//
// GUARD (Team C fix, 2026-07-29): assignLiftingTeam and syncOrgAthletes both
// called their SECURITY DEFINER RPCs with a parameter name the functions
// don't have (`p_org_id` instead of the real `p_org` — see
// supabase/migrations/20260625000030_helm_lifting_accept_invite_rpc.sql).
// syncOrgAthletes additionally assumed a nonexistent "org + optional sport"
// RPC mode; the real helm_lifting_sync_org_athletes RPC is strictly
// per-(org, sport, team_id) and returns a plain integer, not a
// `{ok, reason, athlete_count}` jsonb envelope. assignLiftingTeam has the
// same mismatch — the RPC RETURNS uuid, not `{ok, reason, assignment_id}`.
//
// These tests pin: the real parameter names, the per-team loop over active
// helm_lifting_coach_assignments (de-duped, so re-syncing never duplicates
// work), and — the actual bug report — that a sync inserting zero rows is
// reported as zero rather than a bare success, and that a real RPC failure
// surfaces as success:false rather than a false-success toast.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = 'org-1';
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

interface FinalResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

function makeQueryBuilder(getFinalResult: () => FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  const passthrough = ['select', 'eq', 'not', 'in', 'limit'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: FinalResult) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(getFinalResult()).then(resolve, reject);
  return builder;
}

let assignmentRowsResult: FinalResult;
let athleteCountResult: FinalResult;

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_client: unknown, table: string) => {
    if (table === 'helm_lifting_coach_assignments') return makeQueryBuilder(() => assignmentRowsResult);
    if (table === 'helm_lifting_athletes') return makeQueryBuilder(() => athleteCountResult);
    throw new Error(`unexpected table in test: ${table}`);
  }),
}));

let rpcQueue: Array<{ data: unknown; error: unknown }>;
const rpcMock = vi.fn(async () => rpcQueue.shift() ?? { data: 0, error: null });

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/lifting/with-lifting-action', () => ({
  withLiftingAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const ctx = {
        user: { id: 'user-1' },
        orgId: ORG_ID,
        access: { isCoach: true, canEdit: true, canView: true, coachRow: { id: 'coach-1' } },
      };
      return fn(ctx, ...args);
    },
}));

import { revalidatePath } from 'next/cache';
import { syncOrgAthletes, assignLiftingTeam } from '@/app/lifting/actions/assignments';

function resetAll() {
  assignmentRowsResult = { data: [], error: null };
  athleteCountResult = { data: null, error: null, count: 0 };
  rpcQueue = [];
  rpcMock.mockClear();
  vi.mocked(revalidatePath).mockClear();
}

describe('syncOrgAthletes', () => {
  beforeEach(resetAll);

  it('a successful sync inserts the expected rows and reports the real counts (not a fixed string)', async () => {
    assignmentRowsResult = {
      data: [
        { sport: 'baseball', team_id: TEAM_A },
        { sport: 'golf', team_id: TEAM_B },
      ],
      error: null,
    };
    rpcQueue = [
      { data: 3, error: null }, // team A: 3 newly inserted
      { data: 2, error: null }, // team B: 2 newly inserted
    ];
    athleteCountResult = { data: null, error: null, count: 5 };

    const result = await syncOrgAthletes({ orgId: ORG_ID });

    expect(result).toEqual({
      success: true,
      athleteCount: 5,
      syncedCount: 5,
      teamsSynced: 2,
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    // CRITICAL regression guard: the real RPC parameter is `p_org`, never
    // `p_org_id` — this is the exact typo that silently broke both sync
    // entry points.
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'helm_lifting_sync_org_athletes', {
      p_org: ORG_ID,
      p_sport: 'baseball',
      p_team_id: TEAM_A,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'helm_lifting_sync_org_athletes', {
      p_org: ORG_ID,
      p_sport: 'golf',
      p_team_id: TEAM_B,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/lifting/dashboard/athletes');
  });

  it('a no-op sync (no active team assignments) reports zero rather than a bare success', async () => {
    assignmentRowsResult = { data: [], error: null };

    const result = await syncOrgAthletes({ orgId: ORG_ID });

    expect(result).toEqual({
      success: true,
      athleteCount: 0,
      syncedCount: 0,
      teamsSynced: 0,
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('a per-team RPC failure surfaces an error, not a success toast', async () => {
    assignmentRowsResult = {
      data: [{ sport: 'baseball', team_id: TEAM_A }],
      error: null,
    };
    rpcQueue = [{ data: null, error: { message: 'not_authorized' } }];

    const result = await syncOrgAthletes({ orgId: ORG_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.syncedCount).toBe(0);
    expect(result.teamsSynced).toBe(0);
  });

  it('reports partial failures honestly (some teams synced, one failed) rather than blanket success', async () => {
    assignmentRowsResult = {
      data: [
        { sport: 'baseball', team_id: TEAM_A },
        { sport: 'golf', team_id: TEAM_B },
      ],
      error: null,
    };
    rpcQueue = [
      { data: 4, error: null },
      { data: null, error: { message: 'unsupported_sport: golf' } },
    ];
    athleteCountResult = { data: null, error: null, count: 4 };

    const result = await syncOrgAthletes({ orgId: ORG_ID });

    expect(result.success).toBe(false);
    expect(result.syncedCount).toBe(4);
    expect(result.teamsSynced).toBe(1);
    expect(result.error).toContain('1 team(s) failed');
  });

  it('is idempotent: two coach assignments on the same team only sync once (no duplicate RPC calls)', async () => {
    assignmentRowsResult = {
      data: [
        { sport: 'baseball', team_id: TEAM_A },
        { sport: 'baseball', team_id: TEAM_A }, // a second coach assigned to the same team
      ],
      error: null,
    };
    rpcQueue = [{ data: 0, error: null }]; // already synced — 0 new rows
    athleteCountResult = { data: null, error: null, count: 3 };

    const result = await syncOrgAthletes({ orgId: ORG_ID });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      athleteCount: 3,
      syncedCount: 0,
      teamsSynced: 1,
    });
  });

  it('failing to load assignments returns a failure, not a success', async () => {
    assignmentRowsResult = { data: null, error: { message: 'boom' } };

    const result = await syncOrgAthletes({ orgId: ORG_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('assignLiftingTeam', () => {
  beforeEach(resetAll);

  it('calls the RPC with the real parameter name (p_org, not p_org_id) and returns the raw uuid as assignmentId', async () => {
    // Two RPCs now: the assignment itself, then the athlete seed for the team
    // just assigned (helm_lifting_assign_team does NOT seed — see the action's
    // doc comment).
    rpcQueue = [
      { data: 'assignment-123', error: null },
      { data: 4, error: null },
    ];

    const result = await assignLiftingTeam({
      orgId: ORG_ID,
      sport: 'baseball',
      teamId: TEAM_A,
      teamNameSnapshot: 'Varsity Baseball',
    });

    expect(result).toEqual({
      success: true,
      assignmentId: 'assignment-123',
      seededAthleteCount: 4,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'helm_lifting_assign_team', {
      p_org: ORG_ID,
      p_sport: 'baseball',
      p_team_id: TEAM_A,
      p_team_name: 'Varsity Baseball',
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'helm_lifting_sync_org_athletes', {
      p_org: ORG_ID,
      p_sport: 'baseball',
      p_team_id: TEAM_A,
    });
  });

  it('reports seededAthleteCount: 0 when the assigned team has no roster to seed', async () => {
    // A truthful zero, distinguishable from "the seed did not run" below.
    rpcQueue = [
      { data: 'assignment-123', error: null },
      { data: 0, error: null },
    ];

    const result = await assignLiftingTeam({ orgId: ORG_ID, sport: 'baseball', teamId: TEAM_A });

    expect(result.success).toBe(true);
    expect(result.seededAthleteCount).toBe(0);
  });

  it('still reports the assignment as successful when the athlete seed fails, with seededAthleteCount: null', async () => {
    // The assignment is already committed by the time the seed runs. Failing
    // the whole action would tell the coach the team was not added when it
    // was, and the retry would be a no-op that reported failure again.
    rpcQueue = [
      { data: 'assignment-123', error: null },
      { data: null, error: { message: 'sync exploded' } },
    ];

    const result = await assignLiftingTeam({ orgId: ORG_ID, sport: 'baseball', teamId: TEAM_A });

    expect(result.success).toBe(true);
    expect(result.assignmentId).toBe('assignment-123');
    // null, NOT 0 — the UI renders these differently on purpose: 0 means
    // "nothing to add", null means "we do not know yet, run Sync".
    expect(result.seededAthleteCount).toBeNull();
  });

  it('does not attempt the athlete seed when the assignment itself failed', async () => {
    rpcQueue = [{ data: null, error: { message: 'not_a_lifting_coach_for_org' } }];

    const result = await assignLiftingTeam({ orgId: ORG_ID, sport: 'baseball', teamId: TEAM_A });

    expect(result.success).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a real RPC exception as a failure, not a success', async () => {
    rpcQueue = [{ data: null, error: { message: 'not_a_lifting_coach_for_org' } }];

    const result = await assignLiftingTeam({ orgId: ORG_ID, sport: 'baseball', teamId: TEAM_A });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Active lifting coach not found for this organization.');
  });
});
