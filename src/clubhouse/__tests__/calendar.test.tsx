import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/**
 * Calendar: every numbered state in docs/clubhouse/catalog/calendar.md, found by its number, and every hand contract
 * of docs/clubhouse/pages/P006-calendar/CONTRACT.md, found by its Bridge ID (6ccii) in a test title.
 */

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

import { getGolfSessionProfile } from '@/lib/auth/session';
import GolfCalendarPage from '@/app/golf/(dashboard)/dashboard/calendar/page';
import { loadCalendar, parseDate, parseNewType, parseView, type ChCalendarData } from '../data/calendar';
import { chReport, chTrail } from '../lib/track';
import { ClubhouseCalendarRoute } from '../routes/calendar';
import { resolveClubhouseTeam } from '../routes/team';
import type { ChCalEvent, ChCalType } from '../screens/calendar/model';
import { Calendar } from '../screens/calendar/Calendar';
import { CalendarSkeleton } from '../screens/calendar/CalendarSkeleton';
import { CalendarNoTeam } from '../screens/calendar/CalendarNoTeam';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR, PREVIEW_CALENDAR_PLAYER } from '../preview/fixtures-calendar';
import './dialog-polyfill';

/** A numbered element that is actually on screen: a closed <dialog> doesn't count. */
const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(data: ChCalendarData, props: { initialEvent?: string; initialNew?: boolean; initialWith?: string; initialType?: ChCalType } = {}) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={data} {...props} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const cal = (over: Partial<ChCalendarData> = {}): ChCalendarData => ({ ...PREVIEW_CALENDAR, ...over });
const fail = () => Promise.resolve({ success: false, error: 'nope' });
const never = () => new Promise<never>(() => {});
type User = ReturnType<typeof userEvent.setup>;
const eventMenu = async (user: User, item: string) => {
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
};

beforeEach(() => {
  hapticSpy.mockClear();
  router.refresh.mockClear();
  router.push.mockClear();
  logServer.mockClear();
  vi.mocked(chReport).mockClear();
  vi.mocked(chTrail).mockClear();
  vi.mocked(getGolfSessionProfile).mockReset();
  vi.mocked(resolveClubhouseTeam).mockReset();
  gate.on = true;
  tables.current = {};
  for (const f of Object.values(a)) f.mockReset();
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getDocuments.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
});

describe('Calendar · new event deep link', () => {
  it('60103 ?new=1&type= opens the editor on that type (the phone Home’s quick chips); an unknown type is ignored', async () => {
    wrap(cal(), { initialNew: true, initialType: 'qualifier' });
    const chosen = await screen.findByRole('radio', { name: /Qualifier/ });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(parseNewType('qualifier')).toBe('qualifier');
    expect(parseNewType('class')).toBeUndefined();
    expect(parseNewType('<script>')).toBeUndefined();
  });
});

