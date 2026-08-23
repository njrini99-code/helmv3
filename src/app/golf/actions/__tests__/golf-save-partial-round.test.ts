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
import type { HoleStats, ShotRecord } from '@/lib/types/golf';

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

import { getNextQualifierRoundNumber, savePartialRound } from '../golf';

type Row = Record<string, unknown>;
interface SeedTables extends Record<string, Row[]> {
  golf_players: Row[];
  golf_team_members: Row[];
  golf_rounds: Row[];
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
  };
}

function seedAs(userId: string, tables: SeedTables) {
  fake = createFakeSupabase({ user: { id: userId }, tables });
  adminFake = fake;
}

function completedHole(overrides: Partial<HoleStats> = {}): HoleStats {
  return {
    holeNumber: 1,
    par: 4,
    yardage: 400,
    score: 4,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: true,
    drivingDistance: null,
    usedDriver: true,
    driveMissDirection: null,
    approachDistance: 150,
    approachLie: 'fairway',
    approachProximity: 10,
    approachMissDirection: null,
    scrambleAttempt: false,
    scrambleMade: false,
    sandSaveAttempt: false,
    sandSaveMade: false,
    penaltyStrokes: 0,
    firstPuttDistance: null,
    firstPuttLeave: null,
    firstPuttBreak: null,
    firstPuttSlope: null,
    firstPuttMissDirection: null,
    holedOutDistance: null,
    holedOutType: null,
    shots: [],
    ...overrides,
  };
}

function trackedShot(): ShotRecord {
  return {
    shotNumber: 1,
    shotType: 'tee',
    clubType: 'driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 400,
    distanceUnitBefore: 'yards',
    result: 'fairway',
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards',
    shotDistance: 250,
    isPenalty: false,
  };
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
});

describe('getNextQualifierRoundNumber — coach-controlled completion', () => {
  it('refuses a stale link after a coach has explicitly closed the qualifier', async () => {
    const tables = baseTables();
    tables.golf_qualifier_entries = [{ id: 'entry-1', qualifier_id: 'qualifier-1', player_id: 'player-1' }];
    tables.golf_qualifiers = [{ id: 'qualifier-1', num_rounds: 3, status: 'completed' }];
    seedAs('u-p1', tables);

    const result = await getNextQualifierRoundNumber('qualifier-1');

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/closed by the coach/i);
  });

  it('explains an open qualifier round cap without falsely calling the qualifier completed', async () => {
    const tables = baseTables();
    tables.golf_qualifier_entries = [{ id: 'entry-1', qualifier_id: 'qualifier-1', player_id: 'player-1' }];
    tables.golf_qualifiers = [{ id: 'qualifier-1', num_rounds: 1, status: 'in_progress' }];
    tables.golf_rounds = [{
      id: 'round-1',
      qualifier_id: 'qualifier-1',
      player_id: 'player-1',
      qualifier_round_number: 1,
      status: 'completed',
    }];
    seedAs('u-p1', tables);

    const result = await getNextQualifierRoundNumber('qualifier-1');

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/1 of 1/i);
    expect(result.success === false && result.error).toMatch(/still open/i);
    expect(result.success === false && result.error).toMatch(/coach.*raise.*round/i);
    expect(result.success === false && result.error).not.toMatch(/completed every round/i);
  });
});

/**
 * P0 regression: a transient child write failure must NEVER delete an
 * in-progress round. A player whose client lost its local round ID reaches
 * this fallback path after signing back in; deleting the parent here made a
 * recoverable retry appear as though the whole round had vanished.
 */
describe('savePartialRound — child-write failures preserve the round', () => {
  function seedRecoverableRound() {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-preserve',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Same Course',
      round_date: '2026-08-22',
      status: 'in_progress',
      qualifier_id: null,
      qualifier_round_number: null,
      updated_at: '2026-08-22T10:00:00Z',
    });
    seedAs('u-p1', tables);
    return tables;
  }

  function failUpsert(
    client: FakeSupabase,
    table: string,
    error: { code?: string; message: string },
  ) {
    const origFrom = client.from.bind(client);
    client.from = ((requestedTable: string) => {
      const api = origFrom(requestedTable);
      if (requestedTable !== table) return api;
      return {
        ...api,
        upsert: () => ({
          select: async () => ({ data: null, error }),
        }),
      };
    }) as typeof client.from;
  }

  const baseSaveData = {
    courseName: 'Same Course',
    courseId: COURSE_A,
    roundType: 'practice' as const,
    roundDate: '2026-08-22',
    currentHole: 2,
    holesToPlay: 18 as const,
    holeConfigs: [{ holeNumber: 1, par: 4, yardage: 400 }],
  };

  it('preserves the existing round when hole persistence fails', async () => {
    const tables = seedRecoverableRound();
    failUpsert(fake, 'golf_holes', { code: '08006', message: 'connection reset' });

    const result = await savePartialRound({
      ...baseSaveData,
      holes: [completedHole()],
    });

    expect(result.success).toBe(false);
    expect(tables.golf_rounds).toHaveLength(1);
    expect(tables.golf_rounds[0]?.id).toBe('round-preserve');
  });

  it('preserves the existing round when shot persistence fails', async () => {
    const tables = seedRecoverableRound();
    failUpsert(fake, 'golf_shots', { code: '08006', message: 'connection reset' });

    const result = await savePartialRound({
      ...baseSaveData,
      holes: [completedHole({ shots: [trackedShot()] })],
    });

    expect(result.success).toBe(false);
    expect(tables.golf_rounds).toHaveLength(1);
    expect(tables.golf_rounds[0]?.id).toBe('round-preserve');
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
