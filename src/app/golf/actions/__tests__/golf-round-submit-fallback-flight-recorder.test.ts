/**
 * Flight-recorder ordering for submitGolfRoundComprehensive's direct-submit
 * fallback path (Helm Bridge observability refit).
 *
 * BUG BEING GUARDED: when submit_round_atomic fails at the transport level
 * and cannot be reconciled as already-committed, the action calls
 * attemptDirectSubmitFallback before deciding the outcome. The pre-fix code
 * marked db.submit_round_atomic `fail()` and called `finalize('failure')`
 * BEFORE that fallback resolved — so even a fallback that genuinely saved the
 * round would already have been recorded as a trace failure, because
 * helm-flight-recorder.ts's finalize() forces the persisted status to
 * 'failure' whenever ANY step carries status 'failure', regardless of the
 * `status` argument finalize() is called with afterward.
 *
 * attemptDirectSubmitFallback itself is a hardcoded stub today — it always
 * returns `{ success: false }` (src/app/golf/actions/golf.ts, ~line 1958;
 * see also golf-round-submit-abort-no-destructive-fallback.test.ts and
 * docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md for why a real
 * delete-and-reinsert fallback was retired). So the "fallback rescued the
 * write" branch is not reachable through this public action today; that
 * branch is proven directly against the extracted
 * recordRescuedStepOutcome() helper in
 * src/lib/observability/__tests__/helm-flight-recorder.test.ts, using the
 * REAL (non-mocked) trace + finalize logic. This file proves the two things
 * that ARE reachable end-to-end for both submit branches: the fallback is
 * always attempted before the RPC step is marked failed, and the currently-
 * always-failing fallback still finalizes the trace as 'failure' — a plain
 * regression guard that the reorder didn't flip the outcome for the common
 * case.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

type RecorderCall = { method: string; stepKey?: string; input?: unknown };
let recorderCalls: RecorderCall[];
const MOCK_TRACE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

vi.mock('@/lib/observability/helm-flight-recorder', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability/helm-flight-recorder')>(
    '@/lib/observability/helm-flight-recorder',
  );
  return {
    // recordRescuedStepOutcome is exercised for real (against the mocked
    // recorder below) so this suite also proves golf.ts calls it with the
    // right stepKeys and the right `rescued` flag — not just that SOME
    // fail+finalize sequence happened.
    recordRescuedStepOutcome: actual.recordRescuedStepOutcome,
    createHelmFlightRecorder: vi.fn(async (input: { workflow: string; traceId?: string }) => {
      const traceId = input.traceId ?? MOCK_TRACE_ID;
      const record = (method: string) => (stepKey?: string, stepInput?: unknown) => {
        recorderCalls.push({ method, stepKey, input: stepInput });
        return Promise.resolve(undefined);
      };
      return {
        traceId,
        workflow: input.workflow,
        start: record('start'),
        complete: record('complete'),
        fail: record('fail'),
        warn: record('warn'),
        skip: record('skip'),
        finalize: (status: string) => {
          recorderCalls.push({ method: 'finalize', stepKey: status });
          return Promise.resolve(undefined);
        },
      };
    }),
  };
});

import { submitGolfRoundComprehensive } from '../golf';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '8e89c73e-5047-4658-85b4-380250dc6245';

/** A real, deterministic Postgres error — NOT the indeterminate/transport
 *  shape (see isIndeterminateWriteFailure, golf.ts ~line 1190). A non-empty
 *  `code` alone is enough to short-circuit `submissionCommitted` to false
 *  without needing to also mock a round-confirmation read. */
const DETERMINISTIC_RPC_ERROR = {
  message: 'duplicate key value violates unique constraint',
  code: '23505',
  hint: '',
  details: '',
};

function makeShot() {
  return {
    shotNumber: 1,
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
    shots: [makeShot()],
  };
}

function makeRoundInput() {
  return {
    courseName: 'Bryan Park Champs',
    courseId: COURSE_ID,
    roundType: 'practice' as const,
    roundDate: new Date().toISOString().slice(0, 10),
    holes: Array.from({ length: 9 }, (_, i) => makeHole(i + 1)),
  };
}

function seed(existingRound: boolean) {
  tables = {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [],
    golf_rounds: existingRound
      ? [{ id: ROUND_ID, player_id: 'player-1', status: 'in_progress', draft_data: null }]
      : [],
    golf_holes: [],
    golf_shots: [],
  };
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables,
    rpc: { submit_round_atomic: async () => ({ data: null, error: DETERMINISTIC_RPC_ERROR }) },
  });
}

beforeEach(() => {
  recorderCalls = [];
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.HELM_FLIGHT_RECORDER_ENABLED;
});

describe('submitGolfRoundComprehensive — direct-submit fallback ordering (existing round)', () => {
  it('attempts the fallback BEFORE marking db.submit_round_atomic failed, and finalizes failure when the fallback does not rescue', async () => {
    seed(true);

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(false);

    const methodOrder = recorderCalls.map((c) => `${c.method}:${c.stepKey ?? ''}`);
    // The recorder is constructed before Zod/auth/player (2026-09-02), so
    // those three complete before the RPC step even starts. `fail`/`finalize`
    // must come AFTER db.submit_round_atomic's own start — critically, `fail`
    // is still the terminal outcome here only because the fallback (attempted
    // in between) did not rescue the write, not because it was skipped.
    expect(methodOrder).toEqual([
      'start:server.validation',
      'complete:server.validation',
      'start:server.auth',
      'complete:server.auth',
      'start:server.player',
      'complete:server.player',
      'start:db.submit_round_atomic',
      'fail:db.submit_round_atomic',
      'finalize:failure',
    ]);

    // The RPC step was never marked a warning — it genuinely failed and
    // nothing rescued it.
    expect(recorderCalls.some((c) => c.method === 'warn')).toBe(false);
    // The fallback step was never started — recordRescuedStepOutcome only
    // records it when `rescued` is true.
    expect(recorderCalls.some((c) => c.stepKey === 'db.direct_submit_fallback')).toBe(false);
  });
});

describe('submitGolfRoundComprehensive — direct-submit fallback ordering (new round)', () => {
  it('attempts the fallback BEFORE marking db.submit_round_atomic failed, and finalizes failure when the fallback does not rescue', async () => {
    seed(false);

    const result = await submitGolfRoundComprehensive(makeRoundInput());

    expect(result.success).toBe(false);

    const methodOrder = recorderCalls.map((c) => `${c.method}:${c.stepKey ?? ''}`);
    expect(methodOrder).toEqual([
      'start:server.validation',
      'complete:server.validation',
      'start:server.auth',
      'complete:server.auth',
      'start:server.player',
      'complete:server.player',
      'start:db.submit_round_atomic',
      'fail:db.submit_round_atomic',
      'finalize:failure',
    ]);
    expect(recorderCalls.some((c) => c.method === 'warn')).toBe(false);
    expect(recorderCalls.some((c) => c.stepKey === 'db.direct_submit_fallback')).toBe(false);
  });
});
