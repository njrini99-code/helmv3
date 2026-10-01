import { LazyMotion, domAnimation } from 'framer-motion';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The player's Standing (P013, ?view=standing): the standing rows as the screen draws them, the loader, and every numbered state. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const standingRead = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayerStandingMap: standingRead.load }));

import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { loadPlayerStanding } from '../data/coachhelm-standing';
import { figure, groupOf, MIN_PROJECTION_ROUNDS, toChStanding, versus } from '../data/coachhelm-standing-shape';
import { Standing } from '../screens/coachhelm/views/Standing';
import { StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import {
  PREVIEW_STANDING,
  PREVIEW_STANDING_EARLY,
  PREVIEW_STANDING_EMPTY,
  PREVIEW_STANDING_NOBASELINE,
  PREVIEW_STANDING_WOMENS,
  standingLoad,
  standingRow,
  STANDING_ROWS,
} from '../preview/fixtures-coachhelm-views';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      {node}
    </div>
  </LazyMotion>
);
const ok = { status: 'ok', roundsPlayed: 14, scoringAverage: 77.2 } as const;
const rowOf = (s: typeof PREVIEW_STANDING, id: string) => s.groups.flatMap((g) => g.rows).find((r) => r.id === id)!;

beforeEach(() => {
  phoneState.on = false;
  router.push.mockClear();
  router.refresh.mockClear();
  hapticSpy.mockClear();
  logServer.mockClear();
  standingRead.load.mockReset();
  tables.current = {};
});
afterEach(cleanup);

