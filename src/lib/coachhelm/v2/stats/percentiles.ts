/**
 * Percentile Rankings
 *
 * Functions for computing percentile ranks against team and platform
 * distributions, with automatic inversion for "lower is better" metrics.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PercentileProfile {
  playerId: string;
  metrics: Record<string, { team: number; platform: number; value: number }>;
}

// ============================================================================
// "LOWER IS BETTER" METRICS
// ============================================================================

/**
 * Metrics where a lower value indicates better performance.
 * Percentiles for these are inverted (100 - raw percentile).
 */
const LOWER_IS_BETTER: Set<string> = new Set([
  'scoringAvg',
  'puttsPerRound',
  'proximityToHole',
  'bogeyRate',
  'doubleBogeyRate',
  'penaltyRate',
]);

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * Calculate the percentile rank of a value within a distribution.
 *
 * Percentile = (count of values strictly below target / total count) * 100
 *
 * Returns a value in [0, 100].
 */
export function calculatePercentile(
  value: number,
  distribution: number[],
): number {
  if (distribution.length === 0) return 50;

  const countBelow = distribution.filter((v) => v < value).length;
  return (countBelow / distribution.length) * 100;
}

/**
 * Build a complete percentile profile for a player.
 *
 * For each metric in playerMetrics, computes the percentile against
 * both the team distribution and the platform-wide distribution.
 *
 * "Lower is better" metrics (e.g., scoringAvg, puttsPerRound) are
 * automatically inverted so that a higher percentile always means
 * better performance.
 */
export function buildPercentileProfile(
  playerMetrics: Record<string, number>,
  teamDistributions: Record<string, number[]>,
  platformDistributions: Record<string, number[]>,
  playerId: string = '',
): PercentileProfile {
  const metrics: Record<string, { team: number; platform: number; value: number }> = {};

  for (const [metric, value] of Object.entries(playerMetrics)) {
    const teamDist = teamDistributions[metric] ?? [];
    const platformDist = platformDistributions[metric] ?? [];

    let teamPercentile = calculatePercentile(value, teamDist);
    let platformPercentile = calculatePercentile(value, platformDist);

    // Invert for "lower is better" metrics
    if (LOWER_IS_BETTER.has(metric)) {
      teamPercentile = 100 - teamPercentile;
      platformPercentile = 100 - platformPercentile;
    }

    metrics[metric] = {
      team: Math.round(teamPercentile * 100) / 100,
      platform: Math.round(platformPercentile * 100) / 100,
      value,
    };
  }

  return { playerId, metrics };
}
