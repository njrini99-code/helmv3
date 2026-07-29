/**
 * W35 — pure-logic tests for the causality layer.
 *
 * computeAttribution hits Supabase, so the integration is covered by
 * the prod-smoke after deploy. nextWeight (the Bayesian EMA) is pure
 * and the most critical correctness target: a sign flip here ranks
 * insights backwards across every team. Lock it down.
 *
 * W35 follow-up: the metric-sources dispatch table is now the single
 * source of truth for "which DB column averages this metric." We test:
 *  - the registry-coverage invariant (every canonical MetricId has a
 *    source or is intentionally null — drift here means the cron will
 *    silently skip insights at runtime).
 *  - the existing `score_to_par` path is preserved exactly (regression).
 *  - `computeAttribution` short-circuits for intentional-null /
 *    unknown-metric BEFORE making any DB roundtrips.
 *  - the SG round-column path averages correctly.
 *  - the ratio path (gir_pct, scrambling_pct_sand) uses
 *    Σ numerator / Σ denominator, not a per-round mean of percentages.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  averageInWindow,
  computeAttribution,
  nextWeight,
} from '@/lib/coachhelm/v3/causality/attribute';
import {
  METRIC_SOURCE,
  METRIC_SOURCE_ALIASES,
  lookupMetricSource,
  __INSIGHT_CATEGORY_METRIC_PREFIXES,
  type MetricSourceDef,
} from '@/lib/coachhelm/v3/causality/metric-sources';
import {
  METRIC_IDS,
  getMetricDirection,
  improvementSign,
} from '@/lib/coachhelm/v3/metrics/registry';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';

describe('nextWeight (EMA over signed lifts)', () => {
  it('returns unchanged when lift is null (no signal)', () => {
    const prev = { weight: 1.2, sample_n: 4 };
    expect(nextWeight(prev, null)).toEqual(prev);
  });

  it('moves toward 1.5 when lift is positive (insight worked)', () => {
    const prev = { weight: 1.0, sample_n: 0 };
    const next = nextWeight(prev, 0.5);
    expect(next.weight).toBeGreaterThan(1.0);
    expect(next.sample_n).toBe(1);
  });

  it('moves toward 0.5 when lift is negative (insight didn\'t help)', () => {
    const prev = { weight: 1.0, sample_n: 0 };
    const next = nextWeight(prev, -0.3);
    expect(next.weight).toBeLessThan(1.0);
    expect(next.sample_n).toBe(1);
  });

  it('clamps at upper bound 2.0 after many positive signals', () => {
    let w = { weight: 1.0, sample_n: 0 };
    for (let i = 0; i < 50; i++) w = nextWeight(w, 1.0);
    expect(w.weight).toBeLessThanOrEqual(2.0);
    expect(w.weight).toBeGreaterThan(1.4);
  });

  it('clamps at lower bound 0.25 after many negative signals', () => {
    let w = { weight: 1.0, sample_n: 0 };
    for (let i = 0; i < 50; i++) w = nextWeight(w, -1.0);
    expect(w.weight).toBeGreaterThanOrEqual(0.25);
    expect(w.weight).toBeLessThan(0.7);
  });

  it('alpha shrinks with sample_n (later updates change weight less)', () => {
    const early = nextWeight({ weight: 1.0, sample_n: 0 }, 1.0);
    const late = nextWeight({ weight: 1.0, sample_n: 100 }, 1.0);
    const earlyDelta = Math.abs(early.weight - 1.0);
    const lateDelta = Math.abs(late.weight - 1.0);
    expect(lateDelta).toBeLessThan(earlyDelta);
  });

  it('Phase H/H4: a LARGER positive lift pushes weight further than a small one (magnitude-aware)', () => {
    // Same prior, same sample_n — only the lift magnitude differs. The binary
    // 1.5/0.5 design failed this (both went to exactly the same place).
    const small = nextWeight({ weight: 1.0, sample_n: 0 }, 0.1);
    const large = nextWeight({ weight: 1.0, sample_n: 0 }, 2.0);
    expect(large.weight).toBeGreaterThan(small.weight);
  });

  it('Phase H/H4: a LARGER negative lift pushes weight further down than a small one', () => {
    const small = nextWeight({ weight: 1.0, sample_n: 0 }, -0.1);
    const large = nextWeight({ weight: 1.0, sample_n: 0 }, -2.0);
    expect(large.weight).toBeLessThan(small.weight);
  });

  it('Phase H/H4: target saturates — a 2-stroke and a 20-stroke lift land close together', () => {
    // tanh saturation: a single freak round can't dominate the weight.
    const big = nextWeight({ weight: 1.0, sample_n: 0 }, 2.0);
    const absurd = nextWeight({ weight: 1.0, sample_n: 0 }, 20.0);
    expect(Math.abs(absurd.weight - big.weight)).toBeLessThan(0.1);
  });

  it('Phase H/H4: a ~1-stroke lift targets ≈1.76 (1 + tanh(1)) on the first sample', () => {
    // sample_n=0 → alpha=1 → next ≈ target exactly.
    const next = nextWeight({ weight: 1.0, sample_n: 0 }, 1.0);
    expect(next.weight).toBeCloseTo(1 + Math.tanh(1), 3); // ≈1.7616
  });

  it('ignores non-finite lift values defensively', () => {
    const prev = { weight: 1.0, sample_n: 5 };
    expect(nextWeight(prev, Number.NaN)).toEqual(prev);
    expect(nextWeight(prev, Number.POSITIVE_INFINITY)).toEqual(prev);
  });
});

describe('P0-01: metric direction resolver (registry)', () => {
  it('every canonical metric direction matches the standing render-config direction', () => {
    // Registry direction is the source of truth for attribution; metric-config
    // is the render-side mirror. They MUST agree or a bar would draw "up" while
    // attribution learns "down". Catch drift between the two TS maps.
    for (const id of METRIC_IDS) {
      expect(getMetricDirection(id)).toBe(METRIC_RENDER_CONFIG[id].direction);
    }
  });

  it('improvementSign is -1 for lower-is-better, +1 for higher-is-better', () => {
    expect(improvementSign('scoring_par_4')).toBe(-1);
    expect(improvementSign('penalty_rate_per_round')).toBe(-1);
    expect(improvementSign('big_number_rate')).toBe(-1);
    expect(improvementSign('sg_total')).toBe(1);
    expect(improvementSign('gir_pct')).toBe(1);
  });

  it('resolves the score_to_par alias as lower-is-better', () => {
    expect(getMetricDirection('score_to_par')).toBe('lower_better');
    expect(improvementSign('score_to_par')).toBe(-1);
  });

  it('resolves the fairways_hit_pct alias as higher-is-better', () => {
    expect(getMetricDirection('fairways_hit_pct')).toBe('higher_better');
    expect(improvementSign('fairways_hit_pct')).toBe(1);
  });

  it('defaults unknown metrics to higher-is-better (sign +1)', () => {
    expect(getMetricDirection('totally_made_up_metric_xyz')).toBe('higher_better');
    expect(improvementSign('totally_made_up_metric_xyz')).toBe(1);
  });
});

describe('METRIC_SOURCE registry coverage (drift catcher)', () => {
  it('covers every canonical MetricId — no silent drops', () => {
    const missing: string[] = [];
    for (const id of METRIC_IDS) {
      const def: MetricSourceDef | undefined = METRIC_SOURCE[id];
      if (!def) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('classifies every metric into a known kind', () => {
    const validKinds = new Set([
      'rounds',
      'round_stats_cache_avg',
      'round_stats_cache_ratio',
      'round_stats_cache_computed',
      'hole_level_avg',
      'intentional-null',
    ]);
    for (const id of METRIC_IDS) {
      const def = METRIC_SOURCE[id];
      expect(validKinds.has(def.kind)).toBe(true);
    }
  });

  it('requires every intentional-null entry to carry a reason code', () => {
    for (const id of METRIC_IDS) {
      const def = METRIC_SOURCE[id];
      if (def.kind === 'intentional-null') {
        expect(def.reason).toBeTruthy();
        expect(typeof def.reason).toBe('string');
      }
    }
  });

  it('lookupMetricSource resolves canonical ids', () => {
    expect(lookupMetricSource('sg_total')).toBeTruthy();
    expect(lookupMetricSource('gir_pct')).toBeTruthy();
    expect(lookupMetricSource('scoring_par_4')).toBeTruthy();
  });

  it('lookupMetricSource honours the score_to_par alias', () => {
    // Not in METRIC_IDS, but the insight surface emits it for legacy
    // surfaces; preserved as an alias so the cron stays backwards-compat.
    const def = lookupMetricSource('score_to_par');
    expect(def).toEqual({ kind: 'rounds', column: 'score_to_par' });
  });

  it('lookupMetricSource returns null for unknown metrics', () => {
    expect(lookupMetricSource('totally_made_up_metric_xyz')).toBeNull();
  });

  it('lookupMetricSource classifies v2-mining legacy metric families as intentional-null', () => {
    // v2 mining (`src/lib/coachhelm/v2/mining/*`) and retired generators
    // emit per-bucket metric names that the v3 attribution cron cannot
    // attribute today (no per-round shot-level cache). They must resolve
    // to intentional-null so the cron stops logging registry-drift
    // warnings to Sentry for them — see metric-sources.ts comment.
    const legacy = [
      'approach_severity_<150',
      'approach_severity_150_175',
      'approach_severity_175_200',
      'approach_severity_200+',
      'approach_direction_<150_left',
      'approach_direction_200+_right',
      'approach_miss_lie_150_175_fairway',
      'approach_miss_lie_<150_bunker',
      'tee_strategy_driver_vs_layback',
      'putt_make_rate_0_3ft',
      'putt_make_rate_20+ft',
      'short_putt_make_rate_3_5ft',
      'shortside_scrambling_pct',
    ];
    for (const id of legacy) {
      const def = lookupMetricSource(id);
      expect(def, `expected ${id} to resolve`).toBeTruthy();
      expect(def!.kind).toBe('intentional-null');
    }
  });

  it('Phase H/H2: resolves the live scrambling drift spellings as honest intentional-null', () => {
    // Observed live (>=21d insights): `scrambling_fairway` (2), `scrambling_rough` (1).
    // These are the insight-surface short spellings of the canonical
    // scrambling_pct_fairway / scrambling_pct_rough — both intentional-null
    // (needs-shot-level-join). They must resolve so the cron stops counting
    // them as unknown-metric drift, but MUST stay intentional-null (no
    // manufactured lift on the wrong population).
    for (const id of ['scrambling_fairway', 'scrambling_rough']) {
      const def = lookupMetricSource(id);
      expect(def, `expected ${id} to resolve`).toBeTruthy();
      expect(def!.kind).toBe('intentional-null');
    }
  });

  it('Phase H/H2: resolves audit-named driver metrics as intentional-null (no honest per-round source)', () => {
    // three_putt_chain + compound_mistake_rate need hole-level SEQUENCING the
    // round_stats_cache does not store; short_side_proximity needs shot-level
    // position. They resolve (so they never silently drift) but produce no lift.
    for (const id of [
      'three_putt_chain',
      'short_side_proximity',
      'compound_mistake_rate',
    ]) {
      const def = lookupMetricSource(id);
      expect(def, `expected ${id} to resolve`).toBeTruthy();
      expect(def!.kind).toBe('intentional-null');
    }
  });

  it('Phase H/H2: fairways_hit_pct stays an attributable ratio (lift must persist)', () => {
    const def = lookupMetricSource('fairways_hit_pct');
    expect(def).toBeTruthy();
    expect(def!.kind).toBe('round_stats_cache_ratio');
  });

  it('reports the expected count of attributable vs intentional-null metrics', () => {
    // Snapshot the coverage so future drift is visible in the diff.
    // If you add a new source, bump these numbers.
    let rounds = 0;
    let cacheAvg = 0;
    let ratio = 0;
    let computed = 0;
    let holeLevelAvg = 0;
    let intentional = 0;
    for (const id of METRIC_IDS) {
      const def = METRIC_SOURCE[id];
      if (def.kind === 'rounds') rounds += 1;
      else if (def.kind === 'round_stats_cache_avg') cacheAvg += 1;
      else if (def.kind === 'round_stats_cache_ratio') ratio += 1;
      else if (def.kind === 'round_stats_cache_computed') computed += 1;
      else if (def.kind === 'hole_level_avg') holeLevelAvg += 1;
      else intentional += 1;
    }
    expect(rounds).toBe(5);          // 5 SG headline (penalty moved off golf_rounds)
    expect(cacheAvg).toBe(1);        // penalty_rate_per_round (canonical cache column)
    expect(ratio).toBe(2);           // gir_pct + scrambling_pct_sand
    expect(computed).toBe(1);        // big_number_rate
    expect(holeLevelAvg).toBe(3);    // scoring_par_3, scoring_par_4, scoring_par_5
    expect(intentional).toBe(16);    // the remaining intentional-null metrics
    expect(rounds + cacheAvg + ratio + computed + holeLevelAvg + intentional).toBe(METRIC_IDS.length);
  });

  it('P1: penalty_rate_per_round reads the canonical cache column, NOT the drifted golf_rounds.total_penalties', () => {
    // golf_rounds.total_penalties drifted from the per-hole source; migration
    // 20260608140000 made golf_round_stats_cache.penalty_strokes canonical
    // (= SUM(golf_holes.penalty_strokes)). The attribution source must read the
    // canonical column so before/after deltas are computed from true values.
    const def = lookupMetricSource('penalty_rate_per_round');
    expect(def).toBeTruthy();
    expect(def!.kind).toBe('round_stats_cache_avg');
    // Belt-and-suspenders: must NOT be the old drifted golf_rounds column.
    expect(def).not.toEqual({ kind: 'rounds', column: 'total_penalties' });
    if (def!.kind === 'round_stats_cache_avg') {
      expect(def!.column).toBe('penalty_strokes');
    }
  });
});

/**
 * Tiny hand-rolled Supabase mock — the shared fake-supabase fixture
 * doesn't support PostgREST-style implicit joins (`golf_rounds!inner(…)`)
 * so we build a minimal builder per test that matches the exact call
 * shape `averageInWindow` produces. Keeping it local avoids polluting
 * the shared fixture with golf-only concerns.
 */
