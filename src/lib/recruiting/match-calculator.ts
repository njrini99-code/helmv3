/**
 * Match Calculator for Coach Recruiting Philosophy
 *
 * Calculates how well a player matches a coach's recruiting preferences
 * based on percentile rankings within grad year cohorts.
 */

import type {
  CoachRecruitingPhilosophy,
  PlayerPercentiles,
  PlayerMatchScore,
  MatchScoreBreakdown,
  Player,
  RecruitingMetricWeights,
} from '@/lib/types';

/**
 * Metric keys that can be weighted
 */
type MetricKey = keyof RecruitingMetricWeights;

/**
 * Mapping of metric keys to their weight field names in philosophy
 */
const WEIGHT_FIELDS: Record<MetricKey, keyof CoachRecruitingPhilosophy> = {
  exit_velocity: 'weight_exit_velocity',
  pitch_velocity: 'weight_pitch_velocity',
  sixty_time: 'weight_sixty_time',
  gpa: 'weight_gpa',
  height: 'weight_height',
  weight: 'weight_weight',
  arm_strength: 'weight_arm_strength',
};

/**
 * Mapping of metric keys to their percentile field names
 */
const PERCENTILE_FIELDS: Record<MetricKey, keyof PlayerPercentiles> = {
  exit_velocity: 'percentile_exit_velocity',
  pitch_velocity: 'percentile_pitch_velocity',
  sixty_time: 'percentile_sixty_time',
  gpa: 'percentile_gpa',
  height: 'percentile_height',
  weight: 'percentile_weight',
  arm_strength: 'percentile_arm_strength',
};

/**
 * Calculate the match score for a player against a coach's philosophy.
 *
 * The algorithm:
 * 1. For each metric the coach cares about (weight > 0):
 *    - Get the player's percentile for that metric
 *    - Multiply by the weight
 * 2. Sum all weighted percentiles and divide by total weight
 * 3. Apply position priority bonus (0-10 points)
 * 4. Apply geographic bonus (0-5 points)
 * 5. Check if player meets minimum standards
 *
 * @param player - Player data (for position, location checks)
 * @param percentiles - Player's percentile rankings
 * @param philosophy - Coach's recruiting philosophy
 * @returns Match score result with breakdown
 */
export function calculateMatchScore(
  player: Pick<Player, 'id' | 'primary_position' | 'secondary_position' | 'state' | 'gpa' | 'exit_velo' | 'pitch_velo' | 'sixty_time'>,
  percentiles: PlayerPercentiles | null,
  philosophy: CoachRecruitingPhilosophy
): PlayerMatchScore {
  // If no percentiles, return neutral score
  if (!percentiles) {
    return {
      player_id: player.id,
      match_score: 50,
      breakdown: {},
      meets_standards: true,
      position_bonus: 0,
      geographic_bonus: 0,
    };
  }

  // Calculate weighted score
  const { score: baseScore, breakdown } = calculateWeightedScore(percentiles, philosophy);

  // Calculate position bonus
  const positionBonus = calculatePositionBonus(
    player.primary_position,
    player.secondary_position,
    philosophy.position_priorities
  );

  // Calculate geographic bonus
  const geographicBonus = calculateGeographicBonus(
    player.state,
    philosophy.preferred_states
  );

  // Check minimum standards
  const meetsStandards = checkMinimumStandards(player, philosophy);

  // Final score: base + bonuses (capped at 100)
  // If doesn't meet standards, cap at 40
  let finalScore = baseScore + positionBonus + geographicBonus;

  if (!meetsStandards) {
    finalScore = Math.min(finalScore, 40);
  }

  finalScore = Math.min(100, Math.max(0, Math.round(finalScore)));

  return {
    player_id: player.id,
    match_score: finalScore,
    breakdown,
    meets_standards: meetsStandards,
    position_bonus: positionBonus,
    geographic_bonus: geographicBonus,
  };
}

/**
 * Calculate the weighted score from percentiles and weights.
 */
function calculateWeightedScore(
  percentiles: PlayerPercentiles,
  philosophy: CoachRecruitingPhilosophy
): { score: number; breakdown: MatchScoreBreakdown } {
  let totalWeight = 0;
  let weightedSum = 0;
  const breakdown: MatchScoreBreakdown = {};

  const metricKeys: MetricKey[] = [
    'exit_velocity',
    'pitch_velocity',
    'sixty_time',
    'gpa',
    'height',
    'weight',
    'arm_strength',
  ];

  for (const metric of metricKeys) {
    const weightField = WEIGHT_FIELDS[metric];
    const percentileField = PERCENTILE_FIELDS[metric];

    const weight = philosophy[weightField] as number;
    const percentile = percentiles[percentileField] as number | null;

    // Skip if no weight or no percentile data
    if (weight <= 0 || percentile === null) {
      continue;
    }

    const contribution = (percentile * weight) / 100; // Normalize contribution
    weightedSum += percentile * weight;
    totalWeight += weight;

    breakdown[metric] = {
      percentile,
      weight,
      contribution: Math.round(contribution * 10) / 10,
    };
  }

  // Calculate final weighted average
  const score = totalWeight > 0 ? weightedSum / totalWeight : 50;

  return {
    score: Math.round(score),
    breakdown,
  };
}

