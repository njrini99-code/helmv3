/**
 * Canonical v3 metric registry (TypeScript side).
 *
 * MIRRORS the reproducible seed in:
 *   supabase/migrations/20260606010000_v3_golf_metrics_seed_reproducible.sql
 *   (the original 20260524190200_v3_golf_metrics_seed.sql was archived under
 *    migrations_archive/pre_20260527/ when the prod baseline was cut — the
 *    baseline re-CREATEs golf_metrics but never re-seeds it, so the new
 *    numbered migration restores reproducibility — see MR-2.)
 *
 * The `golf_metrics` DB table is the source of truth at runtime — these
 * IDs exist so the TypeScript layer can reference metrics by literal-union
 * type without a DB roundtrip. The {@link validateMetricRegistry} function
 * in `./load.ts` verifies the two sources have not drifted; CI should run
 * it on every PR per Part XXVI risk H ("Schema drift between TS metric
 * registry and DB").
 *
 * If you change this array, you MUST ship a new SQL seed migration in the
 * same PR (e.g. `20260601_v3_golf_metrics_seed_update.sql`) — never edit
 * an already-applied seed file.
 *
 * NOTE on the v2-mining `approach_direction_*` family (ui-tone-2): those
 * per-bucket metric ids (e.g. `approach_direction_<150_left`) are emitted
 * by `src/lib/coachhelm/v2/mining/approach-analytics.ts`, are deliberately
 * classified as legacy `intentional-null` in
 * `src/lib/coachhelm/v3/causality/metric-sources.ts`, and use bucket tokens
 * (`<`, `+`) that violate the canonical snake_case `metric_id` format. They
 * are intentionally NOT members of this canonical registry — adding them
 * would expand the `MetricId` union and break the exhaustive
 * `Record<MetricId, …>` tables (metric-config, metric-sources, counterfactual
 * lookup). The tone-polarity fix for that family lives in the tone-derivation
 * regex (negative-pattern) owner, not here.
 */

export const METRIC_IDS = [
  // Strokes Gained headline (5) — read from golf_player_stats_cache
  'sg_total',
  'sg_ott',
  'sg_approach',
  'sg_around_green',
  'sg_putting',

  // Putt make % by distance (5) — PuttDistanceGenerator (W21)
  'putts_made_3_5ft_pct',
  'putts_made_5_10ft_pct',
  'putts_made_10_15ft_pct',
  'putts_made_15_25ft_pct',
  'putts_made_25_plus_ft_pct',

  // Putt miss bias (4) — PuttBiasGenerator (W22)
  'putt_miss_bias_high_pct',
  'putt_miss_bias_low_pct',
  'putt_miss_bias_left_pct',
  'putt_miss_bias_right_pct',

  // Approach proximity by distance (3) — ApproachMissGenerator (W22)
  'approach_proximity_50_125ft',
  'approach_proximity_125_175ft',
  'approach_proximity_175_plus_ft',

  // Scrambling by lie (3) — ScramblingGenerator (W22)
  'scrambling_pct_rough',
  'scrambling_pct_sand',
  'scrambling_pct_fairway',

  // Course management (2) — CourseMgmtGenerator (W23)
  'penalty_rate_per_round',
  'big_number_rate',

  // Per-par scoring (3) — ParTypeGenerator (W23)
  'scoring_par_3',
  'scoring_par_4',
  'scoring_par_5',

  // Greens in regulation (1) — table-stakes college baseline
  'gir_pct',

  // Pressure + warmup (2) — PressureGapGenerator + WarmupHoleGenerator (W24)
  'practice_tournament_delta',
  'opening_hole_delta',
] as const;

/** Literal-union of every canonical v3 metric_id. */
export type MetricId = (typeof METRIC_IDS)[number];

/** Total count, exported for CI parity check + tests. */
export const METRIC_COUNT = METRIC_IDS.length;

/** Type-narrowing guard: does the input string identify a canonical metric? */
export function isMetricId(s: string): s is MetricId {
  return (METRIC_IDS as readonly string[]).includes(s);
}

/**
 * Whether a higher or lower raw value is the *better* outcome for a metric.
 *
 *  - `higher_better` — SG, make %, GIR, scrambling: bigger is better.
 *  - `lower_better`  — scoring-to-par, penalties, big-number rate, putt-miss
 *    bias, approach proximity, pressure deltas: smaller is better.
 *
 * MIRRORS the `direction` column of `public.golf_metrics` and the
 * `METRIC_RENDER_CONFIG` map in `src/lib/coachhelm/v3/standing/metric-config.ts`.
 * Lives in the registry so that any consumer reasoning about whether a change
 * is an *improvement* (outcome attribution, counterfactual, standing bars)
 * resolves direction from ONE source. The {@link validateMetricRegistry}
 * parity check in `./load.ts` guards drift against the DB seed.
 *
 * CRITICAL (P0-01): outcome attribution must add `direction` here, not infer
 * sign from a raw `post − baseline` delta — otherwise a drop in a
 * lower-is-better metric (the desired result) is learned as a regression.
 */
