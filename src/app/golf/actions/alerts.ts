'use server';

// ============================================================================
// COACH ALERT CENTER - SERVER ACTIONS
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { coachHelmIntelligence } from '@/lib/coachhelm/v2';
import type { CoachAlert } from '@/components/golf/coachhelm/alerts/AlertCard';

// ============================================================================
// GET COACH ALERTS
// ============================================================================

export async function getCoachAlerts(
  coachId: string,
  _teamId: string,  // Reserved for future use
  options?: {
    includeAcknowledged?: boolean;
    limit?: number;
  }
): Promise<{
  success: boolean;
  alerts?: CoachAlert[];
  error?: string;
}> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized to view these alerts' };
  }

  try {
    // Build query
    let query = supabase
      .from('golf_coach_insights')
      .select(`
        id,
        player_id,
        insight_type,
        title,
        content,
        priority,
        status,
        acknowledged_at,
        dismissed,
        created_at,
        metadata,
        player:golf_players(id, first_name, last_name, avatar_url)
      `)
      .eq('coach_id', coachId)
      .eq('dismissed', false)
      .order('created_at', { ascending: false });

    // Filter acknowledged if not including them
    if (!options?.includeAcknowledged) {
      query = query.is('acknowledged_at', null);
    }

    // Apply limit
    if (options?.limit) {
      query = query.limit(options.limit);
    } else {
      query = query.limit(20); // Default limit
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching alerts:', error);
      return { success: false, error: 'Failed to fetch alerts' };
    }

    // Transform to CoachAlert format
    const alerts: CoachAlert[] = (data || []).map((insight) => {
      // Cast needed: Supabase join returns player as unknown object type, not typed relation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const player = insight.player as any;
      const playerName = player
        ? `${player.first_name || ''} ${player.last_name || ''}`.trim()
        : 'Unknown Player';

      return {
        id: insight.id,
        playerId: insight.player_id || '',
        playerName,
        playerAvatarUrl: player?.avatar_url || null,
        level: mapPriorityToLevel(insight.priority),
        title: insight.title,
        message: insight.content || insight.title,
        callToAction: (insight.metadata as Record<string, string>)?.callToAction,
        createdAt: insight.created_at || new Date().toISOString(),
        acknowledgedAt: insight.acknowledged_at,
        insightType: insight.insight_type,
        metadata: insight.metadata as Record<string, unknown>,
      };
    });

    return { success: true, alerts };
  } catch (error) {
    console.error('Unexpected error fetching alerts:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET ALERT COUNTS
// ============================================================================

export async function getAlertCounts(
  coachId: string
): Promise<{
  success: boolean;
  counts?: { critical: number; warning: number; info: number; total: number };
  error?: string;
}> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized' };
  }

  try {
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .select('priority')
      .eq('coach_id', coachId)
      .eq('dismissed', false)
      .eq('status', 'active');

    if (error) {
      return { success: false, error: 'Failed to fetch alert counts' };
    }

    const counts = {
      critical: 0,
      warning: 0,
      info: 0,
      total: data?.length || 0,
    };

    (data || []).forEach((insight) => {
      if (insight.priority === 'critical' || insight.priority === 'high') {
        counts.critical++;
      } else if (insight.priority === 'medium' || insight.priority === 'warning') {
        counts.warning++;
      } else {
        counts.info++;
      }
    });

    return { success: true, counts };
  } catch (error) {
    console.error('Unexpected error getting alert counts:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// DISMISS ALERT
// ============================================================================

export async function dismissAlert(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user owns the alert
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check that alert belongs to a coach owned by this user
  const { data: alert } = await supabase
    .from('golf_coach_insights')
    .select('id, coach_id, coach:golf_coaches!inner(user_id)')
    .eq('id', alertId)
    .single();

  if (!alert || (alert.coach as { user_id: string })?.user_id !== user.id) {
    return { success: false, error: 'Not authorized to dismiss this alert' };
  }

  try {
    const { error } = await supabase
      .from('golf_coach_insights')
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        status: 'dismissed',
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error dismissing alert:', error);
      return { success: false, error: 'Failed to dismiss alert' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/alerts');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error dismissing alert:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// ACKNOWLEDGE ALERT (Mark as read but keep visible)
// ============================================================================

export async function acknowledgeAlert(
  alertId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user owns the alert
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Check that alert belongs to a coach owned by this user
  const { data: alert } = await supabase
    .from('golf_coach_insights')
    .select('id, coach_id, coach:golf_coaches!inner(user_id)')
    .eq('id', alertId)
    .single();

  if (!alert || (alert.coach as { user_id: string })?.user_id !== user.id) {
    return { success: false, error: 'Not authorized to acknowledge this alert' };
  }

  try {
    const { error } = await supabase
      .from('golf_coach_insights')
      .update({
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error acknowledging alert:', error);
      return { success: false, error: 'Failed to acknowledge alert' };
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error acknowledging alert:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE ALERTS (Scan team and create new alerts)
// ============================================================================

export async function generateAlerts(
  coachId: string,
  teamId: string
): Promise<{
  success: boolean;
  alerts?: CoachAlert[];
  generated?: number;
  error?: string;
}> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized to generate alerts for this coach' };
  }

  try {
    // Get active players on the team
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map((m) => m.player_id);

    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .in('id', playerIds);

    if (!players || players.length === 0) {
      return { success: true, alerts: [], generated: 0 };
    }

    // Analyze each player in parallel
    const analysisPromises = players.map(async (player) => {
      try {
        const analysis = await coachHelmIntelligence.analyzePlayer(player.id, {
          includePatterns: true,
          includePredictions: true,
          depth: 'standard',
        });

        return {
          player,
          analysis,
          success: true,
        };
      } catch (error) {
        console.error(`Error analyzing player ${player.id}:`, error);
        return { player, analysis: null, success: false };
      }
    });

    const results = await Promise.all(analysisPromises);

    // Generate alerts from analysis results
    const newAlerts: Array<{
      coach_id: string;
      player_id: string;
      team_id: string;
      insight_type: string;
      title: string;
      content: string;
      priority: string;
      status: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const result of results) {
      if (!result.success || !result.analysis) continue;

      const { player, analysis } = result;
      const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();

      // Check alert level from analysis
      if (analysis.alertLevel === 'critical' || analysis.alertLevel === 'warning') {
        const primaryInsight = analysis.primaryInsight;

        newAlerts.push({
          coach_id: coachId,
          player_id: player.id,
          team_id: teamId,
          insight_type: 'performance_alert',
          title: primaryInsight.headline || `${playerName} needs attention`,
          content: primaryInsight.body || 'Performance analysis detected an issue.',
          priority: analysis.alertLevel === 'critical' ? 'high' : 'medium',
          status: 'active',
          metadata: {
            callToAction: primaryInsight.callToAction,
            tone: primaryInsight.tone,
            confidence: primaryInsight.confidence,
            patterns: analysis.patterns.slice(0, 3).map((p) => ({
              id: p.id,
              description: p.description,
              strokeImpact: p.strokeImpact,
            })),
            recommendations: analysis.recommendations.slice(0, 3),
          },
        });
      }

      // Add alerts for concerning patterns
      const concerningPatterns = analysis.patterns.filter(
        (p) => p.strokeImpact > 1.5 && p.confidence > 0.7
      );

      for (const pattern of concerningPatterns.slice(0, 2)) {
        newAlerts.push({
          coach_id: coachId,
          player_id: player.id,
          team_id: teamId,
          insight_type: 'pattern_detected',
          title: `Pattern detected for ${playerName}`,
          content: pattern.description || 'A significant performance pattern was detected.',
          priority: pattern.strokeImpact > 2 ? 'high' : 'medium',
          status: 'active',
          metadata: {
            patternId: pattern.id,
            strokeImpact: pattern.strokeImpact,
            confidence: pattern.confidence,
            callToAction: pattern.recommendation,
          },
        });
      }

      // Add positive alerts (streaks, improvements)
      if (analysis.alertLevel === 'info' && analysis.insights.length > 0) {
        const positiveInsight = analysis.insights.find(
          (i) => i.tone === 'celebratory' || i.tone === 'encouraging'
        );

        if (positiveInsight) {
          newAlerts.push({
            coach_id: coachId,
            player_id: player.id,
            team_id: teamId,
            insight_type: 'positive_highlight',
            title: positiveInsight.headline || `${playerName} is doing great!`,
            content: positiveInsight.body || 'Positive performance trend detected.',
            priority: 'low',
            status: 'active',
            metadata: {
              callToAction: positiveInsight.callToAction,
              tone: positiveInsight.tone,
              confidence: positiveInsight.confidence,
            },
          });
        }
      }
    }

    // Insert new alerts
    if (newAlerts.length > 0) {
      // Cast needed: golf_coach_insights insert shape includes fields not in generated types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any)
        .from('golf_coach_insights')
        .insert(newAlerts);

      if (insertError) {
        console.error('Error inserting alerts:', insertError);
        // Continue - we'll still return what we have
      }
    }

    // Fetch all current alerts
    const fetchResult = await getCoachAlerts(coachId, teamId);

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/alerts');

    return {
      success: true,
      alerts: fetchResult.alerts || [],
      generated: newAlerts.length,
    };
  } catch (error) {
    console.error('Unexpected error generating alerts:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// BULK ACTIONS
// ============================================================================

export async function dismissAllAlerts(
  coachId: string,
  options?: { level?: string }
): Promise<{ success: boolean; dismissed?: number; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized' };
  }

  try {
    let query = supabase
      .from('golf_coach_insights')
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        status: 'dismissed',
      })
      .eq('coach_id', coachId)
      .eq('dismissed', false);

    if (options?.level) {
      const priorityValue = options.level === 'critical' ? 'high' : options.level;
      query = query.eq('priority', priorityValue);
    }

    const { data, error } = await query.select('id');

    if (error) {
      return { success: false, error: 'Failed to dismiss alerts' };
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/alerts');

    return { success: true, dismissed: data?.length || 0 };
  } catch (error) {
    console.error('Unexpected error dismissing all alerts:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function acknowledgeAllAlerts(
  coachId: string
): Promise<{ success: boolean; acknowledged?: number; error?: string }> {
  const supabase = await createClient();

  // Auth check: verify user owns this coach record
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('id', coachId)
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not authorized' };
  }

  try {
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .update({
        acknowledged_at: new Date().toISOString(),
      })
      .eq('coach_id', coachId)
      .eq('dismissed', false)
      .is('acknowledged_at', null)
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to acknowledge alerts' };
    }

    revalidatePath('/golf/dashboard');

    return { success: true, acknowledged: data?.length || 0 };
  } catch (error) {
    console.error('Unexpected error acknowledging all alerts:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function mapPriorityToLevel(priority: string | null): 'critical' | 'warning' | 'info' | 'suggestion' {
  switch (priority) {
    case 'critical':
    case 'high':
      return 'critical';
    case 'medium':
    case 'warning':
      return 'warning';
    case 'low':
      return 'suggestion';
    default:
      return 'info';
  }
}
