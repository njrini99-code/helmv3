/**
 * Contextual Feature Extraction
 *
 * Infers higher-level contextual features including:
 * - Confidence level estimation
 * - Form cycle detection (peak, rising, declining, trough)
 * - Pressure exposure and clutch factor
 * - Competitive vs practice performance
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { ContextualFeatures, TemporalFeatures, SequenceFeatures } from '../types';

function normalizeRoundType(roundType?: string | null): string | null {
  if (!roundType) return roundType ?? null;
  return roundType === 'qualifying' ? 'qualifier' : roundType;
}

/**
 * Extracts contextual features for a player
 *
 * @param playerId - The player's UUID
 * @param temporalFeatures - Already extracted temporal features
 * @param sequenceFeatures - Already extracted sequence features
 * @returns Contextual features or null if insufficient data
 */
export async function extractContextualFeatures(
  playerId: string,
  temporalFeatures?: TemporalFeatures | null,
  sequenceFeatures?: SequenceFeatures | null
): Promise<ContextualFeatures | null> {
  // Admin client — analyzePlayer runs in cookie-less cron / fire-and-forget
  // contexts where RLS would block every read. See V1/A2 audit notes.
  const supabase = createAdminClient();

  // Get rounds with event context
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id, total_score, score_to_par, round_date, round_type')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', ninetyDaysAgo.toISOString())
    .order('round_date', { ascending: false });

  if (roundsError || !rounds || rounds.length < 3) {
    return null;
  }

  // Determine confidence level
  const confidenceLevel = determineConfidenceLevel(
    rounds,
    temporalFeatures,
    sequenceFeatures
  );

  // Determine form cycle
  const formCycle = determineFormCycle(temporalFeatures);

  // Calculate pressure exposure and clutch factor
  const { pressureExposure, clutchFactor } = calculatePressureMetrics(rounds);

  // Calculate competitive index
  const competitiveIndex = calculateCompetitiveIndex(rounds);

  // Calculate practice vs tournament ratio
  const practiceVsTournament = calculatePracticeVsTournament(rounds);

  return {
    confidenceLevel,
    formCycle,
    pressureExposure,
    clutchFactor,
    competitiveIndex,
    practiceVsTournament,
  };
}

/**
 * Determines player's current confidence level
 */
function determineConfidenceLevel(
  rounds: Array<{
    score_to_par: number | null;
    round_type?: string | null;
  }>,
  temporalFeatures?: TemporalFeatures | null,
  sequenceFeatures?: SequenceFeatures | null
): 'high' | 'medium' | 'low' {
  let confidenceScore = 0.5; // Start neutral

  // Factor 1: Recent form (from temporal features)
  if (temporalFeatures) {
    if (temporalFeatures.recentFormScore > 0.3) {
      confidenceScore += 0.2;
    } else if (temporalFeatures.recentFormScore < -0.3) {
      confidenceScore -= 0.2;
    }

    // Low volatility = more confidence
    if (temporalFeatures.volatility7Day < 3) {
      confidenceScore += 0.1;
    } else if (temporalFeatures.volatility7Day > 6) {
      confidenceScore -= 0.1;
    }
  }

  // Factor 2: Bogey recovery (from sequence features)
  if (sequenceFeatures) {
    // Good bogey recovery shows mental strength
    if (sequenceFeatures.bogeyFollowUpPar > 0.5) {
      confidenceScore += 0.1;
    }
    // Bogey trains indicate struggling confidence
    if (sequenceFeatures.bogeyFollowUpBogey > 0.3) {
      confidenceScore -= 0.1;
    }
  }

  // Factor 3: Recent scores relative to average
  const recentScores = rounds.slice(0, 3).map((r) => r.score_to_par ?? 0);
  const avgRecent =
    recentScores.length > 0
      ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length
      : 0;

  if (avgRecent < 2) {
    confidenceScore += 0.1;
  } else if (avgRecent > 6) {
    confidenceScore -= 0.15;
  }

  // Convert to category
  if (confidenceScore >= 0.65) return 'high';
  if (confidenceScore <= 0.35) return 'low';
  return 'medium';
}

/**
 * Determines form cycle position
 */
