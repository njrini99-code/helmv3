import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The round filter on the screens: Team stats and the player profile, desktop and phone. Every state is in
 * docs/clubhouse/catalog (CH-4101, CH-4313 to CH-4317, CH-5102, CH-5320 to CH-5322) and found by its number.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const trailSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: trailSpy, chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import { filterFor, type ChFilter, type ChFilterOptions, type ChPickRound } from '../data/stats-filter';
import type { ChTeamStats } from '../data/stats-team';
import type { ChPlayerProfile } from '../data/stats-player';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { CrumbProvider } from '../shell/crumbs';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY, PREVIEW_PLAYER_NOMATCH, PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const y = new Date().getUTCFullYear();
const RANGE = { from: `${y}-09-01`, to: `${y}-09-29` };
const BASE = '/golf/dashboard/stats';

function shell(node: React.ReactNode) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <PhoneChromeProvider>
            <div className="ch-root" data-ui="clubhouse">
              {node}
            </div>
          </PhoneChromeProvider>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>
  );
}
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
const team = (over: Partial<ChTeamStats> = {}): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, ...(over.window ? { filter: filterFor(over.window) } : {}), ...over });
const player = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER, ...(over.window ? { filter: filterFor(over.window) } : {}), ...over });
const showTeam = (data: ChTeamStats) => render(shell(<StatsTeam data={data} />));
const showPlayer = (data: ChPlayerProfile, coachId: string | null = 'c1') => render(shell(<StatsPlayer data={data} coachId={coachId} />));
const showPhonePlayer = (data: ChPlayerProfile) =>
  render(
    shell(
      <>
        <SlotHost />
        <StatsPlayer data={data} coachId="c1" />
      </>,
    ),
  );
/** At phone width for the length of a describe. */
function phoneWidth() {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });
}

const filt = (over: Partial<ChFilter> = {}): ChFilter => ({ ...filterFor('last10'), ...over });
const pr = (i: number, over: Partial<ChPickRound> = {}): ChPickRound => ({
  id: `r${i}`,
  date: `${y}-09-${String(28 - i).padStart(2, '0')}`,
  kind: i % 2 ? 'practice' : 'tournament',
  course: i % 3 ? 'Finley GC' : 'Pine Hollow',
  holes: 18,
  score: 70 + i,
  player: 'Theo Marchetti',
  ...over,
});
const opts = (n: number, over: Partial<ChFilterOptions> = {}): ChFilterOptions => ({
  rounds: Array.from({ length: n }, (_, i) => pr(i)),
  total: n,
  courses: [
    { name: 'Finley GC', count: 4 },
    { name: 'Pine Hollow', count: 2 },
  ],
  seasonStart: `${y}-08-01`,
  ...over,
});
const dialog = () => screen.getByRole('dialog', { name: 'Filter rounds' });
const inDialog = () => within(dialog());
const countLine = () => document.querySelector('.ch-sf__count');
const chipNames = () => within(screen.getByRole('list', { name: 'Active filters' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
const lastPush = () => router.push.mock.lastCall?.[0];
/** The rows of the pick list, as their text. */
const pickRows = () => [...dialog().querySelectorAll('.ch-sf-list[aria-label] li')].map((li) => li.textContent);

beforeEach(() => {
  hapticSpy.mockClear();
  trailSpy.mockClear();
  router.push.mockClear();
  router.refresh.mockClear();
});
afterEach(() => cleanup());

describe('Team stats · the filter bar', () => {
  it('no Filter button before a round exists (the first-run page); a filter that is on always shows, so it can be cleared', async () => {
    const none = team({ window: 'season', roundCount: 0, grid: [], players: [], putting: null, bests: [], filterOptions: opts(0) });
    const { unmount } = showTeam(none);
    expect(screen.queryByRole('button', { name: /^Filter/ })).toBeNull();
    expect(screen.getByText(/No stats yet/)).toBeTruthy();
    unmount();
    showTeam({ ...none, filter: filt({ window: 'season', types: ['practice'] }) });
    expect(screen.getByRole('button', { name: /^Filter/ })).toBeTruthy();
    expect(screen.queryByText(/No stats yet/)).toBeNull();
  });

  it('shows what is on as removable chips and says how many rounds: "12 rounds: tournaments, Sep 1 to Sep 29"', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['tournament'], ...RANGE }), roundCount: 12 }));
    expect(chipNames()).toEqual(['Remove filter: Tournament', 'Remove filter: Sep 1 to Sep 29']);
    expect(countLine()!.textContent).toBe('12 rounds: tournaments, Sep 1 to Sep 29');
    expect(countLine()!.getAttribute('role')).toBe('status');
    // The Filter button counts what is on.
    expect(screen.getByRole('button', { name: /^Filter/ }).textContent).toContain('2');
    // Removing a chip applies at once and leaves the rest.
    await user.click(screen.getByRole('button', { name: 'Remove filter: Tournament' }));
    expect(lastPush()).toBe(`${BASE}?from=${RANGE.from}&to=${RANGE.to}`);
    expect(router.push).toHaveBeenLastCalledWith(expect.any(String), { scroll: false });
    expect(trailSpy).toHaveBeenCalledWith('stats filter');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    await user.click(screen.getByRole('button', { name: 'Remove filter: Sep 1 to Sep 29' }));
    expect(lastPush()).toBe(`${BASE}?type=tournament`);
  });

  it('Clear takes every filter off in one tap and keeps the window', async () => {
    const user = userEvent.setup();
    const { unmount } = showTeam(team({ filter: filt({ types: ['practice'], courses: ['Pine Hollow'] }), roundCount: 5 }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(BASE);
    unmount();
    showTeam(team({ window: 'season', filter: filt({ window: 'season', types: ['practice'] }), roundCount: 5 }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(`${BASE}?window=season`);
  });

  it('a pick alone is a filter: a chip, the count line and Clear', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ pick: { mode: 'skip', ids: ['r1', 'r2'] } }), roundCount: 8 }));
    expect(chipNames()).toEqual(['Remove filter: Without 2 rounds']);
    expect(countLine()!.textContent).toBe('8 rounds: last 10, without 2 rounds');
    await user.click(screen.getByRole('button', { name: 'Remove filter: Without 2 rounds' }));
    expect(lastPush()).toBe(BASE);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(BASE);
  });

  it('says nothing of a filter when none is on: no chips, no count line, no Clear', () => {
    showTeam(team());
    expect(screen.getByRole('button', { name: /^Filter/ })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Active filters' })).toBeNull();
    expect(countLine()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('CH-4313 a filter that matches no round says so, with Clear filters; nothing is drawn as if it were the first run', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ window: 'season', types: ['qualifier'], courses: ['Pine Hollow'] }), window: 'season', roundCount: 0, grid: [], players: [], putting: null, bests: [] }));
    await expectCode('CH-4313', /No rounds match these filters/);
    expect(screen.queryByText(/No stats yet/)).toBeNull();
    expect(code('CH-4301')).toBeNull();
    expect(code('CH-4302')).toBeNull();
    expect(countLine()!.textContent).toBe('0 rounds: qualifying rounds, at Pine Hollow, this season');
    await user.click(within(code('CH-4313') as HTMLElement).getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(`${BASE}?window=season`);
  });

  it('CH-4314 one or two matching rounds read as an early read; three do not; no filter says nothing', () => {
    const { unmount } = showTeam(team({ filter: filt({ courses: ['Pine Hollow'] }), roundCount: 1, roundsEffective: 1 }));
    expect(code('CH-4314')!.textContent).toMatch(/Early read\. One round matches these filters/);
    unmount();
    const two = showTeam(team({ filter: filt({ courses: ['Pine Hollow'] }), roundCount: 2, roundsEffective: 2 }));
    expect(code('CH-4314')!.textContent).toMatch(/2 rounds match these filters/);
    two.unmount();
    const three = showTeam(team({ filter: filt({ courses: ['Pine Hollow'] }), roundCount: 3, roundsEffective: 3 }));
    expect(code('CH-4314')).toBeNull();
    three.unmount();
    // Nine-hole rounds are half a round: four of them are two whole rounds, still an early read; six make three.
    const fourNines = showTeam(team({ filter: filt({ holes: '9' }), roundCount: 4, roundsEffective: 2 }));
    expect(code('CH-4314')!.textContent).toMatch(/4 rounds match these filters, 2 counting 9-hole rounds as half, so the averages/);
    fourNines.unmount();
    const sixNines = showTeam(team({ filter: filt({ holes: '9' }), roundCount: 6, roundsEffective: 3 }));
    expect(code('CH-4314')).toBeNull();
    sixNines.unmount();
    showTeam(team({ roundCount: 2, roundsEffective: 2 }));
    expect(code('CH-4314')).toBeNull();
  });

  it('CH-4317 the season bests say they are the whole season\'s while a filter is on', () => {
    const { unmount } = showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 12 }));
    expect(code('CH-4317')!.textContent).toMatch(/the filter does not apply here/);
    unmount();
    showTeam(team());
    expect(code('CH-4317')).toBeNull();
  });

  it('a player opens with the filter kept, and the trend names the rounds it reads', () => {
    showTeam(team({ filter: filt({ types: ['tournament'], ...RANGE }), roundCount: 12 }));
    const href = document.querySelector('a[href*="player=theo"]')!.getAttribute('href');
    expect(href).toBe(`${BASE}?player=theo&type=tournament&from=${RANGE.from}&to=${RANGE.to}`);
    expect(screen.getByText(/Strokes gained per round by leg/).textContent).toContain(`tournaments, Sep 1 to Sep 29`);
  });

  it('the window switch shows a Custom pill while a range is on, and choosing a window drops the range', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ window: 'season', types: ['practice'], ...RANGE }), window: 'season', roundCount: 4 }));
    const head = document.querySelector('.ch-st-head__act') as HTMLElement;
    expect(within(head).getByRole('radio', { name: 'Custom' }).getAttribute('aria-checked')).toBe('true');
    expect(within(head).getByRole('radio', { name: 'Season' }).getAttribute('aria-checked')).toBe('false');
    await user.click(within(head).getByRole('radio', { name: 'Last 10' }));
    // The range goes; the kind stays.
    expect(lastPush()).toBe(`${BASE}?type=practice`);
  });

  it('the export says it is filtered', async () => {
    const user = userEvent.setup();
    const seen: { name?: string } = {};
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const prev = [url.createObjectURL, url.revokeObjectURL];
    url.createObjectURL = () => 'blob:x';
    url.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen.name = this.download;
    });
    try {
      showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 12 }));
      await user.click(screen.getByRole('button', { name: 'Export' }));
      expect(seen.name).toBe('varsity-stats-last10-filtered.csv');
    } finally {
      [url.createObjectURL, url.revokeObjectURL] = prev;
      click.mockRestore();
    }
  });
});

