/**
 * P-5: the four tournament actions. The flag is checked before any read; then signed in, zod, verifyTeamAccess and
 * the RPC through the request's client. Every refusal comes back as `code` beside its copy. A create with RSVP on
 * writes R1's Bell rows (never attendance) and fans out once; a replay, or the 23505 re-read, sends nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

const m = vi.hoisted(() => ({
  flag: true,
  access: true,
  rpc: {} as Record<string, (args: unknown) => { data: unknown; error: unknown }>,
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  reads: 0,
  after: [] as Array<() => unknown>,
  notices: vi.fn(async (_p: unknown) => {}),
  notifyUpdate: vi.fn(async (_id: string) => {}),
  fanInvite: vi.fn(async (_p: unknown) => {}),
  fanCancel: vi.fn(async (_p: unknown) => {}),
  revalidate: vi.fn(),
}));

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => id === 'golf_tournaments_v1' && m.flag }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyTeamAccess: vi.fn(async () => (m.access ? { allowed: true, reason: 'coach', coachId: 'c1' } : { allowed: false })) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('next/server', () => ({ after: (cb: () => unknown) => void m.after.push(cb) }));
vi.mock('next/cache', () => ({ revalidatePath: m.revalidate, updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/calendar/rsvp', () => ({ writeEventInvitationNotices: m.notices, notifyEventUpdate: m.notifyUpdate, sendEventInvitations: vi.fn(() => { throw new Error('never called'); }) }));
vi.mock('@/lib/calendar/fan-out', () => ({ fanOutEventInvitation: m.fanInvite, fanOutEventCancelled: m.fanCancel }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    m.reads++;
    const fake = createFakeSupabase({ user: { id: 'u-coach' }, tables: m.tables });
    return {
      ...fake,
      rpc: async (name: string, args: unknown) => {
        m.rpcCalls.push({ name, args });
        const h = m.rpc[name];
        return h ? h(args) : { data: null, error: { message: 'no handler' } };
      },
    };
  }),
}));

import { createTournamentFromCalendar, setTournamentCancelled, untrackTournament, updateTournamentRound } from '../tournaments-calendar';

const TEAM = '00000000-0000-4000-8000-0000000000aa';
const REQ = '00000000-0000-4000-8000-0000000000a1';
const TID = '00000000-0000-4000-8000-0000000000b1';
const R1 = '00000000-0000-4000-8000-0000000000e1';
const R2 = '00000000-0000-4000-8000-0000000000e2';
const R3 = '00000000-0000-4000-8000-0000000000e3';
const P1 = '00000000-0000-4000-8000-0000000000d1';

const input = (over: Record<string, unknown> = {}) => ({
  teamId: TEAM,
  requestId: REQ,
  name: 'Pinehurst Invitational',
  courseLabel: 'Pinehurst No. 2',
  format: '5c4' as const,
  holesPerRound: 18 as const,
  rounds: [
    { date: '2026-11-05', startAt: '2026-11-05T08:42:00-05:00', allDay: false, startType: 'tee_times' as const },
    { date: '2026-11-06', startAt: '2026-11-06T00:00:00+00:00', allDay: true, startType: 'tee_times' as const },
    { date: '2026-11-07', startAt: '2026-11-07T00:00:00+00:00', allDay: true, startType: 'tee_times' as const },
  ],
  requiresRsvp: false,
  attendeeIds: [P1],
  ...over,
});
const made = (replayed = false) => ({ data: { tournament_id: TID, version: 1, replayed, rounds: [R1, R2, R3].map((event_id, i) => ({ round_number: i + 1, event_id })) }, error: null });

beforeEach(() => {
  m.flag = true;
  m.access = true;
  m.rpc = {};
  m.rpcCalls = [];
  m.reads = 0;
  m.after = [];
  m.tables = {
    golf_events: [{ id: R1, title: 'Pinehurst Invitational · R1', location: 'Pinehurst No. 2', requires_rsvp: true, start_time: '2026-11-05T13:42:00Z' }, { id: R2, title: 'Pinehurst Invitational · R2', location: 'Pinehurst No. 2', requires_rsvp: true, start_time: '2026-11-06T00:00:00Z' }],
    golf_event_attendance: [{ event_id: R1, player_id: P1 }],
    golf_players: [{ id: P1, user_id: 'u-p1' }],
    golf_tournaments: [{ id: TID, team_id: TEAM, name: 'Pinehurst Invitational', version: 4, request_id: REQ }],
    golf_tournament_rounds: [
      { round_event_id: R1, tournament_id: TID, team_id: TEAM, round_number: 1 },
      { round_event_id: R2, tournament_id: TID, team_id: TEAM, round_number: 2 },
    ],
  };
  vi.clearAllMocks();
});

describe('the flag comes first', () => {
  it('with golf_tournaments_v1 off, every action refuses before any read', async () => {
    m.flag = false;
    for (const r of [await createTournamentFromCalendar(input()), await updateTournamentRound(R2, {}, 1), await setTournamentCancelled(TID, null, true, null, 1), await untrackTournament(TID, 1)]) {
      expect(r).toMatchObject({ success: false, code: 'flag_off' });
    }
    expect(m.reads).toBe(0);
    expect(m.rpcCalls).toHaveLength(0);
  });
});

describe('createTournamentFromCalendar', () => {
  it('sends the payload as the RPC’s jsonb and returns the rounds', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => made();
    const r = await createTournamentFromCalendar(input());
    expect(r).toEqual({ success: true, data: { tournamentId: TID, version: 1, replayed: false, rounds: [{ roundNumber: 1, eventId: R1 }, { roundNumber: 2, eventId: R2 }, { roundNumber: 3, eventId: R3 }] } });
    const p = (m.rpcCalls[0]!.args as { p: Record<string, unknown> }).p;
    expect(p).toMatchObject({ team_id: TEAM, request_id: REQ, name: 'Pinehurst Invitational', course_label: 'Pinehurst No. 2', format: '5c4', holes_per_round: 18, event: { requires_rsvp: false, attendee_ids: [P1] } });
    expect((p.rounds as unknown[])[0]).toEqual({ date: '2026-11-05', start_at: '2026-11-05T08:42:00-05:00', all_day: false, start_type: 'tee_times' });
    expect(m.revalidate).toHaveBeenCalledWith('/golf/dashboard/calendar');
    expect(m.revalidate).toHaveBeenCalledWith('/golf/dashboard/tournaments');
    expect(m.revalidate).toHaveBeenCalledWith(`/golf/dashboard/tournaments/${TID}`);
  });

  it('RSVP off sends nothing', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => made();
    await createTournamentFromCalendar(input());
    expect(m.notices).not.toHaveBeenCalled();
    expect(m.after).toHaveLength(0);
  });

  it('RSVP on: R1’s Bell rows (one copy, reply for each round) and one fan-out, never sendEventInvitations', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => made();
    await createTournamentFromCalendar(input({ requiresRsvp: true }));
    expect(m.notices).toHaveBeenCalledTimes(1);
    expect(m.notices.mock.calls[0]![0]).toMatchObject({ eventId: R1, userIds: ['u-p1'], title: 'You’re invited: Pinehurst Invitational', message: 'Thu 5 to Sat 7 Nov at Pinehurst No. 2. Reply for each round.', refresh: false });
    expect(m.after).toHaveLength(1);
    await m.after[0]!();
    expect(m.fanInvite).toHaveBeenCalledTimes(1);
    expect(m.fanInvite.mock.calls[0]![0]).toMatchObject({ eventId: R1, title: 'Pinehurst Invitational' });
  });

  it('a convert refreshes R1’s Bell row', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => made();
    await createTournamentFromCalendar(input({ requiresRsvp: true, fromEventId: R1 }));
    expect(m.notices.mock.calls[0]![0]).toMatchObject({ refresh: true });
  });

  it('a replay sends nothing', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => made(true);
    const r = await createTournamentFromCalendar(input({ requiresRsvp: true }));
    expect(r).toMatchObject({ success: true, data: { replayed: true } });
    expect(m.notices).not.toHaveBeenCalled();
    expect(m.after).toHaveLength(0);
  });

  it('23505 on the request id re-reads the winner once: found on this team, success with nothing sent', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_tournaments_request_id_uq"' } });
    const r = await createTournamentFromCalendar(input({ requiresRsvp: true }));
    expect(r).toMatchObject({ success: true, data: { tournamentId: TID, version: 4, replayed: true } });
    expect(m.notices).not.toHaveBeenCalled();
  });

  it('23505 with no row to read back fails as nothing saved', async () => {
    m.tables.golf_tournaments = [];
    m.rpc.golf_tournament_create_from_calendar = () => ({ data: null, error: { code: '23505', message: 'duplicate key' } });
    expect(await createTournamentFromCalendar(input())).toEqual({ success: false, code: 'failed', error: 'Couldn’t set up the tournament. Nothing was saved.' });
  });

  it('retries once on a deadlock', async () => {
    let n = 0;
    m.rpc.golf_tournament_create_from_calendar = () => (++n === 1 ? { data: null, error: { code: '40P01', message: 'deadlock detected' } } : made());
    expect((await createTournamentFromCalendar(input())).success).toBe(true);
    expect(n).toBe(2);
  });

  it('zod refuses before the RPC: no course, a bad name, seven rounds, an http link', async () => {
    expect(await createTournamentFromCalendar(input({ courseLabel: undefined }))).toMatchObject({ success: false, code: 'bad_input' });
    expect(await createTournamentFromCalendar(input({ name: ' ' }))).toMatchObject({ success: false, code: 'bad_name' });
    const seven = Array.from({ length: 7 }, (_, i) => ({ date: `2026-12-0${i + 1}`, startAt: `2026-12-0${i + 1}T00:00:00+00:00`, allDay: true, startType: 'tee_times' }));
    expect(await createTournamentFromCalendar(input({ rounds: seven }))).toMatchObject({ success: false, code: 'round_count' });
    expect(await createTournamentFromCalendar(input({ resultsUrl: 'http://golfstat.com' }))).toMatchObject({ success: false, code: 'bad_input' });
    expect(m.rpcCalls).toHaveLength(0);
  });

  it('a coach not staffed on the team is refused before the RPC', async () => {
    m.access = false;
    expect(await createTournamentFromCalendar(input())).toMatchObject({ success: false, code: 'not_coach', error: 'Only coaches on this team can set up tournaments.' });
    expect(m.rpcCalls).toHaveLength(0);
  });

  const rows: Array<[string, string, string]> = [
    ['already_tracked', 'already_tracked', 'This event is already set up in Tournaments.'],
    ['event_is_series', 'event_is_series', 'A repeating event can’t become a tournament. Make a new event for it.'],
    ['event_cancelled', 'event_cancelled', 'A cancelled event can’t become a tournament. Restore it first.'],
    ['event_not_found', 'event_not_found', 'This event was deleted or moved to another team.'],
    ['round_order', 'round_order', 'Rounds go in order. This round can’t start before the round before it.'],
    ['round_count', 'round_count', 'A tournament has up to 6 rounds.'],
    ['bad_name', 'bad_name', 'Add a name for the tournament, up to 120 characters.'],
    ['qualifier_not_found', 'qualifier_not_found', 'That qualifier was deleted. Pick another or choose None.'],
    ['qualifier_linked', 'qualifier_linked', 'That qualifier already counts toward another event. Pick another or choose None.'],
    ['trip_not_found', 'trip_not_found', 'That trip is already linked to another event. Pick another or choose None.'],
    ['entries_unavailable', 'entries_unavailable', 'The lineup can’t be saved from here yet. Save without it.'],
    ['request_conflict', 'request_conflict', 'Couldn’t set up the tournament. Nothing was saved.'],
    ['something else', 'failed', 'Couldn’t set up the tournament. Nothing was saved.'],
  ];
  it.each(rows)('maps %s to its code and copy', async (raised, code, text) => {
    m.rpc.golf_tournament_create_from_calendar = () => ({ data: null, error: { code: 'P0001', message: raised } });
    expect(await createTournamentFromCalendar(input())).toEqual({ success: false, code, error: text });
  });

  it('maps 42501 to not_coach', async () => {
    m.rpc.golf_tournament_create_from_calendar = () => ({ data: null, error: { code: '42501', message: 'not_coach' } });
    expect(await createTournamentFromCalendar(input())).toMatchObject({ success: false, code: 'not_coach' });
  });
});

describe('updateTournamentRound', () => {
  it('sends the patch with the expected version and returns the new one', async () => {
    m.rpc.golf_tournament_update_round = () => ({ data: { version: 5, tee_times_shifted: 3, added_player_ids: [] }, error: null });
    const r = await updateTournamentRound(R2, { startAt: '2026-11-06T09:00:00-05:00', shiftTeeSheet: true, attendeeIds: [P1] }, 4);
    expect(r).toEqual({ success: true, data: { version: 5, teeTimesShifted: 3 } });
    expect(m.rpcCalls[0]!.args).toEqual({ p_round_event_id: R2, p: { start_at: '2026-11-06T09:00:00-05:00', shift_tee_sheet: true, attendee_ids: [P1] }, p_expected_version: 4 });
  });
  it('a day or time change notifies as a plain move does', async () => {
    m.rpc.golf_tournament_update_round = () => ({ data: { version: 5, tee_times_shifted: 0, added_player_ids: [] }, error: null });
    await updateTournamentRound(R2, { startAt: '2026-11-06T09:00:00-05:00' }, 4);
    expect(m.notifyUpdate).toHaveBeenCalledWith(R2, expect.anything());
    vi.clearAllMocks();
    await updateTournamentRound(R2, { description: 'Bus at 6' }, 5);
    expect(m.notifyUpdate).not.toHaveBeenCalled();
  });
  it('returns each refusal as its code, naming the round', async () => {
    for (const [raised, code, text] of [
      ['stale', 'stale', 'This tournament changed since you opened it. Reload to see the latest.'],
      ['round_started', 'round_started', 'R2 is under way, so it can’t be changed.'],
      ['round_order', 'round_order', 'Rounds go in order. R2 can’t start before the round before it.'],
      ['round_fields_locked', 'round_fields_locked', 'This event is part of the tournament. Its type, name and course can’t be changed from the calendar. Its day, times and notes are changed with Edit round.'],
      ['round_type_locked', 'round_type_locked', 'This event is part of the tournament. Its type, name and course can’t be changed from the calendar. Its day, times and notes are changed with Edit round.'],
    ] as const) {
      m.rpc.golf_tournament_update_round = () => ({ data: null, error: { code: 'P0001', message: raised } });
      expect(await updateTournamentRound(R2, { startAt: '2026-11-06T09:00:00-05:00' }, 4)).toEqual({ success: false, code, error: text });
    }
  });
  it('refuses a bad version before any RPC', async () => {
    expect(await updateTournamentRound(R2, {}, 0)).toMatchObject({ success: false, code: 'bad_input' });
    expect(m.rpcCalls).toHaveLength(0);
  });
});

describe('setTournamentCancelled', () => {
  it('cancelling a round tells its players once, through the shared cancel fan-out', async () => {
    m.rpc.golf_tournament_set_cancelled = () => ({ data: { version: 5, changed_event_ids: [R2] }, error: null });
    const r = await setTournamentCancelled(TID, R2, true, 'Rain', 4);
    expect(r).toEqual({ success: true, data: { version: 5, changedEventIds: [R2] } });
    await m.after[0]!();
    expect(m.fanCancel).toHaveBeenCalledTimes(1);
    expect(m.fanCancel.mock.calls[0]![0]).toMatchObject({ eventId: R2, title: 'Pinehurst Invitational · R2', reason: 'Rain', notifies: true });
  });
  it('cancelling the tournament sends one notice, in the tournament’s name', async () => {
    m.rpc.golf_tournament_set_cancelled = () => ({ data: { version: 5, changed_event_ids: [R1, R2] }, error: null });
    await setTournamentCancelled(TID, null, true, null, 4);
    expect(m.after).toHaveLength(1);
    await m.after[0]!();
    expect(m.fanCancel.mock.calls[0]![0]).toMatchObject({ eventId: R1, title: 'Pinehurst Invitational' });
  });
  it('a restore notifies nobody', async () => {
    m.rpc.golf_tournament_set_cancelled = () => ({ data: { version: 5, changed_event_ids: [R2] }, error: null });
    await setTournamentCancelled(TID, R2, false, null, 4);
    expect(m.after).toHaveLength(0);
  });
  it('maps refusals: scores, under way, and a restore out of order', async () => {
    m.rpc.golf_tournament_set_cancelled = () => ({ data: null, error: { code: 'P0001', message: 'round_has_scores' } });
    expect(await setTournamentCancelled(TID, R2, true, null, 4)).toEqual({ success: false, code: 'round_has_scores', error: 'R2 has scores, so it can’t be cancelled.' });
    m.rpc.golf_tournament_set_cancelled = () => ({ data: null, error: { code: 'P0001', message: 'round_order' } });
    expect(await setTournamentCancelled(TID, R2, false, null, 4)).toMatchObject({ success: false, code: 'round_order', error: expect.stringMatching(/^R2 can’t come back where it was/) });
  });
});

describe('untrackTournament', () => {
  it('calls the RPC with the version and maps official and scores', async () => {
    m.rpc.golf_tournament_untrack = () => ({ data: null, error: null });
    expect(await untrackTournament(TID, 4)).toEqual({ success: true, data: null });
    expect(m.rpcCalls[0]!.args).toEqual({ p_tournament_id: TID, p_expected_version: 4 });
    m.rpc.golf_tournament_untrack = () => ({ data: null, error: { code: 'P0001', message: 'tournament_official' } });
    expect(await untrackTournament(TID, 4)).toEqual({ success: false, code: 'tournament_official', error: 'This tournament’s results are official, so it can’t stop being tracked.' });
    m.rpc.golf_tournament_untrack = () => ({ data: null, error: { code: 'P0001', message: 'round_has_scores' } });
    expect(await untrackTournament(TID, 4)).toMatchObject({ code: 'round_has_scores', error: 'Scores are entered for this tournament, so it stays tracked.' });
  });
});
