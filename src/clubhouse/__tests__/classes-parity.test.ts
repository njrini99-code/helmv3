import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Classes parity, 2026-10-17 audit: the team events a class is checked against are the ones the player's Calendar
 * shows. Decision B (owner, wave 7): a player sees a meeting only when they are on its invite list; D2-8 (a meeting that
 * invites no one is the coach's own) decides only when their own rows didn't load. So no class is said to meet over a
 * meeting they aren't on, and its title is never on this page. Clock: the sample day, 2026-10-14.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadClasses } from '../data/classes';

const meeting = (id: string) => ({
  id,
  title: id === 'call' ? 'Parent call' : 'Team meeting',
  event_type: 'meeting',
  start_time: '2026-10-15T13:00:00Z',
  end_time: '2026-10-15T14:00:00Z',
  all_day: false,
  status: 'confirmed',
  location: null,
  description: null,
});
const practice = { ...meeting('pr'), id: 'pr', title: 'Practice', event_type: 'practice' };

function serve(extra: import('./supabase-fake').ChFakeTables = {}) {
  tables.current = {
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_player_classes: { data: [] },
    golf_events: { data: [meeting('call'), meeting('team'), practice] },
    ...extra,
  };
}
const ids = async () => (await loadClasses({ playerId: 'p1', teamId: 't1' })).week.events.map((e) => e.id);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
  logServer.mockClear();
});
afterEach(() => vi.useRealTimers());

type Row = { event_id: string; player_id: string };
/** The attendance table in both states of migration 20261017102000: before it a player's read returns teammates' rows too. */
const attendance = (rows: Row[], applied: boolean, seen?: Array<Array<[string, unknown[]]>>) => (f: Array<[string, unknown[]]>) => {
  seen?.push(f);
  const pid = f.find(([k, v]) => k === 'eq' && v[0] === 'player_id')?.[1][1];
  const visible = applied ? rows.filter((r) => r.player_id === 'p1') : rows;
  return { data: (pid ? visible.filter((r) => r.player_id === pid) : visible).map((r) => ({ ...r, status: null })) };
};
const failed = { error: { code: '57014', message: 'timeout' } };

describe('Classes parity · the week’s team events follow the player’s Calendar (Decision B, D2-8)', () => {
  it('only the meetings the player is invited to, before and after the migration; a teammate’s meeting and the coach’s own are left out', async () => {
    for (const applied of [false, true]) {
      const seen: Array<Array<[string, unknown[]]>> = [];
      serve({ golf_event_attendance: attendance([{ event_id: 'team', player_id: 'p2' }], applied, seen) });
      expect(await ids()).toEqual(['pr']);
      // Their own rows, for the meetings only.
      expect(seen[0]).toContainEqual(['eq', ['player_id', 'p1']]);
      expect(seen[0]!.find(([k]) => k === 'in')?.[1]).toEqual(['event_id', ['call', 'team']]);
      serve({ golf_event_attendance: attendance([{ event_id: 'team', player_id: 'p2' }, { event_id: 'team', player_id: 'p1' }], applied) });
      expect(await ids()).toEqual(['team', 'pr']);
    }
  });

  it('their own rows failed: D2-8 decides from the counts (logged); a meeting nobody is invited to stays out', async () => {
    serve({
      golf_event_attendance: failed,
      'rpc:golf_event_attendance_counts': { data: [{ event_id: 'team', invited: 4, accepted: 1, declined: 0, pending: 3, coach_invited: 4 }, { event_id: 'call', invited: 0, accepted: 0, declined: 0, pending: 0, coach_invited: 0 }] },
    });
    expect(await ids()).toEqual(['team', 'pr']);
    expect(logServer).toHaveBeenCalledWith('classes', 'ownInvites', expect.anything(), 'calendar');
  });

  it('their own rows and the count both failed: every meeting is left out (fail closed), and both are logged', async () => {
    serve({ golf_event_attendance: failed, 'rpc:golf_event_attendance_counts': failed });
    expect(await ids()).toEqual(['pr']);
    expect(logServer).toHaveBeenCalledWith('classes', 'ownInvites', expect.anything(), 'calendar');
    expect(logServer).toHaveBeenCalledWith('classes', 'meetingInvites', expect.anything(), 'calendar');
    // Before the migration (no function) the invite rows are the count; they failed too.
    serve({ golf_event_attendance: failed });
    expect(await ids()).toEqual(['pr']);
  });

  it('a week with no meetings asks nothing more', async () => {
    let read = false;
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_player_classes: { data: [] },
      golf_events: { data: [practice] },
      golf_event_attendance: () => ((read = true), { data: [] }),
      'rpc:golf_event_attendance_counts': () => ((read = true), { data: [] }),
    };
    expect(await ids()).toEqual(['pr']);
    expect(read).toBe(false);
  });
});
