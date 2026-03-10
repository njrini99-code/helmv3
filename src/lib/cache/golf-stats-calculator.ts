/**
 * Golf Stats Calculator Service
 *
 * Provides functions to calculate and cache player statistics.
 * Works with the golf_player_stats_cache and golf_round_stats_cache tables
 * for instant dashboard loads.
 */

import { createClient } from '@/lib/supabase/server';
import { cached, golfCache, invalidateGolf } from './index';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Summary stats for quick dashboard display
 * Matches the get_player_stats_summary() database function
 */
export interface PlayerStatsSummary {
  scoringAverage: number | null;
  roundsPlayed: number;
  bestRound: number | null;
  worstRound: number | null;
  last5Average: number | null;
  last10Average: number | null;
  improvementTrend: number | null;
  trendDirection: 'improving' | 'stable' | 'declining';
  girPercentage: number | null;
  fairwayPercentage: number | null;
  puttsPerRound: number | null;
  scramblingPercentage: number | null;
  isStale: boolean;
  lastUpdated: string | null;
}

/**
 * Full cached stats from golf_player_stats_cache table
 */
export interface PlayerStatsCache {
  id: string;
  playerId: string;

  // Scoring
  scoringAverage: number | null;
  scoringAverageVsPar: number | null;
  roundsPlayed: number;
  bestRound: number | null;
  worstRound: number | null;

  // Par performance
  par3Average: number | null;
  par4Average: number | null;
  par5Average: number | null;

  // Scoring distribution
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  triplePlus: number;

  // Strokes gained
  strokesGainedTotal: number | null;
  strokesGainedTee: number | null;
  strokesGainedApproach: number | null;
  strokesGainedAroundGreen: number | null;
  strokesGainedPutting: number | null;

  // Driving
  drivingAccuracyPercentage: number | null;
  fairwaysHit: number;
  fairwaysTotal: number;
  drivingDistanceAverage: number | null;

  // Approach / GIR
  girPercentage: number | null;
  greensHit: number;
  greensTotal: number;
  approachProximityAverage: number | null;

  // Short game
  scramblingPercentage: number | null;
  scramblesConverted: number;
  scrambleAttempts: number;
  sandSavePercentage: number | null;
  sandSaves: number;
  sandAttempts: number;

  // Putting
  puttsPerRound: number | null;
  puttsPerGir: number | null;
  onePuttPercentage: number | null;
  threePuttPercentage: number | null;
  totalPutts: number;

  // Trends (from enhanced migration)
  last5Average: number | null;
  last10Average: number | null;
  improvementTrend: number | null;
  trendDirection: 'improving' | 'stable' | 'declining' | null;
  roundsThisSeason: number;

  // Penalties
  penaltyStrokesPerRound: number | null;
  totalPenalties: number;

