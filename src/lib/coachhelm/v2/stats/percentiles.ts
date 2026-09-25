/**
 * Percentile Rankings
 *
 * Functions for computing percentile ranks against team and platform
 * distributions, with automatic inversion for "lower is better" metrics.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PercentileMetric {
  team: number;
  /**
   * Percentile against a platform-wide distribution. Null when no separate
   * platform distribution was supplied: a team copy is not a second read.
   */
  platform: number | null;
  value: number;
  /** Size of the team distribution the team percentile was ranked in. */
  teamN: number;
}

export interface PercentileProfile {
  playerId: string;
  metrics: Record<string, PercentileMetric>;
}

/**
 * NUM-35: a percentile ranked among fewer than this many teammates is not
 * shown as a number. On a team of one or two, one outlier reads as the 0th or
 * 100th percentile. Matches the genome strand floor (TEAM_FLOOR = 5) and the
 * StandingBar team-marker floor.
 */
export const PERCENTILE_MIN_TEAM_N = 5;

/**
 * The team-percentile readout for a metric, or null when the team is too
 * small to rank against. Pure display helper, shared by every surface that
 * prints "Nth %ile".
 */
export function teamPercentileReadout(entry: { team: number; teamN?: number | null } | null | undefined): string | null {
  if (!entry || !Number.isFinite(entry.team)) return null;
  if (entry.teamN == null || entry.teamN < PERCENTILE_MIN_TEAM_N) return null;
  const n = Math.round(entry.team);
  const mod100 = n % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix} %ile`;
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
  'threePuttsPerRound',
  'penaltyStrokesPerRound',
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
  platformDistributions: Record<string, number[]> | null,
  playerId: string = '',
): PercentileProfile {
  const metrics: Record<string, PercentileMetric> = {};
  // A platform distribution that is the team one (same object) is not a
  // second read; report no platform percentile instead of a duplicate.
  const hasPlatform = platformDistributions != null && platformDistributions !== teamDistributions;

  for (const [metric, value] of Object.entries(playerMetrics)) {
    const teamDist = teamDistributions[metric] ?? [];
    const platformDist = hasPlatform ? platformDistributions[metric] ?? [] : [];

    let teamPercentile = calculatePercentile(value, teamDist);
    let platformPercentile: number | null =
      hasPlatform && platformDist.length > 0 ? calculatePercentile(value, platformDist) : null;

    // Invert for "lower is better" metrics
    if (LOWER_IS_BETTER.has(metric)) {
      teamPercentile = 100 - teamPercentile;
      if (platformPercentile !== null) platformPercentile = 100 - platformPercentile;
    }

    metrics[metric] = {
      team: Math.round(teamPercentile * 100) / 100,
      platform: platformPercentile === null ? null : Math.round(platformPercentile * 100) / 100,
      value,
      teamN: teamDist.length,
    };
  }

  return { playerId, metrics };
}
