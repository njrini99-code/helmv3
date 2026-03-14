/**
 * Rolling Baselines with Exponential Decay
 *
 * Exponentially Weighted Moving Average (EWMA) baselines for tracking
 * player performance over time, with trend and volatility detection.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerBaseline {
  playerId: string;
  metrics: Record<string, BaselineMetric>;
  updatedAt: string;
}

export interface BaselineMetric {
  ewma: number;
  mean: number;
  stdDev: number;
  trend: number;
  volatility: number;
  sampleSize: number;
}

export interface BaselineComparison {
  deviation: number;
  zScore: number;
  isSignificant: boolean;
  direction: 'above' | 'below' | 'at';
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Calculate Exponentially Weighted Moving Average.
 *
 * EWMA_t = alpha * value_t + (1 - alpha) * EWMA_{t-1}
 *
 * Values should be in chronological order (oldest first).
 * Default alpha = 0.15 (gives ~87% weight to recent 15 values).
 */
export function calculateEWMA(values: number[], alpha: number = 0.15): number {
  if (values.length === 0) return 0;

  let ewma = values[0];
  for (let i = 1; i < values.length; i++) {
    ewma = alpha * values[i] + (1 - alpha) * ewma;
  }
  return ewma;
}

/**
 * Build a complete baseline profile from a player's round history.
 *
 * For each metric found in the rounds:
 * - EWMA with default alpha 0.15
 * - Simple mean and stdDev
 * - Trend via linear regression slope
 * - Volatility from rolling stdDev of last 10 values vs all values
 */
export function buildPlayerBaseline(
  rounds: Array<{ metrics: Record<string, number> }>,
  playerId: string = '',
): PlayerBaseline {
  if (rounds.length === 0) {
    return { playerId, metrics: {}, updatedAt: new Date().toISOString() };
  }

  // Collect all unique metric keys
  const metricKeys = new Set<string>();
  for (const round of rounds) {
    for (const key of Object.keys(round.metrics)) {
      metricKeys.add(key);
    }
  }

  const metrics: Record<string, BaselineMetric> = {};

  for (const key of Array.from(metricKeys)) {
    const values = rounds
      .map((r) => r.metrics[key])
      .filter((v): v is number => v !== undefined && v !== null);

    if (values.length === 0) continue;

    const ewma = calculateEWMA(values);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance =
      values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(values.length - 1, 1);
    const stdDev = Math.sqrt(variance);
    const trend = linearRegressionSlope(values);
    const volatility = calculateRollingVolatility(values, 10);

    metrics[key] = {
      ewma,
      mean,
      stdDev,
      trend,
      volatility,
      sampleSize: values.length,
    };
  }

  return {
    playerId,
    metrics,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Compare a single value against a baseline metric.
 *
 * Returns deviation from the EWMA, z-score relative to the baseline
 * distribution, significance (|z| >= 2), and direction.
 */
export function compareToBaseline(
  value: number,
  baseline: BaselineMetric,
): BaselineComparison {
  const deviation = value - baseline.ewma;

  const zScore = baseline.stdDev === 0 ? 0 : deviation / baseline.stdDev;

  const isSignificant = Math.abs(zScore) >= 2;

  let direction: 'above' | 'below' | 'at';
  if (Math.abs(zScore) < 0.1) {
    direction = 'at';
  } else if (zScore > 0) {
    direction = 'above';
  } else {
    direction = 'below';
  }

  return { deviation, zScore, isSignificant, direction };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Linear regression slope over an array of values.
 * x-axis is the index (0, 1, 2, ...).
 */
function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Calculate volatility as the ratio of recent rolling stdDev to overall stdDev.
 * Returns the stdDev of the last `windowSize` values.
 */
function calculateRollingVolatility(
  values: number[],
  windowSize: number,
): number {
  if (values.length < 2) return 0;

  const window = values.slice(-windowSize);
  if (window.length < 2) return 0;

  const mean = window.reduce((s, v) => s + v, 0) / window.length;
  const variance =
    window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;

  return Math.sqrt(variance);
}
