/**
 * Scenario Engine -- What-If Improvement Projections
 *
 * Lets coaches explore "what if player X improved metric Y by Z?"
 * and ranks improvement opportunities by impact-to-difficulty ratio.
 */

import type { PlayerProfile } from './monte-carlo';
import { simulateTournament } from './monte-carlo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhatIfScenario {
  playerId: string;
  improvement: {
    metric: string;
    currentValue: number;
    improvedValue: number;
  };
  projectedScoringChange: number;   // Expected change in scoring avg
  projectedRankChange: number;      // Expected rank change within team
  confidence: number;
  explanation: string;
}

export interface ImprovementProjection {
  metric: string;
  currentValue: number;
  targetValue: number;
  projectedScoringImpact: number;   // Strokes per round improvement
  difficulty: 'easy' | 'moderate' | 'hard';
  timeEstimate: string;
  priority: number;                 // Rank by impact/difficulty ratio
}

// ---------------------------------------------------------------------------
// Difficulty Heuristics
// ---------------------------------------------------------------------------

type Difficulty = 'easy' | 'moderate' | 'hard';

function classifyDifficulty(strokesImprovement: number): Difficulty {
  const abs = Math.abs(strokesImprovement);
  if (abs < 0.3) return 'easy';
  if (abs <= 0.7) return 'moderate';
  return 'hard';
}

function difficultyMultiplier(d: Difficulty): number {
  switch (d) {
    case 'easy':
      return 1;
    case 'moderate':
      return 2;
    case 'hard':
      return 3;
  }
}

function timeEstimate(d: Difficulty): string {
  switch (d) {
    case 'easy':
      return '2-4 weeks';
    case 'moderate':
      return '1-2 months';
    case 'hard':
      return '2-4 months';
  }
}

// ---------------------------------------------------------------------------
// What-If Simulation
// ---------------------------------------------------------------------------

/**
 * Simulate the effect of a player improving a specific metric by `amount`
 * strokes. If `teamPlayers` is provided, the rank change within the team
 * is also projected via tournament simulation.
 */
export function simulateWhatIf(
  player: PlayerProfile,
  improvement: { metric: string; amount: number },
  teamPlayers?: PlayerProfile[],
): WhatIfScenario {
  const currentMean = player.scoringMean + (player.recentForm ?? 0);
  // For SG metrics, improvement directly translates: improve SG by X = score X better
  // Negative amount = lower (better) scoring mean
  const improvedMean = player.scoringMean - Math.abs(improvement.amount);

  const scoringChange = -(Math.abs(improvement.amount));

  let rankChange = 0;
  let confidence = 0.75;

  if (teamPlayers && teamPlayers.length > 1) {
    // Simulate baseline tournament
    const baselineResult = simulateTournament(teamPlayers, 4, 5_000);
    const baselineRank =
      baselineResult.players.find((p) => p.playerId === player.playerId)
        ?.expectedFinish ?? teamPlayers.length;

    // Create improved roster
    const improvedRoster = teamPlayers.map((p) =>
      p.playerId === player.playerId
        ? { ...p, scoringMean: improvedMean }
        : p,
    );

    const improvedResult = simulateTournament(improvedRoster, 4, 5_000);
    const improvedRank =
      improvedResult.players.find((p) => p.playerId === player.playerId)
        ?.expectedFinish ?? teamPlayers.length;

    rankChange = Math.round((baselineRank - improvedRank) * 10) / 10;
    confidence = 0.7;
  }

  const difficulty = classifyDifficulty(improvement.amount);

  return {
    playerId: player.playerId,
    improvement: {
      metric: improvement.metric,
      currentValue: Math.round(currentMean * 100) / 100,
      improvedValue: Math.round(improvedMean * 100) / 100,
    },
    projectedScoringChange: Math.round(scoringChange * 100) / 100,
    projectedRankChange: rankChange,
    confidence,
    explanation: buildExplanation(
      player.name,
      improvement.metric,
      improvement.amount,
      scoringChange,
      rankChange,
      difficulty,
    ),
  };
}

function buildExplanation(
  playerName: string,
  metric: string,
  amount: number,
  scoringChange: number,
  rankChange: number,
  difficulty: Difficulty,
): string {
  const parts: string[] = [];

  parts.push(
    `If ${playerName} improves ${metric} by ${Math.abs(amount).toFixed(2)} strokes, ` +
      `their scoring average is projected to change by ${scoringChange.toFixed(2)} strokes per round.`,
  );

  if (rankChange > 0) {
    parts.push(
      `This would move them up approximately ${rankChange.toFixed(1)} positions in team rankings.`,
    );
  }

  parts.push(
    `This improvement is classified as ${difficulty} (estimated ${timeEstimate(difficulty)}).`,
  );

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Improvement Opportunity Ranking
// ---------------------------------------------------------------------------

/**
 * Given a player's strokes-gained breakdown, calculate the projected impact
 * of improving each category to the team/field average (0), and rank by
 * an impact-to-difficulty ratio.
 *
 * `sgBreakdown` keys are SG category names (e.g. "sg_putting", "sg_approach")
 * and values are the player's current SG value (negative = below average).
 */
export function rankImprovementOpportunities(
  _player: PlayerProfile,
  sgBreakdown: Record<string, number>,
): ImprovementProjection[] {
  const projections: ImprovementProjection[] = [];

  for (const [metric, currentValue] of Object.entries(sgBreakdown)) {
    // Target is at least 0 (tour/team average). If already positive, skip.
    if (currentValue >= 0) continue;

    const targetValue = 0;
    const improvementNeeded = Math.abs(currentValue);

    // SG improvement directly translates to scoring improvement
    const scoringImpact = improvementNeeded;
    const difficulty = classifyDifficulty(improvementNeeded);
    const priority =
      Math.round((scoringImpact / difficultyMultiplier(difficulty)) * 100) /
      100;

    projections.push({
      metric,
      currentValue: Math.round(currentValue * 100) / 100,
      targetValue,
      projectedScoringImpact: Math.round(scoringImpact * 100) / 100,
      difficulty,
      timeEstimate: timeEstimate(difficulty),
      priority,
    });
  }

  // Sort by priority descending (highest impact/difficulty ratio first)
  projections.sort((a, b) => b.priority - a.priority);

  // Assign ordinal priority ranks (1 = highest)
  return projections.map((p, i) => ({ ...p, priority: i + 1 }));
}
