// ============================================================================
// COACHHELM INSIGHT GENERATION ENGINE
// ============================================================================
// This module contains the core logic for analyzing player performance
// and generating coaching insights based on the coach's philosophy.

import type { CoachPhilosophy } from './types';
import type {
  InsightType,
  InsightPriority,
  ScoringDeclineMetadata,
  StatRegressionMetadata,
  TournamentPressureMetadata,
  BubblePlayerMetadata,
  SurgePlayerMetadata,
  StreakMetadata,
} from './insight-types';

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerRoundData {
  id: string;
  player_id: string;
  round_date: string;
  total_score: number;
  total_to_par: number;
  round_type: 'practice' | 'tournament' | 'qualifying';
  course_par: number;
  // Advanced stats (optional)
  fairways_hit?: number;
  fairways_total?: number;
  gir?: number;
  putts?: number;
  scrambling_success?: number;
  scrambling_attempts?: number;
}

export interface PlayerData {
  id: string;
  first_name: string;
  last_name: string;
  rounds: PlayerRoundData[];
  current_rank?: number; // For bubble player detection
}

export interface GeneratedInsight {
  insight_type: InsightType;
  priority: InsightPriority;
  player_id: string;
  title: string;
  description: string;
  recommendation: string;
  metadata: Record<string, any>;
  expires_in_days?: number;
}

export interface GeneratedFocusArea {
  player_id: string;
  category: string;
  priority_rank: number;
  title: string;
  description: string;
  specific_drills: string[];
  current_performance: Record<string, any>;
  target_improvement: string;
}

// ============================================================================
// MAIN INSIGHT GENERATION FUNCTION
// ============================================================================

