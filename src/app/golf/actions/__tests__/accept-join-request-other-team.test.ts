/**
 * @vitest-environment node
 *
 * P003. acceptJoinRequest's "already on a team" guard read golf_team_members
 * with the coach's session. RLS only shows a coach their OWN team's rows, so a
 * player rostered on ANOTHER team read as unattached and was approved onto a
 * second team. The guard now reads with the service-role client, scoped to
 * the request's player id, which it reads server-side from the request row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

type Row = Record<string, unknown>;

let sessionFake: unknown;
let adminFake: unknown;
let adminMembershipReads: Array<{ cols: string; filters: Array<[string, unknown]> }> = [];

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => sessionFake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminFake) }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => 'team-1' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { acceptJoinRequest } from '../teams';

function world(opts: { allMemberships: Row[]; adminFails?: boolean }) {
  adminMembershipReads = [];
  // What the coach's session can see: only their own team's roster.
  const sessionTables: Record<string, Row[]> = {
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1', organization_id: 'org-1' }],
    golf_team_join_requests: [{ id: 'req-1', team_id: 'team-1', player_id: 'player-1', status: 'pending' }],
    golf_team_members: opts.allMemberships.filter((m) => m.team_id === 'team-1'),
  };
  sessionFake = createFakeSupabase({ user: { id: 'user-1' }, tables: sessionTables });

  // What the service role sees: every team's roster.
  const adminTables: Record<string, Row[]> = {
    golf_team_members: [...opts.allMemberships],
    notifications: [],
  };
  const adminReal = createFakeSupabase({ tables: adminTables });
  adminFake = {
    ...adminReal,
    from: (table: string) => {
      const b = adminReal.from(table);
      if (table !== 'golf_team_members') return b;
      return {
        ...b,
        select: (cols: string) => {
          const read = { cols, filters: [] as Array<[string, unknown]> };
          adminMembershipReads.push(read);
          if (opts.adminFails) {
            const n: Record<string, unknown> = {};
            const answer = { data: null, error: { code: '57014', message: 'statement timeout' } };
            Object.assign(n, {
              eq: () => n,
              limit: () => n,
              then: (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve),
            });
            return n;
          }
          const q = b.select(cols);
          const origEq = q.eq.bind(q);
          q.eq = (col: string, value: unknown) => {
            read.filters.push([col, value]);
            return origEq(col, value);
          };
          return q;
        },
      };
    },
  };
  return { sessionTables, adminTables };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('acceptJoinRequest one-team guard sees every team (P003)', () => {
  it('refuses a player who is on another team the coach cannot see', async () => {
    const { sessionTables } = world({
      allMemberships: [{ id: 'm-other', team_id: 'team-2', player_id: 'player-1', status: 'active' }],
    });

    const result = await acceptJoinRequest('req-1');

    expect(result).toEqual({ success: false, error: 'Player has already joined another team' });
    // Not added to this team.
    expect(sessionTables.golf_team_members).toHaveLength(0);
    // The request is closed with the reason.
    expect(sessionTables.golf_team_join_requests![0]).toMatchObject({
      status: 'rejected',
      rejection_reason: 'Player is already on another team',
    });
  });

  it('scopes the admin read to the request’s player and selects only team_id', async () => {
    world({ allMemberships: [{ id: 'm-other', team_id: 'team-2', player_id: 'player-1' }] });
    await acceptJoinRequest('req-1');
    expect(adminMembershipReads).toEqual([{ cols: 'team_id', filters: [['player_id', 'player-1']] }]);
  });

  it('refuses a player with two memberships elsewhere with the same message', async () => {
    world({
      allMemberships: [
        { id: 'm-a', team_id: 'team-2', player_id: 'player-1' },
        { id: 'm-b', team_id: 'team-3', player_id: 'player-1' },
      ],
    });
    const result = await acceptJoinRequest('req-1');
    expect(result).toEqual({ success: false, error: 'Player has already joined another team' });
  });

  it('approves a player on no team', async () => {
    const { sessionTables } = world({
      allMemberships: [{ id: 'm-someone', team_id: 'team-2', player_id: 'player-9' }],
    });
    const result = await acceptJoinRequest('req-1');
    expect(result).toEqual({ success: true });
    expect(sessionTables.golf_team_members).toHaveLength(1);
    expect(sessionTables.golf_team_join_requests![0]!.status).toBe('approved');
  });

  it('declines rather than approving when the admin read fails', async () => {
    const { sessionTables } = world({ allMemberships: [], adminFails: true });
    const result = await acceptJoinRequest('req-1');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Couldn't confirm this player isn't already on a team/);
    expect(sessionTables.golf_team_members).toHaveLength(0);
  });
});
