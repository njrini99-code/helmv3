/**
 * Golf Stats Calculator Service
 *
 * Provides functions to calculate and cache player statistics.
 * Works with the golf_player_stats_cache and golf_round_stats_cache tables
 * for instant dashboard loads.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
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

interface StatsCacheLiveSnapshot {
  liveRounds: number;
  liveScoringAvg: number | null;
  livePuttsPerRound: number | null;
  liveFairwayPct: number | null;
  liveGirPct: number | null;
}

interface StatsCacheStoredSnapshot {
  roundsPlayed: number;
  scoringAverage: number | null;
  puttsPerRound: number | null;
  fairwayPercentage: number | null;
  girPercentage: number | null;
  isStale: boolean;
  updatedAt: string | null;
}

type StatsCacheValidationResult =
  | { ok: true; cache: StatsCacheStoredSnapshot | null; live: StatsCacheLiveSnapshot }
  | { ok: false; reason: string; cache: StatsCacheStoredSnapshot | null; live: StatsCacheLiveSnapshot | null };

function getTraceError(error: unknown): {
  message: string;
  code?: string;
  hint?: string;
  details?: string;
  stack?: string;
} {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      message?: string;
      code?: string;
      hint?: string;
      details?: string;
      stack?: string;
    };

    return {
      message: candidate.message ?? 'Unknown error',
      code: candidate.code,
      hint: candidate.hint,
      details: candidate.details,
      stack: candidate.stack,
    };
  }

  return { message: String(error) };
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
    const traceError = getTraceError(error);
    await logServerError(`refresh_player_stats_cache failed: ${traceError.message}`, {
      action: 'refreshStatsCache',
      featureArea: 'stats_cache',
      playerId,
      errorCode: traceError.code,
      errorHint: traceError.hint,
      errorDetails: traceError.details,
      extra: {
        stack: traceError.stack,
      },
    }, 'critical');
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
    const traceError = getTraceError(error);
    await logServerError(`mark_player_stats_stale failed: ${traceError.message}`, {
      action: 'markStatsStale',
      featureArea: 'stats_cache',
      playerId,
      errorCode: traceError.code,
      errorHint: traceError.hint,
      errorDetails: traceError.details,
      extra: {
        stack: traceError.stack,
      },
    }, 'warning');
  }

  // Invalidate Redis cache
  await invalidateGolf.playerStats(playerId);
}

/**
 * Invalidate stats cache after round completion
 * Called from submitGolfRoundComprehensive action
 */
