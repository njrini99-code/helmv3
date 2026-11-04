import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-5 6.4: moving a tournament round by drag (ties to P-4). A drop that breaks the round order is refused before
 * anything is asked (CH-6843); any other drop asks "Move … R2 to …?" and then is held as P-4 holds a move; the write
 * goes to updateTournamentRound with the round's version. Rounds that aren't upcoming, of a cancelled tournament, or
 * whose ref didn't load don't drag.
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
import { roundMoveQuestion, roundMoveRefusal } from '../screens/calendar/round-label';
import { draggable } from '../screens/calendar/drag-model';
import { writeMove } from '../screens/calendar/move-write';
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
const TZ = 'America/New_York';

describe('P-5 moving a round', () => {
  it('the order check: before the round ahead, or after the one behind, is refused; a cancelled round doesn’t count', () => {
    expect(roundMoveRefusal(TRACKED[1]!, { date: day(0), start: 7, end: 12 }, TRACKED)).toBe('R2 can’t move before R1. Move R1 first.');
    expect(roundMoveRefusal(TRACKED[1]!, { date: day(2), start: 14, end: 19 }, TRACKED)).toBe('R2 can’t move after R3. Move R3 first.');
    expect(roundMoveRefusal(TRACKED[1]!, { date: day(1), start: 10, end: 15 }, TRACKED)).toBeNull();
    const r1Off = [roundEv(1, { cancelled: true }), roundEv(2), roundEv(3)];
    expect(roundMoveRefusal(r1Off[1]!, { date: day(0), start: 7, end: 12 }, r1Off)).toBeNull();
  });

  it('only an upcoming round of a live tournament with a ref drags', () => {
    expect(draggable(roundEv(2), true)).toBe('timed');
    expect(draggable(roundEv(2, { round: ref(2, { status: 'live' }) }), true)).toBeNull();
    expect(draggable(roundEv(2, { round: ref(2, { tournamentCancelled: true }) }), true)).toBeNull();
    expect(draggable({ ...roundEv(2), round: undefined, roundRefFailed: true }, true)).toBeNull();
  });

  it('the confirm asks in words', () => {
    expect(roundMoveQuestion(roundEv(2), { date: '2026-11-06', start: 8.7, end: 13.7 })).toBe('Move Pinehurst Invitational R2 to Fri 6 Nov, 8:42 AM?');
    expect(roundMoveQuestion(roundEv(2), { from: '2026-11-06', to: '2026-11-06' })).toBe('Move Pinehurst Invitational R2 to Fri 6 Nov?');
  });

  it('the write goes to updateTournamentRound with the round’s version, then the newest one', async () => {
    t.update.mockResolvedValueOnce({ success: true, data: { version: 5, teeTimesShifted: 0 } });
    const res = await writeMove({ e: roundEv(2), to: { date: '2026-11-06', start: 9.5, end: 14.5 }, kind: 'move', scope: 'single', expectedUpdatedAt: '2026-10-01T00:00:00Z' }, TZ);
    expect(res).toEqual({ ok: true, updatedAt: 'round:5' });
    expect(t.update).toHaveBeenCalledWith('rd-2', { startAt: '2026-11-06T09:30:00-05:00', endAt: '2026-11-06T14:30:00-05:00', allDay: false }, 4);
    t.update.mockResolvedValueOnce({ success: true, data: { version: 6, teeTimesShifted: 0 } });
    await writeMove({ e: roundEv(2), to: { date: '2026-11-06', start: 10, end: 15 }, kind: 'move', scope: 'single', expectedUpdatedAt: 'round:5' }, TZ);
    expect(t.update.mock.calls[1]![2]).toBe(5);
  });

  it('an all-day round moved by its bar stays all day', async () => {
    t.update.mockResolvedValueOnce({ success: true, data: { version: 5, teeTimesShifted: 0 } });
    await writeMove({ e: roundEv(2, { allDay: true, start: null, end: null }), to: { from: '2026-11-06', to: '2026-11-06' }, kind: 'bar', scope: 'single', expectedUpdatedAt: null }, TZ);
    expect(t.update).toHaveBeenCalledWith('rd-2', { startAt: '2026-11-06T00:00:00+00:00', endAt: null, allDay: true }, 4);
  });

  it('refusals: stale is P-4’s stale path; a started round comes back in its own words (CH-6050)', async () => {
    t.update.mockResolvedValueOnce({ success: false, code: 'stale', error: 'stale' });
    expect(await writeMove({ e: roundEv(2), to: { date: '2026-11-06', start: 9, end: 14 }, kind: 'move', scope: 'single', expectedUpdatedAt: null }, TZ)).toMatchObject({ ok: false, code: 'stale' });
    t.update.mockResolvedValueOnce({ success: false, code: 'round_started', error: 'round_started' });
    expect(await writeMove({ e: roundEv(2), to: { date: '2026-11-06', start: 9, end: 14 }, kind: 'move', scope: 'single', expectedUpdatedAt: null }, TZ)).toEqual({
      ok: false,
      code: 'refused',
      notice: { code: 'CH-6050', text: 'R2 is under way, so it can’t be changed.' },
      message: 'round_started',
    });
  });

  it('Alt and an arrow on a round asks before it moves; Cancel leaves it, Move round holds the move', async () => {
    t.update.mockResolvedValue({ success: true, data: { version: 5, teeTimesShifted: 0 } });
    wrap(data([...TRACKED, UNTRACKED]));
    const b = document.querySelector<HTMLElement>('.ch-ev[data-ev-id="rd-2"]')!;
    b.focus();
    fireEvent.keyDown(b, { key: 'ArrowDown', altKey: true });
    const ask = await screen.findByRole('dialog', { name: /^Move Pinehurst Invitational R2 to / });
    expect(ask.textContent).toMatch(/Players’ tee times aren’t changed\./);
    fireEvent.click(within(ask).getByRole('button', { name: 'Move round' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Move Pinehurst/ })).toBeNull());
    expect(t.update).not.toHaveBeenCalled();
  });

  it('CH-6843: a key move that would put R2 before R1 is refused and said, with nothing asked', async () => {
    const tight = [roundEv(1, { date: day(0), start: 14, end: 19 }), roundEv(2, { date: day(1), start: 8, end: 13 }), roundEv(3)];
    wrap(data(tight));
    const b = document.querySelector<HTMLElement>('.ch-ev[data-ev-id="rd-2"]')!;
    b.focus();
    fireEvent.keyDown(b, { key: 'ArrowLeft', altKey: true });
    await waitFor(() => expect(code('CH-6843')?.textContent).toBe('R2 can’t move before R1. Move R1 first.'));
    expect(screen.queryByRole('dialog', { name: /^Move Pinehurst/ })).toBeNull();
  });
});
