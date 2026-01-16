'use server';

import { createClient } from '@/lib/supabase/server';
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo
} from '@/lib/utils/golf-stats-calculator-shots';

// ============================================================================
// TYPES
// ============================================================================

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
// FAST INITIAL LOAD - Summary stats only (no shot data)
// ============================================================================

/**
 * Get lightweight summary stats for a player
 * This uses pre-aggregated data from rounds table - no shot queries
 * Typically 10-50ms vs 500-2000ms for full shot analysis
 */
export async function getStatsSummary(playerId: string): Promise<SummaryStatsResponse> {
  const supabase = await createClient();

  // Fetch completed rounds with basic metadata
  const { data: roundsData, error } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par,
      fairways_hit,
      fairway_opportunities,
      greens_in_regulation,
      gir_opportunities,
      total_putts,
      scrambles_made,
      scramble_opportunities
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .order('round_date', { ascending: false });

  if (error || !roundsData || roundsData.length === 0) {
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

  // Calculate summary stats from rounds (no shots needed)
  const scores = roundsData.map(r => r.total_score).filter((s): s is number => s !== null);
  const roundsPlayed = scores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;
  let totalScramblesMade = 0;
  let totalScrambleOpp = 0;

  for (const round of roundsData) {
    if (round.fairways_hit !== null && round.fairway_opportunities !== null) {
      totalFairwaysHit += round.fairways_hit;
      totalFairwayOpp += round.fairway_opportunities;
    }
    if (round.greens_in_regulation !== null && round.gir_opportunities !== null) {
      totalGir += round.greens_in_regulation;
      totalGirOpp += round.gir_opportunities;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
    }
    if (round.scrambles_made !== null && round.scramble_opportunities !== null) {
      totalScramblesMade += round.scrambles_made;
      totalScrambleOpp += round.scramble_opportunities;
    }
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: roundsPlayed * 18, // Approximate
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
    scramblingPercentage: totalScrambleOpp > 0
      ? Math.round((totalScramblesMade / totalScrambleOpp) * 1000) / 10
      : null,
  };

  const rounds: RoundSummary[] = roundsData.map(r => ({
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
  roundId?: string | 'overall'
): Promise<GolfStats> {
  const supabase = await createClient();

  // Fetch all completed rounds
  const { data: roundsData } = await supabase
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
    .eq('status', 'completed')
    .order('round_date', { ascending: false });

  if (!roundsData || roundsData.length === 0) {
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

  // Fetch ALL shots (the expensive query)
  const { data: shotsData } = await supabase
    .from('golf_shots')
    .select('*')
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
    round_type: r.round_type as 'practice' | 'qualifying' | 'tournament',
  }));

  const holesInfo: HoleInfo[] = (holesData || []).map(h => ({
    id: h.id,
    round_id: h.round_id,
    hole_number: h.hole_number,
    par: h.par,
    yardage: 0,
  }));

  const shots: RawShot[] = (shotsData || [])
    .filter(s =>
      s.distance_to_hole_before !== null &&
      s.distance_to_hole_after !== null &&
      s.shot_distance !== null
    )
    .map(s => ({
      id: s.id,
      round_id: s.round_id,
      hole_id: s.hole_id,
      hole_number: s.hole_number,
      shot_number: s.shot_number,
      shot_type: s.shot_type as 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty',
      club_type: s.club_type as 'driver' | 'non_driver' | 'putter',
      lie_before: s.lie_before as 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other',
      distance_to_hole_before: s.distance_to_hole_before!,
      distance_unit_before: s.distance_unit_before as 'yards' | 'feet',
      result: s.result as 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty',
      distance_to_hole_after: s.distance_to_hole_after!,
      distance_unit_after: s.distance_unit_after as 'yards' | 'feet',
      shot_distance: s.shot_distance!,
      miss_direction: s.miss_direction,
      putt_break: s.putt_break,
      putt_slope: s.putt_slope,
      is_penalty: s.is_penalty ?? false,
      penalty_type: s.penalty_type,
    }));

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
  const supabase = await createClient();

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
      fairways_hit,
      fairway_opportunities,
      greens_in_regulation,
      gir_opportunities,
      total_putts,
      scrambles_made,
      scramble_opportunities
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
    roundType: r.round_type,
    girPct: r.greens_in_regulation !== null && r.gir_opportunities !== null && r.gir_opportunities > 0
      ? Math.round((r.greens_in_regulation / r.gir_opportunities) * 100)
      : null,
    fairwayPct: r.fairways_hit !== null && r.fairway_opportunities !== null && r.fairway_opportunities > 0
      ? Math.round((r.fairways_hit / r.fairway_opportunities) * 100)
      : null,
    putts: r.total_putts,
    scrambling: r.scrambles_made !== null && r.scramble_opportunities !== null && r.scramble_opportunities > 0
      ? Math.round((r.scrambles_made / r.scramble_opportunities) * 100)
      : null,
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
  const supabase = await createClient();

  // Get all team members
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId);

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
      fairways_hit,
      fairway_opportunities,
      greens_in_regulation,
      gir_opportunities,
      total_putts,
      scrambles_made,
      scramble_opportunities
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
    scrambles: number[];
    scrambleOpps: number[];
  }>();

  // Initialize map
  playerIds.forEach(id => {
    playerStatsMap.set(id, {
      scores: [], girs: [], girOpps: [], fairways: [], fairwayOpps: [], putts: [], scrambles: [], scrambleOpps: []
    });
  });

  // Aggregate stats
  roundsData.forEach(round => {
    const stats = playerStatsMap.get(round.player_id);
    if (!stats) return;

    if (round.total_score !== null) stats.scores.push(round.total_score);
    if (round.greens_in_regulation !== null) stats.girs.push(round.greens_in_regulation);
    if (round.gir_opportunities !== null) stats.girOpps.push(round.gir_opportunities);
    if (round.fairways_hit !== null) stats.fairways.push(round.fairways_hit);
    if (round.fairway_opportunities !== null) stats.fairwayOpps.push(round.fairway_opportunities);
    if (round.total_putts !== null) stats.putts.push(round.total_putts);
    if (round.scrambles_made !== null) stats.scrambles.push(round.scrambles_made);
    if (round.scramble_opportunities !== null) stats.scrambleOpps.push(round.scramble_opportunities);
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
    const totalScrambles = stats.scrambles.reduce((a, b) => a + b, 0);
    const totalScrambleOpps = stats.scrambleOpps.reduce((a, b) => a + b, 0);

    return {
      playerId: id,
      playerName: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      roundCount: stats.scores.length,
      scoringAverage: stats.scores.length > 0
        ? Math.round((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) * 10) / 10
        : null,
      bestRound: stats.scores.length > 0 ? Math.min(...stats.scores) : null,
      girPct: totalGirOpps > 0 ? Math.round((totalGirs / totalGirOpps) * 100) : null,
      fairwayPct: totalFairwayOpps > 0 ? Math.round((totalFairways / totalFairwayOpps) * 100) : null,
      puttsPerRound: stats.scores.length > 0
        ? Math.round((totalPutts / stats.scores.length) * 10) / 10
        : null,
      scramblingPct: totalScrambleOpps > 0 ? Math.round((totalScrambles / totalScrambleOpps) * 100) : null,
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
      ? Math.round(validGir.reduce((a, b) => a + b.girPct!, 0) / validGir.length)
      : null,
    fairwayPct: validFairway.length > 0
      ? Math.round(validFairway.reduce((a, b) => a + b.fairwayPct!, 0) / validFairway.length)
      : null,
    puttsPerRound: validPutts.length > 0
      ? Math.round((validPutts.reduce((a, b) => a + b.puttsPerRound!, 0) / validPutts.length) * 10) / 10
      : null,
    scramblingPct: validScrambling.length > 0
      ? Math.round(validScrambling.reduce((a, b) => a + b.scramblingPct!, 0) / validScrambling.length)
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
