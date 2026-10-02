import './dialog-polyfill';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Stats (team): every numbered state in docs/clubhouse/catalog/stats-team.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const reportSpy = vi.hoisted(() => vi.fn());
const trailSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: reportSpy, chTrail: trailSpy, chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
// The route tests below run the real team loader on the fake; the profile side and the session are mocked.
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
vi.mock('../data/stats-player', () => ({ loadPlayerProfile: vi.fn() }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadTeamStats, type ChTeamStats } from '../data/stats-team';
import { markAppRunning, RouteScope } from '../lib/session-state';
import { loadPlayerProfile } from '../data/stats-player';
import { resolveClubhouseTeam } from '../routes/team';
import { ClubhouseStatsRoute, StatsNoTeam } from '../routes/stats';
import { StatsPlayer } from '../screens/stats/StatsPlayer';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { sgBaseline } from '../lib/sg';
import { isRebuilt } from '../shell/nav';
import { StatsSkeleton } from '../screens/stats/StatsSkeleton';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_PLAYER, PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';
import { filterFor } from '../data/stats-filter';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
function tree(data: ChTeamStats) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <StatsTeam data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
}
const wrap = (data: ChTeamStats) => render(tree(data));
// A test that chooses a window chooses it for the filter too (the screens read the filter, whose window is the window).
const stats = (over: Partial<ChTeamStats> = {}): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, ...(over.window ? { filter: filterFor(over.window) } : {}), ...over });
// A team with no round at all: nothing loaded for the filter's sheet either (a loaded 9-hole round would be CH-4301 with the CH-4319 hint, not the first run).
const empty = (over: Partial<ChTeamStats> = {}) => stats({ roundCount: 0, grid: [], players: [], putting: null, bests: [], filterOptions: { ...PREVIEW_TEAM_STATS.filterOptions, rounds: [], total: 0, courses: [] }, ...over });

/** One active player with one countable round from yesterday, so every read downstream runs. */
function seasonTables(): import('./supabase-fake').ChFakeTables {
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } }] },
    golf_rounds: { data: [{ id: 'r1', player_id: 'p1', round_date: day, total_score: 72, score_to_par: 0, front_nine: 36, back_nine: 36, holes_played: 18, status: 'completed', round_type: 'practice' }] },
    golf_round_stats_cache: { data: [{ round_id: 'r1', greens_hit: 12, greens_total: 18, total_putts: 30, scramble_attempts: 6, scrambles_converted: 3, birdies: 2, eagles: 0 }] },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 67 }] },
    golf_shots: { data: [] },
  };
}
const load = () => loadTeamStats({ teamId: 't1', window: 'season' });

beforeEach(() => {
  hapticSpy.mockClear();
  reportSpy.mockClear();
  logServer.mockClear();
  trailSpy.mockClear();
  router.refresh.mockClear();
  router.push.mockClear();
  tables.current = seasonTables();
});

