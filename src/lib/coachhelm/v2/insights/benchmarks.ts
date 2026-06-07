/**
 * Real benchmarks for evidence-backed insights.
 *
 * Replaces the synthetic D2_BASELINE constants the early Tier-1 generators
 * shipped with. Two real anchors:
 *
 *   1. Team average — pulled live from golf_player_stats_cache for every
 *      active player on the target's team. The team avg is the primary
 *      "where do you sit" baseline and is what shows up as the dominant
 *      tick in the EvidencePanel.
 *
 *   2. PGA Tour benchmark — a hardcoded constant per metric. Sourced from
 *      published PGA Tour season averages (FY2024 ShotLink). Acts as the
 *      stretch tick on the same scale so the player can see how far the
 *      team avg sits from "Tour grade."
 *
 * The generators import resolveTeamAverage + resolvePgaBenchmark and stamp
 * the result onto InsightEvidence.{comparison_*, secondary_*}. The UI
 * renders both as ticks on a horizontal scale in EvidencePanel.
 *
 * NOTE (2026-06-06): this module is currently unconsumed — the v3 generators
 * read PGA benchmarks from the golf_pga_standards table (the single source of
 * truth). If reviving this module, prefer querying golf_pga_standards over the
 * hardcoded PGA_BENCHMARKS below so values stay in sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// PGA Tour benchmarks. All values are season averages published by PGA Tour
// ShotLink. Update with the year so we know when to refresh.
// ---------------------------------------------------------------------------

export const PGA_BENCHMARK_YEAR = 2024;

export interface PgaBenchmark {
  /** Numeric value in the metric's unit. For percent metrics this is a 0..1
   *  fraction (matching the InsightEvidence.your_value convention). */
  value: number;
  /** Short caption for the tick label. */
  label: string;
}

export const PGA_BENCHMARKS: Record<string, PgaBenchmark> = {
  // Scoring (strokes-to-par per hole, by par)
  par_scoring_par3: { value: -0.05, label: 'PGA Tour avg' },
  par_scoring_par4: { value: 0.04, label: 'PGA Tour avg' },
  par_scoring_par5: { value: -0.45, label: 'PGA Tour avg' },

  // Putting make-rate by bucket (0..1 fraction). Values are PGA Tour averages
  // from golf_pga_standards (putts_made_*_pct ÷ 100). The 15_20/20_25 buckets
  // are legacy bands the canonical table no longer carries (it uses 15_25 / 25+);
  // they keep approximate values for backward shape only.
  putt_make_pct_3_5ft: { value: 0.905, label: 'PGA Tour avg' },
  putt_make_pct_5_10ft: { value: 0.622, label: 'PGA Tour avg' },
  putt_make_pct_10_15ft: { value: 0.357, label: 'PGA Tour avg' },
  putt_make_pct_15_20ft: { value: 0.154, label: 'PGA Tour avg' },
  putt_make_pct_20_25ft: { value: 0.055, label: 'PGA Tour avg' },

  // Approach proximity (in feet, lower is better)
  approach_proximity_50_100y:  { value: 18, label: 'PGA Tour avg' },
  approach_proximity_100_125y: { value: 21, label: 'PGA Tour avg' },
  approach_proximity_125_150y: { value: 25, label: 'PGA Tour avg' },
  approach_proximity_150_175y: { value: 30, label: 'PGA Tour avg' },
  approach_proximity_175_200y: { value: 36, label: 'PGA Tour avg' },
  approach_proximity_200y_plus: { value: 44, label: 'PGA Tour avg' },

  // Scrambling (% of missed greens converted to par or better, by lie)
  scrambling_fairway: { value: 0.60, label: 'PGA Tour avg' },
  scrambling_rough:   { value: 0.55, label: 'PGA Tour avg' },
  scrambling_bunker:  { value: 0.50, label: 'PGA Tour avg' },

  // Driving
  driving_distance: { value: 299, label: 'PGA Tour avg' },
  driving_accuracy: { value: 0.61, label: 'PGA Tour avg' },

  // GIR / overall
  gir_percentage: { value: 0.66, label: 'PGA Tour avg' },
  scoring_average_vs_par: { value: -0.7, label: 'PGA Tour avg' },
};

