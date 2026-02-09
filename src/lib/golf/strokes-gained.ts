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
  GolfShot as DbGolfShot,
  GolfHole as DbGolfHole,
  GolfRound as DbGolfRound,
} from '@/lib/types/golf';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { getBenchmarkData, SG_COMPARISON_BASELINES, type BenchmarkLevel } from './sg-benchmarks';

// ============================================
// LOCAL TYPE DEFINITIONS
// ============================================

/**
 * Lie types for strokes gained calculation
 */
export type LieType = 'tee' | 'fairway' | 'rough' | 'sand' | 'green';

/**
 * Baseline data structure for expected strokes from each lie type
 * Key is distance (yards for non-green, feet for green), value is expected strokes
 */
export type BaselineData = Record<LieType, Record<number, number>>;

/**
 * Internal shot representation for strokes gained calculations
 * Maps from database fields to calculation-friendly names
 * All distances are normalized to YARDS (green distances converted from feet)
 */
export interface SGShot {
  hole_id: string | null;
  shot_number: number;
  starting_lie: LieType;
  starting_distance_yards: number;
  ending_lie: LieType;
  ending_distance_yards: number;
  is_holed: boolean;
  is_penalty: boolean;
}

/**
 * Internal hole representation for strokes gained calculations
 * Maps from database fields to calculation-friendly names
 */
export interface SGHole {
  id: string;
  par: number;
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  up_and_down: boolean | null;
  sand_save: boolean | null;
  shots?: SGShot[];
}

/**
 * Internal round representation for strokes gained calculations
 */
export interface SGRound {
  holes: SGHole[];
}

/**
 * Normalize a distance value to yards, converting from feet if necessary.
 * The database stores distances with a companion unit field ('yards' | 'feet').
 * Putts are typically stored in feet; other shots in yards.
 */
function normalizeDistanceToYards(
  distance: number | null,
  unit: string | null
): number {
  if (distance == null) return 0;
  return unit === 'feet' ? distance / 3 : distance;
}

/**
 * Convert database shot to internal shot format.
 * Normalizes all distances to yards using the distance_unit_before/after fields.
 */
export function convertDbShot(shot: DbGolfShot): SGShot {
  return {
    hole_id: shot.hole_id,
    shot_number: shot.shot_number,
    starting_lie: mapLieType(shot.lie_before),
    starting_distance_yards: normalizeDistanceToYards(
      shot.distance_to_hole_before,
      shot.distance_unit_before
    ),
    ending_lie: mapLieType(shot.lie_after),
    ending_distance_yards: normalizeDistanceToYards(
      shot.distance_to_hole_after,
      shot.distance_unit_after
    ),
    is_holed: shot.putt_made === true || shot.result === 'holed' || shot.result === 'hole',
    is_penalty: shot.is_penalty === true,
  };
}

/**
 * E-2: Apply distance_to_hole_after fallback estimation.
 *
 * When a shot's distance_to_hole_after is null, we look at the NEXT shot
 * in the same hole: if the next shot has distance_to_hole_before, we use
 * that value as the current shot's ending distance.
 *
 * This rescues many null SG calculations, especially for approach shots
 * that land on the green (next shot is a putt with recorded distance).
 *
 * Call this on the full array of database shots BEFORE converting to SGShot[].
 */
export function applyDistanceAfterFallback(shots: DbGolfShot[]): DbGolfShot[] {
  // Sort by hole_id then shot_number to ensure correct ordering
  const sorted = [...shots].sort((a, b) => {
    if (a.hole_id !== b.hole_id) return (a.hole_id ?? '').localeCompare(b.hole_id ?? '');
    return a.shot_number - b.shot_number;
  });

  return sorted.map((shot, index) => {
    // Already has distance_to_hole_after — no fallback needed
    if (shot.distance_to_hole_after != null) return shot;

    // If holed, distance_after is 0 — convertDbShot handles this via is_holed
    if (shot.result === 'holed' || shot.result === 'hole' || shot.putt_made === true) return shot;

    // Look at the next shot in the same hole
    const nextShot = sorted[index + 1];
    if (!nextShot || nextShot.hole_id !== shot.hole_id) return shot;

    // Use next shot's distance_to_hole_before as this shot's distance_to_hole_after
    if (nextShot.distance_to_hole_before != null) {
      return {
        ...shot,
        distance_to_hole_after: nextShot.distance_to_hole_before,
        distance_unit_after: nextShot.distance_unit_before,
        // Also infer lie_after from next shot's lie_before if missing
        lie_after: shot.lie_after ?? nextShot.lie_before,
      };
    }

    return shot;
  });
}

/**
 * Convert database hole to internal hole format
 */