  // Metadata
  lastRoundDate: string | null;
  roundsInCalculation: number;
  calculationPeriodStart: string | null;
  calculationPeriodEnd: string | null;
  isStale: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Round-level cached stats
 */
export interface RoundStatsCache {
  roundId: string;
  playerId: string;
  totalScore: number | null;
  scoreToPar: number | null;
  frontNine: number | null;
  backNine: number | null;
  fairwaysHit: number | null;
  fairwaysTotal: number | null;
  greensHit: number | null;
  greensTotal: number | null;
  totalPutts: number | null;
  onePutts: number;
  threePutts: number;
  scramblesConverted: number;
  scrambleAttempts: number;
  sandSaves: number;
  sandAttempts: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  triplePlus: number;
  penaltyStrokes: number;
}

// ============================================================================
// CACHE ACCESS FUNCTIONS
// ============================================================================

/**
 * Get player stats from cache with freshness check
 * Uses Redis for fast access, falls back to database
 */
export async function getPlayerStatsSummary(playerId: string): Promise<PlayerStatsSummary | null> {
  return cached(
    golfCache.playerStats.key(playerId),
    async () => {
      const supabase = await createClient();

      // Use the database function for consistent stats
      // Note: This RPC function may not be in generated types yet
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .rpc('get_player_stats_summary', { p_player_id: playerId }) as { data: Record<string, unknown>[] | null; error: Error | null };

      if (error || !data || data.length === 0) {
        // No cached stats - try direct query
        const { data: directData, error: directError } = await supabase
          .from('golf_player_stats_cache')
          .select('*')
          .eq('player_id', playerId)
          .single();

        if (directError || !directData) {
          return null;
        }

        return transformToSummary(directData);
      }

      const row = data[0] as Record<string, unknown>;
      return {
        scoringAverage: row.scoring_average as number | null,
        roundsPlayed: (row.rounds_played as number) || 0,
        bestRound: row.best_round as number | null,
        worstRound: row.worst_round as number | null,
        last5Average: row.last_5_average as number | null,
        last10Average: row.last_10_average as number | null,
        improvementTrend: row.improvement_trend as number | null,
        trendDirection: (row.trend_direction as 'improving' | 'stable' | 'declining') || 'stable',
        girPercentage: row.gir_percentage as number | null,
        fairwayPercentage: row.fairway_percentage as number | null,
        puttsPerRound: row.putts_per_round as number | null,
        scramblingPercentage: row.scrambling_percentage as number | null,
        isStale: (row.is_stale as boolean) || false,
        lastUpdated: row.last_updated as string | null,
      };
    },
    { ttl: golfCache.playerStats.ttl }
  );
}

/**
 * Get full player stats cache
 */
export async function getFullPlayerStats(playerId: string): Promise<PlayerStatsCache | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('golf_player_stats_cache')
    .select('*')
    .eq('player_id', playerId)
    .single();

  if (error || !data) {
    return null;
  }

  return transformToPlayerStatsCache(data);
}

/**
 * Get stats from cache, calculating if stale or missing
 */
export async function getStatsFromCache(playerId: string): Promise<PlayerStatsSummary | null> {
  const stats = await getPlayerStatsSummary(playerId);

  if (!stats) {
    // No cache exists - trigger calculation
    await refreshStatsCache(playerId);
    return getPlayerStatsSummary(playerId);
  }

  if (stats.isStale) {
    // Cache is stale - recalculate in background
    refreshStatsCache(playerId).catch(() => {
      // Ignore errors - we still have stale data to return
    });
  }

  return stats;
}

// ============================================================================
// CACHE UPDATE FUNCTIONS
// ============================================================================

/**
 * Refresh the stats cache for a player
 * Called after round completion, edits, or deletions
 */
export async function refreshStatsCache(playerId: string): Promise<void> {
  const supabase = await createClient();

  // Call the database function to refresh
  // Note: This RPC function may not be in generated types yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .rpc('refresh_player_stats_cache', { p_player_id: playerId });

  if (error) {
    console.error('[Stats Cache] Failed to refresh cache for player:', playerId, error);
    throw error;
  }

  // Invalidate Redis cache to force fresh fetch
  await invalidateGolf.playerStats(playerId);
}

/**
 * Mark a player's stats cache as stale
 * Used when data changes but full recalc isn't needed immediately
 */
export async function markStatsStale(playerId: string): Promise<void> {
  const supabase = await createClient();

  // Note: This RPC function may not be in generated types yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .rpc('mark_player_stats_stale', { p_player_id: playerId });

  if (error) {
    console.error('[Stats Cache] Failed to mark stats stale for player:', playerId, error);
  }

  // Invalidate Redis cache
  await invalidateGolf.playerStats(playerId);
}

/**
 * Invalidate stats cache after round completion
 * Called from submitGolfRoundComprehensive action
 */
