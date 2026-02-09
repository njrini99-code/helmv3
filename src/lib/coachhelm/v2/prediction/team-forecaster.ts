/**
 * Team-Level Forecaster
 *
 * Generates PerformancePrediction[] by analyzing team stats cache and
 * recent round data. Unlike per-player PerformancePredictor (which requires
 * 5+ rounds), this works with any data by using the pre-computed stats
 * cache and team-level aggregation.
 *
 * IMPORTANT: All predictedValue outputs are SCORE-TO-PAR (e.g. +2.3, -1.5, 0)
 * because the UI's EnhancedPredictionCard formats values as "E", "+2.3", "-1.5".
 */

import type { PerformancePrediction, PredictionFactor, TailRisk } from '../types';
import type { StatsRow, RoundRow } from '../mining/team-pattern-generator';

// Default par when we can't determine actual course par
const DEFAULT_PAR = 72;

// ============================================================================
// TYPES
// ============================================================================

interface PlayerInfo {
  id: string;
  first_name: string;
  last_name: string;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function generateTeamForecasts(
  players: PlayerInfo[],
  statsCache: StatsRow[],
  rounds: RoundRow[]
): Array<PerformancePrediction & { playerName?: string }> {
  if (players.length === 0 || statsCache.length === 0) return [];

  const playerMap = new Map(players.map(p => [p.id, p]));
  const statsMap = new Map(statsCache.map(s => [s.player_id, s]));
  const predictions: Array<PerformancePrediction & { playerName?: string }> = [];

  predictions.push(...forecastTeamScoringAverage(statsMap));
  predictions.push(...forecastLineupStrength(playerMap, statsMap));
  predictions.push(...forecastImprovementTrajectory(playerMap, statsMap));
  predictions.push(...forecastNextRoundPerPlayer(playerMap, statsMap, rounds));
  predictions.push(...forecastRiskAssessment(playerMap, statsMap, rounds));
  predictions.push(...forecastBreakoutCandidates(playerMap, statsMap));

  return predictions;
}

// ============================================================================
// HELPERS
// ============================================================================

function pName(player: PlayerInfo): string {
  return `${player.first_name} ${player.last_name}`.trim();
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 2;
  const mean = avg(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Convert a raw scoring average to score-to-par */
function toScoreToPar(rawScore: number, par: number = DEFAULT_PAR): number {
  return Math.round((rawScore - par) * 10) / 10;
}

/** Get a player's score-to-par average, preferring the pre-computed column */
function getPlayerScoreToPar(stats: StatsRow): number | null {
  if (stats.scoring_average_vs_par !== null) return stats.scoring_average_vs_par;
  if (stats.scoring_average !== null) return toScoreToPar(stats.scoring_average);
  return null;
}

function buildPrediction(
  overrides: Partial<PerformancePrediction> & Pick<PerformancePrediction, 'id' | 'playerId' | 'predictionType' | 'metric' | 'predictedValue'>,
  playerName?: string
): PerformancePrediction & { playerName?: string } {
  const rangeLow = overrides.predictedRangeLow ?? overrides.predictedValue - 2;
  const rangeHigh = overrides.predictedRangeHigh ?? overrides.predictedValue + 2;
  const factors = overrides.keyFactors ?? [];
  return {
    confidence: 0.7,
    calibratedConfidence: 0.65,
    predictedRangeLow: rangeLow,
    predictedRangeHigh: rangeHigh,
    keyFactors: factors,
    factors, // UI checks prediction.factors ?? prediction.keyFactors
    sensitivities: {},
    context: {},
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    trend: 'stable',
    lowerBound: rangeLow,
    upperBound: rangeHigh,
    predictionRange: { low: rangeLow, high: rangeHigh },
    ...overrides,
    playerName,
  };
}

// ============================================================================
// FORECAST GENERATORS
// ============================================================================

/**
 * 1. Team Scoring Average — Project next tournament team average (score-to-par)
 */
function forecastTeamScoringAverage(
  statsMap: Map<string, StatsRow>
): Array<PerformancePrediction & { playerName?: string }> {
  const scoresToPar: number[] = [];
  for (const stats of statsMap.values()) {
    if (stats.rounds_in_calculation && stats.rounds_in_calculation > 0) {
      const stp = getPlayerScoreToPar(stats);
      if (stp !== null) scoresToPar.push(stp);
    }
  }

  if (scoresToPar.length < 2) return [];

  const teamAvgToPar = avg(scoresToPar);
  const teamStd = stdDev(scoresToPar);
  const trendValues = [...statsMap.values()]
    .filter(s => s.improvement_trend !== null)
    .map(s => s.improvement_trend!);
  const avgTrend = trendValues.length > 0 ? avg(trendValues) : 0;

  // Adjust prediction by trend (negative trend = improving = lower score-to-par)
  const projected = teamAvgToPar + avgTrend * 0.3;
  const low = projected - teamStd * 0.8;
  const high = projected + teamStd * 0.8;

  const factors: PredictionFactor[] = [
    {
      name: 'Team Average vs Par',
      value: teamAvgToPar > 0 ? `+${teamAvgToPar.toFixed(1)}` : teamAvgToPar.toFixed(1),
      contribution: 0.6,
      direction: 'neutral',
      explanation: `Current team average is ${teamAvgToPar > 0 ? '+' : ''}${teamAvgToPar.toFixed(1)} vs par`,
    },
    {
      name: 'Scoring Trend',
      value: avgTrend > 0 ? `+${avgTrend.toFixed(1)}` : avgTrend.toFixed(1),
      contribution: 0.3,
      direction: avgTrend < 0 ? 'positive' : avgTrend > 0 ? 'negative' : 'neutral',
      explanation: avgTrend < -0.3
        ? 'Team is trending toward lower scores'
        : avgTrend > 0.3
          ? 'Team is trending toward higher scores'
          : 'Scores have been stable',
    },
  ];

  return [buildPrediction({
    id: 'forecast-team-scoring-avg',
    playerId: 'team',
    predictionType: 'metric',
    metric: 'score_to_par',
    predictedValue: Math.round(projected * 10) / 10,
    predictedRangeLow: Math.round(low * 10) / 10,
    predictedRangeHigh: Math.round(high * 10) / 10,
    confidence: Math.min(0.85, 0.5 + scoresToPar.length * 0.03),
    calibratedConfidence: Math.min(0.8, 0.45 + scoresToPar.length * 0.03),
    keyFactors: factors,
    trend: avgTrend < -0.3 ? 'improving' : avgTrend > 0.3 ? 'declining' : 'stable',
  }, 'Team')];
}

/**
 * 2. Lineup Strength — Project top 5 lineup average score-to-par
 */
function forecastLineupStrength(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>
): Array<PerformancePrediction & { playerName?: string }> {
  const playerScores: Array<{ id: string; scoreToPar: number }> = [];
  for (const [id, stats] of statsMap) {
    if (stats.rounds_in_calculation && stats.rounds_in_calculation > 0) {
      const stp = getPlayerScoreToPar(stats);
      if (stp !== null) playerScores.push({ id, scoreToPar: stp });
    }
  }

  if (playerScores.length < 5) return [];

  // Sort by score-to-par ascending (lowest/best first)
  playerScores.sort((a, b) => a.scoreToPar - b.scoreToPar);
  const top5 = playerScores.slice(0, 5);
  const top5AvgToPar = avg(top5.map(p => p.scoreToPar));
  const std = stdDev(top5.map(p => p.scoreToPar));

  const top5Names = top5
    .map(p => {
      const player = playerMap.get(p.id);
      return player ? pName(player) : '';
    })
    .filter(Boolean)
    .join(', ');

  const fmtAvg = top5AvgToPar > 0 ? `+${top5AvgToPar.toFixed(1)}` : top5AvgToPar.toFixed(1);

  return [buildPrediction({
    id: 'forecast-lineup-strength',
    playerId: 'team',
    predictionType: 'metric',
    metric: 'score_to_par',
    predictedValue: Math.round(top5AvgToPar * 10) / 10,
    predictedRangeLow: Math.round((top5AvgToPar - std * 0.8) * 10) / 10,
    predictedRangeHigh: Math.round((top5AvgToPar + std * 0.8) * 10) / 10,
    confidence: 0.75,
    calibratedConfidence: 0.7,
    keyFactors: [
      {
        name: 'Top 5 Average vs Par',
        value: fmtAvg,
        contribution: 0.7,
        direction: 'neutral',
        explanation: `Best 5 players average ${fmtAvg} vs par (${top5Names})`,
      },
      {
        name: 'Lineup Depth',
        value: `${playerScores.length} players`,
        contribution: 0.2,
        direction: playerScores.length >= 8 ? 'positive' : 'neutral',
        explanation: `${playerScores.length} players competing for lineup spots`,
      },
    ],
    trend: 'stable',
  }, 'Lineup (Top 5)')];
}

/**
 * 3. Improvement Trajectory — Per-player trend projections (score-to-par)
 */
function forecastImprovementTrajectory(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>
): Array<PerformancePrediction & { playerName?: string }> {
  const predictions: Array<PerformancePrediction & { playerName?: string }> = [];

  for (const [id, stats] of statsMap) {
    if (stats.improvement_trend === null) continue;
    if (stats.rounds_in_calculation === null || stats.rounds_in_calculation < 2) continue;
    const player = playerMap.get(id);
    if (!player) continue;

    const currentToPar = getPlayerScoreToPar(stats);
    if (currentToPar === null) continue;

    const trend = stats.improvement_trend;
    // Only generate trajectory for notable trends
    if (Math.abs(trend) < 0.5) continue;

    const projectedToPar = currentToPar + trend * 0.5; // Project 50% of current trend forward
    const isImproving = trend < 0;
    const fmtCurrent = currentToPar > 0 ? `+${currentToPar.toFixed(1)}` : currentToPar.toFixed(1);
    const fmtProjected = projectedToPar > 0 ? `+${projectedToPar.toFixed(1)}` : projectedToPar.toFixed(1);

    predictions.push(buildPrediction({
      id: `forecast-trajectory-${id}`,
      playerId: id,
      predictionType: 'trajectory',
      metric: 'score_to_par',
      predictedValue: Math.round(projectedToPar * 10) / 10,
      predictedRangeLow: Math.round((projectedToPar - 1.5) * 10) / 10,
      predictedRangeHigh: Math.round((projectedToPar + 1.5) * 10) / 10,
      confidence: Math.min(0.8, 0.5 + stats.rounds_in_calculation * 0.02),
      calibratedConfidence: Math.min(0.75, 0.45 + stats.rounds_in_calculation * 0.02),
      keyFactors: [
        {
          name: 'Current vs Par',
          value: fmtCurrent,
          contribution: 0.5,
          direction: 'neutral',
          explanation: `Current scoring average of ${fmtCurrent} vs par`,
        },
        {
          name: 'Trend Direction',
          value: `${trend > 0 ? '+' : ''}${trend.toFixed(1)} strokes`,
          contribution: 0.4,
          direction: isImproving ? 'positive' : 'negative',
          explanation: isImproving
            ? `Scores are dropping — on track to reach ${fmtProjected} vs par`
            : `Scores are rising — may reach ${fmtProjected} vs par if trend continues`,
        },
      ],
      trend: isImproving ? 'improving' : 'declining',
      tailRisks: !isImproving ? [{
        description: 'Continued decline could impact lineup selection',
        probability: 0.4,
        impact: 'medium' as const,
      }] : undefined,
    }, pName(player)));
  }

  // Sort by most impactful trends first
  predictions.sort((a, b) => {
    const aBase = getPlayerScoreToPar(statsMap.get(a.playerId)!) ?? 0;
    const bBase = getPlayerScoreToPar(statsMap.get(b.playerId)!) ?? 0;
    return Math.abs(b.predictedValue - bBase) - Math.abs(a.predictedValue - aBase);
  });

  return predictions.slice(0, 4);
}

/**
 * 4. Next Round Per Player — Expected next round score-to-par for each player
 */
function forecastNextRoundPerPlayer(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  rounds: RoundRow[]
): Array<PerformancePrediction & { playerName?: string }> {
  const predictions: Array<PerformancePrediction & { playerName?: string }> = [];

  // Get recent rounds grouped by player, using score_to_par when available
  const playerRoundsToPar = new Map<string, number[]>();
  for (const round of rounds) {
    if (!round.player_id) continue;
    const stp = round.score_to_par ?? (round.total_score ? round.total_score - DEFAULT_PAR : null);
    if (stp === null) continue;
    if (!playerRoundsToPar.has(round.player_id)) {
      playerRoundsToPar.set(round.player_id, []);
    }
    playerRoundsToPar.get(round.player_id)!.push(stp);
  }

  for (const [id, stats] of statsMap) {
    const currentToPar = getPlayerScoreToPar(stats);
    if (currentToPar === null) continue;
    const player = playerMap.get(id);
    if (!player) continue;

    const recentToPar = playerRoundsToPar.get(id) || [];
    const recentAvgToPar = recentToPar.length > 0 ? avg(recentToPar) : currentToPar;
    const variance = recentToPar.length > 1 ? stdDev(recentToPar) : 2;

    // Weighted average: 60% recent performance, 40% season average
    const predicted = recentToPar.length >= 2
      ? recentAvgToPar * 0.6 + currentToPar * 0.4
      : currentToPar;

    // Use last_5_average if available for better recency (convert to score-to-par)
    const last5ToPar = stats.last_5_average !== null ? toScoreToPar(stats.last_5_average) : null;
    const adjustedPrediction = last5ToPar !== null
      ? last5ToPar * 0.5 + predicted * 0.5
      : predicted;

    const fmtSeason = currentToPar > 0 ? `+${currentToPar.toFixed(1)}` : currentToPar.toFixed(1);

    const factors: PredictionFactor[] = [
      {
        name: 'Season Average vs Par',
        value: fmtSeason,
        contribution: 0.4,
        direction: 'neutral',
        explanation: `Season scoring average of ${fmtSeason} vs par`,
      },
    ];

    if (recentToPar.length > 0) {
      const fmtRecent = recentAvgToPar > 0 ? `+${recentAvgToPar.toFixed(1)}` : recentAvgToPar.toFixed(1);
      factors.push({
        name: 'Recent Form',
        value: fmtRecent,
        contribution: 0.4,
        direction: recentAvgToPar < currentToPar ? 'positive' : recentAvgToPar > currentToPar ? 'negative' : 'neutral',
        explanation: `Last ${recentToPar.length} round${recentToPar.length > 1 ? 's' : ''} averaged ${fmtRecent} vs par`,
      });
    }

    if (stats.best_round !== null && stats.worst_round !== null) {
      factors.push({
        name: 'Range',
        value: `${stats.best_round}-${stats.worst_round}`,
        contribution: 0.1,
        direction: 'neutral',
        explanation: `Best: ${stats.best_round}, Worst: ${stats.worst_round}`,
      });
    }

    predictions.push(buildPrediction({
      id: `forecast-next-round-${id}`,
      playerId: id,
      predictionType: 'round_score',
      metric: 'score_to_par',
      predictedValue: Math.round(adjustedPrediction * 10) / 10,
      predictedRangeLow: Math.round((adjustedPrediction - variance) * 10) / 10,
      predictedRangeHigh: Math.round((adjustedPrediction + variance) * 10) / 10,
      confidence: Math.min(0.8, 0.4 + (recentToPar.length + (stats.rounds_in_calculation ?? 0)) * 0.02),
      calibratedConfidence: Math.min(0.75, 0.35 + (recentToPar.length + (stats.rounds_in_calculation ?? 0)) * 0.02),
      keyFactors: factors,
      trend: stats.trend_direction === 'improving' ? 'improving'
        : stats.trend_direction === 'declining' ? 'declining'
          : 'stable',
    }, pName(player)));
  }

  // Sort by predicted value ascending (best/lowest score-to-par first)
  predictions.sort((a, b) => a.predictedValue - b.predictedValue);
  return predictions.slice(0, 8);
}

/**
 * 5. Risk Assessment — Players at risk of regression (score-to-par)
 */
function forecastRiskAssessment(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>,
  rounds: RoundRow[]
): Array<PerformancePrediction & { playerName?: string }> {
  const predictions: Array<PerformancePrediction & { playerName?: string }> = [];

  // Group recent rounds by player
  const playerRoundsToPar = new Map<string, number[]>();
  for (const round of rounds) {
    if (!round.player_id) continue;
    const stp = round.score_to_par ?? (round.total_score ? round.total_score - DEFAULT_PAR : null);
    if (stp === null) continue;
    if (!playerRoundsToPar.has(round.player_id)) {
      playerRoundsToPar.set(round.player_id, []);
    }
    playerRoundsToPar.get(round.player_id)!.push(stp);
  }

  for (const [id, stats] of statsMap) {
    const currentToPar = getPlayerScoreToPar(stats);
    if (currentToPar === null) continue;
    const player = playerMap.get(id);
    if (!player) continue;

    const recentToPar = playerRoundsToPar.get(id) || [];
    const risks: TailRisk[] = [];

    // Check for rising trend
    if (stats.improvement_trend !== null && stats.improvement_trend > 1.0) {
      risks.push({
        description: `Scoring trend is rising (+${stats.improvement_trend.toFixed(1)} strokes)`,
        probability: 0.6,
        impact: 'high',
      });
    }

    // Check for high variance in recent rounds
    if (recentToPar.length >= 2) {
      const recentStd = stdDev(recentToPar);
      if (recentStd > 4) {
        risks.push({
          description: `High scoring variance (${recentStd.toFixed(1)} stroke std dev) — inconsistent play`,
          probability: 0.5,
          impact: 'medium',
        });
      }
    }

    // Check for penalty issues
    if (stats.penalty_strokes_per_round !== null && stats.penalty_strokes_per_round > 1.0) {
      risks.push({
        description: `Averaging ${stats.penalty_strokes_per_round.toFixed(1)} penalties/round — free strokes lost`,
        probability: 0.7,
        impact: 'medium',
      });
    }

    // Check for best-round-dependent scoring
    if (stats.best_round !== null && stats.worst_round !== null) {
      const range = stats.worst_round - stats.best_round;
      if (range > 10) {
        risks.push({
          description: `${range}-stroke range (${stats.best_round}-${stats.worst_round}) indicates volatility`,
          probability: 0.5,
          impact: 'medium',
        });
      }
    }

    if (risks.length === 0) continue;

    // Calculate projected regression as score-to-par delta
    const regressionAmount = risks.reduce((sum, r) => sum + (r.impact === 'high' ? 1.5 : 0.8) * r.probability, 0);
    const projectedToPar = currentToPar + regressionAmount;

    predictions.push(buildPrediction({
      id: `forecast-risk-${id}`,
      playerId: id,
      predictionType: 'trajectory',
      metric: 'score_to_par',
      predictedValue: Math.round(projectedToPar * 10) / 10,
      predictedRangeLow: Math.round(currentToPar * 10) / 10,
      predictedRangeHigh: Math.round((projectedToPar + 2) * 10) / 10,
      confidence: 0.65,
      calibratedConfidence: 0.6,
      keyFactors: risks.map(r => ({
        name: r.description.slice(0, 40),
        value: `${(r.probability * 100).toFixed(0)}% likely`,
        contribution: r.impact === 'high' ? 0.4 : 0.2,
        direction: 'negative' as const,
        explanation: r.description,
      })),
      trend: 'declining',
      tailRisks: risks,
    }, pName(player)));
  }

  // Sort by highest risk first (biggest positive score-to-par = worst)
  predictions.sort((a, b) => b.predictedValue - a.predictedValue);
  return predictions.slice(0, 3);
}

/**
 * 6. Breakout Candidates — Players likely to have breakthrough (score-to-par)
 */
function forecastBreakoutCandidates(
  playerMap: Map<string, PlayerInfo>,
  statsMap: Map<string, StatsRow>
): Array<PerformancePrediction & { playerName?: string }> {
  const predictions: Array<PerformancePrediction & { playerName?: string }> = [];

  for (const [id, stats] of statsMap) {
    const currentToPar = getPlayerScoreToPar(stats);
    if (currentToPar === null) continue;
    const player = playerMap.get(id);
    if (!player) continue;

    const signals: PredictionFactor[] = [];
    let breakoutScore = 0;

    // Strong improving trend
    if (stats.improvement_trend !== null && stats.improvement_trend < -1.0) {
      breakoutScore += 30;
      signals.push({
        name: 'Strong Improvement Trend',
        value: `${stats.improvement_trend.toFixed(1)} strokes`,
        contribution: 0.4,
        direction: 'positive',
        explanation: `Scoring average is dropping by ${Math.abs(stats.improvement_trend).toFixed(1)} strokes per window`,
      });
    }

    // SG: Putting improving significantly (above 0 = gaining strokes)
    if (stats.strokes_gained_putting !== null && stats.strokes_gained_putting > 0.5) {
      breakoutScore += 20;
      signals.push({
        name: 'Elite Putting',
        value: `+${stats.strokes_gained_putting.toFixed(1)} SG`,
        contribution: 0.3,
        direction: 'positive',
        explanation: `Gaining ${stats.strokes_gained_putting.toFixed(1)} strokes on the greens — a major scoring weapon`,
      });
    }

    // Last 5 significantly better than season
    if (stats.last_5_average !== null && stats.scoring_average !== null) {
      const recentGap = stats.scoring_average - stats.last_5_average;
      if (recentGap > 1.5) {
        breakoutScore += 25;
        const fmtLast5 = toScoreToPar(stats.last_5_average);
        const fmtLast5Str = fmtLast5 > 0 ? `+${fmtLast5.toFixed(1)}` : fmtLast5.toFixed(1);
        const fmtCurrent = currentToPar > 0 ? `+${currentToPar.toFixed(1)}` : currentToPar.toFixed(1);
        signals.push({
          name: 'Hot Recent Form',
          value: `${fmtLast5Str} last 5`,
          contribution: 0.3,
          direction: 'positive',
          explanation: `Last 5 rounds (${fmtLast5Str} vs par) are ${recentGap.toFixed(1)} strokes better than season average (${fmtCurrent} vs par)`,
        });
      }
    }

    // Good GIR + poor scrambling = improving floor
    if (stats.gir_percentage !== null && stats.gir_percentage > 60 && stats.scrambling_percentage !== null && stats.scrambling_percentage < 45) {
      breakoutScore += 15;
      signals.push({
        name: 'Untapped Short Game',
        value: `${stats.gir_percentage.toFixed(0)}% GIR, ${stats.scrambling_percentage.toFixed(0)}% scramble`,
        contribution: 0.2,
        direction: 'positive',
        explanation: `High GIR but low scrambling means short game improvement could unlock 1-2 strokes easily`,
      });
    }

    if (breakoutScore < 30 || signals.length < 2) continue;

    // Project improvement as score-to-par (lower = better)
    const improvementAmount = breakoutScore * 0.03;
    const projectedToPar = currentToPar - improvementAmount;

    predictions.push(buildPrediction({
      id: `forecast-breakout-${id}`,
      playerId: id,
      predictionType: 'milestone',
      metric: 'score_to_par',
      predictedValue: Math.round(projectedToPar * 10) / 10,
      predictedRangeLow: Math.round((projectedToPar - 2) * 10) / 10,
      predictedRangeHigh: Math.round(currentToPar * 10) / 10,
      confidence: Math.min(0.75, 0.4 + breakoutScore * 0.005),
      calibratedConfidence: Math.min(0.7, 0.35 + breakoutScore * 0.005),
      keyFactors: signals,
      trend: 'improving',
    }, pName(player)));
  }

  // Sort by lowest projected score-to-par first (best potential)
  predictions.sort((a, b) => a.predictedValue - b.predictedValue);
  return predictions.slice(0, 3);
}
