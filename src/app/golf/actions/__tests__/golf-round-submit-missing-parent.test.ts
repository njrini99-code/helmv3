/**
 * @vitest-environment node
 *
 * Swap audit R-5: a submit whose in-progress row is gone (discarded on another
 * device, or a create that never landed) got "Round not found or you do not
 * have permission to update it." from the preflight. No client recovers from
 * that sentence — `writeRoundRecreatingIfMissing` re-creates only on the bare
 * `round_missing` key — so the submit overlay dead-ended with a Try again that
 * could never work. The preflight now answers `round_missing` when the row
 * provably does not exist for anyone, and keeps the refusal when it exists
 * under another player (a scorecard queued on a shared device must never be
 * re-created under the wrong account).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';

let fake: FakeSupabase;
let adminFake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminFake) }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({ invalidateOnRoundComplete: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

import { submitGolfRoundComprehensive } from '../golf';
import { isRecoverableRoundSubmitError } from '@/lib/utils/emergency-save';

const COURSE = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '22222222-2222-4222-8222-222222222222';

function seed(rounds: Array<Record<string, unknown>>) {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: [
        { id: 'player-1', user_id: 'u-p1' },
        { id: 'player-2', user_id: 'u-p2' },
      ],
      golf_team_members: [],
      golf_rounds: rounds,
      golf_holes: [],
      golf_shots: [],
    },
  });
  adminFake = fake;
}

function putt(n: number, from: number, result: ShotRecord['result'], after: number): ShotRecord {
  return {
    shotNumber: n, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
    distanceToHoleBefore: from, distanceUnitBefore: 'feet', result,
    distanceToHoleAfter: after, distanceUnitAfter: 'feet', shotDistance: 0, isPenalty: false, puttDistanceFeet: from,
  };
}

function parThree(n: number): HoleStats {
  return {
    holeNumber: n, par: 3, yardage: 180, score: 3, putts: 2,
    fairwayHit: null, greenInRegulation: true, drivingDistance: null, usedDriver: null,
    driveMissDirection: null, approachDistance: null, approachLie: null,
    approachProximity: null, approachMissDirection: null, scrambleAttempt: false,
    scrambleMade: false, sandSaveAttempt: false, sandSaveMade: false, penaltyStrokes: 0,
    firstPuttDistance: null, firstPuttLeave: null, firstPuttBreak: null, firstPuttSlope: null,
    firstPuttMissDirection: null, holedOutDistance: null, holedOutType: null,
    shots: [
      {
        shotNumber: 1, shotType: 'approach', clubType: 'non_driver', lieBefore: 'tee',
        distanceToHoleBefore: 180, distanceUnitBefore: 'yards', result: 'green',
        distanceToHoleAfter: 30, distanceUnitAfter: 'feet', shotDistance: 170, isPenalty: false,
      },
      putt(2, 30, 'green', 3),
      putt(3, 3, 'hole', 0),
    ],
  };
}

function submit() {
  return submitGolfRoundComprehensive({
    courseName: 'Winchester CC',
    courseId: COURSE,
    roundType: 'practice',
    roundDate: '2026-09-17',
    holes: Array.from({ length: 9 }, (_, i) => parThree(i + 1)),
  }, ROUND_ID);
}

beforeEach(() => vi.clearAllMocks());

describe('submit preflight against a round whose row is gone (R-5)', () => {
  it('answers round_missing, the key the client re-creates from, when no row exists for anyone', async () => {
    seed([]);
    const result = await submit();
    expect(result).toEqual({ success: false, error: 'round_missing' });
  });

  it('keeps the refusal when the row exists under another player', async () => {
    seed([{ id: ROUND_ID, player_id: 'player-2', status: 'in_progress', round_type: 'practice', holes_played: 9 }]);
    const result = await submit();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toBe('round_missing');
      expect(result.error).toMatch(/not found or you do not have permission/i);
      // Not a recoverable submit: the recovery flow must not try to re-create it.
      expect(isRecoverableRoundSubmitError(result.error)).toBe(false);
    }
  });
});
