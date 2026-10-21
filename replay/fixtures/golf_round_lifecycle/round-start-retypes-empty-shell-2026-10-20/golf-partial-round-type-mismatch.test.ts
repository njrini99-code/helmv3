/**
 * @vitest-environment node
 *
 * c449552f (2026-10-20, production): a player started a tournament round,
 * left it as an empty shell (no hole or shot rows yet), then went back to New
 * Round and started a PRACTICE round at the same course on the same date.
 * `savePartialRound`'s no-id branch matched the tournament shell on
 * course + date + qualifier, reused it because it was empty, and sent an
 * UPDATE carrying `round_type: 'practice'`. The lifecycle trigger
 * (`20260830120000_reclassify_owns_its_own_integrity.sql`) refuses any direct
 * change to an unfinished round's player/team/round_type/qualifier identity
 * with SQLSTATE 55000, so the start failed with "Failed to save round" and
 * the client logged "Round start failed: server_rejected" (9a6618a3).
 *
 * The identity-strip on that UPDATE removes player_id, team_id, qualifier_id
 * and qualifier_round_number, but not round_type — and stripping it would be
 * wrong anyway: it would silently turn the player's practice start into a
 * tournament round. A round of a different type is a different round, so it
 * is never a reuse target. With `startIntent` it is reported as
 * `in_progress_exists` (the player's own Resume / Discard / Start a new round
 * prompt); without it, the save inserts its own round and leaves the other
 * one untouched.
 *
 * The fake below enforces the trigger's round_type rule on golf_rounds
 * updates, so these tests exercise the database invariant rather than a
 * payload shape. They fail on the pre-fix code for that reason: the reuse
 * UPDATE is refused and the action returns 'Failed to save round'.
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

import { savePartialRound } from '../round-partial';

const COURSE = '11111111-1111-4111-8111-111111111111';
const TOURNAMENT_SHELL = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

const IDENTITY_ERROR = {
  code: '55000',
  message: 'A started round keeps its original qualifier identity. Resume or discard it instead of changing it.',
};

function baseTables() {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
    golf_rounds: [] as Row[],
    golf_holes: [] as Row[],
    golf_shots: [] as Row[],
  };
}

/**
 * Wrap golf_rounds updates with the lifecycle trigger's round_type rule: an
 * update that names a round by id and changes its round_type resolves to the
 * trigger's 55000 error instead of writing.
 */
function enforceRoundTypeIdentity(client: FakeSupabase, rounds: Row[]) {
  const from = client.from.bind(client);
  client.from = ((table: string) => {
    const api = from(table);
    if (table !== 'golf_rounds') return api;
    return {
      ...api,
      update: (payload: unknown) => {
        const inner = api.update(payload);
        const next = (payload ?? {}) as Row;
        let refused = false;
        const proxy: typeof inner = new Proxy(inner, {
          get(target, prop, receiver) {
            if (prop === 'eq') {
              return (col: string, value: unknown) => {
                if (col === 'id') {
                  const row = rounds.find((r) => r.id === value);
                  if (row && 'round_type' in next && next.round_type !== row.round_type) refused = true;
                }
                target.eq(col, value);
                return proxy;
              };
            }
            if (prop === 'select') return () => proxy;
            if (prop === 'maybeSingle' || prop === 'single') {
              return async () => (refused ? { data: null, error: IDENTITY_ERROR } : target[prop]());
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return proxy;
      },
    };
  }) as typeof client.from;
}

function seedTournamentShell() {
  const tables = baseTables();
  tables.golf_rounds.push({
    id: TOURNAMENT_SHELL, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
    course_name: 'Winchester CC', round_date: '2026-10-19', status: 'in_progress',
    round_type: 'tournament', qualifier_id: null, qualifier_round_number: null,
    updated_at: '2026-10-20T20:54:51Z',
  });
  fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
  adminFake = fake;
  enforceRoundTypeIdentity(fake, tables.golf_rounds);
  return tables;
}

const practiceStart = {
  courseName: 'Winchester CC',
  courseId: COURSE,
  roundType: 'practice' as const,
  roundDate: '2026-10-19',
  currentHole: 1,
  holesToPlay: 18 as const,
  holes: [],
  holeConfigs: [],
};

describe('savePartialRound no-id branch — a round of another type is never reused (c449552f)', () => {
  it('startIntent: an empty tournament shell at the same course/date is reported as in_progress_exists, not retyped', async () => {
    const tables = seedTournamentShell();

    const result = await savePartialRound(practiceStart, undefined, { startIntent: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('in_progress_exists');
      expect('roundId' in result && result.roundId).toBe(TOURNAMENT_SHELL);
    }
    expect(tables.golf_rounds).toHaveLength(1);
    expect(tables.golf_rounds[0]?.round_type).toBe('tournament');
    expect(tables.golf_rounds[0]?.status).toBe('in_progress');
  });

  it('startIntent + confirmSeparateRound: the practice round is inserted beside the tournament shell', async () => {
    const tables = seedTournamentShell();

    const result = await savePartialRound(practiceStart, undefined, { startIntent: true, confirmSeparateRound: true });

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
    expect(tables.golf_rounds.find((r) => r.id === TOURNAMENT_SHELL)?.round_type).toBe('tournament');
    expect(tables.golf_rounds.find((r) => r.id !== TOURNAMENT_SHELL)?.round_type).toBe('practice');
  });

  it('no startIntent (autosave with a lost id): the save inserts its own practice round and leaves the shell alone', async () => {
    const tables = seedTournamentShell();

    const result = await savePartialRound(practiceStart, undefined);

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(2);
    expect(tables.golf_rounds.find((r) => r.id === TOURNAMENT_SHELL)?.round_type).toBe('tournament');
  });

  it('an empty shell of the SAME type is still reused (the lost-id recovery case is unchanged)', async () => {
    const tables = seedTournamentShell();

    const result = await savePartialRound({ ...practiceStart, roundType: 'tournament' }, undefined, { startIntent: true });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.roundId).toBe(TOURNAMENT_SHELL);
    expect(tables.golf_rounds).toHaveLength(1);
  });
});
