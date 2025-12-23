/**
 * Golf Statistics Calculation Library
 *
 * Provides functions to calculate various golf statistics from round data.
 */

import type { GolfRound, GolfHole, GolfPlayerStats } from '@/lib/types/golf';

interface RoundWithHoles extends GolfRound {
  holes?: GolfHole[];
}

/**
 * Calculate comprehensive player statistics from rounds
 */
export function calculatePlayerStats(rounds: RoundWithHoles[]): GolfPlayerStats {
  if (!rounds || rounds.length === 0) {
    return {
      rounds_played: 0,
      scoring_average: 0,
      best_round: 0,
      worst_round: 0,
      putts_per_round: 0,
      fairways_hit_percentage: 0,
      greens_in_regulation_percentage: 0,
      handicap_index: undefined,
    };
  }

  const validRounds = rounds.filter(r => r.total_score !== null && r.total_score > 0);

  if (validRounds.length === 0) {
    return {
      rounds_played: 0,
      scoring_average: 0,
      best_round: 0,
      worst_round: 0,
      putts_per_round: 0,
      fairways_hit_percentage: 0,
      greens_in_regulation_percentage: 0,
      handicap_index: undefined,
    };
  }

  const scores = validRounds.map(r => r.total_score!);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const scoringAverage = totalScore / validRounds.length;
  const bestRound = Math.min(...scores);
  const worstRound = Math.max(...scores);

  // Putts statistics
  const roundsWithPutts = validRounds.filter(r => r.total_putts !== null);
  const puttsPerRound = roundsWithPutts.length > 0
    ? roundsWithPutts.reduce((sum, r) => sum + (r.total_putts || 0), 0) / roundsWithPutts.length
    : 0;

  // Fairways hit percentage
  const roundsWithFairways = validRounds.filter(
    r => r.fairways_hit !== null && r.fairways_total !== null && r.fairways_total > 0
  );
  const fairwaysHitPercentage = roundsWithFairways.length > 0
    ? (roundsWithFairways.reduce((sum, r) => sum + (r.fairways_hit || 0), 0) /
       roundsWithFairways.reduce((sum, r) => sum + (r.fairways_total || 1), 0)) * 100
    : 0;

  // Greens in regulation percentage
  const roundsWithGreens = validRounds.filter(
    r => r.greens_in_regulation !== null && r.greens_total !== null && r.greens_total > 0
  );
  const greensInRegPercentage = roundsWithGreens.length > 0
    ? (roundsWithGreens.reduce((sum, r) => sum + (r.greens_in_regulation || 0), 0) /
       roundsWithGreens.reduce((sum, r) => sum + (r.greens_total || 1), 0)) * 100
    : 0;

  // Handicap calculation (simplified USGA formula)
  const handicapIndex = calculateHandicapIndex(validRounds);

  return {
    rounds_played: validRounds.length,
    scoring_average: Math.round(scoringAverage * 10) / 10,
    best_round: bestRound,
    worst_round: worstRound,
    putts_per_round: Math.round(puttsPerRound * 10) / 10,
    fairways_hit_percentage: Math.round(fairwaysHitPercentage * 10) / 10,
    greens_in_regulation_percentage: Math.round(greensInRegPercentage * 10) / 10,
    handicap_index: handicapIndex,
  };
}

/**
 * Calculate handicap index using simplified USGA formula
 * Requires course rating and slope for accurate calculation
 */
export function calculateHandicapIndex(rounds: GolfRound[]): number | undefined {
  // Filter rounds with course rating and slope
  const eligibleRounds = rounds.filter(
    r => r.total_score !== null &&
         r.course_rating !== null &&
         r.course_slope !== null &&
         r.course_slope > 0
  );

  if (eligibleRounds.length < 3) {
    return undefined; // Need at least 3 rounds for handicap
  }

  // Calculate differentials
  const differentials = eligibleRounds.map(round => {
    const adjustedGrossScore = round.total_score!;
    const courseRating = round.course_rating!;
    const slopeRating = round.course_slope!;

    return ((adjustedGrossScore - courseRating) * 113) / slopeRating;
  });

  // Sort differentials lowest to highest
  differentials.sort((a, b) => a - b);

  // Number of differentials to use based on total rounds
  let numToUse: number;
  if (eligibleRounds.length >= 20) {
    numToUse = 10;
  } else if (eligibleRounds.length >= 10) {
    numToUse = Math.floor(eligibleRounds.length / 2);
  } else if (eligibleRounds.length >= 6) {
    numToUse = eligibleRounds.length - 2;
  } else {
    numToUse = 1;
  }

  // Average the best differentials
  const bestDifferentials = differentials.slice(0, numToUse);
  const average = bestDifferentials.reduce((sum, d) => sum + d, 0) / bestDifferentials.length;

  // Handicap Index is 96% of average
  const handicapIndex = average * 0.96;

  return Math.round(handicapIndex * 10) / 10;
}

