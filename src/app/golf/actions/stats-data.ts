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

/**
 * Verify the authenticated user has access to the given player's stats.
 * Access is granted if the user IS the player, or is a coach on their team.
 */
async function verifyPlayerAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playerId: string
): Promise<boolean> {
  // Check if user IS the player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .eq('id', playerId)
    .single();

  if (player?.user_id === userId) return true;

  // Check if user is a coach on the player's team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (coach?.organization_id && player) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id, team:golf_teams(organization_id)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (membership?.team && (membership.team as { organization_id: string }).organization_id === coach.organization_id) {
      return true;
    }
  }

  return false;
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

type DetailedStatsRoundRow = {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  holes_played?: number | null;
  total_fairways_hit?: number | null;
  total_fairways?: number | null;
  total_gir?: number | null;
  total_gir_possible?: number | null;
  total_putts?: number | null;
};

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

function serializeDetailedStats(stats: GolfStats): GolfStats {
  // Server actions cannot serialize NaN/Infinity reliably. Converting through
  // JSON normalizes those edge cases to null and keeps the payload stable.
  return JSON.parse(JSON.stringify(stats)) as GolfStats;
}

function buildFallbackDetailedStats(roundsData: DetailedStatsRoundRow[]): GolfStats {
  const fallback = calculateStatsFromShots([], [], []);

  if (roundsData.length === 0) {
    return fallback;
  }

  const completedRounds = roundsData.filter(
    (round): round is DetailedStatsRoundRow & { total_score: number } => round.total_score !== null
  );

  fallback.roundsPlayed = completedRounds.length;
  fallback.holesPlayed = completedRounds.reduce((sum, round) => sum + (round.holes_played ?? 18), 0);

  if (completedRounds.length > 0) {
    const totalStrokes = completedRounds.reduce((sum, round) => sum + round.total_score, 0);
    const totalHoles = completedRounds.reduce((sum, round) => sum + (round.holes_played ?? 18), 0);
    const normalizedScores = completedRounds.map((round) => {
      const holesPlayed = round.holes_played ?? 18;
      return Math.round(round.total_score * (18 / holesPlayed));
    });

    fallback.scoringAverage = totalHoles > 0
      ? Math.round((totalStrokes / totalHoles) * 18 * 100) / 100
      : null;
    fallback.bestRound = normalizedScores.length > 0 ? Math.min(...normalizedScores) : null;
    fallback.worstRound = normalizedScores.length > 0 ? Math.max(...normalizedScores) : null;
  }

  const roundsWithToPar = roundsData.filter(
    (round): round is DetailedStatsRoundRow & { score_to_par: number } => round.score_to_par !== null
  );
  if (roundsWithToPar.length > 0) {
    const totalToPar = roundsWithToPar.reduce((sum, round) => sum + round.score_to_par, 0);
    fallback.avgScoreToPar = Math.round((totalToPar / roundsWithToPar.length) * 100) / 100;
  }

  const roundTypeBuckets = {
    practice: [] as number[],
    qualifier: [] as number[],
    tournament: [] as number[],
  };

  for (const round of completedRounds) {
    const normalizedType = round.round_type ? roundTypeFromDb(round.round_type) : null;
    if (!normalizedType) continue;

    const holesPlayed = round.holes_played ?? 18;
    const normalizedScore = Math.round(round.total_score * (18 / holesPlayed) * 100) / 100;

    if (normalizedType === 'practice') roundTypeBuckets.practice.push(normalizedScore);
    if (normalizedType === 'qualifier') roundTypeBuckets.qualifier.push(normalizedScore);
    if (normalizedType === 'tournament') roundTypeBuckets.tournament.push(normalizedScore);
  }

  fallback.practiceRounds = roundTypeBuckets.practice.length;
  fallback.qualifyingRounds = roundTypeBuckets.qualifier.length;
  fallback.tournamentRounds = roundTypeBuckets.tournament.length;
  fallback.practiceScoringAvg = roundTypeBuckets.practice.length > 0
    ? Math.round((roundTypeBuckets.practice.reduce((sum, score) => sum + score, 0) / roundTypeBuckets.practice.length) * 100) / 100
    : null;
  fallback.qualifyingScoringAvg = roundTypeBuckets.qualifier.length > 0
    ? Math.round((roundTypeBuckets.qualifier.reduce((sum, score) => sum + score, 0) / roundTypeBuckets.qualifier.length) * 100) / 100
    : null;
  fallback.tournamentScoringAvg = roundTypeBuckets.tournament.length > 0
    ? Math.round((roundTypeBuckets.tournament.reduce((sum, score) => sum + score, 0) / roundTypeBuckets.tournament.length) * 100) / 100
    : null;

  let totalFairwaysHit = 0;
  let totalFairways = 0;
  let totalGir = 0;
  let totalGirPossible = 0;
  let totalPutts = 0;
  let totalPuttHoles = 0;

  for (const round of roundsData) {
    if (round.total_fairways_hit != null && round.total_fairways != null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairways += round.total_fairways;
    }

    if (round.total_gir != null && round.total_gir_possible != null) {
      totalGir += round.total_gir;
      totalGirPossible += round.total_gir_possible;
    }

    if (round.total_putts != null) {
      totalPutts += round.total_putts;
      totalPuttHoles += round.holes_played ?? 18;
    }
  }

  fallback.fairwaysHit = totalFairwaysHit;
  fallback.fairwayOpportunities = totalFairways;
  fallback.fairwayPercentage = totalFairways > 0
    ? Math.round((totalFairwaysHit / totalFairways) * 1000) / 10
    : null;
  fallback.girTotal = totalGir;
  fallback.girOpportunities = totalGirPossible;
  fallback.girPercentage = totalGirPossible > 0
    ? Math.round((totalGir / totalGirPossible) * 1000) / 10
    : null;
  fallback.totalPutts = totalPutts;
  fallback.puttsPerRound = totalPuttHoles > 0
    ? Math.round((totalPutts / totalPuttHoles) * 18 * 100) / 100
    : null;
  fallback.puttsPerHole = fallback.holesPlayed > 0
    ? Math.round((totalPutts / fallback.holesPlayed) * 100) / 100
    : null;

  return fallback;
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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
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

  // Fetch scrambling data from golf_holes for these rounds
  const roundIds = filteredRounds.map(r => r.id);
  const { data: holesWithScrambling } = await supabase
    .from('golf_holes')
    .select('up_and_down')
    .in('round_id', roundIds)
    .not('up_and_down', 'is', null);

  let scramblingAttempts = 0;
  let scramblingMade = 0;
  if (holesWithScrambling) {
    for (const hole of holesWithScrambling) {
      scramblingAttempts++;
      if (hole.up_and_down === true) scramblingMade++;
    }
  }

  // Calculate summary stats from filtered rounds
  // Build score data with holes_played for normalization
  const roundScores = filteredRounds
    .filter((r): r is typeof r & { total_score: number } => r.total_score !== null)
    .map(r => ({
      score: r.total_score,
      holesPlayed: r.holes_played ?? 18,
    }));
  const roundsPlayed = roundScores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;
  let totalPuttsHoles = 0;

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
      totalPuttsHoles += (round.holes_played ?? 18);
    }
  }

  // Compute per-hole scoring average, then express as 18-hole equivalent
  // This correctly handles mixed 9-hole and 18-hole rounds
  let scoringAverage: number | null = null;
  if (roundScores.length > 0) {
    const totalHolesScored = roundScores.reduce((sum, r) => sum + r.holesPlayed, 0);
    const totalStrokes = roundScores.reduce((sum, r) => sum + r.score, 0);
    const perHoleAvg = totalStrokes / totalHolesScored;
    scoringAverage = Math.round(perHoleAvg * 18 * 100) / 100;
  }

  // For best/worst round, normalize to 18-hole equivalent
  // A 9-hole score of 38 becomes 38 * (18/9) = 76
  let bestRound: number | null = null;
  let worstRound: number | null = null;
  if (roundScores.length > 0) {
    const normalized = roundScores.map(r => Math.round(r.score * (18 / r.holesPlayed)));
    bestRound = Math.min(...normalized);
    worstRound = Math.max(...normalized);
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage,
    bestRound,
    worstRound,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    // Normalize putts to per-18-holes to handle mixed 9/18-hole rounds
    puttsPerRound: totalPuttsHoles > 0
      ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10
      : null,
    scramblingPercentage: scramblingAttempts > 0
      ? Math.round((scramblingMade / scramblingAttempts) * 1000) / 10
      : null,
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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return calculateStatsFromShots([], [], []);
  }

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
      holes_played,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts
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

  const { data: fetchedRounds, error: roundsError } = await query;
  if (roundsError) {
    throw roundsError;
  }

  // Apply preset limits
  const roundsData = applyPresetLimit(fetchedRounds || [], filter);

  if (roundsData.length === 0) {
    return calculateStatsFromShots([], [], []);
  }

  // Determine which rounds to include
  const roundIds = roundId && roundId !== 'overall'
    ? [roundId]
    : roundsData.map(r => r.id);

  try {
    const [{ data: holesData, error: holesError }, { data: shotsData, error: shotsError }] = await Promise.all([
      supabase
        .from('golf_holes')
        .select('id, round_id, hole_number, par')
        .in('round_id', roundIds),
      supabase
        .from('golf_shots')
        .select(`
          id,
          round_id,
          hole_id,
          hole_number,
          shot_number,
          shot_type,
          club_used,
          club_type,
          lie_before,
          lie_after,
          distance_to_hole_before,
          distance_unit_before,
          result,
          distance_to_hole_after,
          distance_unit_after,
          shot_distance,
          miss_direction,
          putt_break,
          putt_distance_feet,
          putt_slope,
          putt_made,
          is_penalty,
          penalty_type,
          putt_details(miss_tags, break_direction, estimated_break_inches, distance_feet, made),
          approach_miss_details(miss_direction, lie_type, distance_from_green_yards)
        `)
        .in('round_id', roundIds)
        .order('hole_number')
        .order('shot_number'),
    ]);

    if (holesError) {
      throw holesError;
    }
    if (shotsError) {
      throw shotsError;
    }

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
        putt_miss_tags: puttDetails?.miss_tags ?? null,
        putt_break_direction: puttDetails?.break_direction ?? null,
        putt_estimated_break_inches: puttDetails?.estimated_break_inches ?? null,
        approach_miss_direction: approachMissDetails?.miss_direction ?? null,
        approach_miss_lie_type: approachMissDetails?.lie_type ?? null,
        approach_miss_distance_from_green: approachMissDetails?.distance_from_green_yards ?? null,
      };
    });

    return serializeDetailedStats(calculateStatsFromShots(shots, holesInfo, roundsInfo));
  } catch (error) {
    console.error('[Stats] Falling back to round-level stats:', error);
    return serializeDetailedStats(buildFallbackDetailedStats(roundsData));
  }
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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
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
      total_putts,
      holes_played
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

  // Transform rounds data — normalize 9-hole rounds to 18-hole equivalents
  const rounds: RoundTrendData[] = roundsData.map(r => {
    const hp = r.holes_played ?? 18;
    const normalizedScore = Math.round(r.total_score! * (18 / hp));
    const normalizedPutts = r.total_putts !== null ? Math.round(r.total_putts * (18 / hp) * 10) / 10 : null;
    return {
      id: r.id,
      date: r.round_date,
      score: normalizedScore,
      toPar: r.score_to_par ?? 0,
      courseName: r.course_name || 'Unknown Course',
      roundType: r.round_type ? roundTypeFromDb(r.round_type) : null,
      girPct: r.total_gir !== null && r.total_gir_possible !== null && r.total_gir_possible > 0
        ? Math.round((r.total_gir / r.total_gir_possible) * 1000) / 10
        : null,
      fairwayPct: r.total_fairways_hit !== null && r.total_fairways !== null && r.total_fairways > 0
        ? Math.round((r.total_fairways_hit / r.total_fairways) * 1000) / 10
        : null,
      putts: normalizedPutts,
      scrambling: null, // Scrambling data not available at round level
    };
  });

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

  const last30Raw = roundsData.filter(r => new Date(r.round_date) >= thirtyDaysAgo);
  const prev30Raw = roundsData.filter(r => {
    const date = new Date(r.round_date);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });

  const periodComparison = {
    last30Days: calculatePeriodStats(last30Raw),
    previous30Days: calculatePeriodStats(prev30Raw),
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

// Helper: Calculate period stats using raw numerator/denominator aggregation
// (avoids Simpson's paradox from averaging per-round percentages)
// Normalizes mixed 9-hole and 18-hole rounds to 18-hole equivalents
function calculatePeriodStats(rounds: {
  total_score: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_putts: number | null;
  holes_played?: number | null;
}[]) {
  if (rounds.length === 0) {
    return { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null };
  }

  // Normalize scoring to 18-hole equivalents using per-hole average
  const scoredRounds = rounds.filter(r => r.total_score !== null);
  let totalHolesScored = 0;
  let totalStrokes = 0;
  for (const r of scoredRounds) {
    const hp = r.holes_played ?? 18;
    totalHolesScored += hp;
    totalStrokes += r.total_score!;
  }

  let totalGir = 0, totalGirOpp = 0;
  let totalFairways = 0, totalFairwayOpp = 0;
  let totalPutts = 0, totalPuttsHoles = 0;

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
      totalPuttsHoles += (round.holes_played ?? 18);
    }
  }

  return {
    roundCount: rounds.length,
    scoringAvg: totalHolesScored > 0 ? Math.round((totalStrokes / totalHolesScored) * 18 * 10) / 10 : null,
    girPct: totalGirOpp > 0 ? Math.round((totalGir / totalGirOpp) * 1000) / 10 : null,
    fairwayPct: totalFairwayOpp > 0 ? Math.round((totalFairways / totalFairwayOpp) * 1000) / 10 : null,
    puttsPerRound: totalPuttsHoles > 0 ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10 : null,
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
  const { supabase, user } = await requireAuth();

  // Verify caller is a member of this team OR a coach of this team
  const emptyResponse: TeamComparisonResponse = {
    playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
    teamStats: [],
    teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
    playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
  };

  // Check 1: Is user a player on this team?
  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let isTeamMember = false;
  if (playerRecord) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerRecord.id)
      .eq('status', 'active')
      .maybeSingle();
    isTeamMember = !!membership;
  }

  // Check 2: Is user a coach of this team (via organization)?
  let isTeamCoach = false;
  if (!isTeamMember) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', teamId)
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      isTeamCoach = !!team;
    }
  }

  if (!isTeamMember && !isTeamCoach) {
    return emptyResponse;
  }

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
      id,
      player_id,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts,
      holes_played
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

  // Fetch scrambling data from golf_holes for all team rounds
  const teamRoundIds = roundsData.map(r => r.id);
  const { data: teamScramblingData } = await supabase
    .from('golf_holes')
    .select('round_id, up_and_down')
    .in('round_id', teamRoundIds)
    .not('up_and_down', 'is', null);

  // Build a map of round_id -> player_id for scrambling aggregation
  const roundToPlayer = new Map<string, string>();
  for (const round of roundsData) {
    roundToPlayer.set(round.id, round.player_id);
  }

  // Aggregate scrambling per player
  const playerScramblingMap = new Map<string, { attempts: number; made: number }>();
  playerIds.forEach(id => playerScramblingMap.set(id, { attempts: 0, made: 0 }));
  if (teamScramblingData) {
    for (const hole of teamScramblingData) {
      const pId = roundToPlayer.get(hole.round_id);
      if (pId) {
        const scrambling = playerScramblingMap.get(pId)!;
        scrambling.attempts++;
        if (hole.up_and_down === true) scrambling.made++;
      }
    }
  }

  // Calculate stats per player — track holes for normalization
  const playerStatsMap = new Map<string, {
    totalStrokes: number;
    totalHoles: number;
    roundCount: number;
    normalizedScores: number[];
    girs: number[];
    girOpps: number[];
    fairways: number[];
    fairwayOpps: number[];
    totalPutts: number;
    totalPuttsHoles: number;
  }>();

  // Initialize map
  playerIds.forEach(id => {
    playerStatsMap.set(id, {
      totalStrokes: 0, totalHoles: 0, roundCount: 0, normalizedScores: [],
      girs: [], girOpps: [], fairways: [], fairwayOpps: [],
      totalPutts: 0, totalPuttsHoles: 0,
    });
  });

  // Aggregate stats with 9-hole normalization
  roundsData.forEach(round => {
    const stats = playerStatsMap.get(round.player_id);
    if (!stats) return;
    const hp = round.holes_played ?? 18;

    if (round.total_score !== null) {
      stats.totalStrokes += round.total_score;
      stats.totalHoles += hp;
      stats.roundCount++;
      stats.normalizedScores.push(Math.round(round.total_score * (18 / hp)));
    }
    if (round.total_gir !== null) stats.girs.push(round.total_gir);
    if (round.total_gir_possible !== null) stats.girOpps.push(round.total_gir_possible);
    if (round.total_fairways_hit !== null) stats.fairways.push(round.total_fairways_hit);
    if (round.total_fairways !== null) stats.fairwayOpps.push(round.total_fairways);
    if (round.total_putts !== null) {
      stats.totalPutts += round.total_putts;
      stats.totalPuttsHoles += hp;
    }
  });

  // Build team stats
  const teamStats: TeamComparisonStats[] = playerIds.map(id => {
    const player = playersData.find(p => p.id === id);
    const stats = playerStatsMap.get(id)!;

    const totalGirs = stats.girs.reduce((a, b) => a + b, 0);
    const totalGirOpps = stats.girOpps.reduce((a, b) => a + b, 0);
    const totalFairways = stats.fairways.reduce((a, b) => a + b, 0);
    const totalFairwayOpps = stats.fairwayOpps.reduce((a, b) => a + b, 0);

    return {
      playerId: id,
      playerName: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      roundCount: stats.roundCount,
      scoringAverage: stats.totalHoles > 0
        ? Math.round((stats.totalStrokes / stats.totalHoles) * 18 * 10) / 10
        : null,
      bestRound: stats.normalizedScores.length > 0 ? Math.min(...stats.normalizedScores) : null,
      girPct: totalGirOpps > 0 ? Math.round((totalGirs / totalGirOpps) * 1000) / 10 : null,
      fairwayPct: totalFairwayOpps > 0 ? Math.round((totalFairways / totalFairwayOpps) * 1000) / 10 : null,
      puttsPerRound: stats.totalPuttsHoles > 0
        ? Math.round((stats.totalPutts / stats.totalPuttsHoles) * 18 * 10) / 10
        : null,
      scramblingPct: (() => {
        const scrambling = playerScramblingMap.get(id);
        return scrambling && scrambling.attempts > 0
          ? Math.round((scrambling.made / scrambling.attempts) * 1000) / 10
          : null;
      })(),
    };
  }).filter(s => s.roundCount > 0);

  // Calculate team averages weighted by rounds played (avoids Simpson's paradox)
  // Aggregate raw numerators/denominators across all players instead of averaging per-player averages
  let teamTotalStrokes = 0, teamTotalHoles = 0;
  let teamTotalGirs = 0, teamTotalGirOpps = 0;
  let teamTotalFairways = 0, teamTotalFairwayOpps = 0;
  let teamTotalPutts = 0, teamTotalPuttsHoles = 0;
  let teamScramblingAttempts = 0, teamScramblingMade = 0;

  for (const id of playerIds) {
    const stats = playerStatsMap.get(id);
    if (!stats || stats.roundCount === 0) continue;

    teamTotalStrokes += stats.totalStrokes;
    teamTotalHoles += stats.totalHoles;
    teamTotalGirs += stats.girs.reduce((a, b) => a + b, 0);
    teamTotalGirOpps += stats.girOpps.reduce((a, b) => a + b, 0);
    teamTotalFairways += stats.fairways.reduce((a, b) => a + b, 0);
    teamTotalFairwayOpps += stats.fairwayOpps.reduce((a, b) => a + b, 0);
    teamTotalPutts += stats.totalPutts;
    teamTotalPuttsHoles += stats.totalPuttsHoles;

    const scrambling = playerScramblingMap.get(id);
    if (scrambling) {
      teamScramblingAttempts += scrambling.attempts;
      teamScramblingMade += scrambling.made;
    }
  }

  const teamAverages = {
    scoringAverage: teamTotalHoles > 0
      ? Math.round((teamTotalStrokes / teamTotalHoles) * 18 * 10) / 10
      : null,
    girPct: teamTotalGirOpps > 0
      ? Math.round((teamTotalGirs / teamTotalGirOpps) * 1000) / 10
      : null,
    fairwayPct: teamTotalFairwayOpps > 0
      ? Math.round((teamTotalFairways / teamTotalFairwayOpps) * 1000) / 10
      : null,
    puttsPerRound: teamTotalPuttsHoles > 0
      ? Math.round((teamTotalPutts / teamTotalPuttsHoles) * 18 * 10) / 10
      : null,
    scramblingPct: teamScramblingAttempts > 0
      ? Math.round((teamScramblingMade / teamScramblingAttempts) * 1000) / 10
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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return { courses: [], seasons: [], roundTypes: [] };
  }

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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return { courses: [], bestCourse: null, worstCourse: null };
  }

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
      total_putts,
      holes_played
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

  // Calculate stats per course with 9-hole normalization
  const courses: CourseStats[] = [];
  for (const [courseName, rounds] of courseMap) {
    let totalGir = 0, totalGirOpp = 0;
    let totalFairways = 0, totalFairwayOpp = 0;
    let totalPutts = 0, totalPuttsHoles = 0;
    let totalStrokes = 0, totalHolesScored = 0;
    const normalizedScores: number[] = [];

    for (const round of rounds) {
      const hp = round.holes_played ?? 18;
      if (round.total_score !== null) {
        totalStrokes += round.total_score;
        totalHolesScored += hp;
        normalizedScores.push(Math.round(round.total_score * (18 / hp)));
      }
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
        totalPuttsHoles += hp;
      }
    }

    courses.push({
      courseName,
      roundCount: rounds.length,
      scoringAverage: totalHolesScored > 0
        ? Math.round((totalStrokes / totalHolesScored) * 18 * 10) / 10
        : null,
      bestRound: normalizedScores.length > 0 ? Math.min(...normalizedScores) : null,
      girPct: totalGirOpp > 0 ? Math.round((totalGir / totalGirOpp) * 1000) / 10 : null,
      fairwayPct: totalFairwayOpp > 0 ? Math.round((totalFairways / totalFairwayOpp) * 1000) / 10 : null,
      puttsPerRound: totalPuttsHoles > 0
        ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10
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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return { holes: [], worstHoles: [], bestHoles: [], par3Average: null, par4Average: null, par5Average: null, closingHolesAverage: null };
  }

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
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return null;
  }

  const stats = await getDetailedStats(playerId, 'overall', filter);

  if (stats.roundsPlayed < 3) {
    return null;
  }

  return generateStatisticalStrengthsWeaknesses(stats);
}
