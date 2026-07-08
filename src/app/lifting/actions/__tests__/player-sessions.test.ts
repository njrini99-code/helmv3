// =============================================================================
// src/app/lifting/actions/__tests__/player-sessions.test.ts
//
// GUARD (fix-backlog regression tests):
//
// 1. logMySetResult upserted into helm_lifting_set_results with a 3-column
//    onConflict ('session_exercise_id,athlete_id,set_number'). The only real
//    unique constraint (uq_helm_lifting_set, verified via pg_constraint) is
//    (session_exercise_id, set_number) — 2 columns. The 3-column target
//    matches no constraint and Postgres rejects it with 42P10 on every call.
//    This is the athlete-facing set-logging path wired to
//    PlayerLiftSessionClient.tsx — the single most core interaction in the
//    Lift Lab live-session experience.
//
// 2. submitLiftReadiness upserted into helm_lifting_readiness_checkins with a
//    4-column onConflict ('organization_id,sport,athlete_id,checkin_date').
//    The only real unique constraint (uq_helm_lifting_checkin) is
//    (athlete_id, checkin_date) — 2 columns. Same 42P10 failure mode.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
}

function makeQueryBuilder(finalResult: FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  const passthrough = ['select', 'eq', 'order', 'limit', 'in', 'gte', 'lte', 'lt', 'or', 'is', 'delete'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  builder.upsertArgs = null as [unknown, unknown] | null;
  builder.upsert = vi.fn((payload: unknown, opts: unknown) => {
    builder.upsertArgs = [payload, opts];
    return builder;
  });
  builder.update = vi.fn(() => builder);
  builder.single = vi.fn(async () => finalResult);
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const SESSION_EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ATHLETE_ID = '33333333-3333-4333-8333-333333333333';
const ORG_ID = '44444444-4444-4444-8444-444444444444';

let tableBuilders: Record<string, ReturnType<typeof makeQueryBuilder>>;
const getUser = vi.fn();

function resetTables() {
  tableBuilders = {
    helm_lifting_sessions: makeQueryBuilder({
      data: { organization_id: ORG_ID, sport: 'baseball' },
      error: null,
    }),
    helm_lifting_set_results: makeQueryBuilder({ data: { id: 'set-result-1' }, error: null }),
    helm_lifting_athletes: makeQueryBuilder({
      data: { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball' },
      error: null,
    }),
    helm_lifting_readiness_checkins: makeQueryBuilder({ data: { id: 'checkin-1' }, error: null }),
  };
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
}
resetTables();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_client: unknown, table: string) => tableBuilders[table]),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveMyBaseballAthleteId: vi.fn(async () => ATHLETE_ID),
}));

import { revalidatePath } from 'next/cache';
import { logMySetResult, submitLiftReadiness } from '@/app/lifting/actions/player-sessions';

describe('logMySetResult onConflict target', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('upserts helm_lifting_set_results on the real 2-column constraint (session_exercise_id, set_number)', async () => {
    const res = await logMySetResult({
      sessionExerciseId: SESSION_EXERCISE_ID,
      sessionId: SESSION_ID,
      athleteId: ATHLETE_ID,
      setNumber: 1,
      actualReps: 8,
      actualLoad: 135,
      loadUnit: 'lb',
      rpe: 8,
    });

    expect(res.success).toBe(true);
    const [, opts] = tableBuilders.helm_lifting_set_results.upsertArgs as [unknown, { onConflict?: string }];
    expect(opts).toEqual({ onConflict: 'session_exercise_id,set_number' });
  });

  it('revalidates both the /lifting and /baseball lift portals for the mutated session', async () => {
    await logMySetResult({
      sessionExerciseId: SESSION_EXERCISE_ID,
      sessionId: SESSION_ID,
      athleteId: ATHLETE_ID,
      setNumber: 1,
      actualReps: 8,
      actualLoad: 135,
      loadUnit: 'lb',
      rpe: 8,
    });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard/lift');
    expect(paths).toContain('/baseball/dashboard/lift');
    expect(paths).toContain(`/baseball/dashboard/lift/${SESSION_ID}`);
  });
});

describe('submitLiftReadiness onConflict target', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('upserts helm_lifting_readiness_checkins on the real 2-column constraint (athlete_id, checkin_date)', async () => {
    const res = await submitLiftReadiness({
      sleepQuality: 4,
      energyLevel: 4,
      sorenessOverall: 2,
      notes: null,
    });

    expect(res.success).toBe(true);
    const [, opts] = tableBuilders.helm_lifting_readiness_checkins.upsertArgs as [
      unknown,
      { onConflict?: string },
    ];
    // CRITICAL: must be the real 2-column uq_helm_lifting_checkin target, not
    // the 4-column (organization_id,sport,athlete_id,checkin_date) target
    // that matches no constraint.
    expect(opts).toEqual({ onConflict: 'athlete_id,checkin_date' });
  });

  it('returns an error without writing when the caller is unauthenticated', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await submitLiftReadiness({
      sleepQuality: 4,
      energyLevel: 4,
      sorenessOverall: 2,
      notes: null,
    });
    expect(res.success).toBe(false);
    expect(tableBuilders.helm_lifting_readiness_checkins.upsert).not.toHaveBeenCalled();
  });

  it('revalidates the baseball lift portal alongside /lifting/dashboard', async () => {
    await submitLiftReadiness({
      sleepQuality: 4,
      energyLevel: 4,
      sorenessOverall: 2,
      notes: null,
    });

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(paths).toContain('/lifting/dashboard');
    expect(paths).toContain('/baseball/dashboard/lift');
  });
});
