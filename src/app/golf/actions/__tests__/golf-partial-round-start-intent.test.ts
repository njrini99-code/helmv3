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
import { logServerError } from '@/lib/server-error-logger';

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

function seed(tables: ReturnType<typeof baseTables>, queryErrors?: Record<string, unknown>) {
  fake = createFakeSupabase({ user: { id: 'u-p1' }, tables, queryErrors });
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

  it('SHOULD-FIX #1: fails CLOSED with a retryable error (no insert) when the in-progress candidate lookup errors', async () => {
    const tables = baseTables();
    // No existing round needed — the lookup itself is what fails, so the
    // fail-open/fail-closed choice is the only thing under test here.
    seed(tables, { golf_rounds: { message: 'connection reset', code: 'ECONNRESET' } });

    const result = await savePartialRound(newRoundPayload, undefined, { startIntent: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      // A generic retryable message, not the raw db error and not one of the
      // structured signal codes ('in_progress_exists' / 'duplicate_completed_round')
      // — the caller must not mistake an unreadable lookup for "no conflict".
      expect(result.error).not.toBe('in_progress_exists');
      expect(result.error).not.toBe('duplicate_completed_round');
      expect(typeof result.error).toBe('string');
    }
    // Fail CLOSED: nothing was inserted while the slot's occupancy was unknown.
    expect(tables.golf_rounds).toHaveLength(0);
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('in-progress candidate lookup failed'),
      expect.objectContaining({ action: 'savePartialRound.inProgressCandidateLookup' }),
      'error',
    );
  });

  it('SHOULD-FIX #2: a completed round 1 of a 36-hole qualifier day does not spuriously warn when starting round 2 (qualifier_round_number now filters the completed-round check too)', async () => {
    const QUALIFIER = '44444444-4444-4444-8444-444444444444';
    const tables = baseTables();
    tables.golf_rounds.push({
      id: COMPLETED_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'completed',
      qualifier_id: QUALIFIER, qualifier_round_number: 1,
      updated_at: '2026-09-02T12:00:00Z',
    });
    seed(tables);

    // Round 2 of the same qualifier day — a DIFFERENT qualifier_round_number,
    // passed explicitly so this test doesn't depend on resolveQualifierRoundNumber's
    // own derivation. Before this fix, the completed-round check ignored
    // qualifier_round_number and matched round 1's completed row on
    // qualifier_id alone, warning spuriously.
    const result = await savePartialRound(
      { ...newRoundPayload, qualifierId: QUALIFIER, qualifierRoundNumber: 2 },
      undefined,
      { startIntent: true },
    );

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
    expect(tables.golf_rounds.find((r) => r.id === COMPLETED_ROUND)?.status).toBe('completed');
  });

  it('SHOULD-FIX #4: confirmSeparateRound bypasses ONLY the in-progress check — a completed match at the same slot still blocks with duplicate_completed_round', async () => {
    const tables = baseTables();
    // Both conflicts present at once: the player's own non-empty in_progress
    // round AND a completed round, same course/date/qualifier slot.
    tables.golf_rounds.push(
      {
        id: EXISTING_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
        course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
        qualifier_id: null, qualifier_round_number: null,
        updated_at: '2026-09-02T02:00:00Z',
      },
      {
        id: COMPLETED_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
        course_name: 'Winchester CC', round_date: '2026-09-02', status: 'completed',
        qualifier_id: null, qualifier_round_number: null,
        updated_at: '2026-09-02T18:00:00Z',
      },
    );
    tables.golf_holes.push({ id: 'h1', round_id: EXISTING_ROUND, hole_number: 1, score: 4, putts: 2 });
    seed(tables);

    const result = await savePartialRound(newRoundPayload, undefined, {
      startIntent: true,
      confirmSeparateRound: true,
    });

    // The bypass is scoped to exactly the in_progress_exists check — the
    // completed-round warning still fires and still blocks the insert.
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('duplicate_completed_round');
      expect('completedRoundId' in result && result.completedRoundId).toBe(COMPLETED_ROUND);
    }
    expect(tables.golf_rounds).toHaveLength(2);
    expect(tables.golf_rounds.find((r) => r.id === EXISTING_ROUND)?.status).toBe('in_progress');
    expect(tables.golf_rounds.find((r) => r.id === COMPLETED_ROUND)?.status).toBe('completed');
  });
});
