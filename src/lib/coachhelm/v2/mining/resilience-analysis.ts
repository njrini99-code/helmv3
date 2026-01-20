/**
 * Comeback Resilience Analysis
 *
 * Tracks how players perform after adverse events (bogeys, doubles)
 * to measure mental resilience and identify areas for improvement.
 *
 * Key metrics:
 * - Bounce-back rate (par or better after bogey)
 * - Double bounce-back rate (par or better after double)
 * - Collapse rate (bogey after bogey)
 * - Back 9 performance when behind at the turn
 * - Bogey-free and bogey streak analysis
 * - Composite resilience score
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Core resilience metrics for a player
 */
export interface ResilienceMetrics {
  /** % par or better on hole immediately after bogey */
  bounceBackRate: number;
  /** % par or better on hole immediately after double bogey+ */
  doubleBounceBackRate: number;
  /** % of times a bogey leads to another bogey on the next hole */
  collapseRate: number;
  /** Average score relative to par after a bogey */
  avgScoreAfterBogey: number;
  /** Average score relative to par after a double+ */
  avgScoreAfterDouble: number;
  /** Average back 9 score when +3 or worse at the turn */
  avgBackNineWhenBehind: number;
  /** Bounce-back birdie rate: % of birdies on hole after bogey */
  bounceBackBirdieRate: number;
  /** Longest consecutive holes without a bogey */
  longestBogeyFreeStreak: number;
  /** Longest consecutive bogey (or worse) streak */
  longestBogeyStreak: number;
  /** Average bogey-free streak length */
  avgBogeyFreeStreak: number;
  /** Average bogey streak length */
  avgBogeyStreak: number;
  /** Composite resilience score (0-100) */
  resilienceScore: number;
  /** Trend direction based on recent vs historical performance */
  trend: 'improving' | 'declining' | 'stable';
}

/**
 * Benchmark data for comparison
 */
export interface ResilienceBenchmarks {
  /** Tour average bounce-back rate (~50%) */
  tourBounceBackRate: number;
  /** College average bounce-back rate (~40%) */
  collegeBounceBackRate: number;
  /** Tour collapse rate (~25%) */
  tourCollapseRate: number;
  /** College collapse rate (~35%) */
  collegeCollapseRate: number;
  /** Team average (if available) */
  teamAvg?: Partial<ResilienceMetrics>;
}

/**
 * Individual insight with actionable recommendation
 */
export interface ResilienceInsight {
  id: string;
  category: 'bounce_back' | 'collapse' | 'momentum' | 'back_nine' | 'streaks';
  headline: string;
  body: string;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  metricValue: number;
  benchmarkValue: number;
  gap: number;
  trend?: 'improving' | 'declining' | 'stable';
}

/**
 * Complete resilience analysis result
 */
