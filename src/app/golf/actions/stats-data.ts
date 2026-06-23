'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo
} from '@/lib/utils/golf-stats-calculator-shots';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import {
  generateStatisticalStrengthsWeaknesses,
  type StatisticalStrengthWeakness,
} from '@/lib/golf/strokes-gained';
import type {
  StatsFilter,
  StatsSummary,
  RoundSummary,
  SummaryStatsResponse,
  RoundTrendData,
  TrendAnalysisResponse,
  TeamComparisonStats,
  TeamComparisonResponse,
  FilterOptions,
  CourseStats,
  CourseBreakdownResponse,
  HoleAnalysis,
  WorstHoleResponse,
  SprayChartPoint,
  SprayChartResponse,
  SprayChartSector,
  SprayChartShotFamily,
  SprayChartShotGroup,
  SprayChartSummaryBand,
  SprayChartOutcomeBucket,
} from './stats-data-types';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';


// ============================================================================
// AUTH GUARD
// ============================================================================

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    await logServerError(`[Stats] Auth error: ${error.message}`, { action: 'stats_data.requireAuth' });
    throw new Error('Unauthorized');
  }
  if (!user) {
    await logServerError('[Stats] No user session found', { action: 'stats_data.requireAuth' });
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

/**
 * Verify the authenticated user has access to the given player's stats.
 * Access is granted if the user IS the player, or is a coach on their team.
 */
export async function verifyPlayerAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playerId: string
): Promise<boolean> {
  // Check if user IS the player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .eq('id', playerId)
    .single();

  if (player?.user_id === userId) return true;

  // Check if user is a coach on the player's team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (coach?.organization_id && player) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id, team:golf_teams(organization_id)')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (membership?.team && (membership.team as { organization_id: string }).organization_id === coach.organization_id) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// TYPES (imported from stats-data-types.ts)
// ============================================================================

type DetailedStatsRoundRow = {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  holes_played?: number | null;
  total_fairways_hit?: number | null;
  total_fairways?: number | null;
  total_gir?: number | null;
  total_gir_possible?: number | null;
  total_putts?: number | null;
};

type SprayChartShotRow = {
  id: string;
  round_id: string;
  hole_id: string | null;
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  club_type: string | null;
  lie_before: string | null;
  lie_after: string | null;
  distance_to_hole_before: number | null;
  distance_unit_before: string | null;
  result: string | null;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  is_penalty: boolean | null;
  penalty_type: string | null;
  approach_miss_details: {
    miss_direction: string | null;
    lie_type: string | null;
    distance_from_green_yards: number | null;
  } | Array<{
    miss_direction: string | null;
    lie_type: string | null;
    distance_from_green_yards: number | null;
  }> | null;
};

// ============================================================================
// FILTER HELPERS
// ============================================================================

/**
 * Build filter conditions for a Supabase query
 * Returns an object with filter functions to apply
 */
function getFilterConditions(filter?: StatsFilter): {
  startDate: string | null;
  endDate: string | null;
  roundType: string | null;
  courseName: string | null;
} {
  if (!filter) {
    return { startDate: null, endDate: null, roundType: null, courseName: null };
  }

  // Date-based presets
  const now = new Date();
  let startDateVal: string | null = null;
  let endDateVal: string | null = filter.endDate || null;

  if (filter.preset === 'thisMonth') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    startDateVal = monthStart.toISOString().split('T')[0] ?? null;
  } else if (filter.preset === 'thisYear') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    startDateVal = yearStart.toISOString().split('T')[0] ?? null;
  } else if (filter.startDate) {
    startDateVal = filter.startDate;
  }

  // Season filter
  if (filter.season) {
    const seasonStart = new Date(filter.season, 0, 1);
    const seasonEnd = new Date(filter.season, 11, 31);
    startDateVal = seasonStart.toISOString().split('T')[0] ?? null;
    endDateVal = seasonEnd.toISOString().split('T')[0] ?? null;
  }

  // Round type filter
  let roundType: string | null = null;
  if (filter.preset === 'tournaments') {
    roundType = 'tournament';
  } else if (filter.preset === 'practice') {
    roundType = 'practice';
  } else if (filter.roundType) {
    roundType = filter.roundType;
  }

  return {
    startDate: startDateVal,
    endDate: endDateVal,
    roundType,
    courseName: filter.courseName || null,
  };
}

function applyRoundTypeFilter<T extends { in(column: string, values: string[]): T; eq(column: string, value: string): T }>(
  query: T,
  roundType: string | null
): T {
  if (!roundType) return query;
  if (roundType === 'qualifier') {
    return query.in('round_type', ['qualifier', 'qualifying']);
  }
  return query.eq('round_type', roundType);
}

/**
 * Apply preset limit after fetching
 */
function applyPresetLimit<T>(rounds: T[], filter?: StatsFilter): T[] {
  if (!filter?.preset) return rounds;

  switch (filter.preset) {
    case 'last5':
      return rounds.slice(0, 5);
    case 'last10':
      return rounds.slice(0, 10);
    case 'last20':
      return rounds.slice(0, 20);
    default:
      return rounds;
  }
}

function serializeDetailedStats(stats: GolfStats): GolfStats {
  // Server actions cannot serialize NaN/Infinity reliably. Converting through
  // JSON normalizes those edge cases to null and keeps the payload stable.
  return JSON.parse(JSON.stringify(stats)) as GolfStats;
}

function buildFallbackDetailedStats(roundsData: DetailedStatsRoundRow[]): GolfStats {
  const fallback = calculateStatsFromShots([], [], []);

  if (roundsData.length === 0) {
    return fallback;
  }

  const completedRounds = roundsData.filter(
    (round): round is DetailedStatsRoundRow & { total_score: number } => round.total_score !== null
  );

  fallback.roundsPlayed = completedRounds.length;
  fallback.holesPlayed = completedRounds.reduce((sum, round) => sum + (round.holes_played ?? 18), 0);

  if (completedRounds.length > 0) {
    const normalizedScores = completedRounds.map((round) => {
      const holesPlayed = round.holes_played ?? 18;
      return Math.round(round.total_score * (18 / holesPlayed));
    });

    // Scoring average: 18-hole rounds only (NCAA-style)
    const rounds18 = completedRounds.filter(r => (r.holes_played ?? 18) === 18);
    if (rounds18.length > 0) {
      const totalStrokes18 = rounds18.reduce((sum, r) => sum + r.total_score, 0);
      fallback.scoringAverage = Math.round((totalStrokes18 / rounds18.length) * 100) / 100;
    }
    fallback.bestRound = normalizedScores.length > 0 ? Math.min(...normalizedScores) : null;
    fallback.worstRound = normalizedScores.length > 0 ? Math.max(...normalizedScores) : null;
  }

  // avg-to-par: 18-hole rounds only, matching scoringAverage above and the
  // canonical engine (totalScoreToPar18 / roundsPlayed18). A 9-hole round's raw
  // score_to_par must not leak into a per-18-round average.
  const roundsWithToPar18 = completedRounds.filter(
    (round): round is DetailedStatsRoundRow & { total_score: number; score_to_par: number } =>
      round.score_to_par !== null && (round.holes_played ?? 18) === 18
  );
  if (roundsWithToPar18.length > 0) {
    const totalToPar = roundsWithToPar18.reduce((sum, round) => sum + round.score_to_par, 0);
    fallback.avgScoreToPar = Math.round((totalToPar / roundsWithToPar18.length) * 100) / 100;
  }

  const roundTypeBuckets = {
    practice: [] as number[],
    qualifier: [] as number[],
    tournament: [] as number[],
  };

  for (const round of completedRounds) {
    const normalizedType = round.round_type ? roundTypeFromDb(round.round_type) : null;
    if (!normalizedType) continue;

    const holesPlayed = round.holes_played ?? 18;
    if (holesPlayed !== 18) continue;
    const normalizedScore = Math.round(round.total_score * 100) / 100;

    if (normalizedType === 'practice') roundTypeBuckets.practice.push(normalizedScore);
    if (normalizedType === 'qualifier') roundTypeBuckets.qualifier.push(normalizedScore);
    if (normalizedType === 'tournament') roundTypeBuckets.tournament.push(normalizedScore);
  }

  fallback.practiceRounds = roundTypeBuckets.practice.length;
  fallback.qualifyingRounds = roundTypeBuckets.qualifier.length;
  fallback.tournamentRounds = roundTypeBuckets.tournament.length;
  fallback.practiceScoringAvg = roundTypeBuckets.practice.length > 0
    ? Math.round((roundTypeBuckets.practice.reduce((sum, score) => sum + score, 0) / roundTypeBuckets.practice.length) * 100) / 100
    : null;
  fallback.qualifyingScoringAvg = roundTypeBuckets.qualifier.length > 0
    ? Math.round((roundTypeBuckets.qualifier.reduce((sum, score) => sum + score, 0) / roundTypeBuckets.qualifier.length) * 100) / 100
    : null;
  fallback.tournamentScoringAvg = roundTypeBuckets.tournament.length > 0
    ? Math.round((roundTypeBuckets.tournament.reduce((sum, score) => sum + score, 0) / roundTypeBuckets.tournament.length) * 100) / 100
    : null;

  let totalFairwaysHit = 0;
  let totalFairways = 0;
  let totalGir = 0;
  let totalGirPossible = 0;
  let totalPutts = 0;
  let totalPuttHoles = 0;

  for (const round of roundsData) {
    if (round.total_fairways_hit != null && round.total_fairways != null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairways += round.total_fairways;
    }

    if (round.total_gir != null && round.total_gir_possible != null) {
      totalGir += round.total_gir;
      totalGirPossible += round.total_gir_possible;
    }

    if (round.total_putts != null) {
      totalPutts += round.total_putts;
      totalPuttHoles += round.holes_played ?? 18;
    }
  }

  fallback.fairwaysHit = totalFairwaysHit;
  fallback.fairwayOpportunities = totalFairways;
  fallback.fairwayPercentage = totalFairways > 0
    ? Math.round((totalFairwaysHit / totalFairways) * 1000) / 10
    : null;
  fallback.girTotal = totalGir;
  fallback.girOpportunities = totalGirPossible;
  fallback.girPercentage = totalGirPossible > 0
    ? Math.round((totalGir / totalGirPossible) * 1000) / 10
    : null;
  fallback.totalPutts = totalPutts;
  fallback.puttsPerRound = totalPuttHoles > 0
    ? Math.round((totalPutts / totalPuttHoles) * 18 * 100) / 100
    : null;
  fallback.puttsPerHole = fallback.holesPlayed > 0
    ? Math.round((totalPutts / fallback.holesPlayed) * 100) / 100
    : null;

  return fallback;
}

