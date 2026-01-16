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
  GolfRound,
  GolfHole,
  GolfShot,
  PlayerStats,
  TeamStats,
  StrokesGainedResult,
  TrendAnalysis,
  MultiMetricTrend,
  ComparisonResult,
  ComparisonBaseline,
  StatsOptions,
  StatsResponse,
  DataQuality,
  CoursePerformance,
  HolePerformance,
  WeakAreaIdentification,
  RoundType,
} from '@/lib/types/golf';
import {
  calculateRoundStrokesGained,
  aggregateStrokesGained,
  identifyStrengthsWeaknesses,
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
): Promise<GolfRound[]> {
  const supabase = await createClient();

  let query = supabase
    .from('golf_rounds')
    .select('*')
    .eq('player_id', playerId)
    .eq('round_status', 'completed')
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
          shotsByHole = shots.reduce((acc, shot) => {
            if (!acc[shot.hole_id]) acc[shot.hole_id] = [];
            acc[shot.hole_id].push(shot as GolfShot);
            return acc;
          }, {} as Record<string, GolfShot[]>);
        }
      }

      // Group holes by round
      const holesByRound = holes.reduce((acc, hole) => {
        if (!acc[hole.round_id]) acc[hole.round_id] = [];
        acc[hole.round_id].push({
          ...hole,
          shots: shotsByHole[hole.id] || [],
        } as GolfHole);
        return acc;
      }, {} as Record<string, GolfHole[]>);

      // Attach holes to rounds
      return rounds.map(round => ({
        ...round,
        holes: holesByRound[round.id] || [],
      })) as GolfRound[];
    }
  }

  return (rounds || []) as GolfRound[];
}

/**
 * Fetch a single round with full details
 */
export async function getRoundDetails(roundId: string): Promise<GolfRound | null> {
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

    const shotsByHole = (shots || []).reduce((acc, shot) => {
      if (!acc[shot.hole_id]) acc[shot.hole_id] = [];
      acc[shot.hole_id].push(shot as GolfShot);
      return acc;
    }, {} as Record<string, GolfShot[]>);

    return {
      ...round,
      holes: holes.map(hole => ({
        ...hole,
        shots: shotsByHole[hole.id] || [],
      })),
    } as GolfRound;
  }

  return { ...round, holes: [] } as GolfRound;
}

// ============================================
// PLAYER STATS
// ============================================

/**
 * Calculate comprehensive player statistics
 */
