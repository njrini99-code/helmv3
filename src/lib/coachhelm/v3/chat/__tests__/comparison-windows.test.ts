import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the service client must not be used'); } }));

import { applyComparisons, benchmarkSource, getBenchmarks, teamRefFromCohort } from '../benchmark-reads';
import { getPlayerMetric, getTeamMetricRanking, TEAM_FIGURES_KEY, type PlayerFigures, type PlayerFiguresSource } from '../read-tools';
import { person, pgrst, type Tables } from './pgrst-double';

// The staging bug (Owen, last 10): a team place read off the nightly all-history standing sat beside window values, so Cole (-3.60) was "100%" while
// Dylan (-2.03) was higher, Owen (-4.16) was "0%" while Ethan (-4.40) was lower, and the model called Owen 7th of 7 when he is 6th.
const PLAYERS = [
  { id: 'cole', name: 'Cole Bennett', last10: -3.6, all: -2.9 },
  { id: 'dylan', name: 'Dylan Reed', last10: -2.03, all: -1.8 },
  { id: 'owen', name: 'Owen Carter', last10: -4.16, all: -3.83 },
  { id: 'ethan', name: 'Ethan Park', last10: -4.4, all: -4.1 },
  { id: 'max', name: 'Max Hill', last10: -1.0, all: -1.2 },
  { id: 'leo', name: 'Leo Marsh', last10: 0.5, all: 0.2 },
  { id: 'sam', name: 'Sam Cole', last10: -0.2, all: -0.6 },
];
const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: PLAYERS.map((p) => person(p.id, p.name)) };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (n: number) => Math.round(n * 100) / 100;

const figs = (sg: number): PlayerFigures => ({ rounds: 10, hole_rounds: 10, scoring_average: 75, putts_per_round: 30, putt_rounds: 10, sg_total: sg, sg_rounds: 10, legs: { tee: null, approach: null, around: null, putting: null }, gir_pct: null, gir_holes: 0, fairway_pct: null, fairway_holes: 0, window_start: '2026-09-01', window_end: '2026-10-20' });
/** The rounds in a window: last 10 differs from the five, the season and all-history values. */
// The team's figure for a window is Team Stats' POOLED one (every player's rounds pooled), not the mean of the players' figures: they differ here on purpose.
const POOLED = { last10: -2.5, all: -2.2 } as const;
const withTeam = (opts: { team: boolean }): PlayerFiguresSource => async (ids, window) => {
  const out = new Map<string, PlayerFigures>(ids.map((id) => [id, figs((PLAYERS.find((p) => p.id === id) as (typeof PLAYERS)[number])[window === 'last10' ? 'last10' : 'all'] + (window === 'last5' ? 0.5 : 0))]));
  if (opts.team && ids.length >= 2) out.set(TEAM_FIGURES_KEY, figs(POOLED[window === 'last10' ? 'last10' : 'all']));
  return out;
};
const figures = withTeam({ team: true });

const std = (metric: string, v: Record<string, number | null> = {}) => ({ tour: 'pga', metric_id: metric, season: '2024', display_label: metric, pga_tour_value: 0, korn_ferry_value: null, div1_avg_value: null, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null, pga_p25: null, pga_p50: null, pga_p75: null, source: 'src', ...v });
const tables = (): Tables => ({
  golf_teams: { rows: [{ id: 'team-1', gender: 'mens', organization_id: 'org-1' }] },
  organizations: { rows: [{ id: 'org-1', division: 'NCAA D1' }] },
  golf_team_seasons: { rows: [] },
  golf_pga_standards: { rows: [std('sg_total', { div1_avg_value: null })] },
  golf_metrics: { rows: [{ metric_id: 'sg_total', display_label: 'SG: Total', unit: 'strokes', direction: 'higher_better' }] },
  // All recorded rounds: the stats cache. The standing's own team figures are the all-history ones the bug mixed in.
  golf_player_stats_cache: { rows: PLAYERS.map((p) => ({ player_id: p.id, rounds_played: 20, sg_total_per_round: p.all, updated_at: '2026-11-07T00:00:00Z' })) },
  golf_player_standing: {
    rows: PLAYERS.map((p) => ({ player_id: p.id, metric_id: 'sg_total', player_value: p.all, level_avg: -2, level_n: 70, level_pct: 20, team_avg: -2.33, team_n: 7, team_pct: 0, basis: null, computed_at: '2026-11-07T02:00:00Z' })),
  },
});