const SPRAY_SECTOR_ORDER: SprayChartSector[] = [
  'long_left',
  'long',
  'long_right',
  'left',
  'center',
  'right',
  'short_left',
  'short',
  'short_right',
];

const SPRAY_SECTOR_LABELS: Record<SprayChartSector, string> = {
  center: 'Center',
  left: 'Left',
  right: 'Right',
  short: 'Short',
  long: 'Long',
  short_left: 'Short Left',
  short_right: 'Short Right',
  long_left: 'Long Left',
  long_right: 'Long Right',
};

const SPRAY_VECTOR_MAP: Record<SprayChartSector, { x: number; y: number }> = {
  center: { x: 0, y: 0 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  short: { x: 0, y: -1 },
  long: { x: 0, y: 1 },
  short_left: { x: -0.72, y: -0.72 },
  short_right: { x: 0.72, y: -0.72 },
  long_left: { x: -0.72, y: 0.72 },
  long_right: { x: 0.72, y: 0.72 },
};

function normalizeDistanceToYards(value: number | null, unit: string | null | undefined): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return unit === 'feet' ? Math.round((value / 3) * 10) / 10 : value;
}

function roundStat(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function normalizeSpraySector(
  rawDirection: string | null | undefined,
  fallback: {
    result?: string | null;
    lieAfter?: string | null;
    isPenalty?: boolean | null;
  }
): SprayChartSector {
  const direction = rawDirection?.trim().toLowerCase().replace(/\s+/g, '_');

  if (direction === 'center' || direction === 'middle') return 'center';
  if (direction === 'left') return 'left';
  if (direction === 'right') return 'right';
  if (direction === 'short') return 'short';
  if (direction === 'long') return 'long';
  if (direction === 'short_left' || direction === 'left_short') return 'short_left';
  if (direction === 'short_right' || direction === 'right_short') return 'short_right';
  if (direction === 'long_left' || direction === 'left_long') return 'long_left';
  if (direction === 'long_right' || direction === 'right_long') return 'long_right';

  if (fallback.isPenalty || fallback.result === 'penalty') {
    return 'center';
  }

  if (fallback.result === 'fairway' || fallback.result === 'green' || fallback.result === 'hole' || fallback.lieAfter === 'fairway' || fallback.lieAfter === 'green') {
    return 'center';
  }

  return 'center';
}

function getSprayOutcomeBucket(input: {
  isPenalty?: boolean | null;
  result?: string | null;
  lieAfter?: string | null;
  approachLieType?: string | null;
}): SprayChartOutcomeBucket {
  if (input.isPenalty || input.result === 'penalty') {
    return 'penalty';
  }

  const finishLie = input.approachLieType ?? input.lieAfter;
  if (finishLie === 'rough' || finishLie === 'sand' || finishLie === 'bunker' || input.result === 'rough' || input.result === 'sand') {
    return 'trouble';
  }

  return 'playable';
}

function buildDrivingCoordinates(sector: SprayChartSector, forwardDistance: number | null): { x: number; y: number } {
  const vector = SPRAY_VECTOR_MAP[sector];
  if (!vector || forwardDistance === null) {
    return { x: 0, y: 0 };
  }

  const lateralMagnitude = Math.max(10, Math.min(forwardDistance * 0.22, 75));
  const forwardFactor = sector.startsWith('short') ? 0.82 : sector.startsWith('long') ? 1.05 : 1;

  return {
    x: roundStat(vector.x * lateralMagnitude) ?? 0,
    y: roundStat(forwardDistance * forwardFactor) ?? 0,
  };
}

function buildApproachCoordinates(
  sector: SprayChartSector,
  remainingDistance: number | null
): { x: number; y: number } {
  const vector = SPRAY_VECTOR_MAP[sector];
  if (!vector || remainingDistance === null) {
    return { x: 0, y: 0 };
  }

  const magnitude = Math.max(3, Math.min(remainingDistance, 60));
  return {
    x: roundStat(vector.x * magnitude) ?? 0,
    y: roundStat(vector.y * magnitude) ?? 0,
  };
}

function formatSprayTooltip(point: {
  family: SprayChartShotFamily;
  holeNumber: number;
  shotNumber: number;
  sector: SprayChartSector;
  outcomeBucket: SprayChartOutcomeBucket;
  shotDistance: number | null;
  distanceBefore: number | null;
  distanceAfter: number | null;
}): string {
  const segments = [
    `Hole ${point.holeNumber}, Shot ${point.shotNumber}`,
    `${point.family === 'driving' ? 'Tee' : 'Approach'}: ${SPRAY_SECTOR_LABELS[point.sector]}`,
  ];

  if (point.distanceBefore !== null) {
    segments.push(`Before: ${Math.round(point.distanceBefore)}y`);
  }
  if (point.shotDistance !== null) {
    segments.push(`Shot: ${Math.round(point.shotDistance)}y`);
  }
  if (point.distanceAfter !== null) {
    segments.push(`Remaining: ${Math.round(point.distanceAfter)}y`);
  }

  segments.push(
    point.outcomeBucket === 'penalty'
      ? 'Penalty / severe'
      : point.outcomeBucket === 'trouble'
        ? 'Rough / sand'
        : 'Playable'
  );

  return segments.join(' • ');
}

function buildSprayChartGroup(
  family: SprayChartShotFamily,
  points: SprayChartPoint[],
  totalShots: number
): SprayChartShotGroup {
  const summaryBands: SprayChartSummaryBand[] = SPRAY_SECTOR_ORDER.map((sector) => {
    const sectorPoints = points.filter((point) => point.sector === sector);
    const avgForward = sectorPoints.length > 0
      ? sectorPoints.reduce((sum, point) => sum + (point.shotDistance ?? 0), 0) / sectorPoints.filter((point) => point.shotDistance !== null).length
      : null;
    const avgRemaining = sectorPoints.length > 0
      ? sectorPoints.reduce((sum, point) => sum + (point.distanceAfter ?? 0), 0) / sectorPoints.filter((point) => point.distanceAfter !== null).length
      : null;

    return {
      sector,
      label: SPRAY_SECTOR_LABELS[sector],
      count: sectorPoints.length,
      percentage: points.length > 0 ? Math.round((sectorPoints.length / points.length) * 1000) / 10 : 0,
      avgForwardDistance: roundStat(Number.isFinite(avgForward ?? NaN) ? avgForward : null),
      avgRemainingDistance: roundStat(Number.isFinite(avgRemaining ?? NaN) ? avgRemaining : null),
    };
  });

  const dominantSector = summaryBands
    .filter((band) => band.count > 0)
    .sort((a, b) => b.count - a.count)[0]?.sector ?? null;

  const forwardValues = points.map((point) => point.shotDistance).filter((value): value is number => value !== null);
  const remainingValues = points.map((point) => point.distanceAfter).filter((value): value is number => value !== null);

  return {
    family,
    totalShots,
    plottedShots: points.length,
    averageForwardDistance: forwardValues.length > 0 ? roundStat(forwardValues.reduce((sum, value) => sum + value, 0) / forwardValues.length) : null,
    averageRemainingDistance: remainingValues.length > 0 ? roundStat(remainingValues.reduce((sum, value) => sum + value, 0) / remainingValues.length) : null,
    playableCount: points.filter((point) => point.outcomeBucket === 'playable').length,
    troubleCount: points.filter((point) => point.outcomeBucket === 'trouble').length,
    penaltyCount: points.filter((point) => point.outcomeBucket === 'penalty').length,
    dominantSector,
    points,
    summaryBands,
  };
}

// ============================================================================
// FAST INITIAL LOAD - Summary stats only (no shot data)
// ============================================================================

/**
 * Get lightweight summary stats for a player
 * This uses pre-aggregated data from rounds table - no shot queries
 * Typically 10-50ms vs 500-2000ms for full shot analysis
 */
export async function getStatsSummary(
  playerId: string,
  filter?: StatsFilter
): Promise<SummaryStatsResponse> {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return {
      summary: {
        roundsPlayed: 0,
        holesPlayed: 0,
        scoringAverage: null,
        bestRound: null,
        worstRound: null,
        girPercentage: null,
        fairwayPercentage: null,
        puttsPerRound: null,
        scramblingPercentage: null,
      },
      rounds: [],
    };
  }

  const conditions = getFilterConditions(filter);

  // Build query with filters
  let query = supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts,
      holes_played
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null);

  // Apply filter conditions
  if (conditions.startDate) {
    query = query.gte('round_date', conditions.startDate);
  }
  if (conditions.endDate) {
    query = query.lte('round_date', conditions.endDate);
  }
  query = applyRoundTypeFilter(query, conditions.roundType);
  if (conditions.courseName) {
    query = query.eq('course_name', conditions.courseName);
  }

  query = query.order('round_date', { ascending: false });

  const { data: roundsData, error } = await query;

  // Apply preset limits
  const filteredRounds = applyPresetLimit(roundsData || [], filter);

  if (error || filteredRounds.length === 0) {
    return {
      summary: {
        roundsPlayed: 0,
        holesPlayed: 0,
        scoringAverage: null,
        bestRound: null,
        worstRound: null,
        girPercentage: null,
        fairwayPercentage: null,
        puttsPerRound: null,
        scramblingPercentage: null,
      },
      rounds: [],
    };
  }

  // Fetch scrambling data from golf_holes — missed GIR + made par or better = scramble
  // Uses (score - par) <= 0 to match the DB trigger definition exactly
  const roundIds = filteredRounds.map(r => r.id);
  const { data: holesWithScrambling } = await fetchAllRowsResult((from, to) => supabase
    .from('golf_holes')
    .select('score, par')
    .in('round_id', roundIds)
    .not('score', 'is', null)
    .eq('gir', false)
    .order('id', { ascending: true })
    .range(from, to)); // paginate past PostgREST 1000-row cap

  let scramblingAttempts = 0;
  let scramblingMade = 0;
  if (holesWithScrambling) {
    for (const hole of holesWithScrambling) {
      scramblingAttempts++;
      if (hole.score !== null && hole.par !== null && (hole.score - hole.par) <= 0) {
        scramblingMade++;
      }
    }
  }

  // Calculate summary stats from filtered rounds
  // Build score data with holes_played for normalization
  const roundScores = filteredRounds
    .filter((r): r is typeof r & { total_score: number } => r.total_score !== null)
    .map(r => ({
      score: r.total_score,
      holesPlayed: r.holes_played ?? 18,
    }));
  const roundsPlayed = roundScores.length;

  // Calculate aggregates
  let totalFairwaysHit = 0;
  let totalFairwayOpp = 0;
  let totalGir = 0;
  let totalGirOpp = 0;
  let totalPutts = 0;
  let totalPuttsHoles = 0;

  for (const round of filteredRounds) {
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairwaysHit += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
      totalPuttsHoles += (round.holes_played ?? 18);
    }
  }

  // Scoring average: 18-hole rounds only (NCAA-style)
  let scoringAverage: number | null = null;
  const rounds18 = roundScores.filter(r => r.holesPlayed === 18);
  if (rounds18.length > 0) {
    const totalStrokes18 = rounds18.reduce((sum, r) => sum + r.score, 0);
    scoringAverage = Math.round((totalStrokes18 / rounds18.length) * 100) / 100;
  }

  // For best/worst round, normalize to 18-hole equivalent
  // A 9-hole score of 38 becomes 38 * (18/9) = 76
  let bestRound: number | null = null;
  let worstRound: number | null = null;
  if (roundScores.length > 0) {
    const normalized = roundScores.map(r => Math.round(r.score * (18 / r.holesPlayed)));
    bestRound = Math.min(...normalized);
    worstRound = Math.max(...normalized);
  }

  const summary: StatsSummary = {
    roundsPlayed,
    holesPlayed: filteredRounds.reduce((sum, r) => sum + (r.holes_played ?? 18), 0),
    scoringAverage,
    bestRound,
    worstRound,
    girPercentage: totalGirOpp > 0
      ? Math.round((totalGir / totalGirOpp) * 1000) / 10
      : null,
    fairwayPercentage: totalFairwayOpp > 0
      ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
      : null,
    // Normalize putts to per-18-holes to handle mixed 9/18-hole rounds
    puttsPerRound: totalPuttsHoles > 0
      ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10
      : null,
    scramblingPercentage: scramblingAttempts > 0
      ? Math.round((scramblingMade / scramblingAttempts) * 1000) / 10
      : null,
  };

  const rounds: RoundSummary[] = filteredRounds.map(r => ({
    id: r.id,
    round_date: r.round_date,
    course_name: r.course_name,
    round_type: r.round_type,
    total_score: r.total_score,
    score_to_par: r.score_to_par,
  }));

  return { summary, rounds };
}

