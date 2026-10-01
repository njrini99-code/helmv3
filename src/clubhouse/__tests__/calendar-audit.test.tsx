import { LazyMotion, domAnimation } from 'framer-motion';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Calendar swap audit (spec §8): write paths that changed data the coach didn't touch. Mocks as in calendar.test.tsx. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
// The server side: the loader's reads (a table-level fake), what it logs, who is signed in, which team they work in,
// and whether the Clubhouse is on for them.
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const gate = vi.hoisted(() => ({ on: true }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseFor: (role: string | null) => gate.on && (role === 'coach' || role === 'player') }));
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
vi.mock('@/app/golf/actions/golf', () => ({
  createGolfEvent: a.createGolfEvent,
  updateGolfEvent: a.updateGolfEvent,
  deleteGolfEvent: a.deleteGolfEvent,
  respondToEvent: a.respondToEvent,
  addCoachBlockedTime: a.addCoachBlockedTime,
  deleteCoachBlockedTime: a.deleteCoachBlockedTime,
}));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: a.createRecurringEvent, deleteRecurringEvent: a.deleteRecurringEvent, editRecurringEvent: a.editRecurringEvent }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: a.getCalendarFeeds, createCalendarFeed: a.createCalendarFeed }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: a.getEventDocuments, attachDocumentToEvent: a.attachDocumentToEvent, detachDocumentFromEvent: a.detachDocumentFromEvent }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: a.getDocuments }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: a.getAttendanceReport, markAttendance: a.markAttendance }));

import { loadCalendar, type ChCalendarData } from '../data/calendar';
import { busyFor, findOverlaps, openTimes, type ChCalEvent } from '../screens/calendar/model';
import { Calendar } from '../screens/calendar/Calendar';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import './dialog-polyfill';

function wrap(data: ChCalendarData, initialEvent?: string) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={data} initialEvent={initialEvent} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
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
const cal = (events: ChCalEvent[], over: Partial<ChCalendarData> = {}): ChCalendarData => ({ ...PREVIEW_CALENDAR, events, ...over });
const ok = () => Promise.resolve({ success: true });
const retitle = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  const box = await screen.findByRole('textbox', { name: 'Event title' });
  await user.clear(box);
  await user.type(box, title);
};

beforeEach(() => {
  for (const f of Object.values(a)) f.mockReset();
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
  a.updateGolfEvent.mockImplementation(ok);
  a.editRecurringEvent.mockImplementation(ok);
});

