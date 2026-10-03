/**
 * @vitest-environment node
 *
 * C-13. acceptJoinRequest added the player to the team and then marked the request approved, treating any update that
 * raised no error as done. An UPDATE that RLS (or a concurrent decision) filters to zero rows raises none, so the
 * request stayed 'pending' with the player already on the roster, and the coach was told it worked. The result must be
 * checked, and the answer must say the player WAS added.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;
let requestUpdate: 'works' | 'matches-nothing' | 'errors' = 'works';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => 'team-1' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { acceptJoinRequest } from '../teams';

type Row = Record<string, unknown>;

function world() {
  const tables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1', organization_id: 'org-1' }],
    golf_team_join_requests: [{ id: 'req-1', team_id: 'team-1', player_id: 'player-1', status: 'pending' }],
    golf_team_members: [],
  };
  const real = createFakeSupabase({ user: { id: 'user-1' }, tables });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table !== 'golf_team_join_requests' || requestUpdate === 'works') return b;
      return {
        ...b,
        update: () => {
          const n: Record<string, unknown> = {};
          const answer =
            requestUpdate === 'errors'
              ? { data: null, error: { code: '42501', message: 'permission denied' } }
              : { data: [], error: null };
          Object.assign(n, {
            eq: () => n,
            select: () => n,
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve),
          });
          return n;
        },
      };
    },
  };
  return tables;
}

beforeEach(() => {
  vi.clearAllMocks();
  requestUpdate = 'works';
});

describe('acceptJoinRequest checks the request update (C-13)', () => {
  it('adds the player and marks the request approved', async () => {
    const tables = world();
    expect(await acceptJoinRequest('req-1')).toEqual({ success: true });
    expect(tables.golf_team_members).toHaveLength(1);
    expect(tables.golf_team_join_requests![0]!.status).toBe('approved');
  });

  it('does not report success when the request update matched no row, and says the player was added', async () => {
    requestUpdate = 'matches-nothing';
    const tables = world();

    const result = await acceptJoinRequest('req-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/player was added to the team/);
    expect(tables.golf_team_join_requests![0]!.status).toBe('pending');
  });

  it('does not report success when the request update errors', async () => {
    requestUpdate = 'errors';
    world();
    const result = await acceptJoinRequest('req-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/player was added to the team/);
  });
});
