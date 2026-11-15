import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Home's week read (audit 2026-11-13):
 * - F-0001: a trip with no calendar event of its own (Plan trip makes the link optional) is on Home as Team Hub has it:
 *   its days on the week strip, a row in Today and Up next. A trip whose event is on the calendar is drawn once, as
 *   that event; its days still carry the strip's travel mark, as Team Hub's do.
 * - F-0006: once this week has nothing left, Home names the next event after it instead of "No events scheduled".
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { loadHomeWeek } from '../home';

// Friday 13 November 2026, 6 PM in New York: the week runs Monday 9 to Sunday 15.
const NOW = new Date('2026-11-13T23:00:00Z');
const TZ = 'America/New_York';

const trip = (over: Record<string, unknown> = {}) => ({
  id: 'trip1',
  event_id: null,
  event_name: 'Fall Invitational',
  destination: 'Pinehurst',
  departure_date: '2026-11-13',
  departure_time: null,
  return_date: '2026-11-15',
  return_time: null,
  is_test: false,
  ...over,
});
const event = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  event_type: 'practice',
  start_time: '2026-11-13T19:00:00Z',
  end_time: '2026-11-13T21:00:00Z',
  all_day: false,
  location: 'Range',
  requires_rsvp: false,
  rsvp_deadline: null,
  ...over,
});

/** The week's events and the read past the widest window (the one with a `limit`) answer apart. */
function eventsAnswer(week: unknown[], after: unknown[] = []) {
  return (filters: Array<[string, unknown[]]>) => ({ data: filters.some(([k]) => k === 'limit') ? after : week });
}

const load = async (viewer: 'coach' | 'player' = 'coach') =>
  loadHomeWeek(await createClient(), { teamId: 't1', tz: TZ, now: NOW, names: new Map(), viewer, playerId: viewer === 'player' ? 'p1' : null });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logServer.mockClear();
});
afterEach(() => {
  tables.current = {};
  vi.useRealTimers();
});

describe('F-0001 · a trip with no calendar event', () => {
  it('is Up next and in Today while the team is on the road, and its days carry the travel mark', async () => {
    tables.current = { golf_events: { data: [] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip()] } };
    const wk = await load();
    expect(wk.week.error).toBe(false);
    expect(wk.next).toMatchObject({ type: 'travel', title: 'Fall Invitational', location: 'Pinehurst', date: '2026-11-13', allDay: true, trip: { id: 'trip1', leaves: null, back: '2026-11-15' } });
    expect(wk.next!.rangeLabel).toBe('Fri 13 – Sun 15 Nov');
    expect(wk.todayEvents.map((e) => e.title)).toEqual(['Fall Invitational']);
    expect(wk.week.days.map((d) => d.trip ?? null)).toEqual([null, null, null, null, 'Fall Invitational', 'Fall Invitational', 'Fall Invitational']);
    // A trip is not an event: the strip marks the day, it adds no event dot.
    expect(wk.week.days.every((d) => d.eventCount === 0)).toBe(true);
    expect(wk.week.agenda.map((r) => [r.title, r.timeLabel])).toEqual([['Fall Invitational', 'All day']]);
    // Nothing is asked of the trip that only an event has: no invite list, no replies.
    expect(wk.next!.invitees).toBeNull();
    expect(wk.next!.going).toBeNull();
  });

  it('a player sees it too (Team Hub shows every team member the team’s trips)', async () => {
    tables.current = { golf_events: { data: [] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip()] } };
    const wk = await load('player');
    expect(wk.next?.title).toBe('Fall Invitational');
    expect(wk.todayEvents).toHaveLength(1);
  });

  it('carries its departure time as an instant on the team’s clock, for the countdown to it', async () => {
    tables.current = { golf_events: { data: [] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip({ departure_date: '2026-11-14', departure_time: '07:30:00', return_date: '2026-11-15' })] } };
    const wk = await load();
    expect(wk.next?.trip).toEqual({ id: 'trip1', leaves: '2026-11-14T12:30:00.000Z', back: '2026-11-15' });
    expect(wk.todayEvents).toEqual([]);
  });

  it('a trip whose event is on the calendar is drawn once, as that event; the strip still marks its days', async () => {
    const tournament = event('ev-inv', { title: 'Fall Invitational', event_type: 'tournament', start_time: '2026-11-14T00:00:00Z', end_time: '2026-11-15T00:00:00Z', all_day: true, location: 'Pinehurst' });
    tables.current = { golf_events: { data: [tournament] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip({ event_id: 'ev-inv' })] } };
    const wk = await load();
    expect(wk.todayEvents).toEqual([]);
    expect(wk.next?.id).toBe('ev-inv');
    expect(wk.week.days.find((d) => d.date === '2026-11-13')?.trip).toBe('Fall Invitational');
  });

  it('gives Up next to an event still ahead today, and keeps the trip in Today', async () => {
    const round = event('practice-round', { title: 'Practice round', start_time: '2026-11-14T00:30:00Z', end_time: '2026-11-14T02:00:00Z' });
    tables.current = { golf_events: { data: [round] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip()] } };
    const wk = await load();
    expect(wk.next?.id).toBe('practice-round');
    expect(wk.todayEvents.map((e) => e.title)).toEqual(['Fall Invitational', 'Practice round']);
  });

  it('a test trip (is_test) is never shown, as on Team Hub', async () => {
    tables.current = { golf_events: { data: [] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip({ is_test: true })] } };
    const wk = await load();
    expect(wk.next).toBeNull();
    expect(wk.week.days.every((d) => !d.trip)).toBe(true);
  });

  it('a failed trips read is logged and the week stays as its events say', async () => {
    tables.current = { golf_events: { data: [event('e1', { start_time: '2026-11-14T15:00:00Z', end_time: '2026-11-14T17:00:00Z' })] }, golf_event_attendance: { data: [] }, golf_travel_itineraries: { error: { message: 'boom' } } };
    const wk = await load();
    expect(logServer).toHaveBeenCalledWith('home', 'trips', expect.anything());
    expect(wk.week.error).toBe(false);
    expect(wk.next?.id).toBe('e1');
  });
});

