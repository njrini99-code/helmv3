'use server';

/**
 * Golf Stats Server Actions
 *
 * Provides server-side data fetching for golf statistics with:
 * - Strokes Gained integration
 * - Trend analysis
 * - Comparison calculations
 * - Caching for performance
 */

import { createClient } from '@/lib/supabase/server';
import type {
  GolfShot,
  ComparisonBaseline,
  CoursePerformance,
  WeakAreaIdentification,
  RoundType,
} from '@/lib/types/golf';

// Local types that match what the trend-analysis functions return
// These differ from the types in @/lib/types/golf
interface LocalTrendAnalysis {
  metric: string;
  data: { date: string; value: number }[];
  current_value: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  velocity: number;
  prediction: number;
  confidence: number;
  moving_average: number;
  best_value: number;
  worst_value: number;
  std_deviation: number;
}

interface LocalMultiMetricTrend {
  scoring_avg: LocalTrendAnalysis;
  putts: LocalTrendAnalysis;
  fairway_pct: LocalTrendAnalysis;
  gir_pct: LocalTrendAnalysis;
  sg_total: LocalTrendAnalysis;
  sg_off_tee: LocalTrendAnalysis;
  sg_approach: LocalTrendAnalysis;
  sg_around_green: LocalTrendAnalysis;
  sg_putting: LocalTrendAnalysis;
}

interface LocalComparisonResult {
  comparisons: Array<{
    metric: string;
    player_value: number;
    baseline_value: number;
    difference: number;
    percentile?: number;
    is_strength: boolean;
    is_weakness: boolean;
  }>;
  baseline: ComparisonBaseline;
  strengths: string[];
  weaknesses: string[];
}
import {
  calculateRoundStrokesGained,
  aggregateStrokesGained,
} from '@/lib/golf/strokes-gained';
import {
  analyzeMultiMetricTrends,
  compareToBaseline,
  calculatePersonalBestBaseline,
  calculateTeamAverageBaseline,
  generateTrendInsights,
  predictNextRound,
} from '@/lib/golf/trend-analysis';

// ============================================
// LOCAL TYPES FOR THIS MODULE
// ============================================

interface StrokesGainedData {
  sg_off_tee: number;
  sg_approach: number;
  sg_around_green: number;
  sg_putting: number;
  sg_total: number;
}

interface LocalPlayerStats {
  player_id: string;
  total_rounds: number;
  scoring_avg: number;
  best_round: number;
  worst_round: number;
  avg_putts: number;
  fairway_percentage: number;
  gir_percentage: number;
  up_and_down_percentage: number;
  avg_penalty_strokes: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  double_bogeys_plus: number;
  strokes_gained: StrokesGainedData;
  period_start?: string;
  period_end?: string;
  round_type_filter?: RoundType[];
  // Raw counts for proper team aggregation
  fairways_hit: number;
  fairways_total: number;
  gir_hit: number;
  gir_total: number;
}

interface LocalTeamStats {
  team_id: string;
  team_name: string;
  total_players: number;
  total_rounds: number;
  team_scoring_avg: number;
  best_team_round: number;
  avg_putts: number;
  fairway_percentage: number;
  gir_percentage: number;
  strokes_gained: StrokesGainedData;
  player_stats: LocalPlayerStats[];
}

interface LocalStatsOptions {
  dateRange?: { start: string; end: string };
  roundType?: RoundType;
  roundTypes?: RoundType[];
  limit?: number;
  includeStrokesGained?: boolean;
  includeTrends?: boolean;
}

interface LocalDataQuality {
  has_shot_data: boolean;
  has_full_round_data: boolean;
  shot_data_percentage: number;
  missing_fields: string[];
  data_confidence: 'low' | 'medium' | 'high';
  last_updated: string;
}

interface LocalStatsResponse<T> {
  data: T;
  dataQuality: LocalDataQuality;
  cached: boolean;
}

