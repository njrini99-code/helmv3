/**
 * @vitest-environment node
 *
 * A1 (Critical, data loss) — savePartialRound's no-id branch matched an
 * existing in_progress round on course + round_date (+ qualifier context)
 * and reused it UNCONDITIONALLY, regardless of whether that round already
 * held real, scored progress. Two rounds started at the same course on the
 * same day (a legitimate case — nothing stops a player re-playing 18 the
 * same afternoon, or a practice round followed by a qualifier attempt with
 * no qualifier context) collide: the second round's fresh, mostly-null
 * holes payload silently overwrites the first round's scored holes via the
 * upsert, and the orphan trim can delete them outright.
 *
 * The fix: reuse only when the matched round is an EMPTY SHELL (no hole
 * with a non-null score, and no golf_shots rows) or when the caller
 * explicitly passes recovery/reuse intent. Otherwise insert a new round.
 * When reuse does happen, the holes upsert must refuse (not silently null)
 * any durable scored hole, and the orphan trim must never delete one.
 */
import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

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

import { savePartialRound } from '../golf';

const COURSE = '11111111-1111-4111-8111-111111111111';
const EXISTING_ROUND = '22222222-2222-4222-8222-222222222222';

function baseTables() {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
    golf_rounds: [] as Array<Record<string, unknown>>,
    golf_holes: [] as Array<Record<string, unknown>>,
    golf_shots: [] as Array<Record<string, unknown>>,
  };
}

function seed(tables: ReturnType<typeof baseTables>) {
  fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
  adminFake = fake;
}

const newRoundPayload = {
  courseName: 'Winchester CC',
  courseId: COURSE,
  roundType: 'practice' as const,
  roundDate: '2026-09-02',
  currentHole: 1,
  holesToPlay: 18 as const,
  holes: [],
  holeConfigs: [],
};

describe('savePartialRound no-id branch — reuse safety (A1)', () => {
  it('does NOT merge into a same-course/date round that already has scored holes', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 1, score: 4, putts: 2 });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined);

    expect(result.success).toBe(true);
    // A brand-new row was inserted; the scored round is untouched.
    expect(tables.golf_rounds).toHaveLength(2);
    if (result.success) {
      expect(result.data.roundId).not.toBe(EXISTING_ROUND);
    }
    const durableHole = tables.golf_holes.find((h) => h.round_id === EXISTING_ROUND);
    expect(durableHole?.score).toBe(4);
  });

  it('does NOT merge into a same-course/date round that has no scored holes but DOES have shots', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_shots.push({ id: 's1', round_id: EXISTING_ROUND, hole_number: 1, shot_number: 1 });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined);

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
    if (result.success) {
      expect(result.data.roundId).not.toBe(EXISTING_ROUND);
    }
    expect(tables.golf_shots.some((s) => s.round_id === EXISTING_ROUND)).toBe(true);
  });

  it('DOES reuse an empty-shell round (no scored holes, no shots) — the lost-id recovery case', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined);

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(1);
    if (result.success) {
      expect(result.data.roundId).toBe(EXISTING_ROUND);
    }
  });

  it('DOES reuse a scored round when the caller explicitly passes recovery/reuse intent', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 1, score: 4, putts: 2 });
    seed(tables);

    // Restoring the SAME progress the round already holds — a real restore
    // flow, not a merge collision. holeConfigs/holes intentionally echo the
    // durable hole so no null-over-durable conflict exists to refuse.
    const restorePayload = {
      ...newRoundPayload,
      holeConfigs: [{ holeNumber: 1, par: 4, yardage: 400 }],
      holes: [{
        holeNumber: 1, par: 4, yardage: 400, score: 4, putts: 2,
        fairwayHit: true, greenInRegulation: true, drivingDistance: null, usedDriver: true,
        driveMissDirection: null, approachDistance: null, approachLie: null,
        approachProximity: null, approachMissDirection: null, scrambleAttempt: false,
        scrambleMade: false, sandSaveAttempt: false, sandSaveMade: false, penaltyStrokes: 0,
        firstPuttDistance: null, firstPuttLeave: null, firstPuttBreak: null, firstPuttSlope: null,
        firstPuttMissDirection: null, holedOutDistance: null, holedOutType: null, shots: [],
      }],
    };

    const result = await savePartialRound(restorePayload, undefined, { allowReuse: true });

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(1);
    if (result.success) {
      expect(result.data.roundId).toBe(EXISTING_ROUND);
    }
  });

  it('never deletes a durable scored hole via the orphan trim, even when it is absent from the new payload', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 5, score: 4, putts: 2 });
    seed(tables);

    // Explicit reuse intent (a restore) whose holeConfigs no longer names
    // hole 5 at all — it never reaches holesPayload, so the null-over-durable
    // upsert guard can't see it. The orphan trim is the only thing standing
    // between it and deletion; it must never remove a scored hole.
    const result = await savePartialRound(
      { ...newRoundPayload, holeConfigs: [{ holeNumber: 1, par: 4, yardage: 400 }] },
      undefined,
      { allowReuse: true },
    );

    expect(result.success).toBe(true);
    expect(tables.golf_holes.find((h) => h.hole_number === 5)?.score).toBe(4);
  });
});