/** Best first: the order the ranking itself prints. */
const bestFirst = (key: 'last10' | 'all') => [...PLAYERS].sort((a, b) => b[key] - a[key]).map((p) => p.id);
const comparisonOf = (m: { comparisons?: Array<{ kind: string }> }, kind: string) => m.comparisons!.find((c) => c.kind === kind) as unknown as { value: number | null; place: number | null; place_of: number | null; place_percent: number | null; label: string; note: string | null };

describe('a comparison is made over the same window, with the same per-player values, as the figure it sits on', () => {
  it('the team place agrees with sorting the window values: Owen is 6th of 7 over the last 10 rounds, Ethan 7th, Cole 5th, Dylan 4th', async () => {
    const { sb } = pgrst(tables());
    const ranking = await getTeamMetricRanking(sb, ctx, { metric_id: 'sg_total', window: 'last10' }, figures);
    const out = await applyComparisons(ranking, benchmarkSource(sb, 'team-1', { ctx, figures }));
    const order = bestFirst('last10');
    for (const m of out.measurements) {
      const team = comparisonOf(m, 'team');
      expect(team.place, m.entity.label).toBe(order.indexOf(m.entity.id) + 1);
      expect(team.place_of).toBe(7);
      expect(team.place_percent).toBeNull();
    }
    const placeOf = (id: string) => comparisonOf(out.measurements.find((m) => m.entity.id === id)!, 'team').place;
    expect([placeOf('owen'), placeOf('ethan'), placeOf('cole'), placeOf('dylan')]).toEqual([6, 7, 5, 4]);
  });

  it('every player’s comparison carries the same team average, computed from the very values the ranking prints', async () => {
    const { sb } = pgrst(tables());
    const ranking = await getTeamMetricRanking(sb, ctx, { metric_id: 'sg_total', window: 'last10' }, figures);
    const out = await applyComparisons(ranking, benchmarkSource(sb, 'team-1', { ctx, figures }));
    // The team value is the pooled figure Stats prints, not the mean of the seven players (-2.13).
    expect(new Set(out.measurements.map((m) => comparisonOf(m, 'team').value))).toEqual(new Set([POOLED.last10]));
    expect(r2(mean(PLAYERS.map((p) => p.last10)))).toBe(-2.13);
    expect(comparisonOf(out.measurements[0]!, 'team').label).toBe('Team, all players’ last 10 rounds pooled');
    expect((ranking.detail as { team_figure: unknown }).team_figure).toMatchObject({ value: POOLED.last10, method: 'pooled', window: 'last10', players: 7 });
    // The values are the ranking's own: the printed list and the places are in the same order.
    expect(out.measurements.map((m) => comparisonOf(m, 'team').place)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ranking.measurements.map((m) => m.entity.id)).toEqual(bestFirst('last10'));
  });

  it('a single player’s read (get_player_metrics, last 10) is placed among the roster’s values over the last 10, not the standing’s', async () => {
    const { sb } = pgrst(tables());
    const one = await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'last10' }, figures);
    const out = await applyComparisons(one, benchmarkSource(sb, 'team-1', { ctx, figures }));
    const m = out.measurements[0]!;
    expect(m.value).toBe(-4.16);
    expect(comparisonOf(m, 'team')).toMatchObject({ value: POOLED.last10, place: 6, place_of: 7, place_percent: null });
    // The standing says -2.33 and 0%: that is all-history and not what this figure is over.
    expect(JSON.stringify(m.comparisons)).not.toMatch(/-2\.33/);
  });

  it('the last 10 and the all-history team average differ when the data differ, each from its own window', async () => {
    const { sb } = pgrst(tables());
    const src = benchmarkSource(sb, 'team-1', { ctx, figures });
    const last10 = await applyComparisons(await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'last10' }, figures), src);
    const all = await applyComparisons(await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'cache' }, figures), src);
    expect(comparisonOf(last10.measurements[0]!, 'team').value).toBe(POOLED.last10);
    expect(comparisonOf(all.measurements[0]!, 'team').value).toBe(r2(mean(PLAYERS.map((p) => p.all))));
    expect(comparisonOf(last10.measurements[0]!, 'team').value).not.toBe(comparisonOf(all.measurements[0]!, 'team').value);
    expect(comparisonOf(all.measurements[0]!, 'team').label).toBe('Team average of the players’ figures, all rounds on record');
    // All-history place: Owen -3.83 is 6th of 7 there as well, from the cache values, not the standing's percent.
    expect(comparisonOf(all.measurements[0]!, 'team')).toMatchObject({ place: bestFirst('all').indexOf('owen') + 1, place_of: 7, place_percent: null });
  });

  // Team lead, 2026-11-08: the level row compared the last-10 figure (-4.16) with a mean over all recorded rounds. The level is over all recorded rounds,
  // so beside it stands the player's own all-rounds figure (the standing's player_value), and the window figure stays on the team and the Tour.
  it('the level row carries the player’s all-rounds figure, never the window one; the team and the Tour keep the window', async () => {
    const t = tables();
    t.golf_division_cohort = { rows: [{ gender: 'mens', level: 'd1', metric_id: 'sg_total', cohort_avg: -2.7, cohort_n: 24, computed_at: 'x' }] };
    const { sb } = pgrst(t);
    const src = benchmarkSource(sb, 'team-1', { ctx, figures });
    const one = await applyComparisons(await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'last10' }, figures), src);
    const m = one.measurements[0]!;
    expect(m.value).toBe(-4.16);
    const level = m.comparisons!.find((c) => c.kind === 'level')!;
    // Owen's standing value is his all-rounds -3.83; the other 23 Division I players on Helm average (-2.7 * 24 + 3.83) / 23.
    expect(level).toMatchObject({ label: 'Division I players on Helm (n=23)', value: -2.65, your_value: -3.83, place_percent: 20, place_of: 70 });
    expect(level.your_value).toBe(PLAYERS.find((p) => p.id === 'owen')!.all);
    expect(level.your_value).not.toBe(m.value);
    expect(comparisonOf(m, 'team').value).toBe(POOLED.last10);
    // A window figure is not graded against an all-rounds level: the chip's reference is the Tour.
    expect(m.benchmark).toMatchObject({ value: 0, source: expect.stringContaining('PGA Tour') });
    // The all-rounds figure is graded against the level, as both are over the same rounds.
    const all = await applyComparisons(await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'cache' }, figures), src);
    expect(all.measurements[0]!.benchmark).toMatchObject({ value: -2.65 });
  });

  it('without a pooled team figure the average is the players’ mean and the label says so', async () => {
    const { sb } = pgrst(tables());
    const noTeam = withTeam({ team: false });
    const one = await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'last10' }, noTeam);
    const out = await applyComparisons(one, benchmarkSource(sb, 'team-1', { ctx, figures: noTeam }));
    expect(comparisonOf(out.measurements[0]!, 'team')).toMatchObject({ value: -2.13, label: 'Team average of the players’ figures, the last 10 rounds' });
  });

  it('a figure whose window is not stated gets no team comparison, never one from another window', async () => {
    const { sb } = pgrst(tables());
    const one = await getPlayerMetric(sb, ctx, { player_id: 'owen', metric_ids: ['sg_total'], window: 'last10' }, figures);
    const noWindow = { ...one, detail: undefined };
    const out = await applyComparisons(noWindow, benchmarkSource(sb, 'team-1', { ctx, figures }));
    expect(comparisonOf(out.measurements[0]!, 'team')).toMatchObject({ value: null, place: null });
  });

  it('place is defined as a rank among the players with a figure: 1 is best by the metric’s direction, ties share a rank, and fewer than five players is no place', () => {
    const cohort = (direction: 'higher_better' | 'lower_better', vals: Record<string, number>) => ({ window: 'last10' as const, direction, values: new Map(Object.entries(vals)), team: null });
    const five = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    expect(teamRefFromCohort(cohort('higher_better', five), 'e', 'last10')).toMatchObject({ kind: 'cohort', rank: 1, n: 5, avg: 3 });
    expect(teamRefFromCohort(cohort('lower_better', five), 'e', 'last10')).toMatchObject({ rank: 5 });
    expect(teamRefFromCohort(cohort('higher_better', { ...five, f: 5 }), 'e', 'last10')).toMatchObject({ rank: 1, n: 6 });
    expect(teamRefFromCohort(cohort('higher_better', { ...five, f: 5 }), 'a', 'last10')).toMatchObject({ rank: 6 });
    expect(teamRefFromCohort(cohort('higher_better', { a: 1, b: 2, c: 3 }), 'a', 'last10')).toMatchObject({ kind: 'missing', reason: 'fewer than 5 players' });
    expect(teamRefFromCohort(cohort('higher_better', five), 'stranger', 'last10')).toMatchObject({ kind: 'cohort', rank: null });
    expect(teamRefFromCohort(null, 'a', 'last10')).toMatchObject({ kind: 'missing' });
  });
});