describe('Team stats · the filter sheet', () => {
  it('chooses round types and applies on Done: one address change, with the haptic a choice gets', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    expect(d.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(d.getByRole('button', { name: 'Tournament' }));
    await user.click(d.getByRole('button', { name: 'Practice' }));
    expect(d.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('false');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    // Nothing is requested until Done.
    expect(router.push).not.toHaveBeenCalled();
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?type=tournament%2Cpractice`);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(document.querySelector('dialog.ch-modal')!.hasAttribute('open')).toBe(false);
  });

  it('All clears the kinds; all three kinds is the same as All', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 5, filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    await user.click(d.getByRole('button', { name: 'Qualifying' }));
    await user.click(d.getByRole('button', { name: 'Practice' }));
    expect(d.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(d.getByRole('button', { name: 'Tournament' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(BASE);
  });

  it('Qualifiers is a kind: choosing it clears the kinds, and choosing a kind while on it moves to Season', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['practice'] }), roundCount: 5, filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    let d = inDialog();
    await user.click(d.getByRole('radio', { name: 'Qualifiers' }));
    expect(d.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?window=qualifiers`);
    cleanup();
    router.push.mockClear();
    showTeam(team({ window: 'qualifiers', roundCount: 5, filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    d = inDialog();
    expect(d.getByRole('radio', { name: 'Qualifiers' }).getAttribute('aria-checked')).toBe('true');
    await user.click(d.getByRole('button', { name: 'Tournament' }));
    expect(d.getByRole('radio', { name: 'Season' }).getAttribute('aria-checked')).toBe('true');
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?window=season&type=tournament`);
  });

  it('a date range replaces the window: Custom stands for it, and a window chosen again clears the dates', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    expect(d.queryByRole('radio', { name: 'Custom' })).toBeNull();
    fireEvent.change(d.getByLabelText('From'), { target: { value: RANGE.from } });
    fireEvent.change(d.getByLabelText('To'), { target: { value: RANGE.to } });
    expect(d.getByRole('radio', { name: 'Custom' }).getAttribute('aria-checked')).toBe('true');
    await user.click(d.getByRole('radio', { name: 'Season' }));
    expect((d.getByLabelText('From') as HTMLInputElement).value).toBe('');
    expect((d.getByLabelText('To') as HTMLInputElement).value).toBe('');
    fireEvent.change(d.getByLabelText('From'), { target: { value: RANGE.from } });
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?window=season&from=${RANGE.from}`);
  });

  it('CH-4101 a range that starts after it ends is not sent: the error says so, the start date takes focus, and a warning plays', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    fireEvent.change(d.getByLabelText('From'), { target: { value: RANGE.to } });
    fireEvent.change(d.getByLabelText('To'), { target: { value: RANGE.from } });
    // No error until they try to apply.
    expect(code('CH-4101')).toBeNull();
    await user.click(d.getByRole('button', { name: 'Done' }));
    await expectCode('CH-4101', /The start date is after the end date/);
    expect(router.push).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(document.activeElement).toBe(d.getByLabelText('From'));
    expect(d.getByLabelText('From').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Filter rounds' }).hasAttribute('open')).toBe(true);
    // Put right, it applies.
    fireEvent.change(d.getByLabelText('From'), { target: { value: RANGE.from } });
    fireEvent.change(d.getByLabelText('To'), { target: { value: RANGE.to } });
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?from=${RANGE.from}&to=${RANGE.to}`);
  });

  it('lists the courses with how many rounds each, and only when there is more than one', async () => {
    const user = userEvent.setup();
    const { unmount } = showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    let d = inDialog();
    const boxes = d.getByRole('group', { name: 'Course' });
    expect(within(boxes).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['Finley GC4', 'Pine Hollow2']);
    await user.click(within(boxes).getByRole('checkbox', { name: /Finley GC/ }));
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?course=Finley+GC`);
    unmount();
    showTeam(team({ filterOptions: opts(6, { courses: [{ name: 'Finley GC', count: 6 }] }) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    d = inDialog();
    expect(d.queryByRole('group', { name: 'Course' })).toBeNull();
  });

  it('Only these: pick rounds among the ones that match, with the player named, and exactly those count', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    expect(d.queryByRole('list', { name: 'Rounds to keep' })).toBeNull();
    await user.click(d.getByRole('button', { name: 'Only these' }));
    const list = d.getByRole('list', { name: 'Rounds to keep' });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(6);
    expect(pickRows()[0]).toContain(`Theo Marchetti · Pine Hollow`);
    expect(pickRows()[0]).toContain('Tournament');
    await user.click(within(list).getAllByRole('checkbox')[1]!);
    await user.click(within(list).getAllByRole('checkbox')[3]!);
    expect(d.getByText(/\(2 ticked\)/)).toBeTruthy();
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?only=r1%2Cr3`);
  });

  it('Exclude these writes the skipped rounds; with none ticked "Only these" is no pick at all', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    let d = inDialog();
    await user.click(d.getByRole('button', { name: 'Exclude these' }));
    await user.click(within(d.getByRole('list', { name: 'Rounds to leave out' })).getAllByRole('checkbox')[0]!);
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?skip=r0`);
    cleanup();
    router.push.mockClear();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    d = inDialog();
    await user.click(d.getByRole('button', { name: 'Only these' }));
    await user.click(d.getByRole('button', { name: 'Done' }));
    // Nothing changed: no address change at all.
    expect(router.push).not.toHaveBeenCalled();
  });

  it('the pick list follows the other choices, and a pick never names a round the filter would not list', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    await user.click(d.getByRole('button', { name: 'Only these' }));
    // r1 is a practice round: tick it, then narrow to tournaments.
    await user.click(within(d.getByRole('list', { name: 'Rounds to keep' })).getAllByRole('checkbox')[1]!);
    await user.click(d.getByRole('button', { name: 'Tournament' }));
    expect(pickRows()).toHaveLength(3);
    expect(pickRows().every((t) => t!.includes('Tournament'))).toBe(true);
    await user.click(within(d.getByRole('list', { name: 'Rounds to keep' })).getAllByRole('checkbox')[0]!);
    await user.click(d.getByRole('button', { name: 'Done' }));
    // The practice round r1 was ticked but is not a tournament: it is left out of the address.
    expect(lastPush()).toBe(`${BASE}?type=tournament&only=r0`);
  });

  it('CH-4315 nothing to pick from says why, and before the season says to apply the range first', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(4) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    await user.click(d.getByRole('button', { name: 'Only these' }));
    await user.click(d.getByRole('button', { name: 'Qualifying' }));
    await expectCode('CH-4315', /No rounds to pick from/);
    expect(code('CH-4315')!.textContent).toMatch(/Nothing matches the round type, course and time above/);
    fireEvent.change(d.getByLabelText('From'), { target: { value: `${y - 1}-03-01` } });
    await waitFor(() => expect(code('CH-4315')!.textContent).toMatch(/Rounds before Aug 1 load once the range is applied/));
  });

  it('CH-4316 a list cut at its size says how many there are', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(4, { total: 250 }) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Exclude these' }));
    await expectCode('CH-4316', /Showing the newest 4 of 250 rounds/);
    cleanup();
    showTeam(team({ filterOptions: opts(4) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Exclude these' }));
    expect(code('CH-4316')).toBeNull();
  });

  it('Clear in the sheet resets the choices without closing it, and Done then removes the filters', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['tournament'], courses: ['Pine Hollow'], ...RANGE }), roundCount: 4, filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    await user.click(d.getByRole('button', { name: 'Clear' }));
    expect(d.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect((d.getByLabelText('From') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('dialog', { name: 'Filter rounds' }).hasAttribute('open')).toBe(true);
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(BASE);
  });

  it('opens on what is on now, and a Done that changes nothing asks for nothing', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['practice'], courses: ['Finley GC'], ...RANGE }), roundCount: 4, filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    expect(d.getByRole('button', { name: 'Practice' }).getAttribute('aria-pressed')).toBe('true');
    expect((d.getByLabelText('From') as HTMLInputElement).value).toBe(RANGE.from);
    expect((within(d.getByRole('group', { name: 'Course' })).getByRole('checkbox', { name: /Finley GC/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('the filter, for assistive technology', () => {
  it('CH-4806 CH-5809 the button says it opens a dialog, each chip is named for what it removes, the count is a status, and the sheet\'s groups, toggles, checkboxes and dates are named', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 5, filterOptions: opts(6) }));
    const open = screen.getByRole('button', { name: /^Filter/ });
    expect(open.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.getByRole('list', { name: 'Active filters' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove filter: Tournament' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy();
    expect(countLine()!.getAttribute('role')).toBe('status');
    await user.click(open);
    const d = inDialog();
    for (const group of ['Round type', 'Time', 'Course', 'Pick rounds']) expect(d.getByRole('group', { name: group })).toBeTruthy();
    // Toggles say whether they are on; the window is a radio group; courses are checkboxes; dates are labelled inputs.
    expect(d.getByRole('button', { name: 'Tournament' }).getAttribute('aria-pressed')).toBe('true');
    expect(d.getByRole('button', { name: 'Practice' }).getAttribute('aria-pressed')).toBe('false');
    expect(d.getByRole('radiogroup', { name: 'Window' })).toBeTruthy();
    expect(within(d.getByRole('group', { name: 'Course' })).getAllByRole('checkbox').length).toBeGreaterThan(1);
    expect(d.getByLabelText('From').getAttribute('type')).toBe('date');
    // A range error is the dates' description, not just text beside them.
    fireEvent.change(d.getByLabelText('From'), { target: { value: RANGE.to } });
    fireEvent.change(d.getByLabelText('To'), { target: { value: RANGE.from } });
    await user.click(d.getByRole('button', { name: 'Done' }));
    const help = document.getElementById(d.getByLabelText('From').getAttribute('aria-describedby')!)!;
    expect(help.textContent).toMatch(/The start date is after the end date/);
    expect(d.getByLabelText('To').getAttribute('aria-describedby')).toBe(help.id);
  });
});

describe('Team stats · network', () => {
  it('CH-4901 a filter change offline requests nothing and says so in the filter\'s words', async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { unmount } = showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 12 }));
    await user.click(screen.getByRole('button', { name: 'Remove filter: Tournament' }));
    await expectCode('CH-4901', /Couldn't apply the filter: you're offline/);
    expect(code('CH-4901')!.textContent).toMatch(/still the rounds you had/);
    expect(router.push).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    unmount();
    // A window switch keeps its own words, even from a filtered page; the figures are "the rounds you had".
    showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 12 }));
    await user.click(screen.getByRole('radio', { name: 'Season' }));
    await waitFor(() => expect(document.querySelectorAll('[data-ch-code="CH-4901"]').length).toBeGreaterThan(0));
    expect([...document.querySelectorAll('[data-ch-code="CH-4901"]')].some((n) => /Couldn't open the season: you're offline/.test(n.textContent ?? ''))).toBe(true);
    online.mockRestore();
  });

  it('CH-4902 a slow filter change says so once; one that lands in time says nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const tree = (d: ChTeamStats) => shell(<StatsTeam data={d} />);
      const view = render(tree(team({ filter: filt({ types: ['tournament'] }), roundCount: 12 })));
      await user.click(screen.getByRole('button', { name: 'Remove filter: Tournament' }));
      expect(lastPush()).toBe(BASE);
      // The server answers: a new address, inside five seconds.
      view.rerender(tree(team()));
      vi.advanceTimersByTime(6000);
      expect(code('CH-4902')).toBeNull();
      // It does not: one notice.
      await user.click(screen.getByRole('button', { name: /^Filter/ }));
      await user.click(inDialog().getByRole('button', { name: 'Practice' }));
      await user.click(inDialog().getByRole('button', { name: 'Done' }));
      vi.advanceTimersByTime(4900);
      expect(code('CH-4902')).toBeNull();
      vi.advanceTimersByTime(200);
      await expectCode('CH-4902', /Still loading the filtered rounds…/);
      expect(document.querySelectorAll('[data-ch-code="CH-4902"]')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Stats player · the filter', () => {
  it('shows chips and the count for the rounds under the filter; a coach keeps the player in every address', async () => {
    const user = userEvent.setup();
    showPlayer(player({ filter: filt({ types: ['qualifier'] }), win: { ...PREVIEW_PLAYER.win, rounds: 3 } }));
    expect(chipNames()).toEqual(['Remove filter: Qualifying']);
    expect(countLine()!.textContent).toBe('3 rounds: qualifying rounds, last 10');
    await user.click(screen.getByRole('button', { name: 'Remove filter: Qualifying' }));
    expect(lastPush()).toBe(`${BASE}?player=jonah`);
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Practice' }));
    await user.click(inDialog().getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?player=jonah&type=qualifier%2Cpractice`);
  });

  it('a player\'s own page never carries a player id', async () => {
    const user = userEvent.setup();
    showPlayer(player({ viewer: 'player', nav: null, filter: filt({ types: ['qualifier'] }) }), null);
    await user.click(screen.getByRole('button', { name: 'Remove filter: Qualifying' }));
    expect(lastPush()).toBe(BASE);
  });

  it('the pager and Back to team keep the filter', () => {
    showPlayer(player({ filter: filt({ window: 'season', types: ['tournament'], courses: ['Pine Hollow'] }), window: 'season' }));
    const q = 'window=season&type=tournament&course=Pine+Hollow';
    expect(screen.getByRole('link', { name: 'Next player' }).getAttribute('href')).toBe(`${BASE}?player=eli&${q}`);
    expect(screen.getByRole('link', { name: 'Previous player' }).getAttribute('href')).toBe(`${BASE}?player=ava&${q}`);
    expect(screen.getByRole('link', { name: 'Team stats' }).getAttribute('href')).toBe(`${BASE}?${q}`);
  });

  it('CH-5320 a filter that matches none of their rounds says so in place of the figures; Development is still theirs to read', async () => {
    const user = userEvent.setup();
    showPlayer(PREVIEW_PLAYER_NOMATCH);
    await expectCode('CH-5320', /No rounds match these filters/);
    // Not an "early read" of nothing.
    expect(code('CH-5305')).toBeNull();
    expect(document.querySelector('.ch-st-panel .ch-fg, .ch-st-panel .ch-pf-figs')).toBeNull();
    expect(countLine()!.textContent).toMatch(/^0 rounds: /);
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    expect(code('CH-5320')).not.toBeNull();
    expect(code('CH-5301')).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Development/ }));
    expect(code('CH-5320')).toBeNull();
    await user.click(screen.getByRole('tab', { name: /Overview/ }));
    await user.click(within(code('CH-5320') as HTMLElement).getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(`${BASE}?player=jonah&window=season`);
  });

  it('CH-5305 one or two matching rounds still read as an early read, beside the filter', () => {
    showPlayer(player({ ...PREVIEW_PLAYER_EARLY, id: 'jonah', filter: filt({ courses: ['Finley GC'] }) }));
    expect(code('CH-5305')).not.toBeNull();
    expect(code('CH-5320')).toBeNull();
    expect(countLine()!.textContent).toBe(`${PREVIEW_PLAYER_EARLY.win.rounds} rounds: at Finley GC, last 10`);
  });

  it('says which rounds Game detail counts in the filter\'s words', async () => {
    const user = userEvent.setup();
    showPlayer(player({ filter: filt({ types: ['tournament'], ...RANGE }), win: { ...PREVIEW_PLAYER.win, rounds: 4 } }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    expect(document.querySelector('#gm-scoring .ch-gx-rule')!.textContent).toMatch(/^Tournaments, Sep 1 to Sep 29 · 4 rounds, 18 holes only/);
  });

  it('CH-5901 CH-5902 a filter change offline requests nothing; a slow one says so once', async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { unmount } = showPlayer(player({ filter: filt({ types: ['qualifier'] }) }));
    await user.click(screen.getByRole('button', { name: 'Remove filter: Qualifying' }));
    await expectCode('CH-5901', /Couldn't apply the filter: you're offline/);
    expect(router.push).not.toHaveBeenCalled();
    online.mockRestore();
    unmount();
    cleanup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const u2 = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      showPlayer(player({ filter: filt({ types: ['qualifier'] }) }));
      await u2.click(screen.getByRole('button', { name: 'Remove filter: Qualifying' }));
      vi.advanceTimersByTime(4900);
      expect(code('CH-5902')).toBeNull();
      vi.advanceTimersByTime(200);
      await expectCode('CH-5902', /Still loading the filtered rounds…/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CH-5102 CH-5321 CH-5322 the sheet has the same range check, nothing-to-pick and cut-list states, with this page\'s numbers', async () => {
    const user = userEvent.setup();
    showPlayer(player({ filterOptions: opts(3, { total: 40 }) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    fireEvent.change(d.getByLabelText('From'), { target: { value: RANGE.to } });
    fireEvent.change(d.getByLabelText('To'), { target: { value: RANGE.from } });
    await user.click(d.getByRole('button', { name: 'Done' }));
    await expectCode('CH-5102', /The start date is after the end date/);
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.change(d.getByLabelText('From'), { target: { value: '' } });
    fireEvent.change(d.getByLabelText('To'), { target: { value: '' } });
    await user.click(d.getByRole('button', { name: 'Only these' }));
    await expectCode('CH-5322', /Showing the newest 3 of 40 rounds/);
    // A profile lists the course, not the player.
    expect(pickRows()[0]).toContain('Pine Hollow');
    expect(pickRows()[0]).not.toContain('Theo');
    await user.click(d.getByRole('button', { name: 'Qualifying' }));
    await expectCode('CH-5321', /No rounds to pick from/);
  });
});

describe('Stats player · the Rounds tab says why there is no earlier window', () => {
  const why = async (filter: ChFilter) => {
    const user = userEvent.setup();
    showPlayer(player({ filter, extra: { ...PREVIEW_PLAYER.extra, compare: null } }));
    await user.click(screen.getByRole('tab', { name: /Rounds/ }));
    return code('CH-5313')!.textContent;
  };
  it('CH-5313 a date range, picked rounds, a thin filtered ten, the season and the qualifiers each say their own reason', async () => {
    expect(await why(filt({ ...RANGE }))).toBe('A date range has no earlier window to compare with.');
    cleanup();
    expect(await why(filt({ pick: { mode: 'only', ids: ['r1'] } }))).toBe('Picked rounds have no earlier window to compare with.');
    cleanup();
    expect(await why(filt({ types: ['tournament'] }))).toBe('Needs 3 earlier 18-hole rounds: fewer than 13 match these filters.');
    cleanup();
    expect(await why(filt())).toMatch(/^Needs 3 earlier 18-hole rounds: this window has fewer than 13 in the last 12 months/);
    cleanup();
    expect(await why(filterFor('season'))).toBe('The season has no earlier window to compare with.');
    cleanup();
    expect(await why(filterFor('qualifiers'))).toBe('Qualifier rounds have no earlier window to compare with.');
  });
});

describe('Stats player · phone', () => {
  phoneWidth();

  it('a Filter button under the window switch opens a sheet, with the chips and the count in a row under it', async () => {
    const user = userEvent.setup();
    showPhonePlayer(player({ filter: filt({ types: ['qualifier'] }), win: { ...PREVIEW_PLAYER.win, rounds: 3 } }));
    expect(document.querySelector('.ch-sf.is-phone')).not.toBeNull();
    const switchEl = document.querySelector('.ch-seg') as HTMLElement;
    const bar = document.querySelector('.ch-sf') as HTMLElement;
    // The bar follows the switch in the page.
    expect(switchEl.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chipNames()).toEqual(['Remove filter: Qualifying']);
    expect(countLine()!.textContent).toBe('3 rounds: qualifying rounds, last 10');
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Tournament' }));
    await user.click(inDialog().getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?player=jonah&type=tournament%2Cqualifier`);
  });

  it('CH-5320 a filter with no rounds says so above Development, which stays; the phone has no early read of nothing', async () => {
    const user = userEvent.setup();
    showPhonePlayer(PREVIEW_PLAYER_NOMATCH);
    await expectCode('CH-5320', /No rounds match these filters/);
    expect(code('CH-5305')).toBeNull();
    expect(screen.queryByText('Game detail')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Development' })).toBeTruthy();
    await user.click(within(code('CH-5320') as HTMLElement).getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(`${BASE}?player=jonah&window=season`);
  });
});

describe('Team stats · phone', () => {
  phoneWidth();

  it('the same filter: the bar under the window switch, chips and the count, the sheet, and a player opened with it', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ types: ['tournament'], ...RANGE }), roundCount: 12 }));
    expect(document.querySelector('.ch-sf.is-phone')).not.toBeNull();
    expect(chipNames()).toEqual(['Remove filter: Tournament', 'Remove filter: Sep 1 to Sep 29']);
    expect(countLine()!.textContent).toBe('12 rounds: tournaments, Sep 1 to Sep 29');
    expect(document.querySelector('a[href*="player="]')!.getAttribute('href')).toContain(`type=tournament&from=${RANGE.from}&to=${RANGE.to}`);
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    expect(dialog()).toBeTruthy();
  });

  it('CH-4313 CH-4314 the same empty and early-read states', async () => {
    const user = userEvent.setup();
    const { unmount } = showTeam(team({ filter: filt({ types: ['qualifier'] }), roundCount: 0, grid: [], players: [], putting: null, bests: [] }));
    await expectCode('CH-4313', /No rounds match these filters/);
    await user.click(within(code('CH-4313') as HTMLElement).getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe(BASE);
    unmount();
    showTeam(team({ filter: filt({ types: ['qualifier'] }), roundCount: 2, roundsEffective: 2 }));
    expect(code('CH-4314')!.textContent).toMatch(/2 rounds match these filters/);
  });
});

