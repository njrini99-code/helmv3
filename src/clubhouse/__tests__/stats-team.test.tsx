import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Stats (team): every numbered state in docs/clubhouse/catalog/stats-team.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
const reportSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: reportSpy, chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadTeamStats, type ChTeamStats } from '../data/stats-team';
import { StatsTeam } from '../screens/stats/StatsTeam';
import { StatsSkeleton } from '../screens/stats/StatsSkeleton';
import { ToastProvider } from '../ui/Toast';
import { PREVIEW_TEAM_STATS } from '../preview/fixtures-stats';

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
const stats = (over: Partial<ChTeamStats> = {}): ChTeamStats => ({ ...PREVIEW_TEAM_STATS, ...over });
const empty = (over: Partial<ChTeamStats> = {}) => stats({ roundCount: 0, grid: [], players: [], putting: null, bests: [], ...over });

/** One active player with one countable round from yesterday, so every read downstream runs. */
function seasonTables(): import('./supabase-fake').ChFakeTables {
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: { data: [{ player: { id: 'p1', first_name: 'Theo', last_name: 'Marchetti' } }] },
    golf_rounds: { data: [{ id: 'r1', player_id: 'p1', round_date: day, total_score: 72, score_to_par: 0, front_nine: 36, back_nine: 36, holes_played: 18, status: 'completed', round_type: 'practice' }] },
    golf_round_stats_cache: { data: [{ round_id: 'r1', greens_hit: 12, greens_total: 18, total_putts: 30, scramble_attempts: 6, scrambles_converted: 3, birdies: 2, eagles: 0 }] },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', div1_avg_value: 67, tour: 'pga' }] },
    golf_shots: { data: [] },
  };
}
const load = () => loadTeamStats({ teamId: 't1', window: 'season' });

beforeEach(() => {
  hapticSpy.mockClear();
  reportSpy.mockClear();
  logServer.mockClear();
  router.refresh.mockClear();
  router.push.mockClear();
  tables.current = seasonTables();
});

describe('Stats team · saves that fail', () => {
  it('CH-4001 the export is blocked by the browser', async () => {
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
  it('CH-4201 rounds do not load: every figure is hidden, never shown incomplete', async () => {
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

  it('CH-4204 CH-4205 CH-4206 CH-4207 CH-4208 a section that crashes stays inside its section', () => {
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

  it('CH-4209 D1 benchmarks do not load: greens read against the sample, not a made-up benchmark', async () => {
    const ok = await load();
    expect(ok.figures.find((f) => f.label === 'Greens in regulation')!.context).toBe('D1 averages 67%');
    tables.current = { ...seasonTables(), golf_pga_standards: { error: { message: 'boom' } } };
    const data = await load();
    expect(logServer).toHaveBeenCalledWith('stats', 'd1Benchmarks', expect.anything());
    expect(data.figures.find((f) => f.label === 'Greens in regulation')!.context).not.toMatch(/D1/);
  });

  it("CH-4210 the team's own row does not load: no benchmark or baseline of a guessed tour", async () => {
    tables.current = { ...seasonTables(), golf_teams: { error: { message: 'boom' } } };
    const data = await load();
    expect(logServer).toHaveBeenCalledWith('stats', 'team', expect.anything(), 'teams');
    expect(data.teamName).toBe('Your team');
    expect(data.sgBaselineNote).toBe('the baseline');
    expect(data.figures.find((f) => f.label === 'Greens in regulation')!.context).not.toMatch(/D1/);
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

  it('CH-4302 no qualifier rounds', () => {
    wrap(empty({ window: 'qualifiers' }));
    expect(code('CH-4302')!.textContent).toMatch(/No qualifier rounds this season yet/);
  });

  it('CH-4303 CH-4304 the trend has nothing to draw in either lens', async () => {
    const user = userEvent.setup();
    const blank = <T,>(xs: T[]) => xs.map(() => null);
    wrap(stats({ players: PREVIEW_TEAM_STATS.players.map((p) => ({ ...p, sg: blank(p.sg), score: blank(p.score) })), team: { sg: blank(PREVIEW_TEAM_STATS.team.sg), score: blank(PREVIEW_TEAM_STATS.team.score) } }));
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

  it('the phone view replaces desktop: four figures, the trend, legs, players and putting', () => {
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
    expect(screen.getByRole('img', { name: /Team scoring average by week, from 74\.8 to 73\.4\. Down 1\.4 strokes/ })).toBeTruthy();
    expect(screen.getByText('2 legs are losing strokes: Approach, Putting.')).toBeTruthy();
  });

  it('players sort by scoring average, or by strokes gained; a row opens the player', async () => {
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

  it('CH-4201 rounds do not load: the notice, never an empty team', () => {
    wrap(stats({ roundsError: true }));
    expect(code('CH-4201')).not.toBeNull();
    expect(document.querySelector('.ch-stm-figs')).toBeNull();
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