describe('Calendar · swap audit §8 edits', () => {
  // The loader repeats a multi-day all-day event on each day it covers, each entry carrying the whole span.
  const tour = (['2026-10-16', '2026-10-17', '2026-10-18'] as const).map((d) =>
    ev({ id: 'tour', type: 'tournament', title: 'Fall Invitational', date: d, start: null, end: null, allDay: true, span: { from: '2026-10-16', to: '2026-10-18' }, startIso: '2026-10-16T00:00:00+00:00' }),
  );

  // C-17: updateGolfEvent used to swallow a failed invitation write, so the coach saw a clean "Saved" for players who
  // were never invited. It now answers `data.invitationsError`, and the editor says so instead of a plain "Saved".
  it('C-17 an edit that saved without its new invitations says so, and does not toast a plain "Saved"', async () => {
    const user = userEvent.setup();
    a.updateGolfEvent.mockResolvedValue({ success: true, data: { invitationsError: "The changes were saved, but the new invitations didn't go out." } });
    wrap(cal(tour), 'tour');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    await retitle(user, 'Fall Invitational (final)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Saved · Fall Invitational \(final\) · invitations didn't go out/);
    expect(alert.textContent).toMatch(/new invitations didn't go out/);
    expect(screen.queryByText(/^Saved · Fall Invitational \(final\)$/)).toBeNull();
  });

  it('C-17 a clean edit still toasts a plain "Saved"', async () => {
    const user = userEvent.setup();
    wrap(cal(tour), 'tour');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    await retitle(user, 'Fall Invitational (final)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved · Fall Invitational (final)');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CAL-06 a title-only edit of a three-day tournament keeps all three days', async () => {
    const user = userEvent.setup();
    wrap(cal(tour), 'tour');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    await retitle(user, 'Fall Invitational (final)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalled());
    expect(a.updateGolfEvent.mock.calls[0]![1]).toMatchObject({ title: 'Fall Invitational (final)', allDay: true, startDate: '2026-10-16', endDate: '2026-10-18' });
  });

  it('CAL-06 moving a multi-day event moves its whole span', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockImplementation(ok);
    wrap(cal(tour), 'tour');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-23' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalled());
    expect(a.updateGolfEvent.mock.calls[0]![1]).toMatchObject({ startDate: '2026-10-23', endDate: '2026-10-25' });
  });

  it('CAL-06 Duplicate of a multi-day event publishes the same number of days', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockImplementation(ok);
    wrap(cal(tour), 'tour');
    await user.click(await screen.findByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }));
    await user.click(await screen.findByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalled());
    expect(a.createGolfEvent.mock.calls[0]![0]).toMatchObject({ allDay: true, startDate: '2026-10-16', endDate: '2026-10-18' });
  });

  it('CAL-06 an overnight event (10 PM to past midnight) can be retitled: no "24:00" end is sent, the stored end is kept', async () => {
    const user = userEvent.setup();
    wrap(cal([ev({ id: 'bus', type: 'travel', title: 'Night bus', start: 22, end: 24 })]), 'bus');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    await retitle(user, 'Night bus to Pinehurst');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalled());
    const sent = a.updateGolfEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(sent).toMatchObject({ title: 'Night bus to Pinehurst', startDate: '2026-10-14', startTime: '22:00' });
    expect(sent.endTime).toBeUndefined();
    expect(sent.endDate).toBeUndefined();
  });

  it('CAL-06 moving an overnight event to another day asks for an end time instead of keeping the old end', async () => {
    const user = userEvent.setup();
    wrap(cal([ev({ id: 'bus', type: 'travel', title: 'Night bus', start: 22, end: 24 })]), 'bus');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-21' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/ran past midnight\. Pick an end time/)).toBeTruthy();
    expect(a.updateGolfEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '23:45' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.updateGolfEvent).toHaveBeenCalled());
    expect(a.updateGolfEvent.mock.calls[0]![1]).toMatchObject({ startDate: '2026-10-21', endDate: '2026-10-21', startTime: '22:00', endTime: '23:45' });
  });

  it('CAL-21 a title-only series edit leaves every occurrence’s own notes and place alone', async () => {
    const user = userEvent.setup();
    wrap(cal([ev({ id: 'rp', title: 'Range work', seriesId: 'rp', recurring: 'Weekly on Wed' })]), 'rp');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    await retitle(user, 'Range and wedges');
    await user.click(screen.getByRole('radio', { name: 'All in series' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.editRecurringEvent).toHaveBeenCalled());
    const updates = (a.editRecurringEvent.mock.calls[0]![0] as { updates: Record<string, unknown> }).updates;
    expect(updates.title).toBe('Range and wedges');
    expect('description' in updates).toBe(false);
    expect('location' in updates).toBe(false);
  });

  it('CAL-20 a series edit can clear notes and place, and cannot flip All day for the series', async () => {
    const user = userEvent.setup();
    wrap(cal([ev({ id: 'rp', title: 'Range work', seriesId: 'rp', recurring: 'Weekly on Wed', location: 'Range', notes: 'Bring wedges' })]), 'rp');
    await user.click(await screen.findByRole('button', { name: 'Edit event' }));
    await user.click(screen.getByRole('radio', { name: 'All in series' }));
    expect((screen.getByRole('checkbox', { name: 'All day' }) as HTMLInputElement).disabled).toBe(true);
    await user.clear(screen.getByPlaceholderText("What to bring, what you'll work on"));
    await user.clear(screen.getByPlaceholderText('Practice green, Finley GC'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(a.editRecurringEvent).toHaveBeenCalled());
    expect(a.editRecurringEvent.mock.calls[0]![0]).toMatchObject({ scope: 'all', updates: { description: '', location: '' } });
  });
});

describe('Calendar · swap audit §8 reads', () => {
  it('CAL-07 week view shows an event that starts after 9 PM and one that ends before 6 AM', async () => {
    wrap(
      cal([
        ev({ id: 'late', title: 'Late film session', start: 21.5, end: 22.5 }),
        ev({ id: 'early', title: 'Early bus', date: '2026-10-15', start: 5, end: 5.75 }),
      ]),
    );
    expect(await screen.findByRole('button', { name: /^Late film session/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Early bus/ })).toBeTruthy();
  });

  it('CAL-09 when replies did not load, an event is never described as having no one invited', async () => {
    wrap(cal([ev({ id: 'm', title: 'Team meeting', people: [] })], { rsvpError: true }), 'm');
    await screen.findByRole('heading', { name: 'Team meeting' });
    expect(screen.queryByText(/No players invited/)).toBeNull();
  });

  it('CAL-25 CAL-26 a cancelled event is not busy time: the editor, Find a time and overlaps agree', () => {
    const p = 'p1';
    const live = ev({ id: 'new', people: [p], start: 15, end: 17 });
    const off = ev({ id: 'off', people: [p], start: 15.5, end: 16.5, cancelled: true });
    expect(busyFor([live, off], p, '2026-10-14', 'new')).toEqual([]);
    expect(findOverlaps([live, off])).toEqual([]);
    expect(openTimes([live, off], [p], '2026-10-14', 2, 'new', 15)).toContainEqual([15, 17]);
  });
});

