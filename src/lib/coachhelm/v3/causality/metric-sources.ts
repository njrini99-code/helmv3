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
 * Five source kinds cover the 28 canonical metrics:
 *
 *  1. `rounds` — column lives on `golf_rounds` directly (the 5 SG headline
 *     metrics + score_to_par are denormalised onto the round row).
 *  2. `round_stats_cache_ratio` — the metric is a percentage we can rebuild
 *     per round by dividing two columns on `golf_round_stats_cache`
 *     (e.g. GIR = greens_hit / greens_total × 100). Aggregated over a
 *     window using the safe `Σ numerator / Σ denominator` form, not a
 *     simple mean of per-round percentages (avoids the small-denominator
 *     skew that a per-round average would produce).
 *  3. `round_stats_cache_computed` — the metric is derived from multiple
 *     scoring-distribution columns on `golf_round_stats_cache` (e.g.
 *     big-number rate = (double_bogeys + triple_plus) / total-holes × 100).
 *     Computed per round, then averaged across the window.
 *  4. `hole_level_avg` — the metric needs hole-level data from `golf_holes`
 *     joined to `golf_rounds`. Currently used for per-par scoring averages
 *     (AVG(score − par) filtered by hole par type).
 *  5. `intentional-null` — the metric has no per-round time-series we can
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

/**
 * Single per-round columns on `golf_round_stats_cache` we average directly
 * (no ratio). Used when the canonical per-round value lives on the cache row
 * rather than the denormalised `golf_rounds` column — e.g. `penalty_strokes`,
 * which migration 20260608140000 made canonical-from-golf_holes
 * (= SUM(golf_holes.penalty_strokes)) after `golf_rounds.total_penalties`
 * drifted.
 */
export type RoundStatsCacheAvgColumn = 'penalty_strokes';

/** Columns on `golf_round_stats_cache` that form the scoring distribution. */
export type ScoringDistributionColumn =
  | 'eagles'
  | 'birdies'
  | 'pars'
  | 'bogeys'
  | 'double_bogeys'
  | 'triple_plus';

/** All scoring-distribution columns — used as the denominator for computed ratios. */
export const ALL_SCORING_COLUMNS: ScoringDistributionColumn[] = [
  'eagles', 'birdies', 'pars', 'bogeys', 'double_bogeys', 'triple_plus',
];

/** Two-column ratios we sum-of-numerator over sum-of-denominator across the window. */
export interface RoundStatsCacheRatioSource {
  kind: 'round_stats_cache_ratio';
  numerator: 'greens_hit' | 'sand_saves' | 'scrambles_converted' | 'fairways_hit';
  denominator: 'greens_total' | 'sand_attempts' | 'scramble_attempts' | 'fairways_total';
  /** Multiplier applied after the ratio (e.g. ×100 for percentages). */
  scale: number;
}

export interface GolfRoundsSource {
  kind: 'rounds';
  column: GolfRoundsAvgColumn;
}

/**
 * Average a single per-round column on `golf_round_stats_cache` over a window.
 * Joins to `golf_rounds` on `round_id` for the `round_date` / `status` filter
 * (the cache row carries neither), then takes a simple per-round mean of the
 * column. Used for `penalty_rate_per_round` — the cache's `penalty_strokes` is
 * the canonical per-round penalty count (SUM(golf_holes.penalty_strokes)),
 * whereas `golf_rounds.total_penalties` has drifted (migration 20260608140000).
 */
export interface RoundStatsCacheAvgSource {
  kind: 'round_stats_cache_avg';
  column: RoundStatsCacheAvgColumn;
}

/**
 * Computed ratio from `golf_round_stats_cache` scoring-distribution
 * columns. Unlike `round_stats_cache_ratio` (which divides two named
 * columns), this source derives both numerator and denominator from
 * multi-column sums per round — e.g. big-number rate =
 * (double_bogeys + triple_plus) / total-holes-scored × 100.
 *
 * Aggregated as a simple mean of per-round percentages (every completed
 * round gets equal weight regardless of holes played).
 */
