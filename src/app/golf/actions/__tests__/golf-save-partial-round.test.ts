/**
 * @vitest-environment node
 *
 * Server-module test. The default project environment is jsdom, which
 * defines `window` — and rls-denial.ts gates its capture on
 * `typeof window === 'undefined'` so server-only logging never lands in a
 * client bundle. Under jsdom that guard is false, the capture branch never
 * runs, and these assertions silently test nothing. Pin to node so the code
 * path under test is the one that actually executes on the server.
 */
/**
 * Regression test for the no-existingRoundId fallback branch of
 * savePartialRound (golf.ts) — feature-sweep finding golf-player-logging
 * P0 2026-07-10.
 *
 * Before the fix, the very first auto-save of a brand-new round (client
 * hasn't been assigned a roundId yet) looked up "the most recently updated
 * in_progress round for this player" with NO course/date scoping. If the
 * player already had an unrelated unfinished round sitting in_progress
 * (the product allows multiple simultaneous in-progress rounds), that
 * unrelated round's row was silently repurposed instead of a new row being
 * inserted.
 *
 * The fix scopes the recovery lookup to course_id + round_date (+
 * qualifier context), and skips the heuristic entirely when the course
 * can't be resolved to an id — so:
 *  - a genuinely new round (different course/date) always gets a new row,
 *    never overwriting an unrelated in-progress round, and
 *  - the legitimate recovery case (same course/date, lost local roundId)
 *    still resumes the existing row instead of creating a duplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let adminFake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => cb()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {}),
}));

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-logger', () => ({
  logRoundSubmitted: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications', () => ({
  notifyQualifierCreated: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: vi.fn(async () => {}),
}));

import { deleteShot, savePartialRound, updateShot } from '../golf';

type Row = Record<string, unknown>;
interface SeedTables extends Record<string, Row[]> {
  golf_players: Row[];
  golf_team_members: Row[];
  golf_rounds: Row[];
  golf_shots: Row[];
}

const COURSE_A = '11111111-1111-4111-8111-111111111111';
const COURSE_B = '22222222-2222-4222-8222-222222222222';

function baseTables(): SeedTables {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
    ],
    golf_rounds: [],
    golf_shots: [],
  };
}

function seedAs(userId: string, tables: SeedTables) {
  fake = createFakeSupabase({ user: { id: userId }, tables });
  adminFake = fake;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('savePartialRound — no-existingRoundId fallback', () => {
  it('does NOT repurpose an unrelated in_progress round at a different course/date', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-old',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Old Abandoned Course',
      round_date: '2026-01-01',
      status: 'in_progress',
      qualifier_id: null,
      qualifier_round_number: null,
      updated_at: '2026-01-01T10:00:00Z',
    });
    seedAs('u-p1', tables);

    const result = await savePartialRound({
      courseName: 'New Course',
      courseId: COURSE_B,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 1,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(true);
    // A brand-new row was inserted — the old unrelated round is untouched.
    expect(tables.golf_rounds).toHaveLength(2);
    const oldRound = tables.golf_rounds.find(r => r.id === 'round-old');
    expect(oldRound?.course_name).toBe('Old Abandoned Course');
    expect(oldRound?.round_date).toBe('2026-01-01');
    if (result.success) {
      expect(result.data.roundId).not.toBe('round-old');
    }
  });

  it('resumes the existing in_progress round when course + round_date match', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-same',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Same Course',
      round_date: '2026-07-10',
      status: 'in_progress',
      qualifier_id: null,
      qualifier_round_number: null,
      updated_at: '2026-07-10T10:00:00Z',
    });
    seedAs('u-p1', tables);

    const result = await savePartialRound({
      courseName: 'Same Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 2,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(true);
    // No duplicate row — the same session's round was resumed.
    expect(tables.golf_rounds).toHaveLength(1);
    if (result.success) {
      expect(result.data.roundId).toBe('round-same');
    }
  });

  it('normalizes sparse recovered-hole slots before checkpoint validation', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-sparse',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Recovered Course',
      round_date: '2026-07-10',
      status: 'in_progress',
    });
    let rpcArgs: Record<string, unknown> | undefined;
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: {
        save_partial_round_atomic: async (args) => {
          rpcArgs = args as Record<string, unknown>;
          return { data: { success: true, round_id: 'round-sparse' }, error: null };
        },
      },
    });
    adminFake = fake;
    const restoredHoles = new Array(7) as Array<undefined>;

    const result = await savePartialRound({
      courseName: 'Recovered Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 7,
      holesToPlay: 18,
      holes: restoredHoles,
    }, 'round-sparse');

    expect(result.success).toBe(true);
    // The undefined array slot that previously surfaced as
    // "holes.6 — Invalid input" cannot enter the persisted checkpoint.
    expect(rpcArgs?.p_holes).toEqual([]);
  });
});

describe('shot actions — already absent shot reconciliation', () => {
  function forceAbsentShotLookup(client: FakeSupabase) {
    const originalFrom = client.from.bind(client);
    let maybeSingleCalls = 0;

    client.from = ((table: string) => {
      const api = originalFrom(table);
      if (table !== 'golf_shots') return api;
      return {
        ...api,
        select: () => {
          const lookup: Record<string, unknown> = {};
          lookup.eq = () => lookup;
          lookup.maybeSingle = async () => {
            maybeSingleCalls += 1;
            return { data: null, error: null };
          };
          lookup.single = async () => {
            throw new Error('stale-shot lookup must use maybeSingle');
          };
          return lookup;
        },
      };
    }) as typeof client.from;

    return () => maybeSingleCalls;
  }

  it('returns a deterministic code from delete without generating a PostgREST single-row error', async () => {
    seedAs('u-p1', baseTables());
    const getMaybeSingleCalls = forceAbsentShotLookup(fake);

    const result = await deleteShot('33333333-3333-4333-8333-333333333333');

    expect(result).toEqual({ success: false, error: 'Shot not found', code: 'shot_not_found' });
    expect(getMaybeSingleCalls()).toBe(1);
  });

  it('gives Edit the same deterministic stale-shot contract', async () => {
    seedAs('u-p1', baseTables());
    const getMaybeSingleCalls = forceAbsentShotLookup(fake);

    const result = await updateShot(
      '33333333-3333-4333-8333-333333333333',
      { club_type: 'driver' },
    );

    expect(result).toEqual({ success: false, error: 'Shot not found', code: 'shot_not_found' });
    expect(getMaybeSingleCalls()).toBe(1);
  });
});

/**
 * Regression test for the savePartialRound duplicate-error-logging bug —
 * a single Postgres failure was previously written to admin_events 3-4
 * times (paired logServerException + logServerError in the impl, PLUS
 * maybeCaptureRlsDenial for RLS denials, PLUS withAdminObserved's own
 * generic soft-failure observer on the returned `{ success: false }`).
 * The fix: drop the redundant logServerException call, gate the generic
 * logServerError behind `!maybeCaptureRlsDenial(...)` (which now returns
 * a boolean instead of void), and pass `observeSoftFailures: false` to
 * the withAdminObserved wrapper so it never re-observes a failure the
 * impl already recorded itself.
 *
 * Mirrors the `failUpdates`/`makeFailingBuilder` monkey-patch idiom from
 * recurring-events.test.ts, generalized to inject a full Postgrest-shaped
 * error object (with `.code`) so both the non-RLS and RLS-denial branches
 * can be exercised.
 */
