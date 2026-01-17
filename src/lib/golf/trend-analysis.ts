/**
 * Trend Analysis Engine for Golf Stats
 *
 * Provides statistical analysis of performance trends over time:
 * - Linear regression for trend direction and velocity
 * - Moving averages for smoothing
 * - Prediction with confidence intervals
 * - Multi-metric trend comparison
 */

import type {
  GolfRound as BaseGolfRound,
  PlayerStats,
  TrendDirection as GolfTrendDirection,
} from '@/lib/types/golf';

// ============================================
// LOCAL TYPE DEFINITIONS
// These extend or adapt types from @/lib/types/golf
// ============================================

/**
 * Extended GolfRound type with additional fields used by this module.
 * The base GolfRound from the database has:
 * - total_fairways, total_fairways_hit (instead of fairways_possible, fairways_hit)
 * - total_gir (instead of greens_in_regulation)
 * This type maps between what we need and what exists.
 */
interface GolfRound extends BaseGolfRound {
  // These are aliases computed from base fields
  fairways_possible?: number;
  fairways_hit?: number;
  greens_in_regulation?: number;
  // These fields may not exist in database but are used for SG calculations
  up_and_down_attempts?: number;
  up_and_downs?: number;
  sand_save_attempts?: number;
  sand_saves?: number;
  sg_total?: number | null;
  sg_off_tee?: number | null;
  sg_approach?: number | null;
  sg_around_green?: number | null;
  sg_putting?: number | null;
  // For strokes-gained calculation from shot data
  holes?: Array<{
    id: string;
    par: number;
    score: number;
    putts: number;
    fairway_hit?: boolean | null;
    green_in_regulation?: boolean;
    up_and_down?: boolean | null;
    sand_save?: boolean | null;
    shots?: unknown[];
  }>;
}

/**
 * Extended trend direction compatible with this module
 */
type TrendDirection = GolfTrendDirection;

/**
 * A data point for trend analysis
 */
interface TrendPoint {
  date: string;
  value: number;
  round_id?: string;
  round_type?: string | null;
  label?: string;
}

/**
 * Result of analyzing a trend for a metric
 */
interface TrendAnalysis {
  metric: string;
  data: TrendPoint[];
  current_value: number;
  trend: TrendDirection;
  velocity: number;
  prediction: number;
  confidence: number;
  moving_average: number;
  best_value: number;
  worst_value: number;
  std_deviation: number;
}

/**
 * Collection of trend analyses for multiple metrics
 */
interface MultiMetricTrend {
  scoring_avg: TrendAnalysis;
  putts: TrendAnalysis;
  fairway_pct: TrendAnalysis;
  gir_pct: TrendAnalysis;
  sg_total: TrendAnalysis;
  sg_off_tee: TrendAnalysis;
  sg_approach: TrendAnalysis;
  sg_around_green: TrendAnalysis;
  sg_putting: TrendAnalysis;
  [key: string]: TrendAnalysis | undefined;
}

/**
 * Comparison baseline type
 */
type ComparisonBaseline = 'personal_best' | 'team_avg' | 'scratch' | 'tour_avg';

/**
 * Single stat comparison result
 */
interface StatComparison {
  metric: string;
  player_value: number;
  comparison_value: number;
  difference: number;
  baseline: ComparisonBaseline;
}

/**
 * Full comparison result
 */
interface ComparisonResult {
  player_id: string;
  player_name: string;
  baseline: ComparisonBaseline;
  baseline_label: string;
  comparisons: StatComparison[];
  strengths: string[];
  weaknesses: string[];
}

/**
 * Extended PlayerStats with sand_save_percentage
 */
interface ExtendedPlayerStats extends PlayerStats {
  sand_save_percentage: number;
}
import {
  calculateRoundStrokesGained,
  identifyStrengthsWeaknesses,
  type SGRound,
  type SGHole,
} from './strokes-gained';

/**
 * Convert local GolfRound to SGRound for strokes-gained calculations
 */
function toSGRound(round: GolfRound): SGRound {
  const holes: SGHole[] = (round.holes ?? []).map(hole => ({
    id: hole.id,
    par: hole.par,
    score: hole.score,
    putts: hole.putts,
    fairway_hit: hole.fairway_hit ?? null,
    green_in_regulation: hole.green_in_regulation ?? null,
    up_and_down: hole.up_and_down ?? null,
    sand_save: hole.sand_save ?? null,
    shots: undefined, // Shots would need separate conversion if available
  }));
  return { holes };
}