export interface ResilienceAnalysis {
  playerId: string;
  playerName?: string;
  analyzedAt: string;
  metrics: ResilienceMetrics;
  benchmarks: ResilienceBenchmarks;
  insights: ResilienceInsight[];
  /** Primary insight for dashboard display */
  primaryInsight: ResilienceInsight | null;
  /** Number of rounds analyzed */
  roundsAnalyzed: number;
  /** Number of adverse events analyzed */
  adverseEventsAnalyzed: number;
  /** Data quality indicator */
  dataQuality: 'high' | 'medium' | 'low' | 'insufficient';
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum rounds required for reliable analysis */
const MIN_ROUNDS_FOR_ANALYSIS = 5;

/** Minimum adverse events for pattern detection */
const MIN_ADVERSE_EVENTS = 10;

/** Benchmarks for comparison */
const BENCHMARKS: ResilienceBenchmarks = {
  tourBounceBackRate: 0.50,
  collegeBounceBackRate: 0.40,
  tourCollapseRate: 0.25,
  collegeCollapseRate: 0.35,
};

// ============================================================================
// DATA STRUCTURES
// ============================================================================

interface HoleData {
  round_id: string;
  hole_number: number;
  score: number | null;
  par: number;
  round_date: string;
}

interface RoundHoleSequence {
  roundId: string;
  roundDate: string;
  holes: HoleData[];
  frontNineTotal: number;
  backNineTotal: number;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyzes resilience metrics for a player
 *
 * @param playerId - The player's UUID
 * @returns Complete resilience analysis or null if insufficient data
 */
export async function analyzeResilience(
  playerId: string
): Promise<ResilienceAnalysis | null> {
  const supabase = await createClient();

  // Fetch player name for context
  const { data: player } = await supabase
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .single();

  const playerName = player
    ? `${player.first_name} ${player.last_name}`
    : undefined;

  // Load hole-by-hole data
  const roundSequences = await loadRoundSequences(playerId);

  if (roundSequences.length < MIN_ROUNDS_FOR_ANALYSIS) {
    return createInsufficientDataResult(playerId, playerName, roundSequences.length);
  }

  // Calculate all metrics
  const bounceBackStats = calculateBounceBackStats(roundSequences);
  const streakStats = calculateStreakStats(roundSequences);
  const backNineStats = calculateBackNineWhenBehind(roundSequences);
  const trend = calculateTrend(roundSequences);

  // Calculate composite score
  const resilienceScore = calculateCompositeScore(
    bounceBackStats,
    streakStats,
    backNineStats
  );

  const metrics: ResilienceMetrics = {
    bounceBackRate: bounceBackStats.bounceBackRate,
    doubleBounceBackRate: bounceBackStats.doubleBounceBackRate,
    collapseRate: bounceBackStats.collapseRate,
    avgScoreAfterBogey: bounceBackStats.avgScoreAfterBogey,
    avgScoreAfterDouble: bounceBackStats.avgScoreAfterDouble,
    avgBackNineWhenBehind: backNineStats.avgBackNineWhenBehind,
    bounceBackBirdieRate: bounceBackStats.bounceBackBirdieRate,
    longestBogeyFreeStreak: streakStats.longestBogeyFreeStreak,
    longestBogeyStreak: streakStats.longestBogeyStreak,
    avgBogeyFreeStreak: streakStats.avgBogeyFreeStreak,
    avgBogeyStreak: streakStats.avgBogeyStreak,
    resilienceScore,
    trend,
  };

  // Generate insights
  const insights = generateInsights(metrics, BENCHMARKS, bounceBackStats.totalBogeys);

  // Determine data quality
  const dataQuality = determineDataQuality(
    roundSequences.length,
    bounceBackStats.totalBogeys
  );

  // Find primary insight
  const primaryInsight = insights.length > 0
    ? insights.reduce((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] <= priorityOrder[b.priority] ? a : b;
      })
    : null;