describe('savePartialRound — single admin_events row per failure (no duplicate logging)', () => {
  function failUpdate(client: FakeSupabase, table: string, error: { code?: string; message: string }) {
    const origFrom = client.from.bind(client);
    client.from = ((t: string) => {
      const api = origFrom(t);
      if (t !== table) return api;
      return {
        ...api,
        update: () => {
          const result = { data: null, error };
          const builder: Record<string, unknown> = {};
          builder.eq = () => builder;
          builder.select = () => builder;
          builder.maybeSingle = async () => result;
          builder.single = async () => result;
          builder.then = (
            onfulfilled?: (v: unknown) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(result).then(onfulfilled, onrejected);
          return builder;
        },
      };
    }) as typeof client.from;
  }

  function seedExistingRound() {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-same',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Same Course',
      round_date: '2026-07-10',
      status: 'in_progress',
      qualifier_id: null,
      qualifier_round_number: null,
      updated_at: '2026-07-10T10:00:00Z',
    });
    seedAs('u-p1', tables);
    return tables;
  }

  it('a non-RLS update failure logs exactly ONE admin_events row (logServerError only)', async () => {
    seedExistingRound();
    failUpdate(fake, 'golf_rounds', { code: '23505', message: 'duplicate key value violates unique constraint' });

    const result = await savePartialRound({
      courseName: 'Same Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 2,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(false);

    const { logServerError, logServerException, logServerEvent } = await import('@/lib/server-error-logger');
    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logServerException).not.toHaveBeenCalled();
    expect(logServerEvent).not.toHaveBeenCalled();
  });

  it('an RLS-denied update logs exactly ONE admin_events row (via maybeCaptureRlsDenial only)', async () => {
    seedExistingRound();
    failUpdate(fake, 'golf_rounds', { code: '42501', message: 'permission denied for table golf_rounds' });

    const result = await savePartialRound({
      courseName: 'Same Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 2,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(false);

    const { logServerError, logServerException, logServerEvent } = await import('@/lib/server-error-logger');
    // maybeCaptureRlsDenial owns this failure — the generic path must not
    // ALSO log it (that was the source of the double-write).
    expect(logServerEvent).toHaveBeenCalledTimes(1);
    expect(logServerError).not.toHaveBeenCalled();
    expect(logServerException).not.toHaveBeenCalled();
  });
});

/**
 * Single-flight coalescing (2026-08-20, docs/audits/
 * ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md): save_partial_round_atomic
 * now takes its golf_rounds row with FOR UPDATE NOWAIT and returns
 * {success:false, error:'busy'} when another save (or a submit) already holds
 * it. A whole-team session produced 15 auto-save timeouts across 8 rounds in
 * one evening by QUEUEING on that row lock instead — 'busy' is the healthy
 * outcome, so it must pass through to the client verbatim and must NOT land
 * in admin_events as a failure.
 */
describe('savePartialRound — single-flight busy skip', () => {
  it("returns error:'busy' verbatim and logs NOTHING", async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-busy',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Bryan Park Champs',
      round_date: '2026-08-19',
      status: 'in_progress',
      updated_at: '2026-08-19T22:00:00Z',
    });
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: {
        // Another save for this round holds the row — the RPC skipped.
        save_partial_round_atomic: async () => ({
          data: { success: false, error: 'busy' },
          error: null,
        }),
      },
    });
    adminFake = fake;

    const result = await savePartialRound(
      {
        courseName: 'Bryan Park Champs',
        courseId: COURSE_A,
        roundType: 'practice',
        roundDate: '2026-08-19',
        currentHole: 17,
        holesToPlay: 18,
        holes: [],
      },
      'round-busy'
    );

    // The distinct key the clients branch on — never remapped to a generic
    // "Failed to save" message the circuit breaker would count.
    expect(result).toEqual({ success: false, error: 'busy' });

    // A coalescing skip is not an incident. Pre-fix, an unrecognized RPC
    // failure logged an admin_events row — 15 of those in one evening was
    // exactly the noise that buried the real signal.
    const { logServerError, logServerException, logServerEvent } = await import('@/lib/server-error-logger');
    expect(logServerError).not.toHaveBeenCalled();
    expect(logServerException).not.toHaveBeenCalled();
    expect(logServerEvent).not.toHaveBeenCalled();
  });
});

