// ============================================================================
// ROUND REVIEW GENERATOR (V1 - DEPRECATED)
// ============================================================================
//
// @deprecated This is the V1 round review generator. Use V2 instead.
//
// For V2 usage, import from '@/lib/coachhelm/v2':
//   import { coachHelmIntelligence } from '@/lib/coachhelm/v2';
//   const review = await coachHelmIntelligence.generateRoundReview(roundId, playerId);
//
// V2 provides:
//   - Pattern-aware summaries using mined patterns
//   - Causal insights explaining WHY patterns exist
//   - Predictions integrated into the review
//   - Composed insights with reasoning chains
//   - Better focus area recommendations
//
// This file is kept for backwards compatibility during migration.
// It will be removed in a future release.
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import {
  RoundReview,
  GoalImpact,
  RoundStats,
} from './types';
import { detectHighlights } from './highlight-detector';
import { detectAreasToReview } from './area-detector';
import { detectPatterns } from './pattern-detector';
import { generateSummary } from './summary-generator';
import { calculateStrokesGained } from './strokes-gained';

interface GolfHole {
  hole_number?: number | null;
  par?: number | null;
  score?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  gir?: boolean | null;
  up_and_down_attempt?: boolean | null;
  up_and_down_made?: boolean | null;
  sand_save_attempt?: boolean | null;
  sand_save_made?: boolean | null;
}

interface GolfRound {
  total_score?: number | null;
  score_to_par?: number | null;
  holes?: GolfHole[] | null;
  shots?: unknown[] | null;
}

interface PlayerGoal {
  id?: string | null;
  goal_type?: string | null;
  current_value?: number | null;
  target_value?: number | null;
}

interface GenerateReviewInput {
  roundId: string;
  playerId: string;
}

