'use server';

import { createClient } from '@/lib/supabase/server';
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo
} from '@/lib/utils/golf-stats-calculator-shots';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import {
  generateStatisticalStrengthsWeaknesses,
  type StatisticalStrengthWeakness,
} from '@/lib/golf/strokes-gained';

// ============================================================================
// AUTH GUARD
// ============================================================================

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Stats filter options for filtering rounds
 */
export interface StatsFilter {
  // Preset filters
  preset?: 'last5' | 'last10' | 'last20' | 'tournaments' | 'practice' | 'thisMonth' | 'thisYear' | 'custom';

  // Date range (for custom filter)
  startDate?: string;
  endDate?: string;

  // Course filter
  courseName?: string;

  // Round type filter
  roundType?: 'practice' | 'qualifier' | 'tournament';

  // Season/year filter (for historical comparison)
  season?: number; // e.g., 2024, 2025
}

export interface StatsSummary {
  roundsPlayed: number;
  holesPlayed: number;
  scoringAverage: number | null;
  bestRound: number | null;
  worstRound: number | null;
  girPercentage: number | null;
  fairwayPercentage: number | null;
  puttsPerRound: number | null;
  scramblingPercentage: number | null;
}

export interface RoundSummary {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
}

export interface SummaryStatsResponse {
  summary: StatsSummary;
  rounds: RoundSummary[];
}

// ============================================================================
// FILTER HELPERS
// ============================================================================

/**
 * Build filter conditions for a Supabase query
 * Returns an object with filter functions to apply
 */
function getFilterConditions(filter?: StatsFilter): {
  startDate: string | null;
  endDate: string | null;
  roundType: string | null;
  courseName: string | null;
} {
  if (!filter) {
    return { startDate: null, endDate: null, roundType: null, courseName: null };
  }

  // Date-based presets
  const now = new Date();
  let startDateVal: string | null = null;
  let endDateVal: string | null = filter.endDate || null;

  if (filter.preset === 'thisMonth') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    startDateVal = monthStart.toISOString().split('T')[0] ?? null;
  } else if (filter.preset === 'thisYear') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    startDateVal = yearStart.toISOString().split('T')[0] ?? null;
  } else if (filter.startDate) {
    startDateVal = filter.startDate;
  }

  // Season filter
  if (filter.season) {
    const seasonStart = new Date(filter.season, 0, 1);
    const seasonEnd = new Date(filter.season, 11, 31);
    startDateVal = seasonStart.toISOString().split('T')[0] ?? null;
    endDateVal = seasonEnd.toISOString().split('T')[0] ?? null;
  }

  // Round type filter
  let roundType: string | null = null;
  if (filter.preset === 'tournaments') {
    roundType = 'tournament';
  } else if (filter.preset === 'practice') {
    roundType = 'practice';
  } else if (filter.roundType) {
    roundType = filter.roundType;
  }

  return {
    startDate: startDateVal,
    endDate: endDateVal,
    roundType,
    courseName: filter.courseName || null,
  };
}

function applyRoundTypeFilter<T extends { in(column: string, values: string[]): T; eq(column: string, value: string): T }>(
  query: T,
  roundType: string | null
): T {
  if (!roundType) return query;
  if (roundType === 'qualifier') {
    return query.in('round_type', ['qualifier', 'qualifying']);
  }
  return query.eq('round_type', roundType);
}

/**
 * Apply preset limit after fetching
 */
function applyPresetLimit<T>(rounds: T[], filter?: StatsFilter): T[] {
  if (!filter?.preset) return rounds;

  switch (filter.preset) {
    case 'last5':
      return rounds.slice(0, 5);
    case 'last10':
      return rounds.slice(0, 10);
    case 'last20':
      return rounds.slice(0, 20);
    default:
      return rounds;
  }
}

// ============================================================================
// FAST INITIAL LOAD - Summary stats only (no shot data)
// ============================================================================

/**
 * Get lightweight summary stats for a player
 * This uses pre-aggregated data from rounds table - no shot queries
 * Typically 10-50ms vs 500-2000ms for full shot analysis
 */
