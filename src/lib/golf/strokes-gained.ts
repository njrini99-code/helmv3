/**
 * Strokes Gained Calculation Engine
 *
 * Strokes Gained measures performance relative to a scratch golfer baseline.
 * Formula: SG = Expected strokes (before shot) - Expected strokes (after shot) - 1
 *
 * Categories:
 * - SG: Off the Tee - Tee shots on par 4s and 5s
 * - SG: Approach - Shots from fairway/rough intended to reach green (not from green)
 * - SG: Around the Green - Shots within 30 yards not on green
 * - SG: Putting - All putts
 */

import type {
  GolfShot,
  GolfHole,
  GolfRound,
  StrokesGainedResult,
  StrokesGainedBreakdown,
  LieType,
  BaselineData,
} from '@/lib/types';

// ============================================
// PGA TOUR BASELINE DATA
// ============================================

/**
 * Expected strokes to hole out from various lies and distances
 * Based on PGA Tour Shotlink data
 * Distance for tee/fairway/rough is in YARDS
 * Distance for green is in FEET
 */
export const PGA_BASELINE_DATA: BaselineData = {
  tee: {
    // Par 5 tee shots (long)
    600: 4.90, 580: 4.85, 560: 4.80, 540: 4.75, 520: 4.70,
    500: 4.65, 480: 4.60, 460: 4.55, 440: 4.50, 420: 4.45,
    // Par 4 tee shots
    400: 4.10, 380: 4.02, 360: 3.95, 340: 3.88, 320: 3.82,
    300: 3.75, 280: 3.68, 260: 3.62,
  },
  fairway: {
    // Long approach
    275: 3.45, 250: 3.30, 225: 3.15, 200: 2.99, 190: 2.92,
    180: 2.86, 175: 2.82, 170: 2.78, 165: 2.75, 160: 2.71,
    // Mid approach
    155: 2.68, 150: 2.67, 145: 2.64, 140: 2.61, 135: 2.58,
    130: 2.55, 125: 2.53, 120: 2.50, 115: 2.47, 110: 2.44,
    // Short approach
    105: 2.42, 100: 2.40, 95: 2.37, 90: 2.35, 85: 2.32,
    80: 2.30, 75: 2.27, 70: 2.25, 65: 2.22, 60: 2.20,
    55: 2.17, 50: 2.15, 45: 2.12, 40: 2.10, 35: 2.08,
    30: 2.06, 25: 2.04, 20: 2.02,
  },
  rough: {
    // Rough is harder than fairway - add penalty
    275: 3.65, 250: 3.48, 225: 3.32, 200: 3.15, 190: 3.08,
    180: 3.01, 175: 2.98, 170: 2.94, 165: 2.91, 160: 2.87,
    155: 2.84, 150: 2.82, 145: 2.79, 140: 2.76, 135: 2.73,
    130: 2.70, 125: 2.68, 120: 2.65, 115: 2.62, 110: 2.59,
    105: 2.56, 100: 2.54, 95: 2.51, 90: 2.48, 85: 2.45,
    80: 2.42, 75: 2.40, 70: 2.37, 65: 2.34, 60: 2.32,
    55: 2.29, 50: 2.26, 45: 2.24, 40: 2.21, 35: 2.18,
    30: 2.16, 25: 2.14, 20: 2.12,
  },
  sand: {
    // Greenside bunker shots (distance in yards)
    40: 2.65, 35: 2.58, 30: 2.53, 28: 2.48, 26: 2.44,
    24: 2.40, 22: 2.36, 20: 2.32, 18: 2.28, 16: 2.24,
    14: 2.20, 12: 2.18, 10: 2.18, 8: 2.14, 6: 2.10,
    5: 2.08, 4: 2.06, 3: 2.04,
  },
  green: {
    // Putting distances in FEET
    90: 2.40, 80: 2.30, 70: 2.20, 60: 2.15, 55: 2.08,
    50: 2.02, 45: 2.00, 40: 1.93, 35: 1.87, 30: 1.82,
    28: 1.78, 26: 1.75, 24: 1.72, 22: 1.68, 20: 1.63,
    18: 1.58, 16: 1.53, 14: 1.47, 12: 1.42, 10: 1.32,
    9: 1.28, 8: 1.24, 7: 1.20, 6: 1.16, 5: 1.12,
    4: 1.08, 3: 1.04, 2: 1.00, 1: 1.00, 0: 0,
  },
  recovery: {
    // Trees, deep rough, etc.
    200: 3.80, 175: 3.55, 150: 3.35, 125: 3.15, 100: 2.95,
    75: 2.75, 50: 2.55, 40: 2.45, 30: 2.35, 20: 2.25,
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get expected strokes from a given lie and distance
 * Uses linear interpolation between known data points
 */
export function getExpectedStrokes(
  lie: LieType,
  distanceYards: number,
  isOnGreen: boolean = false
): number {
  const baseline = PGA_BASELINE_DATA[lie];
  if (!baseline) return 3.0; // Default fallback

  // For putting, convert yards to feet
  const distance = isOnGreen || lie === 'green'
    ? Math.round(distanceYards * 3) // Convert yards to feet
    : distanceYards;

  // Get sorted distances from baseline
  const distances = Object.keys(baseline)
    .map(Number)
    .sort((a, b) => b - a); // Sort descending

  // If distance is beyond max, extrapolate
  if (distance >= distances[0]) {
    return baseline[distances[0]];
  }

  // If distance is below min, use minimum
  if (distance <= distances[distances.length - 1]) {
    return baseline[distances[distances.length - 1]];
  }

  // Find surrounding data points and interpolate
  for (let i = 0; i < distances.length - 1; i++) {
    if (distance <= distances[i] && distance >= distances[i + 1]) {
      const upperDist = distances[i];
      const lowerDist = distances[i + 1];
      const upperStrokes = baseline[upperDist];
      const lowerStrokes = baseline[lowerDist];

      // Linear interpolation
      const ratio = (distance - lowerDist) / (upperDist - lowerDist);
      return lowerStrokes + ratio * (upperStrokes - lowerStrokes);
    }
  }

  // Fallback - shouldn't reach here
  return baseline[distances[distances.length - 1]];
}

/**
 * Calculate strokes gained for a single shot
 */
export function calculateShotStrokesGained(shot: GolfShot): number {
  const expectedBefore = getExpectedStrokes(
    shot.starting_lie,
    shot.starting_distance_yards,
    shot.starting_lie === 'green'
  );

  let expectedAfter: number;
  if (shot.is_holed) {
    expectedAfter = 0;
  } else {
    expectedAfter = getExpectedStrokes(
      shot.ending_lie,
      shot.ending_distance_yards,
      shot.ending_lie === 'green'
    );
  }

  // SG = Expected(before) - Expected(after) - 1
  // Positive = better than average, Negative = worse than average
  return expectedBefore - expectedAfter - 1;
}

/**
 * Categorize a shot into SG category
 */
export function categorizeShot(shot: GolfShot, holePar: number): keyof StrokesGainedResult | null {
  // Penalty shots don't contribute to SG categories meaningfully
  if (shot.is_penalty) return null;

  // Putting
  if (shot.starting_lie === 'green') {
    return 'sg_putting';
  }

  // Off the Tee (first shot on par 4 or par 5)
  if (shot.shot_number === 1 && holePar >= 4) {
    return 'sg_off_tee';
  }

  // Around the Green (within 30 yards, not on green)
  if (shot.starting_distance_yards <= 30 && shot.starting_lie !== 'green') {
    return 'sg_around_green';
  }

  // Approach (everything else)
  return 'sg_approach';
}

// ============================================
// MAIN CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate strokes gained for an array of shots
 */
export function calculateStrokesGained(
  shots: GolfShot[],
  holes: GolfHole[]
): StrokesGainedResult {
  const result: StrokesGainedResult = {
    sg_off_tee: 0,
    sg_approach: 0,
    sg_around_green: 0,
    sg_putting: 0,
    sg_total: 0,
  };

  // Create hole lookup for par values
  const holeMap = new Map(holes.map(h => [h.id, h]));

  for (const shot of shots) {
    const hole = holeMap.get(shot.hole_id);
    if (!hole) continue;

    const category = categorizeShot(shot, hole.par);
    if (!category) continue;

    const sg = calculateShotStrokesGained(shot);
    result[category] += sg;
  }

  result.sg_total =
    result.sg_off_tee +
    result.sg_approach +
    result.sg_around_green +
    result.sg_putting;

  return result;
}

/**
 * Calculate detailed strokes gained breakdown with per-shot averages
 */
export function calculateStrokesGainedBreakdown(
  shots: GolfShot[],
  holes: GolfHole[]
): StrokesGainedBreakdown {
  const counts = {
    off_tee: 0,
    approach: 0,
    around_green: 0,
    putting: 0,
  };

  const result: StrokesGainedResult = {
    sg_off_tee: 0,
    sg_approach: 0,
    sg_around_green: 0,
    sg_putting: 0,
    sg_total: 0,
  };

  const holeMap = new Map(holes.map(h => [h.id, h]));

  for (const shot of shots) {
    const hole = holeMap.get(shot.hole_id);
    if (!hole) continue;

    const category = categorizeShot(shot, hole.par);
    if (!category) continue;

    const sg = calculateShotStrokesGained(shot);
    result[category] += sg;

    // Count shots per category
    switch (category) {
      case 'sg_off_tee': counts.off_tee++; break;
      case 'sg_approach': counts.approach++; break;
      case 'sg_around_green': counts.around_green++; break;
      case 'sg_putting': counts.putting++; break;
    }
  }

  result.sg_total =
    result.sg_off_tee +
    result.sg_approach +
    result.sg_around_green +
    result.sg_putting;

  return {
    ...result,
    shots_off_tee: counts.off_tee,
    shots_approach: counts.approach,
    shots_around_green: counts.around_green,
    shots_putting: counts.putting,
    sg_per_shot_off_tee: counts.off_tee > 0 ? result.sg_off_tee / counts.off_tee : 0,
    sg_per_shot_approach: counts.approach > 0 ? result.sg_approach / counts.approach : 0,
    sg_per_shot_around_green: counts.around_green > 0 ? result.sg_around_green / counts.around_green : 0,
    sg_per_shot_putting: counts.putting > 0 ? result.sg_putting / counts.putting : 0,
  };
}

/**
 * Estimate strokes gained from hole-level data when shot data is unavailable
 * This provides approximate SG values based on traditional stats
 */
export function estimateStrokesGainedFromHoles(holes: GolfHole[]): StrokesGainedResult {
  let sg_off_tee = 0;
  let sg_approach = 0;
  let sg_around_green = 0;
  let sg_putting = 0;

  for (const hole of holes) {
    const scoreToPar = hole.score - hole.par;

    // Estimate putting SG based on number of putts
    // Average PGA player takes ~1.75 putts per hole
    const expectedPutts = 1.75;
    const puttingSG = expectedPutts - hole.putts;
    sg_putting += puttingSG;

    // Estimate off the tee for par 4s and 5s
    if (hole.par >= 4) {
      if (hole.fairway_hit === true) {
        sg_off_tee += 0.2; // Hitting fairway is worth ~0.2 strokes
      } else if (hole.fairway_hit === false) {
        sg_off_tee -= 0.15; // Missing fairway costs ~0.15 strokes
      }
    }

    // Estimate approach based on GIR
    // Average scratch golfer hits ~66% GIR
    if (hole.green_in_regulation) {
      sg_approach += 0.25; // Hitting GIR is worth ~0.25 strokes
    } else {
      sg_approach -= 0.2; // Missing GIR costs ~0.2 strokes
    }

    // Estimate around the green based on up and down
    if (!hole.green_in_regulation) {
      if (hole.up_and_down === true) {
        sg_around_green += 0.5; // Getting up and down saves ~0.5 strokes
      } else if (hole.up_and_down === false) {
        sg_around_green -= 0.3; // Failing to get up and down costs ~0.3 strokes
      }
    }

    // Sand saves
    if (hole.sand_save === true) {
      sg_around_green += 0.3; // Sand save is worth extra
    } else if (hole.sand_save === false) {
      sg_around_green -= 0.4; // Failing sand save is costly
    }
  }

  return {
    sg_off_tee: Math.round(sg_off_tee * 100) / 100,
    sg_approach: Math.round(sg_approach * 100) / 100,
    sg_around_green: Math.round(sg_around_green * 100) / 100,
    sg_putting: Math.round(sg_putting * 100) / 100,
    sg_total: Math.round((sg_off_tee + sg_approach + sg_around_green + sg_putting) * 100) / 100,
  };
}

/**
 * Calculate strokes gained for a complete round
 */
export function calculateRoundStrokesGained(round: GolfRound): StrokesGainedResult {
  // If we have shot-level data, use precise calculation
  const allShots: GolfShot[] = [];
  const holes = round.holes || [];

  for (const hole of holes) {
    if (hole.shots && hole.shots.length > 0) {
      allShots.push(...hole.shots);
    }
  }

  if (allShots.length > 0) {
    return calculateStrokesGained(allShots, holes);
  }

  // Fall back to hole-level estimation
  if (holes.length > 0) {
    return estimateStrokesGainedFromHoles(holes);
  }

  // If no detailed data, return zeros
  return {
    sg_off_tee: 0,
    sg_approach: 0,
    sg_around_green: 0,
    sg_putting: 0,
    sg_total: 0,
  };
}

/**
 * Aggregate strokes gained across multiple rounds
 */
export function aggregateStrokesGained(rounds: GolfRound[]): StrokesGainedResult {
  if (rounds.length === 0) {
    return {
      sg_off_tee: 0,
      sg_approach: 0,
      sg_around_green: 0,
      sg_putting: 0,
      sg_total: 0,
    };
  }

  const totals: StrokesGainedResult = {
    sg_off_tee: 0,
    sg_approach: 0,
    sg_around_green: 0,
    sg_putting: 0,
    sg_total: 0,
  };

  for (const round of rounds) {
    const roundSG = calculateRoundStrokesGained(round);
    totals.sg_off_tee += roundSG.sg_off_tee;
    totals.sg_approach += roundSG.sg_approach;
    totals.sg_around_green += roundSG.sg_around_green;
    totals.sg_putting += roundSG.sg_putting;
    totals.sg_total += roundSG.sg_total;
  }

  // Return per-round averages
  const count = rounds.length;
  return {
    sg_off_tee: Math.round((totals.sg_off_tee / count) * 100) / 100,
    sg_approach: Math.round((totals.sg_approach / count) * 100) / 100,
    sg_around_green: Math.round((totals.sg_around_green / count) * 100) / 100,
    sg_putting: Math.round((totals.sg_putting / count) * 100) / 100,
    sg_total: Math.round((totals.sg_total / count) * 100) / 100,
  };
}

// ============================================
// COMPARISON FUNCTIONS
// ============================================

/**
 * Compare player's strokes gained to a baseline
 */
export function compareToBaseline(
  playerSG: StrokesGainedResult,
  baseline: 'scratch' | 'tour_avg' | 'amateur'
): StrokesGainedResult {
  // Scratch golfer = 0 SG (by definition)
  // Tour average is slightly positive (due to selection bias)
  // Amateur is typically negative
  const baselines: Record<string, StrokesGainedResult> = {
    scratch: {
      sg_off_tee: 0,
      sg_approach: 0,
      sg_around_green: 0,
      sg_putting: 0,
      sg_total: 0,
    },
    tour_avg: {
      sg_off_tee: 0.5,
      sg_approach: 0.5,
      sg_around_green: 0.3,
      sg_putting: 0.2,
      sg_total: 1.5,
    },
    amateur: {
      sg_off_tee: -0.8,
      sg_approach: -1.2,
      sg_around_green: -0.5,
      sg_putting: -0.3,
      sg_total: -2.8,
    },
  };

  const baselineData = baselines[baseline] || baselines.scratch;

  return {
    sg_off_tee: playerSG.sg_off_tee - baselineData.sg_off_tee,
    sg_approach: playerSG.sg_approach - baselineData.sg_approach,
    sg_around_green: playerSG.sg_around_green - baselineData.sg_around_green,
    sg_putting: playerSG.sg_putting - baselineData.sg_putting,
    sg_total: playerSG.sg_total - baselineData.sg_total,
  };
}

/**
 * Identify strengths and weaknesses based on strokes gained
 */
export function identifyStrengthsWeaknesses(sg: StrokesGainedResult): {
  strengths: string[];
  weaknesses: string[];
  primaryStrength: string | null;
  primaryWeakness: string | null;
} {
  const categories = [
    { key: 'sg_off_tee', label: 'Off the Tee', value: sg.sg_off_tee },
    { key: 'sg_approach', label: 'Approach', value: sg.sg_approach },
    { key: 'sg_around_green', label: 'Around the Green', value: sg.sg_around_green },
    { key: 'sg_putting', label: 'Putting', value: sg.sg_putting },
  ];

  // Sort by value to find best and worst
  const sorted = [...categories].sort((a, b) => b.value - a.value);

  const strengths = sorted.filter(c => c.value > 0.2).map(c => c.label);
  const weaknesses = sorted.filter(c => c.value < -0.2).map(c => c.label);

  return {
    strengths,
    weaknesses,
    primaryStrength: sorted[0].value > 0 ? sorted[0].label : null,
    primaryWeakness: sorted[sorted.length - 1].value < 0 ? sorted[sorted.length - 1].label : null,
  };
}

// ============================================
// FORMATTING FUNCTIONS
// ============================================

/**
 * Format strokes gained value for display
 */
export function formatStrokesGained(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

/**
 * Get color class based on strokes gained value
 */
export function getStrokesGainedColor(value: number): string {
  if (value >= 0.5) return 'text-green-600';
  if (value >= 0.1) return 'text-green-500';
  if (value >= -0.1) return 'text-gray-600';
  if (value >= -0.5) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Get background color class based on strokes gained value
 */
export function getStrokesGainedBgColor(value: number): string {
  if (value >= 0.5) return 'bg-green-100';
  if (value >= 0.1) return 'bg-green-50';
  if (value >= -0.1) return 'bg-gray-50';
  if (value >= -0.5) return 'bg-orange-50';
  return 'bg-red-50';
}
