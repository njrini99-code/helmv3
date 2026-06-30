/**
 * Detailed golf stats query — trusted-server and user-scoped paths.
 *
 * Extracted from stats-data.ts so CoachHelm orchestrator and other lib
 * modules can fetch admin stats without importing src/app.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo,
} from '@/lib/utils/golf-stats-calculator-shots';
import { roundTypeFromDb } from '@/lib/golf/round-type-utils';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { StatsFilter } from '@/lib/golf/stats/filter-types';
import {
  getFilterConditions,
  applyRoundTypeFilter,
  applyPresetLimit,
} from '@/lib/golf/stats/filter-conditions';

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

export function serializeDetailedStats(stats: GolfStats): GolfStats {
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

export async function queryDetailedStatsWithClient(
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