describe('Calendar · swap audit §8 deep link', () => {
  const FAR = '11111111-2222-4333-8444-555555555555';
  /** A team in New York, today 14 October 2026; the linked event is far outside the loaded window. */
  const serveFar = (row: { start_time: string; all_day: boolean } | null) => {
    const asked: Array<Array<[string, unknown[]]>> = [];
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/New_York' } },
      golf_teams: { data: { name: 'Varsity' } },
      golf_team_members: { data: [] },
      golf_player_classes: { data: [] },
      golf_event_attendance: { data: [] },
      golf_coach_blocked_time: { data: [] },
      golf_events: (filters) => {
        asked.push(filters);
        const byId = filters.some(([k, args]) => k === 'eq' && args[0] === 'id');
        return byId ? { data: row } : { data: [], count: 1 };
      },
    };
    return asked;
  };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('CAL-03 ?event= with no date opens the calendar on that event’s own day, read within the team', async () => {
    const asked = serveFar({ start_time: '2027-03-08T02:30:00+00:00', all_day: false });
    const d = await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, coachId: 'c1', view: 'week', event: FAR });
    // 02:30 UTC on 8 March is 9:30 PM on 7 March in New York.
    expect(d.anchor).toBe('2027-03-07');
    expect(d.range.from <= '2027-03-07' && d.range.to >= '2027-03-07').toBe(true);
    expect(asked[0]).toEqual(expect.arrayContaining([['eq', ['id', FAR]], ['eq', ['team_id', 't1']]]));
  });

  it('CAL-03 an explicit date wins; an unknown or malformed id falls back to today', async () => {
    serveFar({ start_time: '2027-03-07T00:00:00+00:00', all_day: true });
    expect((await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, view: 'week', event: FAR, date: '2026-11-02' })).anchor).toBe('2026-11-02');
    expect((await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, view: 'week', event: FAR })).anchor).toBe('2027-03-07');
    serveFar(null);
    expect((await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, view: 'week', event: FAR })).anchor).toBe('2026-10-14');
    const asked = serveFar({ start_time: '2027-03-07T00:00:00+00:00', all_day: true });
    expect((await loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, view: 'week', event: 'not-an-id' })).anchor).toBe('2026-10-14');
    expect(asked.some((f) => f.some(([k, args]) => k === 'eq' && args[0] === 'id'))).toBe(false);
  });
});

describe('Calendar · swap audit §8 attendance', () => {
  const board = () => cal(PREVIEW_CALENDAR.events);

  it('CAL-23 Mark all present fills only players with no mark: a saved Late or No-show is never overwritten', async () => {
    const user = userEvent.setup();
    a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [{ player_id: 'theo', attendance_status: 'late' }, { player_id: 'sofia', attendance_status: 'no_show' }] } });
    a.markAttendance.mockImplementation(ok);
    wrap(board(), 'e9');
    await user.click(await screen.findByRole('button', { name: 'Attendance' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all present' }));
    await user.click(screen.getByRole('button', { name: 'Save attendance · 4' }));
    await waitFor(() => expect(a.markAttendance).toHaveBeenCalledTimes(4));
    const players = a.markAttendance.mock.calls.map((c) => c[1]);
    expect(players).not.toContain('theo');
    expect(players).not.toContain('sofia');
  });

  it('CAL-24 the toast’s Retry after a partial save resends only the marks that failed', async () => {
    const user = userEvent.setup();
    a.markAttendance.mockImplementation(async (_e: string, player: string) => (player === 'theo' ? { success: false, error: 'nope' } : { success: true }));
    wrap(board(), 'e9');
    await user.click(await screen.findByRole('button', { name: 'Attendance' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all present' }));
    await user.click(screen.getByRole('button', { name: 'Save attendance · 6' }));
    await waitFor(() => expect(screen.getAllByText('Unsaved')).toHaveLength(1));
    a.markAttendance.mockClear();
    a.markAttendance.mockImplementation(ok);
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(a.markAttendance).toHaveBeenCalledTimes(1));
    expect(a.markAttendance.mock.calls[0]![1]).toBe('theo');
  });
});