  return {
    playerId,
    playerName,
    analyzedAt: new Date().toISOString(),
    metrics,
    benchmarks: BENCHMARKS,
    insights,
    primaryInsight,
    roundsAnalyzed: roundSequences.length,
    adverseEventsAnalyzed: bounceBackStats.totalBogeys + bounceBackStats.totalDoubles,
    dataQuality,
  };
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Loads hole-by-hole data organized by round
 */
async function loadRoundSequences(playerId: string): Promise<RoundHoleSequence[]> {
  const supabase = await createClient();

  // Get completed rounds from last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id, round_date')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', sixMonthsAgo.toISOString())
    .order('round_date', { ascending: true });

  if (roundsError || !rounds || rounds.length === 0) {
    return [];
  }

  const roundIds = rounds.map((r) => r.id);

  // Get all hole data for these rounds
  const { data: holes, error: holesError } = await supabase
    .from('golf_holes')
    .select('round_id, hole_number, score, par')
    .in('round_id', roundIds)
    .order('round_id')
    .order('hole_number');

  if (holesError || !holes) {
    return [];
  }

  // Group holes by round
  const roundMap = new Map<string, { date: string; holes: HoleData[] }>();

  for (const round of rounds) {
    roundMap.set(round.id, { date: round.round_date, holes: [] });
  }

  for (const hole of holes) {
    const roundData = roundMap.get(hole.round_id);
    if (roundData) {
      roundData.holes.push({
        round_id: hole.round_id,
        hole_number: hole.hole_number,
        score: hole.score,
        par: hole.par,
        round_date: roundData.date,
      });
    }
  }

  // Convert to sequences and calculate nine totals
  const sequences: RoundHoleSequence[] = [];

  for (const [roundId, data] of roundMap) {
    // Only include rounds with at least 18 holes
    if (data.holes.length < 18) continue;

    const sortedHoles = data.holes.sort((a, b) => a.hole_number - b.hole_number);

    const frontNine = sortedHoles
      .filter((h) => h.hole_number <= 9)
      .reduce((sum, h) => sum + getScoreToPar(h), 0);

    const backNine = sortedHoles
      .filter((h) => h.hole_number > 9)
      .reduce((sum, h) => sum + getScoreToPar(h), 0);

    sequences.push({
      roundId,
      roundDate: data.date,
      holes: sortedHoles,
      frontNineTotal: frontNine,
      backNineTotal: backNine,
    });
  }

  return sequences;
}

// ============================================================================
// BOUNCE-BACK CALCULATIONS
// ============================================================================

interface BounceBackStats {
  bounceBackRate: number;
  doubleBounceBackRate: number;
  collapseRate: number;
  avgScoreAfterBogey: number;
  avgScoreAfterDouble: number;
  bounceBackBirdieRate: number;
  totalBogeys: number;
  totalDoubles: number;
}

/**
 * Calculates bounce-back statistics
 */
function calculateBounceBackStats(sequences: RoundHoleSequence[]): BounceBackStats {
  let totalBogeys = 0;
  let totalDoubles = 0;
  let parOrBetterAfterBogey = 0;
  let parOrBetterAfterDouble = 0;
  let bogeyAfterBogey = 0;
  let birdieAfterBogey = 0;
  const scoresAfterBogey: number[] = [];
  const scoresAfterDouble: number[] = [];

  for (const sequence of sequences) {
    const holes = sequence.holes;

    for (let i = 0; i < holes.length - 1; i++) {
      const currentHole = holes[i];
      const nextHole = holes[i + 1];

      if (!currentHole || !nextHole) continue;

      const currentScore = getScoreToPar(currentHole);
      const nextScore = getScoreToPar(nextHole);

      // After bogey (exactly +1)
      if (currentScore === 1) {
        totalBogeys++;
        scoresAfterBogey.push(nextScore);

        if (nextScore <= 0) {
          parOrBetterAfterBogey++;
        }
        if (nextScore >= 1) {
          bogeyAfterBogey++;
        }
        if (nextScore <= -1) {
          birdieAfterBogey++;
        }
      }

      // After double bogey or worse (+2 or more)
      if (currentScore >= 2) {
        totalDoubles++;
        scoresAfterDouble.push(nextScore);

        if (nextScore <= 0) {
          parOrBetterAfterDouble++;
        }
      }
    }
  }

  return {
    bounceBackRate: totalBogeys > 0 ? parOrBetterAfterBogey / totalBogeys : 0,
    doubleBounceBackRate: totalDoubles > 0 ? parOrBetterAfterDouble / totalDoubles : 0,
    collapseRate: totalBogeys > 0 ? bogeyAfterBogey / totalBogeys : 0,
    avgScoreAfterBogey:
      scoresAfterBogey.length > 0
        ? scoresAfterBogey.reduce((a, b) => a + b, 0) / scoresAfterBogey.length
        : 0,
    avgScoreAfterDouble:
      scoresAfterDouble.length > 0
        ? scoresAfterDouble.reduce((a, b) => a + b, 0) / scoresAfterDouble.length
        : 0,
    bounceBackBirdieRate: totalBogeys > 0 ? birdieAfterBogey / totalBogeys : 0,
    totalBogeys,
    totalDoubles,
  };
}

// ============================================================================
// STREAK CALCULATIONS
// ============================================================================

interface StreakStats {
  longestBogeyFreeStreak: number;
  longestBogeyStreak: number;
  avgBogeyFreeStreak: number;
  avgBogeyStreak: number;
}

/**
 * Calculates streak statistics
 */
function calculateStreakStats(sequences: RoundHoleSequence[]): StreakStats {
  const bogeyFreeStreaks: number[] = [];
  const bogeyStreaks: number[] = [];

  for (const sequence of sequences) {
    let currentBogeyFreeStreak = 0;
    let currentBogeyStreak = 0;

    for (const hole of sequence.holes) {
      const score = getScoreToPar(hole);

      if (score >= 1) {
        // Bogey or worse
        if (currentBogeyFreeStreak > 0) {
          bogeyFreeStreaks.push(currentBogeyFreeStreak);
          currentBogeyFreeStreak = 0;
        }
        currentBogeyStreak++;
      } else {
        // Par or better
        if (currentBogeyStreak > 0) {
          bogeyStreaks.push(currentBogeyStreak);
          currentBogeyStreak = 0;
        }
        currentBogeyFreeStreak++;
      }
    }

    // Handle end-of-round streaks
    if (currentBogeyFreeStreak > 0) {
      bogeyFreeStreaks.push(currentBogeyFreeStreak);
    }
    if (currentBogeyStreak > 0) {
      bogeyStreaks.push(currentBogeyStreak);
    }
  }

  return {
    longestBogeyFreeStreak:
      bogeyFreeStreaks.length > 0 ? Math.max(...bogeyFreeStreaks) : 0,
    longestBogeyStreak:
      bogeyStreaks.length > 0 ? Math.max(...bogeyStreaks) : 0,
    avgBogeyFreeStreak:
      bogeyFreeStreaks.length > 0
        ? bogeyFreeStreaks.reduce((a, b) => a + b, 0) / bogeyFreeStreaks.length
        : 0,
    avgBogeyStreak:
      bogeyStreaks.length > 0
        ? bogeyStreaks.reduce((a, b) => a + b, 0) / bogeyStreaks.length
        : 0,
  };
}

// ============================================================================
// BACK NINE WHEN BEHIND
// ============================================================================

interface BackNineStats {
  avgBackNineWhenBehind: number;
  roundsBehindAtTurn: number;
}

/**
 * Calculates back nine performance when behind at the turn
 */
function calculateBackNineWhenBehind(sequences: RoundHoleSequence[]): BackNineStats {
  const backNineScoresWhenBehind: number[] = [];

  for (const sequence of sequences) {
    // Check if +3 or worse at the turn
    if (sequence.frontNineTotal >= 3) {
      backNineScoresWhenBehind.push(sequence.backNineTotal);
    }
  }

  return {
    avgBackNineWhenBehind:
      backNineScoresWhenBehind.length > 0
        ? backNineScoresWhenBehind.reduce((a, b) => a + b, 0) / backNineScoresWhenBehind.length
        : 0,
    roundsBehindAtTurn: backNineScoresWhenBehind.length,
  };
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

/**
 * Calculates trend by comparing recent vs historical performance
 */
function calculateTrend(
  sequences: RoundHoleSequence[]
): 'improving' | 'declining' | 'stable' {
  if (sequences.length < 6) {
    return 'stable';
  }

  // Split into recent (last 5 rounds) and historical
  const sortedSequences = [...sequences].sort(
    (a, b) => new Date(b.roundDate).getTime() - new Date(a.roundDate).getTime()
  );

  const recentSequences = sortedSequences.slice(0, 5);
  const historicalSequences = sortedSequences.slice(5);

  if (historicalSequences.length < 3) {
    return 'stable';
  }

  // Calculate bounce-back rate for each period
  const recentStats = calculateBounceBackStats(recentSequences);
  const historicalStats = calculateBounceBackStats(historicalSequences);

  // Need enough data for comparison
  if (recentStats.totalBogeys < 5 || historicalStats.totalBogeys < 5) {
    return 'stable';
  }

  const rateDifference = recentStats.bounceBackRate - historicalStats.bounceBackRate;

  // Significant improvement: >10% better
  if (rateDifference > 0.10) {
    return 'improving';
  }
  // Significant decline: >10% worse
  if (rateDifference < -0.10) {
    return 'declining';
  }

  return 'stable';
}

// ============================================================================
// COMPOSITE SCORE
// ============================================================================

/**
 * Calculates composite resilience score (0-100)
 */
function calculateCompositeScore(
  bounceBack: BounceBackStats,
  streaks: StreakStats,
  backNine: BackNineStats
): number {
  // Weight factors
  const weights = {
    bounceBackRate: 0.30,
    collapseRate: 0.25,
    avgStreaks: 0.20,
    backNineResilience: 0.15,
    doubleBounceBack: 0.10,
  };

  // Score components (0-100 each)

  // Bounce-back rate: 50% = 50 points, 70% = 90 points
  const bounceBackScore = Math.min(100, bounceBack.bounceBackRate * 150);

  // Collapse rate (inverted): 50% = 25, 25% = 75
  const collapseScore = Math.max(0, 100 - bounceBack.collapseRate * 150);

  // Avg bogey-free streak: 3 holes = 50, 5 holes = 80, 7+ = 100
  const streakScore = Math.min(100, (streaks.avgBogeyFreeStreak / 7) * 100);

  // Back nine when behind: +1 = 80, +2 = 60, +3 = 40, +4 = 20
  const backNineScore =
    backNine.roundsBehindAtTurn > 0
      ? Math.max(0, 100 - backNine.avgBackNineWhenBehind * 20)
      : 70; // Default if no data

  // Double bounce-back: similar to regular
  const doubleBounceScore = Math.min(100, bounceBack.doubleBounceBackRate * 200);

  // Weighted sum
  const compositeScore =
    bounceBackScore * weights.bounceBackRate +
    collapseScore * weights.collapseRate +
    streakScore * weights.avgStreaks +
    backNineScore * weights.backNineResilience +
    doubleBounceScore * weights.doubleBounceBack;

  return Math.round(Math.max(0, Math.min(100, compositeScore)));
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

/**
 * Generates actionable insights based on metrics
 */
function generateInsights(
  metrics: ResilienceMetrics,
  benchmarks: ResilienceBenchmarks,
  totalBogeys: number
): ResilienceInsight[] {
  const insights: ResilienceInsight[] = [];

  // Only generate insights if we have enough data
  if (totalBogeys < MIN_ADVERSE_EVENTS) {
    return insights;
  }

  // 1. Bounce-back rate insight
  const bounceBackGap = metrics.bounceBackRate - benchmarks.collegeBounceBackRate;
  if (Math.abs(bounceBackGap) > 0.05) {
    insights.push({
      id: 'resilience-bounce-back',
      category: 'bounce_back',
      headline: bounceBackGap >= 0
        ? 'Strong Bounce-Back Ability'
        : 'Bounce-Back Rate Below Benchmark',
      body: bounceBackGap >= 0
        ? `After a bogey, you make par or better ${Math.round(metrics.bounceBackRate * 100)}% of the time ` +
          `(college avg: ${Math.round(benchmarks.collegeBounceBackRate * 100)}%). This mental resilience is a competitive advantage.`
        : `After a bogey, you make par or better ${Math.round(metrics.bounceBackRate * 100)}% of the time ` +
          `(college avg: ${Math.round(benchmarks.collegeBounceBackRate * 100)}%). ` +
          `Focus on mental reset routines between holes.`,
      recommendation: bounceBackGap >= 0
        ? 'Maintain your pre-shot routine consistency. Document what mental strategies work for you.'
        : 'Develop a "reset routine" after bogeys: take 3 deep breaths, visualize a successful shot, commit fully to your next shot.',
      priority: bounceBackGap >= 0 ? 'low' : bounceBackGap < -0.15 ? 'high' : 'medium',
      metricValue: metrics.bounceBackRate,
      benchmarkValue: benchmarks.collegeBounceBackRate,
      gap: bounceBackGap,
      trend: metrics.trend,
    });
  }

  // 2. Collapse rate insight
  const collapseGap = metrics.collapseRate - benchmarks.collegeCollapseRate;
  if (collapseGap > 0.05) {
    insights.push({
      id: 'resilience-collapse',
      category: 'collapse',
      headline: 'Bogey Chains Costing Strokes',
      body: `After a bogey, you make another bogey ${Math.round(metrics.collapseRate * 100)}% of the time ` +
        `(benchmark: ${Math.round(benchmarks.collegeCollapseRate * 100)}%). ` +
        `This pattern suggests a mental reset is needed after setbacks.`,
      recommendation: 'When you make a bogey, consciously slow down your pace. ' +
        'Take extra time on club selection and commit fully to your target. ' +
        'Consider conservative course management on the following hole.',
      priority: collapseGap > 0.15 ? 'critical' : 'high',
      metricValue: metrics.collapseRate,
      benchmarkValue: benchmarks.collegeCollapseRate,
      gap: collapseGap,
    });
  }

  // 3. Back 9 when behind insight
  if (metrics.avgBackNineWhenBehind > 2) {
    insights.push({
      id: 'resilience-back-nine',
      category: 'back_nine',
      headline: 'Back 9 Struggles When Behind',
      body: `When +3 or worse at the turn, your back 9 averages +${metrics.avgBackNineWhenBehind.toFixed(1)}. ` +
        `Top players average +1.5 in this situation. Work on staying mentally in the round.`,
      recommendation: 'When behind at the turn, focus on one shot at a time. ' +
        'Set a micro-goal: "I will commit 100% to each shot for the next 3 holes." ' +
        'Avoid scoreboard watching and outcome thinking.',
      priority: metrics.avgBackNineWhenBehind > 3 ? 'critical' : 'high',
      metricValue: metrics.avgBackNineWhenBehind,
      benchmarkValue: 1.5,
      gap: metrics.avgBackNineWhenBehind - 1.5,
    });
  }

  // 4. Bounce-back birdie rate
  if (metrics.bounceBackBirdieRate > 0) {
    const trendText = metrics.trend === 'improving'
      ? ' (improving from recent rounds)'
      : metrics.trend === 'declining'
        ? ' (declining recently)'
        : '';

    insights.push({
      id: 'resilience-birdie-bounce',
      category: 'bounce_back',
      headline: 'Bounce-Back Birdie Rate',
      body: `After bogeys, you make birdie ${Math.round(metrics.bounceBackBirdieRate * 100)}% of the time${trendText}. ` +
        `This aggressive response can help recover strokes but requires good course management.`,
      recommendation: metrics.bounceBackBirdieRate > 0.08
        ? 'Your aggressive bounce-back style is working. Continue to attack scorable holes after bogeys.'
        : 'Consider being slightly more aggressive after bogeys when the hole setup allows it.',
      priority: 'low',
      metricValue: metrics.bounceBackBirdieRate,
      benchmarkValue: 0.10,
      gap: metrics.bounceBackBirdieRate - 0.10,
      trend: metrics.trend,
    });
  }

  // 5. Streak comparison insight
  if (metrics.longestBogeyStreak >= 3 && metrics.avgBogeyStreak > 1.5) {
    insights.push({
      id: 'resilience-streaks',
      category: 'streaks',
      headline: 'Bogey Streaks Hurting Scores',
      body: `Your longest bogey streak is ${metrics.longestBogeyStreak} holes with an average of ${metrics.avgBogeyStreak.toFixed(1)}. ` +
        `Meanwhile, your best bogey-free streak is ${metrics.longestBogeyFreeStreak} holes. ` +
        `Reducing bogey streaks will significantly lower your scores.`,
      recommendation: 'After two consecutive bogeys, take a timeout: ' +
        'step away from the bag, take deep breaths, and reset your focus. ' +
        'Consider a conservative play to stop the bleeding.',
      priority: metrics.longestBogeyStreak >= 4 ? 'high' : 'medium',
      metricValue: metrics.avgBogeyStreak,
      benchmarkValue: 1.3,
      gap: metrics.avgBogeyStreak - 1.3,
    });
  }

  // 6. Resilience score summary
  insights.push({
    id: 'resilience-score',
    category: 'momentum',
    headline: `Resilience Score: ${metrics.resilienceScore}/100`,
    body: metrics.resilienceScore >= 70
      ? `Your resilience score of ${metrics.resilienceScore} is above average. ` +
        `You handle adversity well and recover effectively from setbacks.`
      : metrics.resilienceScore >= 50
        ? `Your resilience score of ${metrics.resilienceScore} is near average. ` +
          `There's room to improve how you respond to bogeys and momentum shifts.`
        : `Your resilience score of ${metrics.resilienceScore} indicates significant room for improvement. ` +
          `Mental game work on handling adversity will yield major score improvements.`,
    recommendation: metrics.resilienceScore >= 70
      ? 'Continue your mental routines. Consider mentoring teammates on resilience strategies.'
      : 'Work with a sports psychologist or use mental game apps to build resilience. ' +
        'Practice pressure situations in training rounds.',
    priority: metrics.resilienceScore < 40 ? 'critical' :
             metrics.resilienceScore < 55 ? 'high' :
             metrics.resilienceScore < 70 ? 'medium' : 'low',
    metricValue: metrics.resilienceScore,
    benchmarkValue: 60,
    gap: metrics.resilienceScore - 60,
    trend: metrics.trend,
  });

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets score relative to par for a hole
 */
function getScoreToPar(hole: HoleData): number {
  if (hole.score === null) return 0;
  return hole.score - hole.par;
}

/**
 * Determines data quality based on sample sizes
 */
function determineDataQuality(
  roundCount: number,
  adverseEvents: number
): 'high' | 'medium' | 'low' | 'insufficient' {
  if (roundCount < MIN_ROUNDS_FOR_ANALYSIS) return 'insufficient';
  if (roundCount >= 20 && adverseEvents >= 30) return 'high';
  if (roundCount >= 10 && adverseEvents >= 15) return 'medium';
  return 'low';
}

/**
 * Creates a result for insufficient data
 */
function createInsufficientDataResult(
  playerId: string,
  playerName: string | undefined,
  roundCount: number
): ResilienceAnalysis {
  return {
    playerId,
    playerName,
    analyzedAt: new Date().toISOString(),
    metrics: {
      bounceBackRate: 0,
      doubleBounceBackRate: 0,
      collapseRate: 0,
      avgScoreAfterBogey: 0,
      avgScoreAfterDouble: 0,
      avgBackNineWhenBehind: 0,
      bounceBackBirdieRate: 0,
      longestBogeyFreeStreak: 0,
      longestBogeyStreak: 0,
      avgBogeyFreeStreak: 0,
      avgBogeyStreak: 0,
      resilienceScore: 0,
      trend: 'stable',
    },
    benchmarks: BENCHMARKS,
    insights: [],
    primaryInsight: null,
    roundsAnalyzed: roundCount,
    adverseEventsAnalyzed: 0,
    dataQuality: 'insufficient',
  };
}

// ============================================================================
// TEAM ANALYSIS (BONUS)
// ============================================================================

/**
 * Analyzes resilience for an entire team
 * Useful for identifying players who need mental game support
 */
export async function analyzeTeamResilience(
  teamId: string
): Promise<{
  teamAverage: Partial<ResilienceMetrics>;
  playerAnalyses: ResilienceAnalysis[];
  playersNeedingSupport: Array<{ playerId: string; playerName: string; resilienceScore: number }>;
}> {
  const supabase = await createClient();

  // Get team players
  const { data: players } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (!players || players.length === 0) {
    return {
      teamAverage: {},
      playerAnalyses: [],
      playersNeedingSupport: [],
    };
  }

  // Analyze each player
  const analyses: ResilienceAnalysis[] = [];
  for (const player of players) {
    const analysis = await analyzeResilience(player.id);
    if (analysis && analysis.dataQuality !== 'insufficient') {
      analyses.push(analysis);
    }
  }

  if (analyses.length === 0) {
    return {
      teamAverage: {},
      playerAnalyses: [],
      playersNeedingSupport: [],
    };
  }

  // Calculate team averages
  const teamAverage: Partial<ResilienceMetrics> = {
    bounceBackRate:
      analyses.reduce((sum, a) => sum + a.metrics.bounceBackRate, 0) / analyses.length,
    collapseRate:
      analyses.reduce((sum, a) => sum + a.metrics.collapseRate, 0) / analyses.length,
    resilienceScore:
      analyses.reduce((sum, a) => sum + a.metrics.resilienceScore, 0) / analyses.length,
  };

  // Identify players needing support (below average resilience)
  const avgScore = teamAverage.resilienceScore ?? 50;
  const playersNeedingSupport = analyses
    .filter((a) => a.metrics.resilienceScore < avgScore - 10)
    .map((a) => ({
      playerId: a.playerId,
      playerName: a.playerName ?? 'Unknown',
      resilienceScore: a.metrics.resilienceScore,
    }))
    .sort((a, b) => a.resilienceScore - b.resilienceScore);

  return {
    teamAverage,
    playerAnalyses: analyses,
    playersNeedingSupport,
  };
}
