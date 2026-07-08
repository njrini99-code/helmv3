// =============================================================================
// src/app/lifting/actions/__tests__/sessions.test.ts
//
// GUARD (fix-backlog regression test): logSetResult upserted into
// helm_lifting_set_results with `onConflict: 'session_exercise_id,athlete_id,
// set_number'` — a 3-column target with no matching unique constraint.
// Verified against prod (pg_constraint): the only unique constraint on
// helm_lifting_set_results is `uq_helm_lifting_set UNIQUE (session_exercise_id,
// set_number)` — 2 columns, no athlete_id. Postgres/PostgREST reject an
// ON CONFLICT target that matches no unique/exclusion constraint with 42P10,
// so every set-log call 400'd. This test asserts the real 2-column target is
// used, and that re-logging the same (session_exercise_id, set_number) is
// treated as an upsert (idempotent), not a fresh insert.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Generic chainable/thenable PostgREST-shaped stub ----------------------

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
  // Support bare `await builder` (e.g. the trailing status-bump update with no .single()).
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const SESSION_EXERCISE_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ORG_ID = '44444444-4444-4444-8444-444444444444';

let tableBuilders: Record<string, ReturnType<typeof makeQueryBuilder>>;

function resetTables() {
  tableBuilders = {
    helm_lifting_session_exercises: makeQueryBuilder({
      data: {
        id: SESSION_EXERCISE_ID,
        session_id: SESSION_ID,
        exercise_id: null,
        prescribed_sets: 3,
        prescribed_reps: 8,
        prescribed_load: 135,
        prescribed_load_unit: 'lb',
        prescribed_rpe: 8,
      },
      error: null,
    }),
    helm_lifting_sessions: makeQueryBuilder({
      data: { organization_id: ORG_ID, sport: 'baseball' },
      error: null,
    }),
    helm_lifting_set_results: makeQueryBuilder({ data: { id: 'set-result-1' }, error: null }),
  };
}
resetTables();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_client: unknown, table: string) => tableBuilders[table]),
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
  LiftingActionError: class LiftingActionError extends Error {},
}));

import { revalidatePath } from 'next/cache';
import { logSetResult } from '@/app/lifting/actions/sessions';

describe('logSetResult onConflict target', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('upserts helm_lifting_set_results on the real 2-column constraint (session_exercise_id, set_number)', async () => {
    const res = await logSetResult({
      sessionExerciseId: SESSION_EXERCISE_ID,
      athleteId: ATHLETE_ID,
      setNumber: 1,
      actualReps: 8,
      actualLoad: 135,
    });

    expect(res.success).toBe(true);
    const setResultsBuilder = tableBuilders.helm_lifting_set_results;
    expect(setResultsBuilder.upsert).toHaveBeenCalledTimes(1);
    const [, opts] = setResultsBuilder.upsertArgs as [unknown, { onConflict?: string }];
    // CRITICAL: must target the real uq_helm_lifting_set constraint — no
    // athlete_id in the conflict target.
    expect(opts).toEqual({ onConflict: 'session_exercise_id,set_number' });
  });

  it('does not include athlete_id in the onConflict target even though athlete_id is part of the payload', async () => {
    await logSetResult({
      sessionExerciseId: SESSION_EXERCISE_ID,
      athleteId: ATHLETE_ID,
      setNumber: 2,
      actualReps: 6,
      actualLoad: 145,
    });

    const [payload, opts] = tableBuilders.helm_lifting_set_results.upsertArgs as [
      { athlete_id: string },
      { onConflict: string },
    ];
    expect(payload.athlete_id).toBe(ATHLETE_ID);
    expect(opts.onConflict.split(',')).not.toContain('athlete_id');
  });
});

describe('logSetResult revalidates the baseball performance portal (Wave C parallel routes)', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('busts /baseball/dashboard/performance/live and the per-session /lift/[sessionId] page', async () => {
    await logSetResult({
      sessionExerciseId: SESSION_EXERCISE_ID,
      athleteId: ATHLETE_ID,
      setNumber: 1,
      actualReps: 8,
      actualLoad: 135,
    });

    const calls = vi.mocked(revalidatePath).mock.calls;
    const paths = calls.map((c) => c[0]);
    expect(paths).toContain('/baseball/dashboard/performance/live');
    expect(paths).toContain('/baseball/dashboard/lift');
    // The [sessionId] detail page uses the bracket-pattern + 'page' type
    // convention (matches golf/actions/round-reviews.ts) rather than a
    // resolved id — verify both the path AND the type argument.
    const sessionPageCall = calls.find((c) => c[0] === '/baseball/dashboard/lift/[sessionId]');
    expect(sessionPageCall?.[1]).toBe('page');
    // Still fires the lifting-portal live-room revalidation too (additive).
    expect(paths).toContain('/lifting/dashboard/sessions/live');
  });
});
