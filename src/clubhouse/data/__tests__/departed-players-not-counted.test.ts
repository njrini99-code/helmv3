import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15, DF-C-06: "N of M going" counted players who had left the team. A departed player keeps
 * their golf_event_attendance rows, so Team Hub's RSVPs, Home's Waiting on, Calendar and Home's week counted them as
 * invited, going or unanswered (staging, 16 Nov: 66 events on one team and 41 on another carry such a row). On the
 * coach's Home the departed invitee had no name, so the card dropped "N of M going" altogether. Only today's roster
 * counts now; whether the coach invited anyone at all (`coachInvited`) still reads every row.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { attendanceFor, rsvpCounts } from '../hub';
import { loadHomeWeek } from '../home';
import { loadCalendar } from '../calendar';

// Friday 13 November 2026, 6 PM in New York.
const NOW = new Date('2026-11-13T23:00:00Z');
const TZ = 'America/New_York';

const qualifier = {
  id: 'e1',
  title: 'Qualifier',
  event_type: 'tournament',
  start_time: '2026-11-14T14:00:00Z',
  end_time: '2026-11-14T20:00:00Z',
  all_day: false,
  location: 'Pines',
  requires_rsvp: true,
  rsvp_deadline: null,
  status: 'scheduled',
  cancelled_at: null,
  team_id: 't1',
};
const ATTENDANCE = [
  { id: 'a1', event_id: 'e1', player_id: 'p1', status: 'accepted', notified_at: '2026-11-10T12:00:00Z' },
  { id: 'a2', event_id: 'e1', player_id: 'p2', status: 'pending', notified_at: '2026-11-10T12:00:00Z' },
  // Left the team in October; the row stayed.
  { id: 'a3', event_id: 'e1', player_id: 'gone', status: 'pending', notified_at: '2026-11-10T12:00:00Z' },
];
const ROSTER = [
  { status: 'active', availability: null, player: { id: 'p1', first_name: 'Theo', last_name: 'Lin', graduation_year: 2027, is_test: false } },
  { status: 'active', availability: null, player: { id: 'p2', first_name: 'Ava', last_name: 'Ross', graduation_year: 2028, is_test: false } },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  tables.current = {
    golf_team_settings: { data: { timezone: TZ } },
    golf_teams: { data: { name: 'Varsity' } },
    golf_team_members: { data: ROSTER },
    golf_events: { data: [qualifier] },
    golf_event_attendance: { data: ATTENDANCE },
    golf_travel_itineraries: { data: [] },
  };
});
afterEach(() => {
  vi.useRealTimers();
  tables.current = {};
});

describe('departed players are not counted (DF-C-06)', () => {
  it('Team Hub and Home’s Waiting on: the replies hold today’s roster only', async () => {
    const all = await attendanceFor(await createClient(), ['e1']);
    expect(rsvpCounts(all.byEvent.get('e1')!)).toEqual({ going: 1, maybe: 0, no: 0, none: 2 });
    const roster = await attendanceFor(await createClient(), ['e1'], new Set(['p1', 'p2']));
    expect(rsvpCounts(roster.byEvent.get('e1')!)).toEqual({ going: 1, maybe: 0, no: 0, none: 1 });
  });

  it('coach Home: "1 of 2 going", the unanswered named, and the card keeps its count', async () => {
    const names = new Map([['p1', 'Theo Lin'], ['p2', 'Ava Ross']]);
    const wk = await loadHomeWeek(await createClient(), { teamId: 't1', tz: TZ, now: NOW, names, members: Promise.resolve(new Set(names.keys())), viewer: 'coach' });
    const card = wk.next!;
    expect(card.id).toBe('e1');
    expect(card.invitedCount).toBe(2);
    expect(card.inviteeIds).toEqual(['p1', 'p2']);
    expect(card.going).toBe(1);
    expect(card.awaiting).toEqual([{ id: 'p2', name: 'Ava Ross' }]);
  });

  it('Calendar (coach): the event invites the two on the roster, and is still an invite list', async () => {
    const cal = await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, coachId: 'c1', view: 'week', date: '2026-11-14' });
    const ev = cal.events.find((e) => e.id === 'e1')!;
    expect(ev.people).toEqual(['p1', 'p2']);
    expect(ev.rsvp).toEqual({ p1: 'accepted', p2: 'pending' });
  });
});
