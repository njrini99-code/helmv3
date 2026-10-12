/**
 * Q-120 (swap audit C-6): the held migration
 * supabase/migrations/20261001000000_submit_round_expected_updated_at.sql makes
 * submit_round_atomic answer {success:false, error:'conflict'} when the round
 * row is newer than `p_round_data->>'expected_updated_at'`, and skips the check
 * when the key is missing.
 *
 * THE INVARIANT under test: the action sends `expected_updated_at` ONLY on the
 * existing-round RPC call. The new-round path never carries it, because
 * `writeRoundRecreatingIfMissing` re-sends the same input with no id after a
 * `round_missing`, and a freshly created row has nothing to compare against.
 * A token that is not a parseable timestamp is dropped (the SQL casts it with
 * `::timestamptz`, which would otherwise raise a transport error).
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

import { submitGolfRoundComprehensive } from '../round-submit';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = 'a1b2c3d4-5047-4658-85b4-380250dc6245';
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


const TOKEN = '2026-09-30T12:00:00.123456+00:00';
const ok = { data: { success: true, warnings: [] }, error: null };

function existingRoundTables() {
  tables = {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [],
    golf_rounds: [{ id: ROUND_ID, player_id: 'player-1', status: 'in_progress', draft_data: null, total_score: HOLE_COUNT * 4 }],
    golf_holes: [],
    golf_shots: [],
  };
}

function sentRoundData(rpc: ReturnType<typeof vi.fn>): Record<string, unknown> {
  expect(rpc).toHaveBeenCalledTimes(1);
  return (rpc.mock.calls[0]![0] as { p_round_data: Record<string, unknown> }).p_round_data;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetEmitThrottleForTests();
});

describe('submitGolfRoundComprehensive — expected_updated_at (Q-120)', () => {
  it('sends the token on the existing-round RPC call', async () => {
    existingRoundTables();
    const rpc = vi.fn(async () => ok);
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables, rpc: { submit_round_atomic: rpc } });

    const result = await submitGolfRoundComprehensive({ ...makeRoundInput(), expectedUpdatedAt: TOKEN }, ROUND_ID);

    expect(result.success).toBe(true);
    expect(sentRoundData(rpc).expected_updated_at).toBe(TOKEN);
  });

  it('omits the key on the existing-round call when the client has no token (the RPC then skips the check)', async () => {
    existingRoundTables();
    const rpc = vi.fn(async () => ok);
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables, rpc: { submit_round_atomic: rpc } });

    await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    expect(sentRoundData(rpc)).not.toHaveProperty('expected_updated_at');
  });

  it('drops a token that is not a timestamp instead of letting the cast fail the submit', async () => {
    existingRoundTables();
    const rpc = vi.fn(async () => ok);
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables, rpc: { submit_round_atomic: rpc } });

    await submitGolfRoundComprehensive({ ...makeRoundInput(), expectedUpdatedAt: 'not-a-time' }, ROUND_ID);

    expect(sentRoundData(rpc)).not.toHaveProperty('expected_updated_at');
  });

  it('never sends the token on the new-round path, even when the caller passed one', async () => {
    tables = { golf_players: [{ id: 'player-1', user_id: 'u-p1' }], golf_team_members: [], golf_rounds: [], golf_holes: [], golf_shots: [] };
    const rpc = vi.fn(async () => ok);
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables, rpc: { submit_round_atomic: rpc } });

    // No existingRoundId: the shape writeRoundRecreatingIfMissing re-sends after round_missing.
    await submitGolfRoundComprehensive({ ...makeRoundInput(), expectedUpdatedAt: TOKEN });

    expect(sentRoundData(rpc)).not.toHaveProperty('expected_updated_at');
  });
});