export async function invalidateOnRoundComplete(playerId: string, roundId: string): Promise<{ warnings: string[] }> {
  const supabase = createAdminClient();
  const warnings: string[] = [];

  // 1. Invalidate the Redis layer
  await invalidateGolf.playerStats(playerId);

  // 2. Mark DB cache as stale so getStatsFromCache() knows to refresh
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: staleError } = await (supabase as any)
      .rpc('mark_player_stats_stale', { p_player_id: playerId });
    if (staleError) {
      const traceError = getTraceError(staleError);
      await logServerError(`mark_player_stats_stale failed after round completion: ${traceError.message}`, {
        action: 'invalidateOnRoundComplete.markStatsStale',
        featureArea: 'stats_cache',
        roundId,
        playerId,
        errorCode: traceError.code,
        errorHint: traceError.hint,
        errorDetails: traceError.details,
        extra: {
          stack: traceError.stack,
        },
      }, 'warning');
      warnings.push(`Failed to mark stats stale: ${staleError.message}`);
    }
  } catch (err) {
    const traceError = getTraceError(err);
    await logServerError(`mark_player_stats_stale threw after round completion: ${traceError.message}`, {
      action: 'invalidateOnRoundComplete.markStatsStale.catch',
      featureArea: 'stats_cache',
      roundId,
      playerId,
      errorCode: traceError.code,
      errorHint: traceError.hint,
      errorDetails: traceError.details,
      extra: {
        stack: traceError.stack,
      },
    }, 'warning');
    warnings.push('Failed to mark stats stale.');
  }

  // 3. Trigger strokes gained recalculation for the round (if function exists)
  // The database trigger should handle this automatically when status='completed',
  // but we call it explicitly to ensure SG is calculated for manual updates
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgRoundError } = await (supabase as any).rpc('recalculate_round_strokes_gained', { p_round_id: roundId });
    if (sgRoundError) {
      const traceError = getTraceError(sgRoundError);
      await logServerError(`recalculate_round_strokes_gained failed: ${traceError.message}`, {
        action: 'invalidateOnRoundComplete.recalculateRoundStrokesGained',
        featureArea: 'stats_cache',
        roundId,
        playerId,
        errorCode: traceError.code,
        errorHint: traceError.hint,
        errorDetails: traceError.details,
        extra: {
          stack: traceError.stack,
        },
      }, 'warning');
      warnings.push(`Round SG recalculation failed: ${sgRoundError.message}`);
    }
  } catch (e) {
    const traceError = getTraceError(e);
    await logServerError(`recalculate_round_strokes_gained threw: ${traceError.message}`, {
      action: 'invalidateOnRoundComplete.recalculateRoundStrokesGained.catch',
      featureArea: 'stats_cache',
      roundId,
      playerId,
      errorCode: traceError.code,
      errorHint: traceError.hint,
      errorDetails: traceError.details,
      extra: {
        stack: traceError.stack,
      },
    }, 'warning');
    warnings.push('Round SG recalculation threw an exception.');
  }

  // 3b. Copy SG from round_stats_cache back to golf_rounds so both tables stay in sync.
  // The RPC writes SG to the cache only; without this step golf_rounds.strokes_gained_* stays null.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cachedSg } = await (supabase as any)
      .from('golf_round_stats_cache')
      .select('strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting')
      .eq('round_id', roundId)
      .maybeSingle();

    if (cachedSg?.strokes_gained_total != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('golf_rounds')
        .update({
          strokes_gained_total: cachedSg.strokes_gained_total,
          strokes_gained_tee: cachedSg.strokes_gained_tee,
          strokes_gained_approach: cachedSg.strokes_gained_approach,
          strokes_gained_around_green: cachedSg.strokes_gained_around_green,
          strokes_gained_putting: cachedSg.strokes_gained_putting,
        })
        .eq('id', roundId);
    }
  } catch {
    warnings.push('Failed to sync SG data from cache to golf_rounds.');
  }

  // 4. Update player stats cache with aggregated SG values
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sgPlayerError } = await (supabase as any).rpc('update_player_stats_strokes_gained', { p_player_id: playerId });
    if (sgPlayerError) {
      const traceError = getTraceError(sgPlayerError);
      await logServerError(`update_player_stats_strokes_gained failed: ${traceError.message}`, {
        action: 'invalidateOnRoundComplete.updatePlayerStatsStrokesGained',
        featureArea: 'stats_cache',
        roundId,
        playerId,
        errorCode: traceError.code,
        errorHint: traceError.hint,
        errorDetails: traceError.details,
        extra: {
          stack: traceError.stack,
        },
      }, 'warning');
      warnings.push(`Player SG aggregation failed: ${sgPlayerError.message}`);
    }
  } catch (e) {
    const traceError = getTraceError(e);
    await logServerError(`update_player_stats_strokes_gained threw: ${traceError.message}`, {
      action: 'invalidateOnRoundComplete.updatePlayerStatsStrokesGained.catch',
      featureArea: 'stats_cache',
      roundId,
      playerId,
      errorCode: traceError.code,
      errorHint: traceError.hint,
      errorDetails: traceError.details,
      extra: {
        stack: traceError.stack,
      },
    }, 'warning');
    warnings.push('Player SG aggregation threw an exception.');
  }

  // 5. Trigger full stats recalculation and await it
  // This ensures the cache is rebuilt with new round data before any subsequent reads
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: refreshError } = await (supabase as any)
      .rpc('refresh_player_stats_cache', { p_player_id: playerId });
    if (refreshError) {
      throw refreshError;
    }
  } catch (err) {
    const traceError = getTraceError(err);
    await logServerError(`refresh_player_stats_cache failed after round completion: ${traceError.message}`, {
      action: 'invalidateOnRoundComplete.refreshStatsCache',
      featureArea: 'stats_cache',
      roundId,
      playerId,
      errorCode: traceError.code,
      errorHint: traceError.hint,
      errorDetails: traceError.details,
      extra: {
        stack: traceError.stack,
      },
    }, 'error');
    warnings.push('Stats cache refresh failed.');
  }

  // 6. Verify that the rebuilt cache actually matches live completed-round data.
  let validation = await validatePlayerStatsCache(supabase, playerId);
  if (!validation.ok) {
    await logServerError(
      `Stats cache verification failed after round completion: ${validation.reason}`,
      {
        action: 'invalidateOnRoundComplete.validateCache',
        featureArea: 'stats_cache',
        roundId,
        playerId,
        extra: {
          cache: validation.cache,
          live: validation.live,
        },
      },
      'warning'
    );
    warnings.push(`Stats cache verification failed: ${validation.reason}`);
  } else if (!validation.cache) {
    await logServerError(
      'Stats cache verification failed after round completion: cache row missing',
      {
        action: 'invalidateOnRoundComplete.validateCache',
        featureArea: 'stats_cache',
        roundId,
        playerId,
        extra: {
          cache: null,
          live: validation.live,
        },
      },
      'warning'
    );
    warnings.push('Stats cache verification failed: cache row missing.');
  } else if (isStatsCacheOutOfSync(validation.cache, validation.live)) {
    try {
      // Retry once with the same admin repair path before giving up.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: retryError } = await (supabase as any)
        .rpc('refresh_player_stats_cache', { p_player_id: playerId });
      if (retryError) {
        throw retryError;
      }
      validation = await validatePlayerStatsCache(supabase, playerId);
    } catch (err) {
      const traceError = getTraceError(err);
      await logServerError(`refresh_player_stats_cache retry failed: ${traceError.message}`, {
        action: 'invalidateOnRoundComplete.refreshStatsCache.retry',
        featureArea: 'stats_cache',
        roundId,
        playerId,
        errorCode: traceError.code,
        errorHint: traceError.hint,
        errorDetails: traceError.details,
        extra: {
          stack: traceError.stack,
        },
      }, 'error');
      warnings.push('Stats cache retry failed.');
    }
  }

  if (validation.ok && validation.cache && isStatsCacheOutOfSync(validation.cache, validation.live)) {
    warnings.push('Stats cache remained out of sync after refresh.');
    void logServerError(
      'Stats cache remained out of sync after round completion refresh',
      {
        action: 'invalidateOnRoundComplete',
        roundId,
        playerId,
        extra: {
          cache: validation.cache,
          live: validation.live,
        },
      },
      'warning'
    );
  }

  // If any SG RPCs failed, re-mark stats as stale so the next read retries
  if (warnings.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('mark_player_stats_stale', { p_player_id: playerId });
    } catch {
      // Ignore secondary stale-mark failures.
    }
  }

  return { warnings };
}

