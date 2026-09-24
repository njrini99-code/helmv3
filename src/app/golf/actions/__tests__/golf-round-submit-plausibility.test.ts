/**
 * @vitest-environment node
 *
 * submitGolfRoundComprehensive refuses a physically impossible round with a
 * clear code (shared rules: src/lib/golf/round-entry-validation.ts) BEFORE any
 * write, and still accepts an ordinary one. Pinned against the 2026-09-17
 * round: 18 holes, 37 strokes, drives onto every green, 20 ft putts holed.
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
import { logServerError } from '@/lib/server-error-logger';

const COURSE = '11111111-1111-4111-8111-111111111111';

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

const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const yardageFor = (par: number) => (par === 3 ? 180 : par === 4 ? 420 : 540);

function teeShot(par: number, result: ShotRecord['result'], after: number, unit: 'yards' | 'feet'): ShotRecord {
  return {
    shotNumber: 1, shotType: 'tee', clubType: par === 3 ? 'non_driver' : 'driver', lieBefore: 'tee',
    distanceToHoleBefore: yardageFor(par), distanceUnitBefore: 'yards', result,
    distanceToHoleAfter: after, distanceUnitAfter: unit, shotDistance: yardageFor(par) - after, isPenalty: false,
  };
}
function putt(n: number, from: number, result: ShotRecord['result'], after: number): ShotRecord {
  return {
    shotNumber: n, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
    distanceToHoleBefore: from, distanceUnitBefore: 'feet', result,
    distanceToHoleAfter: after, distanceUnitAfter: 'feet', shotDistance: 0, isPenalty: false, puttDistanceFeet: from,
  };
}
function hole(n: number, par: number, overrides: Partial<HoleStats>): HoleStats {
  return {
    holeNumber: n, par, yardage: yardageFor(par), score: par, putts: 2,
    fairwayHit: null, greenInRegulation: true, drivingDistance: null, usedDriver: null,
    driveMissDirection: null, approachDistance: null, approachLie: null,
    approachProximity: null, approachMissDirection: null, scrambleAttempt: false,
    scrambleMade: false, sandSaveAttempt: false, sandSaveMade: false, penaltyStrokes: 0,
    firstPuttDistance: null, firstPuttLeave: null, firstPuttBreak: null, firstPuttSlope: null,
    firstPuttMissDirection: null, holedOutDistance: null, holedOutType: null, shots: [],
    ...overrides,
  };
}

/** Ordinary par golf: tee → fairway/green, approach → green, two putts. */
function ordinaryHole(n: number, par: number): HoleStats {
  const shots: ShotRecord[] = par === 3
    ? [teeShot(par, 'green', 30, 'feet'), putt(2, 30, 'green', 3), putt(3, 3, 'hole', 0)]
    : [
      teeShot(par, 'fairway', par === 4 ? 150 : 250, 'yards'),
      ...(par === 5
        ? [{ ...teeShot(par, 'fairway', 100, 'yards'), shotNumber: 2, shotType: 'approach' as const, clubType: 'non_driver' as const, lieBefore: 'fairway' as const, distanceToHoleBefore: 250 }]
        : []),
      { ...teeShot(par, 'green', 30, 'feet'), shotNumber: par - 2, shotType: 'approach' as const, clubType: 'non_driver' as const, lieBefore: 'fairway' as const, distanceToHoleBefore: par === 4 ? 150 : 100 },
      putt(par - 1, 30, 'green', 3),
      putt(par, 3, 'hole', 0),
    ];
  return hole(n, par, { score: par, putts: 2, shots });
}

async function submit(holes: HoleStats[]) {
  return submitGolfRoundComprehensive({
    courseName: 'Winchester CC',
    courseId: COURSE,
    roundType: 'practice',
    roundDate: '2026-09-17',
    holes,
  }, undefined);
}