/**
 * Calculate scoring trend (improving, declining, stable)
 */
export function calculateScoringTrend(rounds: GolfRound[]): 'improving' | 'declining' | 'stable' {
  if (rounds.length < 4) {
    return 'stable';
  }

  const validRounds = rounds
    .filter(r => r.total_score !== null && r.round_date)
    .sort((a, b) => new Date(a.round_date).getTime() - new Date(b.round_date).getTime());

  if (validRounds.length < 4) {
    return 'stable';
  }

  // Compare recent half to earlier half
  const midpoint = Math.floor(validRounds.length / 2);
  const earlierRounds = validRounds.slice(0, midpoint);
  const recentRounds = validRounds.slice(midpoint);

  const earlierAvg = earlierRounds.reduce((sum, r) => sum + r.total_score!, 0) / earlierRounds.length;
  const recentAvg = recentRounds.reduce((sum, r) => sum + r.total_score!, 0) / recentRounds.length;

  const difference = earlierAvg - recentAvg;

  // Threshold of 2 strokes to declare a trend
  if (difference > 2) {
    return 'improving'; // Recent scores are lower (better)
  } else if (difference < -2) {
    return 'declining'; // Recent scores are higher (worse)
  } else {
    return 'stable';
  }
}

/**
 * Get scoring distribution by score relative to par
 */
export function getScoringDistribution(holes: GolfHole[]) {
  const distribution = {
    eagles: 0,      // 2 under par
    birdies: 0,     // 1 under par
    pars: 0,        // Even par
    bogeys: 0,      // 1 over par
    doublePlus: 0,  // 2+ over par
  };

  holes.forEach(hole => {
    if (hole.score === null || hole.par === null) return;

    const toPar = hole.score - hole.par;

    if (toPar <= -2) {
      distribution.eagles++;
    } else if (toPar === -1) {
      distribution.birdies++;
    } else if (toPar === 0) {
      distribution.pars++;
    } else if (toPar === 1) {
      distribution.bogeys++;
    } else {
      distribution.doublePlus++;
    }
  });

  return distribution;
}

/**
 * Calculate team statistics
 */
export interface TeamStats {
  total_players: number;
  active_players: number;
  total_rounds: number;
  team_scoring_average: number;
  best_team_round: number | null;
  rounds_this_month: number;
}

export function calculateTeamStats(
  playerCount: number,
  activePlayerCount: number,
  rounds: GolfRound[]
): TeamStats {
  const validRounds = rounds.filter(r => r.total_score !== null && r.total_score > 0);

  const teamScoringAverage = validRounds.length > 0
    ? validRounds.reduce((sum, r) => sum + r.total_score!, 0) / validRounds.length
    : 0;

  const bestTeamRound = validRounds.length > 0
    ? Math.min(...validRounds.map(r => r.total_score!))
    : null;

  // Rounds this month
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const roundsThisMonth = validRounds.filter(r => {
    const roundDate = new Date(r.round_date);
    return roundDate >= firstDayOfMonth;
  }).length;

  return {
    total_players: playerCount,
    active_players: activePlayerCount,
    total_rounds: validRounds.length,
    team_scoring_average: Math.round(teamScoringAverage * 10) / 10,
    best_team_round: bestTeamRound,
    rounds_this_month: roundsThisMonth,
  };
}

/**
 * Get recent rounds (last N rounds)
 */
export function getRecentRounds(rounds: GolfRound[], count: number = 5): GolfRound[] {
  return rounds
    .filter(r => r.round_date)
    .sort((a, b) => new Date(b.round_date).getTime() - new Date(a.round_date).getTime())
    .slice(0, count);
}

/**
 * Calculate average by round type
 */
export function getAverageByRoundType(rounds: GolfRound[]) {
  const byType: Record<string, { total: number; count: number }> = {};

  rounds.forEach(round => {
    if (!round.total_score || !round.round_type) return;

    if (!byType[round.round_type]) {
      byType[round.round_type] = { total: 0, count: 0 };
    }

    byType[round.round_type].total += round.total_score;
    byType[round.round_type].count += 1;
  });

  const result: Record<string, number> = {};
  Object.keys(byType).forEach(type => {
    result[type] = Math.round((byType[type].total / byType[type].count) * 10) / 10;
  });

  return result;
}
