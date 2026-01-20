/**
 * Pressure Performance Analysis
 *
 * Deep analysis comparing tournament/qualifier/practice performance to identify
 * how players perform under pressure situations.
 *
 * Key analyses:
 * - Scoring by round type (tournament, qualifier, practice, casual)
 * - Pressure gap calculation (tournament avg - practice avg)
 * - Trend tracking over last 6 events
 * - Specific pressure scenarios (final round, bubble situations)
 */

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Round types in the golf system
 */
export type RoundType = 'tournament' | 'qualifier' | 'practice' | 'casual';

/**
 * Trend direction for pressure gap
 */
export type PressureGapTrend = 'widening' | 'narrowing' | 'stable';

/**
 * Scoring statistics for a specific round type
 */
export interface ScoringByRoundType {
  roundType: RoundType;
  averageScore: number;
  averageToPar: number;
  roundCount: number;
  standardDeviation: number;
  bestRound: number;
  worstRound: number;
  statisticallySignificant: boolean;
}

/**
 * Qualifier performance metrics
 */
export interface QualifierPerformance {
  totalQualifiers: number;
  madeCount: number;
  missedCount: number;
  makeRate: number;
  avgPositionChange: number;
  avgFinalPosition: number;
  bubbleMadeCount: number;
  bubbleMissedCount: number;
  bubbleRate: number;
}

/**
 * Pressure scenario analysis
 */
export interface PressureScenario {
  scenario: string;
  description: string;
  occurrences: number;
  averageToPar: number;
  comparedToBaseline: number;
  successRate?: number;
  details?: string;
}

/**
 * Trend data point for pressure gap over time
 */
export interface PressureGapDataPoint {
  eventDate: string;
  eventName: string;
  eventType: RoundType;
  scoreToPar: number;
  pressureGap: number;
  runningPracticeAvg: number;
}

/**
 * Generated insight from pressure analysis
 */
export interface PressureInsight {
  id: string;
  category: 'pressure_gap' | 'qualifier' | 'tournament' | 'trend' | 'scenario';
  headline: string;
  body: string;
  strokeImpact: number;
  confidence: number;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Complete pressure analysis result
 */
export interface PressureAnalysis {
  playerId: string;
  analyzedAt: string;

  // Scoring by round type
  scoringByRoundType: {
    tournament: ScoringByRoundType | null;
    qualifier: ScoringByRoundType | null;
    practice: ScoringByRoundType | null;
    casual: ScoringByRoundType | null;
  };

  // Core pressure metrics
  pressureGap: number;
  qualifierGap: number;
  tournamentGap: number;
  pressureGapTrend: PressureGapTrend;

  // Detailed analysis
  qualifierPerformance: QualifierPerformance;
  pressureScenarios: PressureScenario[];
  trendData: PressureGapDataPoint[];

  // Actionable insights
  worstPressureScenarios: string[];
  insights: PressureInsight[];

