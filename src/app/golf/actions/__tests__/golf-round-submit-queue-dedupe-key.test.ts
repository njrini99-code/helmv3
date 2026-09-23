/**
 * N12 (2026-09-12 CoachHelm repair plan): `enqueueJob('coachhelm_analysis',
 * ..., { dedupeKey: \`round:${roundId}:analysis\` })` deduped purely on
 * round id inside `helm_jobs_enqueue`'s rolling 24h window. A corrected
 * round resubmitted within that window would collide with the original
 * job's dedupe row and never re-enqueue, even though its shot/hole content
 * changed.
 *
 * The producer (src/app/golf/actions/golf.ts, inside
 * `submitGolfRoundComprehensiveImpl`'s `isHelmQueueEnabled()` branch) now
 * folds a short content hash of the submitted holes/shots/putt-details/
 * approach-details payload into the key. This test proves the key is
 * content-sensitive (changes when a shot's recorded outcome OR a hole's own
 * fields, e.g. score, change) and content-stable (identical payloads
 * produce the identical key, so a verbatim duplicate submit still dedupes).
 *
 * Verified live path: `submitGolfRoundComprehensiveImpl` refuses to
 * resubmit a round whose row is already `status === 'completed'`, so
 * editing an already-completed round never reaches this call site. What IS
 * live and reachable here: the continue/new/recover-round client flows all
 * call this action with the same `existingRoundId` while the row is still
 * `in_progress` (e.g. a failed attempt, or the player fixing a hole before
 * a retry succeeds) — see golf.ts's N12 comment at the enqueueJob call
 * site for the exact reasoning.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let afterPromises: Promise<unknown>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

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

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn(async () => ({ ids: ['fake-event-id'] })) },
  isInngestConfigured: vi.fn(() => false),
}));

const enqueueJobMock = vi.fn(
  async (
    _queue: string,
    _payload: Record<string, unknown>,
    _options?: { dedupeKey?: string },
  ) => ({ queued: true, msgId: 1 }) as const,
);
vi.mock('@/lib/jobs/enqueue', () => ({
  enqueueJob: (...args: Parameters<typeof enqueueJobMock>) => enqueueJobMock(...args),
  isHelmQueueEnabled: () => true,
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

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '22222222-2222-4222-8222-222222222222';

function makeShot(shotNumber: number, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function makeHole(
  holeNumber: number,
  shotOverrides: Record<string, unknown> = {},
  holeOverrides: Record<string, unknown> = {},
) {
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
    shots: [makeShot(1, shotOverrides)],
    ...holeOverrides,
  };
}

function makeRoundInput(
  shotOverrides: Record<string, unknown> = {},
  holeOverrides: Record<string, unknown> = {},
) {
  return {
    courseName: 'Test Course',
    courseId: COURSE_ID,
    roundType: 'practice' as const,
    roundDate: new Date().toISOString().slice(0, 10),
    holes: Array.from({ length: 9 }, (_, i) =>
      makeHole(i + 1, i === 0 ? shotOverrides : {}, i === 0 ? holeOverrides : {}),
    ),
  };
}

function seed() {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [
        // Seeded 'in_progress' so resubmission stays reachable across both
        // calls in the same test, mirroring
        // golf-round-submit-inngest-routing.test.ts's dedup test.
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

function dedupeKeyFromCall(callIndex: number): string {
  const call = enqueueJobMock.mock.calls[callIndex] as
    | [string, Record<string, unknown>, { dedupeKey?: string }]
    | undefined;
  const dedupeKey = call?.[2]?.dedupeKey;
  expect(dedupeKey).toBeDefined();
  return dedupeKey as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  afterPromises = [];
  seed();
});

describe('submitGolfRoundComprehensive — queue dedupe key content-sensitivity (N12)', () => {
  it('produces the identical dedupe key for two verbatim-identical submissions', async () => {
    const first = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(first.success).toBe(true);
    await Promise.all(afterPromises);

    afterPromises = [];
    const second = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(second.success).toBe(true);
    await Promise.all(afterPromises);

    expect(enqueueJobMock).toHaveBeenCalledTimes(2);
    expect(dedupeKeyFromCall(0)).toBe(dedupeKeyFromCall(1));
    // Still keyed to the round, not just content — same round id embedded.
    expect(dedupeKeyFromCall(0)).toContain(ROUND_ID);
  });

  it('produces a DIFFERENT dedupe key when a shot in the resubmitted round changes (revert-check: a bare round-id key would be identical here)', async () => {
    const first = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(first.success).toBe(true);
    await Promise.all(afterPromises);

    afterPromises = [];
    // A coach corrects a miskeyed shot result on resubmission.
    const second = await submitGolfRoundComprehensive(
      makeRoundInput({ result: 'rough' }),
      ROUND_ID,
    );
    expect(second.success).toBe(true);
    await Promise.all(afterPromises);

    expect(enqueueJobMock).toHaveBeenCalledTimes(2);
    expect(dedupeKeyFromCall(0)).not.toBe(dedupeKeyFromCall(1));
  });

  it('produces a DIFFERENT dedupe key when only a hole-level field (score) changes, not a shot field', async () => {
    const first = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);
    expect(first.success).toBe(true);
    await Promise.all(afterPromises);

    afterPromises = [];
    // A coach fixes a miskeyed hole score — no shot-level field changes at
    // all, so a hash over shotsPayload alone would miss this.
    const second = await submitGolfRoundComprehensive(
      makeRoundInput({}, { score: 4 }),
      ROUND_ID,
    );
    expect(second.success).toBe(true);
    await Promise.all(afterPromises);

    expect(enqueueJobMock).toHaveBeenCalledTimes(2);
    expect(dedupeKeyFromCall(0)).not.toBe(dedupeKeyFromCall(1));
  });
});