export function convertDbHole(hole: DbGolfHole, shots?: DbGolfShot[]): SGHole {
  return {
    id: hole.id,
    par: hole.par,
    score: hole.score ?? 0,
    putts: hole.putts ?? 0,
    fairway_hit: hole.fairway_hit,
    green_in_regulation: hole.gir,
    up_and_down: hole.up_and_down,
    sand_save: hole.sand_save,
    shots: shots?.map(convertDbShot),
  };
}

/**
 * Map database lie string to LieType enum.
 * Returns 'fairway' as default for unknown lie types (reasonable middle-ground baseline).
 * Note: null lies are also mapped to 'fairway' - callers should handle null lie_before
 * by checking shot data completeness before calling strokes gained calculations.
 */
export function mapLieType(lie: string | null): LieType {
  if (!lie) return 'fairway';
  const normalized = lie.toLowerCase();
  if (normalized === 'tee' || normalized === 'teebox') return 'tee';
  if (normalized === 'fairway') return 'fairway';
  if (normalized === 'rough' || normalized === 'primary_rough') return 'rough';
  if (normalized === 'sand' || normalized === 'bunker' || normalized === 'greenside_bunker' || normalized === 'fairway_bunker') return 'sand';
  if (normalized === 'green' || normalized === 'fringe') return 'green';
  if (normalized === 'recovery' || normalized === 'hazard' || normalized === 'penalty' || normalized === 'other') return 'rough';
  return 'fairway';
}

/**
 * Strokes gained result with breakdown by category
 */
export interface StrokesGainedResult {
  sg_off_tee: number;
  sg_approach: number;
  sg_around_green: number;
  sg_putting: number;
  sg_total: number;
}

/**
 * Extended strokes gained breakdown with shot counts and per-shot averages
 */
export interface StrokesGainedBreakdown extends StrokesGainedResult {
  shots_off_tee: number;
  shots_approach: number;
  shots_around_green: number;
  shots_putting: number;
  sg_per_shot_off_tee: number;
  sg_per_shot_approach: number;
  sg_per_shot_around_green: number;
  sg_per_shot_putting: number;
}

// Re-export database types for external use
export type { DbGolfShot as GolfShot, DbGolfHole as GolfHole, DbGolfRound as GolfRound };

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
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get expected strokes from a given lie and distance
 * Uses linear interpolation between known data points
 *
 * @param lie - The lie type (tee, fairway, rough, sand, green)
 * @param distanceYards - Distance to hole in yards
 * @param isOnGreen - Whether the shot is on the green
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour for backward compat)
 */
export function getExpectedStrokes(
  lie: LieType,
  distanceYards: number,
  isOnGreen: boolean = false,
  benchmarkLevel?: BenchmarkLevel
): number {
  const benchmarkData = benchmarkLevel
    ? getBenchmarkData(benchmarkLevel)
    : PGA_BASELINE_DATA;
  const baseline = benchmarkData[lie];
  if (!baseline) return 3.0; // Default fallback

  // For putting, convert yards to feet
  const distance = isOnGreen || lie === 'green'
    ? Math.round(distanceYards * 3) // Convert yards to feet
    : distanceYards;

  // Get sorted distances from baseline
  const distances = Object.keys(baseline)
    .map(Number)
    .sort((a, b) => b - a); // Sort descending

  // Handle empty baseline
  if (distances.length === 0) {
    return 3.0;
  }

  const maxDist = distances[0]!;
  const minDist = distances[distances.length - 1]!;

  // If distance is beyond max, extrapolate
  if (distance >= maxDist) {
    return baseline[maxDist] ?? 3.0;
  }

  // If distance is below min, use minimum
  if (distance <= minDist) {
    return baseline[minDist] ?? 3.0;
  }

  // Find surrounding data points and interpolate
  for (let i = 0; i < distances.length - 1; i++) {
    const upperDist = distances[i]!;
    const lowerDist = distances[i + 1]!;
    if (distance <= upperDist && distance >= lowerDist) {
      const upperStrokes = baseline[upperDist] ?? 3.0;
      const lowerStrokes = baseline[lowerDist] ?? 3.0;

      // Linear interpolation
      const ratio = (distance - lowerDist) / (upperDist - lowerDist);
      return lowerStrokes + ratio * (upperStrokes - lowerStrokes);
    }
  }

  // Fallback - shouldn't reach here
  return baseline[minDist] ?? 3.0;
}

/**
 * Calculate strokes gained for a single shot.
 * Returns null if the shot has insufficient data for accurate calculation.
 *
 * @param shot - The shot data
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour)
 */
