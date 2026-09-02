/**
 * @vitest-environment node
 *
 * A SALVAGED HOLE MUST NOT DELETE A HOLE THAT IS ALREADY SAFE.
 *
 * c45d48660 ("a payload mismatch must never cost the player their shot", live
 * in production since 2026-08-23) made savePartialRound salvage instead of
 * reject: an unparseable hole is blanked to null and the save carries on, so
 * one bad hole cannot discard seventeen good ones. The principle is right.
 *
 * The implementation inverted it, because save_partial_round_atomic is a
 * REPLACE, not a merge. Verified against a live database: save 3 holes, then
 * re-save with a 1-hole payload, and exactly 1 hole and 2 shots remain. The RPC
 * deletes every golf_holes and golf_shots row for the round and rebuilds from
 * the payload.
 *
 * A blanked hole is filtered out of `completedHoles`, so the rebuild emits it
 * as {score: null, putts: null} with NO shot group. The score and shots that
 * were already durable are therefore deleted — and the caller is told the save
 * succeeded. That is the exact outcome the commit's own comment forbids.
 *
 * The invariant pinned here: if a blanked hole already has a scored row on the
 * server, refuse the write ('retry') rather than replace it.
 *
 * Updated 2026-09-02 (A3): "if it has nothing stored, salvage proceeds
 * unchanged" was itself a defect — silently dropping a hole that was NEVER
 * durable while reporting success is exactly how a hole vanishes from the
 * server while the UI still shows it complete, surfacing later as a raw Zod
 * string at submit. A non-durable salvaged hole now returns a structured
 * `hole_invalid` result (hole/field/message) and performs NO write at all,
 * rather than silently succeeding. Only a DURABLE salvaged hole still hits
 * the original 'retry' guard unchanged — see the first test below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { HoleStats } from '@/lib/types/golf';

let fake: FakeSupabase;
let adminFake: FakeSupabase;
let rpcCalls: string[] = [];

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
const ROUND = '22222222-2222-4222-8222-222222222222';

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

/** Fails partialHoleSchema — the shape that triggers the salvage path. */
const unparseableHole = { ...goodHole(3), score: 'not-a-number' } as unknown as HoleStats;

function seed(storedHoles: Array<{ hole_number: number; score: number | null }>) {
  rpcCalls = [];
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
      golf_rounds: [{
        id: ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
        course_name: 'Winchester CC', round_date: '2026-09-01', status: 'in_progress',
        updated_at: '2026-09-01T02:00:00Z',
      }],
      golf_holes: storedHoles.map((h) => ({ round_id: ROUND, ...h })),
    },
    rpc: {
      save_partial_round_atomic: async () => {
        rpcCalls.push('save_partial_round_atomic');
        return { data: { success: true, updated_at: '2026-09-01T02:05:00Z' }, error: null };
      },
    },
  });
  adminFake = fake;
}

const payload = {
  courseName: 'Winchester CC', courseId: COURSE, roundType: 'practice' as const,
  roundDate: '2026-09-01', currentHole: 4, holesToPlay: 18 as const,
  holes: [goodHole(1), goodHole(2), unparseableHole],
  holeConfigs: [
    { holeNumber: 1, par: 4, yardage: 400 },
    { holeNumber: 2, par: 4, yardage: 400 },
    { holeNumber: 3, par: 4, yardage: 400 },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('savePartialRound — salvage must not erase a durable hole', () => {
  it('REFUSES the write when the blanked hole already has a scored row', async () => {
    // Hole 3 is scored on the server. Blanking it and running the REPLACE
    // would delete that score and its shots while reporting success.
    seed([{ hole_number: 3, score: 5 }]);

    const result = await savePartialRound(payload, ROUND);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe('retry');
    // The decisive assertion: the destructive RPC must never have run.
    expect(rpcCalls).toEqual([]);
  });

  it('returns hole_invalid — not a silent salvage — when the blanked hole has nothing stored to lose', async () => {
    // Hole 3 has no durable row. Nothing on the server would be erased by
    // salvaging it, but salvaging it SILENTLY still means hole 3's real
    // (invalid) data is dropped with no trace while the save reports
    // success — the exact silent-loss defect A3 closes.
    seed([{ hole_number: 1, score: 4 }, { hole_number: 2, score: 4 }]);

    const result = await savePartialRound(payload, ROUND);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('hole_invalid');
      expect((result as { code?: string }).code).toBe('hole_invalid');
      expect((result as { hole?: number }).hole).toBe(3);
      expect((result as { field?: string }).field).toBe('score');
      expect((result as { message?: string }).message).toMatch(/hole 3/i);
    }
    // No write at all — not even the good holes went through.
    expect(rpcCalls).toEqual([]);
  });

  it('still returns hole_invalid when the blanked hole exists but its score is null (not durable)', async () => {
    // A stored row whose score is null is not "durable" — same as no row at
    // all. This pins that hole_invalid, like the original erasure guard,
    // keys on a SCORED row, not mere existence.
    seed([{ hole_number: 3, score: null }]);

    const result = await savePartialRound(payload, ROUND);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('hole_invalid');
      expect((result as { hole?: number }).hole).toBe(3);
    }
    expect(rpcCalls).toEqual([]);
  });
});

