/**
 * @vitest-environment node
 *
 * A2 — a lost roundId on a qualifier round whose number was SERVER-DERIVED
 * (the client never carries `qualifierRoundNumber` itself) used to loop on
 * 23505 against golf_rounds_qualifier_player_round_number_uq: derivation
 * only looked at COMPLETED rounds, so it re-derived the SAME number the
 * player's own in-progress round already held, and the INSERT collided.
 *
 * savePartialRound's no-id branch now shares resolveQualifierRoundNumber
 * with getNextQualifierRoundNumber (src/lib/golf/qualifier-round-number.ts),
 * which checks for an in-progress round FIRST and returns it for reuse
 * instead of deriving a number to insert with.
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
const QUALIFIER = '33333333-3333-4333-8333-333333333333';
const ACTIVE_ROUND = '44444444-4444-4444-8444-444444444444';

function baseTables() {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
    golf_qualifiers: [{ id: QUALIFIER, num_rounds: 3 }],
    golf_rounds: [] as Array<Record<string, unknown>>,
    golf_holes: [] as Array<Record<string, unknown>>,
    golf_shots: [] as Array<Record<string, unknown>>,
  };
}

function seed(tables: ReturnType<typeof baseTables>) {
  fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
  adminFake = fake;
}

const qualifierPayload = {
  courseName: 'Winchester CC',
  courseId: COURSE,
  roundType: 'qualifier' as const,
  qualifierId: QUALIFIER,
  // Deliberately no qualifierRoundNumber — this is the client that lost its
  // local id and relies entirely on server-side derivation.
  roundDate: '2026-09-02',
  currentHole: 5,
  holesToPlay: 18 as const,
  holes: [],
  holeConfigs: [],
};

describe('savePartialRound — qualifier round-number reuse (A2)', () => {
  it('reuses the in-progress qualifier round instead of colliding with it on 23505', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: ACTIVE_ROUND, player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-09-02', status: 'in_progress',
      qualifier_id: QUALIFIER, qualifier_round_number: 2,
      updated_at: '2026-09-02T02:00:00Z',
    });
    seed(tables);

    const result = await savePartialRound(qualifierPayload, undefined);

    expect(result.success).toBe(true);
    // The player's own in-progress round was found and reused — not a
    // second row inserted with a re-derived, colliding number.
    expect(tables.golf_rounds).toHaveLength(1);
    if (result.success) {
      expect(result.data.roundId).toBe(ACTIVE_ROUND);
    }
    expect(tables.golf_rounds[0]?.qualifier_round_number).toBe(2);
  });

  it('derives a fresh first-unused number when no in-progress round exists', async () => {
    const tables = baseTables();
    tables.golf_rounds.push({
      id: 'completed-1', player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-08-01', status: 'completed',
      qualifier_id: QUALIFIER, qualifier_round_number: 1,
    });
    seed(tables);

    const result = await savePartialRound(qualifierPayload, undefined);

    expect(result.success).toBe(true);
    const newRound = tables.golf_rounds.find((r) => r.status === 'in_progress');
    expect(newRound?.qualifier_round_number).toBe(2);
  });

  it('returns a clear error instead of inserting when every configured round is already used', async () => {
    const tables = baseTables();
    tables.golf_qualifiers = [{ id: QUALIFIER, num_rounds: 1 }];
    tables.golf_rounds.push({
      id: 'completed-1', player_id: 'player-1', team_id: 'team-1', course_id: COURSE,
      course_name: 'Winchester CC', round_date: '2026-08-01', status: 'completed',
      qualifier_id: QUALIFIER, qualifier_round_number: 1,
    });
    seed(tables);

    const result = await savePartialRound(qualifierPayload, undefined);

    expect(result.success).toBe(false);
    expect(result.success === false && result.code).toBe('qualifier_round_limit_reached');
    // Decisive: no numberless (or colliding) row was inserted to paper over it.
    expect(tables.golf_rounds).toHaveLength(1);
  });
});