async function validatePlayerStatsCache(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  playerId: string
): Promise<StatsCacheValidationResult> {
  const [
    { data: cacheRow, error: cacheError },
    { data: completedRounds, error: roundsError },
  ] = await Promise.all([
    supabase
      .from('golf_player_stats_cache')
      .select('rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, is_stale, updated_at')
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('golf_rounds')
      .select('holes_played, total_score, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible')
      .eq('player_id', playerId)
      .eq('status', 'completed'),
  ]);

  if (cacheError) {
    return { ok: false, reason: `cache read failed: ${cacheError.message}`, cache: null, live: null };
  }

  if (roundsError) {
    return { ok: false, reason: `live round read failed: ${roundsError.message}`, cache: null, live: null };
  }

  const live = buildLiveStatsSnapshot(
    completedRounds as Array<{
      holes_played: number | null;
      total_score: number | null;
      total_putts: number | null;
      total_fairways_hit: number | null;
      total_fairways: number | null;
      total_gir: number | null;
      total_gir_possible: number | null;
    }> | null
  );

  const cache = cacheRow
    ? {
        roundsPlayed: cacheRow.rounds_played ?? 0,
        scoringAverage: cacheRow.scoring_average != null ? Number(cacheRow.scoring_average) : null,
        puttsPerRound: cacheRow.putts_per_round != null ? Number(cacheRow.putts_per_round) : null,
        fairwayPercentage: cacheRow.driving_accuracy_percentage != null ? Number(cacheRow.driving_accuracy_percentage) : null,
        girPercentage: cacheRow.gir_percentage != null ? Number(cacheRow.gir_percentage) : null,
        isStale: cacheRow.is_stale ?? false,
        updatedAt: cacheRow.updated_at ?? null,
      }
    : null;

  return { ok: true, cache, live };
}