export async function invalidateOnRoundComplete(playerId: string, roundId: string): Promise<{ warnings: string[] }> {
  const supabase = await createClient();
  const warnings: string[] = [];

  // 1. Invalidate the Redis layer
  await invalidateGolf.playerStats(playerId);

  // 2. Mark DB cache as stale so getStatsFromCache() knows to refresh
  await markStatsStale(playerId);

  // 3. Trigger strokes gained recalculation for the round (if function exists)
  // The database trigger should handle this automatically when status='completed',
  // but we call it explicitly to ensure SG is calculated for manual updates
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgRoundError } = await (supabase as any).rpc('recalculate_round_strokes_gained', { p_round_id: roundId });
    if (sgRoundError) {
      console.error('[Stats] recalculate_round_strokes_gained failed:', roundId, sgRoundError);
      warnings.push(`Round SG recalculation failed: ${sgRoundError.message}`);
    }
  } catch (e) {
    console.error('[Stats] recalculate_round_strokes_gained threw:', roundId, e);
    warnings.push('Round SG recalculation threw an exception.');
  }

  // 4. Update player stats cache with aggregated SG values
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgPlayerError } = await (supabase as any).rpc('update_player_stats_strokes_gained', { p_player_id: playerId });
    if (sgPlayerError) {
      console.error('[Stats] update_player_stats_strokes_gained failed:', playerId, sgPlayerError);
      warnings.push(`Player SG aggregation failed: ${sgPlayerError.message}`);
    }
  } catch (e) {
    console.error('[Stats] update_player_stats_strokes_gained threw:', playerId, e);
    warnings.push('Player SG aggregation threw an exception.');
  }

  // 5. Trigger full stats recalculation and await it
  // This ensures the cache is rebuilt with new round data before any subsequent reads
  try {
    await refreshStatsCache(playerId);
  } catch (err) {
    console.error('[Stats] refreshStatsCache failed:', playerId, err);
    warnings.push('Stats cache refresh failed.');
  }

  // If any SG RPCs failed, re-mark stats as stale so the next read retries
  if (warnings.length > 0) {
    await markStatsStale(playerId).catch(() => {});
  }

  return { warnings };
}

// ============================================================================
// TEAM STATS FUNCTIONS
// ============================================================================

/**
 * Get cached stats for all players on a team
 * Optimized for coach dashboard
 */
export async function getTeamPlayerStats(teamId: string): Promise<Map<string, PlayerStatsSummary>> {
  const supabase = await createClient();

  // Get active player IDs on team
  const { data: members } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (!members || members.length === 0) {
    return new Map();
  }

  const playerIds = members.map(m => m.player_id);

  // Fetch all cached stats in one query
  const { data: statsData } = await supabase
    .from('golf_player_stats_cache')
    .select('*')
    .in('player_id', playerIds);

  const statsMap = new Map<string, PlayerStatsSummary>();

  for (const row of statsData || []) {
    statsMap.set(row.player_id, transformToSummary(row));
  }

  return statsMap;
}

/**
 * Get top performers on a team
 */
