import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Stats (player): every numbered state in docs/clubhouse/catalog/stats-player.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const reportSpy = vi.hoisted(() => vi.fn());
const trailSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: reportSpy, chTrail: trailSpy, chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const search = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => search.current }));
const createFocusArea = vi.hoisted(() => vi.fn());
const answer = vi.hoisted(() => ({ accept: vi.fn(), decline: vi.fn() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea, acceptFocusArea: answer.accept, declineFocusArea: answer.decline }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
vi.mock('../data/stats-team', () => ({ loadTeamStats: vi.fn() }));
vi.mock('../data/stats-player', () => ({ loadPlayerProfile: vi.fn() }));
// The loader tests below run the real loader (vi.importActual) on a fake Supabase and a fake shot-level read.
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const detailed = vi.hoisted(() => vi.fn());
const getSpray = vi.hoisted(() => vi.fn());
vi.mock('@/app/golf/actions/stats-data', () => ({ getDetailedStats: detailed, getSprayChartData: getSpray }));
const emptyGroup = (family: 'driving' | 'approach') => ({ family, totalShots: 0, plottedShots: 0, averageForwardDistance: null, averageRemainingDistance: null, playableCount: 0, troubleCount: 0, penaltyCount: 0, dominantSector: null, points: [], summaryBands: [] });
const emptySpray = () => ({ driving: emptyGroup('driving'), approach: emptyGroup('approach'), scope: { roundId: 'overall', roundsIncluded: 0, filterApplied: false } });

import { getGolfSessionProfile } from '@/lib/auth/session';
import type { ChPlayerProfile } from '../data/stats-player';
import { loadPlayerProfile } from '../data/stats-player';
import { calculateStatsFromShots } from '@/lib/utils/golf-stats-calculator-shots';
import { loadTeamStats } from '../data/stats-team';
import { resolveClubhouseTeam } from '../routes/team';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { ClubhouseStatsRoute, NotOnTeam, StatsNoTeam } from '../routes/stats';
import { ToastProvider } from '../ui/Toast';
import { CrumbProvider, useCrumbTrail } from '../shell/crumbs';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { PREVIEW_PLAYER, PREVIEW_PLAYER_EARLY } from '../preview/fixtures-stats';
import { filterFor } from '../data/stats-filter';
import { ClubhouseMarker } from '../shell/context';
import StatsLoading from '@/app/golf/(dashboard)/dashboard/stats/loading';
import './dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function Trail() {
  return <p data-testid="trail">{useCrumbTrail()?.join(' › ') ?? 'nav'}</p>;
}
function shell(node: React.ReactNode) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <CrumbProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Trail />
            {node}
          </div>
        </CrumbProvider>
      </ToastProvider>
    </LazyMotion>
  );
}
function wrap(node: React.ReactNode) {
  return render(shell(node));
}
// A test that chooses a window chooses it for the filter too (the screens read the filter, whose window is the window).
const player = (over: Partial<ChPlayerProfile> = {}): ChPlayerProfile => ({ ...PREVIEW_PLAYER, ...(over.window ? { filter: filterFor(over.window) } : {}), ...over });
const show = (data: ChPlayerProfile, coachId: string | null = 'c1') => wrap(<StatsPlayer data={data} coachId={coachId} />);
const openTab = (user: ReturnType<typeof userEvent.setup>, name: RegExp) => user.click(screen.getByRole('tab', { name }));

beforeEach(() => {
  hapticSpy.mockClear();
  reportSpy.mockClear();
  trailSpy.mockClear();
  logServer.mockClear();
  router.refresh.mockClear();
  router.push.mockClear();
  createFocusArea.mockReset();
});

describe('Stats player · saves', () => {
  it('CH-5101 CH-5001 51201 a focus area needs a name; a failed save keeps the text, the sheet stays open, and the failure is reported low', async () => {
    const user = userEvent.setup();
    createFocusArea.mockResolvedValue({ success: false, error: 'nope' });
    show(player());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    await expectCode('CH-5101', /at least three characters/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(createFocusArea).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'What to work on' }), 'Lag putting');
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    await expectCode('CH-5001', /Couldn't add the focus area for/);
    expect((screen.getByRole('textbox', { name: 'What to work on' }) as HTMLInputElement).value).toBe('Lag putting');
    expect(screen.getByRole('dialog', { name: 'Add a focus area for Jonah' })).toBeTruthy();
    expect(reportSpy).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'stats', action: 'stats.addFocusArea', severity: 'low' }));
  });

  it('CH-5401 adding shows its progress and cannot be pressed twice', async () => {
    const user = userEvent.setup();
    createFocusArea.mockImplementation(() => new Promise(() => {}));
    show(player());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    await user.type(screen.getByRole('textbox', { name: 'What to work on' }), 'Lag putting');
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    await expectCode('CH-5401', /Adding/);
    expect((code('CH-5401')!.closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Stats player · reads that fail', () => {
  it('CH-5201 51401 rounds do not load; Try again asks the server for the whole page again', async () => {
    const user = userEvent.setup();
    show(player({ roundsError: true }));
    await expectCode('CH-5201', /Rounds didn't load/);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-5202 shot-level detail does not load: Game detail says so instead of zeros', async () => {
    const user = userEvent.setup();
    show(player({ statsError: true }));
    await openTab(user, /Game detail/);
    await expectCode('CH-5202', /Shot-level detail didn't load/);
  });

  it('CH-5203 development items do not load', async () => {
    const user = userEvent.setup();
    show(player({ devError: true }));
    await openTab(user, /Development/);
    await expectCode('CH-5203', /Some development items didn't load/);
  });

  it('CH-5204 CH-5206 CH-5207 52301 a crash stays inside its tab, and is reported high with its section', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    show(player({ comparisons: null as never, focusAreas: null as never, rounds: [{ ...PREVIEW_PLAYER.rounds[0]!, course: {} as never }] }));
    await expectCode('CH-5204', /The overview couldn’t be shown/);
    expect(screen.getByRole('tablist')).toBeTruthy();
    await openTab(user, /Rounds/);
    await expectCode('CH-5206', /The rounds table couldn’t be shown/);
    await openTab(user, /Development/);
    await expectCode('CH-5207', /Development couldn’t be shown/);
    for (const surface of ['stats.player.overview', 'stats.player.rounds', 'stats.player.development'])
      expect(reportSpy).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface, severity: 'high' }));
    quiet.mockRestore();
  });

  it('CH-5003 CH-5004 CH-5404 a player answers a proposed focus area: Accept starts it, Decline sets it aside; a coach only sees it waiting', async () => {
    const user = userEvent.setup();
    router.refresh.mockClear();
    const proposed = { id: 'f9', title: 'Lag putting', baseline: 40, current: 40, target: 60, metric: 'lag', status: 'proposed' };
    const mine = player({ viewer: 'player', focusAreas: [...PREVIEW_PLAYER.focusAreas, proposed] });
    let release: (v: { success: boolean; error?: string }) => void = () => {};
    answer.accept.mockImplementation(() => new Promise((r) => (release = r)));
    show(mine, null);
    await openTab(user, /Development/);
    const group = screen.getByRole('group', { name: 'Answer Lag putting' });
    // Only the proposed one takes an answer.
    expect(screen.getAllByRole('group', { name: /^Answer / })).toHaveLength(1);
    await user.click(within(group).getByRole('button', { name: 'Accept' }));
    await expectCode('CH-5404', /Accepting/);
    expect(within(group).getByRole('button', { name: 'Decline' })).toHaveProperty('disabled', true);
    expect(answer.accept).toHaveBeenCalledWith('f9');
    release({ success: false, error: 'nope' });
    await expectCode('CH-5003', /Couldn’t accept Lag putting/);
    expect(router.refresh).not.toHaveBeenCalled();
    answer.accept.mockResolvedValue({ success: true });
    await user.click(within(group).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    answer.decline.mockResolvedValue({ success: false, error: 'nope' });
    await user.click(within(group).getByRole('button', { name: 'Decline' }));
    expect(answer.decline).toHaveBeenCalledWith('f9');
    await expectCode('CH-5004', /Couldn’t decline Lag putting/);
    answer.decline.mockResolvedValue({ success: true });
    await user.click(within(group).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2));
    cleanup();
    show(player({ focusAreas: [proposed] }));
    await openTab(user, /Development/);
    expect(screen.getByText('Proposed, waiting to be accepted')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Answer / })).toBeNull();
  });

  it('CH-5205 game detail that crashes is contained', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    show(player({ stats: { ...PREVIEW_PLAYER.stats!, roundsPlayed: 3, approachByDistance: null } as never, bench: null as never }));
    await openTab(user, /Game detail/);
    await expectCode('CH-5205', /Game detail couldn’t be shown/);
    quiet.mockRestore();
  });
});