// ============================================================================
// ON-DEMAND LOAD - Full shot-level stats (lazy loaded)
// ============================================================================

/**
 * Core query + shape logic shared by the user-scoped `getDetailedStats`
 * (auth-gated, called by the Stats page client) and the trusted-server
 * `getDetailedStatsAsAdmin` (called by the CoachHelm engine from contexts
 * without a user session — post-round fire-and-forget, cron, etc).
 *
 * Both public wrappers handle auth/access verification differently; once
 * they reach this helper the query shape is identical.
 */
// Perf fix (incident 3): hard cap the rounds window for detailed stats so we
// never feed hundreds of round_ids into the IN-list of the shots/holes query.
// 100 rounds covers a full college season + ample headroom. Anything beyond
// that is not actionable in stats UI today (the page filters down to season /
// last-N anyway).
const DETAILED_STATS_MAX_ROUNDS = 100;

function presetLimitCount(filter?: StatsFilter): number | null {
  switch (filter?.preset) {
    case 'last5':
      return 5;
    case 'last10':
      return 10;
    case 'last20':
      return 20;
    default:
      return null;
  }
}

async function queryDetailedStatsWithClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter,
  // When the user-scoped shot query trips the 8s statement_timeout (the per-row
  // golf_shots RLS policies — is_golf_team_coach() etc. — make a coach reading a
  // player's ~1k shots far more expensive than the same rows read as service
  // role), retry ONCE on the admin client (no RLS, no statement_timeout) instead
  // of degrading to round-level stats, which blanks SG, putting-by-distance,
  // approach, and par scoring. Safe because getDetailedStats already authorised
  // the viewer via verifyPlayerAccess before this query. false on the retry call
  // itself prevents recursion.
  allowAdminRetry: boolean = true,
): Promise<GolfStats> {
  const conditions = getFilterConditions(filter);

  let query = supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par,
      holes_played,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed');

  if (conditions.startDate) query = query.gte('round_date', conditions.startDate);
  if (conditions.endDate) query = query.lte('round_date', conditions.endDate);
  query = applyRoundTypeFilter(query, conditions.roundType);
  if (conditions.courseName) query = query.eq('course_name', conditions.courseName);
  query = query.order('round_date', { ascending: false });

  // Push the preset limit into SQL — previously we fetched every completed
  // round and sliced in JS, which meant the shots/holes IN(round_ids) query
  // below could fan out to hundreds of UUIDs and trip statement_timeout.
  // For non-preset queries we still cap at DETAILED_STATS_MAX_ROUNDS so the
  // fan-out stays bounded.
  const presetLimit = presetLimitCount(filter);
  const sqlLimit = presetLimit ?? DETAILED_STATS_MAX_ROUNDS;
  query = query.limit(sqlLimit);

  // For non-preset queries, also count the unfiltered total so we can tell the
  // UI when the cap silently truncated the window. Counting in parallel keeps
  // the extra hop off the critical path. We only do this when no preset is
  // active — preset caps are explicit user requests, not silent truncation.
  let totalCountForFilter: number | null = null;
  if (presetLimit === null) {
    let countQuery = supabase
      .from('golf_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('status', 'completed');

    if (conditions.startDate) countQuery = countQuery.gte('round_date', conditions.startDate);
    if (conditions.endDate) countQuery = countQuery.lte('round_date', conditions.endDate);
    countQuery = applyRoundTypeFilter(countQuery, conditions.roundType);
    if (conditions.courseName) countQuery = countQuery.eq('course_name', conditions.courseName);

    const { count: matchedCount, error: countError } = await countQuery;
    if (!countError) {
      totalCountForFilter = matchedCount ?? null;
    }
  }

  const { data: fetchedRounds, error: roundsError } = await query;
  if (roundsError) {
    await logServerError(`[Stats] Rounds query error: ${describeError(roundsError)}`, { action: 'stats_data.queryDetailedStatsWithClient' });
    return calculateStatsFromShots([], [], []);
  }

  const roundsData = applyPresetLimit(fetchedRounds || [], filter);
  if (roundsData.length === 0) return calculateStatsFromShots([], [], []);

  // Truncation flag: only meaningful for non-preset queries. We compare the
  // unfiltered match count against the hard cap. If we couldn't get an exact
  // count (rare — query error), fall back to the cap-equality heuristic.
  const truncated = presetLimit === null
    ? (totalCountForFilter !== null
        ? totalCountForFilter > DETAILED_STATS_MAX_ROUNDS
        : roundsData.length >= DETAILED_STATS_MAX_ROUNDS)
    : false;

  const roundIds = roundId && roundId !== 'overall'
    ? [roundId]
    : roundsData.map(r => r.id);

  try {
    const [{ data: holesData, error: holesError }, { data: shotsData, error: shotsError }] = await Promise.all([
      fetchAllRowsResult((from, to) => supabase
        .from('golf_holes')
        .select('id, round_id, hole_number, par, yardage, score, putts, fairway_hit, gir, sand_save')
        .in('round_id', roundIds)
        .order('id', { ascending: true })
        .range(from, to)), // paginate past PostgREST 1000-row cap
      fetchAllRowsResult((from, to) => supabase
        .from('golf_shots')
        .select(`
          id,
          round_id,
          hole_id,
          hole_number,
          shot_number,
          shot_type,
          club_type,
          lie_before,
          lie_after,
          distance_to_hole_before,
          distance_unit_before,
          result,
          distance_to_hole_after,
          distance_unit_after,
          shot_distance,
          miss_direction,
          putt_break,
          putt_distance_feet,
          putt_slope,
          putt_made,
          is_penalty,
          penalty_type,
          putt_details(miss_tags, break_direction, estimated_break_inches, distance_feet, made),
          approach_miss_details(miss_direction, lie_type, distance_from_green_yards)
        `)
        .in('round_id', roundIds)
        .order('hole_number')
        .order('shot_number')
        .order('id', { ascending: true })
        .range(from, to)), // paginate past PostgREST 1000-row cap
    ]);

    if (holesError) throw holesError;
    if (shotsError) throw shotsError;

    const filteredRoundsData = roundId && roundId !== 'overall'
      ? roundsData.filter(r => r.id === roundId)
      : roundsData;

    const roundsInfo: RoundInfo[] = filteredRoundsData.map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name || 'Unknown Course',
      round_type: r.round_type ? roundTypeFromDb(r.round_type) : null,
      // Without this the engine infers 18-vs-9 from the hole-row count, which
      // misclassifies partially-entered rounds (matches player-profile-stats).
      holes_played: r.holes_played,
    }));

    const holesInfo: HoleInfo[] = (holesData || []).map(h => ({
      id: h.id,
      round_id: h.round_id,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage ?? null,
      score: h.score ?? null,
      putts: h.putts ?? null,
      fairway_hit: h.fairway_hit ?? null,
      gir: h.gir ?? null,
      sand_save: h.sand_save ?? null,
    }));

    const shots: RawShot[] = (shotsData || []).map(s => {
      let shotDistance = s.shot_distance;
      if (shotDistance === null && s.distance_to_hole_before !== null && s.distance_to_hole_after !== null) {
        const beforeYards = s.distance_unit_before === 'feet'
          ? s.distance_to_hole_before / 3
          : s.distance_to_hole_before;
        const afterYards = s.distance_unit_after === 'feet'
          ? s.distance_to_hole_after / 3
          : s.distance_to_hole_after;
        shotDistance = Math.max(0, Math.round(beforeYards - afterYards));
      }

      const puttDetails = Array.isArray(s.putt_details) ? s.putt_details[0] : s.putt_details;
      const approachMissDetails = Array.isArray(s.approach_miss_details) ? s.approach_miss_details[0] : s.approach_miss_details;

      return {
        id: s.id,
        round_id: s.round_id,
        hole_id: s.hole_id,
        hole_number: s.hole_number,
        shot_number: s.shot_number,
        shot_type: s.shot_type as 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty',
        club_type: s.club_type as 'driver' | 'non_driver' | 'putter',
        lie_before: s.lie_before as 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other',
        lie_after: s.lie_after as 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other' | null,
        distance_to_hole_before: s.distance_to_hole_before,
        distance_unit_before: s.distance_unit_before as 'yards' | 'feet',
        result: s.result as 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty',
        distance_to_hole_after: s.distance_to_hole_after,
        distance_unit_after: s.distance_unit_after as 'yards' | 'feet',
        shot_distance: shotDistance,
        miss_direction: s.miss_direction,
        putt_break: s.putt_break,
        putt_distance_feet: s.putt_distance_feet,
        putt_slope: s.putt_slope,
        putt_made: s.putt_made,
        is_penalty: s.is_penalty ?? false,
        penalty_type: s.penalty_type,
        putt_miss_tags: puttDetails?.miss_tags ?? null,
        putt_break_direction: puttDetails?.break_direction ?? null,
        putt_estimated_break_inches: puttDetails?.estimated_break_inches ?? null,
        approach_miss_direction: approachMissDetails?.miss_direction ?? null,
        approach_miss_lie_type: approachMissDetails?.lie_type ?? null,
        approach_miss_distance_from_green: approachMissDetails?.distance_from_green_yards ?? null,
      };
    });

    // Per-team SG baseline scale (women's 1.083, NCAA D1/D2/D3, etc.) so the
    // Stats page SG matches the DB cache, which already applies it. Resolved via
    // the same DB function the cache uses (sg_scale_for_player) = single source.
    const { data: sgScaleRaw } = await supabase.rpc('sg_scale_for_player', { p_player_id: playerId });
    const sgScale = typeof sgScaleRaw === 'number' && sgScaleRaw > 0 ? sgScaleRaw : 1;

    const computed = calculateStatsFromShots(shots, holesInfo, roundsInfo, { sgScale });
    computed.truncated = truncated;
    return serializeDetailedStats(computed);
  } catch (error) {
    const described = describeError(error);
    const isStatementTimeout =
      described.includes('57014') || described.toLowerCase().includes('statement_timeout');
    if (isStatementTimeout) {
      // The user-scoped shot query hit statement_timeout (57014) — almost always
      // RLS overhead (per-row golf_shots policies) under DB load, NOT a query that
      // is genuinely too large. Re-run the SAME query on the service-role client,
      // which bypasses RLS and has no statement_timeout, so the viewer still gets
      // FULL detailed stats instead of a round-level fallback that blanks SG /
      // putting / approach / par scoring. Authorisation was already enforced by
      // getDetailedStats → verifyPlayerAccess, so this widens no data access.
      if (allowAdminRetry) {
        try {
          const admin = createAdminClient();
          const recovered = await queryDetailedStatsWithClient(
            admin as unknown as Awaited<ReturnType<typeof createClient>>,
            playerId,
            roundId,
            filter,
            false,
          );
          // Keep out of Sentry (handled, recovered) but record for perf tracking.
          await logServerError(`[Stats] Recovered full stats via admin client after statement_timeout: ${described}`, { action: 'stats_data.queryDetailedStatsWithClient', skipSentry: true }, 'warning');
          return recovered;
        } catch (retryError) {
          // Admin retry also failed — fall through to the round-level fallback so
          // the user still sees headline numbers. This one IS worth a Sentry page.
          await logServerError(`[Stats] Admin retry after statement_timeout failed: ${describeError(retryError)}`, { action: 'stats_data.queryDetailedStatsWithClient' });
        }
      } else {
        // Handled degradation: the detailed-shot query hit statement_timeout (57014)
        // and we fall back to round-level stats — the user still gets data. Record it
        // for perf tracking but keep THIS specific case out of Sentry (issue 4K).
        await logServerError(`[Stats] Falling back to round-level stats: ${described}`, { action: 'stats_data.queryDetailedStatsWithClient', skipSentry: true }, 'warning');
      }
    } else {
      // Any OTHER failure (schema break, bad response shape, mapping/calc bug) is a
      // real defect that also degrades to round-level stats — it MUST still page
      // Sentry on the default path so it is not silently masked.
      await logServerError(`[Stats] Falling back to round-level stats: ${described}`, { action: 'stats_data.queryDetailedStatsWithClient' });
    }
    const fallback = buildFallbackDetailedStats(roundsData);
    fallback.truncated = truncated;
    return serializeDetailedStats(fallback);
  }
}

