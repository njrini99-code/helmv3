import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P001: the sidebar's next-event card follows the player's Calendar. D2-8 (owner 2026-10-08): a meeting nobody is
 * invited to is the coach's own. Decision B (owner, wave 7): a player sees a meeting only when they are invited, so a
 * player's card skips every other one for the next event the Calendar shows them. Before, the card named the coach's
 * private meeting, or a teammate's 1:1, and opened a Calendar where it is not drawn. A coach's card is unchanged.
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

/**
 * The player's attendance read in both states of migration 20261017102000: before it, RLS returns teammates' rows too
 * (unless the query asks for one player's); after it, only the player's own.
 */
type Row = { event_id: string; player_id: string; status: string | null };
const attendance = (rows: Row[], applied: boolean) => (filters: Array<[string, unknown[]]>) => {
  const pid = filters.find(([k, a]) => k === 'eq' && a[0] === 'player_id')?.[1][1];
  const visible = applied ? rows.filter((r) => r.player_id === 'p1') : rows;
  return { data: pid ? visible.filter((r) => r.player_id === pid) : visible };
};
const both = (rows: Row[], extra: import('./supabase-fake').ChFakeTables = {}) => [
  { golf_events: events, golf_event_attendance: attendance(rows, false), ...extra },
  { golf_events: events, golf_event_attendance: attendance(rows, true), 'rpc:golf_event_attendance_counts': counts([{ event_id: 'm1', invited: 0 }, { event_id: 'm2', invited: 1 }]), ...extra },
];

describe('Shell next-event card, Decision B (a player sees only the meetings they are invited to)', () => {
  it('skips a teammate’s 1:1 and the coach’s own meeting, before and after the migration, and never names them', async () => {
    // A teammate (p2) is on the 1:1; the player is on neither meeting.
    for (const t of both([{ event_id: 'm2', player_id: 'p2', status: 'pending' }])) {
      tables.current = t;
      const shell = await loadClubhouseShell('t1', 'p1', null);
      expect(shell.nextEvent?.id).toBe('e1');
      expect(JSON.stringify(shell)).not.toMatch(/Staff meeting|1:1/);
    }
  });

  it('a meeting the player is invited to is their next event, before and after the migration', async () => {
    for (const t of both([{ event_id: 'm2', player_id: 'p1', status: 'pending' }, { event_id: 'm2', player_id: 'p2', status: 'accepted' }])) {
      tables.current = t;
      expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.id).toBe('m2');
    }
  });

  it('their own reply failed to load: D2-8 alone decides, from the counts, and it is logged', async () => {
    tables.current = { golf_events: events, golf_event_attendance: { error: { code: '57014', message: 'timeout' } }, 'rpc:golf_event_attendance_counts': counts([{ event_id: 'm1', invited: 0 }, { event_id: 'm2', invited: 1 }]) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.id).toBe('m2');
    expect(logServer).toHaveBeenCalledWith('shell', 'nextEventOwnReply', expect.anything(), 'calendar');
  });

  it('their own reply and the count both failed: no meeting is their next event (fail closed), and both are logged', async () => {
    tables.current = { golf_events: events, golf_event_attendance: { error: { code: '57014', message: 'timeout' } }, 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } };
    const shell = await loadClubhouseShell('t1', 'p1', null);
    expect(shell.nextEvent?.id).toBe('e1');
    expect(JSON.stringify(shell)).not.toMatch(/Staff meeting|1:1/);
    expect(logServer).toHaveBeenCalledWith('shell', 'nextEventOwnReply', expect.anything(), 'calendar');
    expect(logServer).toHaveBeenCalledWith('shell', 'nextEventInvites', expect.anything(), 'calendar');
  });

  it('carries the player’s own reply: Reply needed while it is still open, You’re going once they said yes', async () => {
    const asks = { ...practice, requires_rsvp: true, rsvp_deadline: null };
    tables.current = { golf_events: { data: [asks] }, golf_event_attendance: attendance([{ event_id: 'e1', player_id: 'p1', status: 'pending' }], true), 'rpc:golf_event_attendance_counts': counts([{ event_id: 'e1', invited: 3 }]) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.mine).toBe('needed');
    tables.current = { ...tables.current, golf_event_attendance: attendance([{ event_id: 'e1', player_id: 'p1', status: 'accepted' }], true) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.mine).toBe('going');
    // Open to the whole team (the coach invited no one) and no row of theirs: asked too, as Home's Up next asks.
    tables.current = { ...tables.current, golf_event_attendance: attendance([], true), 'rpc:golf_event_attendance_counts': () => ({ data: [{ event_id: 'e1', invited: 2, accepted: 2, declined: 0, pending: 0, coach_invited: 0 }] }) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.mine).toBe('needed');
    // Invited by the coach, but not them: nothing to ask.
    tables.current = { ...tables.current, 'rpc:golf_event_attendance_counts': () => ({ data: [{ event_id: 'e1', invited: 2, accepted: 2, declined: 0, pending: 0, coach_invited: 2 }] }) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.mine).toBeNull();
    // Before the migration the rows say whether the coach invited anyone (notified_at).
    tables.current = { golf_events: { data: [asks] }, golf_event_attendance: attendance([{ event_id: 'e1', player_id: 'p2', status: 'accepted' }], false) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.mine).toBe('needed');
    // Past its deadline the server takes no reply, so none is asked for.
    tables.current = { ...tables.current, golf_events: { data: [{ ...asks, rsvp_deadline: '2026-10-14T12:00:00Z' }] }, golf_event_attendance: attendance([{ event_id: 'e1', player_id: 'p1', status: 'pending' }], true) };
    expect((await loadClubhouseShell('t1', 'p1', null)).nextEvent?.mine).toBeNull();
  });

  it('a coach still sees their own meeting first, with no invite or reply read', async () => {
    let asked = 0;
    tables.current = {
      golf_events: events,
      golf_event_attendance: () => {
        asked += 1;
        return { data: [] };
      },
      'rpc:golf_event_attendance_counts': () => {
        asked += 1;
        return counts([]);
      },
    };
    const shell = await loadClubhouseShell('t1', null, 'c1');
    expect(shell.nextEvent?.id).toBe('m1');
    expect(shell.nextEvent).not.toHaveProperty('mine');
    expect(asked).toBe(0);
  });
});
