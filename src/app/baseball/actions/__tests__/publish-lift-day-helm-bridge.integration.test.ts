// =============================================================================
// Integration test: publishLiftDay MATERIALIZES directly into
// helm_lifting_sessions / helm_lifting_session_exercises (#486, #492
// remediation; program-builder→helm unification).
//
// HISTORY: publishLiftDay used to write baseball_lift_sessions /
// baseball_lift_session_exercises (the "V11 legacy" tables) and, for the
// player-facing surfaces, additionally bridge those rows into their
// helm_lifting_* mirrors via `.upsert(rows, { onConflict: 'legacy_baseball_id'
// })`. That column only had a PARTIAL unique index (migration
// 20260625000020 — `WHERE legacy_baseball_id IS NOT NULL`), and PostgREST's
// onConflict never emits a partial index's WHERE predicate, so Postgres
// raised "there is no unique or exclusion constraint matching the ON
// CONFLICT specification" on EVERY publish. The bridge's bare try/catch
// swallowed that error, so publish "succeeded" while writing nothing — a
// 100% no-op that looked fixed but wasn't.
//
// Both the legacy materialization and the bridge have since been removed
// (the program-builder→helm unification): publishLiftDay now reads its
// template from helm_lifting_sections / helm_lifting_prescriptions /
// helm_lifting_exercises and writes helm_lifting_sessions /
// helm_lifting_session_exercises DIRECTLY and exclusively — there is no
// legacy write and no best-effort bridge left to swallow a failure. This
// test wires the REAL publishLiftDay + the REAL resolveBaseballLiftingOrg /
// resolveBaseballAthleteIds helpers against an in-memory Postgres-shaped
// fake and asserts:
//   * a session round-trips into helm_lifting_sessions for the published date
//   * re-publishing is idempotent (upsert on program_assignment_id,athlete_id
//     — no duplicate session, no duplicate assignment row)
//   * an edited prescription UPDATEs the existing session_exercise row in
//     place on re-publish (#492's stage-and-swap requirement), never
//     duplicating or dropping it
//   * a genuine write failure now surfaces as a THROWN error — direct writes
//     have no best-effort catch left to swallow it into a false "success"
//   * a team with no Lift Lab organization configured fails FAST with a
//     friendly error, since org resolution is no longer a best-effort side
//     bridge but the primary path's first step
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- In-memory DB shared across every client the action code creates --------

interface Row {
  [key: string]: unknown;
}

const db: Record<string, Row[]> = {};

function resetDb() {
  for (const key of Object.keys(db)) delete db[key];
}

function rows(name: string): Row[] {
  return db[name] ?? [];
}

/** Strict-safe first-row accessor (throws instead of returning undefined). */
function firstRow(name: string): Row {
  const row = rows(name)[0];
  if (!row) throw new Error(`expected at least one row in ${name}`);
  return row;
}

