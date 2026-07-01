'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { 
  BaseballPlayerStats, 
  BaseballPlayerAggregates, 
  BaseballCoachInsight, 
  BaseballCoachPhilosophy,
  BaseballInsightCategory,
  BaseballInsightFeedback 
} from '@/lib/types';

// ============================================================================
// TYPES
// ============================================================================

export interface InsightGenerationResult {
  success: boolean;
  insightsGenerated?: number;
  insightsByCategory?: {
    performance: number;
    recruiting: number;
    team_health: number;
  };
  error?: string;
}

interface PlayerWithStats {
  playerId: string;
  playerName: string;
  stats: BaseballPlayerStats[];
  aggregates: BaseballPlayerAggregates | null;
}

// ============================================================================
// INSIGHT GENERATION ENGINE
// ============================================================================

/**
 * Generate insights for all players on a team
 */
export async function generateTeamInsights(
  teamId: string,
  coachId: string
): Promise<InsightGenerationResult> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated and is the coach
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }
  if (user.id !== coachId) {
    return { success: false, error: 'Forbidden: You can only generate insights for yourself' };
  }

  // Get coach philosophy (or use defaults)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: philosophy } = await (supabase as any)
    .from('baseball_coach_philosophy')
    .select('*')
    .eq('coach_id', coachId)
    .single() as { data: BaseballCoachPhilosophy | null };

  const config = philosophy || getDefaultPhilosophy();

  // Get team members with their stats
  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select(`
      player_id,
      baseball_players!inner (
        id,
        first_name,
        last_name
      )
    `)
    .eq('team_id', teamId);

  if (!teamMembers || teamMembers.length === 0) {
    return { success: true, insightsGenerated: 0 };
  }

  const playerIds = teamMembers.map(tm => tm.player_id);

  // Get stats for all players
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allStats } = await (supabase as any)
    .from('baseball_player_stats')
    .select('*')
    .eq('team_id', teamId)
    .in('player_id', playerIds)
    .order('session_date', { ascending: false }) as { data: BaseballPlayerStats[] | null };

  // Get aggregates for all players
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allAggregates } = await (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('team_id', teamId)
    .in('player_id', playerIds) as { data: BaseballPlayerAggregates[] | null };

  // Generate insights for each player
  const insightsToCreate: Partial<BaseballCoachInsight>[] = [];

  for (const member of teamMembers) {
    const player = member.baseball_players as { id: string; first_name: string | null; last_name: string | null };
    const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    const playerStats = (allStats || []).filter(s => s.player_id === player.id);
    const playerAggregates = (allAggregates || []).find(a => a.player_id === player.id) || null;

    const playerInsights = analyzePlayer({
      playerId: player.id,
      playerName,
      stats: playerStats,
      aggregates: playerAggregates,
    }, config);

    insightsToCreate.push(...playerInsights.map(insight => ({
      ...insight,
      team_id: teamId,
      coach_id: coachId,
    })));
  }

  // Also generate team-level insights
  const teamInsights = analyzeTeam(teamMembers.length, allAggregates || [], config);
  insightsToCreate.push(...teamInsights.map(insight => ({
    ...insight,
    team_id: teamId,
    coach_id: coachId,
    player_id: null,
  })));

  // Reconcile insights without destroying coach decisions. Fetch the coach's
  // existing rows for this team, then: refresh still-active insights in place,
  // SKIP anything the coach has dismissed/resolved (never resurface it), and
  // insert only genuinely new insight types. No delete-then-reinsert, and no
  // dependence on a partial/expression unique index that PostgREST can't match.
  if (insightsToCreate.length > 0) {
    const keyOf = (playerId: string | null | undefined, type: string | null | undefined) =>
      `${playerId ?? 'TEAM'}::${type ?? ''}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingRows } = (await (supabase as any)
      .from('baseball_coach_insights')
      .select('id, player_id, insight_type, status')
      .eq('team_id', teamId)
      .eq('coach_id', coachId)) as {
      data: Array<{ id: string; player_id: string | null; insight_type: string; status: string }> | null;
    };

    const existingByKey = new Map<string, { id: string; status: string }>();
    for (const row of existingRows ?? []) {
      existingByKey.set(keyOf(row.player_id, row.insight_type), { id: row.id, status: row.status });
    }

    const toInsert: Partial<BaseballCoachInsight>[] = [];
    const toUpdate: Array<Partial<BaseballCoachInsight> & { id: string }> = [];
    for (const insight of insightsToCreate) {
      const existing = existingByKey.get(keyOf(insight.player_id, insight.insight_type));
      if (!existing) {
        toInsert.push(insight);
      } else if (existing.status === 'active') {
        // Refresh body/priority of a still-active insight in place (update by PK).
        toUpdate.push({ ...insight, id: existing.id });
      }
      // else: coach dismissed/resolved this insight — respect it, do not recreate.
    }

    if (toInsert.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('baseball_coach_insights').insert(toInsert);
    }
    if (toUpdate.length > 0) {
      // Update-by-primary-key — the id PK always has a matching unique constraint.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('baseball_coach_insights').upsert(toUpdate, { onConflict: 'id' });
    }
  }

  revalidatePath('/baseball/dashboard/command-center');

  // Count insights by category
  const insightsByCategory = {
    performance: insightsToCreate.filter(i => i.metadata?.category === 'performance').length,
    recruiting: insightsToCreate.filter(i => i.metadata?.category === 'recruiting').length,
    team_health: insightsToCreate.filter(i => i.metadata?.category === 'team_health').length,
  };

  return {
    success: true,
    insightsGenerated: insightsToCreate.length,
    insightsByCategory,
  };
}

/**
 * Analyze a single player and generate insights
 */
function analyzePlayer(
  player: PlayerWithStats,
  config: BaseballCoachPhilosophy
): Partial<BaseballCoachInsight>[] {
  const insights: Partial<BaseballCoachInsight>[] = [];
  const { playerId, playerName, stats, aggregates } = player;

  if (stats.length < 3) {
    // Not enough data
    return insights;
  }

  // 1. Declining Performance Alert
  if (aggregates?.recent_trend === 'declining' &&
      aggregates.trend_magnitude &&
      aggregates.trend_magnitude >= config.decline_threshold / 100) {
    insights.push({
      player_id: playerId,
      insight_type: 'performance_decline',
      priority: aggregates.trend_magnitude >= 0.05 ? 'high' : 'medium',
      title: `${playerName} showing declining trend`,
      description: `Performance has dropped ${(aggregates.trend_magnitude * 100).toFixed(1)}% over recent sessions. Current average is ${aggregates.career_avg?.toFixed(3) || 'N/A'}.`,
      metadata: {
        category: 'performance' as BaseballInsightCategory,
        trend_magnitude: aggregates.trend_magnitude,
        last_5_avg: aggregates.last_5_avg,
        last_10_avg: aggregates.last_10_avg,
      },
      recommended_action: 'Review recent at-bats, check for mechanical changes, and consider one-on-one session.',
      status: 'active',
    });
  }

  // 2. Improving Performance Recognition
  if (aggregates?.recent_trend === 'improving' &&
      aggregates.trend_magnitude &&
      aggregates.trend_magnitude >= 0.02) {
    insights.push({
      player_id: playerId,
      insight_type: 'performance_surge',
      priority: 'low',
      title: `${playerName} on an upward trend`,
      description: `Performance improving by ${(aggregates.trend_magnitude * 100).toFixed(1)}% over recent sessions. Keep momentum going!`,
      metadata: {
        category: 'performance' as BaseballInsightCategory,
        trend_magnitude: aggregates.trend_magnitude,
        current_avg: aggregates.career_avg,
      },
      recommended_action: 'Acknowledge progress, maintain current approach, consider increased responsibility.',
      status: 'active',
    });
  }

  // 3. Pressure Performance Gap (categorized as team_health - mental game)
  if (aggregates?.pressure_gap != null &&
      Math.abs(aggregates.pressure_gap) >= config.pressure_gap_threshold / 100) {
    const isStrugglingUnderPressure = aggregates.pressure_gap < 0;

    if (isStrugglingUnderPressure) {
      insights.push({
        player_id: playerId,
        insight_type: 'pressure_gap',
        priority: Math.abs(aggregates.pressure_gap) >= 0.05 ? 'high' : 'medium',
        title: `${playerName} struggles in game situations`,
        description: `Game average (${aggregates.game_avg?.toFixed(3) || 'N/A'}) is ${Math.abs(aggregates.pressure_gap * 1000).toFixed(0)} points below practice average (${aggregates.practice_avg?.toFixed(3) || 'N/A'}).`,
        metadata: {
          category: 'team_health' as BaseballInsightCategory,
          game_avg: aggregates.game_avg,
          practice_avg: aggregates.practice_avg,
          gap: aggregates.pressure_gap,
        },
        recommended_action: 'Implement pressure-simulation drills, mental game coaching, and gradual exposure to high-pressure situations.',
        status: 'active',
      });
    } else {
      insights.push({
        player_id: playerId,
        insight_type: 'breakout_candidate',
        priority: 'low',
        title: `${playerName} is clutch under pressure`,
        description: `Game average exceeds practice by ${(aggregates.pressure_gap * 1000).toFixed(0)} points. Consider for high-leverage situations.`,
        metadata: {
          category: 'performance' as BaseballInsightCategory,
          game_avg: aggregates.game_avg,
          practice_avg: aggregates.practice_avg,
          gap: aggregates.pressure_gap,
        },
        recommended_action: 'Utilize in clutch situations, consider leadership role, share approach with teammates.',
        status: 'active',
      });
    }
  }

  // 4. Milestone Recognition
  const totalAB = stats.reduce((sum, s) => sum + (s.at_bats || 0), 0);
  const totalHits = stats.reduce((sum, s) => sum + (s.hits || 0), 0);
  const totalHR = stats.reduce((sum, s) => sum + (s.home_runs || 0), 0);

  if (totalHits >= 50 && totalHits % 25 === 0) {
    insights.push({
      player_id: playerId,
      // Distinct from the HR milestone so both survive reconciliation, which
      // keys insights by `${playerId}::${insight_type}`. A player crossing both
      // a hit and an HR milestone in one run now persists two independent rows.
      insight_type: 'milestone_hits',
      priority: 'low',
      title: `${playerName} reached ${totalHits} hits!`,
      description: `Career milestone: ${totalHits} hits in ${aggregates?.total_sessions || 0} sessions.`,
      metadata: {
        category: 'performance' as BaseballInsightCategory,
        total_hits: totalHits,
        total_ab: totalAB,
      },
      status: 'active',
    });
  }

  if (totalHR >= 10 && totalHR % 5 === 0) {
    insights.push({
      player_id: playerId,
      // Distinct from the hits milestone (see above) so the HR milestone is
      // reconciled and refreshed independently rather than overwriting it.
      insight_type: 'milestone_hr',
      priority: 'low',
      title: `${playerName} hit ${totalHR} home runs!`,
      description: `Power milestone achieved.`,
      metadata: {
        category: 'performance' as BaseballInsightCategory,
        total_hr: totalHR,
      },
      status: 'active',
    });
  }

  // 5. Exit Velocity Analysis (recruiting potential indicator)
  if (aggregates?.avg_exit_velocity && aggregates.max_exit_velocity) {
    const evGap = aggregates.max_exit_velocity - aggregates.avg_exit_velocity;

    if (evGap >= 8) {
      insights.push({
        player_id: playerId,
        insight_type: 'position_opportunity',
        priority: 'medium',
        title: `${playerName} has untapped power potential`,
        description: `Max exit velocity (${aggregates.max_exit_velocity.toFixed(1)} mph) is ${evGap.toFixed(1)} mph above average (${aggregates.avg_exit_velocity.toFixed(1)} mph). Room to improve consistency.`,
        metadata: {
          category: 'recruiting' as BaseballInsightCategory,
          avg_ev: aggregates.avg_exit_velocity,
          max_ev: aggregates.max_exit_velocity,
          gap: evGap,
        },
        recommended_action: 'Focus on barrel consistency drills, swing plane optimization.',
        status: 'active',
      });
    }
  }

  return insights;
}

/**
 * Derive per-insight thresholds from the coach's philosophy config so different
 * coaching styles produce different signal sets — a high-sensitivity coach sees
 * earlier warnings; a low-sensitivity coach needs a stronger signal to fire.
 *
 * Philosophy influences:
 *   alert_sensitivity  → scales the fraction of the roster that must be declining
 *                        before a team-wide alert fires, and the minimum count of
 *                        pressure-strugglers before the mental-game signal fires.
 *   decline_threshold  → the absolute per-player decline magnitude (%) that the
 *                        pressure-gap is measured against at team level.
 *   pressure_gap_threshold → the gap magnitude (%) used to identify individual
 *                        pressure-strugglers when counting for the team signal.
 *   priority_mental_game (optional) → when ≥ 3 (coaches who prioritize mental
 *                        game), the pressure-struggler count threshold is lowered.
 */
function deriveTeamThresholds(config: BaseballCoachPhilosophy): {
  /** Fraction of roster (0..1) that must be declining to fire the team alert. */
  decliningFraction: number;
  /** Fraction of roster (0..1) that must be improving to fire the team surge. */
  improvingFraction: number;
  /** Absolute pressure gap (decimal) to count someone as a pressure-struggler. */
  pressureGapCutoff: number;
  /** Minimum count of pressure-strugglers to fire the team mental-game alert. */
  pressureStrugglerMinCount: number;
} {
  const sensitivity = config.alert_sensitivity ?? 'balanced';

  // Base fractions vary by alert sensitivity so coaches get what they asked for.
  const decliningFraction =
    sensitivity === 'aggressive' ? 0.3 : sensitivity === 'conservative' ? 0.5 : 0.4;
  const improvingFraction =
    sensitivity === 'aggressive' ? 0.4 : sensitivity === 'conservative' ? 0.6 : 0.5;

  // Pressure gap cutoff: use coach's threshold, convert from % to decimal.
  // Clamp to a reasonable [0.005, 0.10] range.
  const rawGap = (config.pressure_gap_threshold ?? 2.0) / 100;
  const pressureGapCutoff = Math.max(0.005, Math.min(0.10, rawGap));

  // Pressure-struggler count threshold is lowered when the coach has explicitly
  // prioritized the mental game (priority_mental_game ≤ 2 means it is a top-2
  // priority; we use that as a proxy for "raise sensitivity to this signal").
  const mentalPriority = config.priority_mental_game ?? 5;
  const pressureStrugglerMinCount =
    sensitivity === 'aggressive' || mentalPriority <= 2 ? 2 : 3;

  return {
    decliningFraction,
    improvingFraction,
    pressureGapCutoff,
    pressureStrugglerMinCount,
  };
}

/**
 * Analyze team-level patterns. Philosophy weights are now THREADED into the
 * thresholds via deriveTeamThresholds() so the coach's alert_sensitivity,
 * pressure_gap_threshold, and mental-game priority actually change which signals
 * fire, rather than being silently ignored.
 */
function analyzeTeam(
  playerCount: number,
  aggregates: BaseballPlayerAggregates[],
  config: BaseballCoachPhilosophy,
): Partial<BaseballCoachInsight>[] {
  const insights: Partial<BaseballCoachInsight>[] = [];

  if (aggregates.length < 3) return insights;

  const {
    decliningFraction,
    improvingFraction,
    pressureGapCutoff,
    pressureStrugglerMinCount,
  } = deriveTeamThresholds(config);

  // Count declining players.
  const declining = aggregates.filter(a => a.recent_trend === 'declining').length;
  const improving = aggregates.filter(a => a.recent_trend === 'improving').length;

  if (declining >= Math.ceil(playerCount * decliningFraction)) {
    insights.push({
      insight_type: 'comparison_alert',
      priority: 'critical',
      title: 'Team-wide performance decline detected',
      description: `${declining} of ${playerCount} players showing declining trends. May indicate systemic issue.`,
      metadata: {
        category: 'team_health' as BaseballInsightCategory,
        declining,
        improving,
        total: playerCount,
      },
      recommended_action: 'Review recent practice approach, check for fatigue, assess if external factors are affecting team.',
      status: 'active',
    });
  }

  if (improving >= Math.ceil(playerCount * improvingFraction)) {
    insights.push({
      insight_type: 'performance_surge',
      priority: 'low',
      title: 'Team momentum building',
      description: `${improving} of ${playerCount} players showing improvement. Positive trajectory!`,
      metadata: {
        category: 'team_health' as BaseballInsightCategory,
        declining,
        improving,
        total: playerCount,
      },
      recommended_action: 'Maintain current approach, celebrate progress, keep building confidence.',
      status: 'active',
    });
  }

  // Pressure performance analysis (team_health — mental game).
  // The cutoff for what counts as a "pressure-struggler" comes from the coach's
  // configured pressure_gap_threshold so a conservative coach doesn't fire on
  // small gaps and an aggressive coach catches smaller discrepancies.
  const pressureStrugglers = aggregates.filter(
    a => a.pressure_gap != null && a.pressure_gap < -pressureGapCutoff,
  );
  if (pressureStrugglers.length >= pressureStrugglerMinCount) {
    insights.push({
      insight_type: 'pressure_gap',
      priority: 'high',
      title: 'Multiple players struggling under pressure',
      description: `${pressureStrugglers.length} players have significantly lower game performance vs practice. Consider team-wide mental game focus.`,
      metadata: {
        category: 'team_health' as BaseballInsightCategory,
        count: pressureStrugglers.length,
        pressure_gap_threshold_used: pressureGapCutoff,
      },
      recommended_action: 'Implement team mental training, pressure simulation in practice, possibly bring in sports psychologist.',
      status: 'active',
    });
  }

  return insights;
}

/**
 * Resolve the caller's `baseball_coaches.id` from their auth user id.
 *
 * `baseball_coach_insights.coach_id` is a `baseball_coaches.id`, NOT the auth
 * uid — the same distinction the player-profile page makes when it scopes
 * insights with `coach.id` (src/app/baseball/(dashboard)/dashboard/players/[id]/page.tsx).
 * Comparing an insight's `coach_id` directly against `supabase.auth.getUser().id`
 * compares two different id domains and rejects every real coach. Returns
 * null when the user has no coach row.
 */
export async function resolveCallerCoachId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', userId)
    .single();
  return (coach as { id: string } | null)?.id ?? null;
}

/**
 * Get default philosophy settings
 */
function getDefaultPhilosophy(): BaseballCoachPhilosophy {
  return {
    id: '',
    coach_id: '',
    alert_sensitivity: 'balanced',
    decline_threshold: 3.0,
    pressure_gap_threshold: 2.0,
    bubble_zone_range: 1.5,
    priority_hitting: 1,
    priority_power: 2,
    priority_plate_discipline: 3,
    priority_speed: 4,
    priority_defense: 5,
    created_at: '',
    updated_at: '',
  };
}

/**
 * Dismiss an insight
 */
export async function dismissInsight(insightId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the caller's baseball_coaches.id — coach_id on the insight is
  // NEVER the auth uid.
  const callerCoachId = await resolveCallerCoachId(supabase, user.id);
  if (!callerCoachId) {
    return { success: false, error: 'Forbidden: You can only dismiss your own insights' };
  }

  // Ownership check: verify caller's coach row owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id')
    .eq('id', insightId)
    .single();
  if (!insight || insight.coach_id !== callerCoachId) {
    return { success: false, error: 'Forbidden: You can only dismiss your own insights' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ status: 'dismissed' })
    .eq('id', insightId);

  if (error) {
    return { success: false, error: 'Failed to dismiss insight' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

/**
 * Mark an insight as addressed
 */
export async function markInsightAddressed(insightId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the caller's baseball_coaches.id — coach_id on the insight is
  // NEVER the auth uid.
  const callerCoachId = await resolveCallerCoachId(supabase, user.id);
  if (!callerCoachId) {
    return { success: false, error: 'Forbidden: You can only update your own insights' };
  }

  // Ownership check: verify caller's coach row owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id')
    .eq('id', insightId)
    .single();
  if (!insight || insight.coach_id !== callerCoachId) {
    return { success: false, error: 'Forbidden: You can only update your own insights' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ status: 'resolved' })
    .eq('id', insightId);

  if (error) {
    return { success: false, error: 'Failed to update insight' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

/**
 * Submit feedback on an insight (helpful/not helpful)
 */
export async function submitInsightFeedback(
  insightId: string,
  feedback: BaseballInsightFeedback
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Resolve the caller's baseball_coaches.id — coach_id on the insight is
  // NEVER the auth uid.
  const callerCoachId = await resolveCallerCoachId(supabase, user.id);
  if (!callerCoachId) {
    return { success: false, error: 'Forbidden: You can only provide feedback on your own insights' };
  }

  // Ownership check: verify caller's coach row owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id, metadata')
    .eq('id', insightId)
    .single() as { data: { coach_id: string; metadata: Record<string, unknown> | null } | null };

  if (!insight || insight.coach_id !== callerCoachId) {
    return { success: false, error: 'Forbidden: You can only provide feedback on your own insights' };
  }

  // Update metadata with feedback
  const updatedMetadata = {
    ...(insight.metadata || {}),
    feedback,
    feedbackAt: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ metadata: updatedMetadata })
    .eq('id', insightId);

  if (error) {
    return { success: false, error: 'Failed to submit feedback' };
  }

  revalidatePath('/baseball/dashboard/command-center');
  return { success: true };
}

/**
 * Get insights for a team (for fetching in command center)
 */
export async function getTeamInsights(teamId: string): Promise<{
  success: boolean;
  insights?: BaseballCoachInsight[];
  error?: string;
}> {
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insights, error } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('*')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false }) as { data: BaseballCoachInsight[] | null; error: Error | null };

  if (error) {
    return { success: false, error: 'Failed to fetch insights' };
  }

  return { success: true, insights: insights || [] };
}