export function calculateShotStrokesGained(
  shot: SGShot,
  benchmarkLevel?: BenchmarkLevel
): number | null {
  // Cannot calculate SG without a starting distance
  if (shot.starting_distance_yards <= 0 && shot.starting_lie !== 'green') {
    return null;
  }

  // Cannot calculate SG without an ending distance (unless holed)
  if (!shot.is_holed && shot.ending_distance_yards <= 0 && shot.ending_lie !== 'green') {
    return null;
  }

  const expectedBefore = getExpectedStrokes(
    shot.starting_lie,
    shot.starting_distance_yards,
    shot.starting_lie === 'green',
    benchmarkLevel
  );

  let expectedAfter: number;
  if (shot.is_holed) {
    expectedAfter = 0;
  } else {
    expectedAfter = getExpectedStrokes(
      shot.ending_lie,
      shot.ending_distance_yards,
      shot.ending_lie === 'green',
      benchmarkLevel
    );
  }

  // SG = Expected(before) - Expected(after) - 1
  // Positive = better than average, Negative = worse than average
  return expectedBefore - expectedAfter - 1;
}

/**
 * Categorize a shot into SG category
 */
export function categorizeShot(shot: SGShot, holePar: number): keyof StrokesGainedResult | null {
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
  // Note: green case already handled above
  if (shot.starting_distance_yards <= 30) {
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
 *
 * @param shots - Array of shots
 * @param holes - Array of holes (for par values)
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour)
 */
export function calculateStrokesGained(
  shots: SGShot[],
  holes: SGHole[],
  benchmarkLevel?: BenchmarkLevel
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
    const hole = shot.hole_id ? holeMap.get(shot.hole_id) : null;
    if (!hole) continue;

    const category = categorizeShot(shot, hole.par);
    if (!category) continue;

    const sg = calculateShotStrokesGained(shot, benchmarkLevel);
    if (sg == null) continue; // Skip shots with insufficient data
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
 *
 * @param shots - Array of shots
 * @param holes - Array of holes (for par values)
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour)
 */
export function calculateStrokesGainedBreakdown(
  shots: SGShot[],
  holes: SGHole[],
  benchmarkLevel?: BenchmarkLevel
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
    const hole = shot.hole_id ? holeMap.get(shot.hole_id) : null;
    if (!hole) continue;

    const category = categorizeShot(shot, hole.par);
    if (!category) continue;

    const sg = calculateShotStrokesGained(shot, benchmarkLevel);
    if (sg == null) continue; // Skip shots with insufficient data
    result[category] += sg;

    // Count shots per category (only for shots with valid SG)
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
export function estimateStrokesGainedFromHoles(holes: SGHole[]): StrokesGainedResult {
  let sg_off_tee = 0;
  let sg_approach = 0;
  let sg_around_green = 0;
  let sg_putting = 0;

  for (const hole of holes) {
    // Note: scoreToPar could be used for more sophisticated estimation
    // const scoreToPar = hole.score - hole.par;

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
 *
 * @param round - The round data with holes and shots
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour)
 */
export function calculateRoundStrokesGained(
  round: SGRound,
  benchmarkLevel?: BenchmarkLevel
): StrokesGainedResult {
  // If we have shot-level data, use precise calculation
  const allShots: SGShot[] = [];
  const holes = round.holes || [];

  for (const hole of holes) {
    if (hole.shots && hole.shots.length > 0) {
      allShots.push(...hole.shots);
    }
  }

  if (allShots.length > 0) {
    return calculateStrokesGained(allShots, holes, benchmarkLevel);
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
 *
 * @param rounds - Array of rounds
 * @param benchmarkLevel - Which benchmark set to use (default: pga_tour)
 */
export function aggregateStrokesGained(
  rounds: SGRound[],
  benchmarkLevel?: BenchmarkLevel
): StrokesGainedResult {
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
    const roundSG = calculateRoundStrokesGained(round, benchmarkLevel);
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
 * Compare player's strokes gained to a baseline.
 * Supports both legacy string baselines and new BenchmarkLevel system.
 */
export function compareToBaseline(
  playerSG: StrokesGainedResult,
  baseline: 'scratch' | 'tour_avg' | 'amateur' | BenchmarkLevel
): StrokesGainedResult {
  // Use comparison baselines from the benchmark config

  // Map legacy baseline names to BenchmarkLevel
  const benchmarkMap: Record<string, BenchmarkLevel> = {
    scratch: 'scratch',
    tour_avg: 'pga_tour',
    amateur: 'break_90',
    // All BenchmarkLevel values pass through as-is
    pga_tour: 'pga_tour',
    ncaa_d1: 'ncaa_d1',
    ncaa_d2: 'ncaa_d2',
    ncaa_d3: 'ncaa_d3',
    break_80: 'break_80',
    break_90: 'break_90',
    break_100: 'break_100',
  };

  const level = benchmarkMap[baseline] ?? 'scratch';
  const baselineData = SG_COMPARISON_BASELINES[level] ?? SG_COMPARISON_BASELINES.scratch;

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

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return {
    strengths,
    weaknesses,
    primaryStrength: best && best.value > 0 ? best.label : null,
    primaryWeakness: worst && worst.value < 0 ? worst.label : null,
  };
}

// ============================================
// STATISTICAL STRENGTHS & WEAKNESSES
// ============================================

/**
 * Rich statistical strength/weakness with stroke impact,
 * evidence, and shot-type/distance specificity.
 */
export interface StatisticalStrengthWeakness {
  category: string;           // e.g., "Approach 125-150 yds", "Putting 5-10ft"
  subcategory: string;        // e.g., "approach", "putting", "driving", "scrambling", "scoring"
  label: string;              // Human-readable: "GIR from 125-150 yards"
  detail: string;             // Specific insight: "Hitting 72% GIR (benchmark: 60%)"
  strokeImpact: number;       // Positive = gaining strokes, negative = losing strokes
  playerValue: number;        // The player's actual metric value
  benchmark: number;          // What they're compared against
  unit: string;               // "%", "strokes/round", "per round"
  trend?: 'improving' | 'declining' | 'stable';
  confidence: number;         // 0-1 how reliable this insight is
  recommendation?: string;    // What to do about it (for weaknesses)
}

// Benchmarks for college-level competitive golf
const COLLEGE_BENCHMARKS = {
  // Strokes Gained per round (vs scratch/par)
  sgTee: 0,
  sgApproach: 0,
  sgAroundGreen: 0,
  sgPutting: 0,

  // Putting make percentages
  puttMake0_3: 98,
  puttMake3_5: 75,
  puttMake5_10: 45,
  puttMake10_15: 25,
  puttMake15_20: 15,

  // GIR overall + by par
  girPct: 60,
  girPctPar3: 50,
  girPctPar4: 55,
  girPctPar5: 75,

  // GIR by distance
  girPct50_75: 85,
  girPct75_100: 75,
  girPct100_125: 70,
  girPct125_150: 60,
  girPct150_175: 50,
  girPct175_200: 40,
  girPct200_225: 30,
  girPct225Plus: 20,

  // GIR by lie
  girFromFairway: 68,
  girFromRough: 42,

  // Driving
  fairwayPct: 60,

  // Scrambling
  scramblingPct: 55,
  scramblingFromRough: 50,
  scramblingFromSand: 45,

  // Putting efficiency (strokes to hole out)
  puttEff5_10: 1.5,
  puttEff10_15: 1.8,
  puttEff15_20: 2.0,

  // Three putts
  threePuttsPerRound: 0.8,

  // Scoring
  birdiesPerRound: 3.0,
  doublePlusPerRound: 1.0,

  // Penalties
  penaltiesPerRound: 0.5,

  // Pressure
  qualifyingVsPracticeGap: 1.5,
};

interface StrengthWeaknessCandidate {
  category: string;
  subcategory: string;
  label: string;
  playerValue: number;
  benchmark: number;
  unit: string;
  /** Estimated strokes gained/lost per round from this metric */
  strokeImpact: number;
  /** How much data backs this up (0-1) */
  confidence: number;
  recommendation?: string;
}

/**
 * Generates rich, statistically-backed strengths and weaknesses
 * from detailed GolfStats. Analyzes 30+ specific metrics across
 * distance ranges, lies, and shot types.
 *
 * Returns top 3 strengths (positive stroke impact) and
 * top 3 weaknesses (negative stroke impact).
 */
export function generateStatisticalStrengthsWeaknesses(
  stats: GolfStats
): {
  strengths: StatisticalStrengthWeakness[];
  weaknesses: StatisticalStrengthWeakness[];
} {
  if (stats.roundsPlayed < 3) {
    return { strengths: [], weaknesses: [] };
  }

  const candidates: StrengthWeaknessCandidate[] = [];

  // ─── STROKES GAINED (broadest impact) ───────────────────────
  addSGCandidates(stats, candidates);

  // ─── PUTTING BY DISTANCE ────────────────────────────────────
  addPuttingCandidates(stats, candidates);

  // ─── GIR BY DISTANCE ───────────────────────────────────────
  addGIRCandidates(stats, candidates);

  // ─── GIR BY LIE ────────────────────────────────────────────
  addGIRByLieCandidates(stats, candidates);

  // ─── DRIVING ────────────────────────────────────────────────
  addDrivingCandidates(stats, candidates);

  // ─── SCRAMBLING ─────────────────────────────────────────────
  addScramblingCandidates(stats, candidates);

  // ─── SCORING PATTERNS ───────────────────────────────────────
  addScoringCandidates(stats, candidates);

  // ─── PRESSURE ───────────────────────────────────────────────
  addPressureCandidates(stats, candidates);

  // Split into strengths (positive impact) and weaknesses (negative impact)
  const strengths = candidates
    .filter(c => c.strokeImpact > 0.05)
    .sort((a, b) => b.strokeImpact - a.strokeImpact)
    .slice(0, 3)
    .map(toStatisticalSW);

  const weaknesses = candidates
    .filter(c => c.strokeImpact < -0.05)
    .sort((a, b) => a.strokeImpact - b.strokeImpact)
    .slice(0, 3)
    .map(toStatisticalSW);

  return { strengths, weaknesses };
}

function toStatisticalSW(c: StrengthWeaknessCandidate): StatisticalStrengthWeakness {
  const isStrength = c.strokeImpact > 0;
  const sign = c.strokeImpact >= 0 ? '+' : '';
  const impactStr = `${sign}${c.strokeImpact.toFixed(1)} strokes/round`;

  let detail: string;
  if (c.unit === '%') {
    detail = `${c.playerValue.toFixed(0)}% (benchmark: ${c.benchmark.toFixed(0)}%) — ${impactStr}`;
  } else if (c.unit === 'strokes/round') {
    detail = `${c.playerValue >= 0 ? '+' : ''}${c.playerValue.toFixed(2)} (benchmark: ${c.benchmark >= 0 ? '+' : ''}${c.benchmark.toFixed(2)}) — ${impactStr}`;
  } else if (c.unit === 'per round') {
    detail = `${c.playerValue.toFixed(1)} per round (benchmark: ${c.benchmark.toFixed(1)}) — ${impactStr}`;
  } else {
    detail = `${c.playerValue.toFixed(1)} ${c.unit} (benchmark: ${c.benchmark.toFixed(1)}) — ${impactStr}`;
  }

  return {
    category: c.category,
    subcategory: c.subcategory,
    label: c.label,
    detail,
    strokeImpact: c.strokeImpact,
    playerValue: c.playerValue,
    benchmark: c.benchmark,
    unit: c.unit,
    confidence: c.confidence,
    recommendation: isStrength ? undefined : c.recommendation,
  };
}

// ── Strokes Gained ──────────────────────────────────────────────────────────

function addSGCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  const sgEntries: Array<{
    key: string;
    label: string;
    value: number | null;
    benchmark: number;
    rec: string;
  }> = [
    { key: 'tee', label: 'SG: Off the Tee', value: stats.sgTeePerRound, benchmark: COLLEGE_BENCHMARKS.sgTee, rec: 'Focus on tee shot accuracy: fairway hitting drills and club selection.' },
    { key: 'approach', label: 'SG: Approach', value: stats.sgApproachPerRound, benchmark: COLLEGE_BENCHMARKS.sgApproach, rec: 'Work on iron play from various distances and lies.' },
    { key: 'around', label: 'SG: Around the Green', value: stats.sgAroundGreenPerRound, benchmark: COLLEGE_BENCHMARKS.sgAroundGreen, rec: 'Dedicate practice to chipping and pitching within 30 yards.' },
    { key: 'putting', label: 'SG: Putting', value: stats.sgPuttingPerRound, benchmark: COLLEGE_BENCHMARKS.sgPutting, rec: 'Invest in putting practice, especially distance control.' },
  ];

  for (const entry of sgEntries) {
    if (entry.value === null) continue;
    // SG is already in strokes/round - value IS the impact
    candidates.push({
      category: entry.label,
      subcategory: entry.key === 'tee' ? 'driving' : entry.key === 'around' ? 'scrambling' : entry.key,
      label: entry.label,
      playerValue: entry.value,
      benchmark: entry.benchmark,
      unit: 'strokes/round',
      strokeImpact: entry.value - entry.benchmark, // positive = gaining
      confidence: Math.min(1, stats.roundsPlayed / 10),
      recommendation: entry.rec,
    });
  }
}

// ── Putting by Distance ──────────────────────────────────────────────────────

function addPuttingCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  const puttRanges: Array<{
    label: string;
    value: number | null;
    benchmark: number;
    puttsPerRound: number;
  }> = [
    { label: 'Putting 0-3ft', value: stats.puttMakePct0_3, benchmark: COLLEGE_BENCHMARKS.puttMake0_3, puttsPerRound: 4.5 },
    { label: 'Putting 3-5ft', value: stats.puttMakePct3_5, benchmark: COLLEGE_BENCHMARKS.puttMake3_5, puttsPerRound: 2.5 },
    { label: 'Putting 5-10ft', value: stats.puttMakePct5_10, benchmark: COLLEGE_BENCHMARKS.puttMake5_10, puttsPerRound: 3.0 },
    { label: 'Putting 10-15ft', value: stats.puttMakePct10_15, benchmark: COLLEGE_BENCHMARKS.puttMake10_15, puttsPerRound: 2.0 },
    { label: 'Putting 15-20ft', value: stats.puttMakePct15_20, benchmark: COLLEGE_BENCHMARKS.puttMake15_20, puttsPerRound: 1.5 },
  ];

  for (const range of puttRanges) {
    if (range.value === null) continue;
    // Each % point of make rate saves ~0.01 strokes per putt in that range
    const deltaPct = range.value - range.benchmark;
    const strokeImpact = (deltaPct / 100) * range.puttsPerRound;

    candidates.push({
      category: range.label,
      subcategory: 'putting',
      label: range.label + ' make rate',
      playerValue: range.value,
      benchmark: range.benchmark,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 8),
      recommendation: deltaPct < 0
        ? `Practice putts in this range. ${Math.abs(deltaPct).toFixed(0)}% below benchmark.`
        : undefined,
    });
  }

  // Three-putts
  if (stats.threePuttsPerRound !== null) {
    const delta = COLLEGE_BENCHMARKS.threePuttsPerRound - stats.threePuttsPerRound;
    // Each three-putt costs ~1 extra stroke
    const strokeImpact = delta;
    candidates.push({
      category: 'Three-Putt Avoidance',
      subcategory: 'putting',
      label: 'Three-putts per round',
      playerValue: stats.threePuttsPerRound,
      benchmark: COLLEGE_BENCHMARKS.threePuttsPerRound,
      unit: 'per round',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: delta < 0
        ? `Averaging ${stats.threePuttsPerRound.toFixed(1)} three-putts/round. Work on lag putting to get inside 3ft.`
        : undefined,
    });
  }
}

// ── GIR by Distance ──────────────────────────────────────────────────────────

function addGIRCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  const girRanges: Array<{
    label: string;
    value: number | null;
    benchmark: number;
    approachesPerRound: number;
  }> = [
    { label: 'GIR 50-75 yds', value: stats.girPct50_75, benchmark: COLLEGE_BENCHMARKS.girPct50_75, approachesPerRound: 1.5 },
    { label: 'GIR 75-100 yds', value: stats.girPct75_100, benchmark: COLLEGE_BENCHMARKS.girPct75_100, approachesPerRound: 2.0 },
    { label: 'GIR 100-125 yds', value: stats.girPct100_125, benchmark: COLLEGE_BENCHMARKS.girPct100_125, approachesPerRound: 2.5 },
    { label: 'GIR 125-150 yds', value: stats.girPct125_150, benchmark: COLLEGE_BENCHMARKS.girPct125_150, approachesPerRound: 3.0 },
    { label: 'GIR 150-175 yds', value: stats.girPct150_175, benchmark: COLLEGE_BENCHMARKS.girPct150_175, approachesPerRound: 2.5 },
    { label: 'GIR 175-200 yds', value: stats.girPct175_200, benchmark: COLLEGE_BENCHMARKS.girPct175_200, approachesPerRound: 2.0 },
    { label: 'GIR 200-225 yds', value: stats.girPct200_225, benchmark: COLLEGE_BENCHMARKS.girPct200_225, approachesPerRound: 1.0 },
    { label: 'GIR 225+ yds', value: stats.girPct225Plus, benchmark: COLLEGE_BENCHMARKS.girPct225Plus, approachesPerRound: 0.5 },
  ];

  for (const range of girRanges) {
    if (range.value === null) continue;
    // Missing a GIR costs ~0.4 strokes on average (scramble vs birdie putt)
    const deltaPct = range.value - range.benchmark;
    const strokeImpact = (deltaPct / 100) * range.approachesPerRound * 0.4;

    candidates.push({
      category: range.label,
      subcategory: 'approach',
      label: range.label,
      playerValue: range.value,
      benchmark: range.benchmark,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 8),
      recommendation: deltaPct < 0
        ? `Hitting ${range.value.toFixed(0)}% GIR at this distance (${Math.abs(deltaPct).toFixed(0)}% below target). Focus on this distance range in practice.`
        : undefined,
    });
  }
}

// ── GIR by Lie ──────────────────────────────────────────────────────────────

function addGIRByLieCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (stats.girPctFromFairway !== null) {
    const deltaPct = stats.girPctFromFairway - COLLEGE_BENCHMARKS.girFromFairway;
    // Roughly 8 approaches per round from the fairway
    const strokeImpact = (deltaPct / 100) * 8 * 0.4;
    candidates.push({
      category: 'GIR from Fairway',
      subcategory: 'approach',
      label: 'GIR when hitting from fairway',
      playerValue: stats.girPctFromFairway,
      benchmark: COLLEGE_BENCHMARKS.girFromFairway,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Only ${stats.girPctFromFairway.toFixed(0)}% GIR from the fairway. Iron play needs work even from good lies.`
        : undefined,
    });
  }

  if (stats.girPctFromRough !== null) {
    const deltaPct = stats.girPctFromRough - COLLEGE_BENCHMARKS.girFromRough;
    // Roughly 4 approaches per round from the rough
    const strokeImpact = (deltaPct / 100) * 4 * 0.4;
    candidates.push({
      category: 'GIR from Rough',
      subcategory: 'approach',
      label: 'GIR when hitting from rough',
      playerValue: stats.girPctFromRough,
      benchmark: COLLEGE_BENCHMARKS.girFromRough,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Only ${stats.girPctFromRough.toFixed(0)}% GIR from rough (benchmark: ${COLLEGE_BENCHMARKS.girFromRough}%). Practice iron shots from thick lies.`
        : undefined,
    });
  }
}

