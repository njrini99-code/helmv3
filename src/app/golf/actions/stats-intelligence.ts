'use server';

/**
 * Stats-page CoachHelm intelligence — the thin-read layer that lets the Stats
 * surfaces show engine-derived category ratings + evidence-backed insights
 * without re-running `analyzePlayer` on every page load. The engine is run by
 * round-submit triggers, safety-net cron, roster-sweep cron, and the manual
 * refresh button on the coach's player-detail page — this action just reads
 * what those have already produced.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { normalizePlayerMetrics } from '@/lib/coachhelm/v2/stats';
import { getInsightsForPlayer } from '@/app/golf/actions/insight-delivery';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { logServerError } from '@/lib/server-error-logger';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CategoryRatings {
  teeGame: number;
  approach: number;
  shortGame: number;
  putting: number;
  scoring: number;
  overall: number;
}

export interface TrendSignal {
  direction: 'improving' | 'stable' | 'declining';
  deltaStrokes: number;
  sampleRecent: number;
  samplePrior: number;
}

export interface PlayerStatsIntelligence {
  playerId: string;
  categories: CategoryRatings | null;
  composite: number | null;
  /** Number of teammates (including self) with stats-cache rows that fed the
   *  normalization. < 3 = z-score too unstable; UI should warn. */
  sampleSize: number;
  trend: TrendSignal | null;
  insights: EvidenceInsight[];
}

export interface TeamStatsIntelligence {
  teamId: string;
  players: Array<{
    playerId: string;
    categories: CategoryRatings | null;
    composite: number | null;
    topInsight: EvidenceInsight | null;
    insightCount: number;
  }>;
  sampleSize: number;
}

// ---------------------------------------------------------------------------
// Shared metric mapping — mirrors getTeamOverview() in team-category-insights.
// Keep in sync; drift means player stats strip and coach team view would
// disagree on category ratings.
// ---------------------------------------------------------------------------

const STATS_METRIC_MAP: Record<string, string> = {
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

/** Inlined select string — Supabase's typed builder loses column inference
 *  with template-string `select()` calls, so we keep this explicit. Must
 *  stay in sync with STATS_METRIC_MAP above. */
const STATS_SELECT =
  'player_id, driving_distance_average, driving_accuracy_percentage, gir_percentage, strokes_gained_approach, approach_proximity_average, scrambling_percentage, strokes_gained_around_green, strokes_gained_putting, putts_per_round, three_putt_percentage, scoring_average_vs_par';

const LOWER_IS_BETTER = new Set([
  'puttsPerRound',
  'threePuttAvoidance',
  'scoringAvg',
  'proximityToHole',
]);

function buildPlayerMetrics(row: Record<string, unknown>) {
  const metrics: Record<string, number> = {};
  for (const [metricKey, dbCol] of Object.entries(STATS_METRIC_MAP)) {
    const raw = Number(row[dbCol] ?? 0);
    metrics[metricKey] = LOWER_IS_BETTER.has(metricKey) ? -raw : raw;
  }
  return metrics;
}

// ---------------------------------------------------------------------------
// Trend computation — last 5 rounds vs prior 5 rounds, scoring-to-par delta.
// Uses the same lightweight signal the player-detail page uses; kept local
// so the Stats page doesn't depend on the coach-scoped insights action.
// ---------------------------------------------------------------------------

async function computeTrendForPlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<TrendSignal | null> {
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select('score_to_par, round_date')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .not('score_to_par', 'is', null)
    .order('round_date', { ascending: false })
    .limit(10);

  const scored = (rounds ?? [])
    .map((r) => (r.score_to_par == null ? null : Number(r.score_to_par)))
    .filter((v): v is number => v != null);
  if (scored.length < 4) return null;

  const half = Math.floor(scored.length / 2);
  const recent = scored.slice(0, half);
  const prior = scored.slice(half);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const delta = priorAvg - recentAvg;

  const direction: TrendSignal['direction'] =
    delta > 1.2 ? 'improving' : delta < -1.2 ? 'declining' : 'stable';

  return {
    direction,
    deltaStrokes: Math.round(delta * 10) / 10,
    sampleRecent: recent.length,
    samplePrior: prior.length,
  };
}

// ---------------------------------------------------------------------------
// Authorization — either the player viewing their own stats or a coach of
// the player's team.
// ---------------------------------------------------------------------------

async function authorizePlayerAccess(
  playerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getGolfSessionProfile();
  if (!session) return { ok: false, error: 'Unauthorized' };
  const supabase = await createClient();

  // Player viewing own stats
  if (session.player?.id === playerId) return { ok: true };

  // Coach of a team that contains this player
  if (session.coach?.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', session.coach.organization_id)
      .maybeSingle();
    if (team?.id) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', team.id)
        .eq('player_id', playerId)
        .maybeSingle();
      if (membership) return { ok: true };
    }
  }

  return { ok: false, error: 'Not authorized for this player' };
}

// ---------------------------------------------------------------------------
// Resolve the player's team — needed to pull teammate stats rows so
// normalizePlayerMetrics has a population to z-score against.
// ---------------------------------------------------------------------------

async function resolveTeamForPlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return data?.team_id ?? null;
}

// ---------------------------------------------------------------------------
// Player stats intelligence
// ---------------------------------------------------------------------------

