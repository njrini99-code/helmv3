'use server';

/**
 * Stats Cache Server Actions
 *
 * Server actions for accessing and managing golf player stats cache.
 * Provides instant dashboard loads by leveraging pre-calculated stats.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import {
  getFullPlayerStats,
  getStatsFromCache,
  refreshStatsCache,
  markStatsStale,
  invalidateOnRoundComplete,
  getTeamPlayerStats,
  getTeamTopPlayers,
  type PlayerStatsSummary,
  type PlayerStatsCache,
} from '@/lib/cache/golf-stats-calculator';

// ============================================================================
// TYPES
// ============================================================================

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };


// ============================================================================
// PLAYER STATS ACTIONS
// ============================================================================

/**
 * Get player stats summary from cache
 * Fast endpoint for dashboard display
 */
export async function getPlayerStatsSummaryAction(
  playerId?: string
): Promise<ActionResult<PlayerStatsSummary>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    // If no player ID provided, get current user's player record
    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    } else {
      // Verify the caller has access to this player's stats
      const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, targetPlayerId);
      if (!authorized) {
        return { success: false, error: 'Not authorized to view this player\'s stats' };
      }
    }

    const stats = await getStatsFromCache(targetPlayerId);

    if (!stats) {
      return {
        success: true,
        data: {
          scoringAverage: null,
          roundsPlayed: 0,
          bestRound: null,
          worstRound: null,
          last5Average: null,
          last10Average: null,
          improvementTrend: null,
          trendDirection: 'stable',
          girPercentage: null,
          fairwayPercentage: null,
          puttsPerRound: null,
          scramblingPercentage: null,
          isStale: false,
          lastUpdated: null,
        },
      };
    }

    return { success: true, data: stats };
  } catch (error) {
    console.error('[Stats Action] Error getting player stats:', error);
    return { success: false, error: 'Failed to load stats' };
  }
}

/**
 * Get full player stats from cache
 * Complete stats for detailed stats page
 */
export async function getFullPlayerStatsAction(
  playerId?: string
): Promise<ActionResult<PlayerStatsCache | null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    } else {
      // Verify the caller has access to this player's stats
      const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, targetPlayerId);
      if (!authorized) {
        return { success: false, error: 'Not authorized to view this player\'s stats' };
      }
    }

    const stats = await getFullPlayerStats(targetPlayerId);
    return { success: true, data: stats };
  } catch (error) {
    console.error('[Stats Action] Error getting full player stats:', error);
    return { success: false, error: 'Failed to load stats' };
  }
}

/**
 * Force refresh of stats cache for a player
 * Used after manual data corrections
 */
export async function refreshStatsCacheAction(
  playerId?: string
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    // Get player ID if not provided
    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    } else {
      // Verify the user can refresh this player's stats (coach check)
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (coach && coach.organization_id) {
        // Coach - verify player is on their team
        const { data: team } = await supabase
          .from('golf_teams')
          .select('id')
          .eq('organization_id', coach.organization_id)
          .single();

        if (team) {
          const { data: membership } = await supabase
            .from('golf_team_members')
            .select('id')
            .eq('team_id', team.id)
            .eq('player_id', targetPlayerId)
            .eq('status', 'active')
            .single();

          if (!membership) {
            return { success: false, error: 'Player not found on your team' };
          }
        }
      } else {
        // Player - verify it's their own record
        const { data: player } = await supabase
          .from('golf_players')
          .select('id')
          .eq('user_id', user.id)
          .eq('id', targetPlayerId)
          .single();

        if (!player) {
          return { success: false, error: 'Not authorized to refresh this player' };
        }
      }
    }

    await refreshStatsCache(targetPlayerId);

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.STATS);

    return { success: true, data: undefined };
  } catch (error) {
    console.error('[Stats Action] Error refreshing stats cache:', error);
    return { success: false, error: 'Failed to refresh stats' };
  }
}

// ============================================================================
// TEAM STATS ACTIONS (for coaches)
// ============================================================================

/**
 * Get stats summary for all players on coach's team
 */
export async function getTeamStatsAction(): Promise<
  ActionResult<Map<string, PlayerStatsSummary>>
> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get coach record
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    if (!coach.organization_id) {
      return { success: false, error: 'Coach not assigned to an organization' };
    }

    // Get team
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .single();

    if (!team) {
      return { success: false, error: 'Team not found' };
    }

    const statsMap = await getTeamPlayerStats(team.id);
    return { success: true, data: statsMap };
  } catch (error) {
    console.error('[Stats Action] Error getting team stats:', error);
    return { success: false, error: 'Failed to load team stats' };
  }
}

/**
 * Get top performers on coach's team
 */
export async function getTeamTopPlayersAction(
  limit: number = 5
): Promise<ActionResult<Array<{ playerId: string; name: string; avgScore: number; rounds: number }>>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get coach record
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    if (!coach.organization_id) {
      return { success: false, error: 'Coach not assigned to an organization' };
    }

    // Get team
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .single();

    if (!team) {
      return { success: false, error: 'Team not found' };
    }

    const topPlayers = await getTeamTopPlayers(team.id, limit);
    return { success: true, data: topPlayers };
  } catch (error) {
    console.error('[Stats Action] Error getting top players:', error);
    return { success: false, error: 'Failed to load top players' };
  }
}