export function generateInsightsForPlayer(
  player: PlayerData,
  philosophy: CoachPhilosophy,
  teamSize?: number
): GeneratedInsight[] {
  const insights: GeneratedInsight[] = [];

  // Need at least 3 rounds to generate meaningful insights
  if (player.rounds.length < 3) {
    return insights;
  }

  // Sort rounds by date (most recent first)
  const sortedRounds = [...player.rounds].sort(
    (a, b) => new Date(b.round_date).getTime() - new Date(a.round_date).getTime()
  );

  // 1. Scoring Decline Detection
  if (philosophy.alertScoringDecline) {
    const declineInsight = detectScoringDecline(player, sortedRounds, philosophy);
    if (declineInsight) insights.push(declineInsight);
  }

  // 2. Tournament Pressure Gap
  if (philosophy.alertTournamentPressure) {
    const pressureInsight = detectTournamentPressure(player, sortedRounds, philosophy);
    if (pressureInsight) insights.push(pressureInsight);
  }

  // 3. Performance Plateau
  if (philosophy.alertPlateau) {
    const plateauInsight = detectPlateau(player, sortedRounds, philosophy);
    if (plateauInsight) insights.push(plateauInsight);
  }

  // 4. Bubble Player (if rank provided)
  if (philosophy.alertBubblePlayer && player.current_rank && teamSize) {
    const bubbleInsight = detectBubblePlayer(player, sortedRounds, philosophy, teamSize);
    if (bubbleInsight) insights.push(bubbleInsight);
  }

  // 5. Surge Player (Rapid Improvement)
  if (philosophy.alertSurgePlayer) {
    const surgeInsight = detectSurgePlayer(player, sortedRounds, philosophy);
    if (surgeInsight) insights.push(surgeInsight);
  }

  // 6. Hot/Cold Streaks
  if (philosophy.alertStreaks) {
    const streakInsight = detectStreak(player, sortedRounds, philosophy);
    if (streakInsight) insights.push(streakInsight);
  }

  // 7. Stat Regression (if advanced stats available)
  if (philosophy.alertStatRegression) {
    const statInsights = detectStatRegression(player, sortedRounds, philosophy);
    insights.push(...statInsights);
  }

  return insights;
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

function detectScoringDecline(
  player: PlayerData,
  rounds: PlayerRoundData[],
  philosophy: CoachPhilosophy
): GeneratedInsight | null {
  // Need at least 10 rounds to compare 5 vs 5
  if (rounds.length < 10) return null;

  const recent5 = rounds.slice(0, 5);
  const previous5 = rounds.slice(5, 10);

  const recentAvg = average(recent5.map((r) => r.total_score));
  const previousAvg = average(previous5.map((r) => r.total_score));

  const decline = recentAvg - previousAvg;

  // Check against threshold (adjusted by sensitivity)
  const threshold = getAdjustedThreshold(philosophy.declineThreshold, philosophy.alertSensitivity);

  if (decline >= threshold) {
    const metadata: ScoringDeclineMetadata = {
      recent_avg: recentAvg,
      previous_avg: previousAvg,
      rounds_analyzed: 10,
      decline_amount: decline,
      confidence_score: 0.85,
    };

    return {
      insight_type: 'scoring_decline',
      priority: decline >= threshold * 1.5 ? 'high' : 'medium',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - Scoring Decline`,
      description: `Scoring average has increased by ${decline.toFixed(1)} strokes over the last 5 rounds (${recentAvg.toFixed(1)} vs ${previousAvg.toFixed(1)}).`,
      recommendation: `Schedule 1-on-1 session to identify root cause. Review recent rounds for patterns in mistakes.`,
      metadata,
      expires_in_days: 14,
    };
  }

  return null;
}

function detectTournamentPressure(
  player: PlayerData,
  rounds: PlayerRoundData[],
  philosophy: CoachPhilosophy
): GeneratedInsight | null {
  const practiceRounds = rounds.filter((r) => r.round_type === 'practice');
  const tournamentRounds = rounds.filter((r) => r.round_type === 'tournament');

  // Need at least 3 of each
  if (practiceRounds.length < 3 || tournamentRounds.length < 3) return null;

  const practiceAvg = average(practiceRounds.slice(0, 5).map((r) => r.total_score));
  const tournamentAvg = average(tournamentRounds.slice(0, 5).map((r) => r.total_score));

  const gap = tournamentAvg - practiceAvg;

  const threshold = getAdjustedThreshold(philosophy.pressureGapThreshold, philosophy.alertSensitivity);

  if (gap >= threshold) {
    const metadata: TournamentPressureMetadata = {
      practice_avg: practiceAvg,
      tournament_avg: tournamentAvg,
      gap,
      rounds_practice: Math.min(5, practiceRounds.length),
      rounds_tournament: Math.min(5, tournamentRounds.length),
    };

    return {
      insight_type: 'tournament_pressure',
      priority: gap >= threshold * 1.5 ? 'high' : 'medium',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - Tournament Pressure Gap`,
      description: `Scoring ${gap.toFixed(1)} strokes higher in tournaments (${tournamentAvg.toFixed(1)}) vs practice (${practiceAvg.toFixed(1)}).`,
      recommendation: `Work on mental game and pre-shot routine. Consider sports psychology consultation. Practice tournament simulation rounds.`,
      metadata,
      expires_in_days: 21,
    };
  }

  return null;
}

function detectPlateau(
  player: PlayerData,
  rounds: PlayerRoundData[],
  _philosophy: CoachPhilosophy
): GeneratedInsight | null {
  // Need at least 15 rounds to detect plateau
  if (rounds.length < 15) return null;

  // Check if last 10 rounds show minimal improvement
  const recent10 = rounds.slice(0, 10);
  const scores = recent10.map((r) => r.total_score);

  // Calculate standard deviation
  const avg = average(scores);
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // Low standard deviation + no improvement trend = plateau
  if (stdDev < 2.0) {
    // Check if there's been no improvement over longer period
    const older5 = rounds.slice(10, 15);
    const olderAvg = average(older5.map((r) => r.total_score));

    const improvement = olderAvg - avg;

    // If improvement is less than 0.5 strokes, it's a plateau
    if (improvement < 0.5) {
      return {
        insight_type: 'plateau',
        priority: 'low',
        player_id: player.id,
        title: `${player.first_name} ${player.last_name} - Performance Plateau`,
        description: `Scoring has been consistent but not improving over the last 15 rounds (avg: ${avg.toFixed(1)}).`,
        recommendation: `Time to shake things up. Consider new drills, different practice routines, or setting specific skill goals.`,
        metadata: {
          recent_avg: avg,
          std_dev: stdDev,
          rounds_analyzed: 15,
          improvement_rate: improvement,
        },
        expires_in_days: 30,
      };
    }
  }

  return null;
}

function detectBubblePlayer(
  player: PlayerData,
  rounds: PlayerRoundData[],
  philosophy: CoachPhilosophy,
  teamSize: number
): GeneratedInsight | null {
  if (!player.current_rank) return null;

  // Typical travel squad is 5-6 players
  const travelSquadSize = Math.min(6, Math.floor(teamSize * 0.5));
  const bubbleZone = philosophy.bubbleZoneRange;

  // Calculate distance from cutoff
  const distanceFromCutoff = player.current_rank - travelSquadSize;

  // If within bubble zone (e.g., ranks 5-8 for a 6-person squad)
  if (distanceFromCutoff >= 0 && distanceFromCutoff <= bubbleZone) {
    const recentAvg = average(rounds.slice(0, 5).map((r) => r.total_score));

    // Determine trend
    const recent3 = average(rounds.slice(0, 3).map((r) => r.total_score));
    const previous3 = average(rounds.slice(3, 6).map((r) => r.total_score));
    const trend = recent3 < previous3 ? 'up' : recent3 > previous3 ? 'down' : 'stable';

    const metadata: BubblePlayerMetadata = {
      current_rank: player.current_rank,
      cutoff_rank: travelSquadSize,
      distance_from_cutoff: distanceFromCutoff,
      recent_trend: trend,
      avg_score: recentAvg,
    };

    return {
      insight_type: 'bubble_player',
      priority: 'urgent',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - On The Bubble`,
      description: `Currently ranked #${player.current_rank}, ${distanceFromCutoff} spot(s) from travel squad. Recent trend: ${trend}.`,
      recommendation: trend === 'down'
        ? `Immediate intervention needed. Schedule practice session to address recent struggles.`
        : `Close to making travel squad. Encourage continued focus and consistency.`,
      metadata,
      expires_in_days: 7,
    };
  }

  return null;
}

function detectSurgePlayer(
  player: PlayerData,
  rounds: PlayerRoundData[],
  _philosophy: CoachPhilosophy
): GeneratedInsight | null {
  if (rounds.length < 10) return null;

  const recent5 = rounds.slice(0, 5);
  const previous5 = rounds.slice(5, 10);

  const recentAvg = average(recent5.map((r) => r.total_score));
  const previousAvg = average(previous5.map((r) => r.total_score));

  const improvement = previousAvg - recentAvg;

  // Significant improvement (2+ strokes)
  if (improvement >= 2.0) {
    const metadata: SurgePlayerMetadata = {
      improvement_rate: improvement / 5,
      rounds_analyzed: 10,
      starting_avg: previousAvg,
      current_avg: recentAvg,
    };

    return {
      insight_type: 'surge_player',
      priority: 'medium',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - Rapid Improvement`,
      description: `Scoring has improved by ${improvement.toFixed(1)} strokes over the last 5 rounds (${recentAvg.toFixed(1)} vs ${previousAvg.toFixed(1)}).`,
      recommendation: `Recognize and reinforce what's working. Consider increased playing opportunities or leadership role.`,
      metadata,
      expires_in_days: 14,
    };
  }

  return null;
}

function detectStreak(
  player: PlayerData,
  rounds: PlayerRoundData[],
  _philosophy: CoachPhilosophy
): GeneratedInsight | null {
  if (rounds.length < 5) return null;

  const recent5 = rounds.slice(0, 5);
  const recentAvg = average(recent5.map((r) => r.total_score));

  // Compare to overall average
  const overallAvg = average(rounds.map((r) => r.total_score));

  const diff = Math.abs(recentAvg - overallAvg);

  // Hot streak: 2+ strokes better than average
  if (recentAvg < overallAvg - 2.0) {
    const metadata: StreakMetadata = {
      streak_type: 'hot',
      streak_length: 5,
      avg_during_streak: recentAvg,
      avg_before_streak: overallAvg,
    };

    return {
      insight_type: 'streak',
      priority: 'medium',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - Hot Streak 🔥`,
      description: `On fire! Averaging ${recentAvg.toFixed(1)} over last 5 rounds, ${diff.toFixed(1)} strokes better than usual.`,
      recommendation: `Ride the momentum. Consider featuring in upcoming tournaments.`,
      metadata,
      expires_in_days: 7,
    };
  }

  // Cold streak: 2+ strokes worse than average
  if (recentAvg > overallAvg + 2.0) {
    const metadata: StreakMetadata = {
      streak_type: 'cold',
      streak_length: 5,
      avg_during_streak: recentAvg,
      avg_before_streak: overallAvg,
    };

    return {
      insight_type: 'streak',
      priority: 'medium',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - Cold Streak`,
      description: `Struggling recently. Averaging ${recentAvg.toFixed(1)} over last 5 rounds, ${diff.toFixed(1)} strokes worse than usual.`,
      recommendation: `Check in on mental state and physical health. Review fundamentals.`,
      metadata,
      expires_in_days: 7,
    };
  }

  return null;
}

function detectStatRegression(
  player: PlayerData,
  rounds: PlayerRoundData[],
  _philosophy: CoachPhilosophy
): GeneratedInsight[] {
  const insights: GeneratedInsight[] = [];

  // Need rounds with advanced stats
  const roundsWithStats = rounds.filter((r) => r.fairways_hit !== undefined || r.gir !== undefined);

  if (roundsWithStats.length < 10) return insights;

  // Check fairway accuracy
  const recentFairways = roundsWithStats.slice(0, 5);
  const previousFairways = roundsWithStats.slice(5, 10);

  const recentFwPct = average(
    recentFairways.map((r) => (r.fairways_hit! / r.fairways_total!) * 100)
  );
  const previousFwPct = average(
    previousFairways.map((r) => (r.fairways_hit! / r.fairways_total!) * 100)
  );

  if (previousFwPct - recentFwPct >= 10) {
    // 10% drop
    const metadata: StatRegressionMetadata = {
      stat_name: 'Fairway Accuracy',
      current_value: recentFwPct,
      previous_value: previousFwPct,
      decline_percentage: previousFwPct - recentFwPct,
      rounds_analyzed: 10,
    };

    insights.push({
      insight_type: 'stat_regression',
      priority: 'medium',
      player_id: player.id,
      title: `${player.first_name} ${player.last_name} - Fairway Accuracy Drop`,
      description: `Fairway accuracy has dropped from ${previousFwPct.toFixed(0)}% to ${recentFwPct.toFixed(0)}%.`,
      recommendation: `Work on driving accuracy. Check alignment and ball position.`,
      metadata,
      expires_in_days: 14,
    });
  }

  return insights;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function getAdjustedThreshold(baseThreshold: number, sensitivity: string): number {
  switch (sensitivity) {
    case 'aggressive':
      return baseThreshold * 0.75; // Lower threshold = more sensitive
    case 'conservative':
      return baseThreshold * 1.25; // Higher threshold = less sensitive
    default:
      return baseThreshold;
  }
}