export interface RoundStatsCacheComputedSource {
  kind: 'round_stats_cache_computed';
  /** Scoring-distribution columns summed to form the numerator. */
  numerator_columns: ScoringDistributionColumn[];
  /** Multiplier applied after the ratio (e.g. ×100 for percentages). */
  scale: number;
}

/**
 * Hole-level average score-to-par filtered by hole par value.
 * Queries `golf_holes` joined to `golf_rounds` and computes
 * AVG(score − par) across the window for holes of the given par type.
 */
export interface HoleLevelAvgSource {
  kind: 'hole_level_avg';
  par_filter: 3 | 4 | 5;
}

export interface IntentionalNullSource {
  kind: 'intentional-null';
  /** Short machine-readable reason, used in observability logs. */
  reason: string;
}

export type MetricSourceDef =
  | GolfRoundsSource
  | RoundStatsCacheAvgSource
  | RoundStatsCacheRatioSource
  | RoundStatsCacheComputedSource
  | HoleLevelAvgSource
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
 *  - **Per-par scoring** (`scoring_par_3|4|5`) — ✓ graduated to
 *    `hole_level_avg`, joining `golf_holes` to `golf_rounds` and computing
 *    `AVG(score − par)` filtered by hole par value.
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

  // Course management — both are per-round measurable.
  // penalty_rate_per_round reads the CANONICAL per-round penalty count from
  // golf_round_stats_cache.penalty_strokes (= SUM(golf_holes.penalty_strokes),
  // = count of is_penalty shots). It was previously { kind: 'rounds', column:
  // 'total_penalties' }, but golf_rounds.total_penalties has drifted from the
  // per-hole source (migration 20260608140000_cache_penalty_from_golf_holes_canonical),
  // understating attribution deltas. The cache column is canonical-from-holes.
  penalty_rate_per_round: { kind: 'round_stats_cache_avg', column: 'penalty_strokes' },
  // `big_number_rate` = (double_bogeys + triple_plus) / total-holes-scored × 100
  // where total-holes-scored = eagles + birdies + pars + bogeys + double_bogeys + triple_plus.
  big_number_rate: {
    kind: 'round_stats_cache_computed',
    numerator_columns: ['double_bogeys', 'triple_plus'],
    scale: 100,
  },

  // Per-par scoring — hole-level AVG(score − par) filtered by par type
  scoring_par_3: { kind: 'hole_level_avg', par_filter: 3 },
  scoring_par_4: { kind: 'hole_level_avg', par_filter: 4 },
  scoring_par_5: { kind: 'hole_level_avg', par_filter: 5 },

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

  // ── Insight-surface metric-id drift reconciliation ──────────────────────
  // The v3 insight surface tags some `evidence.metric` ids with a non-canonical
  // spelling. Each alias below points at the source def for the SAME underlying
  // per-round metric the canonical id resolves to — so attribution computes lift
  // on the right data, never a near-miss substitute.

  // Drift: `putt_make_pct_5_10` is the insight-surface spelling of the canonical
  // 5–10 ft putt-make metric `putts_made_5_10ft_pct`. We reuse that canonical
  // def verbatim — which is `intentional-null` because per-distance putt make-rate
  // has no per-round time-series (the cache aggregates putts by count, not by
  // distance bucket; the bucketed rate lives only in the player-aggregate
  // golf_player_stats_cache). Aliasing it reclassifies the insight from
  // "unknown-metric drift" to the honest "intentional-no-lift" bucket — it does
  // NOT manufacture a lift.
  putt_make_pct_5_10: METRIC_SOURCE.putts_made_5_10ft_pct,

  // Drift: `fairways_hit_pct` is fairways-in-regulation / driving accuracy. This
  // IS genuinely per-round measurable: golf_round_stats_cache carries per-round
  // `fairways_hit` / `fairways_total` (total = holes where fairway_hit is tracked,
  // i.e. fairway-eligible holes), exactly mirroring how `gir_pct` rebuilds GIR
  // from greens_hit/greens_total. Aggregated as Σnum/Σden × 100 (shot-weighted),
  // same as the other ratio sources.
  fairways_hit_pct: {
    kind: 'round_stats_cache_ratio',
    numerator: 'fairways_hit',
    denominator: 'fairways_total',
    scale: 100,
  },

  // Drift: `scrambling_fairway` / `scrambling_rough` are the insight-surface
  // short spellings of the canonical scrambling_pct_fairway / scrambling_pct_rough.
  // Both canonical defs are intentional-null (needs-shot-level-join — the cache
  // stores only aggregate sand saves, no rough/fairway split). We reuse those
  // canonical defs verbatim so attribution NEVER computes lift on the wrong
  // population; aliasing only reclassifies the cron bucket from "unknown-metric
  // drift" to the honest "intentional-no-lift". (Observed live: 2 + 1 insights.)
  scrambling_fairway: METRIC_SOURCE.scrambling_pct_fairway,
  scrambling_rough: METRIC_SOURCE.scrambling_pct_rough,

  // Audit-named driver metrics the maturing insight surface will emit. None has
  // an honest per-round source today:
  //  - three_putt_chain / compound_mistake_rate: need hole-level SEQUENCING
  //    (which hole, what preceded the big number) — round_stats_cache stores
  //    only per-round scoring-distribution COUNTS, not order.
  //  - short_side_proximity: a positional shot-level concept; no per-round
  //    time-series exists (same family as approach_proximity_*).
  // Classifying them intentional-null keeps the cron honest and stops them
  // becoming silent unknown-metric drift the day a generator starts emitting them.
  three_putt_chain: { kind: 'intentional-null', reason: 'needs-hole-level-sequencing' },
  compound_mistake_rate: { kind: 'intentional-null', reason: 'needs-hole-level-sequencing' },
  short_side_proximity: { kind: 'intentional-null', reason: 'needs-shot-level-join' },

  // DEFERRED (no honest per-round source — intentionally NOT aliased):
  //  - `shortside_scrambling_pct`: "short-side" is a positional concept, not a
  //    lie. The cache only stores aggregate sand (sand_saves/sand_attempts) and
  //    generic scramble counts; there is no short-side split. Aliasing to
  //    scrambling_pct_sand or the generic scramble ratio would attribute lift on
  //    the WRONG population (sand-only / all-scrambling, not short-side).
  //  - `approach_proximity_ft_150_180`: no per-round proximity time-series exists
  //    (all canonical approach_proximity_* metrics are intentional-null,
  //    needs-shot-level-join). The 150–180 yd band also straddles the canonical
  //    125_175 / 175_plus bucket boundary, so no single bucket is even a candidate.
  //  - `closing_holes_score_to_par`: a hole-position-filtered aggregate. The only
  //    hole-level source (`hole_level_avg`) filters golf_holes by par value, not by
  //    hole number/position — there is no closing-holes source kind.
};

