/**
 * Multi-Window Trend Detection
 *
 * Analyzes trends across 3 parallel time windows simultaneously:
 * - Fast (last 5 rounds): catches hot/cold streaks
 * - Medium (last 12 rounds): catches sustained improvement/decline
 * - Slow (last 25 rounds): catches long-term trajectory
 *
 * Pure math — no database calls. All functions work on arrays of numbers.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TrendWindow {
  name: 'fast' | 'medium' | 'slow';
  size: number;
  slope: number;
  rSquared: number;
  direction: 'improving' | 'stable' | 'declining';
  magnitude: number;
  confidence: number;
}

export interface MultiWindowAnalysis {
  metric: string;
  windows: TrendWindow[];
  alignment: WindowAlignment;
  signal:
    | 'strong_improving'
    | 'strong_declining'
    | 'short_term_dip'
    | 'short_term_spike'
    | 'trajectory_change'
    | 'mixed'
    | 'stable';
  description: string;
}

export type WindowAlignment =
  | 'all_agree'
  | 'fast_disagrees'
  | 'slow_disagrees'
  | 'no_alignment';

// ============================================================================
// LINEAR REGRESSION
// ============================================================================

/**
 * Ordinary least-squares linear regression on an array of values.
 * The independent variable is the index (0, 1, 2, ...).
 */
export function linearRegression(values: number[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  const n = values.length;
  if (n === 0) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }
  if (n === 1) {
    return { slope: 0, intercept: values[0], rSquared: 1 };
  }

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

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denominator = sumX2 - n * meanX * meanX;

  if (denominator === 0) {
    return { slope: 0, intercept: meanY, rSquared: 0 };
  }

  const slope = (sumXY - n * meanX * meanY) / denominator;
  const intercept = meanY - slope * meanX;

  // R-squared
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared: Math.max(0, rSquared) };
}

// ============================================================================
// HELPERS
// ============================================================================

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function classifyDirection(
  slope: number,
  threshold: number
): 'improving' | 'stable' | 'declining' {
  if (slope > threshold) return 'improving';
  if (slope < -threshold) return 'declining';
  return 'stable';
}

/**
 * Confidence is a blend of R-squared quality and sample size adequacy.
 * More data points and a better linear fit yield higher confidence.
 */
function computeConfidence(rSquared: number, sampleSize: number): number {
  // Sample size factor: ramps from 0.3 at n=3 to 1.0 at n=20+
  const sizeFactor = Math.min(1, 0.3 + (sampleSize - 3) * (0.7 / 17));
  return Math.min(1, Math.max(0, rSquared * sizeFactor));
}

// ============================================================================
// WINDOW SIZES
// ============================================================================

const WINDOW_CONFIGS: Array<{
  name: 'fast' | 'medium' | 'slow';
  size: number;
}> = [
  { name: 'fast', size: 5 },
  { name: 'medium', size: 12 },
  { name: 'slow', size: 25 },
];

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

/**
 * Analyze trends across fast, medium, and slow time windows.
 *
 * @param values - Array of numeric observations ordered chronologically
 *                 (oldest first, most recent last).
 * @param metric - Name of the metric being analyzed (e.g. "sgTotal").
 */
