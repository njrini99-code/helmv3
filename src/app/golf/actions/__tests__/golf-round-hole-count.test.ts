/**
 * @vitest-environment node
 *
 * Round-entry audit W6 (RE-S4, RE-V1): the hole-count and partial-save gates.
 *   - a submit is a FINISHED round: 9 or 18 holes in one numbered run;
 *   - an in-progress round started as 18 cannot be completed with 9 holes;
 *   - savePartialRound refuses a completed hole the submit would refuse,
 *     with the same `hole_invalid` shape the client already surfaces.
 * Fixtures mirror golf-round-submit-plausibility.test.ts.
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

import { submitGolfRoundComprehensive, savePartialRound } from '../golf';
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

const ROUND_ID = '22222222-2222-4222-8222-222222222222';

async function submit(holes: HoleStats[], existingRoundId?: string) {
  return submitGolfRoundComprehensive({
    courseName: 'Winchester CC',
    courseId: COURSE,
    roundType: 'practice',
    roundDate: '2026-09-17',
    holes,
  }, existingRoundId);
}

function codeOf(result: { success: boolean }): string | undefined {
  return result.success ? undefined : (result as { code?: string }).code;
}

describe('submitGolfRoundComprehensive — finished-round shape', () => {
  it('refuses a 12-hole payload (Zod allows 9–18) before any write', async () => {
    seed();
    const holes = PARS.slice(0, 12).map((par, i) => ordinaryHole(i + 1, par));
    const result = await submit(holes);
    expect(result).toMatchObject({ success: false, code: 'round_implausible' });
    if (!result.success) expect(result.error).toMatch(/9 or 18 holes, and this one has 12/);
    const rounds = await fake.from('golf_rounds').select('*');
    expect(rounds.data).toHaveLength(0);
  });

  it('accepts a back nine numbered 10–18 past the gate', async () => {
    seed();
    const holes = PARS.slice(9, 18).map((par, i) => ordinaryHole(i + 10, par));
    const result = await submit(holes);
    expect(codeOf(result)).not.toBe('round_implausible');
    expect(codeOf(result)).not.toBe('hole_invalid');
  });

  it('refuses completing an 18-hole in-progress round with only 9 holes', async () => {
    seed();
    const tables = baseTables();
    tables.golf_rounds.push({
      id: ROUND_ID, player_id: 'player-1', status: 'in_progress', round_type: 'practice',
      qualifier_id: null, qualifier_round_number: null, holes_played: 18,
    });
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
    adminFake = fake;

    const holes = PARS.slice(0, 9).map((par, i) => ordinaryHole(i + 1, par));
    const result = await submit(holes, ROUND_ID);
    expect(result.success).toBe(false);
    expect(codeOf(result)).toBe('round_implausible');
    if (!result.success) expect(result.error).toMatch(/started as 18 holes, but 9 holes were submitted/);
    const rejected = vi.mocked(logServerError).mock.calls.filter(([msg]) => String(msg) === 'Round submit rejected: holes_played_mismatch');
    expect(rejected).toHaveLength(1);
  });

  it('lets a 9-hole in-progress round through the configured-count check', async () => {
    seed();
    const tables = baseTables();
    tables.golf_rounds.push({
      id: ROUND_ID, player_id: 'player-1', status: 'in_progress', round_type: 'practice',
      qualifier_id: null, qualifier_round_number: null, holes_played: 9,
    });
    fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
    adminFake = fake;

    const holes = PARS.slice(0, 9).map((par, i) => ordinaryHole(i + 1, par));
    const result = await submit(holes, ROUND_ID);
    const rejected = vi.mocked(logServerError).mock.calls.filter(([msg]) => String(msg) === 'Round submit rejected: holes_played_mismatch');
    expect(rejected).toEqual([]);
    expect(codeOf(result)).not.toBe('round_implausible');
  });
});

describe('savePartialRound — completed-hole plausibility (RE-V1)', () => {
  it('refuses a completed hole the submit gate would refuse, with hole_invalid', async () => {
    seed();
    const bad = { ...ordinaryHole(3, 3), score: 2, putts: 2, shots: [] };
    const result = await savePartialRound({
      courseName: 'Winchester CC',
      roundType: 'practice',
      roundDate: '2026-09-17',
      currentHole: 4,
      holesToPlay: 18,
      holes: [ordinaryHole(1, 4), ordinaryHole(2, 4), bad],
      inProgressShots: [],
    } as unknown as Parameters<typeof savePartialRound>[0], ROUND_ID);
    expect(result.success).toBe(false);
    expect(result).toMatchObject({ error: 'hole_invalid', code: 'hole_invalid', hole: 3, field: 'putts' });
    expect((result as { message?: string }).message).toMatch(/^Hole 3: .*The tee shot isn't a putt/);
  });

  it('does not apply the 9/18 shape to a round in progress', async () => {
    seed();
    const result = await savePartialRound({
      courseName: 'Winchester CC',
      roundType: 'practice',
      roundDate: '2026-09-17',
      currentHole: 3,
      holesToPlay: 18,
      holes: [ordinaryHole(1, 4), ordinaryHole(2, 4)],
      inProgressShots: [],
    } as unknown as Parameters<typeof savePartialRound>[0], ROUND_ID);
    // Whatever the fake client does next, the plausibility gate did not refuse it.
    expect((result as { error?: string }).error).not.toBe('hole_invalid');
    const refused = vi.mocked(logServerError).mock.calls.filter(([msg]) => String(msg).startsWith('Auto-save refused: '));
    expect(refused.filter(([msg]) => !String(msg).includes('failed validation'))).toEqual([]);
  });
});
