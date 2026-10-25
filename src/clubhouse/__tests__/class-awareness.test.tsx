import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Class awareness (P-10), coach side: Coach Home's line, the In class now sheet, the Term sheet and the team
 * no-class days. Every numbered state in docs/clubhouse/catalog/home.md for this feature (CH-2070 to CH-2072,
 * CH-2170 to CH-2177, CH-2270, CH-2370, CH-2470, CH-2570, CH-2670, CH-2870, CH-2970), found by its number.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const actions = vi.hoisted(() => ({ saveTerm: vi.fn(), addBreak: vi.fn(), removeBreak: vi.fn() }));
vi.mock('@/app/golf/actions/class-status', () => ({ saveTeamTerm: actions.saveTerm, addTeamBreak: actions.addBreak, removeTeamBreak: actions.removeBreak }));
const live = vi.hoisted(() => ({
  day: null as import('../data/class-day-shape').ChClassDay | null,
  status: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
  now: null as number | null,
  refetch: vi.fn(async () => {}),
  refetchTeam: vi.fn(async () => {}),
}));
vi.mock('../lib/use-class-day', () => ({
  useTeamClassDay: (_team: string | null, opts: { enabled?: boolean } = {}) => ({ day: opts.enabled === false ? null : live.day, status: live.status, now: live.now, refetch: live.refetch }),
  refetchTeamClassDay: live.refetchTeam,
}));
const data = vi.hoisted(() => ({ breaks: [] as Array<{ id: string; startsOn: string; endsOn: string; label: string | null }>, terms: [] as unknown[], coverage: null as unknown }));
vi.mock('../data/class-day', async (orig) => ({
  ...(await orig<typeof import('../data/class-day')>()),
  loadTeamBreaks: async () => data.breaks,
  loadTeamTerms: async () => data.terms,
  loadScheduleCoverage: async () => data.coverage,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
// The date field is its own component with its own tests; here a date is a plain input so a test can set any day.
vi.mock('../ui/DateField', () => ({
  DateField: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
import './dialog-polyfill';

import type { ChClassBlock, ChClassDay, ChClassDayPlayer, ChClassTerm } from '../data/class-day-shape';
import { ClubhouseMarker } from '../shell/context';
import { ClassHomeLine } from '../screens/home/ClassHomeLine';
import { InClassSheet } from '../screens/classes/InClassSheet';
import { TeamBreakSheet } from '../screens/classes/TeamBreakSheet';
import { TermSheet } from '../screens/classes/TermSheet';
import { ToastProvider } from '../ui/Toast';

const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string, label = 'STAT 201 - Probability'): ChClassBlock => ({ classId: label, label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to) });
const player = (id: string, first: string, over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({
  playerId: id,
  firstName: first,
  lastName: 'Test',
  avatarUrl: null,
  tracked: true,
  holds: true,
  onCourse: false,
  offToday: false,
  away: null,
  blocks: [],
  ...over,
});
const TERM: ChClassTerm = { id: 't1', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' };
const day = (players: ChClassDayPlayer[], over: Partial<ChClassDay> = {}): ChClassDay => ({
  on: '2026-10-26',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: TERM,
  nextTerm: null,
  players,
  fetchedAt: Date.now(),
  ...over,
});
const nine = () => [
  ...['a', 'b', 'c', 'd'].map((id) => player(id, id.toUpperCase(), { blocks: [block('13:30', '15:50')] })),
  ...['e', 'f', 'g', 'h', 'i'].map((id) => player(id, id.toUpperCase(), { blocks: [block('17:00', '18:15')] })),
];

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const ROLE = 'coach' as const;
const shell = (node: ReactNode, on = true) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <ClubhouseMarker role={ROLE} classAwareness={on}>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ClubhouseMarker>
    </ToastProvider>
  </LazyMotion>
);

beforeEach(() => {
  hapticSpy.mockClear();
  router.push.mockClear();
  for (const f of Object.values(actions)) f.mockReset();
  live.day = null;
  live.status = 'ready';
  live.now = at('14:30');
  live.refetch.mockClear();
  live.refetchTeam.mockClear();
  data.breaks = [];
  data.terms = [];
  data.coverage = null;
});
afterEach(() => cleanup());

describe('Term sheet', () => {
  const sheet = (over: Partial<Parameters<typeof TermSheet>[0]> = {}, onClose = vi.fn()) =>
    render(
      shell(
        <TermSheet open onClose={onClose} teamId="team-1" editing={TERM} others={[]} label={null} teamTimeZone="America/New_York" classTimeZone="America/New_York" today="2026-10-26" {...over} />,
      ),
    );
  const submit = () => fireEvent.submit(document.querySelector('form.ch-ca-form')!);
  const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('shows the term’s own name and dates, and saves them with the coach’s confirmation', async () => {
    actions.saveTerm.mockResolvedValue({ success: true, data: { id: 't1' } });
    const onClose = vi.fn();
    sheet({}, onClose);
    expect(screen.getByRole('heading', { name: 'Fall 2026 term' })).toBeTruthy();
    expect(screen.queryByText(/Suggested from your school’s usual calendar/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(actions.saveTerm).toHaveBeenCalledTimes(1));
    expect(actions.saveTerm).toHaveBeenCalledWith({ teamId: 'team-1', id: 't1', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(live.refetchTeam).toHaveBeenCalledWith('team-1');
  });

  it('a new term prefills the label’s usual window and says it is a suggestion until a date changes', async () => {
    sheet({ editing: null, label: 'Fall 2026' });
    expect((screen.getByLabelText('Classes start') as HTMLInputElement).value).toBe('2026-08-20');
    expect(screen.getByText(/Suggested from your school’s usual calendar/)).toBeTruthy();
    set('Last day of classes', '2026-12-10');
    expect(screen.queryByText(/Suggested from your school’s usual calendar/)).toBeNull();
  });

  /** A term the form refuses before anything is sent: the sentence, under its number, and no save. */
  async function refuses(c: string, change: Record<string, string>, text: RegExp) {
    sheet();
    for (const [label, value] of Object.entries(change)) set(label, value);
    submit();
    await expectCode(c, text);
    expect(actions.saveTerm).not.toHaveBeenCalled();
  }
  it('CH-2170 a last day that is not after the first says so', () => refuses('CH-2170', { 'Last day of classes': '2026-08-24' }, /Last day of classes must be after classes start\./));
  it('CH-2171 a term under 4 weeks or over about 6 months says so', () => refuses('CH-2171', { 'Last day of classes': '2026-09-10' }, /A term is 4 weeks to about 6 months\./));
  it('CH-2172 exams more than 3 weeks after the last class say so', () => refuses('CH-2172', { 'Exams end': '2027-01-15' }, /Exams end within 3 weeks of the last class\./));
  it('CH-2173 exams before the last day of classes say so', () => refuses('CH-2173', { 'Exams end': '2026-12-10' }, /Exams end on or after the last day of classes\./));

  it('CH-2174 names the term this one overlaps', async () => {
    sheet({ others: [{ id: 's', label: 'Spring 2027', classesStart: '2027-01-12', examsEnd: '2027-05-01' }] });
    set('Classes start', '2026-12-20');
    set('Last day of classes', '2027-02-01');
    set('Exams end', '2027-02-10');
    submit();
    await expectCode('CH-2174', /This overlaps Spring 2027 \(Jan 12 to May 1\)\./);
  });

  it('CH-2175 asks for a name', async () => {
    sheet();
    fireEvent.change(screen.getByLabelText('Term name'), { target: { value: '  ' } });
    submit();
    await expectCode('CH-2175', /Name the term\./);
  });

  it('CH-2070 a refused save keeps the sheet open with what was typed, and says so', async () => {
    actions.saveTerm.mockResolvedValue({ success: false, error: 'This overlaps another term' });
    const onClose = vi.fn();
    sheet({}, onClose);
    await userEvent.click(screen.getByRole('button', { name: 'Save dates' }));
    await expectCode('CH-2070', /Couldn’t save the term dates/);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Term name') as HTMLInputElement).value).toBe('Fall 2026');
  });
});

describe('Team no-class days', () => {
  const sheet = (onClose = vi.fn()) => render(shell(<TeamBreakSheet open onClose={onClose} teamId="team-1" today="2026-10-26" />));
  const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('marks a range with a name, reloads the list and refreshes the class day', async () => {
    actions.addBreak.mockImplementation(async () => {
      data.breaks = [{ id: 'b1', startsOn: '2026-10-12', endsOn: '2026-10-13', label: 'Fall break' }];
      return { success: true, data: { id: 'b1' } };
    });
    sheet();
    set('First day', '2026-10-12');
    set('Last day', '2026-10-13');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Fall break' } });
    await userEvent.click(screen.getByRole('button', { name: 'Mark no classes' }));
    await waitFor(() => expect(actions.addBreak).toHaveBeenCalledWith({ teamId: 'team-1', startsOn: '2026-10-12', endsOn: '2026-10-13', label: 'Fall break' }));
    expect(await screen.findByText('Fall break · Oct 12 to 13')).toBeTruthy();
    expect(live.refetchTeam).toHaveBeenCalledWith('team-1');
    expect(hapticSpy).toHaveBeenCalledWith('success');
  });

  it('one day is enough: the last day defaults to the first', async () => {
    actions.addBreak.mockResolvedValue({ success: true, data: { id: 'b' } });
    sheet();
    set('First day', '2026-11-26');
    await userEvent.click(screen.getByRole('button', { name: 'Mark no classes' }));
    await waitFor(() => expect(actions.addBreak).toHaveBeenCalledWith({ teamId: 'team-1', startsOn: '2026-11-26', endsOn: '2026-11-26', label: undefined }));
  });

  it('CH-2176 and CH-2177 say what is wrong before anything is sent', async () => {
    sheet();
    set('First day', '2026-10-13');
    set('Last day', '2026-10-12');
    await userEvent.click(screen.getByRole('button', { name: 'Mark no classes' }));
    await expectCode('CH-2176', /The last day must be on or after the first\./);
    set('Last day', '2026-11-20');
    await expectCode('CH-2177', /A break is at most 21 days\./);
    expect(actions.addBreak).not.toHaveBeenCalled();
  });

  it('CH-2071 a refused save says so and keeps the form', async () => {
    actions.addBreak.mockResolvedValue({ success: false, error: 'Only a coach of this team can do that' });
    sheet();
    set('First day', '2026-10-12');
    await userEvent.click(screen.getByRole('button', { name: 'Mark no classes' }));
    await expectCode('CH-2071', /Couldn’t save the break/);
    expect((screen.getByLabelText('First day') as HTMLInputElement).value).toBe('2026-10-12');
  });

  it('CH-2570 removing asks first; CH-2072 a refused remove keeps the range on the list', async () => {
    data.breaks = [{ id: 'b1', startsOn: '2026-10-12', endsOn: '2026-10-13', label: 'Fall break' }];
    actions.removeBreak.mockResolvedValueOnce({ success: false, error: 'nope' });
    sheet();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Fall break · Oct 12 to 13' }));
    await expectCode('CH-2570', /Remove this break\?/);
    expect(actions.removeBreak).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove break' }));
    await expectCode('CH-2072', /Couldn’t remove the break/);
    expect(code('CH-2570')).not.toBeNull();
    actions.removeBreak.mockResolvedValueOnce({ success: true });
    await userEvent.click(screen.getByRole('button', { name: 'Remove break' }));
    await waitFor(() => expect(actions.removeBreak).toHaveBeenCalledTimes(2));
    expect(actions.removeBreak).toHaveBeenLastCalledWith({ id: 'b1', teamId: 'team-1' });
    await waitFor(() => expect(live.refetchTeam).toHaveBeenCalledWith('team-1'));
  });
});

describe('In class now sheet', () => {
  const opts = { clock: '12' as const, teamTz: 'America/New_York', classTz: 'America/New_York' };
  const open = (props: Partial<Parameters<typeof InClassSheet>[0]> = {}) => {
    const onClose = vi.fn();
    const trigger = { current: document.createElement('span') };
    render(
      shell(
        <InClassSheet
          open
          onClose={onClose}
          day={day(nine())}
          status="ready"
          now={at('14:30')}
          opts={opts}
          onRetry={vi.fn()}
          onEditTerm={vi.fn()}
          onBreaks={vi.fn()}
          triggerRef={trigger}
          {...props}
        />,
      ),
    );
    return { onClose };
  };

  it('lists who is in class, who is next, and the term with its edit', () => {
    open();
    const dialog = screen.getByRole('dialog', { hidden: true, name: 'In class now' });
    expect(within(dialog).getByText('4 of 9 · Class names show to coaches only.')).toBeTruthy();
    expect(within(dialog).getByRole('region', { name: 'In class' })).toBeTruthy();
    expect(within(dialog).getAllByText('until 11:50 AM')).toHaveLength(4);
    expect(within(dialog).getByText('Next today')).toBeTruthy();
    expect(within(dialog).getByText('Fall 2026 · Aug 24 to Dec 11 · exams to Dec 18')).toBeTruthy();
  });

  it('a row opens that player’s 1:1 thread and closes the sheet first', async () => {
    const { onClose } = open();
    await userEvent.click(screen.getAllByRole('button', { name: /^A Test, in class until 11:50 AM/ })[0]!);
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/messages?player=a');
  });

  it('Escape closes it', async () => {
    const { onClose } = open();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('the footer opens the Term sheet and the no-class days sheet', async () => {
    const onEditTerm = vi.fn();
    const onBreaks = vi.fn();
    open({ onEditTerm, onBreaks });
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: /Mark a day with no classes/ }));
    expect(onEditTerm).toHaveBeenCalledTimes(1);
    expect(onBreaks).toHaveBeenCalledTimes(1);
  });

  it('CH-2270 a read that failed says so, with Try again', async () => {
    const onRetry = vi.fn();
    open({ day: null, status: 'error', onRetry });
    await expectCode('CH-2270', /Class status didn’t load\./);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('CH-2470 shows nothing for 300 ms, then a loading line', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      open({ day: null, status: 'loading' });
      expect(code('CH-2470')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(310);
      });
      expect(code('CH-2470')!.textContent).toMatch(/Loading class status/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CH-2370 no blocks today: the title says so and the strip steps aside', async () => {
    open({ day: day([player('a', 'A'), player('b', 'B', { tracked: false })]) });
    await expectCode('CH-2370', /No one has a class today\./);
    expect(screen.getByRole('heading', { name: 'No classes today', hidden: true })).toBeTruthy();
    expect(document.querySelector('.ch-ca-strip')).toBeNull();
  });

  it('CH-2970 offline, it keeps the last class day and says when it was fetched', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      open({ day: day(nine(), { fetchedAt: at('14:12') }) });
      await expectCode('CH-2970', /Updated 10:12 AM/);
    } finally {
      online.mockRestore();
    }
  });

  it('asks for schedules when under half are shared: the draft goes to Messages for the coach to send', async () => {
    const few = [player('a', 'A', { blocks: [block('13:30', '15:50')] }), ...['b', 'c', 'd', 'e', 'f'].map((id) => player(id, id.toUpperCase(), { tracked: false, holds: false }))];
    const { onClose } = open({ day: day(few) });
    expect(screen.getByText('Class schedules shared by 1 of 6.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Ask for schedules' }));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/golf\/dashboard\/messages\?prefill=/));
  });
});

describe('Coach Home’s class line', () => {
  const line = (on = true, variant: 'phone' | 'desktop' = 'phone') =>
    render(shell(<ClassHomeLine teamId="team-1" today="2026-10-26" teamTimeZone="America/New_York" variant={variant} />, on));

  it('CH-2870 is one button named by the whole line, and a tap opens the sheet', async () => {
    live.day = day(nine());
    line();
    const button = screen.getByRole('button', { name: '4 of 9 in class now. Everyone out of class 11:50 AM to 1:00 PM. Opens class status' });
    expect(button.getAttribute('data-ch-code')).toBe('CH-2870');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    await userEvent.click(button);
    expect(await screen.findByRole('dialog', { hidden: true, name: 'In class now' })).toBeTruthy();
  });

  it('CH-2670 changes in place: the same line, new words, when the minute turns', async () => {
    live.day = day(nine());
    const view = line();
    expect(code('CH-2670')!.textContent).toMatch(/4 of 9 in class now/);
    live.now = at('16:00');
    view.rerender(shell(<ClassHomeLine teamId="team-1" today="2026-10-26" teamTimeZone="America/New_York" variant="phone" />));
    await waitFor(() => expect(screen.getAllByText('No one in class now').length).toBeGreaterThan(0));
  });

  it('draws nothing with the flag off, with no payload, on an error, or when there is nothing to say', () => {
    live.day = day(nine());
    const off = line(false);
    expect(off.container.querySelector('.ch-ca-home')).toBeNull();
    off.unmount();
    live.day = null;
    const none = line();
    expect(none.container.querySelector('.ch-ca-home')).toBeNull();
    none.unmount();
    live.day = day(nine());
    live.now = at('23:30');
    const late = line();
    expect(late.container.querySelector('.ch-ca-home')).toBeNull();
  });

  it('with no term and schedules in, a tap goes straight to the Term sheet', async () => {
    live.day = day(nine().map((p) => ({ ...p, tracked: false })), { term: null });
    data.coverage = { players: 6, label: 'Fall 2026' };
    line();
    const button = await screen.findByRole('button', { name: /Set this term’s dates to show class status/ });
    await userEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Fall 2026 term', hidden: true })).toBeTruthy();
  });

  it('desktop draws the same line inline, with no chevron', () => {
    live.day = day(nine());
    const view = line(true, 'desktop');
    expect(view.container.querySelector('.ch-ca-home--desktop')).not.toBeNull();
    expect(view.container.querySelector('.ch-ca-home__btn > svg:last-child')?.getAttribute('class') ?? '').not.toMatch(/chevron-right/);
  });
});
