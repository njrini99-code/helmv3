/**
 * @vitest-environment node
 *
 * Server-module test — same reason as golf-save-partial-round.test.ts: the
 * default jsdom environment defines `window`, and server-only logging guards
 * on `typeof window === 'undefined'`, so under jsdom the branch under test
 * never runs and the assertions silently pass against nothing.
 */
/**
 * Regression test: an auto-save whose target round no longer exists.
 *
 * MEASURED 2026-09-01, production. A player was on hole 9 at Winchester CC.
 * Three auto-saves in 55 seconds (02:25:19, 02:26:09, 02:26:14) failed against
 * round a45714a0-…, and that id had ZERO rows in golf_rounds, golf_holes and
 * golf_shots — it had never existed. save_partial_round_atomic answers that
 * case with 'Round not found or you do not have permission to update it.',
 * which the action passed straight through as a generic failure.
 *
 * The client could not tell it apart from a transient error, so it retried the
 * same dead id — which can never succeed — and every retry wrote its own
 * admin_events ERROR row. The player's round had nowhere to land.
 *
 * THE INVARIANT: that RPC message maps to the distinct key 'round_missing', so
 * the caller can drop the stale id and re-save through the CREATE path. It is
 * logged at 'warning', not 'error': the client recovers on its own, and a save
 * that recovers is not an incident.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let adminFake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminFake) }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => Promise<void> | void) => cb()) }));
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
import { logServerError } from '@/lib/server-error-logger';

const COURSE = '11111111-1111-4111-8111-111111111111';
const DEAD_ROUND = 'a45714a0-62fa-4e9b-bfe5-a25e71ca6bc9';

/** Seeds a live round row so the action reaches the RPC, which then reports it gone. */
function seedWithRpcError(rpcError: string) {
  const tables = {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [{ id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' }],
    golf_rounds: [{
      id: DEAD_ROUND,
      player_id: 'player-1',
      team_id: 'team-1',
      course_id: COURSE,
      course_name: 'Winchester CC',
      round_date: '2026-09-01',
      status: 'in_progress',
      updated_at: '2026-09-01T02:25:00Z',
    }],
  };
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables,
    rpc: { save_partial_round_atomic: async () => ({ data: { success: false, error: rpcError }, error: null }) },
  });
  adminFake = fake;
}

const partialData = {
  courseName: 'Winchester CC',
  courseId: COURSE,
  roundType: 'practice' as const,
  roundDate: '2026-09-01',
  currentHole: 9,
  holesToPlay: 18,
  holes: [],
  holeConfigs: [{ holeNumber: 1, par: 4, yardage: 400 }],
};

beforeEach(() => { vi.clearAllMocks(); });

describe('savePartialRound — the target round is gone', () => {
  it('maps the RPC message to the distinct key round_missing', async () => {
    seedWithRpcError('Round not found or you do not have permission to update it.');

    const result = await savePartialRound(partialData, DEAD_ROUND);

    expect(result.success).toBe(false);
    // The caller branches on this key to re-create. Leaking the raw sentence
    // is what made it indistinguishable from a transient failure.
    expect(result.success === false && result.error).toBe('round_missing');
  });

  it('logs it as a warning, not an error — the client recovers by itself', async () => {
    seedWithRpcError('Round not found or you do not have permission to update it.');

    await savePartialRound(partialData, DEAD_ROUND);

    const calls = vi.mocked(logServerError).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const severities = calls.map((c) => c[2]);
    expect(severities).toContain('warning');
    expect(severities).not.toContain('error');
  });

  it('still distinguishes conflict and busy, which are not the same failure', async () => {
    seedWithRpcError('conflict');
    const conflict = await savePartialRound(partialData, DEAD_ROUND);
    expect(conflict.success === false && conflict.error).toBe('conflict');

    seedWithRpcError('busy');
    const busy = await savePartialRound(partialData, DEAD_ROUND);
    expect(busy.success === false && busy.error).toBe('busy');
  });
});