describe('the standing rows as the page draws them', () => {
  it('every tracked metric the player has is drawn once, grouped as the Fairway drill groups them, in the registry’s order', () => {
    expect(PREVIEW_STANDING.groups.map((g) => g.label)).toEqual(['Strokes gained', 'Putting', 'Approach', 'Short game', 'Scoring', 'Course management', 'Pressure']);
    const names = { sg: 'Strokes gained', putting: 'Putting', approach: 'Approach', short_game: 'Short game', scoring: 'Scoring', course_mgmt: 'Course management', pressure: 'Pressure' } as const;
    for (const g of PREVIEW_STANDING.groups) {
      const order = METRIC_IDS.filter((id) => STANDING_ROWS.some((r) => r.metric_id === id) && names[groupOf(id)] === g.label);
      expect(g.rows.map((r) => r.id), g.label).toEqual(order);
    }
    expect(PREVIEW_STANDING.groups.flatMap((g) => g.rows)).toHaveLength(STANDING_ROWS.length);
  });

  it('every metric in the registry has a sentence-case label (a metric added without one fails to compile; this reads them)', () => {
    const labelled = toChStanding(
      METRIC_IDS.map((id) => standingRow(id, METRIC_RENDER_CONFIG[id].default_scale.min, METRIC_RENDER_CONFIG[id].default_scale.max, null)),
      ok,
    );
    for (const r of labelled.groups.flatMap((g) => g.rows)) expect(r.label, r.id).toMatch(/^[A-Z][a-z0-9]/);
    expect(labelled.groups.flatMap((g) => g.rows)).toHaveLength(METRIC_IDS.length);
  });

  it('figures use the true minus, a signed difference for strokes gained and a plain score for par scoring, and a dash for no data', () => {
    expect(figure('sg_total', 'strokes', -2.14)).toBe('−2.14');
    expect(figure('sg_total', 'strokes', 0.4)).toBe('+0.40');
    expect(figure('scoring_par_3', 'strokes', 3.24)).toBe('3.24');
    expect(figure('practice_tournament_delta', 'strokes', 0.82)).toBe('+0.82');
    expect(figure('gir_pct', 'percent', 58.4)).toBe('58%');
    expect(figure('approach_proximity_125_175ft', 'feet', 46.6)).toBe('47 ft');
    expect(figure('penalty_rate_per_round', 'count', 1.14)).toBe('1.1');
    expect(figure('gir_pct', 'percent', Number.NaN)).toBe('—');
  });

  it('against the Tour: strokes gained is against the field average, every other stat against the Tour, by the metric’s own direction', () => {
    const sg = rowOf(PREVIEW_STANDING, 'sg_total');
    expect(sg).toMatchObject({ you: '−2.14', tour: { label: 'Field average', ref: 'the field average', text: '0.00' }, vsTour: { sense: 'behind', text: '2.14 strokes behind the field average' } });
    expect(rowOf(PREVIEW_STANDING, 'putts_made_3_5ft_pct')).toMatchObject({ you: '71%', tour: { label: 'Tour', text: '88%' }, vsTour: { sense: 'behind', text: '17 pts behind the Tour' } });
    // A lower-is-better distance: farther is behind, closer is ahead.
    expect(rowOf(PREVIEW_STANDING, 'approach_proximity_125_175ft').vsTour).toEqual({ sense: 'behind', text: '13 ft farther than the Tour' });
    expect(rowOf(PREVIEW_STANDING, 'approach_proximity_125_175ft').vsTeam).toEqual({ sense: 'ahead', text: '5 ft closer than your team average' });
    expect(versus(70, 70.2, 'higher_better', 'percent', 'the Tour')).toEqual({ sense: 'level', text: 'Level with the Tour' });
    expect(versus(0.5, 0.9, 'lower_better', 'count', 'the Tour').sense).toBe('ahead');
  });

  it('the team marker and the percentile need five teammates: below that the row says so, and no rank is worded', () => {
    const sand = rowOf(PREVIEW_STANDING, 'scrambling_pct_sand');
    expect(sand).toMatchObject({ team: null, vsTeam: null, percentile: null, teamNote: 'Team comparison needs 5 teammates with this stat (3 so far).' });
    expect(rowOf(PREVIEW_STANDING, 'opening_hole_delta').teamNote).toBe('Team comparison needs 5 teammates with this stat.');
    expect(rowOf(PREVIEW_STANDING, 'sg_total').teamNote).toBeNull();
  });

  it('a percentile is a rank, never an average; percent language starts at 20 teammates, and a smaller team says "top of your team"', () => {
    const at = (pct: number, n: number) => rowOf(toChStanding([standingRow('gir_pct', 58, 66, { avg: 52, n, pct })], ok), 'gir_pct').percentile;
    expect(at(78, 9)).toBe('Top quartile on your team');
    expect(at(95, 9)).toBe('Top of your team');
    expect(at(95, 25)).toBe('Top 5% on your team');
    expect(at(60, 9)).toBe('Upper half of your team');
    expect(at(10, 9)).toBe('Bottom of your team');
    expect(at(10, 25)).toBe('Bottom 10% on your team');
  });

  it('CH-13373 a Tour value that is not comparable says why and draws no Tour mark, no comparison and no projection', () => {
    const prox = rowOf(PREVIEW_STANDING, 'approach_proximity_50_125ft');
    expect(prox).toMatchObject({ tour: null, vsTour: null, projection: null });
    expect(prox.tourNote).toMatch(/Tour proximity counts every approach, misses included/);
    const w = rowOf(PREVIEW_STANDING_WOMENS, 'big_number_rate');
    expect(w).toMatchObject({ tour: null, tourNote: 'No women’s Tour benchmark for this metric yet.', projection: null });
  });

  it('a women’s team is against the LPGA Tour, by name, in the row and in the page', () => {
    expect(PREVIEW_STANDING_WOMENS.tour).toBe('LPGA Tour');
    expect(rowOf(PREVIEW_STANDING_WOMENS, 'gir_pct')).toMatchObject({ tour: { label: 'LPGA Tour', ref: 'the LPGA Tour' }, vsTour: { text: '8 pts behind the LPGA Tour' } });
    expect(rowOf(PREVIEW_STANDING_WOMENS, 'sg_total').tour!.label).toBe('Field average');
    expect(PREVIEW_STANDING.tour).toBe('Tour');
  });

  it('the projection is the shared counterfactual, from their scoring average, in strokes a round', () => {
    const cfg = METRIC_RENDER_CONFIG.putts_made_3_5ft_pct;
    const cf = computeCounterfactual({ metric_id: 'putts_made_3_5ft_pct', direction: cfg.direction, player_value: 71, pga_value: 88, player_30d_scoring_avg: 77.2 });
    expect(cf.suppressed).toBe(false);
    expect(rowOf(PREVIEW_STANDING, 'putts_made_3_5ft_pct').projection).toEqual({
      strokes: cf.strokes_saved_per_round.toFixed(1),
      from: '77.2',
      to: (cf.projected_score_if_closed as number).toFixed(1),
      weeks: Math.max(1, Math.round(cf.weeks_to_typical_close)),
      clamped: cf.clamped === true,
    });
  });

  it('no projection where the gap is small, where they are past the Tour, or without five rounds behind a scoring average', () => {
    const ahead = rowOf(toChStanding([standingRow('gir_pct', 70, 66, null)], ok), 'gir_pct');
    expect(ahead.projection).toBeNull();
    expect(rowOf(PREVIEW_STANDING, 'putts_made_15_25ft_pct').projection).toBeNull();
    expect(PREVIEW_STANDING_EARLY.groups.flatMap((g) => g.rows).every((r) => r.projection === null)).toBe(true);
    expect(PREVIEW_STANDING_EARLY.scoringAverage).toBeNull();
  });

  it('the most to gain is the three biggest projections, most first, and they are not added', () => {
    expect(PREVIEW_STANDING.gaps).toEqual([
      { id: 'sg_total', label: 'Strokes gained: total', strokes: '2.1' },
      { id: 'putts_made_3_5ft_pct', label: 'Putts made, 3–5 ft', strokes: '1.7' },
      { id: 'scoring_par_4', label: 'Par 4 scoring', strokes: '1.5' },
    ]);
    expect(PREVIEW_STANDING.gaps.length).toBeLessThanOrEqual(3);
  });

  it('the counts say how many of the comparisons they are ahead on, and only count comparisons that were made', () => {
    expect(PREVIEW_STANDING.counts.measures).toBe(20);
    expect(PREVIEW_STANDING.counts.tour).toEqual({ of: 19, ahead: 0 });
    expect(PREVIEW_STANDING.counts.team.of).toBe(18);
    expect(PREVIEW_STANDING.counts.team.ahead).toBe(16);
  });

  it('the state: nothing on file, an early read, a ready one; a failed scoring-average read is not an early read', () => {
    expect(PREVIEW_STANDING.state).toBe('ready');
    expect(PREVIEW_STANDING_EARLY).toMatchObject({ state: 'early', rounds: 3 });
    expect(PREVIEW_STANDING_EMPTY).toMatchObject({ state: 'empty', rounds: 2, groups: [] });
    expect(PREVIEW_STANDING_NOBASELINE).toMatchObject({ state: 'ready', rounds: null, baselineFailed: true, scoringAverage: null, gaps: [] });
    expect(toChStanding(STANDING_ROWS, { status: 'ok', roundsPlayed: null, scoringAverage: null }).state).toBe('early');
  });

  it('the projection floor is the Fairway loader’s own (five rounds), read from its source', () => {
    expect(readFileSync('src/lib/coachhelm/v3/counterfactual/baseline-loader.ts', 'utf8')).toContain(`data.rounds_played < ${MIN_PROJECTION_ROUNDS}`);
  });

  it('a metric the registry does not know, or a value that is not a number, is not drawn', () => {
    const rows = [standingRow('gir_pct', 58, 66, null), { ...standingRow('sg_total', 1, 0, null), metric_id: 'made_up' as MetricId }, standingRow('scoring_par_3', Number.NaN, 3, null)];
    expect(toChStanding(rows, ok).groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['gir_pct']);
  });

  it('"refreshed" is the newest refresh among the rows, in UTC', () => {
    expect(PREVIEW_STANDING.refreshed).toBe('Sep 30');
    expect(toChStanding([{ ...standingRow('gir_pct', 58, 66, null), computed_at: '2026-10-01T02:00:00Z' }, standingRow('sg_total', 0, 0, null)], ok).refreshed).toBe('Oct 1');
  });
});