/**
 * Transient auth-check failures are NOT session expiry (2026-08-19,
 * fingerprint 836ce3b6). Six times in one evening, getUser() failed in
 * transit during DB contention — GoTrue shares the contended Postgres and
 * the then-10s client abort killed the round trip — and the discarded error
 * meant `!user` was logged as "session expired mid-round" for players whose
 * rotation chains prove they held valid, unexpired tokens. A background
 * auto-save must treat transit failure like 'busy' (silent skip, next tick
 * covers), and reserve the sign-in message for a real 4xx rejection.
 */
describe('savePartialRound — transient auth-check failure is not a sign-out', () => {
  function seedRound() {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-auth',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Bryan Park Champs',
      round_date: '2026-08-19',
      status: 'in_progress',
      updated_at: '2026-08-19T22:00:00Z',
    });
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
    adminFake = fake;
    return tables;
  }

  const partialData = {
    courseName: 'Bryan Park Champs',
    courseId: COURSE_A,
    roundType: 'practice' as const,
    roundDate: '2026-08-19',
    currentHole: 15,
    holesToPlay: 18,
    holes: [],
  };

  it("returns 'retry' (not a sign-in demand) when the auth check dies in transit", async () => {
    seedRound();
    // AuthRetryableFetchError shape: user null, status 0 — GoTrue never ruled.
    fake.auth.getUser = async () => ({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const result = await savePartialRound(partialData, 'round-auth');
    expect(result).toEqual({ success: false, error: 'retry' });

    // Logged as a WARNING with the transit language — never as the
    // "session expired mid-round" error that misled the incident triage.
    const { logServerError } = await import('@/lib/server-error-logger');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (logServerError as any).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('NOT a session expiry');
    expect(calls[0][2]).toBe('warning');
  });

  it('still demands sign-in on a REAL 401 rejection', async () => {
    seedRound();
    fake.auth.getUser = async () => ({
      data: { user: null },
      error: { name: 'AuthApiError', status: 401, message: 'invalid JWT' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const result = await savePartialRound(partialData, 'round-auth');
    expect(result).toEqual({ success: false, error: 'You must be signed in' });

    const { logServerError } = await import('@/lib/server-error-logger');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (logServerError as any).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('session expired mid-round');
    expect(calls[0][2]).toBe('error');
  });
});
