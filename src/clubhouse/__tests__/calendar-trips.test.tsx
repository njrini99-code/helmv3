import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const reads = vi.hoisted(() => ({ documents: vi.fn(), itinerary: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: vi.fn(), updateGolfEvent: vi.fn(), deleteGolfEvent: vi.fn(), respondToEvent: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: vi.fn(), deleteCoachBlockedTime: vi.fn() }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: vi.fn(), deleteRecurringEvent: vi.fn(), editRecurringEvent: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: () => Promise.resolve({ success: true, data: [] }), createCalendarFeed: vi.fn() }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: reads.documents, attachDocumentToEvent: vi.fn(), detachDocumentFromEvent: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn() }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: vi.fn(), markAttendance: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: reads.itinerary }));

import { loadCalendar } from '../data/calendar';
import { calendarTripRows } from '../data/calendar-trips';
import type { ChHomeTripRow } from '../data/home-trips';
import { Calendar } from '../screens/calendar/Calendar';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import './dialog-polyfill';

/**
 * Prod audit 2026-11-15, P1-20 / N13P-24 (contract 60104): the team trip (Team Hub's Plan trip, with no calendar event) was missing from every
 * Calendar view, and the rail said nothing was on the team calendar on the travel day, while the Week legend listed Travel.
 */
const trip = (over: Partial<ChHomeTripRow> = {}): ChHomeTripRow => ({
  id: 'tr1',
  event_id: null,
  event_name: 'Fall Invitational',
  destination: 'Pinehurst',
  departure_date: '2026-10-16',
  departure_time: '06:30:00',
  return_date: '2026-10-18',
  return_time: '19:00:00',
  is_test: false,
  ...over,
});
const RANGE = { from: '2026-09-27', to: '2026-11-25' };

describe('a trip on the calendar', () => {
  it('is an all-day Travel row on each day it covers, with its span, read-only, its departure and return times kept', () => {
    const rows = calendarTripRows([trip()], new Set(), RANGE);
    expect(rows.map((r) => r.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    for (const r of rows) {
      expect(r).toMatchObject({ id: 'trip-tr1', type: 'travel', title: 'Fall Invitational', location: 'Pinehurst', allDay: true, canEdit: false, rsvpRequired: false, people: [] });
      expect(r.span).toEqual({ from: '2026-10-16', to: '2026-10-18' });
      expect(r.trip).toEqual({ id: 'tr1', leaves: 6.5, returns: 19 });
    }
  });

  it('is named as Team Hub names it, and a day trip is one day with no span', () => {
    const [row, ...more] = calendarTripRows([trip({ event_name: null, return_date: null, return_time: null })], new Set(), RANGE);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ title: 'Pinehurst', location: null, span: null, date: '2026-10-16' });
    expect(row!.trip!.returns).toBeNull();
  });

  it('a trip whose event is on the calendar is drawn once, as that event; a test trip and one outside the window never show', () => {
    expect(calendarTripRows([trip({ event_id: 'e1' })], new Set(['e1']), RANGE)).toEqual([]);
    expect(calendarTripRows([trip({ event_id: 'gone' })], new Set(['e1']), RANGE)).toHaveLength(3);
    expect(calendarTripRows([trip({ is_test: true })], new Set(), RANGE)).toEqual([]);
    expect(calendarTripRows([trip({ departure_date: '2026-12-01', return_date: '2026-12-03' })], new Set(), RANGE)).toEqual([]);
    const clipped = calendarTripRows([trip({ departure_date: '2026-09-25', return_date: '2026-09-28' })], new Set(), RANGE);
    expect(clipped.map((r) => r.date)).toEqual(['2026-09-27', '2026-09-28']);
    expect(clipped[0]!.span).toEqual({ from: '2026-09-25', to: '2026-09-28' });
  });
});

describe('the calendar loader reads the team’s trips', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
    logServer.mockReset();
  });
  afterEach(() => vi.useRealTimers());
  const base = () => ({
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_teams: { data: { name: 'Varsity' } },
    golf_team_members: { data: [] },
    golf_player_classes: { data: [] },
    golf_event_attendance: { data: [] },
    golf_coach_blocked_time: { data: [] },
    golf_events: { data: [], count: 1 },
  });

  it('for a player, by team and without test trips, as Travel rows on its days', async () => {
    const asked: Array<Array<[string, unknown[]]>> = [];
    tables.current = {
      ...base(),
      golf_travel_itineraries: (filters) => {
        asked.push(filters);
        return { data: [trip()] };
      },
    };
    const d = await loadCalendar({ role: 'player', teamId: 't1', viewerPlayerId: 'p1', view: 'week', date: '2026-10-14' });
    expect(d.events.filter((e) => e.id === 'trip-tr1').map((e) => e.date)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    const f = asked[0]!;
    expect(f).toContainEqual(['eq', ['team_id', 't1']]);
    expect(f).toContainEqual(['eq', ['is_test', false]]);
    expect(f).toContainEqual(['lte', ['departure_date', d.range.to]]);
  });

  it('a failed trip read is reported and draws no trip; failed events draw no trip either', async () => {
    tables.current = { ...base(), golf_travel_itineraries: { error: { message: 'boom' } } };
    const d = await loadCalendar({ role: 'player', teamId: 't1', viewerPlayerId: 'p1', view: 'week', date: '2026-10-14' });
    expect(d.events.some((e) => e.trip)).toBe(false);
    expect(logServer).toHaveBeenCalledWith('calendar', 'trips', expect.anything(), 'calendar');
    tables.current = { ...base(), golf_events: { error: { message: 'down' } }, golf_travel_itineraries: { data: [trip()] } };
    const e = await loadCalendar({ role: 'player', teamId: 't1', viewerPlayerId: 'p1', view: 'week', date: '2026-10-14' });
    expect(e.eventsError).toBe(true);
    expect(e.events.some((x) => x.trip)).toBe(false);
  });
});

describe('a trip opened on the calendar', () => {
  beforeEach(() => {
    reads.documents.mockReset().mockResolvedValue({ success: true, data: [] });
    reads.itinerary.mockReset().mockResolvedValue({ success: true, data: null });
  });

  it('shows when it leaves and comes back, where, and the way to its itinerary; it reads no files, replies or linked trip', async () => {
    const events = [...PREVIEW_CALENDAR.events, ...calendarTripRows([trip()], new Set(), PREVIEW_CALENDAR.range)];
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Calendar data={{ ...PREVIEW_CALENDAR, events }} initialEvent="trip-tr1" />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );
    const link = await screen.findByRole('link', { name: /View itinerary · Pinehurst/ });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/team-hub?tab=travel&trip=tr1');
    const panel = link.closest('.ch-in') as HTMLElement;
    expect(within(panel).getByText(/Leaves 6:30 AM · back 7:00 PM/)).toBeTruthy();
    expect(within(panel).getByRole('heading', { name: 'Fall Invitational' })).toBeTruthy();
    expect(within(panel).queryByText(/No players invited/)).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(reads.documents).not.toHaveBeenCalled();
    expect(reads.itinerary).not.toHaveBeenCalled();
  });
});
