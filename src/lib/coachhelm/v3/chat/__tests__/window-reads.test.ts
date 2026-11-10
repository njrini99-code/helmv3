import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import { getPlayerWeakestAreas, getPuttingDistanceProfile, type PlayerFigures, type PuttBandsRead } from '../read-tools';
import { person, pgrst } from './pgrst-double';

const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Varsity',
  timezone: 'America/New_York',
  roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett'), person('p3', 'Max Dole'), person('p4', 'Ian Frost'), person('p5', 'Leo Park')],
};

const bands = (counts: Array<[made: number, attempts: number]>): PuttBandsRead => ({
  bands: ['0–3 ft', '3–5 ft', '5–10 ft', '10–15 ft', '15–25 ft', '25+ ft'].map((label, i) => ({ label, made: counts[i]![0], attempts: counts[i]![1] })),
  rounds: 9,
  window_start: '2026-10-01',
  window_end: '2026-11-04',
});
const SIX = bands([[57, 64], [24, 38], [20, 51], [8, 40], [5, 46], [1, 34]]);

const cacheRow = (player_id: string, over: Record<string, unknown> = {}) => ({
  player_id,
  rounds_played: 30,
  rounds_in_calculation: 30,
  calculation_period_start: '2026-05-18',
  calculation_period_end: '2026-09-26',
  updated_at: '2026-09-27T00:00:00Z',
  is_stale: false,
  putt_make_pct_3_5ft: 91,
  putt_attempts_3_5ft: 120,
  putt_make_pct_5_10ft: 40,
  putt_attempts_5_10ft: 150,
  sand_save_percentage: 20,
  sand_attempts: 30,
  ...over,
});

