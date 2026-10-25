import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-5 4.9 and 11.2: tracked tournament rounds on the calendar. With a round ref a block shows the tournament's name and
 * an `R1` pill, the agenda a trailing `R1 of 3`, and the inspector the round's facts with Open in Tournaments; an
 * untracked tournament event (the flag on) offers Set up. Without refs everything is the stored title, as today.
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
import { roundLabel } from '../screens/calendar/round-label';
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
const block = (id: string) => document.querySelector<HTMLElement>(`.ch-ev[data-ev-id="${id}"]`);

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('P-5 rounds on the calendar', () => {
  it('roundLabel splits only an event with a ref; a title that merely ends in R2 stays whole', () => {
    expect(roundLabel(roundEv(2), 'Pinehurst Invitational · R2')).toEqual({ name: 'Pinehurst Invitational', round: 2, caption: 'R2 of 3', spoken: ', round 2 of 3', spokenRound: ', round 2 of 3' });
    expect(roundLabel({ round: undefined, cancelled: false }, 'Tar Heel Invitational · R2')).toEqual({ name: 'Tar Heel Invitational · R2', round: null, caption: null, spoken: '', spokenRound: '' });
    expect(roundLabel(roundEv(2, { cancelled: true }), 'Pinehurst Invitational · R2').spoken).toBe(', round 2 of 3, cancelled');
  });

  it('a tracked round’s block shows the name and an R pill, hidden from speech, and its name says the round', () => {
    wrap(data([...TRACKED, UNTRACKED]));
    const b = block('rd-1')!;
    expect(b.querySelector('.ch-ev__t')?.textContent).toBe('Pinehurst Invitational');
    const pill = b.querySelector('.ch-ev__round')!;
    expect(pill.textContent).toBe('R1');
    expect(pill.getAttribute('aria-hidden')).toBe('true');
    expect(b.getAttribute('aria-label')).toMatch(/^Pinehurst Invitational, round 1 of 3, /);
    expect(b.className).toMatch(/\bhas-round\b/);
  });

  it('a cancelled round leads its pill with Ban and says cancelled', () => {
    wrap(data([roundEv(1), roundEv(2, { cancelled: true }), roundEv(3)]));
    const b = block('rd-2')!;
    expect(b.querySelector('.ch-ev__round svg')).not.toBeNull();
    expect(b.getAttribute('aria-label')).toMatch(/round 2 of 3, cancelled/);
  });

  it('a block too short for the pill keeps the stored “Name · R1” title', () => {
    wrap(data([roundEv(1, { start: 8, end: 8.25 })]));
    const b = block('rd-1')!;
    expect(b.querySelector('.ch-ev__round')).toBeNull();
    expect(b.querySelector('.ch-ev__t')?.textContent).toBe('Pinehurst Invitational · R1');
  });

  it('the flag off, or the refs not loaded: blocks show stored titles and no pill (unchanged)', () => {
    wrap(data(TRACKED.map(({ round: _r, ...e }) => ({ ...e, roundRefFailed: true })), { tournamentsEnabled: false }));
    const b = block('rd-1')!;
    expect(b.querySelector('.ch-ev__round')).toBeNull();
    expect(b.querySelector('.ch-ev__t')?.textContent).toBe('Pinehurst Invitational · R1');
    expect(b.getAttribute('aria-label')).not.toMatch(/round 1 of 3/);
  });

  it('a month chip names the tournament with “R1” after it, and says the round', () => {
    wrap(data(TRACKED, { view: 'month' }));
    const chip = [...document.querySelectorAll<HTMLElement>('.ch-mo__ev')].find((el) => el.textContent?.startsWith('Pinehurst Invitational'))!;
    expect(chip.querySelector('.ch-rn')?.textContent).toBe('R1');
    expect(chip.getAttribute('aria-label')).toMatch(/^Pinehurst Invitational, round 1 of 3/);
  });

  it('the agenda keeps the title whole with a trailing “R1 of 3”', () => {
    wrap(data([...TRACKED, UNTRACKED], { view: 'agenda' }));
    // The sample week may sit before the test machine's today: the agenda then folds it under "Show earlier days".
    const earlier = screen.queryByRole('button', { name: /^Show \d+ earlier/ });
    if (earlier) fireEvent.click(earlier);
    const caps = [...document.querySelectorAll('.ch-ag__round')].map((el) => el.textContent);
    expect(caps).toEqual(['R1 of 3', 'R2 of 3', 'R3 of 3']);
    expect(screen.getAllByText('Pinehurst Invitational · R1').length).toBeGreaterThan(0);
  });

  it('the inspector: the round eyebrow, its facts, Open in Tournaments and Edit round; no Duplicate or Delete', async () => {
    wrap(data([...TRACKED, UNTRACKED]), 'rd-2');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pinehurst Invitational' })).toBeTruthy());
    expect(screen.getByText('Tournament · R2 of 3')).toBeTruthy();
    expect(screen.getByText('Tee times')).toBeTruthy();
    expect(screen.getByText('Lineup: Draft')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open in Tournaments' }).getAttribute('href')).toBe(`/golf/dashboard/tournaments/${TOUR}`);
    expect(screen.getByRole('button', { name: 'Edit round' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit event' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Duplicate' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Cancel event' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Delete permanently' })).toBeNull();
  });

  it('a player sees only whether the lineup is published, and no Edit round', async () => {
    wrap(data([roundEv(1, { round: ref(1, { lineup: 'none' }) })], { role: 'player' }), 'rd-1');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pinehurst Invitational' })).toBeTruthy());
    expect(screen.getByText('Lineup: Not published yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit round' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open in Tournaments' })).toBeTruthy();
  });

  it('a round under way keeps Open in Tournaments but drops Edit round', async () => {
    wrap(data([roundEv(1, { round: ref(1, { status: 'live' }) })]), 'rd-1');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open in Tournaments' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Edit round' })).toBeNull();
  });

  it('an untracked tournament event (flag on) says Not in Tournaments; Set up opens the editor with Track on', async () => {
    wrap(data([...TRACKED, UNTRACKED]), 'tour-legacy');
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    const dlg = await screen.findByRole('dialog', { name: /Edit event/ });
    expect((within(dlg).getByRole('switch', { name: 'Track in Tournaments' }) as HTMLInputElement).checked).toBe(true);
    expect(within(dlg).getByRole('button', { name: 'Set up tournament' })).toBeTruthy();
  });

  it('with the flag off an untracked tournament event offers no Set up', async () => {
    wrap(data([UNTRACKED], { tournamentsEnabled: false }), 'tour-legacy');
    await screen.findByRole('button', { name: 'Edit event' });
    expect(screen.queryByText('Not in Tournaments')).toBeNull();
  });
});
