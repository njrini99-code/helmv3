/**
 * v3 outcome-attribution metric → data-source dispatch table (W35 follow-up).
 *
 * The cron in `src/app/api/cron/v3/causality-attribute/route.ts` needs to
 * average each insight's target metric over a 14d pre-window and a 21d
 * post-window so it can compute a lift. The v1 W35 ship hard-coded
 * `score_to_par` only — every other metric returned null and the cron
 * silently counted 100% of insights as "deferred."
 *
 * This module is the schema-of-truth for "given a {@link MetricId}, where
 * do I find a per-round value I can average over a window?"
 *
 * Three source kinds cover the 28 canonical metrics:
 *
 *  1. `rounds` — column lives on `golf_rounds` directly (the 5 SG headline
 *     metrics + score_to_par are denormalised onto the round row).
 *  2. `round_stats_cache_ratio` — the metric is a percentage we can rebuild
 *     per round by dividing two columns on `golf_round_stats_cache`
 *     (e.g. GIR = greens_hit / greens_total × 100). Aggregated over a
 *     window using the safe `Σ numerator / Σ denominator` form, not a
 *     simple mean of per-round percentages (avoids the small-denominator
 *     skew that a per-round average would produce).
 *  3. `intentional-null` — the metric has no per-round time-series we can
 *     trust (e.g. shot-bucket putt make %, putt miss bias, approach
 *     proximity by distance). These intentionally produce no lift and the
 *     cron logs them as `intentional-no-lift` so monitoring can tell
 *     real-coverage gaps from missing-data noise.
 *
 * NOT a source kind: `player_stats_cache`. That table is a player-aggregate
 * snapshot with no time-series, so it cannot support the 14d-pre / 21d-post
 * window comparison the attribution math relies on.
 *
 * MUST stay in sync with:
 *  - `src/lib/coachhelm/v3/metrics/registry.ts` (the literal-union)
 *  - `supabase/migrations(_archive)/20260524190200_v3_golf_metrics_seed.sql`
 *    (the DB seed of `public.golf_metrics`)
 *
 * The unit test `src/test/coachhelm/v3/causality.test.ts` (W35 follow-up
 * suite) iterates the registry and fails if a metric is missing from this
 * table — that catches drift the moment it lands.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/** Columns on `golf_rounds` we currently average for attribution. */
export type GolfRoundsAvgColumn =
  | 'score_to_par'
  | 'strokes_gained_total'
  | 'strokes_gained_tee'
  | 'strokes_gained_approach'
  | 'strokes_gained_around_green'
  | 'strokes_gained_putting'
  | 'total_penalties';

/** Two-column ratios we sum-of-numerator over sum-of-denominator across the window. */
export interface RoundStatsCacheRatioSource {
  kind: 'round_stats_cache_ratio';
  numerator: 'greens_hit' | 'sand_saves' | 'scrambles_converted';
  denominator: 'greens_total' | 'sand_attempts' | 'scramble_attempts';
  /** Multiplier applied after the ratio (e.g. ×100 for percentages). */
  scale: number;
}

export interface GolfRoundsSource {
  kind: 'rounds';
  column: GolfRoundsAvgColumn;
}

export interface IntentionalNullSource {
  kind: 'intentional-null';
  /** Short machine-readable reason, used in observability logs. */
  reason: string;
}

export type MetricSourceDef =
  | GolfRoundsSource
  | RoundStatsCacheRatioSource
  | IntentionalNullSource;

/**
 * Why several whole metric families land in `intentional-null` today:
 *
 *  - **Putt make % by distance** (`putts_made_*_pct`) — `golf_round_stats_cache`
 *    aggregates putts by count, not by distance bucket. The per-distance
 *    make-rate the v3 standing function computes lives in
 *    `golf_player_stats_cache` as a player-aggregate (no time-series).
 *    A future migration that adds a `golf_round_putt_distance_cache`
 *    one-row-per-round table would graduate these to `round_stats_cache_ratio`.
 *  - **Putt miss bias** (`putt_miss_bias_*_pct`) — diagnostic-only. The W22
 *    PuttBiasGenerator surfaces these alongside an action; we don't expect
 *    a measurable causal lift over a 21-day window because the underlying
 *    population (missed putts) is small per round.
 *  - **Approach proximity by distance** (`approach_proximity_*`) — needs
 *    shot-level data joined to round_id. `golf_round_stats_cache` only
 *    carries `detailed_stats: Json` which is currently unused in code.
 *  - **Scrambling by lie** (`scrambling_pct_rough|fairway`) — the cache row
 *    only stores aggregate sand-save numbers. Rough/fairway split would
 *    require a shot-level pass.
 *  - **Per-par scoring** (`scoring_par_3|4|5`) — `golf_round_stats_cache`
 *    doesn't break score by par type. `golf_player_stats_cache` has
 *    `par3_average / par4_average / par5_average` columns but those are
 *    player-aggregates with no time-series.
 *  - **Pressure / warmup** (`practice_tournament_delta`, `opening_hole_delta`)
 *    — these are *between-round-cohort* deltas, not per-round measurements.
 *    Treating them as a per-round time-series doesn't make causal sense.
 */