describe('get_putting_distance_profile', () => {
  it('reads the window’s own putts in the Stats bands, not the stats cache, and says the window', async () => {
    const { sb, of } = pgrst({ golf_player_stats_cache: { rows: [cacheRow('p1')] } });
    const source = vi.fn(async () => SIX);
    const e = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1', window: 'last10' }, source);
    expect(source).toHaveBeenCalledWith('p1', 'last10');
    expect(of('golf_player_stats_cache')).toEqual([]);
    expect(e.summary).toBe('Owen Carter\'s make rate by putt distance over the newest ten rounds.');
    const m = Object.fromEntries(e.measurements.map((x) => [x.metric_id, x]));
    expect(Object.keys(m)).toEqual(['putt_make_pct_0-3 ft', 'putt_make_pct_3-5 ft', 'putt_make_pct_5-10 ft', 'putt_make_pct_10-15 ft', 'putt_make_pct_15-25 ft', 'putt_make_pct_25+ ft']);
    // 24 of 38, as Stats prints it (one decimal), with the 38 beside it.
    expect(m['putt_make_pct_3-5 ft']).toMatchObject({ value: 63.2, sample_size: 38, denominator: 38, sample_unit: 'attempts', source: 'shots', window_start: '2026-10-01', window_end: '2026-11-04' });
    expect(e.series[0]!.points).toHaveLength(6);
    expect(e.series[0]!.coverage_note).toMatch(/From 9 rounds/);
    expect(e.coverage).toBe('complete');
  });

  it('names the other windows, and leaves out a band with no putts', async () => {
    const { sb } = pgrst({});
    const season = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1', window: 'season' }, async () => bands([[0, 0], [24, 38], [0, 0], [8, 12], [0, 0], [1, 8]]));
    expect(season.summary).toMatch(/this season\.$/);
    expect(season.series[0]!.points.map((p) => p.bucket)).toEqual(['3-5 ft', '10-15 ft', '25+ ft']);
    // 12 putts is under 30 but shown; 8 is under the 10 floor and is flagged as small.
    expect(season.series[0]!.coverage_note).toMatch(/Small samples in 25\+ ft \(8 attempts\)/);
    expect(season.coverage).toBe('partial');
  });

  it('says so when the window has no putts', async () => {
    const { sb } = pgrst({});
    const e = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1', window: 'last5' }, async () => bands([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]));
    expect(e.coverage).toBe('empty');
    expect(e.measurements).toEqual([]);
  });

  it('keeps cache as an explicit fallback that labels its window, and does not ask the rounds', async () => {
    const { sb } = pgrst({ golf_player_stats_cache: { rows: [cacheRow('p1')] } });
    const source = vi.fn(async () => SIX);
    const e = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1', window: 'cache' }, source);
    expect(source).not.toHaveBeenCalled();
    expect(e.summary).toMatch(/from the stats cache/);
    expect(e.series[0]!.coverage_note).toMatch(/stats cache, which can lag a few weeks and covers its own window/);
    expect(e.measurements[0]).toMatchObject({ source: 'stats cache', window_start: '2026-05-18', window_end: '2026-09-26' });
  });

  it('falls back to the cache, partial and saying why, when the rounds cannot be read', async () => {
    const { sb } = pgrst({ golf_player_stats_cache: { rows: [cacheRow('p1')] } });
    const e = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1' }, async () => null);
    expect(e.coverage).toBe('partial');
    expect(e.series[0]!.coverage_note).toMatch(/rounds could not be read/);
  });

  it('is the cache when no source is handed in (the old Ask), and refuses a player off the roster', async () => {
    const { sb } = pgrst({ golf_player_stats_cache: { rows: [cacheRow('p1')] } });
    expect((await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1' })).measurements[0]!.source).toBe('stats cache');
    await expect(getPuttingDistanceProfile(sb, ctx, { player_id: 'stranger' }, async () => SIX)).rejects.toMatchObject({ status: 403 });
  });
});

describe('get_player_weakest_areas', () => {
  const fig = (putts: number, over: Partial<PlayerFigures> = {}): PlayerFigures => ({
    rounds: 10,
    hole_rounds: 10,
    scoring_average: 74,
    putts_per_round: putts,
    putt_rounds: 10,
    sg_total: -1,
    sg_rounds: 10,
    legs: { tee: 0, approach: 0, around: 0, putting: 0 },
    gir_pct: 60,
    gir_holes: 180,
    fairway_pct: 60,
    fairway_holes: 140,
    window_start: '2026-10-01',
    window_end: '2026-11-04',
    ...over,
  });
  const figures = (map: Record<string, PlayerFigures>) => vi.fn(async (ids: string[]) => new Map(ids.flatMap((id) => (map[id] ? [[id, map[id]!] as const] : []))));
  const cache = { golf_player_stats_cache: { rows: [cacheRow('p1', { sand_save_percentage: 10 }), cacheRow('p2'), cacheRow('p3'), cacheRow('p4'), cacheRow('p5')] } };

  it('compares the player with the team over the same window, from the rounds, one read for the roster', async () => {
    const { sb } = pgrst(cache);
    const source = figures({ p1: fig(33, { gir_pct: 50 }), p2: fig(30), p3: fig(30), p4: fig(30), p5: fig(30) });
    const e = await getPlayerWeakestAreas(sb, ctx, { player_id: 'p1', window: 'last10' }, source);
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith(['p1', 'p2', 'p3', 'p4', 'p5'], 'last10');
    const d = e.detail as { window: string; gaps: Array<{ metric_id: string; player_value: number; team_average: number; gap: number; measured_from: string }> };
    expect(d.window).toBe('last10');
    const putts = d.gaps.find((g) => g.metric_id === 'putts_per_round')!;
    expect(putts).toMatchObject({ player_value: 33, team_average: 30, gap: 3 });
    expect(putts.measured_from).toMatch(/rounds, over the newest ten rounds/);
    expect(d.gaps.find((g) => g.metric_id === 'gir_pct')).toMatchObject({ player_value: 50, team_average: 60, gap: 10 });
    expect(e.measurements.find((m) => m.metric_id === 'putts_per_round')).toMatchObject({ source: 'rounds', window_start: '2026-10-01' });
  });

  it('marks the shot-level areas it can only take from the cache, with its own window', async () => {
    const { sb } = pgrst(cache);
    const e = await getPlayerWeakestAreas(sb, ctx, { player_id: 'p1' }, figures({ p1: fig(30), p2: fig(30), p3: fig(30), p4: fig(30), p5: fig(30) }));
    const d = e.detail as { gaps: Array<{ metric_id: string; measured_from: string }> };
    const sand = d.gaps.find((g) => g.metric_id === 'sand_save_pct')!;
    expect(sand.measured_from).toBe('stats cache');
    expect(e.coverage).toBe('complete');
    expect(e.coverage_note).toMatch(/marked "stats cache"/);
    expect(e.measurements.find((m) => m.metric_id === 'sand_save_pct')).toMatchObject({ source: 'stats cache', window_end: '2026-09-26' });
  });

  it('uses only teammates who have rounds in the window, and needs three of them', async () => {
    const { sb } = pgrst(cache);
    const none = { ...fig(30), rounds: 0, putts_per_round: null, putt_rounds: 0, gir_pct: null, gir_holes: 0, scoring_average: null, sg_total: null, sg_rounds: 0, legs: { tee: null, approach: null, around: null, putting: null }, fairway_pct: null, fairway_holes: 0 };
    const e = await getPlayerWeakestAreas(sb, ctx, { player_id: 'p1', window: 'last5' }, figures({ p1: fig(33), p2: fig(30), p3: fig(30), p4: none, p5: none }));
    const ids = (e.detail as { gaps: Array<{ metric_id: string }> }).gaps.map((g) => g.metric_id);
    expect(ids).not.toContain('putts_per_round');
  });

  it('asks the cache alone for window "cache", and says every gap is the cache’s', async () => {
    const { sb } = pgrst({ golf_player_stats_cache: { rows: [cacheRow('p1', { putts_per_round: 33 }), cacheRow('p2', { putts_per_round: 30 }), cacheRow('p3', { putts_per_round: 30 }), cacheRow('p4', { putts_per_round: 30 })] } });
    const source = figures({});
    const e = await getPlayerWeakestAreas(sb, ctx, { player_id: 'p1', window: 'cache' }, source);
    expect(source).not.toHaveBeenCalled();
    expect((e.detail as { window: string }).window).toBe('cache');
    expect(e.measurements.every((m) => m.source === 'stats cache')).toBe(true);
  });

  it('says the rounds could not be read, partial, when the source fails and the cache stands in', async () => {
    const { sb } = pgrst(cache);
    const e = await getPlayerWeakestAreas(sb, ctx, { player_id: 'p1' }, async () => null);
    expect(e.coverage).toBe('partial');
    expect(e.coverage_note).toMatch(/rounds could not be read/);
  });

  it('refuses a player off the roster', async () => {
    await expect(getPlayerWeakestAreas(pgrst(cache).sb, ctx, { player_id: 'stranger' }, figures({}))).rejects.toMatchObject({ status: 403 });
  });
});
