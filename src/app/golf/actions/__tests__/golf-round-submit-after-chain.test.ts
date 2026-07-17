/**
 * Regression test for #920 (insight-staleness engine, fix 1/4): round submit
 * used to register TWO independent `after()` callbacks — one for the
 * stats-cache refresh (`invalidateOnRoundComplete`) and one for the CoachHelm
 * trigger (`postRoundTrigger`). `after()` callbacks run concurrently, not in
 * registration order, so the CoachHelm engine could read
 * `golf_player_stats_cache` BEFORE the cache refresh finished writing it —
 * producing insights/predictions off stale data.
 *
 * The fix chains them into a SINGLE `after()` that awaits the cache refresh
 * THEN runs postRoundTrigger, guaranteeing the ordering.
 *
 * This test proves the ordering deterministically: `invalidateOnRoundComplete`
 * is mocked with a real (macrotask) delay before it records itself in
 * `order`, while `postRoundTrigger` records itself synchronously. Under the
 * OLD two-after() code this reliably reproduces the race (postRoundTrigger
 * would win the race and land in `order` first); under the fixed single
 * chained after(), `order` is deterministically `['cache', 'post']` every
 * time because postRoundTrigger only runs after `invalidateOnRoundComplete`
 * is awaited to completion in the same callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let order: string[] = [];
let afterPromises: Promise<unknown>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

// Mirrors real `after()` fire-and-forget semantics: the callback starts
// running immediately (NOT awaited by the caller) — exactly what let the old
// two-after()-calls code race in production. The test captures each
// callback's promise so it can await background work to completion before
// asserting on `order`.
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterPromises.push(Promise.resolve(cb()));
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

// A real (macrotask) delay before recording — long enough that any
// synchronous/microtask-only rival (the old second after() callback) would
// finish first if it weren't actually chained behind this one.
vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push('cache');
    return { warnings: [] };
  }),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {
    order.push('post');
    return { success: true };
  }),
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
import { invalidateOnRoundComplete } from '@/lib/cache/golf-stats-calculator';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';

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
    score: 5,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: false,
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
    courseName: 'Test Course',
    courseId: COURSE_ID,
    roundType: 'practice' as const,
    roundDate: new Date().toISOString().slice(0, 10),
    holes: Array.from({ length: 9 }, (_, i) => makeHole(i + 1)),
  };
}

function seed() {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      // No active golf_team_members row — getPlayerTeamId() resolves to
      // null, so the (unrelated) push-notification block is skipped and
      // this test stays scoped to the after()-chain ordering.
      golf_team_members: [],
      golf_rounds: [],
    },
    rpc: {
      submit_round_atomic: async () => ({
        data: { success: true, warnings: [] },
        error: null,
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  order = [];
  afterPromises = [];
  seed();
});

describe('submitGolfRoundComprehensive — chained after() (#920 fix 1)', () => {
  it('awaits the stats-cache refresh to completion before running postRoundTrigger', async () => {
    const result = await submitGolfRoundComprehensive(makeRoundInput());
    expect(result.success).toBe(true);

    // Flush every after() callback's background work to completion before
    // inspecting the recorded order.
    await Promise.all(afterPromises);

    expect(order).toEqual(['cache', 'post']);
    expect(invalidateOnRoundComplete).toHaveBeenCalledTimes(1);
    expect(postRoundTrigger).toHaveBeenCalledTimes(1);

    // Exactly ONE after() registration for this pair — not two independent
    // ones racing each other (the actual bug: two separate `after()` calls).
    // (submitGolfRoundComprehensive registers no other after() callbacks on
    // this code path, so this also pins the total count.)
    expect(afterPromises.length).toBe(1);
  });
});