export async function getTeamTopPlayers(
  teamId: string,
  limit: number = 5
): Promise<Array<{ playerId: string; name: string; avgScore: number; rounds: number }>> {
  const supabase = await createClient();

  // Get active team members with player info
  const { data: members } = await supabase
    .from('golf_team_members')
    .select(`
      player_id,
      golf_players (first_name, last_name)
    `)
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (!members || members.length === 0) {
    return [];
  }

  const playerIds = members.map(m => m.player_id);

  // Get cached stats ordered by scoring average
  const { data: statsData } = await supabase
    .from('golf_player_stats_cache')
    .select('player_id, scoring_average, rounds_played')
    .in('player_id', playerIds)
    .not('scoring_average', 'is', null)
    .order('scoring_average', { ascending: true })
    .limit(limit);

  if (!statsData) return [];

  // Build result with player names
  const memberMap = new Map<string, { first_name: string | null; last_name: string | null } | null>(
    members.map(m => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = (m as any).golf_players as { first_name: string | null; last_name: string | null } | null;
      return [m.player_id, player];
    })
  );

  return statsData.map(stat => {
    const player = memberMap.get(stat.player_id);
    return {
      playerId: stat.player_id,
      name: `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || 'Unknown',
      avgScore: stat.scoring_average ?? 0,
      rounds: stat.rounds_played || 0,
    };
  });
}

// ============================================================================
// TRANSFORM FUNCTIONS
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformToSummary(row: any): PlayerStatsSummary {
  return {
    scoringAverage: row.scoring_average ?? null,
    roundsPlayed: row.rounds_played ?? 0,
    bestRound: row.best_round ?? null,
    worstRound: row.worst_round ?? null,
    last5Average: row.last_5_average ?? null,
    last10Average: row.last_10_average ?? null,
    improvementTrend: row.improvement_trend ?? null,
    trendDirection: row.trend_direction || 'stable',
    girPercentage: row.gir_percentage ?? null,
    fairwayPercentage: row.driving_accuracy_percentage ?? null,
    puttsPerRound: row.putts_per_round ?? null,
    scramblingPercentage: row.scrambling_percentage ?? null,
    isStale: row.is_stale ?? false,
    lastUpdated: row.updated_at ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformToPlayerStatsCache(row: any): PlayerStatsCache {
  return {
    id: row.id,
    playerId: row.player_id,
    scoringAverage: row.scoring_average ?? null,
    scoringAverageVsPar: row.scoring_average_vs_par ?? null,
    roundsPlayed: row.rounds_played ?? 0,
    bestRound: row.best_round ?? null,
    worstRound: row.worst_round ?? null,
    par3Average: row.par3_average ?? null,
    par4Average: row.par4_average ?? null,
    par5Average: row.par5_average ?? null,
    eagles: row.eagles ?? 0,
    birdies: row.birdies ?? 0,
    pars: row.pars ?? 0,
    bogeys: row.bogeys ?? 0,
    doubleBogeys: row.double_bogeys ?? 0,
    triplePlus: row.triple_plus ?? 0,
    strokesGainedTotal: row.strokes_gained_total ?? null,
    strokesGainedTee: row.strokes_gained_tee ?? null,
    strokesGainedApproach: row.strokes_gained_approach ?? null,
    strokesGainedAroundGreen: row.strokes_gained_around_green ?? null,
    strokesGainedPutting: row.strokes_gained_putting ?? null,
    drivingAccuracyPercentage: row.driving_accuracy_percentage ?? null,
    fairwaysHit: row.fairways_hit ?? 0,
    fairwaysTotal: row.fairways_total ?? 0,
    drivingDistanceAverage: row.driving_distance_average ?? null,
    girPercentage: row.gir_percentage ?? null,
    greensHit: row.greens_hit ?? 0,
    greensTotal: row.greens_total ?? 0,
    approachProximityAverage: row.approach_proximity_average ?? null,
    scramblingPercentage: row.scrambling_percentage ?? null,
    scramblesConverted: row.scrambles_converted ?? 0,
    scrambleAttempts: row.scramble_attempts ?? 0,
    sandSavePercentage: row.sand_save_percentage ?? null,
    sandSaves: row.sand_saves ?? 0,
    sandAttempts: row.sand_attempts ?? 0,
    puttsPerRound: row.putts_per_round ?? null,
    puttsPerGir: row.putts_per_gir ?? null,
    onePuttPercentage: row.one_putt_percentage ?? null,
    threePuttPercentage: row.three_putt_percentage ?? null,
    totalPutts: row.total_putts ?? 0,
    last5Average: row.last_5_average ?? null,
    last10Average: row.last_10_average ?? null,
    improvementTrend: row.improvement_trend ?? null,
    trendDirection: row.trend_direction ?? null,
    roundsThisSeason: row.rounds_this_season ?? 0,
    penaltyStrokesPerRound: row.penalty_strokes_per_round ?? null,
    totalPenalties: row.total_penalties ?? 0,
    lastRoundDate: row.last_round_date ?? null,
    roundsInCalculation: row.rounds_in_calculation ?? 0,
    calculationPeriodStart: row.calculation_period_start ?? null,
    calculationPeriodEnd: row.calculation_period_end ?? null,
    isStale: row.is_stale ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  invalidateGolf,
};
