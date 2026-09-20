/**
 * @vitest-environment node
 *
 * Flight recorder wiring for savePartialRound's save_partial_round_atomic
 * call site (Helm Bridge observability refit). Mirrors
 * golf-round-submit-flight-recorder.test.ts for the autosave RPC:
 *  1. `_helm_trace` is injected into `p_round_data` when tracing is active,
 *     and omitted in production without the HELM_FLIGHT_RECORDER_ENABLED
 *     opt-in.
 *  2. The recorder must NEVER fail or slow the save — a rejecting
 *     createHelmFlightRecorder still lets the autosave succeed.
 *  3. `helmTraceId` reaches the logServerError context on a real RPC
 *     failure, but NOT on the benign 'busy'/'conflict' carve-outs (those
 *     stay warn+finalize('warning'), matching the pre-existing "not an
 *     incident" contract for single-flight coalescing).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

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

let recorderShouldReject = false;
type RecorderCall = { method: string; stepKey?: string };
let recorderCalls: RecorderCall[];
const MOCK_TRACE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

vi.mock('@/lib/observability/helm-flight-recorder', () => ({
  createHelmFlightRecorder: vi.fn(async (input: { workflow: string; traceId?: string }) => {
    if (recorderShouldReject) {
      throw new Error('helm_debug store unavailable');
    }
    const traceId = input.traceId ?? MOCK_TRACE_ID;
    const record = (method: string) => (stepKey?: string) => {
      recorderCalls.push({ method, stepKey });
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

import { savePartialRound } from '../golf';

const COURSE_A = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = 'round-flight-recorder';

function baseTables() {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
    ],
    golf_rounds: [{
      id: ROUND_ID,
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      tee_id: '22222222-2222-4222-8222-222222222222',
      course_name: 'Same Course',
      round_date: '2026-08-25',
      status: 'in_progress',
      updated_at: '2026-08-25T10:00:00Z',
    }],
  };
}

function seed(rpcHandler: (args: unknown) => Promise<{ data: unknown; error: unknown }>) {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: baseTables(),
    rpc: { save_partial_round_atomic: rpcHandler },
  });
}

const partialData = {
  courseName: 'Same Course',
  courseId: COURSE_A,
  roundType: 'practice' as const,
  roundDate: '2026-08-25',
  currentHole: 2,
  holesToPlay: 18 as const,
  holes: [],
};

beforeEach(() => {
  recorderShouldReject = false;
  recorderCalls = [];
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.HELM_FLIGHT_RECORDER_ENABLED;
});

describe('savePartialRound — saved scoring identity', () => {
  it('preserves the saved tee when a no-id recovery reuses the existing draft', async () => {
    seed(async () => ({ data: null, error: null }));
    await fake.from('golf_rounds').update({ qualifier_id: null, qualifier_round_number: null }).eq('id', ROUND_ID);
    const result = await savePartialRound(partialData, undefined, { allowReuse: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roundId).toBe(ROUND_ID);
    const { data: saved, error } = await fake.from('golf_rounds').select('*').eq('id', ROUND_ID).single();
    expect(error).toBeNull();
    expect(saved).toMatchObject({ course_id: COURSE_A, tee_id: '22222222-2222-4222-8222-222222222222' });
  });
  it('does not reuse a different tee when the recovering setup supplies an exact tee ID', async () => {
    seed(async () => ({ data: null, error: null }));
    await fake.from('golf_rounds').update({ qualifier_id: null, qualifier_round_number: null }).eq('id', ROUND_ID);
    const result = await savePartialRound({ ...partialData, teeId: '33333333-3333-4333-8333-333333333333' }, undefined, { allowReuse: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roundId).not.toBe(ROUND_ID);
    const { data: original, error } = await fake.from('golf_rounds').select('*').eq('id', ROUND_ID).single();
    expect(error).toBeNull();
    expect(original?.tee_id).toBe('22222222-2222-4222-8222-222222222222');
  });
  it.each([undefined, '33333333-3333-4333-8333-333333333333'])('preserves the selected White tee when legacy or mismatched input supplies %s', async (teeId) => {
    let args: Record<string, unknown> | undefined;
    seed(async (input) => {
      args = input as Record<string, unknown>;
      return { data: { success: true, updated_at: '2026-08-25T10:00:01Z' }, error: null };
    });
    const holeConfigs = [{ holeNumber: 1, par: 4, yardage: 410 }];
    const result = await savePartialRound({ ...partialData, teeId, holeConfigs }, ROUND_ID);
    expect(result.success).toBe(true);
    expect(args?.p_round_data).toMatchObject({ course_id: COURSE_A, tee_id: '22222222-2222-4222-8222-222222222222',
      draft_data: { holes: [{ number: 1, par: 4, yardage: 410 }] } });
    expect(holeConfigs).toEqual([{ holeNumber: 1, par: 4, yardage: 410 }]);
  });
});

describe('savePartialRound — flight recorder trace payload', () => {
  it('injects _helm_trace into p_round_data when tracing is active (non-production)', async () => {
    delete process.env.VERCEL_ENV;
    let capturedArgs: Record<string, unknown> | undefined;
    seed(async (args) => {
      capturedArgs = args as Record<string, unknown>;
      return { data: { success: true, updated_at: '2026-08-25T10:00:01Z' }, error: null };
    });

    const result = await savePartialRound(partialData, ROUND_ID);

    expect(result.success).toBe(true);
    const roundData = capturedArgs?.p_round_data as Record<string, unknown>;
    expect(roundData._helm_trace).toEqual({ trace_id: MOCK_TRACE_ID, enabled: true });
  });

  it('omits _helm_trace in production with no HELM_FLIGHT_RECORDER_ENABLED opt-in', async () => {
    process.env.VERCEL_ENV = 'production';
    let capturedArgs: Record<string, unknown> | undefined;
    seed(async (args) => {
      capturedArgs = args as Record<string, unknown>;
      return { data: { success: true, updated_at: '2026-08-25T10:00:01Z' }, error: null };
    });

    const result = await savePartialRound(partialData, ROUND_ID);

    expect(result.success).toBe(true);
    const roundData = capturedArgs?.p_round_data as Record<string, unknown>;
    expect(roundData._helm_trace).toBeUndefined();
  });
});

describe('savePartialRound — flight recorder never fails or blocks the save', () => {
  it('still succeeds when createHelmFlightRecorder itself rejects', async () => {
    recorderShouldReject = true;
    seed(async () => ({ data: { success: true, updated_at: '2026-08-25T10:00:01Z' }, error: null }));

    const result = await savePartialRound(partialData, ROUND_ID);

    expect(result.success).toBe(true);
    expect(recorderCalls).toHaveLength(0);
  });
});

describe('savePartialRound — helmTraceId reaches the log context', () => {
  it('passes helmTraceId and traceStep to logServerError on a real RPC failure', async () => {
    seed(async () => ({ data: { success: false, error: 'db timeout' }, error: null }));

    const result = await savePartialRound(partialData, ROUND_ID);
    expect(result.success).toBe(false);

    const { logServerError } = await import('@/lib/server-error-logger');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (logServerError as any).mock.calls as Array<[string, Record<string, unknown>, string?]>;
    const failureCall = calls.find(([message]) => message.includes('Auto-save RPC returned failure'));
    expect(failureCall).toBeDefined();
    expect(failureCall?.[1]).toMatchObject({
      helmTraceId: MOCK_TRACE_ID,
      traceStep: 'db.save_partial_round_atomic',
    });
    expect(recorderCalls.some((c) => c.method === 'fail' && c.stepKey === 'db.save_partial_round_atomic')).toBe(true);
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'failure')).toBe(true);
  });

  it("treats 'busy' as a warning trace, not a failure — and logs nothing", async () => {
    seed(async () => ({ data: { success: false, error: 'busy' }, error: null }));

    const result = await savePartialRound(partialData, ROUND_ID);
    expect(result).toEqual({ success: false, error: 'busy' });

    const { logServerError, logServerException, logServerEvent } = await import('@/lib/server-error-logger');
    expect(logServerError).not.toHaveBeenCalled();
    expect(logServerException).not.toHaveBeenCalled();
    expect(logServerEvent).not.toHaveBeenCalled();

    expect(recorderCalls.some((c) => c.method === 'warn' && c.stepKey === 'db.save_partial_round_atomic')).toBe(true);
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'warning')).toBe(true);
    expect(recorderCalls.some((c) => c.method === 'fail')).toBe(false);
  });
});
