import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-5 4.10 and should 5: cancelling and restoring a round from the calendar. The confirm (CH-6540, or CH-6541 for the
 * whole tournament) strikes the rounds at once; the write waits for the toast's Undo to run out, so Undo sends nothing.
 * Restore writes at once and says so (CH-6044).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const t = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), cancel: vi.fn(), untrack: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-calendar', () => ({ createTournamentFromCalendar: t.create, updateTournamentRound: t.update, setTournamentCancelled: t.cancel, untrackTournament: t.untrack }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ createGolfEvent: vi.fn(), updateGolfEvent: vi.fn(), deleteGolfEvent: vi.fn(), deleteGolfEventPermanently: vi.fn(), respondToEvent: vi.fn() }));
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
import { cancelIds, cancelToast } from '../screens/calendar/cancel-round';
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
async function cancelFromInspector(id = 'rd-2', events = TRACKED) {
  wrap(data([...events, UNTRACKED]), id);
  fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancel round' }));
  return screen.findByRole('dialog', { name: /^Cancel R2 of Pinehurst Invitational\?$/ });
}

describe('P-5 cancel and restore', () => {
  it('the toasts: CH-6042 and CH-6043 cancel with Undo, CH-6044 restores', () => {
    const r = { roundNo: 2, name: 'Pinehurst Invitational' };
    expect(cancelToast('round', r, false)).toEqual({ code: 'CH-6042', title: 'R2 is cancelled' });
    expect(cancelToast('tournament', r, false)).toEqual({ code: 'CH-6043', title: 'Pinehurst Invitational is cancelled' });
    expect(cancelToast('round', r, true)).toEqual({ code: 'CH-6044', title: 'R2 is back on the calendar' });
    expect(cancelIds(TRACKED[1]!, 'tournament', [...TRACKED, UNTRACKED])).toEqual(['rd-1', 'rd-2', 'rd-3']);
    expect(cancelIds(TRACKED[1]!, 'round', TRACKED)).toEqual(['rd-2']);
  });

  it('CH-6540: Cancel R2 strikes it at once, toasts CH-6042 with Undo, and writes nothing until the toast goes', async () => {
    t.cancel.mockResolvedValue({ success: true, data: { version: 5, changedEventIds: ['rd-2'] } });
    const dlg = await cancelFromInspector();
    expect(code('CH-6540')).not.toBeNull();
    fireEvent.change(within(dlg).getByLabelText('Reason · optional'), { target: { value: 'Frost' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel R2' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await waitFor(() => expect(document.querySelector('.ch-ev[data-ev-id="rd-2"]')?.classList.contains('is-cancelled')).toBe(true));
    const toast = await waitFor(() => code('CH-6042') as HTMLElement);
    expect(toast.textContent).toMatch(/R2 is cancelled/);
    expect(t.cancel).not.toHaveBeenCalled();
    fireEvent.click(within(toast).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(t.cancel).toHaveBeenCalledWith(TOUR, 'rd-2', true, 'Frost', 4));
  });

  it('Undo un-strikes the round and sends nothing', async () => {
    const dlg = await cancelFromInspector();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel R2' }));
    const toast = await waitFor(() => code('CH-6042') as HTMLElement);
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(document.querySelector('.ch-ev[data-ev-id="rd-2"]')?.classList.contains('is-cancelled')).toBe(false));
    expect(t.cancel).not.toHaveBeenCalled();
  });

  it('CH-6541: Cancel the whole tournament instead strikes every round and toasts CH-6043', async () => {
    t.cancel.mockResolvedValue({ success: true, data: { version: 5, changedEventIds: ['rd-1', 'rd-2', 'rd-3'] } });
    const dlg = await cancelFromInspector();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel the whole tournament instead' }));
    const t2 = await screen.findByRole('dialog', { name: 'Cancel Pinehurst Invitational?' });
    expect(code('CH-6541')).not.toBeNull();
    expect(t2.textContent).toMatch(/All 3 rounds are struck through for players\. Nothing is deleted, so you can restore it\./);
    fireEvent.click(within(t2).getByRole('button', { name: 'Cancel tournament' }));
    await waitFor(() => expect(['rd-1', 'rd-2', 'rd-3'].every((id) => document.querySelector(`.ch-ev[data-ev-id="${id}"]`)?.classList.contains('is-cancelled'))).toBe(true));
    const toast = await waitFor(() => code('CH-6043') as HTMLElement);
    fireEvent.click(within(toast).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(t.cancel).toHaveBeenCalledWith(TOUR, null, true, null, 4));
  });

  it('a refusal after the toast (scores entered meanwhile) un-strikes the round and says why (CH-6051)', async () => {
    t.cancel.mockResolvedValue({ success: false, code: 'round_has_scores', error: 'round_has_scores' });
    const dlg = await cancelFromInspector();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel R2' }));
    const toast = await waitFor(() => code('CH-6042') as HTMLElement);
    fireEvent.click(within(toast).getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => expect(code('CH-6051')?.textContent).toMatch(/R2 has scores, so it can’t be cancelled\./));
    expect(document.querySelector('.ch-ev[data-ev-id="rd-2"]')?.classList.contains('is-cancelled')).toBe(false);
  });

  it('CH-6044: Restore round writes at once, with no Undo', async () => {
    t.cancel.mockResolvedValue({ success: true, data: { version: 6, changedEventIds: ['rd-2'] } });
    wrap(data([roundEv(1), roundEv(2, { cancelled: true }), roundEv(3)]), 'rd-2');
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore round' }));
    await waitFor(() => expect(t.cancel).toHaveBeenCalledWith(TOUR, 'rd-2', false, null, 4));
    const toast = await waitFor(() => code('CH-6044') as HTMLElement);
    expect(toast.textContent).toMatch(/R2 is back on the calendar/);
    expect(within(toast).queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('CH-6058: a restore that another round moved in front of is refused in order words', async () => {
    t.cancel.mockResolvedValue({ success: false, code: 'round_order', error: 'round_order' });
    wrap(data([roundEv(1), roundEv(2, { cancelled: true }), roundEv(3)]), 'rd-2');
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore round' }));
    await waitFor(() => expect(code('CH-6058')?.textContent).toMatch(/R2 can’t come back where it was/));
  });

  it('round mode offers Cancel round for an upcoming round and opens the same confirm', async () => {
    wrap(data([...TRACKED, UNTRACKED]), 'rd-2');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit round' }));
    const dlg = await screen.findByRole('dialog', { name: 'Edit round' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel round' }));
    expect(await screen.findByRole('dialog', { name: /^Cancel R2 of Pinehurst Invitational\?$/ })).toBeTruthy();
  });
});
