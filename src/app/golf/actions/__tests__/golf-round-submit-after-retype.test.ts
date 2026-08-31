/**
 * A round whose TYPE changed while it was still being played must remain
 * submittable.
 *
 * Since 2026-08-31 a player can re-type their own live round from the scoring
 * screen (`/golf/dashboard/rounds/continue/[id]`). That makes "this client
 * loaded while the round was a qualifier round; it is a practice round now" an
 * ORDINARY sequence rather than a stale-client anomaly — the player made the
 * change themselves, seconds ago, in the same session.
 *
 * The submit path used to answer that with:
 *
 *     "This started round is not a qualifier round. Ask a coach to update its
 *      type before submitting."
 *
 * — telling the player to ask a coach about a change they had just made, on a
 * round they could then no longer submit. The scorecard was stranded.
 *
 * The protection it was written for is real and is kept: a client still cannot
 * RECLASSIFY a round by submitting it. What changed is that the stale value is
 * now DROPPED rather than used to refuse the write, which is what the rule at
 * the top of that block already said should happen — the persisted row is the
 * authority for its own identity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn(() => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
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
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

import { submitGolfRoundComprehensive } from '../golf';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '22222222-2222-4222-8222-222222222222';
const PLAYER_ID = '33333333-3333-4333-8333-333333333333';
const STALE_QUALIFIER = '44444444-4444-4444-8444-444444444444';

function makeHole(holeNumber: number) {
  return {
    holeNumber, par: 4, yardage: 380, score: 4, putts: 2,
    fairwayHit: true, greenInRegulation: true,
    drivingDistance: null, usedDriver: null, driveMissDirection: null,
    approachDistance: null, approachLie: null, approachProximity: null,
    approachMissDirection: null, scrambleAttempt: false, scrambleMade: false,
    sandSaveAttempt: false, sandSaveMade: false, penaltyStrokes: 0,
    firstPuttDistance: null, firstPuttLeave: null, firstPuttBreak: null,
    firstPuttSlope: null, firstPuttMissDirection: null,
    holedOutDistance: null, holedOutType: null,
    shots: [{
      shotNumber: 1, shotType: 'tee' as const, clubType: 'driver' as const,
      lieBefore: 'tee' as const, distanceToHoleBefore: 380,
      distanceUnitBefore: 'yards' as const, result: 'fairway' as const,
      distanceToHoleAfter: 150, distanceUnitAfter: 'yards' as const,
      shotDistance: 230, isPenalty: false,
    }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeSupabase({
    user: { id: 'u-player' },
    tables: {
      golf_players: [{ id: PLAYER_ID, user_id: 'u-player', first_name: 'Cole', last_name: 'Bennett' }],
      golf_team_members: [],
      // The round as it is NOW: re-typed to practice mid-play, linkage cleared.
      golf_rounds: [{
        id: ROUND_ID, player_id: PLAYER_ID, status: 'in_progress',
        round_type: 'practice', qualifier_id: null, qualifier_round_number: null,
      }],
      golf_holes: [],
      golf_shots: [],
      golf_qualifiers: [],
      golf_qualifier_entries: [],
    },
    rpc: {},
  });
});

describe('submitGolfRoundComprehensive — a round re-typed while it was live', () => {
  it('does not refuse the scorecard because the client still carries the old qualifier', async () => {
    const result = await submitGolfRoundComprehensive({
      courseName: 'Bryan Park Champs',
      courseId: COURSE_ID,
      roundType: 'qualifier',
      roundDate: new Date('2026-08-31').toISOString().slice(0, 10),
      holes: Array.from({ length: 9 }, (_, i) => makeHole(i + 1)),
      // Stale: this client loaded before the player re-typed the round.
      qualifierId: STALE_QUALIFIER,
      qualifierRoundNumber: 2,
      // `existingRoundId` is the SECOND POSITIONAL ARGUMENT, not a field on the
      // payload. Passing it inside the object silently skips the entire
      // resume-an-existing-round block, and the test then exercises nothing —
      // which is exactly how the first version of this file passed against the
      // bug it was written to catch.
    } as Parameters<typeof submitGolfRoundComprehensive>[0], ROUND_ID);

    // The exact refusal that stranded the round. Whatever else this fake does,
    // THIS must not be the answer.
    expect(result.success === false && result.error).not.toMatch(/not a qualifier round/i);
    expect(result.success === false && result.error).not.toMatch(/ask a coach/i);
  });
});
