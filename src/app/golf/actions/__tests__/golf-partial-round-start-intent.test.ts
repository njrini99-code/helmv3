/**
 * @vitest-environment node
 *
 * R8 (2026-09-22) — stranded draft rounds. Production measurement: 54
 * `in_progress` golf_rounds, 10 abandoned duplicates where a `completed`
 * round already exists for the same player + round_date + course. Root
 * cause, confirmed against production data:
 *
 *   - Most orphans: the player started round A, abandoned it, started a
 *     SEPARATE round B for the same course/date, and finished B — A was
 *     never resumed because `savePartialRound`'s no-id branch only reuses a
 *     course/date match when it is an EMPTY SHELL (A1, 2026-09-02); a match
 *     with real progress silently falls through to a fresh INSERT.
 *   - A smaller cluster: the player already had a COMPLETED round for the
 *     course/date and repeatedly re-triggered "start a round" anyway
 *     (observed: 3 separate in_progress duplicates against one completed
 *     round, created hours apart), because nothing warned them.
 *
 * The fix is gated behind a NEW opt-IN option, `startIntent`, set only by
 * `persistRoundStart` (New Round's "begin a brand-new round" call) — never
 * autosave, the beacon, the API route, or `writeRoundRecreatingIfMissing`'s
 * round_missing recreate retry, all of which call `savePartialRound` without
 * a 3rd argument and so are structurally unaffected. These tests fail on the
 * pre-fix code, which has no `startIntent` branch at all and always falls
 * through to insert.
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
const COMPLETED_ROUND = '33333333-3333-4333-8333-333333333333';

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

describe('savePartialRound no-id branch — startIntent (R8)', () => {
  it('returns in_progress_exists (no insert) for a non-empty in_progress match, when startIntent is set', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 1, score: 4, putts: 2 });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, { startIntent: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('in_progress_exists');
      expect('roundId' in result && result.roundId).toBe(EXISTING_ROUND);
    }
    // Nothing was inserted — the durable round is untouched, no sibling exists.
    expect(tables.golf_rounds).toHaveLength(1);
    // No auto-finalization: the matched round is still exactly in_progress —
    // returning a signal is not the same as submitting it.
    expect(tables.golf_rounds.find((r) => r.id === EXISTING_ROUND)?.status).toBe('in_progress');
  });

  it('still inserts a fresh round for the same non-empty match when startIntent is NOT set (legacy callers unaffected)', async () => {
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
    expect(tables.golf_rounds).toHaveLength(2);
  });

  it('returns duplicate_completed_round (no insert) when a completed round already occupies the slot, with startIntent', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: COMPLETED_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'completed',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T18:00:00Z',
    });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, { startIntent: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('duplicate_completed_round');
      expect('completedRoundId' in result && result.completedRoundId).toBe(COMPLETED_ROUND);
    }
    expect(tables.golf_rounds).toHaveLength(1);
    // No auto-finalization and no mutation of the existing completed round —
    // warning about a duplicate never touches the round it warns about.
    expect(tables.golf_rounds.find((r) => r.id === COMPLETED_ROUND)?.status).toBe('completed');
  });

  it('proceeds to insert once the player confirms (confirmDuplicateCourse: true)', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: COMPLETED_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'completed',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T18:00:00Z',
    });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, {
      startIntent: true,
      confirmDuplicateCourse: true,
    });

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
  });

  it('still inserts for the same completed match when startIntent is NOT set (legacy callers unaffected)', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: COMPLETED_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'completed',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T18:00:00Z',
    });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined);

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
  });

  it('36-hole day: a COMPLETED round 1 never forces a resume/discard — round 2 for the same course/date is allowed after a non-blocking warning', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: COMPLETED_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'completed',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T18:00:00Z',
    });
    seed(tables);

    // First attempt: a warning, not a forced action — round 1 is untouched
    // and nothing about it (resume/discard) is required of the player.
    const first = await savePartialRound(newRoundPayload, undefined, { startIntent: true });
    expect(first.success).toBe(false);
    if (!first.success) expect(first.error).toBe('duplicate_completed_round');
    expect(tables.golf_rounds).toHaveLength(1);
    expect(tables.golf_rounds[0]?.status).toBe('completed');

    // Second attempt (the same "Start round" tap, now confirmed): round 2 is
    // created as a genuinely separate round. Round 1 is still completed and
    // untouched — this is exactly a 36-hole day, not a duplicate.
    const second = await savePartialRound(newRoundPayload, undefined, {
      startIntent: true,
      confirmDuplicateCourse: true,
    });
    expect(second.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
    expect(tables.golf_rounds.find((r) => r.id === COMPLETED_ROUND)?.status).toBe('completed');
  });

  it('36-hole day: confirmSeparateRound proceeds to insert round 2 while round 1 stays in_progress, untouched (no forced resume/discard)', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 1, score: 4, putts: 2 });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, {
      startIntent: true,
      confirmSeparateRound: true,
    });

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
    // Round 1: not resumed (its id is not the id returned for this new
    // round), not discarded (still present, still in_progress, holes intact).
    const round1 = tables.golf_rounds.find((r) => r.id === EXISTING_ROUND);
    expect(round1?.status).toBe('in_progress');
    expect(tables.golf_holes.filter((h) => h.round_id === EXISTING_ROUND)).toHaveLength(1);
    if (result.success) expect(result.data.roundId).not.toBe(EXISTING_ROUND);
  });

  it('confirmSeparateRound alone (no startIntent) changes nothing for legacy callers', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 1, score: 4, putts: 2 });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, { confirmSeparateRound: true });

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
  });

  it('still reuses an empty-shell in_progress match even with startIntent (no regression to A1)', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: null, qualifier_round_number: null,
      updated_at: '2026-09-02T02:00:00Z',
    });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, { startIntent: true });

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(1);
    if (result.success) {
      expect(result.data.roundId).toBe(EXISTING_ROUND);
    }
  });
});