let idSeq = 0;
function nextId(prefix: string) {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

// Set by a test to simulate an unexpected write failure on a specific table
// (e.g. an RLS gap) — used to prove a genuine failure now propagates as a
// thrown error instead of being swallowed by a best-effort bridge.
let forcedInsertError: string | null = null;

type Filter = { col: string; op: 'eq' | 'in' | 'is'; val: unknown };

/**
 * A minimal chainable PostgREST-shaped query builder over the in-memory
 * tables, plus a bare `.rpc()` stub (publishLiftDay's roster-sync step calls
 * `supabase.rpc('helm_lifting_sync_org_athletes', ...)` best-effort — the
 * stub always succeeds, matching the idempotent ON CONFLICT DO NOTHING RPC).
 */
function makeBuilder(table: string) {
  const filters: Filter[] = [];
  let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  let payload: Row | Row[] | null = null;
  let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
  let cached: { data: unknown; error: { message: string } | null } | null = null;

  function matches(row: Row): boolean {
    return filters.every((f) => {
      if (f.op === 'eq') return row[f.col] === f.val;
      if (f.op === 'is') return (row[f.col] ?? null) === f.val;
      return Array.isArray(f.val) && (f.val as unknown[]).includes(row[f.col]);
    });
  }

  function withDefaults(r: Row): Row {
    return {
      id: r.id ?? nextId(table),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...r,
    };
  }

  function execute(): { data: unknown; error: { message: string } | null } {
    if (cached) return cached;
    // Assign back to `db[table]` AND capture a local reference — indexed
    // access on a Record<string, T[]> with a non-literal key doesn't narrow
    // across statements, so every `db[table]` read below would otherwise
    // type as `Row[] | undefined`.
    const tableRows: Row[] = db[table] ?? [];
    db[table] = tableRows;

    if (mode === 'insert') {
      if (forcedInsertError === table) {
        cached = { data: null, error: { message: `Simulated DB failure on ${table}` } };
        return cached;
      }
      const toInsert = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const inserted = toInsert.map((r) => {
        const withId = withDefaults(r);
        tableRows.push(withId);
        return withId;
      });
      cached = { data: inserted, error: null };
      return cached;
    }

    if (mode === 'update') {
      const matched = tableRows.filter(matches);
      for (const row of matched) Object.assign(row, payload as Row, { updated_at: new Date().toISOString() });
      cached = { data: matched, error: null };
      return cached;
    }

    if (mode === 'upsert') {
      if (forcedInsertError === table) {
        cached = { data: null, error: { message: `Simulated DB failure on ${table}` } };
        return cached;
      }
      const rowsIn = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const conflictCols = (upsertOpts?.onConflict ?? 'id').split(',').map((c) => c.trim());
      const results: Row[] = [];
      for (const r of rowsIn) {
        const existing = tableRows.find((row) => conflictCols.every((c) => row[c] === r[c]));
        if (existing) {
          if (!upsertOpts?.ignoreDuplicates) Object.assign(existing, r, { updated_at: new Date().toISOString() });
          results.push(existing);
        } else {
          const withId = withDefaults(r);
          tableRows.push(withId);
          results.push(withId);
        }
      }
      cached = { data: results, error: null };
      return cached;
    }

    // select
    cached = { data: tableRows.filter(matches), error: null };
    return cached;
  }

  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push({ col, op: 'eq', val });
      return builder;
    },
    is(col: string, val: unknown) {
      filters.push({ col, op: 'is', val });
      return builder;
    },
    in(col: string, val: unknown[]) {
      filters.push({ col, op: 'in', val });
      return builder;
    },
    insert(row: Row | Row[]) {
      mode = 'insert';
      payload = row;
      return builder;
    },
    update(row: Row) {
      mode = 'update';
      payload = row;
      return builder;
    },
    upsert(row: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      mode = 'upsert';
      payload = row;
      upsertOpts = opts;
      return builder;
    },
    async maybeSingle() {
      const { data, error } = execute() as { data: Row[]; error: { message: string } | null };
      if (error) return { data: null, error };
      return { data: (data ?? [])[0] ?? null, error: null };
    },
    async single() {
      const { data, error } = execute() as { data: Row[]; error: { message: string } | null };
      if (error) return { data: null, error };
      const row = (data ?? [])[0];
      return { data: row ?? null, error: row ? null : { message: 'no rows' } };
    },
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      try {
        resolve(execute());
      } catch (e) {
        if (reject) reject(e);
        else throw e;
      }
    },
  };

  return builder;
}

function makeClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => makeBuilder(table),
    // ensureBaseballAthletesSynced calls this best-effort — always succeeds,
    // matching the idempotent ON CONFLICT DO NOTHING RPC in production.
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeClient()),
}));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (client: { from: (t: string) => unknown }, table: string) => client.from(table),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  BaseballActionError: class BaseballActionError extends Error {},
}));

