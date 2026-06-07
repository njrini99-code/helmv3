'use server';

// ============================================================================
// COACHHELM V3 DATA ACTIONS
// ============================================================================
//
// Server actions exposing CoachHelm V3 engine modules to the UI.
// Each function follows the standard pattern:
//   - Auth check (player owns data or coach owns team)
//   - Fetch relevant data from Supabase
//   - Run V3 engine computations
//   - Return { success, data?, error? }
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import {
  verifyPlayerAccess as canonicalVerifyPlayerAccess,
  verifyTeamAccess as canonicalVerifyTeamAccess,
} from '@/lib/auth/verify-player-access';

// Stats module
import {
  normalizePlayerMetrics,
  computeCompositeRating,
  computeCategoryRatings,
  buildPlayerBaseline,
  buildPercentileProfile,
  detectAnomalies,
  calculateVolatility,
} from '@/lib/coachhelm/v2/stats';
import type {
  PlayerMetrics,
  CategoryRatings,
  PlayerBaseline,
  PercentileProfile,
  Anomaly,
  VolatilityMetrics,
} from '@/lib/coachhelm/v2/stats';

// Trends module
import {
  analyzeMultiWindowTrends,
  detectStreaks,
  detectRegressionCandidate,
} from '@/lib/coachhelm/v2/trends';
import type {
  MultiWindowAnalysis,
  Streak,
  RegressionPrediction,
} from '@/lib/coachhelm/v2/trends';

// Shot analysis module
import {
  analyzeShotsByContext,
  rankWeaknessContexts,
  buildDefaultBaseline,
  buildYardageCurve,
  findDeadZones,
  analyzeSequenceEffects,
  calculateShotSG,
  calculateScrambleRate,
} from '@/lib/coachhelm/v2/shot-analysis';
import type {
  ShotData,
  ShotContextAnalysis,
  YardageCurve,
  DeadZone,
  SequenceAnalysis,
  ScrambleAnalysis,
} from '@/lib/coachhelm/v2/shot-analysis';

// Simulation module
import {
  simulateTournament,
  optimizeLineup,
  simulateWhatIf,
} from '@/lib/coachhelm/v2/simulation';
import type {
  PlayerProfile,
  TournamentSimulation,
  LineupOptimization,
  WhatIfScenario,
} from '@/lib/coachhelm/v2/simulation';

// ============================================================================
// TYPES
// ============================================================================

interface ActionSuccess<T> {
  success: true;
  data: T;
}

interface ActionError {
  success: false;
  error: string;
}

type ActionResult<T> = ActionSuccess<T> | ActionError;

interface PlayerProfileData {
  composite: number | null;
  categories: CategoryRatings;
  percentiles: PercentileProfile;
  baselines: PlayerBaseline;
  playerState: {
    playerId: string;
    roundCount: number;
    zScores: Record<string, number>;
  };
}

interface TrendAnalysisData {
  trends: MultiWindowAnalysis;
  streaks: Streak[];
  regressionPrediction: RegressionPrediction | null;
  anomalies: Anomaly[];
  volatility: VolatilityMetrics;
}

interface ShotContextData {
  weaknesses: ShotContextAnalysis[];
  yardageCurve: YardageCurve;
  deadZones: DeadZone[];
  resilience: SequenceAnalysis;
  scrambleRate: ScrambleAnalysis;
}

interface TeamSimulationData {
  simulation: TournamentSimulation;
  lineupOptimization: LineupOptimization;
}

interface WhatIfData {
  scenario: WhatIfScenario;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Verify that the authenticated user can access a given player's data.
 * Delegates to the canonical RPC-backed helper which respects
 * golf_team_coach_staff (and therefore multi-team coaches).
 */
async function getPlayerAccessError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  playerId: string,
): Promise<string | null> {
  const result = await canonicalVerifyPlayerAccess(playerId, userId, supabase);
  return result.allowed ? null : 'Unauthorized';
}

/**
 * Verify that the authenticated user staffs the given team via the canonical
 * golf_team_coach_staff relationship. Returns the coach row id when allowed
 * so callers can attribute writes.
 *
 * The canonical helper resolves coachId from golf_team_coach_staff for the
 * verified team — no second lookup needed, which avoids picking an arbitrary
 * coach row for multi-org users with multiple coach profiles.
 */