describe('Stats team · saves that fail', () => {
  it('CH-4001 CH-4702 42301 the export is blocked by the browser: a specific toast, the error tick, and a low-severity report', async () => {
    const user = userEvent.setup();
    const url = URL as unknown as { createObjectURL?: unknown };
    const prev = url.createObjectURL;
    url.createObjectURL = () => {
      throw new Error('blocked');
    };
    wrap(stats());
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await expectCode('CH-4001', /Couldn't export team stats/);
    expect(reportSpy).toHaveBeenCalledWith(expect.any(Error), { surface: 'stats.team.export', severity: 'low' });
    expect(hapticSpy).toHaveBeenCalledWith('error');
    url.createObjectURL = prev;
  });
});

describe('Stats team · reads that fail', () => {
  it('CH-4201 41401 42301 rounds do not load: every figure is hidden, never shown incomplete, and Try again asks the server for the whole page again', async () => {
    tables.current = { ...seasonTables(), golf_rounds: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.roundsError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('stats', 'rounds', expect.anything());
    wrap(data);
    await expectCode('CH-4201', /Team rounds didn't load/);
    expect(screen.queryByText('Scoring average')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(code('CH-4301')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-4201 the roster does not load: the same notice, never an empty team', async () => {
    tables.current = { ...seasonTables(), golf_team_members: { error: { message: 'boom' } } };
    const data = await load();
    expect(logServer).toHaveBeenCalledWith('stats', 'members', expect.anything(), 'teams');
    expect(data.roundsError).toBe(true);
    wrap(data);
    await expectCode('CH-4201', /Team rounds didn't load/);
    expect(code('CH-4301')).toBeNull();
    // A roster that did not load is not "0 active players".
    expect(document.querySelector('.ch-st-head p')!.textContent).toBe('Varsity · countable rounds only');
    expect(document.querySelector('.ch-st-head')!.textContent).not.toMatch(/\b0 active/);
  });

  it('CH-4211 the season’s longest putt does not load: Season bests says so beside the other bests, never "No season bests yet" and never a quiet gap', async () => {
    const isLongest = (f: Array<[string, unknown[]]>) => f.some(([k]) => k === 'limit');
    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    tables.current = {
      ...seasonTables(),
      golf_rounds: { data: [{ id: 'r1', player_id: 'p1', round_date: day, total_score: 72, score_to_par: 0, front_nine: 36, back_nine: 36, holes_played: 18, status: 'completed', round_type: 'practice' }] },
      golf_shots: (f) => (isLongest(f) ? { error: { message: 'boom' } } : { data: [{ round_id: 'r1', putt_distance_feet: 8, putt_made: true }] }),
    };
    const data = await load();
    expect(data.longestError).toBe(true);
    expect(data.roundsError).toBe(false);
    wrap(data);
    await expectCode('CH-4211', /The longest putt didn't load/);
    expect(code('CH-4307')).toBeNull();
    expect(screen.getByText('Low round')).toBeTruthy();
    await userEvent.setup().click(within(code('CH-4211') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
    // When it loads there is no notice.
    cleanup();
    tables.current = seasonTables();
    wrap(await load());
    expect(code('CH-4211')).toBeNull();
  });

  it('CH-4202 round figures do not load: scoring stays, the rest say so', async () => {
    tables.current = { ...seasonTables(), golf_round_stats_cache: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.cacheError).toBe(true);
    expect(data.figures.find((f) => f.label === 'Scoring average')!.value).toBe(72);
    expect(data.figures.find((f) => f.label === 'Greens in regulation')!.value).toBeNull();
    expect(logServer).toHaveBeenCalledWith('stats', 'roundCache', expect.anything());
    wrap(data);
    await expectCode('CH-4202', /Some team figures didn't load/);
  });

  it('CH-4203 putting does not load', async () => {
    tables.current = { ...seasonTables(), golf_shots: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.puttsError).toBe(true);
    expect(logServer).toHaveBeenCalledWith('stats', 'putts', expect.anything(), 'stats_analytics');
    wrap(data);
    await expectCode('CH-4203', /Team putting didn't load/);
  });

  it('CH-4204 CH-4205 CH-4206 CH-4207 CH-4208 42301 a section that crashes stays inside its section, and is reported high with its section', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    wrap(stats({ figures: null as never, players: null as never, legWeeks: null as never, putting: { putts: 1, bands: null as never }, bests: null as never }));
    for (const [c, label] of [
      ['CH-4204', 'Team figures'],
      ['CH-4205', 'The trend chart'],
      ['CH-4206', 'Strokes gained by leg'],
      ['CH-4207', 'Team putting'],
      ['CH-4208', 'Season bests'],
    ] as const)
      expect(code(c)!.textContent).toMatch(new RegExp(`${label} couldn’t be shown`));
    for (const surface of ['stats.team.figures', 'stats.team.trend', 'stats.team.legs', 'stats.team.putting', 'stats.team.bests'])
      expect(reportSpy).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface, severity: 'high' }));
    expect(screen.getByRole('heading', { name: 'Team stats' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('CH-4204 CH-4205 CH-4206 CH-4207 CH-4208 a section that crashes on the server render leaves the page standing', async () => {
    const { renderToString } = await import('react-dom/server');
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Without the Suspense inside SectionBoundary, this throws and the whole page fails.
    const html = renderToString(tree(stats({ figures: null as never, players: null as never, legWeeks: null as never, putting: { putts: 1, bands: null as never }, bests: null as never })));
    expect(html).toContain('Team stats');
    expect(html).toContain('Export');
    quiet.mockRestore();
  });

  it('CH-4204 the shared SectionBoundary: a child that throws on the server render is left out, and the page renders', async () => {
    const { renderToString } = await import('react-dom/server');
    const { SectionBoundary } = await import('../ui/SectionBoundary');
    const Throws = () => {
      throw new Error('boom');
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(
      <main>
        <SectionBoundary surface="stats.team.figures" label="Team figures" code="CH-4204">
          <Throws />
          <p>inside the section</p>
        </SectionBoundary>
        <p>the rest of the page</p>
      </main>,
    );
    expect(html).toContain('the rest of the page');
    expect(html).not.toContain('inside the section');
    quiet.mockRestore();
  });

  it('CH-4209 Tour benchmarks do not load: greens read against the sample, not a made-up benchmark', async () => {
    const ok = await load();
    expect(ok.figures.find((f) => f.label === 'Greens in regulation')!.context).toBe('Tour averages 67%');
    tables.current = { ...seasonTables(), golf_pga_standards: { error: { message: 'boom' } } };
    const data = await load();
    expect(logServer).toHaveBeenCalledWith('stats', 'tourBenchmarks', expect.anything());
    expect(data.figures.find((f) => f.label === 'Greens in regulation')!.context).not.toMatch(/Tour/);
  });

  it("CH-4210 the team's own row does not load: no benchmark or baseline of a guessed tour", async () => {
    tables.current = { ...seasonTables(), golf_teams: { error: { message: 'boom' } } };
    const data = await load();
    expect(logServer).toHaveBeenCalledWith('stats', 'team', expect.anything(), 'teams');
    expect(data.teamName).toBe('Your team');
    expect(data.tour).toBeNull();
    expect(sgBaseline(data.tour).noun).toBe('the baseline');
    expect(data.figures.find((f) => f.label === 'Greens in regulation')!.context).not.toMatch(/Tour/);
    expect(data.roundCount).toBe(1);
  });
});

describe('Stats team · empty', () => {
  it('CH-4301 no rounds in the window: offers the season', async () => {
    const user = userEvent.setup();
    wrap(empty({ window: 'last10' }));
    await expectCode('CH-4301', /No 18-hole rounds in this window yet/);
    await user.click(screen.getByRole('button', { name: 'Show the season' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?window=season', { scroll: false });
  });

  it('CH-4310 no round all season: the page is the first-run empty, with the roster as the next step', () => {
    wrap(empty({ window: 'season' }));
    expect(code('CH-4310')!.textContent).toMatch(/No stats yet/);
    expect(code('CH-4301')).toBeNull();
    expect(screen.getByRole('link', { name: /View roster/ })).toHaveAttribute('href', '/golf/dashboard/roster');
  });

  it('CH-4302 no qualifier rounds', () => {
    wrap(empty({ window: 'qualifiers' }));
    expect(code('CH-4302')!.textContent).toMatch(/No qualifier rounds this season yet/);
  });

  it('CH-4303 CH-4304 the trend has nothing to draw in either lens', async () => {
    const user = userEvent.setup();
    const blank = <T,>(xs: T[]) => xs.map(() => null);
    wrap(stats({ players: PREVIEW_TEAM_STATS.players.map((p) => ({ ...p, sg: blank(p.sg), score: blank(p.score), sgMean: null, scoreMean: null })), team: { sg: blank(PREVIEW_TEAM_STATS.team.sg), score: blank(PREVIEW_TEAM_STATS.team.score), sgMean: null, scoreMean: null } }));
    await expectCode('CH-4303', /No strokes gained in this window/);
    await user.click(screen.getByRole('radio', { name: 'Scoring' }));
    await expectCode('CH-4304', /No scores in this window/);
  });

  it('CH-4305 no player rounds for the grid', () => {
    wrap(stats({ grid: [] }));
    expect(code('CH-4305')!.textContent).toMatch(/No player rounds in this window/);
  });

  it('CH-4306 no putts logged', () => {
    wrap(stats({ putting: null }));
    expect(code('CH-4306')!.textContent).toMatch(/No putts logged in this window/);
  });

  it('CH-4307 no season bests yet', () => {
    wrap(stats({ bests: [] }));
    expect(code('CH-4307')!.textContent).toMatch(/No season bests yet/);
  });

  it('CH-4308 a player without enough rounds is an early read, not a zero', () => {
    wrap(stats());
    expect(code('CH-4308')!.textContent).toBe('Early read');
  });
});

describe('Stats team · network', () => {
  it('CH-4901 changing the window offline requests nothing and says so', async () => {
    const user = userEvent.setup();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    wrap(stats({ window: 'last10' }));
    await user.click(screen.getByRole('radio', { name: 'Season' }));
    await expectCode('CH-4901', /Couldn't open the season: you're offline/);
    expect(code('CH-4901')!.textContent).toMatch(/still the last 10 rounds/);
    expect(router.push).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(screen.getByRole('radio', { name: 'Last 10' }).getAttribute('aria-checked')).toBe('true');
    online.mockRestore();
  });

  it('CH-4902 a slow window change says so once; a quick one says nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const view = wrap(stats({ window: 'last10' }));
      await user.click(screen.getByRole('radio', { name: 'Season' }));
      expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?window=season', { scroll: false });
      // The server answers inside five seconds: no notice.
      view.rerender(tree(stats({ window: 'season' })));
      vi.advanceTimersByTime(6000);
      expect(code('CH-4902')).toBeNull();
      // It doesn't: the notice names both windows.
      await user.click(screen.getByRole('radio', { name: 'Qualifiers' }));
      vi.advanceTimersByTime(4900);
      expect(code('CH-4902')).toBeNull();
      vi.advanceTimersByTime(200);
      await expectCode('CH-4902', /Still loading qualifier rounds…/);
      expect(code('CH-4902')!.textContent).toMatch(/still the season/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Stats team · a change in flight, and the last choice wins', () => {
  const checked = () =>
    within(screen.getByRole('radiogroup', { name: 'Window' }))
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-checked') === 'true')
      .map((r) => r.textContent);
  afterEach(() => router.push.mockReset());

  it('CH-4903 4403 while a window loads, the switch is on the new choice and a note names the figures still shown (the last 10 rounds), never the new period', async () => {
    const user = userEvent.setup();
    router.push.mockImplementation(() => new Promise(() => {}));
    wrap(stats({ window: 'last10' }));
    expect(code('CH-4903')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Season' }));
    await expectCode('CH-4903', /^Showing the last 10 rounds, loading the season$/);
    expect(code('CH-4903')!.getAttribute('role')).toBe('status');
    expect(checked()).toEqual(['Season']);
    // The note is outside the dimmed page, so it is not dimmed with it.
    expect(document.querySelector('.ch-st')!.contains(code('CH-4903'))).toBe(false);
    expect(screen.getByText('Scoring average')).toBeTruthy();
  });

  it('CH-4903 CH-4902 a quick Season, Qualifiers, Season ends where it started: the switch, the note and the slow notice follow the last tap (the last choice wins)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      router.push.mockImplementation(() => new Promise(() => {}));
      wrap(stats({ window: 'season' }));
      await user.click(screen.getByRole('radio', { name: 'Qualifiers' }));
      await user.click(screen.getByRole('radio', { name: 'Last 10' }));
      // Two choices in flight: the last one is what the note and the switch say.
      expect(code('CH-4903')!.textContent).toBe('Showing the season, loading the last 10 rounds');
      expect(checked()).toEqual(['Last 10']);
      await user.click(screen.getByRole('radio', { name: 'Season' }));
      expect(router.push.mock.calls.map((c) => c[0])).toEqual(['/golf/dashboard/stats?window=qualifiers', '/golf/dashboard/stats', '/golf/dashboard/stats?window=season']);
      // Back on what is on screen: nothing left to wait for.
      expect(code('CH-4903')).toBeNull();
      expect(checked()).toEqual(['Season']);
      vi.advanceTimersByTime(7000);
      expect(code('CH-4902')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CH-4902 two choices in flight: the slow notice names the last one only', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      router.push.mockImplementation(() => new Promise(() => {}));
      wrap(stats({ window: 'season' }));
      await user.click(screen.getByRole('radio', { name: 'Qualifiers' }));
      vi.advanceTimersByTime(3000);
      await user.click(screen.getByRole('radio', { name: 'Last 10' }));
      // The first choice's five seconds would end here; it was replaced, so nothing is said about it.
      vi.advanceTimersByTime(2500);
      expect(code('CH-4902')).toBeNull();
      vi.advanceTimersByTime(2600);
      await expectCode('CH-4902', /Still loading the last 10 rounds…/);
      expect(document.querySelectorAll('[data-ch-code="CH-4902"]')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Stats team · what the coach chose comes back (PAGE_PERFORMANCE.md rule 1)', () => {
  const lensOf = () => screen.getAllByRole('radio').find((r) => /^(Scoring|Strokes gained)$/.test(r.textContent ?? '') && r.getAttribute('aria-checked') === 'true')!.textContent;
  beforeEach(() => sessionStorage.clear());

  it('4404 the trend’s lens comes back on a return to the page, and another team starts on strokes gained', async () => {
    markAppRunning();
    const user = userEvent.setup();
    const at = (scope: string) => render(<RouteScope value={scope}>{tree(stats())}</RouteScope>);
    const first = at('/golf/dashboard/stats\u0000t1');
    expect(lensOf()).toBe('Strokes gained');
    await user.click(screen.getByRole('radio', { name: 'Scoring' }));
    expect(lensOf()).toBe('Scoring');
    first.unmount();
    const back = at('/golf/dashboard/stats\u0000t1');
    expect(lensOf()).toBe('Scoring');
    back.unmount();
    at('/golf/dashboard/stats\u0000t2');
    expect(lensOf()).toBe('Strokes gained');
  });
});

describe('Stats team · loading, haptics, accessibility', () => {
  it('CH-4401 the route skeleton is busy', () => {
    render(<StatsSkeleton />);
    expect(code('CH-4401')!.getAttribute('aria-busy')).toBe('true');
  });

  it('CH-4701 choosing a leg or a player ticks', async () => {
    const user = userEvent.setup();
    wrap(stats());
    await user.click(screen.getByRole('button', { name: /Putting/ }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    hapticSpy.mockClear();
    await user.click(screen.getAllByRole('button', { name: /Theo/ })[0]!);
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('CH-4801 the trend chart has a text summary', () => {
    wrap(stats());
    const chart = screen.getAllByRole('img').find((i) => /by week/.test(i.getAttribute('aria-label') ?? ''))!;
    expect(chart.getAttribute('aria-label')).toMatch(/Strokes gained by week\. .+/);
  });

  it('CH-4802 the strokes gained grid is a table with a header for every value', () => {
    wrap(stats());
    const table = screen.getByRole('table', { name: 'Strokes gained by leg per player' });
    for (const row of table.querySelectorAll('[role="row"]'))
      for (const child of row.children) expect(['cell', 'columnheader']).toContain(child.getAttribute('role'));
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(expect.arrayContaining(['Player', 'Total', 'Trend']));
  });
});

describe('Stats team · phone (v2, Coach - Stats - Mobile.html)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
  });

  it('41901 CH-4805 the phone view replaces desktop: four figures, the trend with a written reading, legs, players and putting', () => {
    wrap(stats());
    expect(document.querySelector('.ch-st-desk')).toBeNull();
    expect(document.querySelector('.ch-st.is-phone')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Team stats' })).toBeTruthy();
    const figs = document.querySelector('.ch-stm-figs')!;
    expect([...figs.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Scoring avg', 'GIR', 'Putts', 'Scrambling']);
    // Scoring down 0.9 is better (green); putts up 0.3 is worse (amber).
    const deltas = [...figs.querySelectorAll('dd:last-of-type')];
    expect(deltas[0]!.className).toMatch(/ch-gain/);
    expect(deltas[2]!.className).toMatch(/ch-loss/);
    for (const h of ['Scoring trend', 'Strokes gained by leg', 'Players', 'Team putting']) expect(screen.getByRole('heading', { level: 2, name: h })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Team scoring average by round day, from 74\.8 to 73\.4\. Down 1\.4 strokes since Aug 30/ })).toBeTruthy();
    expect(screen.getByText('2 legs are losing strokes: Approach, Putting.')).toBeTruthy();
  });

  it('CH-4703 CH-4805 players sort by scoring average, or by strokes gained; a row opens the player and reads as one link', async () => {
    const user = userEvent.setup();
    wrap(stats());
    const names = () => [...document.querySelectorAll('.ch-stm-row__b b')].map((b) => b.textContent);
    expect(names().slice(0, 3)).toEqual(['Theo Marchetti', 'Sofia Alvarez', 'Ava Lindqvist']);
    expect(names().at(-1)).toBe('Luca Ferraro');
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(names().slice(-2)).toEqual(['Priya Natarajan', 'Luca Ferraro']);
    const luca = screen.getByRole('link', { name: /Luca Ferraro/ });
    expect(luca.textContent).toMatch(/Early read/);
    expect(luca.getAttribute('href')).toMatch(/luca/);
  });

  it('the window switch on the phone changes the window', async () => {
    const user = userEvent.setup();
    wrap(stats());
    await user.click(screen.getByRole('radio', { name: /Season/ }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?window=season', { scroll: false });
  });

  it('CH-4201 rounds do not load: the notice, never an empty team, and no count of active players', () => {
    wrap(stats({ roundsError: true, activeCount: 0 }));
    expect(code('CH-4201')).not.toBeNull();
    expect(document.querySelector('.ch-stm-figs')).toBeNull();
    expect(document.querySelector('.ch-stm-head')!.textContent).toMatch(/countable rounds/);
    expect(document.querySelector('.ch-stm-head')!.textContent).not.toMatch(/active/);
  });

  it('CH-4301 no rounds in the window: offers the season', () => {
    wrap(empty());
    expect(code('CH-4301')).not.toBeNull();
    expect(screen.getByRole('button', { name: /season/i })).toBeTruthy();
  });

  it('CH-4303 CH-4305 CH-4306 each empty section says so on its own', () => {
    wrap(stats({ legTotals: [null, null, null, null], grid: [], putting: null }));
    expect(code('CH-4303')).not.toBeNull();
    expect(code('CH-4305')).not.toBeNull();
    expect(code('CH-4306')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Scoring trend' })).toBeTruthy();
  });

  it('CH-4203 putting does not load: the notice, the rest stays', () => {
    wrap(stats({ puttsError: true }));
    expect(code('CH-4203')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Players' })).toBeTruthy();
  });
});

/* ── The route: who may open what (category 08), and the address (category 01) ── */

type RouteEl = React.ReactElement<{ data: ChTeamStats; coachId?: string | null; coach?: boolean }>;
type Filters = Array<[string, unknown[]]>;
const asCoach = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' });
};
const asPlayer = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: 'own' } } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: 'own' });
};

describe('Stats team · who may open what', () => {
  beforeEach(() => {
    vi.mocked(getGolfSessionProfile).mockReset();
    vi.mocked(resolveClubhouseTeam).mockReset();
    vi.mocked(loadPlayerProfile).mockReset();
  });

  it("40801 Team stats is a coach's page: a player on the same address gets their own profile, and no team figure is read for them", async () => {
    const read = vi.fn(() => ({ data: null }));
    tables.current = { golf_teams: read, golf_team_members: read, golf_rounds: read, golf_round_stats_cache: read, golf_shots: read, golf_pga_standards: read };
    asPlayer();
    vi.mocked(loadPlayerProfile).mockResolvedValue(PREVIEW_PLAYER);
    for (const query of [{}, { window: 'season' }, { player: 'someone-else' }]) {
      vi.mocked(loadPlayerProfile).mockClear();
      const el = (await ClubhouseStatsRoute(query)) as RouteEl;
      expect(el.type).toBe(StatsPlayer);
      expect(el.props.coachId).toBeNull();
      expect(loadPlayerProfile).toHaveBeenCalledWith(expect.objectContaining({ viewer: 'player', playerId: 'own' }));
    }
    expect(read).not.toHaveBeenCalled();
    // The Clubhouse frame is a second lock on the old address: it is a coach's route, not a player's.
    expect(isRebuilt('/golf/dashboard/stats/team', 'coach')).toBe(true);
    expect(isRebuilt('/golf/dashboard/stats/team', 'player')).toBe(false);
    expect(isRebuilt('/golf/dashboard/stats', 'player')).toBe(true);
  });

  it("CH-4309 40802 the loader reads the coach's own team only: the team row by id, the active roster by team id, and only those players' rounds; a coach with no team gets the no-team state and nothing is read", async () => {
    const seen: Record<string, Filters> = {};
    const spy = (name: string, answer: import('./supabase-fake').ChFakeAnswer) => (f: Filters) => {
      seen[name] = f;
      return answer;
    };
    const base = seasonTables();
    tables.current = {
      ...base,
      golf_teams: spy('team', base.golf_teams as import('./supabase-fake').ChFakeAnswer),
      golf_team_members: spy('members', base.golf_team_members as import('./supabase-fake').ChFakeAnswer),
      golf_rounds: spy('rounds', base.golf_rounds as import('./supabase-fake').ChFakeAnswer),
    };
    asCoach();
    const el = (await ClubhouseStatsRoute({ player: '' })) as RouteEl;
    expect(el.type).toBe(StatsTeam);
    expect(el.props.data.teamName).toBe('Varsity');
    expect(seen.team).toContainEqual(['eq', ['id', 't1']]);
    expect(seen.members).toContainEqual(['eq', ['team_id', 't1']]);
    expect(seen.members).toContainEqual(['eq', ['status', 'active']]);
    expect(seen.rounds).toContainEqual(['in', ['player_id', ['p1']]]);
    // No team: the no-team state for a coach, and no read.
    const read = vi.fn(() => ({ data: null }));
    tables.current = { golf_teams: read, golf_team_members: read, golf_rounds: read };
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    const none = (await ClubhouseStatsRoute({})) as RouteEl;
    expect(none.type).toBe(StatsNoTeam);
    expect(none.props.coach).toBe(true);
    expect(read).not.toHaveBeenCalled();
    render(<ToastProvider>{none}</ToastProvider>);
    expect(code('CH-4309')!.textContent).toMatch(/Stats fill in once your team is set up and players post rounds/);
  });

  it('40102 the address picks the window (last10 unless it says season or qualifiers) and the switch writes it back without moving the scroll', async () => {
    const user = userEvent.setup();
    asCoach();
    for (const [given, want] of [
      [undefined, 'last10'],
      ['season', 'season'],
      ['qualifiers', 'qualifiers'],
      ['everything', 'last10'],
    ] as const) {
      const el = (await ClubhouseStatsRoute({ window: given })) as RouteEl;
      expect(el.type).toBe(StatsTeam);
      expect(el.props.data.window).toBe(want);
    }
    const view = wrap(stats({ window: 'last10' }));
    await user.click(screen.getByRole('radio', { name: 'Season' }));
    expect(router.push).toHaveBeenLastCalledWith('/golf/dashboard/stats?window=season', { scroll: false });
    await user.click(screen.getByRole('radio', { name: 'Qualifiers' }));
    expect(router.push).toHaveBeenLastCalledWith('/golf/dashboard/stats?window=qualifiers', { scroll: false });
    // Back to the default: the bare address, so the link stays clean.
    view.rerender(tree(stats({ window: 'season' })));
    await user.click(screen.getByRole('radio', { name: 'Last 10' }));
    expect(router.push).toHaveBeenLastCalledWith('/golf/dashboard/stats', { scroll: false });
    expect(trailSpy).toHaveBeenCalledWith('stats window qualifiers');
  });

  it('CH-4402 while the new window loads the page is marked busy, and it stays the last 10 rounds until the server answers', async () => {
    const user = userEvent.setup();
    router.push.mockImplementation(() => new Promise(() => {}));
    try {
      wrap(stats({ window: 'last10' }));
      expect(document.querySelector('.ch-st')!.getAttribute('aria-busy')).toBe('false');
      await user.click(screen.getByRole('radio', { name: 'Season' }));
      await waitFor(() => expect(document.querySelector('.ch-st')!.getAttribute('aria-busy')).toBe('true'));
      expect(code('CH-4402')).not.toBeNull();
      // Still the figures of the window that was on screen.
      expect(screen.getByText('Scoring average')).toBeTruthy();
    } finally {
      router.push.mockReset();
    }
  });
});

/* ── The page ── */

/** Captures the CSV the export builds, and the name it is downloaded under. */
function captureExport() {
  const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
  const prev = [url.createObjectURL, url.revokeObjectURL];
  const seen: { blob?: Blob; name?: string } = {};
  url.createObjectURL = (b: Blob) => {
    seen.blob = b;
    return 'blob:x';
  };
  url.revokeObjectURL = () => {};
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    seen.name = this.download;
  });
  return {
    seen,
    restore: () => {
      [url.createObjectURL, url.revokeObjectURL] = prev;
      click.mockRestore();
    },
  };
}

describe('Stats team · the page', () => {
  it('40101 Team stats opens on the last 10 rounds: the header, six figures (strokes gained first), the trend, the legs and the grid, putting and the season bests; the server render already has them', async () => {
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(tree(stats()));
    for (const text of ['Team stats', 'Varsity', 'active', 'Scoring average', 'Greens in regulation', 'Putts per round', 'Scrambling', 'Birdies per round', 'Team putting', 'Season bests']) expect(html).toContain(text);
    wrap(stats());
    expect(screen.getByRole('heading', { level: 1, name: 'Team stats' })).toBeTruthy();
    expect([...document.querySelectorAll('.ch-fg__l')].map((l) => l.textContent)).toEqual(['Team SG per round', 'Scoring average', 'Greens in regulation', 'Putts per round', 'Scrambling', 'Birdies per round']);
    expect(screen.getByRole('radio', { name: 'Last 10' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^(Off the tee|Approach|Around green|Putting)/ })).toHaveLength(4);
    expect(screen.getByRole('table', { name: 'Strokes gained by leg per player' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Season bests' })).toBeTruthy();
    expect(document.querySelector('.ch-st-desk')).not.toBeNull();
    // A player links to their profile in the same window.
    expect(screen.getByRole('table', { name: 'Strokes gained by leg per player' }).querySelector('a[href*="player=theo"]')!.getAttribute('href')).toBe('/golf/dashboard/stats?player=theo');
  });

  it('40501 the export writes a name that starts with = + - or @ as text, so a spreadsheet never reads it as a formula; numbers stay numbers', async () => {
    const user = userEvent.setup();
    const cap = captureExport();
    try {
      const odd = { id: 'odd', name: '=HYPERLINK("http://x","Click")', rounds: 3, legs: [0.1, -0.2, null, null], total: -0.5, change: null, avg: 73 };
      wrap(stats({ grid: [odd, ...PREVIEW_TEAM_STATS.grid, { ...odd, id: 'plus', name: '+1 555 0100' }, { ...odd, id: 'at', name: '@sum' }, { ...odd, id: 'dash', name: '-2+3' }] }));
      await user.click(screen.getByRole('button', { name: 'Export' }));
      const lines = (await cap.seen.blob!.text()).split('\n');
      expect(lines.find((l) => l.includes('HYPERLINK'))).toBe(`"'=HYPERLINK(""http://x"",""Click"")","3","0.10","-0.20","","","-0.50"`);
      for (const name of ['+1 555 0100', '@sum', '-2+3']) expect(lines.some((l) => l.startsWith(`"'${name}"`))).toBe(true);
      // An ordinary name is untouched, and a negative number stays a number.
      expect(lines.find((l) => l.startsWith('"Eli Brandt"'))).toBe('"Eli Brandt","10","0.00","-0.40","0.00","0.00","-0.50"');
    } finally {
      cap.restore();
    }
  });

  it('40901 CH-4702 an export lands: the grid as a CSV named for the team and window, a toast says so, and the success tick plays', async () => {
    const user = userEvent.setup();
    const cap = captureExport();
    try {
      wrap(stats({ window: 'season' }));
      await user.click(screen.getByRole('button', { name: 'Export' }));
      const lines = (await cap.seen.blob!.text()).split('\n');
      expect(lines[0]).toBe('Player,Rounds,SG Off the tee,SG Approach,SG Around green,SG Putting,SG total');
      expect(lines).toHaveLength(1 + PREVIEW_TEAM_STATS.grid.length);
      expect(lines[1]).toBe('"Theo Marchetti","10","0.40","0.70","0.20","0.40","1.70"');
      // A player without three rounds has no leg values, and the cells are empty, never 0.
      expect(lines.at(-1)).toBe('"Luca Ferraro","2","","","","",""');
      expect(cap.seen.name).toBe('varsity-stats-season.csv');
      expect(await screen.findByText('Team stats exported')).toBeTruthy();
      expect(hapticSpy).toHaveBeenCalledWith('success');
      expect(hapticSpy).not.toHaveBeenCalledWith('error');
    } finally {
      cap.restore();
    }
    // Nothing to export, no button.
    wrap(stats({ grid: [] }));
    expect(screen.getAllByRole('button', { name: 'Export' })).toHaveLength(1);
  });

  it('41201 changing the window keeps the chosen leg and the focused player on the page', async () => {
    const user = userEvent.setup();
    const view = wrap(stats());
    await user.click(screen.getByRole('button', { name: /^Putting/ }));
    await user.click(screen.getAllByRole('button', { name: /Theo/ })[0]!);
    expect(trailSpy).toHaveBeenCalledWith('stats focus player');
    view.rerender(tree(stats({ window: 'season' })));
    expect(screen.getByRole('button', { name: /^Putting/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Approach/ }).getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.ch-sgt__end.is-sel')!.textContent).toMatch(/Theo/);
  });

  it('42001 the window switch moves with the arrow keys, a leg card takes Enter, and a grid row focuses its player', async () => {
    const user = userEvent.setup();
    wrap(stats({ window: 'last10' }));
    screen.getByRole('radio', { name: 'Last 10' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/stats?window=season', { scroll: false });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Season' }));
    const putting = screen.getByRole('button', { name: /^Putting/ });
    putting.focus();
    await user.keyboard('{Enter}');
    expect(putting.getAttribute('aria-pressed')).toBe('true');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    // A row is a link, so Tab reaches it; focusing it marks the same player on the trend.
    const row = screen.getByRole('table', { name: 'Strokes gained by leg per player' }).querySelector('a[href*="player=sofia"]') as HTMLElement;
    expect(row.getAttribute('role')).toBe('row');
    await act(async () => row.focus());
    expect(row.className).toMatch(/is-sel/);
    expect(document.querySelector('.ch-sgt__end.is-sel')!.textContent).toMatch(/Sofia/);
  });
});

/* ── The loader ── */

describe('Stats team · the loader', () => {
  it('42101 the loader reads each source once (shots twice: the window’s putts and the season’s longest putt), starts the benchmarks before the rounds come back, and reads the round figures and putts after the rounds', async () => {
    const order: string[] = [];
    const count = (table: string, answer: import('./supabase-fake').ChFakeTables[string]) => (f: Filters) => {
      order.push(table);
      return typeof answer === 'function' ? answer(f) : answer;
    };
    tables.current = Object.fromEntries(Object.entries(seasonTables()).map(([table, answer]) => [table, count(table, answer)]));
    const data = await load();
    expect(order.slice().sort()).toEqual(['golf_pga_standards', 'golf_round_stats_cache', 'golf_rounds', 'golf_shots', 'golf_shots', 'golf_team_members', 'golf_teams']);
    const at = (t: string) => order.indexOf(t);
    expect(Math.max(at('golf_teams'), at('golf_team_members'))).toBeLessThan(at('golf_rounds'));
    // The benchmarks are already on their way before the rounds are back, and the figures need the rounds' ids.
    expect(at('golf_pga_standards')).toBeLessThan(at('golf_rounds'));
    expect(at('golf_rounds')).toBeLessThan(at('golf_round_stats_cache'));
    expect(at('golf_rounds')).toBeLessThan(at('golf_shots'));
    // Two failed reads at once still give a page, flagged, never a throw.
    tables.current = { ...seasonTables(), golf_round_stats_cache: { error: { message: 'boom' } }, golf_shots: { error: { message: 'boom' } } };
    const partial = await load();
    expect(partial.cacheError && partial.puttsError).toBe(true);
    expect(partial.roundCount).toBe(data.roundCount);
  });

  it('42301 a failed read is logged with its name (team, members, rounds, roundCache, putts, tourBenchmarks), and a window change and a focused player leave a breadcrumb', async () => {
    for (const [table, read] of [
      ['golf_teams', 'team'],
      ['golf_team_members', 'members'],
      ['golf_rounds', 'rounds'],
      ['golf_round_stats_cache', 'roundCache'],
      ['golf_shots', 'putts'],
      ['golf_pga_standards', 'tourBenchmarks'],
    ] as const) {
      logServer.mockClear();
      tables.current = { ...seasonTables(), [table]: { error: { message: 'boom' } } };
      await load();
      expect(logServer).toHaveBeenCalledWith('stats', read, expect.anything(), ...(read === 'team' || read === 'members' ? ['teams'] : read === 'putts' ? ['stats_analytics'] : []));
    }
    const user = userEvent.setup();
    wrap(stats());
    await user.click(screen.getByRole('radio', { name: 'Season' }));
    expect(trailSpy).toHaveBeenCalledWith('stats window season');
  });
});

describe('Stats team · tests', () => {
  it('42401 this file names every Stats team catalog code it forces, in a test title', () => {
    const self = fileURLToPath(import.meta.url);
    const read = (path: string) => readFileSync(resolve(dirname(self), path), 'utf8');
    const titles = read('./stats-team.test.tsx')
      .split('\n')
      .filter((line) => /^\s*(it|describe)\(/.test(line))
      .join('\n');
    // A row's test cell may name another code ("stats-team.test › CH-4701"): that code is the one the title carries.
    const forced = read('../../../docs/clubhouse/catalog/stats-team.md')
      .split('\n')
      .filter((line) => /^\| CH-4\d{3} \|/.test(line) && !/retired/i.test(line) && line.includes('stats-team.test'))
      .map((line) => /›\s*(CH-\d{4})/.exec(line)?.[1] ?? /^\| (CH-\d{4}) \|/.exec(line)![1]!);
    // A floor, so an unreadable catalog can't pass by finding nothing.
    expect(forced.length).toBeGreaterThanOrEqual(20);
    expect(forced.filter((c) => !titles.includes(c))).toEqual([]);
    // The hand contracts: each one this file claims is named in a test title.
    const ids = ['40101', '40102', '40501', '40801', '40802', '40901', '41201', '41401', '41901', '42001', '42101', '42301', '42401'];
    expect(ids.filter((id) => !titles.includes(id))).toEqual([]);
  });
});

// Swap audit §10: the team figures worked by hand from two players' rounds.
describe('Stats team · the figures by hand (swap audit §10)', () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const round = (id: string, player: string, n: number, score: number, sg: number) => ({
    id,
    player_id: player,
    round_date: day(n),
    total_score: score,
    score_to_par: score - 72,
    front_nine: Math.floor(score / 2),
    back_nine: Math.ceil(score / 2),
    holes_played: 18,
    status: 'completed',
    round_type: 'practice',
    course_name: 'Home',
    strokes_gained_total: sg,
  });
  it('scoring, greens, putts, scrambling, birdies and strokes gained over both players’ rounds', async () => {
    tables.current = {
      ...seasonTables(),
      golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } }, { player: { id: 'p2', first_name: 'Jonah', last_name: 'Okafor' } }] },
      golf_rounds: { data: [round('r1', 'p1', 1, 72, 1.0), round('r2', 'p1', 2, 76, -2.0), round('r3', 'p2', 3, 70, 2.5)] },
      golf_round_stats_cache: {
        data: [
          { round_id: 'r1', greens_hit: 12, greens_total: 18, total_putts: 30, scramble_attempts: 6, scrambles_converted: 3, birdies: 2, eagles: 0 },
          { round_id: 'r2', greens_hit: 9, greens_total: 18, total_putts: 34, scramble_attempts: 4, scrambles_converted: 1, birdies: 0, eagles: 0 },
          { round_id: 'r3', greens_hit: 15, greens_total: 18, total_putts: 28, scramble_attempts: 2, scrambles_converted: 2, birdies: 3, eagles: 1 },
        ],
      },
    };
    const data = await loadTeamStats({ teamId: 't1', window: 'last10' });
    const fig = (label: string) => data.figures.find((f) => f.label === label)!.value;
    expect(fig('Scoring average')).toBeCloseTo((72 + 76 + 70) / 3, 10);
    // Greens and scrambling pool the holes and chances (36 of 54, 6 of 12), never a mean of percentages (66.7 and 63.9).
    expect(fig('Greens in regulation')).toBeCloseTo((36 / 54) * 100, 10);
    expect(fig('Scrambling')).toBe(50);
    expect(fig('Putts per round')).toBeCloseTo((30 + 34 + 28) / 3, 10);
    // Birdies and eagles together.
    expect(fig('Birdies per round')).toBeCloseTo((2 + 0 + 4) / 3, 10);
    expect(fig('Team SG per round')).toBeCloseTo((1.0 - 2.0 + 2.5) / 3, 10);
  });

  // Swap audit C-24(a): a cache row with no hole scored holds zero birdies; it is no figure, not a round without a birdie.
  it('C-24 a round whose cache scored no hole is left out of birdies and scrambling, not counted as zero', async () => {
    const zero = { greens_hit: 10, greens_total: 18, total_putts: 31, scramble_attempts: 0, scrambles_converted: 0, birdies: 0, eagles: 0, pars: 0, bogeys: 0, double_bogeys: 0, triple_plus: 0 };
    tables.current = {
      ...seasonTables(),
      golf_rounds: { data: [round('r1', 'p1', 1, 72, 0), round('r2', 'p1', 2, 74, 0)] },
      golf_round_stats_cache: {
        data: [
          { round_id: 'r1', greens_hit: 12, greens_total: 18, total_putts: 30, scramble_attempts: 6, scrambles_converted: 3, birdies: 2, eagles: 0, pars: 12, bogeys: 4, double_bogeys: 0, triple_plus: 0 },
          { round_id: 'r2', ...zero },
        ],
      },
    };
    const data = await loadTeamStats({ teamId: 't1', window: 'last10' });
    const fig = (label: string) => data.figures.find((f) => f.label === label)!.value;
    expect(fig('Birdies per round')).toBe(2);
    // Its round-level totals still count: greens 22 of 36, putts (30 + 31) / 2.
    expect(fig('Greens in regulation')).toBeCloseTo((22 / 36) * 100, 10);
    expect(fig('Putts per round')).toBe(30.5);
  });

  // Q-112 (owner, 2026-10-01): "vs. previous 10" compares the same players. Theo shot 72 in both windows; Jonah's three 80s
  // have no previous ten, so they raise the window's average but not the change.
  it('Q-112 the change compares only players with a previous ten', async () => {
    const theo = Array.from({ length: 13 }, (_, i) => round(`t${i}`, 'p1', i + 1, 72, 0));
    const jonah = [round('j1', 'p2', 1, 80, 0), round('j2', 'p2', 2, 80, 0), round('j3', 'p2', 3, 80, 0)];
    tables.current = {
      ...seasonTables(),
      golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } }, { player: { id: 'p2', first_name: 'Jonah', last_name: 'Okafor' } }] },
      golf_rounds: { data: [...theo, ...jonah] },
    };
    const data = await loadTeamStats({ teamId: 't1', window: 'last10' });
    const scoring = data.figures.find((f) => f.label === 'Scoring average')!;
    expect(scoring.value).toBeCloseTo((10 * 72 + 3 * 80) / 13, 10);
    expect(scoring.delta).toBe(0);
  });

  // Swap audit C-15: total_score is written once at submission and can drift from the holes (round-total.ts); the season read
  // takes the total and to-par from the nines, once, for every screen after it.
  it('C-15 a round whose stored total drifted from its holes counts at the holes’ total', async () => {
    tables.current = { ...seasonTables(), golf_rounds: { data: [{ ...round('r1', 'p1', 1, 72, 0), total_score: 73, score_to_par: 1 }] } };
    const data = await loadTeamStats({ teamId: 't1', window: 'last10' });
    expect(data.figures.find((f) => f.label === 'Scoring average')!.value).toBe(72);
  });
});
