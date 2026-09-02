/**
 * @vitest-environment node
 *
 * `deleteShot` and `updateShot` discarded the player-lookup error (review of
 * 6a7577c71, P4): `const { data: player } = ...maybeSingle()` meant an RLS
 * denial or a transport failure on the `golf_players` read was reported as
 * "Player profile not found" — to a player who has one, mid-round, with the
 * implication that nothing they do will help. `savePartialRound` fixed exactly
 * this shape on 2026-08-27 (bind the error; a read that FAILED must not be
 * reported as a read that found nothing). This mirrors it.
 *
 * THE INVARIANT: a failed read yields a retryable message that is neither the
 * not-found sentence nor the `shot_not_found` reconciliation code (which would
 * make the client delete its local shot). A genuinely empty read is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
/** When set, the golf_players read fails with this error instead of answering. */
let playerReadError: { message: string; code: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const base = fake;
    return {
      ...base,
      from(table: string) {
        const builder = base.from(table);
        if (table !== 'golf_players' || !playerReadError) return builder;
        return {
          ...builder,
          select: () => {
            const chain = {
              eq: () => chain,
              maybeSingle: async () => ({ data: null, error: playerReadError }),
              single: async () => ({ data: null, error: playerReadError }),
            };
            return chain;
          },
        };
      },
    };
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
  invalidateStatsCache: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

import { deleteShot, updateShot } from '../golf';

const SHOT = '11111111-1111-4111-8111-111111111111';
const ROUND = '22222222-2222-4222-8222-222222222222';

function seed(players: Array<{ id: string; user_id: string }>) {
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: players,
      golf_rounds: [{ id: ROUND, player_id: 'player-1', status: 'in_progress' }],
      golf_shots: [{ id: SHOT, round_id: ROUND, hole_number: 1, shot_number: 1 }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  playerReadError = null;
});

describe.each([
  ['deleteShot', () => deleteShot(SHOT)],
  ['updateShot', () => updateShot(SHOT, { result: 'rough' })],
] as const)('%s — the player lookup', (_name, run) => {
  it('reports a FAILED read as retryable, not as a missing profile', async () => {
    seed([{ id: 'player-1', user_id: 'u-p1' }]);
    playerReadError = { message: 'connection reset by peer', code: '08006' };

    const result = await run();

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.error).not.toBe('Player profile not found');
    // The one code the client reconciles by deleting its LOCAL shot. A
    // transient read failure must never wear it.
    expect(result.code).not.toBe('shot_not_found');
    expect(result.error).toMatch(/try again/i);
  });

  it('still reports a genuinely empty read as a missing profile', async () => {
    seed([]);

    const result = await run();

    expect(result).toEqual({ success: false, error: 'Player profile not found' });
  });
});
