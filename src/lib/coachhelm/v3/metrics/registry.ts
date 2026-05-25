/**
 * Canonical v3 metric registry (TypeScript side).
 *
 * MIRRORS the seed in:
 *   supabase/migrations/20260524190200_v3_golf_metrics_seed.sql
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
 * the original seed file.
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