/**
 * Get detailed shot-level stats for comprehensive analysis
 * This is the expensive query - only call when user clicks a detailed tab
 */
export async function getDetailedStats(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter
): Promise<GolfStats> {
  try {
    const { supabase, user } = await requireAuth();

    if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
      return calculateStatsFromShots([], [], []);
    }

    return queryDetailedStatsWithClient(supabase, playerId, roundId, filter);
  } catch (outerError) {
    await logServerError(`[Stats] getDetailedStats failed: ${describeError(outerError)}`, { action: 'stats_data.getDetailedStats' });
    return serializeDetailedStats(calculateStatsFromShots([], [], []));
  }
}

/**
 * Trusted-server variant of `getDetailedStats` for callers that don't have a
 * user session on the request — specifically the CoachHelm engine's
 * `fetchPlayerStats` when invoked from fire-and-forget post-round triggers,
 * the safety-net cron, or the roster-sweep cron. Uses the service-role
 * admin client and skips the auth/access check (both are enforced by the
 * trusted caller that dispatched the engine run).
 *
 * DO NOT call this from client-reachable code — always prefer
 * `getDetailedStats` when a user session exists.
 */
export async function getDetailedStatsAsAdmin(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter,
): Promise<GolfStats> {
  try {
    const admin = createAdminClient();
    return await queryDetailedStatsWithClient(
      admin as unknown as Awaited<ReturnType<typeof createClient>>,
      playerId,
      roundId,
      filter,
    );
  } catch (outerError) {
    await logServerError(
      `[Stats] getDetailedStatsAsAdmin failed: ${describeError(outerError)}`,
      { action: 'stats_data.getDetailedStatsAsAdmin' },
    );
    return serializeDetailedStats(calculateStatsFromShots([], [], []));
  }
}