const { logServerError } = vi.hoisted(() => ({
  logServerError: vi.fn(async (_message: string, _context?: unknown) => undefined),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

import { publishLiftDay, type ActionResult } from '@/app/baseball/actions/lifting-v11';

// ---- Fixture ids --------------------------------------------------------

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const COACH_ID = '33333333-3333-4333-8333-333333333333';
const PROGRAM_ID = '44444444-4444-4444-8444-444444444444';
const LIFT_DAY_ID = '55555555-5555-4555-8555-555555555555';
const SECTION_ID = '66666666-6666-4666-8666-666666666666';
const EXERCISE_ID = '77777777-7777-4777-8777-777777777777';
const PRESCRIPTION_ID = '88888888-8888-4888-8888-888888888888';
const PLAYER_ID = '99999999-9999-4999-8999-999999999999';
const ATHLETE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCHEDULED_DATE = '2026-07-01';

interface PublishCtx {
  targetTeamId: string;
  activeCoachId: string;
  user: { id: string };
}

const ctx: PublishCtx = { targetTeamId: TEAM_ID, activeCoachId: COACH_ID, user: { id: 'user-1' } };

interface PublishInput {
  programId: string;
  liftDayId: string;
  scheduledDate: string;
  playerIds: string[];
  assignmentType?: 'team' | 'group' | 'player';
  groupId?: string | null;
  createCalendarEvent?: boolean;
  title?: string | null;
}

// The wrapper (withBaseballAction) resolves `ctx` from the request internally
// in production; its public TYPE therefore hides `ctx` from callers. Our mock
// of withBaseballAction below hands back the raw (ctx, raw) => ... body, so
// the test must supply ctx explicitly — cast through the real body's actual
// runtime signature rather than the wrapper's caller-facing type.
const callPublish = publishLiftDay as unknown as (
  ctx: PublishCtx,
  raw: PublishInput,
) => Promise<ActionResult>;

function seedTemplateAndOrg() {
  db.baseball_teams = [{ id: TEAM_ID, organization_id: ORG_ID }];
  db.helm_lifting_athletes = [
    { id: ATHLETE_ID, sport_player_id: PLAYER_ID, organization_id: ORG_ID, sport: 'baseball' },
  ];
  db.helm_lifting_sections = [
    { id: SECTION_ID, lift_day_id: LIFT_DAY_ID, name: 'Main', section_type: 'main_strength', section_order: 0 },
  ];
  db.helm_lifting_prescriptions = [
    {
      id: PRESCRIPTION_ID,
      section_id: SECTION_ID,
      exercise_id: EXERCISE_ID,
      order_index: 0,
      sets: 3,
      reps: 5,
      load_value: 225,
      load_unit: 'lb',
      target_rpe: 8,
    },
  ];
  db.helm_lifting_exercises = [{ id: EXERCISE_ID, name: 'Back Squat' }];
}

function publish(overrides: Partial<PublishInput> = {}) {
  return callPublish(ctx, {
    programId: PROGRAM_ID,
    liftDayId: LIFT_DAY_ID,
    scheduledDate: SCHEDULED_DATE,
    playerIds: [PLAYER_ID],
    createCalendarEvent: false,
    ...overrides,
  });
}

beforeEach(() => {
  resetDb();
  idSeq = 0;
  forcedInsertError = null;
  vi.clearAllMocks();
  seedTemplateAndOrg();
});

describe('publishLiftDay — direct Helm Lifting Lab materialization (#486, #492)', () => {
  it('AC: publish -> a row round-trips into helm_lifting_sessions for that date', async () => {
    const result = await publish();
    expect(result.success).toBe(true);

    expect(rows('helm_lifting_sessions')).toHaveLength(1);
    const helmSession = firstRow('helm_lifting_sessions');
    expect(helmSession.athlete_id).toBe(ATHLETE_ID);
    expect(helmSession.organization_id).toBe(ORG_ID);
    expect(helmSession.scheduled_date).toBe(SCHEDULED_DATE);
    // Direct write — no legacy identity to carry forward.
    expect(helmSession.legacy_baseball_id ?? null).toBeNull();

    expect(rows('helm_lifting_session_exercises')).toHaveLength(1);
    const helmSessionExercise = firstRow('helm_lifting_session_exercises');
    expect(helmSessionExercise.session_id).toBe(helmSession.id);
    expect(helmSessionExercise.prescribed_sets).toBe(3);
    expect(helmSessionExercise.prescribed_reps).toBe(5);
  });

  it('re-publishing is idempotent: upserts the SAME helm_lifting_sessions row (program_assignment_id, athlete_id), never a duplicate', async () => {
    const first = await publish();
    expect(first.success).toBe(true);
    const firstHelmSessionId = firstRow('helm_lifting_sessions').id;

    const second = await publish();
    expect(second.success).toBe(true);

    expect(rows('helm_lifting_sessions')).toHaveLength(1);
    expect(firstRow('helm_lifting_sessions').id).toBe(firstHelmSessionId);
  });

  it('#492: re-publishing after editing a prescription UPDATEs the existing helm session_exercise row in place (stage-and-swap, not skip)', async () => {
    await publish();
    expect(rows('helm_lifting_session_exercises')).toHaveLength(1);
    const firstExerciseId = firstRow('helm_lifting_session_exercises').id;
    expect(firstRow('helm_lifting_session_exercises').prescribed_sets).toBe(3);

    // Coach edits the prescription (sets 3 -> 5, reps 5 -> 3) and re-publishes.
    const prescription = firstRow('helm_lifting_prescriptions');
    prescription.sets = 5;
    prescription.reps = 3;

    const result = await publish();
    expect(result.success).toBe(true);

    // Same row updated in place — not a second row appended.
    expect(rows('helm_lifting_session_exercises')).toHaveLength(1);
    const exerciseAfter = firstRow('helm_lifting_session_exercises');
    expect(exerciseAfter.id).toBe(firstExerciseId);
    expect(exerciseAfter.prescribed_sets).toBe(5);
    expect(exerciseAfter.prescribed_reps).toBe(3);
  });

  it('#492: re-publishing does not create a second helm_lifting_program_assignments row for the same program/day/date', async () => {
    await publish();
    await publish();
    expect(rows('helm_lifting_program_assignments')).toHaveLength(1);
    expect(rows('helm_lifting_sessions')).toHaveLength(1);
  });

  it('a genuine write failure on the primary helm_lifting_sessions write now THROWS — direct writes have no best-effort bridge left to swallow it', async () => {
    forcedInsertError = 'helm_lifting_sessions';

    // Unlike the old bridge (which caught + logged and let publish "succeed"
    // with zero rows written), the direct write path propagates a real DB
    // error straight to the caller — the coach sees the failure instead of a
    // false "published" confirmation.
    await expect(publish()).rejects.toThrow(/Simulated DB failure on helm_lifting_sessions/);
    expect(rows('helm_lifting_sessions')).toHaveLength(0);
    // Not a bridge side-effect anymore — logServerError is not this path's job.
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('a team with no Lift Lab organization configured fails fast with a friendly error, before any write', async () => {
    db.baseball_teams = [{ id: TEAM_ID, organization_id: null }];

    await expect(publish()).rejects.toThrow('This team has no Lift Lab organization configured.');
    expect(rows('helm_lifting_sessions')).toHaveLength(0);
    expect(rows('helm_lifting_program_assignments')).toHaveLength(0);
  });
});