/**
 * THE GUARD ABOVE ONLY COVERED THE RPC PATH (review of 6a7577c71, P3).
 *
 * d170cad53 keyed the guard on `existingRoundId`. The no-id branch can REUSE
 * another `in_progress` round matched on course + date + qualifier context and
 * then UPSERT `holesPayload` on (round_id, hole_number). A salvaged hole is
 * still in that payload as {score: null, putts: null}, so the upsert nulls a
 * durable scored row exactly as the REPLACE did — reachable from New Round's
 * "save for later" after a round_missing, or from a restore whose snapshot
 * carries no id.
 *
 * Updated 2026-09-02:
 * - A1: the no-id branch no longer reuses a course/date match
 *   UNCONDITIONALLY — see golf-partial-round-reuse-safety.test.ts. A round
 *   that already holds a scored hole is not an "empty shell", so reuse
 *   without explicit intent doesn't happen at all here; A3 below decides
 *   what happens instead.
 * - A3: hole_invalid is checked BEFORE any write — the parent round row
 *   included — using whichever round (if any) this save is actually about
 *   to touch. Every case in this describe block salvages hole 3, and none
 *   of the seeded rounds ever holds a DURABLE hole 3, so every case here now
 *   resolves to `hole_invalid` with NO write at all, regardless of whether
 *   `allowReuse` was passed — that flag only controls WHICH round would have
 *   been written to, not whether a non-durable salvaged hole is tolerated.
 */
describe('savePartialRound — salvage guard on the no-id REUSE path', () => {
  /**
   * The reuse heuristic (golf.ts, savePartialRound no-id branch) matches on
   * player + in_progress + course_id + round_date, and requires NULL qualifier
   * context on both sides — so the seeded row must carry those nulls
   * explicitly or the query never finds it and the test would silently
   * exercise the CREATE path instead.
   */
  function seedReusable(storedHoles: Array<{ hole_number: number; score: number | null }>) {
    rpcCalls = [];
    fake = createFakeSupabase({
      user: { id: 'u-p1' },
      tables: {
        golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
        golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
        golf_rounds: [{
          id: ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
          course_name: 'Winchester CC', round_date: '2026-09-01', status: 'in_progress',
          qualifier_id: null, qualifier_round_number: null,
          updated_at: '2026-09-01T02:00:00Z',
        }],
        golf_holes: storedHoles.map((h) => ({ id: `hole-${h.hole_number}`, round_id: ROUND, ...h })),
        golf_shots: [],
      },
      rpc: {
        save_partial_round_atomic: async () => {
          rpcCalls.push('save_partial_round_atomic');
          return { data: { success: true, updated_at: '2026-09-01T02:05:00Z' }, error: null };
        },
      },
    });
    adminFake = fake;
  }

  it('hole_invalid, no write at all — candidate round holds a durable hole, no reuse intent', async () => {
    seedReusable([{ hole_number: 3, score: 5 }]);
    const roundsBefore = JSON.stringify((await fake.from('golf_rounds').select('*')).data);
    const holesBefore = JSON.stringify((await fake.from('golf_holes').select('*')).data);

    const result = await savePartialRound(payload, undefined);

    // A1's emptiness gate would already refuse anonymous reuse here (the
    // candidate round holds a scored hole); A3 additionally means the save
    // does not fall back to inserting a fresh round either, because hole 3's
    // OWN data in this payload is invalid and not durable ANYWHERE.
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('hole_invalid');
      expect((result as { hole?: number }).hole).toBe(3);
    }
    // Decisive: neither the durable round nor a new one was ever written to.
    expect(JSON.stringify((await fake.from('golf_rounds').select('*')).data)).toBe(roundsBefore);
    expect(JSON.stringify((await fake.from('golf_holes').select('*')).data)).toBe(holesBefore);
    expect(rpcCalls).toEqual([]);
  });

  it('hole_invalid even with explicit reuse intent, when the salvaged hole itself is not durable there', async () => {
    seedReusable([{ hole_number: 1, score: 4 }, { hole_number: 2, score: 4 }]);

    // Explicit reuse intent (the flag the restore flows set) makes this
    // round the reuse target despite holding OTHER scored holes — but hole 3
    // itself has no durable row on it, so A3 still refuses rather than
    // silently salvaging it, and the reuse UPDATE never runs.
    const result = await savePartialRound(payload, undefined, { allowReuse: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('hole_invalid');
      expect((result as { hole?: number }).hole).toBe(3);
    }
    // The round's own metadata was never touched by a reuse UPDATE.
    const round = (await fake.from('golf_rounds').select('*').eq('id', ROUND).maybeSingle());
    expect((round.data as { updated_at?: string } | null)?.updated_at).toBe('2026-09-01T02:00:00Z');
    expect(rpcCalls).toEqual([]);
  });

  it('keeps the original retry refusal (A3 does not apply) when the salvaged hole IS durable there, even with reuse intent', async () => {
    seedReusable([{ hole_number: 3, score: 5 }]);

    // Explicit reuse intent bypasses A1's emptiness gate, reaching the round
    // that already holds a scored hole 3 — "true salvage (durable hole
    // exists)" stays exactly as it was: refused with 'retry', not
    // 'hole_invalid'.
    const result = await savePartialRound(payload, undefined, { allowReuse: true });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toBe('retry');
    const holes = (await fake.from('golf_holes').select('*')).data as Array<{ hole_number: number; score: number | null }>;
    expect(holes.find((h) => h.hole_number === 3)?.score).toBe(5);
    expect(rpcCalls).toEqual([]);
  });
});
