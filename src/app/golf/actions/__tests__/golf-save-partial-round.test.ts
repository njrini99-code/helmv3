/**
 * @vitest-environment node
 *
 * Server-module test. The default project environment is jsdom, which
 * defines `window` — and rls-denial.ts gates its capture on
 * `typeof window === 'undefined'` so server-only logging never lands in a
 * client bundle. Under jsdom that guard is false, the capture branch never
 * runs, and these assertions silently test nothing. Pin to node so the code
 * path under test is the one that actually executes on the server.
 */
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
  logServerEvent: vi.fn(async () => {}),
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

/**
 * Regression test for the savePartialRound duplicate-error-logging bug —
 * a single Postgres failure was previously written to admin_events 3-4
 * times (paired logServerException + logServerError in the impl, PLUS
 * maybeCaptureRlsDenial for RLS denials, PLUS withAdminObserved's own
 * generic soft-failure observer on the returned `{ success: false }`).
 * The fix: drop the redundant logServerException call, gate the generic
 * logServerError behind `!maybeCaptureRlsDenial(...)` (which now returns
 * a boolean instead of void), and pass `observeSoftFailures: false` to
 * the withAdminObserved wrapper so it never re-observes a failure the
 * impl already recorded itself.
 *
 * Mirrors the `failUpdates`/`makeFailingBuilder` monkey-patch idiom from
 * recurring-events.test.ts, generalized to inject a full Postgrest-shaped
 * error object (with `.code`) so both the non-RLS and RLS-denial branches
 * can be exercised.
 */
describe('savePartialRound — single admin_events row per failure (no duplicate logging)', () => {
  function failUpdate(client: FakeSupabase, table: string, error: { code?: string; message: string }) {
    const origFrom = client.from.bind(client);
    client.from = ((t: string) => {
      const api = origFrom(t);
      if (t !== table) return api;
      return {
        ...api,
        update: () => {
          const result = { data: null, error };
          const builder: Record<string, unknown> = {};
          builder.eq = () => builder;
          builder.select = () => builder;
          builder.maybeSingle = async () => result;
          builder.single = async () => result;
          builder.then = (
            onfulfilled?: (v: unknown) => unknown,
            onrejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(result).then(onfulfilled, onrejected);
          return builder;
        },
      };
    }) as typeof client.from;
  }

  function seedExistingRound() {
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
    return tables;
  }

  it('a non-RLS update failure logs exactly ONE admin_events row (logServerError only)', async () => {
    seedExistingRound();
    failUpdate(fake, 'golf_rounds', { code: '23505', message: 'duplicate key value violates unique constraint' });

    const result = await savePartialRound({
      courseName: 'Same Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 2,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(false);

    const { logServerError, logServerException, logServerEvent } = await import('@/lib/server-error-logger');
    expect(logServerError).toHaveBeenCalledTimes(1);
    expect(logServerException).not.toHaveBeenCalled();
    expect(logServerEvent).not.toHaveBeenCalled();
  });

  it('an RLS-denied update logs exactly ONE admin_events row (via maybeCaptureRlsDenial only)', async () => {
    seedExistingRound();
    failUpdate(fake, 'golf_rounds', { code: '42501', message: 'permission denied for table golf_rounds' });

    const result = await savePartialRound({
      courseName: 'Same Course',
      courseId: COURSE_A,
      roundType: 'practice',
      roundDate: '2026-07-10',
      currentHole: 2,
      holesToPlay: 18,
      holes: [],
    });

    expect(result.success).toBe(false);

    const { logServerError, logServerException, logServerEvent } = await import('@/lib/server-error-logger');
    // maybeCaptureRlsDenial owns this failure — the generic path must not
    // ALSO log it (that was the source of the double-write).
    expect(logServerEvent).toHaveBeenCalledTimes(1);
    expect(logServerError).not.toHaveBeenCalled();
    expect(logServerException).not.toHaveBeenCalled();
  });
});