/**
 * v2-mining and legacy insight metric prefixes. The insight surface in
 * `src/lib/coachhelm/v2/mining/*` (and historical generators no longer in
 * code but still represented in `golf_coach_insights.evidence.metric`)
 * emit per-bucket metric names like `approach_severity_<150` and
 * `tee_strategy_driver_vs_layback`. These names are not registered in
 * the canonical v3 metric registry, and they all share the same property:
 * attribution needs shot-level data that today only exists as a player-
 * aggregate in `golf_player_stats_cache`, with no per-round time-series.
 *
 * Treating them as `intentional-null` (instead of `unknown-metric`) keeps
 * the cron summary honest — the cron's `intentional_no_lift` counter still
 * reflects coverage gaps, but Sentry no longer fires a "registry drift"
 * warning per insight. Until a per-round shot-level cache lands and these
 * graduate to a real source, this is the correct classification.
 *
 * Emitted by:
 *  - `src/lib/coachhelm/v2/mining/approach-analytics.ts`
 *  - `src/lib/coachhelm/v2/mining/tee-strategy.ts`
 *  - `src/lib/coachhelm/v2/mining/correlation-discovery.ts`
 *  - legacy insights backfilled by retired generators
 */
const LEGACY_V2_METRIC_PREFIXES: readonly string[] = [
  'approach_severity_',
  'approach_direction_',
  'approach_miss_lie_',
  'tee_strategy_',
  'putt_make_rate_',
  'short_putt_make_rate_',
  'shortside_scrambling',
];

