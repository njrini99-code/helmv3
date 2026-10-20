import { describe, it, expect } from 'vitest';
import {
  isWindowedMetric,
  aggregateWindowMetric,
  loadPlayerWindowRounds,
  type WindowRound,
} from '../window-metric';

/** Build a WindowRound with all-null stats, overriding only what a test needs. */
function round(partial: Partial<WindowRound>): WindowRound {
  return {
    round_date: '2026-06-01',
    strokes_gained_total: null,
    strokes_gained_putting: null,
    strokes_gained_tee: null,
    strokes_gained_approach: null,
    strokes_gained_around_green: null,
    greens_hit: null,
    greens_total: null,
    sand_saves: null,
    sand_attempts: null,
    penalty_strokes: null,
    ...partial,
  };
}

describe('isWindowedMetric', () => {
  it('covers the per-round-cache-backed metrics', () => {
    for (const m of [
      'sg_total',
      'sg_putting',
      'sg_ott',
      'sg_approach',
      'sg_around_green',
      'gir_pct',
      'scrambling_pct_sand',
      'penalty_rate_per_round',
    ] as const) {
      expect(isWindowedMetric(m)).toBe(true);
    }
  });

  it('excludes metrics that need shot-level methodology (caller falls back to standing)', () => {
    for (const m of [
      'putts_made_10_15ft_pct',
      'approach_proximity_175_plus_ft',
      'scoring_par_4',
      'putt_miss_bias_left_pct',
      'scrambling_pct_rough',
    ] as const) {
      expect(isWindowedMetric(m)).toBe(false);
    }
  });
});

describe('aggregateWindowMetric — strokes gained = mean of per-round SG', () => {
  it('averages the per-round column and ignores null rounds', () => {
    const rounds = [
      round({ strokes_gained_putting: 0.2 }),
      round({ strokes_gained_putting: 0.6 }),
      round({ strokes_gained_putting: null }), // no SG yet → excluded
      round({ strokes_gained_putting: 0.4 }),
    ];
    expect(aggregateWindowMetric('sg_putting', rounds)).toBeCloseTo(0.4, 6);
  });

  it('maps sg_ott to the strokes_gained_tee column', () => {
    const rounds = [round({ strokes_gained_tee: 0.1 }), round({ strokes_gained_tee: 0.3 })];
    expect(aggregateWindowMetric('sg_ott', rounds)).toBeCloseTo(0.2, 6);
  });

  it('is NOT diluted by career history — only window rounds are passed in', () => {
    // 10 in-window rounds at +0.5 SG putting → 0.5, regardless of a long career
    // average near 0. (The caller only ever passes window rounds here.)
    const rounds = Array.from({ length: 10 }, () => round({ strokes_gained_putting: 0.5 }));
    expect(aggregateWindowMetric('sg_putting', rounds)).toBeCloseTo(0.5, 6);
  });
});

describe('aggregateWindowMetric — rate stats pool numerator/denominator', () => {
  it('gir_pct pools greens hit / greens total across rounds', () => {
    const rounds = [
      round({ greens_hit: 9, greens_total: 18 }),
      round({ greens_hit: 12, greens_total: 18 }),
    ];
    // (9 + 12) / (18 + 18) = 21/36 = 58.33%
    expect(aggregateWindowMetric('gir_pct', rounds)).toBeCloseTo(58.3333, 3);
  });

  it('scrambling_pct_sand pools sand saves / sand attempts', () => {
    const rounds = [
      round({ sand_saves: 1, sand_attempts: 2 }),
      round({ sand_saves: 2, sand_attempts: 3 }),
    ];
    // (1 + 2) / (2 + 3) = 60%
    expect(aggregateWindowMetric('scrambling_pct_sand', rounds)).toBeCloseTo(60, 6);
  });

  it('penalty_rate_per_round is the mean penalties per round', () => {
    const rounds = [
      round({ penalty_strokes: 0 }),
      round({ penalty_strokes: 2 }),
      round({ penalty_strokes: 1 }),
    ];
    expect(aggregateWindowMetric('penalty_rate_per_round', rounds)).toBeCloseTo(1, 6);
  });
});

describe('aggregateWindowMetric — honest nulls (never fabricate)', () => {
  it('returns null for an empty window', () => {
    expect(aggregateWindowMetric('sg_total', [])).toBeNull();
    expect(aggregateWindowMetric('gir_pct', [])).toBeNull();
  });

  it('returns null when a rate stat has a zero denominator', () => {
    const rounds = [round({ greens_hit: 0, greens_total: 0 })];
    expect(aggregateWindowMetric('gir_pct', rounds)).toBeNull();
    expect(aggregateWindowMetric('scrambling_pct_sand', [round({ sand_saves: 0, sand_attempts: 0 })])).toBeNull();
  });

  it('returns null for a non-windowable metric', () => {
    expect(aggregateWindowMetric('putts_made_10_15ft_pct', [round({})])).toBeNull();
  });
});

describe('loadPlayerWindowRounds — countable rounds only, optional upper bound', () => {
  function fakeClient(rounds: Record<string, unknown>[], stats: Record<string, unknown>[]) {
    const calls: Array<[string, unknown]> = [];
    const chain = (data: unknown[]) => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'lt', 'in']) {
        b[m] = (...args: unknown[]) => {
          calls.push([m, args]);
          return b;
        };
      }
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null });
      return b;
    };
    return {
      calls,
      client: { from: (t: string) => chain(t === 'golf_rounds' ? rounds : stats) },
    };
  }
  const full = { holes_played: 18, total_score: 74, front_nine: 37, back_nine: 37, total_putts: 31 };
  const statRow = (round_id: string, sg: number) => ({
    round_id, strokes_gained_total: sg, strokes_gained_putting: sg, strokes_gained_tee: null,
    strokes_gained_approach: null, strokes_gained_around_green: null, greens_hit: null,
    greens_total: null, sand_saves: null, sand_attempts: null, penalty_strokes: 0,
  });

  it('drops implausible and hole-less rounds so they cannot move a windowed goal', async () => {
    const { client } = fakeClient(
      [
        { id: 'ok', round_date: '2026-09-10', ...full },
        // The Sep 17 round: 18 scored holes summing to 37, SG +34.51.
        { id: 'implausible', round_date: '2026-09-17', holes_played: 18, total_score: 37, front_nine: 19, back_nine: 18, total_putts: 18 },
        { id: 'holeless', round_date: '2026-09-18', holes_played: 18, total_score: 73, front_nine: null, back_nine: null, total_putts: null },
      ],
      [statRow('ok', -1.5), statRow('implausible', 34.51), statRow('holeless', -1)],
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadPlayerWindowRounds(client as any, 'p1', '2026-09-01T00:00:00Z');
    expect(rows.map((r) => r.strokes_gained_total)).toEqual([-1.5]);
  });

  it('bounds the window above when untilIso is given', async () => {
    const { client, calls } = fakeClient([], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadPlayerWindowRounds(client as any, 'p1', '2026-06-01T00:00:00Z', '2026-09-01T10:00:00Z');
    expect(calls).toContainEqual(['lt', ['round_date', '2026-09-01']]);
  });
});
