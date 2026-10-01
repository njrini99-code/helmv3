/**
 * @vitest-environment node
 *
 * C-8. getPlayerQualifiers folded a failed entries read into `{ success: true, data: [] }`, so a transient error
 * looked exactly like "you are in no qualifiers": the picker rendered empty with no notice and no retry. A failed read
 * must be success:false (callers already show their "didn't load" notice for that); a real empty answer stays success.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;
let entriesError: unknown = null;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
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
vi.mock('@/lib/auth/resilient-get-user', () => ({
  getUserResilient: vi.fn(async () => ({ user: { id: 'u-p1' }, degraded: false })),
}));

import { getPlayerQualifiers } from '../golf';

const QUALIFIER = '33333333-3333-4333-8333-333333333333';

function world(entries: Array<Record<string, unknown>>) {
  const real = createFakeSupabase({
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_qualifier_entries: entries,
      golf_rounds: [],
    },
  });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table !== 'golf_qualifier_entries' || !entriesError) return b;
      const failing: Record<string, unknown> = {};
      Object.assign(failing, {
        eq: () => failing,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: entriesError }).then(resolve),
      });
      return { ...b, select: () => failing };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entriesError = null;
});

describe('getPlayerQualifiers (C-8)', () => {
  it('reports a failed entries read as a failure, not as an empty list', async () => {
    entriesError = { code: '57014', message: 'canceling statement due to statement timeout' };
    world([{ id: 'e1', qualifier_id: QUALIFIER, player_id: 'player-1' }]);

    const result = (await getPlayerQualifiers()) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Failed to load your qualifiers/);
  });

  it('still answers success with an empty list when the player is genuinely in no qualifiers', async () => {
    world([]);
    expect(await getPlayerQualifiers()).toEqual({ success: true, data: [] });
  });
});