export function analyzeMultiWindowTrends(
  values: number[],
  metric: string
): MultiWindowAnalysis {
  if (values.length === 0) {
    return {
      metric,
      windows: [],
      alignment: 'no_alignment',
      signal: 'stable',
      description: `Not enough data to analyze ${metric} trends.`,
    };
  }

  const overallStd = stdDev(values);
  const directionThreshold = 0.05 * (overallStd || 1);

  const windows: TrendWindow[] = [];

  for (const config of WINDOW_CONFIGS) {
    const windowSize = Math.min(config.size, values.length);
    if (windowSize < 3) continue; // Need at least 3 points for meaningful regression

    const windowValues = values.slice(-windowSize);
    const reg = linearRegression(windowValues);
    const direction = classifyDirection(reg.slope, directionThreshold);
    const magnitude = Math.abs(reg.slope) / (overallStd || 1);
    const confidence = computeConfidence(reg.rSquared, windowSize);

    windows.push({
      name: config.name,
      size: windowSize,
      slope: reg.slope,
      rSquared: reg.rSquared,
      direction,
      magnitude,
      confidence,
    });
  }

  if (windows.length === 0) {
    return {
      metric,
      windows: [],
      alignment: 'no_alignment',
      signal: 'stable',
      description: `Not enough data to analyze ${metric} trends.`,
    };
  }

  const alignment = determineAlignment(windows);
  const signal = determineSignal(windows, alignment);
  const description = composeDescription(metric, windows, alignment, signal);

  return { metric, windows, alignment, signal, description };
}

// ============================================================================
// ALIGNMENT + SIGNAL LOGIC
// ============================================================================

function determineAlignment(windows: TrendWindow[]): WindowAlignment {
  if (windows.length <= 1) return 'no_alignment';

  const directions = windows.map((w) => w.direction);
  const allSame = directions.every((d) => d === directions[0]);
  if (allSame) return 'all_agree';

  const fast = windows.find((w) => w.name === 'fast');
  const medium = windows.find((w) => w.name === 'medium');
  const slow = windows.find((w) => w.name === 'slow');

  // Fast disagrees with medium+slow
  if (fast && medium && slow) {
    if (
      medium.direction === slow.direction &&
      fast.direction !== medium.direction
    ) {
      return 'fast_disagrees';
    }
    if (
      fast.direction === medium.direction &&
      slow.direction !== fast.direction
    ) {
      return 'slow_disagrees';
    }
  }

  // Two windows: fast disagrees with the other
  if (fast && medium && !slow) {
    if (fast.direction !== medium.direction) return 'fast_disagrees';
  }

  return 'no_alignment';
}

function determineSignal(
  windows: TrendWindow[],
  alignment: WindowAlignment
): MultiWindowAnalysis['signal'] {
  if (windows.every((w) => w.direction === 'stable')) return 'stable';

  const fast = windows.find((w) => w.name === 'fast');

  switch (alignment) {
    case 'all_agree': {
      const dir = windows[0].direction;
      if (dir === 'improving') return 'strong_improving';
      if (dir === 'declining') return 'strong_declining';
      return 'stable';
    }
    case 'fast_disagrees': {
      if (fast) {
        return fast.direction === 'declining'
          ? 'short_term_dip'
          : 'short_term_spike';
      }
      return 'mixed';
    }
    case 'slow_disagrees':
      return 'trajectory_change';
    case 'no_alignment':
    default:
      return 'mixed';
  }
}

function composeDescription(
  metric: string,
  windows: TrendWindow[],
  alignment: WindowAlignment,
  signal: MultiWindowAnalysis['signal']
): string {
  const signalDescriptions: Record<MultiWindowAnalysis['signal'], string> = {
    strong_improving: `${metric} is trending upward across all time windows — sustained improvement.`,
    strong_declining: `${metric} is trending downward across all time windows — sustained decline.`,
    short_term_dip: `${metric} has dipped recently, but the longer-term trend remains positive.`,
    short_term_spike: `${metric} has spiked recently, but the longer-term trend is different — could be a hot streak.`,
    trajectory_change: `${metric} shows a recent shift in trajectory compared to the long-term trend.`,
    mixed: `${metric} shows mixed signals across time windows — no clear overall direction.`,
    stable: `${metric} has been stable across all time windows.`,
  };

  let desc = signalDescriptions[signal];

  if (alignment === 'all_agree' && windows.length > 0) {
    const avgMag =
      windows.reduce((s, w) => s + w.magnitude, 0) / windows.length;
    if (avgMag > 1) {
      desc += ' The magnitude of change is significant.';
    }
  }

  return desc;
}
