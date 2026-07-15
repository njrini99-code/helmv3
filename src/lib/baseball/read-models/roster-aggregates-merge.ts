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
//
// THIN WRAPPER (#379): this module no longer implements the merge itself —
// it is a shape-adapter around the shared, generalized precedence rule in
// legacy-stat-adapters.ts (box-score > legacy-fallback > no-data, practice
// carve-out, null-safe event-derived fields). This file's job is only to
// translate to/from the exact `Record<string, BaseballPlayerAggregates>`
// shape its two existing callers (roster.ts, RosterClient.tsx) already
// depend on, so their behavior — and this file's own exported signature —
// stays stable while the merge logic itself has exactly one implementation.
// =============================================================================

import type { BaseballPlayerAggregates } from '@/lib/types';
import {
  adaptLegacyStatsMap,
  type AdaptedPlayerStats,
  type BoxScoreGameContextRow,
} from './legacy-stat-adapters';

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
 * Project one adapted result back onto the legacy aggregates row shape.
 *
 * PER-FIELD LEGACY FALLBACK (restored pre-#379 behavior): the shared
 * adapter's "box-score wins outright" rule is correct for the general design
 * (a canonical row should never be silently diluted by a stale legacy
 * number), but this wrapper's two callers (roster.ts, RosterClient.tsx) rely
 * on a narrower, older guarantee: a player who HAS a box-score/season-stats
 * row this season but whose row carries a null rate field for a specific
 * stat (the common case being a pure pitcher/DH who appears in a completed
 * game's pitching box score and gets a `baseball_player_season_stats` row
 * with g=0 and avg/obp/slg/ops all null, per
 * recalculate_baseball_season_stats) must still show their real, existing
 * career_avg/obp/slg/ops/game_avg/season_avg from the legacy aggregates row
 * rather than regressing to an em-dash. This mirrors the avg/max_pitch_velocity
 * handling below and matches this file's pre-#379 per-field
 * `row.avg ?? existing?.career_avg ?? null` behavior exactly: whenever the
 * box-score-derived value is present (including a legitimate 0), it wins
 * outright and the legacy value is never consulted; the legacy value is only
 * read when the box-score-derived field is null/undefined (absent or
 * zero-sample), so box-score truth is never overridden by a stale legacy
 * number once it genuinely exists.
 */
function toLegacyAggregateShape(
  adapted: AdaptedPlayerStats,
  existingLegacy: BaseballPlayerAggregates | undefined,
  teamId: string,
): BaseballPlayerAggregates {
  return {
    player_id: adapted.playerId,
    team_id: teamId,
    total_sessions: adapted.totalSessions,
    practice_sessions: adapted.practice.sessions,
    game_sessions: adapted.game.sessions,
    career_avg: adapted.game.avg ?? existingLegacy?.career_avg ?? null,
    career_obp: adapted.game.obp ?? existingLegacy?.career_obp ?? null,
    career_slg: adapted.game.slg ?? existingLegacy?.career_slg ?? null,
    career_ops: adapted.game.ops ?? existingLegacy?.career_ops ?? null,
    practice_avg: adapted.practice.avg,
    game_avg: adapted.game.avg ?? existingLegacy?.game_avg ?? null,
    pressure_gap: adapted.legacyExtras.pressureGap,
    recent_trend: adapted.legacyExtras.recentTrend,
    trend_magnitude: adapted.legacyExtras.trendMagnitude,
    trend_velocity: adapted.legacyExtras.trendVelocity,
    last_5_avg: adapted.legacyExtras.last5Avg,
    last_10_avg: adapted.legacyExtras.last10Avg,
    season_avg: adapted.game.avg ?? existingLegacy?.season_avg ?? null,
    // No event-grain input is supplied by this wrapper (neither existing
    // caller fetches elite-event data), so this always resolves to the
    // legacy scalar unchanged — identical to this file's pre-#379 behavior.
    avg_pitch_velocity: adapted.event.avgPitchVelocity ?? existingLegacy?.avg_pitch_velocity ?? null,
    max_pitch_velocity: adapted.event.maxPitchVelocity ?? existingLegacy?.max_pitch_velocity ?? null,
    development_stage: adapted.legacyExtras.developmentStage,
    last_calculated_at: adapted.lastCalculatedAt,
    updated_at: adapted.updatedAt,
  };
}

/**
 * Merge current-season box-score stats over a legacy aggregates map. Returns a
 * NEW map (never mutates `aggregates`) keyed by player_id.
 *
 * Delegates to the shared adaptLegacyStatsMap precedence rule; only players
 * present in `seasonStatsRows` are written into the returned map (a player
 * with only a legacy row and no season-stats row is left byte-for-byte as-is,
 * same as before this became a thin wrapper).
 */
export function mergeSeasonStatsIntoAggregates(
  aggregates: Record<string, BaseballPlayerAggregates>,
  seasonStatsRows: SeasonStatsAggregateRow[],
  teamId: string,
): Record<string, BaseballPlayerAggregates> {
  const boxScoreRows: BoxScoreGameContextRow[] = seasonStatsRows.map((row) => ({
    player_id: row.player_id,
    avg: row.avg,
    obp: row.obp,
    slg: row.slg,
    ops: row.ops,
    sessions: row.g,
    last_updated: row.last_updated,
  }));

  const adapted = adaptLegacyStatsMap({
    legacyAggregates: aggregates,
    boxScoreRows,
  });

  const merged: Record<string, BaseballPlayerAggregates> = { ...aggregates };
  for (const row of seasonStatsRows) {
    const a = adapted[row.player_id];
    if (!a) continue;
    merged[row.player_id] = toLegacyAggregateShape(a, aggregates[row.player_id], teamId);
  }

  return merged;
}