/**
 * Calculate bonus points for position priority.
 *
 * Position bonus scale:
 * - #1 priority: +10 points
 * - #2 priority: +8 points
 * - #3 priority: +6 points
 * - #4 priority: +4 points
 * - #5 priority: +2 points
 * - Not in priorities: 0 points
 *
 * Secondary position gets half the bonus.
 */
function calculatePositionBonus(
  primaryPosition: string | null | undefined,
  secondaryPosition: string | null | undefined,
  positionPriorities: string[]
): number {
  if (!positionPriorities || positionPriorities.length === 0) {
    return 0;
  }

  const bonusScale = [10, 8, 6, 4, 2];

  let bonus = 0;

  // Check primary position
  if (primaryPosition) {
    const primaryIndex = positionPriorities.indexOf(primaryPosition);
    if (primaryIndex !== -1 && primaryIndex < bonusScale.length) {
      bonus += bonusScale[primaryIndex] ?? 0;
    }
  }

  // Check secondary position (half bonus)
  if (secondaryPosition) {
    const secondaryIndex = positionPriorities.indexOf(secondaryPosition);
    if (secondaryIndex !== -1 && secondaryIndex < bonusScale.length) {
      bonus += Math.floor((bonusScale[secondaryIndex] ?? 0) / 2);
    }
  }

  return bonus;
}

/**
 * Calculate bonus points for geographic preference.
 *
 * Geographic bonus:
 * - In preferred states: +5 points
 * - Not in preferred states: 0 points
 */
function calculateGeographicBonus(
  playerState: string | null | undefined,
  preferredStates: string[]
): number {
  if (!preferredStates || preferredStates.length === 0 || !playerState) {
    return 0;
  }

  return preferredStates.includes(playerState) ? 5 : 0;
}

/**
 * Check if player meets minimum standards.
 */
function checkMinimumStandards(
  player: Pick<Player, 'gpa' | 'exit_velo' | 'pitch_velo' | 'sixty_time'>,
  philosophy: CoachRecruitingPhilosophy
): boolean {
  // Check GPA minimum
  if (philosophy.min_gpa !== null && player.gpa !== null) {
    const playerGpa = typeof player.gpa === 'string' ? parseFloat(player.gpa) : player.gpa;
    if (playerGpa < philosophy.min_gpa) {
      return false;
    }
  }

  // Check exit velocity minimum
  if (philosophy.min_exit_velocity !== null && player.exit_velo !== null) {
    const exitVelo = typeof player.exit_velo === 'string' ? parseFloat(player.exit_velo) : player.exit_velo;
    if (exitVelo < philosophy.min_exit_velocity) {
      return false;
    }
  }

  // Check pitch velocity minimum
  if (philosophy.min_pitch_velocity !== null && player.pitch_velo !== null) {
    const pitchVelo = typeof player.pitch_velo === 'string' ? parseFloat(player.pitch_velo) : player.pitch_velo;
    if (pitchVelo < philosophy.min_pitch_velocity) {
      return false;
    }
  }

  // Check 60-yard time maximum (lower is better)
  if (philosophy.max_sixty_time !== null && player.sixty_time !== null) {
    const sixtyTime = typeof player.sixty_time === 'string' ? parseFloat(player.sixty_time) : player.sixty_time;
    if (sixtyTime > philosophy.max_sixty_time) {
      return false;
    }
  }

  return true;
}

/**
 * Get match score tier for UI display.
 */
export function getMatchScoreTier(score: number): {
  tier: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
  label: string;
  color: string;
} {
  if (score >= 85) {
    return { tier: 'excellent', label: 'Excellent Match', color: 'text-green-600' };
  }
  if (score >= 70) {
    return { tier: 'good', label: 'Good Match', color: 'text-emerald-600' };
  }
  if (score >= 50) {
    return { tier: 'average', label: 'Average Match', color: 'text-amber-600' };
  }
  if (score >= 30) {
    return { tier: 'below_average', label: 'Below Average', color: 'text-orange-600' };
  }
  return { tier: 'poor', label: 'Poor Match', color: 'text-red-600' };
}

/**
 * Format match score for display.
 */
export function formatMatchScore(score: number): string {
  return `${Math.round(score)}%`;
}

/**
 * Calculate percentile from raw value within a dataset.
 * Used when recalculating percentiles on the fly.
 */
export function calculatePercentile(
  value: number,
  allValues: number[],
  higherIsBetter: boolean = true
): number {
  if (allValues.length === 0) return 50;

  const sortedValues = [...allValues].sort((a, b) => a - b);
  let rank = sortedValues.filter((v) => v < value).length;

  if (!higherIsBetter) {
    rank = sortedValues.length - rank - 1;
  }

  const percentile = (rank / (sortedValues.length - 1)) * 100;
  return Math.round(Math.max(0, Math.min(100, percentile)));
}