// ============================================================================
// CACHE INVALIDATION ACTIONS
// ============================================================================

/**
 * Verify the authenticated user owns this player record or coaches them.
 * Follows the same pattern as refreshStatsCacheAction.
 */
async function verifyPlayerOwnershipOrCoach(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playerId: string
): Promise<boolean> {
  // Check if user IS the player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', playerId)
    .eq('user_id', userId)
    .maybeSingle();

  if (player) return true;

  // Check if user is a coach with this player on their team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (coach?.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (team) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .eq('status', 'active')
        .maybeSingle();

      if (membership) return true;
    }
  }

  return false;
}

/**
 * Called after a round is completed/submitted
 * Triggers cache refresh for the player
 */
export async function onRoundCompleteAction(
  playerId: string,
  roundId: string
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Verify caller owns or coaches this player
    const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, playerId);
    if (!authorized) return;

    await invalidateOnRoundComplete(playerId, roundId);
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
  } catch (error) {
    console.error('[Stats Action] Error invalidating on round complete:', error);
    // Don't throw - cache invalidation failure shouldn't block round submission
  }
}

/**
 * Mark stats as stale (used when edits happen but full recalc not needed)
 */
export async function markStatsStaleAction(playerId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Verify caller owns or coaches this player
    const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, playerId);
    if (!authorized) return;

    await markStatsStale(playerId);
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/stats');
  } catch (error) {
    console.error('[Stats Action] Error marking stats stale:', error);
  }
}

// ============================================================================
// DIRECT DATABASE STATS (fallback when cache not available)
// ============================================================================

/**
 * Get player stats directly from database (no cache)
 * Used as fallback or for real-time accuracy
 */
export async function getPlayerStatsDirectAction(
  playerId?: string
): Promise<ActionResult<{
  scoringAverage: number | null;
  roundsPlayed: number;
  bestRound: number | null;
  worstRound: number | null;
  girPercentage: number | null;
  fairwayPercentage: number | null;
  puttsPerRound: number | null;
}>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    let targetPlayerId = playerId;

    if (!targetPlayerId) {
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!player) {
        return { success: false, error: 'Player profile not found' };
      }
      targetPlayerId = player.id;
    } else {
      // Verify the caller owns this player or is their coach
      const authorized = await verifyPlayerOwnershipOrCoach(supabase, user.id, targetPlayerId);
      if (!authorized) {
        return { success: false, error: 'Not authorized to view this player\'s stats' };
      }
    }

    // Get all completed rounds
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select(`
        total_score,
        total_putts,
        total_fairways_hit,
        total_fairways,
        total_gir,
        total_gir_possible,
        holes_played
      `)
      .eq('player_id', targetPlayerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null);

    if (!rounds || rounds.length === 0) {
      return {
        success: true,
        data: {
          scoringAverage: null,
          roundsPlayed: 0,
          bestRound: null,
          worstRound: null,
          girPercentage: null,
          fairwayPercentage: null,
          puttsPerRound: null,
        },
      };
    }

    const roundsPlayed = rounds.length;

    // Normalize scoring to 18-hole equivalents using per-hole average
    let totalStrokes = 0;
    let totalHoles = 0;
    const normalizedScores: number[] = [];
    for (const r of rounds) {
      if (r.total_score !== null) {
        const hp = r.holes_played ?? 18;
        totalStrokes += r.total_score;
        totalHoles += hp;
        normalizedScores.push(Math.round(r.total_score * (18 / hp)));
      }
    }
    const scoringAverage = totalHoles > 0
      ? Math.round((totalStrokes / totalHoles) * 18 * 100) / 100
      : null;

    const bestRound = normalizedScores.length > 0 ? Math.min(...normalizedScores) : null;
    const worstRound = normalizedScores.length > 0 ? Math.max(...normalizedScores) : null;

    // Calculate GIR percentage
    const totalGreens = rounds.reduce((sum, r) => sum + (r.total_gir_possible || 0), 0);
    const totalGir = rounds.reduce((sum, r) => sum + (r.total_gir || 0), 0);
    const girPercentage = totalGreens > 0
      ? Math.round((totalGir / totalGreens) * 1000) / 10
      : null;

    // Calculate fairway percentage
    const totalFairways = rounds.reduce((sum, r) => sum + (r.total_fairways || 0), 0);
    const totalFairwaysHit = rounds.reduce((sum, r) => sum + (r.total_fairways_hit || 0), 0);
    const fairwayPercentage = totalFairways > 0
      ? Math.round((totalFairwaysHit / totalFairways) * 1000) / 10
      : null;

    // Calculate putts per round — normalize to 18-hole equivalent
    let totalPutts = 0;
    let totalPuttsHoles = 0;
    for (const r of rounds) {
      if (r.total_putts) {
        totalPutts += r.total_putts;
        totalPuttsHoles += (r.holes_played ?? 18);
      }
    }
    const puttsPerRound = totalPuttsHoles > 0
      ? Math.round((totalPutts / totalPuttsHoles) * 18 * 100) / 100
      : null;

    return {
      success: true,
      data: {
        scoringAverage,
        roundsPlayed,
        bestRound,
        worstRound,
        girPercentage,
        fairwayPercentage,
        puttsPerRound,
      },
    };
  } catch (error) {
    console.error('[Stats Action] Error getting direct stats:', error);
    return { success: false, error: 'Failed to load stats' };
  }
}
