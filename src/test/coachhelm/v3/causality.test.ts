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
  lookupMetricSource,
  type MetricSourceDef,
} from '@/lib/coachhelm/v3/causality/metric-sources';
import { METRIC_IDS } from '@/lib/coachhelm/v3/metrics/registry';

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

  it('ignores non-finite lift values defensively', () => {
    const prev = { weight: 1.0, sample_n: 5 };
    expect(nextWeight(prev, Number.NaN)).toEqual(prev);
    expect(nextWeight(prev, Number.POSITIVE_INFINITY)).toEqual(prev);
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
    let ratio = 0;
    let computed = 0;
    let holeLevelAvg = 0;
    let intentional = 0;
    for (const id of METRIC_IDS) {
      const def = METRIC_SOURCE[id];
      if (def.kind === 'rounds') rounds += 1;
      else if (def.kind === 'round_stats_cache_ratio') ratio += 1;
      else if (def.kind === 'round_stats_cache_computed') computed += 1;
      else if (def.kind === 'hole_level_avg') holeLevelAvg += 1;
      else intentional += 1;
    }
    expect(rounds).toBe(6);          // 5 SG headline + penalty_rate_per_round
    expect(ratio).toBe(2);           // gir_pct + scrambling_pct_sand
    expect(computed).toBe(1);        // big_number_rate
    expect(holeLevelAvg).toBe(3);    // scoring_par_3, scoring_par_4, scoring_par_5
    expect(intentional).toBe(16);    // the remaining intentional-null metrics
    expect(rounds + ratio + computed + holeLevelAvg + intentional).toBe(METRIC_IDS.length);
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