describe('the loader reads the signed-in player’s own standing, and says when it could not', () => {
  const rows = (id: string): PlayerStanding[] => STANDING_ROWS.map((r) => ({ ...r, player_id: id }));
  const map = (list: PlayerStanding[]) => new Map(list.map((r) => [r.metric_id, r]));
  const filters: Array<Array<[string, unknown[]]>> = [];
  beforeEach(() => {
    filters.length = 0;
    tables.current = {
      golf_player_stats_cache: (f) => {
        filters.push(f);
        return { data: { rounds_played: 14, scoring_average: 77.2 } };
      },
    };
  });

  it('ready: the standing map for the player id it was given, and their own cache row, filtered to that id', async () => {
    standingRead.load.mockResolvedValue(map(rows('pl-jonah')));
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    expect(standingRead.load).toHaveBeenCalledTimes(1);
    expect(standingRead.load).toHaveBeenCalledWith('pl-jonah');
    expect(filters[0]!.find(([k, a]) => k === 'eq' && a[0] === 'player_id')?.[1][1]).toBe('pl-jonah');
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.data).toMatchObject({ state: 'ready', rounds: 14, scoringAverage: '77.2' });
    expect(out.data.groups.flatMap((g) => g.rows)).toHaveLength(20);
  });

  it('a row that is anyone else’s is never drawn, whatever the standing loader returned', async () => {
    standingRead.load.mockResolvedValue(map([...rows('pl-jonah').slice(0, 2), { ...rows('pl-someone-else')[2]! }]));
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['sg_total', 'sg_ott']);
  });

  it('no standing row yet is the first-run state, never a failure', async () => {
    standingRead.load.mockResolvedValue(new Map());
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    expect(out).toMatchObject({ status: 'ready', data: { state: 'empty', rounds: 14 } });
    expect(logServer).not.toHaveBeenCalled();
  });

  it('CH-13270 a standing read that throws is the failed state, logged through chLogServer, never the first run', async () => {
    standingRead.load.mockRejectedValue(new Error('loadPlayerStandingMap(pl-jonah): boom'));
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    expect(out).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'standing.map', expect.any(Error), 'coachhelm');
  });

  it('CH-13271 a scoring-average read that fails is its own flag: the rows still draw, with no projection, and it is logged', async () => {
    standingRead.load.mockResolvedValue(map(rows('pl-jonah')));
    tables.current = { golf_player_stats_cache: { error: { message: 'boom' } } };
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data).toMatchObject({ baselineFailed: true, state: 'ready', scoringAverage: null, gaps: [] });
    expect(out.data.groups.flatMap((g) => g.rows).every((r) => r.projection === null)).toBe(true);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'standing.baseline', expect.objectContaining({ message: 'boom' }), 'coachhelm');
  });

  it('no stats row at all is "rounds unknown", an early read: not zero, not a failure', async () => {
    standingRead.load.mockResolvedValue(map(rows('pl-jonah')));
    tables.current = { golf_player_stats_cache: { data: null } };
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data).toMatchObject({ state: 'early', rounds: null, baselineFailed: false });
  });
});

