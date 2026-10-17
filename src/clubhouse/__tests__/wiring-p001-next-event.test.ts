import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P001: the sidebar's next-event card follows the player's Calendar (D2-8, owner 2026-10-08): a meeting nobody is
 * invited to is the coach's own, so a player's card skips it for the next event the Calendar shows them. Before, the
 * card named the coach's private meeting and opened a Calendar where it is not drawn. A coach's card is unchanged.
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: false })) }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadClubhouseShell } from '../data/shell';

const staff = { id: 'm1', title: 'Staff meeting', start_time: '2026-10-15T14:00:00Z', all_day: false, location: null, event_type: 'meeting', requires_rsvp: false };
const oneOnOne = { id: 'm2', title: '1:1', start_time: '2026-10-15T16:00:00Z', all_day: false, location: null, event_type: 'meeting', requires_rsvp: false };
const practice = { id: 'e1', title: 'Practice', start_time: '2026-10-16T14:00:00Z', all_day: false, location: 'Range', event_type: 'practice', requires_rsvp: false };
const events = { data: [staff, oneOnOne, practice] };
const counts = (rows: Array<{ event_id: string; invited: number }>) => ({ data: rows.map((r) => ({ accepted: 0, declined: 0, pending: 0, ...r })) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
  logServer.mockClear();
});
afterEach(() => {
  tables.current = {};
  vi.useRealTimers();
});

describe('Shell next-event card, D2-8', () => {
  it('a player skips a meeting nobody is invited to, from the counts function', async () => {
    tables.current = { golf_events: events, 'rpc:golf_event_attendance_counts': counts([{ event_id: 'm1', invited: 0 }, { event_id: 'm2', invited: 1 }]) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.id).toBe('m2');
  });

  it('a player before the migration: the invite rows answer it', async () => {
    tables.current = { golf_events: { data: [staff, practice] }, golf_event_attendance: { data: [] } };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.id).toBe('e1');
  });

  it('a failed invite read never hides a meeting, and is logged', async () => {
    tables.current = { golf_events: events, 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.id).toBe('m1');
    expect(logServer).toHaveBeenCalledWith('shell', 'nextEventInvites', expect.anything(), 'calendar');
  });

  it('a coach still sees their own meeting first, with no invite read', async () => {
    let asked = 0;
    tables.current = {
      golf_events: events,
      'rpc:golf_event_attendance_counts': () => {
        asked += 1;
        return counts([]);
      },
    };
    expect((await loadClubhouseShell('t1', null, 'c1')).nextEvent?.id).toBe('m1');
    expect(asked).toBe(0);
  });
});
