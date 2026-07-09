// =============================================================================
// src/app/lifting/actions/__tests__/programs.test.ts
//
// GUARD (fix-backlog regression test): publishProgram upserted into
// helm_lifting_program_assignments with `onConflict:
// 'lift_day_id,athlete_id,scheduled_date'`. Verified against prod
// (pg_constraint + pg_indexes): the table has NO unique constraint on that
// column set — only a PK on `id` and a partial unique index on
// `legacy_baseball_id WHERE legacy_baseball_id IS NOT NULL`. Postgres
// rejected the onConflict target with 42P10 on EVERY call; the old
// `if (assignErr) { continue; }` silently swallowed that, so publishProgram
// always returned `{ success: true, count: 0 }` without ever reaching the
// per-athlete session-materialization loop. Fixed to a select-then-write
// (no DB upsert, since there's no constraint to target).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
}

/** Shape shared by every mock Supabase query builder in this file. */
interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  insertArgs: unknown;
  update: ReturnType<typeof vi.fn>;
  updateArgs: unknown;
  upsert: ReturnType<typeof vi.fn>;
  upsertArgs?: unknown;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (v: FinalResult) => void) => void;
}

/** Generic bare-await / terminal-resolver builder for simple read-only queries. */
function makeQueryBuilder(finalResult: FinalResult): MockQueryBuilder {
  const builder = {} as Record<string, unknown>;
  const passthrough = ['select', 'eq', 'order', 'limit', 'in', 'is'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  builder.insertArgs = null as unknown;
  builder.insert = vi.fn((payload: unknown) => {
    builder.insertArgs = payload;
    return builder;
  });
  builder.updateArgs = null as unknown;
  builder.update = vi.fn((patch: unknown) => {
    builder.updateArgs = patch;
    return builder;
  });
  builder.upsertArgs = null as unknown;
  builder.upsert = vi.fn((payload: unknown, opts: unknown) => {
    builder.upsertArgs = [payload, opts];
    return builder;
  });
  builder.single = vi.fn(async () => finalResult);
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder as unknown as MockQueryBuilder;
}

/**
 * helm_lifting_program_assignments needs independently configurable
 * .maybeSingle() (the existing-row lookup) vs .single() (the post-insert
 * read) results — a single fixed finalResult can't represent both a "no
 * existing row" lookup and a "here's the freshly inserted row" read at once.
 */
function makeAssignmentsBuilder(existingRow: { id: string } | null, insertedRow: { id: string }): MockQueryBuilder {
  const builder = {} as Record<string, unknown>;
  const passthrough = ['select', 'eq', 'is', 'order', 'in', 'limit'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  builder.insertArgs = null as unknown;
  builder.insert = vi.fn((payload: unknown) => {
    builder.insertArgs = payload;
    return builder;
  });
  builder.updateArgs = null as unknown;
  builder.update = vi.fn((patch: unknown) => {
    builder.updateArgs = patch;
    return builder;
  });
  builder.upsert = vi.fn(() => {
    throw new Error(
      'helm_lifting_program_assignments.upsert() must never be called — there is no ' +
        'unique constraint on (lift_day_id, athlete_id, scheduled_date) in prod.',
    );
  });
  builder.maybeSingle = vi.fn(async () => ({ data: existingRow, error: null }));
  builder.single = vi.fn(async () => ({ data: insertedRow, error: null }));
  builder.then = (resolve: (v: FinalResult) => void) => resolve({ data: null, error: null });
  return builder as unknown as MockQueryBuilder;
}

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const PROGRAM_ID = '22222222-2222-4222-8222-222222222222';
const WEEK_ID = '33333333-3333-4333-8333-333333333333';
const DAY_ID = '44444444-4444-4444-8444-444444444444';
const ATHLETE_ID = '55555555-5555-4555-8555-555555555555';
const ASSIGNMENT_ID = '66666666-6666-4666-8666-666666666666';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';

let tableBuilders: Record<string, MockQueryBuilder>;

function resetTables(existingAssignment: { id: string } | null = null) {
  tableBuilders = {
    helm_lifting_programs: makeQueryBuilder({
      data: { id: PROGRAM_ID, organization_id: ORG_ID, sport: 'baseball', team_id: null, status: 'draft' },
      error: null,
    }),
    helm_lifting_athletes: makeQueryBuilder({ data: [{ id: ATHLETE_ID }], error: null }),
    helm_lifting_weeks: makeQueryBuilder({ data: [{ id: WEEK_ID, week_number: 1 }], error: null }),
    helm_lifting_days: makeQueryBuilder({
      data: [
        {
          id: DAY_ID,
          week_id: WEEK_ID,
          day_number: 1,
          name: 'Upper Day',
          day_type: 'upper',
          sport_context: null,
          estimated_minutes: 60,
        },
      ],
      error: null,
    }),
    helm_lifting_sections: makeQueryBuilder({ data: [], error: null }),
    helm_lifting_prescriptions: makeQueryBuilder({ data: [], error: null }),
    helm_lifting_program_assignments: makeAssignmentsBuilder(existingAssignment, {
      id: ASSIGNMENT_ID,
    }),
    helm_lifting_sessions: makeQueryBuilder({ data: { id: SESSION_ID }, error: null }),
    helm_lifting_session_exercises: makeQueryBuilder({ data: [], error: null }),
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

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));

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
import { publishProgram } from '@/app/lifting/actions/programs';

describe('publishProgram program_assignments write target', () => {
  beforeEach(() => {
    resetTables(null);
    vi.clearAllMocks();
    resetTables(null);
  });

  it('never upserts on helm_lifting_program_assignments and materializes a session on first publish', async () => {
    const res = await publishProgram({
      programId: PROGRAM_ID,
      scheduleDate: '2026-07-06',
      targetGroupId: null,
      targetAthleteId: null,
    });

    expect(res.success).toBe(true);
    // The old bug always returned count: 0 because the broken onConflict
    // target 42P10'd on every call and the error was swallowed.
    expect(res.count).toBe(1);

    const assignmentsBuilder = tableBuilders.helm_lifting_program_assignments!;
    expect(assignmentsBuilder.upsert).not.toHaveBeenCalled();
    expect(assignmentsBuilder.insert).toHaveBeenCalledTimes(1);
    const inserted = assignmentsBuilder.insertArgs as { athlete_id: string | null; lift_day_id: string };
    // Team-wide publish (no targetAthleteId) — athlete_id must be null on the
    // assignment row (only the per-athlete session rows carry athlete_id).
    expect(inserted.athlete_id).toBeNull();
    expect(inserted.lift_day_id).toBe(DAY_ID);
  });

  it('looks up an existing assignment scoped by lift_day_id + scheduled_date + NULL athlete_id for team-wide publishes', async () => {
    await publishProgram({
      programId: PROGRAM_ID,
      scheduleDate: '2026-07-06',
      targetGroupId: null,
      targetAthleteId: null,
    });

    const assignmentsBuilder = tableBuilders.helm_lifting_program_assignments!;
    expect(assignmentsBuilder.is).toHaveBeenCalledWith('athlete_id', null);
  });
});

describe('publishProgram idempotent re-publish', () => {
  beforeEach(() => {
    resetTables({ id: ASSIGNMENT_ID });
    vi.clearAllMocks();
    resetTables({ id: ASSIGNMENT_ID });
  });

  it('updates the existing assignment row in place instead of inserting a duplicate', async () => {
    const res = await publishProgram({
      programId: PROGRAM_ID,
      scheduleDate: '2026-07-06',
      targetGroupId: null,
      targetAthleteId: null,
    });

    expect(res.success).toBe(true);
    const assignmentsBuilder = tableBuilders.helm_lifting_program_assignments!;
    expect(assignmentsBuilder.insert).not.toHaveBeenCalled();
    expect(assignmentsBuilder.update).toHaveBeenCalledTimes(1);

    // The reused assignment id must flow into the session's
    // program_assignment_id (the real dedup key for helm_lifting_sessions).
    const sessionsBuilder = tableBuilders.helm_lifting_sessions!;
    expect(sessionsBuilder.upsert).toHaveBeenCalledTimes(1);
    const [sessionPayload, sessionOpts] = sessionsBuilder.upsertArgs as [
      { program_assignment_id: string },
      { onConflict: string },
    ];
    expect(sessionPayload.program_assignment_id).toBe(ASSIGNMENT_ID);
    expect(sessionOpts).toEqual({ onConflict: 'program_assignment_id,athlete_id' });
  });
});

describe('publishProgram revalidates the baseball performance portal (Wave C parallel routes)', () => {
  beforeEach(() => {
    resetTables(null);
    vi.clearAllMocks();
    resetTables(null);
  });

  it('busts /baseball/dashboard/performance/programs, /performance/live, and /lift alongside the lifting-portal paths', async () => {
    await publishProgram({
      programId: PROGRAM_ID,
      scheduleDate: '2026-07-06',
      targetGroupId: null,
      targetAthleteId: null,
    });

    const revalidated = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    expect(revalidated).toContain('/baseball/dashboard/performance/programs');
    expect(revalidated).toContain('/baseball/dashboard/performance/live');
    expect(revalidated).toContain('/baseball/dashboard/lift');
    // The lifting-portal paths must still fire too — this is additive, not a
    // replacement of the existing revalidation.
    expect(revalidated).toContain('/lifting/dashboard/programs');
    expect(revalidated).toContain('/lifting/dashboard/sessions');
  });
});