export type MetricDirection = 'higher_better' | 'lower_better';

const METRIC_DIRECTION: Record<MetricId, MetricDirection> = {
  // Strokes Gained headline — higher is better
  sg_total: 'higher_better',
  sg_ott: 'higher_better',
  sg_approach: 'higher_better',
  sg_around_green: 'higher_better',
  sg_putting: 'higher_better',

  // Putt make % by distance — higher is better
  putts_made_3_5ft_pct: 'higher_better',
  putts_made_5_10ft_pct: 'higher_better',
  putts_made_10_15ft_pct: 'higher_better',
  putts_made_15_25ft_pct: 'higher_better',
  putts_made_25_plus_ft_pct: 'higher_better',

  // Putt miss bias — lower is better (fewer misses in any one direction)
  putt_miss_bias_high_pct: 'lower_better',
  putt_miss_bias_low_pct: 'lower_better',
  putt_miss_bias_left_pct: 'lower_better',
  putt_miss_bias_right_pct: 'lower_better',

  // Approach proximity — lower is better (closer to the hole)
  approach_proximity_50_125ft: 'lower_better',
  approach_proximity_125_175ft: 'lower_better',
  approach_proximity_175_plus_ft: 'lower_better',

  // Scrambling — higher is better
  scrambling_pct_rough: 'higher_better',
  scrambling_pct_sand: 'higher_better',
  scrambling_pct_fairway: 'higher_better',

  // Course management — lower is better
  penalty_rate_per_round: 'lower_better',
  big_number_rate: 'lower_better',

  // Per-par scoring — lower is better (fewer strokes to par)
  scoring_par_3: 'lower_better',
  scoring_par_4: 'lower_better',
  scoring_par_5: 'lower_better',

  // GIR — higher is better
  gir_pct: 'higher_better',

  // Pressure + warmup — lower is better (smaller gap / less jitter)
  practice_tournament_delta: 'lower_better',
  opening_hole_delta: 'lower_better',
};

/**
 * Non-canonical metric ids the v3 insight surface still emits (handled as
 * aliases in `src/lib/coachhelm/v3/causality/metric-sources.ts`). Each maps
 * to the direction of the SAME underlying real-world metric so attribution
 * applies the right sign even before the surface migrates to canonical ids.
 */
const METRIC_DIRECTION_ALIASES: Record<string, MetricDirection> = {
  // Lower is better — score relative to par.
  score_to_par: 'lower_better',
  // Higher is better — fairways in regulation / driving accuracy.
  fairways_hit_pct: 'higher_better',
  // Short spellings of the canonical scrambling metrics (higher is better).
  scrambling_fairway: 'higher_better',
  scrambling_rough: 'higher_better',
  // Drift spelling of the canonical 5-10 ft putt make rate (higher is better).
  putt_make_pct_5_10: 'higher_better',
  // Audit-named driver metrics — fewer compounding mistakes is better.
  three_putt_chain: 'lower_better',
  compound_mistake_rate: 'lower_better',
  short_side_proximity: 'lower_better',
};

/**
 * Resolve the improvement direction for ANY metric id — canonical, alias, or
 * unknown. Returns `'higher_better'` as the conservative default for unknown
 * ids: with no direction signal we treat a raw rise as an improvement, which
 * matches the legacy behaviour for the metrics attribution already handled
 * correctly, and an unknown metric never reaches the weight update anyway (the
 * cron classifies it `unknown-metric` and skips it). The default is therefore
 * documentation, not a behaviour that can mis-learn a real metric.
 *
 * Single source of truth for the P0-01 fix: outcome attribution multiplies the
 * raw ambient-adjusted lift by `+1` for `higher_better` and `-1` for
 * `lower_better` so an improvement is ALWAYS a positive lift.
 */
export function getMetricDirection(metricId: string): MetricDirection {
  const canonical = (METRIC_DIRECTION as Record<string, MetricDirection | undefined>)[metricId];
  if (canonical) return canonical;
  const alias = METRIC_DIRECTION_ALIASES[metricId];
  if (alias) return alias;
  return 'higher_better';
}

/**
 * Sign multiplier that turns a raw `post − baseline` delta (or ambient-adjusted
 * lift) into an *improvement* magnitude: `+1` when higher is better, `-1` when
 * lower is better. Multiply the raw value by this so a real-world improvement is
 * always positive regardless of the metric's polarity.
 */
export function improvementSign(metricId: string): 1 | -1 {
  return getMetricDirection(metricId) === 'lower_better' ? -1 : 1;
}
