import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Calendar parity with production (Fairway's calendar and the shared server actions), 2026-10-17 audit. Each case is a
 * difference that was found and fixed: the loader's rows, the payload the editor sends, and what the screen shows.
 * Mocks as in calendar.test.tsx; the clock is the sample day, 2026-10-14 18:40Z (2:40 PM in New York).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const a = vi.hoisted(() => ({
  createGolfEvent: vi.fn(),
  updateGolfEvent: vi.fn(),
  deleteGolfEvent: vi.fn(),
  respondToEvent: vi.fn(),
  addCoachBlockedTime: vi.fn(),
  deleteCoachBlockedTime: vi.fn(),
  createRecurringEvent: vi.fn(),
  deleteRecurringEvent: vi.fn(),
  editRecurringEvent: vi.fn(),
  getCalendarFeeds: vi.fn(),
  createCalendarFeed: vi.fn(),
  getEventDocuments: vi.fn(),
  attachDocumentToEvent: vi.fn(),
  detachDocumentFromEvent: vi.fn(),
  getDocuments: vi.fn(),
  getAttendanceReport: vi.fn(),
  markAttendance: vi.fn(),
}));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: a.createGolfEvent, updateGolfEvent: a.updateGolfEvent, deleteGolfEvent: a.deleteGolfEvent, respondToEvent: a.respondToEvent }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: a.addCoachBlockedTime, deleteCoachBlockedTime: a.deleteCoachBlockedTime }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: a.createRecurringEvent, deleteRecurringEvent: a.deleteRecurringEvent, editRecurringEvent: a.editRecurringEvent }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: a.getCalendarFeeds, createCalendarFeed: a.createCalendarFeed }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: a.getEventDocuments, attachDocumentToEvent: a.attachDocumentToEvent, detachDocumentFromEvent: a.detachDocumentFromEvent }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: a.getDocuments }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: a.getAttendanceReport, markAttendance: a.markAttendance }));
const trip = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: trip.get }));
// The browser client the realtime feed uses: the test hands out the channel and reads back what was asked of it.
const rt = vi.hoisted(() => ({ on: vi.fn(), subscribe: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: rt.channel, removeChannel: rt.removeChannel }) }));

import { chReport } from '../lib/track';
import { loadCalendar, type ChCalendarData } from '../data/calendar';
import { busyFor, focusHour, rangeLabel, startLabel, type ChCalEvent } from '../screens/calendar/model';
import { movable } from '../screens/calendar/views';
import { Calendar } from '../screens/calendar/Calendar';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import './dialog-polyfill';
import { formatDate, localToday } from '../ui/date-time';

/** A date as a DateField shows it: this year's dates without the year (ui/date-time formatDate). */
const fieldDate = (iso: string) => formatDate(iso, { omitYear: iso.slice(0, 4) === localToday().slice(0, 4) });

const freezeClock = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
};

function wrap(data: ChCalendarData, initialEvent?: string, live = false) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={data} initialEvent={initialEvent} live={live} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const cal = (events: ChCalEvent[], over: Partial<ChCalendarData> = {}): ChCalendarData => ({ ...PREVIEW_CALENDAR, events, ...over });
const ev = (o: Partial<ChCalEvent>): ChCalEvent => ({
  id: 'x',
  type: 'practice',
  title: 'Practice',
  date: '2026-10-14',
  start: 15,
  end: 17,
  allDay: false,
  location: null,
  notes: null,
  recurring: null,
  people: [],
  rsvp: {},
  rsvpRequired: true,
  owner: null,
  busyOnly: false,
  instructor: null,
  pattern: null,
  canEdit: true,
  cancelled: false,
  seriesId: null,
  startIso: '2026-10-14T19:00:00Z',
  span: null,
  ...o,
});

// Fall Invitational: Friday 16 October 7:00 AM to Sunday 18 October 4:30 PM, New York (stored as instants, not all day).
const RUN = { from: '2026-10-16', to: '2026-10-18', start: 7, end: 16.5 };
const runDay = (date: string, start: number, end: number) =>
  ev({ id: 'inv', type: 'tournament', title: 'Fall Invitational', date, start, end, span: RUN, startIso: '2026-10-16T11:00:00Z', people: ['theo', 'sofia'], location: 'Finley GC' });
const TOUR = [runDay('2026-10-16', 7, 24), runDay('2026-10-17', 0, 24), runDay('2026-10-18', 0, 16.5)];

