import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * getTravelerClassConflicts: Team Hub's Plan a trip asks which of the chosen travelers have a class during the trip (Q-84).
 * It is a read of student data, so the tests pin its scope (a coach staffed on the team, travelers on that roster, only the
 * chosen players asked about), its window (the team's wall clock, narrowed by the departure and return times), and what
 * leaves the server (the class and nothing else).
 */

const avail = vi.hoisted(() => {
  type Period = { start: Date; end: Date; type: 'event' | 'class' | 'blocked'; title?: string };
  const byUser = new Map<string, { periods: Period[]; partial: boolean }>();
  const getUserBusyPeriodsWithStatus = vi.fn(async (userId: string) => byUser.get(userId) ?? { periods: [], partial: false });
  const resolveTeamTimeZone = vi.fn(async () => 'America/New_York');
  return { byUser, getUserBusyPeriodsWithStatus, resolveTeamTimeZone };
});
vi.mock('@/lib/calendar/availability', () => ({
  getUserBusyPeriodsWithStatus: avail.getUserBusyPeriodsWithStatus,
  resolveTeamTimeZone: avail.resolveTeamTimeZone,
  periodsOverlap: (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end,
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

let fake: FakeSupabase;
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));

import { getTravelerClassConflicts } from '@/app/golf/actions/travel';

const TEAM_1 = '11111111-1111-4111-8111-111111111111';
const TEAM_2 = '22222222-2222-4222-8222-222222222222';
const P1 = 'a1111111-1111-4111-8111-111111111111';
const P2 = 'a2222222-2222-4222-8222-222222222222';
const P3 = 'a3333333-3333-4333-8333-333333333333';
const P_OTHER_TEAM = 'a4444444-4444-4444-8444-444444444444';
const P_NO_ACCOUNT = 'a5555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;
function tables(): Record<string, Row[]> {
  return {
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' },
      { id: 'coach-2', user_id: 'u-othercoach', organization_id: 'org-2' },
    ],
    golf_team_coach_staff: [
      { id: 'staff-1', team_id: TEAM_1, coach_id: 'coach-1' },
      { id: 'staff-2', team_id: TEAM_2, coach_id: 'coach-2' },
    ],
    golf_players: [
      { id: P1, user_id: 'u-p1' },
      { id: P2, user_id: 'u-p2' },
      { id: P3, user_id: 'u-p3' },
      { id: P_OTHER_TEAM, user_id: 'u-other' },
      { id: P_NO_ACCOUNT, user_id: null },
    ],
    golf_team_members: [
      { id: 'm1', team_id: TEAM_1, player_id: P1, status: 'active' },
      { id: 'm2', team_id: TEAM_1, player_id: P2, status: 'active' },
      { id: 'm3', team_id: TEAM_1, player_id: P3, status: 'active' },
      { id: 'm4', team_id: TEAM_2, player_id: P_OTHER_TEAM, status: 'active' },
      { id: 'm5', team_id: TEAM_1, player_id: P_NO_ACCOUNT, status: 'active' },
    ],
  };
}

const at = (iso: string) => new Date(iso);
/** 3:00 to 4:15 PM in New York on a day after daylight time ends (UTC-5). */
const chem = (day: string) => ({ start: at(`${day}T20:00:00Z`), end: at(`${day}T21:15:00Z`), type: 'class' as const, title: 'CHEM 102 lab' });

function as(userId: string | null, over: Record<string, Row[]> = {}) {
  fake = createFakeSupabase({ user: userId ? { id: userId } : null, tables: { ...tables(), ...over } });
  return fake;
}
const ask = (over: Partial<Parameters<typeof getTravelerClassConflicts>[0]> = {}) =>
  getTravelerClassConflicts({ teamId: TEAM_1, playerIds: [P1], fromDate: '2026-11-03', toDate: '2026-11-05', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  avail.byUser.clear();
  avail.resolveTeamTimeZone.mockResolvedValue('America/New_York');
});

describe('getTravelerClassConflicts: who may ask, and about whom', () => {
  it('refuses a caller who is not a coach, before any class is read', async () => {
    as('u-p1');
    const res = await ask();
    expect(res.success).toBe(false);
    expect(avail.getUserBusyPeriodsWithStatus).not.toHaveBeenCalled();
  });

  it('refuses a coach who is not staffed on the team', async () => {
    as('u-othercoach');
    const res = await ask();
    expect(res.success).toBe(false);
    expect(avail.getUserBusyPeriodsWithStatus).not.toHaveBeenCalled();
  });

  it('refuses an id list with someone who is not on this team’s active roster, and reads no one’s classes', async () => {
    as('u-coach');
    const res = await ask({ playerIds: [P1, P_OTHER_TEAM] });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/aren’t on this team/);
    expect(avail.getUserBusyPeriodsWithStatus).not.toHaveBeenCalled();
  });

  it('refuses a player who has left the team', async () => {
    as('u-coach', { golf_team_members: tables().golf_team_members!.map((m) => (m.player_id === P2 ? { ...m, status: 'removed' } : m)) });
    const res = await ask({ playerIds: [P2] });
    expect(res.success).toBe(false);
    expect(avail.getUserBusyPeriodsWithStatus).not.toHaveBeenCalled();
  });

  it('asks about the chosen travelers only, never a teammate who was not chosen', async () => {
    as('u-coach');
    await ask({ playerIds: [P1, P3] });
    const asked = avail.getUserBusyPeriodsWithStatus.mock.calls.map((c) => c[0]).sort();
    expect(asked).toEqual(['u-p1', 'u-p3']);
  });

  it('answers an empty list with nothing, without touching the database', async () => {
    as('u-coach');
    const res = await ask({ playerIds: [] });
    expect(res).toEqual({ success: true, data: { classes: [], partial: false } });
    expect(avail.getUserBusyPeriodsWithStatus).not.toHaveBeenCalled();
  });

  it('refuses malformed input and a trip of more than 45 days', async () => {
    as('u-coach');
    expect((await ask({ playerIds: ['not-a-uuid'] })).success).toBe(false);
    expect((await ask({ fromDate: 'Nov 3' })).success).toBe(false);
    expect((await ask({ fromDate: '2026-11-05', toDate: '2026-11-03' })).success).toBe(false);
    const long = await ask({ fromDate: '2026-11-01', toDate: '2027-01-05' });
    expect(long.success).toBe(false);
    expect(long.error).toMatch(/longer than 45 days/);
    expect(avail.getUserBusyPeriodsWithStatus).not.toHaveBeenCalled();
  });
});

describe('getTravelerClassConflicts: what it answers', () => {
  it('returns the class, its weekdays inside the trip and its hours in the team’s zone, and nothing else', async () => {
    as('u-coach');
    avail.byUser.set('u-p1', {
      partial: false,
      periods: [
        chem('2026-11-03'),
        chem('2026-11-05'),
        // Not a class (their own practice or a coach's block), and a class outside the trip: neither is reported.
        { start: at('2026-11-03T14:00:00Z'), end: at('2026-11-03T16:00:00Z'), type: 'event', title: 'Practice' },
        chem('2026-11-09'),
      ],
    });
    const res = await ask();
    expect(res).toEqual({ success: true, data: { classes: [{ playerId: P1, title: 'CHEM 102 lab', days: ['Tue', 'Thu'], time: '3:00–4:15 PM' }], partial: false } });
    // Exactly these four fields leave the server: no name, avatar, instructor, room or other busy time.
    expect(Object.keys(res.data!.classes[0]!).sort()).toEqual(['days', 'playerId', 'time', 'title']);
  });

  it('names a weekday once when the trip runs past a week, and keeps at most eight classes for a traveler', async () => {
    as('u-coach');
    const named = (title: string, day: string) => ({ ...chem(day), title });
    avail.byUser.set('u-p1', {
      partial: false,
      periods: [chem('2026-11-03'), chem('2026-11-10'), ...Array.from({ length: 10 }, (_, i) => named(`ELEC ${i}`, '2026-11-04'))],
    });
    const res = await ask({ toDate: '2026-11-10' });
    expect(res.data!.classes).toHaveLength(8);
    expect(res.data!.classes[0]).toEqual({ playerId: P1, title: 'CHEM 102 lab', days: ['Tue'], time: '3:00–4:15 PM' });
  });

  it('words a class that spans noon with both periods, and keeps two classes apart', async () => {
    as('u-coach');
    avail.byUser.set('u-p1', {
      partial: false,
      periods: [
        { start: at('2026-11-04T16:30:00Z'), end: at('2026-11-04T17:45:00Z'), type: 'class', title: 'MATH 210' },
        chem('2026-11-04'),
      ],
    });
    const res = await ask();
    expect(res.data!.classes.map((c) => [c.title, c.time])).toEqual([
      ['MATH 210', '11:30 AM–12:45 PM'],
      ['CHEM 102 lab', '3:00–4:15 PM'],
    ]);
  });

  it('asks for the trip in the team’s wall clock: midnight of the first day to midnight after the last', async () => {
    as('u-coach');
    await ask();
    const [, start, end] = avail.getUserBusyPeriodsWithStatus.mock.calls[0]! as unknown as [string, Date, Date];
    // New York is on standard time (UTC-5) from Nov 1, 2026.
    expect(start.toISOString()).toBe('2026-11-03T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-06T05:00:00.000Z');
  });

  it('narrows the window by the departure and return times: a class over before the bus left is not missed', async () => {
    as('u-coach');
    avail.byUser.set('u-p1', {
      partial: false,
      periods: [
        // 8:00 to 9:15 AM on the day the team leaves at noon, and 3:00 to 4:15 PM the same day.
        { start: at('2026-11-03T13:00:00Z'), end: at('2026-11-03T14:15:00Z'), type: 'class', title: 'ENG 101' },
        chem('2026-11-03'),
        // 3:00 to 4:15 PM on the day the team is back by 2:00 PM.
        chem('2026-11-05'),
      ],
    });
    const res = await ask({ fromTime: '12:00', toTime: '14:00' });
    const [, start, end] = avail.getUserBusyPeriodsWithStatus.mock.calls[0]! as unknown as [string, Date, Date];
    expect(start.toISOString()).toBe('2026-11-03T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-05T19:00:00.000Z');
    expect(res.data!.classes).toEqual([{ playerId: P1, title: 'CHEM 102 lab', days: ['Tue'], time: '3:00–4:15 PM' }]);
  });

  it('skips a player with no account (their classes are written by their own session) without calling the answer partial', async () => {
    as('u-coach');
    const res = await ask({ playerIds: [P1, P_NO_ACCOUNT] });
    expect(res.data).toEqual({ classes: [], partial: false });
    expect(avail.getUserBusyPeriodsWithStatus.mock.calls.map((c) => c[0])).toEqual(['u-p1']);
  });

  it('passes on that a read behind the answer failed, so the caller never shows an all-clear', async () => {
    as('u-coach');
    avail.byUser.set('u-p2', { periods: [], partial: true });
    const res = await ask({ playerIds: [P1, P2] });
    expect(res.data).toEqual({ classes: [], partial: true });
  });

  it('calls the answer partial when a traveler could not be read at all', async () => {
    const t = tables();
    as('u-coach', { golf_players: t.golf_players!.filter((p) => p.id !== P2) });
    const res = await ask({ playerIds: [P1, P2] });
    expect(res.data?.partial).toBe(true);
  });

  it('fails honestly when the roster read fails', async () => {
    as('u-coach');
    const from = fake.from.bind(fake);
    fake.from = ((table: string) => {
      if (table === 'golf_players') {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, { select: () => chain, in: () => chain, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'down' } }).then(r) });
        return chain;
      }
      return from(table);
    }) as typeof fake.from;
    const res = await ask();
    expect(res.success).toBe(false);
    expect(res.data).toBeUndefined();
  });
});
