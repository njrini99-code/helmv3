import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChCsvFile } from '../lib/csv';
import './dialog-polyfill';

const toast = vi.fn();
const replace = vi.fn();
const push = vi.fn();
const saved: ChCsvFile[] = [];
const saveSettings = vi.fn();
const saveAdjustment = vi.fn();
vi.mock('../lib/csv', async (orig) => ({
  ...(await orig<typeof import('../lib/csv')>()),
  saveCsv: async (f: ChCsvFile) => {
    saved.push(f);
    return 'downloaded' as const;
  },
}));
vi.mock('../ui/Toast', async (orig) => ({
  ...(await orig<typeof import('../ui/Toast')>()),
  useToast: () => toast,
  useDelayedToast: () => () => () => {},
}));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/use-refresh', () => ({ useRefresh: () => ({ refresh: vi.fn(), refreshing: false }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/golf/dashboard/calendar/hours',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/hours', () => ({ saveHoursSettings: (i: unknown) => saveSettings(i), saveHoursAdjustment: (i: unknown) => saveAdjustment(i) }));

const { PracticeHours } = await import('../screens/calendar/hours/PracticeHours');
const { PREVIEW_HOURS, PREVIEW_HOURS_PLAYER } = await import('../preview/fixtures-hours');
const { CrumbProvider } = await import('../shell/crumbs');
const { PhoneChromeProvider } = await import('../shell/phone-chrome');
type Data = typeof PREVIEW_HOURS;

/**
 * Practice hours (launch readiness F-03, P006): the week drafted for each player and read against the limits, the
 * warnings in words with their bylaws, every event with why it counts, the coach's limits and changes, a player's own
 * week, and each state the page can be in.
 */
beforeEach(() => {
  toast.mockReset();
  replace.mockReset();
  push.mockReset();
  saveSettings.mockReset().mockResolvedValue({ success: true });
  saveAdjustment.mockReset().mockResolvedValue({ success: true });
  saved.length = 0;
});
afterEach(cleanup);

const page = (data: Data = PREVIEW_HOURS) =>
  render(
    <LazyMotion features={domAnimation}>
      <CrumbProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            <PracticeHours data={data} />
          </div>
        </PhoneChromeProvider>
      </CrumbProvider>
    </LazyMotion>,
  );

const table = () => screen.getByRole('table', { name: 'Practice hours, Nov 9 – 15' });
const rowOf = (name: string) =>
  within(table())
    .getByRole('rowheader', { name: new RegExp(name) })
    .closest('[role="row"]') as HTMLElement;
const cells = (name: string) =>
  within(rowOf(name))
    .getAllByRole('cell')
    .map((c) => c.textContent);
const lineOf = (title: string, day: RegExp) =>
  within(screen.getByRole('region', { name: day }))
    .getByText(title)
    .closest('li') as HTMLElement;

