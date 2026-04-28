/**
 * Temporal Feature Extraction
 *
 * Extracts time-based features from player round data including:
 * - Playing frequency and recency
 * - Scoring trends over different time windows
 * - Volatility and consistency metrics
 * - Form momentum indicators
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { TemporalFeatures } from '../types';

/**
 * Extracts temporal features for a player
 *
 * @param playerId - The player's UUID
 * @returns Temporal features or null if insufficient data
 */
export async function extractTemporalFeatures(
  playerId: string
): Promise<TemporalFeatures | null> {
  // Use admin client — analyzePlayer is invoked from cron / fire-and-forget
  // contexts with no user session, so RLS would block every round read and
  // collapse temporal features to null. See V1/A2 audit notes from 2026-04-27.
  const supabase = createAdminClient();

  // Get rounds from last 90 days for comprehensive analysis
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select('id, total_score, score_to_par, round_date, created_at')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', ninetyDaysAgo.toISOString())
    .order('round_date', { ascending: false });

  if (error || !rounds || rounds.length === 0) {
    return null;
  }

  const now = new Date();

  // Calculate days since last round
  const firstRound = rounds[0];
  if (!firstRound) {
    return null;
  }
  const lastRoundDate = new Date(firstRound.round_date);
  const daysSinceLastRound = Math.floor(
    (now.getTime() - lastRoundDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Count rounds in different time windows
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const roundsInLast7Days = rounds.filter(
    (r) => new Date(r.round_date) >= sevenDaysAgo
  ).length;

  const roundsInLast14Days = rounds.filter(
    (r) => new Date(r.round_date) >= fourteenDaysAgo
  ).length;

  const roundsInLast30Days = rounds.filter(
    (r) => new Date(r.round_date) >= thirtyDaysAgo
  ).length;

  // Determine playing frequency
  const playingFrequency = determinePlayingFrequency(roundsInLast30Days);

  // Calculate scoring trends
  const last7DayRounds = rounds.filter(
    (r) => new Date(r.round_date) >= sevenDaysAgo
  );
  const last30DayRounds = rounds.filter(
    (r) => new Date(r.round_date) >= thirtyDaysAgo
  );

  const scoringTrend7Day = calculateTrend(last7DayRounds);
  const scoringTrend30Day = calculateTrend(last30DayRounds);

  // Calculate volatility (standard deviation of scores)
  const volatility7Day = calculateVolatility(last7DayRounds);
  const volatility30Day = calculateVolatility(last30DayRounds);

  // Calculate recent form score (-1 to 1)
  const recentFormScore = calculateRecentFormScore(rounds);

  // Calculate form momentum (rate of change)
  const formMomentum = calculateFormMomentum(rounds);

  return {
    daysSinceLastRound,
    roundsInLast7Days,
    roundsInLast14Days,
    roundsInLast30Days,
    playingFrequency,
    scoringTrend7Day,
    scoringTrend30Day,
    volatility7Day,
    volatility30Day,
    recentFormScore,
    formMomentum,
  };
}

/**
 * Determines playing frequency category based on rounds per month
 */
function determinePlayingFrequency(
  roundsInLast30Days: number
): 'high' | 'medium' | 'low' | 'sporadic' {
  if (roundsInLast30Days >= 8) return 'high';
  if (roundsInLast30Days >= 4) return 'medium';
  if (roundsInLast30Days >= 1) return 'low';
  return 'sporadic';
}

/**
 * Calculates trend (slope) of scores over time
 * Negative = improving (scores going down)
 * Positive = declining (scores going up)
 */
function calculateTrend(
  rounds: Array<{ score_to_par: number | null; round_date: string }>
): number {
  if (rounds.length < 2) return 0;

  // Simple linear regression
  const n = rounds.length;
  const scores = rounds.map((r) => r.score_to_par ?? 0);

  // Indices represent time (newer rounds have higher index)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const score = scores[i] ?? 0;
    sumX += i;
    sumY += score;
    sumXY += i * score;
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Clamp to reasonable range
  return Math.max(-3, Math.min(3, slope));
}

/**
 * Calculates volatility (standard deviation) of scores
 */
function calculateVolatility(
  rounds: Array<{ score_to_par: number | null }>
): number {
  if (rounds.length < 2) return 0;

  const scores = rounds.map((r) => r.score_to_par ?? 0);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squaredDiffs = scores.map((s) => Math.pow(s - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / scores.length;

  return Math.sqrt(variance);
}

/**
 * Calculates recent form score (-1 to 1)
 * Compares last 5 rounds to previous 10 rounds
 */
function calculateRecentFormScore(
  rounds: Array<{ score_to_par: number | null }>
): number {
  if (rounds.length < 6) return 0;

  const recent5 = rounds.slice(0, Math.min(5, rounds.length));
  const previous = rounds.slice(5, Math.min(15, rounds.length));

  if (previous.length === 0) return 0;

  const recentAvg =
    recent5.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / recent5.length;
  const previousAvg =
    previous.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / previous.length;

  // Negative difference means improving (lower scores)
  const diff = previousAvg - recentAvg;

  // Normalize to -1 to 1 range (assuming max improvement of 5 strokes)
  return Math.max(-1, Math.min(1, diff / 5));
}

/**
 * Calculates form momentum (acceleration of improvement/decline)
 */
function calculateFormMomentum(
  rounds: Array<{ score_to_par: number | null }>
): number {
  if (rounds.length < 9) return 0;

  // Compare trend of last 3 vs previous 3 vs before that 3
  const segment1 = rounds.slice(0, 3);
  const segment2 = rounds.slice(3, 6);
  const segment3 = rounds.slice(6, 9);

  const avg1 = segment1.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / 3;
  const avg2 = segment2.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / 3;
  const avg3 = segment3.reduce((a, r) => a + (r.score_to_par ?? 0), 0) / 3;

  // Change in trend
  const trend1 = avg2 - avg1; // Recent change
  const trend2 = avg3 - avg2; // Previous change

  // Momentum is change in trend (second derivative)
  const momentum = trend2 - trend1;

  // Positive momentum = accelerating improvement
  return Math.max(-2, Math.min(2, momentum));
}