async function verifyCoachAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  teamId: string,
): Promise<{ authorized: boolean; coachId?: string; error?: string }> {
  const result = await canonicalVerifyTeamAccess(teamId, userId, supabase);
  if (!result.allowed) {
    return { authorized: false, error: 'Unauthorized — team not found for this coach' };
  }
  return { authorized: true, coachId: result.coachId };
}

// Stat metric keys used for z-score normalization and percentile building
const STAT_METRICS = [
  'scoringAvg',
  'girPct',
  'fairwayPct',
  'puttsPerRound',
  'scramblePct',
  'sgTotal',
  'sgOffTee',
  'sgApproach',
  'sgAroundGreen',
  'sgPutting',
] as const;

/**
 * Map a golf_player_stats_cache row into a metrics record keyed by STAT_METRICS names.
 */
function mapStatsCacheToMetrics(
  row: {
    scoring_average: number | null;
    gir_percentage: number | null;
    driving_accuracy_percentage: number | null;
    putts_per_round: number | null;
    scrambling_percentage: number | null;
    strokes_gained_total: number | null;
    strokes_gained_tee: number | null;
    strokes_gained_approach: number | null;
    strokes_gained_around_green: number | null;
    strokes_gained_putting: number | null;
  },
): Record<string, number> {
  return {
    scoringAvg: Number(row.scoring_average ?? 0),
    girPct: Number(row.gir_percentage ?? 0),
    fairwayPct: Number(row.driving_accuracy_percentage ?? 0),
    puttsPerRound: Number(row.putts_per_round ?? 0),
    scramblePct: Number(row.scrambling_percentage ?? 0),
    sgTotal: Number(row.strokes_gained_total ?? 0),
    sgOffTee: Number(row.strokes_gained_tee ?? 0),
    sgApproach: Number(row.strokes_gained_approach ?? 0),
    sgAroundGreen: Number(row.strokes_gained_around_green ?? 0),
    sgPutting: Number(row.strokes_gained_putting ?? 0),
  };
}

// ============================================================================
// 1. getPlayerProfile
// ============================================================================

/**
 * Returns Z-score composite, category ratings, percentiles, and baseline comparison
 * for a given player.
 */
