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

  // Clear existing active insights for this coach/team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('baseball_coach_insights')
    .update({ status: 'dismissed' })
    .eq('coach_id', coachId)
    .eq('team_id', teamId)
    .eq('status', 'active');

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

  // Insert new insights
  if (insightsToCreate.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('baseball_coach_insights')
      .insert(insightsToCreate);
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
      insight_type: 'development_milestone',
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
      insight_type: 'development_milestone',
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
 * Analyze team-level patterns
 */
function analyzeTeam(
  playerCount: number,
  aggregates: BaseballPlayerAggregates[],
   
  _config: BaseballCoachPhilosophy // Reserved: will customize thresholds based on coach philosophy
): Partial<BaseballCoachInsight>[] {
  const insights: Partial<BaseballCoachInsight>[] = [];

  if (aggregates.length < 3) return insights;

  // Count declining players
  const declining = aggregates.filter(a => a.recent_trend === 'declining').length;
  const improving = aggregates.filter(a => a.recent_trend === 'improving').length;

  if (declining >= Math.ceil(playerCount * 0.4)) {
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

  if (improving >= Math.ceil(playerCount * 0.5)) {
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

  // Pressure performance analysis (team_health - mental game)
  const pressureStrugglers = aggregates.filter(a => a.pressure_gap != null && a.pressure_gap < -0.03);
  if (pressureStrugglers.length >= 3) {
    insights.push({
      insight_type: 'pressure_gap',
      priority: 'high',
      title: 'Multiple players struggling under pressure',
      description: `${pressureStrugglers.length} players have significantly lower game performance vs practice. Consider team-wide mental game focus.`,
      metadata: {
        category: 'team_health' as BaseballInsightCategory,
        count: pressureStrugglers.length,
      },
      recommended_action: 'Implement team mental training, pressure simulation in practice, possibly bring in sports psychologist.',
      status: 'active',
    });
  }

  return insights;
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

  // Ownership check: verify user owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id')
    .eq('id', insightId)
    .single();
  if (!insight || insight.coach_id !== user.id) {
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

  // Ownership check: verify user owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id')
    .eq('id', insightId)
    .single();
  if (!insight || insight.coach_id !== user.id) {
    return { success: false, error: 'Forbidden: You can only update your own insights' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('baseball_coach_insights')
    .update({ status: 'addressed' })
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

  // Ownership check: verify user owns this insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('coach_id, metadata')
    .eq('id', insightId)
    .single() as { data: { coach_id: string; metadata: Record<string, unknown> | null } | null };

  if (!insight || insight.coach_id !== user.id) {
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
