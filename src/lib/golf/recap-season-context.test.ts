import { describe, it, expect, vi } from 'vitest';
import { loadRecapSeasonContext, seasonContextFromRounds } from './recap-season-context';

// OD-03 leak (2026-09-28 audit): the recap compared rounds against
// golf_player_stats_cache, which counted is_test rounds (best_round 37 for a
// player whose real best is 69). The recap now builds its baseline here.

function r(id: string, total: number, over: Record<string, unknown> = {}) {
  return {
    id,
    round_date: '2026-09-01',
    status: 'completed',
    holes_played: 18,
    total_score: total,
    front_nine: Math.floor(total / 2),
    back_nine: total - Math.floor(total / 2),
    total_putts: 30,
    is_test: false,
    ...over,
  };
}

describe('seasonContextFromRounds', () => {
  it('leaves out a countable-looking is_test round', () => {
    const ctx = seasonContextFromRounds([r('qa', 60, { is_test: true }), r('a', 74), r('b', 76)], 'current');
    expect(ctx).toEqual({ scoring_average: 75, best_round: 74, rounds_played: 2 });
  });

  it('leaves out the implausible 37 and hole-less rounds', () => {
    const ctx = seasonContextFromRounds(
      [r('sep17', 37, { front_nine: 19, back_nine: 18 }), r('holeless', 70, { front_nine: null, back_nine: null }), r('a', 71)],
      'current',
    );
    expect(ctx).toEqual({ scoring_average: 71, best_round: 71, rounds_played: 1 });
  });

  it('leaves out the round being recapped, so a new low can be a new low', () => {
    const ctx = seasonContextFromRounds([r('current', 68), r('a', 71), r('b', 73)], 'current');
    expect(ctx?.best_round).toBe(71);
  });

  it('is null when nothing else counts', () => {
    expect(seasonContextFromRounds([r('current', 72), r('qa', 72, { is_test: true })], 'current')).toBeNull();
  });
});

describe('loadRecapSeasonContext', () => {
  function fakeClient(rows: unknown[]) {
    const eqs: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (c: string, v: unknown) => {
        eqs.push([c, v]);
        return builder;
      },
      order: () => builder,
      limit: async () => ({ data: rows, error: null }),
    };
    const from = vi.fn(() => builder);
    return { client: { from } as never, eqs, from };
  }

  it('reads only non-test completed rounds for the player', async () => {
    const { client, eqs } = fakeClient([r('a', 74)]);
    const ctx = await loadRecapSeasonContext(client, { ...r('current', 72), player_id: 'P' });
    expect(eqs).toEqual([
      ['player_id', 'P'],
      ['is_test', false],
      ['status', 'completed'],
    ]);
    expect(ctx).toEqual({ scoring_average: 74, best_round: 74, rounds_played: 1 });
  });

  it('makes no read and no comparison for a non-countable round', async () => {
    const { client, from } = fakeClient([r('a', 74)]);
    const ctx = await loadRecapSeasonContext(client, {
      ...r('91301a75', 37, { front_nine: 19, back_nine: 18 }),
      total_putts: 18,
      player_id: 'P',
    });
    expect(ctx).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
