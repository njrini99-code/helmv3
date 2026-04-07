/**
 * Enhanced Anomaly Detection
 *
 * Multiple detection strategies: z-score deviation from baseline, IQR outliers,
 * volatility spikes, and slope change detection.
 */

import type { BaselineMetric } from './baselines';

// ============================================================================
// TYPES
// ============================================================================

export interface Anomaly {
  metric: string;
  value: number;
  type: 'zscore' | 'iqr' | 'volatility' | 'slope_change';
  severity: 'low' | 'medium' | 'high';
  description: string;
  deviation: number;
}

export interface VolatilityMetrics {
  current: number;
  historical: number;
  ratio: number;
  isElevated: boolean;
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Detect anomalies in recent values against a player's baseline.
 *
 * Uses z-score deviation from the baseline EWMA/stdDev.
 * Severity thresholds: |z| >= 3 = high, >= 2 = medium, >= 1.5 = low.
 *
 * Only the most recent value is tested for anomaly status.
 */
export function detectAnomalies(
  values: number[],
  baseline: BaselineMetric,
  metric: string,
): Anomaly[] {
  if (values.length === 0) return [];

  const anomalies: Anomaly[] = [];
  const latest = values[values.length - 1];
  if (latest === undefined) return [];

  // Z-score anomaly against baseline
  if (baseline.stdDev > 0) {
    const zScore = (latest - baseline.ewma) / baseline.stdDev;
    const absZ = Math.abs(zScore);

    if (absZ >= 1.5) {
      const direction = zScore > 0 ? 'above' : 'below';
      const severity: Anomaly['severity'] =
        absZ >= 3 ? 'high' : absZ >= 2 ? 'medium' : 'low';

      anomalies.push({
        metric,
        value: latest,
        type: 'zscore',
        severity,
        description: `${metric} is ${absZ.toFixed(1)} standard deviations ${direction} baseline (${baseline.ewma.toFixed(2)})`,
        deviation: zScore,
      });
    }
  }

  // IQR anomaly on the full value set
  if (values.length >= 4) {
    const iqrResult = detectIQRAnomalies(values);
    if (iqrResult.iqr === 0) {
      // All values identical or near-identical — no IQR outliers possible
    } else if (iqrResult.outliers.includes(latest)) {
      const deviation = latest > iqrResult.q3
        ? (latest - iqrResult.q3) / iqrResult.iqr
        : (iqrResult.q1 - latest) / iqrResult.iqr;

      anomalies.push({
        metric,
        value: latest,
        type: 'iqr',
        severity: deviation > 3 ? 'high' : deviation > 2 ? 'medium' : 'low',
        description: `${metric} value ${latest.toFixed(2)} is an IQR outlier (Q1=${iqrResult.q1.toFixed(2)}, Q3=${iqrResult.q3.toFixed(2)})`,
        deviation,
      });
    }
  }

  // Volatility anomaly
  if (values.length >= 5) {
    const vol = calculateVolatility(values);
    if (vol.isElevated) {
      anomalies.push({
        metric,
        value: latest,
        type: 'volatility',
        severity: vol.ratio > 3 ? 'high' : vol.ratio > 2 ? 'medium' : 'low',
        description: `${metric} volatility is ${vol.ratio.toFixed(1)}x historical levels`,
        deviation: vol.ratio,
      });
    }
  }

  // Slope change anomaly
  if (values.length >= 6) {
    const slopeResult = detectSlopeChange(values);
    if (slopeResult && slopeResult.detected) {
      const slopeDiff = Math.abs(slopeResult.newSlope - slopeResult.oldSlope);
      anomalies.push({
        metric,
        value: latest,
        type: 'slope_change',
        severity: slopeDiff > 2 ? 'high' : slopeDiff > 1 ? 'medium' : 'low',
        description: `${metric} trend changed from slope ${slopeResult.oldSlope.toFixed(3)} to ${slopeResult.newSlope.toFixed(3)} at point ${slopeResult.changePoint}`,
        deviation: slopeDiff,
      });
    }
  }

  return anomalies;
}

/**
 * Detect outliers using the Interquartile Range (IQR) method.
 *
 * Q1 = 25th percentile, Q3 = 75th percentile, IQR = Q3 - Q1.
 * Outliers: values < Q1 - 1.5*IQR  or  > Q3 + 1.5*IQR.
 */
export function detectIQRAnomalies(values: number[]): {
  outliers: number[];
  q1: number;
  q3: number;
  iqr: number;
} {
  if (values.length === 0) {
    return { outliers: [], q1: 0, q3: 0, iqr: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentileValue(sorted, 25);
  const q3 = percentileValue(sorted, 75);
  const iqr = q3 - q1;

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const outliers = values.filter((v) => v < lowerFence || v > upperFence);

  return { outliers, q1, q3, iqr };
}

/**
 * Calculate volatility metrics comparing recent window to historical values.
 *
 * "Elevated" if ratio of current window stdDev to historical stdDev > 1.5.
 */
export function calculateVolatility(
  values: number[],
  windowSize: number = 5,
): VolatilityMetrics {
  if (values.length < 2) {
    return { current: 0, historical: 0, ratio: 1, isElevated: false };
  }

  const historical = stdDev(values);
  const recentWindow = values.slice(-windowSize);
  const current = recentWindow.length >= 2 ? stdDev(recentWindow) : 0;

  const ratio = historical === 0 ? 1 : current / historical;
  const isElevated = ratio > 1.5;

  return { current, historical, ratio, isElevated };
}

/**
 * Detect a significant slope change in a time series.
 *
 * Splits values at each candidate point (requiring at least `minWindow`
 * points on each side), fits linear regression on each half, and finds
 * the split with maximum absolute slope difference.
 *
 * Returns null if no significant change is detected (slope difference < 0.5).
 */
export function detectSlopeChange(
  values: number[],
  minWindow: number = 3,
): {
  detected: boolean;
  oldSlope: number;
  newSlope: number;
  changePoint: number;
} | null {
  if (values.length < minWindow * 2) return null;

  let maxDiff = 0;
  let bestPoint = -1;
  let bestOldSlope = 0;
  let bestNewSlope = 0;

  for (let i = minWindow; i <= values.length - minWindow; i++) {
    const leftSlope = linearRegressionSlope(values.slice(0, i));
    const rightSlope = linearRegressionSlope(values.slice(i));
    const diff = Math.abs(rightSlope - leftSlope);

    if (diff > maxDiff) {
      maxDiff = diff;
      bestPoint = i;
      bestOldSlope = leftSlope;
      bestNewSlope = rightSlope;
    }
  }

  if (bestPoint === -1 || maxDiff < 0.5) return null;

  return {
    detected: true,
    oldSlope: bestOldSlope,
    newSlope: bestNewSlope,
    changePoint: bestPoint,
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Get the value at a given percentile from a sorted array.
 * Uses linear interpolation.
 */
function percentileValue(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const frac = idx - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/**
 * Population standard deviation of an array.
 */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Linear regression slope (x = index).
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

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}
