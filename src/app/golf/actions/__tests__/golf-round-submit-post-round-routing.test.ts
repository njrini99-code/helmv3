/**
 * Post-round CoachHelm trigger routing in `submitGolfRoundComprehensive`'s
 * `after()` callback. `after()` is fire-and-forget and not durable — if the
 * serverless instance ends before it runs, the round is silently never
 * analyzed (how 206 of 290 rounds went stranded before 2026-07-25). The
 * durability layers are the pgmq queue (HELM_QUEUE_ENABLED), then the direct
 * `postRoundTrigger` call, then the coachhelm-safety-net cron.
 *
 * Load-bearing behaviors proven here:
 *
 * 1. Queue disabled: `postRoundTrigger` runs directly.
 * 2. Queue enabled and the enqueue succeeds: the job is handed to the queue and
 *    `postRoundTrigger` is NOT called from this code path.
 * 3. Queue enabled but the enqueue fails open (`{ queued: false }`): falls
 *    through to the direct `postRoundTrigger` call, so a round is never left
 *    unanalyzed because the queue is unavailable.
 * 4. Resubmission is NOT silently deduped on the direct path.
 *    `submitGolfRoundComprehensive(roundData, existingRoundId)` is a real,
 *    wired path (new-round-client.tsx, continue-round-client.tsx,
 *    FairwayRecoverRound.tsx) and every successful resubmission re-triggers a
 *    fresh CoachHelm pass — relied-upon behavior (a coach fixes a miskeyed
 *    hole, resubmits, gets corrected insights).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let afterPromises: Promise<unknown>[] = [];
let queueEnabled = false;
let enqueueResult: { queued: true; msgId: number } | { queued: false; reason: string } = { queued: false, reason: 'queue_disabled' };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

// Same fire-and-forget capture pattern as golf-round-submit-after-chain.test.ts
// — real after() doesn't await its callback, so the test captures each
// callback's promise to flush background work before asserting.
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

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => ({ warnings: [] })),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => ({ success: true })),
}));

// `queueEnabled` / `enqueueResult` (closure vars, reset per test) drive the
// pgmq branch without touching real env vars or the database.
const enqueueJobMock = vi.fn(async (..._args: unknown[]) => enqueueResult);
vi.mock('@/lib/jobs/enqueue', () => ({
  enqueueJob: (...args: unknown[]) => enqueueJobMock(...args),
  isHelmQueueEnabled: () => queueEnabled,
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
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '22222222-2222-4222-8222-222222222222';

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
      // this test stays scoped to the post-round routing decision.
      golf_team_members: [],
      golf_rounds: [
        // Seeded 'in_progress' (not 'completed') so it stays resubmittable
        // across multiple calls in the dedup test — the fake RPC below
        // never mutates this row's status, mirroring how the real
        // submit_round_atomic RPC's effect is opaque to this test.
        { id: ROUND_ID, player_id: 'player-1', status: 'in_progress', draft_data: null },
      ],
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
  afterPromises = [];
  queueEnabled = false;
  enqueueResult = { queued: false, reason: 'queue_disabled' };
  seed();
});

describe('submitGolfRoundComprehensive — post-round CoachHelm routing', () => {
  it('queue disabled: runs the direct postRoundTrigger path and never enqueues', async () => {
    queueEnabled = false;

    const result = await submitGolfRoundComprehensive(makeRoundInput());
    expect(result.success).toBe(true);
    await Promise.all(afterPromises);

    expect(enqueueJobMock).not.toHaveBeenCalled();
    expect(postRoundTrigger).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postRoundTrigger).mock.calls[0]![1]).toMatchObject({
      playerId: 'player-1',
      triggerReason: 'round_submitted',
    });
  });

  it('queue enabled and enqueue succeeds: hands off to the queue and does not call postRoundTrigger directly', async () => {
    queueEnabled = true;
    enqueueResult = { queued: true, msgId: 42 };

    const result = await submitGolfRoundComprehensive(makeRoundInput());
    expect(result.success).toBe(true);
    await Promise.all(afterPromises);

    expect(enqueueJobMock).toHaveBeenCalledTimes(1);
    expect(enqueueJobMock.mock.calls[0]![0]).toBe('coachhelm_analysis');
    expect(enqueueJobMock.mock.calls[0]![1]).toMatchObject({ playerId: 'player-1' });
    expect(postRoundTrigger).not.toHaveBeenCalled();
  });

  it('queue enabled but enqueue fails open: falls through to the direct postRoundTrigger path', async () => {
    queueEnabled = true;
    enqueueResult = { queued: false, reason: 'queue_disabled' };

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(result.success).toBe(true);
    await Promise.all(afterPromises);

    expect(enqueueJobMock).toHaveBeenCalledTimes(1);
    expect(postRoundTrigger).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postRoundTrigger).mock.calls[0]![1]).toMatchObject({
      playerId: 'player-1',
      roundId: ROUND_ID,
      triggerReason: 'round_submitted',
    });
  });

  it('resubmission of the same round is NOT deduped away — the direct path re-triggers every time', async () => {
    queueEnabled = false;

    const first = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(first.success).toBe(true);
    await Promise.all(afterPromises);

    // A coach fixing a miskeyed hole resubmits the SAME round.
    const second = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(second.success).toBe(true);
    await Promise.all(afterPromises);

    expect(postRoundTrigger).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(postRoundTrigger).mock.calls) {
      expect(call[1]).toMatchObject({ roundId: ROUND_ID, triggerReason: 'round_submitted' });
    }
  });
});