const LEGACY_V2_INTENTIONAL_NULL: MetricSourceDef = {
  kind: 'intentional-null',
  reason: 'v2-mining-needs-shot-level-graduation',
};

/**
 * Insight-CATEGORY ids, which are not metrics at all.
 *
 * `/api/cron/v3/causality-attribute` logs a `warning` for every
 * `evidence.metric` this registry cannot resolve, and these families were the
 * entire remaining volume of the highest-count Sentry issue
 * (JAVASCRIPT-NEXTJS-2K — handled, 0 users, never crashed).
 *
 * They look like metric ids but are `<insight_type>_<focus_area>` pairs:
 * `determineInsightType` in src/app/golf/actions/insights.ts returns one of the
 * `InsightType` union members (src/lib/coachhelm/insight-types.ts) and the area
 * is appended — hence `bubble_player_putting`, `pattern_detected_scoring`,
 * `recurring_weakness_putting`. `pattern_detected` is included because
 * insights.ts writes it as a DB-allowed `insight_type` even though it is absent
 * from the TS union.
 *
 * So there is no column, cache or shot table behind them, and no per-round
 * series to correlate — a causal-lift number for "this insight was categorised
 * as a bubble-player warning" would be meaningless. `intentional-null` with a
 * distinct reason is the honest classification, and keeping the reason separate
 * from `v2-mining-needs-shot-level-graduation` matters: that family is waiting
 * on shot-level graduation and will one day become attributable, whereas these
 * never will.
 *
 * PREFIXES, not an enumeration. The observed set was seven ids, but the shape is
 * a cross-product of ~13 categories and a growing list of focus areas — every
 * new pairing (`bubble_player_tee`, `plateau_approach`, …) would silently
 * reopen the same Sentry issue. Matching the family closes it for good.
 *
 * Safe against shadowing: `lookupMetricSource` consults the canonical registry
 * and the alias table BEFORE any prefix, and a test asserts no real metric id
 * starts with one of these.
 */
const INSIGHT_CATEGORY_METRIC_PREFIXES: readonly string[] = [
  'pattern_detected_',
  'scoring_decline_',
  'stat_regression_',
  'tournament_pressure_',
  'plateau_',
  'bubble_player_',
  'surge_player_',
  'streak_',
  'recurring_weakness_',
  'closing_holes_',
  'par_3_issues_',
  'team_trend_',
  'roster_recommendation_',
];

const INSIGHT_CATEGORY_INTENTIONAL_NULL: MetricSourceDef = {
  kind: 'intentional-null',
  reason: 'insight-category-not-a-metric',
};

/**
 * Returns the source definition for any metric id, including the
 * `score_to_par` alias and the v2-mining legacy prefixes. Returns null
 * when the id is completely unknown (which the cron treats as a different
 * observability bucket — true drift between the insight surface and this
 * registry).
 */
export function lookupMetricSource(metricId: string): MetricSourceDef | null {
  // Canonical registry first
  const canonical = (METRIC_SOURCE as Record<string, MetricSourceDef | undefined>)[metricId];
  if (canonical) return canonical;
  const alias = METRIC_SOURCE_ALIASES[metricId];
  if (alias) return alias;
  if (LEGACY_V2_METRIC_PREFIXES.some((p) => metricId.startsWith(p))) {
    return LEGACY_V2_INTENTIONAL_NULL;
  }
  if (INSIGHT_CATEGORY_METRIC_PREFIXES.some((p) => metricId.startsWith(p))) {
    return INSIGHT_CATEGORY_INTENTIONAL_NULL;
  }
  return null;
}

/**
 * Exported for the shadowing test only — see
 * INSIGHT_CATEGORY_METRIC_PREFIXES. Not part of the runtime contract.
 */
export const __INSIGHT_CATEGORY_METRIC_PREFIXES = INSIGHT_CATEGORY_METRIC_PREFIXES;
