// @ts-nocheck
// Database types are out of sync - course_par, yardage columns not in types
// TODO: Run `npm run db:types` to regenerate types after migrations
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
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo,
} from '@/lib/utils/golf-stats-calculator-shots';

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
export async function getPlayerProfileStats(
  playerId: string,
  roundId: string | 'overall' = 'overall'
): Promise<PlayerProfileStatsResponse> {
  const supabase = await createClient();

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
        holes_played,
        course_par
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    if (roundsError) {
      console.error('[getPlayerProfileStats] Error fetching rounds:', roundsError);
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

    // 3. Fetch all shots for the selected round(s)
    const { data: shotsData, error: shotsError } = await supabase
      .from('golf_shots')
      .select('*')
      .in('round_id', roundIdsToFetch)
      .order('hole_number')
      .order('shot_number');

    if (shotsError) {
      console.error('[getPlayerProfileStats] Error fetching shots:', shotsError);
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
    const { data: holesData } = await supabase
      .from('golf_holes')
      .select('round_id, hole_number, par, yardage')
      .in('round_id', roundIdsToFetch);

    // 5. Build data structures for calculator
    const selectedRounds = roundId === 'overall'
      ? roundsData
      : roundsData?.filter(r => r.id === roundId);

    const roundsInfo: RoundInfo[] = (selectedRounds || []).map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name,
      round_type: r.round_type as 'practice' | 'qualifying' | 'tournament' | null,
      course_par: r.course_par,
      holes_played: r.holes_played,
    }));

    // Build holes lookup
    const holesInfo: HoleInfo[] = (holesData || []).map(h => ({
      round_id: h.round_id,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage,
    }));

    // Transform shots to RawShot format
    const rawShots: RawShot[] = shotsData.map(s => ({
      id: s.id,
      round_id: s.round_id,
      hole_number: s.hole_number,
      shot_number: s.shot_number,
      shot_type: s.shot_type,
      club_used: s.club_used,
      club_type: s.club_type,
      lie_before: s.lie_before,
      lie_after: s.lie_after,
      distance_to_hole_before: s.distance_to_hole_before,
      distance_to_hole_after: s.distance_to_hole_after,
      result: s.result,
      miss_direction: s.miss_direction,
      putt_break: s.putt_break,
      putt_distance_feet: s.putt_distance_feet,
      penalty_strokes: s.penalty_strokes,
    }));

    // 6. Calculate comprehensive stats
    const stats = calculateStatsFromShots(rawShots, roundsInfo, holesInfo);

    return {
      success: true,
      stats,
      rounds,
    };
  } catch (error) {
    console.error('[getPlayerProfileStats] Unexpected error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred',
      stats: null,
      rounds: [],
    };
  }
}

// ============================================================================
// FAST SUMMARY - For initial page load (no shots needed)
// ============================================================================

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
export async function getPlayerQuickSummary(playerId: string): Promise<QuickSummary> {
  const supabase = await createClient();

  const { data: roundsData, error } = await supabase
    .from('golf_rounds')
    .select(`
      total_score,
      score_to_par,
      fairways_hit,
      fairway_opportunities,
      greens_in_regulation,
      gir_opportunities
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  if (error || !roundsData || roundsData.length === 0) {
    return {
      roundsPlayed: 0,
      scoringAverage: null,
      avgScoreToPar: null,
      bestRound: null,
      girPercentage: null,
      fairwayPercentage: null,
    };
  }

  const rounds = roundsData;
  const totalScores = rounds.map(r => r.total_score).filter((s): s is number => s !== null);
  const toParScores = rounds.map(r => r.score_to_par).filter((s): s is number => s !== null);

  // Calculate fairway and GIR totals
  let totalFairwaysHit = 0;
  let totalFairwayOpps = 0;
  let totalGir = 0;
  let totalGirOpps = 0;

  for (const r of rounds) {
    if (r.fairways_hit !== null && r.fairway_opportunities !== null) {
      totalFairwaysHit += r.fairways_hit;
      totalFairwayOpps += r.fairway_opportunities;
    }
    if (r.greens_in_regulation !== null && r.gir_opportunities !== null) {
      totalGir += r.greens_in_regulation;
      totalGirOpps += r.gir_opportunities;
    }
  }

  return {
    roundsPlayed: rounds.length,
    scoringAverage: totalScores.length > 0
      ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length
      : null,
    avgScoreToPar: toParScores.length > 0
      ? toParScores.reduce((a, b) => a + b, 0) / toParScores.length
      : null,
    bestRound: totalScores.length > 0 ? Math.min(...totalScores) : null,
    girPercentage: totalGirOpps > 0 ? (totalGir / totalGirOpps) * 100 : null,
    fairwayPercentage: totalFairwayOpps > 0 ? (totalFairwaysHit / totalFairwayOpps) * 100 : null,
  };
}
