import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P-5 11.2: the calendar editor's tournament section. Choosing Tournament (with golf_tournaments_v1 on) opens it in
 * place with Track on and hides the date, all-day, repeat, place and find-a-time fields; with the flag off the editor is
 * exactly today's. A save goes to createTournamentFromCalendar with the model's payload; a refusal keeps the editor
 * open with its numbered notice.
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
import type { ChCalEvent } from '../screens/calendar/model';
import './dialog-polyfill';

const TEAM = '00000000-0000-4000-8000-0000000000aa';
const data = (over: Partial<ChCalendarData> = {}): ChCalendarData => ({ ...PREVIEW_CALENDAR, teamId: TEAM, tournamentsEnabled: true, ...over });
const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;

function wrap(d: ChCalendarData, props: { initialNew?: boolean; initialType?: 'tournament' | 'practice'; initialEvent?: string } = {}) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Calendar data={d} {...props} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
const editor = () => screen.getByRole('dialog', { name: /New event|Edit event/ });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('P-5 the tournament section', () => {
  it('choosing Tournament opens the section with Track on and hides the date, time, place and repeat fields', async () => {
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    expect(within(dlg).getByRole('group', { name: 'Tournament details' })).toBeTruthy();
    expect((within(dlg).getByRole('switch', { name: 'Track in Tournaments' }) as HTMLInputElement).checked).toBe(true);
    expect(within(dlg).queryByText('Location')).toBeNull();
    expect(within(dlg).queryByText('All day')).toBeNull();
    expect(within(dlg).queryByRole('radiogroup', { name: 'Repeat' })).toBeNull();
    expect(within(dlg).getByLabelText('Tournament name')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Create tournament' })).toBeTruthy();
    expect(within(dlg).getByText('Creates the tournament, with one calendar entry per round.')).toBeTruthy();
    expect(within(dlg).getByRole('note').textContent).toMatch(/^Creates the tournament in Tournaments with 1 round on /);
  });

  it('with golf_tournaments_v1 off, Tournament is today’s editor: no section, the date and place fields stay', async () => {
    wrap(data({ tournamentsEnabled: false }), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    expect(within(dlg).queryByRole('group', { name: 'Tournament details' })).toBeNull();
    expect(within(dlg).getByText('Location')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Publish event' })).toBeTruthy();
  });

  it('turning Track off brings the plain fields back and says it saves a calendar entry only', async () => {
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.click(within(dlg).getByRole('switch', { name: 'Track in Tournaments' }));
    expect(within(dlg).getByText('Location')).toBeTruthy();
    expect(within(dlg).getByText('Saves as a calendar entry only. Turn on to follow lineups, scores and results in Tournaments.')).toBeTruthy();
    expect(within(dlg).getByRole('button', { name: 'Publish event' })).toBeTruthy();
  });

  it('a legacy tournament event opens with Track off and the legacy hint', async () => {
    const legacy: ChCalEvent = { ...PREVIEW_CALENDAR.events.find((e) => e.type === 'tournament')! };
    wrap(data({ events: [...PREVIEW_CALENDAR.events.filter((e) => e.id !== legacy.id), legacy] }), { initialEvent: legacy.id });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit event' }));
    const dlg = await waitFor(editor);
    expect((within(dlg).getByRole('switch', { name: 'Track in Tournaments' }) as HTMLInputElement).checked).toBe(false);
    expect(within(dlg).getByText('This event isn’t in Tournaments yet. Turn on to set it up there.')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('switch', { name: 'Track in Tournaments' }));
    expect(within(dlg).getByRole('button', { name: 'Set up tournament' })).toBeTruthy();
    expect(within(dlg).getByRole('note').textContent).toMatch(/This event becomes R1 and keeps its replies and files/);
  });

  it('no course: the save is refused here with CH-6140 and focus on the course field', async () => {
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.change(within(dlg).getByLabelText('Tournament name'), { target: { value: 'Pinehurst Invitational' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create tournament' }));
    await waitFor(() => expect(code('CH-6140')?.textContent).toBe('Pick a course to set up the tournament, or turn off Track in Tournaments.'));
    expect(document.activeElement?.id).toBe('ch-tfx-course');
    expect(t.create).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
  });

  async function pickCourse(dlg: HTMLElement) {
    fireEvent.click(within(dlg).getByRole('button', { name: 'Course, not chosen' }));
    const picker = await screen.findByRole('dialog', { name: 'Course' });
    fireEvent.click(await within(picker).findByRole('button', { name: /Pinehurst No\. 2/ }));
    fireEvent.click(await within(picker).findByRole('button', { name: /Pick tees later/ }));
    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Course, Pinehurst No. 2, Tees later' })).toBeTruthy());
  }

  it('a save sends the model’s payload and toasts CH-6040 with Open, no Undo', async () => {
    t.create.mockResolvedValue({ success: true, data: { tournamentId: 'tour-1', version: 1, replayed: false, rounds: [{ roundNumber: 1, eventId: 'ev-r1' }] } });
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.change(within(dlg).getByLabelText('Tournament name'), { target: { value: 'Pinehurst Invitational' } });
    await pickCourse(dlg);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create tournament' }));
    await waitFor(() => expect(t.create).toHaveBeenCalledTimes(1));
    const payload = t.create.mock.calls[0]![0];
    expect(payload).toMatchObject({ teamId: TEAM, name: 'Pinehurst Invitational', courseId: '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', format: '5c4', holesPerRound: 18, requiresRsvp: false });
    expect(payload.rounds).toEqual([{ date: PREVIEW_CALENDAR.today, startAt: `${PREVIEW_CALENDAR.today}T00:00:00+00:00`, endAt: null, allDay: true, startType: 'tee_times' }]);
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
    const toast = await waitFor(() => {
      const el = code('CH-6040');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(toast.textContent).toMatch(/Pinehurst Invitational is set up in Tournaments/);
    fireEvent.click(within(toast as HTMLElement).getByRole('button', { name: 'Open' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/tournaments/tour-1');
    expect(within(toast as HTMLElement).queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('CH-6840: Track off and on again is said once each, politely', async () => {
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    const sw = within(dlg).getByRole('switch', { name: 'Track in Tournaments' });
    fireEvent.click(sw);
    expect(code('CH-6841')?.textContent).toBe('Tournament details hidden.');
    fireEvent.click(sw);
    expect(code('CH-6841')?.textContent).toBe('Tournament details shown. 1 round.');
  });

  it('CH-6842: Escape while the tournament is being created keeps the editor open and says so', async () => {
    t.create.mockReturnValue(new Promise(() => {}));
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.change(within(dlg).getByLabelText('Tournament name'), { target: { value: 'Pinehurst Invitational' } });
    await pickCourse(dlg);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create tournament' }));
    await waitFor(() => expect(t.create).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(editor(), { key: 'Escape' });
    fireEvent(editor(), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(code('CH-6841')?.textContent).toBe('Still creating the tournament.'));
    expect(editor()).toBeTruthy();
  });

  it('a refusal keeps the editor open with its notice (already tracked, CH-6048)', async () => {
    t.create.mockResolvedValue({ success: false, code: 'already_tracked', error: 'This event is already set up in Tournaments.' });
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.change(within(dlg).getByLabelText('Tournament name'), { target: { value: 'Pinehurst Invitational' } });
    await pickCourse(dlg);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create tournament' }));
    await waitFor(() => expect(code('CH-6048')).not.toBeNull());
    expect(code('CH-6048')!.textContent).toMatch(/This event is already set up in Tournaments\./);
    expect(editor()).toBeTruthy();
    expect((within(editor()).getByLabelText('Tournament name') as HTMLInputElement).value).toBe('Pinehurst Invitational');
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });

  it('a typed course is offered when the library has no match (CH-6340), stored as a label', async () => {
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Course, not chosen' }));
    const picker = await screen.findByRole('dialog', { name: 'Course' });
    fireEvent.change(within(picker).getByRole('searchbox', { name: 'Search courses' }), { target: { value: 'Southern Pines' } });
    await waitFor(() => expect(code('CH-6340')).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(within(picker).getByRole('button', { name: 'Use “Southern Pines” as the course name' }));
    await waitFor(() => expect(within(dlg).getByRole('button', { name: 'Course, Southern Pines, Not in the course library' })).toBeTruthy());
  });

  it('Custom: add a round on the last day, 5:30 after its tee, and remove only the last one (warning)', async () => {
    wrap(data(), { initialNew: true, initialType: 'tournament' });
    const dlg = await waitFor(editor);
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Custom' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Add a round' }));
    expect(within(dlg).getAllByRole('group', { name: /^Round \d/ })).toHaveLength(2);
    expect(within(dlg).getByText('36-hole day')).toBeTruthy();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Round 2 options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove R2' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await waitFor(() => expect(within(dlg).getAllByRole('group', { name: /^Round \d/ })).toHaveLength(1));
  });
});
