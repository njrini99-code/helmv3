import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { getTeamMetricRanking, type PlayerFigures, type PlayerFiguresSource } from '../read-tools';

// The stats cache said 27.1 putts a round (a window that ended in September, nine-hole rounds counted whole) beside Stats' 32.6.
// A round-based figure now comes from the rounds in the window the question names; the shot-level ones stay the cache's.

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Cole Bennett', first_name: 'Cole', last_name: 'Bennett', graduation_year: null }] } as CoachChatContext;
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
});