// ============================================
// STATISTICAL HELPERS
// ============================================

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Calculate linear regression (y = mx + b)
 * Returns slope (m) and intercept (b)
 */
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };
  }

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  // sumYY not used - R² calculated via residual method below

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared (coefficient of determination)
  const yMean = sumY / n;
  const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0);
  const ssResidual = points.reduce((sum, p) => {
    const predicted = slope * p.x + intercept;
    return sum + Math.pow(p.y - predicted, 2);
  }, 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return {
    slope: isNaN(slope) ? 0 : slope,
    intercept: isNaN(intercept) ? 0 : intercept,
    r2: isNaN(r2) ? 0 : Math.max(0, Math.min(1, r2)),
  };
}

/**
 * Calculate moving average
 */
function movingAverage(values: number[], window: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return mean(slice);
}

/**
 * Determine trend direction from slope
 */
function getTrendDirection(slope: number, values: number[]): TrendDirection {
  const stdDev = standardDeviation(values);
  const threshold = stdDev * 0.1; // Significant if slope exceeds 10% of std dev

  if (Math.abs(slope) < threshold) return 'stable';
  return slope < 0 ? 'improving' : 'declining'; // For golf, lower is better (except SG)
}

/**
 * Determine trend direction for strokes gained (higher is better)
 */
function getStrokesGainedTrendDirection(slope: number, values: number[]): TrendDirection {
  const stdDev = standardDeviation(values);
  const threshold = stdDev * 0.1;

  if (Math.abs(slope) < threshold) return 'stable';
  return slope > 0 ? 'improving' : 'declining'; // For SG, higher is better
}

// ============================================
// TREND ANALYSIS FUNCTIONS
// ============================================

/**
 * Analyze trend for a specific metric
 */
export function analyzeTrend(
  data: TrendPoint[],
  metric: string,
  isHigherBetter: boolean = false
): TrendAnalysis {
  if (data.length === 0) {
    return {
      metric,
      data: [],
      current_value: 0,
      trend: 'stable',
      velocity: 0,
      prediction: 0,
      confidence: 0,
      moving_average: 0,
      best_value: 0,
      worst_value: 0,
      std_deviation: 0,
    };
  }

  // Sort by date
  const sortedData = [...data].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const values = sortedData.map(d => d.value);
  const points = sortedData.map((d, i) => ({ x: i, y: d.value }));

  // Calculate regression
  const { slope, intercept, r2 } = linearRegression(points);

  // Calculate prediction (next round)
  const nextX = points.length;
  const prediction = slope * nextX + intercept;

  // Determine trend direction
  const trend = isHigherBetter
    ? getStrokesGainedTrendDirection(slope, values)
    : getTrendDirection(slope, values);

  // Calculate other stats
  const best = isHigherBetter ? Math.max(...values) : Math.min(...values);
  const worst = isHigherBetter ? Math.min(...values) : Math.max(...values);

  return {
    metric,
    data: sortedData,
    current_value: values[values.length - 1] ?? 0,
    trend,
    velocity: Math.round(slope * 1000) / 1000, // Rate of change per round
    prediction: Math.round(prediction * 100) / 100,
    confidence: Math.round(r2 * 100) / 100,
    moving_average: Math.round(movingAverage(values, 5) * 100) / 100,
    best_value: best,
    worst_value: worst,
    std_deviation: Math.round(standardDeviation(values) * 100) / 100,
  };
}

/**
 * Extract trend points for a specific metric from rounds
 * Note: Uses actual database column names (total_fairways, total_fairways_hit, total_gir)
 */
