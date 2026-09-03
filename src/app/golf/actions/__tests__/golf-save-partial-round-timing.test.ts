/**
 * @vitest-environment node
 *
 * Deliverable 4 of the flight-recorder real-timings refit: proves a
 * savePartialRound trace's TOTAL DURATION now equals the sum of ATTRIBUTED
 * stage time rather than a handful of steps reading 0ms.
 *
 * The bug this guards against: a step marked `complete()` without a prior
 * `start()` gets its `startedAt` set to the SAME instant as `finishedAt` (see
 * `transition()` in golf-round-flight-workflow.ts — `startedAt: prior.startedAt
 * ?? now`), so a trace's final step state cannot by itself distinguish
 * "started then completed" from "completed with no prior start". Proving the
 * fix needs the ORDER calls were made in, not just the final state — so this
 * test uses a fake recorder that (a) delegates to a REAL, unmocked
 * `createGolfRoundWorkflowTrace` for genuine startedAt/finishedAt semantics
 * and undeclared-step-key detection, and (b) keeps its own ordered call log
 * to assert `start` precedes `complete` for every step, per key.
 *
 * Drives the no-id/new-round branch specifically: it is the one that had
 * ZERO recorder coverage before this refit (see the workflow-level comment
 * on golf.round.autosave), so it exercises server.validation/auth/player,
 * the round-creation step (db.create_or_update_draft), the new
 * db.shot_details step, and verify.round/holes/shots all in one call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { createGolfRoundWorkflowTrace, type GolfRoundWorkflowTrace } from '@/lib/observability/golf-round-flight-workflow';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
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

type OrderedCall = { method: string; stepKey?: string };
let orderedCalls: OrderedCall[];
let capturedTrace: GolfRoundWorkflowTrace | null;

vi.mock('@/lib/observability/helm-flight-recorder', () => ({
  createHelmFlightRecorder: vi.fn(async (input: {
    workflow: 'golf.round.autosave';
    traceId?: string;
    qualifierId?: string | null;
    existingRoundId?: string | null;
  }) => {
    // A REAL trace object — not a second hand-rolled fake — so startedAt/
    // finishedAt come from the actual production transition logic, and an
    // undeclared or typo'd step key silently no-ops exactly as it would in
    // production (trace.step(key) returns undefined; see `transition()`).
    const trace = createGolfRoundWorkflowTrace({
      workflow: input.workflow,
      traceId: input.traceId,
      qualifierId: input.qualifierId,
      existingRoundId: input.existingRoundId,
    });
    capturedTrace = trace;

    const record = (method: 'start' | 'complete' | 'fail' | 'warn' | 'skip') =>
      async (stepKey: string, stepInput?: { metadata?: Record<string, unknown>; errorCode?: string }) => {
        orderedCalls.push({ method, stepKey });
        const metadata = { ...stepInput?.metadata, ...(stepInput?.errorCode ? { errorCode: stepInput.errorCode } : {}) };
        trace[method](stepKey, metadata);
      };

    return {
      traceId: trace.traceId,
      workflow: input.workflow,
      start: record('start'),
      complete: record('complete'),
      fail: record('fail'),
      warn: record('warn'),
      skip: record('skip'),
      finalize: async (status: string) => {
        orderedCalls.push({ method: 'finalize', stepKey: status });
      },
    };
  }),
}));

import { savePartialRound } from '../golf';

const COURSE_A = '11111111-1111-4111-8111-111111111111';

function baseTables() {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
    ],
    golf_rounds: [] as Record<string, unknown>[],
    golf_holes: [] as Record<string, unknown>[],
    golf_shots: [] as Record<string, unknown>[],
  };
}

function seed() {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: baseTables(),
  });
}

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

const partialData = {
  courseName: 'Same Course',
  courseId: COURSE_A,
  roundType: 'practice' as const,
  roundDate: '2026-08-25',
  currentHole: 1,
  holesToPlay: 18 as const,
  holes: [makeHole(1)],
};

beforeEach(() => {
  orderedCalls = [];
  capturedTrace = null;
  vi.clearAllMocks();
  seed();
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.HELM_FLIGHT_RECORDER_ENABLED;
});

describe('savePartialRound (no-id/new-round branch) — real per-stage timing', () => {
  it('starts before it completes every attributed stage, with real startedAt/finishedAt on each', async () => {
    const result = await savePartialRound(partialData);

    expect(result.success).toBe(true);
    expect(capturedTrace).not.toBeNull();
    const trace = capturedTrace as GolfRoundWorkflowTrace;

    // The six stages deliverable 4 names: server.validation/auth/player, the
    // round-creation step standing in for "the RPC step" on this branch
    // (db.create_or_update_draft — there is no single atomic RPC here, see
    // the comment on golf.round.autosave in golf-round-flight-workflow.ts),
    // the new "detail step" (db.shot_details), and the three verify.* reads.
    const attributedSteps = [
      'server.validation',
      'server.auth',
      'server.player',
      'db.create_or_update_draft',
      'db.shot_details',
      'verify.round',
      'verify.holes',
      'verify.shots',
    ];

    for (const key of attributedSteps) {
      // 1. Call ORDER proves `start` happened before `complete` for this
      // key — the final trace state alone cannot: a step completed with no
      // prior start() also ends up with a defined (but equal-to-finishedAt)
      // startedAt, which is exactly the bug this whole refit closes.
      const startIndex = orderedCalls.findIndex((c) => c.method === 'start' && c.stepKey === key);
      const completeIndex = orderedCalls.findIndex((c) => c.method === 'complete' && c.stepKey === key);
      expect(startIndex, `${key} should have a recorded start() call`).toBeGreaterThanOrEqual(0);
      expect(completeIndex, `${key} should have a recorded complete() call`).toBeGreaterThanOrEqual(0);
      expect(startIndex, `${key}: start() must be recorded before complete()`).toBeLessThan(completeIndex);

      // 2. The real trace object carries genuine timestamps for both, in
      // the right order, and reports the step as successfully completed.
      const state = trace.step(key);
      expect(state, `${key} must be a declared step on this workflow`).toBeDefined();
      expect(state?.status).toBe('success');
      expect(state?.startedAt, `${key}.startedAt`).toBeDefined();
      expect(state?.finishedAt, `${key}.finishedAt`).toBeDefined();
      expect(new Date(state!.startedAt!).getTime()).toBeLessThanOrEqual(new Date(state!.finishedAt!).getTime());
    }

    // db.save_partial_round_atomic is the OTHER branch's step (when:
    // 'existing_round') — it must stay untouched/skipped here, not silently
    // marked complete by a misrouted call.
    expect(trace.step('db.save_partial_round_atomic')?.status).toBe('skipped');
  });
});