// ── Driving ──────────────────────────────────────────────────────────────────

function addDrivingCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (stats.fairwayPercentage !== null) {
    const deltaPct = stats.fairwayPercentage - COLLEGE_BENCHMARKS.fairwayPct;
    // ~14 fairway opportunities per round, missing costs ~0.3 strokes (rough vs fairway approach)
    const strokeImpact = (deltaPct / 100) * 14 * 0.3;

    candidates.push({
      category: 'Fairway Accuracy',
      subcategory: 'driving',
      label: 'Fairway hit percentage',
      playerValue: stats.fairwayPercentage,
      benchmark: COLLEGE_BENCHMARKS.fairwayPct,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Hitting ${stats.fairwayPercentage.toFixed(0)}% fairways. Consider club selection off the tee and alignment drills.`
        : undefined,
    });
  }

  // Driving miss pattern (if heavily one-sided)
  if (stats.missLeftPct !== null && stats.missRightPct !== null) {
    const totalMisses = stats.missLeftCount + stats.missRightCount;
    if (totalMisses > 10) {
      const leftPct = stats.missLeftPct;
      const rightPct = stats.missRightPct;
      const dominant = leftPct > rightPct ? 'left' : 'right';
      const dominantPct = Math.max(leftPct, rightPct);

      // Only flag if miss pattern is heavily one-sided (>65%)
      if (dominantPct > 65) {
        candidates.push({
          category: `Tee Shot Miss Pattern`,
          subcategory: 'driving',
          label: `Misses ${dominant} ${dominantPct.toFixed(0)}% of the time`,
          playerValue: dominantPct,
          benchmark: 50, // Balanced is 50/50
          unit: '%',
          // A one-sided miss pattern costs about 0.2-0.3 strokes (harder to play for one shape)
          strokeImpact: -0.2,
          confidence: Math.min(1, totalMisses / 30),
          recommendation: `${dominantPct.toFixed(0)}% of tee shot misses go ${dominant}. Work with coach on swing path and face angle to develop a more balanced shot shape.`,
        });
      }
    }
  }

  // Penalties
  if (stats.penaltiesPerRound !== null) {
    const delta = COLLEGE_BENCHMARKS.penaltiesPerRound - stats.penaltiesPerRound;
    // Each penalty costs ~1 stroke
    const strokeImpact = delta;
    if (Math.abs(delta) > 0.1) {
      candidates.push({
        category: 'Penalty Avoidance',
        subcategory: 'driving',
        label: 'Penalties per round',
        playerValue: stats.penaltiesPerRound,
        benchmark: COLLEGE_BENCHMARKS.penaltiesPerRound,
        unit: 'per round',
        strokeImpact,
        confidence: Math.min(1, stats.roundsPlayed / 6),
        recommendation: delta < 0
          ? `Averaging ${stats.penaltiesPerRound.toFixed(1)} penalties/round. Course management and conservative club choices on tight holes.`
          : undefined,
      });
    }
  }
}

// ── Scrambling ──────────────────────────────────────────────────────────────

function addScramblingCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (stats.scramblingPercentage !== null) {
    const deltaPct = stats.scramblingPercentage - COLLEGE_BENCHMARKS.scramblingPct;
    // ~7 scramble attempts per round (18 holes * ~40% miss GIR), each failed scramble costs ~0.5 strokes
    const scrambleAttempts = Math.max(1, stats.scrambleAttempts / Math.max(1, stats.roundsPlayed));
    const strokeImpact = (deltaPct / 100) * scrambleAttempts * 0.5;

    candidates.push({
      category: 'Overall Scrambling',
      subcategory: 'scrambling',
      label: 'Scrambling percentage',
      playerValue: stats.scramblingPercentage,
      benchmark: COLLEGE_BENCHMARKS.scramblingPct,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Scrambling at ${stats.scramblingPercentage.toFixed(0)}% (target: ${COLLEGE_BENCHMARKS.scramblingPct}%). Focus on up-and-down practice from common miss areas.`
        : undefined,
    });
  }

  // Scrambling from sand
  if (stats.sandSavePercentage !== null && stats.sandSaveAttempts >= 5) {
    const deltaPct = stats.sandSavePercentage - COLLEGE_BENCHMARKS.scramblingFromSand;
    const sandAttempts = stats.sandSaveAttempts / Math.max(1, stats.roundsPlayed);
    const strokeImpact = (deltaPct / 100) * sandAttempts * 0.5;

    candidates.push({
      category: 'Sand Saves',
      subcategory: 'scrambling',
      label: 'Sand save percentage',
      playerValue: stats.sandSavePercentage,
      benchmark: COLLEGE_BENCHMARKS.scramblingFromSand,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.sandSaveAttempts / 15),
      recommendation: deltaPct < 0
        ? `Sand save rate ${stats.sandSavePercentage.toFixed(0)}% (target: ${COLLEGE_BENCHMARKS.scramblingFromSand}%). Prioritize greenside bunker practice.`
        : undefined,
    });
  }
}