describe('submitGolfRoundComprehensive — round-entry plausibility gate', () => {
  it('rejects the 2026-09-17 shape (37 strokes over 18) and writes nothing', async () => {
    seed();
    const holes = PARS.map((par, i) => {
      if (i === 0) {
        return hole(1, par, { score: 3, putts: 2, shots: [teeShot(par, 'green', 20, 'feet'), putt(2, 20, 'green', 2), putt(3, 2, 'hole', 0)] });
      }
      return hole(i + 1, par, { score: 2, putts: 1, shots: [teeShot(par, 'green', 20, 'feet'), putt(2, 20, 'hole', 0)] });
    });
    expect(holes.reduce((s, h) => s + h.score, 0)).toBe(37);

    const result = await submit(holes);
    expect(result.success).toBe(false);
    if (!result.success) {
      // The first blocking issue is the first impossible hole: a 540-yd drive
      // onto the par-5 4th green.
      expect((result as { code?: string }).code).toBe('hole_invalid');
      expect(result.error).toMatch(/540-yard drive onto the green isn't possible/);
    }
    const rounds = await fake.from('golf_rounds').select('*');
    expect(rounds.data).toHaveLength(0);
  });

  it('rejects an implausible total with round_implausible when no single hole is impossible', async () => {
    seed();
    // Every hole a par-4 drivable at 330 yd, two strokes: 36 over 18, below the
    // round-countable floor of 50.
    const holes = Array.from({ length: 18 }, (_, i) => hole(i + 1, 4, {
      yardage: 330, score: 2, putts: 1,
      shots: [
        { ...teeShot(4, 'green', 20, 'feet'), distanceToHoleBefore: 330 },
        putt(2, 20, 'hole', 0),
      ],
    }));
    const result = await submit(holes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result as { code?: string }).code).toBe('round_implausible');
      expect(result.error).toMatch(/A total of 36 over 18 holes isn't a possible round \(the lowest we accept is 50\)/);
    }
  });

  it('rejects putts ≥ score on a hole with hole_invalid', async () => {
    seed();
    const holes = PARS.slice(0, 9).map((par, i) => ordinaryHole(i + 1, par));
    holes[2] = { ...holes[2]!, putts: holes[2]!.score };
    const result = await submit(holes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result as { code?: string }).code).toBe('hole_invalid');
      expect(result.error).toMatch(/^Hole 3: .*The tee shot isn't a putt/);
    }
  });

  it('rejects duplicated hole rows instead of counting them as holes played', async () => {
    seed();
    const holes = PARS.slice(0, 9).map((par, i) => ordinaryHole(i + 1, par));
    holes[8] = { ...holes[8]!, holeNumber: 8 };
    const result = await submit(holes);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result as { code?: string }).code).toBe('hole_invalid');
      expect(result.error).toMatch(/Hole 8 appears more than once/);
    }
  });

  it('does not reject a merely unusual (confirm-level) round at the gate', async () => {
    seed();
    // A 420-yard drive onto a par-4 green is `confirm`, not `block`: the
    // player confirmed it at entry and the server must not second-guess it.
    const holes = PARS.slice(0, 9).map((par, i) => ordinaryHole(i + 1, par));
    holes[0] = hole(1, 4, { score: 3, putts: 2, shots: [teeShot(4, 'green', 40, 'feet'), putt(2, 40, 'green', 3), putt(3, 3, 'hole', 0)] });
    const result = await submit(holes);
    // The fake client cannot run the submit RPC, so the action fails later
    // with a generic server error — what matters is that it got PAST the
    // plausibility gate: no validation code, no "Round submit rejected" log.
    const code = result.success ? undefined : (result as { code?: string }).code;
    expect(code).not.toBe('hole_invalid');
    expect(code).not.toBe('round_implausible');
    const rejected = vi.mocked(logServerError).mock.calls.filter(([msg]) => String(msg).startsWith('Round submit rejected'));
    expect(rejected).toEqual([]);
  });
});