  // Metadata
  totalRoundsAnalyzed: number;
  practiceBaseline: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_ROUNDS_FOR_SIGNIFICANCE = 5;
const MIN_EVENTS_FOR_TREND = 3;
const TREND_EVENTS_COUNT = 6;
const BUBBLE_ZONE_POSITIONS = 2; // Within X positions of cutoff

// ============================================================================
// DATABASE TYPES
// ============================================================================

interface RoundRow {
  id: string;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  course_name: string | null;
}

interface QualifierEntryRow {
  id: string;
  qualifier_id: string;
  player_id: string;
  position: number | null;
  score: number | null;
  status: string | null;
  qualifier: {
    id: string;
    name: string;
    spots_available: number | null;
    start_date: string;
  } | null;
}

interface QualifierRoundRow {
  id: string;
  round_date: string;
  score_to_par: number | null;
  qualifier_id: string | null;
  qualifier: {
    id: string;
    name: string;
    spots_available: number | null;
  } | null;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyzes pressure performance for a player
 *
 * @param playerId - The player's UUID
 * @returns Complete pressure analysis or null if insufficient data
 */
export async function analyzePressurePerformance(
  playerId: string
): Promise<PressureAnalysis | null> {
  const supabase = await createClient();

  // Fetch all rounds for the player
  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id, round_date, round_type, total_score, score_to_par, course_name')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .order('round_date', { ascending: false })
    .limit(200);

  if (roundsError || !rounds || rounds.length < MIN_ROUNDS_FOR_SIGNIFICANCE) {
    return null;
  }

  // Normalize round types (handle 'qualifying' -> 'qualifier')
  const normalizedRounds = (rounds as unknown as RoundRow[]).map(r => ({
    ...r,
    round_type: normalizeRoundType(r.round_type),
  }));

  // Calculate scoring by round type
  const scoringByRoundType = calculateScoringByRoundType(normalizedRounds);

  // Calculate practice baseline
  const practiceBaseline = scoringByRoundType.practice?.averageToPar ?? 0;

  // Calculate pressure gaps
  const pressureGap = calculatePressureGap(scoringByRoundType, practiceBaseline);
  const qualifierGap = (scoringByRoundType.qualifier?.averageToPar ?? practiceBaseline) - practiceBaseline;
  const tournamentGap = (scoringByRoundType.tournament?.averageToPar ?? practiceBaseline) - practiceBaseline;

  // Fetch qualifier entries for detailed qualifier analysis
  const { data: qualifierEntries } = await supabase
    .from('golf_qualifier_entries')
    .select(`
      id,
      qualifier_id,
      player_id,
      position,
      score,
      status,
      qualifier:golf_qualifiers(id, name, spots_available, start_date)
    `)
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  // Analyze qualifier performance
  const qualifierPerformance = analyzeQualifierPerformance(qualifierEntries as unknown as QualifierEntryRow[] | null);

  // Fetch qualifier rounds for detailed scenario analysis
  // Note: We filter rounds by type since direct qualifier_id foreign key may not exist in all deployments
  const { data: qualifierRounds } = await supabase
    .from('golf_rounds')
    .select('id, round_date, score_to_par, course_name')
    .eq('player_id', playerId)
    .eq('round_type', 'qualifier')
    .eq('status', 'completed')
    .order('round_date', { ascending: false });

  // Transform qualifier rounds to match expected type
  const qualifierRoundsTyped: QualifierRoundRow[] = ((qualifierRounds as unknown as RoundRow[]) ?? []).map(r => ({
    id: r.id,
    round_date: r.round_date,
    score_to_par: r.score_to_par,
    qualifier_id: null,
    qualifier: null,
  }));

  // Analyze pressure scenarios
  const pressureScenarios = analyzePressureScenarios(
    normalizedRounds,
    qualifierRoundsTyped,
    qualifierEntries as unknown as QualifierEntryRow[] | null,
    practiceBaseline
  );

  // Calculate trend data and determine trend direction
  const trendData = calculateTrendData(normalizedRounds, practiceBaseline);
  const pressureGapTrend = determineTrend(trendData);

  // Identify worst pressure scenarios
  const worstPressureScenarios = identifyWorstScenarios(pressureScenarios);

  // Generate insights
  const insights = generatePressureInsights(
    scoringByRoundType,
    pressureGap,
    qualifierGap,
    tournamentGap,
    pressureGapTrend,
    qualifierPerformance,
    pressureScenarios,
    trendData,
    practiceBaseline
  );

  return {
    playerId,
    analyzedAt: new Date().toISOString(),
    scoringByRoundType,
    pressureGap,
    qualifierGap,
    tournamentGap,
    pressureGapTrend,
    qualifierPerformance,
    pressureScenarios,
    trendData,
    worstPressureScenarios,
    insights,
    totalRoundsAnalyzed: normalizedRounds.length,
    practiceBaseline,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalizes round type string (handles 'qualifying' -> 'qualifier')
 */
function normalizeRoundType(roundType: string | null): RoundType {
  if (!roundType) return 'practice';
  const normalized = roundType.toLowerCase();
  if (normalized === 'qualifying') return 'qualifier';
  if (['tournament', 'qualifier', 'practice', 'casual'].includes(normalized)) {
    return normalized as RoundType;
  }
  return 'practice';
}

/**
 * Calculates scoring statistics by round type
 */
function calculateScoringByRoundType(
  rounds: Array<{ round_type: RoundType; total_score: number | null; score_to_par: number | null }>
): PressureAnalysis['scoringByRoundType'] {
  const roundTypes: RoundType[] = ['tournament', 'qualifier', 'practice', 'casual'];
  const result: PressureAnalysis['scoringByRoundType'] = {
    tournament: null,
    qualifier: null,
    practice: null,
    casual: null,
  };

  for (const type of roundTypes) {
    const typeRounds = rounds.filter(
      r => r.round_type === type && r.score_to_par !== null && r.total_score !== null
    );

    if (typeRounds.length === 0) continue;

    const scores = typeRounds.map(r => r.total_score!);
    const toParScores = typeRounds.map(r => r.score_to_par!);

    const avgScore = calculateMean(scores);
    const avgToPar = calculateMean(toParScores);
    const stdDev = calculateStandardDeviation(toParScores);

    result[type] = {
      roundType: type,
      averageScore: avgScore,
      averageToPar: avgToPar,
      roundCount: typeRounds.length,
      standardDeviation: stdDev,
      bestRound: Math.min(...toParScores),
      worstRound: Math.max(...toParScores),
      statisticallySignificant: typeRounds.length >= MIN_ROUNDS_FOR_SIGNIFICANCE,
    };
  }

  return result;
}

/**
 * Calculates the overall pressure gap (weighted average of tournament and qualifier gaps)
 */
function calculatePressureGap(
  scoring: PressureAnalysis['scoringByRoundType'],
  practiceBaseline: number
): number {
  const tournamentAvg = scoring.tournament?.averageToPar;
  const qualifierAvg = scoring.qualifier?.averageToPar;
  const tournamentCount = scoring.tournament?.roundCount ?? 0;
  const qualifierCount = scoring.qualifier?.roundCount ?? 0;

  if (tournamentCount === 0 && qualifierCount === 0) {
    return 0;
  }

  // Weighted average of pressure gaps
  const totalPressureRounds = tournamentCount + qualifierCount;
  const tournamentGapVal = tournamentAvg !== undefined ? (tournamentAvg - practiceBaseline) * tournamentCount : 0;
  const qualifierGapVal = qualifierAvg !== undefined ? (qualifierAvg - practiceBaseline) * qualifierCount : 0;

  return (tournamentGapVal + qualifierGapVal) / totalPressureRounds;
}

/**
 * Analyzes qualifier performance including make rate and bubble performance
 */
function analyzeQualifierPerformance(
  entries: QualifierEntryRow[] | null
): QualifierPerformance {
  const defaultPerformance: QualifierPerformance = {
    totalQualifiers: 0,
    madeCount: 0,
    missedCount: 0,
    makeRate: 0,
    avgPositionChange: 0,
    avgFinalPosition: 0,
    bubbleMadeCount: 0,
    bubbleMissedCount: 0,
    bubbleRate: 0,
  };

  if (!entries || entries.length === 0) {
    return defaultPerformance;
  }

  let madeCount = 0;
  let missedCount = 0;
  let bubbleMadeCount = 0;
  let bubbleMissedCount = 0;
  const positions: number[] = [];

  for (const entry of entries) {
    const position = entry.position;
    const spotsAvailable = entry.qualifier?.spots_available;

    if (position === null || spotsAvailable === null || spotsAvailable === undefined) continue;

    positions.push(position);

    const made = position <= spotsAvailable;
    if (made) {
      madeCount++;
    } else {
      missedCount++;
    }

    // Check if on the bubble (within BUBBLE_ZONE_POSITIONS of cutoff)
    const isOnBubble = Math.abs(position - spotsAvailable) <= BUBBLE_ZONE_POSITIONS;
    if (isOnBubble) {
      if (made) {
        bubbleMadeCount++;
      } else {
        bubbleMissedCount++;
      }
    }
  }

  const totalQualifiers = madeCount + missedCount;
  const bubbleTotal = bubbleMadeCount + bubbleMissedCount;

  return {
    totalQualifiers,
    madeCount,
    missedCount,
    makeRate: totalQualifiers > 0 ? madeCount / totalQualifiers : 0,
    avgPositionChange: 0, // Would need position tracking over rounds to calculate
    avgFinalPosition: positions.length > 0 ? calculateMean(positions) : 0,
    bubbleMadeCount,
    bubbleMissedCount,
    bubbleRate: bubbleTotal > 0 ? bubbleMadeCount / bubbleTotal : 0,
  };
}

/**
 * Analyzes specific pressure scenarios
 */
function analyzePressureScenarios(
  rounds: Array<{
    id: string;
    round_date: string;
    round_type: RoundType;
    score_to_par: number | null;
  }>,
  qualifierRounds: QualifierRoundRow[] | null,
  qualifierEntries: QualifierEntryRow[] | null,
  practiceBaseline: number
): PressureScenario[] {
  const scenarios: PressureScenario[] = [];

  // Scenario 1: Qualifier rounds overall performance
  if (qualifierRounds && qualifierRounds.length >= 2) {
    const qualifierScores = qualifierRounds
      .filter(r => r.score_to_par !== null)
      .map(r => r.score_to_par!);

    if (qualifierScores.length > 0) {
      const avgToPar = calculateMean(qualifierScores);
      scenarios.push({
        scenario: 'qualifier_rounds',
        description: 'Qualifier round performance',
        occurrences: qualifierScores.length,
        averageToPar: avgToPar,
        comparedToBaseline: avgToPar - practiceBaseline,
        details: `Average ${formatToPar(avgToPar)} in qualifier rounds`,
      });
    }
  }

  // Scenario 2: When on the bubble (close to cutoff)
  if (qualifierEntries && qualifierEntries.length > 0) {
    const bubbleEntries = qualifierEntries.filter(e => {
      const position = e.position;
      const spots = e.qualifier?.spots_available;
      if (position === null || spots === null || spots === undefined) return false;
      return Math.abs(position - spots) <= BUBBLE_ZONE_POSITIONS;
    });

    if (bubbleEntries.length >= 2) {
      const bubbleScores = bubbleEntries
        .filter(e => e.score !== null)
        .map(e => e.score!);

      if (bubbleScores.length > 0) {
        const madeCount = bubbleEntries.filter(e => {
          const position = e.position;
          const spots = e.qualifier?.spots_available;
          return position !== null && spots !== null && spots !== undefined && position <= spots;
        }).length;

        // Note: Using score which may be total score, not to-par
        // Convert to approximate to-par assuming average course par of 72
        const avgScore = calculateMean(bubbleScores);
        const approximateToPar = avgScore - 72;

        scenarios.push({
          scenario: 'on_the_bubble',
          description: 'When on the bubble (close to cutoff)',
          occurrences: bubbleEntries.length,
          averageToPar: approximateToPar,
          comparedToBaseline: approximateToPar - practiceBaseline,
          successRate: bubbleEntries.length > 0 ? madeCount / bubbleEntries.length : 0,
          details: `Made ${madeCount}/${bubbleEntries.length} qualifiers when on the bubble`,
        });
      }
    }
  }

  // Scenario 3: Opening round of tournament
  const tournamentRounds = rounds.filter(r => r.round_type === 'tournament');
  // Group by approximate dates to identify opening rounds
  const tournamentGroups = groupByTournament(tournamentRounds);
  const openingRounds: Array<{ score_to_par: number }> = [];

  for (const group of tournamentGroups) {
    // First round chronologically is the opening round
    const sorted = group.sort((a, b) =>
      new Date(a.round_date).getTime() - new Date(b.round_date).getTime()
    );
    if (sorted[0] && sorted[0].score_to_par !== null) {
      openingRounds.push({ score_to_par: sorted[0].score_to_par });
    }
  }

  if (openingRounds.length >= 2) {
    const openingScores = openingRounds.map(r => r.score_to_par);
    const avgToPar = calculateMean(openingScores);
    scenarios.push({
      scenario: 'tournament_opening_round',
      description: 'Opening round of tournament',
      occurrences: openingRounds.length,
      averageToPar: avgToPar,
      comparedToBaseline: avgToPar - practiceBaseline,
      details: `Average ${formatToPar(avgToPar)} in tournament opening rounds`,
    });
  }

  // Scenario 4: After a break (7+ days since last round)
  const roundsWithBreak = identifyPostBreakRounds(rounds);
  const pressurePostBreak = roundsWithBreak.filter(
    r => r.round_type === 'tournament' || r.round_type === 'qualifier'
  );

  if (pressurePostBreak.length >= 2) {
    const postBreakScores = pressurePostBreak
      .filter(r => r.score_to_par !== null)
      .map(r => r.score_to_par!);

    if (postBreakScores.length > 0) {
      const avgToPar = calculateMean(postBreakScores);
      scenarios.push({
        scenario: 'pressure_after_break',
        description: 'Pressure round after 7+ day break',
        occurrences: postBreakScores.length,
        averageToPar: avgToPar,
        comparedToBaseline: avgToPar - practiceBaseline,
        details: `Average ${formatToPar(avgToPar)} in pressure rounds after extended breaks`,
      });
    }
  }

  // Sort by how much worse than baseline (worst first)
  return scenarios.sort((a, b) => b.comparedToBaseline - a.comparedToBaseline);
}

/**
 * Groups tournament rounds by approximate tournament (rounds within 3 days of each other)
 */
function groupByTournament<T extends { round_date: string }>(rounds: T[]): T[][] {
  if (rounds.length === 0) return [];

  const sorted = [...rounds].sort((a, b) =>
    new Date(a.round_date).getTime() - new Date(b.round_date).getTime()
  );

  const groups: T[][] = [];
  let currentGroup: T[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const prev = sorted[i - 1]!;
    const daysDiff = Math.abs(
      (new Date(current.round_date).getTime() - new Date(prev.round_date).getTime()) /
      (1000 * 60 * 60 * 24)
    );

    if (daysDiff <= 3) {
      currentGroup.push(current);
    } else {
      groups.push(currentGroup);
      currentGroup = [current];
    }
  }
  groups.push(currentGroup);

  return groups;
}

/**
 * Identifies rounds that occurred after a 7+ day break
 */
function identifyPostBreakRounds<T extends { round_date: string }>(rounds: T[]): T[] {
  const sorted = [...rounds].sort((a, b) =>
    new Date(a.round_date).getTime() - new Date(b.round_date).getTime()
  );

  const postBreak: T[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const prev = sorted[i - 1]!;
    const daysDiff =
      (new Date(current.round_date).getTime() - new Date(prev.round_date).getTime()) /
      (1000 * 60 * 60 * 24);

    if (daysDiff >= 7) {
      postBreak.push(current);
    }
  }

  return postBreak;
}

/**
 * Calculates trend data for pressure gap over time
 */
function calculateTrendData(
  rounds: Array<{
    round_date: string;
    round_type: RoundType;
    score_to_par: number | null;
    course_name: string | null;
  }>,
  practiceBaseline: number
): PressureGapDataPoint[] {
  // Get pressure rounds (tournament + qualifier)
  const pressureRounds = rounds
    .filter(r =>
      (r.round_type === 'tournament' || r.round_type === 'qualifier') &&
      r.score_to_par !== null
    )
    .sort((a, b) => new Date(a.round_date).getTime() - new Date(b.round_date).getTime());

  // Calculate running practice average at each point
  const practiceRounds = rounds
    .filter(r => r.round_type === 'practice' && r.score_to_par !== null)
    .sort((a, b) => new Date(a.round_date).getTime() - new Date(b.round_date).getTime());

  return pressureRounds.slice(-TREND_EVENTS_COUNT).map(round => {
    // Get practice rounds before this pressure round
    const priorPractice = practiceRounds.filter(
      p => new Date(p.round_date) < new Date(round.round_date)
    );

    const runningPracticeAvg = priorPractice.length > 0
      ? calculateMean(priorPractice.map(p => p.score_to_par!))
      : practiceBaseline;

    const pressureGap = round.score_to_par! - runningPracticeAvg;

    return {
      eventDate: round.round_date,
      eventName: round.course_name ?? 'Unknown Course',
      eventType: round.round_type,
      scoreToPar: round.score_to_par!,
      pressureGap,
      runningPracticeAvg,
    };
  });
}

/**
 * Determines if pressure gap trend is widening, narrowing, or stable
 */
function determineTrend(trendData: PressureGapDataPoint[]): PressureGapTrend {
  if (trendData.length < MIN_EVENTS_FOR_TREND) {
    return 'stable';
  }

  // Compare first half to second half of trend data
  const midpoint = Math.floor(trendData.length / 2);
  const firstHalf = trendData.slice(0, midpoint);
  const secondHalf = trendData.slice(midpoint);

  const firstHalfAvg = calculateMean(firstHalf.map(d => d.pressureGap));
  const secondHalfAvg = calculateMean(secondHalf.map(d => d.pressureGap));

  const change = secondHalfAvg - firstHalfAvg;

  // Use 0.5 strokes as significance threshold
  if (change > 0.5) {
    return 'widening'; // Gap is getting worse
  } else if (change < -0.5) {
    return 'narrowing'; // Gap is improving
  }
  return 'stable';
}

/**
 * Identifies the worst pressure scenarios as strings
 */
function identifyWorstScenarios(scenarios: PressureScenario[]): string[] {
  return scenarios
    .filter(s => s.comparedToBaseline > 0.5) // At least 0.5 strokes worse
    .slice(0, 3) // Top 3 worst
    .map(s => {
      const strokes = s.comparedToBaseline.toFixed(1);
      return `${s.description} (+${strokes} vs practice)`;
    });
}

/**
 * Generates actionable insights from pressure analysis
 */
function generatePressureInsights(
  scoring: PressureAnalysis['scoringByRoundType'],
  pressureGap: number,
  qualifierGap: number,
  _tournamentGap: number,
  trend: PressureGapTrend,
  qualifierPerformance: QualifierPerformance,
  scenarios: PressureScenario[],
  trendData: PressureGapDataPoint[],
  practiceBaseline: number
): PressureInsight[] {
  const insights: PressureInsight[] = [];

  // Insight 1: Overall pressure gap
  if (Math.abs(pressureGap) > 0.5 && (scoring.tournament?.statisticallySignificant || scoring.qualifier?.statisticallySignificant)) {
    const direction = pressureGap > 0 ? 'worse' : 'better';
    const isPositive = pressureGap < 0;

    insights.push({
      id: 'pressure-gap-overall',
      category: 'pressure_gap',
      headline: isPositive
        ? `Pressure Player: ${Math.abs(pressureGap).toFixed(1)} Strokes Better Under Pressure`
        : `Pressure Gap: ${pressureGap.toFixed(1)} Strokes Worse Under Pressure`,
      body: `You score ${Math.abs(pressureGap).toFixed(1)} strokes ${direction} in tournaments and qualifiers compared to practice (practice avg: ${formatToPar(practiceBaseline)}).`,
      strokeImpact: Math.abs(pressureGap),
      confidence: Math.min(0.9, 0.5 + (scoring.tournament?.roundCount ?? 0 + (scoring.qualifier?.roundCount ?? 0)) * 0.02),
      recommendation: isPositive
        ? 'You perform well under pressure. Use this confidence to maintain aggressive course management in pressure situations.'
        : 'Consider mental game training and practice with simulated pressure. Pre-shot routines and breathing techniques can help.',
      priority: Math.abs(pressureGap) > 2 ? 'critical' : Math.abs(pressureGap) > 1 ? 'high' : 'medium',
    });
  }

  // Insight 2: Qualifier-specific gap
  if (scoring.qualifier?.statisticallySignificant && Math.abs(qualifierGap) > 0.5) {
    insights.push({
      id: 'pressure-qualifier-gap',
      category: 'qualifier',
      headline: `Qualifier Performance: ${formatToPar(scoring.qualifier.averageToPar)} Average`,
      body: `You score ${Math.abs(qualifierGap).toFixed(1)} strokes ${qualifierGap > 0 ? 'worse' : 'better'} in qualifiers vs practice. With ${scoring.qualifier.roundCount} qualifier rounds analyzed, this is a statistically significant pattern.`,
      strokeImpact: Math.abs(qualifierGap),
      confidence: 0.8,
      recommendation: qualifierGap > 0
        ? 'Treat qualifiers more like practice rounds. Your practice form shows you can score better.'
        : 'Your focus improves in qualifiers. Maintain this competitive mindset.',
      priority: qualifierGap > 1.5 ? 'high' : 'medium',
    });
  }

  // Insight 3: Qualifier make rate
  if (qualifierPerformance.totalQualifiers >= 5) {
    const makeRate = qualifierPerformance.makeRate * 100;
    insights.push({
      id: 'pressure-qualifier-rate',
      category: 'qualifier',
      headline: `Qualifier Make Rate: ${makeRate.toFixed(0)}%`,
      body: `You've made ${qualifierPerformance.madeCount} of ${qualifierPerformance.totalQualifiers} qualifiers (${makeRate.toFixed(0)}%). ${qualifierPerformance.avgFinalPosition > 0 ? `Average final position: ${qualifierPerformance.avgFinalPosition.toFixed(1)}` : ''}`,
      strokeImpact: qualifierPerformance.makeRate < 0.5 ? qualifierGap : 0,
      confidence: 0.85,
      recommendation: makeRate < 50
        ? 'Focus on consistent scoring rather than going low. Avoid big numbers that hurt position.'
        : 'Strong qualifier performance. Continue your current preparation approach.',
      priority: makeRate < 40 ? 'high' : makeRate < 60 ? 'medium' : 'low',
    });
  }

  // Insight 4: Bubble performance
  if (qualifierPerformance.bubbleMadeCount + qualifierPerformance.bubbleMissedCount >= 3) {
    const bubbleTotal = qualifierPerformance.bubbleMadeCount + qualifierPerformance.bubbleMissedCount;
    const bubbleRate = qualifierPerformance.bubbleRate * 100;

    insights.push({
      id: 'pressure-bubble',
      category: 'qualifier',
      headline: `Bubble Performance: ${qualifierPerformance.bubbleMadeCount}/${bubbleTotal} Made`,
      body: `When on the bubble (last few spots), you've made ${qualifierPerformance.bubbleMadeCount} of ${bubbleTotal} qualifiers (${bubbleRate.toFixed(0)}%). This is a critical high-pressure situation.`,
      strokeImpact: bubbleRate < 50 ? 1.5 : 0,
      confidence: 0.75,
      recommendation: bubbleRate < 50
        ? 'In bubble situations, play conservative on risky holes. Pars beat bogeys when spots are tight.'
        : 'You handle bubble pressure well. Trust your game when it matters most.',
      priority: bubbleRate < 40 ? 'high' : 'medium',
    });
  }

  // Insight 5: Pressure gap trend
  if (trendData.length >= MIN_EVENTS_FOR_TREND) {
    const firstHalf = trendData.slice(0, Math.floor(trendData.length / 2));
    const secondHalf = trendData.slice(Math.floor(trendData.length / 2));
    const firstAvg = calculateMean(firstHalf.map(d => d.pressureGap));
    const secondAvg = calculateMean(secondHalf.map(d => d.pressureGap));
    const change = secondAvg - firstAvg;

    if (Math.abs(change) > 0.3) {
      const trendDirection = trend === 'widening' ? 'widened' : 'narrowed';
      const isImproving = trend === 'narrowing';

      insights.push({
        id: 'pressure-trend',
        category: 'trend',
        headline: `Pressure Gap Has ${trend === 'widening' ? 'Widened' : 'Narrowed'} by ${Math.abs(change).toFixed(1)} Strokes`,
        body: `Over your last ${trendData.length} pressure events, your pressure gap has ${trendDirection} from ${formatToPar(firstAvg)} to ${formatToPar(secondAvg)} (relative to practice).`,
        strokeImpact: Math.abs(change),
        confidence: 0.7,
        recommendation: isImproving
          ? 'Your pressure performance is improving. Whatever you\'ve changed is working.'
          : 'Your pressure gap is growing. Consider adding mental game work to your routine.',
        priority: trend === 'widening' && change > 0.5 ? 'high' : 'medium',
      });
    }
  }

  // Insight 6: Worst pressure scenarios
  for (const scenario of scenarios.filter(s => s.comparedToBaseline > 1)) {
    insights.push({
      id: `pressure-scenario-${scenario.scenario}`,
      category: 'scenario',
      headline: `${scenario.description}: ${formatToPar(scenario.averageToPar)} Average`,
      body: `${scenario.details || ''} You average ${scenario.comparedToBaseline.toFixed(1)} strokes worse than practice in this scenario across ${scenario.occurrences} occurrences.`,
      strokeImpact: scenario.comparedToBaseline,
      confidence: scenario.occurrences >= 5 ? 0.8 : 0.65,
      recommendation: getScenarioRecommendation(scenario.scenario),
      priority: scenario.comparedToBaseline > 2 ? 'high' : 'medium',
    });
  }

  // Sort by stroke impact
  return insights.sort((a, b) => b.strokeImpact - a.strokeImpact);
}

/**
 * Gets recommendation for specific pressure scenario
 */
function getScenarioRecommendation(scenario: string): string {
  const recommendations: Record<string, string> = {
    qualifier_rounds: 'Qualifier rounds require consistency. Stick to your game plan and focus on process over outcome.',
    on_the_bubble: 'When on the bubble, every stroke matters equally. Play to your strengths and avoid unnecessary risks.',
    tournament_opening_round: 'First round jitters are normal. Warm up thoroughly and give yourself time to settle in.',
    pressure_after_break: 'After breaks, consider a practice round before important events. Get your feel back before the pressure.',
  };
  return recommendations[scenario] || 'Focus on pre-shot routine and commit fully to each shot.';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculates the mean of an array of numbers
 */
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculates the standard deviation of an array of numbers
 */
function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Formats score to par as a string (e.g., "+2", "E", "-3")
 */
function formatToPar(toPar: number): string {
  if (Math.abs(toPar) < 0.05) return 'E';
  if (toPar > 0) return `+${toPar.toFixed(1)}`;
  return toPar.toFixed(1);
}
