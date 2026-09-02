/**
 * @vitest-environment node
 *
 * A3 — a hole whose payload fails Zod (distance/score/putts out of range,
 * etc.) used to be silently salvaged to `null` whenever it was not already
 * durable on the server, and the save reported success. The player believed
 * the hole saved, kept playing, and submit later failed on a hole the server
 * never actually received — with a raw Zod path string as the error.
 *
 * Pinned here:
 * - savePartialRound returns a structured `hole_invalid` result (hole/field/
 *   message) and performs NO write, for a brand-new round with no candidate
 *   to reuse at all (the simplest "nothing durable anywhere" case).
 * - submitGolfRoundComprehensive's own Zod-failure message is a human
 *   sentence, not "Invalid round data: holes.N.shots.0...", and carries
 *   `code: 'hole_invalid'` so a client can branch on the signal rather than
 *   pattern-matching prose.
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

import { savePartialRound, submitGolfRoundComprehensive } from '../golf';

const COURSE = '11111111-1111-4111-8111-111111111111';

function goodHole(n: number): HoleStats {
  return {
    holeNumber: n, par: 4, yardage: 400, score: 4, putts: 2,
    fairwayHit: true, greenInRegulation: true, drivingDistance: null, usedDriver: true,
    driveMissDirection: null, approachDistance: 150, approachLie: 'fairway',
    approachProximity: 10, approachMissDirection: null, scrambleAttempt: false,
    scrambleMade: false, sandSaveAttempt: false, sandSaveMade: false, penaltyStrokes: 0,
    firstPuttDistance: null, firstPuttLeave: null, firstPuttBreak: null, firstPuttSlope: null,
    firstPuttMissDirection: null, holedOutDistance: null, holedOutType: null, shots: [],
  };
}

function baseTables() {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
    golf_rounds: [] as Array<Record<string, unknown>>,
    golf_holes: [] as Array<Record<string, unknown>>,
    golf_shots: [] as Array<Record<string, unknown>>,
  };
}

function seed() {
  fake = createFakeSupabase({ user: { id: 'u-p1' }, tables: baseTables() });
  adminFake = fake;
}

beforeEach(() => vi.clearAllMocks());

describe('savePartialRound — hole_invalid on a non-durable, brand-new round', () => {
  it('returns a structured hole_invalid result and writes nothing at all', async () => {
    seed();

    // Hole 5's own score fails partialHoleSchema outright — there is no
    // existing round and no candidate to reuse, so it can never be durable.
    const badHole = { ...goodHole(5), putts: 99 } as unknown as HoleStats;

    const result = await savePartialRound({
      courseName: 'Winchester CC',
      courseId: COURSE,
      roundType: 'practice',
      roundDate: '2026-09-02',
      currentHole: 5,
      holesToPlay: 18,
      holes: [goodHole(1), goodHole(2), goodHole(3), goodHole(4), badHole],
      holeConfigs: [1, 2, 3, 4, 5].map((n) => ({ holeNumber: n, par: 4, yardage: 400 })),
    }, undefined);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('hole_invalid');
      expect((result as { code?: string }).code).toBe('hole_invalid');
      expect((result as { hole?: number }).hole).toBe(5);
      expect((result as { field?: string }).field).toBe('putts');
      expect((result as { message?: string }).message).toMatch(/hole 5/i);
    }
    // No round, no holes — nothing was written for this snapshot at all.
    const rounds = await fake.from('golf_rounds').select('*');
    expect(rounds.data).toHaveLength(0);
  });

  it('produces "Hole N, shot M" phrasing and a yards unit for an out-of-range shot distance', async () => {
    seed();

    const badShot: ShotRecord = {
      shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
      distanceToHoleBefore: 1500, distanceUnitBefore: 'yards', result: 'fairway',
      distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250, isPenalty: false,
    };
    const holeWithBadShot = { ...goodHole(4), shots: [badShot] };

    const result = await savePartialRound({
      courseName: 'Winchester CC',
      courseId: COURSE,
      roundType: 'practice',
      roundDate: '2026-09-02',
      currentHole: 4,
      holesToPlay: 18,
      holes: [goodHole(1), goodHole(2), goodHole(3), holeWithBadShot],
      holeConfigs: [1, 2, 3, 4].map((n) => ({ holeNumber: n, par: 4, yardage: 400 })),
    }, undefined);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('hole_invalid');
      expect((result as { hole?: number }).hole).toBe(4);
      expect((result as { message?: string }).message).toMatch(/hole 4, shot 1/i);
      expect((result as { message?: string }).message).toMatch(/1000 yards or less/i);
    }
  });
});

describe('submitGolfRoundComprehensive — humanized validation message (A3)', () => {
  function fullValidHoles(overrideIndex: number, overrideHole: Partial<HoleStats>): HoleStats[] {
    return Array.from({ length: 9 }, (_, i) => {
      const n = i + 1;
      const hole = {
        ...goodHole(n),
        shots: [{
          shotNumber: 1, shotType: 'tee' as const, clubType: 'driver' as const, lieBefore: 'tee' as const,
          distanceToHoleBefore: 400, distanceUnitBefore: 'yards' as const, result: 'green' as const,
          distanceToHoleAfter: 0, distanceUnitAfter: 'yards' as const, shotDistance: 400, isPenalty: false,
        }],
      };
      return n - 1 === overrideIndex ? { ...hole, ...overrideHole } : hole;
    });
  }

  it('replaces the raw "Invalid round data: holes.N..." text with a human sentence and code hole_invalid', async () => {
    seed();

    const badShot: ShotRecord = {
      shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
      distanceToHoleBefore: 1500, distanceUnitBefore: 'yards', result: 'green',
      distanceToHoleAfter: 0, distanceUnitAfter: 'yards', shotDistance: 1500, isPenalty: false,
    };
    const holes = fullValidHoles(3, { shots: [badShot] });

    const result = await submitGolfRoundComprehensive({
      courseName: 'Winchester CC',
      courseId: COURSE,
      roundType: 'practice',
      roundDate: '2026-09-02',
      holes,
    }, undefined);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toMatch(/^Invalid round data:/);
      expect(result.error).not.toMatch(/holes\.\d+\.shots\.\d+/);
      expect(result.error).toMatch(/hole 4, shot 1/i);
      expect(result.error).toMatch(/1000 yards or less/i);
      expect((result as { code?: string }).code).toBe('hole_invalid');
    }
  });
});
