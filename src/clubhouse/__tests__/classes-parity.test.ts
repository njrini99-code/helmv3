import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Classes parity, 2026-10-17 audit: the team events a class is checked against are the ones the player's Calendar
 * shows. D2-8 (owner, 2026-10-08): a meeting that invites no one is the coach's own, and a player never sees it, so no
 * class is said to meet over it (its title is never on this page either). Clock: the sample day, 2026-10-14.
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

describe('Classes parity · the week’s team events follow the player’s Calendar (D2-8)', () => {
  it('with the count function: a meeting that invites no one is left out; one that invites teammates stays; other events are untouched', async () => {
    let asked: unknown = null;
    serve({
      'rpc:golf_event_attendance_counts': (f) => {
        asked = f[0]![1][0];
        return { data: [{ event_id: 'team', invited: 4, accepted: 1, declined: 0, pending: 3 }, { event_id: 'call', invited: 0, accepted: 0, declined: 0, pending: 0 }] };
      },
    });
    expect(await ids()).toEqual(['team', 'pr']);
    // Only the meetings are asked about.
    expect(asked).toEqual({ p_event_ids: ['call', 'team'] });
  });

  it('before migration 20261017102000 (no function): the attendance rows decide, as the Calendar’s do', async () => {
    let filters: Array<[string, unknown[]]> = [];
    serve({
      golf_event_attendance: (f) => {
        filters = f;
        return { data: [{ event_id: 'team' }] };
      },
    });
    expect(await ids()).toEqual(['team', 'pr']);
    expect(filters.find(([k]) => k === 'in')?.[1]).toEqual(['event_id', ['call', 'team']]);
  });

  it('a count or a row read that fails hides nothing, and is logged', async () => {
    serve({ 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } });
    expect(await ids()).toEqual(['call', 'team', 'pr']);
    expect(logServer).toHaveBeenCalledWith('classes', 'meetingInvites', expect.anything(), 'calendar');
    serve({ golf_event_attendance: { error: { message: 'boom' } } });
    expect(await ids()).toEqual(['call', 'team', 'pr']);
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
