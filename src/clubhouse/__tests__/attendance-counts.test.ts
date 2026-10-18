import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Migration 20261017102000: a player reads only their own golf_event_attendance row, so the counts a player's screens
 * show come from golf_event_attendance_counts. Each loader is checked on both paths: the function (counts, no teammate
 * rows read) and the fallback while it is not applied yet (PGRST202 / 42883: today's direct read, unchanged). A coach
 * keeps the direct read.
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: false })) }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { loadAttendanceCounts } from '../data/attendance-counts';
import { loadClubhouseShell } from '../data/shell';
import { loadHomeWeek } from '../data/home';
import { loadPlayerHome } from '../data/player-home';
import { loadCalendar } from '../data/calendar';
import { confirmedLine, inviteDetail } from '../screens/home/model';

type Filters = Array<[string, unknown[]]>;

/** Answers that record which tables (and RPCs) were asked, and with what. */
function serve(answers: import('./supabase-fake').ChFakeTables) {
  const asked: Record<string, Filters[]> = {};
  tables.current = Object.fromEntries(
    Object.entries(answers).map(([name, answer]) => [
      name,
      (filters: Filters) => {
        (asked[name] ??= []).push(filters);
        return typeof answer === 'function' ? answer(filters) : answer;
      },
    ]),
  );
  return asked;
}

const counts = (rows: Array<{ event_id: string; invited: number; accepted: number; declined?: number; pending?: number; coach_invited?: number }>) => ({
  data: rows.map((r) => ({ declined: 0, pending: 0, ...r })),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
  logServer.mockClear();
});
afterEach(() => {
  tables.current = {};
  vi.useRealTimers();
});

describe('loadAttendanceCounts', () => {
  it('maps the function rows by event, and asks for each id once', async () => {
    const asked = serve({ 'rpc:golf_event_attendance_counts': counts([{ event_id: 'e1', invited: 4, accepted: 1, declined: 1, pending: 1, coach_invited: 3 }]) });
    const res = await loadAttendanceCounts(await createClient(), ['e1', 'e1', 'e2']);
    expect(res).toEqual({ kind: 'ok', byEvent: new Map([['e1', { invited: 4, accepted: 1, declined: 1, pending: 1, coachInvited: 3 }]]) });
    expect(asked['rpc:golf_event_attendance_counts']![0]).toEqual([['args', [{ p_event_ids: ['e1', 'e2'] }]]]);
  });

  it('reads as not deployed on PGRST202 and on 42883, and as a failed read on anything else', async () => {
    serve({});
    expect((await loadAttendanceCounts(await createClient(), ['e1'])).kind).toBe('missing');
    serve({ 'rpc:golf_event_attendance_counts': { error: { code: '42883', message: 'function does not exist' } } });
    expect((await loadAttendanceCounts(await createClient(), ['e1'])).kind).toBe('missing');
    serve({ 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } });
    expect((await loadAttendanceCounts(await createClient(), ['e1'])).kind).toBe('error');
  });

  it('asks for nothing when there are no events', async () => {
    const asked = serve({ 'rpc:golf_event_attendance_counts': counts([]) });
    expect(await loadAttendanceCounts(await createClient(), [])).toEqual({ kind: 'ok', byEvent: new Map() });
    expect(asked['rpc:golf_event_attendance_counts']).toBeUndefined();
  });
});