describe('Calendar · saves that fail', () => {
  it('CH-6101 CH-6001 61202 a new event needs a title; a failed publish keeps the editor with everything as typed', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockImplementation(fail);
    wrap(cal(), { initialNew: true });
    await user.click(await screen.findByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6101', /Give the event a title/);
    expect(a.createGolfEvent).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.type(screen.getByPlaceholderText('Practice green, Finley GC'), 'Range bay 2');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6001', /Couldn't publish Short game/);
    expect((screen.getByRole('textbox', { name: 'Event title' }) as HTMLInputElement).value).toBe('Short game');
    expect((screen.getByPlaceholderText('Practice green, Finley GC') as HTMLInputElement).value).toBe('Range bay 2');
    expect(document.querySelector('dialog[open]')).not.toBeNull();
  });

  // C-17: no request id meant a Retry, or a second Publish, after a reply lost AFTER the server stored the event
  // published it twice and invited and notified everyone twice.
  it('C-17 a Retry or a second Publish of the same event sends the same request id; changing the event sends a new one', async () => {
    const user = userEvent.setup();
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    a.createGolfEvent.mockImplementation(fail);
    wrap(cal(), { initialNew: true });
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6001', /Couldn't publish Short game/);
    // Pressing Publish again, then the toast's Retry: the same event, so the same id.
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(2));
    const retries = await screen.findAllByRole('button', { name: 'Retry' });
    await user.click(retries[retries.length - 1]!);
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(3));
    const ids = () => a.createGolfEvent.mock.calls.map((c) => (c[0] as { requestId?: string }).requestId);
    expect(ids()[0]).toMatch(UUID);
    expect(ids()[1]).toBe(ids()[0]);
    expect(ids()[2]).toBe(ids()[0]);
    // Different contents are a different event.
    await user.type(screen.getByRole('textbox', { name: 'Event title' }), ' drills');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(4));
    expect(ids()[3]).toMatch(UUID);
    expect(ids()[3]).not.toBe(ids()[0]);
  });

  it('C-17 a repeating event sends a request id too, and keeps it across a Retry', async () => {
    const user = userEvent.setup();
    a.createRecurringEvent.mockImplementation(fail);
    wrap(cal(), { initialNew: true });
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Lifting');
    await user.click(screen.getByRole('radio', { name: 'Weekly' }));
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createRecurringEvent).toHaveBeenCalledTimes(1));
    await expectCode('CH-6001', /Couldn't publish Lifting/);
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createRecurringEvent).toHaveBeenCalledTimes(2));
    const sent = a.createRecurringEvent.mock.calls.map((c) => (c[0] as { requestId?: string }).requestId);
    expect(sent[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sent[1]).toBe(sent[0]);
    expect(a.createGolfEvent).not.toHaveBeenCalled();
  });

  it('C-17 a published event whose invitations did not go out says so, and does not claim players were notified', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockResolvedValue({ success: true, data: { eventId: 'new-1', invitationsError: "The event was created, but its invitations didn't all go out." } });
    wrap(cal(), { initialNew: true });
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Published · Short game · invitations didn't go out/);
    expect(alert.textContent).toMatch(/invite them again/);
    expect(screen.queryByText(/players notified/)).toBeNull();
  });

  it('C-17 a clean publish still says players were notified', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockResolvedValue({ success: true, data: { eventId: 'new-1' } });
    wrap(cal(), { initialNew: true });
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(1));
    await screen.findByText(/Published · Short game · players notified/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CH-6102 an end before the start is refused', async () => {
    const user = userEvent.setup();
    wrap(cal(), { initialNew: true });
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Range');
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '09:00' } });
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6102', /End has to be after the start/);
    expect(a.createGolfEvent).not.toHaveBeenCalled();
  });

  it('CH-6503 closing the editor with changes asks first', async () => {
    const user = userEvent.setup();
    wrap(cal(), { initialNew: true });
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(code('CH-6503')).toBeNull();
    wrap(cal(), { initialNew: true });
    const titles = await screen.findAllByRole('textbox', { name: 'Event title' });
    await user.type(titles[titles.length - 1]!, 'Range');
    const cancels = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancels[cancels.length - 1]!);
    await expectCode('CH-6503', /Discard this event\?/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  it("a class's Compare schedules (coach) opens New event on the class's day with only its player invited, so Find a time sets them side by side", async () => {
    const user = userEvent.setup();
    wrap(cal(), { initialEvent: 'c2' });
    await user.click(await screen.findByRole('button', { name: 'Compare schedules' }));
    await screen.findByRole('button', { name: 'Publish event' });
    expect(screen.getByText(/^Find a time · /).textContent).toMatch(/14$/);
    const invited = screen.getAllByRole('checkbox', { checked: true }).map((c) => c.closest('label')?.textContent ?? '');
    expect(invited).toHaveLength(1);
    expect(invited[0]).toMatch(/Jonah/);
  });

  it("Duplicate opens New event with the event's title, type, day, time, place and invitees, and publishes a new event", async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockResolvedValue({ success: true });
    wrap(cal(), { initialEvent: 'e9' });
    await eventMenu(user, 'Duplicate');
    await screen.findByRole('button', { name: 'Publish event' });
    expect((screen.getByRole('textbox', { name: 'Event title' }) as HTMLInputElement).value).toBe('Travel briefing');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(1));
    const sent = a.createGolfEvent.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toMatchObject({ title: 'Travel briefing', eventType: 'meeting', startTime: '13:30', endTime: '14:15', location: 'Team room' });
    expect(String(sent.startDate)).toMatch(/-15$/);
    expect((sent.attendeeIds as string[]).length).toBe(PREVIEW_CALENDAR.people.length);
    expect(a.updateGolfEvent).not.toHaveBeenCalled();
  });

  it('CH-6501 CH-6002 cancelling asks first; a failed cancel says so', async () => {
    const user = userEvent.setup();
    a.deleteGolfEvent.mockImplementation(fail);
    wrap(cal(), { initialEvent: 'e9' });
    await eventMenu(user, 'Cancel event');
    await expectCode('CH-6501', /Cancel Travel briefing\?/);
    await user.click(screen.getByRole('button', { name: 'Cancel event' }));
    await expectCode('CH-6002', /Couldn't cancel Travel briefing/);
  });

  it('CH-6501 61101 cancelling one event keeps its replies, but the series scopes delete the events, and the question says which', async () => {
    const user = userEvent.setup();
    a.deleteGolfEvent.mockResolvedValue({ success: true });
    a.deleteRecurringEvent.mockResolvedValue({ success: true });
    wrap(cal(), { initialEvent: 'e4' });
    await eventMenu(user, 'Cancel event');
    await expectCode('CH-6501', /Cancel Short-game block\?/);
    const asked = () => code('CH-6501')!.textContent ?? '';
    expect(asked()).toMatch(/Replies and attendance are kept, and the event stays on the calendar marked cancelled/);
    await user.click(screen.getByRole('radio', { name: 'All in series' }));
    expect(asked()).toMatch(/removed from the calendar, and their replies and attendance with them/);
    expect(asked()).not.toMatch(/are kept/);
    await user.click(screen.getByRole('button', { name: 'Cancel event' }));
    await waitFor(() => expect(a.deleteRecurringEvent).toHaveBeenCalledWith('e4', '2026-10-14T12:00:00Z', 'all'));
    expect(a.deleteGolfEvent).not.toHaveBeenCalled();
  });

  it('CH-6003 CH-6206 CH-6402 calendar links: loading, failing to load, failing to create', async () => {
    const user = userEvent.setup();
    a.getCalendarFeeds.mockImplementationOnce(never);
    wrap(cal());
    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Add to calendar app/ }));
    await expectCode('CH-6402');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    a.getCalendarFeeds.mockResolvedValueOnce({ success: false, error: 'x' });
    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Add to calendar app/ }));
    await expectCode('CH-6206', /Your calendar links didn't load/);
    a.createCalendarFeed.mockImplementation(fail);
    await user.click(within(code('CH-6206') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await user.click((await screen.findAllByRole('button', { name: 'Create link' }))[0]!);
    await expectCode('CH-6003', /Couldn't create the calendar link/);
  });

  it('CH-6004 copying a calendar link fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    a.getCalendarFeeds.mockResolvedValue({ success: true, data: [{ id: 'f1', name: 'Team', type: 'team', url: 'https://x/feed.ics' }] });
    wrap(cal());
    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Add to calendar app/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));
    await expectCode('CH-6004', /Couldn't copy the link/);
  });

  it('CH-6502 CH-6005 removing busy time asks first; a failed remove says so', async () => {
    const user = userEvent.setup();
    a.deleteCoachBlockedTime.mockImplementation(fail);
    wrap(cal(), { initialEvent: 'b1' });
    await user.click(await screen.findByRole('button', { name: 'Remove busy time' }));
    await expectCode('CH-6502', /Remove Recruiting call\?/);
    const confirm = within(code('CH-6502') as HTMLElement).getAllByRole('button', { name: 'Remove' });
    await user.click(confirm[confirm.length - 1]!);
    await expectCode('CH-6005', /Couldn't remove Recruiting call/);
  });

  it('CH-6103 CH-6104 CH-6006 61202 busy time needs a name and a sane time; a failed add keeps the sheet and what was typed', async () => {
    const user = userEvent.setup();
    a.addCoachBlockedTime.mockImplementation(fail);
    wrap(cal());
    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Add busy time/ }));
    const dialog = (await screen.findByRole('heading', { name: 'Add busy time' })).closest('dialog')!;
    const d = within(dialog as HTMLElement);
    fireEvent.change(d.getByLabelText('End time'), { target: { value: '06:00' } });
    await user.click(d.getByRole('button', { name: 'Add busy time' }));
    await expectCode('CH-6103', /Name the block/);
    await expectCode('CH-6104', /End has to be after the start/);
    await user.type(d.getByPlaceholderText('Recruiting call'), 'Film');
    fireEvent.change(d.getByLabelText('End time'), { target: { value: '20:00' } });
    await user.click(d.getByRole('button', { name: 'Add busy time' }));
    await expectCode('CH-6006', /Couldn't add your busy time/);
    expect((d.getByPlaceholderText('Recruiting call') as HTMLInputElement).value).toBe('Film');
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('CH-6008 CH-6207 CH-6403 CH-6303 files: loading, failing, empty, and a failed remove', async () => {
    const user = userEvent.setup();
    a.getEventDocuments.mockImplementationOnce(never);
    const view = wrap(cal(), { initialEvent: 'e9' });
    await expectCode('CH-6403');
    view.unmount();
    a.getEventDocuments.mockResolvedValueOnce({ success: false, error: 'x' });
    const v2 = wrap(cal(), { initialEvent: 'e9' });
    await expectCode('CH-6207', /Files didn't load/);
    v2.unmount();
    a.getEventDocuments.mockResolvedValueOnce({ success: true, data: [] });
    const v3 = wrap(cal(), { initialEvent: 'e9' });
    await expectCode('CH-6303', /No files yet/);
    v3.unmount();
    a.getEventDocuments.mockResolvedValue({ success: true, data: [{ document: { id: 'd1', title: 'Local rules', file_url: '#', file_size: 1000 }, note: null }] });
    a.detachDocumentFromEvent.mockImplementation(fail);
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Remove Local rules' }));
    await expectCode('CH-6008', /Couldn't remove Local rules/);
    expect(screen.getByText('Local rules')).toBeTruthy();
  });

  it('CH-6009 undoing a removed file fails', async () => {
    const user = userEvent.setup();
    a.getEventDocuments.mockResolvedValue({ success: true, data: [{ document: { id: 'd1', title: 'Local rules', file_url: '#', file_size: 1000 }, note: null }] });
    a.detachDocumentFromEvent.mockResolvedValue({ success: true });
    a.attachDocumentToEvent.mockImplementation(fail);
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Remove Local rules' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await expectCode('CH-6009', /Couldn't put Local rules back/);
  });

  it('CH-6007 CH-6208 CH-6404 CH-6304 attaching: loading, failing, empty, and a failed attach', async () => {
    const user = userEvent.setup();
    a.getDocuments.mockImplementationOnce(never);
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Attach' }));
    await expectCode('CH-6404');
    const cancel = () => user.click(within(screen.getByRole('heading', { name: 'Attach a file' }).closest('dialog') as HTMLElement).getByRole('button', { name: 'Cancel' }));
    await cancel();
    a.getDocuments.mockResolvedValueOnce({ success: false, error: 'x' });
    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await expectCode('CH-6208', /Documents didn't load/);
    a.getDocuments.mockResolvedValueOnce({ success: true, data: [] });
    await user.click(within(code('CH-6208') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-6304', /no documents yet/);
    await cancel();
    a.getDocuments.mockResolvedValue({ success: true, data: [{ id: 'd9', title: 'Pairings', file_size: 1000, category: 'Tournament' }] });
    a.attachDocumentToEvent.mockImplementation(fail);
    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await user.click(await screen.findByText('Pairings'));
    const dlg = within(screen.getByRole('heading', { name: 'Attach a file' }).closest('dialog') as HTMLElement);
    await user.click(dlg.getByRole('button', { name: 'Attach' }));
    await expectCode('CH-6007', /Couldn't attach the file/);
  });

  it('CH-6010 a player reply that fails goes back to what it was', async () => {
    const user = userEvent.setup();
    a.respondToEvent.mockImplementation(fail);
    wrap(PREVIEW_CALENDAR_PLAYER, { initialEvent: 'e13' });
    await user.click(await screen.findByRole('radio', { name: 'Going' }));
    await expectCode('CH-6010', /Couldn't send your reply for Round review/);
    expect(screen.getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('false');
  });

  it('CH-6011 CH-6209 CH-6405 attendance: loading, failing to load, failing to save', async () => {
    const user = userEvent.setup();
    a.getAttendanceReport.mockImplementationOnce(never);
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Attendance' }));
    await expectCode('CH-6405');
    await user.click(screen.getByRole('button', { name: 'Travel briefing' }));
    a.getAttendanceReport.mockResolvedValueOnce({ success: false, error: 'x' });
    await user.click(await screen.findByRole('button', { name: 'Attendance' }));
    await expectCode('CH-6209', /Attendance didn't load/);
    a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
    a.markAttendance.mockImplementation(fail);
    await user.click(within(code('CH-6209') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all present' }));
    await user.click(screen.getByRole('button', { name: /Save attendance/ }));
    await expectCode('CH-6011', /Couldn't save attendance/);
  });

  it('CH-6012 copying the event link fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    wrap(cal(), { initialEvent: 'e9' });
    await eventMenu(user, 'Copy link');
    await expectCode('CH-6012', /Couldn't copy the link/);
  });
});

describe('Calendar · seeds from other pages', () => {
  const invitees = () => screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked).map((c) => c.closest('label')?.textContent ?? '');

  it('60103 a new event invites the whole team (Home: New event)', async () => {
    wrap(cal(), { initialNew: true });
    await screen.findByRole('button', { name: 'Publish event' });
    expect(invitees()).toHaveLength(PREVIEW_CALENDAR.people.length);
    expect(screen.getByRole('radio', { name: 'Practice' }).getAttribute('aria-checked')).toBe('true');
  });

  it('60103 a page re-read that lands while the editor is open (a slower refresh, a Retry elsewhere) keeps what the coach typed', async () => {
    const user = userEvent.setup();
    const tree = (data: ChCalendarData) => (
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Calendar data={data} initialNew />
          </div>
        </ToastProvider>
      </LazyMotion>
    );
    const { rerender } = render(tree(cal()));
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.click(screen.getByRole('radio', { name: 'Meeting' }));
    // The same page, read again: equal data in new arrays.
    rerender(tree(cal({ people: PREVIEW_CALENDAR.people.map((p) => ({ ...p })), events: [...PREVIEW_CALENDAR.events] })));
    expect((screen.getByRole('textbox', { name: 'Event title' }) as HTMLInputElement).value).toBe('Short game');
    expect(screen.getByRole('radio', { name: 'Meeting' }).getAttribute('aria-checked')).toBe('true');
  });

  it('60103 Plan 1:1 (?new=1&with=<player>) opens a meeting with only that player invited (D-52), and the address is cleaned so a reload does not open it again', async () => {
    window.history.replaceState(null, '', '/golf/dashboard/calendar?new=1&with=jonah&type=meeting&date=2026-10-14');
    wrap(cal(), { initialNew: true, initialWith: 'jonah' });
    await screen.findByRole('button', { name: 'Publish event' });
    expect(invitees()).toEqual([expect.stringContaining('Jonah Okafor')]);
    expect(screen.getByRole('radio', { name: 'Meeting' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Invite · 1 of/)).toBeTruthy();
    // The seeds are dropped from the address; everything else in it stays.
    expect(window.location.search).toBe('?date=2026-10-14');
    window.history.replaceState(null, '', '/');
  });

  it('60103 a 1:1 with a player the Calendar does not list invites nobody, never the whole team', async () => {
    wrap(cal(), { initialNew: true, initialWith: 'not-on-team' });
    await screen.findByRole('button', { name: 'Publish event' });
    expect(invitees()).toEqual([]);
  });
});

describe('Calendar · reads that fail', () => {
  it('CH-6201 events do not load: a notice, never an empty calendar', async () => {
    const user = userEvent.setup();
    wrap(cal({ eventsError: true, events: [] }));
    await expectCode('CH-6201', /The calendar didn't load/);
    await user.click(within(code('CH-6201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-6202 CH-6203 CH-6212 busy time, classes and the timezone each say so', () => {
    wrap(cal({ busyError: true, classesError: true, settingsError: true }));
    expect(code('CH-6202')!.textContent).toMatch(/Your busy time didn't load/);
    expect(code('CH-6203')!.textContent).toMatch(/Class schedules didn't load/);
    expect(code('CH-6212')!.textContent).toMatch(/Times are shown in Eastern time/);
  });

  it('CH-6213 the roster does not load: the page says so, and the editor never claims an empty roster or "0 of 0"', async () => {
    const user = userEvent.setup();
    wrap(cal({ people: [], membersError: true }));
    expect(code('CH-6213')!.textContent).toMatch(/The roster didn't load/);
    await user.click(screen.getByRole('button', { name: /New event/ }));
    await waitFor(() => expect(document.querySelectorAll('[data-ch-code="CH-6213"]').length).toBe(2));
    expect(screen.queryByText(/No active players on the roster yet/)).toBeNull();
    expect(screen.queryByText(/Invite · 0 of 0/)).toBeNull();
  });

  it('CH-6204 CH-6205 replies do not load: a notice with Try again, in the summary and on the event', async () => {
    const user = userEvent.setup();
    wrap(cal({ rsvpError: true }));
    await expectCode('CH-6204', /Replies didn't load/);
    await user.click(within(code('CH-6204') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
    wrap(cal({ rsvpError: true }), { initialEvent: 'e9' });
    await expectCode('CH-6205', /Replies didn't load/);
  });

  it('CH-6210 a crash in the calendar grid is contained', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e9 = PREVIEW_CALENDAR.events.find((e) => e.id === 'e9')!;
    wrap(cal({ events: [{ ...e9, title: {} as never }] }));
    expect(code('CH-6210')!.textContent).toMatch(/The calendar couldn’t be shown/);
    expect(screen.getByRole('button', { name: /New event/ })).toBeTruthy();
    quiet.mockRestore();
  });

  it('CH-6211 a crash in the detail panel is contained', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e9 = PREVIEW_CALENDAR.events.find((e) => e.id === 'e9')!;
    wrap(cal({ events: [...PREVIEW_CALENDAR.events.filter((e) => e.id !== 'e9'), { ...e9, notes: {} as never }] }), { initialEvent: 'e9' });
    expect(code('CH-6211')!.textContent).toMatch(/The detail panel couldn’t be shown/);
    quiet.mockRestore();
  });
});

describe('Calendar · empty and loading', () => {
  it('CH-6301 nothing in the agenda range', () => {
    wrap(cal({ events: [], view: 'agenda' }));
    expect(code('CH-6301')!.textContent).toMatch(/Nothing on the calendar in this range/);
  });

  it('CH-6309 a team that has never scheduled anything: the page is the first-run empty; Create event opens the editor', async () => {
    const user = userEvent.setup();
    wrap(cal({ events: [], firstRun: true }));
    expect(code('CH-6309')!.textContent).toMatch(/Nothing on the calendar/);
    expect(code('CH-6301')).toBeNull();
    expect(screen.queryByRole('button', { name: /New event/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create event' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('CH-6309 a player never gets it, and a failed read never claims it', () => {
    const { unmount } = wrap({ ...PREVIEW_CALENDAR_PLAYER, events: [], firstRun: true });
    expect(code('CH-6309')).toBeNull();
    unmount();
    wrap(cal({ events: [], firstRun: true, eventsError: true }));
    expect(code('CH-6309')).toBeNull();
  });

  it('CH-6302 CH-6306 nothing today, nothing needing attention', () => {
    wrap(cal({ events: [] }));
    expect(code('CH-6302')!.textContent).toMatch(/Nothing on the team calendar today/);
    expect(code('CH-6306')!.textContent).toMatch(/No overlaps and no replies waiting/);
  });

  it('CH-6401 the route skeleton is busy', () => {
    render(<CalendarSkeleton />);
    expect(code('CH-6401')!.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Calendar · haptics and accessibility', () => {
  it('CH-6701 opening an event ticks', async () => {
    const user = userEvent.setup();
    wrap(cal());
    await user.click(screen.getAllByRole('button', { name: /Travel briefing/ })[0]!);
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('CH-6801 61002 events are named with their time, and overlaps are said out loud', () => {
    wrap(cal());
    expect(screen.getAllByRole('button', { name: /Travel briefing, 1:30/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /schedule overlap/ }).length).toBeGreaterThan(0);
  });

  it('CH-6802 the detail panel is a live region; the event title field has a name and its error', async () => {
    const user = userEvent.setup();
    wrap(cal(), { initialNew: true });
    expect(screen.getByRole('complementary', { name: 'Details' }).getAttribute('aria-live')).toBe('polite');
    await user.click(await screen.findByRole('button', { name: 'Publish event' }));
    const title = screen.getByRole('textbox', { name: 'Event title' });
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toBe('ch-ed-title-err');
  });
});

describe('Calendar · no team', () => {
  it('CH-6307 a coach or player with no team gets the v2 page empty state', () => {
    const { unmount } = render(<CalendarNoTeam coach />);
    const el = code('CH-6307')!;
    expect(el.classList.contains('ch-empty-page')).toBe(true);
    expect(within(el as HTMLElement).getByRole('heading', { level: 2, name: "You aren't on a team yet" })).toBeTruthy();
    expect(el.textContent).toMatch(/once your team is set up/);
    unmount();
    render(<CalendarNoTeam coach={false} />);
    expect(code('CH-6307')!.textContent).toMatch(/once a coach adds you/);
  });
});

describe('Calendar · phone (v2, Coach - Calendar - Mobile.html)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('61901 Day: the week strip and the chosen day’s agenda, classes in their place', async () => {
    const user = userEvent.setup();
    wrap(cal());
    expect(screen.getByRole('heading', { level: 2, name: 'October' })).toBeTruthy();
    const strip = screen.getByRole('list', { name: 'This week' });
    expect(within(strip).getAllByRole('button')).toHaveLength(7);
    expect(within(strip).getByRole('button', { name: /^Wed 14/ }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.ch-calm-dayk')!.textContent).toMatch(/Wed 14 October/);
    expect(screen.getByRole('button', { name: /^Short-game block, 3:30 PM to 5:00 PM/ })).toBeTruthy();
    // Coaches see a class in its slot, with its owner.
    expect(screen.getByRole('button', { name: /^Priya · STAT 201/ })).toBeTruthy();
    await user.click(within(strip).getByRole('button', { name: /^Thu 15/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(document.querySelector('.ch-calm-dayk')!.textContent).toMatch(/Thu 15 October/);
    expect(screen.getByRole('button', { name: /^Travel briefing/ })).toBeTruthy();
  });

  it('61901 Day: once the day is behind us the now line closes the agenda, and with events still to come it sits before them', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 11:30 PM Wed 14 October in New York: every event is over.
      vi.setSystemTime(new Date('2026-10-15T03:30:00Z'));
      const { unmount } = wrap(cal());
      const lines = screen.getAllByRole('separator', { name: /^Now,/ });
      expect(lines).toHaveLength(1);
      expect(document.querySelector('.ch-calm-agenda')!.lastElementChild!.contains(lines[0]!)).toBe(true);
      unmount();
      // 2:40 PM: the line sits before the first event still to start.
      vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
      wrap(cal());
      const mid = screen.getByRole('separator', { name: /^Now,/ });
      expect(mid.nextElementSibling!.getAttribute('aria-label')).toMatch(/^Short-game block/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('61901 an event opens the detail panel in a sheet, with its responses', async () => {
    const user = userEvent.setup();
    wrap(cal());
    await user.click(screen.getByRole('button', { name: /^Short-game block/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Short-game block' });
    expect(within(sheet).getByText('Responses')).toBeTruthy();
  });

  it('61901 Month: a compact grid; a day opens its Day view', async () => {
    const user = userEvent.setup();
    wrap(cal());
    await user.click(screen.getByRole('radio', { name: 'Month' }));
    const day = await screen.findByRole('button', { name: /^Fri 16 October: .*competition/ });
    await user.click(day);
    expect(document.querySelector('.ch-calm-dayk')!.textContent).toMatch(/Fri 16 October/);
  });

  it('CH-6308 a day with nothing on it says so', async () => {
    const user = userEvent.setup();
    wrap(cal());
    await user.click(within(screen.getByRole('list', { name: 'This week' })).getByRole('button', { name: /^Sun 11/ }));
    await expectCode('CH-6308', /Nothing on this day/);
  });

  it('CH-6201 the calendar didn’t load: the notice, never an empty day', () => {
    wrap(cal({ eventsError: true, events: [] }));
    expect(code('CH-6201')).not.toBeNull();
    expect(code('CH-6308')).toBeNull();
  });

  it('61901 60802 a player sees their team events and only their own class', () => {
    wrap(PREVIEW_CALENDAR_PLAYER);
    expect(screen.getByRole('button', { name: /^Short-game block/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Priya · STAT 201/ })).toBeNull();
  });
});

/** Wed 14 October 2026, 2:40 PM in New York: the day the sample was drawn for, so "today" is the day the tests expect. */
const freezeClock = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T18:40:00Z'));
};
const openMore = async (user: User, item: RegExp) => {
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
};
const dialogOpen = () => document.querySelector('dialog[open]') !== null;
const noDialogOpen = () => expect(dialogOpen()).toBe(false);

describe('Calendar · Print and the jump panel', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());

  it("More › Print week prints what is on screen (the board's Print week), and names the view it prints", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    try {
      wrap(cal());
      await openMore(user, /^Print week$/);
      expect(print).toHaveBeenCalledTimes(1);
    } finally {
      print.mockRestore();
    }
  });

  it('the jump panel has its own Close, as Esc and an outside click do', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    wrap(cal());
    const title = screen.getByRole('button', { name: /Jump to a date/ });
    await user.click(title);
    const panel = screen.getByRole('dialog', { name: 'Jump to a date' });
    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Jump to a date' })).toBeNull();
    expect(title.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Calendar · the failure toast’s Retry', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());

  type Scenario = {
    name: string;
    code: string;
    write: () => Mock;
    failed: RegExp;
    done: string;
    drive: (user: User) => Promise<void>;
    /** After the refused write: nothing that follows a landed write has happened. */
    notYet: () => void;
    /** After Retry lands: everything the button would have done has happened. */
    landed: () => Promise<void>;
  };
  const refreshed = () => waitFor(() => expect(router.refresh).toHaveBeenCalled());
  const scenarios: Scenario[] = [
    {
      name: 'publishing an event',
      code: 'CH-6001',
      write: () => a.createGolfEvent,
      failed: /Couldn't publish Short game/,
      done: 'Published · Short game · players notified',
      drive: async (user) => {
        wrap(cal(), { initialNew: true });
        await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Short game');
        await user.click(screen.getByRole('button', { name: 'Publish event' }));
      },
      notYet: () => {
        expect(dialogOpen()).toBe(true);
        expect(router.refresh).not.toHaveBeenCalled();
      },
      landed: async () => {
        await waitFor(noDialogOpen);
        await refreshed();
      },
    },
    {
      name: 'cancelling an event',
      code: 'CH-6002',
      write: () => a.deleteGolfEvent,
      failed: /Couldn't cancel Travel briefing/,
      done: 'Cancelled · Travel briefing · attendees notified',
      drive: async (user) => {
        wrap(cal(), { initialEvent: 'e9' });
        await eventMenu(user, 'Cancel event');
        await expectCode('CH-6501', /Cancel Travel briefing\?/);
        await user.click(screen.getByRole('button', { name: 'Cancel event' }));
      },
      notYet: () => {
        expect(dialogOpen()).toBe(true);
        expect(router.refresh).not.toHaveBeenCalled();
      },
      landed: async () => {
        await waitFor(noDialogOpen);
        await refreshed();
      },
    },
    {
      name: 'creating a calendar-app link',
      code: 'CH-6003',
      write: () => a.createCalendarFeed,
      failed: /Couldn't create the calendar link/,
      done: 'Team schedule link ready',
      drive: async (user) => {
        a.getCalendarFeeds.mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValue({ success: true, data: [{ id: 'f1', name: 'Team', type: 'team', url: 'https://x/feed.ics' }] });
        wrap(cal());
        await openMore(user, /Add to calendar app/);
        await user.click((await screen.findAllByRole('button', { name: 'Create link' }))[0]!);
      },
      notYet: () => {
        expect(a.getCalendarFeeds).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
      },
      landed: async () => {
        await screen.findByRole('button', { name: 'Copy link' });
        expect(a.getCalendarFeeds).toHaveBeenCalledTimes(2);
      },
    },
    {
      name: 'removing busy time',
      code: 'CH-6005',
      write: () => a.deleteCoachBlockedTime,
      failed: /Couldn't remove Recruiting call/,
      done: 'Removed · Recruiting call',
      drive: async (user) => {
        wrap(cal(), { initialEvent: 'b1' });
        await user.click(await screen.findByRole('button', { name: 'Remove busy time' }));
        await expectCode('CH-6502', /Remove Recruiting call\?/);
        const confirm = within(code('CH-6502') as HTMLElement).getAllByRole('button', { name: 'Remove' });
        await user.click(confirm[confirm.length - 1]!);
      },
      notYet: () => {
        expect(dialogOpen()).toBe(true);
        expect(router.refresh).not.toHaveBeenCalled();
      },
      landed: async () => {
        await waitFor(noDialogOpen);
        await refreshed();
        // The panel has left the block it just removed.
        expect(screen.queryByRole('button', { name: 'Remove busy time' })).toBeNull();
      },
    },
    {
      name: 'adding busy time',
      code: 'CH-6006',
      write: () => a.addCoachBlockedTime,
      failed: /Couldn't add your busy time/,
      done: 'Busy time added · Film',
      drive: async (user) => {
        wrap(cal());
        await openMore(user, /Add busy time/);
        const d = within((await screen.findByRole('heading', { name: 'Add busy time' })).closest('dialog') as HTMLElement);
        await user.type(d.getByPlaceholderText('Recruiting call'), 'Film');
        await user.click(d.getByRole('button', { name: 'Add busy time' }));
      },
      notYet: () => {
        expect(dialogOpen()).toBe(true);
        expect(router.refresh).not.toHaveBeenCalled();
      },
      landed: async () => {
        await waitFor(noDialogOpen);
        await refreshed();
      },
    },
    {
      name: 'attaching a file',
      code: 'CH-6007',
      write: () => a.attachDocumentToEvent,
      failed: /Couldn't attach the file/,
      done: 'Attached · Pairings',
      drive: async (user) => {
        a.getDocuments.mockResolvedValue({ success: true, data: [{ id: 'd9', title: 'Pairings', file_size: 1000, category: 'Tournament' }] });
        wrap(cal(), { initialEvent: 'e9' });
        await user.click(await screen.findByRole('button', { name: 'Attach' }));
        await user.click(await screen.findByText('Pairings'));
        await user.click(within(screen.getByRole('heading', { name: 'Attach a file' }).closest('dialog') as HTMLElement).getByRole('button', { name: 'Attach' }));
      },
      notYet: () => {
        expect(dialogOpen()).toBe(true);
        expect(a.getEventDocuments).toHaveBeenCalledTimes(1);
      },
      landed: async () => {
        await waitFor(noDialogOpen);
        // The event’s files are read again, so the new one shows.
        await waitFor(() => expect(a.getEventDocuments).toHaveBeenCalledTimes(2));
      },
    },
    {
      name: 'a player’s reply',
      code: 'CH-6010',
      write: () => a.respondToEvent,
      failed: /Couldn't send your reply for Round review/,
      done: 'You’re going to Round review',
      drive: async (user) => {
        wrap(PREVIEW_CALENDAR_PLAYER, { initialEvent: 'e13' });
        await user.click(await screen.findByRole('radio', { name: 'Going' }));
      },
      notYet: () => {
        expect(screen.getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('false');
        expect(router.refresh).not.toHaveBeenCalled();
      },
      landed: async () => {
        await waitFor(() => expect(screen.getByRole('radio', { name: 'Going' }).getAttribute('aria-checked')).toBe('true'));
        await refreshed();
      },
    },
  ];

  for (const sc of scenarios) {
    it(`61401 60901 ${sc.name}: the toast’s Retry sends the same write again, and everything a landed write does follows this time too`, async () => {
      const user = userEvent.setup();
      const write = sc.write();
      write.mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValue({ success: true });
      await sc.drive(user);
      await expectCode(sc.code, sc.failed);
      expect(write).toHaveBeenCalledTimes(1);
      sc.notYet();
      hapticSpy.mockClear();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
      expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
      await screen.findByText(sc.done);
      expect(hapticSpy).toHaveBeenCalledWith('success');
      await sc.landed();
    });
  }

  it('10703 offline, none of these writes is sent: the shell’s toast names what did not happen, the error haptic fires, and nothing moves on', async () => {
    const line = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      for (const sc of scenarios) {
        const user = userEvent.setup();
        hapticSpy.mockClear();
        router.refresh.mockClear();
        for (const f of Object.values(a)) f.mockClear();
        const write = sc.write();
        await sc.drive(user);
        await expectCode('CH-1903', sc.failed);
        expect([sc.name, write.mock.calls.length, hapticSpy.mock.calls.some(([kind]) => kind === 'error')]).toEqual([sc.name, 0, true]);
        sc.notYet();
        cleanup();
      }
    } finally {
      line.mockRestore();
    }
    // Every write scenario renders and fails in turn: about 1.7s locally, past 5s on CI runners.
  }, 20_000);
});

/* ───────── the server side: the loader, the route and the page ───────── */

const NY = { data: { timezone: 'America/New_York' } };
const rosterRow = (id: string, first: string, last: string) => ({ player: { id, first_name: first, last_name: last, graduation_year: 2027 } });
const ROSTER = [rosterRow('p1', 'Ana', 'Ruiz'), rosterRow('p2', 'Ben', 'Cole'), rosterRow('p3', 'Cy', 'Diaz')];
const eventRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Event ${id}`,
  event_type: 'practice',
  start_time: '2026-10-14T19:30:00Z',
  end_time: '2026-10-14T21:00:00Z',
  location: 'Range',
  description: null,
  status: 'confirmed',
  all_day: false,
  recurrence_rule: null,
  parent_event_id: null,
  ...over,
});
const classRow = (id: string, playerId: string) => ({ id, player_id: playerId, instructor: 'Dr. Osei', days: ['T', 'R'], semester: 'Fall 2026', building: 'Hanes', room: '120' });
const classEventRow = (id: string, classId: string) =>
  eventRow(id, { event_type: 'class', title: `Class ${id}`, description: `[class:${classId}]`, start_time: '2026-10-14T13:00:00Z', end_time: '2026-10-14T14:15:00Z' });
const replyRow = (event_id: string, player_id: string, status: string | null) => ({ id: `${event_id}-${player_id}`, event_id, player_id, status });
const blockRow = { id: 'b1', title: 'Recruiting call', reason: null, description: null, start_date: '2026-10-15', end_date: '2026-10-15', start_time: '09:00', end_time: '10:00', all_day: false, recurrence_rule: null };
/** Every table the loader reads, answering as a healthy team would. */
const healthy = (): Record<string, { data?: unknown; error?: unknown }> => ({
  golf_team_settings: NY,
  golf_teams: { data: { name: 'Varsity' } },
  golf_team_members: { data: ROSTER },
  golf_events: { data: [eventRow('e1'), eventRow('e2', { start_time: '2026-10-15T19:30:00Z', end_time: '2026-10-15T20:30:00Z' })] },
  golf_player_classes: { data: [classRow('k1', 'p1'), classRow('k2', 'p2')] },
  golf_event_attendance: { data: [replyRow('e1', 'p1', 'accepted'), replyRow('e1', 'p2', 'declined'), replyRow('e1', 'p3', null), replyRow('e2', 'p2', 'tentative')] },
  golf_coach_blocked_time: { data: [blockRow] },
});
/** Serve tables to the loader; each answer records the filters it was asked with, and the order tables were read in. */
function serve(answers: Record<string, { data?: unknown; error?: unknown }>) {
  const asked: Record<string, Array<Array<[string, unknown[]]>>> = {};
  const order: string[] = [];
  tables.current = Object.fromEntries(
    Object.entries(answers).map(([table, answer]) => [
      table,
      (filters: Array<[string, unknown[]]>) => {
        (asked[table] ??= []).push(filters);
        order.push(table);
        return answer;
      },
    ]),
  ) as never;
  return { asked, order };
}
const load = (over: Partial<Parameters<typeof loadCalendar>[0]> = {}) =>
  loadCalendar({ role: 'coach', teamId: 't1', viewerPlayerId: null, coachId: 'c1', view: 'week', date: '2026-10-14', ...over });
const asPlayer = (playerId: string) => ({ role: 'player' as const, viewerPlayerId: playerId, coachId: null });
const signedInAs = (who: 'coach' | 'player') => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue((who === 'coach' ? { coach: { id: 'c1' }, player: null } : { coach: null, player: { id: 'p2' } }) as never);
};
const teamOf = (who: 'coach' | 'player' | 'none') => {
  vi.mocked(resolveClubhouseTeam).mockResolvedValue(who === 'coach' ? { role: 'coach', teamId: 't1', coachId: 'c1' } : who === 'player' ? { role: 'player', teamId: 't1', playerId: 'p2' } : null);
};
type RouteEl = ReactElement<{ data: ChCalendarData; initialEvent?: string; initialNew?: boolean; initialWith?: string; initialType?: string; coach?: boolean }>;

describe('Calendar · the loader', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());

  it('CH-6309 the loader counts the team’s events for a coach: none ever is the first run; any, a failed count, or a player is not', async () => {
    serve({ ...healthy(), golf_events: { data: [], count: 0 } as { data?: unknown } });
    expect((await load()).firstRun).toBe(true);
    serve({ ...healthy(), golf_events: { data: [], count: 3 } as { data?: unknown } });
    expect((await load()).firstRun).toBe(false);
    serve({ ...healthy(), golf_events: { data: [], count: 0 } as { data?: unknown } });
    expect((await load(asPlayer('p2'))).firstRun).toBe(false);
    serve({ ...healthy(), golf_events: { data: [], count: 0, error: { message: 'boom' } } as { data?: unknown } });
    expect((await load()).firstRun).toBe(false);
  });

  it('60104 61501 times are the team’s zone: today and the checked hour come from it, a timed event lands on its local day, an all-day date is never shifted', async () => {
    serve({
      ...healthy(),
      golf_events: {
        data: [
          eventRow('late', { start_time: '2026-10-15T02:00:00Z', end_time: '2026-10-15T03:30:00Z' }),
          eventRow('cross', { start_time: '2026-10-15T02:30:00Z', end_time: '2026-10-15T05:00:00Z' }),
          eventRow('span', { all_day: true, start_time: '2026-10-16T00:00:00+00:00', end_time: '2026-10-17T00:00:00+00:00' }),
        ],
      },
    });
    const d = await load();
    expect([d.timezone, d.zoneLabel, d.today]).toEqual(['America/New_York', 'Eastern time', '2026-10-14']);
    expect(d.nowHour).toBeCloseTo(14 + 40 / 60, 5);
    const at = (id: string) => d.events.filter((e) => e.id === id).map((e) => [e.date, e.start, e.end, e.allDay]);
    // 10:00 to 11:30 PM on the 14th in New York is the 15th in UTC: it is filed under the 14th.
    expect(at('late')).toEqual([['2026-10-14', 22, 23.5, false]]);
    // A run that crosses midnight ends at 24 on its own day.
    expect(at('cross')).toEqual([['2026-10-14', 22.5, 24, false]]);
    // An all-day row keeps its stored dates, one entry per day, each naming the whole span.
    expect(at('span')).toEqual([
      ['2026-10-16', null, null, true],
      ['2026-10-17', null, null, true],
    ]);
    expect(d.events.find((e) => e.id === 'span')!.span).toEqual({ from: '2026-10-16', to: '2026-10-17' });
    // Without a saved zone the team is on Eastern time, and the page says so.
    serve({ ...healthy(), golf_team_settings: { error: { message: 'boom' } } });
    const fallback = await load();
    expect([fallback.timezone, fallback.zoneLabel, fallback.settingsError]).toEqual(['America/New_York', 'Eastern time', true]);
  });

  it('60802 60808 a player’s loader reads only their own classes and no busy time; a coach reads every rostered player’s classes and only their own busy time', async () => {
    const events = { data: [eventRow('e1'), classEventRow('c1', 'k1'), classEventRow('c2', 'k2'), classEventRow('c3', 'k-gone')] };
    const owners = (d: ChCalendarData) => d.events.filter((e) => e.type === 'class').map((e) => [e.id, e.owner]);
    const asCoach = serve({ ...healthy(), golf_events: events });
    const coach = await load();
    expect(owners(coach)).toEqual([['c1', 'p1'], ['c2', 'p2'], ['c3', null]]);
    expect(coach.events.filter((e) => e.type === 'busy').map((e) => e.title)).toEqual(['Recruiting call']);
    expect(asCoach.asked.golf_coach_blocked_time).toHaveLength(1);
    expect(asCoach.asked.golf_coach_blocked_time![0]).toContainEqual(['eq', ['coach_id', 'c1']]);
    expect(coach.people.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    // The player is handed a coach id here on purpose: the loader must not use it.
    const asPl = serve({ ...healthy(), golf_events: events });
    const player = await load({ ...asPlayer('p2'), coachId: 'c1' });
    expect(owners(player)).toEqual([['c2', 'p2']]);
    expect(player.events.some((e) => e.type === 'busy')).toBe(false);
    expect(asPl.asked.golf_coach_blocked_time).toBeUndefined();
    expect(player.people.map((p) => p.id)).toEqual(['p2']);
  });

  it('60803 a player’s data carries only their own place on the invite list and their own reply; a coach’s carries everyone’s', async () => {
    serve(healthy());
    const coach = await load();
    const e1 = (d: ChCalendarData) => d.events.find((e) => e.id === 'e1')!;
    expect([e1(coach).people, e1(coach).rsvp]).toEqual([['p1', 'p2', 'p3'], { p1: 'accepted', p2: 'declined', p3: 'pending' }]);
    const p2 = await load(asPlayer('p2'));
    expect([e1(p2).people, e1(p2).rsvp]).toEqual([['p2'], { p2: 'declined' }]);
    expect([p2.events.find((e) => e.id === 'e2')!.people, p2.events.find((e) => e.id === 'e2')!.rsvp]).toEqual([['p2'], { p2: 'maybe' }]);
    // Nothing of a teammate is anywhere in what the player’s browser is sent.
    expect(JSON.stringify(p2)).not.toMatch(/"p1"|"p3"|Ana|Ruiz|Cy Diaz/);
    // A player who was not invited to an event has no place on it and no reply to it.
    const p9 = await load(asPlayer('p9'));
    expect([e1(p9).people, e1(p9).rsvp]).toEqual([[], {}]);
    // The screen still finds the reply this player owes, from that trimmed data.
    const p3 = await load(asPlayer('p3'));
    wrap(p3);
    expect(document.querySelector('.ch-in__need')!.textContent).toMatch(/Event e1/);
  });

  it('62101 the loader reads each table once for the whole screen (the events twice: the window, and the coach’s count for CH-6309), in three rounds: the team, then events with classes and busy time, then every event’s replies together', async () => {
    const { asked, order } = serve({ ...healthy(), golf_events: { data: [eventRow('e1'), eventRow('e2'), eventRow('e3'), classEventRow('c1', 'k1')] } });
    await load();
    expect(Object.fromEntries(Object.entries(asked).map(([table, calls]) => [table, calls.length]))).toEqual({
      golf_team_settings: 1,
      golf_teams: 1,
      golf_team_members: 1,
      golf_events: 2,
      golf_player_classes: 1,
      golf_coach_blocked_time: 1,
      golf_event_attendance: 1,
    });
    expect(order.slice(0, 3).sort()).toEqual(['golf_team_members', 'golf_team_settings', 'golf_teams']);
    expect(order.slice(3, 7).sort()).toEqual(['golf_coach_blocked_time', 'golf_events', 'golf_events', 'golf_player_classes']);
    expect(order[7]).toBe('golf_event_attendance');
    // The replies of the three team events are asked for together (a class takes none), never one event at a time.
    expect(asked.golf_event_attendance![0]).toContainEqual(['in', ['event_id', ['e1', 'e2', 'e3']]]);
  });

  it('62301 a read that fails is logged under calendar and named on the page, never thrown; a write that fails is reported under calendar with its action, after a breadcrumb', async () => {
    const boom = { error: { message: 'boom' } };
    serve({ ...healthy(), golf_team_settings: boom, golf_teams: boom, golf_team_members: boom, golf_events: boom, golf_player_classes: boom, golf_coach_blocked_time: boom });
    const down = await load();
    expect(logServer.mock.calls.map(([surface, read, , area]) => `${surface}.${read}.${area}`).sort()).toEqual([
      'calendar.blockedTime.calendar',
      'calendar.classes.calendar',
      'calendar.eventCount.calendar',
      'calendar.events.calendar',
      'calendar.members.teams',
      'calendar.team.teams',
      'calendar.teamSettings.calendar',
    ]);
    expect([down.eventsError, down.classesError, down.settingsError, down.busyError]).toEqual([true, true, true, true]);
    logServer.mockClear();
    serve({ ...healthy(), golf_event_attendance: boom });
    const noReplies = await load();
    expect(logServer.mock.calls.map(([, read]) => read)).toEqual(['attendance']);
    expect([noReplies.rsvpError, noReplies.eventsError]).toEqual([true, false]);
    // On the page: a refused publish leaves a breadcrumb for the intent, then the action, then a report under calendar.
    const user = userEvent.setup();
    a.createGolfEvent.mockImplementation(fail);
    wrap(cal(), { initialNew: true });
    await user.type(await screen.findByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6001');
    expect(vi.mocked(chTrail).mock.calls.map(([m]) => m)).toEqual(expect.arrayContaining(['calendar create submit', 'action calendar.saveEvent']));
    expect(vi.mocked(chReport)).toHaveBeenCalledWith(expect.any(Error), { surface: 'calendar', action: 'calendar.saveEvent', severity: 'low' });
    // A section that cannot load reports under its own surface.
    a.getCalendarFeeds.mockResolvedValue({ success: false, error: 'x' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await openMore(user, /Add to calendar app/);
    await expectCode('CH-6206');
    expect(vi.mocked(chReport)).toHaveBeenCalledWith(expect.any(Error), { surface: 'calendar.subscribe', severity: 'low' });
  });
});

describe('Calendar · who may open it, and what the route reads for them', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());
  const route = (props: Parameters<typeof ClubhouseCalendarRoute>[0] = {}) => ClubhouseCalendarRoute(props) as Promise<RouteEl | null>;

  it('60805 nobody signed in reads nothing; a coach or player with no team gets the no-team page and nothing is read; each role is loaded as itself', async () => {
    let reads = 0;
    tables.current = new Proxy({}, { get: () => () => (reads++, { data: null }) }) as never;
    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    expect(await route()).toBeNull();
    expect(resolveClubhouseTeam).not.toHaveBeenCalled();
    for (const who of ['coach', 'player'] as const) {
      signedInAs(who);
      teamOf('none');
      const el = (await route())!;
      expect([el.type, el.props.coach]).toEqual([CalendarNoTeam, who === 'coach']);
    }
    expect(reads).toBe(0);
    // A coach is loaded as a coach with their own id, and reads their own busy time.
    const asCoach = serve(healthy());
    signedInAs('coach');
    teamOf('coach');
    const coach = (await route())!;
    expect([coach.type, coach.props.data.role, coach.props.data.viewerPlayerId, coach.props.data.teamId]).toEqual([Calendar, 'coach', null, 't1']);
    expect(asCoach.asked.golf_coach_blocked_time![0]).toContainEqual(['eq', ['coach_id', 'c1']]);
    // A player is loaded as that player, with no coach id, and reads no busy time.
    const playerReads = serve(healthy());
    signedInAs('player');
    teamOf('player');
    const player = (await route())!;
    expect([player.props.data.role, player.props.data.viewerPlayerId, player.props.data.people.map((p) => p.id)]).toEqual(['player', 'p2', ['p2']]);
    expect(playerReads.asked.golf_coach_blocked_time).toBeUndefined();
    // A team the player's membership read could not resolve is an error for the route error view, not "no team".
    vi.mocked(resolveClubhouseTeam).mockRejectedValue(new Error('Clubhouse: the player team membership read failed'));
    await expect(route()).rejects.toThrow(/membership read failed/);
  });

  it('60102 60103 the address decides the view, the day, the open event and the new-event seeds; what is not a real value falls back, and the page passes each through', async () => {
    serve(healthy());
    signedInAs('coach');
    teamOf('coach');
    const el = (await route({ view: 'month', date: '2026-10-20', event: 'e1', isNew: true, withPlayer: 'p2', newType: 'qualifier' }))!;
    expect([el.props.data.view, el.props.data.anchor, el.props.initialEvent, el.props.initialNew, el.props.initialWith, el.props.initialType]).toEqual(['month', '2026-10-20', 'e1', true, 'p2', 'qualifier']);
    // The loaded window follows the day asked for, not today.
    expect(el.props.data.range.from <= '2026-10-20' && '2026-10-20' <= el.props.data.range.to).toBe(true);
    const junk = (await route({ view: 'year', date: 'yesterday', newType: '<script>' }))!;
    expect([junk.props.data.view, junk.props.data.anchor, junk.props.initialType]).toEqual(['week', '2026-10-14', undefined]);
    expect(['day', 'week', 'month', 'agenda', 'year', undefined, '<x>'].map((v) => parseView(v))).toEqual(['day', 'week', 'month', 'agenda', 'week', 'week', 'week']);
    expect(['2026-10-20', '2026-02-30', '2026-13-01', '20261020', '', undefined].map((v) => parseDate(v, 'today'))).toEqual(['2026-10-20', 'today', 'today', 'today', 'today', 'today']);
    // The page: signed out goes to login; a coach or a player gets the route with the address's own words.
    const page = (searchParams: Record<string, string>) => GolfCalendarPage({ searchParams: Promise.resolve(searchParams) });
    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    await expect(page({})).rejects.toThrow('redirect:/golf/login');
    for (const who of ['coach', 'player'] as const) {
      signedInAs(who);
      const routed = (await page({ view: 'day', date: '2026-10-20', event: 'e1', new: '1', with: 'p2', type: 'meeting' })) as ReactElement<Record<string, unknown>>;
      expect([routed.type, routed.props]).toEqual([ClubhouseCalendarRoute, { view: 'day', date: '2026-10-20', event: 'e1', isNew: true, withPlayer: 'p2', newType: 'meeting' }]);
      // Only new=1 asks for the editor.
      expect(((await page({ new: 'true' })) as ReactElement<{ isNew: boolean }>).props.isNew).toBe(false);
    }
  });
});

/* ───────── the screen: what each role is given, and how it moves ───────── */

const tree = (data: ChCalendarData, props: { initialEvent?: string; initialNew?: boolean; initialWith?: string; initialType?: ChCalType } = {}) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Calendar data={data} {...props} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const title = () => screen.getByRole('heading', { level: 1 }).textContent;
const menuItems = () => screen.getAllByRole('menuitem').map((el) => el.textContent);
const jonahsFiles = { document: { id: 'd1', title: 'Local rules', file_url: '#', file_size: 1000 }, note: null };

describe('Calendar · what each role is given', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());

  it('60101 Calendar opens on the week of today for a coach and for a player: the title, the count of team events, the zone and the day’s panel', () => {
    const coach = wrap(cal());
    expect(title()).toBe('Oct 11 – 17');
    expect(document.querySelector('.ch-cal-sub')!.textContent).toBe('14 team events this week · Eastern time');
    expect(screen.getByRole('heading', { level: 2, name: '4 team events today' })).toBeTruthy();
    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('Checked 2:40 PM')).toBeTruthy();
    expect(screen.getByRole('button', { name: /New event/ })).toBeTruthy();
    coach.unmount();
    wrap(PREVIEW_CALENDAR_PLAYER);
    expect(title()).toBe('Oct 11 – 17');
    expect(document.querySelector('.ch-cal-sub')!.textContent).toBe('14 team events this week · Eastern time');
    expect(screen.getByText('Needs your reply')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /New event/ })).toBeNull();
  });

  it('60801 a player has no planning tools: no New event or N key, no editor from ?new=1, no busy time, people filter, overlaps, responses, attendance, edit or cancel; a coach has them', async () => {
    const user = userEvent.setup();
    const seeded = { initialNew: true, initialWith: 'jonah', initialEvent: 'e9' };
    const player = wrap(PREVIEW_CALENDAR_PLAYER, seeded);
    expect(screen.queryByRole('button', { name: /New event/ })).toBeNull();
    expect(dialogOpen()).toBe(false);
    await user.keyboard('n');
    expect(dialogOpen()).toBe(false);
    expect(screen.queryByRole('button', { name: /^People:/ })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /schedule overlap/ })).toHaveLength(0);
    // The panel: a reply, but no responses, attendance, edit, attach or remove.
    expect(screen.getByRole('radiogroup', { name: 'Your reply' })).toBeTruthy();
    expect(screen.queryByText('Responses')).toBeNull();
    for (const name of ['Attendance', 'Edit event', 'Attach']) expect(screen.queryByRole('button', { name })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(menuItems()).toEqual(['Copy link']);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'More' }));
    // Printing is not planning: a player prints their week too.
    expect(menuItems()).toEqual(['Add to calendar app', 'Print week']);
    player.unmount();
    // The same address, for a coach.
    wrap(cal(), seeded);
    await screen.findByRole('button', { name: 'Publish event' });
    expect(dialogOpen()).toBe(true);
    for (const name of [/New event/, /^People:/, 'Attendance', 'Edit event', 'Attach']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(screen.getByText('Responses')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /schedule overlap/ }).length).toBeGreaterThan(0);
  });

  it('60807 a player is offered the reply only on an event they are invited to that has not started and is not cancelled', () => {
    const reply = () => screen.queryByRole('radiogroup', { name: 'Your reply' });
    const patched = (id: string, patch: Partial<ChCalEvent>): ChCalendarData => ({ ...PREVIEW_CALENDAR_PLAYER, events: PREVIEW_CALENDAR_PLAYER.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
    let view = wrap(PREVIEW_CALENDAR_PLAYER, { initialEvent: 'e9' });
    expect(reply()).not.toBeNull();
    view.unmount();
    view = wrap(patched('e9', { people: [], rsvp: {} }), { initialEvent: 'e9' });
    expect(reply()).toBeNull();
    expect(screen.queryByText('Your reply')).toBeNull();
    view.unmount();
    // The 13th has started: the reply is closed, and says so.
    view = wrap(PREVIEW_CALENDAR_PLAYER, { initialEvent: 'e3' });
    expect(reply()).toBeNull();
    expect(screen.getByText('Replies close once an event starts.')).toBeTruthy();
    view.unmount();
    wrap(patched('e9', { cancelled: true }), { initialEvent: 'e9' });
    expect(reply()).toBeNull();
    expect(screen.queryByText('Your reply')).toBeNull();
  });

  it('60804 the calendar-app sheet offers a player only their own schedule link, because the server refuses a team link to anyone but a coach', async () => {
    const user = userEvent.setup();
    a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
    const player = wrap(PREVIEW_CALENDAR_PLAYER);
    await openMore(user, /Add to calendar app/);
    await screen.findByText('My schedule');
    expect(screen.queryByText('Team schedule')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Create link' })).toHaveLength(1);
    player.unmount();
    wrap(cal());
    await openMore(user, /Add to calendar app/);
    await screen.findByText('Team schedule');
    expect(screen.getAllByRole('button', { name: 'Create link' })).toHaveLength(2);
  });

  it('61001 the editor says who is busy at the chosen time, and still lets the event go out', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockResolvedValue({ success: true });
    wrap(cal(), { initialNew: true, initialWith: 'jonah' });
    await screen.findByRole('button', { name: 'Publish event' });
    expect(screen.getByText('Jonah is busy at this time.')).toBeTruthy();
    expect(screen.getByText('Busy at this time')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Event title' }), '1:1 with Jonah');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(a.createGolfEvent).toHaveBeenCalledTimes(1));
  });
});

describe('Calendar · moving around', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());

  it('60302 stepping inside the loaded window moves in place and rewrites the address; stepping past it asks the server for the next window', async () => {
    const user = userEvent.setup();
    const replace = vi.spyOn(window.history, 'replaceState');
    wrap(cal());
    const next = () => user.click(screen.getByRole('button', { name: 'Next week' }));
    await next();
    expect(title()).toBe('Oct 18 – 24');
    expect(replace).toHaveBeenLastCalledWith(null, '', '/golf/dashboard/calendar?date=2026-10-21');
    // The window runs to 25 November: five more weeks stay inside it.
    for (let i = 0; i < 5; i++) await next();
    expect(title()).toBe('Nov 22 – 28');
    expect(router.push).not.toHaveBeenCalled();
    await next();
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/calendar?date=2026-12-02', { scroll: false });
    replace.mockRestore();
  });

  it('60303 when the server sends a new view or day, the screen follows it', () => {
    const view = wrap(cal());
    expect(title()).toBe('Oct 11 – 17');
    view.rerender(tree(cal({ view: 'day', anchor: '2026-10-21' })));
    expect(title()).toBe('Wed, 21 October');
    view.rerender(tree(cal({ view: 'month', anchor: '2026-11-04' })));
    expect(title()).toBe('November');
  });

  it('CH-6305 60102 an event named in the address opens its panel; one that has left the loaded range says so, and an unknown one opens nothing', () => {
    const view = wrap(cal(), { initialEvent: 'e9' });
    expect(screen.getByRole('heading', { level: 2, name: 'Travel briefing' })).toBeTruthy();
    view.rerender(tree(cal({ events: PREVIEW_CALENDAR.events.filter((e) => e.id !== 'e9') }), { initialEvent: 'e9' }));
    expect(code('CH-6305')!.textContent).toMatch(/This event isn't in the loaded range anymore/);
    view.unmount();
    wrap(cal(), { initialEvent: 'not-an-event' });
    expect(code('CH-6305')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: '4 team events today' })).toBeTruthy();
  });

  it('62001 N opens New event for a coach, T goes to today, the arrows step by the view, Esc closes the panel; none fires while typing, with a dialog open or in the agenda', async () => {
    const user = userEvent.setup();
    const view = wrap(cal());
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(title()).toBe('Oct 25 – 31');
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(title()).toBe('Oct 4 – 10');
    await user.keyboard('t');
    expect(title()).toBe('Oct 11 – 17');
    // Esc closes the panel of the open event.
    await user.click(screen.getAllByRole('button', { name: /^Travel briefing/ })[0]!);
    expect(screen.getByRole('heading', { level: 2, name: 'Travel briefing' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { level: 2, name: 'Travel briefing' })).toBeNull();
    // Typing in a field is typing: the people search takes a T and the week stays where it was.
    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('button', { name: /^People:/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Find a player' }), 'nt');
    expect((screen.getByRole('searchbox', { name: 'Find a player' }) as HTMLInputElement).value).toBe('nt');
    expect(title()).toBe('Oct 18 – 24');
    expect(dialogOpen()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    // N opens the editor; with it open the arrows do nothing to the week behind it.
    await user.keyboard('n');
    expect(dialogOpen()).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(title()).toBe('Oct 18 – 24');
    view.unmount();
    // The agenda has no week to step through.
    wrap(cal({ view: 'agenda' }));
    expect(title()).toBe('October');
    await user.keyboard('{ArrowRight}');
    expect(title()).toBe('October');
  });

  it('61402 Try again on a page notice has the server read the page again; on a section it reads only that section', async () => {
    const user = userEvent.setup();
    const view = wrap(cal({ busyError: true, classesError: true, settingsError: true, rsvpError: true }));
    for (const c of ['CH-6202', 'CH-6203', 'CH-6212', 'CH-6204']) {
      router.refresh.mockClear();
      await user.click(within(code(c) as HTMLElement).getByRole('button', { name: 'Try again' }));
      expect([c, router.refresh.mock.calls.length]).toEqual([c, 1]);
    }
    view.unmount();
    router.refresh.mockClear();
    // The calendar-app links.
    a.getCalendarFeeds.mockResolvedValueOnce({ success: false, error: 'x' }).mockResolvedValue({ success: true, data: [] });
    const links = wrap(cal());
    await openMore(user, /Add to calendar app/);
    await expectCode('CH-6206');
    await user.click(within(code('CH-6206') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await screen.findAllByRole('button', { name: 'Create link' });
    expect(a.getCalendarFeeds).toHaveBeenCalledTimes(2);
    links.unmount();
    // An event’s files.
    a.getEventDocuments.mockResolvedValueOnce({ success: false, error: 'x' }).mockResolvedValue({ success: true, data: [] });
    const files = wrap(cal(), { initialEvent: 'e9' });
    await expectCode('CH-6207');
    await user.click(within(code('CH-6207') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-6303');
    expect(a.getEventDocuments).toHaveBeenCalledTimes(2);
    files.unmount();
    // Attendance.
    a.getAttendanceReport.mockResolvedValueOnce({ success: false, error: 'x' });
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Attendance' }));
    await expectCode('CH-6209');
    await user.click(within(code('CH-6209') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Mark all present' });
    expect(a.getAttendanceReport).toHaveBeenCalledTimes(2);
    // None of the four asked the server to read the whole page again.
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('Calendar · changes that show at once, and changes that are kept', () => {
  beforeEach(freezeClock);
  afterEach(() => vi.useRealTimers());

  it('61301 a player’s reply shows at once, before the server answers, and goes back if it refuses', async () => {
    const user = userEvent.setup();
    let settle: (v: unknown) => void = () => {};
    a.respondToEvent.mockImplementation(() => new Promise((r) => (settle = r)));
    wrap(PREVIEW_CALENDAR_PLAYER, { initialEvent: 'e13' });
    const going = () => screen.getByRole('radio', { name: 'Going' }).getAttribute('aria-checked');
    expect(going()).toBe('false');
    await user.click(screen.getByRole('radio', { name: 'Going' }));
    expect(going()).toBe('true');
    await act(async () => settle({ success: false, error: 'nope' }));
    await expectCode('CH-6010');
    expect(going()).toBe('false');
  });

  it('61302 removing a file takes it off the list at once with Undo; Undo puts it back and reads the list again; a refused or thrown Undo says so', async () => {
    const user = userEvent.setup();
    a.getEventDocuments.mockResolvedValue({ success: true, data: [jonahsFiles] });
    // In flight the file is already gone, and it comes back if the server refuses.
    let settle: (v: unknown) => void = () => {};
    a.detachDocumentFromEvent.mockImplementation(() => new Promise((r) => (settle = r)));
    const first = wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Remove Local rules' }));
    expect(screen.queryByText('Local rules')).toBeNull();
    await act(async () => settle({ success: false, error: 'nope' }));
    await expectCode('CH-6008');
    expect(screen.getByText('Local rules')).toBeTruthy();
    first.unmount();
    // Landed: Undo attaches it again and the list is read again.
    a.detachDocumentFromEvent.mockResolvedValue({ success: true });
    a.attachDocumentToEvent.mockResolvedValue({ success: true });
    a.getEventDocuments.mockClear();
    const second = wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Remove Local rules' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(a.attachDocumentToEvent).toHaveBeenCalledWith('e9', 'd1', undefined));
    await waitFor(() => expect(a.getEventDocuments).toHaveBeenCalledTimes(2));
    second.unmount();
    // An Undo that throws is not lost: it is reported, and the person is told to attach it again.
    a.attachDocumentToEvent.mockRejectedValue(new Error('connection lost'));
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Remove Local rules' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await expectCode('CH-6009', /Couldn't put Local rules back/);
    expect(vi.mocked(chReport)).toHaveBeenCalledWith(expect.any(Error), { surface: 'calendar.files', action: 'calendar.undoDetach', severity: 'low' });
    expect(hapticSpy).toHaveBeenLastCalledWith('error');
  });

  it('60701 removing a file, or undoing that, sends nothing while offline: the file stays and the toast says nothing was changed', async () => {
    const user = userEvent.setup();
    a.getEventDocuments.mockResolvedValue({ success: true, data: [jonahsFiles] });
    a.detachDocumentFromEvent.mockResolvedValue({ success: true });
    const line = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      wrap(cal(), { initialEvent: 'e9' });
      await user.click(await screen.findByRole('button', { name: 'Remove Local rules' }));
      await screen.findByText(/Couldn't remove Local rules: you're offline/);
      expect(a.detachDocumentFromEvent).not.toHaveBeenCalled();
      expect(screen.getByText('Local rules')).toBeTruthy();
      expect(hapticSpy).toHaveBeenLastCalledWith('error');
      // Back online the remove lands; gone again, Undo sends nothing.
      line.mockReturnValue(true);
      await user.click(screen.getByRole('button', { name: 'Remove Local rules' }));
      const undo = await screen.findByRole('button', { name: 'Undo' });
      line.mockReturnValue(false);
      await user.click(undo);
      await screen.findByText(/Couldn't put Local rules back: you're offline/);
      expect(a.attachDocumentToEvent).not.toHaveBeenCalled();
    } finally {
      line.mockRestore();
    }
  });

  it('61203 attendance that saves in part keeps the marks that did not save, shows the rest as Saved, and offers to save what is left', async () => {
    const user = userEvent.setup();
    a.markAttendance.mockImplementation(async (_event: string, player: string) => (player === 'theo' ? { success: false, error: 'nope' } : { success: true }));
    wrap(cal(), { initialEvent: 'e9' });
    await user.click(await screen.findByRole('button', { name: 'Attendance' }));
    await user.click(await screen.findByRole('button', { name: 'Mark all present' }));
    await user.click(screen.getByRole('button', { name: 'Save attendance · 6' }));
    await expectCode('CH-6011');
    expect(screen.getAllByText('Saved')).toHaveLength(5);
    expect(screen.getAllByText('Unsaved')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save attendance · 1' })).toBeTruthy();
  });
});

describe('Calendar · this file', () => {
  it('62401 every catalog row of kinds 0 to 5 that is not marked preview is named by a test here, and so is every Bridge ID this page proves', () => {
    const root = process.cwd();
    const read = (file: string) => readFileSync(join(root, file), 'utf8');
    const own = read('src/clubhouse/__tests__/calendar.test.tsx');
    const rows = [...read('docs/clubhouse/catalog/calendar.md').matchAll(/^\|\s*(CH-6[0-5]\d\d)\s*\|.*$/gm)]
      .filter((m) => !/\|\s*preview\s*\|\s*$/.test(m[0].trim()) && !/retired/i.test(m[0]))
      .map((m) => m[1]!);
    // A floor, so an unreadable catalog can't pass by finding nothing.
    expect(rows.length).toBeGreaterThanOrEqual(44);
    expect(rows.filter((c) => !own.includes(c))).toEqual([]);
    // Every hand contract the registry marks implemented is named in a test title of one of the files it lists.
    const bridge = JSON.parse(read('config/clubhouse/bridge-contracts.json')) as Array<{ id: number; page: string; chCode?: string; status: string; tests?: string[] }>;
    const titles = (file: string) => read(file).split('\n').filter((l) => /^\s*(it|describe|test)(\.each\(.*\))?\(/.test(l) || /^\s*(it|test)\(`/.test(l));
    const unnamed = bridge.filter((r) => r.page === 'P006' && !r.chCode && r.status === 'implemented').filter((r) => !(r.tests ?? []).some((f) => titles(f).some((l) => l.includes(String(r.id)))));
    expect(unnamed.map((r) => r.id)).toEqual([]);
  });
});
