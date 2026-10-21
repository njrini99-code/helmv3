import { LazyMotion, domAnimation } from 'motion/react';
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
// The cohort lookup the loader reads beside the standing (CH-13272) goes to the service client; here it answers, and its failure is in coachhelm-failed-reads.test.
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: vi.fn(async () => ({ gender: 'mens', level: null })) }));

import { computeCounterfactual } from '@/lib/coachhelm/v3/counterfactual/compute';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { loadPlayerStanding } from '../data/coachhelm-standing';
import { areaOf, LADDER_METRICS } from '../data/coachhelm-ladder-shape';
import { breakBias, penalties, slope } from '../preview/fixtures-coachhelm';
import { figure, groupOf, MIN_PROJECTION_ROUNDS, toChStanding, versus } from '../data/coachhelm-standing-shape';
import { Standing } from '../screens/coachhelm/views/Standing';
import { StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import {
  PREVIEW_STANDING,
  PREVIEW_STANDING_EARLY,
  PREVIEW_STANDING_EMPTY,
  PREVIEW_STANDING_NOBASELINE,
  PREVIEW_STANDING_READSFAILED,
  PREVIEW_STANDING_THIN,
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
  it('every tracked metric the player has is drawn once, grouped as the Fairway drill groups them, in the registry’s order; the four parts of the round only on the ladder', () => {
    expect(PREVIEW_STANDING.groups.map((g) => g.label)).toEqual(['Strokes gained', 'Putting', 'Approach', 'Short game', 'Scoring', 'Course management', 'Pressure']);
    const names = { sg: 'Strokes gained', putting: 'Putting', approach: 'Approach', short_game: 'Short game', scoring: 'Scoring', course_mgmt: 'Course management', pressure: 'Pressure' } as const;
    for (const g of PREVIEW_STANDING.groups) {
      const order = METRIC_IDS.filter((id) => STANDING_ROWS.some((r) => r.metric_id === id) && names[groupOf(id)] === g.label && !LADDER_METRICS.has(id));
      expect(g.rows.map((r) => r.id), g.label).toEqual(order);
    }
    // Design call: no number twice on one screen. The Strokes gained group keeps only the total; the four parts are the ladder's.
    expect(PREVIEW_STANDING.groups[0]!.rows.map((r) => r.id)).toEqual(['sg_total']);
    expect(PREVIEW_STANDING.groups.flatMap((g) => g.rows)).toHaveLength(STANDING_ROWS.length - 4);
    // A group with nothing but those four is not drawn.
    expect(toChStanding([standingRow('sg_ott', -0.4, 0, null), standingRow('gir_pct', 58, 66, null)], ok).groups.map((g) => g.id)).toEqual(['approach']);
  });

  it('every metric in the registry has a sentence-case label (a metric added without one fails to compile; this reads them)', () => {
    const labelled = toChStanding(
      METRIC_IDS.map((id) => standingRow(id, METRIC_RENDER_CONFIG[id].default_scale.min, METRIC_RENDER_CONFIG[id].default_scale.max, null)),
      ok,
    );
    for (const r of labelled.groups.flatMap((g) => g.rows)) expect(r.label, r.id).toMatch(/^[A-Z][a-z0-9]/);
    expect(labelled.groups.flatMap((g) => g.rows)).toHaveLength(METRIC_IDS.length - LADDER_METRICS.size);
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

  it('against the Tour: every stat, strokes gained included, is named against the Tour as Stats names it (Q-88, P013 D4), by the metric’s own direction', () => {
    const sg = rowOf(PREVIEW_STANDING, 'sg_total');
    expect(sg).toMatchObject({ you: '−2.14', tour: { label: 'Tour', ref: 'the Tour', text: '0.00' }, vsTour: { sense: 'behind', text: '2.14 strokes behind the Tour' } });
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
    expect(rowOf(PREVIEW_STANDING_WOMENS, 'sg_total').tour!.label).toBe('LPGA Tour');
    expect(PREVIEW_STANDING.tour).toBe('Tour');
  });

  it('the projection is the shared counterfactual, from their scoring average, in strokes a round', () => {
    const cfg = METRIC_RENDER_CONFIG.putts_made_5_10ft_pct;
    const cf = computeCounterfactual({ metric_id: 'putts_made_5_10ft_pct', direction: cfg.direction, player_value: 38, pga_value: 51, player_30d_scoring_avg: 77.2 });
    expect(cf.suppressed).toBe(false);
    expect(rowOf(PREVIEW_STANDING, 'putts_made_5_10ft_pct').projection).toEqual({
      strokes: cf.strokes_saved_per_round.toFixed(1),
      from: '77.2',
      to: (cf.projected_score_if_closed as number).toFixed(1),
      weeks: Math.max(1, Math.round(cf.weeks_to_typical_close)),
      clamped: cf.clamped === true,
    });
  });

  it('a part of the game is sized by their own attempts a round, as its insight card is', () => {
    const cfg = METRIC_RENDER_CONFIG.putts_made_3_5ft_pct;
    const cf = computeCounterfactual({ metric_id: 'putts_made_3_5ft_pct', direction: cfg.direction, player_value: 71, pga_value: 88, player_30d_scoring_avg: 77.2, player_attempts_per_round: 2.4 });
    expect(cf.attempts_used).toBe(2.4);
    const s = toChStanding(STANDING_ROWS, { ...ok, attemptsPerRound: { putts_made_3_5ft_pct: 2.4 } });
    expect(rowOf(s, 'putts_made_3_5ft_pct').projection).toMatchObject({ strokes: cf.strokes_saved_per_round.toFixed(1), to: (cf.projected_score_if_closed as number).toFixed(1) });
  });

  it('without their attempts, a part never costs more than its strokes-gained category is behind (3–5 ft is not 1.7 when putting is 0.63)', () => {
    const p = rowOf(PREVIEW_STANDING, 'putts_made_3_5ft_pct').projection!;
    expect(Number(p.strokes)).toBeLessThanOrEqual(0.63);
    expect(p).toMatchObject({ strokes: '0.6', to: '76.6', clamped: true });
    // A category within the noise floor of the Tour leaves its parts nothing to project.
    const near = toChStanding([standingRow('sg_putting', -0.2, 0, null), standingRow('putts_made_3_5ft_pct', 71, 88, null)], ok);
    expect(rowOf(near, 'putts_made_3_5ft_pct').projection).toBeNull();
    // With no strokes-gained row to bound it, the shared counterfactual stands.
    expect(rowOf(toChStanding([standingRow('putts_made_3_5ft_pct', 71, 88, null)], ok), 'putts_made_3_5ft_pct').projection?.strokes).toBe('1.7');
  });

  it('no projection where the gap is small, where they are past the Tour, or without five rounds behind a scoring average', () => {
    const ahead = rowOf(toChStanding([standingRow('gir_pct', 70, 66, null)], ok), 'gir_pct');
    expect(ahead.projection).toBeNull();
    expect(rowOf(PREVIEW_STANDING, 'putts_made_15_25ft_pct').projection).toBeNull();
    expect(PREVIEW_STANDING_EARLY.groups.flatMap((g) => g.rows).every((r) => r.projection === null)).toBe(true);
    expect(PREVIEW_STANDING_EARLY.scoringAverage).toBeNull();
  });

  it('where strokes go: the four parts of the round, raw strokes a round against the Tour with a true minus, nothing projected or added', () => {
    const { rows, top, readsFailed } = PREVIEW_STANDING.ladder;
    expect(rows.map((r) => [r.label, r.strokes, r.sense])).toEqual([
      ['Off the tee', '−0.42', 'loss'],
      ['Approach', '−0.91', 'loss'],
      ['Around the green', '−0.18', 'loss'],
      ['Putting', '−0.63', 'loss'],
    ]);
    // The same figures the Strokes gained group draws: the standing rows, never a new estimate.
    expect(rows[1]!.strokes).toBe(figure('sg_approach', METRIC_RENDER_CONFIG.sg_approach.unit, -0.91));
    expect(top).toBe('approach');
    expect(readsFailed).toBe(false);
    // The bar is against the largest of the four.
    expect(rows.map((r) => r.pct)).toEqual([46, 100, 20, 69]);
    expect(rows.every((r) => !r.strokes?.includes('-'))).toBe(true);
  });

  it('a gain is green and positive, a level part is drawn as level with no bar, and none loses means no area is named', () => {
    const ladder = toChStanding([standingRow('sg_ott', 0.31, 0, null), standingRow('sg_approach', 0.004, 0, null), standingRow('sg_putting', 0.12, 0, null)], ok).ladder;
    expect(ladder.rows.map((r) => [r.strokes, r.sense, r.pct])).toEqual([
      ['+0.31', 'gain', 100],
      ['0.00', 'level', 0],
      [null, null, 0],
      ['+0.12', 'gain', 39],
    ]);
    expect(ladder.top).toBeNull();
    expect(areaOf('course_management')).toBeNull();
  });

  it('"Because": each part lists its own open reads, most urgent first, with the firmness words; a read outside the four parts is not on it', () => {
    const [tee, approach, around, putting] = PREVIEW_STANDING.ladder.rows;
    expect(approach!.causes.map((c) => [c.title, c.firmness, c.line])).toEqual([
      ['Approaches from 125–175 yd finish 47 ft away', 'Solid read · Counted', '9 of 14 missed greens went short, then into the rough, across 5 rounds.'],
      ['You hit 58% of greens in regulation', 'Early read', null],
    ]);
    expect(approach!.causes[0]!.href).toBe('/golf/dashboard/coachhelm?view=deep-dive&insight=ld-app-1');
    expect(putting!.causes.map((c) => c.firmness)).toEqual(['Solid read · Not traced yet']);
    expect(tee!.causes.map((c) => c.firmness)).toEqual(['Early read · Data gap']);
    expect(around!.causes).toEqual([]);
    expect(PREVIEW_STANDING.ladder.rows.flatMap((r) => r.causes).some((c) => c.id === 'ld-score-1')).toBe(false);
  });

  it('CH-13374 thin data: a part with no strokes gained, or no Tour figure, says so in words and draws no figure or bar', () => {
    const [tee, approach, around] = PREVIEW_STANDING_THIN.ladder.rows;
    expect(tee).toMatchObject({ strokes: null, sense: null, missing: 'Not measured yet. It fills in once your rounds have the shots it needs.' });
    expect(around!.strokes).toBeNull();
    expect(approach!.strokes).toBe('−0.91');
    const omitted = toChStanding([standingRow('sg_putting', -0.3, 0, null, { pga_omitted: true, pga_omitted_reason: 'no_womens_anchor' })], ok).ladder.rows[3]!;
    expect(omitted).toMatchObject({ strokes: null, missing: 'No Tour figure to compare this with yet.' });
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
    expect(PREVIEW_STANDING_NOBASELINE).toMatchObject({ state: 'ready', rounds: null, baselineFailed: true, scoringAverage: null });
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
    expect(out.data.groups.flatMap((g) => g.rows)).toHaveLength(16);
    expect(out.data.counts.measures).toBe(20);
  });

  it('a row that is anyone else’s is never drawn, whatever the standing loader returned', async () => {
    standingRead.load.mockResolvedValue(map([...rows('pl-jonah').slice(0, 2), { ...rows('pl-someone-else')[2]! }]));
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(['sg_total']);
    expect(out.data.ladder.rows.map((r) => r.strokes)).toEqual(['−0.42', null, null, null]);
  });

  it('each putt band is sized by its own attempts column over the rounds played; a band with none falls back to the cap', async () => {
    standingRead.load.mockResolvedValue(map(rows('pl-jonah')));
    tables.current = {
      golf_player_stats_cache: { data: { rounds_played: 10, scoring_average: 77.2, putt_attempts_3_5ft: 24, putt_attempts_5_10ft: 0, putt_attempts_10_15ft: 31, sand_attempts: 12 } },
    };
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    const row = (id: string) => out.data.groups.flatMap((g) => g.rows).find((r) => r.id === id)!;
    const cfg = METRIC_RENDER_CONFIG.putts_made_3_5ft_pct;
    const own = computeCounterfactual({ metric_id: 'putts_made_3_5ft_pct', direction: cfg.direction, player_value: 71, pga_value: 88, player_30d_scoring_avg: 77.2, player_attempts_per_round: 2.4 });
    expect(own.attempts_used).toBe(2.4);
    expect(row('putts_made_3_5ft_pct').projection).toMatchObject({ strokes: own.strokes_saved_per_round.toFixed(1), clamped: own.clamped === true });
    // 5–10 ft has no attempts on file: the fixed rate, within what putting is behind (0.63), unclamped as it is under it.
    const fixed = computeCounterfactual({ metric_id: 'putts_made_5_10ft_pct', direction: cfg.direction, player_value: 38, pga_value: 51, player_30d_scoring_avg: 77.2 });
    expect(row('putts_made_5_10ft_pct').projection?.strokes).toBe(fixed.strokes_saved_per_round.toFixed(1));
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
    expect(out.data).toMatchObject({ baselineFailed: true, state: 'ready', scoringAverage: null });
    expect(out.data.groups.flatMap((g) => g.rows).every((r) => r.projection === null)).toBe(true);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'standing.baseline', expect.objectContaining({ message: 'boom' }), 'coachhelm');
  });

  it('the ladder’s reads: the player’s own visible findings, less the ones they dismissed, filed by part of the round', async () => {
    standingRead.load.mockResolvedValue(map(rows('pl-jonah')));
    const row = (i: ReturnType<typeof slope>) => ({ ...i, metadata: i.metadata ?? null });
    tables.current = {
      golf_player_stats_cache: { data: { rounds_played: 14, scoring_average: 77.2 } },
      golf_coach_insights: { data: [row(slope('pl-jonah')), row(breakBias('pl-jonah')), row(penalties('pl-jonah')), row(slope('pl-someone-else', 'in-other'))] },
      golf_insight_player_feedback: { data: [{ insight_id: 'in-brk', rating: 'dismissed', created_at: '2026-10-01T00:00:00Z' }] },
    };
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    const putting = out.data.ladder.rows.find((r) => r.id === 'putting')!;
    expect(putting.causes.map((c) => c.id)).toEqual(['in-slope']);
    expect(out.data.ladder.rows.flatMap((r) => r.causes.map((c) => c.id))).toEqual(['in-slope']);
    expect(out.data.ladder.readsFailed).toBe(false);
  });

  it('CH-13273 the ladder’s reads failing leaves the strokes drawn and says so; the page is not failed', async () => {
    standingRead.load.mockResolvedValue(map(rows('pl-jonah')));
    tables.current = { golf_player_stats_cache: { data: { rounds_played: 14, scoring_average: 77.2 } }, golf_coach_insights: { error: { message: 'boom' } } };
    const out = await loadPlayerStanding({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data.ladder.readsFailed).toBe(true);
    expect(out.data.ladder.rows.map((r) => r.strokes)).toEqual(['−0.42', '−0.91', '−0.18', '−0.63']);
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

  it('CH-13880 the page is labelled by CoachHelm; where they stand, where strokes go and each group are labelled regions', () => {
    show();
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-hl-title');
    // The hero names the part of the round that loses the most, once, and its counts use one denominator, the Tour's.
    const hero = screen.getByRole('region', { name: 'Your approach shots cost you the most strokes against the Tour' });
    expect(hero.querySelector('.ch-hs-hero__sub')!.textContent).toBe('Ahead of the Tour on 0 of 19 stats. Every stat, strokes gained included, is against the Tour.');
    expect(hero.textContent).not.toMatch(/field average|of 18|20 stats/);
    for (const g of PREVIEW_STANDING.groups) expect(screen.getByRole('region', { name: g.label })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Where strokes go' })).toBeTruthy();
    // The design call: "Most to gain" drew the hero's gap a second time; it is gone, and the hero carries no number of its own.
    expect(screen.queryByText('Most to gain')).toBeNull();
    expect(hero.querySelector('h2')!.textContent).not.toMatch(/\d/);
    expect(screen.getByText('14 rounds · Scoring average 77.2 · Refreshed Sep 30').textContent).toBe('14 rounds\u00a0· Scoring average 77.2\u00a0· Refreshed Sep\u00a030');
  });

  it('each row: the stat, how they stand in words and in colour-free text, the three figures with their keys, and what closing it is worth', () => {
    show();
    const li = screen.getByRole('heading', { name: 'Putts made, 3–5 ft', level: 3 }).closest('li') as HTMLElement;
    expect(within(li).getByText('17 pts behind the Tour')).toBeTruthy();
    expect(within(li).getByText('Upper half of your team')).toBeTruthy();
    const figures = li.querySelector('dl')!;
    expect(within(figures).getByText('You').nextElementSibling!.textContent).toBe('71%');
    expect(within(figures).getByText('Tour').nextElementSibling!.textContent).toBe('88%');
    expect(within(figures).getByText('Team').nextElementSibling!.textContent).toBe('66%');
    expect(li.querySelector('.ch-hs-proj')!.textContent).toMatch(/^About 0\.6 strokes a round if it matched the Tour: your scoring average 77\.2 to 76\.6, typically in about \d+ weeks?\. The projection is capped, so it is a ceiling, not a forecast\.$/);
  });

  it('the track is decoration, hidden from assistive tech: every number is in the text beside it', () => {
    show();
    for (const t of document.querySelectorAll('.ch-hs-tr')) expect(t.getAttribute('aria-hidden')).toBe('true');
  });

  it('CH-13372 a team too small to compare says so in the row, and shows no team figure or rank', () => {
    show();
    const li = screen.getByRole('heading', { name: 'Scrambling from sand', level: 3 }).closest('li') as HTMLElement;
    expect(within(li).getByText('Team comparison needs 5 teammates with this stat (3 so far).')).toBeTruthy();
    expect(li.querySelector('dl .is-team dd')!.textContent).toBe('—');
    expect(li.querySelector('.ch-hs-pct')).toBeNull();
  });

  it('CH-13373 a Tour value that is not comparable says why in the row, and its Tour figure is a dash', () => {
    show();
    const li = screen.getByRole('heading', { name: 'Approach proximity, 50–125 yd', level: 3 }).closest('li') as HTMLElement;
    expect(within(li).getByText(/Tour proximity counts every approach, misses included/)).toBeTruthy();
    expect(li.querySelector('dl .is-tour dd')!.textContent).toBe('—');
    expect(li.querySelector('.ch-hs-proj')).toBeNull();
  });

  it('CH-13371 an early read: the rounds so far and what is not there yet, with comparisons drawn and no projection', () => {
    show(standingLoad(PREVIEW_STANDING_EARLY));
    // Every row here has its team values, so the notice does not say a team comparison is still missing.
    expect(code('CH-13371')!.textContent).toBe('3 rounds so far, so this is an early read. Projections start at 5 rounds.');
    expect(document.querySelector('.ch-hs-proj')).toBeNull();
    expect(screen.queryByText('Most to gain')).toBeNull();
    expect(screen.getByText('3 rounds · Refreshed Sep 30').textContent).toBe('3 rounds\u00a0· Refreshed Sep\u00a030');
  });

  it('CH-13371 the early notice names the team floor only where a row is short of teammates', () => {
    const short = toChStanding([standingRow('gir_pct', 58, 66, { avg: 52, n: 3, pct: 89 })], { status: 'ok', roundsPlayed: 3, scoringAverage: 80.4 });
    show(standingLoad(short));
    expect(code('CH-13371')!.textContent).toBe('3 rounds so far, so this is an early read. Projections start at 5 rounds, and a comparison with your team needs 5 teammates with the stat.');
  });

  it('CH-13271 projections that did not load say so, with Try again; the comparisons are untouched and it is not called an early read', async () => {
    show(standingLoad(PREVIEW_STANDING_NOBASELINE));
    expect(code('CH-13271')!.textContent).toMatch(/Your projections didn’t load.*not affected/);
    expect(code('CH-13371')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Putts made, 3–5 ft', level: 3 })).toBeTruthy();
    await userEvent.click(within(code('CH-13271') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-13271 and CH-13272 both beside the rows: said once with one Try again (CH-1209), each keeping its title and no button', async () => {
    show(standingLoad({ ...PREVIEW_STANDING_NOBASELINE, cohortFailed: true }));
    expect(code('CH-1209')!.textContent).toMatch(/Your scoring average and your team’s Tour didn’t load/);
    expect(code('CH-13271')!.textContent).toMatch(/Your projections didn’t load/);
    expect(code('CH-13272')!.textContent).toMatch(/Your team’s Tour couldn’t be confirmed/);
    for (const c of ['CH-13271', 'CH-13272']) expect(within(code(c) as HTMLElement).queryByRole('button', { name: /Try again/ })).toBeNull();
    await userEvent.click(within(code('CH-1209') as HTMLElement).getByRole('button', { name: /Try again/ }));
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

  it('where strokes go on the screen: four rows, each figure in text; "Because" opens one row at a time, its reads linking to the Deep dive', async () => {
    const user = userEvent.setup();
    show();
    const ladder = screen.getByRole('region', { name: 'Where strokes go' });
    const rows = within(ladder).getAllByRole('listitem').filter((li) => li.classList.contains('ch-hs-ld__r'));
    expect(rows.map((li) => [li.querySelector('h3')!.textContent, li.querySelector('.ch-hs-ld__v')!.textContent])).toEqual([
      ['Off the tee', '−0.42'],
      ['Approach', '−0.91'],
      ['Around the green', '−0.18'],
      ['Putting', '−0.63'],
    ]);
    expect(rows[1]!.classList.contains('is-loss')).toBe(true);
    expect(rows[1]!.querySelector('.ch-hs-ld__bar')!.getAttribute('aria-hidden')).toBe('true');
    expect(within(rows[2]!).getByText('No open read here.')).toBeTruthy();
    const [teeWhy, approachWhy] = within(ladder).getAllByRole('button', { name: /Because/ });
    expect(approachWhy!.getAttribute('aria-expanded')).toBe('false');
    await user.click(approachWhy!);
    expect(approachWhy!.getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(approachWhy!.getAttribute('aria-controls')!)!;
    expect(body.getAttribute('data-open')).toBe('true');
    expect(within(body).getByRole('link', { name: 'Approaches from 125–175 yd finish 47 ft away' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=deep-dive&insight=ld-app-1');
    expect(within(body).getByText('Solid read · Counted')).toBeTruthy();
    await user.click(teeWhy!);
    expect(teeWhy!.getAttribute('aria-expanded')).toBe('true');
    expect(approachWhy!.getAttribute('aria-expanded')).toBe('false');
    // Words, never a percent of confidence.
    expect(ladder.textContent).not.toMatch(/\d+% (confidence|sure)/);
  });

  it('CH-13374 and CH-13273: a part with no figure says why in words; reads that did not load are said once, and nothing opens', () => {
    show(standingLoad(PREVIEW_STANDING_THIN));
    expect(document.querySelectorAll('[data-ch-code="CH-13374"]')).toHaveLength(2);
    cleanup();
    show(standingLoad(PREVIEW_STANDING_READSFAILED));
    const ladder = screen.getByRole('region', { name: 'Where strokes go' });
    expect(code('CH-13273')!.textContent).toBe('The reads behind these didn’t load, so nothing opens under them. The strokes are not affected. Try again in a moment.');
    expect(within(ladder).queryByRole('button', { name: /Because/ })).toBeNull();
    expect(within(ladder).queryByText('No open read here.')).toBeNull();
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