describe('Home lines from a count (no identities)', () => {
  it('inviteDetail and confirmedLine read a count the way they read a list a player is given no names for', () => {
    const none = new Map<string, string>();
    for (const n of [0, 1, 2, 3, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      expect(inviteDetail({ location: 'Range', title: '1:1 with p0', invitees: n, names: none })).toBe(inviteDetail({ location: 'Range', title: '1:1 with p0', invitees: ids, names: none }));
      expect(confirmedLine(n, 1)).toBe(confirmedLine(ids, 1));
    }
    expect(inviteDetail({ location: null, title: 'Film', invitees: 1, names: none })).toBe('1 player');
    expect(confirmedLine(0, 0)).toBeNull();
  });
});

describe('Shell next-event card', () => {
  const next = { data: [{ id: 'e1', title: 'Qualifier', start_time: '2026-10-16T14:00:00Z', all_day: false, location: 'Pines', event_type: 'qualifier', requires_rsvp: true }] };
  const rows = { data: [{ status: 'accepted' }, { status: 'accepted' }, { status: 'pending' }] };

  it('a player: the confirmed count comes from the function, and no attendance row is read', async () => {
    const asked = serve({ golf_events: next, golf_event_attendance: rows, 'rpc:golf_event_attendance_counts': counts([{ event_id: 'e1', invited: 6, accepted: 5 }]) });
    const shell = await loadClubhouseShell('t1', 'p1', null);
    expect(shell.nextEvent?.ready).toEqual({ accepted: 5, invited: 6 });
    expect(asked.golf_event_attendance).toBeUndefined();
  });

  it('a player, before the migration: the rows are read as before', async () => {
    const asked = serve({ golf_events: next, golf_event_attendance: rows });
    const shell = await loadClubhouseShell('t1', 'p1', null);
    expect(shell.nextEvent?.ready).toEqual({ accepted: 2, invited: 3 });
    expect(asked.golf_event_attendance).toHaveLength(1);
  });

  it('a player whose count fails: no confirmed line, logged, and no fallback read', async () => {
    const asked = serve({ golf_events: next, golf_event_attendance: rows, 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } });
    const shell = await loadClubhouseShell('t1', 'p1', null);
    expect(shell.nextEvent?.ready).toBeNull();
    expect(logServer).toHaveBeenCalledWith('shell', 'nextEventAttendance', expect.anything(), 'calendar');
    expect(asked.golf_event_attendance).toBeUndefined();
  });

  it('a coach keeps the direct read even when the function exists', async () => {
    const asked = serve({ golf_events: next, golf_event_attendance: rows, 'rpc:golf_event_attendance_counts': counts([{ event_id: 'e1', invited: 9, accepted: 9 }]) });
    const shell = await loadClubhouseShell('t1', null, 'c1');
    expect(shell.nextEvent?.ready).toEqual({ accepted: 2, invited: 3 });
    expect(asked['rpc:golf_event_attendance_counts']).toBeUndefined();
  });
});

