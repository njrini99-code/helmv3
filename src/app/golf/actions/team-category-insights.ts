'use server';

import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';

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
      const holes = (round.holes_played as number | null) ?? 18;
      return holes > 0 ? (scoreToPar / holes) * 18 : null;
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

export async function getTeamCategoryInsights(): Promise<TeamCategoryInsightsResult> {
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

    // 2. Get team via organization_id
    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1)
      .single();

    if (teamError || !team) {
      return { success: false, error: 'Team not found' };
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
          lastAnalyzed: new Date().toISOString(),
        },
      };
    }

    const playerIds = members.map((m) => m.player_id);

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
      supabase
        .from('golf_rounds')
        .select(ROUND_STAT_COLUMNS.join(', '))
        .in('player_id', playerIds)
        .eq('status', 'completed')
        .order('round_date', { ascending: false })
        .limit(playerIds.length * 10), // Up to 10 rounds per player
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

    // Group rounds by player, ordered most-recent-first
    const roundsByPlayer = new Map<string, Record<string, unknown>[]>();
    for (const r of ((roundsResult.data ?? []) as unknown as Record<string, unknown>[])) {
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

    // 6. Team health score
    const healthScores = categories.map((c) =>
      c.players.length > 0 ? 1 - c.attentionCount / c.players.length : 1,
    );
    const teamHealth =
      healthScores.length > 0
        ? Math.round(
            (healthScores.reduce((a, b) => a + b, 0) / healthScores.length) * 100,
          )
        : 0;

    return {
      success: true,
      data: {
        categories,
        teamHealth,
        lastAnalyzed: new Date().toISOString(),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
