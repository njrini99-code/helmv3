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
  'putts_made_3_5ft_pct',
  'putts_made_5_10ft_pct',
  'putts_made_10_15ft_pct',
  'gir_pct',
  'scrambling_pct_sand',
  'penalty_rate_per_round',
  'big_number_rate',
  'scoring_par_3',
  'scoring_par_4',
  'scoring_par_5',
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
  // Cache has 15_20ft + 20_plus_ft; v3 metrics have 15_25 + 25_plus — bucket misalignment
  'putts_made_15_25ft_pct',
  'putts_made_25_plus_ft_pct',
  // No public Tour benchmark; computed by W22 PuttBiasGenerator
  'putt_miss_bias_high_pct',
  'putt_miss_bias_low_pct',
  'putt_miss_bias_left_pct',
  'putt_miss_bias_right_pct',
  // Cache only has overall approach_proximity_average; needs shot-level for buckets
  'approach_proximity_50_125ft',
  'approach_proximity_125_175ft',
  'approach_proximity_175_plus_ft',
  // Cache has overall scrambling_percentage + sand_save_percentage only
  'scrambling_pct_rough',
  'scrambling_pct_fairway',
  // Need round-level computations
  'practice_tournament_delta',
  'opening_hole_delta',
] as const;

/** Maximum teams the cron sends to refresh_player_standing per invocation. */
export const TEAMS_PER_CHUNK = 50;

/** Min cache.rounds_played for a player to enter the standing computation. */
export const MIN_ROUNDS_FOR_STANDING = 5;
