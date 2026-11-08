import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { getPlayerMetric, type PlayerFigures } from '../read-tools';

// The stats cache said 27.1 putts a round (a window that ended in September, nine-hole rounds counted whole) beside Stats' 32.6.
// A round-based figure now comes from the rounds in the window the question names; the shot-level ones stay the cache's.

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Cole Bennett', first_name: 'Cole', last_name: 'Bennett', graduation_year: null }] } as CoachChatContext;

const cacheRow = { player_id: 'p1', putts_per_round: 27.07, scoring_average: 76, gir_percentage: 55, greens_total: 400, rounds_in_calculation: 23, calculation_period_start: '2026-05-18', calculation_period_end: '2026-09-26', updated_at: '2026-09-29T02:20:34.950Z' };
function sbWith(row: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'maybeSingle']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: row, error: null }).then(resolve);
  return { from: () => chain } as never;
}

const figures = (over: Partial<PlayerFigures> = {}): PlayerFigures => ({
  rounds: 10, hole_rounds: 8, sg_rounds: 8, scoring_average: 76.3, putts_per_round: 32.625, putt_rounds: 8, sg_total: -7.31,
  legs: { tee: -1.145, approach: -3.6, around: 0.51, putting: -3.07 }, window_start: '2026-08-25', window_end: '2026-10-21', ...over,
});

describe('get_player_metrics reads round-based figures from the window the question names', () => {
  it('putts per round is the rounds’, with the window it covers, not the cache’s', async () => {
    const asked: string[] = [];
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'], window: 'last10' }, async (_id, window) => {
      asked.push(window);
      return figures();
    });
    expect(asked).toEqual(['last10']);
    expect(env.measurements[0]).toMatchObject({ metric_id: 'putts_per_round', value: 32.63, sample_size: 8, window_start: '2026-08-25', window_end: '2026-10-21', source: 'rounds' });
    expect(env.summary).toMatch(/newest ten rounds/);
  });

  it('"this season" is one window for every figure in the read, and the summary says so', async () => {
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round', 'scoring_average', 'sg_putting'], window: 'season' }, async () => figures({ rounds: 13, window_start: '2026-08-21' }));
    expect(new Set(env.measurements.map((m) => `${m.window_start}|${m.window_end}`)).size).toBe(1);
    expect(env.measurements.map((m) => m.metric_id)).toEqual(['putts_per_round', 'scoring_average', 'sg_putting']);
    expect(env.summary).toMatch(/this season/);
  });

  it('a shot-level figure stays the cache’s and says the cache’s window', async () => {
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round', 'gir_pct'] }, async () => figures());
    const gir = env.measurements.find((m) => m.metric_id === 'gir_pct')!;
    expect(gir).toMatchObject({ source: 'stats cache', window_start: '2026-05-18', window_end: '2026-09-26' });
  });

  it('window "cache" and a read with no source are the cache, as before', async () => {
    const viaCache = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'], window: 'cache' }, async () => figures());
    expect(viaCache.measurements[0]).toMatchObject({ value: 27.07, source: 'stats cache' });
    const noSource = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'] });
    expect(noSource.measurements[0]?.value).toBe(27.07);
  });

  it('a window that cannot be read falls back to the cache rather than saying nothing', async () => {
    const env = await getPlayerMetric(sbWith(cacheRow), ctx, { player_id: 'p1', metric_ids: ['putts_per_round'], window: 'last10' }, async () => null);
    expect(env.measurements[0]).toMatchObject({ value: 27.07, source: 'stats cache' });
  });
});
