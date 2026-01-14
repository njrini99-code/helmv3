'use server';

// ============================================================================
// COACHHELM INSIGHT GENERATION - SERVER ACTIONS
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { generateInsightsForPlayer, type PlayerData, type PlayerRoundData } from '@/lib/coachhelm/insight-engine';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';

// ============================================================================
// TYPES
// ============================================================================

interface InsightRecord {
  coach_id: string;
  team_id: string;
  insight_type: string;
  priority: string;
  player_id: string;
  title: string;
  description: string;
  recommendation: string;
  metadata: Record<string, unknown>;
  status: 'active';
  expires_at: string | null;
}

// ============================================================================
// GENERATE INSIGHTS FOR TEAM
// ============================================================================

export async function generateTeamInsights() {
  const supabase = await createClient();
  const startTime = Date.now();

  try {
    // 1. Get current coach
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    if (!coach.team_id) {
      return { success: false, error: 'No team assigned' };
    }

    // 2. PARALLELIZED: Fetch philosophy and players simultaneously
    // Previously: 2 sequential queries
    // Now: 1 parallel batch
    const [philosophyResult, playersResult] = await Promise.all([
      supabase
        .from('golf_coach_philosophy')
        .select('*')
        .eq('coach_id', coach.id)
        .single(),
      supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .eq('team_id', coach.team_id),
    ]);

    const { data: philosophy, error: philError } = philosophyResult;
    const { data: players, error: playersError } = playersResult;

    if (philError || !philosophy) {
      return { success: false, error: 'Coach philosophy not found. Please configure your settings first.' };
    }

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // Map database fields to TypeScript
    const coachPhilosophy: CoachPhilosophy = {
      id: philosophy.id,
      coachId: philosophy.coach_id,
      priorityBallStriking: philosophy.priority_ball_striking,
      priorityShortGame: philosophy.priority_short_game,
      priorityPutting: philosophy.priority_putting,
      priorityCourseManagement: philosophy.priority_course_management,
      priorityMentalGame: philosophy.priority_mental_game,
      alertSensitivity: philosophy.alert_sensitivity as 'conservative' | 'balanced' | 'aggressive',
      declineThreshold: Number(philosophy.decline_threshold),
      pressureGapThreshold: Number(philosophy.pressure_gap_threshold),
      bubbleZoneRange: Number(philosophy.bubble_zone_range),
      weightHistorical: philosophy.weight_historical,
      weightRecentForm: philosophy.weight_recent_form,
      weightTournament: philosophy.weight_tournament,
      weightQualifying: philosophy.weight_qualifying,
      weightSubjective: philosophy.weight_subjective,
      alertScoringDecline: philosophy.alert_scoring_decline,
      alertStatRegression: philosophy.alert_stat_regression,
      alertTournamentPressure: philosophy.alert_tournament_pressure,
      alertPlateau: philosophy.alert_plateau,
      alertBubblePlayer: philosophy.alert_bubble_player,
      alertSurgePlayer: philosophy.alert_surge_player,
      alertStreaks: philosophy.alert_streaks,
      alertRecurringWeakness: philosophy.alert_recurring_weakness,
      alertClosingHoles: philosophy.alert_closing_holes,
      alertPar3Issues: philosophy.alert_par_3_issues,
      showStrokesGained: philosophy.show_strokes_gained,
      showAdvancedStats: philosophy.show_advanced_stats,
      insightVerbosity: philosophy.insight_verbosity as 'brief' | 'detailed',
      createdAt: philosophy.created_at ?? new Date().toISOString(),
      updatedAt: philosophy.updated_at ?? new Date().toISOString(),
    };

    // 3. Get rounds for all players (last 20 rounds each)
    const playerIds = players.map((p) => p.id);

    const { data: rounds, error: roundsError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, round_date, total_score, total_to_par, round_type')
      .in('player_id', playerIds)
      .order('round_date', { ascending: false })
      .limit(20 * players.length);

    if (roundsError) {
      return { success: false, error: 'Failed to fetch rounds' };
    }

    // 5. Group rounds by player
    const playerDataMap = new Map<string, PlayerData>();

    players.forEach((player) => {
      const playerRounds = (rounds || [])
        .filter((r) => r.player_id === player.id)
        .map(
          (r): PlayerRoundData => ({
            id: r.id,
            player_id: r.player_id,
            round_date: r.round_date ?? new Date().toISOString(),
            total_score: r.total_score || 0,
            total_to_par: r.total_to_par || 0,
            round_type: (r.round_type as 'practice' | 'tournament' | 'qualifying') || 'practice',
            course_par: 72, // Default par, calculate from total_score - total_to_par if needed
          })
        );

      playerDataMap.set(player.id, {
        id: player.id,
        first_name: player.first_name ?? 'Unknown',
        last_name: player.last_name ?? '',
        rounds: playerRounds,
      });
    });

    // 6. Generate insights for each player
    // OPTIMIZATION: Batch fetch ALL existing active insights once instead of N queries per player
    // Previously: 15 players × 8 insights = 120 queries
    // Now: 1 query regardless of player/insight count
    let totalInsightsCreated = 0;
    const allInsights: InsightRecord[] = [];

    // Batch fetch existing active insights for all players on this team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingInsights } = await (supabase as any)
      .from('golf_coach_insights')
      .select('player_id, insight_type')
      .eq('coach_id', coach.id)
      .eq('status', 'active')
      .in('player_id', playerIds);

    // Create a Set for O(1) duplicate lookup
    const existingInsightKeys = new Set(
      (existingInsights || []).map(
        (i: { player_id: string; insight_type: string }) => `${i.player_id}:${i.insight_type}`
      )
    );

    for (const [playerId, playerData] of playerDataMap.entries()) {
      const insights = generateInsightsForPlayer(playerData, coachPhilosophy, players.length);

      for (const insight of insights) {
        // Check if similar insight already exists using in-memory Set (O(1) lookup)
        const insightKey = `${playerId}:${insight.insight_type}`;

        if (!existingInsightKeys.has(insightKey)) {
          // Calculate expiration date
          const expiresAt = insight.expires_in_days
            ? new Date(Date.now() + insight.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
            : null;

          allInsights.push({
            coach_id: coach.id,
            team_id: coach.team_id,
            insight_type: insight.insight_type,
            priority: insight.priority,
            player_id: insight.player_id,
            title: insight.title,
            description: insight.description,
            recommendation: insight.recommendation,
            metadata: insight.metadata,
            status: 'active',
            expires_at: expiresAt,
          });

          totalInsightsCreated++;
          // Add to set to prevent duplicates within this generation run
          existingInsightKeys.add(insightKey);
        }
      }
    }

    // 7. Bulk insert insights
    if (allInsights.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any).from('golf_coach_insights').insert(allInsights);

      if (insertError) {
        return { success: false, error: 'Failed to save insights' };
      }
    }

    // 8. Log generation
    const executionTime = Date.now() - startTime;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('golf_insight_generation_log').insert({
      coach_id: coach.id,
      generation_type: 'manual',
      insights_created: totalInsightsCreated,
      focus_areas_updated: 0,
      players_analyzed: players.length,
      execution_time_ms: executionTime,
      metadata: {
        total_rounds_analyzed: rounds?.length || 0,
      },
    });

    // 9. Revalidate dashboard
    revalidatePath('/golf/dashboard');

    return {
      success: true,
      insights_created: totalInsightsCreated,
      players_analyzed: players.length,
      execution_time_ms: executionTime,
    };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET ACTIVE INSIGHTS FOR COACH
// ============================================================================

export async function getActiveInsights(limit: number = 10) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated', insights: [] };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found', insights: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insights, error } = await (supabase as any)
      .from('golf_coach_insights')
      .select(
        `
        *,
        player:golf_players(id, first_name, last_name, avatar_url)
      `
      )
      .eq('coach_id', coach.id)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message, insights: [] };
    }

    return { success: true, insights: insights || [] };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred', insights: [] };
  }
}

// ============================================================================
// ACKNOWLEDGE INSIGHT
// ============================================================================

export async function acknowledgeInsight(insightId: string) {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', insightId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// DISMISS INSIGHT
// ============================================================================

export async function dismissInsight(insightId: string) {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'dismissed',
      })
      .eq('id', insightId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// RESOLVE INSIGHT
// ============================================================================

export async function resolveInsight(insightId: string) {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', insightId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET PLAYER FOCUS AREAS
// ============================================================================

export async function getPlayerFocusAreas(playerId: string) {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: focusAreas, error } = await (supabase as any)
      .from('golf_player_focus_areas')
      .select('*')
      .eq('player_id', playerId)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (error) {
      return { success: false, error: error.message, focus_areas: [] };
    }

    return { success: true, focus_areas: focusAreas || [] };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred', focus_areas: [] };
  }
}