export const METRIC_SOURCE: Record<MetricId, MetricSourceDef> = {
  // Strokes Gained headline (5) — denormalised onto golf_rounds
  sg_total:        { kind: 'rounds', column: 'strokes_gained_total' },
  sg_ott:          { kind: 'rounds', column: 'strokes_gained_tee' },
  sg_approach:     { kind: 'rounds', column: 'strokes_gained_approach' },
  sg_around_green: { kind: 'rounds', column: 'strokes_gained_around_green' },
  sg_putting:      { kind: 'rounds', column: 'strokes_gained_putting' },

  // Putt make % by distance — no per-round bucket on round_stats_cache yet
  putts_made_3_5ft_pct:      { kind: 'intentional-null', reason: 'no-per-round-putt-distance-cache' },
  putts_made_5_10ft_pct:     { kind: 'intentional-null', reason: 'no-per-round-putt-distance-cache' },
  putts_made_10_15ft_pct:    { kind: 'intentional-null', reason: 'no-per-round-putt-distance-cache' },
  putts_made_15_25ft_pct:    { kind: 'intentional-null', reason: 'no-per-round-putt-distance-cache' },
  putts_made_25_plus_ft_pct: { kind: 'intentional-null', reason: 'no-per-round-putt-distance-cache' },

  // Putt miss bias — diagnostic-only, no causal-lift signal expected
  putt_miss_bias_high_pct:  { kind: 'intentional-null', reason: 'diagnostic-only' },
  putt_miss_bias_low_pct:   { kind: 'intentional-null', reason: 'diagnostic-only' },
  putt_miss_bias_left_pct:  { kind: 'intentional-null', reason: 'diagnostic-only' },
  putt_miss_bias_right_pct: { kind: 'intentional-null', reason: 'diagnostic-only' },

  // Approach proximity by distance — needs shot-level join
  approach_proximity_50_125ft:    { kind: 'intentional-null', reason: 'needs-shot-level-join' },
  approach_proximity_125_175ft:   { kind: 'intentional-null', reason: 'needs-shot-level-join' },
  approach_proximity_175_plus_ft: { kind: 'intentional-null', reason: 'needs-shot-level-join' },

  // Scrambling by lie — round_stats_cache has aggregate scrambles only.
  //  - rough/fairway split requires shot-level.
  //  - sand DOES have a per-round numerator/denominator (sand_saves / sand_attempts)
  //    so we can rebuild it as a ratio.
  scrambling_pct_rough:   { kind: 'intentional-null', reason: 'needs-shot-level-join' },
  scrambling_pct_sand: {
    kind: 'round_stats_cache_ratio',
    numerator: 'sand_saves',
    denominator: 'sand_attempts',
    scale: 100,
  },
  scrambling_pct_fairway: { kind: 'intentional-null', reason: 'needs-shot-level-join' },

  // Course management — both are per-round measurable
  penalty_rate_per_round: { kind: 'rounds', column: 'total_penalties' },
  // `big_number_rate` would need a hole-level count of doubles+triples /
  // total holes per round; `golf_round_stats_cache` has the counts but no
  // explicit "holes played in this round" column (`pars + bogeys + ...`
  // works only when every hole is scored). Defer to a future ratio source
  // that aggregates the row's bogey-or-worse counts properly.
  big_number_rate: { kind: 'intentional-null', reason: 'needs-holes-played-denominator' },

  // Per-par scoring — no per-par split on round_stats_cache
  scoring_par_3: { kind: 'intentional-null', reason: 'needs-per-par-round-breakdown' },
  scoring_par_4: { kind: 'intentional-null', reason: 'needs-per-par-round-breakdown' },
  scoring_par_5: { kind: 'intentional-null', reason: 'needs-per-par-round-breakdown' },

  // GIR % — per-round ratio (greens_hit / greens_total)
  gir_pct: {
    kind: 'round_stats_cache_ratio',
    numerator: 'greens_hit',
    denominator: 'greens_total',
    scale: 100,
  },

  // Pressure / warmup — between-round-cohort comparisons, not per-round
  practice_tournament_delta: { kind: 'intentional-null', reason: 'between-cohort-not-per-round' },
  opening_hole_delta:        { kind: 'intentional-null', reason: 'between-cohort-not-per-round' },
};

/**
 * Backwards-compat alias. The pre-W35-followup attribute.ts treated
 * 'score_to_par' as the only valid metric. The insight surface still
 * occasionally tags evidence with that string instead of a canonical
 * MetricId, so we keep a separate map for the alias.
 *
 * Anything in this map is *not* a canonical MetricId and bypasses the
 * registry coverage test — handled in `lookupMetricSource()`.
 */
export const METRIC_SOURCE_ALIASES: Record<string, MetricSourceDef> = {
  score_to_par: { kind: 'rounds', column: 'score_to_par' },
};

/**
 * Returns the source definition for any metric id, including the
 * `score_to_par` alias. Returns null when the id is completely unknown
 * (which the cron treats as a different observability bucket — drift
 * between the insight surface and this registry).
 */
export function lookupMetricSource(metricId: string): MetricSourceDef | null {
  // Canonical registry first
  const canonical = (METRIC_SOURCE as Record<string, MetricSourceDef | undefined>)[metricId];
  if (canonical) return canonical;
  const alias = METRIC_SOURCE_ALIASES[metricId];
  if (alias) return alias;
  return null;
}