export async function getSprayChartData(
  playerId: string,
  roundId?: string | 'overall',
  filter?: StatsFilter
): Promise<SprayChartResponse> {
  const emptyGroup = (family: SprayChartShotFamily): SprayChartShotGroup => ({
    family,
    totalShots: 0,
    plottedShots: 0,
    averageForwardDistance: null,
    averageRemainingDistance: null,
    playableCount: 0,
    troubleCount: 0,
    penaltyCount: 0,
    dominantSector: null,
    points: [],
    summaryBands: SPRAY_SECTOR_ORDER.map((sector) => ({
      sector,
      label: SPRAY_SECTOR_LABELS[sector],
      count: 0,
      percentage: 0,
      avgForwardDistance: null,
      avgRemainingDistance: null,
    })),
  });

  const emptyResponse = (): SprayChartResponse => ({
    driving: emptyGroup('driving'),
    approach: emptyGroup('approach'),
    scope: {
      roundId: roundId ?? 'overall',
      roundsIncluded: 0,
      filterApplied: Boolean(filter),
    },
  });

  try {
    const { supabase, user } = await requireAuth();

    if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
      return emptyResponse();
    }

    const conditions = getFilterConditions(filter);
    let query = supabase
      .from('golf_rounds')
      .select('id, round_date, course_name, round_type, total_score, score_to_par, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed');

    if (conditions.startDate) {
      query = query.gte('round_date', conditions.startDate);
    }
    if (conditions.endDate) {
      query = query.lte('round_date', conditions.endDate);
    }
    query = applyRoundTypeFilter(query, conditions.roundType);
    if (conditions.courseName) {
      query = query.eq('course_name', conditions.courseName);
    }

    query = query.order('round_date', { ascending: false });

    const { data: fetchedRounds, error: roundsError } = await query;
    if (roundsError) {
      await logServerError(`[Stats] Spray rounds query error: ${roundsError instanceof Error ? roundsError.message : String(roundsError)}`, { action: 'stats_data.getSprayChartData' });
      return emptyResponse();
    }

    const roundsData = applyPresetLimit(fetchedRounds || [], filter);
    if (roundsData.length === 0) {
      return emptyResponse();
    }

    const roundIds = roundId && roundId !== 'overall'
      ? [roundId]
      : roundsData.map((round) => round.id);

    const [{ data: holesData, error: holesError }, { data: shotsData, error: shotsError }] = await Promise.all([
      fetchAllRowsResult((from, to) => supabase
        .from('golf_holes')
        .select('id, round_id, hole_number, par')
        .in('round_id', roundIds)
        .order('id', { ascending: true })
        .range(from, to)), // paginate past PostgREST 1000-row cap
      fetchAllRowsResult((from, to) => supabase
        .from('golf_shots')
        .select(`
          id,
          round_id,
          hole_id,
          hole_number,
          shot_number,
          shot_type,
          club_type,
          lie_before,
          lie_after,
          distance_to_hole_before,
          distance_unit_before,
          result,
          distance_to_hole_after,
          distance_unit_after,
          shot_distance,
          miss_direction,
          is_penalty,
          penalty_type,
          approach_miss_details(miss_direction, lie_type, distance_from_green_yards)
        `)
        .in('round_id', roundIds)
        .in('shot_type', ['tee', 'approach'])
        .order('hole_number')
        .order('shot_number')
        .order('id', { ascending: true })
        .range(from, to)), // paginate past PostgREST 1000-row cap
    ]);

    if (holesError) throw holesError;
    if (shotsError) throw shotsError;

    const holeParByKey = new Map<string, number>();
    for (const hole of holesData || []) {
      holeParByKey.set(`${hole.round_id}:${hole.hole_number}`, hole.par);
    }

    const drivingPoints: SprayChartPoint[] = [];
    const approachPoints: SprayChartPoint[] = [];
    let drivingTotalShots = 0;
    let approachTotalShots = 0;

    for (const shot of (shotsData || []) as SprayChartShotRow[]) {
      const holePar = holeParByKey.get(`${shot.round_id}:${shot.hole_number}`) ?? null;
      const approachMissDetails = Array.isArray(shot.approach_miss_details)
        ? shot.approach_miss_details[0]
        : shot.approach_miss_details;
      const distanceBefore = normalizeDistanceToYards(shot.distance_to_hole_before, shot.distance_unit_before);
      const distanceAfterFromShot = normalizeDistanceToYards(shot.distance_to_hole_after, shot.distance_unit_after);
      const shotDistance = shot.shot_distance ?? (
        distanceBefore !== null && distanceAfterFromShot !== null
          ? Math.max(0, roundStat(distanceBefore - distanceAfterFromShot) ?? 0)
          : null
      );

      if (shot.shot_type === 'tee') {
        if (holePar === 3) continue;
        drivingTotalShots += 1;

        const sector = normalizeSpraySector(shot.miss_direction, {
          result: shot.result,
          lieAfter: shot.lie_after,
          isPenalty: shot.is_penalty,
        });
        const outcomeBucket = getSprayOutcomeBucket({
          isPenalty: shot.is_penalty,
          result: shot.result,
          lieAfter: shot.lie_after,
        });
        const coords = buildDrivingCoordinates(sector, shotDistance);

        drivingPoints.push({
          id: shot.id,
          roundId: shot.round_id,
          holeNumber: shot.hole_number,
          shotNumber: shot.shot_number,
          family: 'driving',
          sector,
          x: coords.x,
          y: coords.y,
          outcomeBucket,
          shotDistance,
          distanceBefore,
          distanceAfter: distanceAfterFromShot,
          lieBefore: shot.lie_before,
          lieAfter: shot.lie_after,
          result: shot.result,
          tooltip: formatSprayTooltip({
            family: 'driving',
            holeNumber: shot.hole_number,
            shotNumber: shot.shot_number,
            sector,
            outcomeBucket,
            shotDistance,
            distanceBefore,
            distanceAfter: distanceAfterFromShot,
          }),
        });
        continue;
      }

      if (shot.shot_type !== 'approach') continue;
      approachTotalShots += 1;

      const remainingDistance = approachMissDetails?.distance_from_green_yards ?? distanceAfterFromShot;
      const sector = normalizeSpraySector(approachMissDetails?.miss_direction ?? shot.miss_direction, {
        result: shot.result,
        lieAfter: shot.lie_after,
        isPenalty: shot.is_penalty,
      });
      const outcomeBucket = getSprayOutcomeBucket({
        isPenalty: shot.is_penalty,
        result: shot.result,
        lieAfter: shot.lie_after,
        approachLieType: approachMissDetails?.lie_type,
      });
      const coords = buildApproachCoordinates(sector, remainingDistance);

      approachPoints.push({
        id: shot.id,
        roundId: shot.round_id,
        holeNumber: shot.hole_number,
        shotNumber: shot.shot_number,
        family: 'approach',
        sector,
        x: coords.x,
        y: coords.y,
        outcomeBucket,
        shotDistance,
        distanceBefore,
        distanceAfter: remainingDistance,
        lieBefore: shot.lie_before,
        lieAfter: shot.lie_after,
        result: shot.result,
        tooltip: formatSprayTooltip({
          family: 'approach',
          holeNumber: shot.hole_number,
          shotNumber: shot.shot_number,
          sector,
          outcomeBucket,
          shotDistance,
          distanceBefore,
          distanceAfter: remainingDistance,
        }),
      });
    }

    const includedRounds = roundId && roundId !== 'overall'
      ? roundsData.filter((round) => round.id === roundId).length
      : roundsData.length;

    return {
      driving: buildSprayChartGroup('driving', drivingPoints, drivingTotalShots),
      approach: buildSprayChartGroup('approach', approachPoints, approachTotalShots),
      scope: {
        roundId: roundId ?? 'overall',
        roundsIncluded: includedRounds,
        filterApplied: Boolean(filter),
      },
    };
  } catch (error) {
    await logServerError(`[Stats] getSprayChartData failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'stats_data.getSprayChartData' });
    return emptyResponse();
  }
}

// ============================================================================
// TREND DATA - For charts and analysis
// ============================================================================

// TrendDataPoint, RoundTrendData, TrendAnalysisResponse — see stats-data-types.ts

/**
 * Get trend analysis data for visualizations
 * Includes round-by-round data, rolling averages, and period comparisons
 */
export async function getTrendAnalysis(playerId: string): Promise<TrendAnalysisResponse> {
  const emptyResponse: TrendAnalysisResponse = {
    rounds: [],
    trends: { score: [], gir: [], fairway: [], putts: [] },
    rollingAverages: { score5: [], score10: [], score20: [] },
    periodComparison: {
      last30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
      previous30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
    },
    personalBests: { bestScore: null, bestToPar: null, bestGir: null, lowestPutts: null },
  };
  try {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return {
      rounds: [],
      trends: { score: [], gir: [], fairway: [], putts: [] },
      rollingAverages: { score5: [], score10: [], score20: [] },
      periodComparison: {
        last30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
        previous30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
      },
      personalBests: { bestScore: null, bestToPar: null, bestGir: null, lowestPutts: null },
    };
  }

  // Fetch all completed rounds with stats
  const { data: roundsData, error } = await supabase
    .from('golf_rounds')
    .select(`
      id,
      round_date,
      course_name,
      round_type,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts,
      holes_played
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .order('round_date', { ascending: true }); // Oldest first for trend charts

  if (error || !roundsData || roundsData.length === 0) {
    return {
      rounds: [],
      trends: { score: [], gir: [], fairway: [], putts: [] },
      rollingAverages: { score5: [], score10: [], score20: [] },
      periodComparison: {
        last30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
        previous30Days: { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null },
      },
      personalBests: { bestScore: null, bestToPar: null, bestGir: null, lowestPutts: null },
    };
  }

  // Transform rounds data — normalize 9-hole rounds to 18-hole equivalents for display
  const rounds: RoundTrendData[] = roundsData.map(r => {
    const hp = r.holes_played ?? 18;
    const normalizedScore = Math.round(r.total_score! * (18 / hp));
    const normalizedPutts = r.total_putts !== null ? Math.round(r.total_putts * (18 / hp) * 10) / 10 : null;
    // Normalize to-par to the same 18-hole basis as `score` so the trend line
    // and the to-par readout agree (a 9-hole -1 must read as -2 over 18, not -1).
    // Mirrors the score normalization above and personalBests.bestToPar below.
    const normalizedToPar = Math.round((r.score_to_par ?? 0) * (18 / hp));
    return {
      id: r.id,
      date: r.round_date,
      score: normalizedScore,
      toPar: normalizedToPar,
      courseName: r.course_name || 'Unknown Course',
      roundType: r.round_type ? roundTypeFromDb(r.round_type) : null,
      holesPlayed: hp,
      girPct: r.total_gir !== null && r.total_gir_possible !== null && r.total_gir_possible > 0
        ? Math.round((r.total_gir / r.total_gir_possible) * 1000) / 10
        : null,
      fairwayPct: r.total_fairways_hit !== null && r.total_fairways !== null && r.total_fairways > 0
        ? Math.round((r.total_fairways_hit / r.total_fairways) * 1000) / 10
        : null,
      putts: normalizedPutts,
      scrambling: null, // Scrambling data not available at round level
    };
  });

  // Build trend data points
  const trends = {
    score: rounds.map(r => ({ date: r.date, value: r.score, roundId: r.id, courseName: r.courseName })),
    gir: rounds.filter(r => r.girPct !== null).map(r => ({ date: r.date, value: r.girPct!, roundId: r.id, courseName: r.courseName })),
    fairway: rounds.filter(r => r.fairwayPct !== null).map(r => ({ date: r.date, value: r.fairwayPct!, roundId: r.id, courseName: r.courseName })),
    putts: rounds.filter(r => r.putts !== null).map(r => ({ date: r.date, value: r.putts!, roundId: r.id, courseName: r.courseName })),
  };

  // Calculate rolling averages for scores — 18-hole rounds only
  const scores18 = rounds.filter(r => r.holesPlayed === 18).map(r => r.score);
  const rollingAvg5 = calculateRollingAvg(scores18, 5);
  const rollingAvg10 = calculateRollingAvg(scores18, 10);
  const rollingAvg20 = calculateRollingAvg(scores18, 20);

  // Map rolling averages back to full rounds array (null for 9-hole rounds)
  let idx18 = 0;
  const score5: (number | null)[] = [];
  const score10: (number | null)[] = [];
  const score20: (number | null)[] = [];
  for (const r of rounds) {
    if (r.holesPlayed === 18) {
      score5.push(rollingAvg5[idx18] ?? null);
      score10.push(rollingAvg10[idx18] ?? null);
      score20.push(rollingAvg20[idx18] ?? null);
      idx18++;
    } else {
      score5.push(null);
      score10.push(null);
      score20.push(null);
    }
  }

  const rollingAverages = { score5, score10, score20 };

  // Period comparison (last 30 days vs previous 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const last30Raw = roundsData.filter(r => new Date(r.round_date) >= thirtyDaysAgo);
  const prev30Raw = roundsData.filter(r => {
    const date = new Date(r.round_date);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  });

  const periodComparison = {
    last30Days: calculatePeriodStats(last30Raw),
    previous30Days: calculatePeriodStats(prev30Raw),
  };

  // Personal bests
  const personalBests = {
    bestScore: findBest(rounds, 'score', true),
    // `toPar` is already 18-hole-normalized above (matching `score`), so a raw
    // -1 over 9 holes already reads as -2 and won't falsely beat E over 18.
    // Compare it directly — no second normalization (that would double-apply).
    bestToPar: findBest(rounds, 'toPar', true),
    bestGir: findBest(rounds.filter(r => r.girPct !== null) as (RoundTrendData & { girPct: number })[], 'girPct', false),
    lowestPutts: findBest(rounds.filter(r => r.putts !== null) as (RoundTrendData & { putts: number })[], 'putts', true),
  };

  return {
    rounds,
    trends,
    rollingAverages,
    periodComparison,
    personalBests,
  };
  } catch (error) {
    await logServerError(`[Stats] getTrendAnalysis failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'stats_data.getTrendAnalysis' });
    return emptyResponse;
  }
}

// Helper: Calculate rolling average
function calculateRollingAvg(values: number[], window: number): (number | null)[] {
  return values.map((_, index) => {
    if (index < window - 1) return null;
    const slice = values.slice(index - window + 1, index + 1);
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10;
  });
}

// Helper: Calculate period stats using raw numerator/denominator aggregation
// (avoids Simpson's paradox from averaging per-round percentages)
// Normalizes mixed 9-hole and 18-hole rounds to 18-hole equivalents
function calculatePeriodStats(rounds: {
  total_score: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  total_fairways_hit: number | null;
  total_fairways: number | null;
  total_putts: number | null;
  holes_played?: number | null;
}[]) {
  if (rounds.length === 0) {
    return { roundCount: 0, scoringAvg: null, girPct: null, fairwayPct: null, puttsPerRound: null };
  }

  // Scoring average: 18-hole rounds only (NCAA-style)
  const rounds18 = rounds.filter(r => r.total_score !== null && (r.holes_played ?? 18) === 18);
  let totalStrokes18 = 0;
  for (const r of rounds18) {
    totalStrokes18 += r.total_score!;
  }

  let totalGir = 0, totalGirOpp = 0;
  let totalFairways = 0, totalFairwayOpp = 0;
  let totalPutts = 0, totalPuttsHoles = 0;

  for (const round of rounds) {
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      totalGir += round.total_gir;
      totalGirOpp += round.total_gir_possible;
    }
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      totalFairways += round.total_fairways_hit;
      totalFairwayOpp += round.total_fairways;
    }
    if (round.total_putts !== null) {
      totalPutts += round.total_putts;
      totalPuttsHoles += (round.holes_played ?? 18);
    }
  }

  return {
    roundCount: rounds.length,
    scoringAvg: rounds18.length > 0 ? Math.round((totalStrokes18 / rounds18.length) * 10) / 10 : null,
    girPct: totalGirOpp > 0 ? Math.round((totalGir / totalGirOpp) * 1000) / 10 : null,
    fairwayPct: totalFairwayOpp > 0 ? Math.round((totalFairways / totalFairwayOpp) * 1000) / 10 : null,
    puttsPerRound: totalPuttsHoles > 0 ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10 : null,
  };
}

// Helper: Find best value
function findBest<T extends { date: string; courseName: string }>(
  rounds: T[],
  key: keyof T,
  lowerIsBetter: boolean
): { value: number; date: string; course: string } | null {
  if (rounds.length === 0) return null;

  const sorted = [...rounds].sort((a, b) => {
    const aVal = a[key] as number;
    const bVal = b[key] as number;
    return lowerIsBetter ? aVal - bVal : bVal - aVal;
  });

  const best = sorted[0];
  if (!best) return null;

  return {
    value: best[key] as number,
    date: best.date,
    course: best.courseName,
  };
}

// ============================================================================
// TEAM COMPARISON DATA
// ============================================================================

// TeamComparisonStats, TeamComparisonResponse — see stats-data-types.ts

/**
 * Get team comparison data for a player
 */
export async function getTeamComparison(
  playerId: string,
  teamId: string
): Promise<TeamComparisonResponse> {
  const { supabase, user } = await requireAuth();

  // Verify caller is a member of this team OR a coach of this team
  const emptyResponse: TeamComparisonResponse = {
    playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
    teamStats: [],
    teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
    playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
  };

  // Check 1: Is user a player on this team?
  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  let isTeamMember = false;
  if (playerRecord) {
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerRecord.id)
      .eq('status', 'active')
      .maybeSingle();
    isTeamMember = !!membership;
  }

  // Check 2: Is user a coach of this team (via organization)?
  let isTeamCoach = false;
  if (!isTeamMember) {
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('id', teamId)
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      isTeamCoach = !!team;
    }
  }

  if (!isTeamMember && !isTeamCoach) {
    return emptyResponse;
  }

  // Get all team members
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  if (!teamMembers || teamMembers.length === 0) {
    return {
      playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      teamStats: [],
      teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
    };
  }

  const playerIds = teamMembers.map(tm => tm.player_id);

  // Get player details
  const { data: playersData } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .in('id', playerIds);

  // Get rounds for team members — bounded to current season (last 12 months)
  // to prevent unbounded queries on teams with years of historical data
  const seasonStart = new Date();
  seasonStart.setFullYear(seasonStart.getFullYear() - 1);
  const seasonStartDate = seasonStart.toISOString().split('T')[0]!;

  // Paginate past the PostgREST 1000-row hard cap. A full roster across
  // tournament + qualifier + practice rounds over a 12-month window can exceed
  // 1000 completed rounds; an unpaginated `.in(...)` silently truncates at 1000,
  // which corrupts the team scoring average, every per-stat ranking, AND caps
  // teamRoundIds — which would in turn defeat the paginated golf_holes scrambling
  // query below. `.order('id')` gives stable page boundaries (P445).
  const { data: roundsData } = await fetchAllRowsResult((from, to) => supabase
    .from('golf_rounds')
    .select(`
      id,
      player_id,
      total_score,
      score_to_par,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts,
      holes_played
    `)
    .in('player_id', playerIds)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .gte('round_date', seasonStartDate)
    .order('id', { ascending: true })
    .range(from, to));

  if (!roundsData || roundsData.length === 0 || !playersData) {
    return {
      playerStats: { playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      teamStats: [],
      teamAverages: { scoringAverage: null, girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null },
      playerRankings: { scoringRank: null, girRank: null, fairwayRank: null, puttsRank: null },
    };
  }

  // Fetch scrambling data from golf_holes — missed GIR + made par or better = scramble
  // Uses (score - par) <= 0 to match the DB trigger definition exactly
  const teamRoundIds = roundsData.map(r => r.id);
  const { data: teamScramblingData } = await fetchAllRowsResult((from, to) => supabase
    .from('golf_holes')
    .select('round_id, score, par')
    .in('round_id', teamRoundIds)
    .not('score', 'is', null)
    .eq('gir', false)
    .order('id', { ascending: true })
    .range(from, to)); // paginate past PostgREST 1000-row cap

  // Build a map of round_id -> player_id for scrambling aggregation
  const roundToPlayer = new Map<string, string>();
  for (const round of roundsData) {
    roundToPlayer.set(round.id, round.player_id);
  }

  // Aggregate scrambling per player
  const playerScramblingMap = new Map<string, { attempts: number; made: number }>();
  playerIds.forEach(id => playerScramblingMap.set(id, { attempts: 0, made: 0 }));
  if (teamScramblingData) {
    for (const hole of teamScramblingData) {
      const pId = roundToPlayer.get(hole.round_id);
      if (pId) {
        const scrambling = playerScramblingMap.get(pId)!;
        scrambling.attempts++;
        if (hole.score !== null && hole.par !== null && (hole.score - hole.par) <= 0) scrambling.made++;
      }
    }
  }

  // Calculate stats per player — track 18-hole scoring separately
  const playerStatsMap = new Map<string, {
    totalStrokes18: number;
    roundCount18: number;
    roundCount: number;
    normalizedScores: number[];
    girs: number[];
    girOpps: number[];
    fairways: number[];
    fairwayOpps: number[];
    totalPutts: number;
    totalPuttsHoles: number;
  }>();

  // Initialize map
  playerIds.forEach(id => {
    playerStatsMap.set(id, {
      totalStrokes18: 0, roundCount18: 0, roundCount: 0, normalizedScores: [],
      girs: [], girOpps: [], fairways: [], fairwayOpps: [],
      totalPutts: 0, totalPuttsHoles: 0,
    });
  });

  // Aggregate stats — scoring average uses 18-hole rounds only
  roundsData.forEach(round => {
    const stats = playerStatsMap.get(round.player_id);
    if (!stats) return;
    const hp = round.holes_played ?? 18;

    if (round.total_score !== null) {
      stats.roundCount++;
      stats.normalizedScores.push(Math.round(round.total_score * (18 / hp)));
      if (hp === 18) {
        stats.totalStrokes18 += round.total_score;
        stats.roundCount18++;
      }
    }
    // Only push GIR/fairway pairs together to prevent array misalignment
    if (round.total_gir !== null && round.total_gir_possible !== null) {
      stats.girs.push(round.total_gir);
      stats.girOpps.push(round.total_gir_possible);
    }
    if (round.total_fairways_hit !== null && round.total_fairways !== null) {
      stats.fairways.push(round.total_fairways_hit);
      stats.fairwayOpps.push(round.total_fairways);
    }
    if (round.total_putts !== null) {
      stats.totalPutts += round.total_putts;
      stats.totalPuttsHoles += hp;
    }
  });

  // Build team stats
  const teamStats: TeamComparisonStats[] = playerIds.map(id => {
    const player = playersData.find(p => p.id === id);
    const stats = playerStatsMap.get(id)!;

    const totalGirs = stats.girs.reduce((a, b) => a + b, 0);
    const totalGirOpps = stats.girOpps.reduce((a, b) => a + b, 0);
    const totalFairways = stats.fairways.reduce((a, b) => a + b, 0);
    const totalFairwayOpps = stats.fairwayOpps.reduce((a, b) => a + b, 0);

    return {
      playerId: id,
      playerName: player ? `${player.first_name} ${player.last_name}` : 'Unknown',
      roundCount: stats.roundCount,
      scoringAverage: stats.roundCount18 > 0
        ? Math.round((stats.totalStrokes18 / stats.roundCount18) * 10) / 10
        : null,
      bestRound: stats.normalizedScores.length > 0 ? Math.min(...stats.normalizedScores) : null,
      girPct: totalGirOpps > 0 ? Math.round((totalGirs / totalGirOpps) * 1000) / 10 : null,
      fairwayPct: totalFairwayOpps > 0 ? Math.round((totalFairways / totalFairwayOpps) * 1000) / 10 : null,
      puttsPerRound: stats.totalPuttsHoles > 0
        ? Math.round((stats.totalPutts / stats.totalPuttsHoles) * 18 * 10) / 10
        : null,
      scramblingPct: (() => {
        const scrambling = playerScramblingMap.get(id);
        return scrambling && scrambling.attempts > 0
          ? Math.round((scrambling.made / scrambling.attempts) * 1000) / 10
          : null;
      })(),
    };
  }).filter(s => s.roundCount > 0);

  // Calculate team averages weighted by rounds played (avoids Simpson's paradox)
  // Aggregate raw numerators/denominators across all players instead of averaging per-player averages
  let teamTotalStrokes18 = 0, teamRoundCount18 = 0;
  let teamTotalGirs = 0, teamTotalGirOpps = 0;
  let teamTotalFairways = 0, teamTotalFairwayOpps = 0;
  let teamTotalPutts = 0, teamTotalPuttsHoles = 0;
  let teamScramblingAttempts = 0, teamScramblingMade = 0;

  for (const id of playerIds) {
    const stats = playerStatsMap.get(id);
    if (!stats || stats.roundCount === 0) continue;

    teamTotalStrokes18 += stats.totalStrokes18;
    teamRoundCount18 += stats.roundCount18;
    teamTotalGirs += stats.girs.reduce((a, b) => a + b, 0);
    teamTotalGirOpps += stats.girOpps.reduce((a, b) => a + b, 0);
    teamTotalFairways += stats.fairways.reduce((a, b) => a + b, 0);
    teamTotalFairwayOpps += stats.fairwayOpps.reduce((a, b) => a + b, 0);
    teamTotalPutts += stats.totalPutts;
    teamTotalPuttsHoles += stats.totalPuttsHoles;

    const scrambling = playerScramblingMap.get(id);
    if (scrambling) {
      teamScramblingAttempts += scrambling.attempts;
      teamScramblingMade += scrambling.made;
    }
  }

  const teamAverages = {
    scoringAverage: teamRoundCount18 > 0
      ? Math.round((teamTotalStrokes18 / teamRoundCount18) * 10) / 10
      : null,
    girPct: teamTotalGirOpps > 0
      ? Math.round((teamTotalGirs / teamTotalGirOpps) * 1000) / 10
      : null,
    fairwayPct: teamTotalFairwayOpps > 0
      ? Math.round((teamTotalFairways / teamTotalFairwayOpps) * 1000) / 10
      : null,
    puttsPerRound: teamTotalPuttsHoles > 0
      ? Math.round((teamTotalPutts / teamTotalPuttsHoles) * 18 * 10) / 10
      : null,
    scramblingPct: teamScramblingAttempts > 0
      ? Math.round((teamScramblingMade / teamScramblingAttempts) * 1000) / 10
      : null,
  };

  // Calculate player rankings
  const playerStats = teamStats.find(s => s.playerId === playerId) || {
    playerId, playerName: '', roundCount: 0, scoringAverage: null, bestRound: null,
    girPct: null, fairwayPct: null, puttsPerRound: null, scramblingPct: null
  };

  const scoringRanked = [...teamStats].filter(s => s.scoringAverage !== null).sort((a, b) => a.scoringAverage! - b.scoringAverage!);
  const girRanked = [...teamStats].filter(s => s.girPct !== null).sort((a, b) => b.girPct! - a.girPct!);
  const fairwayRanked = [...teamStats].filter(s => s.fairwayPct !== null).sort((a, b) => b.fairwayPct! - a.fairwayPct!);
  const puttsRanked = [...teamStats].filter(s => s.puttsPerRound !== null).sort((a, b) => a.puttsPerRound! - b.puttsPerRound!);

  const playerRankings = {
    scoringRank: scoringRanked.findIndex(s => s.playerId === playerId) + 1 || null,
    girRank: girRanked.findIndex(s => s.playerId === playerId) + 1 || null,
    fairwayRank: fairwayRanked.findIndex(s => s.playerId === playerId) + 1 || null,
    puttsRank: puttsRanked.findIndex(s => s.playerId === playerId) + 1 || null,
  };

  return {
    playerStats,
    teamStats,
    teamAverages,
    playerRankings,
  };
}

// ============================================================================
// FILTER OPTIONS DATA
// ============================================================================

// FilterOptions — see stats-data-types.ts

/**
 * Get available filter options for a player
 */
export async function getFilterOptions(playerId: string): Promise<FilterOptions> {
  try {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return { courses: [], seasons: [], roundTypes: [] };
  }

  const { data: roundsData } = await supabase
    .from('golf_rounds')
    .select('course_name, round_date, round_type')
    .eq('player_id', playerId)
    .eq('status', 'completed');

  if (!roundsData || roundsData.length === 0) {
    return { courses: [], seasons: [], roundTypes: [] };
  }

  // Extract unique courses
  const courses = [...new Set(
    roundsData
      .map(r => r.course_name)
      .filter((c): c is string => c !== null)
  )].sort();

  // Extract unique seasons (years)
  const seasons = [...new Set(
    roundsData
      .map(r => new Date(r.round_date).getFullYear())
  )].sort((a, b) => b - a);

  // Extract unique round types
  const roundTypes: string[] = [...new Set(
    roundsData
      .map(r => r.round_type ? roundTypeFromDb(r.round_type) : null)
      .filter((t): t is 'practice' | 'tournament' | 'qualifier' => t !== null)
  )].sort();

  return { courses, seasons, roundTypes };
  } catch (error) {
    await logServerError(`[Stats] getFilterOptions failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'stats_data.getFilterOptions' });
    return { courses: [], seasons: [], roundTypes: [] };
  }
}