export function extractTrendPoints(
  rounds: GolfRound[],
  metric: string
): TrendPoint[] {
  const sortedRounds = [...rounds].sort(
    (a, b) => new Date(a.round_date).getTime() - new Date(b.round_date).getTime()
  );

  return sortedRounds.map(round => {
    let value: number;
    // Use actual database column names with null coalescing
    const totalScore = round.total_score ?? 0;
    const scoreToPar = round.score_to_par ?? 0;
    const totalPutts = round.total_putts ?? 0;
    const totalFairways = round.total_fairways ?? 0;
    const totalFairwaysHit = round.total_fairways_hit ?? 0;
    const totalGir = round.total_gir ?? 0;
    const totalGirPossible = round.total_gir_possible ?? 18;

    switch (metric) {
      case 'scoring_avg':
      case 'total_score':
        value = totalScore;
        break;
      case 'score_to_par':
        value = scoreToPar;
        break;
      case 'putts':
        value = totalPutts;
        break;
      case 'fairway_pct':
        // Use actual DB columns: total_fairways (possible), total_fairways_hit
        value = totalFairways > 0
          ? (totalFairwaysHit / totalFairways) * 100
          : 0;
        break;
      case 'gir_pct':
        // Use actual DB column: total_gir
        value = totalGirPossible > 0
          ? (totalGir / totalGirPossible) * 100
          : 0;
        break;
      case 'up_and_down_pct':
        // Extended field - use optional chaining
        value = (round.up_and_down_attempts ?? 0) > 0
          ? ((round.up_and_downs ?? 0) / (round.up_and_down_attempts ?? 1)) * 100
          : 0;
        break;
      case 'sand_save_pct':
        // Extended field - use optional chaining
        value = (round.sand_save_attempts ?? 0) > 0
          ? ((round.sand_saves ?? 0) / (round.sand_save_attempts ?? 1)) * 100
          : 0;
        break;
      case 'sg_total':
        value = round.sg_total ?? calculateRoundStrokesGained(toSGRound(round)).sg_total;
        break;
      case 'sg_off_tee':
        value = round.sg_off_tee ?? calculateRoundStrokesGained(toSGRound(round)).sg_off_tee;
        break;
      case 'sg_approach':
        value = round.sg_approach ?? calculateRoundStrokesGained(toSGRound(round)).sg_approach;
        break;
      case 'sg_around_green':
        value = round.sg_around_green ?? calculateRoundStrokesGained(toSGRound(round)).sg_around_green;
        break;
      case 'sg_putting':
        value = round.sg_putting ?? calculateRoundStrokesGained(toSGRound(round)).sg_putting;
        break;
      default:
        value = 0;
    }

    return {
      date: round.round_date,
      value,
      round_id: round.id,
      round_type: round.round_type,
    };
  });
}

/**
 * Analyze all key metrics for a player
 */
export function analyzeMultiMetricTrends(rounds: GolfRound[]): MultiMetricTrend {
  const metrics = [
    { key: 'scoring_avg', higherBetter: false },
    { key: 'putts', higherBetter: false },
    { key: 'fairway_pct', higherBetter: true },
    { key: 'gir_pct', higherBetter: true },
    { key: 'sg_total', higherBetter: true },
    { key: 'sg_off_tee', higherBetter: true },
    { key: 'sg_approach', higherBetter: true },
    { key: 'sg_around_green', higherBetter: true },
    { key: 'sg_putting', higherBetter: true },
  ];

  const result: Record<string, TrendAnalysis> = {};

  for (const { key, higherBetter } of metrics) {
    const points = extractTrendPoints(rounds, key);
    result[key] = analyzeTrend(points, key, higherBetter);
  }

  return result as MultiMetricTrend;
}

// ============================================
// COMPARISON FUNCTIONS
// ============================================

/**
 * Baseline data for different comparison targets
 */
const BASELINES: Record<ComparisonBaseline, Record<string, number>> = {
  scratch: {
    scoring_avg: 72,
    putts: 32,
    fairway_pct: 65,
    gir_pct: 66,
    up_and_down_pct: 50,
    sand_save_pct: 50,
    sg_total: 0,
    sg_off_tee: 0,
    sg_approach: 0,
    sg_around_green: 0,
    sg_putting: 0,
  },
  tour_avg: {
    scoring_avg: 70.5,
    putts: 28.5,
    fairway_pct: 62,
    gir_pct: 67,
    up_and_down_pct: 60,
    sand_save_pct: 50,
    sg_total: 1.5,
    sg_off_tee: 0.4,
    sg_approach: 0.5,
    sg_around_green: 0.3,
    sg_putting: 0.3,
  },
  personal_best: {
    // This will be populated dynamically
    scoring_avg: 72,
    putts: 28,
    fairway_pct: 80,
    gir_pct: 80,
    up_and_down_pct: 70,
    sand_save_pct: 60,
    sg_total: 2,
    sg_off_tee: 0.5,
    sg_approach: 0.6,
    sg_around_green: 0.4,
    sg_putting: 0.5,
  },
  team_avg: {
    // This will be populated dynamically
    scoring_avg: 78,
    putts: 32,
    fairway_pct: 55,
    gir_pct: 50,
    up_and_down_pct: 40,
    sand_save_pct: 35,
    sg_total: -1,
    sg_off_tee: -0.3,
    sg_approach: -0.4,
    sg_around_green: -0.2,
    sg_putting: -0.1,
  },
};

