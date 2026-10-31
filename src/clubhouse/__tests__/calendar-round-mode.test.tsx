import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-5 4.3 and 11.2: round mode. Edit round on a tracked round opens a narrow editor: the banner names the tournament,
 * and only the day, times, start, notes, invitees and RSVP change, through updateTournamentRound with the round's
 * version. A stale version keeps the values with Reload; a round under way is read-only; a round whose ref didn't load
 * changes only its time, through the calendar's own save (CH-6240).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const t = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), cancel: vi.fn(), untrack: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-calendar', () => ({ createTournamentFromCalendar: t.create, updateTournamentRound: t.update, setTournamentCancelled: t.cancel, untrackTournament: t.untrack }));
const ce = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: vi.fn(), updateGolfEvent: ce.update, deleteGolfEvent: vi.fn(), deleteGolfEventPermanently: vi.fn(), respondToEvent: vi.fn() }));
vi.mock('@/app/golf/actions/recurring-events', () => ({ createRecurringEvent: vi.fn(), deleteRecurringEvent: vi.fn(), editRecurringEvent: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-feeds', () => ({ getCalendarFeeds: vi.fn(async () => ({ success: true, data: [] })), createCalendarFeed: vi.fn(), regenerateCalendarFeed: vi.fn(), deleteCalendarFeed: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-blocked-time', () => ({ addCoachBlockedTime: vi.fn(), deleteCoachBlockedTime: vi.fn() }));
vi.mock('@/app/golf/actions/event-documents', () => ({ getEventDocuments: vi.fn(async () => ({ success: true, data: [] })), attachDocumentToEvent: vi.fn(), detachDocumentFromEvent: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn() }));
vi.mock('@/app/golf/actions/attendance', () => ({ getAttendanceReport: vi.fn(), markAttendance: vi.fn() }));
vi.mock('@/app/golf/actions/travel', () => ({ getItineraryForEvent: () => Promise.resolve({ success: true, data: null }) }));
vi.mock('@/app/golf/actions/course-library', () => ({
  listCoursesStrict: vi.fn(async ({ query }: { query?: string }) => (query && !'pinehurst no. 2'.includes(query.toLowerCase()) ? [] : [{ id: '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', name: 'Pinehurst No. 2', city: 'Pinehurst', state: 'NC', total_par: 72 }])),
  getTeamSavedCourses: vi.fn(async () => []),
  getCourseDetail: vi.fn(async () => ({ course: {}, tees: [{ id: 'tee-blue', tee_name: 'Blue', total_par: 72, total_yards: 7214, holes_count: 18, is_draft: false }] })),
}));

import { Calendar } from '../screens/calendar/Calendar';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_CALENDAR } from '../preview/fixtures-calendar';
import type { ChCalendarData } from '../data/calendar';
import type { ChCalEvent, ChCalRoundRef } from '../screens/calendar/model';
import { roundSavedToast } from '../screens/calendar/editor-round';
import './dialog-polyfill';

const TEAM = '00000000-0000-4000-8000-0000000000aa';
const TOUR = '00000000-0000-4000-8000-00000000t001'.replace('t', '0');
const base: ChCalEvent = { ...PREVIEW_CALENDAR.events.find((e) => e.type === 'tournament' && !e.allDay)! };
const ref = (n: number, over: Partial<ChCalRoundRef> = {}): ChCalRoundRef => ({ tournamentId: TOUR, name: 'Pinehurst Invitational', roundNo: n, roundsCount: 3, version: 4, status: 'upcoming', startType: 'tee_times', lockedAt: null, lineup: 'draft', tournamentCancelled: false, courseLabel: null, ...over });
const day = (i: number) => {
  const d = new Date(`${PREVIEW_CALENDAR.today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
const roundEv = (n: number, over: Partial<ChCalEvent> = {}): ChCalEvent => ({ ...base, id: `rd-${n}`, title: `Pinehurst Invitational · R${n}`, date: day(n - 1), start: 8, end: 13, allDay: false, span: null, recurring: null, cancelled: false, location: 'Pinehurst No. 2', round: ref(n), ...over });
const TRACKED = [roundEv(1), roundEv(2), roundEv(3)];
const UNTRACKED: ChCalEvent = { ...base, id: 'tour-legacy', title: 'Wolfpack Classic', date: day(0), start: 14, end: 18, allDay: false, span: null, recurring: null, cancelled: false, round: undefined };

const data = (events: ChCalEvent[], over: Partial<ChCalendarData> = {}): ChCalendarData => ({ ...PREVIEW_CALENDAR, teamId: TEAM, tournamentsEnabled: true, view: 'week', anchor: PREVIEW_CALENDAR.today, events, ...over });

function wrap(d: ChCalendarData, initialEvent?: string) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={d} initialEvent={initialEvent} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
async function openRound(id = 'rd-2', events = TRACKED) {
  wrap(data([...events, UNTRACKED]), id);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit round' }));
  return screen.findByRole('dialog', { name: 'Edit round' });
}
function setTime(dlg: HTMLElement, label: string, value: string) {
  const f = within(dlg).getByRole('combobox', { name: label });
  fireEvent.change(f, { target: { value } });
  fireEvent.blur(f);
}

describe('P-5 round mode', () => {
  it('CH-6041: the toast says where the round went, or that it has no tee time; other edits are the calendar’s Saved', () => {
    expect(roundSavedToast({ label: 'R2', date: '2026-11-06', tee: '08:30', moved: true, teeTimesShifted: 0 })).toEqual({ code: 'CH-6041', title: 'R2 moved to Fri 6 Nov, 8:30 AM' });
    expect(roundSavedToast({ label: 'R2', date: '2026-11-06', tee: '08:30', moved: true, teeTimesShifted: 5 }).title).toBe('R2 moved to Fri 6 Nov, 8:30 AM. Tee times moved with it.');
    expect(roundSavedToast({ label: 'R2', date: '2026-11-06', tee: null, moved: true, teeTimesShifted: 0 })).toEqual({ code: 'CH-6041', title: 'R2 has no tee time now' });
    expect(roundSavedToast({ label: 'R2', date: '2026-11-06', tee: '08:30', moved: false, teeTimesShifted: 0 })).toEqual({ code: 'CH-6001', title: 'Saved · R2' });
  });

  it('Edit round opens round mode: the banner, no title or type, and Edit tournament', async () => {
    const dlg = await openRound();
    expect(within(dlg).getByRole('note').textContent).toMatch(/^R2Part of Pinehurst Invitational · R2 of 3Course, format and lineup are edited in Tournaments\./);
    expect(within(dlg).queryByLabelText('Event title')).toBeNull();
    expect(within(dlg).queryByRole('radiogroup', { name: 'Event type' })).toBeNull();
    expect(within(dlg).queryByText('Location')).toBeNull();
    expect(within(dlg).getByRole('button', { name: 'Edit tournament, opens Tournaments' })).toBeTruthy();
    expect(within(dlg).getByRole('radiogroup', { name: 'Start' })).toBeTruthy();
  });

  it('a new first tee saves through updateTournamentRound with the round’s version, and the end keeps its length', async () => {
    t.update.mockResolvedValue({ success: true, data: { version: 5, teeTimesShifted: 0 } });
    const dlg = await openRound();
    setTime(dlg, 'First tee', '09:30');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(t.update).toHaveBeenCalledTimes(1));
    const [id, patch, version] = t.update.mock.calls[0]!;
    expect(id).toBe('rd-2');
    expect(version).toBe(4);
    expect(patch).toMatchObject({ allDay: false });
    expect(patch.startAt).toMatch(new RegExp(`^${day(1)}T09:30:00[+-]\\d{2}:\\d{2}$`));
    expect(patch.endAt).toMatch(new RegExp(`^${day(1)}T14:30:00`));
    expect(patch).not.toHaveProperty('attendeeIds');
    await waitFor(() => expect(code('CH-6041')?.textContent).toMatch(/R2 moved to .*, 9:30 AM/));
  });

  it('Clear time makes the round all day', async () => {
    t.update.mockResolvedValue({ success: true, data: { version: 5, teeTimesShifted: 0 } });
    const dlg = await openRound();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Clear time' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(t.update).toHaveBeenCalledTimes(1));
    expect(t.update.mock.calls[0]![1]).toMatchObject({ allDay: true, endAt: null, startAt: `${day(1)}T00:00:00+00:00` });
    await waitFor(() => expect(code('CH-6041')?.textContent).toMatch(/R2 has no tee time now/));
  });

  it('CH-6241: a stale version keeps the values and offers Reload', async () => {
    t.update.mockResolvedValue({ success: false, code: 'stale', error: 'stale' });
    const dlg = await openRound();
    setTime(dlg, 'First tee', '09:30');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(code('CH-6241')).not.toBeNull());
    expect(code('CH-6241')!.textContent).toMatch(/This tournament changed since you opened it\. Reload to see the latest\./);
    expect(within(dlg).getByRole('combobox', { name: 'First tee' })).toBeTruthy();
    fireEvent.click(within(code('CH-6241') as HTMLElement).getByRole('button', { name: 'Reload' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-6143: a day before the round ahead of it is refused in order words', async () => {
    t.update.mockResolvedValue({ success: false, code: 'round_order', error: 'round_order' });
    const dlg = await openRound();
    setTime(dlg, 'First tee', '06:00');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(code('CH-6143')?.textContent).toMatch(/Rounds go in order\. R2 can’t start before R1\./));
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });

  it('a notes-only change is the calendar’s Saved, with no move', async () => {
    t.update.mockResolvedValue({ success: true, data: { version: 5, teeTimesShifted: 0 } });
    const dlg = await openRound();
    fireEvent.change(within(dlg).getByLabelText('Notes · optional'), { target: { value: 'Bus at 6:15.' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(t.update).toHaveBeenCalledTimes(1));
    expect(t.update.mock.calls[0]![1]).toEqual({ description: 'Bus at 6:15.' });
  });

  it('closing with changes asks first (CH-6503)', async () => {
    const dlg = await openRound();
    fireEvent.change(within(dlg).getByLabelText('Notes · optional'), { target: { value: 'Bus at 6:15.' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(code('CH-6503')).not.toBeNull());
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeTruthy();
  });

  it('a round under way opens read-only: every field off, the banner says why, and only Close', async () => {
    const { RoundEditor } = await import('../screens/calendar/editor-round');
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <RoundEditor event={roundEv(2, { round: ref(2, { status: 'live' }) })} onClose={vi.fn()} onSaved={vi.fn()} people={PREVIEW_CALENDAR.people} timezone="America/New_York" />
          </div>
        </ToastProvider>
      </LazyMotion>,
    );
    const dlg = await screen.findByRole('dialog', { name: 'Round' });
    expect(within(dlg).getByRole('note').textContent).toMatch(/R2 is under way\. Change it from Tournaments\./);
    expect((within(dlg).getByRole('combobox', { name: 'First tee' }) as HTMLInputElement).closest('fieldset')!.disabled).toBe(true);
    expect(within(dlg).queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(within(dlg).getAllByRole('button', { name: 'Close' }).some((b) => b.textContent === 'Close')).toBe(true);
  });

  it('CH-6240: a round whose ref didn’t load changes only its time, through the calendar’s save', async () => {
    ce.update.mockResolvedValue({ success: true, data: {} });
    const failed = { ...roundEv(2), round: undefined, roundRefFailed: true };
    wrap(data([roundEv(1), failed, roundEv(3)]), 'rd-2');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit event' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit round' });
    expect(code('CH-6240')?.textContent).toBe('Couldn’t load the tournament for this round. You can still change its time.');
    expect(within(dlg).queryByRole('radiogroup', { name: 'Start' })).toBeNull();
    setTime(dlg, 'First tee', '09:30');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(ce.update).toHaveBeenCalledTimes(1));
    expect(ce.update.mock.calls[0]).toEqual(['rd-2', expect.objectContaining({ startDate: day(1), startTime: '09:30', allDay: false })]);
    expect(t.update).not.toHaveBeenCalled();
  });
});