type FakeFromHandler = (table: string) => unknown;

function makeFakeSupabase(handler: FakeFromHandler): Parameters<typeof averageInWindow>[0] {
  return {
    from: handler,
  } as unknown as Parameters<typeof averageInWindow>[0];
}

function buildRoundsBuilder(rows: Array<Record<string, unknown>>) {
  // Records the call-chain so the test can assert the right table / filters.
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };
  builder.select = (...a: unknown[]) => record('select', ...a);
  builder.eq = (...a: unknown[]) => record('eq', ...a);
  builder.gte = (...a: unknown[]) => record('gte', ...a);
  builder.lte = (...a: unknown[]) => record('lte', ...a);
  builder.limit = (...a: unknown[]) => record('limit', ...a);
  builder.order = (...a: unknown[]) => record('order', ...a);
  builder.range = (...a: unknown[]) => record('range', ...a);
  // The await on the builder resolves to { data, error }
  builder.then = (resolve: (v: { data: typeof rows; error: null }) => void) =>
    resolve({ data: rows, error: null });
  return { builder, calls };
}

describe('averageInWindow (W35 follow-up dispatch)', () => {
  it('preserves the legacy score_to_par path from golf_rounds (regression)', async () => {
    const { builder, calls } = buildRoundsBuilder([
      { score_to_par: 4 },
      { score_to_par: -2 },
      { score_to_par: 7 },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_rounds');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'score_to_par',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result).toEqual({ ok: true, avg: 3, n: 3 });
    // Same call-chain shape the old code used: select, eq player, eq status,
    // gte round_date, lte round_date.
    expect(calls.map((c) => c.method)).toEqual([
      'select',
      'eq',
      'eq',
      'gte',
      'lte',
    ]);
  });

  it('routes sg_total to the strokes_gained_total column on golf_rounds', async () => {
    const { builder, calls } = buildRoundsBuilder([
      { strokes_gained_total: 1.2 },
      { strokes_gained_total: -0.4 },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_rounds');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'sg_total',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(2);
    expect(result.avg).toBeCloseTo(0.4, 5);
    // First arg of select() should be the SG column.
    expect(calls[0]).toEqual({ method: 'select', args: ['strokes_gained_total'] });
  });

  it('skips non-numeric and NaN values without crashing', async () => {
    const { builder } = buildRoundsBuilder([
      { strokes_gained_putting: 0.3 },
      { strokes_gained_putting: null },
      { strokes_gained_putting: Number.NaN },
      { strokes_gained_putting: 0.5 },
    ]);
    const sb = makeFakeSupabase(() => builder);
    const result = await averageInWindow(
      sb,
      'player-1',
      'sg_putting',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(2);
    expect(result.avg).toBeCloseTo(0.4, 5);
  });

  it('returns no-data when the window has zero rounds', async () => {
    const { builder } = buildRoundsBuilder([]);
    const sb = makeFakeSupabase(() => builder);
    const result = await averageInWindow(
      sb,
      'player-1',
      'sg_total',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result).toEqual({ ok: false, reason: 'no-data' });
  });

  it('short-circuits intentional-null metrics without hitting the DB', async () => {
    const fromSpy = vi.fn();
    const sb = makeFakeSupabase(fromSpy);
    const result = await averageInWindow(
      sb,
      'player-1',
      'putts_made_5_10ft_pct',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result).toEqual({
      ok: false,
      reason: 'intentional-null',
      reasonCode: 'no-per-round-putt-distance-cache',
    });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('big_number_rate is no longer intentional-null', () => {
    const def = lookupMetricSource('big_number_rate');
    expect(def).toBeTruthy();
    expect(def!.kind).toBe('round_stats_cache_computed');
  });

  it('scoring_par_3/4/5 are no longer intentional-null', () => {
    for (const id of ['scoring_par_3', 'scoring_par_4', 'scoring_par_5']) {
      const def = lookupMetricSource(id);
      expect(def).toBeTruthy();
      expect(def!.kind).toBe('hole_level_avg');
    }
  });

  it('reports unknown-metric without hitting the DB', async () => {
    const fromSpy = vi.fn();
    const sb = makeFakeSupabase(fromSpy);
    const result = await averageInWindow(
      sb,
      'player-1',
      'totally_made_up_metric_xyz',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result).toEqual({ ok: false, reason: 'unknown-metric' });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('computes gir_pct via Σ numerator / Σ denominator (not per-round mean)', async () => {
    // Round A: 14/18 = 77.78%, Round B: 4/18 = 22.22%. Simple mean ≈ 50%,
    // but shot-weighted mean = (14+4) / (14+4+4+14) × 100 ... actually
    // numerator / denominator = (14+4) / 36 = 50% which happens to match.
    // Use a clearer asymmetric example: round A has 9 greens out of 9 (one
    // 9-hole round) and round B has 6 greens out of 18. Per-round mean =
    // (100 + 33.3) / 2 = 66.7%. Shot-weighted = (9+6) / (9+18) × 100 ≈ 55.6%.
    const { builder } = buildRoundsBuilder([
      { greens_hit: 9, greens_total: 9 },
      { greens_hit: 6, greens_total: 18 },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_round_stats_cache');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'gir_pct',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(2);
    expect(result.avg).toBeCloseTo((15 / 27) * 100, 5); // 55.55…%
  });

  it('skips rounds with zero denominator (no opportunities) without dividing by zero', async () => {
    const { builder } = buildRoundsBuilder([
      { sand_saves: 2, sand_attempts: 4 },
      { sand_saves: 0, sand_attempts: 0 }, // skip
      { sand_saves: 1, sand_attempts: 2 },
    ]);
    const sb = makeFakeSupabase(() => builder);
    const result = await averageInWindow(
      sb,
      'player-1',
      'scrambling_pct_sand',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(2);
    expect(result.avg).toBeCloseTo((3 / 6) * 100, 5);
  });

  it('computes big_number_rate via round_stats_cache_computed', async () => {
    // Round A: 18 holes scored, 2 double bogeys + 1 triple = 3/18 × 100 ≈ 16.67%
    // Round B: 18 holes scored, 0 double bogeys + 0 triple = 0/18 × 100 = 0%
    // Average = (16.67 + 0) / 2 ≈ 8.33%
    const { builder } = buildRoundsBuilder([
      { eagles: 0, birdies: 2, pars: 8, bogeys: 5, double_bogeys: 2, triple_plus: 1 },
      { eagles: 1, birdies: 3, pars: 10, bogeys: 4, double_bogeys: 0, triple_plus: 0 },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_round_stats_cache');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'big_number_rate',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(2);
    // Round A: (2+1)/(0+2+8+5+2+1) = 3/18 × 100 = 16.667
    // Round B: (0+0)/(1+3+10+4+0+0) = 0/18 × 100 = 0
    // Mean: (16.667 + 0) / 2 ≈ 8.333
    expect(result.avg).toBeCloseTo((3 / 18) * 100 / 2, 3);
  });

  it('big_number_rate skips rounds where all scoring columns are zero', async () => {
    const { builder } = buildRoundsBuilder([
      { eagles: 0, birdies: 0, pars: 0, bogeys: 0, double_bogeys: 0, triple_plus: 0 },
    ]);
    const sb = makeFakeSupabase(() => builder);
    const result = await averageInWindow(
      sb,
      'player-1',
      'big_number_rate',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result).toEqual({ ok: false, reason: 'no-data' });
  });

  it('computes scoring_par_4 via hole_level_avg', async () => {
    // 3 holes on par 4: scores 4, 5, 3 → diffs 0, +1, -1 → avg = 0
    const { builder } = buildRoundsBuilder([
      { score: 4, par: 4, round_id: 'r1' },
      { score: 5, par: 4, round_id: 'r1' },
      { score: 3, par: 4, round_id: 'r2' },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_holes');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'scoring_par_4',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(2); // 2 distinct rounds
    expect(result.avg).toBeCloseTo(0, 5);
  });

  it('scoring_par_3 returns no-data when no holes match', async () => {
    const { builder } = buildRoundsBuilder([]);
    const sb = makeFakeSupabase(() => builder);
    const result = await averageInWindow(
      sb,
      'player-1',
      'scoring_par_3',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(result).toEqual({ ok: false, reason: 'no-data' });
  });

  it('scoring_par_5 averages score-to-par across holes', async () => {
    // 2 par-5 holes: scores 6 and 4 → diffs +1, -1 → avg = 0
    const { builder } = buildRoundsBuilder([
      { score: 6, par: 5, round_id: 'r1' },
      { score: 4, par: 5, round_id: 'r1' },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_holes');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'scoring_par_5',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.avg).toBeCloseTo(0, 5);
  });

  it('P1: penalty_rate_per_round averages golf_round_stats_cache.penalty_strokes (canonical), not golf_rounds', async () => {
    // 3 rounds: 1, 0, 2 penalty strokes → mean = 1.0. Read from the cache table
    // (canonical-from-holes), never golf_rounds.total_penalties (drifted).
    const { builder } = buildRoundsBuilder([
      { penalty_strokes: 1 },
      { penalty_strokes: 0 },
      { penalty_strokes: 2 },
    ]);
    const sb = makeFakeSupabase((table) => {
      expect(table).toBe('golf_round_stats_cache');
      return builder;
    });
    const result = await averageInWindow(
      sb,
      'player-1',
      'penalty_rate_per_round',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(3);
    expect(result.avg).toBeCloseTo(1.0, 5);
  });

  it('P1: penalty_rate_per_round skips non-numeric penalty_strokes and returns no-data on empty window', async () => {
    const { builder } = buildRoundsBuilder([
      { penalty_strokes: null },
      { penalty_strokes: 3 },
    ]);
    const sb = makeFakeSupabase(() => builder);
    const result = await averageInWindow(
      sb,
      'player-1',
      'penalty_rate_per_round',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.n).toBe(1); // null skipped
    expect(result.avg).toBeCloseTo(3, 5);

    const { builder: empty } = buildRoundsBuilder([]);
    const sbEmpty = makeFakeSupabase(() => empty);
    const emptyResult = await averageInWindow(
      sbEmpty,
      'player-1',
      'penalty_rate_per_round',
      '2026-04-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
    );
    expect(emptyResult).toEqual({ ok: false, reason: 'no-data' });
  });
});

describe('computeAttribution (W35 follow-up integration)', () => {
  it('short-circuits intentional-null metrics before any DB calls', async () => {
    const fromSpy = vi.fn();
    const sb = makeFakeSupabase(fromSpy);
    const result = await computeAttribution(sb, {
      insight_id: 'i-1',
      player_id: 'p-1',
      surfaced_at: '2026-04-01T00:00:00.000Z',
      target_metric_id: 'approach_proximity_125_175ft',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'intentional-null',
      reasonCode: 'needs-shot-level-join',
    });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('short-circuits unknown metrics before any DB calls', async () => {
    const fromSpy = vi.fn();
    const sb = makeFakeSupabase(fromSpy);
    const result = await computeAttribution(sb, {
      insight_id: 'i-1',
      player_id: 'p-1',
      surfaced_at: '2026-04-01T00:00:00.000Z',
      target_metric_id: 'no_such_metric',
    });
    expect(result).toEqual({ ok: false, reason: 'unknown-metric' });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('returns no-data when the pre window has no rounds', async () => {
    // Every call returns the same empty result — pre + post + ambient all empty.
    const { builder } = buildRoundsBuilder([]);
    const sb = makeFakeSupabase(() => builder);
    const result = await computeAttribution(sb, {
      insight_id: 'i-1',
      player_id: 'p-1',
      surfaced_at: '2026-04-01T00:00:00.000Z',
      target_metric_id: 'sg_total',
    });
    expect(result).toEqual({ ok: false, reason: 'no-data' });
  });
});

/**
 * Phase H/H3 — ambient counterfactual must be computed STRICTLY OUTSIDE the
 * [preStart, postEnd] window, so post-window improvement can't leak into the
 * ambient average and cancel the lift it is supposed to isolate.
 */
function buildWindowAwareSupabase(
  rowsByCall: (startIso: string, endIso: string) => Array<Record<string, unknown>>,
) {
  // Records every (start,end) pair averageGolfRoundsColumn queries so the test
  // can assert the ambient window never overlaps the post window.
  const windows: Array<{ start: string; end: string }> = [];
  const from = () => {
    let start = '';
    let end = '';
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = self;
    builder.eq = self;
    builder.gte = (_col: string, v: string) => {
      start = v;
      return builder;
    };
    builder.lte = (_col: string, v: string) => {
      end = v;
      return builder;
    };
    builder.order = self;
    builder.range = self;
    builder.then = (
      resolve: (v: { data: Array<Record<string, unknown>>; error: null }) => void,
    ) => {
      windows.push({ start, end });
      resolve({ data: rowsByCall(start, end), error: null });
    };
    return builder;
  };
  const sb = { from } as unknown as Parameters<typeof computeAttribution>[0];
  return { sb, windows };
}

describe('Phase H/H3: ambient counterfactual isolation', () => {
  it('computes ambient strictly OUTSIDE [preStart, postEnd]', async () => {
    const surfaced = '2026-04-01T00:00:00.000Z';
    const surfacedTs = new Date(surfaced).getTime();
    const preStartDate = new Date(surfacedTs - 14 * 86400_000)
      .toISOString()
      .slice(0, 10);
    const postEndDate = new Date(surfacedTs + 21 * 86400_000)
      .toISOString()
      .slice(0, 10);

    const { sb, windows } = buildWindowAwareSupabase((start, _end) => {
      // Pre window: baseline avg sg_total = 0. Post window: avg = +2 (improved).
      // Ambient (pre-pre history): avg = 0 (flat). gte/lte are date-only.
      const s = start.slice(0, 10);
      if (s >= preStartDate.slice(0, 10) && s < surfaced.slice(0, 10)) {
        return [{ strokes_gained_total: 0 }, { strokes_gained_total: 0 }];
      }
      if (s > surfaced.slice(0, 10) && s <= postEndDate) {
        return [{ strokes_gained_total: 2 }, { strokes_gained_total: 2 }];
      }
      // ambient (history before preStart)
      return [{ strokes_gained_total: 0 }, { strokes_gained_total: 0 }];
    });

    const result = await computeAttribution(sb, {
      insight_id: 'i-1',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'sg_total',
    });
    if (!result.ok) throw new Error('expected ok: true');

    // The ambient window the code queried must END no later than preStart.
    const ambientWindow = windows.find(
      (w) => w.end.slice(0, 10) <= preStartDate,
    );
    expect(
      ambientWindow,
      'an ambient window ending at/before preStart must have been queried',
    ).toBeTruthy();
    // And NO queried window may extend into the post period while also reaching
    // before the pre window (i.e. the old [-90d, +90d] straddling window).
    const straddles = windows.some(
      (w) => w.start.slice(0, 10) < preStartDate && w.end.slice(0, 10) > postEndDate,
    );
    expect(straddles, 'ambient must NOT straddle the post window').toBe(false);
  });

  it('credits the full delta when ambient trend is flat (lift ≈ delta)', async () => {
    // Flat ambient (0) + flat baseline (0) + improved post (+2) → lift ≈ +2,
    // NOT cancelled. With the old straddling window the post leaked into ambient
    // and lift collapsed toward 0.
    const surfaced = '2026-04-01T00:00:00.000Z';
    const surfacedTs = new Date(surfaced).getTime();
    const { sb } = buildWindowAwareSupabase((start) => {
      const s = start.slice(0, 10);
      const postStart = new Date(surfacedTs + 1).toISOString().slice(0, 10);
      if (s >= postStart) return [{ strokes_gained_total: 2 }, { strokes_gained_total: 2 }];
      return [{ strokes_gained_total: 0 }, { strokes_gained_total: 0 }];
    });
    const result = await computeAttribution(sb, {
      insight_id: 'i-2',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'sg_total',
    });
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.row.delta).toBeCloseTo(2, 5);
    expect(result.row.lift).not.toBeNull();
    expect(result.row.lift!).toBeCloseTo(2, 5); // ambient drift = 0 → no subtraction
  });

  it('returns lift=null (but still records delta) when ambient has too few rounds', async () => {
    const surfaced = '2026-04-01T00:00:00.000Z';
    const surfacedTs = new Date(surfaced).getTime();
    const postStart = new Date(surfacedTs + 1).toISOString().slice(0, 10);
    const preStartDate = new Date(surfacedTs - 14 * 86400_000)
      .toISOString()
      .slice(0, 10);
    const { sb } = buildWindowAwareSupabase((start) => {
      const s = start.slice(0, 10);
      if (s >= postStart) return [{ strokes_gained_total: 1 }, { strokes_gained_total: 1 }];
      if (s >= preStartDate && s < surfaced.slice(0, 10)) {
        return [{ strokes_gained_total: 0 }, { strokes_gained_total: 0 }];
      }
      return [{ strokes_gained_total: 0 }]; // ambient: only 1 round → below gate
    });
    const result = await computeAttribution(sb, {
      insight_id: 'i-3',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'sg_total',
    });
    if (!result.ok) throw new Error('expected ok: true');
    expect(result.row.delta).toBeCloseTo(1, 5);
    expect(result.row.lift).toBeNull(); // gated — 1 ambient round is noise
  });
});

/**
 * P2 — the pre and post windows must EXCLUDE the surfaced calendar day, so the
 * triggering round (usually ingested/surfaced the same day, and usually the
 * outlier that fired the insight) is never averaged into BOTH baseline and post.
 * The window functions filter the DATE column round_date with inclusive
 * gte/lte on the .slice(0,10) date string, so the boundary that matters is the
 * calendar day, not the instant.
 */
describe('P2: surfaced-day window exclusion', () => {
  it('pre window ends BEFORE the surfaced day and post starts AFTER it', async () => {
    const surfaced = '2026-04-15T18:30:00.000Z'; // mid-day surfacing
    const surfacedDate = surfaced.slice(0, 10); // '2026-04-15'
    const { sb, windows } = buildWindowAwareSupabase(() => [
      { strokes_gained_total: 0 },
      { strokes_gained_total: 0 },
    ]);
    const result = await computeAttribution(sb, {
      insight_id: 'i-day',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'sg_total',
    });
    if (!result.ok) throw new Error('expected ok: true');

    // NO queried window may include round_date == surfacedDate. A window covers
    // surfacedDate iff start <= surfacedDate <= end (inclusive, date-only).
    const surfacedDayCovered = windows.some(
      (w) =>
        w.start.slice(0, 10) <= surfacedDate && w.end.slice(0, 10) >= surfacedDate,
    );
    expect(
      surfacedDayCovered,
      'the surfaced calendar day must not fall inside any pre/post/ambient window',
    ).toBe(false);

    // Concretely: the pre window (the one ending nearest, but before, surfaced)
    // must end on or before surfacedDate − 1 day, and the post window must start
    // on or after surfacedDate + 1 day.
    const dayBefore = new Date(
      new Date(`${surfacedDate}T00:00:00.000Z`).getTime() - 86400_000,
    )
      .toISOString()
      .slice(0, 10);
    const dayAfter = new Date(
      new Date(`${surfacedDate}T00:00:00.000Z`).getTime() + 86400_000,
    )
      .toISOString()
      .slice(0, 10);
    const preWindow = windows.find((w) => w.end.slice(0, 10) === dayBefore);
    const postWindow = windows.find((w) => w.start.slice(0, 10) === dayAfter);
    expect(preWindow, 'pre window must end the day before surfaced').toBeTruthy();
    expect(postWindow, 'post window must start the day after surfaced').toBeTruthy();
  });

  it('the surfaced-day round contaminates neither baseline nor post (lift is not biased toward zero)', async () => {
    // Baseline (strictly before surfaced day) = 0. Post (strictly after) = +2.
    // A round ON the surfaced day carries the pre-intervention value 0. If it
    // leaked into post it would drag post toward 0 (bias toward zero). With the
    // fix it's excluded from both windows, so delta stays a clean +2.
    const surfaced = '2026-04-15T18:30:00.000Z';
    const surfacedDate = surfaced.slice(0, 10);
    const { sb } = buildWindowAwareSupabase((start, end) => {
      const s = start.slice(0, 10);
      const e = end.slice(0, 10);
      // Any window that (incorrectly) included the surfaced day would also see
      // the contaminating round; we model that round as value 0 sitting on
      // surfacedDate. Post window: strictly-after rounds all read +2.
      const rows: Array<Record<string, unknown>> = [];
      if (s > surfacedDate) {
        rows.push({ strokes_gained_total: 2 }, { strokes_gained_total: 2 });
      } else {
        rows.push({ strokes_gained_total: 0 }, { strokes_gained_total: 0 });
      }
      // If a window spans the surfaced day, inject the contaminating 0-round —
      // this only happens under the OLD (buggy) inclusive boundary.
      if (s <= surfacedDate && e >= surfacedDate) {
        rows.push({ strokes_gained_total: 0 });
      }
      return rows;
    });
    const result = await computeAttribution(sb, {
      insight_id: 'i-clean',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'sg_total',
    });
    if (!result.ok) throw new Error('expected ok: true');
    // Post is a clean +2 (no surfaced-day contamination), baseline a clean 0.
    expect(result.row.post_value).toBeCloseTo(2, 5);
    expect(result.row.baseline_value).toBeCloseTo(0, 5);
    expect(result.row.delta).toBeCloseTo(2, 5);
  });
});

/**
 * P0-01 — attribution must learn in the metric's IMPROVEMENT direction.
 *
 * Before the fix, lift was the raw `post − baseline` delta minus ambient drift,
 * direction-agnostic. For a lower-is-better metric (score_to_par, penalties,
 * scoring) a real improvement makes the value DROP, so the raw delta went
 * NEGATIVE and the weight update treated a success as a regression. The fix
 * multiplies the ambient-adjusted lift by the metric's improvement sign so a
 * positive `improvement_lift` ALWAYS means the player got better.
 */
describe('P0-01: improvement direction for lower-is-better metrics', () => {
  it('a DROP in score_to_par (lower is better) yields a POSITIVE improvement_lift', async () => {
    // score_to_par baseline = +6 (over par), post = +3 (improved by 3 strokes).
    // raw_delta = post − base = -3 (a drop, the desired outcome). Ambient flat.
    // With the fix: improvement_lift = sign(lower_better=-1) × (-3) = +3.
    const surfaced = '2026-04-01T00:00:00.000Z';
    const surfacedTs = new Date(surfaced).getTime();
    const postStart = new Date(surfacedTs + 1).toISOString().slice(0, 10);
    const preStartDate = new Date(surfacedTs - 14 * 86400_000)
      .toISOString()
      .slice(0, 10);
    const { sb } = buildWindowAwareSupabase((start) => {
      const s = start.slice(0, 10);
      if (s >= postStart) return [{ score_to_par: 3 }, { score_to_par: 3 }]; // improved
      if (s >= preStartDate && s < surfaced.slice(0, 10)) {
        return [{ score_to_par: 6 }, { score_to_par: 6 }]; // baseline
      }
      return [{ score_to_par: 6 }, { score_to_par: 6 }]; // ambient: flat at baseline
    });
    const result = await computeAttribution(sb, {
      insight_id: 'i-stp',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'score_to_par',
    });
    if (!result.ok) throw new Error('expected ok: true');

    // raw_delta is direction-agnostic and NEGATIVE for this real improvement.
    expect(result.row.raw_delta).toBeCloseTo(-3, 5);
    expect(result.row.delta).toBeCloseTo(-3, 5); // alias of raw_delta

    // improvement_lift is direction-corrected and POSITIVE — the player improved.
    expect(result.row.improvement_lift).not.toBeNull();
    expect(result.row.improvement_lift!).toBeCloseTo(3, 5);
    expect(result.row.lift!).toBeCloseTo(3, 5); // alias of improvement_lift

    // And that positive lift RAISES the coach weight (learning rewards success).
    const updated = nextWeight({ weight: 1.0, sample_n: 0 }, result.row.lift);
    expect(updated.weight).toBeGreaterThan(1.0);
  });

  it('identical real-world improvements produce the same positive lift regardless of direction', async () => {
    const surfaced = '2026-04-01T00:00:00.000Z';
    const surfacedTs = new Date(surfaced).getTime();
    const postStart = new Date(surfacedTs + 1).toISOString().slice(0, 10);

    // Higher-is-better: sg_total rises 0 → +2 (a 2-unit improvement).
    const { sb: sbHigher } = buildWindowAwareSupabase((start) => {
      const s = start.slice(0, 10);
      if (s >= postStart) return [{ strokes_gained_total: 2 }, { strokes_gained_total: 2 }];
      return [{ strokes_gained_total: 0 }, { strokes_gained_total: 0 }];
    });
    const higher = await computeAttribution(sbHigher, {
      insight_id: 'i-hi',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'sg_total',
    });

    // Lower-is-better: penalties drop 2 → 0 (also a 2-unit improvement).
    const { sb: sbLower } = buildWindowAwareSupabase((start) => {
      const s = start.slice(0, 10);
      if (s >= postStart) return [{ penalty_strokes: 0 }, { penalty_strokes: 0 }];
      return [{ penalty_strokes: 2 }, { penalty_strokes: 2 }];
    });
    const lower = await computeAttribution(sbLower, {
      insight_id: 'i-lo',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'penalty_rate_per_round',
    });

    if (!higher.ok || !lower.ok) throw new Error('expected ok: true');

    // Raw deltas have OPPOSITE signs (the metrics move in opposite directions),
    // but both improvements net to the SAME positive direction-corrected lift.
    expect(higher.row.raw_delta).toBeCloseTo(2, 5);
    expect(lower.row.raw_delta).toBeCloseTo(-2, 5);
    expect(higher.row.improvement_lift!).toBeCloseTo(2, 5);
    expect(lower.row.improvement_lift!).toBeCloseTo(2, 5);
    expect(lower.row.improvement_lift!).toBeCloseTo(higher.row.improvement_lift!, 5);

    // A REGRESSION in a lower-is-better metric must learn as negative.
    const { sb: sbWorse } = buildWindowAwareSupabase((start) => {
      const s = start.slice(0, 10);
      if (s >= postStart) return [{ penalty_strokes: 3 }, { penalty_strokes: 3 }]; // worse
      return [{ penalty_strokes: 1 }, { penalty_strokes: 1 }];
    });
    const worse = await computeAttribution(sbWorse, {
      insight_id: 'i-worse',
      player_id: 'p-1',
      surfaced_at: surfaced,
      target_metric_id: 'penalty_rate_per_round',
    });
    if (!worse.ok) throw new Error('expected ok: true');
    expect(worse.row.raw_delta).toBeCloseTo(2, 5); // value went UP (more penalties)
    expect(worse.row.improvement_lift!).toBeCloseTo(-2, 5); // ...which is a regression
    expect(
      nextWeight({ weight: 1.0, sample_n: 0 }, worse.row.lift).weight,
    ).toBeLessThan(1.0);
  });
});

/**
 * Insight-category metric ids — the remaining volume behind the causality cron's
 * highest-count Sentry warning (JAVASCRIPT-NEXTJS-2K: handled, 0 users, never
 * crashed, but ~2K events of noise drowning real drift).
 *
 * The fixture below is not invented. It is every distinct
 * `golf_coach_insights.evidence->>'metric'` in production as of 2026-07-29,
 * ordered by row count. Before the insight-category prefixes, 42 of these 49
 * resolved and 7 did not — and those 7 were the whole warning volume.
 *
 * Keeping the real fixture here means the next person can re-run the same query
 * and diff it, instead of trusting a hand-written list.
 */
const PRODUCTION_EMITTED_METRIC_IDS = [
  'approach_proximity_50_125ft', 'sg_ott', 'approach_proximity_175_plus_ft',
  'approach_proximity_125_175ft', 'putt_miss_bias_left_pct', 'scrambling_pct_sand',
  'scoring_par_5', 'scoring_par_4', 'penalty_rate_per_round', 'big_number_rate',
  'scoring_par_3', 'putts_made_3_5ft_pct', 'putts_made_10_15ft_pct',
  'putts_made_5_10ft_pct', 'putts_made_15_25ft_pct', 'putts_made_25_plus_ft_pct',
  'pattern_detected_scoring', 'opening_hole_delta', 'bubble_player_putting',
  'practice_tournament_delta', 'three_putt_chain', 'approach_severity_<150',
  'bubble_player_approach', 'short_side_proximity', 'approach_severity_150_175',
  'approach_severity_175_200', 'putt_miss_bias_right_pct', 'approach_severity_200+',
  'pattern_detected_putting', 'recurring_weakness_putting', 'putt_make_rate_15_20ft',
  'pattern_detected_tee', 'approach_direction_<150_left', 'putt_make_rate_10_15ft',
  'scrambling_fairway', 'scoring_decline_putting', 'approach_direction_175_200_right',
  'putt_make_rate_0_3ft', 'approach_miss_lie_175_200_fairway',
  'tee_strategy_driver_vs_layback', 'scrambling_rough', 'approach_direction_200+_right',
  'approach_direction_150_175_left', 'approach_miss_lie_150_175_fairway',
  'putt_make_rate_3_6ft', 'approach_miss_lie_<150_rough',
  'approach_direction_150_175_right', 'compound_mistake_rate', 'putt_make_rate_6_10ft',
] as const;

describe('lookupMetricSource — insight-category ids (Sentry 2K closure)', () => {
  it('resolves EVERY metric id production actually emits', () => {
    const unresolved = PRODUCTION_EMITTED_METRIC_IDS.filter((id) => !lookupMetricSource(id));
    // A non-empty list here is exactly what the cron logs as "unknown metric".
    expect(unresolved).toEqual([]);
  });

  it('classifies the seven insight-category ids as intentional-null, not as metrics', () => {
    // These are `<insight_type>_<focus_area>` pairs from determineInsightType —
    // there is no column behind them, so a causal-lift number is meaningless.
    for (const id of [
      'pattern_detected_scoring', 'pattern_detected_putting', 'pattern_detected_tee',
      'bubble_player_putting', 'bubble_player_approach',
      'recurring_weakness_putting', 'scoring_decline_putting',
    ]) {
      const source = lookupMetricSource(id);
      expect(source, id).not.toBeNull();
      expect(source!.kind, id).toBe('intentional-null');
    }
  });

  it('uses a reason distinct from the shot-level-graduation family', () => {
    // v2-mining ids are waiting on shot-level data and will one day become
    // attributable. Insight categories never will. Monitoring must tell them apart.
    const category = lookupMetricSource('bubble_player_putting');
    const shotLevel = lookupMetricSource('approach_severity_150_175');
    expect(category).toMatchObject({ kind: 'intentional-null', reason: 'insight-category-not-a-metric' });
    expect(shotLevel).toMatchObject({ kind: 'intentional-null' });
    expect((category as { reason: string }).reason)
      .not.toBe((shotLevel as { reason: string }).reason);
  });

  it('matches the FAMILY so a new focus area cannot reopen the issue', () => {
    // The observed set was 7, but the shape is categories x focus areas. Any new
    // pairing must resolve without another registry edit.
    for (const unseen of [
      'bubble_player_tee', 'plateau_approach', 'surge_player_scoring',
      'team_trend_putting', 'roster_recommendation_short_game', 'streak_driving',
    ]) {
      expect(lookupMetricSource(unseen), unseen).toMatchObject({
        kind: 'intentional-null',
        reason: 'insight-category-not-a-metric',
      });
    }
  });

  it('never shadows a real metric id', () => {
    // Prefix matching runs AFTER the canonical registry and the alias table, so
    // this cannot happen today — but a future canonical id named e.g.
    // `streak_length` would be silently swallowed if the ordering ever changed.
    const realIds = [...Object.keys(METRIC_SOURCE), ...Object.keys(METRIC_SOURCE_ALIASES)];
    const shadowed = realIds.filter((id) =>
      __INSIGHT_CATEGORY_METRIC_PREFIXES.some((p) => id.startsWith(p)),
    );
    expect(shadowed).toEqual([]);
  });

  it('still returns null for genuinely unknown ids — real drift must stay visible', () => {
    // The whole point of silencing the categories is so THIS keeps meaning something.
    expect(lookupMetricSource('totally_made_up_metric')).toBeNull();
    expect(lookupMetricSource('')).toBeNull();
  });
});