/**
 * Get baseline label for display
 */
function getBaselineLabel(baseline: ComparisonBaseline): string {
  const labels: Record<ComparisonBaseline, string> = {
    personal_best: 'Personal Best',
    team_avg: 'Team Average',
    scratch: 'Scratch Golfer',
    tour_avg: 'PGA Tour Average',
  };
  return labels[baseline];
}

/**
 * Compare player stats to a baseline
 */
export function compareToBaseline(
  stats: ExtendedPlayerStats,
  baseline: ComparisonBaseline,
  customBaseline?: Record<string, number>
): ComparisonResult {
  const baselineData = customBaseline ?? BASELINES[baseline] ?? BASELINES.scratch;

  const comparisons: StatComparison[] = [];

  // Scoring metrics (lower is better)
  comparisons.push({
    metric: 'Scoring Average',
    player_value: stats.scoring_avg,
    comparison_value: baselineData.scoring_avg ?? 72,
    difference: (baselineData.scoring_avg ?? 72) - stats.scoring_avg, // Positive = player is better
    baseline,
  });

  comparisons.push({
    metric: 'Putts per Round',
    player_value: stats.avg_putts,
    comparison_value: baselineData.putts ?? 32,
    difference: (baselineData.putts ?? 32) - stats.avg_putts,
    baseline,
  });

  // Percentage metrics (higher is better)
  comparisons.push({
    metric: 'Fairway %',
    player_value: stats.fairway_percentage,
    comparison_value: baselineData.fairway_pct ?? 50,
    difference: stats.fairway_percentage - (baselineData.fairway_pct ?? 50),
    baseline,
  });

  comparisons.push({
    metric: 'GIR %',
    player_value: stats.gir_percentage,
    comparison_value: baselineData.gir_pct ?? 50,
    difference: stats.gir_percentage - (baselineData.gir_pct ?? 50),
    baseline,
  });

  comparisons.push({
    metric: 'Up & Down %',
    player_value: stats.up_and_down_percentage,
    comparison_value: baselineData.up_and_down_pct ?? 40,
    difference: stats.up_and_down_percentage - (baselineData.up_and_down_pct ?? 40),
    baseline,
  });

  comparisons.push({
    metric: 'Sand Save %',
    player_value: stats.sand_save_percentage,
    comparison_value: baselineData.sand_save_pct ?? 40,
    difference: stats.sand_save_percentage - (baselineData.sand_save_pct ?? 40),
    baseline,
  });

  // Strokes Gained metrics (higher is better)
  comparisons.push({
    metric: 'SG: Total',
    player_value: stats.strokes_gained.sg_total,
    comparison_value: baselineData.sg_total ?? 0,
    difference: stats.strokes_gained.sg_total - (baselineData.sg_total ?? 0),
    baseline,
  });

  comparisons.push({
    metric: 'SG: Off the Tee',
    player_value: stats.strokes_gained.sg_off_tee,
    comparison_value: baselineData.sg_off_tee ?? 0,
    difference: stats.strokes_gained.sg_off_tee - (baselineData.sg_off_tee ?? 0),
    baseline,
  });

  comparisons.push({
    metric: 'SG: Approach',
    player_value: stats.strokes_gained.sg_approach,
    comparison_value: baselineData.sg_approach ?? 0,
    difference: stats.strokes_gained.sg_approach - (baselineData.sg_approach ?? 0),
    baseline,
  });

  comparisons.push({
    metric: 'SG: Around the Green',
    player_value: stats.strokes_gained.sg_around_green,
    comparison_value: baselineData.sg_around_green ?? 0,
    difference: stats.strokes_gained.sg_around_green - (baselineData.sg_around_green ?? 0),
    baseline,
  });

  comparisons.push({
    metric: 'SG: Putting',
    player_value: stats.strokes_gained.sg_putting,
    comparison_value: baselineData.sg_putting ?? 0,
    difference: stats.strokes_gained.sg_putting - (baselineData.sg_putting ?? 0),
    baseline,
  });

  // Identify strengths and weaknesses
  const { strengths, weaknesses } = identifyStrengthsWeaknesses(stats.strokes_gained);

  return {
    player_id: stats.player_id ?? '',
    player_name: '', // Will be filled by caller
    baseline,
    baseline_label: getBaselineLabel(baseline),
    comparisons,
    strengths,
    weaknesses,
  };
}