describe('Player Home week', () => {
  // Wednesday 14 Oct 2026, noon in New York.
  const practice = { id: 'e1', title: 'Practice', event_type: 'practice', start_time: '2026-10-14T19:00:00Z', end_time: '2026-10-14T21:00:00Z', all_day: false, location: 'Range', requires_rsvp: true };
  const qualifier = { id: 'q1', title: 'Fall qualifier', event_type: 'qualifier', start_time: '2026-10-16T13:00:00Z', end_time: '2026-10-16T20:00:00Z', all_day: false, location: 'Pines', requires_rsvp: true };
  const events = { data: [practice, qualifier] };
  // Three invited to the practice (one is the viewer), two to the qualifier with one yes.
  const rows = {
    data: [
      { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'accepted' },
      { id: 'a2', event_id: 'e1', player_id: 'p2', status: 'pending' },
      { id: 'a3', event_id: 'e1', player_id: 'p3', status: 'declined' },
      { id: 'a4', event_id: 'q1', player_id: 'p2', status: 'accepted' },
      { id: 'a5', event_id: 'q1', player_id: 'p3', status: null },
    ],
  };
  const fnCounts = counts([
    { event_id: 'e1', invited: 3, accepted: 1, declined: 1, pending: 1 },
    { event_id: 'q1', invited: 2, accepted: 1, pending: 1 },
  ]);
  const week = async () => loadHomeWeek(await createClient(), { teamId: 't1', tz: 'America/New_York', now: new Date(), names: new Map(), viewer: 'player' });

  it('the function path shows the same lines as the rows did, reads no attendance row, and carries no teammate id', async () => {
    serve({ golf_events: events, golf_event_attendance: rows });
    const before = await week();
    const asked = serve({ golf_events: events, golf_event_attendance: rows, 'rpc:golf_event_attendance_counts': fnCounts });
    const after = await week();
    expect(asked.golf_event_attendance).toBeUndefined();
    expect(after.week.agenda).toEqual(before.week.agenda);
    expect(after.week.agenda.map((r) => r.detail)).toEqual(['Range · 3 players', 'First tee 9:00 · 1 of 2 confirmed']);
    const phone = after.todayEvents[0]!;
    expect(phone).toMatchObject({ invitees: [], going: null, awaiting: [], inviteeIds: null, invitedCount: 3 });
    expect(JSON.stringify(after)).not.toMatch(/"p[23]"/);
    // The rows' path, by contrast, carried every invitee's id.
    expect(before.todayEvents[0]!.inviteeIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('a failed count drops the counts (never "0 players") and does not fall back to the rows', async () => {
    const asked = serve({ golf_events: events, golf_event_attendance: rows, 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } });
    const res = await week();
    expect(asked.golf_event_attendance).toBeUndefined();
    expect(res.week.agenda.map((r) => r.detail)).toEqual(['Range', 'First tee 9:00 · Pines']);
    expect(res.todayEvents[0]).toMatchObject({ invitees: null, invitedCount: null });
    expect(logServer).toHaveBeenCalledWith('home', 'attendance', expect.anything());
  });

  it('a coach (no viewer) keeps the rows and never calls the function', async () => {
    const asked = serve({ golf_events: events, golf_event_attendance: rows, 'rpc:golf_event_attendance_counts': fnCounts });
    const res = await loadHomeWeek(await createClient(), { teamId: 't1', tz: 'America/New_York', now: new Date(), names: new Map([['p2', 'Bo Fox']]) });
    expect(asked['rpc:golf_event_attendance_counts']).toBeUndefined();
    expect(res.todayEvents[0]!.inviteeIds).toEqual(['p1', 'p2', 'p3']);
    expect(res.todayEvents[0]!.awaiting).toEqual([{ id: 'p2', name: 'Bo Fox' }]);
  });

  describe('D2-8 on player Home: a meeting with no invitees is the coach’s own', () => {
    const meetings = {
      data: [
        { id: 'm-private', title: 'Parent call', event_type: 'meeting', start_time: '2026-10-14T19:00:00Z', end_time: '2026-10-14T19:30:00Z', all_day: false, location: null, requires_rsvp: false },
        { id: 'm-team', title: 'Captains', event_type: 'meeting', start_time: '2026-10-14T20:00:00Z', end_time: '2026-10-14T20:30:00Z', all_day: false, location: null, requires_rsvp: false },
      ],
    };
    const home = (extra: import('./supabase-fake').ChFakeTables) =>
      serve({
        golf_team_settings: { data: { timezone: 'America/New_York' } },
        golf_events: meetings,
        golf_rounds: { data: [] },
        golf_holes: { data: [] },
        golf_round_stats_cache: { data: [] },
        golf_pga_standards: { data: [] },
        golf_players: { data: { handicap_index: null, handicap: null } },
        golf_teams: { data: { gender: 'men', created_by: 'c1', organization_id: 'o1' } },
        golf_coaches: { data: [{ id: 'c1', user_id: 'u1' }] },
        ...extra,
      });

    it('with the function: hidden only when nobody is invited, even though the player reads no teammate row', async () => {
      // After the migration the player's own read would return nothing for a meeting they aren't on.
      home({ golf_event_attendance: { data: [] }, 'rpc:golf_event_attendance_counts': counts([{ event_id: 'm-private', invited: 0, accepted: 0 }, { event_id: 'm-team', invited: 2, accepted: 0, pending: 2 }]) });
      const res = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada' });
      expect(res.today.map((e) => e.id)).toEqual(['m-team']);
      expect(res.today[0]).not.toHaveProperty('inviteeIds');
    });

    it('before the migration: the rows decide, as before', async () => {
      home({ golf_event_attendance: { data: [{ id: 'a1', event_id: 'm-team', player_id: 'p2', status: null }] } });
      const res = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada' });
      expect(res.today.map((e) => e.id)).toEqual(['m-team']);
    });

    it('a failed count never hides a meeting', async () => {
      home({ golf_event_attendance: { data: [] }, 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } });
      const res = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Ada' });
      expect(res.today.map((e) => e.id)).toEqual(['m-private', 'm-team']);
    });
  });
});

describe('Player Calendar: D2-8 meetings', () => {
  const eventRow = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    title: `Event ${id}`,
    event_type: 'meeting',
    start_time: '2026-10-14T19:30:00Z',
    end_time: '2026-10-14T20:00:00Z',
    location: 'Team room',
    description: null,
    status: 'confirmed',
    all_day: false,
    recurrence_rule: null,
    parent_event_id: null,
    requires_rsvp: true,
    ...over,
  });
  const base = {
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_teams: { data: { name: 'Varsity' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Ana', last_name: 'Ruiz', graduation_year: 2027 } }, { player: { id: 'p2', first_name: 'Ben', last_name: 'Cole', graduation_year: 2027 } }] },
    golf_events: { data: [eventRow('m-private', { title: 'Parent call' }), eventRow('m-others'), eventRow('m-mine'), eventRow('e1', { event_type: 'practice' })] },
    golf_player_classes: { data: [] },
  };
  const load = () => loadCalendar({ role: 'player', teamId: 't1', viewerPlayerId: 'p1', coachId: null, view: 'week', date: '2026-10-14' });
  // After the migration the player's read returns only their own row.
  const ownRows = { data: [{ id: 'r1', event_id: 'm-mine', player_id: 'p1', status: 'accepted' }] };

  it('with the function: a meeting that invites teammates but not the player still shows; one with no invitees does not', async () => {
    const asked = serve({
      ...base,
      golf_event_attendance: ownRows,
      'rpc:golf_event_attendance_counts': counts([
        { event_id: 'm-private', invited: 0, accepted: 0 },
        // The coach invited these (coach_invited); m-others is not open to the rest of the team.
        { event_id: 'm-others', invited: 2, accepted: 1, pending: 1, coach_invited: 2 },
        { event_id: 'm-mine', invited: 1, accepted: 1, coach_invited: 1 },
      ]),
    });
    const res = await load();
    expect(res.events.map((e) => e.id).sort()).toEqual(['e1', 'm-mine', 'm-others']);
    // Meetings are counted, and so is an event that asks for replies (e1: invited by no one, so open to the team); the
    // player's own place and reply still come from their row.
    expect(asked['rpc:golf_event_attendance_counts']![0]).toEqual([['args', [{ p_event_ids: ['m-private', 'm-others', 'm-mine', 'e1'] }]]]);
    expect(res.events.find((e) => e.id === 'e1')!.openReply).toBe(true);
    expect(res.events.find((e) => e.id === 'm-others')!.openReply).toBe(false);
    const mine = res.events.find((e) => e.id === 'm-mine')!;
    expect([mine.people, mine.rsvp]).toEqual([['p1'], { p1: 'accepted' }]);
  });

  it('before the migration: the rows decide, as before', async () => {
    serve({ ...base, golf_event_attendance: { data: [...ownRows.data, { id: 'r2', event_id: 'm-others', player_id: 'p2', status: null }] } });
    expect((await load()).events.map((e) => e.id).sort()).toEqual(['e1', 'm-mine', 'm-others']);
  });

  it('a failed count never hides a meeting', async () => {
    serve({ ...base, golf_event_attendance: ownRows, 'rpc:golf_event_attendance_counts': { error: { code: '57014', message: 'timeout' } } });
    expect((await load()).events.map((e) => e.id).sort()).toEqual(['e1', 'm-mine', 'm-others', 'm-private']);
    expect(logServer).toHaveBeenCalledWith('calendar', 'meetingInvites', expect.anything(), 'calendar');
  });

  it('a coach never calls the function', async () => {
    const asked = serve({ ...base, golf_event_attendance: ownRows, 'rpc:golf_event_attendance_counts': counts([]) });
    await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, coachId: 'c1', view: 'week', date: '2026-10-14' });
    expect(asked['rpc:golf_event_attendance_counts']).toBeUndefined();
  });
});
