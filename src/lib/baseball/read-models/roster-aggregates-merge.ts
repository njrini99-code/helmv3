// =============================================================================
// src/lib/baseball/read-models/roster-aggregates-merge.ts
//
// Pure merge helper shared by the roster read model (server) and RosterClient's
// client-side refetch (browser) — kept framework/transport-free (no
// 'server-only', no Supabase client) so both call sites stay in lockstep
// instead of hand-duplicating the same merge logic and drifting.
//
// WHY THIS EXISTS: baseball_player_aggregates is written ONLY by the legacy
// CSV/manual stat-log recompute path. The box-score pipeline the rest of the
// product treats as canonical (Player Profile Stats tab, Passport) writes
// baseball_player_season_stats instead and never touches aggregates — so a
// team on the modern box-score path has real, current season stats with NO
// matching aggregates row, and the roster wall/leaderboard/dev-board would
// otherwise show em-dash/0 for players who genuinely have recent performance
// data one click away on their own profile. Merging season stats OVER the
// legacy aggregates row closes that gap without touching the box-score write
// path itself.
// =============================================================================

import type { BaseballPlayerAggregates } from '@/lib/types';

export interface SeasonStatsAggregateRow {
  player_id: string;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  /** Games played this season — the box-score-aware "sessions" figure. */
  g: number | null;
  last_updated: string | null;
}

/**
 * Merge current-season box-score stats over a legacy aggregates map. Returns a
 * NEW map (never mutates `aggregates`) keyed by player_id.
 */
export function mergeSeasonStatsIntoAggregates(
  aggregates: Record<string, BaseballPlayerAggregates>,
  seasonStatsRows: SeasonStatsAggregateRow[],
  teamId: string,
): Record<string, BaseballPlayerAggregates> {
  const merged: Record<string, BaseballPlayerAggregates> = { ...aggregates };

  for (const row of seasonStatsRows) {
    const existing = merged[row.player_id];
    const lastCalculated =
      row.last_updated ?? existing?.last_calculated_at ?? new Date().toISOString();

    merged[row.player_id] = {
      player_id: row.player_id,
      team_id: teamId,
      // Box-score game count is the honest, box-score-aware "sessions" figure
      // — never let a stale (or absent) legacy total hide real games played.
      total_sessions: Math.max(existing?.total_sessions ?? 0, row.g ?? 0),
      practice_sessions: existing?.practice_sessions ?? 0,
      game_sessions: Math.max(existing?.game_sessions ?? 0, row.g ?? 0),
      career_avg: row.avg ?? existing?.career_avg ?? null,
      career_obp: row.obp ?? existing?.career_obp ?? null,
      career_slg: row.slg ?? existing?.career_slg ?? null,
      career_ops: row.ops ?? existing?.career_ops ?? null,
      practice_avg: existing?.practice_avg ?? null,
      game_avg: row.avg ?? existing?.game_avg ?? null,
      pressure_gap: existing?.pressure_gap ?? null,
      recent_trend: existing?.recent_trend ?? null,
      trend_magnitude: existing?.trend_magnitude ?? null,
      trend_velocity: existing?.trend_velocity ?? null,
      last_5_avg: existing?.last_5_avg ?? null,
      last_10_avg: existing?.last_10_avg ?? null,
      season_avg: row.avg ?? existing?.season_avg ?? null,
      avg_pitch_velocity: existing?.avg_pitch_velocity ?? null,
      max_pitch_velocity: existing?.max_pitch_velocity ?? null,
      development_stage: existing?.development_stage ?? null,
      last_calculated_at: lastCalculated,
      updated_at: lastCalculated,
    };
  }

  return merged;
}
