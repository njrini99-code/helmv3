'use server';

/**
 * Player Profile Stats Action
 *
 * Combined data fetch for player profile page:
 * - Fast summary stats (from rounds table)
 * - Full detailed stats (from shots table, calculated)
 * - Round list for filtering
 */

import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo,
} from '@/lib/utils/golf-stats-calculator-shots';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import { logServerError } from '@/lib/server-error-logger';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// TYPES
// ============================================================================

export interface RoundOption {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
}

export interface PlayerProfileStatsResponse {
  success: boolean;
  error?: string;
  stats: GolfStats | null;
  rounds: RoundOption[];
}

// ============================================================================
// MAIN ACTION - Get full stats for player profile
// ============================================================================

/**
 * Get comprehensive stats for a player's profile page
 * Supports filtering by specific round or overall (all rounds)
 */
async function getPlayerProfileStatsImpl(
  playerId: string,
  roundId: string | 'overall' = 'overall'
): Promise<PlayerProfileStatsResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized', stats: null, rounds: [] };
  }

  // Verify the caller owns this player or is their coach
  const isOwner = await supabase
    .from('golf_players').select('id').eq('id', playerId).eq('user_id', user.id).maybeSingle();
  if (!isOwner.data) {
    const coach = await supabase
      .from('golf_coaches').select('id, organization_id').eq('user_id', user.id).maybeSingle();
    if (!coach.data?.organization_id) {
      return { success: false, error: 'Unauthorized', stats: null, rounds: [] };
    }
    // Deterministic org→team resolution (handles orgs with >1 team)
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.data.organization_id, coach.data.id);
    if (!teamId) {
      return { success: false, error: 'Unauthorized', stats: null, rounds: [] };
    }
    const membership = await supabase
      .from('golf_team_members').select('id').eq('team_id', teamId).eq('player_id', playerId).eq('status', 'active').maybeSingle();
    if (!membership.data) {
      return { success: false, error: 'Unauthorized', stats: null, rounds: [] };
    }
  }

  try {
    // 1. Get all completed rounds for this player
    const { data: roundsData, error: roundsError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        round_date,
        course_name,
        round_type,
        total_score,
        score_to_par,
        holes_played
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    if (roundsError) {
      await logServerError(`[getPlayerProfileStats] Error fetching rounds: ${roundsError instanceof Error ? roundsError.message : String(roundsError)}`, { action: 'player_profile_stats.getPlayerProfileStats' });
      return { success: false, error: 'Failed to fetch rounds', stats: null, rounds: [] };
    }

    const rounds: RoundOption[] = (roundsData || []).map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name,
      round_type: r.round_type,
      total_score: r.total_score,
      score_to_par: r.score_to_par,
    }));

    // If no rounds, return early
    if (rounds.length === 0) {
      return {
        success: true,
        stats: null,
        rounds: [],
      };
    }

    // 2. Determine which round IDs to fetch shots for
    const roundIdsToFetch = roundId === 'overall'
      ? rounds.map(r => r.id)
      : [roundId];

    // 3. Fetch all shots for the selected round(s) with detail tables
    const { data: shotsData, error: shotsError } = await fetchAllRowsResult((from, to) => supabase
      .from('golf_shots')
      .select(`
        *,
        putt_details(miss_tags, break_direction, estimated_break_inches, distance_feet, made),
        approach_miss_details(miss_direction, lie_type, distance_from_green_yards)
      `)
      .in('round_id', roundIdsToFetch)
      .order('hole_number')
      .order('shot_number')
      .order('id', { ascending: true })
      .range(from, to), undefined, { table: 'golf_shots', action: 'getPlayerProfileStats', feature: 'my_game_profile', sport: 'golf' }); // paginate past PostgREST 1000-row cap

    if (shotsError) {
      await logServerError(`[getPlayerProfileStats] Error fetching shots: ${shotsError instanceof Error ? shotsError.message : String(shotsError)}`, { action: 'player_profile_stats.getPlayerProfileStats' });
      return { success: false, error: 'Failed to fetch shot data', stats: null, rounds };
    }

    // If no shots, return with null stats but with rounds list
    if (!shotsData || shotsData.length === 0) {
      return {
        success: true,
        stats: null,
        rounds,
      };
    }

    // 4. Fetch hole info for the rounds
    const { data: holesData } = await fetchAllRowsResult((from, to) => supabase
      .from('golf_holes')
      // gir/score/sand_save are canonical inputs: without them the calculator
      // falls back to shot-count for score and re-derives GIR from shot results,
      // which corrupts scrambling, sand-save, and any score/par-based stat.
      .select('round_id, hole_number, par, yardage, gir, score, putts, fairway_hit, sand_save')
      .in('round_id', roundIdsToFetch)
      .order('id', { ascending: true })
      .range(from, to), undefined, { table: 'golf_holes', action: 'getPlayerProfileStats', feature: 'my_game_profile', sport: 'golf' }); // paginate past PostgREST 1000-row cap

    // 5. Build data structures for calculator
    const selectedRounds = roundId === 'overall'
      ? roundsData
      : roundsData?.filter(r => r.id === roundId);

    const roundsInfo: RoundInfo[] = (selectedRounds || []).map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name,
      round_type: r.round_type ? roundTypeFromDb(r.round_type) : null,
      holes_played: r.holes_played,
    }));

    // Build holes lookup
    const holesInfo: HoleInfo[] = (holesData || []).map(h => ({
      round_id: h.round_id,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage ?? null,
      gir: h.gir ?? null,
      score: h.score ?? null,
      putts: h.putts ?? null,
      fairway_hit: h.fairway_hit ?? null,
      sand_save: h.sand_save ?? null,
    }));

    // Transform shots to RawShot format - don't filter out shots with missing distances
    // as they're still needed for GIR calculation (shots with result='green') and scoring
    const rawShots: RawShot[] = shotsData.map(s => {
      // Calculate shot_distance from before/after if missing
      let shotDistance = s.shot_distance;
      if (shotDistance === null && s.distance_to_hole_before !== null && s.distance_to_hole_after !== null) {
        const beforeYards = s.distance_unit_before === 'feet'
          ? s.distance_to_hole_before / 3
          : s.distance_to_hole_before;
        const afterYards = s.distance_unit_after === 'feet'
          ? s.distance_to_hole_after / 3
          : s.distance_to_hole_after;
        shotDistance = Math.max(0, Math.round(beforeYards - afterYards));
      }

      // Extract detail table data (Supabase returns arrays for 1:1 relations, take first item)
      const puttDetails = Array.isArray(s.putt_details) ? s.putt_details[0] : s.putt_details;
      const approachMissDetails = Array.isArray(s.approach_miss_details) ? s.approach_miss_details[0] : s.approach_miss_details;

      return {
        id: s.id,
        round_id: s.round_id,
        hole_number: s.hole_number,
        shot_number: s.shot_number,
        shot_type: s.shot_type,
        club_type: s.club_type,
        lie_before: s.lie_before,
        lie_after: s.lie_after,
        distance_to_hole_before: s.distance_to_hole_before,
        distance_unit_before: s.distance_unit_before,
        distance_to_hole_after: s.distance_to_hole_after,
        distance_unit_after: s.distance_unit_after,
        shot_distance: shotDistance,
        result: s.result,
        miss_direction: s.miss_direction,
        putt_break: s.putt_break,
        putt_distance_feet: s.putt_distance_feet,
        putt_slope: s.putt_slope,
        putt_made: s.putt_made,
        is_penalty: s.is_penalty,
        penalty_type: s.penalty_type,
        // Extended putt detail fields
        putt_miss_tags: puttDetails?.miss_tags ?? null,
        putt_break_direction: puttDetails?.break_direction ?? null,
        putt_estimated_break_inches: puttDetails?.estimated_break_inches ?? null,
        // Extended approach miss detail fields
        approach_miss_direction: approachMissDetails?.miss_direction ?? null,
        approach_miss_lie_type: approachMissDetails?.lie_type ?? null,
        approach_miss_distance_from_green: approachMissDetails?.distance_from_green_yards ?? null,
      };
    });

    if (rawShots.length === 0) {
      return {
        success: true,
        stats: null,
        rounds,
      };
    }

    // 6. Calculate comprehensive stats. Apply the per-team SG baseline scale
    // (women's 1.083, NCAA tiers) via the same DB function the cache uses, so
    // this surface's SG matches the cache.
    const { data: sgScaleRaw } = await supabase.rpc('sg_scale_for_player', { p_player_id: playerId });
    const sgScale = typeof sgScaleRaw === 'number' && sgScaleRaw > 0 ? sgScaleRaw : 1;
    const stats = calculateStatsFromShots(rawShots, holesInfo, roundsInfo, { sgScale });

    return {
      success: true,
      stats,
      rounds,
    };
  } catch (error) {
    await logServerError(`[getPlayerProfileStats] Unexpected error: ${error instanceof Error ? error.message : String(error)}`, { action: 'player_profile_stats.getPlayerProfileStats' });
    return {
      success: false,
      error: 'An unexpected error occurred',
      stats: null,
      rounds: [],
    };
  }
}

