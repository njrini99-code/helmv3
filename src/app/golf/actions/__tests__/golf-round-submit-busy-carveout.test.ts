/**
 * Regression test for the submit_round_atomic single-flight guard
 * (supabase/migrations/20260821043500_single_flight_round_submit.sql).
 *
 * BACKGROUND: 2026-08-20/21, 17:07-17:30 UTC — a lock pile-up on
 * submit_round_atomic during a team submit window. The migration adds a
 * bounded (3s) FOR UPDATE wait around the function's existing round lookup;
 * if a same-round auto-save (or a second submit) still holds the row after
 * that wait, the RPC returns {success:false, error:'busy'} instead of
 * queuing behind the function's ambient 15s lock_timeout.
 *
 * THE INVARIANT under test, at BOTH call sites in golf.ts (existing-round
 * and new-round/draft): a 'busy' result from the RPC must
 *   1. surface a friendly, non-technical message to the caller — not the
 *      raw 'busy' token,
 *   2. NOT log at 'error' severity via the golf.ts call site itself — this
 *      is expected contention, not an incident, matching the identical
 *      'busy' precedent at save_partial's call site, and
 *   3. NEVER reach attemptDirectSubmitFallback ('busy' !== 'internal_error'),
 *      because that fallback does a destructive delete+reinsert and 'busy'
 *      means the row is legitimately owned by another writer right now.
 *
 * `submitGolfRoundComprehensive` is `withAdminObserved`-wrapped (unlike
 * `savePartialRound`, which returns before any log call and never reaches a
 * wrapper), so a `{success:false}` envelope still produces ONE admin_events
 * write from the wrapper's own soft-failure observer — that part cannot be
 * silenced without disabling soft-failure observation for every OTHER
 * failure this action can return. What this fix controls is the severity:
 * `EXPECTED_SOFT_FAILURE_PATTERNS` in observe-action-result.ts now matches
 * this exact message, which tiers it 'warning' + skipSentry instead of the
 * 'error' every other unrecognized soft failure gets.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let tables: Record<string, Record<string, unknown>[]>;
let writes: { table: string; op: string }[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('next/server', () => ({
  after: vi.fn(() => {}),
}));

// The wrapper's soft-failure observer no longer `void`s its admin_events
// write: it defers it past the response through `scheduleBridgeWrite`, which
// is Next's `after()` inside a request scope. The `next/server` mock above
// swallows `after` callbacks (it exists for golf.ts's own post-response
// trigger, which this file must NOT run), so without this the deferred write
// would vanish and the observer's call count would read 0 for a reason that
// has nothing to do with the code under test. Run the write inline instead —
// the test-side stand-in for Next executing the callback.
vi.mock('@/lib/admin/schedule-bridge-write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/schedule-bridge-write')>()),
  scheduleBridgeWrite: vi.fn(async (write: () => Promise<unknown>) => {
    await write().catch(() => {});
    return 'awaited' as const;
  }),
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

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => ({ warnings: [] })),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => ({ success: true })),
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

import { submitGolfRoundComprehensive } from '../golf';
import { logServerError } from '@/lib/server-error-logger';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = 'a1b2c3d4-5047-4658-85b4-380250dc6245';
const QUALIFIER_A = '11111111-1111-4111-8111-111111111112';
const QUALIFIER_B = '11111111-1111-4111-8111-111111111113';
const HOLE_COUNT = 9;
const BUSY_MESSAGE = 'Another save for this round is just finishing — try again in a moment.';

function makeShot(shotNumber: number) {
  return {
    shotNumber,
    shotType: 'tee' as const,
    clubType: 'driver' as const,
    lieBefore: 'tee' as const,
    distanceToHoleBefore: 380,
    distanceUnitBefore: 'yards' as const,
    result: 'fairway' as const,
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards' as const,
    shotDistance: 230,
    isPenalty: false,
  };
}

function makeHole(holeNumber: number) {
  return {
    holeNumber,
    par: 4,
    yardage: 380,
    score: 4,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: true,
    drivingDistance: null,
    usedDriver: null,
    driveMissDirection: null,
    approachDistance: null,
    approachLie: null,
    approachProximity: null,
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
    shots: [makeShot(1)],
  };
}

function makeRoundInput() {
  return {
    courseName: 'Bryan Park Champs',
    courseId: COURSE_ID,
    roundType: 'practice' as const,
    roundDate: new Date().toISOString().slice(0, 10),
    holes: Array.from({ length: HOLE_COUNT }, (_, i) => makeHole(i + 1)),
  };
}

/** Result the RPC returns when the single-flight guard's 3s bounded wait
 *  expires because another writer (auto-save or a second submit) still
 *  holds the round's row. */
const BUSY_RESULT = { data: { success: false, error: 'busy' }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  // The flood-collapse throttle (src/lib/admin/emit-throttle.ts) that gates
  // the wrapper's soft-failure observer is module-level state shared across
  // every test in this process — without a reset, the SAME busy message from
  // an earlier test in this file silently suppresses this test's emit within
  // its 60s window, and the observer's call count reads as 0 for reasons that
  // have nothing to do with the code under test.
  __resetEmitThrottleForTests();
});

