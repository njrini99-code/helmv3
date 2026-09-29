import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Stats (team): every numbered state in docs/clubhouse/catalog/stats-team.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
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
function wrap(data: ChTeamStats) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <StatsTeam data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
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
    url.createObjectURL = prev;
  });
});

describe('Stats team · reads that fail', () => {
  it('CH-4201 rounds do not load: every figure is hidden, never shown incomplete', async () => {
    tables.current = { ...seasonTables(), golf_rounds: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.roundsError).toBe(true);
    wrap(data);
    await expectCode('CH-4201', /Team rounds didn't load/);
    expect(screen.queryByText('Scoring average')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(code('CH-4301')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-4202 round figures do not load: scoring stays, the rest say so', async () => {
    tables.current = { ...seasonTables(), golf_round_stats_cache: { error: { message: 'boom' } } };
    const data = await load();
    expect(data.cacheError).toBe(true);
    expect(data.figures.find((f) => f.label === 'Scoring average')!.value).toBe(72);
    expect(data.figures.find((f) => f.label === 'Greens in regulation')!.value).toBeNull();
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
    expect(screen.getByRole('heading', { name: 'Team stats' })).toBeTruthy();
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