/**
 * The Holes control: 18 holes (the default), 9 holes, or Both. Per-round figures are per 18 holes and a 9-hole round counts as half a
 * round (CH-4318, CH-5323 say so under the figures); the early-read floors count whole rounds.
 */
describe('Stats · holes', () => {
  const PER_18 = /per 18 holes.*half a round/;
  /** A Rounds-tab card by its heading's id. */
  const card = (id: string) => document.getElementById(id)?.closest('section') ?? null;
  const pressed = (d: ReturnType<typeof inDialog>) => ['18 holes', '9 holes', 'Both'].filter((n) => d.getByRole('button', { name: n }).getAttribute('aria-pressed') === 'true');

  it('the sheet chooses the length: 18 holes is pressed and says nine-hole rounds are left out, the others say how they count', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    const d = inDialog();
    const group = d.getByRole('group', { name: 'Holes' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['18 holes', '9 holes', 'Both']);
    expect(pressed(d)).toEqual(['18 holes']);
    expect(group.textContent).toContain('Nine-hole rounds are left out.');
    hapticSpy.mockClear();
    await user.click(d.getByRole('button', { name: '9 holes' }));
    expect(pressed(d)).toEqual(['9 holes']);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(group.textContent).toMatch(PER_18);
    // Nothing is requested until Done.
    expect(router.push).not.toHaveBeenCalled();
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?holes=9`);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('Both and 18 holes: Both is carried in the address, and putting the default back asks for nothing', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Both' }));
    await user.click(inDialog().getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?holes=all`);
    cleanup();
    router.push.mockClear();
    showTeam(team({ filter: filt({ holes: 'all' }), roundCount: 7, filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    expect(pressed(inDialog())).toEqual(['Both']);
    await user.click(inDialog().getByRole('button', { name: '18 holes' }));
    await user.click(inDialog().getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(BASE);
  });

  it('keeps the other choices: the holes go into the same address as the type and the window', async () => {
    const user = userEvent.setup();
    showTeam(team({ filterOptions: opts(6) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Tournament' }));
    await user.click(inDialog().getByRole('button', { name: '9 holes' }));
    await user.click(inDialog().getByRole('radio', { name: 'Season' }));
    await user.click(inDialog().getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?window=season&type=tournament&holes=9`);
  });

  it('CH-4318 Team stats: a chip, the count line and the per-18 note whenever nine-hole rounds are in; none at the default', async () => {
    const user = userEvent.setup();
    const { unmount } = showTeam(team({ filter: filt({ holes: '9' }), roundCount: 3, roundsEffective: 1.5 }));
    expect(chipNames()).toEqual(['Remove filter: 9 holes']);
    expect(countLine()!.textContent).toBe('3 rounds: 9-hole rounds, last 10');
    await expectCode('CH-4318', PER_18);
    await user.click(screen.getByRole('button', { name: 'Remove filter: 9 holes' }));
    expect(lastPush()).toBe(BASE);
    unmount();
    showTeam(team({ filter: filt({ holes: 'all' }), roundCount: 9, roundsEffective: 7 }));
    expect(chipNames()).toEqual(['Remove filter: 18 and 9 holes']);
    expect(countLine()!.textContent).toBe('9 rounds: 18- and 9-hole rounds, last 10');
    expect(code('CH-4318')!.textContent).toMatch(PER_18);
    cleanup();
    // Another filter with the default length says nothing about nine-hole rounds.
    showTeam(team({ filter: filt({ types: ['tournament'] }), roundCount: 5 }));
    expect(code('CH-4318')).toBeNull();
    cleanup();
    showTeam(team());
    expect(code('CH-4318')).toBeNull();
  });

  it('CH-5323 a profile: the chip, the count line, the per-18 note, and Game detail says how the rounds count', async () => {
    const user = userEvent.setup();
    showPlayer(player({ filter: filt({ holes: '9' }), win: { ...PREVIEW_PLAYER.win, rounds: 4, effRounds: 2, sgRounds: 4, effSgRounds: 2 } }));
    expect(chipNames()).toEqual(['Remove filter: 9 holes']);
    expect(countLine()!.textContent).toBe('4 rounds: 9-hole rounds, last 10');
    expect(code('CH-5323')!.textContent).toMatch(PER_18);
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    expect(document.querySelector('#gm-scoring .ch-gx-rule')!.textContent).toMatch(/^9-hole rounds, last 10 · 4 rounds, 9-hole rounds; per-round figures are per 18 holes \(a 9-hole round counts as half a round\)/);
    cleanup();
    showPlayer(player({ filter: filt({ holes: 'all' }) }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    expect(document.querySelector('#gm-scoring .ch-gx-rule')!.textContent).toMatch(/18- and 9-hole rounds; per-round figures are per 18 holes/);
    cleanup();
    showPlayer(player({ filter: filt({ types: ['practice'] }) }));
    expect(code('CH-5323')).toBeNull();
  });

  it('CH-5305 CH-5308 the early reads count whole rounds: four 9-hole rounds are two, six are three', () => {
    const at = (rounds: number, eff: number, sg = rounds, effSg = eff) => player({ filter: filt({ holes: '9' }), win: { ...PREVIEW_PLAYER.win, rounds, effRounds: eff, sgRounds: sg, effSgRounds: effSg } });
    const { unmount } = showPlayer(at(4, 2));
    expect(code('CH-5305')!.textContent).toMatch(/4 countable rounds, 2 counting 9-hole rounds as half/);
    unmount();
    const six = showPlayer(at(6, 3));
    expect(code('CH-5305')).toBeNull();
    six.unmount();
    // Whole rounds only: two long rounds and a short one are 2.5, still early.
    const half = showPlayer(at(3, 2.5));
    expect(code('CH-5305')!.textContent).toMatch(/3 countable rounds, 2\.5 counting 9-hole rounds as half/);
    half.unmount();
    // Rounds with shots are counted the same way.
    const shots = showPlayer(at(6, 3, 4, 2));
    expect(code('CH-5305')).toBeNull();
    expect(code('CH-5308')!.textContent).toMatch(/4 of 6 rounds with shots \(2 counting 9-hole rounds as half\)/);
    shots.unmount();
    // With no nine-hole round in the way, the plain words stay.
    showPlayer(player({ win: { ...PREVIEW_PLAYER.win, rounds: 2, effRounds: 2 } }));
    expect(code('CH-5305')!.textContent).toMatch(/has 2 countable rounds in this window/);
    expect(code('CH-5305')!.textContent).not.toMatch(/counting 9-hole/);
  });

  it('D-71 a team whose only rounds this season are 9-hole ones gets CH-4301 and the hint, never the first-run page; with no round of either length it is still the first run', () => {
    const noTeamRounds = { window: 'season' as const, roundCount: 0, roundsEffective: 0, grid: [], players: [], putting: null, bests: [] };
    const first = showTeam(team({ ...noTeamRounds, filterOptions: opts(0) }));
    expect(code('CH-4310')).not.toBeNull();
    expect(code('CH-4319')).toBeNull();
    first.unmount();
    // A 9-hole round posted this season: stats exist, they are just not 18-hole ones.
    const nineOnly = showTeam(team({ ...noTeamRounds, filterOptions: opts(1, { rounds: [pr(0, { holes: 9 })] }) }));
    expect(code('CH-4310')).toBeNull();
    expect(code('CH-4301')).not.toBeNull();
    expect(code('CH-4319')).not.toBeNull();
    nineOnly.unmount();
    // Only 18-hole rounds loaded and none in the window (before the season): nothing 9-hole to point at, so the first run.
    showTeam(team({ ...noTeamRounds, filterOptions: opts(1, { rounds: [pr(0, { holes: 9, date: `${y - 1}-09-01` })] }) }));
    expect(code('CH-4310')).not.toBeNull();
    expect(code('CH-4319')).toBeNull();
  });

  it('CH-4319 CH-5324 no round of the default length but 9-hole ones posted: the page says where they are, and only then', () => {
    const noTeamRounds = { roundCount: 0, roundsEffective: 0, grid: [], players: [], putting: null, bests: [] };
    const withNine = opts(2, { rounds: [pr(0, { holes: 9 }), pr(1)] });
    const { unmount } = showTeam(team({ ...noTeamRounds, filterOptions: withNine }));
    expect(code('CH-4319')!.textContent).toBe('This team has 9-hole rounds in this window, which the 18-hole view leaves out. Choose 9 holes or Both in Filter to see them.');
    unmount();
    // No 9-hole round posted: nothing to point at. A filter on: its own empty state, never this.
    const plain = showTeam(team({ ...noTeamRounds, filterOptions: opts(2) }));
    expect(code('CH-4319')).toBeNull();
    plain.unmount();
    const filtered = showTeam(team({ ...noTeamRounds, filter: filt({ holes: 'all' }), filterOptions: withNine }));
    expect(code('CH-4319')).toBeNull();
    expect(code('CH-4313')).not.toBeNull();
    filtered.unmount();
    // Rounds on the page: the figures are there, nothing is missing.
    showTeam(team({ filterOptions: withNine }));
    expect(code('CH-4319')).toBeNull();
    cleanup();
    // The hint is for THIS window: a 9-hole practice round on Qualifiers, or one from before the season, would show nothing under Both.
    const practiceOnly = showTeam(team({ ...noTeamRounds, window: 'qualifiers', filterOptions: opts(2, { rounds: [pr(0, { holes: 9, kind: 'practice' }), pr(1, { kind: 'qualifier' })] }) }));
    expect(code('CH-4319')).toBeNull();
    expect(code('CH-4302')).not.toBeNull();
    practiceOnly.unmount();
    // Season is this season: a 9-hole round from before it would show nothing under Both. Last 10 reaches back across seasons (Q-122), so it would.
    const lastYear = showTeam(team({ ...noTeamRounds, window: 'season', filterOptions: opts(2, { rounds: [pr(0, { holes: 9, date: `${y - 1}-09-01` }), pr(1)] }) }));
    expect(code('CH-4319')).toBeNull();
    lastYear.unmount();
    const lastYearLast10 = showTeam(team({ ...noTeamRounds, filterOptions: opts(2, { rounds: [pr(0, { holes: 9, date: `${y - 1}-09-01` }), pr(1)] }) }));
    expect(code('CH-4319')).not.toBeNull();
    lastYearLast10.unmount();
    // ...and a qualifying 9-hole round does show it there.
    showTeam(team({ ...noTeamRounds, window: 'qualifiers', filterOptions: opts(2, { rounds: [pr(0, { holes: 9, kind: 'qualifier' })] }) }));
    expect(code('CH-4319')).not.toBeNull();
    cleanup();

    const none = { ...PREVIEW_PLAYER.win, rounds: 0, effRounds: 0, sgRounds: 0, effSgRounds: 0, avg: null, sgPerRound: null };
    const a = showPlayer(player({ win: none, rounds: [], filterOptions: withNine }));
    expect(code('CH-5324')!.textContent).toBe('Jonah has 9-hole rounds in this window, which the 18-hole view leaves out. Choose 9 holes or Both in Filter to see them.');
    a.unmount();
    const own = showPlayer(player({ viewer: 'player', nav: null, win: none, rounds: [], filterOptions: withNine }), null);
    expect(code('CH-5324')!.textContent).toMatch(/^You have 9-hole rounds/);
    own.unmount();
    const b = showPlayer(player({ win: none, rounds: [], filterOptions: opts(2) }));
    expect(code('CH-5324')).toBeNull();
    b.unmount();
    const c = showPlayer(player({ filterOptions: withNine }));
    expect(code('CH-5324')).toBeNull();
    c.unmount();
    const q = showPlayer(player({ win: none, rounds: [], window: 'qualifiers', filterOptions: opts(2, { rounds: [pr(0, { holes: 9, kind: 'practice' })] }) }));
    expect(code('CH-5324')).toBeNull();
    q.unmount();
    showPlayer(player({ win: none, rounds: [], filter: filt({ holes: '9' }), filterOptions: withNine }));
    expect(code('CH-5324')).toBeNull();
    expect(code('CH-5320')).not.toBeNull();
  });

  it('the pick list says which rounds are 9 holes', async () => {
    const user = userEvent.setup();
    showTeam(team({ filter: filt({ holes: 'all' }), filterOptions: opts(3, { rounds: [pr(0, { holes: 9 }), pr(1), pr(2)] }) }));
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(inDialog().getByRole('button', { name: 'Only these' }));
    expect(pickRows()[0]).toContain('9 holes');
    expect(pickRows()[1]).not.toContain('9 holes');
  });

  it('Rounds tab: personal bests are listed by length, never mixed', async () => {
    const user = userEvent.setup();
    const best9 = { score: { value: 33, date: 'Sep 20', course: 'Finley GC' }, toPar: { value: -3, date: 'Sep 20', course: 'Finley GC' }, gir: null, putts: { value: 12, date: 'Sep 20', course: 'Finley GC' } };
    const open = async (filter: ChFilter, extra: Partial<ChPlayerProfile['extra']>) => {
      showPlayer(player({ filter, extra: { ...PREVIEW_PLAYER.extra, ...extra } }));
      await user.click(screen.getByRole('tab', { name: /Rounds/ }));
    };
    const cards = () => ['rx-bests', 'rx-bests9'].map((id) => document.getElementById(id)?.textContent ?? null);
    await open(filt(), { bests9: null, nineRounds: 0 });
    expect(cards()).toEqual(['Personal bests', null]);
    cleanup();
    await open(filt({ holes: 'all' }), { bests9: best9, nineRounds: 2 });
    expect(cards()).toEqual(['Personal bests', 'Personal bests, 9 holes']);
    expect(card('rx-bests9')!.textContent).toContain('33');
    expect(card('rx-bests9')!.textContent).toContain('12');
    expect(card('rx-bests')!.textContent).not.toContain('Sep 20');
    cleanup();
    await open(filt({ holes: '9' }), { bests: { score: null, toPar: null, gir: null, putts: null }, bests9: best9, nineRounds: 2 });
    expect(cards()).toEqual([null, 'Personal bests']);
    cleanup();
    // Both, with no 18-hole round in the window: no empty 18-hole card beside the 9-hole one.
    await open(filt({ holes: 'all' }), { bests: { score: null, toPar: null, gir: null, putts: null }, bests9: best9, nineRounds: 2 });
    expect(cards()).toEqual([null, 'Personal bests, 9 holes']);
  });

  it('Rounds tab: the score line says its scores are per 18 and which lengths it has; the earlier-window note counts whole rounds', async () => {
    const user = userEvent.setup();
    showPlayer(player({ filter: filt({ holes: 'all' }), extra: { ...PREVIEW_PLAYER.extra, nineRounds: 2, compare: null } }));
    await user.click(screen.getByRole('tab', { name: /Rounds/ }));
    expect(card('rx-score')!.textContent).toContain('Every 18- and 9-hole round in this window, oldest first · 9-hole scores doubled (per 18)');
    expect(code('CH-5313')!.textContent).toBe('Needs 3 earlier rounds before the newest 10 that match these filters, counting a 9-hole round as half.');
    cleanup();
    showPlayer(player({ extra: { ...PREVIEW_PLAYER.extra, nineRounds: 0 } }));
    await user.click(screen.getByRole('tab', { name: /Rounds/ }));
    expect(card('rx-score')!.textContent).toContain('Every 18-hole round in this window, oldest first');
    expect(card('rx-score')!.textContent).not.toContain('doubled');
  });

  it('Game detail, Scoring: with 9-hole rounds in, each length has its own best and worst, and the by-round-type note says how they count', async () => {
    const user = userEvent.setup();
    const panel = (title: string) => [...document.querySelectorAll('.ch-gm-p')].find((p) => p.querySelector('.ch-gm-p__t')?.textContent === title) as HTMLElement;
    const tiles = (el: Element) => [...el.querySelectorAll('dl.ch-gx-tiles > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]);
    const best9 = { score: { value: 33, date: 'Sep 20', course: 'Finley GC' }, toPar: null, gir: null, putts: null };
    const stats = { ...PREVIEW_PLAYER.stats!, roundsPlayed18: 3, roundsPlayed9: 2, bestRound18: 72, worstRound18: 78, bestRound9: 33, worstRound9: 40, avgScoreToPar: 2.4 };
    showPlayer(player({ filter: filt({ holes: 'all' }), stats, extra: { ...PREVIEW_PLAYER.extra, nineRounds: 2, bests9: best9 } }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const numbers = panel('Scoring numbers');
    expect(tiles(numbers)).toEqual([
      ['Average to par', '+2.40'],
      ['Best 18-hole round', '72'],
      ['Worst 18-hole round', '78'],
      ['Best 9-hole round', '33'],
      ['Worst 9-hole round', '40'],
    ]);
    expect(numbers.textContent).toContain('Finley GC · Sep 20');
    expect(panel('By round type').textContent).toContain('a 9-hole score counts as half a round');
    cleanup();
    // The calculator's best (it reads the newest 100 rounds with hole data) is not the window's best: a course and date that belong to
    // another round are never put under it.
    showPlayer(player({ filter: filt({ holes: 'all' }), stats, extra: { ...PREVIEW_PLAYER.extra, nineRounds: 2, bests: { ...PREVIEW_PLAYER.extra.bests, score: { value: 70, date: 'Aug 30', course: 'Pinehurst No. 8' } }, bests9: { ...best9, score: { value: 31, date: 'Sep 21', course: 'Oakmont CC' } } } }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    const apart = panel('Scoring numbers');
    expect(tiles(apart).filter(([l]) => /^Best/.test(l ?? ''))).toEqual([['Best 18-hole round', '72'], ['Best 9-hole round', '33']]);
    expect(apart.textContent).not.toContain('Pinehurst No. 8');
    expect(apart.textContent).not.toContain('Oakmont CC');
    cleanup();
    // Nine holes alone: no 18-hole pair to show.
    showPlayer(player({ filter: filt({ holes: '9' }), stats: { ...stats, roundsPlayed18: 0, bestRound18: null, worstRound18: null }, extra: { ...PREVIEW_PLAYER.extra, nineRounds: 2, bests9: best9 } }));
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    expect(tiles(panel('Scoring numbers')).map(([l]) => l)).toEqual(['Average to par', 'Best 9-hole round', 'Worst 9-hole round']);
    cleanup();
    // The default: the calculator's own best and worst, as before.
    showPlayer(player());
    await user.click(screen.getByRole('tab', { name: /Game detail/ }));
    expect(tiles(panel('Scoring numbers')).map(([l]) => l)).toEqual(['Average to par', 'Best round', 'Worst round']);
    expect(panel('By round type').textContent).toContain('Average score of 18-hole rounds of each type');
  });

  it('the trend draws a 9-hole score per 18 and says so; the round row says it was 9 holes', async () => {
    const user = userEvent.setup();
    const rounds = PREVIEW_PLAYER.rounds.map((r, i) => (i === 0 ? { ...r, holes: 9, score: 38, toPar: 2 } : r));
    showPlayer(player({ filter: filt({ holes: 'all' }), rounds }));
    expect(document.body.textContent).toMatch(/9-hole scores doubled/);
    // The newest round, a 38 at +2 over nine holes, is drawn as a 76 at +4; the average is over the drawn scores.
    const tiles = [...document.querySelectorAll('.ch-board__n')].map((el) => el.textContent);
    expect(tiles[tiles.length - 1]).toBe('+4');
    const drawn = PREVIEW_PLAYER.rounds.map((r, i) => (i === 0 ? 76 : r.score));
    expect(document.querySelector('.ch-board')!.parentElement!.textContent).toContain(`avg ${(drawn.reduce((a, b) => a + b, 0) / drawn.length).toFixed(1)}`);
    await user.click(screen.getByRole('tab', { name: /Rounds/ }));
    expect(document.querySelectorAll('.ch-gx-type').length).toBeGreaterThan(0);
    expect([...document.querySelectorAll('.ch-gx-type')].some((el) => el.textContent === '9 holes')).toBe(true);
    cleanup();
    showPlayer(player({ filter: filt() }));
    expect(document.body.textContent).not.toMatch(/9-hole scores doubled/);
  });
});

describe('Stats · holes · phone', () => {
  phoneWidth();

  it('CH-5323 the phone profile: the chip and the note, the sheet\'s Holes control, and a 9-hole round named in the list and doubled in the line', async () => {
    const user = userEvent.setup();
    const rounds = PREVIEW_PLAYER.rounds.map((r, i) => (i === 0 ? { ...r, holes: 9, score: 38 } : r));
    showPhonePlayer(player({ filter: filt({ holes: 'all' }), rounds }));
    expect(chipNames()).toEqual(['Remove filter: 18 and 9 holes']);
    expect(code('CH-5323')!.textContent).toMatch(/per 18 holes/);
    expect(document.body.textContent).toMatch(/9-hole scores doubled/);
    // The line is drawn per 18: the newest round, a 38, ends it as a 76.
    expect(document.querySelector('svg[aria-label^="Scores over the last"]')!.getAttribute('aria-label')).toMatch(/to 76,/);
    // The round's own row says it was nine holes (the chip above says so too, so look at the rows).
    expect([...document.querySelectorAll('.ch-num')].some((el) => / · 9 holes/.test(el.textContent ?? ''))).toBe(true);
    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    expect(inDialog().getByRole('group', { name: 'Holes' })).toBeTruthy();
    await user.click(inDialog().getByRole('button', { name: '9 holes' }));
    await user.click(inDialog().getByRole('button', { name: 'Done' }));
    expect(lastPush()).toBe(`${BASE}?player=jonah&holes=9`);
  });

  it('CH-5305 the phone early read counts whole rounds too', () => {
    const { unmount } = showPhonePlayer(player({ filter: filt({ holes: '9' }), win: { ...PREVIEW_PLAYER.win, rounds: 4, effRounds: 2, sgRounds: 4, effSgRounds: 2 } }));
    expect(code('CH-5305')!.textContent).toMatch(/4 countable rounds, 2 counting 9-hole rounds as half/);
    unmount();
    showPhonePlayer(player({ filter: filt({ holes: '9' }), win: { ...PREVIEW_PLAYER.win, rounds: 6, effRounds: 3, sgRounds: 4, effSgRounds: 2 } }));
    expect(code('CH-5305')).toBeNull();
    expect(code('CH-5308')!.textContent).toMatch(/4 of 6 rounds with shots \(2 counting 9-hole rounds as half\)/);
  });

  it('CH-4319 CH-5324 the phone pages point at the 9-hole rounds too', () => {
    const withNine = opts(2, { rounds: [pr(0, { holes: 9 }), pr(1)] });
    const { unmount } = showTeam(team({ roundCount: 0, roundsEffective: 0, grid: [], players: [], putting: null, bests: [], filterOptions: withNine }));
    expect(code('CH-4319')!.textContent).toMatch(/^This team has 9-hole rounds/);
    unmount();
    // The phone's first run is D-71's too: 9-hole rounds this season are CH-4301 with the hint.
    const season = showTeam(team({ window: 'season', roundCount: 0, roundsEffective: 0, grid: [], players: [], putting: null, bests: [], filterOptions: withNine }));
    expect(code('CH-4310')).toBeNull();
    expect(code('CH-4301')).not.toBeNull();
    expect(code('CH-4319')).not.toBeNull();
    season.unmount();
    const none = { ...PREVIEW_PLAYER.win, rounds: 0, effRounds: 0, sgRounds: 0, effSgRounds: 0, avg: null, sgPerRound: null };
    const coach = showPhonePlayer(player({ win: none, rounds: [], filterOptions: withNine }));
    expect(code('CH-5324')!.textContent).toMatch(/^Jonah has 9-hole rounds/);
    coach.unmount();
    const own = showPhonePlayer(player({ viewer: 'player', nav: null, win: none, rounds: [], filterOptions: withNine }));
    expect(code('CH-5324')!.textContent).toMatch(/^You have 9-hole rounds/);
    own.unmount();
    // Rounds on the page, or a filter on: no hint.
    const withRounds = showPhonePlayer(player({ filterOptions: withNine }));
    expect(code('CH-5324')).toBeNull();
    withRounds.unmount();
    showPhonePlayer(player({ win: none, rounds: [], filter: filt({ holes: '9' }), filterOptions: withNine }));
    expect(code('CH-5324')).toBeNull();
    expect(code('CH-5320')).not.toBeNull();
    cleanup();
    showTeam(team({ roundCount: 0, roundsEffective: 0, grid: [], players: [], putting: null, bests: [], filter: filt({ holes: 'all' }), filterOptions: withNine }));
    expect(code('CH-4319')).toBeNull();
    expect(code('CH-4313')).not.toBeNull();
  });

  it('CH-4318 the phone team page: the chip, the note and the early read in whole rounds', () => {
    const { unmount } = showTeam(team({ filter: filt({ holes: '9' }), roundCount: 4, roundsEffective: 2 }));
    expect(chipNames()).toEqual(['Remove filter: 9 holes']);
    expect(code('CH-4318')!.textContent).toMatch(/per 18 holes/);
    expect(code('CH-4314')!.textContent).toMatch(/4 rounds match these filters, 2 counting 9-hole rounds as half/);
    unmount();
    showTeam(team({ filter: filt({ holes: '9' }), roundCount: 6, roundsEffective: 3 }));
    expect(code('CH-4314')).toBeNull();
  });
});
