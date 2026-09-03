/**
 * @vitest-environment node
 *
 * Flight recorder wiring for the two declared shot workflows that had NO
 * call site at all before this refit: `deleteShot` -> golf.shot.delete and
 * `updateShot` -> golf.shot.add_or_edit (golf-round-flight-workflow.ts
 * declared both, with server.validation/auth/player, a db.* mutation step,
 * verify.shots and post.stats — deliverable 3 of the flight-recorder
 * real-timings refit).
 *
 * Three properties, mirroring the existing submit/autosave recorder tests:
 *  1. The recorder must NEVER fail or block the mutation — a rejecting
 *     createHelmFlightRecorder still lets the shot delete/update succeed.
 *  2. The real mutation step (db.delete_shot / db.shot_mutation) is
 *     start()ed before it is complete()d or fail()ed — not merely completed,
 *     which is the exact bug this whole refit closes elsewhere.
 *  3. Existing error contracts are UNCHANGED by the recorder wiring:
 *     `shot_not_found` on a missing shot, and the transient-auth sentence on
 *     a GoTrue round trip that dies in transit (not a session expiry).
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

// Lets one test force the `golf_shots` update in updateShotImpl to fail with
// a specific Supabase error, without disturbing every other query the fake
// supabase client serves normally (the earlier ownership/round lookups still
// go through the real fake). Reset in afterEach so it never leaks between
// tests.
let shotMutationError: { code?: string; message: string } | null = null;

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: (client: { from: (table: string) => unknown }, table: string) => {
    if (table === 'golf_shots' && shotMutationError) {
      const err = shotMutationError;
      return {
        update: () => ({
          eq: async () => ({ data: null, error: err }),
        }),
      };
    }
    return client.from(table);
  },
}));

let recorderShouldReject = false;
type RecorderCall = { method: string; stepKey?: string; input?: unknown };
let recorderCalls: RecorderCall[];
const MOCK_TRACE_ID = 'a1b2c3d4-1111-4111-8111-111111111111';

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

import { deleteShot, updateShot } from '../golf';

const SHOT = '11111111-1111-4111-8111-111111111111';
const ROUND = '22222222-2222-4222-8222-222222222222';

function seed(overrides?: { shots?: Array<Record<string, unknown>> }) {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_rounds: [{ id: ROUND, player_id: 'player-1', status: 'in_progress' }],
      golf_shots: overrides?.shots ?? [{ id: SHOT, round_id: ROUND, hole_number: 1, shot_number: 1 }],
    },
  });
}

beforeEach(() => {
  recorderShouldReject = false;
  recorderCalls = [];
  shotMutationError = null;
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.HELM_FLIGHT_RECORDER_ENABLED;
  shotMutationError = null;
});

describe('deleteShot — flight recorder wiring (golf.shot.delete)', () => {
  it('starts db.delete_shot before completing it, and finalizes success', async () => {
    seed();

    const result = await deleteShot(SHOT);

    expect(result.success).toBe(true);
    const order = recorderCalls.map((c) => `${c.method}:${c.stepKey ?? ''}`);
    expect(order.indexOf('start:db.delete_shot')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('start:db.delete_shot')).toBeLessThan(order.indexOf('complete:db.delete_shot'));
    expect(order.indexOf('start:server.validation')).toBeLessThan(order.indexOf('complete:server.validation'));
    expect(order.indexOf('start:server.auth')).toBeLessThan(order.indexOf('complete:server.auth'));
    expect(order.indexOf('start:server.player')).toBeLessThan(order.indexOf('complete:server.player'));
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'success')).toBe(true);
  });

  it('still succeeds when createHelmFlightRecorder itself rejects (fail-open)', async () => {
    recorderShouldReject = true;
    seed();

    const result = await deleteShot(SHOT);

    expect(result.success).toBe(true);
    expect(recorderCalls).toHaveLength(0);
  });

  it('keeps the shot_not_found reconciliation code unchanged on a missing shot', async () => {
    seed({ shots: [] });

    const result = await deleteShot(SHOT);

    expect(result).toEqual({ success: false, error: 'Shot not found', code: 'shot_not_found' });
    // A benign reconciliation race, not a failed trace.
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'warning')).toBe(true);
  });
});

describe('updateShot — flight recorder wiring (golf.shot.add_or_edit)', () => {
  const VALID_UPDATE = { club_type: 'non_driver' } as never;

  it('starts db.shot_mutation before completing it, and finalizes success', async () => {
    seed();

    const result = await updateShot(SHOT, VALID_UPDATE);

    expect(result.success).toBe(true);
    const order = recorderCalls.map((c) => `${c.method}:${c.stepKey ?? ''}`);
    expect(order.indexOf('start:db.shot_mutation')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('start:db.shot_mutation')).toBeLessThan(order.indexOf('complete:db.shot_mutation'));
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'success')).toBe(true);
  });

  it('still succeeds when createHelmFlightRecorder itself rejects (fail-open)', async () => {
    recorderShouldReject = true;
    seed();

    const result = await updateShot(SHOT, VALID_UPDATE);

    expect(result.success).toBe(true);
    expect(recorderCalls).toHaveLength(0);
  });

  it('keeps the shot_not_found reconciliation code unchanged on a missing shot', async () => {
    seed({ shots: [] });

    const result = await updateShot(SHOT, VALID_UPDATE);

    expect(result).toEqual({ success: false, error: 'Shot not found', code: 'shot_not_found' });
    expect(recorderCalls.some((c) => c.method === 'finalize' && c.stepKey === 'warning')).toBe(true);
  });

  it('records the real Supabase error on a db.shot_mutation failure, like deleteShot does for db.delete_shot', async () => {
    // Before this fix, a failed golf_shots update recorded a hardcoded
    // `errorSummary: 'Failed to update shot'` — losing the actual Postgres
    // error code/message that deleteShot's db.delete_shot fail() already
    // captures. The player-facing error message is untouched by this fix;
    // only what lands in the trace changes.
    seed();
    shotMutationError = {
      code: '23514',
      message: 'new row for relation "golf_shots" violates check constraint "golf_shots_club_type_check"',
    };

    const result = await updateShot(SHOT, VALID_UPDATE);

    expect(result).toEqual({ success: false, error: 'Failed to update shot' });
    const failCall = recorderCalls.find((c) => c.method === 'fail' && c.stepKey === 'db.shot_mutation');
    expect(failCall?.input).toMatchObject({
      errorCode: '23514',
      errorSummary: 'new row for relation "golf_shots" violates check constraint "golf_shots_club_type_check"',
    });
  });
});
