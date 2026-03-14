/**
 * Regression to Mean Detector
 *
 * Identifies when a player's current performance is a statistical outlier
 * and predicts the expected regression toward their baseline.
 *
 * Pure math — no database calls. All functions work on arrays of numbers.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface RegressionPrediction {
  metric: string;
  currentValue: number;
  baselineValue: number;
  deviationSize: number;
  expectedRegression: number;
  predictedNextValue: number;
  confidence: number;
}

// ============================================================================
// REGRESSION COEFFICIENT
// ============================================================================

/**
 * Calculate the regression coefficient from historical deviations.
 *
 * This measures how much a deviation at time t predicts the deviation at
 * time t+1. A coefficient of 0.5 means half of the current deviation is
 * expected to persist; the other half regresses to the mean.
 *
 * @param historicalDeviations - Pairs of consecutive deviations from the mean.
 * @returns Regression coefficient in [0, 1]. Returns 0.5 as default.
 */
export function calculateRegressionCoefficient(
  historicalDeviations: Array<{ deviation: number; nextDeviation: number }>
): number {
  const n = historicalDeviations.length;
  if (n < 3) return 0.5; // Default when insufficient data

  // Compute Pearson correlation between deviation[i] and deviation[i+1]
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const pair of historicalDeviations) {
    sumX += pair.deviation;
    sumY += pair.nextDeviation;
    sumXY += pair.deviation * pair.nextDeviation;
    sumX2 += pair.deviation ** 2;
    sumY2 += pair.nextDeviation ** 2;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  const numerator = sumXY - n * meanX * meanY;
  const denomX = sumX2 - n * meanX ** 2;
  const denomY = sumY2 - n * meanY ** 2;

  if (denomX <= 0 || denomY <= 0) return 0.5;

  const r = numerator / Math.sqrt(denomX * denomY);

  // Clamp to [0, 1] — negative correlation would mean overcorrection,
  // which we clamp to 0 (full regression expected).
  return Math.max(0, Math.min(1, r));
}

// ============================================================================
// MAIN DETECTION
// ============================================================================

/**
 * Detect whether a current value is a regression-to-mean candidate.
 *
 * Only flags values that deviate by more than 1.5 standard deviations
 * from the mean. Returns null if the deviation is not significant enough.
 *
 * @param currentValue - The most recent observed value.
 * @param mean         - The player's baseline (career or rolling average).
 * @param stdDev       - Standard deviation of the metric.
 * @param metric       - Name of the metric (e.g. "sgTotal").
 * @param regressionCoefficient - Optional pre-computed coefficient [0,1].
 *                                Defaults to 0.5.
 * @param sampleSize   - Optional sample size used to compute baseline stats.
 *                        Influences confidence.
 */
export function detectRegressionCandidate(
  currentValue: number,
  mean: number,
  stdDev: number,
  metric: string,
  regressionCoefficient: number = 0.5,
  sampleSize: number = 20
): RegressionPrediction | null {
  if (stdDev <= 0) return null;

  const deviation = currentValue - mean;
  const deviationSize = Math.abs(deviation) / stdDev;

  // Only flag when |current - mean| > 1.5 * stdDev
  if (deviationSize < 1.5) return null;

  const coeff = Math.max(0, Math.min(1, regressionCoefficient));

  // Expected regression = the portion that will revert
  const expectedRegression = deviation * (1 - coeff);

  // Predicted next = mean + remaining persistent portion
  const predictedNextValue = mean + deviation * coeff;

  // Confidence based on:
  //   1. Sample size adequacy (ramps from 0.3 at n=5 to 1.0 at n=30+)
  //   2. Deviation magnitude (larger deviations are more likely to regress)
  const sizeFactor = Math.min(1, 0.3 + (sampleSize - 5) * (0.7 / 25));
  const deviationFactor = Math.min(1, deviationSize / 3);
  const confidence = Math.min(1, Math.max(0, sizeFactor * 0.6 + deviationFactor * 0.4));

  return {
    metric,
    currentValue,
    baselineValue: mean,
    deviationSize,
    expectedRegression,
    predictedNextValue,
    confidence,
  };
}