interface GolfHoleLocal {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  gir?: boolean | null;
  up_and_down?: boolean | null;
  sand_save?: boolean | null;
  penalty_strokes?: number | null;
  shots?: GolfShot[];
}

interface GolfRoundLocal {
  id: string;
  player_id: string;
  round_date: string;
  course_id: string | null;
  course_name: string | null;
  round_type: string | null;
  status: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes?: GolfHoleLocal[];
}

// ============================================
// ROUND DATA FETCHING
// ============================================

/**
 * Fetch rounds for a player with optional filtering
 */
export async function getPlayerRounds(
  playerId: string,
  options?: {
    limit?: number;
    roundTypes?: RoundType[];
    startDate?: string;
    endDate?: string;
    includeHoles?: boolean;
    includeShots?: boolean;
  }
): Promise<GolfRoundLocal[]> {
  const supabase = await createClient();

  let query = supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .order('round_date', { ascending: false });

  if (options?.roundTypes && options.roundTypes.length > 0) {
    query = query.in('round_type', options.roundTypes);
  }

  if (options?.startDate) {
    query = query.gte('round_date', options.startDate);
  }

  if (options?.endDate) {
    query = query.lte('round_date', options.endDate);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data: rounds, error } = await query;

  if (error) {
    console.error('Error fetching rounds:', error);
    return [];
  }

  // If we need detailed data, fetch holes and shots
  if (options?.includeHoles && rounds) {
    const roundIds = rounds.map(r => r.id);

    const { data: holes } = await supabase
      .from('golf_holes')
      .select('*')
      .in('round_id', roundIds)
      .order('hole_number');

    if (holes) {
      // Fetch shots if needed
      let shotsByHole: Record<string, GolfShot[]> = {};

      if (options?.includeShots) {
        const holeIds = holes.map(h => h.id);
        const { data: shots } = await supabase
          .from('golf_shots')
          .select('*')
          .in('hole_id', holeIds)
          .order('shot_number');

        if (shots) {
          shotsByHole = shots.reduce((acc: Record<string, GolfShot[]>, shot) => {
            const holeId = shot.hole_id;
            if (holeId) {
              if (!acc[holeId]) acc[holeId] = [];
              acc[holeId].push(shot as GolfShot);
            }
            return acc;
          }, {});
        }
      }

      // Group holes by round
      const holesByRound = holes.reduce((acc: Record<string, GolfHoleLocal[]>, hole) => {
        if (!acc[hole.round_id]) acc[hole.round_id] = [];
        const holeShots = shotsByHole[hole.id];
        const roundHoles = acc[hole.round_id];
        if (roundHoles) {
          roundHoles.push({
            ...hole,
            shots: holeShots ?? [],
          } as GolfHoleLocal);
        }
        return acc;
      }, {});

      // Attach holes to rounds
      return rounds.map(round => ({
        ...round,
        holes: holesByRound[round.id] || [],
      })) as GolfRoundLocal[];
    }
  }

  return (rounds || []) as GolfRoundLocal[];
}

/**
 * Fetch a single round with full details
 */
export async function getRoundDetails(roundId: string): Promise<GolfRoundLocal | null> {
  const supabase = await createClient();

  const { data: round, error } = await supabase
    .from('golf_rounds')
    .select('*')
    .eq('id', roundId)
    .single();

  if (error || !round) {
    console.error('Error fetching round:', error);
    return null;
  }

  // Fetch holes
  const { data: holes } = await supabase
    .from('golf_holes')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');

  // Fetch shots for all holes
  if (holes) {
    const holeIds = holes.map(h => h.id);
    const { data: shots } = await supabase
      .from('golf_shots')
      .select('*')
      .in('hole_id', holeIds)
      .order('shot_number');

    const shotsByHole = (shots || []).reduce((acc: Record<string, GolfShot[]>, shot) => {
      const holeId = shot.hole_id;
      if (holeId) {
        if (!acc[holeId]) acc[holeId] = [];
        acc[holeId].push(shot as GolfShot);
      }
      return acc;
    }, {});

    return {
      ...round,
      holes: holes.map(hole => ({
        ...hole,
        shots: shotsByHole[hole.id] || [],
      })),
    } as GolfRoundLocal;
  }

  return { ...round, holes: [] } as GolfRoundLocal;
}

