/**
 * v3 standing refresh — TS-side metadata for the nightly cron.
 *
 * The actual SQL (PERCENT_RANK, joins, upsert) lives in the
 * `refresh_player_standing(uuid[])` PL/pgSQL function shipped in
 * supabase/migrations/20260524210100_v3_refresh_player_standing_function.sql.
 *
 * This module owns:
 *   - The list of metric IDs the function is expected to cover (used in
 *     tests + the cron's response payload).
 *   - The chunk size for the team-id batches the cron passes to the RPC.
 *
 * NOTE: this list MUST stay in sync with the v_bindings array in the SQL
 * function. A future CI parity check should compare the two — analogous
 * to the metric registry parity check in v3/metrics/load.ts.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/**
 * The 15 v3 metrics that refresh_player_standing() currently populates
 * from golf_player_stats_cache. Drift between these and the in-DB
 * function's v_bindings means the cron will silently miss / mislabel
 * metrics — CI parity check is a follow-up.
 */
export const STANDING_REFRESH_METRIC_IDS: readonly MetricId[] = [
  'sg_total',
  'sg_ott',
  'sg_approach',
  'sg_around_green',
  'sg_putting',
  'gir_pct',
  'scrambling_pct_sand',
  'penalty_rate_per_round',
  'big_number_rate',
  'scoring_par_3',
  'scoring_par_4',
  'scoring_par_5',
  // Re-promoted 2026-06-06: refresh_player_stats_cache now populates the per-band
  // putt make % via update_player_putt_make_pct() (migrations 20260606160000 /
  // 170000), and refresh_player_standing binds 15_25/25_plus to the true
  // putt_make_pct_15_25ft / 25_plus_ft columns (migration 20260606180000). All 5
  // bands now upsert real rows that match raw-shot truth.
  'putts_made_3_5ft_pct',
  'putts_made_5_10ft_pct',
  'putts_made_10_15ft_pct',
  'putts_made_15_25ft_pct',
  'putts_made_25_plus_ft_pct',
] as const;

/**
 * Round-level metrics populated by the companion W24-prep RPC
 * `refresh_player_standing_round_metrics(uuid[])`. Same return shape
 * as `refresh_player_standing` so the cron route concatenates results.
 */
export const ROUND_REFRESH_METRIC_IDS: readonly MetricId[] = [
  'practice_tournament_delta',
  'opening_hole_delta',
] as const;

/**
 * Shot-level metrics populated by `refresh_player_standing_shot_metrics(uuid[])`
 * (migration 20260605130000). The cache has only an overall approach-proximity
 * average, so these by-band proximities are computed straight from golf_shots
 * (on-green feet, by 50-125 / 125-175 / 175+ yd). Same (metric_id, rows) shape
 * (aliased out_*) so the cron concatenates results.
 */
export const SHOT_REFRESH_METRIC_IDS: readonly MetricId[] = [
  'approach_proximity_50_125ft',
  'approach_proximity_125_175ft',
  'approach_proximity_175_plus_ft',
] as const;

/**
 * Metrics whose v3 IDs DO NOT cleanly map to a single cache column or
 * for which we don't yet have a Tour benchmark. Each populates via:
 *   - Adjustment of v3 metric ID to align with cache bucket, OR
 *   - A v3 generator (W21+) writing its own standing rows.
 *
 * Documented here so the cron can return a `metrics_skipped_v1` list.
 */
export const STANDING_REFRESH_DEFERRED_METRIC_IDS: readonly MetricId[] = [
  // The 5 putt-make-% metrics were re-promoted to STANDING_REFRESH_METRIC_IDS on
  // 2026-06-06 once update_player_putt_make_pct() began populating the per-band
  // cache columns (previously 100% NULL — SC2).
  // No public Tour benchmark; computed by W22 PuttBiasGenerator
  'putt_miss_bias_high_pct',
  'putt_miss_bias_low_pct',
  'putt_miss_bias_left_pct',
  'putt_miss_bias_right_pct',
  // (approach_proximity 50_125 / 125_175 / 175_plus moved to
  //  SHOT_REFRESH_METRIC_IDS 2026-06-05 — computed shot-level by the
  //  refresh_player_standing_shot_metrics RPC.)
  // Cache has overall scrambling_percentage + sand_save_percentage only.
  // Scrambling-by-lie (rough/fairway) needs hole-level recovery reconstruction
  // by lie — deferred to a follow-up (see COACHHELM_SMARTER_BUILD_STATUS_2026-06-05.md).
  'scrambling_pct_rough',
  'scrambling_pct_fairway',
] as const;

/** Maximum teams the cron sends to refresh_player_standing per invocation. */
export const TEAMS_PER_CHUNK = 50;


