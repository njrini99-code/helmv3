/**
 * Regression test for the no-existingRoundId fallback branch of
 * savePartialRound (golf.ts) — feature-sweep finding golf-player-logging
 * P0 2026-07-10.
 *
 * Before the fix, the very first auto-save of a brand-new round (client
 * hasn't been assigned a roundId yet) looked up "the most recently updated
 * in_progress round for this player" with NO course/date scoping. If the
 * player already had an unrelated unfinished round sitting in_progress
 * (the product allows multiple simultaneous in-progress rounds), that
 * unrelated round's row was silently repurposed instead of a new row being
 * inserted.
 *
 * The fix scopes the recovery lookup to course_id + round_date (+
 * qualifier context), and skips the heuristic entirely when the course
 * can't be resolved to an id — so:
 *  - a genuinely new round (different course/date) always gets a new row,
 *    never overwriting an unrelated in-progress round, and
 *  - the legitimate recovery case (same course/date, lost local roundId)
 *    still resumes the existing row instead of creating a duplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let adminFake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => cb()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {}),
}));

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
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

import { savePartialRound } from '../golf';

type Row = Record<string, unknown>;
interface SeedTables extends Record<string, Row[]> {
  golf_players: Row[];
  golf_team_members: Row[];
  golf_rounds: Row[];
}

const COURSE_A = '11111111-1111-4111-8111-111111111111';
const COURSE_B = '22222222-2222-4222-8222-222222222222';

function baseTables(): SeedTables {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
    ],
    golf_rounds: [],
  };
}

function seedAs(userId: string, tables: SeedTables) {
  fake = createFakeSupabase({ user: { id: userId }, tables });
  adminFake = fake;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('savePartialRound — no-existingRoundId fallback', () => {
  it('does NOT repurpose an unrelated in_progress round at a different course/date', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-old',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Old Abandoned Course',
      round_date: '2026-01-01',
      status: 'in_progress',
      qualifier_id: null,
      qualifier_round_number: null,
      updated_at: '2026-01-01T10:00:00Z',
    });
    seedAs('u-p1', tables);

    const result = await savePartialRound({
      courseName: 'New Course',
      courseId: COURSE_B,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 1,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(true);
    // A brand-new row was inserted — the old unrelated round is untouched.
    expect(tables.golf_rounds).toHaveLength(2);
    const oldRound = tables.golf_rounds.find(r => r.id === 'round-old');
    expect(oldRound?.course_name).toBe('Old Abandoned Course');
    expect(oldRound?.round_date).toBe('2026-01-01');
    if (result.success) {
      expect(result.data.roundId).not.toBe('round-old');
    }
  });

  it('resumes the existing in_progress round when course + round_date match', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'round-same',
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE_A,
      course_name: 'Same Course',
      round_date: '2026-07-10',
      status: 'in_progress',
      qualifier_id: null,
      qualifier_round_number: null,
      updated_at: '2026-07-10T10:00:00Z',
    });
    seedAs('u-p1', tables);

    const result = await savePartialRound({
      courseName: 'Same Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 2,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(true);
    // No duplicate row — the same session's round was resumed.
    expect(tables.golf_rounds).toHaveLength(1);
    if (result.success) {
      expect(result.data.roundId).toBe('round-same');
    }
  });
});