export async function generateRoundReview(input: GenerateReviewInput): Promise<RoundReview> {
  const supabase = await createClient();
  const { roundId, playerId } = input;

  // 1. Fetch round data with holes and shots
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      holes:golf_holes(*),
      shots:golf_shots(*)
    `)
    .eq('id', roundId)
    .single();

  if (roundError || !round) {
    throw new Error('Round not found');
  }
  const roundData = round as unknown as GolfRound;

  // 2. Fetch player data and averages (player -> team_members -> team)
  const { data: player } = await supabase
    .from('golf_players')
    .select('*, team_memberships:golf_team_members(team_id, team:golf_teams(*))')
    .eq('id', playerId)
    .single();

  // 3. Fetch player's previous rounds for averages
  const { data: previousRounds } = await supabase
    .from('golf_rounds')
    .select('*, holes:golf_holes(*)')
    .eq('player_id', playerId)
    .neq('id', roundId)
    .order('played_at', { ascending: false })
    .limit(20);
  const previousRoundsData = (previousRounds || []) as GolfRound[];

  // 4. Fetch player's active goals (if table exists)
  // Note: golf_player_goals table may not exist yet in the schema
  const goals: PlayerGoal[] = [];

  // 5. Calculate round stats
  const roundStats = calculateRoundStats(roundData);

  // 6. Calculate player averages (before this round)
  const playerAverages = calculatePlayerAverages(previousRoundsData);

  // 7. Calculate team averages (if on team)
  let teamAverages: RoundStats | null = null;
  const playerTeamId = player?.team_memberships?.[0]?.team_id;
  if (playerTeamId) {
    const { data: teamRounds } = await supabase
      .from('golf_rounds')
      .select('*, holes:golf_holes(*)')
      .eq('team_id', playerTeamId)
      .neq('player_id', playerId)
      .order('played_at', { ascending: false })
      .limit(100);

    if (teamRounds && teamRounds.length > 0) {
      teamAverages = calculatePlayerAverages(teamRounds as GolfRound[]);
    }
  }

  // 8. Calculate strokes gained
  const strokesGained = calculateStrokesGained(roundData.shots || [], roundData.holes || []);

  // 9. Detect highlights
  // Note: Type assertions needed because local GolfHole allows undefined while detector expects required fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const highlights = detectHighlights(roundData as any, roundStats, playerAverages);

  // 10. Detect areas to review
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areasToReview = detectAreasToReview(roundData as any, roundStats, playerAverages);

  // 11. Detect patterns (comparing to previous rounds)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { newPatterns, recurringPatterns } = detectPatterns(roundData as any, previousRoundsData as any);

  // 12. Calculate goal impacts
  const goalImpacts = calculateGoalImpacts(goals, roundStats, playerAverages, player);

  // 13. Calculate scoring average change
  const scoringAvgBefore = playerAverages.totalScore || null;
  const scoreValues = [
    ...previousRoundsData.map((r) => r.total_score ?? null),
    roundData.total_score ?? null,
  ].filter((score): score is number => typeof score === 'number');
  const scoringAvgAfter = scoreValues.length > 0
    ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
    : null;

  // 14. Generate summary
  const { summary, primaryTakeaway, nextPracticePriority } = generateSummary({
    round: roundData,
    roundStats,
    playerAverages,
    strokesGained,
    highlights,
    areasToReview,
    newPatterns,
    recurringPatterns,
    goalImpacts,
  });

  // 15. Build review object
  const roundScoreToPar = roundData.score_to_par ?? ((roundData.total_score ?? 0) - 72);

  const review: Omit<RoundReview, 'id' | 'createdAt'> = {
    roundId,
    playerId,
    roundScore: roundData.total_score || 0,
    roundScoreToPar,
    scoringAvgBefore,
    scoringAvgAfter,
    qualifyingPositionBefore: null,
    qualifyingPositionAfter: null,
    gapToNextPosition: null,
    goalImpacts,
    highlights,
    areasToReview,
    roundStats,
    playerAverages,
    teamAverages,
    strokesGained,
    patternsDetected: newPatterns,
    patternsRecurring: recurringPatterns,
    summary,
    primaryTakeaway,
    nextPracticePriority,
    linkedFocusAreaId: null,
    sharedWithCoach: false,
    sharedAt: null,
    coachViewedAt: null,
    coachNotes: null,
  };

  // 16. Save to database
  // Note: golf_round_reviews table types will be available after running db:types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: saved, error: saveError } = await (supabase as any)
    .from('golf_round_reviews')
    .upsert({
      round_id: review.roundId,
      player_id: review.playerId,
      round_score: review.roundScore,
      round_score_to_par: review.roundScoreToPar,
      scoring_avg_before: review.scoringAvgBefore,
      scoring_avg_after: review.scoringAvgAfter,
      qualifying_position_before: review.qualifyingPositionBefore,
      qualifying_position_after: review.qualifyingPositionAfter,
      gap_to_next_position: review.gapToNextPosition,
      goal_impacts: review.goalImpacts,
      highlights: review.highlights,
      areas_to_review: review.areasToReview,
      round_stats: review.roundStats,
      player_averages: review.playerAverages,
      team_averages: review.teamAverages,
      strokes_gained: review.strokesGained,
      patterns_detected: review.patternsDetected,
      patterns_recurring: review.patternsRecurring,
      summary: review.summary,
      primary_takeaway: review.primaryTakeaway,
      next_practice_priority: review.nextPracticePriority,
      linked_focus_area_id: review.linkedFocusAreaId,
    }, { onConflict: 'round_id' })
    .select()
    .single();

  if (saveError) {
    throw new Error(`Failed to save review: ${saveError.message}`);
  }

  return {
    ...review,
    id: saved.id,
    createdAt: saved.created_at,
  };
}

// Helper: Calculate stats from a single round
function calculateRoundStats(round: GolfRound): RoundStats {
  const holes = round.holes || [];

  const totalScore = round.total_score || 0;
  const scoreToPar = round.score_to_par || 0;

  const frontNine = holes.slice(0, 9).reduce((sum: number, h: GolfHole) => sum + (h.score || 0), 0);
  const backNine = holes.slice(9, 18).reduce((sum: number, h: GolfHole) => sum + (h.score || 0), 0);

  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doublePlus = 0;
  let fairwaysHit = 0, fairwaysPossible = 0;
  let greensHit = 0, greensPossible = 0;
  let totalPutts = 0, onePutts = 0, threePutts = 0;
  let upAndDowns = 0, upAndDownAttempts = 0;
  let sandSaves = 0, sandAttempts = 0;
  let girPutts = 0, girCount = 0;

  holes.forEach((hole: GolfHole) => {
    const par = hole.par ?? 4;
    const scoreDiff = (hole.score || 0) - par;

    if (scoreDiff <= -2) eagles++;
    else if (scoreDiff === -1) birdies++;
    else if (scoreDiff === 0) pars++;
    else if (scoreDiff === 1) bogeys++;
    else doublePlus++;

    // Fairways (par 4s and 5s)
    if (par >= 4) {
      fairwaysPossible++;
      if (hole.fairway_hit) fairwaysHit++;
    }

    // GIR
    greensPossible++;
    if (hole.gir) {
      greensHit++;
      girCount++;
      girPutts += hole.putts || 0;
    }

    // Putts
    const putts = hole.putts || 0;
    totalPutts += putts;
    if (putts === 1) onePutts++;
    if (putts >= 3) threePutts++;

    // Scrambling (missed GIR, still made par or better)
    if (!hole.gir) {
      upAndDownAttempts++;
      if (scoreDiff <= 0) upAndDowns++;
    }

    // Sand saves
    if (hole.sand_save_attempt) {
      sandAttempts++;
      if (hole.sand_save_made) sandSaves++;
    }
  });

  return {
    totalScore,
    scoreToPar,
    frontNine,
    backNine,
    eagles,
    birdies,
    pars,
    bogeys,
    doublePlus,
    fairwaysHit,
    fairwaysPossible,
    fairwayPct: fairwaysPossible > 0 ? (fairwaysHit / fairwaysPossible) * 100 : 0,
    greensHit,
    greensPossible,
    girPct: greensPossible > 0 ? (greensHit / greensPossible) * 100 : 0,
    totalPutts,
    puttsPerHole: holes.length > 0 ? totalPutts / holes.length : 0,
    puttsPerGir: girCount > 0 ? girPutts / girCount : 0,
    onePutts,
    threePutts,
    upAndDowns,
    upAndDownAttempts,
    scramblePct: upAndDownAttempts > 0 ? (upAndDowns / upAndDownAttempts) * 100 : 0,
    sandSaves,
    sandAttempts,
    sandPct: sandAttempts > 0 ? (sandSaves / sandAttempts) * 100 : 0,
  };
}

// Helper: Calculate averages from multiple rounds
function calculatePlayerAverages(rounds: GolfRound[]): RoundStats {
  if (rounds.length === 0) {
    return {
      totalScore: 72,
      scoreToPar: 0,
      frontNine: 36,
      backNine: 36,
      eagles: 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doublePlus: 0,
      fairwaysHit: 0,
      fairwaysPossible: 14,
      fairwayPct: 50,
      greensHit: 0,
      greensPossible: 18,
      girPct: 50,
      totalPutts: 32,
      puttsPerHole: 1.78,
      puttsPerGir: 1.8,
      onePutts: 4,
      threePutts: 1,
      upAndDowns: 3,
      upAndDownAttempts: 6,
      scramblePct: 50,
      sandSaves: 1,
      sandAttempts: 2,
      sandPct: 50,
    };
  }

  const stats = rounds.map(r => calculateRoundStats(r));
  const n = stats.length;

  const avg = (key: keyof RoundStats) => stats.reduce((sum, s) => sum + s[key], 0) / n;

  return {
    totalScore: avg('totalScore'),
    scoreToPar: avg('scoreToPar'),
    frontNine: avg('frontNine'),
    backNine: avg('backNine'),
    eagles: avg('eagles'),
    birdies: avg('birdies'),
    pars: avg('pars'),
    bogeys: avg('bogeys'),
    doublePlus: avg('doublePlus'),
    fairwaysHit: avg('fairwaysHit'),
    fairwaysPossible: avg('fairwaysPossible'),
    fairwayPct: avg('fairwayPct'),
    greensHit: avg('greensHit'),
    greensPossible: avg('greensPossible'),
    girPct: avg('girPct'),
    totalPutts: avg('totalPutts'),
    puttsPerHole: avg('puttsPerHole'),
    puttsPerGir: avg('puttsPerGir'),
    onePutts: avg('onePutts'),
    threePutts: avg('threePutts'),
    upAndDowns: avg('upAndDowns'),
    upAndDownAttempts: avg('upAndDownAttempts'),
    scramblePct: avg('scramblePct'),
    sandSaves: avg('sandSaves'),
    sandAttempts: avg('sandAttempts'),
    sandPct: avg('sandPct'),
  };
}

// Helper: Calculate goal impacts
function calculateGoalImpacts(
  goals: PlayerGoal[],
  roundStats: RoundStats,
  playerAverages: RoundStats,
   
  _player: unknown
): GoalImpact[] {
  return goals.map(goal => {
    const goalType = goal.goal_type ?? 'unknown';
    let valueBefore = goal.current_value || 0;
    let valueAfter = valueBefore;
    let change = 0;
    let direction: 'positive' | 'negative' | 'neutral' = 'neutral';
    let message = '';

    switch (goalType) {
      case 'improve_scoring_average':
        valueBefore = playerAverages.totalScore;
        valueAfter = (playerAverages.totalScore * 19 + roundStats.totalScore) / 20;
        change = valueAfter - valueBefore;
        direction = change < 0 ? 'positive' : change > 0 ? 'negative' : 'neutral';
        message = direction === 'positive'
          ? `Scoring average improved by ${Math.abs(change).toFixed(1)} strokes`
          : `Scoring average increased by ${Math.abs(change).toFixed(1)} strokes`;
        break;

      case 'improve_specific_stat':
        message = 'Stat-specific tracking in progress';
        break;

      case 'make_travel_roster':
        message = 'Qualifying position tracking requires active qualifier';
        break;

      default:
        message = 'Goal tracking in progress';
    }

    return {
      goalId: goal.id ?? 'unknown',
      goalType,
      goalLabel: getGoalLabel(goalType),
      valueBefore,
      valueAfter,
      change,
      direction,
      message,
    };
  });
}

function getGoalLabel(type: string): string {
  const labels: Record<string, string> = {
    make_travel_roster: 'Make Travel Roster',
    improve_scoring_average: 'Improve Scoring Average',
    improve_handicap: 'Improve Handicap',
    improve_specific_stat: 'Improve Stat',
    peak_for_event: 'Peak for Event',
  };
  return labels[type] || type;
}
