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
  GolfRound,
  TrendPoint,
  TrendAnalysis,
  TrendDirection,
  MultiMetricTrend,
  StrokesGainedResult,
  ComparisonBaseline,
  ComparisonResult,
  StatComparison,
  PlayerStats,
} from '@/lib/types';
import {
  calculateRoundStrokesGained,
  identifyStrengthsWeaknesses,
} from './strokes-gained';

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
  const sumYY = points.reduce((sum, p) => sum + p.y * p.y, 0);

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
    current_value: values[values.length - 1],
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

    switch (metric) {
      case 'scoring_avg':
      case 'total_score':
        value = round.total_score;
        break;
      case 'score_to_par':
        value = round.score_to_par;
        break;
      case 'putts':
        value = round.total_putts;
        break;
      case 'fairway_pct':
        value = round.fairways_possible > 0
          ? (round.fairways_hit / round.fairways_possible) * 100
          : 0;
        break;
      case 'gir_pct':
        value = (round.greens_in_regulation / 18) * 100;
        break;
      case 'up_and_down_pct':
        value = round.up_and_down_attempts > 0
          ? (round.up_and_downs / round.up_and_down_attempts) * 100
          : 0;
        break;
      case 'sand_save_pct':
        value = round.sand_save_attempts > 0
          ? (round.sand_saves / round.sand_save_attempts) * 100
          : 0;
        break;
      case 'sg_total':
        value = round.sg_total ?? calculateRoundStrokesGained(round).sg_total;
        break;
      case 'sg_off_tee':
        value = round.sg_off_tee ?? calculateRoundStrokesGained(round).sg_off_tee;
        break;
      case 'sg_approach':
        value = round.sg_approach ?? calculateRoundStrokesGained(round).sg_approach;
        break;
      case 'sg_around_green':
        value = round.sg_around_green ?? calculateRoundStrokesGained(round).sg_around_green;
        break;
      case 'sg_putting':
        value = round.sg_putting ?? calculateRoundStrokesGained(round).sg_putting;
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
  stats: PlayerStats,
  baseline: ComparisonBaseline,
  customBaseline?: Record<string, number>
): ComparisonResult {
  const baselineData = customBaseline || BASELINES[baseline];

  const comparisons: StatComparison[] = [];

  // Scoring metrics (lower is better)
  comparisons.push({
    metric: 'Scoring Average',
    player_value: stats.scoring_avg,
    comparison_value: baselineData.scoring_avg,
    difference: baselineData.scoring_avg - stats.scoring_avg, // Positive = player is better
    baseline,
  });

  comparisons.push({
    metric: 'Putts per Round',
    player_value: stats.avg_putts,
    comparison_value: baselineData.putts,
    difference: baselineData.putts - stats.avg_putts,
    baseline,
  });

  // Percentage metrics (higher is better)
  comparisons.push({
    metric: 'Fairway %',
    player_value: stats.fairway_percentage,
    comparison_value: baselineData.fairway_pct,
    difference: stats.fairway_percentage - baselineData.fairway_pct,
    baseline,
  });

  comparisons.push({
    metric: 'GIR %',
    player_value: stats.gir_percentage,
    comparison_value: baselineData.gir_pct,
    difference: stats.gir_percentage - baselineData.gir_pct,
    baseline,
  });

  comparisons.push({
    metric: 'Up & Down %',
    player_value: stats.up_and_down_percentage,
    comparison_value: baselineData.up_and_down_pct,
    difference: stats.up_and_down_percentage - baselineData.up_and_down_pct,
    baseline,
  });

  comparisons.push({
    metric: 'Sand Save %',
    player_value: stats.sand_save_percentage,
    comparison_value: baselineData.sand_save_pct,
    difference: stats.sand_save_percentage - baselineData.sand_save_pct,
    baseline,
  });

  // Strokes Gained metrics (higher is better)
  comparisons.push({
    metric: 'SG: Total',
    player_value: stats.strokes_gained.sg_total,
    comparison_value: baselineData.sg_total,
    difference: stats.strokes_gained.sg_total - baselineData.sg_total,
    baseline,
  });

  comparisons.push({
    metric: 'SG: Off the Tee',
    player_value: stats.strokes_gained.sg_off_tee,
    comparison_value: baselineData.sg_off_tee,
    difference: stats.strokes_gained.sg_off_tee - baselineData.sg_off_tee,
    baseline,
  });

  comparisons.push({
    metric: 'SG: Approach',
    player_value: stats.strokes_gained.sg_approach,
    comparison_value: baselineData.sg_approach,
    difference: stats.strokes_gained.sg_approach - baselineData.sg_approach,
    baseline,
  });

  comparisons.push({
    metric: 'SG: Around the Green',
    player_value: stats.strokes_gained.sg_around_green,
    comparison_value: baselineData.sg_around_green,
    difference: stats.strokes_gained.sg_around_green - baselineData.sg_around_green,
    baseline,
  });

  comparisons.push({
    metric: 'SG: Putting',
    player_value: stats.strokes_gained.sg_putting,
    comparison_value: baselineData.sg_putting,
    difference: stats.strokes_gained.sg_putting - baselineData.sg_putting,
    baseline,
  });

  // Identify strengths and weaknesses
  const { strengths, weaknesses } = identifyStrengthsWeaknesses(stats.strokes_gained);

  return {
    player_id: stats.player_id,
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
 */
export function calculatePersonalBestBaseline(rounds: GolfRound[]): Record<string, number> {
  if (rounds.length === 0) {
    return BASELINES.scratch;
  }

  const scores = rounds.map(r => r.total_score);
  const putts = rounds.map(r => r.total_putts);
  const fairways = rounds.map(r =>
    r.fairways_possible > 0 ? (r.fairways_hit / r.fairways_possible) * 100 : 0
  );
  const girs = rounds.map(r => (r.greens_in_regulation / 18) * 100);
  const upAndDowns = rounds.map(r =>
    r.up_and_down_attempts > 0 ? (r.up_and_downs / r.up_and_down_attempts) * 100 : 0
  );
  const sandSaves = rounds.map(r =>
    r.sand_save_attempts > 0 ? (r.sand_saves / r.sand_save_attempts) * 100 : 0
  );

  const sgTotals: number[] = [];
  const sgOffTee: number[] = [];
  const sgApproach: number[] = [];
  const sgAroundGreen: number[] = [];
  const sgPutting: number[] = [];

  for (const round of rounds) {
    const sg = calculateRoundStrokesGained(round);
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
  allPlayerStats: PlayerStats[]
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
    sand_save_pct: avg(allPlayerStats.map(p => p.sand_save_percentage)),
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

    if (improving.length > 0) {
      insights.push(`Strongest improvement area: ${improving[0].label}`);
    }

    // Find biggest decline
    const declining = sgCategories
      .filter(c => trends[c.key]?.trend === 'declining')
      .sort((a, b) => (trends[a.key]?.velocity || 0) - (trends[b.key]?.velocity || 0));

    if (declining.length > 0) {
      insights.push(`Area needing attention: ${declining[0].label}`);
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
