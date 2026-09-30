import { LazyMotion, domAnimation } from 'framer-motion';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Calendar: every numbered state in docs/clubhouse/catalog/calendar.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
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

import type { ChCalendarData } from '../data/calendar';
import { Calendar } from '../screens/calendar/Calendar';
import { CalendarSkeleton } from '../screens/calendar/CalendarSkeleton';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR, PREVIEW_CALENDAR_PLAYER } from '../preview/fixtures-calendar';
import './dialog-polyfill';

/** A numbered element that is actually on screen: a closed <dialog> doesn't count. */
const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function wrap(data: ChCalendarData, props: { initialEvent?: string; initialNew?: boolean; initialWith?: string } = {}) {
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
  for (const f of Object.values(a)) f.mockReset();
  a.getEventDocuments.mockResolvedValue({ success: true, data: [] });
  a.getCalendarFeeds.mockResolvedValue({ success: true, data: [] });
  a.getDocuments.mockResolvedValue({ success: true, data: [] });
  a.getAttendanceReport.mockResolvedValue({ success: true, data: { attendance: [] } });
});

describe('Calendar · saves that fail', () => {
  it('CH-6101 CH-6001 a new event needs a title; a failed publish keeps the editor', async () => {
    const user = userEvent.setup();
    a.createGolfEvent.mockImplementation(fail);
    wrap(cal(), { initialNew: true });
    await user.click(await screen.findByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6101', /Give the event a title/);
    expect(a.createGolfEvent).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Event title' }), 'Short game');
    await user.click(screen.getByRole('button', { name: 'Publish event' }));
    await expectCode('CH-6001', /Couldn't publish Short game/);
    expect(screen.getByRole('textbox', { name: 'Event title' })).toBeTruthy();
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

  it('CH-6501 CH-6002 cancelling asks first; a failed cancel says so', async () => {
    const user = userEvent.setup();
    a.deleteGolfEvent.mockImplementation(fail);
    wrap(cal(), { initialEvent: 'e9' });
    await eventMenu(user, 'Cancel event');
    await expectCode('CH-6501', /Cancel Travel briefing\?/);
    await user.click(screen.getByRole('button', { name: 'Cancel event' }));
    await expectCode('CH-6002', /Couldn't cancel Travel briefing/);
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

  it('CH-6103 CH-6104 CH-6006 busy time needs a name and a sane time; a failed add keeps it', async () => {
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

  it('a new event invites the whole team (Home: New event)', async () => {
    wrap(cal(), { initialNew: true });
    await screen.findByRole('button', { name: 'Publish event' });
    expect(invitees()).toHaveLength(PREVIEW_CALENDAR.people.length);
    expect(screen.getByRole('radio', { name: 'Practice' }).getAttribute('aria-checked')).toBe('true');
  });

  it('Plan 1:1 (?new=1&with=<player>) opens a meeting with only that player invited (D-52)', async () => {
    wrap(cal(), { initialNew: true, initialWith: 'jonah' });
    await screen.findByRole('button', { name: 'Publish event' });
    expect(invitees()).toEqual([expect.stringContaining('Jonah Okafor')]);
    expect(screen.getByRole('radio', { name: 'Meeting' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Invite · 1 of/)).toBeTruthy();
  });

  it('a 1:1 with a player the Calendar does not list invites nobody, never the whole team', async () => {
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

  it('CH-6801 events are named with their time, and overlaps are said out loud', () => {
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
