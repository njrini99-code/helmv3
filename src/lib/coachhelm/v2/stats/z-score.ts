/**
 * Z-Score Normalization + Composite Ratings
 *
 * Pure math functions for normalizing player metrics using z-scores,
 * computing composite ratings, and categorizing performance.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerMetrics {
  playerId: string;
  metrics: Record<string, number>;
}

export interface PlayerZScores {
  playerId: string;
  zScores: Record<string, number>;
  composite: number | null;
  categories: CategoryRatings;
}

export interface CategoryRatings {
  teeGame: number;
  approach: number;
  shortGame: number;
  putting: number;
  scoring: number;
  overall: number;
}

// ============================================================================
// CATEGORY METRIC GROUPINGS
// ============================================================================

const CATEGORY_METRICS: Record<keyof Omit<CategoryRatings, 'overall'>, string[]> = {
  teeGame: ['drivingDistance', 'fairwayPct', 'sgOffTee'],
  approach: ['girPct', 'sgApproach', 'proximityToHole'],
  shortGame: ['sgAroundGreen', 'scramblePct', 'sandSavePct'],
  putting: ['sgPutting', 'puttsPerRound', 'onePuttPct', 'threePuttAvoidance'],
  scoring: ['scoringAvg', 'birdieRate', 'bogeyAvoidance', 'parSavePct'],
};

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Calculate z-scores for an array of numeric values.
 *
 * z = (value - mean) / stdDev
 *
 * If stdDev is 0 (all values identical), all z-scores are 0.
 */
export function calculateZScores(values: number[]): {
  mean: number;
  stdDev: number;
  zScores: number[];
} {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, zScores: [] };
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const zScores =
    stdDev === 0
      ? values.map(() => 0)
      : values.map((v) => (v - mean) / stdDev);

  return { mean, stdDev, zScores };
}

/**
 * Normalize a set of players' metrics into z-scores and compute composite
 * ratings + category breakdowns.
 *
 * Returns null composite when fewer than 3 players are provided (insufficient
 * sample for meaningful normalization).
 */
export function normalizePlayerMetrics(
  players: PlayerMetrics[],
  metrics: string[],
): PlayerZScores[] {
  if (players.length === 0) return [];

  // Build per-metric value arrays (parallel with players array)
  const metricValues: Record<string, number[]> = {};
  for (const metric of metrics) {
    metricValues[metric] = players.map((p) => p.metrics[metric] ?? 0);
  }

  // Calculate z-scores for each metric
  const metricZScores: Record<string, { mean: number; stdDev: number; zScores: number[] }> = {};
  for (const metric of metrics) {
    metricZScores[metric] = calculateZScores(metricValues[metric]);
  }

  const tooFewPlayers = players.length < 3;

  return players.map((player, idx) => {
    const zScores: Record<string, number> = {};
    for (const metric of metrics) {
      zScores[metric] = metricZScores[metric].zScores[idx];
    }

    const composite = tooFewPlayers ? null : computeCompositeRating(zScores);
    const categories = computeCategoryRatings(zScores);

    return {
      playerId: player.playerId,
      zScores,
      composite,
      categories,
    };
  });
}

/**
 * Compute a composite rating from z-scores.
 *
 * Formula: 50 + (weighted z-score sum * 10), clamped to [0, 100].
 *
 * If weights are provided, only z-scores with matching keys are used.
 * The weighted sum is divided by the total weight for normalization.
 * If no weights are provided, all z-scores contribute equally.
 */
export function computeCompositeRating(
  zScores: Record<string, number>,
  weights?: Record<string, number>,
): number {
  const keys = Object.keys(zScores);
  if (keys.length === 0) return 50;

  let weightedSum = 0;
  let totalWeight = 0;

  if (weights) {
    for (const key of keys) {
      const w = weights[key];
      if (w !== undefined) {
        weightedSum += zScores[key] * w;
        totalWeight += w;
      }
    }
  } else {
    for (const key of keys) {
      weightedSum += zScores[key];
      totalWeight += 1;
    }
  }

  if (totalWeight === 0) return 50;

  const normalizedZ = weightedSum / totalWeight;
  const raw = 50 + normalizedZ * 10;

  return Math.max(0, Math.min(100, raw));
}

/**
 * Compute per-category ratings from z-scores using predefined metric groupings.
 *
 * Each category averages the z-scores of its constituent metrics (only those
 * present in the input), then maps to a 0-100 scale like composite.
 */
export function computeCategoryRatings(
  zScores: Record<string, number>,
): CategoryRatings {
  const categoryScores: Record<string, number> = {};

  for (const [category, metricNames] of Object.entries(CATEGORY_METRICS)) {
    const available = metricNames.filter((m) => m in zScores);
    if (available.length === 0) {
      categoryScores[category] = 50;
    } else {
      const avg = available.reduce((sum, m) => sum + zScores[m], 0) / available.length;
      categoryScores[category] = Math.max(0, Math.min(100, 50 + avg * 10));
    }
  }

  // Overall = average of all category scores
  const cats = Object.values(categoryScores);
  const overall = cats.reduce((sum, v) => sum + v, 0) / cats.length;

  return {
    teeGame: categoryScores['teeGame'],
    approach: categoryScores['approach'],
    shortGame: categoryScores['shortGame'],
    putting: categoryScores['putting'],
    scoring: categoryScores['scoring'],
    overall: Math.max(0, Math.min(100, overall)),
  };
}
