import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner decision 16 (B11): the palette's People works before Roster opens, from a list loaded with the shell data. Names and
 * ids only, a coach's only: the list rides every page's payload, so the loader rebuilds each row as `{ id, name }` and never
 * reads it for a player.
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: false })) }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadClubhouseShell } from '../data/shell';

beforeEach(() => logServer.mockClear());
afterEach(() => {
  tables.current = {};
});

const member = (id: string, first: string | null, last: string | null, extra: Record<string, unknown> = {}) => ({
  status: 'active',
  jersey_number: 7,
  player: { id, first_name: first, last_name: last, graduation_year: 2028, hometown: 'Austin', email: 'kid@example.com', ...extra },
});

describe('the palette people with the shell data', () => {
  it('a coach gets the team’s players as id and name, and nothing else about them', async () => {
    let filters: Array<[string, unknown[]]> = [];
    tables.current = {
      golf_team_members: (f) => {
        filters = f;
        return { data: [member('p1', 'Jonah', 'Okafor'), member('p2', 'Sofia', null), { status: 'active', player: null }] };
      },
    };
    const shell = await loadClubhouseShell('t1', null, 'c1');
    expect(shell.people).toEqual([
      { id: 'p1', name: 'Jonah Okafor' },
      { id: 'p2', name: 'Sofia' },
    ]);
    for (const p of shell.people ?? []) expect(Object.keys(p).sort()).toEqual(['id', 'name']);
    // The Roster's own set, on this team, and only the name columns asked for.
    expect(filters).toEqual(
      expect.arrayContaining([
        ['select', ['player:golf_players(id, first_name, last_name)']],
        ['eq', ['team_id', 't1']],
        ['in', ['status', ['active', 'inactive']]],
      ]),
    );
  });

  it('a player never reads it, and has none', async () => {
    let asked = 0;
    tables.current = {
      golf_team_members: () => {
        asked += 1;
        return { data: [member('p1', 'Jonah', 'Okafor')] };
      },
    };
    const shell = await loadClubhouseShell('t1', 'p9', null);
    expect(asked).toBe(0);
    expect(shell.people).toBeUndefined();
  });

  it('a failed read leaves none and is logged, and the rest of the shell still loads', async () => {
    tables.current = { golf_team_members: { error: { code: '57014', message: 'timeout' } }, golf_team_join_requests: { count: 2 } };
    const shell = await loadClubhouseShell('t1', null, 'c1');
    expect(shell.people).toBeNull();
    expect(shell.pendingJoinRequests).toBe(2);
    expect(logServer).toHaveBeenCalledWith('shell', 'palettePeople', expect.anything(), 'teams');
  });
});