// ============================================================================
// COURSE-SPECIFIC BREAKDOWN
// ============================================================================

// CourseStats, CourseBreakdownResponse — see stats-data-types.ts

/**
 * Get stats broken down by course
 */
export async function getCourseBreakdown(playerId: string): Promise<CourseBreakdownResponse> {
  try {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return { courses: [], bestCourse: null, worstCourse: null };
  }

  const { data: roundsData } = await supabase
    .from('golf_rounds')
    .select(`
      course_name,
      round_date,
      total_score,
      total_fairways_hit,
      total_fairways,
      total_gir,
      total_gir_possible,
      total_putts,
      holes_played
    `)
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .not('course_name', 'is', null)
    .order('round_date', { ascending: false });

  if (!roundsData || roundsData.length === 0) {
    return { courses: [], bestCourse: null, worstCourse: null };
  }

  // Group by course
  const courseMap = new Map<string, typeof roundsData>();
  for (const round of roundsData) {
    if (!round.course_name) continue;
    const existing = courseMap.get(round.course_name) || [];
    existing.push(round);
    courseMap.set(round.course_name, existing);
  }

  // Calculate stats per course — scoring average uses 18-hole rounds only
  const courses: CourseStats[] = [];
  for (const [courseName, rounds] of courseMap) {
    let totalGir = 0, totalGirOpp = 0;
    let totalFairways = 0, totalFairwayOpp = 0;
    let totalPutts = 0, totalPuttsHoles = 0;
    let totalStrokes18 = 0, roundCount18 = 0;
    const normalizedScores: number[] = [];

    for (const round of rounds) {
      const hp = round.holes_played ?? 18;
      if (round.total_score !== null) {
        normalizedScores.push(Math.round(round.total_score * (18 / hp)));
        if (hp === 18) {
          totalStrokes18 += round.total_score;
          roundCount18++;
        }
      }
      if (round.total_gir !== null && round.total_gir_possible !== null) {
        totalGir += round.total_gir;
        totalGirOpp += round.total_gir_possible;
      }
      if (round.total_fairways_hit !== null && round.total_fairways !== null) {
        totalFairways += round.total_fairways_hit;
        totalFairwayOpp += round.total_fairways;
      }
      if (round.total_putts !== null) {
        totalPutts += round.total_putts;
        totalPuttsHoles += hp;
      }
    }

    courses.push({
      courseName,
      roundCount: rounds.length,
      scoringAverage: roundCount18 > 0
        ? Math.round((totalStrokes18 / roundCount18) * 10) / 10
        : null,
      bestRound: normalizedScores.length > 0 ? Math.min(...normalizedScores) : null,
      girPct: totalGirOpp > 0 ? Math.round((totalGir / totalGirOpp) * 1000) / 10 : null,
      fairwayPct: totalFairwayOpp > 0 ? Math.round((totalFairways / totalFairwayOpp) * 1000) / 10 : null,
      puttsPerRound: totalPuttsHoles > 0
        ? Math.round((totalPutts / totalPuttsHoles) * 18 * 10) / 10
        : null,
      lastPlayed: rounds[0]?.round_date || '',
    });
  }

  // Sort by scoring average
  courses.sort((a, b) => {
    if (a.scoringAverage === null) return 1;
    if (b.scoringAverage === null) return -1;
    return a.scoringAverage - b.scoringAverage;
  });

  const coursesWithScores = courses.filter(c => c.scoringAverage !== null);
  const bestCourse = coursesWithScores[0]?.courseName || null;
  const worstCourse = coursesWithScores[coursesWithScores.length - 1]?.courseName || null;

  return { courses, bestCourse, worstCourse };
  } catch (error) {
    await logServerError(`[Stats] getCourseBreakdown failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'stats_data.getCourseBreakdown' });
    return { courses: [], bestCourse: null, worstCourse: null };
  }
}

// ============================================================================
// WORST HOLE ANALYSIS
// ============================================================================

// HoleAnalysis, WorstHoleResponse — see stats-data-types.ts

/**
 * Get worst hole analysis
 */
export async function getWorstHoleAnalysis(playerId: string): Promise<WorstHoleResponse> {
  try {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return { holes: [], worstHoles: [], bestHoles: [], par3Average: null, par4Average: null, par5Average: null, closingHolesAverage: null };
  }

  // Get all holes with their scores
  const { data: holesData } = await fetchAllRowsResult((from, to) => supabase
    .from('golf_holes')
    .select(`
      id,
      round_id,
      hole_number,
      par,
      score,
      golf_rounds!inner (
        player_id,
        status,
        round_date
      )
    `)
    .eq('golf_rounds.player_id', playerId)
    .eq('golf_rounds.status', 'completed')
    .not('score', 'is', null)
    .order('round_id')
    .order('hole_number')
    .order('id', { ascending: true })
    .range(from, to)); // paginate past PostgREST 1000-row cap

  if (!holesData || holesData.length === 0) {
    return {
      holes: [],
      worstHoles: [],
      bestHoles: [],
      par3Average: null,
      par4Average: null,
      par5Average: null,
      closingHolesAverage: null,
    };
  }

  // Group by hole_number, but KEEP EACH PLAY'S OWN PAR. A given hole_number is a
  // different hole (and often a different par) at each course, so freezing par to
  // the first-seen round mis-baselines avg-to-par AND mis-buckets par-3/4/5
  // (e.g. a hole_number frozen to par-3 whose plays were mostly par-4/5 inflated
  // "Par 3 avg" ~2.7x). Bucket every play by its ACTUAL par.
  const holeMap = new Map<number, { entries: { score: number; par: number }[]; dates: string[] }>();
  const toParByParType: Record<number, number[]> = { 3: [], 4: [], 5: [] }; // (score - par) per play
  const closingToPar: number[] = []; // holes 16-18, (score - par) per play

  for (const hole of holesData) {
    if (hole.score === null) continue;
    const existing = holeMap.get(hole.hole_number) || { entries: [], dates: [] };
    existing.entries.push({ score: hole.score, par: hole.par });
    const roundData = hole.golf_rounds as { round_date?: string } | undefined;
    if (roundData?.round_date) existing.dates.push(roundData.round_date);
    holeMap.set(hole.hole_number, existing);
    if (toParByParType[hole.par]) toParByParType[hole.par]!.push(hole.score - hole.par);
    if (hole.hole_number >= 16) closingToPar.push(hole.score - hole.par);
  }

  // Calculate analysis per hole
  const holes: HoleAnalysis[] = [];

  for (let holeNum = 1; holeNum <= 18; holeNum++) {
    const data = holeMap.get(holeNum);
    if (!data || data.entries.length === 0) continue;

    const scores = data.entries.map(e => e.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    // avg-to-par = mean of each play's own (score - par), not avgScore - frozenPar.
    const avgToPar = data.entries.reduce((a, e) => a + (e.score - e.par), 0) / data.entries.length;

    // Score distribution — grade each play against ITS OWN par.
    let birdieOrBetter = 0, pars = 0, bogeys = 0, doublePlus = 0;
    for (const e of data.entries) {
      const toPar = e.score - e.par;
      if (toPar <= -1) birdieOrBetter++;
      else if (toPar === 0) pars++;
      else if (toPar === 1) bogeys++;
      else doublePlus++;
    }

    // Simple trend calculation (last 5 vs first 5)
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (scores.length >= 10) {
      const first5 = scores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const last5 = scores.slice(-5).reduce((a, b) => a + b, 0) / 5;
      if (last5 < first5 - 0.2) trend = 'improving';
      else if (last5 > first5 + 0.2) trend = 'declining';
    }

    // Display par = the most common par this hole_number was played at.
    const parCounts = new Map<number, number>();
    for (const e of data.entries) parCounts.set(e.par, (parCounts.get(e.par) ?? 0) + 1);
    const displayPar = [...parCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

    holes.push({
      holeNumber: holeNum,
      par: displayPar,
      averageScore: Math.round(avgScore * 100) / 100,
      averageToPar: Math.round(avgToPar * 100) / 100,
      timesPlayed: scores.length,
      birdieOrBetter,
      pars,
      bogeys,
      doublePlus,
      trend,
    });
  }

  // Sort by average to par (worst first)
  const sortedByToPar = [...holes].sort((a, b) => b.averageToPar - a.averageToPar);
  const worstHoles = sortedByToPar.slice(0, 3);
  const bestHoles = [...sortedByToPar].reverse().slice(0, 3);

  // Par-specific + closing averages: mean of per-play (score - par) bucketed by
  // each play's ACTUAL par (NOT an average of per-hole-number averages, which the
  // frozen par corrupted).
  const meanOrNull = (arr: number[]) =>
    arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;

  return {
    holes,
    worstHoles,
    bestHoles,
    par3Average: meanOrNull(toParByParType[3]!),
    par4Average: meanOrNull(toParByParType[4]!),
    par5Average: meanOrNull(toParByParType[5]!),
    closingHolesAverage: meanOrNull(closingToPar),
  };
  } catch (error) {
    await logServerError(`[Stats] getWorstHoleAnalysis failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'stats_data.calcAvg' });
    return { holes: [], worstHoles: [], bestHoles: [], par3Average: null, par4Average: null, par5Average: null, closingHolesAverage: null };
  }
}

