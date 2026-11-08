import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { comparePlayers, getPlayerMetric, getTeamMetricRanking, type PlayerFigures, type PlayerFiguresSource } from '../read-tools';

// The stats cache said 27.1 putts a round (a window that ended in September, nine-hole rounds counted whole) beside Stats' 32.6.
// A round-based figure now comes from the rounds in the window the question names; the shot-level ones stay the cache's.

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Cole Bennett', first_name: 'Cole', last_name: 'Bennett', graduation_year: null }] } as CoachChatContext;

const cacheRow = { player_id: 'p1', putts_per_round: 27.07, scoring_average: 76, gir_percentage: 55, greens_total: 400, rounds_in_calculation: 23, calculation_period_start: '2026-05-18', calculation_period_end: '2026-09-26', updated_at: '2026-09-29T02:20:34.950Z' };
function sbWith(row: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(resolve);
  return { from: () => chain } as never;
}

const figures = (over: Partial<PlayerFigures> = {}): PlayerFigures => ({
  rounds: 10, hole_rounds: 8, sg_rounds: 8, scoring_average: 76.3, putts_per_round: 32.625, putt_rounds: 8, sg_total: -7.31,
  legs: { tee: -1.145, approach: -3.6, around: 0.51, putting: -3.07 }, gir_pct: 51.7, gir_holes: 144, fairway_pct: 57.1, fairway_holes: 112,
  window_start: '2026-08-25', window_end: '2026-10-21', ...over,
});
/** The route's loader, as a test sees it: these figures for whoever is asked about. */
const source = (make: (id: string) => PlayerFigures, asked: string[] = []): PlayerFiguresSource => async (ids, window) => {
  asked.push(window);
  return new Map(ids.map((id) => [id, make(id)]));
};

describe('get_player_metrics reads round-based figures from the window the question names', () => {
  it('putts per round is the rounds’, with the window it covers, not the cache’s', async () => {
    const asked: string[] = [];
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'], window: 'last10' }, source(() => figures(), asked));
    expect(asked).toEqual(['last10']);
    expect(env.measurements[0]).toMatchObject({ metric_id: 'putts_per_round', value: 32.63, sample_size: 8, window_start: '2026-08-25', window_end: '2026-10-21', source: 'rounds' });
    expect(env.summary).toMatch(/newest ten rounds/);
  });

  it('"this season" is one window for every figure in the read, and the summary says so', async () => {
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round', 'scoring_average', 'sg_putting'], window: 'season' }, source(() => figures({ rounds: 13, window_start: '2026-08-21' })));
    expect(new Set(env.measurements.map((m) => `${m.window_start}|${m.window_end}`)).size).toBe(1);
    expect(env.measurements.map((m) => m.metric_id)).toEqual(['putts_per_round', 'scoring_average', 'sg_putting']);
    expect(env.summary).toMatch(/this season/);
  });

  it('a shot-level figure stays the cache’s and says the cache’s window', async () => {
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round', 'putt_make_pct_3_5ft' as never] }, source(() => figures()));
    expect(env.measurements.map((m) => m.metric_id)).toEqual(['putts_per_round']);
  });

  it('window "cache" and a read with no source are the cache, as before', async () => {
    const viaCache = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'], window: 'cache' }, source(() => figures()));
    expect(viaCache.measurements[0]).toMatchObject({ value: 27.07, source: 'stats cache' });
    const noSource = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'] });
    expect(noSource.measurements[0]?.value).toBe(27.07);
  });

  it('a window that cannot be read falls back to the cache rather than saying nothing', async () => {
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'], window: 'last10' }, async () => null);
    expect(env.measurements[0]).toMatchObject({ value: 27.07, source: 'stats cache' });
  });
});

describe('the same window for the whole team, and for a comparison', () => {
  const rows = [
    { player_id: 'p1', putts_per_round: 27.07, rounds_in_calculation: 23, calculation_period_start: '2026-05-18', calculation_period_end: '2026-09-26', updated_at: '2026-09-29T00:00:00Z' },
    { player_id: 'p2', putts_per_round: 30.5, rounds_in_calculation: 14, calculation_period_start: '2026-05-18', calculation_period_end: '2026-09-26', updated_at: '2026-09-29T00:00:00Z' },
  ];
  const two = { ...ctx, roster: [...ctx.roster, { id: 'p2', name: 'Owen Carter', first_name: 'Owen', last_name: 'Carter', graduation_year: null }] } as CoachChatContext;
  const byPlayer = (id: string) => figures(id === 'p1' ? { putts_per_round: 32.625, putt_rounds: 8 } : { putts_per_round: 31.1, putt_rounds: 9 });

  it('a ranking reads every player over one window, from the rounds', async () => {
    const asked: string[] = [];
    const env = await getTeamMetricRanking(sbWith(rows), two, { metric_id: 'putts_per_round', window: 'last10' }, source(byPlayer, asked));
    expect(asked).toEqual(['last10']);
    expect(env.measurements.map((m) => [m.entity.label, m.value, m.source])).toEqual([['Owen Carter', 31.1, 'rounds'], ['Cole Bennett', 32.63, 'rounds']]);
    expect(new Set(env.measurements.map((m) => `${m.window_start}|${m.window_end}`)).size).toBe(1);
    expect(env.summary).toMatch(/newest ten rounds/);
  });

  it('a comparison does too, and a cache read is still available by name', async () => {
    const env = await comparePlayers(sbWith(rows), two, { player_ids: ['p1', 'p2'], metric_ids: ['putts_per_round'], window: 'season' }, source(byPlayer));
    expect(env.measurements.map((m) => [m.entity.label, m.value, m.source])).toEqual([['Cole Bennett', 32.63, 'rounds'], ['Owen Carter', 31.1, 'rounds']]);
    const cache = await comparePlayers(sbWith(rows), two, { player_ids: ['p1', 'p2'], metric_ids: ['putts_per_round'], window: 'cache' }, source(byPlayer));
    expect(cache.measurements.map((m) => m.value)).toEqual([27.07, 30.5]);
  });

  it('greens and fairways are the rounds’ pooled rates, with the holes behind them', async () => {
    const env = await getPlayerMetric(sbWith(rows[0]), ctx, { player_id: 'p1', metric_ids: ['gir_pct', 'driving_accuracy_pct'] }, source(() => figures()));
    expect(env.measurements.map((m) => [m.metric_id, m.value, m.sample_size, m.sample_unit, m.denominator])).toEqual([['gir_pct', 51.7, 144, 'holes', 144], ['driving_accuracy_pct', 57.1, 112, 'holes', 112]]);
  });
});
