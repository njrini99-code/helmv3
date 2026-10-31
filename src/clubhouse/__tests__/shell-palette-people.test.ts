import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner decision 16 (B11): the palette's People works before Roster opens. Names and ids only, a coach's only, in memory
 * only: the loader rebuilds each row as `{ id, name }`, and it is read when the palette opens (the server action), never
 * with the shell, whose page HTML the service worker caches (security review, 2026-10-24).
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: false })) }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));
const team = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: async () => team.current }));

import { loadClubhouseShell } from '../data/shell';
import { getPalettePeople } from '../data/palette-people';

beforeEach(() => logServer.mockClear());
afterEach(() => {
  tables.current = {};
  session.current = null;
  team.current = null;
});

const member = (id: string, first: string | null, last: string | null, extra: Record<string, unknown> = {}) => ({
  status: 'active',
  jersey_number: 7,
  player: { id, first_name: first, last_name: last, graduation_year: 2028, hometown: 'Austin', email: 'kid@example.com', ...extra },
});

describe('the palette people, read when the palette opens', () => {
  const asCoach = () => {
    session.current = { coach: { id: 'c1' } };
    team.current = { role: 'coach', teamId: 't1', coachId: 'c1' };
  };

  it('a coach gets the team’s active players as id and name, and nothing else about them', async () => {
    asCoach();
    let filters: Array<[string, unknown[]]> = [];
    tables.current = {
      golf_team_members: (f) => {
        filters = f;
        return { data: [member('p1', 'Jonah', 'Okafor'), member('p2', 'Sofia', null), { status: 'active', player: null }] };
      },
    };
    const people = await getPalettePeople();
    expect(people).toEqual([
      { id: 'p1', name: 'Jonah Okafor' },
      { id: 'p2', name: 'Sofia' },
    ]);
    for (const p of people ?? []) expect(Object.keys(p).sort()).toEqual(['id', 'name']);
    // The team the server resolved, active members (RLS returns nothing for an inactive one), and only the name columns.
    expect(filters).toEqual(
      expect.arrayContaining([
        ['select', ['player:golf_players(id, first_name, last_name)']],
        ['eq', ['team_id', 't1']],
        ['eq', ['status', 'active']],
      ]),
    );
  });

  it('a player, or no session, never reads it and gets null', async () => {
    let asked = 0;
    tables.current = {
      golf_team_members: () => {
        asked += 1;
        return { data: [member('p1', 'Jonah', 'Okafor')] };
      },
    };
    expect(await getPalettePeople()).toBeNull();
    session.current = { player: { id: 'p9' } };
    team.current = { role: 'player', teamId: 't1', playerId: 'p9' };
    expect(await getPalettePeople()).toBeNull();
    expect(asked).toBe(0);
  });

  it('a failed read gives null and is logged', async () => {
    asCoach();
    tables.current = { golf_team_members: { error: { code: '57014', message: 'timeout' } } };
    expect(await getPalettePeople()).toBeNull();
    expect(logServer).toHaveBeenCalledWith('shell', 'palettePeople', expect.anything(), 'teams');
  });

  it('the shell never carries it, for a coach or a player (it rides every page, which the service worker caches)', async () => {
    let asked = 0;
    tables.current = {
      golf_team_members: () => {
        asked += 1;
        return { data: [member('p1', 'Jonah', 'Okafor')] };
      },
    };
    const coach = await loadClubhouseShell('t1', null, 'c1');
    const player = await loadClubhouseShell('t1', 'p9', null);
    expect(asked).toBe(0);
    expect('people' in coach).toBe(false);
    expect('people' in player).toBe(false);
  });
});