describe('Practice hours · the coach’s week', () => {
  it('60180 drafts each player’s week from the calendar and attendance: a day a column, the week against its limit, the days off', () => {
    page();
    expect(screen.getByRole('heading', { level: 1, name: 'Practice hours' })).toBeTruthy();
    expect(screen.getByText('Demo University Golf · NCAA Division I · Playing season')).toBeTruthy();
    expect(screen.getByText('4 a day · 20 a week · 1 day off')).toBeTruthy();
    expect(screen.getByText(/From your division on Settings, Team · no season dates set/)).toBeTruthy();
    // Ava travels: practice Mon to Wed, the practice round the day before counts 3, the two tournament days 3 each.
    expect(cells('Ava Lindqvist')).toEqual(['4', '3.5', '4', '3', '3', '3', 'Off', '20.5 of 20', '1']);
    // Theo's evening session takes Monday to 6.
    expect(cells('Theo Marchetti')).toEqual(['6', '3.5', '4', '3', '3', '3', 'Off', '22.5 of 20', '1']);
    // Mila missed Wednesday's practice (no-show): only the briefing counts that day.
    expect(cells('Mila Okafor')).toEqual(['4', '3.5', '1', '3', '3', '3', 'Off', '17.5 of 20', '1']);
    // Jonah stays home: Saturday's practice has no times, so the day and the week say they may be short.
    expect(cells('Jonah Reyes')).toEqual(['4', '3.5', '4', 'Off', 'Off', '0+', 'Off', '11.5+ of 20', '3']);
  });

  it('CH-6881 60181 says who has a warning, each in words with the bylaw behind it, and marks the cell it is about', () => {
    page();
    expect(screen.getByRole('status').textContent).toBe('2 players with a warning');
    expect(screen.getByRole('status').getAttribute('data-ch-code')).toBe('CH-6881');
    const theo = rowOf('Theo Marchetti').parentElement!;
    expect(within(theo).getByText('Mon 9 Nov: 6 hours, over the 4-hour day')).toBeTruthy();
    expect(within(theo).getByText('22.5 hours this week, over 20')).toBeTruthy();
    expect(within(theo).getAllByText('Bylaw 17.1.7.1')).toHaveLength(2);
    const [mon] = within(rowOf('Theo Marchetti')).getAllByRole('cell');
    expect(mon!.className).toContain('is-warn');
    expect(
      within(rowOf('Mila Okafor'))
        .getAllByRole('cell')
        .some((c) => c.className.includes('is-warn')),
    ).toBe(false);
  });

  it('60182 lists every event of the week by day with whether it counted, how much and why', () => {
    page();
    expect(lineOf('Practice round', /Thu 12 Nov/).textContent).toContain('Practice round at the tournament site the day before: counts 3');
    expect(lineOf('Travel to Pinehurst', /Thu 12 Nov/).textContent).toContain('Travel isn’t countable');
    expect(lineOf('Travel to Pinehurst', /Thu 12 Nov/).className).toContain('is-out');
    expect(lineOf('Pinehurst Invitational', /Fri 13 Nov/).textContent).toContain('Competition day: counts 3');
    expect(lineOf('Team practice', /Tue 10 Nov/).textContent).toMatch(/2:00 – 5:30 PM · 5 players.*Counts what it ran.*3\.5/);
    // The rules it is read against, with their bylaws, and what the page is for.
    const rules = screen.getByRole('region', { name: 'The rules this week is read against' });
    expect(within(rules).getByText('NCAA Division I Manual 2026-27')).toBeTruthy();
    expect(within(rules).getByText(/for your compliance office, which keeps the official record/)).toBeTruthy();
  });

  it('CH-6381 says which counted events have no times, and what the coach can do about it', () => {
    page();
    const note = document.querySelector('[data-ch-code="CH-6381"]')!;
    expect(note.textContent).toContain('Practice at home has no times, so its hours aren’t counted');
    expect(note.textContent).toContain('set a standard for untimed practices in Limits');
  });

  it('CH-6082 60982 exports the week: a row a player a day and a row for the week, as the page drafts it', async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const f = saved[0]!;
    expect(f.name).toMatch(/practice-hours/);
    expect(f.rows).toHaveLength(5 * 8);
    expect(f.rows.find((r) => r[1] === 'Theo Marchetti' && r[4] === 'Week')).toEqual([
      '2026-11-09',
      'Theo Marchetti',
      'So',
      null,
      'Week',
      22.5,
      null,
      1,
      '22.5 hours this week, over 20',
    ]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Practice hours exported · 5 players' }));
  });

  it('60183 steps a week at a time through the address, and back to this week', async () => {
    const user = userEvent.setup();
    page();
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/calendar/hours?date=2026-11-16', { scroll: false });
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(replace).toHaveBeenLastCalledWith('/golf/dashboard/calendar/hours?date=2026-11-02', { scroll: false });
    cleanup();
    page({ ...PREVIEW_HOURS, today: '2026-11-20' });
    await user.click(screen.getByRole('button', { name: 'This week' }));
    expect(replace).toHaveBeenLastCalledWith('/golf/dashboard/calendar/hours', { scroll: false });
  });
});