describe('the Standing screen', () => {
  const show = (load = standingLoad(PREVIEW_STANDING)) => render(wrap(<Standing load={load} />));

  it('CH-13880 the page is labelled by CoachHelm; where they stand, each group and the most to gain are labelled regions', () => {
    show();
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-hl-title');
    expect(screen.getByRole('region', { name: /Ahead of the Tour on 0 of 19 stats and ahead of your team on 16 of 18/ })).toBeTruthy();
    for (const g of PREVIEW_STANDING.groups) expect(screen.getByRole('region', { name: g.label })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Most to gain' })).toBeTruthy();
    expect(screen.getByText('14 rounds · Scoring average 77.2 · Refreshed Sep 30')).toBeTruthy();
  });

  it('each row: the stat, how they stand in words and in colour-free text, the three figures with their keys, and what closing it is worth', () => {
    show();
    const li = screen.getByRole('heading', { name: 'Putts made, 3–5 ft', level: 4 }).closest('li') as HTMLElement;
    expect(within(li).getByText('17 pts behind the Tour')).toBeTruthy();
    expect(within(li).getByText('Upper half of your team')).toBeTruthy();
    const figures = li.querySelector('dl')!;
    expect(within(figures).getByText('You').nextElementSibling!.textContent).toBe('71%');
    expect(within(figures).getByText('Tour').nextElementSibling!.textContent).toBe('88%');
    expect(within(figures).getByText('Team').nextElementSibling!.textContent).toBe('66%');
    expect(li.querySelector('.ch-hs-proj')!.textContent).toMatch(/^About 1\.7 strokes a round if it matched the Tour: your scoring average 77\.2 to 75\.\d, typically in about \d+ weeks?\.$/);
  });

  it('the track is decoration, hidden from assistive tech: every number is in the text beside it', () => {
    show();
    for (const t of document.querySelectorAll('.ch-hs-tr')) expect(t.getAttribute('aria-hidden')).toBe('true');
  });

  it('CH-13372 a team too small to compare says so in the row, and shows no team figure or rank', () => {
    show();
    const li = screen.getByRole('heading', { name: 'Scrambling from sand', level: 4 }).closest('li') as HTMLElement;
    expect(within(li).getByText('Team comparison needs 5 teammates with this stat (3 so far).')).toBeTruthy();
    expect(li.querySelector('dl .is-team dd')!.textContent).toBe('—');
    expect(li.querySelector('.ch-hs-pct')).toBeNull();
  });

  it('CH-13373 a Tour value that is not comparable says why in the row, and its Tour figure is a dash', () => {
    show();
    const li = screen.getByRole('heading', { name: 'Approach proximity, 50–125 yd', level: 4 }).closest('li') as HTMLElement;
    expect(within(li).getByText(/Tour proximity counts every approach, misses included/)).toBeTruthy();
    expect(li.querySelector('dl .is-tour dd')!.textContent).toBe('—');
    expect(li.querySelector('.ch-hs-proj')).toBeNull();
  });

  it('CH-13371 an early read: the rounds so far and what is not there yet, with comparisons drawn and no projection', () => {
    show(standingLoad(PREVIEW_STANDING_EARLY));
    expect(code('CH-13371')!.textContent).toBe('3 rounds so far, so this is an early read. Projections start at 5 rounds, and a comparison with your team needs 5 teammates with the stat.');
    expect(document.querySelector('.ch-hs-proj')).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Most to gain' })).toBeNull();
    expect(screen.getByText('3 rounds · Refreshed Sep 30')).toBeTruthy();
  });

  it('CH-13271 projections that did not load say so, with Try again; the comparisons are untouched and it is not called an early read', async () => {
    show(standingLoad(PREVIEW_STANDING_NOBASELINE));
    expect(code('CH-13271')!.textContent).toMatch(/Your projections didn’t load.*not affected/);
    expect(code('CH-13371')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Putts made, 3–5 ft', level: 4 })).toBeTruthy();
    await userEvent.click(within(code('CH-13271') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-13370 nothing on file yet: the first-run page with one action, never a table of zeros', () => {
    show(standingLoad(PREVIEW_STANDING_EMPTY));
    expect(code('CH-13370')!.textContent).toMatch(/Standing starts with a few rounds.*You have posted 2 rounds\./);
    expect(within(code('CH-13370') as HTMLElement).getByRole('link', { name: 'Start a round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    expect(document.querySelector('.ch-hs-g')).toBeNull();
  });

  it('CH-13270 a standing that did not load says so, with Try again (asks the server again), never the first run', async () => {
    show({ status: 'failed' });
    expect(code('CH-13270')!.textContent).toMatch(/Your standing didn’t load.*Nothing is lost/);
    expect(code('CH-13370')).toBeNull();
    await userEvent.click(within(code('CH-13270') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-13304 CoachHelm off for them: the board’s own page and no sub-navigation', () => {
    show({ status: 'off', reason: null });
    expect(code('CH-13304')!.textContent).toMatch(/CoachHelm is turned off, so no insights are being shown/);
    expect(code('CH-13930')).toBeNull();
  });

  it('CH-13470 loading: the page’s own shape, busy and named, with the sub-navigation’s place held', () => {
    render(wrap(<StandingSkeleton />));
    const main = screen.getByRole('main', { name: 'Loading your standing' });
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(code('CH-13470')).not.toBeNull();
    expect(main.querySelector('.ch-hv-sk-tabs')).not.toBeNull();
    expect(main.querySelectorAll('.ch-hs-sk__g').length).toBeGreaterThanOrEqual(3);
  });

  it('the player has no control over anyone else’s numbers: the page is links and a retry, nothing that writes', () => {
    show();
    expect(screen.queryByRole('button', { name: /Assign|Dismiss|Accept|Decline|Save/ })).toBeNull();
    const next = screen.getByRole('heading', { name: 'Keep reading' }).closest('aside') as HTMLElement;
    expect(within(next).getByRole('link', { name: /Game profile/ }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=profile');
    expect(within(next).getByRole('link', { name: /Deep dive/ }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive');
  });

  it('on the phone it is its own layout: the same page under the top bar, the views as chips', () => {
    phoneState.on = true;
    show();
    expect(document.querySelector('.ch-hl.is-phone')).not.toBeNull();
    expect(document.querySelector('.ch-hv-tabs.is-phone .ch-hv-chips')).not.toBeNull();
  });
});