describe('Stats player · empty', () => {
  it('CH-5301 no shot-by-shot rounds', async () => {
    const user = userEvent.setup();
    show(player({ stats: null }));
    await openTab(user, /Game detail/);
    await expectCode('CH-5301', /No shot-by-shot rounds in this window/);
  });

  it('CH-5302 no rounds in the window', async () => {
    const user = userEvent.setup();
    show(player({ rounds: [] }));
    await openTab(user, /Rounds/);
    await expectCode('CH-5302', /No rounds in this window/);
  });

  it('CH-5303 CH-5304 no focus areas, no goals', async () => {
    const user = userEvent.setup();
    show(player({ focusAreas: [], goals: [] }));
    await openTab(user, /Development/);
    await expectCode('CH-5303', /No focus areas yet/);
    await expectCode('CH-5304', /No goals set/);
  });

  it('CH-5305 an early read says what will move', () => {
    show(PREVIEW_PLAYER_EARLY);
    expect(code('CH-5305')!.textContent).toMatch(/Early read\. .+ Strokes gained shows once there are three/);
  });

  it('CH-5306 CH-5307 a player not on the team, for a coach and for a player', () => {
    wrap(<NotOnTeam coach />);
    expect(code('CH-5306')!.textContent).toMatch(/That player isn’t on your team/);
    expect(screen.getByRole('link', { name: 'Back to team stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    wrap(<NotOnTeam coach={false} />);
    expect(code('CH-5307')!.textContent).toMatch(/Your stats aren’t available/);
  });

  it('CH-4309 no team yet', () => {
    wrap(<StatsNoTeam coach />);
    expect(code('CH-4309')!.textContent).toMatch(/You aren't on a team yet/);
  });
});

describe('Stats player · opened from a link', () => {
  const selected = () => screen.getByRole('tab', { selected: true }).textContent;

  it('52001 the profile tabs are one stop: arrows, Home and End move and select', async () => {
    const user = userEvent.setup();
    wrap(<StatsPlayer data={player()} coachId="c1" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.tabIndex === 0)).toEqual([tabs[0]]);
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tabs[1]!.id);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    await user.keyboard('{Home}');
    expect(selected()).toBe(tabs[0]!.textContent);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
  });

  it("50102 ?tab=rounds opens the Rounds tab (Roster's All N, D-53)", () => {
    wrap(<StatsPlayer data={player()} coachId="c1" initialTab="rounds" />);
    expect(selected()).toMatch(/Rounds/);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-rounds');
  });

  it('CH-5808 a round in the table opens its review; a round the review can\'t open stays text', () => {
    const id = '5b0c6a1e-2f4d-4c8e-9a7b-1d2e3f4a5b6c';
    const [first, second] = PREVIEW_PLAYER.rounds;
    wrap(<StatsPlayer data={player({ rounds: [{ ...first!, id }, { ...second!, id: 'not-a-uuid' }] })} coachId="c1" initialTab="rounds" />);
    const link = screen.getByRole('link', { name: `${first!.course}, ${first!.date}: open the round` });
    expect(link).toHaveAttribute('href', `/golf/dashboard/rounds/${id}`);
    expect(screen.queryByRole('link', { name: `${second!.course}, ${second!.date}: open the round` })).toBeNull();
  });

  it('50102 no tab, or one that does not exist, opens Overview', () => {
    const { unmount } = wrap(<StatsPlayer data={player()} coachId="c1" initialTab="sg" />);
    expect(selected()).toMatch(/Overview/);
    unmount();
    show(player());
    expect(selected()).toMatch(/Overview/);
  });
});

describe('Stats player · haptics and accessibility', () => {
  it('CH-5701 52301 changing tabs ticks and leaves a breadcrumb; the current tab does neither', async () => {
    const user = userEvent.setup();
    show(player());
    await openTab(user, /Overview/);
    expect(hapticSpy).not.toHaveBeenCalled();
    expect(trailSpy).not.toHaveBeenCalled();
    await openTab(user, /Rounds/);
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(trailSpy).toHaveBeenCalledWith('stats tab rounds');
  });

  it('CH-5801 tabs are real tabs: selected state, controlled panel', async () => {
    const user = userEvent.setup();
    show(player());
    await openTab(user, /Rounds/);
    const tab = screen.getByRole('tab', { name: /Rounds/ });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('CH-5802 a coach reads "Stats › name" in the top bar; a player keeps the navigation trail', () => {
    show(player());
    expect(screen.getByTestId('trail').textContent).toBe(`Stats › ${PREVIEW_PLAYER.name}`);
  });

  it('CH-5803 the strokes gained route and hero figures read as text', () => {
    show(player());
    const route = screen.getAllByRole('img').find((i) => /Strokes gained per round by leg/.test(i.getAttribute('aria-label') ?? ''))!;
    expect(route.getAttribute('aria-label')).toMatch(/Off the tee .+, Approach .+, Around green .+, Putting .+/);
    const figs = document.querySelector('.ch-pf-hero__figs')!;
    for (const child of figs.children) for (const el of child.children) expect(['DT', 'DD']).toContain(el.tagName);
  });
});

describe('Stats player · phone (v2, Coach - Stats - Mobile.html)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    router.push.mockClear();
  });
  afterEach(() => {
    window.matchMedia = real;
  });
  /** The shell's phone top bar, where the page's PhoneTop renders. */
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} data-testid="phone-top" />;
  }
  const phone = (data: ChPlayerProfile, initialTab?: string, coachId: string | null = 'c1') =>
    wrap(
      <PhoneChromeProvider>
        <SlotHost />
        <StatsPlayer data={data} coachId={coachId} initialTab={initialTab} />
      </PhoneChromeProvider>,
    );
  const top = () => screen.getByTestId('phone-top');

  it('51901 the phone view replaces desktop: who, three figures, one game section at a time', async () => {
    const user = userEvent.setup();
    phone(player());
    expect(document.querySelector('.ch-st.is-desk')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Jonah Okafor' })).toBeTruthy();
    expect(document.querySelector('.ch-spm-head p')!.textContent).toBe('Sophomore · 21 rounds · 3.9 hcp');
    const figs = document.querySelector('.ch-stm-figs')!;
    expect([...figs.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Scoring avg', 'SG / round', 'Form']);
    // One section: Scoring first; a chip switches it with a tick.
    expect(screen.getByRole('heading', { level: 2, name: 'Scoring' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Approach' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Approach' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.getByRole('heading', { level: 2, name: 'Approach' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Scoring' })).toBeNull();
    expect(screen.getByText('Proximity against the Tour')).toBeTruthy();
    expect(screen.getByText('Finish when the green is hit')).toBeTruthy();
    // More detail is closed on the phone (and open on the desktop): the disclosure is a real details element.
    const more = document.querySelector('details.ch-gx-more') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    hapticSpy.mockClear();
    await user.click(screen.getByRole('button', { name: 'Approach' }));
    expect(hapticSpy).not.toHaveBeenCalled();
  });

  it('CH-5003 on the phone a player answers a proposed focus area too; a coach does not', async () => {
    const user = userEvent.setup();
    const proposed = { id: 'f9', title: 'Lag putting', baseline: 40, current: 40, target: 60, metric: 'lag', status: 'proposed' };
    answer.accept.mockResolvedValue({ success: true });
    phone(player({ viewer: 'player', focusAreas: [proposed] }), 'dev', null);
    await user.click(within(screen.getByRole('group', { name: 'Answer Lag putting' })).getByRole('button', { name: 'Accept' }));
    expect(answer.accept).toHaveBeenCalledWith('f9');
    cleanup();
    phone(player({ focusAreas: [proposed] }), 'dev');
    expect(screen.getByText('Proposed, waiting to be accepted')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Answer / })).toBeNull();
  });

  it('the phone trend: a line from two rounds; one round says what there is instead of vanishing; none leaves it out', () => {
    const [first, second] = PREVIEW_PLAYER.rounds;
    const trend = () => screen.queryByRole('heading', { level: 2, name: 'Scoring trend' });
    phone(player({ rounds: [first!, second!] }));
    expect(trend()).toBeTruthy();
    expect(screen.getByRole('img', { name: /Scores over the last 2 rounds/ })).toBeTruthy();
    cleanup();
    phone(player({ rounds: [first!] }));
    expect(trend()).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Scores over/ })).toBeNull();
    expect(screen.getByText(/One round so far/).textContent).toBe(`One round so far: ${first!.score} on ${first!.date}. The trend draws from the second.`);
    cleanup();
    phone(player({ rounds: [] }));
    expect(trend()).toBeNull();
    // Left out, not crashed into the section's error (CH-5204).
    expect(document.querySelector('[data-ch-code="CH-5204"]')).toBeNull();
  });

  it('a coach: Player stats, back to Team, Message; the window switch changes the window', async () => {
    const user = userEvent.setup();
    phone(player());
    expect(within(top()).getByRole('heading', { name: 'Player stats' })).toBeTruthy();
    await user.click(within(top()).getByRole('button', { name: 'Back to Team' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats', { scroll: false });
    expect(screen.getByRole('link', { name: 'Message Jonah' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: /Season/ }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?player=jonah&window=season', { scroll: false });
  });

  it('Share copies the player’s link; a blocked clipboard says so (CH-5002)', async () => {
    const user = userEvent.setup();
    phone(player());
    const copy = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(top()).getByRole('button', { name: "Share Jonah's stats" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(`${window.location.origin}/golf/dashboard/stats?player=jonah`));
    expect(await screen.findByText('Link copied')).toBeTruthy();
    copy.mockRejectedValueOnce(new Error('blocked'));
    await user.click(within(top()).getByRole('button', { name: "Share Jonah's stats" }));
    await expectCode('CH-5002', /Couldn.t share the link/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });

  it('a player: My stats, back to More, no Share, no Message, no Add', () => {
    phone(player({ viewer: 'player' }), undefined, null);
    expect(within(top()).getByRole('heading', { name: 'My stats' })).toBeTruthy();
    expect(within(top()).getByRole('button', { name: 'Back to More' })).toBeTruthy();
    expect(within(top()).queryByRole('button', { name: /Share/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Message/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add focus area' })).toBeNull();
  });

  it('CH-5807 rounds show five, then all; ?tab=rounds opens them all', async () => {
    const user = userEvent.setup();
    const { unmount } = phone(player());
    const rows = () => document.querySelectorAll('.ch-spm-round').length;
    expect(rows()).toBe(5);
    await user.click(screen.getByRole('button', { name: 'All 10 rounds' }));
    expect(rows()).toBe(10);
    unmount();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    phone(player(), 'rounds');
    expect(rows()).toBe(10);
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });

  it('Add focus area opens the same sheet as desktop', async () => {
    const user = userEvent.setup();
    phone(player());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    expect(await screen.findByRole('dialog', { name: 'Add a focus area for Jonah' })).toBeTruthy();
  });

  it('CH-5305 CH-5301 CH-5303 CH-5304 an early read: the note, and each empty section says so', () => {
    phone(PREVIEW_PLAYER_EARLY);
    for (const c of ['CH-5305', 'CH-5301', 'CH-5303', 'CH-5304']) expect(code(c)).not.toBeNull();
  });

  it('CH-5201 CH-5202 CH-5203 failed reads: notices, never zeros', () => {
    phone(player({ roundsError: true, statsError: true, stats: null, devError: true }));
    for (const c of ['CH-5201', 'CH-5202', 'CH-5203']) expect(code(c)).not.toBeNull();
    expect(code('CH-5301')).toBeNull();
  });

  it('C-24 CH-5213 the round cache does not load: the phone says so above the figures', () => {
    phone(player({ cacheError: true }));
    expect(code('CH-5213')!.textContent).toMatch(/fairways, greens, putts and scrambling are missing/);
  });

  it('CH-5302 no rounds in the window', () => {
    phone(player({ rounds: [] }));
    expect(code('CH-5302')).not.toBeNull();
  });
});

/* ── The route: who may open what (category 08) ── */

const OWN = '9c1d5e7a-2b3f-4a6c-8d0e-1f2a3b4c5d6e';
const OTHER = '3f8e2a4c-1b7d-4c1e-9a5b-6d2f7e8a9b01';
type RouteEl = React.ReactElement<{ data: ChPlayerProfile; coachId: string | null; initialTab?: string; coach?: boolean }>;
const asCoach = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
};
const asPlayer = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: OWN } } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: OWN });
};

describe('Stats player · who may open what', () => {
  beforeEach(() => {
    vi.mocked(getGolfSessionProfile).mockReset();
    vi.mocked(resolveClubhouseTeam).mockReset();
    vi.mocked(loadPlayerProfile).mockReset();
    vi.mocked(loadTeamStats).mockReset();
  });

  it('50803 a player gets their own profile whatever the address says: ?player= is never read, and no team figure is loaded', async () => {
    asPlayer();
    vi.mocked(loadPlayerProfile).mockResolvedValue(player({ viewer: 'player', id: OWN }));
    for (const query of [{}, { player: OTHER }, { player: 'not-an-id' }, { player: OWN, window: 'season' }]) {
      vi.mocked(loadPlayerProfile).mockClear();
      const el = (await ClubhouseStatsRoute(query)) as RouteEl;
      expect(el.type).toBe(StatsPlayer);
      // No coach id: the profile has no focus-area editor, and the server is told this is the player's own view.
      expect(el.props.coachId).toBeNull();
      expect(loadPlayerProfile).toHaveBeenCalledTimes(1);
      expect(loadPlayerProfile).toHaveBeenCalledWith({ viewer: 'player', teamId: 't1', playerId: OWN, window: 'window' in query ? 'season' : 'last10', filter: filterFor('window' in query ? 'season' : 'last10') });
    }
    expect(loadTeamStats).not.toHaveBeenCalled();
  });

  it('CH-4309 CH-5307 50803 a player with no active team sees the no-team state; one the profile cannot find on the roster sees "not available"; a signed-out request renders nothing', async () => {
    asPlayer();
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    const none = (await ClubhouseStatsRoute({ player: OTHER })) as RouteEl;
    expect(none.type).toBe(StatsNoTeam);
    expect(none.props.coach).toBe(false);
    expect(loadPlayerProfile).not.toHaveBeenCalled();
    wrap(none);
    expect(code('CH-4309')!.textContent).toMatch(/Your stats show here once a coach adds you to a team roster/);
    // The team resolved, but the roster has no row for this player when the profile is read (removed in between).
    asPlayer();
    vi.mocked(loadPlayerProfile).mockResolvedValue(null);
    const gone = (await ClubhouseStatsRoute({})) as RouteEl;
    expect(gone.type).toBe(NotOnTeam);
    expect(gone.props.coach).toBe(false);
    vi.mocked(getGolfSessionProfile).mockResolvedValue(null);
    expect(await ClubhouseStatsRoute({})).toBeNull();
  });

  it('50804 CH-5306 a coach opens ?player= against their own team only: the team comes from the session, and a player the loader cannot find, or an id that is not an id, is "not on your team"', async () => {
    asCoach();
    vi.mocked(loadPlayerProfile).mockResolvedValue(player());
    const ok = (await ClubhouseStatsRoute({ player: OTHER, window: 'qualifiers', tab: 'rounds' })) as RouteEl;
    expect(ok.type).toBe(StatsPlayer);
    expect(ok.props.coachId).toBe('c1');
    expect(ok.props.initialTab).toBe('rounds');
    expect(loadPlayerProfile).toHaveBeenCalledWith({ viewer: 'coach', teamId: 't1', playerId: OTHER, window: 'qualifiers', filter: filterFor('qualifiers') });
    // Another team's player, or a removed one: the loader answers null.
    vi.mocked(loadPlayerProfile).mockResolvedValue(null);
    const off = (await ClubhouseStatsRoute({ player: OTHER })) as RouteEl;
    expect(off.type).toBe(NotOnTeam);
    expect(off.props.coach).toBe(true);
    // Not shaped like an id: the same answer, and no read is made (the database would answer 22P02).
    vi.mocked(loadPlayerProfile).mockClear();
    for (const junk of ['not-an-id', "1' or '1'='1", '../../x']) {
      const bad = (await ClubhouseStatsRoute({ player: junk })) as RouteEl;
      expect(bad.type).toBe(NotOnTeam);
    }
    expect(loadPlayerProfile).not.toHaveBeenCalled();
    // A coach with no team gets the no-team state, whatever the address says.
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    const none = (await ClubhouseStatsRoute({ player: OTHER })) as RouteEl;
    expect(none.type).toBe(StatsNoTeam);
    expect(none.props.coach).toBe(true);
    expect(loadPlayerProfile).not.toHaveBeenCalled();
  });

  it('50102 the address picks the window: last10 unless it says season or qualifiers', async () => {
    asCoach();
    vi.mocked(loadPlayerProfile).mockResolvedValue(player());
    for (const [given, want] of [
      [undefined, 'last10'],
      ['season', 'season'],
      ['qualifiers', 'qualifiers'],
      ['everything', 'last10'],
    ] as const) {
      vi.mocked(loadPlayerProfile).mockClear();
      await ClubhouseStatsRoute({ player: OTHER, window: given });
      expect(loadPlayerProfile).toHaveBeenCalledWith(expect.objectContaining({ window: want }));
    }
  });

  it("50803 50806 a player's own profile is theirs alone: Your stats, no Message, no Add focus area, no way back to the team, no pager, no team column", () => {
    show(player({ viewer: 'player', teamAvg: null, nav: null, comparisons: PREVIEW_PLAYER.comparisons.map((c) => ({ ...c, team: null })) }), null);
    expect(screen.getByRole('heading', { level: 1, name: 'Your stats' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Message/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /focus area/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Team stats/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /player$/ })).toBeNull();
    // The crumb trail is the navigation's, not "Stats › name".
    expect(screen.getByTestId('trail').textContent).toBe('nav');
    expect(screen.getByRole('heading', { level: 3, name: 'You vs. the Tour' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Team' })).toBeNull();
  });
});

/* ── The loader on a fake Supabase ── */

const DAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
type Filters = Array<[string, unknown[]]>;
const isMembership = (f: Filters) => f.some(([k]) => k === 'in');
function profileTables(over: import('./supabase-fake').ChFakeTables = {}): import('./supabase-fake').ChFakeTables {
  return {
    golf_teams: { data: { gender: 'men' } },
    golf_players: { data: { id: OTHER, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2029, hometown: 'Charlotte', state: 'NC', handicap: 3.9, handicap_index: null } },
    golf_team_members: (f) => (isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: OTHER }, { player_id: 'p2' }] }),
    golf_rounds: { data: [{ id: 'r1', player_id: OTHER, round_date: DAY, total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, status: 'completed', round_type: 'practice' }] },
    golf_round_stats_cache: { data: [{ round_id: 'r1', greens_hit: 12, greens_total: 18, total_putts: 30, scramble_attempts: 4, scrambles_converted: 2 }] },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_player_focus_areas: { data: [] },
    golf_goals: { data: [] },
    ...over,
  };
}
const realLoader = async () => (await vi.importActual<typeof import('../data/stats-player')>('../data/stats-player')).loadPlayerProfile;
const loadAs = async (viewer: 'coach' | 'player' = 'coach', playerId = OTHER, window: 'last10' | 'season' | 'qualifiers' = 'season') =>
  (await realLoader())({ viewer, teamId: 't1', playerId, window });

describe('Stats player · the loader', () => {
  beforeEach(() => {
    tables.current = profileTables();
    detailed.mockReset();
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 1 });
    getSpray.mockReset();
    getSpray.mockResolvedValue(emptySpray());
  });

  it('50611 CH-5306 a player or membership read that fails raises the route error view; it is never shown as "not on your team"', async () => {
    tables.current = profileTables({ golf_team_members: (f) => (isMembership(f) ? { error: { message: 'boom' } } : { data: [] }) });
    await expect(loadAs()).rejects.toThrow(/player profile read failed/);
    expect(logServer).toHaveBeenCalledWith('stats', 'membership', expect.anything(), 'teams');
    logServer.mockClear();
    tables.current = profileTables({ golf_players: { error: { message: 'boom' } } });
    await expect(loadAs()).rejects.toThrow(/player profile read failed/);
    expect(logServer).toHaveBeenCalledWith('stats', 'player', expect.anything());
    // A read that worked and found nobody is the other answer: null, which the route shows as "not on your team".
    tables.current = profileTables({ golf_team_members: (f) => (isMembership(f) ? { data: null } : { data: [] }) });
    expect(await loadAs()).toBeNull();
    tables.current = profileTables({ golf_players: { data: null } });
    expect(await loadAs()).toBeNull();
  });

  it('50804 the roster check is this team, this player, active or inactive only: a pending or removed member is not on the team; an inactive one opens as Inactive', async () => {
    let seen: Filters = [];
    tables.current = profileTables({
      golf_team_members: (f) => {
        if (!isMembership(f)) return { data: [{ player_id: OTHER }] };
        seen = f;
        return { data: { status: 'inactive' } };
      },
    });
    const profile = await loadAs();
    expect(seen).toContainEqual(['eq', ['team_id', 't1']]);
    expect(seen).toContainEqual(['eq', ['player_id', OTHER]]);
    expect(seen).toContainEqual(['in', ['status', ['active', 'inactive']]]);
    expect(profile!.status).toBe('inactive');
  });

  it('50803 a player is compared with the Tour only: their own rounds are the only ones read, there is no team average or pager, and shot detail is asked for their own id', async () => {
    const roundReads: Filters[] = [];
    tables.current = profileTables({
      golf_team_members: (f) => (isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: 'someone-else' }] }),
      golf_rounds: (f) => {
        roundReads.push(f);
        return { data: [{ id: 'r1', player_id: OWN, round_date: DAY, total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, status: 'completed', round_type: 'practice' }] };
      },
    });
    const profile = await loadAs('player', OWN);
    expect(profile!.viewer).toBe('player');
    expect(profile!.teamAvg).toBeNull();
    expect(profile!.nav).toBeNull();
    expect(profile!.comparisons.every((c) => c.team == null)).toBe(true);
    expect(roundReads.flat()).toContainEqual(['in', ['player_id', [OWN]]]);
    expect(JSON.stringify(roundReads)).not.toContain('someone-else');
    // The detail is asked for exactly the window's own rounds (their ids), not a date preset.
    expect(detailed).toHaveBeenCalledWith(OWN, ['r1']);
  });

  it('50805 CH-5202 shot detail the server refuses (it answers empty for a caller who is not the player or their coach) shows as "didn\'t load", never as zeros', async () => {
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 0 });
    const denied = await loadAs();
    expect(denied!.statsError).toBe(true);
    expect(denied!.stats).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'detailedStatsEmpty', expect.any(String), 'stats_analytics');
    logServer.mockClear();
    detailed.mockRejectedValue(new Error('boom'));
    const thrown = await loadAs();
    expect(thrown!.statsError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('stats', 'detailedStats', expect.anything(), 'stats_analytics');
    // The id the server is asked about is the profile's, and the window travels as its round ids.
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 1 });
    await loadAs('coach', OTHER, 'last10');
    expect(detailed).toHaveBeenLastCalledWith(OTHER, ['r1']);
    // A window with no rounds asks for nothing: no detail, and no "didn't load" for a read that was never made.
    detailed.mockClear();
    const none = await loadAs('coach', OTHER, 'qualifiers');
    expect(detailed).not.toHaveBeenCalled();
    expect(none!.stats).toBeNull();
    expect(none!.statsError).toBe(false);
  });

  // Swap audit C-24(f): a round-cache read that failed left fairways, greens, putts and scrambling as dashes, read as no data.
  it('C-24 CH-5213 the round cache does not load: the profile says so above the figures', async () => {
    tables.current = profileTables({ golf_round_stats_cache: { error: { message: 'boom' } } });
    const profile = (await loadAs())!;
    expect(profile.cacheError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('stats', 'roundCache', expect.anything());
    show(player({ cacheError: true }));
    await expectCode('CH-5213', /Some round figures didn't load/);
    cleanup();
    tables.current = profileTables();
    expect((await loadAs())!.cacheError).toBe(false);
  });

  // Swap audit C-14: a timed-out shot read comes back as getDetailedStats' round-level fallback, which counts the rounds but
  // scores no hole. Game detail showed its zero birdies, pars and scrambling as the player's figures.
  it('C-14 the detail’s round-level fallback (rounds counted, no hole scored) shows as "didn\'t load", never as zeros', async () => {
    const fallback = calculateStatsFromShots([], [], []);
    detailed.mockResolvedValue({ ...fallback, roundsPlayed: 1, holesPlayed: 18, scoringAverage: 72 });
    const profile = await loadAs();
    expect(profile!.statsError).toBe(true);
    expect(profile!.stats).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'detailedStatsFallback', expect.any(String), 'stats_analytics');
    // A real answer scores its holes, and stands.
    const { isRoundLevelFallback } = await vi.importActual<typeof import('../data/stats-player')>('../data/stats-player');
    expect(isRoundLevelFallback({ ...fallback, roundsPlayed: 1, totalPars: 14, totalBogeys: 4 }, 1)).toBe(false);
    expect(isRoundLevelFallback({ ...fallback, roundsPlayed: 1 }, 0)).toBe(false);
  });

  it('every shot-level figure counts the window’s own 18-hole rounds: the same ids go to the detail, the putts, the holes, the approaches and where shots finish; nine-hole rounds and other windows stay out', async () => {
    const at = (id: string, day: number, type: string, holes = 18) => ({ id, player_id: OTHER, round_date: `2026-09-${String(day).padStart(2, '0')}`, total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: holes, status: 'completed', round_type: type });
    const rounds = [...Array.from({ length: 12 }, (_, i) => at(`r${i + 1}`, 28 - i, i === 2 || i === 5 ? 'qualifier' : 'practice')), at('nine', 29, 'practice', 9)];
    const idsIn = (f: Filters) => f.find(([k, a]) => k === 'in' && a[0] === 'round_id')?.[1][1] as string[] | undefined;
    const reads: Record<string, string[]> = {};
    const seen = (table: string) => (f: Filters) => {
      const ids = idsIn(f);
      if (ids) reads[table] = ids;
      return { data: [] };
    };
    const spray = getSpray;
    tables.current = profileTables({ golf_rounds: { data: rounds }, golf_holes: seen('holes'), golf_shots: seen('shots') });
    detailed.mockResolvedValue({ ...PREVIEW_PLAYER.stats!, roundsPlayed: 10 });
    const last10 = (await loadAs('coach', OTHER, 'last10'))!;
    const newest10 = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'];
    expect(last10.rounds.map((r) => r.id)).toEqual(newest10);
    expect(detailed).toHaveBeenLastCalledWith(OTHER, newest10);
    expect(spray).toHaveBeenLastCalledWith(OTHER, newest10);
    expect(reads.holes).toEqual(newest10);
    expect(reads.shots).toEqual(newest10);
    // Qualifiers: only the qualifier rounds, and only theirs.
    const quals = (await loadAs('coach', OTHER, 'qualifiers'))!;
    expect(quals.rounds.map((r) => r.id)).toEqual(['r3', 'r6']);
    expect(detailed).toHaveBeenLastCalledWith(OTHER, ['r3', 'r6']);
    expect(spray).toHaveBeenLastCalledWith(OTHER, ['r3', 'r6']);
    expect(reads.holes).toEqual(['r3', 'r6']);
    expect(JSON.stringify(detailed.mock.calls)).not.toContain('nine');
  });

  it("CH-5208 the Tour column: read from the team's tour; without the benchmarks, or without the team's own row, nothing is compared with a benchmark it does not have", async () => {
    const ok = await loadAs('player', OTHER);
    expect(ok!.bench).toEqual({ gir_pct: 67 });
    expect(ok!.comparisons.find((c) => c.label === 'Greens in regulation')!.bench).toBe(67);
    // The benchmark read fails: logged, empty, and the profile shows no Tour column at all.
    tables.current = profileTables({ golf_pga_standards: { error: { message: 'boom' } } });
    const noBench = await loadAs('player', OTHER);
    expect(logServer).toHaveBeenCalledWith('stats', 'tourBenchmarks', expect.anything());
    expect(noBench!.bench).toEqual({});
    expect(noBench!.comparisons.every((c) => c.bench == null)).toBe(true);
    wrap(<StatsPlayer data={noBench!} coachId={null} />);
    expect(screen.queryByRole('columnheader', { name: 'Tour' })).toBeNull();
    // The team's own row fails: its tour is unknown, so the benchmarks are not even read (a women's team is never graded against the men's).
    const bench = vi.fn(() => ({ data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] }));
    tables.current = profileTables({ golf_teams: { error: { message: 'boom' } }, golf_pga_standards: bench });
    const unknown = await loadAs('player', OTHER);
    expect(logServer).toHaveBeenCalledWith('stats', 'team', expect.anything(), 'teams');
    expect(bench).not.toHaveBeenCalled();
    expect(unknown!.bench).toEqual({});
  });

  it('50103 a coach pages through the team by scoring average, and past the last player comes the first', async () => {
    const round = (id: string, player_id: string, score: number) => ({ id, player_id, round_date: DAY, total_score: score, score_to_par: score - 72, front_nine: 37, back_nine: score - 37, holes_played: 18, status: 'completed', round_type: 'practice' });
    tables.current = profileTables({
      golf_team_members: (f) => (isMembership(f) ? { data: { status: 'active' } } : { data: [{ player_id: 'a' }, { player_id: 'b' }, { player_id: 'c' }] }),
      golf_rounds: { data: [round('r1', 'a', 70), round('r2', 'b', 72), round('r3', 'c', 74)] },
    });
    const first = await loadAs('coach', 'a');
    expect(first!.nav).toEqual({ index: 1, total: 3, prev: 'c', next: 'b' });
    const last = await loadAs('coach', 'c');
    expect(last!.nav).toEqual({ index: 3, total: 3, prev: 'b', next: 'a' });
    // The links carry the player and keep the window.
    wrap(<StatsPlayer data={player({ nav: first!.nav, window: 'season' })} coachId="c1" />);
    expect(screen.getByRole('link', { name: 'Next player' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=b&window=season');
    expect(screen.getByRole('link', { name: 'Previous player' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=c&window=season');
    expect(screen.getByRole('link', { name: 'Team stats' }).getAttribute('href')).toBe('/golf/dashboard/stats?window=season');
  });

  it('52101 the loader reads each source once: the team, the player and the membership together, then rounds, shot detail, benchmarks, focus areas and goals together, and the round figures once', async () => {
    const reads: Record<string, number> = {};
    const count = (table: string, answer: import('./supabase-fake').ChFakeTables[string]) => (f: Filters) => {
      reads[table] = (reads[table] ?? 0) + 1;
      return typeof answer === 'function' ? answer(f) : answer;
    };
    tables.current = Object.fromEntries(Object.entries({ ...profileTables(), golf_holes: { data: [] }, golf_shots: { data: [] } }).map(([table, answer]) => [table, count(table, answer)]));
    await loadAs('coach', OTHER, 'last10');
    expect(reads).toEqual({
      golf_teams: 1,
      golf_players: 1,
      golf_team_members: 2,
      golf_rounds: 1,
      golf_round_stats_cache: 1,
      golf_pga_standards: 1,
      golf_player_focus_areas: 1,
      golf_goals: 1,
      // The window's own rounds: every hole once, and the shots twice (the putts, and the approaches).
      golf_holes: 1,
      golf_shots: 2,
    });
    expect(detailed).toHaveBeenCalledTimes(1);
    expect(getSpray).toHaveBeenCalledTimes(1);
    // A failed rounds read is flagged, never thrown, and the rest of the page loads.
    tables.current = profileTables({ golf_rounds: { error: { message: 'boom' } } });
    const partial = await loadAs();
    expect(partial!.roundsError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('stats', 'rounds', expect.anything());
  });

  it('52301 CH-5203 focus areas and goals that fail to read are logged and flagged, never thrown', async () => {
    tables.current = profileTables({ golf_player_focus_areas: { error: { message: 'boom' } }, golf_goals: { error: { message: 'boom' } } });
    const profile = await loadAs();
    expect(profile!.devError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('stats', 'focusAreas', expect.anything(), 'development');
    expect(logServer).toHaveBeenCalledWith('stats', 'goals', expect.anything(), 'development');
  });
});

/* ── The page ── */

describe('Stats player · the page', () => {
  it('50101 a coach opens a profile: who, four figures, the four sections, the overview first, compared with the team', () => {
    show(player());
    expect(screen.getByRole('heading', { level: 1, name: 'Jonah Okafor' })).toBeTruthy();
    expect([...document.querySelectorAll('.ch-pf-hero__figs dt')].map((d) => d.textContent)).toEqual(['Scoring avg', 'Handicap', 'SG / round', 'Rounds']);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview', 'Game detail', 'Rounds10', 'Development']);
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Overview');
    expect(screen.getByRole('heading', { level: 3, name: 'Jonah vs. team' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Team stats' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add focus area' })).toBeTruthy();
    expect(screen.getByTestId('trail').textContent).toBe('Stats › Jonah Okafor');
  });

  it("50104 a coach's Message opens the direct thread with this player, on desktop and on the phone; a player's profile has none", () => {
    const { unmount } = show(player());
    expect(screen.getByRole('link', { name: 'Message' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=jonah');
    unmount();
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      const phoneView = wrap(
        <PhoneChromeProvider>
          <StatsPlayer data={player()} coachId="c1" />
        </PhoneChromeProvider>,
      );
      expect(screen.getByRole('link', { name: 'Message Jonah' }).getAttribute('href')).toBe('/golf/dashboard/messages?player=jonah');
      phoneView.unmount();
      wrap(
        <PhoneChromeProvider>
          <StatsPlayer data={player({ viewer: 'player' })} coachId={null} />
        </PhoneChromeProvider>,
      );
      expect(screen.queryByRole('link', { name: /Message/ })).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });

  it("a coach's Schedule 1:1 opens Calendar's editor with only this player invited (D-52); a player's profile has none", () => {
    const { unmount } = show(player());
    expect(screen.getByRole('link', { name: 'Schedule 1:1' }).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1&with=jonah');
    unmount();
    show(player({ viewer: 'player' }));
    expect(screen.queryByRole('link', { name: 'Schedule 1:1' })).toBeNull();
  });

  it('51202 the tab stays when the window changes or the coach pages to another player', async () => {
    const user = userEvent.setup();
    const view = show(player());
    await openTab(user, /Rounds/);
    view.rerender(shell(<StatsPlayer data={player({ window: 'season' })} coachId="c1" />));
    expect(screen.getByRole('tab', { selected: true }).textContent).toMatch(/Rounds/);
    view.rerender(shell(<StatsPlayer data={player({ window: 'season', id: 'ava', name: 'Ava Lindqvist', firstName: 'Ava' })} coachId="c1" />));
    expect(screen.getByRole('heading', { level: 1, name: 'Ava Lindqvist' })).toBeTruthy();
    expect(screen.getByRole('tab', { selected: true }).textContent).toMatch(/Rounds/);
  });

  it('50901 51501 a proposal lands: a proposal for this player from this coach is sent, the toast and the success tick say so, the sheet closes and empties, and the page is read again', async () => {
    const user = userEvent.setup();
    createFocusArea.mockResolvedValue({ success: true });
    show(player());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    await user.type(screen.getByRole('textbox', { name: 'What to work on' }), '  Lag putting  ');
    await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
    expect(await screen.findByText('Focus area proposed to Jonah. It starts when Jonah accepts.')).toBeTruthy();
    expect(createFocusArea).toHaveBeenCalledWith(
      expect.objectContaining({ player_id: 'jonah', coach_id: 'c1', title: 'Lag putting', status: 'proposed', area_type: 'approach', description: null, target_value: null }),
    );
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(router.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a focus area for Jonah' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    expect((screen.getByRole('textbox', { name: 'What to work on' }) as HTMLInputElement).value).toBe('');
  });

  it('52001 the window switch moves with the arrow keys and Enter in the focus-area field proposes it', async () => {
    const user = userEvent.setup();
    createFocusArea.mockResolvedValue({ success: true });
    show(player());
    screen.getByRole('radio', { name: 'Last 10' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?player=jonah&window=season', { scroll: false });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Season' }));
    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    await user.type(screen.getByRole('textbox', { name: 'What to work on' }), 'Lag putting{Enter}');
    await waitFor(() => expect(createFocusArea).toHaveBeenCalledTimes(1));
  });

  it('CH-5403 /stats loads in the profile\'s shape for a player or a coach with ?player=, and the team page\'s for a coach without', () => {
    const at = (role: 'coach' | 'player', query: string) => {
      cleanup();
      search.current = new URLSearchParams(query);
      render(
        <ClubhouseMarker role={role}>
          <StatsLoading />
        </ClubhouseMarker>,
      );
      return [code('CH-5403') != null, code('CH-4401') != null];
    };
    expect(at('player', '')).toEqual([true, false]);
    expect(at('coach', 'player=p1')).toEqual([true, false]);
    expect(at('coach', '')).toEqual([false, true]);
    expect(code('CH-4401')!.getAttribute('aria-busy')).toBe('true');
    expect(at('player', 'window=last10')).toEqual([true, false]);
    expect(code('CH-5403')!.getAttribute('aria-busy')).toBe('true');
    search.current = new URLSearchParams();
  });

  it('52001 the section tabs are one Tab stop; a click, Enter or Space on a tab still chooses it', async () => {
    const user = userEvent.setup();
    show(player());
    const rounds = screen.getByRole('tab', { name: /Rounds/ });
    rounds.focus();
    await user.keyboard('{Enter}');
    expect(rounds.getAttribute('aria-selected')).toBe('true');
    const dev = screen.getByRole('tab', { name: /Development/ });
    dev.focus();
    await user.keyboard(' ');
    expect(dev.getAttribute('aria-selected')).toBe('true');
    // A roving group: only the chosen tab is in the Tab order (the arrows are the test above).
    expect(screen.getAllByRole('tab').filter((t) => t.tabIndex === 0)).toEqual([dev]);
  });
});

describe('Stats player · network', () => {
  it('CH-5901 changing the window offline requests nothing and says so', async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    show(player());
    await user.click(screen.getByRole('radio', { name: 'Season' }));
    await expectCode('CH-5901', /Couldn't open the season: you're offline/);
    expect(code('CH-5901')!.textContent).toMatch(/still the last 10 rounds/);
    expect(router.push).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(screen.getByRole('radio', { name: 'Last 10' }).getAttribute('aria-checked')).toBe('true');
    online.mockRestore();
  });

  it('CH-5902 a slow window change says so once; a quick one says nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const view = show(player());
      await user.click(screen.getByRole('radio', { name: 'Season' }));
      expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?player=jonah&window=season', { scroll: false });
      expect(trailSpy).toHaveBeenCalledWith('stats window season');
      // The server answers inside five seconds: no notice.
      view.rerender(shell(<StatsPlayer data={player({ window: 'season' })} coachId="c1" />));
      vi.advanceTimersByTime(6000);
      expect(code('CH-5902')).toBeNull();
      // It doesn't: the notice names both windows.
      await user.click(screen.getByRole('radio', { name: 'Qualifiers' }));
      vi.advanceTimersByTime(4900);
      expect(code('CH-5902')).toBeNull();
      vi.advanceTimersByTime(200);
      await expectCode('CH-5902', /Still loading qualifier rounds…/);
      expect(code('CH-5902')!.textContent).toMatch(/still the season/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('CH-5402 while the new window loads the page is marked busy, and it stays the last 10 rounds until the server answers', async () => {
    const user = userEvent.setup();
    router.push.mockImplementation(() => new Promise(() => {}));
    try {
      show(player());
      expect(document.querySelector('.ch-st')!.getAttribute('aria-busy')).toBe('false');
      await user.click(screen.getByRole('radio', { name: 'Season' }));
      await waitFor(() => expect(document.querySelector('.ch-st')!.getAttribute('aria-busy')).toBe('true'));
      expect(code('CH-5402')).not.toBeNull();
      expect(screen.getByRole('radio', { name: 'Last 10' }).getAttribute('aria-checked')).toBe('true');
    } finally {
      router.push.mockReset();
    }
  });

  it("CH-1903 a focus area proposed offline is refused before it is sent, and the shell's toast names what did not happen", async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      show(player());
      await user.click(screen.getByRole('button', { name: 'Add focus area' }));
      await user.type(screen.getByRole('textbox', { name: 'What to work on' }), 'Lag putting');
      await user.click(screen.getByRole('button', { name: 'Propose focus area' }));
      await expectCode('CH-1903', /Couldn't add the focus area for Jonah: you're offline/);
      expect(createFocusArea).not.toHaveBeenCalled();
      // The sheet stays open with the text, so the coach can send it once back online.
      expect((screen.getByRole('textbox', { name: 'What to work on' }) as HTMLInputElement).value).toBe('Lag putting');
    } finally {
      online.mockRestore();
    }
  });

  it('CH-5901 on the phone the window switch is refused offline the same way', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      const user = userEvent.setup();
      wrap(
        <PhoneChromeProvider>
          <StatsPlayer data={player()} coachId="c1" />
        </PhoneChromeProvider>,
      );
      await user.click(screen.getByRole('radio', { name: /Season/ }));
      await expectCode('CH-5901', /you're offline/);
      expect(router.push).not.toHaveBeenCalled();
    } finally {
      online.mockRestore();
      window.matchMedia = real;
    }
  });
});

describe('Stats player · tests', () => {
  it('52401 this file names every Stats player catalog code it forces, in a test title', () => {
    const self = fileURLToPath(import.meta.url);
    const read = (path: string) => readFileSync(resolve(dirname(self), path), 'utf8');
    const titles = (src: string) =>
      src
        .split('\n')
        .filter((line) => /^\s*(it|describe)\(/.test(line))
        .join('\n');
    const mine = titles(read('./stats-player.test.tsx'));
    // A row's test cell may name another code ("stats-player.test › CH-5101"): that code is the one the title carries.
    const forced = (catalog: string, code: RegExp, file: string) =>
      catalog
        .split('\n')
        .filter((line) => code.test(line) && !/retired/i.test(line) && line.includes(file))
        .map((line) => /›\s*(CH-\d{4})/.exec(line)?.[1] ?? /^\| (CH-\d{4}) \|/.exec(line)![1]!);
    // Rows whose test is in this file: the profile's own block, and the no-team row that Team stats catalogues.
    const codes = [
      ...forced(read('../../../docs/clubhouse/catalog/stats-player.md'), /^\| CH-5\d{3} \|/, 'stats-player.test'),
      ...forced(read('../../../docs/clubhouse/catalog/stats-team.md'), /^\| CH-4\d{3} \|/, 'stats-player.test'),
    ];
    // A floor, so an unreadable catalog can't pass by finding nothing.
    expect(codes.length).toBeGreaterThanOrEqual(24);
    expect(codes.filter((c) => !mine.includes(c))).toEqual([]);
    // The hand contracts: each one this file claims is named in a test title.
    const ids = ['50101', '50102', '50103', '50104', '50611', '50803', '50804', '50805', '50806', '50901', '51201', '51202', '51401', '51501', '51901', '52001', '52101', '52301', '52401'];
    expect(ids.filter((id) => !mine.includes(id))).toEqual([]);
  });
});