function buildLiveStatsSnapshot(
  rounds: Array<{
    holes_played: number | null;
    total_score: number | null;
    total_putts: number | null;
    total_fairways_hit: number | null;
    total_fairways: number | null;
    total_gir: number | null;
    total_gir_possible: number | null;
  }> | null
): StatsCacheLiveSnapshot {
  const completedRounds = rounds ?? [];
  // Use 18-hole rounds only for scoring average — matches DB trigger
  // (update_player_stats_cache uses COALESCE(holes_played,18) = 18 filter)
  const rounds18 = completedRounds.filter(
    round => round.total_score != null && (round.holes_played ?? 18) === 18
  );
  const totalHolesPlayed = completedRounds.reduce((sum, round) => sum + Math.max(round.holes_played ?? 18, 1), 0);
  const scoreSum18 = rounds18.reduce((sum, round) => sum + (round.total_score ?? 0), 0);
  const totalPutts = completedRounds.reduce((sum, round) => sum + (round.total_putts ?? 0), 0);
  const totalFairwaysHit = completedRounds.reduce((sum, round) => sum + (round.total_fairways_hit ?? 0), 0);
  const totalFairways = completedRounds.reduce((sum, round) => sum + (round.total_fairways ?? 0), 0);
  const totalGir = completedRounds.reduce((sum, round) => sum + (round.total_gir ?? 0), 0);
  const totalGirPossible = completedRounds.reduce((sum, round) => sum + (round.total_gir_possible ?? 0), 0);

  return {
    liveRounds: completedRounds.length,
    liveScoringAvg: rounds18.length > 0
      ? Math.round((scoreSum18 / rounds18.length) * 100) / 100
      : null,
    livePuttsPerRound: totalHolesPlayed > 0
      ? Math.round(((totalPutts / totalHolesPlayed) * 18) * 10) / 10
      : null,
    liveFairwayPct: totalFairways > 0
      ? Math.round(((totalFairwaysHit / totalFairways) * 100) * 10) / 10
      : null,
    liveGirPct: totalGirPossible > 0
      ? Math.round(((totalGir / totalGirPossible) * 100) * 10) / 10
      : null,
  };
}

function isStatsCacheOutOfSync(
  cache: StatsCacheStoredSnapshot,
  live: StatsCacheLiveSnapshot
): boolean {
  return cache.isStale
    || cache.roundsPlayed !== live.liveRounds
    || Math.abs((cache.scoringAverage ?? 0) - (live.liveScoringAvg ?? 0)) > 0.5
    || Math.abs((cache.puttsPerRound ?? 0) - (live.livePuttsPerRound ?? 0)) > 0.5
    || Math.abs((cache.fairwayPercentage ?? 0) - (live.liveFairwayPct ?? 0)) > 1
    || Math.abs((cache.girPercentage ?? 0) - (live.liveGirPct ?? 0)) > 1;
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