export async function getPlayerStats(
  playerId: string,
  options: StatsOptions = {
    includeStrokesGained: true,
    includeTrends: false,
  }
): Promise<StatsResponse<PlayerStats>> {
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
      data_quality: {
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

  // Calculate basic stats
  const scores = rounds.map(r => r.total_score);
  const putts = rounds.map(r => r.total_putts);

  let totalFairwaysHit = 0;
  let totalFairwaysPossible = 0;
  let totalGIR = 0;
  let totalUpAndDowns = 0;
  let totalUpAndDownAttempts = 0;
  let totalSandSaves = 0;
  let totalSandSaveAttempts = 0;
  let totalPenalties = 0;

  // Scoring distribution
  let eagles = 0;
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doublePlus = 0;

  for (const round of rounds) {
    totalFairwaysHit += round.fairways_hit;
    totalFairwaysPossible += round.fairways_possible;
    totalGIR += round.greens_in_regulation;
    totalUpAndDowns += round.up_and_downs;
    totalUpAndDownAttempts += round.up_and_down_attempts;
    totalSandSaves += round.sand_saves;
    totalSandSaveAttempts += round.sand_save_attempts;
    totalPenalties += round.penalty_strokes;

    // Count scoring distribution from holes
    if (round.holes) {
      for (const hole of round.holes) {
        const scoreToPar = hole.score - hole.par;
        if (scoreToPar <= -2) eagles++;
        else if (scoreToPar === -1) birdies++;
        else if (scoreToPar === 0) pars++;
        else if (scoreToPar === 1) bogeys++;
        else doublePlus++;
      }
    }
  }

  // Calculate strokes gained
  const strokesGained = options.includeStrokesGained
    ? aggregateStrokesGained(rounds)
    : { sg_off_tee: 0, sg_approach: 0, sg_around_green: 0, sg_putting: 0, sg_total: 0 };

  // Assess data quality
  const roundsWithShots = rounds.filter(r => r.holes?.some(h => h.shots && h.shots.length > 0));
  const shotDataPercentage = (roundsWithShots.length / rounds.length) * 100;

  const stats: PlayerStats = {
    player_id: playerId,
    total_rounds: rounds.length,
    scoring_avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
    best_round: Math.min(...scores),
    worst_round: Math.max(...scores),
    avg_putts: Math.round((putts.reduce((a, b) => a + b, 0) / putts.length) * 100) / 100,
    fairway_percentage: totalFairwaysPossible > 0
      ? Math.round((totalFairwaysHit / totalFairwaysPossible) * 10000) / 100
      : 0,
    gir_percentage: Math.round((totalGIR / (rounds.length * 18)) * 10000) / 100,
    up_and_down_percentage: totalUpAndDownAttempts > 0
      ? Math.round((totalUpAndDowns / totalUpAndDownAttempts) * 10000) / 100
      : 0,
    sand_save_percentage: totalSandSaveAttempts > 0
      ? Math.round((totalSandSaves / totalSandSaveAttempts) * 10000) / 100
      : 0,
    avg_penalty_strokes: Math.round((totalPenalties / rounds.length) * 100) / 100,
    eagles,
    birdies,
    pars,
    bogeys,
    double_bogeys_plus: doublePlus,
    strokes_gained: strokesGained,
    period_start: options.dateRange?.start,
    period_end: options.dateRange?.end,
    round_type_filter: options.roundTypes,
  };

  return {
    data: stats,
    data_quality: {
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
function createEmptyPlayerStats(playerId: string): PlayerStats {
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
    sand_save_percentage: 0,
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
  options: StatsOptions = { includeStrokesGained: true, includeTrends: false }
): Promise<TeamStats | null> {
  const supabase = await createClient();

  // Get all players on the team
  const { data: players, error } = await supabase
    .from('golf_team_players')
    .select('player_id, golf_players(id, full_name)')
    .eq('team_id', teamId);

  if (error || !players || players.length === 0) {
    return null;
  }

  // Get stats for each player
  const playerStatsPromises = players.map(async (p) => {
    const stats = await getPlayerStats(p.player_id, options);
    return stats.data;
  });

  const allPlayerStats = await Promise.all(playerStatsPromises);
  const activeStats = allPlayerStats.filter(s => s.total_rounds > 0);

  if (activeStats.length === 0) {
    return null;
  }

  // Aggregate team stats
  const totalRounds = activeStats.reduce((sum, s) => sum + s.total_rounds, 0);

  return {
    team_id: teamId,
    team_name: '', // Will be filled by caller
    total_players: players.length,
    total_rounds: totalRounds,
    team_scoring_avg:
      Math.round(
        (activeStats.reduce((sum, s) => sum + s.scoring_avg * s.total_rounds, 0) / totalRounds) * 100
      ) / 100,
    best_team_round: Math.min(...activeStats.map(s => s.best_round).filter(s => s > 0)),
    avg_putts:
      Math.round(
        (activeStats.reduce((sum, s) => sum + s.avg_putts * s.total_rounds, 0) / totalRounds) * 100
      ) / 100,
    fairway_percentage:
      Math.round(
        (activeStats.reduce((sum, s) => sum + s.fairway_percentage, 0) / activeStats.length) * 100
      ) / 100,
    gir_percentage:
      Math.round(
        (activeStats.reduce((sum, s) => sum + s.gir_percentage, 0) / activeStats.length) * 100
      ) / 100,
    strokes_gained: {
      sg_off_tee:
        Math.round(
          (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_off_tee, 0) /
            activeStats.length) *
            100
        ) / 100,
      sg_approach:
        Math.round(
          (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_approach, 0) /
            activeStats.length) *
            100
        ) / 100,
      sg_around_green:
        Math.round(
          (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_around_green, 0) /
            activeStats.length) *
            100
        ) / 100,
      sg_putting:
        Math.round(
          (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_putting, 0) /
            activeStats.length) *
            100
        ) / 100,
      sg_total:
        Math.round(
          (activeStats.reduce((sum, s) => sum + s.strokes_gained.sg_total, 0) / activeStats.length) *
            100
        ) / 100,
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
): Promise<MultiMetricTrend | null> {
  const rounds = await getPlayerRounds(playerId, {
    limit: options?.limit || 20,
    roundTypes: options?.roundTypes,
    includeHoles: true,
    includeShots: true,
  });

  if (rounds.length < 3) {
    return null; // Need at least 3 rounds for meaningful trend
  }

  return analyzeMultiMetricTrends(rounds);
}

/**
 * Get trend insights with recommendations
 */
export async function getPlayerTrendInsights(
  playerId: string
): Promise<{
  trends: MultiMetricTrend | null;
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

  const insights = generateTrendInsights(trends);
  const prediction = predictNextRound(trends);

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
): Promise<ComparisonResult | null> {
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
    customBaseline = calculatePersonalBestBaseline(rounds);
  } else if (baseline === 'team_avg' && teamId) {
    const teamStats = await getTeamStats(teamId, {
      includeStrokesGained: true,
      includeTrends: false,
    });
    if (teamStats) {
      customBaseline = calculateTeamAverageBaseline(teamStats.player_stats);
    }
  }

  return compareToBaseline(stats, baseline, customBaseline);
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
  rankings.forEach((r, i) => {
    r.rank = i + 1;
  });

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
    .select('*, golf_holes(*)')
    .eq('player_id', playerId)
    .eq('round_status', 'completed');

  if (courseId) {
    query = query.eq('course_id', courseId);
  }

  const { data: rounds, error } = await query;

  if (error || !rounds) {
    return [];
  }

  // Group by course
  const courseMap = new Map<string, GolfRound[]>();
  for (const round of rounds) {
    const key = round.course_id;
    if (!courseMap.has(key)) {
      courseMap.set(key, []);
    }
    courseMap.get(key)!.push(round as GolfRound);
  }

  const performances: CoursePerformance[] = [];

  for (const [cId, courseRounds] of courseMap) {
    const holePerformances: HolePerformance[] = [];

    // Aggregate hole-by-hole performance
    for (let holeNum = 1; holeNum <= 18; holeNum++) {
      const holeData = courseRounds.flatMap(r =>
        (r.holes || []).filter(h => h.hole_number === holeNum)
      );

      if (holeData.length > 0) {
        const avgScore = holeData.reduce((sum, h) => sum + h.score, 0) / holeData.length;
        const par = holeData[0].par;

        holePerformances.push({
          hole_number: holeNum,
          par,
          avg_score: Math.round(avgScore * 100) / 100,
          score_to_par: Math.round((avgScore - par) * 100) / 100,
          times_played: holeData.length,
          birdies: holeData.filter(h => h.score < h.par).length,
          pars: holeData.filter(h => h.score === h.par).length,
          bogeys: holeData.filter(h => h.score === h.par + 1).length,
          doubles_plus: holeData.filter(h => h.score > h.par + 1).length,
        });
      }
    }

    performances.push({
      course_id: cId,
      course_name: courseRounds[0].course_name,
      rounds_played: courseRounds.length,
      avg_score:
        Math.round(
          (courseRounds.reduce((sum, r) => sum + r.total_score, 0) / courseRounds.length) * 100
        ) / 100,
      best_score: Math.min(...courseRounds.map(r => r.total_score)),
      holes: holePerformances,
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
      targetImprovement: 0.2,
      drills: ['Driver alignment drill', 'Tempo training', 'Fairway finder game'],
      timeEstimate: '4-6 weeks',
    },
    {
      key: 'sg_approach' as const,
      label: 'Approach Shots',
      value: sg.sg_approach,
      threshold: -0.5,
      targetImprovement: 0.3,
      drills: ['Iron striking drill', 'Distance control ladder', 'Green reading practice'],
      timeEstimate: '6-8 weeks',
    },
    {
      key: 'sg_around_green' as const,
      label: 'Short Game',
      value: sg.sg_around_green,
      threshold: -0.3,
      targetImprovement: 0.2,
      drills: ['Up and down challenge', 'Bunker practice', 'Chipping distance control'],
      timeEstimate: '3-5 weeks',
    },
    {
      key: 'sg_putting' as const,
      label: 'Putting',
      value: sg.sg_putting,
      threshold: -0.2,
      targetImprovement: 0.15,
      drills: ['Gate drill', 'Speed control ladder', 'Pressure putting game'],
      timeEstimate: '3-4 weeks',
    },
  ];

  // Sort by weakness severity
  const sorted = categories.sort((a, b) => a.value - b.value);

  for (const cat of sorted) {
    if (cat.value < cat.threshold) {
      weakAreas.push({
        area: cat.label,
        severity: cat.value < cat.threshold * 2 ? 'critical' : cat.value < cat.threshold * 1.5 ? 'moderate' : 'minor',
        current_value: cat.value,
        target_value: cat.targetImprovement,
        recommended_drills: cat.drills,
        estimated_improvement_time: cat.timeEstimate,
        related_strokes_gained_category: cat.key,
      });
    }
  }

  // Also check traditional stats
  if (stats.fairway_percentage < 50) {
    weakAreas.push({
      area: 'Fairway Accuracy',
      severity: stats.fairway_percentage < 40 ? 'critical' : 'moderate',
      current_value: stats.fairway_percentage,
      target_value: 60,
      recommended_drills: ['Alignment stick drill', 'Half-swing accuracy', 'Course management practice'],
      estimated_improvement_time: '4-6 weeks',
    });
  }

  if (stats.gir_percentage < 40) {
    weakAreas.push({
      area: 'Greens in Regulation',
      severity: stats.gir_percentage < 30 ? 'critical' : 'moderate',
      current_value: stats.gir_percentage,
      target_value: 55,
      recommended_drills: ['Iron consistency drill', 'Target practice', 'Pre-shot routine work'],
      estimated_improvement_time: '6-8 weeks',
    });
  }

  if (stats.up_and_down_percentage < 35) {
    weakAreas.push({
      area: 'Up and Down Percentage',
      severity: stats.up_and_down_percentage < 25 ? 'critical' : 'moderate',
      current_value: stats.up_and_down_percentage,
      target_value: 50,
      recommended_drills: ['Scramble practice', 'Green reading', 'Short game circuit'],
      estimated_improvement_time: '4-6 weeks',
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
export async function calculateAndStoreRoundSG(roundId: string): Promise<StrokesGainedResult | null> {
  const round = await getRoundDetails(roundId);
  if (!round) {
    return null;
  }

  const sg = calculateRoundStrokesGained(round);

  // Update round with strokes gained values
  const supabase = await createClient();
  const { error } = await supabase
    .from('golf_rounds')
    .update({
      sg_total: sg.sg_total,
      sg_off_tee: sg.sg_off_tee,
      sg_approach: sg.sg_approach,
      sg_around_green: sg.sg_around_green,
      sg_putting: sg.sg_putting,
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
  for (const round of rounds) {
    const result = await calculateAndStoreRoundSG(round.id);
    if (result) {
      updated++;
    }
  }

  return updated;
}