export async function getStatsSummary(
  playerId: string,
  filter?: StatsFilter
): Promise<SummaryStatsResponse> {
  const { supabase } = await requireAuth();
  const conditions = getFilterConditions(filter);

  // Build query with filters
  let query = supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts,
      holes_played
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  // Apply filter conditions
  if (conditions.startDate) {
    query = query.gte('round_date', conditions.startDate);
  }
  if (conditions.endDate) {
    query = query.lte('round_date', conditions.endDate);
  }
  query = applyRoundTypeFilter(query, conditions.roundType);
  if (conditions.courseName) {
    query = query.eq('course_name', conditions.courseName);
  }

  query = query.order('round_date', { ascending: false });

  const { data: roundsData, error } = await query;

  // Apply preset limits
  const filteredRounds = applyPresetLimit(roundsData || [], filter);

  if (error || filteredRounds.length === 0) {
    return {
      summary: {
        roundsPlayed: 0,
        holesPlayed: 0,
        scoringAverage: null,
        bestRound: null,
        worstRound: null,
        girPercentage: null,
        fairwayPercentage: null,
        puttsPerRound: null,
        scramblingPercentage: null,
      },
      rounds: [],
    };
  }

  // Calculate summary stats from filtered rounds
  const scores = filteredRounds.map(r => r.total_score).filter((s): s is number => s !== null);
  const roundsPlayed = scores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;

  for (const round of filteredRounds) {
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
    }
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage: scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null,
    bestRound: scores.length > 0 ? Math.min(...scores) : null,
    worstRound: scores.length > 0 ? Math.max(...scores) : null,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    puttsPerRound: roundsPlayed > 0
      ? Math.round((totalPutts / roundsPlayed) * 10) / 10
      : null,
    scramblingPercentage: null, // Scrambling data not available in summary view
  };

  const rounds: RoundSummary[] = filteredRounds.map(r => ({
    id: r.id,
    round_date: r.round_date,
    course_name: r.course_name,
    round_type: r.round_type,
    total_score: r.total_score,
    score_to_par: r.score_to_par,
  }));

  return { summary, rounds };
}

// ============================================================================
// ON-DEMAND LOAD - Full shot-level stats (lazy loaded)
// ============================================================================

/**
 * Get detailed shot-level stats for comprehensive analysis
 * This is the expensive query - only call when user clicks a detailed tab
 */