describe('get_benchmarks reads the window', () => {
  const benchRow = async (window: 'last10' | 'cache' | undefined) => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx, figures }), { metric_ids: ['sg_total'], player_id: 'owen', ...(window ? { window } : {}) }, { role: 'coach' });
    return (e.detail as { standing: { window: string; rows: Array<{ player_value: number; window: string; window_label: string; standing_value?: number; gaps: Record<string, number | null>; comparisons: Array<{ kind: string; value: number | null; place: number | null; place_of: number | null; label: string }> }> } }).standing;
  };

  it('defaults to the last 10 rounds: Owen’s -4.16 (not his all-history -3.83), the last-10 team average, and gaps that are value minus reference', async () => {
    const standing = await benchRow(undefined);
    const row = standing.rows[0]!;
    expect(row).toMatchObject({ player_value: -4.16, window: 'last10', window_label: 'the last 10 rounds', standing_value: -3.83 });
    const team = row.comparisons.find((c) => c.kind === 'team')!;
    expect(team).toMatchObject({ value: POOLED.last10, place: 6, place_of: 7, label: 'Team, all players’ last 10 rounds pooled' });
    expect(row.gaps.vs_team).toBe(r2(-4.16 - POOLED.last10));
    expect(row.gaps.vs_tour).toBe(r2(-4.16 - 0));
    expect(standing.window).toMatch(/last 10 rounds/);
    expect(standing.window).toMatch(/level's place is over all recorded rounds/);
  });

  it('with window cache it says all recorded rounds and uses the all-history values throughout', async () => {
    const row = (await benchRow('cache')).rows[0]!;
    expect(row).toMatchObject({ player_value: -3.83, window: 'cache', window_label: 'all recorded rounds' });
    expect(row.comparisons.find((c) => c.kind === 'team')).toMatchObject({ value: r2(mean(PLAYERS.map((p) => p.all))), place: bestFirst('all').indexOf('owen') + 1 });
    expect(row.gaps.vs_team).toBe(r2(-3.83 - mean(PLAYERS.map((p) => p.all))));
    expect(row.standing_value).toBeUndefined();
  });

  it('a metric the rounds do not hold falls back to the standing and says it is over all recorded rounds', async () => {
    const t = tables();
    t.golf_pga_standards!.rows!.push(std('approach_proximity_50_125ft', { pga_tour_value: 18 }));
    t.golf_player_standing!.rows!.push({ player_id: 'owen', metric_id: 'approach_proximity_50_125ft', player_value: 29, level_avg: 27, level_n: 70, level_pct: 40, team_avg: 30, team_n: 7, team_pct: 50, basis: 'all_shot', computed_at: '2026-11-07T02:00:00Z' });
    t.golf_metrics!.rows!.push({ metric_id: 'approach_proximity_50_125ft', display_label: 'Approach Proximity 50-125 yd', unit: 'feet', direction: 'lower_better' });
    const { sb } = pgrst(t);
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx, figures }), { metric_ids: ['approach_proximity_50_125ft'], player_id: 'owen', window: 'last10' }, { role: 'coach' });
    const row = (e.detail as { standing: { rows: Array<{ window: string; window_label: string; player_value: number }> } }).standing.rows[0]!;
    expect(row).toMatchObject({ window: 'cache', window_label: 'all recorded rounds', player_value: 29 });
  });
});

describe('a player’s comparison never mixes windows either', () => {
  it('over the last 10 rounds the team figure is said to be unavailable to a player; over all recorded rounds it is the standing’s, labelled so', async () => {
    const solo = { ...ctx, roster: [person('owen', 'Owen Carter')] };
    const { sb } = pgrst(tables());
    const src = benchmarkSource(sb, 'team-1', { ctx: solo, figures, role: 'player' });
    const last10 = await applyComparisons(await getPlayerMetric(sb, solo, { player_id: 'owen', metric_ids: ['sg_total'], window: 'last10' }, figures), src);
    expect(comparisonOf(last10.measurements[0]!, 'team')).toMatchObject({ value: null, place: null, place_percent: null });
    expect(comparisonOf(last10.measurements[0]!, 'team').note).toMatch(/not available to a player/);
    const all = await applyComparisons(await getPlayerMetric(sb, solo, { player_id: 'owen', metric_ids: ['sg_total'], window: 'cache' }, figures), src);
    expect(comparisonOf(all.measurements[0]!, 'team')).toMatchObject({ value: -2.33, label: 'Team average over all recorded rounds' });
  });
});
