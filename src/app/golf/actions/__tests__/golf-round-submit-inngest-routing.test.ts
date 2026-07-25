/**
 * Fix 3 of the CoachHelm remediation plan (2026-07-25): round submit's
 * `after()` callback now routes the CoachHelm trigger through Inngest when
 * INNGEST_EVENT_KEY/INNGEST_SIGNING_KEY are configured, instead of always
 * calling `postRoundTrigger` directly. `after()` is fire-and-forget and not
 * durable — if the serverless instance ends before it runs, the round is
 * silently never analyzed (this is how 206 of 290 rounds went stranded).
 * Inngest adds retries + durability without changing the degrade path when
 * it isn't configured.
 *
 * This file proves the three load-bearing behaviors from the plan:
 *
 * 1. Configured: `inngest.send()` fires and `postRoundTrigger` is NOT called
 *    directly (Inngest's own function — not exercised here — calls it).
 * 2. Not configured: `inngest.send()` is never called and the direct
 *    `postRoundTrigger` path runs exactly as it did before this fix. The
 *    pre-existing `golf-round-submit-after-chain.test.ts` already exercises
 *    this branch for its own (unrelated) ordering assertion with no keys
 *    set in CI — this test targets the same branch explicitly for the
 *    Inngest routing decision itself.
 * 3. Resubmission is NOT silently deduped. `submitGolfRoundComprehensive(
 *    roundData, existingRoundId)` is a real, wired path (new-round-client.tsx,
 *    continue-round-client.tsx, FairwayRecoverRound.tsx) and today every
 *    successful resubmission re-triggers a fresh CoachHelm pass — relied-
 *    upon behavior (a coach fixes a miskeyed hole, resubmits, gets corrected
 *    insights). An earlier design considered a static per-round event `id`
 *    plus `idempotency: 'event.data.roundId'` on the Inngest function; that
 *    would have silently deduped a second submission inside Inngest's ~24h
 *    idempotency window (send() doesn't throw on a dedupe, and
 *    coachhelm_analyzed_at is already non-NULL from the first pass so the
 *    safety-net cron wouldn't pick it up either) — reproducing the exact
 *    "stale insight, silent no-op, no backstop" defect class this whole
 *    mission exists to eliminate. This test proves the shipped code sends a
 *    fresh, id-less event on every submission of the same round.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let afterPromises: Promise<unknown>[] = [];
let inngestConfigured = false;

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

// The module under test: `inngestConfigured` (closure var, reset per test)
// drives isInngestConfigured()'s return so each test controls the branch
// without touching real env vars.
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn(async () => ({ ids: ['fake-event-id'] })) },
  isInngestConfigured: vi.fn(() => inngestConfigured),
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
import { inngest } from '@/lib/inngest/client';

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
      // this test stays scoped to the Inngest-routing decision.
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
  inngestConfigured = false;
  seed();
});

describe('submitGolfRoundComprehensive — Inngest routing (Fix 3)', () => {
  it('configured: sends the Inngest event and does not call postRoundTrigger directly', async () => {
    inngestConfigured = true;

    const result = await submitGolfRoundComprehensive(makeRoundInput());
    expect(result.success).toBe(true);
    await Promise.all(afterPromises);

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(inngest.send).mock.calls[0]!;
    expect(payload).toMatchObject({ name: 'coachhelm/round.submitted' });
    expect((payload as { data: { roundId: string; playerId: string } }).data).toMatchObject({
      playerId: 'player-1',
    });

    // The whole point of routing through Inngest: the direct call is NOT
    // made from this code path when the send succeeds. onCoachHelmRoundSubmitted
    // (src/lib/inngest/functions.ts) is what calls postRoundTrigger, out of
    // band from this after() callback.
    expect(postRoundTrigger).not.toHaveBeenCalled();
  });

  it('not configured: never calls Inngest and runs the direct postRoundTrigger path unchanged', async () => {
    inngestConfigured = false;

    const result = await submitGolfRoundComprehensive(makeRoundInput());
    expect(result.success).toBe(true);
    await Promise.all(afterPromises);

    expect(inngest.send).not.toHaveBeenCalled();
    expect(postRoundTrigger).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postRoundTrigger).mock.calls[0]![1]).toMatchObject({
      playerId: 'player-1',
      triggerReason: 'round_submitted',
    });
  });

  it('resubmission of the same round is NOT deduped away — Inngest gets a fresh, id-less event every time', async () => {
    inngestConfigured = true;

    const first = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(first.success).toBe(true);
    await Promise.all(afterPromises);

    // A coach fixing a miskeyed hole resubmits the SAME round.
    const second = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(second.success).toBe(true);
    await Promise.all(afterPromises);

    expect(inngest.send).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(inngest.send).mock.calls;
    for (const [payload] of calls) {
      // No static per-round `id` field on the send() payload — that's the
      // mechanism (combined with function-level `idempotency`, which is
      // also deliberately absent from onCoachHelmRoundSubmitted) that would
      // let Inngest silently swallow the second submission's event inside
      // its ~24h idempotency window.
      expect(payload).not.toHaveProperty('id');
      expect((payload as { data: { roundId: string } }).data.roundId).toBe(ROUND_ID);
    }
  });
});
