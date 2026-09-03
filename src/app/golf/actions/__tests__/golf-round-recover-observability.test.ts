/**
 * @vitest-environment node
 *
 * Deliverable 6 (Sentry max-observability, Phase C) — `deleteInProgressRound`
 * ("recover": discard an in-progress round so the player can start clean)
 * emits `helm.workflow.*` (metrics.ts `recordWorkflow`) + one `helmLog` line
 * per invocation, at each of the function's EXISTING return branches — see
 * `recordDiscardRoundOutcome` in golf.ts, right above
 * `deleteInProgressRoundImpl`.
 *
 * Reuses the same fake-Supabase / mock scaffolding as
 * golf-actions-resilient-auth.test.ts (which already covers this function's
 * auth-resilience behavior) rather than duplicating it, and adds mocks for
 * the two new observability modules so their calls can be asserted on
 * directly instead of just being allowed to fail open silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

const { recordWorkflow, helmLog } = vi.hoisted(() => ({
  recordWorkflow: vi.fn(),
  helmLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/observability/metrics', () => ({ recordWorkflow }));
vi.mock('@/lib/observability/structured-log', () => ({ helmLog }));

let fake: FakeSupabase;
let resilientUser: { id: string } | null = { id: 'u-p1' };
let revalidatePathImpl: (path: string) => void = () => {};

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn((path: string) => revalidatePathImpl(path)),
  updateTag: vi.fn(),
}));
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
vi.mock('@/lib/auth/resilient-get-user', () => ({
  getUserResilient: vi.fn(async () => ({ user: resilientUser, degraded: resilientUser != null })),
}));

import { deleteInProgressRound } from '../golf';

const ROUND = '22222222-2222-4222-8222-222222222222';
const OTHER_ROUND = '99999999-9999-4999-8999-999999999999';

function seed(overrides: { rounds?: Array<Record<string, unknown>> } = {}) {
  fake = createFakeSupabase({
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_rounds: overrides.rounds ?? [{ id: ROUND, player_id: 'player-1', status: 'in_progress' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resilientUser = { id: 'u-p1' };
  revalidatePathImpl = () => {};
  seed();
});

describe('deleteInProgressRound ("recover") — helm.workflow.* + helmLog', () => {
  it('records outcome:"success" and logs at info when the discard succeeds', async () => {
    const result = await deleteInProgressRound(ROUND);

    expect(result.success).toBe(true);
    expect(recordWorkflow).toHaveBeenCalledTimes(1);
    expect(recordWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'golf_round_lifecycle',
        action: 'golf.round.recover',
        outcome: 'success',
        sport: 'golf',
      }),
    );
    expect(helmLog.info).toHaveBeenCalledWith(
      'golf.round_lifecycle.finished',
      expect.objectContaining({ action: 'golf.round.recover', result: 'success' }),
    );
    expect(helmLog.warn).not.toHaveBeenCalled();
    expect(helmLog.error).not.toHaveBeenCalled();
  });

  it('records outcome:"invalid_input" for a malformed round id, without touching the database', async () => {
    const result = await deleteInProgressRound('not-a-uuid');

    expect(result).toEqual({ success: false, error: 'Invalid round ID' });
    expect(recordWorkflow).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'invalid_input' }));
    expect(helmLog.warn).toHaveBeenCalledWith(
      'golf.round_lifecycle.finished',
      expect.objectContaining({ result: 'invalid_input' }),
    );
  });

  it('records outcome:"unauthenticated" when no resilient user is present', async () => {
    resilientUser = null;

    const result = await deleteInProgressRound(ROUND);

    expect(result).toEqual({ success: false, error: 'You must be signed in' });
    expect(recordWorkflow).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unauthenticated' }));
  });

  it('records outcome:"player_not_found" when the signed-in user has no golf_players row', async () => {
    fake = createFakeSupabase({ tables: { golf_players: [], golf_rounds: [] } });

    const result = await deleteInProgressRound(ROUND);

    expect(result).toEqual({ success: false, error: 'Player profile not found' });
    expect(recordWorkflow).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'player_not_found' }));
  });

  it('records outcome:"stale_round_state" (not db_error) for the ordinary already-finished/removed race — the 0-row delete', async () => {
    // A round that does not match (wrong id, already submitted, or someone
    // else's) — the fake's delete().eq(...).select('id') resolves an empty
    // array, exactly the 0-row-delete shape the function's own comment
    // documents as an "ordinary race", not a system fault.
    const result = await deleteInProgressRound(OTHER_ROUND);

    expect(result.success).toBe(false);
    expect(recordWorkflow).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'stale_round_state' }));
    expect(helmLog.warn).toHaveBeenCalledWith(
      'golf.round_lifecycle.finished',
      expect.objectContaining({ result: 'stale_round_state' }),
    );
    // Distinguishing transient/expected from a terminal system failure is
    // exactly the point: this outcome must never read as 'db_error'.
    expect(recordWorkflow).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'db_error' }));
  });

  it('records outcome:"exception" and logs at warn when an unexpected throw reaches the catch block', async () => {
    revalidatePathImpl = () => {
      throw new Error('cache layer unavailable');
    };

    const result = await deleteInProgressRound(ROUND);

    expect(result.success).toBe(false);
    expect(recordWorkflow).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'exception' }));
    expect(helmLog.warn).toHaveBeenCalledWith(
      'golf.round_lifecycle.finished',
      expect.objectContaining({ result: 'exception' }),
    );
  });
});