describe('Practice hours · the coach’s changes', () => {
  it('CH-6180 60980 the limits sheet checks what the save checks, then saves Custom limits', async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole('button', { name: 'Limits' }));
    const sheet = await screen.findByRole('dialog', { name: 'Practice hour limits' });
    await user.selectOptions(within(sheet).getByLabelText('Association'), 'custom');
    await user.type(within(sheet).getByLabelText('Hours a day'), '25');
    await user.click(within(sheet).getByRole('button', { name: 'Save limits' }));
    const problem = await within(sheet).findByRole('alert');
    expect(problem.textContent).toBe('A day’s limit is more than 0 and up to 24 hours.');
    expect(problem.getAttribute('data-ch-code')).toBe('CH-6180');
    expect(saveSettings).not.toHaveBeenCalled();
    await user.clear(within(sheet).getByLabelText('Hours a day'));
    await user.type(within(sheet).getByLabelText('Hours a day'), '5');
    await user.type(within(sheet).getByLabelText('Hours a week'), '24');
    await user.click(within(sheet).getByRole('button', { name: 'Save limits' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(saveSettings.mock.calls[0]![0]).toEqual({
      teamId: PREVIEW_HOURS.teamId,
      settings: { division: 'custom', autonomy: false, weekStartsOn: 1, fall: null, spring: null, custom: { day: 5, week: 24, daysOff: 1 } },
      untimedHours: null,
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Limits saved' }));
  });

  it('CH-6080 a refused save says so and keeps the sheet open', async () => {
    saveSettings.mockResolvedValue({ success: false, error: 'Only a coach of the team can change its limits.', code: 'CH-6080' });
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole('button', { name: 'Limits' }));
    const sheet = await screen.findByRole('dialog', { name: 'Practice hour limits' });
    await user.type(within(sheet).getByLabelText('Hours an untimed practice counts'), '3');
    await user.click(within(sheet).getByRole('button', { name: 'Save limits' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', title: 'Couldn’t save your limits', code: 'CH-6080' })));
    expect(screen.getByRole('dialog', { name: 'Practice hour limits' })).toBeTruthy();
  });

  it('CH-6081 a refused change says so and keeps the sheet open', async () => {
    saveAdjustment.mockResolvedValue({ success: false, error: 'Only a coach of the team can change how an event counts.', code: 'CH-6081' });
    const user = userEvent.setup();
    page();
    await user.click(within(lineOf('Travel briefing', /Wed 11 Nov/)).getByRole('button', { name: 'Change how Travel briefing counts' }));
    const sheet = await screen.findByRole('dialog', { name: 'How Travel briefing counts' });
    await user.click(within(sheet).getByRole('radio', { name: 'Doesn’t count' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', title: 'Couldn’t save the change to Travel briefing', code: 'CH-6081' })),
    );
    expect(screen.getByRole('dialog', { name: 'How Travel briefing counts' })).toBeTruthy();
  });

  it('CH-6181 60981 changes how one event counts: not countable with a note, or a figure of its own', async () => {
    const user = userEvent.setup();
    page();
    await user.click(within(lineOf('Travel briefing', /Wed 11 Nov/)).getByRole('button', { name: 'Change how Travel briefing counts' }));
    let sheet = await screen.findByRole('dialog', { name: 'How Travel briefing counts' });
    await user.click(within(sheet).getByRole('radio', { name: 'Doesn’t count' }));
    await user.type(within(sheet).getByLabelText('Note'), 'Academic meeting');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveAdjustment).toHaveBeenCalledTimes(1));
    expect(saveAdjustment.mock.calls[0]![0]).toEqual({
      teamId: PREVIEW_HOURS.teamId,
      eventId: 'h-meet',
      adjustment: { counted: false, hours: null, note: 'Academic meeting' },
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Travel briefing doesn’t count' }));
    cleanup();
    page();
    await user.click(within(lineOf('Team practice', /Mon 9 Nov/)).getByRole('button', { name: 'Change how Team practice counts' }));
    sheet = await screen.findByRole('dialog', { name: 'How Team practice counts' });
    await user.click(within(sheet).getByRole('radio', { name: 'Set hours' }));
    const hours = within(sheet).getByLabelText('Hours for each player on it');
    expect((hours as HTMLInputElement).value).toBe('4');
    await user.clear(hours);
    await user.type(hours, '30');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect((await within(sheet).findByRole('alert')).getAttribute('data-ch-code')).toBe('CH-6181');
    await user.clear(hours);
    await user.type(hours, '3.5');
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveAdjustment).toHaveBeenCalledTimes(2));
    expect(saveAdjustment.mock.calls[1]![0]).toEqual({ teamId: PREVIEW_HOURS.teamId, eventId: 'h-mon', adjustment: { counted: true, hours: 3.5, note: null } });
  });

  it('a changed event reads as the coach’s change, to the coach and to a player, and the figures follow it', () => {
    page({
      ...PREVIEW_HOURS,
      adjustments: { 'h-theo': { counted: false, hours: null, note: 'Academic meeting' }, 'h-tue': { counted: true, hours: 3, note: null } },
    });
    expect(lineOf('Short game with Theo', /Mon 9 Nov/).textContent).toContain('Doesn’t count: Academic meeting');
    expect(lineOf('Team practice', /Tue 10 Nov/).textContent).toContain('Counts 3 (your change)');
    expect(cells('Theo Marchetti').slice(0, 2)).toEqual(['4', '3']);
    cleanup();
    page({ ...PREVIEW_HOURS_PLAYER, adjustments: { 'h-tue': { counted: true, hours: 3, note: null } } });
    expect(lineOf('Team practice', /Tue 10 Nov/).textContent).toContain('Counts 3 (your coach’s change)');
  });

  it('CH-6283 with the hours tables not there yet, the week still drafts on the defaults and the page says saving waits', () => {
    page({ ...PREVIEW_HOURS, storeMissing: true, settingsFrom: 'default' });
    expect(document.querySelector('[data-ch-code="CH-6283"]')!.textContent).toContain('Your own limits and changes can’t be saved yet');
    expect(screen.queryByRole('button', { name: 'Limits' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Change how/ })).toHaveLength(0);
    expect(cells('Ava Lindqvist')).toHaveLength(9);
  });
});

describe('Practice hours · a player’s own week', () => {
  it('60184 a player sees their own week and why each event counts, with no limits or changes', () => {
    page(PREVIEW_HOURS_PLAYER);
    expect(screen.getByRole('heading', { level: 1, name: 'Your practice hours' })).toBeTruthy();
    expect(within(table()).getAllByRole('rowheader')).toHaveLength(1);
    expect(cells('Jonah Reyes')).toEqual(['4', '3.5', '4', 'Off', 'Off', '0+', 'Off', '11.5+ of 20', '3']);
    expect(screen.queryByRole('button', { name: 'Limits' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Change how/ })).toHaveLength(0);
    expect(screen.queryByText('Practice round')).toBeNull();
    expect(screen.getByText(/Your coach and compliance office keep the official record/)).toBeTruthy();
  });
});

describe('Practice hours · states', () => {
  it('CH-6280 the week’s events didn’t load: no figures at all, never zeros', () => {
    page({ ...PREVIEW_HOURS, eventsError: true, events: [] });
    expect(document.querySelector('[data-ch-code="CH-6280"]')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('CH-6282 the roster didn’t load (coach)', () => {
    page({ ...PREVIEW_HOURS, membersError: true, people: [] });
    expect(document.querySelector('[data-ch-code="CH-6282"]')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('CH-6281 attendance didn’t load: the week is drafted from invitations and says so', () => {
    page({ ...PREVIEW_HOURS, partial: true, marks: {} });
    expect(document.querySelector('[data-ch-code="CH-6281"]')!.textContent).toContain('drafted from invitations alone');
    expect(cells('Mila Okafor')[2]).toBe('4');
  });

  it('CH-6380 no players on the team yet', () => {
    page({ ...PREVIEW_HOURS, people: [] });
    expect(document.querySelector('[data-ch-code="CH-6380"]')!.textContent).toContain('No players on the team yet');
  });

  it('CH-6382 nothing on the calendar this week', () => {
    page({ ...PREVIEW_HOURS, events: [] });
    expect(document.querySelector('[data-ch-code="CH-6382"]')!.textContent).toContain('Nothing on the calendar this week');
    expect(screen.getByRole('status').textContent).toBe('No warnings this week');
  });
});
