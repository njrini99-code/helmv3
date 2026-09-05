/**
 * Wires `expectRows` (src/lib/supabase/expect-rows.ts) at its one live call
 * site: `submitGolfRoundComprehensiveImpl`'s player-resolution read of the
 * caller's own `golf_players` row.
 *
 * The read was switched from `.single()` to `.maybeSingle()` so a silent
 * `{ data: null, error: null }` reaches `expectRows` instead of being
 * pre-converted to a PostgREST `PGRST116` error. `golf_players_select`'s
 * first RLS clause is the unconditional `user_id = auth.uid()` (verified
 * against production), and every route that can invoke this action sits
 * under the `(dashboard)` layout that already requires
 * `player.onboarding_completed` before it lets a request through — so an
 * empty result here is never a legitimate "still onboarding" state, only an
 * anomaly. Two things must both hold:
 *   1. The empty read fires the `source: 'rls_denial'` admin signal.
 *   2. The action's own graceful, pre-existing "player profile not found"
 *      result is completely unchanged — expectRows is fail-open and must
 *      not alter control flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let tables: Record<string, Record<string, unknown>[]>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('next/server', () => ({
  after: vi.fn(() => {}),
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
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const HOLE_COUNT = 9;

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

beforeEach(() => {
  vi.clearAllMocks();
  // expectRows's emit-once throttle is shared module state across the whole
  // test process — without a reset, a suppressed re-run from an earlier test
  // reads back as "did not log" for reasons unrelated to the code under test.
  __resetEmitThrottleForTests();
});

describe('submitGolfRoundComprehensive — expectRows on the golf_players player-resolution read', () => {
  it('guaranteed-context empty (no golf_players row for this user_id) emits the rls_denial admin signal', async () => {
    tables = {
      golf_players: [], // no row at all — matches golf_players_select's guaranteed-visible query returning nothing
      golf_team_members: [],
      golf_rounds: [],
      golf_holes: [],
      golf_shots: [],
    };
    fake = createFakeSupabase({
      user: { id: 'u-no-player' },
      tables,
      rpc: {},
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput());

    const calls = vi.mocked(logServerEvent).mock.calls;
    const rlsDenialCall = calls.find(([, context]) => {
      const ctx = context as unknown as Record<string, unknown> | undefined;
      return ctx?.source === 'rls_denial';
    });
    expect(rlsDenialCall).toBeDefined();
    const [message, context, severity] = rlsDenialCall!;
    expect(message).toContain('golf_players');
    expect(severity).toBe('warning');
    expect(context).toMatchObject({
      source: 'rls_denial',
      action: 'submitGolfRoundComprehensive',
      featureArea: 'shot_tracking',
      sport: 'golf',
      userId: 'u-no-player',
      skipSentry: true,
    });
    expect((context as unknown as Record<string, unknown>).metadata).toMatchObject({ table: 'golf_players' });

    // Unaffected: the action's own pre-existing graceful failure path.
    // `code` added 2026-09-04 so describeRoundWriteResult can replace the bare
    // string with a sentence that says where the player's shots are.
    expect(result).toEqual({ success: false, error: 'Player profile not found', code: 'player_missing' });
  });

  it('preserves the action-level result unchanged for the empty-player read — fail-open, no control-flow change', async () => {
    tables = {
      golf_players: [],
      golf_team_members: [],
      golf_rounds: [],
      golf_holes: [],
      golf_shots: [],
    };
    fake = createFakeSupabase({
      user: { id: 'u-no-player-2' },
      tables,
      rpc: {},
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput());

    // Same graceful, non-throwing result the pre-expectRows `.single()` code
    // path produced: expectRows never mutates or replaces the query result,
    // and only `data` was ever destructured from it, so switching to
    // `.maybeSingle()` and wrapping it changes nothing observable here.
    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe('Player profile not found');

    expect(logServerError).toHaveBeenCalledWith(
      'Round submit failed: player profile not found',
      expect.objectContaining({
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        userId: 'u-no-player-2',
      }),
      'error',
    );
  });

  it('does not emit the rls_denial signal when the player row is present', async () => {
    tables = {
      golf_players: [{ id: 'player-1', user_id: 'u-has-player' }],
      golf_team_members: [],
      golf_rounds: [],
      golf_holes: [],
      golf_shots: [],
      golf_courses: [{ id: COURSE_ID, name: 'Bryan Park Champs' }],
    };
    fake = createFakeSupabase({
      user: { id: 'u-has-player' },
      tables,
      rpc: {
        submit_round_atomic: async () => ({
          data: { success: true, warnings: [] },
          error: null,
        }),
      },
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput());

    // Positive assertion, not just absence-of-signal: execution genuinely
    // reached and passed the player-resolution read (and the rest of the
    // submit flow) rather than failing earlier for an unrelated reason that
    // would ALSO leave no rls_denial call recorded.
    expect(result.success).toBe(true);

    const calls = vi.mocked(logServerEvent).mock.calls;
    const rlsDenialCall = calls.find(([, context]) => {
      const ctx = context as unknown as Record<string, unknown> | undefined;
      return ctx?.source === 'rls_denial' && ctx?.metadata && (ctx.metadata as Record<string, unknown>).table === 'golf_players';
    });
    expect(rlsDenialCall).toBeUndefined();
  });

  it('is fail-open: a throwing observability emit does not change the action-level result', async () => {
    tables = {
      golf_players: [],
      golf_team_members: [],
      golf_rounds: [],
      golf_holes: [],
      golf_shots: [],
    };
    fake = createFakeSupabase({
      user: { id: 'u-no-player-3' },
      tables,
      rpc: {},
    });
    // Simulates the observability side-effect itself failing (e.g. the
    // shared logging pipeline is down). expectRows must not let this change
    // what submitGolfRoundComprehensive returns to the caller.
    vi.mocked(logServerEvent).mockImplementationOnce(() => {
      throw new Error('boom: logging pipeline unavailable');
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput());

    expect(result).toEqual({ success: false, error: 'Player profile not found', code: 'player_missing' });
  });
});
