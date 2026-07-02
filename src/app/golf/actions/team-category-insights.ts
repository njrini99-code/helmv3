'use server';

import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { logServerError } from '@/lib/server-error-logger';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import {
  samplePerPlayerRounds,
  computeTeamHealth,
} from './team-category-insights-helpers';

// ============================================================================
// TYPES
// ============================================================================

export interface CategoryInsight {
  id: string;
  message: string;
  tone: 'positive' | 'negative' | 'neutral';
  metric?: string;
  value?: number;
  benchmark?: number;
}

export interface PlayerCategoryStat {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  value: number;
  trend: 'improving' | 'stable' | 'declining';
  trendDelta: number;
  needsAttention: boolean;
}

export interface TeamCategory {
  id: string;
  label: string;
  teamAvg: number;
  teamAvgLabel: string;
  trend: 'improving' | 'stable' | 'declining';
  insights: CategoryInsight[];
  players: PlayerCategoryStat[];
  primaryMetric: string;
  attentionCount: number;
}

export interface TeamCategoryInsightsResult {
  success: boolean;
  data?: {
    categories: TeamCategory[];
    teamHealth: number;
    lastAnalyzed: string;
  };
  error?: string;
}

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

interface CategoryDef {
  id: string;
  label: string;
  primaryMetric: string;
  primaryLabel: string;
  format: (v: number) => string;
  lowerIsBetter: boolean;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'driving',
    label: 'Driving',
    primaryMetric: 'driving_accuracy_percentage',
    primaryLabel: 'Fairway %',
    format: (v: number) => `${v.toFixed(0)}% FW`,
    lowerIsBetter: false,
  },
  {
    id: 'approach',
    label: 'Approach',
    primaryMetric: 'gir_percentage',
    primaryLabel: 'GIR %',
    format: (v: number) => `${v.toFixed(0)}% GIR`,
    lowerIsBetter: false,
  },
  {
    id: 'short_game',
    label: 'Short Game',
    primaryMetric: 'scrambling_percentage',
    primaryLabel: 'Scramble %',
    format: (v: number) => `${v.toFixed(0)}% Scramble`,
    lowerIsBetter: false,
  },
  {
    id: 'putting',
    label: 'Putting',
    primaryMetric: 'putts_per_round',
    primaryLabel: 'Putts/Round',
    format: (v: number) => `${v.toFixed(1)} PPR`,
    lowerIsBetter: true,
  },
  {
    id: 'scoring',
    label: 'Scoring',
    primaryMetric: 'scoring_average_vs_par',
    primaryLabel: 'Avg vs Par',
    format: (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
    lowerIsBetter: true,
  },
];

// Columns needed from golf_rounds for per-category trend calculation
const ROUND_STAT_COLUMNS = [
  'id',
  'player_id',
  'round_date',
  'total_score',
  'score_to_par',
  'total_putts',
  'total_fairways_hit',
  'total_fairways',
  'total_gir',
  'total_gir_possible',
  'holes_played',
] as const;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute standard deviation for an array of numbers.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Derive a per-round metric value from a golf_rounds row for a given category.
 * Returns null if the round lacks data for the metric.
 */
function roundMetricValue(
  round: Record<string, unknown>,
  categoryId: string,
): number | null {
  switch (categoryId) {
    case 'driving': {
      const hit = round.total_fairways_hit as number | null;
      const total = round.total_fairways as number | null;
      if (hit == null || total == null || total === 0) return null;
      return (hit / total) * 100;
    }
    case 'approach': {
      const gir = round.total_gir as number | null;
      const possible = round.total_gir_possible as number | null;
      if (gir == null || possible == null || possible === 0) return null;
      return (gir / possible) * 100;
    }
    case 'short_game': {
      // Scrambling cannot be derived per-round without shot-level data.
      // Fall back to null — trend will be 'stable'.
      return null;
    }
    case 'putting': {
      const putts = round.total_putts as number | null;
      if (putts == null) return null;
      // Normalize to 18 holes
      const holes = (round.holes_played as number | null) ?? 18;
      return holes > 0 ? (putts / holes) * 18 : null;
    }
    case 'scoring': {
      const scoreToPar = round.score_to_par as number | null;
      if (scoreToPar == null) return null;
      // Scoring is measured on 18-hole rounds only (matches the canonical
      // scoring_average), so skip partial/9-hole rounds rather than scaling
      // a 9-hole score_to_par up to a fictional 18-hole figure.
      const holes = (round.holes_played as number | null) ?? 18;
      return holes === 18 ? scoreToPar : null;
    }
    default:
      return null;
  }
}