/**
 * Calculate personal best baseline from rounds
 * Note: Uses actual database column names (total_fairways, total_fairways_hit, total_gir)
 */
export function calculatePersonalBestBaseline(rounds: GolfRound[]): Record<string, number> {
  if (rounds.length === 0) {
    return BASELINES.scratch;
  }

  const scores = rounds.map(r => r.total_score ?? 0);
  const putts = rounds.map(r => r.total_putts ?? 0);
  const fairways = rounds.map(r => {
    const totalFairways = r.total_fairways ?? 0;
    const totalFairwaysHit = r.total_fairways_hit ?? 0;
    return totalFairways > 0 ? (totalFairwaysHit / totalFairways) * 100 : 0;
  });
  const girs = rounds.map(r => {
    const totalGir = r.total_gir ?? 0;
    const totalGirPossible = r.total_gir_possible ?? 18;
    return totalGirPossible > 0 ? (totalGir / totalGirPossible) * 100 : 0;
  });
  const upAndDowns = rounds.map(r => {
    const attempts = r.up_and_down_attempts ?? 0;
    const converted = r.up_and_downs ?? 0;
    return attempts > 0 ? (converted / attempts) * 100 : 0;
  });
  const sandSaves = rounds.map(r => {
    const attempts = r.sand_save_attempts ?? 0;
    const saved = r.sand_saves ?? 0;
    return attempts > 0 ? (saved / attempts) * 100 : 0;
  });

  const sgTotals: number[] = [];
  const sgOffTee: number[] = [];
  const sgApproach: number[] = [];
  const sgAroundGreen: number[] = [];
  const sgPutting: number[] = [];

  for (const round of rounds) {
    const sg = calculateRoundStrokesGained(toSGRound(round));
    sgTotals.push(sg.sg_total);
    sgOffTee.push(sg.sg_off_tee);
    sgApproach.push(sg.sg_approach);
    sgAroundGreen.push(sg.sg_around_green);
    sgPutting.push(sg.sg_putting);
  }

  return {
    scoring_avg: Math.min(...scores),
    putts: Math.min(...putts),
    fairway_pct: Math.max(...fairways),
    gir_pct: Math.max(...girs),
    up_and_down_pct: Math.max(...upAndDowns),
    sand_save_pct: Math.max(...sandSaves),
    sg_total: Math.max(...sgTotals),
    sg_off_tee: Math.max(...sgOffTee),
    sg_approach: Math.max(...sgApproach),
    sg_around_green: Math.max(...sgAroundGreen),
    sg_putting: Math.max(...sgPutting),
  };
}

/**
 * Calculate team average baseline from multiple players
 */
export function calculateTeamAverageBaseline(
  allPlayerStats: ExtendedPlayerStats[]
): Record<string, number> {
  if (allPlayerStats.length === 0) {
    return BASELINES.team_avg;
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    scoring_avg: avg(allPlayerStats.map(p => p.scoring_avg)),
    putts: avg(allPlayerStats.map(p => p.avg_putts)),
    fairway_pct: avg(allPlayerStats.map(p => p.fairway_percentage)),
    gir_pct: avg(allPlayerStats.map(p => p.gir_percentage)),
    up_and_down_pct: avg(allPlayerStats.map(p => p.up_and_down_percentage)),
    sand_save_pct: avg(allPlayerStats.map(p => p.sand_save_percentage ?? 0)),
    sg_total: avg(allPlayerStats.map(p => p.strokes_gained.sg_total)),
    sg_off_tee: avg(allPlayerStats.map(p => p.strokes_gained.sg_off_tee)),
    sg_approach: avg(allPlayerStats.map(p => p.strokes_gained.sg_approach)),
    sg_around_green: avg(allPlayerStats.map(p => p.strokes_gained.sg_around_green)),
    sg_putting: avg(allPlayerStats.map(p => p.strokes_gained.sg_putting)),
  };
}

// ============================================
// PREDICTION & INSIGHTS
// ============================================