// ── Scoring Patterns ────────────────────────────────────────────────────────

function addScoringCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  // Birdie rate
  if (stats.birdiesPerRound !== null) {
    const delta = stats.birdiesPerRound - COLLEGE_BENCHMARKS.birdiesPerRound;
    // Each extra birdie saves 1 stroke
    candidates.push({
      category: 'Birdie Making',
      subcategory: 'scoring',
      label: 'Birdies per round',
      playerValue: stats.birdiesPerRound,
      benchmark: COLLEGE_BENCHMARKS.birdiesPerRound,
      unit: 'per round',
      strokeImpact: delta,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: delta < 0
        ? `Averaging ${stats.birdiesPerRound.toFixed(1)} birdies/round (target: ${COLLEGE_BENCHMARKS.birdiesPerRound}). Attack par 5s and short par 4s more aggressively.`
        : undefined,
    });
  }

  // Double bogey+ rate (big number avoidance)
  if (stats.doublePlusPerRound !== null) {
    const delta = COLLEGE_BENCHMARKS.doublePlusPerRound - stats.doublePlusPerRound;
    // Each double bogey costs ~2 strokes vs par
    const strokeImpact = delta * 2;
    if (Math.abs(strokeImpact) > 0.1) {
      candidates.push({
        category: 'Big Number Avoidance',
        subcategory: 'scoring',
        label: 'Doubles+ per round',
        playerValue: stats.doublePlusPerRound,
        benchmark: COLLEGE_BENCHMARKS.doublePlusPerRound,
        unit: 'per round',
        strokeImpact,
        confidence: Math.min(1, stats.roundsPlayed / 6),
        recommendation: delta < 0
          ? `Averaging ${stats.doublePlusPerRound.toFixed(1)} double bogeys+/round. Focus on course management and avoiding big mistakes.`
          : undefined,
      });
    }
  }

  // Par 5 GIR (scoring opportunities)
  if (stats.girPctPar5 !== null) {
    const deltaPct = stats.girPctPar5 - COLLEGE_BENCHMARKS.girPctPar5;
    // ~4 par 5s per round, GIR on par 5 creates eagle/birdie chances
    const strokeImpact = (deltaPct / 100) * 4 * 0.5;

    candidates.push({
      category: 'Par 5 GIR',
      subcategory: 'scoring',
      label: 'GIR on par 5s',
      playerValue: stats.girPctPar5,
      benchmark: COLLEGE_BENCHMARKS.girPctPar5,
      unit: '%',
      strokeImpact,
      confidence: Math.min(1, stats.roundsPlayed / 6),
      recommendation: deltaPct < 0
        ? `Only ${stats.girPctPar5.toFixed(0)}% GIR on par 5s (target: ${COLLEGE_BENCHMARKS.girPctPar5}%). These are scoring holes — work on long approach play.`
        : undefined,
    });
  }
}