const observedGetPlayerProfileStats = withAdminObserved(
  'getPlayerProfileStats',
  { sport: 'golf', feature: 'my_game_profile' },
  getPlayerProfileStatsImpl,
);

export async function getPlayerProfileStats(
  playerId: string,
  roundId: string | 'overall' = 'overall'
): Promise<PlayerProfileStatsResponse> {
  return observedGetPlayerProfileStats(playerId, roundId);
}

// ============================================================================
// FAST SUMMARY - For initial page load (no shots needed)
// ============================================================================

export interface QuickSummaryResponse {
  success: boolean;
  error?: string;
  data?: QuickSummary;
}

export interface QuickSummary {
  roundsPlayed: number;
  scoringAverage: number | null;
  avgScoreToPar: number | null;
  bestRound: number | null;
  girPercentage: number | null;
  fairwayPercentage: number | null;
}

/**
 * Get lightweight summary stats without shot data
 * Uses aggregated data from rounds table - much faster
 */
async function getPlayerQuickSummaryImpl(playerId: string): Promise<QuickSummaryResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Verify the caller owns this player or is their coach
  const isOwner = await supabase
    .from('golf_players').select('id').eq('id', playerId).eq('user_id', user.id).maybeSingle();
  if (!isOwner.data) {
    const coach = await supabase
      .from('golf_coaches').select('id, organization_id').eq('user_id', user.id).maybeSingle();
    if (!coach.data?.organization_id) {
      return { success: false, error: 'Unauthorized' };
    }
    // Deterministic org→team resolution (handles orgs with >1 team)
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.data.organization_id, coach.data.id);
    if (!teamId) {
      return { success: false, error: 'Unauthorized' };
    }
    const membership = await supabase
      .from('golf_team_members').select('id').eq('team_id', teamId).eq('player_id', playerId).eq('status', 'active').maybeSingle();
    if (!membership.data) {
      return { success: false, error: 'Unauthorized' };
    }
  }

  const { data: roundsData, error } = await supabase
    .from('golf_rounds')
    .select(`
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      holes_played
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  if (error || !roundsData || roundsData.length === 0) {
    return {
      success: true,
      data: {
        roundsPlayed: 0,
        scoringAverage: null,
        avgScoreToPar: null,
        bestRound: null,
        girPercentage: null,
        fairwayPercentage: null,
      },
    };
  }

  const rounds = roundsData;

  // Scoring average is defined over 18-hole rounds only (matches the canonical
  // golf_player_stats_cache.scoring_average = SUM(total_score)/COUNT over rounds
  // with holes_played = 18). Best round is normalized to 18 holes, matching the
  // cache's best_round_normalized = MIN(total_score * 18 / holes_played).
  let totalStrokes18 = 0;
  let roundsCount18 = 0;
  let totalToPar18 = 0;
  let roundsToParCount18 = 0;
  const normalizedScores: number[] = [];
  for (const r of rounds) {
    const hp = r.holes_played ?? 18;
    if (r.total_score !== null) {
      normalizedScores.push(Math.round(r.total_score * (18 / hp)));
      if (hp === 18) {
        totalStrokes18 += r.total_score;
        roundsCount18 += 1;
      }
    }
    if (r.score_to_par !== null && hp === 18) {
      totalToPar18 += r.score_to_par;
      roundsToParCount18 += 1;
    }
  }

  // Calculate fairway and GIR totals
  let totalFairwaysHit = 0;
  let totalFairwayOpps = 0;
  let totalGir = 0;
  let totalGirOpps = 0;

  for (const r of rounds) {
    if (r.total_fairways_hit !== null && r.total_fairways !== null) {
      totalFairwaysHit += r.total_fairways_hit;
      totalFairwayOpps += r.total_fairways;
    }
    if (r.total_gir !== null && r.total_gir_possible !== null) {
      totalGir += r.total_gir;
      totalGirOpps += r.total_gir_possible;
    }
  }

  return {
    success: true,
    data: {
      roundsPlayed: rounds.length,
      scoringAverage: roundsCount18 > 0
        ? Math.round((totalStrokes18 / roundsCount18) * 100) / 100
        : null,
      avgScoreToPar: roundsToParCount18 > 0
        ? Math.round((totalToPar18 / roundsToParCount18) * 100) / 100
        : null,
      bestRound: normalizedScores.length > 0 ? Math.min(...normalizedScores) : null,
      girPercentage: totalGirOpps > 0 ? Math.round((totalGir / totalGirOpps) * 100 * 10) / 10 : null,
      fairwayPercentage: totalFairwayOpps > 0 ? Math.round((totalFairwaysHit / totalFairwayOpps) * 100 * 10) / 10 : null,
    },
  };
}

const observedGetPlayerQuickSummary = withAdminObserved(
  'getPlayerQuickSummary',
  { sport: 'golf', feature: 'my_game_profile' },
  getPlayerQuickSummaryImpl,
);

export async function getPlayerQuickSummary(playerId: string): Promise<QuickSummaryResponse> {
  return observedGetPlayerQuickSummary(playerId);
}
