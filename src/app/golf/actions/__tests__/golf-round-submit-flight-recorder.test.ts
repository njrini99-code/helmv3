/**
 * Flight recorder wiring for submitGolfRoundComprehensive's
 * submit_round_atomic call site (Helm Bridge observability refit).
 *
 * Three properties, each with a dedicated test:
 *  1. The `_helm_trace` payload (the exact key shape
 *     helm_private.configure_trace_context expects — supabase/migrations/
 *     20260825200811_helm_flight_recorder.sql) is injected into
 *     `p_round_data` when tracing is active, and OMITTED when it is not
 *     (VERCEL_ENV=production with no HELM_FLIGHT_RECORDER_ENABLED opt-in) —
 *     mirroring createHelmFlightRecorder's own production gate rather than
 *     firing Postgres-side RAISE LOG lines the JS side never turned on.
 *  2. The recorder must NEVER fail or slow the save: a rejecting
 *     createHelmFlightRecorder still lets the round submit succeed.
 *  3. `helmTraceId` (and `traceStep`) land in the logServerError context on
 *     an RPC-returned failure, so admin_events rows join to the trace.
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

let recorderShouldReject = false;
type RecorderCall = { method: string; stepKey?: string; input?: unknown };
let recorderCalls: RecorderCall[];
const MOCK_TRACE_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

vi.mock('@/lib/observability/helm-flight-recorder', () => ({
  createHelmFlightRecorder: vi.fn(async (input: { workflow: string; traceId?: string }) => {
    if (recorderShouldReject) {
      throw new Error('helm_debug store unavailable');
    }
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
}));

import { submitGolfRoundComprehensive } from '../golf';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '8e89c73e-5047-4658-85b4-380250dc6245';

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

function seed(rpcHandler: (args: unknown) => Promise<{ data: unknown; error: unknown }>) {
  tables = {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [],
    golf_rounds: [{
      id: ROUND_ID,
      player_id: 'player-1',
      status: 'in_progress',
      draft_data: null,
    }],
    golf_holes: [],
    golf_shots: [],
  };
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables,
    rpc: { submit_round_atomic: rpcHandler },
  });
}

beforeEach(() => {
  recorderShouldReject = false;
  recorderCalls = [];
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.HELM_FLIGHT_RECORDER_ENABLED;
});

describe('submitGolfRoundComprehensive — flight recorder trace payload', () => {
  it('injects _helm_trace into p_round_data when tracing is active (non-production)', async () => {
    delete process.env.VERCEL_ENV;
    delete process.env.HELM_FLIGHT_RECORDER_ENABLED;

    let capturedArgs: Record<string, unknown> | undefined;
    seed(async (args) => {
      capturedArgs = args as Record<string, unknown>;
      return { data: { success: true, round_id: ROUND_ID, warnings: [] }, error: null };
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(true);
    const roundData = capturedArgs?.p_round_data as Record<string, unknown>;
    expect(roundData._helm_trace).toEqual({ trace_id: MOCK_TRACE_ID, enabled: true });
  });

  it('omits _helm_trace in production with no HELM_FLIGHT_RECORDER_ENABLED opt-in', async () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.HELM_FLIGHT_RECORDER_ENABLED;

    let capturedArgs: Record<string, unknown> | undefined;
    seed(async (args) => {
      capturedArgs = args as Record<string, unknown>;
      return { data: { success: true, round_id: ROUND_ID, warnings: [] }, error: null };
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(true);
    const roundData = capturedArgs?.p_round_data as Record<string, unknown>;
    expect(roundData._helm_trace).toBeUndefined();
  });

  it('still injects _helm_trace in production when HELM_FLIGHT_RECORDER_ENABLED=true', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.HELM_FLIGHT_RECORDER_ENABLED = 'true';

    let capturedArgs: Record<string, unknown> | undefined;
    seed(async (args) => {
      capturedArgs = args as Record<string, unknown>;
      return { data: { success: true, round_id: ROUND_ID, warnings: [] }, error: null };
    });

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(true);
    const roundData = capturedArgs?.p_round_data as Record<string, unknown>;
    expect(roundData._helm_trace).toEqual({ trace_id: MOCK_TRACE_ID, enabled: true });
  });
});

describe('submitGolfRoundComprehensive — flight recorder never fails or blocks the save', () => {
  it('still succeeds when createHelmFlightRecorder itself rejects', async () => {
    recorderShouldReject = true;
    seed(async () => ({ data: { success: true, round_id: ROUND_ID, warnings: [] }, error: null }));

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result.success).toBe(true);
    // No recorder calls could have been recorded — construction itself
    // threw before any step/finalize call existed to record one.
    expect(recorderCalls).toHaveLength(0);
  });

  it('still returns the real failure when the RPC fails, even though the recorder ran', async () => {
    seed(async () => ({ data: { success: false, error: 'Round submission requires at least one hole.' }, error: null }));

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(result).toEqual({ success: false, error: 'Round submission requires at least one hole.' });
    // The step was marked failed and the trace finalized as a failure —
    // recorder activity never altered the business outcome above.
    expect(recorderCalls.some((c) => c.method === 'fail' && c.stepKey === 'db.submit_round_atomic')).toBe(true);
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'failure')).toBe(true);
  });
});

describe('submitGolfRoundComprehensive — helmTraceId reaches the log context', () => {
  it('passes helmTraceId and traceStep to logServerError on an RPC-returned failure', async () => {
    seed(async () => ({ data: { success: false, error: 'Score mismatch: round 4 vs holes 5.' }, error: null }));

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(result.success).toBe(false);

    const { logServerError } = await import('@/lib/server-error-logger');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (logServerError as any).mock.calls as Array<[string, Record<string, unknown>, string?]>;
    const failureCall = calls.find(([message]) => message.includes('Round submit RPC returned failure'));
    expect(failureCall).toBeDefined();
    expect(failureCall?.[1]).toMatchObject({
      helmTraceId: MOCK_TRACE_ID,
      traceStep: 'db.submit_round_atomic',
    });
  });
});