const NY = { data: { timezone: 'America/New_York' } };
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Event ${id}`,
  event_type: 'tournament',
  start_time: '2026-10-16T11:00:00Z',
  end_time: '2026-10-18T20:30:00Z',
  location: null,
  description: null,
  status: 'confirmed',
  all_day: false,
  recurrence_rule: null,
  parent_event_id: null,
  requires_rsvp: true,
  rsvp_deadline: null,
  ...over,
});
const serve = (events: unknown[]) => {
  tables.current = {
    golf_team_settings: NY,
    golf_teams: { data: { name: 'Varsity' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Park', graduation_year: 2028 } }] },
    golf_events: { data: events, count: events.length },
    golf_player_classes: { data: [] },
    golf_event_attendance: { data: [] },
    golf_coach_blocked_time: { data: [] },
  };
};
const load = (over: Partial<Parameters<typeof loadCalendar>[0]> = {}) => loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, coachId: 'c1', view: 'week', date: '2026-10-14', ...over });

beforeEach(() => {
  for (const f of Object.values(a)) f.mockReset();
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
  a.updateGolfEvent.mockResolvedValue({ success: true });
  a.createGolfEvent.mockResolvedValue({ success: true, data: { eventId: 'new' } });
  router.refresh.mockClear();
  vi.mocked(chReport).mockClear();
  trip.get.mockReset();
  trip.get.mockResolvedValue({ success: true, data: null });
  for (const f of Object.values(rt)) f.mockReset();
  const channel = { on: rt.on, subscribe: rt.subscribe };
  rt.channel.mockReturnValue(channel);
  rt.on.mockReturnValue(channel);
  rt.subscribe.mockReturnValue(channel);
});
afterEach(() => vi.useRealTimers());

describe('Calendar parity · a timed event over several days is on every day it covers (Fairway eventDaySpan)', () => {
  it('the loader files it under each day: its start to midnight, whole days, midnight to its end, each naming the run', async () => {
    freezeClock();
    serve([row('inv'), row('mid', { start_time: '2026-10-15T00:00:00Z', end_time: '2026-10-17T04:00:00Z' })]);
    const d = await load();
    const at = (id: string) => d.events.filter((e) => e.id === id).map((e) => [e.date, e.start, e.end, e.allDay]);
    expect(at('inv')).toEqual([
      ['2026-10-16', 7, 24, false],
      ['2026-10-17', 0, 24, false],
      ['2026-10-18', 0, 16.5, false],
    ]);
    expect(d.events.find((e) => e.id === 'inv')!.span).toEqual(RUN);
    // 8 PM Wednesday to midnight Friday, New York: it holds nothing of Saturday.
    expect(at('mid')).toEqual([
      ['2026-10-14', 20, 24, false],
      ['2026-10-15', 0, 24, false],
      ['2026-10-16', 0, 24, false],
    ]);
    expect(d.events.find((e) => e.id === 'mid')!.span).toEqual({ from: '2026-10-14', to: '2026-10-16', start: 20, end: 24 });
  });

  it('a player is given the same days; a day outside the loaded window is left out, the rest stay', async () => {
    freezeClock();
    serve([row('inv'), row('long', { start_time: '2026-11-24T15:00:00Z', end_time: '2026-11-27T20:00:00Z' })]);
    const d = await load({ role: 'player', viewerPlayerId: 'p1', coachId: null });
    expect(d.events.filter((e) => e.id === 'inv').map((e) => e.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    // The window for 14 October runs to 25 November (`windowFor`): the 26th and 27th are another window's.
    expect(d.range.to).toBe('2026-11-25');
    expect(d.events.filter((e) => e.id === 'long').map((e) => e.date)).toEqual(['2026-11-24', '2026-11-25']);
  });

  it('each day says which part of the run it holds; the detail names its start and end; it never drags', () => {
    expect(TOUR.map((e) => rangeLabel(e))).toEqual(['From 7:00 AM', 'All day', 'Until 4:30 PM']);
    expect(TOUR.map((e) => startLabel(e))).toEqual(['7:00 AM', 'All day', 'Until 4:30 PM']);
    expect(TOUR.some(movable)).toBe(false);
    // Its invitees are busy on the middle day too, so Find a time and the overlap check see it.
    expect(busyFor(TOUR, 'theo', '2026-10-17').map((e) => e.id)).toEqual(['inv']);
  });

  it('the detail opened on a later day names the run’s start and end, not that day’s part', async () => {
    freezeClock();
    wrap(cal([TOUR[1]!]), 'inv');
    await screen.findByRole('heading', { name: 'Fall Invitational' });
    const when = screen.getByText('Starts 7:00 AM · ends 4:30 PM').parentElement!;
    expect(when.textContent).toMatch(/^Fri 16 – Sun 18Starts 7:00 AM · ends 4:30 PM · Eastern time$/);
  });

  it('a title-only edit opened from a later day (its first day not loaded) keeps the run: first day, start, last day and end', async () => {
    freezeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    wrap(cal([TOUR[2]!]), 'inv');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    const box = await screen.findByRole('textbox', { name: 'Event title' });
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(fieldDate('2026-10-16'));
    expect((screen.getByLabelText('Start time') as HTMLInputElement).value).toBe('7:00 AM');
    expect((screen.getByLabelText('End time') as HTMLInputElement).value).toBe('4:30 PM');
    expect(screen.getByText('Ends Sun 18 Oct')).toBeTruthy();
    // Not "This event ran past midnight. Pick an end time": the run's end is known.
    expect(screen.queryByText(/Pick an end time/)).toBeNull();
    await user.clear(box);
    await user.type(box, 'Fall Invitational (final)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalledTimes(1));
    expect(a.updateGolfEvent.mock.calls[0]![0]).toBe('inv');
    // New York is four hours behind UTC on 16 October (240, as Date.getTimezoneOffset counts it).
    const sent = a.updateGolfEvent.mock.calls[0]![1];
    expect(sent).toMatchObject({ title: 'Fall Invitational (final)', startDate: '2026-10-16', startTime: '07:00', allDay: false, timezoneOffset: 240 });
    // Its days and times are untouched, so its stored end is kept (nothing is sent for it), as an overnight end is.
    expect(sent).not.toHaveProperty('endDate');
    expect(sent).not.toHaveProperty('endTime');
  });

  // Saturday 31 October 7:00 AM daylight time to Monday 2 November 4:30 PM standard time (clocks change on the 1st).
  const DST = { from: '2026-10-31', to: '2026-11-02', start: 7, end: 16.5 };
  const dstDay = (date: string, start: number, end: number) =>
    ev({ id: 'dst', type: 'tournament', title: 'Autumn Classic', date, start, end, span: DST, startIso: '2026-10-31T11:00:00Z', people: ['theo'] });
  const WIDE = { range: { from: '2026-09-28', to: '2026-11-25' } };

  it('a run across a clock change: a change of its start sends its end moved by the change, so the stored end is the time on its own day', async () => {
    freezeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    wrap(cal([dstDay('2026-11-01', 0, 24)], WIDE), 'dst');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    const start = await screen.findByLabelText('Start time');
    await user.clear(start);
    await user.type(start, '08:00');
    expect((screen.getByLabelText('End time') as HTMLInputElement).value).toBe('4:30 PM');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalledTimes(1));
    // The server builds the end with the start's offset (240, daylight time): 17:30 at that offset is 4:30 PM standard time.
    expect(a.updateGolfEvent.mock.calls[0]![1]).toMatchObject({ startDate: '2026-10-31', startTime: '08:00', endDate: '2026-11-02', endTime: '17:30', timezoneOffset: 240 });
  });

  it('Duplicate of a run across a clock change publishes its end at the right instant', async () => {
    freezeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    wrap(cal([dstDay('2026-10-31', 7, 24), dstDay('2026-11-01', 0, 24), dstDay('2026-11-02', 0, 16.5)], WIDE), 'dst');
    await screen.findByRole('heading', { name: 'Autumn Classic' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    await user.click(await screen.findByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(1));
    expect(a.createGolfEvent.mock.calls[0]![0]).toMatchObject({ startDate: '2026-10-31', startTime: '07:00', endDate: '2026-11-02', endTime: '17:30', timezoneOffset: 240 });
  });

  it('a week that holds only a later day of a run opens on the first real start, not on its midnight', () => {
    // Week of 2 November: Monday's part of the run starts at 0 only because the run began on Saturday.
    const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const practice = ev({ id: 'pr', date: '2026-11-03', start: 15.5, end: 17.5 });
    expect(focusHour(week, [dstDay('2026-11-02', 0, 16.5), practice], { date: '2026-10-14', hour: 14.67 })).toBe(15.5);
  });

  it('Duplicate of the run publishes the same three days and times, never a "24:00" end the server refuses', async () => {
    freezeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    wrap(cal(TOUR), 'inv');
    await screen.findByRole('heading', { name: 'Fall Invitational' });
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    await user.click(await screen.findByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(1));
    expect(a.createGolfEvent.mock.calls[0]![0]).toMatchObject({ startDate: '2026-10-16', startTime: '07:00', endDate: '2026-10-18', endTime: '16:30', allDay: false });
  });
});

describe('Calendar parity · a player’s reply locks when the server locks it (lib/calendar/rsvp.ts)', () => {
  const player = { role: 'player' as const, viewerPlayerId: 'sofia' };
  const reply = () => screen.queryByRole('radiogroup', { name: 'Your reply' });

  it('an all-day event stays open to replies through its day (the server gives it 24 hours from UTC midnight)', async () => {
    freezeClock();
    wrap(cal([ev({ id: 'ad', title: 'Media day', allDay: true, start: null, end: null, startIso: '2026-10-14T00:00:00+00:00', people: ['sofia'] })], player), 'ad');
    await screen.findByRole('heading', { name: 'Media day' });
    expect(reply()).not.toBeNull();
  });

  it('a later day of a run that has already started is closed, as the run is', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T14:00:00Z'));
    wrap(cal([{ ...TOUR[2]!, people: ['sofia'] }], { ...player, today: '2026-10-17', anchor: '2026-10-17' }), 'inv');
    await screen.findByRole('heading', { name: 'Fall Invitational' });
    expect(reply()).toBeNull();
    expect(screen.getByText('Replies close once an event starts.')).toBeTruthy();
  });

  it('past the reply deadline a coach set (in Fairway), the reply is closed and says why', async () => {
    freezeClock();
    wrap(cal([ev({ id: 'dl', title: 'Team dinner', date: '2026-10-16', startIso: '2026-10-16T23:00:00Z', people: ['sofia'], rsvpDeadline: '2026-10-14T16:00:00Z' })], player), 'dl');
    await screen.findByRole('heading', { name: 'Team dinner' });
    expect(reply()).toBeNull();
    expect(screen.getByText('Replies closed at the deadline the coach set.')).toBeTruthy();
  });

  it('Needs your reply asks only for a reply the server would still take', async () => {
    freezeClock();
    const open = ev({ id: 'op', title: 'Team dinner', date: '2026-10-16', startIso: '2026-10-16T23:00:00Z', people: ['sofia'] });
    const late = ev({ id: 'lt', title: 'Film session', date: '2026-10-16', startIso: '2026-10-16T21:00:00Z', people: ['sofia'], rsvpDeadline: '2026-10-14T16:00:00Z' });
    wrap(cal([open, late], player));
    // The two overlap for her (wave 7: a player is shown her own clash), so the section is her attention, not only
    // replies; the clash row ("Team dinner · Overlaps Film session …") is not a reply row.
    const sec = (await screen.findByText('Needs your attention')).closest('.ch-in__sec') as HTMLElement;
    const rows = within(sec).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(rows.filter((t) => !t.includes('Overlaps'))).toEqual([expect.stringMatching(/^Team dinnerFri 16 · /)]);
    expect(rows.some((t) => t.startsWith('Film session'))).toBe(false);
  });

  it('before the deadline the reply is open', async () => {
    freezeClock();
    wrap(cal([ev({ id: 'dl', title: 'Team dinner', date: '2026-10-16', startIso: '2026-10-16T23:00:00Z', people: ['sofia'], rsvpDeadline: '2026-10-15T16:00:00Z' })], player), 'dl');
    await screen.findByRole('heading', { name: 'Team dinner' });
    expect(reply()).not.toBeNull();
  });

  it('the loader carries the deadline (and none for a class)', async () => {
    freezeClock();
    serve([row('dl', { event_type: 'practice', start_time: '2026-10-16T19:00:00Z', end_time: '2026-10-16T21:00:00Z', rsvp_deadline: '2026-10-15T16:00:00Z' })]);
    const d = await load();
    expect(d.events.find((e) => e.id === 'dl')!.rsvpDeadline).toBe('2026-10-15T16:00:00Z');
  });
});

describe('Calendar parity · realtime: the page follows the team’s events (Fairway use-calendar-range-events)', () => {
  it('one channel on golf_events for the team; a burst of changes is one re-read; a reconnect re-reads; leaving removes it', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
    const view = wrap(cal([]), undefined, true);
    expect(rt.channel).toHaveBeenCalledTimes(1);
    expect(rt.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'golf_events', filter: `team_id=eq.${PREVIEW_CALENDAR.teamId}` }, expect.any(Function));
    const change = rt.on.mock.calls[0]![2] as () => void;
    const status = rt.subscribe.mock.calls[0]![0] as (s: string) => void;
    status('SUBSCRIBED');
    change();
    change();
    change();
    expect(router.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The feed dropped and came back: changes may have been missed, so the page reads again.
    status('CHANNEL_ERROR');
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), { surface: 'calendar.live', severity: 'low' });
    status('SUBSCRIBED');
    vi.advanceTimersByTime(800);
    expect(router.refresh).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(rt.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('off unless the route turns it on (tests, the dev preview)', () => {
    wrap(cal([]));
    expect(rt.channel).not.toHaveBeenCalled();
  });
});

describe('Calendar parity · the trip linked to an event (Fairway’s "View itinerary")', () => {
  it('an event with a linked trip links to Team Hub’s Travel with that trip named, for coach and player', async () => {
    freezeClock();
    trip.get.mockResolvedValue({ success: true, data: { id: 'trip-1', event_name: 'Fall Invitational', destination: 'Pinehurst' } });
    const view = wrap(cal(TOUR), 'inv');
    const link = await screen.findByRole('link', { name: /View itinerary · Pinehurst/ });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/team-hub?tab=travel&trip=trip-1');
    expect(trip.get).toHaveBeenCalledWith('inv');
    view.unmount();
    wrap(cal(TOUR, { role: 'player', viewerPlayerId: 'sofia' }), 'inv');
    expect(await screen.findByRole('link', { name: /View itinerary · Pinehurst/ })).toBeTruthy();
  });

  it('no trip, or a read that fails: nothing is drawn, and the failure is reported', async () => {
    freezeClock();
    const view = wrap(cal(TOUR), 'inv');
    await screen.findByRole('heading', { name: 'Fall Invitational' });
    await waitFor(() => expect(trip.get).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /View itinerary/ })).toBeNull();
    view.unmount();
    trip.get.mockResolvedValue({ success: false, error: 'Failed to look up linked itinerary.' });
    wrap(cal(TOUR), 'inv');
    await waitFor(() => expect(chReport).toHaveBeenCalledWith(expect.any(Error), { surface: 'calendar.trip', severity: 'low' }));
    expect(screen.queryByRole('link', { name: /View itinerary/ })).toBeNull();
  });
});

describe('Calendar parity · an event that asks for replies and invites no one is the team’s: any player may reply', () => {
  const player = { role: 'player' as const, viewerPlayerId: 'sofia' };
  const open = (o: Partial<ChCalEvent> = {}) => ev({ id: 'tm', title: 'Team dinner', date: '2026-10-16', startIso: '2026-10-16T23:00:00Z', people: [], openReply: true, ...o });

  it('a player not on any list gets the reply, sends it with respondToEvent, and is asked for it in Needs your reply', async () => {
    freezeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    a.respondToEvent.mockResolvedValue({ success: true });
    const view = wrap(cal([open()], player));
    const sec = (await screen.findByText('Needs your reply')).closest('.ch-in__sec') as HTMLElement;
    expect(within(sec).getByText(/Team dinner/)).toBeTruthy();
    view.unmount();
    wrap(cal([open()], player), 'tm');
    expect(await screen.findByText('Open to the whole team')).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Going' }));
    await waitFor(() => expect(a.respondToEvent).toHaveBeenCalledWith('tm', 'accepted'));
  });

  it('an event with an invite list stays theirs: a player not on it gets no reply', async () => {
    freezeClock();
    wrap(cal([open({ openReply: false, people: [] })], player), 'tm');
    await screen.findByRole('heading', { name: 'Team dinner' });
    expect(screen.queryByRole('radiogroup', { name: 'Your reply' })).toBeNull();
  });

  it('the loader: no row the coach’s invitation wrote (notified_at) means open, so a teammate’s own reply keeps it open; a coach never gets the flag', async () => {
    freezeClock();
    const rows = [row('tm', { event_type: 'practice', start_time: '2026-10-16T23:00:00Z', end_time: '2026-10-17T00:30:00Z' }), row('inv2', { event_type: 'practice', start_time: '2026-10-16T19:00:00Z', end_time: '2026-10-16T21:00:00Z' })];
    serve(rows);
    tables.current.golf_event_attendance = {
      data: [
        { id: 'a1', event_id: 'tm', player_id: 'p2', status: 'accepted', notified_at: null },
        { id: 'a2', event_id: 'inv2', player_id: 'p2', status: 'pending', notified_at: '2026-10-10T12:00:00Z' },
      ],
    };
    const d = await load({ role: 'player', viewerPlayerId: 'p1', coachId: null });
    expect(d.events.find((e) => e.id === 'tm')!.openReply).toBe(true);
    expect(d.events.find((e) => e.id === 'inv2')!.openReply).toBe(false);
    const c = await load();
    expect(c.events.find((e) => e.id === 'tm')!.openReply).toBe(false);
  });

  it('once the count function is deployed: coach_invited, not every row, decides it, so a teammate’s own reply still keeps it open', async () => {
    freezeClock();
    const rows = [row('tm', { event_type: 'practice', start_time: '2026-10-16T23:00:00Z', end_time: '2026-10-17T00:30:00Z' }), row('inv2', { event_type: 'practice', start_time: '2026-10-16T19:00:00Z', end_time: '2026-10-16T21:00:00Z' })];
    serve(rows);
    // A player reads only their own rows after 20261017102000; the counts come from the function.
    tables.current.golf_event_attendance = { data: [] };
    tables.current['rpc:golf_event_attendance_counts'] = {
      data: [
        { event_id: 'tm', invited: 1, accepted: 1, declined: 0, pending: 0, coach_invited: 0 },
        { event_id: 'inv2', invited: 1, accepted: 0, declined: 0, pending: 1, coach_invited: 1 },
      ],
    };
    const d = await load({ role: 'player', viewerPlayerId: 'p1', coachId: null });
    expect(d.events.find((e) => e.id === 'tm')!.openReply).toBe(true);
    expect(d.events.find((e) => e.id === 'inv2')!.openReply).toBe(false);
  });
});

describe('Calendar parity · the loader reads every event that overlaps its window, not only those that start in it', () => {
  it('the read asks for events that start before the window ends and end on or after it starts (the replies too)', async () => {
    freezeClock();
    const asked: Record<string, Array<Array<[string, unknown[]]>>> = {};
    serve([]);
    for (const t of ['golf_events', 'golf_event_attendance']) {
      const answer = tables.current[t] as object;
      tables.current[t] = (f) => ((asked[t] ??= []).push(f), answer as never);
    }
    const d = await load();
    // The window opens on Sunday 27 September (October's grid); the read is padded a day before it.
    const from = `2026-09-26T00:00:00Z`;
    expect(d.range.from).toBe('2026-09-27');
    const ev0 = asked.golf_events!.find((f) => f.some(([k]) => k === 'or'))!;
    expect(ev0.find(([k]) => k === 'or')![1]).toEqual([`end_time.gte.${from},start_time.gte.${from}`]);
    expect(ev0.find(([k]) => k === 'lt')![1]).toEqual(['start_time', '2026-11-27T00:00:00Z']);
    expect(ev0.some(([k, args]) => k === 'gte' && args[0] === 'start_time')).toBe(false);
    const att = asked.golf_event_attendance![0]!;
    expect(att.find(([k]) => k === 'or')![1]).toEqual([`end_time.gte.${from},start_time.gte.${from}`, { referencedTable: 'golf_events' }]);
  });

  it('a trip that began before the window fills the window’s first days, all day or timed', async () => {
    freezeClock();
    serve([
      row('camp', { event_type: 'travel', all_day: true, start_time: '2026-09-20T00:00:00+00:00', end_time: '2026-09-30T00:00:00+00:00' }),
      row('run', { start_time: '2026-09-25T12:00:00Z', end_time: '2026-09-29T20:00:00Z' }),
    ]);
    const d = await load();
    expect(d.events.filter((e) => e.id === 'camp').map((e) => e.date)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']);
    expect(d.events.find((e) => e.id === 'camp')!.span).toEqual({ from: '2026-09-20', to: '2026-09-30' });
    expect(d.events.filter((e) => e.id === 'run').map((e) => [e.date, e.start, e.end])).toEqual([
      ['2026-09-27', 0, 24],
      ['2026-09-28', 0, 24],
      ['2026-09-29', 0, 16],
    ]);
  });
});