// ============================================================================
// STATISTICAL STRENGTHS & WEAKNESSES
// ============================================================================

/**
 * Get rich, statistically-backed strengths and weaknesses for a player.
 * Analyzes 30+ metrics across distance, shot type, and lie categories.
 *
 * Returns top 3 strengths and top 3 weaknesses with stroke impact,
 * benchmarks, and coaching recommendations.
 */
export async function getPlayerStrengthsWeaknesses(
  playerId: string,
  filter?: StatsFilter
): Promise<{
  strengths: StatisticalStrengthWeakness[];
  weaknesses: StatisticalStrengthWeakness[];
} | null> {
  try {
  const { supabase, user } = await requireAuth();

  if (!(await verifyPlayerAccess(supabase, user.id, playerId))) {
    return null;
  }

  const stats = await getDetailedStats(playerId, 'overall', filter);

  if (stats.roundsPlayed < 3) {
    return null;
  }

  return generateStatisticalStrengthsWeaknesses(stats);
  } catch (error) {
    await logServerError(`[Stats] getPlayerStrengthsWeaknesses failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'stats_data.getPlayerStrengthsWeaknesses' });
    return null;
  }
}

// ============================================================================
// COACH ROSTER STATS
// ============================================================================

export interface CoachRosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  stats?: {
    rounds_played: number;
    scoring_average: number | null;
    best_round: number | null;
    recent_scores?: number[];
    trend?: 'up' | 'down' | 'stable';
    last_played?: string;
    equivalent_rounds_all?: number;
    rounds_played_18: number;
    rounds_played_9: number;
    scoring_average_18: number | null;
    scoring_average_9: number | null;
    best_round_18: number | null;
    best_round_9: number | null;
  };
}

/**
 * Server action to fetch coach roster with player stats.
 * Uses server-side Supabase client (bypasses RLS restrictions that may block
 * client-side reads of golf_team_members for coaches).
 */
export async function getCoachRosterStats(teamId: string): Promise<CoachRosterPlayer[]> {
  if (!teamId) return [];

  const supabase = await createClient();

  // Auth guard (S1): require a session. Team-scoping is already enforced by RLS
  // on golf_team_members/golf_players/golf_rounds, so we deliberately do NOT add a
  // coach-of-team throw here — that would risk locking out active demo accounts.
  // RLS returns [] for non-members.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const playerIds = teamMembers?.map(tm => tm.player_id) || [];
  if (playerIds.length === 0) return [];

  const [{ data: teamPlayers }, { data: allRounds }] = await Promise.all([
    supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
      .in('id', playerIds)
      .order('last_name'),
    // A full roster's season history easily exceeds the PostgREST hard
    // 1000-row cap — unpaginated, later players silently lost ALL rounds.
    // The id tiebreaker keeps page boundaries stable within a date.
    fetchAllRowsResult((from, to) => supabase
      .from('golf_rounds')
      .select('id, player_id, total_score, round_date, holes_played')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)), // paginate past PostgREST 1000-row cap
  ]);

  if (!teamPlayers || teamPlayers.length === 0) return [];

  const roundsByPlayer = (allRounds || []).reduce((acc, round) => {
    if (!acc[round.player_id]) acc[round.player_id] = [];
    if (round.total_score !== null) {
      const hp = round.holes_played ?? 18;
      acc[round.player_id]!.push({
        score: round.total_score,
        normalizedScore: Math.round(round.total_score * (18 / hp)),
        holesPlayed: hp,
        date: round.round_date,
      });
    }
    return acc;
  }, {} as Record<string, { score: number; normalizedScore: number; holesPlayed: number; date: string }[]>);

  return teamPlayers.map(player => {
    const rounds = roundsByPlayer[player.id] || [];
    const normalizedScores = rounds.map(r => r.normalizedScore);
    const recentNormalized = normalizedScores.slice(0, 5);

    let totalStrokes = 0;
    let totalHoles = 0;
    let totalStrokes18 = 0;
    let totalStrokes9 = 0;
    let roundsPlayed18 = 0;
    let roundsPlayed9 = 0;
    const scores18: number[] = [];
    const scores9: number[] = [];
    for (const r of rounds) {
      totalStrokes += r.score;
      totalHoles += r.holesPlayed;
      if (r.holesPlayed <= 9) {
        totalStrokes9 += r.score;
        roundsPlayed9++;
        scores9.push(r.score);
      } else if (r.holesPlayed === 18) {
        // Strictly 18-hole rounds only, matching the canonical cache
        // (scoring_average = SUM/COUNT over holes_played = 18). Partial
        // rounds (10-17 holes) are excluded from the 18-hole bucket; they
        // still feed the normalized "all formats" scoring_average below.
        totalStrokes18 += r.score;
        roundsPlayed18++;
        scores18.push(r.score);
      }
    }

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (recentNormalized.length >= 3) {
      const firstHalf = recentNormalized.slice(Math.floor(recentNormalized.length / 2));
      const secondHalf = recentNormalized.slice(0, Math.floor(recentNormalized.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (secondAvg < firstAvg - 1) trend = 'up';
      else if (secondAvg > firstAvg + 1) trend = 'down';
    }

    let lastPlayed = '';
    if (rounds[0]?.date) {
      const daysAgo = Math.floor((Date.now() - new Date(rounds[0].date).getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) lastPlayed = 'Today';
      else if (daysAgo === 1) lastPlayed = 'Yesterday';
      else lastPlayed = `${daysAgo} days ago`;
    }

    return {
      ...player,
      stats: {
        rounds_played: rounds.length,
        scoring_average: totalHoles > 0 ? (totalStrokes / totalHoles) * 18 : null,
        best_round: normalizedScores.length > 0 ? Math.min(...normalizedScores) : null,
        recent_scores: [...recentNormalized].reverse(),
        trend,
        last_played: lastPlayed,
        equivalent_rounds_all: totalHoles / 18,
        rounds_played_18: roundsPlayed18,
        rounds_played_9: roundsPlayed9,
        scoring_average_18: roundsPlayed18 > 0 ? totalStrokes18 / roundsPlayed18 : null,
        scoring_average_9: roundsPlayed9 > 0 ? totalStrokes9 / roundsPlayed9 : null,
        best_round_18: scores18.length > 0 ? Math.min(...scores18) : null,
        best_round_9: scores9.length > 0 ? Math.min(...scores9) : null,
      },
    };
  });
}
