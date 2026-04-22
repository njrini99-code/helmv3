/**
 * Streak Detection + Composition
 *
 * Detects hot/cold streaks in performance data and decomposes
 * them by strokes-gained category to assess sustainability.
 *
 * Pure math — no database calls. All functions work on arrays of numbers.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Streak {
  type: 'hot' | 'cold';
  startIndex: number;
  length: number;
  magnitude: number;
  rounds: number[];
  isOngoing: boolean;
}

export interface StreakComposition {
  drivingContribution: number;
  approachContribution: number;
  shortGameContribution: number;
  puttingContribution: number;
  sustainability: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface SGBreakdown {
  sgOtt: number;
  sgApp: number;
  sgArg: number;
  sgPutt: number;
}

// ============================================================================
// STREAK DETECTION
// ============================================================================

/**
 * Detect hot and cold streaks in a sequence of values.
 *
 * A streak is 3+ consecutive values above (hot) or below (cold) the baseline.
 * Magnitude is the cumulative deviation from baseline across the streak.
 *
 * @param values    - Chronological values (oldest first).
 * @param baseline  - The reference value (e.g. career average).
 * @param threshold - Optional minimum deviation from baseline to count.
 *                    Defaults to 0 (any value above/below baseline counts).
 */
export function detectStreaks(
  values: number[],
  baseline: number,
  threshold: number = 0
): Streak[] {
  if (values.length < 3) return [];

  const streaks: Streak[] = [];
  let currentType: 'hot' | 'cold' | null = null;
  let startIndex = 0;
  let currentRounds: number[] = [];
  let currentMagnitude = 0;

  function flushStreak(endIndex: number): void {
    if (currentType && currentRounds.length >= 3) {
      streaks.push({
        type: currentType,
        startIndex,
        length: currentRounds.length,
        magnitude: currentMagnitude,
        rounds: [...currentRounds],
        isOngoing: endIndex === values.length,
      });
    }
  }

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === undefined) continue;
    const deviation = value - baseline;
    let thisType: 'hot' | 'cold' | null = null;

    if (deviation > threshold) {
      thisType = 'hot';
    } else if (deviation < -threshold) {
      thisType = 'cold';
    }

    if (thisType === currentType && thisType !== null) {
      // Continue current streak
      currentRounds.push(value);
      currentMagnitude += deviation;
    } else {
      // End previous streak (if any)
      flushStreak(i);

      // Start new potential streak
      currentType = thisType;
      startIndex = i;
      currentRounds = thisType !== null ? [value] : [];
      currentMagnitude = thisType !== null ? deviation : 0;
    }
  }

  // Flush final streak
  flushStreak(values.length);

  return streaks;
}

// ============================================================================
// STREAK COMPOSITION
// ============================================================================

/**
 * Analyze which strokes-gained categories are driving a streak.
 *
 * @param streakValues  - The raw overall values during the streak.
 * @param sgBreakdown   - SG breakdown for each round in the streak.
 *                        Must be same length as streakValues.
 */
export function analyzeStreakComposition(
  streakValues: number[],
  sgBreakdown: SGBreakdown[]
): StreakComposition {
  if (streakValues.length === 0 || sgBreakdown.length === 0) {
    return {
      drivingContribution: 0,
      approachContribution: 0,
      shortGameContribution: 0,
      puttingContribution: 0,
      sustainability: 'low',
      explanation: 'Insufficient data to analyze streak composition.',
    };
  }

  const n = Math.min(streakValues.length, sgBreakdown.length);

  // Average deviation per category during the streak
  let avgOtt = 0;
  let avgApp = 0;
  let avgArg = 0;
  let avgPutt = 0;

  for (let i = 0; i < n; i++) {
    const breakdown = sgBreakdown[i];
    if (!breakdown) continue;
    avgOtt += breakdown.sgOtt;
    avgApp += breakdown.sgApp;
    avgArg += breakdown.sgArg;
    avgPutt += breakdown.sgPutt;
  }

  avgOtt /= n;
  avgApp /= n;
  avgArg /= n;
  avgPutt /= n;

  // Compute contribution as share of absolute total
  const absTotal =
    Math.abs(avgOtt) + Math.abs(avgApp) + Math.abs(avgArg) + Math.abs(avgPutt);

  const drivingContribution =
    absTotal > 0 ? Math.abs(avgOtt) / absTotal : 0.25;
  const approachContribution =
    absTotal > 0 ? Math.abs(avgApp) / absTotal : 0.25;
  const shortGameContribution =
    absTotal > 0 ? Math.abs(avgArg) / absTotal : 0.25;
  const puttingContribution =
    absTotal > 0 ? Math.abs(avgPutt) / absTotal : 0.25;

  // Sustainability heuristic:
  //   approach-driven = high (most repeatable skill)
  //   driving-driven = medium (moderately repeatable)
  //   short-game-driven = medium
  //   putting-driven = low (most volatile)
  const sustainability = assessSustainability(
    drivingContribution,
    approachContribution,
    shortGameContribution,
    puttingContribution
  );

  const explanation = composeExplanation(
    drivingContribution,
    approachContribution,
    shortGameContribution,
    puttingContribution,
    sustainability
  );

  return {
    drivingContribution,
    approachContribution,
    shortGameContribution,
    puttingContribution,
    sustainability,
    explanation,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function assessSustainability(
  driving: number,
  approach: number,
  shortGame: number,
  putting: number
): 'high' | 'medium' | 'low' {
  // If approach is the dominant contributor, sustainability is high
  if (approach >= 0.35) return 'high';

  // If putting is the dominant contributor, sustainability is low
  if (putting >= 0.4) return 'low';

  // If driving or short game dominate, medium
  if (driving >= 0.35 || shortGame >= 0.35) return 'medium';

  // Well-balanced across categories — medium sustainability
  return 'medium';
}

function composeExplanation(
  driving: number,
  approach: number,
  shortGame: number,
  putting: number,
  sustainability: 'high' | 'medium' | 'low'
): string {
  const categories: Array<{ name: string; pct: number }> = [
    { name: 'driving', pct: driving },
    { name: 'approach play', pct: approach },
    { name: 'short game', pct: shortGame },
    { name: 'putting', pct: putting },
  ];

  categories.sort((a, b) => b.pct - a.pct);

  const primary = categories[0];
  const secondary = categories[1];
  if (!primary || !secondary) {
    return 'Insufficient category data to describe composition.';
  }

  const pctStr = (v: number): string => `${Math.round(v * 100)}%`;

  let desc = `Primarily driven by ${primary.name} (${pctStr(primary.pct)})`;
  if (secondary.pct > 0.25) {
    desc += ` with significant contribution from ${secondary.name} (${pctStr(secondary.pct)})`;
  }
  desc += '.';

  const sustainLabels: Record<string, string> = {
    high: 'This composition suggests the streak is likely sustainable.',
    medium:
      'This composition suggests moderate sustainability — monitor for regression.',
    low: 'This composition is heavily putting-dependent, which tends to be volatile. Expect some regression.',
  };

  desc += ` ${sustainLabels[sustainability]}`;

  return desc;
}