export async function getDetailedStats(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter
): Promise<GolfStats> {
  const { supabase } = await requireAuth();
  const conditions = getFilterConditions(filter);

  // Build query with filters
  let query = supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed');

  // Apply filter conditions
  if (conditions.startDate) {
    query = query.gte('round_date', conditions.startDate);
  }
  if (conditions.endDate) {
    query = query.lte('round_date', conditions.endDate);
  }
  query = applyRoundTypeFilter(query, conditions.roundType);
  if (conditions.courseName) {
    query = query.eq('course_name', conditions.courseName);
  }

  query = query.order('round_date', { ascending: false });

  const { data: fetchedRounds } = await query;

  // Apply preset limits
  const roundsData = applyPresetLimit(fetchedRounds || [], filter);

  if (roundsData.length === 0) {
    return calculateStatsFromShots([], [], []);
  }

  // Determine which rounds to include
  const roundIds = roundId && roundId !== 'overall'
    ? [roundId]
    : roundsData.map(r => r.id);

  // Fetch holes
  const { data: holesData } = await supabase
    .from('golf_holes')
    .select('id, round_id, hole_number, par')
    .in('round_id', roundIds);

  // Fetch ALL shots with detail tables (the expensive query)
  // Include putt_details and approach_miss_details for complete stats calculation
  const { data: shotsData } = await supabase
    .from('golf_shots')
    .select(`
      *,
      putt_details(miss_tags, break_direction, estimated_break_inches, distance_feet, made),
      approach_miss_details(miss_direction, lie_type, distance_from_green_yards)
    `)
    .in('round_id', roundIds)
    .order('hole_number')
    .order('shot_number');

  // Transform data
  const filteredRoundsData = roundId && roundId !== 'overall'
    ? roundsData.filter(r => r.id === roundId)
    : roundsData;

  const roundsInfo: RoundInfo[] = filteredRoundsData.map(r => ({
    id: r.id,
    round_date: r.round_date,
    course_name: r.course_name || 'Unknown Course',
    round_type: r.round_type ? roundTypeFromDb(r.round_type) : null,
  }));

  const holesInfo: HoleInfo[] = (holesData || []).map(h => ({
    id: h.id,
    round_id: h.round_id,
    hole_number: h.hole_number,
    par: h.par,
    yardage: 0,
  }));

  // Map all shots - don't filter out shots with missing distances as they're still
  // needed for GIR calculation (shots with result='green') and scoring.
  // The calculator handles null distances gracefully.
  const shots: RawShot[] = (shotsData || []).map(s => {
    // Calculate shot_distance from before/after if both are available
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
      hole_id: s.hole_id,
      hole_number: s.hole_number,
      shot_number: s.shot_number,
      shot_type: s.shot_type as 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty',
      club_used: s.club_used,
      club_type: s.club_type as 'driver' | 'non_driver' | 'putter',
      lie_before: s.lie_before as 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other',
      lie_after: s.lie_after as 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other' | null,
      distance_to_hole_before: s.distance_to_hole_before,
      distance_unit_before: s.distance_unit_before as 'yards' | 'feet',
      result: s.result as 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty',
      distance_to_hole_after: s.distance_to_hole_after,
      distance_unit_after: s.distance_unit_after as 'yards' | 'feet',
      shot_distance: shotDistance,
      miss_direction: s.miss_direction,
      putt_break: s.putt_break,
      putt_distance_feet: s.putt_distance_feet,
      putt_slope: s.putt_slope,
      putt_made: s.putt_made,
      is_penalty: s.is_penalty ?? false,
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

  return calculateStatsFromShots(shots, holesInfo, roundsInfo);
}

// ============================================================================
// TREND DATA - For charts and analysis
// ============================================================================

export interface TrendDataPoint {
  date: string;
  value: number;
  roundId: string;
  courseName: string;
}

export interface RoundTrendData {
  id: string;
  date: string;
  score: number;
  toPar: number;
  courseName: string;
  roundType: string | null;
  girPct: number | null;
  fairwayPct: number | null;
  putts: number | null;
  scrambling: number | null;
}

export interface TrendAnalysisResponse {
  rounds: RoundTrendData[];
  trends: {
    score: TrendDataPoint[];
    gir: TrendDataPoint[];
    fairway: TrendDataPoint[];
    putts: TrendDataPoint[];
  };
  rollingAverages: {
    score5: (number | null)[];
    score10: (number | null)[];
    score20: (number | null)[];
  };
  periodComparison: {
    last30Days: {
      roundCount: number;
      scoringAvg: number | null;
      girPct: number | null;
      fairwayPct: number | null;
      puttsPerRound: number | null;
    };
    previous30Days: {
      roundCount: number;
      scoringAvg: number | null;
      girPct: number | null;
      fairwayPct: number | null;
      puttsPerRound: number | null;
    };
  };
  personalBests: {
    bestScore: { value: number; date: string; course: string } | null;
    bestToPar: { value: number; date: string; course: string } | null;
    bestGir: { value: number; date: string; course: string } | null;
    lowestPutts: { value: number; date: string; course: string } | null;
  };
}

/**
 * Get trend analysis data for visualizations
 * Includes round-by-round data, rolling averages, and period comparisons
 */
export async function getTrendAnalysis(playerId: string): Promise<TrendAnalysisResponse> {
  const { supabase } = await requireAuth();

  // Fetch all completed rounds with stats
  const { data: roundsData, error } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .order('round_date', { ascending: true }); // Oldest first for trend charts

  if (error || !roundsData || roundsData.length === 0) {
    return {
      rounds: [],
      trends: { score: [], gir: [], fairway: [], putts: [] },
      rollingAverages: { score5: [], score10: [], score20: [] },
      periodComparison: {
        last30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
        previous30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
      },
      personalBests: { bestScore: null, bestToPar: null, bestGir: null, lowestPutts: null },
    };
  }

  // Transform rounds data
  const rounds: RoundTrendData[] = roundsData.map(r => ({
    id: r.id,
    date: r.round_date,
    score: r.total_score!,
    toPar: r.score_to_par ?? 0,
    courseName: r.course_name || 'Unknown Course',
    roundType: r.round_type ? roundTypeFromDb(r.round_type) : null,
    girPct: r.total_gir !== null && r.total_gir_possible !== null && r.total_gir_possible > 0
      ? Math.round((r.total_gir / r.total_gir_possible) * 1000) / 10
      : null,
    fairwayPct: r.total_fairways_hit !== null && r.total_fairways !== null && r.total_fairways > 0
      ? Math.round((r.total_fairways_hit / r.total_fairways) * 1000) / 10
      : null,
    putts: r.total_putts,
    scrambling: null, // Scrambling data not available at round level
  }));

  // Build trend data points
  const trends = {
    score: rounds.map(r => ({ date: r.date, value: r.score, roundId: r.id, courseName: r.courseName })),
    gir: rounds.filter(r => r.girPct !== null).map(r => ({ date: r.date, value: r.girPct!, roundId: r.id, courseName: r.courseName })),
    fairway: rounds.filter(r => r.fairwayPct !== null).map(r => ({ date: r.date, value: r.fairwayPct!, roundId: r.id, courseName: r.courseName })),
    putts: rounds.filter(r => r.putts !== null).map(r => ({ date: r.date, value: r.putts!, roundId: r.id, courseName: r.courseName })),
  };

  // Calculate rolling averages for scores
  const scores = rounds.map(r => r.score);
  const rollingAverages = {
    score5: calculateRollingAvg(scores, 5),
    score10: calculateRollingAvg(scores, 10),
    score20: calculateRollingAvg(scores, 20),
  };

  // Period comparison (last 30 days vs previous 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const last30 = rounds.filter(r => new Date(r.date) >= thirtyDaysAgo);
  const prev30 = rounds.filter(r => {
    const date = new Date(r.date);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });

  const periodComparison = {
    last30Days: calculatePeriodStats(last30),
    previous30Days: calculatePeriodStats(prev30),
  };

  // Personal bests
  const personalBests = {
    bestScore: findBest(rounds, 'score', true),
    bestToPar: findBest(rounds, 'toPar', true),
    bestGir: findBest(rounds.filter(r => r.girPct !== null) as (RoundTrendData & { girPct: number })[], 'girPct', false),
    lowestPutts: findBest(rounds.filter(r => r.putts !== null) as (RoundTrendData & { putts: number })[], 'putts', true),
  };

  return {
    rounds,
    trends,
    rollingAverages,
    periodComparison,
    personalBests,
  };
}

// Helper: Calculate rolling average
function calculateRollingAvg(values: number[], window: number): (number | null)[] {
  return values.map((_, index) => {
    if (index < window - 1) return null;
    const slice = values.slice(index - window + 1, index + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
}

// Helper: Calculate period stats
function calculatePeriodStats(rounds: RoundTrendData[]) {
  if (rounds.length === 0) {
    return { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null };
  }

  const scores = rounds.map(r => r.score);
  const girs = rounds.filter(r => r.girPct !== null).map(r => r.girPct!);
  const fairways = rounds.filter(r => r.fairwayPct !== null).map(r => r.fairwayPct!);
  const putts = rounds.filter(r => r.putts !== null).map(r => r.putts!);

  return {
    roundCount: rounds.length,
    scoringAvg: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    girPct: girs.length > 0 ? Math.round(girs.reduce((a, b) => a + b, 0) / girs.length) : null,
    fairwayPct: fairways.length > 0 ? Math.round(fairways.reduce((a, b) => a + b, 0) / fairways.length) : null,
    puttsPerRound: putts.length > 0 ? Math.round((putts.reduce((a, b) => a + b, 0) / putts.length) * 10) / 10 : null,
  };
}

// Helper: Find best value
function findBest<T extends { date: string; courseName: string }>(
  rounds: T[],
  key: keyof T,
  lowerIsBetter: boolean
): { value: number; date: string; course: string } | null {
  if (rounds.length === 0) return null;

  const sorted = [...rounds].sort((a, b) => {
    const aVal = a[key] as number;
    const bVal = b[key] as number;
    return lowerIsBetter ? aVal - bVal : bVal - aVal;
  });

  const best = sorted[0];
  if (!best) return null;

  return {
    value: best[key] as number,
    date: best.date,
    course: best.courseName,
  };
}

// ============================================================================
// TEAM COMPARISON DATA
// ============================================================================

export interface TeamComparisonStats {
  playerId: string;
  playerName: string;
  roundCount: number;
  scoringAverage: number | null;
  bestRound: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
  scramblingPct: number | null;
}

export interface TeamComparisonResponse {
  playerStats: TeamComparisonStats;
  teamStats: TeamComparisonStats[];
  teamAverages: {
    scoringAverage: number | null;
    girPct: number | null;
    fairwayPct: number | null;
    puttsPerRound: number | null;
    scramblingPct: number | null;
  };
  playerRankings: {
    scoringRank: number | null;
    girRank: number | null;
    fairwayRank: number | null;
    puttsRank: number | null;
  };
}

/**
 * Get team comparison data for a player
 */
export async function getTeamComparison(
  playerId: string,
  teamId: string
): Promise<TeamComparisonResponse> {
  const { supabase } = await requireAuth();

  // Get all team members
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (!teamMembers || teamMembers.length === 0) {
    return {
      playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      teamStats: [],
      teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
    };
  }

  const playerIds = teamMembers.map(tm => tm.player_id);

  // Get player details
  const { data: playersData } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .in('id', playerIds);

  // Get all rounds for team members
  const { data: roundsData } = await supabase
    .from('golf_rounds')
    .select(`
      player_id,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts
    `)
    .in('player_id', playerIds)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  if (!roundsData || roundsData.length === 0 || !playersData) {
    return {
      playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      teamStats: [],
      teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
    };
  }

  // Calculate stats per player
  const playerStatsMap = new Map<string, {
    scores: number[];
    girs: number[];
    girOpps: number[];
    fairways: number[];
    fairwayOpps: number[];
    putts: number[];
  }>();

  // Initialize map
  playerIds.forEach(id => {
    playerStatsMap.set(id, {
      scores: [], girs: [], girOpps: [], fairways: [], fairwayOpps: [], putts: []
    });
  });

  // Aggregate stats
  roundsData.forEach(round => {
    const stats = playerStatsMap.get(round.player_id);
    if (!stats) return;

    if (round.total_score !== null) stats.scores.push(round.total_score);
    if (round.total_gir !== null) stats.girs.push(round.total_gir);
    if (round.total_gir_possible !== null) stats.girOpps.push(round.total_gir_possible);
    if (round.total_fairways_hit !== null) stats.fairways.push(round.total_fairways_hit);
    if (round.total_fairways !== null) stats.fairwayOpps.push(round.total_fairways);
    if (round.total_putts !== null) stats.putts.push(round.total_putts);
  });

  // Build team stats
  const teamStats: TeamComparisonStats[] = playerIds.map(id => {
    const player = playersData.find(p => p.id === id);
    const stats = playerStatsMap.get(id)!;

    const totalGirs = stats.girs.reduce((a, b) => a + b, 0);
    const totalGirOpps = stats.girOpps.reduce((a, b) => a + b, 0);
    const totalFairways = stats.fairways.reduce((a, b) => a + b, 0);
    const totalFairwayOpps = stats.fairwayOpps.reduce((a, b) => a + b, 0);
    const totalPutts = stats.putts.reduce((a, b) => a + b, 0);

    return {
      playerId: id,
      playerName: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      roundCount: stats.scores.length,
      scoringAverage: stats.scores.length > 0
        ? Math.round((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) * 10) / 10
        : null,
      bestRound: stats.scores.length > 0 ? Math.min(...stats.scores) : null,
      girPct: totalGirOpps > 0 ? Math.round((totalGirs / totalGirOpps) * 1000) / 10 : null,
      fairwayPct: totalFairwayOpps > 0 ? Math.round((totalFairways / totalFairwayOpps) * 1000) / 10 : null,
      puttsPerRound: stats.scores.length > 0
        ? Math.round((totalPutts / stats.scores.length) * 10) / 10
        : null,
      scramblingPct: null, // Scrambling data not available at round level
    };
  }).filter(s => s.roundCount > 0);

  // Calculate team averages
  const validScoring = teamStats.filter(s => s.scoringAverage !== null);
  const validGir = teamStats.filter(s => s.girPct !== null);
  const validFairway = teamStats.filter(s => s.fairwayPct !== null);
  const validPutts = teamStats.filter(s => s.puttsPerRound !== null);
  const validScrambling = teamStats.filter(s => s.scramblingPct !== null);

  const teamAverages = {
    scoringAverage: validScoring.length > 0
      ? Math.round((validScoring.reduce((a, b) => a + b.scoringAverage!, 0) / validScoring.length) * 10) / 10
      : null,
    girPct: validGir.length > 0
      ? Math.round((validGir.reduce((a, b) => a + b.girPct!, 0) / validGir.length) * 10) / 10
      : null,
    fairwayPct: validFairway.length > 0
      ? Math.round((validFairway.reduce((a, b) => a + b.fairwayPct!, 0) / validFairway.length) * 10) / 10
      : null,
    puttsPerRound: validPutts.length > 0
      ? Math.round((validPutts.reduce((a, b) => a + b.puttsPerRound!, 0) / validPutts.length) * 10) / 10
      : null,
    scramblingPct: validScrambling.length > 0
      ? Math.round((validScrambling.reduce((a, b) => a + b.scramblingPct!, 0) / validScrambling.length) * 10) / 10
      : null,
  };

  // Calculate player rankings
  const playerStats = teamStats.find(s => s.playerId === playerId) || {
    playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null,
    girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null
  };

  const scoringRanked = [...teamStats].filter(s => s.scoringAverage !== null).sort((a, b) => a.scoringAverage! - b.scoringAverage!);
  const girRanked = [...teamStats].filter(s => s.girPct !== null).sort((a, b) => b.girPct! - a.girPct!);
  const fairwayRanked = [...teamStats].filter(s => s.fairwayPct !== null).sort((a, b) => b.fairwayPct! - a.fairwayPct!);
  const puttsRanked = [...teamStats].filter(s => s.puttsPerRound !== null).sort((a, b) => a.puttsPerRound! - b.puttsPerRound!);

  const playerRankings = {
    scoringRank: scoringRanked.findIndex(s => s.playerId === playerId) + 1 || null,
    girRank: girRanked.findIndex(s => s.playerId === playerId) + 1 || null,
    fairwayRank: fairwayRanked.findIndex(s => s.playerId === playerId) + 1 || null,
    puttsRank: puttsRanked.findIndex(s => s.playerId === playerId) + 1 || null,
  };

  return {
    playerStats,
    teamStats,
    teamAverages,
    playerRankings,
  };
}

// ============================================================================
// FILTER OPTIONS DATA
// ============================================================================

export interface FilterOptions {
  courses: string[];
  seasons: number[];
  roundTypes: string[];
}

/**
 * Get available filter options for a player
 */
export async function getFilterOptions(playerId: string): Promise<FilterOptions> {
  const { supabase } = await requireAuth();

  const { data: roundsData } = await supabase
    .from('golf_rounds')
    .select('course_name, round_date, round_type')
    .eq('player_id', playerId)
    .eq('status', 'completed');

  if (!roundsData || roundsData.length === 0) {
    return { courses: [], seasons: [], roundTypes: [] };
  }

  // Extract unique courses
  const courses = [...new Set(
    roundsData
      .map(r => r.course_name)
      .filter((c): c is string => c !== null)
  )].sort();

  // Extract unique seasons (years)
  const seasons = [...new Set(
    roundsData
      .map(r => new Date(r.round_date).getFullYear())
  )].sort((a, b) => b - a);

  // Extract unique round types
  const roundTypes: string[] = [...new Set(
    roundsData
      .map(r => r.round_type ? roundTypeFromDb(r.round_type) : null)
      .filter((t): t is 'practice' | 'tournament' | 'qualifier' => t !== null)
  )].sort();

  return { courses, seasons, roundTypes };
}

// ============================================================================
// COURSE-SPECIFIC BREAKDOWN
// ============================================================================

export interface CourseStats {
  courseName: string;
  roundCount: number;
  scoringAverage: number | null;
  bestRound: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
  lastPlayed: string;
}

export interface CourseBreakdownResponse {
  courses: CourseStats[];
  bestCourse: string | null;
  worstCourse: string | null;
}

/**
 * Get stats broken down by course
 */
export async function getCourseBreakdown(playerId: string): Promise<CourseBreakdownResponse> {
  const { supabase } = await requireAuth();

  const { data: roundsData } = await supabase
    .from('golf_rounds')
    .select(`
      course_name,
      round_date,
      total_score,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .not('course_name', 'is', null)
    .order('round_date', { ascending: false });

  if (!roundsData || roundsData.length === 0) {
    return { courses: [], bestCourse: null, worstCourse: null };
  }

  // Group by course
  const courseMap = new Map<string, typeof roundsData>();
  for (const round of roundsData) {
    if (!round.course_name) continue;
    const existing = courseMap.get(round.course_name) || [];
    existing.push(round);
    courseMap.set(round.course_name, existing);
  }

  // Calculate stats per course
  const courses: CourseStats[] = [];
  for (const [courseName, rounds] of courseMap) {
    const scores = rounds.map(r => r.total_score).filter((s): s is number => s !== null);
    let totalGir = 0, totalGirOpp = 0;
    let totalFairways = 0, totalFairwayOpp = 0;
    let totalPutts = 0;

    for (const round of rounds) {
      if (round.total_gir !== null && round.total_gir_possible !== null) {
        totalGir += round.total_gir;
        totalGirOpp += round.total_gir_possible;
      }
      if (round.total_fairways_hit !== null && round.total_fairways !== null) {
        totalFairways += round.total_fairways_hit;
        totalFairwayOpp += round.total_fairways;
      }
      if (round.total_putts !== null) {
        totalPutts += round.total_putts;
      }
    }

    courses.push({
      courseName,
      roundCount: rounds.length,
      scoringAverage: scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
      bestRound: scores.length > 0 ? Math.min(...scores) : null,
      girPct: totalGirOpp > 0 ? Math.round((totalGir / totalGirOpp) * 1000) / 10 : null,
      fairwayPct: totalFairwayOpp > 0 ? Math.round((totalFairways / totalFairwayOpp) * 1000) / 10 : null,
      puttsPerRound: rounds.length > 0
        ? Math.round((totalPutts / rounds.length) * 10) / 10
        : null,
      lastPlayed: rounds[0]?.round_date || '',
    });
  }

  // Sort by scoring average
  courses.sort((a, b) => {
    if (a.scoringAverage === null) return 1;
    if (b.scoringAverage === null) return -1;
    return a.scoringAverage - b.scoringAverage;
  });

  const coursesWithScores = courses.filter(c => c.scoringAverage !== null);
  const bestCourse = coursesWithScores[0]?.courseName || null;
  const worstCourse = coursesWithScores[coursesWithScores.length - 1]?.courseName || null;

  return { courses, bestCourse, worstCourse };
}

// ============================================================================
// WORST HOLE ANALYSIS
// ============================================================================

export interface HoleAnalysis {
  holeNumber: number;
  par: number;
  averageScore: number;
  averageToPar: number;
  timesPlayed: number;
  birdieOrBetter: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface WorstHoleResponse {
  holes: HoleAnalysis[];
  worstHoles: HoleAnalysis[];
  bestHoles: HoleAnalysis[];
  par3Average: number | null;
  par4Average: number | null;
  par5Average: number | null;
  closingHolesAverage: number | null; // Holes 16-18
}

/**
 * Get worst hole analysis
 */
export async function getWorstHoleAnalysis(playerId: string): Promise<WorstHoleResponse> {
  const { supabase } = await requireAuth();

  // Get all holes with their scores
  const { data: holesData } = await supabase
    .from('golf_holes')
    .select(`
      id,
      round_id,
      hole_number,
      par,
      score,
      golf_rounds!inner (
        player_id,
        status,
        round_date
      )
    `)
    .eq('golf_rounds.player_id', playerId)
    .eq('golf_rounds.status', 'completed')
    .not('score', 'is', null)
    .order('round_id')
    .order('hole_number');

  if (!holesData || holesData.length === 0) {
    return {
      holes: [],
      worstHoles: [],
      bestHoles: [],
      par3Average: null,
      par4Average: null,
      par5Average: null,
      closingHolesAverage: null,
    };
  }

  // Group by hole number and aggregate
  const holeMap = new Map<number, { par: number; scores: number[]; dates: string[] }>();

  for (const hole of holesData) {
    const existing = holeMap.get(hole.hole_number) || {
      par: hole.par,
      scores: [],
      dates: [],
    };

    if (hole.score !== null) {
      existing.scores.push(hole.score);
      const roundData = hole.golf_rounds as { round_date?: string } | undefined;
      if (roundData?.round_date) {
        existing.dates.push(roundData.round_date);
      }
    }

    holeMap.set(hole.hole_number, existing);
  }

  // Calculate analysis per hole
  const holes: HoleAnalysis[] = [];

  for (let holeNum = 1; holeNum <= 18; holeNum++) {
    const data = holeMap.get(holeNum);
    if (!data || data.scores.length === 0) continue;

    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const avgToPar = avgScore - data.par;

    // Calculate score distribution
    let birdieOrBetter = 0, pars = 0, bogeys = 0, doublePlus = 0;
    for (const score of data.scores) {
      const toPar = score - data.par;
      if (toPar <= -1) birdieOrBetter++;
      else if (toPar === 0) pars++;
      else if (toPar === 1) bogeys++;
      else doublePlus++;
    }

    // Simple trend calculation (last 5 vs first 5)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (data.scores.length >= 10) {
      const first5 = data.scores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const last5 = data.scores.slice(-5).reduce((a, b) => a + b, 0) / 5;
      if (last5 < first5 - 0.2) trend = 'improving';
      else if (last5 > first5 + 0.2) trend = 'declining';
    }

    holes.push({
      holeNumber: holeNum,
      par: data.par,
      averageScore: Math.round(avgScore * 100) / 100,
      averageToPar: Math.round(avgToPar * 100) / 100,
      timesPlayed: data.scores.length,
      birdieOrBetter,
      pars,
      bogeys,
      doublePlus,
      trend,
    });
  }

  // Sort by average to par (worst first)
  const sortedByToPar = [...holes].sort((a, b) => b.averageToPar - a.averageToPar);
  const worstHoles = sortedByToPar.slice(0, 3);
  const bestHoles = [...sortedByToPar].reverse().slice(0, 3);

  // Calculate par-specific averages
  const par3s = holes.filter(h => h.par === 3);
  const par4s = holes.filter(h => h.par === 4);
  const par5s = holes.filter(h => h.par === 5);
  const closingHoles = holes.filter(h => h.holeNumber >= 16);

  const calcAvg = (arr: HoleAnalysis[]) =>
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b.averageToPar, 0) / arr.length) * 100) / 100
      : null;

  return {
    holes,
    worstHoles,
    bestHoles,
    par3Average: calcAvg(par3s),
    par4Average: calcAvg(par4s),
    par5Average: calcAvg(par5s),
    closingHolesAverage: calcAvg(closingHoles),
  };
}

// ============================================================================
// STATISTICAL STRENGTHS & WEAKNESSES
// ============================================================================

/**
 * Get rich, statistically-backed strengths and weaknesses for a player.
 * Analyzes 30+ metrics across distance, shot type, and lie categories.
 *
 * Returns top 3 strengths and top 3 weaknesses with stroke impact,
 * benchmarks, and coaching recommendations.
 */
export async function getPlayerStrengthsWeaknesses(
  playerId: string,
  filter?: StatsFilter
): Promise<{
  strengths: StatisticalStrengthWeakness[];
  weaknesses: StatisticalStrengthWeakness[];
} | null> {
  const stats = await getDetailedStats(playerId, 'overall', filter);

  if (stats.roundsPlayed < 3) {
    return null;
  }

  return generateStatisticalStrengthsWeaknesses(stats);
}