/**
 * Generate insights based on trend analysis
 */
export function generateTrendInsights(trends: MultiMetricTrend): string[] {
  const insights: string[] = [];

  // Scoring trend
  if (trends.scoring_avg.trend === 'improving') {
    insights.push(
      `Scoring is improving by ${Math.abs(trends.scoring_avg.velocity).toFixed(2)} strokes per round`
    );
  } else if (trends.scoring_avg.trend === 'declining') {
    insights.push(
      `Scoring has declined by ${Math.abs(trends.scoring_avg.velocity).toFixed(2)} strokes per round - review recent rounds`
    );
  }

  // Strokes Gained insights
  if (trends.sg_total) {
    const sgCategories = [
      { key: 'sg_off_tee', label: 'driving' },
      { key: 'sg_approach', label: 'approach shots' },
      { key: 'sg_around_green', label: 'short game' },
      { key: 'sg_putting', label: 'putting' },
    ] as const;

    // Find biggest improvement
    const improving = sgCategories
      .filter(c => trends[c.key]?.trend === 'improving')
      .sort((a, b) => (trends[b.key]?.velocity || 0) - (trends[a.key]?.velocity || 0));

    const topImproving = improving[0];
    if (topImproving) {
      insights.push(`Strongest improvement area: ${topImproving.label}`);
    }

    // Find biggest decline
    const declining = sgCategories
      .filter(c => trends[c.key]?.trend === 'declining')
      .sort((a, b) => (trends[a.key]?.velocity || 0) - (trends[b.key]?.velocity || 0));

    const topDeclining = declining[0];
    if (topDeclining) {
      insights.push(`Area needing attention: ${topDeclining.label}`);
    }
  }

  // Putting insights
  if (trends.putts.trend === 'improving') {
    insights.push('Putting has improved - fewer putts per round');
  } else if (trends.putts.trend === 'declining') {
    insights.push('Putting needs work - more putts per round recently');
  }

  // GIR insights
  if (trends.gir_pct.trend === 'improving' && trends.gir_pct.velocity > 1) {
    insights.push('Greens in regulation trending up - approach game is solid');
  }

  // Consistency insight
  if (trends.scoring_avg.std_deviation < 3) {
    insights.push('Scoring is very consistent (low variance)');
  } else if (trends.scoring_avg.std_deviation > 6) {
    insights.push('Scoring varies significantly between rounds');
  }

  return insights;
}

/**
 * Predict next round score with confidence interval
 */
export function predictNextRound(trends: MultiMetricTrend): {
  predicted_score: number;
  confidence: number;
  range_low: number;
  range_high: number;
} {
  const scoringTrend = trends.scoring_avg;

  return {
    predicted_score: Math.round(scoringTrend.prediction),
    confidence: scoringTrend.confidence,
    range_low: Math.round(scoringTrend.prediction - scoringTrend.std_deviation),
    range_high: Math.round(scoringTrend.prediction + scoringTrend.std_deviation),
  };
}

// ============================================
// FORMATTING HELPERS
// ============================================

/**
 * Format trend direction with icon
 */
export function formatTrendDirection(
  trend: TrendDirection,
  isHigherBetter: boolean = false
): { icon: string; color: string; label: string } {
  if (trend === 'stable') {
    return { icon: '→', color: 'text-gray-500', label: 'Stable' };
  }

  const isPositive = isHigherBetter ? trend === 'improving' : trend === 'improving';

  return {
    icon: trend === 'improving' ? '↑' : '↓',
    color: isPositive ? 'text-green-500' : 'text-red-500',
    label: trend === 'improving' ? 'Improving' : 'Declining',
  };
}

/**
 * Format velocity for display
 */
export function formatVelocity(velocity: number, metric: string): string {
  const sign = velocity > 0 ? '+' : '';
  const formatted = `${sign}${velocity.toFixed(2)}`;

  switch (metric) {
    case 'scoring_avg':
    case 'putts':
      return `${formatted}/round`;
    case 'fairway_pct':
    case 'gir_pct':
    case 'up_and_down_pct':
    case 'sand_save_pct':
      return `${formatted}%/round`;
    case 'sg_total':
    case 'sg_off_tee':
    case 'sg_approach':
    case 'sg_around_green':
    case 'sg_putting':
      return `${formatted} SG/round`;
    default:
      return formatted;
  }
}