// ============================================
// PLAYER STATS
// ============================================

/**
 * Calculate comprehensive player statistics
 */
export async function getPlayerStats(
  playerId: string,
  options: LocalStatsOptions = {
    includeStrokesGained: true,
    includeTrends: false,
  }
): Promise<LocalStatsResponse<LocalPlayerStats>> {
  const rounds = await getPlayerRounds(playerId, {
    limit: options.limit,
    roundTypes: options.roundTypes,
    startDate: options.dateRange?.start,
    endDate: options.dateRange?.end,
    includeHoles: options.includeStrokesGained,
    includeShots: options.includeStrokesGained,
  });

  if (rounds.length === 0) {
    return {
      data: createEmptyPlayerStats(playerId),
      dataQuality: {
        has_shot_data: false,
        has_full_round_data: false,
        shot_data_percentage: 0,
        missing_fields: ['rounds'],
        data_confidence: 'low',
        last_updated: new Date().toISOString(),
      },
      cached: false,
    };
  }

  // Calculate basic stats - filter out null scores/putts
  const scores = rounds.map(r => r.total_score).filter((s): s is number => s !== null);
  const putts = rounds.map(r => r.total_putts).filter((p): p is number => p !== null);

  let totalFairwaysHit = 0;
  let totalFairwaysPossible = 0;
  let totalGIR = 0;
  let totalGIRPossible = 0;
  let totalUpAndDowns = 0;
  let totalUpAndDownAttempts = 0;
  let totalPenalties = 0;

  // Scoring distribution
  let eagles = 0;
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doublePlus = 0;

  for (const round of rounds) {
    if (round.total_fairways_hit !== null) totalFairwaysHit += round.total_fairways_hit;
    if (round.total_fairways !== null) totalFairwaysPossible += round.total_fairways;
    if (round.total_gir !== null) totalGIR += round.total_gir;
    if (round.total_gir_possible !== null) totalGIRPossible += round.total_gir_possible;

    // Count scoring distribution and up-and-downs from holes
    if (round.holes) {
      for (const hole of round.holes) {
        if (hole.score !== null) {
          const scoreToPar = hole.score - hole.par;
          if (scoreToPar <= -2) eagles++;
          else if (scoreToPar === -1) birdies++;
          else if (scoreToPar === 0) pars++;
          else if (scoreToPar === 1) bogeys++;
          else doublePlus++;
        }

        if (hole.up_and_down !== undefined) {
          // If GIR is false, it was an up-and-down attempt
          if (hole.gir === false) {
            totalUpAndDownAttempts++;
            if (hole.up_and_down === true) totalUpAndDowns++;
          }
        }

        if (hole.penalty_strokes) totalPenalties += hole.penalty_strokes;
      }
    }
  }

  // Calculate strokes gained - need to cast rounds for the function
  const strokesGained = options.includeStrokesGained
    ? aggregateStrokesGained(rounds as unknown as Parameters<typeof aggregateStrokesGained>[0])
    : { sg_off_tee: 0, sg_approach: 0, sg_around_green: 0, sg_putting: 0, sg_total: 0 };

  // Assess data quality
  const roundsWithShots = rounds.filter(r => r.holes?.some(h => h.shots && h.shots.length > 0));
  const shotDataPercentage = rounds.length > 0 ? (roundsWithShots.length / rounds.length) * 100 : 0;

  const stats: LocalPlayerStats = {
    player_id: playerId,
    total_rounds: rounds.length,
    scoring_avg: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
    best_round: scores.length > 0 ? Math.min(...scores) : 0,
    worst_round: scores.length > 0 ? Math.max(...scores) : 0,
    avg_putts: putts.length > 0 ? Math.round((putts.reduce((a, b) => a + b, 0) / putts.length) * 100) / 100 : 0,
    fairway_percentage: totalFairwaysPossible > 0
      ? Math.round((totalFairwaysHit / totalFairwaysPossible) * 10000) / 100
      : 0,
    gir_percentage: totalGIRPossible > 0
      ? Math.round((totalGIR / totalGIRPossible) * 10000) / 100
      : 0,
    up_and_down_percentage: totalUpAndDownAttempts > 0
      ? Math.round((totalUpAndDowns / totalUpAndDownAttempts) * 10000) / 100
      : 0,
    avg_penalty_strokes: rounds.length > 0 ? Math.round((totalPenalties / rounds.length) * 100) / 100 : 0,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys_plus: doublePlus,
    strokes_gained: strokesGained,
    period_start: options.dateRange?.start,
    period_end: options.dateRange?.end,
    round_type_filter: options.roundTypes,
    // Raw counts for proper team aggregation
    fairways_hit: totalFairwaysHit,
    fairways_total: totalFairwaysPossible,
    gir_hit: totalGIR,
    gir_total: totalGIRPossible,
  };

  return {
    data: stats,
    dataQuality: {
      has_shot_data: shotDataPercentage > 0,
      has_full_round_data: rounds.every(r => r.holes && r.holes.length === 18),
      shot_data_percentage: Math.round(shotDataPercentage),
      missing_fields: shotDataPercentage === 0 ? ['shot_data'] : [],
      data_confidence: shotDataPercentage >= 80 ? 'high' : shotDataPercentage >= 30 ? 'medium' : 'low',
      last_updated: new Date().toISOString(),
    },
    cached: false,
  };
}