/**
 * Resolve a PGA tick by metric name. Returns null when the metric isn't
 * benchmarked (the UI then renders only the team-avg tick).
 */
export function resolvePgaBenchmark(metric: string): PgaBenchmark | null {
  return PGA_BENCHMARKS[metric] ?? null;
}

// ---------------------------------------------------------------------------
// Team average lookup — runs server-side against golf_player_stats_cache.
// ---------------------------------------------------------------------------

/**
 * Columns on golf_player_stats_cache the team-avg helper knows how to
 * average. Generators pass one of these via the `metric` arg.
 */
export type TeamAvgMetric =
  | 'scoring_average_vs_par'
  | 'gir_percentage'
  | 'driving_accuracy_percentage'
  | 'driving_distance_average'
  | 'scrambling_percentage'
  | 'putts_per_round'
  | 'three_putt_percentage'
  | 'putt_make_pct_3_5ft'
  | 'putt_make_pct_5_10ft'
  | 'putt_make_pct_10_15ft'
  | 'putt_make_pct_15_20ft'
  | 'putt_make_pct_20_25ft'
  | 'approach_proximity_average'
  | 'par3_average'
  | 'par4_average'
  | 'par5_average';

const STAT_COLUMN_BY_METRIC: Record<string, TeamAvgMetric | null> = {
  par_scoring_par3: 'par3_average',
  par_scoring_par4: 'par4_average',
  par_scoring_par5: 'par5_average',
  putt_make_pct_3_5ft: 'putt_make_pct_3_5ft',
  putt_make_pct_5_10ft: 'putt_make_pct_5_10ft',
  putt_make_pct_10_15ft: 'putt_make_pct_10_15ft',
  putt_make_pct_15_20ft: 'putt_make_pct_15_20ft',
  putt_make_pct_20_25ft: 'putt_make_pct_20_25ft',
  approach_proximity_average: 'approach_proximity_average',
  driving_accuracy: 'driving_accuracy_percentage',
  scoring_average_vs_par: 'scoring_average_vs_par',
};

export interface TeamAverageResult {
  value: number;
  /** How many players' stats rows fed the average (excludes the target). */
  sample_size: number;
}

/**
 * Compute the average of a single stats-cache column across all active
 * players on the same team as `playerId`, excluding the player themselves.
 * Returns null when the team has fewer than 2 other players or when the
 * metric isn't aggregatable.
 *
 * Per-metric scaling: percent columns on the cache are stored as 0..100,
 * but InsightEvidence.your_value uses 0..1 for `unit: percent`. We
 * normalize back to 0..1 at the boundary.
 */
export async function resolveTeamAverage(
  playerId: string,
  metric: string,
  supabase: SupabaseClient,
): Promise<TeamAverageResult | null> {
  const column = STAT_COLUMN_BY_METRIC[metric];
  if (!column) return null;

  // 1. Resolve the player's active team membership.
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .order('created_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const teamId = membership?.team_id;
  if (!teamId) return null;

  // 2. Pull every other active player's stats row for that team.
  const { data: peers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .neq('player_id', playerId);
  const peerIds = (peers ?? []).map((p) => p.player_id).filter((id): id is string => Boolean(id));
  if (peerIds.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('golf_player_stats_cache')
    .select(`player_id, ${column}`)
    .in('player_id', peerIds);

  const values: number[] = [];
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const raw = r[column];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      values.push(raw);
    }
  }
  if (values.length < 2) return null;

  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;

  // Percent columns on the cache are 0..100; normalize to 0..1 to match
  // InsightEvidence.your_value convention for `unit: percent` metrics.
  const isPercentMetric = /pct|percentage|accuracy|gir|scrambling/.test(column);
  const value = isPercentMetric ? mean / 100 : mean;

  return { value, sample_size: values.length };
}