// ── Pressure Performance ────────────────────────────────────────────────────

function addPressureCandidates(stats: GolfStats, candidates: StrengthWeaknessCandidate[]): void {
  if (
    stats.qualifyingScoringAvg !== null &&
    stats.practiceScoringAvg !== null &&
    stats.qualifyingRounds >= 3 &&
    stats.practiceRounds >= 3
  ) {
    const gap = stats.qualifyingScoringAvg - stats.practiceScoringAvg;
    // Gap directly translates to strokes lost in competition
    if (Math.abs(gap) > 0.5) {
      candidates.push({
        category: 'Pressure Performance',
        subcategory: 'scoring',
        label: 'Qualifying vs practice scoring gap',
        playerValue: gap,
        benchmark: COLLEGE_BENCHMARKS.qualifyingVsPracticeGap,
        unit: 'strokes',
        strokeImpact: gap > COLLEGE_BENCHMARKS.qualifyingVsPracticeGap ? -(gap - COLLEGE_BENCHMARKS.qualifyingVsPracticeGap) : 0,
        confidence: Math.min(1, Math.min(stats.qualifyingRounds, stats.practiceRounds) / 5),
        recommendation: gap > COLLEGE_BENCHMARKS.qualifyingVsPracticeGap
          ? `Scoring ${gap.toFixed(1)} strokes higher in qualifying than practice. Work on pre-round routines, on-course mental game, and simulating pressure in practice.`
          : undefined,
      });
    }
  }
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