export async function getPlayerProfile(
  playerId: string,
): Promise<ActionResult<PlayerProfileData>> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  const accessError = await getPlayerAccessError(supabase, user.id, playerId);
  if (accessError) {
    return { success: false, error: accessError };
  }

  try {
    // Fetch player's recent rounds (last 30)
    const { data: roundsData, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, total_score, round_date, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: true })
      .limit(30);

    if (roundsError) {
      return { success: false, error: 'Failed to fetch round data' };
    }

    if (!roundsData || roundsData.length === 0) {
      return { success: false, error: 'No completed rounds found for this player' };
    }

    // Build baseline from round data
    const baselineRounds = roundsData.map((r) => ({
      metrics: {
        scoreToPar: r.score_to_par ?? 0,
        totalScore: r.total_score ?? 0,
        puttsPerRound: r.total_putts ?? 0,
        // Canonical denominators: GIR over greens-possible, fairway over par-4/5
        // holes with a recorded fairway result (NOT holes_played, which over-counts).
        girPct: r.total_gir != null && r.total_gir_possible != null && r.total_gir_possible > 0
          ? (r.total_gir / r.total_gir_possible) * 100
          : 0,
        fairwayPct: r.total_fairways_hit != null && r.total_fairways != null && r.total_fairways > 0
          ? (r.total_fairways_hit / r.total_fairways) * 100
          : 0,
      },
    }));

    const baseline = buildPlayerBaseline(baselineRounds, playerId);

    // Fetch team context — find player's team
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();

    let teamPlayerIds: string[] = [];
    if (membership?.team_id) {
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', membership.team_id)
        .eq('status', 'active');

      teamPlayerIds = (teamMembers ?? []).map((m) => m.player_id);
    }

    // Fetch stats cache for team players (for z-scores and percentiles)
    interface StatsCacheRow {
      player_id: string;
      scoring_average: number | null;
      gir_percentage: number | null;
      driving_accuracy_percentage: number | null;
      putts_per_round: number | null;
      scrambling_percentage: number | null;
      strokes_gained_total: number | null;
      strokes_gained_tee: number | null;
      strokes_gained_approach: number | null;
      strokes_gained_around_green: number | null;
      strokes_gained_putting: number | null;
    }

    let teamStats: StatsCacheRow[] = [];
    if (teamPlayerIds.length > 0) {
      // RLS on golf_player_stats_cache only lets a player read their own
      // row. For z-score normalization we need the full team population —
      // otherwise variance collapses and categories fall back to a
      // benchmark calculation that diverges from /stats. Use the admin
      // client here (mirrors getPlayerStatsIntelligence); we only return
      // the requesting player's normalized scores, never per-teammate
      // values.
      const admin = createAdminClient();
      const { data: statsData } = await admin
        .from('golf_player_stats_cache')
        .select('player_id, scoring_average, gir_percentage, driving_accuracy_percentage, putts_per_round, scrambling_percentage, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting')
        .in('player_id', teamPlayerIds);

      teamStats = (statsData ?? []) as StatsCacheRow[];
    }

    // Build PlayerMetrics for each team member
    const teamPlayerMetrics: PlayerMetrics[] = teamStats.map((row) => ({
      playerId: row.player_id,
      metrics: mapStatsCacheToMetrics(row),
    }));

    // Calculate z-scores across team
    const metricKeys = [...STAT_METRICS];
    const allZScores = normalizePlayerMetrics(teamPlayerMetrics, metricKeys);
    const playerZScores = allZScores.find((z) => z.playerId === playerId);

    let composite = playerZScores?.composite ?? null;
    let categories = playerZScores?.categories ?? computeCategoryRatings({});
    const zScores = playerZScores?.zScores ?? {};

    // Build percentile profile
    const playerStatsRow = teamStats.find((s) => s.player_id === playerId);

    // When there are fewer than 3 players, z-score normalization can't produce
    // a meaningful composite (returns null) and categories default to 50.
    // Fall back to benchmark-based rating using the player's own stats.
    if (composite == null && playerStatsRow) {
      const pm = mapStatsCacheToMetrics(playerStatsRow);
      // D2/D3 benchmark values (approximate averages)
      const benchmarks: Record<string, { mean: number; good: number; lowerIsBetter: boolean }> = {
        scoringAvg:    { mean: 76, good: 72, lowerIsBetter: true },
        girPct:        { mean: 50, good: 67, lowerIsBetter: false },
        fairwayPct:    { mean: 55, good: 70, lowerIsBetter: false },
        puttsPerRound: { mean: 32, good: 28, lowerIsBetter: true },
        scramblePct:   { mean: 35, good: 55, lowerIsBetter: false },
        sgTotal:       { mean: 0,  good: 3,  lowerIsBetter: false },
        sgOffTee:      { mean: 0,  good: 1,  lowerIsBetter: false },
        sgApproach:    { mean: 0,  good: 1,  lowerIsBetter: false },
        sgAroundGreen: { mean: 0,  good: 0.5, lowerIsBetter: false },
        sgPutting:     { mean: 0,  good: 0.5, lowerIsBetter: false },
      };

      // Compute a 0-100 rating per metric based on where the player falls
      // between the benchmark mean (->50) and benchmark good (->80)
      const metricRatings: Record<string, number> = {};
      for (const key of metricKeys) {
        const bench = benchmarks[key];
        if (!bench) continue;
        const val = pm[key] ?? 0;
        const range = bench.good - bench.mean; // Could be negative for lowerIsBetter
        if (range === 0) { metricRatings[key] = 50; continue; }
        const normalized = (val - bench.mean) / range; // 0 = at mean, 1 = at good
        metricRatings[key] = Math.max(0, Math.min(100, 50 + normalized * 30));
      }

      // Recompute categories using benchmark-based z-like scores
      // Convert each metric rating back to a z-like score: (rating - 50) / 10
      const benchZScores: Record<string, number> = {};
      for (const [key, rating] of Object.entries(metricRatings)) {
        benchZScores[key] = (rating - 50) / 10;
      }
      categories = computeCategoryRatings(benchZScores);
      composite = computeCompositeRating(benchZScores);
    }
    // Override categories + composite with the canonical stats-intelligence
    // calculation so /coachhelm and /stats never disagree. The local z-score
    // path above uses a slightly different metric set (sgTotal/sgOffTee vs
    // drivingDistance/proximityToHole/threePuttAvoidance), which is exactly
    // the drift the comment in stats-intelligence.ts warns against. Defer
    // to that function as the single source of truth — it already handles
    // RLS via the admin client and gracefully returns null when there's
    // not enough team data.
    try {
      const { getPlayerStatsIntelligence } = await import('@/app/golf/actions/stats-intelligence');
      const canonical = await getPlayerStatsIntelligence(playerId);
      if (canonical.success && canonical.data) {
        if (canonical.data.categories) {
          categories = {
            teeGame: canonical.data.categories.teeGame,
            approach: canonical.data.categories.approach,
            shortGame: canonical.data.categories.shortGame,
            putting: canonical.data.categories.putting,
            scoring: canonical.data.categories.scoring,
            overall: canonical.data.categories.overall,
          };
        }
        if (canonical.data.composite != null) {
          composite = canonical.data.composite;
        }
      }
    } catch {
      // Keep the local fallback values if the canonical action throws.
    }

    const playerMetricsForPercentile = playerStatsRow
      ? mapStatsCacheToMetrics(playerStatsRow)
      : {};

    // Build team distributions
    const teamDistributions: Record<string, number[]> = {};
    for (const key of metricKeys) {
      teamDistributions[key] = teamPlayerMetrics.map((p) => p.metrics[key] ?? 0);
    }

    // Platform distributions default to team (could be expanded later)
    const platformDistributions = teamDistributions;

    const percentiles = buildPercentileProfile(
      playerMetricsForPercentile,
      teamDistributions,
      platformDistributions,
      playerId,
    );

    return {
      success: true,
      data: {
        composite,
        categories,
        percentiles,
        baselines: baseline,
        playerState: {
          playerId,
          roundCount: roundsData.length,
          zScores,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getPlayerProfile';
    await logServerError(message, { action: 'getPlayerProfile', extra: { playerId } }, 'error');
    return { success: false, error: message };
  }
}

// ============================================================================
// 2. getPlayerTrendAnalysis
// ============================================================================

/**
 * Returns multi-window trends, streak info, regression predictions,
 * anomaly detection, and volatility analysis for a player.
 */
export async function getPlayerTrendAnalysis(
  playerId: string,
): Promise<ActionResult<TrendAnalysisData>> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  const accessError = await getPlayerAccessError(supabase, user.id, playerId);
  if (accessError) {
    return { success: false, error: accessError };
  }

  try {
    // Fetch player's rounds (last 30)
    const { data: roundsData, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, holes_played')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('score_to_par', 'is', null)
      .order('round_date', { ascending: true })
      .limit(30);

    if (roundsError) {
      return { success: false, error: 'Failed to fetch round data' };
    }

    if (!roundsData || roundsData.length < 3) {
      return { success: false, error: 'Need at least 3 completed rounds for trend analysis' };
    }

    // Extract score_to_par values (chronological, oldest first)
    const scoreValues = roundsData.map((r) => r.score_to_par ?? 0);

    // Build baseline from rounds
    const baselineRounds = roundsData.map((r) => ({
      metrics: {
        scoreToPar: r.score_to_par ?? 0,
        puttsPerRound: r.total_putts ?? 0,
        // Canonical denominators: GIR over greens-possible, fairway over par-4/5
        // holes with a recorded fairway result (NOT holes_played, which over-counts).
        girPct: r.total_gir != null && r.total_gir_possible != null && r.total_gir_possible > 0
          ? (r.total_gir / r.total_gir_possible) * 100
          : 0,
        fairwayPct: r.total_fairways_hit != null && r.total_fairways != null && r.total_fairways > 0
          ? (r.total_fairways_hit / r.total_fairways) * 100
          : 0,
      },
    }));

    const baseline = buildPlayerBaseline(baselineRounds, playerId);

    // Run multi-window trend analysis on score_to_par (lower is better for golf scores)
    const trends = analyzeMultiWindowTrends(scoreValues, 'scoreToPar', true);

    // Detect streaks against baseline mean
    const baselineMean = baseline.metrics['scoreToPar']?.mean ?? 0;
    const streaks = detectStreaks(scoreValues, baselineMean);

    // Check for regression candidates
    const baselineMetric = baseline.metrics['scoreToPar'];
    const latestScore = scoreValues[scoreValues.length - 1];
    const regressionPrediction = baselineMetric && latestScore !== undefined
      ? detectRegressionCandidate(
          latestScore,
          baselineMetric.mean,
          baselineMetric.stdDev,
          'scoreToPar',
          0.5,
          scoreValues.length,
        )
      : null;

    // Detect anomalies + volatility
    const anomalies = baselineMetric
      ? detectAnomalies(scoreValues, baselineMetric, 'scoreToPar')
      : [];

    const volatility = calculateVolatility(scoreValues);

    return {
      success: true,
      data: {
        trends,
        streaks,
        regressionPrediction,
        anomalies,
        volatility,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getPlayerTrendAnalysis';
    await logServerError(message, { action: 'getPlayerTrendAnalysis', extra: { playerId } }, 'error');
    return { success: false, error: message };
  }
}

// ============================================================================
// 3. getPlayerShotContext
// ============================================================================

/**
 * Returns shot-level SG analysis, yardage curves, dead zones,
 * sequence/resilience analysis, and scramble rate for a player.
 */
export async function getPlayerShotContext(
  playerId: string,
  periodDays: number = 90,
): Promise<ActionResult<ShotContextData>> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  const accessError = await getPlayerAccessError(supabase, user.id, playerId);
  if (accessError) {
    return { success: false, error: accessError };
  }

  try {
    // Calculate date range
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - periodDays);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    // Fetch rounds in the period
    const { data: roundsData, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', sinceDateStr);

    if (roundsError) {
      return { success: false, error: 'Failed to fetch rounds' };
    }

    if (!roundsData || roundsData.length === 0) {
      return { success: false, error: 'No completed rounds found in the specified period' };
    }

    const roundIds = roundsData.map((r) => r.id);

    // Fetch shots for these rounds
    const { data: shotsData, error: shotsError } = await supabase
      .from('golf_shots')
      .select('id, round_id, hole_number, shot_number, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, club_type, result')
      .in('round_id', roundIds)
      .order('round_id')
      .order('hole_number')
      .order('shot_number')
      .limit(50000); // lift PostgREST 1000-row default cap

    if (shotsError) {
      return { success: false, error: 'Failed to fetch shot data' };
    }

    if (!shotsData || shotsData.length === 0) {
      return { success: false, error: 'No shot data available for analysis' };
    }

    // Map DB shots to ShotData interface
    const shots: ShotData[] = shotsData
      .filter((s) => s.lie_before && s.distance_to_hole_before != null)
      .map((s) => {
        // Convert feet to yards if needed — but keep feet for green lies
        // because shot-level-sg.ts expects FEET for putting distances
        const distBefore = s.lie_before === 'green'
          ? (s.distance_to_hole_before ?? 0)  // Keep in feet for putting
          : s.distance_unit_before === 'feet'
            ? (s.distance_to_hole_before ?? 0) / 3
            : (s.distance_to_hole_before ?? 0);
        const distAfter = s.lie_after === 'green'
          ? (s.distance_to_hole_after ?? 0)  // Keep in feet for putting
          : s.distance_unit_after === 'feet'
            ? (s.distance_to_hole_after ?? 0) / 3
            : (s.distance_to_hole_after ?? 0);

        return {
          id: s.id,
          roundId: s.round_id,
          holeNumber: s.hole_number,
          shotNumber: s.shot_number,
          lieBefore: s.lie_before ?? 'fairway',
          distanceBefore: distBefore,
          lieAfter: s.lie_after ?? 'fairway',
          distanceAfter: distAfter,
          club: s.club_type ?? undefined,
          result: s.result ?? undefined,
        };
      });

    if (shots.length === 0) {
      return { success: false, error: 'Insufficient shot data with distance information' };
    }

    // Build default SG baseline
    const sgBaseline = buildDefaultBaseline();

    // Analyze by context + rank weaknesses
    const contextAnalyses = analyzeShotsByContext(shots, sgBaseline);
    const weaknesses = rankWeaknessContexts(contextAnalyses, 5); // Lower min for broader view

    // Build yardage curve + find dead zones
    const yardageCurve = buildYardageCurve(shots, sgBaseline, 25, playerId);

    // Build a synthetic baseline yardage curve for dead zone comparison.
    // The default SG baseline represents average performance (SG = 0),
    // so we create a curve where every bucket has avgSG = 0.
    const syntheticBaselineCurve: YardageCurve = {
      playerId: 'baseline',
      buckets: yardageCurve.buckets.map((b) => ({
        ...b,
        avgSG: 0, // Baseline SG is 0 by definition
      })),
    };
    const deadZones = findDeadZones(yardageCurve, syntheticBaselineCurve, 0.3, 5);

    // Calculate SG values for sequence analysis
    const sgValues = shots.map((shot) =>
      calculateShotSG(
        shot.distanceBefore,
        shot.lieBefore,
        shot.distanceAfter,
        shot.lieAfter,
        sgBaseline,
        shot.result,
      ),
    );

    // Analyze shot sequences for resilience
    const resilience = analyzeSequenceEffects(shots, sgValues);

    // Fetch holes for scramble rate
    const { data: holesData } = await supabase
      .from('golf_holes')
      .select('hole_number, par, score, gir, putts, round_id')
      .in('round_id', roundIds)
      .limit(50000); // lift PostgREST 1000-row default cap

    const scrambleHoles = (holesData ?? [])
      .filter((h): h is typeof h & { par: number; score: number; gir: boolean } =>
        h.par != null && h.score != null && h.gir != null,
      )
      .map((h) => ({
        gir: h.gir,
        par: h.par,
        score: h.score,
      }));

    const scrambleRate = calculateScrambleRate(scrambleHoles);

    return {
      success: true,
      data: {
        weaknesses,
        yardageCurve,
        deadZones,
        resilience,
        scrambleRate,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getPlayerShotContext';
    await logServerError(message, { action: 'getPlayerShotContext', extra: { playerId, periodDays } }, 'error');
    return { success: false, error: message };
  }
}

// ============================================================================
// 4. getTeamSimulation
// ============================================================================

/**
 * Returns Monte Carlo tournament simulation and lineup optimization
 * for a team. Coach-only access.
 */
export async function getTeamSimulation(
  teamId: string,
  rounds: number = 4,
): Promise<ActionResult<TeamSimulationData>> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  const coachAccess = await verifyCoachAccess(supabase, user.id, teamId);
  if (!coachAccess.authorized) {
    return { success: false, error: coachAccess.error ?? 'Unauthorized' };
  }

  try {
    // Fetch active team members
    const { data: membersData, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id, golf_players(id, first_name, last_name)')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (membersError) {
      return { success: false, error: 'Failed to fetch team members' };
    }

    if (!membersData || membersData.length < 2) {
      return { success: false, error: 'Need at least 2 active players for simulation' };
    }

    // Build player profiles from recent scoring data
    const playerProfiles: PlayerProfile[] = [];

    for (const member of membersData) {
      const playerInfo = member.golf_players as { id: string; first_name: string | null; last_name: string | null } | null;
      if (!playerInfo) continue;

      // Fetch recent rounds for scoring stats
      const { data: playerRounds } = await supabase
        .from('golf_rounds')
        .select('score_to_par')
        .eq('player_id', member.player_id)
        .eq('status', 'completed')
        .not('score_to_par', 'is', null)
        .order('round_date', { ascending: false })
        .limit(20);

      const scores = (playerRounds ?? []).map((r) => r.score_to_par ?? 0);

      if (scores.length < 3) continue; // Need enough data

      const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
      const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      // Recent form: compare last 5 to overall mean
      const recentScores = scores.slice(0, Math.min(5, scores.length));
      const recentMean = recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
      const recentForm = Math.max(-2, Math.min(2, recentMean - mean));

      playerProfiles.push({
        playerId: member.player_id,
        name: `${playerInfo.first_name ?? ''} ${playerInfo.last_name ?? ''}`.trim(),
        scoringMean: mean,
        scoringStdDev: Math.max(stdDev, 0.5), // Floor stdDev to avoid degenerate cases
        recentForm,
      });
    }

    if (playerProfiles.length < 2) {
      return { success: false, error: 'Not enough players with sufficient round data for simulation' };
    }

    // Run tournament simulation
    const simulation = simulateTournament(playerProfiles, rounds);

    // Run lineup optimization (default to top 5 or all if fewer)
    const lineupSize = Math.min(5, playerProfiles.length);
    const lineupOptimization = optimizeLineup(playerProfiles, lineupSize);

    return {
      success: true,
      data: {
        simulation,
        lineupOptimization,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getTeamSimulation';
    await logServerError(message, { action: 'getTeamSimulation', extra: { teamId } }, 'error');
    return { success: false, error: message };
  }
}

// ============================================================================
// 5. getPlayerWhatIf
// ============================================================================

/**
 * Returns a what-if scenario projection for a player improving a specific metric.
 */
export async function getPlayerWhatIf(
  playerId: string,
  improvement: { metric: string; amount: number },
): Promise<ActionResult<WhatIfData>> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  const accessError = await getPlayerAccessError(supabase, user.id, playerId);
  if (accessError) {
    return { success: false, error: accessError };
  }

  try {
    // Fetch player info
    const { data: playerInfo } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
      .maybeSingle();

    if (!playerInfo) {
      return { success: false, error: 'Player not found' };
    }

    // Fetch player scoring data
    const { data: roundsData, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('score_to_par')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('score_to_par', 'is', null)
      .order('round_date', { ascending: false })
      .limit(20);

    if (roundsError) {
      return { success: false, error: 'Failed to fetch scoring data' };
    }

    const scores = (roundsData ?? []).map((r) => r.score_to_par ?? 0);

    if (scores.length < 3) {
      return { success: false, error: 'Need at least 3 completed rounds for scenario analysis' };
    }

    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Recent form
    const recentScores = scores.slice(0, Math.min(5, scores.length));
    const recentMean = recentScores.reduce((s, v) => s + v, 0) / recentScores.length;
    const recentForm = Math.max(-2, Math.min(2, recentMean - mean));

    const playerProfile: PlayerProfile = {
      playerId,
      name: `${playerInfo.first_name ?? ''} ${playerInfo.last_name ?? ''}`.trim(),
      scoringMean: mean,
      scoringStdDev: Math.max(stdDev, 0.5),
      recentForm,
    };

    // Optionally fetch team for rank change projection
    let teamPlayers: PlayerProfile[] | undefined;

    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .maybeSingle();

    if (membership?.team_id) {
      const { data: teamMembers } = await supabase
        .from('golf_team_members')
        .select('player_id, golf_players(id, first_name, last_name)')
        .eq('team_id', membership.team_id)
        .eq('status', 'active');

      if (teamMembers && teamMembers.length > 1) {
        // Batch fetch all team members' rounds in a single query to avoid N+1
        const otherPlayerIds = teamMembers
          .filter((m) => m.player_id !== playerId)
          .map((m) => m.player_id);

        const { data: allTeamRounds } = otherPlayerIds.length > 0
          ? await supabase
              .from('golf_rounds')
              .select('player_id, score_to_par')
              .in('player_id', otherPlayerIds)
              .eq('status', 'completed')
              .not('score_to_par', 'is', null)
              .order('round_date', { ascending: false })
          : { data: [] as { player_id: string; score_to_par: number | null }[] };

        // Group rounds by player
        const roundsByPlayer = new Map<string, number[]>();
        for (const r of allTeamRounds ?? []) {
          const scores = roundsByPlayer.get(r.player_id) ?? [];
          scores.push(r.score_to_par ?? 0);
          roundsByPlayer.set(r.player_id, scores);
        }

        const profiles: PlayerProfile[] = [playerProfile];

        for (const m of teamMembers) {
          const info = m.golf_players as { id: string; first_name: string | null; last_name: string | null } | null;
          if (!info || m.player_id === playerId) continue;

          const mScores = (roundsByPlayer.get(m.player_id) ?? []).slice(0, 20);
          if (mScores.length < 3) continue;

          const mMean = mScores.reduce((s, v) => s + v, 0) / mScores.length;
          const mVariance = mScores.reduce((s, v) => s + (v - mMean) ** 2, 0) / mScores.length;
          const mStdDev = Math.sqrt(mVariance);
          const mRecent = mScores.slice(0, Math.min(5, mScores.length));
          const mRecentMean = mRecent.reduce((s, v) => s + v, 0) / mRecent.length;

          profiles.push({
            playerId: m.player_id,
            name: `${info.first_name ?? ''} ${info.last_name ?? ''}`.trim(),
            scoringMean: mMean,
            scoringStdDev: Math.max(mStdDev, 0.5),
            recentForm: Math.max(-2, Math.min(2, mRecentMean - mMean)),
          });
        }

        if (profiles.length > 1) {
          teamPlayers = profiles;
        }
      }
    }

    // Run what-if simulation
    const scenario = simulateWhatIf(playerProfile, improvement, teamPlayers);

    return {
      success: true,
      data: {
        scenario,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error in getPlayerWhatIf';
    await logServerError(message, { action: 'getPlayerWhatIf', extra: { playerId } }, 'error');
    return { success: false, error: message };
  }
}