/**
 * Determine trend and delta from two ordered groups of round metric values.
 * `recent` = most recent rounds, `previous` = older rounds.
 */
function computeTrend(
  recent: number[],
  previous: number[],
  lowerIsBetter: boolean,
): { trend: 'improving' | 'stable' | 'declining'; delta: number } {
  if (recent.length === 0 || previous.length === 0) {
    return { trend: 'stable', delta: 0 };
  }
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const prevAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const delta = recentAvg - prevAvg;
  const threshold = 0.5; // Minimum meaningful change

  if (Math.abs(delta) < threshold) {
    return { trend: 'stable', delta };
  }

  // For "lower is better" metrics, a negative delta means improvement
  const improving = lowerIsBetter ? delta < -threshold : delta > threshold;
  return { trend: improving ? 'improving' : 'declining', delta };
}

/**
 * Generate up to 3 insights for a category based on player data.
 */
function generateCategoryInsights(
  category: CategoryDef,
  players: PlayerCategoryStat[],
  _teamAvg: number,
): CategoryInsight[] {
  const insights: CategoryInsight[] = [];

  // 1. Team trend insight
  const improvingCount = players.filter((p) => p.trend === 'improving').length;
  const decliningCount = players.filter((p) => p.trend === 'declining').length;

  if (improvingCount > decliningCount) {
    insights.push({
      id: `${category.id}-trend`,
      message: `Team ${category.label.toLowerCase()} trending up — ${improvingCount} of ${players.length} players improving`,
      tone: 'positive',
    });
  } else if (decliningCount > improvingCount) {
    insights.push({
      id: `${category.id}-trend`,
      message: `${decliningCount} players showing decline in ${category.label.toLowerCase()}`,
      tone: 'negative',
    });
  }

  // 2. Attention players insight
  const attentionPlayers = players.filter((p) => p.needsAttention);
  if (attentionPlayers.length > 0) {
    const names = attentionPlayers.map((p) => p.playerName.split(' ')[0]).join(', ');
    insights.push({
      id: `${category.id}-attention`,
      message: `${attentionPlayers.length} player${attentionPlayers.length > 1 ? 's' : ''} below team average — ${names}`,
      tone: 'negative',
    });
  }

  // 3. Standout player insight
  const best = players[0];
  if (best && players.length > 2) {
    insights.push({
      id: `${category.id}-standout`,
      message: `${best.playerName.split(' ')[0]} leads the team in ${category.label.toLowerCase()}`,
      tone: 'positive',
    });
  }

  return insights.slice(0, 3);
}

// ============================================================================
// MAIN ACTION
// ============================================================================

// ============================================================================
// TEAM OVERVIEW TYPES
// ============================================================================

export interface TeamOverviewResult {
  success: boolean;
  data?: {
    teamComposite: number;
    teamCategories: { teeGame: number; approach: number; shortGame: number; putting: number; scoring: number };
    teamShotAnalysis: {
      yardageCurve: Array<{ rangeStart: number; rangeEnd: number; avgSG: number; shotCount: number }>;
      deadZones: Array<{ rangeStart: number; rangeEnd: number; deficit: number }>;
      topWeaknesses: Array<{ context: string; lie: string; distanceRange: string; avgSG: number; shotCount: number }>;
    };
    playerCount: number;
    /** How many players actually had a stats-cache row used to compute
     *  teamComposite/teamCategories. Distinguishes "truly average team" from
     *  "we have no stats yet" — the UI can only honestly claim the latter. */
    statsRowCount: number;
  };
  error?: string;
}

// ============================================================================
// GET TEAM OVERVIEW
// ============================================================================

/**
 * Aggregates team-level composite rating, category breakdown, and shot analysis.
 * Returns data suitable for the TeamCompositeCard and TeamShotOverview components.
 */