function determineFormCycle(
  temporalFeatures?: TemporalFeatures | null
): 'peak' | 'rising' | 'declining' | 'trough' | 'stable' {
  if (!temporalFeatures) return 'stable';

  const { recentFormScore, formMomentum, scoringTrend7Day } = temporalFeatures;

  // Peak: high form, slowing momentum
  if (recentFormScore > 0.5 && formMomentum < 0) {
    return 'peak';
  }

  // Rising: improving form with positive momentum
  if (recentFormScore > 0 && formMomentum > 0) {
    return 'rising';
  }

  // Declining: form dropping with negative momentum
  if (recentFormScore < 0 && formMomentum < 0) {
    return 'declining';
  }

  // Trough: low form, starting to recover
  if (recentFormScore < -0.5 && formMomentum > 0) {
    return 'trough';
  }

  // Stable: low volatility and minimal trend
  if (Math.abs(scoringTrend7Day) < 0.3 && Math.abs(formMomentum) < 0.5) {
    return 'stable';
  }

  // Default based on recent form
  if (recentFormScore > 0.3) return 'rising';
  if (recentFormScore < -0.3) return 'declining';
  return 'stable';
}

/**
 * Calculates pressure exposure and clutch factor
 */
function calculatePressureMetrics(
  rounds: Array<{
    score_to_par: number | null;
    round_type?: string | null;
  }>
): { pressureExposure: number; clutchFactor: number } {
  // Identify pressure rounds (tournaments, qualifying, etc.)
  const pressureRounds = rounds.filter((r) => {
    const roundType = normalizeRoundType(r.round_type);
    return (
      roundType === 'tournament' ||
      roundType === 'qualifier' ||
      roundType === 'competition'
    );
  });

  const nonPressureRounds = rounds.filter((r) => {
    const roundType = normalizeRoundType(r.round_type);
    return (
      roundType !== 'tournament' &&
      roundType !== 'qualifier' &&
      roundType !== 'competition'
    );
  });

  // Pressure exposure: percentage of rounds that are high-pressure
  const pressureExposure =
    rounds.length > 0 ? pressureRounds.length / rounds.length : 0;

  // Clutch factor: performance in pressure vs non-pressure
  let clutchFactor = 1.0; // 1.0 = same, >1 = better under pressure

  if (pressureRounds.length > 0 && nonPressureRounds.length > 0) {
    const pressureAvg =
      pressureRounds.reduce((a, r) => a + (r.score_to_par ?? 0), 0) /
      pressureRounds.length;
    const nonPressureAvg =
      nonPressureRounds.reduce((a, r) => a + (r.score_to_par ?? 0), 0) /
      nonPressureRounds.length;

    // Lower is better, so if pressure avg is lower, clutch factor > 1
    if (pressureAvg !== 0 && nonPressureAvg !== 0) {
      clutchFactor = nonPressureAvg / pressureAvg;
    }

    // Clamp to reasonable range
    clutchFactor = Math.max(0.5, Math.min(1.5, clutchFactor));
  }

  return { pressureExposure, clutchFactor };
}

/**
 * Calculates competitive index (how often in competitive rounds)
 */
function calculateCompetitiveIndex(
  rounds: Array<{
    round_type?: string | null;
  }>
): number {
  if (rounds.length === 0) return 0;

  const competitiveRounds = rounds.filter((r) => {
    const roundType = normalizeRoundType(r.round_type);
    return (
      roundType === 'tournament' ||
      roundType === 'qualifier' ||
      roundType === 'competition' ||
      roundType === 'match'
    );
  });

  return competitiveRounds.length / rounds.length;
}

/**
 * Calculates practice to tournament round ratio
 */
function calculatePracticeVsTournament(
  rounds: Array<{
    round_type?: string | null;
  }>
): number {
  const practiceRounds = rounds.filter((r) => {
    const roundType = normalizeRoundType(r.round_type);
    return roundType === 'practice' || !roundType;
  });

  const tournamentRounds = rounds.filter((r) => {
    const roundType = normalizeRoundType(r.round_type);
    return roundType === 'tournament';
  });

  if (tournamentRounds.length === 0) {
    return practiceRounds.length > 0 ? Infinity : 0;
  }

  return practiceRounds.length / tournamentRounds.length;
}