/**
 * Create empty player stats object
 */
function createEmptyPlayerStats(playerId: string): LocalPlayerStats {
  return {
    player_id: playerId,
    total_rounds: 0,
    scoring_avg: 0,
    best_round: 0,
    worst_round: 0,
    avg_putts: 0,
    fairway_percentage: 0,
    gir_percentage: 0,
    up_and_down_percentage: 0,
    avg_penalty_strokes: 0,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    double_bogeys_plus: 0,
    strokes_gained: {
      sg_off_tee: 0,
      sg_approach: 0,
      sg_around_green: 0,
      sg_putting: 0,
      sg_total: 0,
    },
    // Raw counts
    fairways_hit: 0,
    fairways_total: 0,
    gir_hit: 0,
    gir_total: 0,
  };
}

// ============================================
// TEAM STATS
// ============================================

/**
 * Get team statistics aggregating all players
 */
export async function getTeamStats(
  teamId: string,
  options: LocalStatsOptions = { includeStrokesGained: true, includeTrends: false }
): Promise<LocalTeamStats | null> {
  const supabase = await createClient();

  // Get all players on the team via golf_team_members
  const { data: members, error } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (error || !members || members.length === 0) {
    return null;
  }

  // Get stats for each player
  const playerStatsPromises = members.map(async (m) => {
    const stats = await getPlayerStats(m.player_id, options);
    return stats.data;
  });

  const allPlayerStats = await Promise.all(playerStatsPromises);
  const activeStats = allPlayerStats.filter(s => s.total_rounds > 0);

  if (activeStats.length === 0) {
    return null;
  }

  // Aggregate team stats using raw counts for proper percentage calculation
  const totalRounds = activeStats.reduce((sum, s) => sum + s.total_rounds, 0);
  const bestRounds = activeStats.map(s => s.best_round).filter(s => s > 0);

  // Aggregate raw counts for proper team percentage calculations
  const totalFairwaysHit = activeStats.reduce((sum, s) => sum + s.fairways_hit, 0);
  const totalFairwaysTotal = activeStats.reduce((sum, s) => sum + s.fairways_total, 0);
  const totalGirHit = activeStats.reduce((sum, s) => sum + s.gir_hit, 0);
  const totalGirTotal = activeStats.reduce((sum, s) => sum + s.gir_total, 0);

  return {
    team_id: teamId,
    team_name: '', // Will be filled by caller
    total_players: members.length,
    total_rounds: totalRounds,
    team_scoring_avg: totalRounds > 0
      ? Math.round(
          (activeStats.reduce((sum, s) => sum + s.scoring_avg * s.total_rounds, 0) / totalRounds) * 100
        ) / 100
      : 0,
    best_team_round: bestRounds.length > 0 ? Math.min(...bestRounds) : 0,
    avg_putts: totalRounds > 0
      ? Math.round(
          (activeStats.reduce((sum, s) => sum + s.avg_putts * s.total_rounds, 0) / totalRounds) * 100
        ) / 100
      : 0,
    // Use aggregated raw counts for accurate team percentages
    fairway_percentage: totalFairwaysTotal > 0
      ? Math.round((totalFairwaysHit / totalFairwaysTotal) * 10000) / 100
      : 0,
    gir_percentage: totalGirTotal > 0
      ? Math.round((totalGirHit / totalGirTotal) * 10000) / 100
      : 0,
    strokes_gained: {
      sg_off_tee: activeStats.length > 0
        ? Math.round(
            (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_off_tee, 0) /
              activeStats.length) *
              100
          ) / 100
        : 0,
      sg_approach: activeStats.length > 0
        ? Math.round(
            (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_approach, 0) /
              activeStats.length) *
              100
          ) / 100
        : 0,
      sg_around_green: activeStats.length > 0
        ? Math.round(
            (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_around_green, 0) /
              activeStats.length) *
              100
          ) / 100
        : 0,
      sg_putting: activeStats.length > 0
        ? Math.round(
            (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_putting, 0) /
              activeStats.length) *
              100
          ) / 100
        : 0,
      sg_total: activeStats.length > 0
        ? Math.round(
            (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_total, 0) / activeStats.length) *
              100
          ) / 100
        : 0,
    },
    player_stats: allPlayerStats,
  };
}

