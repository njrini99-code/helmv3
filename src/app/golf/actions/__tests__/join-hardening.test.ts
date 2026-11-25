/**
 * @vitest-environment node
 *
 * Joining a team, hardened: a code is taken the way people write it, and a player who could not be added is told why
 * (the finish screen turns that into what to do next). Synthetic ids only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: ReturnType<typeof createFakeSupabase>;
const lookups: unknown[] = [];

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => 'team-1' }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { processGolfTeamInvitation } from '../teams';

describe('processGolfTeamInvitation takes the code as people write it', () => {
  beforeEach(() => {
    lookups.length = 0;
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {},
      rpc: {
        golf_team_by_join_code: async (args) => {
          lookups.push(args);
          return { data: [], error: null };
        },
      },
    });
  });

  it.each([
    ['k7pq-x4mn', 'K7PQX4MN'],
    [' K7PQ X4MN ', 'K7PQX4MN'],
    ['k7pqx4mn', 'K7PQX4MN'],
  ])('%j is looked up as %s', async (typed, code) => {
    const r = await processGolfTeamInvitation(typed, 'player-1');
    expect(lookups).toEqual([{ p_code: code }]);
    // A code that names no team ends with a reason the finish screen can act on.
    expect(r).toEqual({ success: false, error: 'Invalid join code' });
  });
});