describe('submitGolfRoundComprehensive — busy carve-out (existing round path)', () => {
  it('returns a friendly message and does not log an error event', async () => {
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [{
        id: ROUND_ID,
        player_id: 'player-1',
        status: 'in_progress',
        draft_data: null,
        total_score: HOLE_COUNT * 4,
      }],
      golf_holes: [],
      golf_shots: [],
    };
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: {
        submit_round_atomic: async () => BUSY_RESULT,
      },
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe(BUSY_MESSAGE);
    // Not the raw RPC token — a player should never see 'busy' verbatim.
    expect(result.success === false && result.error).not.toBe('busy');

    // THE ASSERTION THAT MATTERS: the golf.ts call site's OWN logServerError
    // call must never fire for 'busy' — that call, if it ran, would default
    // to 'error' severity. The wrapper's soft-failure observer still writes
    // one admin_events row (see file header), but at 'warning', not 'error'.
    expect(logServerError).toHaveBeenCalledTimes(1);
    const [, , severity] = vi.mocked(logServerError).mock.calls[0]!;
    expect(severity).toBe('warning');
  });

  it('does not delete/reinsert holes and shots (never reaches the destructive fallback)', async () => {
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [{
        id: ROUND_ID,
        player_id: 'player-1',
        status: 'in_progress',
        draft_data: null,
        total_score: HOLE_COUNT * 4,
      }],
      golf_holes: [{ id: 'hole-1', round_id: ROUND_ID, hole_number: 1, par: 4, score: 4, putts: 2 }],
      golf_shots: [{ id: 'shot-1', round_id: ROUND_ID, hole_id: 'hole-1', hole_number: 1, shot_number: 1 }],
    };
    const base = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: {
        submit_round_atomic: async () => BUSY_RESULT,
      },
    });
    fake = {
      ...base,
      from(table: string) {
        const builder = base.from(table);
        return {
          ...builder,
          delete: () => {
            writes.push({ table, op: 'delete' });
            return builder.delete();
          },
        };
      },
    } as unknown as FakeSupabase;

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(false);
    expect(writes.filter((w) => w.table === 'golf_holes' && w.op === 'delete')).toHaveLength(0);
    expect(writes.filter((w) => w.table === 'golf_shots' && w.op === 'delete')).toHaveLength(0);
  });
});

describe('submitGolfRoundComprehensive — busy carve-out (new round / draft path)', () => {
  it('returns a friendly message and logs at warning, not error, severity', async () => {
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [],
      golf_holes: [],
      golf_shots: [],
    };
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: {
        submit_round_atomic: async () => BUSY_RESULT,
      },
    });

    // No existingRoundId — golf.ts inserts a 'draft' golf_rounds row first,
    // then submits through the same RPC and the same busy carve-out.
    const result = await submitGolfRoundComprehensive(makeRoundInput());

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe(BUSY_MESSAGE);
    expect(logServerError).toHaveBeenCalledTimes(1);
    const [, , severity] = vi.mocked(logServerError).mock.calls[0]!;
    expect(severity).toBe('warning');
  });
});

describe('submitGolfRoundComprehensive — persisted qualifier identity', () => {
  it('rejects a stale client that tries to retarget an already-started qualifier round', async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, warnings: [] }, error: null }));
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [{
        id: ROUND_ID,
        player_id: 'player-1',
        status: 'in_progress',
        round_type: 'qualifier',
        qualifier_id: QUALIFIER_A,
        qualifier_round_number: 1,
      }],
    };
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: { submit_round_atomic: rpc },
    });

    const result = await submitGolfRoundComprehensive({
      ...makeRoundInput(),
      roundType: 'qualifier',
      qualifierId: QUALIFIER_B,
      qualifierRoundNumber: 1,
    }, ROUND_ID);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/different qualifier/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the started round identity when a stale client omits qualifier fields', async () => {
    const rpc = vi.fn(async (args: unknown) => {
      expect((args as Record<string, unknown>).p_round_data).toMatchObject({
        round_type: 'qualifier',
        qualifier_id: QUALIFIER_A,
        qualifier_round_number: 1,
      });
      return { data: { success: true, warnings: [] }, error: null };
    });
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [{
        id: ROUND_ID,
        player_id: 'player-1',
        status: 'in_progress',
        round_type: 'qualifier',
        qualifier_id: QUALIFIER_A,
        qualifier_round_number: 1,
      }],
      golf_qualifiers: [{ id: QUALIFIER_A, status: 'in_progress', num_rounds: 2 }],
      golf_qualifier_entries: [{ id: 'entry-1', qualifier_id: QUALIFIER_A, player_id: 'player-1' }],
    };
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: { submit_round_atomic: rpc },
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps a legacy qualifier round resumable when its missing number cannot be safely submitted', async () => {
    const rpc = vi.fn(async () => ({ data: { success: true, warnings: [] }, error: null }));
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [{
        id: ROUND_ID,
        player_id: 'player-1',
        status: 'in_progress',
        round_type: 'qualifier',
        qualifier_id: QUALIFIER_A,
        qualifier_round_number: null,
      }],
      golf_qualifiers: [{ id: QUALIFIER_A, status: 'in_progress', num_rounds: 2 }],
      golf_qualifier_entries: [{ id: 'entry-1', qualifier_id: QUALIFIER_A, player_id: 'player-1' }],
    };
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables,
      rpc: { submit_round_atomic: rpc },
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/valid qualifier round number/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