async function getTeamOverviewImpl(
  teamIdArg?: string,
): Promise<TeamOverviewResult> {
  try {
    // 1. Auth check — verify user is a coach
    const session = await getGolfSessionProfile();
    if (!session?.coach) {
      return { success: false, error: 'Unauthorized: coach role required' };
    }

    const supabase = await createClient();
    const { organization_id: orgId } = session.coach;

    if (!orgId) {
      return { success: false, error: 'No organization found for this coach' };
    }

    // 2. Resolve team id. Caller may pass it (e.g. intelligence page) so we
    //    skip the redundant org→team lookup. Otherwise look it up here.
    let team: { id: string } | null = null;
    if (teamIdArg) {
      team = { id: teamIdArg };
    } else {
      const resolvedTeamId = await resolveCoachTeamIdWithCookie(
        supabase,
        orgId,
        session.coach.id,
      );
      if (!resolvedTeamId) {
        return { success: false, error: 'Team not found' };
      }
      team = { id: resolvedTeamId };
    }

    // 3. Get active players via golf_team_members
    const { data: members, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', team.id)
      .eq('status', 'active');

    // P017: a DB error must NOT be reported as a healthy-but-empty team (all
    // categories a fake neutral 50). Surface the failure so the caller can render
    // an error state; keep the neutral-empty overview only for a genuinely empty
    // roster.
    if (membersError) {
      return { success: false, error: 'Failed to load team members' };
    }
    if (!members || members.length === 0) {
      return {
        success: true,
        data: {
          teamComposite: 0,
          teamCategories: { teeGame: 50, approach: 50, shortGame: 50, putting: 50, scoring: 50 },
          teamShotAnalysis: { yardageCurve: [], deadZones: [], topWeaknesses: [] },
          playerCount: 0,
          statsRowCount: 0,
        },
      };
    }

    const playerIds = members.map((m) => m.player_id);

    // 4. Fetch stats cache for all players
    const { data: statsData, error: statsError } = await supabase
      .from('golf_player_stats_cache')
      .select(
        'player_id, driving_accuracy_percentage, driving_distance_average, gir_percentage, approach_proximity_average, strokes_gained_approach, scrambling_percentage, strokes_gained_around_green, putts_per_round, three_putt_percentage, strokes_gained_putting, putt_make_pct_5_10ft, scoring_average, scoring_average_vs_par, par3_average, par4_average, par5_average, penalty_strokes_per_round',
      )
      .in('player_id', playerIds);

    if (statsError) {
      return { success: false, error: 'Failed to load player stats' };
    }

    // 5. Build team-level composite using benchmark-relative grading.
    //
    // Z-score normalization within a single-team population is mathematically
    // degenerate: per-metric z-scores have mean 0 across the population, so
    // averaging them across the team always yields ~0 → composite = 50 + 0*10
    // = 50. Same for every category. (This is what was producing the stuck
    // 50/100 ring + flat 50 bars when Demo University Golf was the only team.)
    //
    // Instead we grade each metric against fixed D2/D3 benchmarks (mirrors
    // the player-side fallback in coachhelm-data.ts:411-422) and aggregate by
    // category using the same CATEGORY_METRICS groupings the z-score path
    // uses, so the output shape stays identical for TeamCompositeCard.
    const { computeCategoryRatings, computeCompositeRating } = await import(
      '@/lib/coachhelm/v2/stats'
    );

    // Map: internal metric key → stats-cache column. Keys must match the
    // CATEGORY_METRICS groupings in src/lib/coachhelm/v2/stats/z-score.ts.
    const metricsMap: Record<string, string> = {
      drivingDistance: 'driving_distance_average',
      fairwayPct: 'driving_accuracy_percentage',
      girPct: 'gir_percentage',
      sgApproach: 'strokes_gained_approach',
      proximityToHole: 'approach_proximity_average',
      scramblePct: 'scrambling_percentage',
      sgAroundGreen: 'strokes_gained_around_green',
      sgPutting: 'strokes_gained_putting',
      puttsPerRound: 'putts_per_round',
      threePuttAvoidance: 'three_putt_percentage',
      scoringAvg: 'scoring_average_vs_par',
    };

    // D2/D3 benchmark anchors. mean → rating 50, good → rating 80, then
    // linearly extrapolated and clamped to [0,100]. Mirrors the player
    // fallback path in coachhelm-data.ts.
    const benchmarks: Record<
      string,
      { mean: number; good: number; lowerIsBetter: boolean }
    > = {
      drivingDistance:    { mean: 265, good: 290, lowerIsBetter: false },
      fairwayPct:         { mean: 55,  good: 70,  lowerIsBetter: false },
      girPct:             { mean: 50,  good: 67,  lowerIsBetter: false },
      sgApproach:         { mean: 0,   good: 1,   lowerIsBetter: false },
      proximityToHole:    { mean: 38,  good: 30,  lowerIsBetter: true },
      scramblePct:        { mean: 35,  good: 55,  lowerIsBetter: false },
      sgAroundGreen:      { mean: 0,   good: 0.5, lowerIsBetter: false },
      sgPutting:          { mean: 0,   good: 0.5, lowerIsBetter: false },
      puttsPerRound:      { mean: 32,  good: 28,  lowerIsBetter: true },
      threePuttAvoidance: { mean: 6,   good: 3,   lowerIsBetter: true },
      scoringAvg:         { mean: 4,   good: 0,   lowerIsBetter: true },
    };

    let teamComposite = 50;
    let teamCategories = {
      teeGame: 50,
      approach: 50,
      shortGame: 50,
      putting: 50,
      scoring: 50,
    };

    const statsRows = statsData ?? [];
    if (statsRows.length > 0) {
      // Average each metric across the team. Skip a player's value for a
      // metric only if it's null/NaN; treat 0 as a real value.
      const teamMetricAvgs: Record<string, number> = {};
      for (const [metricKey, dbCol] of Object.entries(metricsMap)) {
        const vals: number[] = [];
        for (const row of statsRows) {
          const raw = (row as Record<string, unknown>)[dbCol];
          if (raw == null) continue;
          const num = Number(raw);
          if (!Number.isFinite(num)) continue;
          vals.push(num);
        }
        if (vals.length > 0) {
          teamMetricAvgs[metricKey] =
            vals.reduce((a, b) => a + b, 0) / vals.length;
        }
      }

      // Convert each team-average metric into a 0–100 rating against the
      // benchmark, then back into a z-like score so we can reuse the existing
      // computeCategoryRatings / computeCompositeRating helpers (rating R
      // corresponds to z ≈ (R - 50) / 10 in their formula).
      const benchZScores: Record<string, number> = {};
      for (const [metricKey, val] of Object.entries(teamMetricAvgs)) {
        const bench = benchmarks[metricKey];
        if (!bench) continue;
        const range = bench.good - bench.mean; // negative when lowerIsBetter
        if (range === 0) {
          benchZScores[metricKey] = 0;
          continue;
        }
        const normalized = (val - bench.mean) / range; // 0 at mean, 1 at good
        const rating = Math.max(0, Math.min(100, 50 + normalized * 30));
        benchZScores[metricKey] = (rating - 50) / 10;
      }

      if (Object.keys(benchZScores).length > 0) {
        const cats = computeCategoryRatings(benchZScores);
        teamCategories = {
          teeGame: Math.max(0, Math.min(100, Math.round(cats.teeGame))),
          approach: Math.max(0, Math.min(100, Math.round(cats.approach))),
          shortGame: Math.max(0, Math.min(100, Math.round(cats.shortGame))),
          putting: Math.max(0, Math.min(100, Math.round(cats.putting))),
          scoring: Math.max(0, Math.min(100, Math.round(cats.scoring))),
        };
        teamComposite = Math.max(
          0,
          Math.min(100, Math.round(computeCompositeRating(benchZScores))),
        );
      }
    }

    // 6. Aggregate shot data for yardage curve (last 90 days)
    const {
      buildDefaultBaseline,
      buildYardageCurve,
      findDeadZones,
      analyzeShotsByContext,
      rankWeaknessContexts,
    } = await import('@/lib/coachhelm/v2/shot-analysis');

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 90);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    // Fetch round IDs for all team players in period.
    // Paginate past PostgREST's 1000-row default: a program with >1000
    // completed rounds in 90 days would otherwise silently lose roundIds,
    // truncating the downstream shot fetch, yardageCurve, deadZones, and the
    // hero's "toughest band" read. Uses the same helper as the shot batch below.
    const { data: roundsData } = await fetchAllRowsResult<{ id: string }>((from, to) => supabase
      .from('golf_rounds')
      .select('id')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .gte('round_date', sinceDateStr)
      .order('id', { ascending: true })
      .range(from, to), undefined, { table: 'golf_rounds', action: 'getTeamOverview', feature: 'intelligence_dashboard', sport: 'golf' });

    let yardageCurve: Array<{ rangeStart: number; rangeEnd: number; avgSG: number; shotCount: number }> = [];
    let deadZones: Array<{ rangeStart: number; rangeEnd: number; deficit: number }> = [];
    let topWeaknesses: Array<{ context: string; lie: string; distanceRange: string; avgSG: number; shotCount: number }> = [];

    if (roundsData && roundsData.length > 0) {
      const roundIds = roundsData.map((r) => r.id);

      // Fetch shots in batches if needed (supabase .in has limits with large arrays)
      const batchSize = 100;
      const allShotsRaw: Array<Record<string, unknown>> = [];

      for (let i = 0; i < roundIds.length; i += batchSize) {
        const batch = roundIds.slice(i, i + batchSize);
        const { data: shotsData } = await fetchAllRowsResult((from, to) => supabase
          .from('golf_shots')
          .select('id, round_id, hole_number, shot_number, lie_before, lie_after, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, club_type, result')
          .in('round_id', batch)
          .order('round_id')
          .order('hole_number')
          .order('shot_number')
          // Batching the round-ID array dodges .in() URL-length limits AND
          // PostgREST's 1000-row default: a 100-round batch is ~7400 shots, so
          // we paginate to fetch every row instead of silently truncating.
          .order('id', { ascending: true })
          .range(from, to), undefined, { table: 'golf_shots', action: 'getTeamOverview', feature: 'intelligence_dashboard', sport: 'golf' }); // paginate past PostgREST 1000-row cap
        if (shotsData) {
          allShotsRaw.push(...(shotsData as unknown as Array<Record<string, unknown>>));
        }
      }

      // Map DB shots to ShotData interface (same logic as coachhelm-data.ts)
      type ShotDataType = { id: string; roundId: string; holeNumber: number; shotNumber: number; lieBefore: string; distanceBefore: number; lieAfter: string; distanceAfter: number; club?: string; result?: string };
      const shots: ShotDataType[] = allShotsRaw
        .filter((s) => s.lie_before && s.distance_to_hole_before != null)
        .map((s) => {
          const lieBefore = (s.lie_before as string) ?? 'fairway';
          const lieAfter = (s.lie_after as string) ?? 'fairway';
          const distBefore = lieBefore === 'green'
            ? Number(s.distance_to_hole_before ?? 0)
            : (s.distance_unit_before as string) === 'feet'
              ? Number(s.distance_to_hole_before ?? 0) / 3
              : Number(s.distance_to_hole_before ?? 0);
          const distAfter = lieAfter === 'green'
            ? Number(s.distance_to_hole_after ?? 0)
            : (s.distance_unit_after as string) === 'feet'
              ? Number(s.distance_to_hole_after ?? 0) / 3
              : Number(s.distance_to_hole_after ?? 0);

          return {
            id: s.id as string,
            roundId: s.round_id as string,
            holeNumber: Number(s.hole_number),
            shotNumber: Number(s.shot_number),
            lieBefore,
            distanceBefore: distBefore,
            lieAfter,
            distanceAfter: distAfter,
            club: (s.club_type as string) ?? undefined,
            result: (s.result as string) ?? undefined,
          };
        });

      if (shots.length > 0) {
        const sgBaseline = buildDefaultBaseline();

        // Build team yardage curve
        const teamCurve = buildYardageCurve(shots, sgBaseline, 25, 'team');
        yardageCurve = teamCurve.buckets.map((b) => ({
          rangeStart: b.rangeStart,
          rangeEnd: b.rangeEnd,
          avgSG: Math.round(b.avgSG * 1000) / 1000,
          shotCount: b.shotCount,
        }));

        // Build synthetic baseline for dead zone detection (SG = 0)
        const syntheticBaseline = {
          playerId: 'baseline',
          buckets: teamCurve.buckets.map((b) => ({ ...b, avgSG: 0 })),
        };
        const rawDeadZones = findDeadZones(teamCurve, syntheticBaseline, 0.2, 15);
        deadZones = rawDeadZones.map((dz) => ({
          rangeStart: dz.rangeStart,
          rangeEnd: dz.rangeEnd,
          deficit: Math.round(dz.deficit * 1000) / 1000,
        }));

        // Analyze by context and rank weaknesses
        const contextAnalyses = analyzeShotsByContext(shots, sgBaseline);
        const ranked = rankWeaknessContexts(contextAnalyses, 15);
        topWeaknesses = ranked.slice(0, 5).map((w) => ({
          context: w.context,
          lie: w.lie,
          distanceRange: w.distanceRange,
          avgSG: Math.round(w.avgSG * 1000) / 1000,
          shotCount: w.shotCount,
        }));
      }
    }

    return {
      success: true,
      data: {
        teamComposite,
        teamCategories,
        teamShotAnalysis: { yardageCurve, deadZones, topWeaknesses },
        playerCount: playerIds.length,
        statsRowCount: (statsData ?? []).length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logServerError(message, { action: 'getTeamOverview' }, 'error');
    return { success: false, error: message };
  }
}

const observedGetTeamOverview = withAdminObserved(
  'getTeamOverview',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  getTeamOverviewImpl,
);

export async function getTeamOverview(
  teamIdArg?: string,
): Promise<TeamOverviewResult> {
  return observedGetTeamOverview(teamIdArg);
}

// ============================================================================
// MAIN ACTION — getTeamCategoryInsights
// ============================================================================

async function getTeamCategoryInsightsImpl(
  teamIdArg?: string,
): Promise<TeamCategoryInsightsResult> {
  try {
    // 1. Auth check — verify user is a coach
    const session = await getGolfSessionProfile();
    if (!session?.coach) {
      return { success: false, error: 'Unauthorized: coach role required' };
    }

    const supabase = await createClient();
    const { organization_id: orgId } = session.coach;

    if (!orgId) {
      return { success: false, error: 'No organization found for this coach' };
    }

    // 2. Resolve team id. Caller may pass it (e.g. intelligence page) so we
    //    skip the redundant org→team lookup. Otherwise look it up here.
    let team: { id: string } | null = null;
    if (teamIdArg) {
      team = { id: teamIdArg };
    } else {
      const resolvedTeamId = await resolveCoachTeamIdWithCookie(
        supabase,
        orgId,
        session.coach.id,
      );
      if (!resolvedTeamId) {
        return { success: false, error: 'Team not found' };
      }
      team = { id: resolvedTeamId };
    }

    // 3. Get active players via golf_team_members
    const { data: members, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', team.id)
      .eq('status', 'active');

    if (membersError) {
      return { success: false, error: 'Failed to load team members' };
    }

    if (!members || members.length === 0) {
      return {
        success: true,
        data: {
          categories: CATEGORIES.map((c) => ({
            id: c.id,
            label: c.label,
            teamAvg: 0,
            teamAvgLabel: 'No data',
            trend: 'stable' as const,
            insights: [
              {
                id: `${c.id}-empty`,
                message: 'No active players on this team yet',
                tone: 'neutral' as const,
              },
            ],
            players: [],
            primaryMetric: c.primaryLabel,
            attentionCount: 0,
          })),
          teamHealth: 0,
          // No active players → no data analyzed. Empty (consumers guard on
          // truthy) rather than a fake "analyzed now" timestamp.
          lastAnalyzed: '',
        },
      };
    }

    const playerIds = members.map((m) => m.player_id);

    // Per-player trend window: every player's last `ROUNDS_PER_PLAYER` rounds.
    const ROUNDS_PER_PLAYER = 10;
    // Bound the scan to a recent window so a global fetch stays sane, while
    // still being wide enough that each player can reach their last 10 rounds.
    const trendSince = new Date();
    trendSince.setDate(trendSince.getDate() - 365);
    const trendSinceStr = trendSince.toISOString().split('T')[0];

    // 4. Fetch stats cache + player names + recent rounds in parallel
    const [statsResult, playersResult, roundsResult] = await Promise.all([
      supabase
        .from('golf_player_stats_cache')
        .select(
          'player_id, driving_accuracy_percentage, driving_distance_average, gir_percentage, approach_proximity_average, strokes_gained_approach, scrambling_percentage, strokes_gained_around_green, putts_per_round, three_putt_percentage, strokes_gained_putting, putt_make_pct_5_10ft, scoring_average, scoring_average_vs_par, par3_average, par4_average, par5_average, penalty_strokes_per_round',
        )
        .in('player_id', playerIds),
      supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url')
        .in('id', playerIds),
      // Per-player sampling: fetch every completed round in the window
      // (paginated past PostgREST's 1000-row cap), ordered most-recent-first,
      // then cap to the last 10 PER player. A single global
      // `.limit(playerIds.length * 10)` would let the most-active players
      // consume all slots, leaving less-active players with zero rounds and a
      // falsely "stable" trend (P448 / P2-17).
      fetchAllRowsResult<Record<string, unknown>>((from, to) => supabase
        .from('golf_rounds')
        .select(ROUND_STAT_COLUMNS.join(', '))
        .in('player_id', playerIds)
        .eq('status', 'completed')
        .gte('round_date', trendSinceStr)
        .order('round_date', { ascending: false })
        .order('id', { ascending: true })
        // Dynamic string select widens the row type; cast the final builder to
        // the helper's awaitable shape (same approach as the shot fetch above).
        .range(from, to) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>, undefined, { table: 'golf_rounds', action: 'getTeamCategoryInsights', feature: 'intelligence_dashboard', sport: 'golf' }),
    ]);

    if (statsResult.error) {
      return { success: false, error: 'Failed to load player stats' };
    }

    // Build lookup maps
    const statsByPlayer = new Map<string, Record<string, unknown>>();
    for (const row of statsResult.data ?? []) {
      statsByPlayer.set(row.player_id, row as Record<string, unknown>);
    }

    const playerInfoMap = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const p of playersResult.data ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown Player';
      playerInfoMap.set(p.id, { name, avatarUrl: p.avatar_url });
    }

    // Group rounds by player, ordered most-recent-first, capped per player so
    // every player contributes at most their last `ROUNDS_PER_PLAYER` rounds.
    const sampledRounds = samplePerPlayerRounds(
      (roundsResult.data ?? []) as unknown as Array<Record<string, unknown> & { player_id: unknown }>,
      ROUNDS_PER_PLAYER,
    );
    const roundsByPlayer = new Map<string, Record<string, unknown>[]>();
    for (const r of sampledRounds) {
      const pid = r.player_id as string;
      if (!roundsByPlayer.has(pid)) {
        roundsByPlayer.set(pid, []);
      }
      roundsByPlayer.get(pid)!.push(r);
    }

    // 5. Build each category
    const categories: TeamCategory[] = [];

    for (const catDef of CATEGORIES) {
      // Gather each player's primary metric value from stats cache
      const playerStats: PlayerCategoryStat[] = [];
      const values: number[] = [];

      for (const pid of playerIds) {
        const stats = statsByPlayer.get(pid);
        const info = playerInfoMap.get(pid);
        const rawVal = stats?.[catDef.primaryMetric] as number | null | undefined;

        if (rawVal == null || info == null) continue;

        const val = Number(rawVal);
        if (Number.isNaN(val)) continue;

        // Compute trend from recent rounds
        const playerRounds = roundsByPlayer.get(pid) ?? [];
        const metricValues = playerRounds
          .map((r) => roundMetricValue(r, catDef.id))
          .filter((v): v is number => v != null);

        const recentSlice = metricValues.slice(0, 5);
        const previousSlice = metricValues.slice(5, 10);
        const { trend, delta } = computeTrend(recentSlice, previousSlice, catDef.lowerIsBetter);

        values.push(val);
        playerStats.push({
          playerId: pid,
          playerName: info.name,
          avatarUrl: info.avatarUrl,
          value: val,
          trend,
          trendDelta: Math.round(delta * 100) / 100,
          needsAttention: false, // Set below after team avg is known
        });
      }

      // Calculate team average
      const teamAvg =
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

      // Flag players needing attention (> 1 stddev below avg)
      const sd = stddev(values);
      if (sd > 0) {
        for (const ps of playerStats) {
          if (catDef.lowerIsBetter) {
            // Higher is worse — attention if more than 1 stddev above avg
            ps.needsAttention = ps.value > teamAvg + sd;
          } else {
            // Lower is worse — attention if more than 1 stddev below avg
            ps.needsAttention = ps.value < teamAvg - sd;
          }
        }
      }

      // Sort players: best first
      playerStats.sort((a, b) =>
        catDef.lowerIsBetter ? a.value - b.value : b.value - a.value,
      );

      const attentionCount = playerStats.filter((p) => p.needsAttention).length;

      // Overall category trend
      const improvingCount = playerStats.filter((p) => p.trend === 'improving').length;
      const decliningCount = playerStats.filter((p) => p.trend === 'declining').length;
      const categoryTrend: 'improving' | 'stable' | 'declining' =
        improvingCount > decliningCount
          ? 'improving'
          : decliningCount > improvingCount
            ? 'declining'
            : 'stable';

      const insights = generateCategoryInsights(catDef, playerStats, teamAvg);

      // For short game, per-round trend data is unavailable (requires shot-level data).
      // Add an insight indicating the trend is based on aggregate stats only.
      if (catDef.id === 'short_game' && categoryTrend === 'stable' && playerStats.every((p) => p.trend === 'stable')) {
        insights.unshift({
          id: `${catDef.id}-trend-unavailable`,
          message: 'Short game trend based on aggregate scramble stats — per-round trend data unavailable',
          tone: 'neutral',
        });
      }

      categories.push({
        id: catDef.id,
        label: catDef.label,
        teamAvg: Math.round(teamAvg * 100) / 100,
        teamAvgLabel: values.length > 0 ? catDef.format(teamAvg) : 'No data',
        trend: categoryTrend,
        insights:
          insights.length > 0
            ? insights
            : [
                {
                  id: `${catDef.id}-nodata`,
                  message: `Not enough data to generate ${catDef.label.toLowerCase()} insights`,
                  tone: 'neutral',
                },
              ],
        players: playerStats,
        primaryMetric: catDef.primaryLabel,
        attentionCount,
      });
    }

    // 6. Team health score — only categories that actually have player data
    // count (empty = insufficient data, not a perfect score). See P2-17.
    const teamHealth = computeTeamHealth(categories);

    // Truthful freshness: the analysis is recomputed live every request, so the
    // honest "last analyzed" is bounded by the freshest INPUT — the most recent
    // completed round feeding it. Stamping `now()` (the old behavior) made the
    // Brief claim "updated now" while showing data that hadn't changed in days.
    // `round_date` is an ISO date; lexical max == chronological max. '' when no
    // rounds (consumers guard on truthy → render nothing rather than a fake time).
    const latestRoundDate = (roundsResult.data ?? []).reduce<string>((max, r) => {
      const d = typeof r.round_date === 'string' ? r.round_date : '';
      return d > max ? d : max;
    }, '');
    const lastAnalyzed = latestRoundDate ? new Date(latestRoundDate).toISOString() : '';

    return {
      success: true,
      data: {
        categories,
        teamHealth,
        lastAnalyzed,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logServerError(message, { action: 'getTeamCategoryInsights' }, 'error');
    return { success: false, error: message };
  }
}

const observedGetTeamCategoryInsights = withAdminObserved(
  'getTeamCategoryInsights',
  { sport: 'golf', feature: 'intelligence_dashboard' },
  getTeamCategoryInsightsImpl,
);

export async function getTeamCategoryInsights(
  teamIdArg?: string,
): Promise<TeamCategoryInsightsResult> {
  return observedGetTeamCategoryInsights(teamIdArg);
}