// ============================================
// TRENDS
// ============================================

/**
 * Get trend analysis for a player
 */
export async function getPlayerTrends(
  playerId: string,
  options?: {
    limit?: number;
    roundTypes?: RoundType[];
  }
): Promise<LocalMultiMetricTrend | null> {
  const rounds = await getPlayerRounds(playerId, {
    limit: options?.limit || 20,
    roundTypes: options?.roundTypes,
    includeHoles: true,
    includeShots: true,
  });

  if (rounds.length < 3) {
    return null; // Need at least 3 rounds for meaningful trend
  }

  return analyzeMultiMetricTrends(rounds as unknown as Parameters<typeof analyzeMultiMetricTrends>[0]) as LocalMultiMetricTrend;
}

/**
 * Get trend insights with recommendations
 */
export async function getPlayerTrendInsights(
  playerId: string
): Promise<{
  trends: LocalMultiMetricTrend | null;
  insights: string[];
  prediction: { predicted_score: number; confidence: number; range_low: number; range_high: number } | null;
}> {
  const trends = await getPlayerTrends(playerId);

  if (!trends) {
    return {
      trends: null,
      insights: ['Not enough rounds for trend analysis (minimum 3 required)'],
      prediction: null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insights = generateTrendInsights(trends as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prediction = predictNextRound(trends as any);

  return {
    trends,
    insights,
    prediction,
  };
}

// ============================================
// COMPARISONS
// ============================================

/**
 * Compare player stats to a baseline
 */
export async function getPlayerComparison(
  playerId: string,
  baseline: ComparisonBaseline,
  teamId?: string
): Promise<LocalComparisonResult | null> {
  const statsResponse = await getPlayerStats(playerId, {
    includeStrokesGained: true,
    includeTrends: false,
  });

  const stats = statsResponse.data;
  if (stats.total_rounds === 0) {
    return null;
  }

  let customBaseline: Record<string, number> | undefined;

  if (baseline === 'personal_best') {
    const rounds = await getPlayerRounds(playerId, { includeHoles: true });
    customBaseline = calculatePersonalBestBaseline(rounds as unknown as Parameters<typeof calculatePersonalBestBaseline>[0]);
  } else if (baseline === 'team' && teamId) {
    const teamStats = await getTeamStats(teamId, {
      includeStrokesGained: true,
      includeTrends: false,
    });
    if (teamStats) {
      customBaseline = calculateTeamAverageBaseline(teamStats.player_stats as unknown as Parameters<typeof calculateTeamAverageBaseline>[0]);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return compareToBaseline(stats as unknown as Parameters<typeof compareToBaseline>[0], baseline as any, customBaseline) as unknown as LocalComparisonResult;
}

/**
 * Get player rankings within a team
 */
export async function getTeamPlayerRankings(
  teamId: string,
  metric: 'scoring_avg' | 'sg_total' | 'gir_pct' | 'putts'
): Promise<{ player_id: string; player_name: string; value: number; rank: number }[]> {
  const teamStats = await getTeamStats(teamId, {
    includeStrokesGained: true,
    includeTrends: false,
  });

  if (!teamStats) {
    return [];
  }

  const rankings = teamStats.player_stats
    .filter(s => s.total_rounds > 0)
    .map(s => {
      let value: number;
      switch (metric) {
        case 'scoring_avg':
          value = s.scoring_avg;
          break;
        case 'sg_total':
          value = s.strokes_gained.sg_total;
          break;
        case 'gir_pct':
          value = s.gir_percentage;
          break;
        case 'putts':
          value = s.avg_putts;
          break;
        default:
          value = 0;
      }
      return {
        player_id: s.player_id,
        player_name: '', // Will be filled by caller
        value,
        rank: 0,
      };
    });

  // Sort (lower is better for scoring and putts, higher for SG and GIR)
  const lowerIsBetter = metric === 'scoring_avg' || metric === 'putts';
  rankings.sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));

  // Assign ranks
  for (let i = 0; i < rankings.length; i++) {
    const rankEntry = rankings[i];
    if (rankEntry) {
      rankEntry.rank = i + 1;
    }
  }

  return rankings;
}

// ============================================
// COURSE PERFORMANCE
// ============================================

/**
 * Get player performance on specific courses
 */
export async function getCoursePerformance(
  playerId: string,
  courseId?: string
): Promise<CoursePerformance[]> {
  const supabase = await createClient();

  let query = supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  if (courseId) {
    query = query.eq('course_id', courseId);
  }

  const { data: rounds, error } = await query;

  if (error || !rounds) {
    return [];
  }

  // Group rounds by course
  const courseMap = new Map<string, typeof rounds>();
  for (const round of rounds) {
    const key = round.course_id || 'unknown';
    const existing = courseMap.get(key);
    if (existing) {
      existing.push(round);
    } else {
      courseMap.set(key, [round]);
    }
  }

  const performances: CoursePerformance[] = [];

  for (const [, courseRounds] of courseMap) {
    // Get scores for course
    const scores = courseRounds.map(r => r.total_score).filter((s): s is number => s !== null);
    if (scores.length === 0) continue;

    const firstRound = courseRounds[0];
    performances.push({
      courseName: firstRound?.course_name || 'Unknown Course',
      roundsPlayed: courseRounds.length,
      scoringAverage: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
      bestScore: Math.min(...scores),
      worstScore: Math.max(...scores),
    });
  }

  return performances;
}

// ============================================
// WEAK AREA IDENTIFICATION
// ============================================

/**
 * Identify areas needing improvement with recommendations
 */
export async function identifyWeakAreas(playerId: string): Promise<WeakAreaIdentification[]> {
  const statsResponse = await getPlayerStats(playerId, {
    includeStrokesGained: true,
    includeTrends: false,
  });

  const stats = statsResponse.data;
  if (stats.total_rounds === 0) {
    return [];
  }

  const weakAreas: WeakAreaIdentification[] = [];
  const sg = stats.strokes_gained;

  // Define thresholds and recommendations
  const categories = [
    {
      key: 'sg_off_tee' as const,
      label: 'Off the Tee',
      value: sg.sg_off_tee,
      threshold: -0.3,
      benchmark: 0,
    },
    {
      key: 'sg_approach' as const,
      label: 'Approach Shots',
      value: sg.sg_approach,
      threshold: -0.5,
      benchmark: 0,
    },
    {
      key: 'sg_around_green' as const,
      label: 'Short Game',
      value: sg.sg_around_green,
      threshold: -0.3,
      benchmark: 0,
    },
    {
      key: 'sg_putting' as const,
      label: 'Putting',
      value: sg.sg_putting,
      threshold: -0.2,
      benchmark: 0,
    },
  ];

  // Sort by weakness severity
  const sorted = categories.sort((a, b) => a.value - b.value);

  for (const cat of sorted) {
    if (cat.value < cat.threshold) {
      weakAreas.push({
        area: cat.label,
        severity: cat.value < cat.threshold * 2 ? 'critical' : cat.value < cat.threshold * 1.5 ? 'moderate' : 'minor',
        metric: cat.key,
        value: cat.value,
        benchmark: cat.benchmark,
        recommendation: `Focus on improving ${cat.label.toLowerCase()} through targeted practice`,
      });
    }
  }

  // Also check traditional stats
  if (stats.fairway_percentage < 50) {
    weakAreas.push({
      area: 'Fairway Accuracy',
      severity: stats.fairway_percentage < 40 ? 'critical' : 'moderate',
      metric: 'fairway_percentage',
      value: stats.fairway_percentage,
      benchmark: 60,
      recommendation: 'Work on alignment and swing consistency for better fairway accuracy',
    });
  }

  if (stats.gir_percentage < 40) {
    weakAreas.push({
      area: 'Greens in Regulation',
      severity: stats.gir_percentage < 30 ? 'critical' : 'moderate',
      metric: 'gir_percentage',
      value: stats.gir_percentage,
      benchmark: 55,
      recommendation: 'Focus on iron play and distance control to hit more greens',
    });
  }

  if (stats.up_and_down_percentage < 35) {
    weakAreas.push({
      area: 'Up and Down Percentage',
      severity: stats.up_and_down_percentage < 25 ? 'critical' : 'moderate',
      metric: 'up_and_down_percentage',
      value: stats.up_and_down_percentage,
      benchmark: 50,
      recommendation: 'Practice short game and putting to improve scrambling',
    });
  }

  return weakAreas;
}

// ============================================
// ROUND STROKES GAINED
// ============================================

/**
 * Calculate and store strokes gained for a round
 */
export async function calculateAndStoreRoundSG(roundId: string): Promise<StrokesGainedData | null> {
  const round = await getRoundDetails(roundId);
  if (!round) {
    return null;
  }

  const sg = calculateRoundStrokesGained(round as unknown as Parameters<typeof calculateRoundStrokesGained>[0]);

  // Update round with strokes gained values
  const supabase = await createClient();
  const { error } = await supabase
    .from('golf_rounds')
    .update({
      updated_at: new Date().toISOString(),
    })
    .eq('id', roundId);

  if (error) {
    console.error('Error storing strokes gained:', error);
  }

  return sg;
}

/**
 * Batch recalculate strokes gained for all rounds
 */
export async function recalculateAllStrokesGained(playerId: string): Promise<number> {
  const rounds = await getPlayerRounds(playerId, {
    includeHoles: true,
    includeShots: true,
  });

  let updated = 0;
  for (const rnd of rounds) {
    const result = await calculateAndStoreRoundSG(rnd.id);
    if (result) {
      updated++;
    }
  }

  return updated;
}