export async function getPlayerStatsIntelligence(
  playerId: string,
): Promise<{ success: boolean; data?: PlayerStatsIntelligence; error?: string }> {
  try {
    const auth = await authorizePlayerAccess(playerId);
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = await createClient();

    // RLS on golf_player_stats_cache only lets a player read their OWN row.
    // For z-score normalization we need the full team population (teammates'
    // values) to produce non-degenerate variance — otherwise all categories
    // collapse to 50. Use the admin client for the team-stats fetch only;
    // we never return per-teammate values, only the requesting player's
    // normalized z-scores + categories.
    const admin = createAdminClient();

    const teamId = await resolveTeamForPlayer(supabase, playerId);
    let rosterIds: string[] = [playerId];
    if (teamId) {
      const { data: members } = await admin
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId)
        .eq('status', 'active');
      const pulled = (members ?? [])
        .map((m) => m.player_id)
        .filter((id): id is string => typeof id === 'string');
      if (pulled.length > 0) rosterIds = pulled;
    }

    const { data: statsRows } = await admin
      .from('golf_player_stats_cache')
      .select(STATS_SELECT)
      .in('player_id', rosterIds);

    const statsList = (statsRows ?? []) as Array<Record<string, unknown>>;
    const playerMetrics = statsList.map((row) => ({
      playerId: String(row.player_id),
      metrics: buildPlayerMetrics(row),
    }));

    let categories: CategoryRatings | null = null;
    let composite: number | null = null;

    if (playerMetrics.length > 0) {
      const normalized = normalizePlayerMetrics(
        playerMetrics,
        Object.keys(STATS_METRIC_MAP),
      );
      const me = normalized.find((p) => p.playerId === playerId);
      if (me) {
        categories = {
          teeGame: Math.round(me.categories.teeGame),
          approach: Math.round(me.categories.approach),
          shortGame: Math.round(me.categories.shortGame),
          putting: Math.round(me.categories.putting),
          scoring: Math.round(me.categories.scoring),
          overall: Math.round(me.categories.overall),
        };
        composite = me.composite == null ? null : Math.round(me.composite);
      }
    }

    const [trend, insights] = await Promise.all([
      computeTrendForPlayer(supabase, playerId),
      getInsightsForPlayer(playerId, { limit: 3 }),
    ]);

    return {
      success: true,
      data: {
        playerId,
        categories,
        composite,
        sampleSize: playerMetrics.length,
        trend,
        insights,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logServerError(message, { action: 'getPlayerStatsIntelligence' }, 'error');
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Team stats intelligence — one row per active roster player.
// ---------------------------------------------------------------------------

export async function getTeamStatsIntelligence(
  teamIdArg?: string,
): Promise<{ success: boolean; data?: TeamStatsIntelligence; error?: string }> {
  try {
    const session = await getGolfSessionProfile();
    if (!session?.coach) return { success: false, error: 'Unauthorized' };
    const supabase = await createClient();

    let teamId: string | null = teamIdArg ?? null;
    if (!teamId && session.coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', session.coach.organization_id)
        .maybeSingle();
      teamId = team?.id ?? null;
    }
    if (!teamId) return { success: false, error: 'No team found for coach' };

    const { data: members } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (members ?? [])
      .map((m) => m.player_id)
      .filter((id): id is string => typeof id === 'string');
    if (playerIds.length === 0) {
      return { success: true, data: { teamId, players: [], sampleSize: 0 } };
    }

    const { data: statsRows } = await supabase
      .from('golf_player_stats_cache')
      .select(STATS_SELECT)
      .in('player_id', playerIds);

    const statsList = (statsRows ?? []) as Array<Record<string, unknown>>;
    const playerMetrics = statsList.map((row) => ({
      playerId: String(row.player_id),
      metrics: buildPlayerMetrics(row),
    }));

    const normalized = playerMetrics.length > 0
      ? normalizePlayerMetrics(playerMetrics, Object.keys(STATS_METRIC_MAP))
      : [];
    const byPlayer = new Map<string, (typeof normalized)[number]>();
    for (const n of normalized) byPlayer.set(n.playerId, n);

    // Pull top insight per player from the feed (evidence-backed, non-archived).
    // Done in parallel to keep coach-view roster fast.
    const insightPairs = await Promise.all(
      playerIds.map(async (pid) => {
        const rows = await getInsightsForPlayer(pid, { limit: 1 });
        return [pid, rows] as const;
      }),
    );
    const insightMap = new Map<string, EvidenceInsight[]>(insightPairs);

    const players = playerIds.map((pid) => {
      const n = byPlayer.get(pid);
      const categories = n
        ? {
            teeGame: Math.round(n.categories.teeGame),
            approach: Math.round(n.categories.approach),
            shortGame: Math.round(n.categories.shortGame),
            putting: Math.round(n.categories.putting),
            scoring: Math.round(n.categories.scoring),
            overall: Math.round(n.categories.overall),
          }
        : null;
      const rows = insightMap.get(pid) ?? [];
      return {
        playerId: pid,
        categories,
        composite: n?.composite == null ? null : Math.round(n.composite),
        topInsight: rows[0] ?? null,
        insightCount: rows.length,
      };
    });

    return {
      success: true,
      data: { teamId, players, sampleSize: playerMetrics.length },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logServerError(message, { action: 'getTeamStatsIntelligence' }, 'error');
    return { success: false, error: message };
  }
}