describe('F-0006 · nothing left this week', () => {
  it('names the next event after the week: one already in the read, past the week’s own window', async () => {
    // Tuesday 17 November, 2 PM in New York: past the week (and its day of slack), inside the widest window the events are read over.
    const confirm = event('confirm', { title: 'Confirm live check', event_type: 'meeting', start_time: '2026-11-17T19:00:00Z', end_time: '2026-11-17T20:00:00Z', location: 'Team room' });
    tables.current = { golf_events: { data: [confirm] }, golf_event_attendance: { data: [] } };
    const wk = await load();
    expect(wk.next).toBeNull();
    expect(wk.after).toMatchObject({ id: 'confirm', title: 'Confirm live check', type: 'meeting', date: '2026-11-17', startLabel: '2:00 PM', allDay: false });
  });

  it('names the next event further out, from the read past the widest window', async () => {
    const dinner = event('banquet', { title: 'Team banquet', event_type: 'other', start_time: '2026-12-04T23:30:00Z', end_time: '2026-12-05T01:30:00Z' });
    tables.current = { golf_events: eventsAnswer([], [dinner]), golf_event_attendance: { data: [] } };
    const wk = await load();
    expect(wk.after).toMatchObject({ id: 'banquet', date: '2026-12-04', startLabel: '6:30 PM' });
  });

  it('a trip after the week counts as what is next, when it comes first', async () => {
    const later = event('banquet', { title: 'Team banquet', event_type: 'other', start_time: '2026-12-04T23:30:00Z', end_time: null });
    tables.current = { golf_events: eventsAnswer([], [later]), golf_event_attendance: { data: [] }, golf_travel_itineraries: { data: [trip({ id: 'trip2', event_name: 'Ask check trip', departure_date: '2026-11-20', return_date: '2026-11-22' })] } };
    const wk = await load();
    expect(wk.after).toMatchObject({ type: 'travel', title: 'Ask check trip', date: '2026-11-20', trip: { id: 'trip2', back: '2026-11-22' } });
  });

  it('a player is not told of a meeting past the loaded window: their own replies reach only the window, so it fails closed (Decision B)', async () => {
    const confirm = event('confirm', { title: 'Confirm live check', event_type: 'meeting', start_time: '2026-11-17T19:00:00Z', end_time: '2026-11-17T20:00:00Z' });
    const practice = event('range', { title: 'Range session', start_time: '2026-11-18T20:00:00Z', end_time: '2026-11-18T22:00:00Z' });
    tables.current = { golf_events: { data: [confirm, practice] }, golf_event_attendance: { data: [] } };
    expect((await load('player')).after?.id).toBe('range');
    expect((await load('coach')).after?.id).toBe('confirm');
  });

  it('nothing ahead at all: no next and nothing after', async () => {
    tables.current = { golf_events: { data: [event('over', { start_time: '2026-11-13T14:00:00Z', end_time: '2026-11-13T16:00:00Z' })] }, golf_event_attendance: { data: [] } };
    const wk = await load();
    expect(wk.next).toBeNull();
    expect(wk.after).toBeNull();
  });

  it('with something left this week, nothing is named after it', async () => {
    tables.current = { golf_events: { data: [event('sat', { start_time: '2026-11-14T15:00:00Z', end_time: '2026-11-14T17:00:00Z' }), event('confirm', { start_time: '2026-11-17T19:00:00Z', end_time: null })] }, golf_event_attendance: { data: [] } };
    const wk = await load();
    expect(wk.next?.id).toBe('sat');
    expect(wk.after).toBeNull();
  });
});
