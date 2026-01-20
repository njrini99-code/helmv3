'use server';

// ============================================================================
// COACHHELM INSIGHT GENERATION - SERVER ACTIONS
// ============================================================================
//
// Single source of truth for all CoachHelm AI insight generation.
// Powered by the CoachHelm Intelligence Engine.
//
// Features:
//   - Pattern mining with statistical validation
//   - Causal relationship discovery
//   - Performance predictions with confidence calibration
//   - Shot-level pattern analysis
//   - Composed insights with reasoning chains
//   - Behavior learning from user interactions
//
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  coachHelmIntelligence,
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
} from '@/lib/coachhelm/v2';
import type {
  ComposedInsight,
  MinedPattern,
  PerformancePrediction,
  PlayerAnalysis,
} from '@/lib/coachhelm/v2/types';
import type { InsightType, InsightPriority } from '@/lib/coachhelm/insight-types';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';

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

interface TeamPlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface PlayerStatsCacheRow {
  player_id: string;
  rounds_in_calculation: number | null;
  strokes_gained_total: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
  gir_percentage: number | null;
  driving_accuracy_percentage: number | null;
  scrambling_percentage: number | null;
  putts_per_round: number | null;
  approach_proximity_average: number | null;
}

// ============================================================================
// V2 INSIGHT CONVERSION HELPERS
// ============================================================================

/**
 * Maps V2 insight tone to V1 priority format for backwards compatibility
 */
function mapToneToPriority(tone: ComposedInsight['tone'], confidence: number): InsightPriority {
  if (tone === 'urgent') return 'urgent';
  if (tone === 'cautionary' && confidence > 0.7) return 'high';
  if (tone === 'cautionary') return 'medium';
  if (confidence < 0.5) return 'low';
  return 'medium';
}

/**
 * Determines insight type from V2 analysis data
 */
function determineInsightType(
  insight: ComposedInsight,
  pattern?: MinedPattern,
  prediction?: PerformancePrediction
): InsightType {
  // Pattern-based insights
  if (pattern) {
    if (pattern.patternType === 'temporal') return 'scoring_decline';
    if (pattern.strokeImpact > 1.5) return 'recurring_weakness';
    if (pattern.outcome?.metric === 'tournament_score') return 'tournament_pressure';
  }

  // Prediction-based insights
  if (prediction) {
    if (prediction.trend === 'improving') return 'surge_player';
    if (prediction.trend === 'declining') return 'scoring_decline';
  }

  // Tone-based fallbacks
  if (insight.tone === 'celebratory') return 'surge_player';
  if (insight.tone === 'urgent') return 'bubble_player';
  if (insight.tone === 'cautionary') return 'scoring_decline';

  return 'team_trend';
}

// ============================================================================
// PHILOSOPHY HELPERS
// ============================================================================

// Database row type - Supabase types may not be updated after migration
interface PhilosophyDbRow {
  id: string;
  coach_id: string;
  priority_ball_striking: number | null;
  priority_short_game: number | null;
  priority_putting: number | null;
  priority_course_management: number | null;
  priority_mental_game: number | null;
  alert_sensitivity: string | null;
  decline_threshold: string | number | null;
  pressure_gap_threshold: string | number | null;
  bubble_zone_range: string | number | null;
  weight_historical?: number | null;
  weight_recent_form?: number | null;
  weight_tournament?: number | null;
  weight_qualifying?: number | null;
  weight_subjective?: number | null;
  alert_scoring_decline?: boolean | null;
  alert_stat_regression?: boolean | null;
  alert_tournament_pressure?: boolean | null;
  alert_plateau?: boolean | null;
  alert_bubble_player?: boolean | null;
  alert_surge_player?: boolean | null;
  alert_streaks?: boolean | null;
  alert_recurring_weakness?: boolean | null;
  alert_closing_holes?: boolean | null;
  alert_par_3_issues?: boolean | null;
  show_strokes_gained?: boolean | null;
  show_advanced_stats?: boolean | null;
  insight_verbosity?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Fetches coach philosophy from database, returns defaults if not found
 */
async function getCoachPhilosophy(coachId: string): Promise<CoachPhilosophy> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('golf_coach_philosophy')
    .select('*')
    .eq('coach_id', coachId)
    .maybeSingle();

  const defaults: CoachPhilosophy = {
    id: '',
    coachId,
    ...PHILOSOPHY_DEFAULTS,
    alertScoringDecline: true,
    alertStatRegression: true,
    alertTournamentPressure: true,
    alertPlateau: false,
    alertBubblePlayer: true,
    alertSurgePlayer: true,
    alertStreaks: true,
    alertRecurringWeakness: true,
    alertClosingHoles: false,
    alertPar3Issues: false,
    showStrokesGained: true,
    showAdvancedStats: true,
    insightVerbosity: 'detailed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!data) {
    return defaults;
  }

  const row = data as PhilosophyDbRow;

  // Parse numeric values that might be strings
  const parseNum = (val: string | number | null | undefined, def: number): number => {
    if (val === null || val === undefined) return def;
    return typeof val === 'string' ? parseFloat(val) : val;
  };

  // Map snake_case to camelCase with proper null handling
  return {
    id: row.id,
    coachId: row.coach_id,
    priorityBallStriking: row.priority_ball_striking ?? defaults.priorityBallStriking,
    priorityShortGame: row.priority_short_game ?? defaults.priorityShortGame,
    priorityPutting: row.priority_putting ?? defaults.priorityPutting,
    priorityCourseManagement: row.priority_course_management ?? defaults.priorityCourseManagement,
    priorityMentalGame: row.priority_mental_game ?? defaults.priorityMentalGame,
    alertSensitivity: (row.alert_sensitivity as CoachPhilosophy['alertSensitivity']) ?? defaults.alertSensitivity,
    declineThreshold: parseNum(row.decline_threshold, defaults.declineThreshold),
    pressureGapThreshold: parseNum(row.pressure_gap_threshold, defaults.pressureGapThreshold),
    bubbleZoneRange: parseNum(row.bubble_zone_range, defaults.bubbleZoneRange),
    weightHistorical: row.weight_historical ?? defaults.weightHistorical,
    weightRecentForm: row.weight_recent_form ?? defaults.weightRecentForm,
    weightTournament: row.weight_tournament ?? defaults.weightTournament,
    weightQualifying: row.weight_qualifying ?? defaults.weightQualifying,
    weightSubjective: row.weight_subjective ?? defaults.weightSubjective,
    alertScoringDecline: row.alert_scoring_decline ?? defaults.alertScoringDecline,
    alertStatRegression: row.alert_stat_regression ?? defaults.alertStatRegression,
    alertTournamentPressure: row.alert_tournament_pressure ?? defaults.alertTournamentPressure,
    alertPlateau: row.alert_plateau ?? defaults.alertPlateau,
    alertBubblePlayer: row.alert_bubble_player ?? defaults.alertBubblePlayer,
    alertSurgePlayer: row.alert_surge_player ?? defaults.alertSurgePlayer,
    alertStreaks: row.alert_streaks ?? defaults.alertStreaks,
    alertRecurringWeakness: row.alert_recurring_weakness ?? defaults.alertRecurringWeakness,
    alertClosingHoles: row.alert_closing_holes ?? defaults.alertClosingHoles,
    alertPar3Issues: row.alert_par_3_issues ?? defaults.alertPar3Issues,
    showStrokesGained: row.show_strokes_gained ?? defaults.showStrokesGained,
    showAdvancedStats: row.show_advanced_stats ?? defaults.showAdvancedStats,
    insightVerbosity: row.insight_verbosity === 'detailed' ? 'detailed' : 'brief',
    createdAt: row.created_at ?? defaults.createdAt,
    updatedAt: row.updated_at ?? defaults.updatedAt,
  };
}

/**
 * Filters insights based on coach philosophy alert toggles
 */
function shouldIncludeInsight(insightType: InsightType, philosophy: CoachPhilosophy): boolean {
  const alertMap: Record<string, keyof CoachPhilosophy> = {
    scoring_decline: 'alertScoringDecline',
    stat_regression: 'alertStatRegression',
    tournament_pressure: 'alertTournamentPressure',
    plateau: 'alertPlateau',
    bubble_player: 'alertBubblePlayer',
    surge_player: 'alertSurgePlayer',
    streak: 'alertStreaks',
    recurring_weakness: 'alertRecurringWeakness',
    closing_holes: 'alertClosingHoles',
    par_3_issues: 'alertPar3Issues',
  };

  const alertKey = alertMap[insightType];
  if (!alertKey) return true; // Include unrecognized types by default

  return philosophy[alertKey] as boolean;
}

/**
 * Gets the minimum confidence threshold based on alert sensitivity
 */
function getConfidenceThreshold(sensitivity: CoachPhilosophy['alertSensitivity']): number {
  switch (sensitivity) {
    case 'aggressive':
      return 0.4; // Show more insights
    case 'conservative':
      return 0.7; // Only high confidence insights
    case 'balanced':
    default:
      return 0.55;
  }
}

// ============================================================================
// AUTH HELPERS - Player/Team Access Verification
// ============================================================================

/**
 * Verifies that the current user has access to a specific player's data.
 * Access is granted if:
 * 1. The user IS the player (player accessing their own data)
 * 2. The user is a coach whose team includes this player
 */
async function verifyPlayerAccess(
  playerId: string
): Promise<{ authorized: boolean; userId?: string; coachId?: string; teamId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Check if user is the player themselves
  // Type assertion: team_id exists in DB but not in generated Supabase types
  const { data: playerRecordData } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('id', playerId)
    .eq('user_id', user.id)
    .single();

  const playerRecord = playerRecordData as { id: string; team_id: string | null } | null;

  if (playerRecord) {
    return { authorized: true, userId: user.id, teamId: playerRecord.team_id ?? undefined };
  }

  // Check if user is a coach with access to this player
  // Type assertion: team_id exists in DB but not in generated Supabase types
  const { data: coachData } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const coach = coachData as { id: string; team_id: string | null } | null;

  if (coach?.team_id) {
    // Verify player is on the coach's team
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', coach.team_id)
      .eq('player_id', playerId)
      .eq('status', 'active')
      .single();

    if (teamMember) {
      return { authorized: true, userId: user.id, coachId: coach.id, teamId: coach.team_id };
    }
  }

  return { authorized: false, error: 'Not authorized to access this player' };
}

/**
 * Verifies that the current user has access to a specific round.
 * Uses player ownership chain: round -> player -> user
 */
async function verifyRoundAccess(
  roundId: string
): Promise<{ authorized: boolean; userId?: string; playerId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  // Get round and verify ownership
  const { data: round } = await supabase
    .from('golf_rounds')
    .select('player_id')
    .eq('id', roundId)
    .single();

  if (!round) {
    return { authorized: false, error: 'Round not found' };
  }

  // Check if user owns the round via player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('id', round.player_id)
    .eq('user_id', user.id)
    .single();

  if (player) {
    return { authorized: true, userId: user.id, playerId: player.id };
  }

  // Check if user is coach with access to the player
  // Type assertion: team_id exists in DB but not in generated Supabase types
  const { data: coachData } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const coach = coachData as { id: string; team_id: string | null } | null;

  if (coach?.team_id) {
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('team_id', coach.team_id)
      .eq('player_id', round.player_id)
      .eq('status', 'active')
      .single();

    if (teamMember) {
      return { authorized: true, userId: user.id, playerId: round.player_id };
    }
  }

  return { authorized: false, error: 'Not authorized to access this round' };
}

/**
 * Converts V2 ComposedInsight to V1 InsightRecord format for database storage
 */
function convertV2ToInsightRecord(
  insight: ComposedInsight,
  playerId: string,
  coachId: string,
  teamId: string,
  pattern?: MinedPattern,
  prediction?: PerformancePrediction
): InsightRecord {
  const insightType = determineInsightType(insight, pattern, prediction);
  const priority = mapToneToPriority(insight.tone, insight.confidence);

  return {
    coach_id: coachId,
    team_id: teamId,
    insight_type: insightType,
    priority,
    player_id: playerId,
    title: insight.headline,
    description: insight.body,
    recommendation: insight.callToAction || 'Review this insight with your coach.',
    metadata: {
      confidence: insight.confidence,
      tone: insight.tone,
      reasoning_steps: insight.reasoning?.reasoningChain?.length ?? 0,
      v2_engine: true,
      pattern_id: pattern?.id,
      prediction_value: prediction?.predictedValue,
    },
    status: 'active',
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days default
  };
}

// ============================================================================
// GENERATE INSIGHTS FOR TEAM (V2 Engine)
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

    // Get coach and look up team_id via organization
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get team_id from organization
    let teamId: string | null = null;
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id ?? null;
    }

    if (!teamId) {
      return { success: false, error: 'No team assigned' };
    }

    // 2. Check if CoachHelm V2 is enabled for this coach
    const coachHelmStatus = await isCoachHelmEnabledForCoach(coach.id);
    if (!coachHelmStatus.effectivelyEnabled) {
      return { success: false, error: coachHelmStatus.disabledReason || 'CoachHelm is disabled' };
    }

    // 2.5. Fetch coach philosophy settings
    const philosophy = await getCoachPhilosophy(coach.id);
    const confidenceThreshold = getConfidenceThreshold(philosophy.alertSensitivity);

    // 3. Get team players via golf_team_members
    const { data: teamMembers, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (membersError || !teamMembers || teamMembers.length === 0) {
      return { success: false, error: 'No players found' };
    }

    const playerIds = teamMembers.map(m => m.player_id);
    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // 4. Batch fetch existing active insights for deduplication
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingInsights } = await (supabase as any)
      .from('golf_coach_insights')
      .select('player_id, insight_type')
      .eq('coach_id', coach.id)
      .eq('status', 'active')
      .in('player_id', playerIds);

    const existingInsightKeys = new Set(
      (existingInsights || []).map(
        (i: { player_id: string; insight_type: string }) => `${i.player_id}:${i.insight_type}`
      )
    );

    // 5. Analyze each player with V2 engine (batched to avoid connection pool exhaustion)
    const BATCH_SIZE = 3;
    const analysisResults: Array<{ player: TeamPlayerRow; analysis: PlayerAnalysis | null; success: boolean }> = [];

    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (player) => {
          try {
            const analysis = await coachHelmIntelligence.analyzePlayer(player.id, {
              includePatterns: true,
              includeCausal: true,
              includePredictions: true,
              includeShotPatterns: true,
              depth: 'standard',
            });
            return { player, analysis, success: true };
          } catch (err) {
            console.error(`Error analyzing player ${player.id}:`, err);
            return { player, analysis: null, success: false };
          }
        })
      );
      analysisResults.push(...batchResults);
    }

    // 6. Convert V2 insights to InsightRecords
    let totalInsightsCreated = 0;
    const allInsights: InsightRecord[] = [];

    for (const result of analysisResults) {
      if (!result.success || !result.analysis) continue;

      const { player, analysis } = result;

      // Convert each V2 insight
      for (let i = 0; i < analysis.insights.length; i++) {
        const insight = analysis.insights[i];
        if (!insight) continue;  // Skip if undefined

        // Apply philosophy-based confidence filter
        if (insight.confidence < confidenceThreshold) continue;

        const pattern = analysis.patterns[i]; // May be undefined
        const prediction = analysis.predictions[0]; // Use first prediction

        const record = convertV2ToInsightRecord(
          insight,
          player.id,
          coach.id,
          teamId,
          pattern,
          prediction
        );

        // Apply philosophy-based alert type filter
        if (!shouldIncludeInsight(record.insight_type as InsightType, philosophy)) continue;

        // Check for duplicates
        const insightKey = `${player.id}:${record.insight_type}`;
        if (!existingInsightKeys.has(insightKey)) {
          allInsights.push(record);
          existingInsightKeys.add(insightKey);
          totalInsightsCreated++;
        }
      }

      // Also add pattern-specific insights if high impact
      // Skip if recurring_weakness alerts are disabled
      if (shouldIncludeInsight('recurring_weakness', philosophy)) {
        for (const pattern of analysis.patterns.filter(p => p.isActive && p.strokeImpact > 1)) {
          // Apply philosophy-based confidence filter to patterns
          if (pattern.confidence < confidenceThreshold) continue;

          const patternInsight: InsightRecord = {
            coach_id: coach.id,
            team_id: teamId,
            insight_type: 'recurring_weakness',
            priority: pattern.strokeImpact > 2 ? 'high' : 'medium',
            player_id: player.id,
            title: `Pattern: ${pattern.description || 'Performance Pattern'}`,
            description: pattern.recommendation || `Pattern detected with ${(pattern.confidence * 100).toFixed(0)}% confidence.`,
            recommendation: pattern.recommendation || 'Work with coach to address this pattern.',
            metadata: {
              v2_engine: true,
              pattern_type: pattern.patternType,
              support: pattern.support,
              confidence: pattern.confidence,
              stroke_impact: pattern.strokeImpact,
            },
            status: 'active',
            expires_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
          };

          const patternKey = `${player.id}:${patternInsight.insight_type}:${pattern.id}`;
          if (!existingInsightKeys.has(patternKey)) {
            allInsights.push(patternInsight);
            existingInsightKeys.add(patternKey);
            totalInsightsCreated++;
          }
        }
      }
    }

    // 7. Bulk insert insights
    if (allInsights.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await (supabase as any).from('golf_coach_insights').insert(allInsights);

      if (insertError) {
        console.error('Failed to insert insights:', insertError);
        return { success: false, error: 'Failed to save insights' };
      }
    }

    // 8. Log generation
    const executionTime = Date.now() - startTime;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('golf_insight_generation_log').insert({
      coach_id: coach.id,
      generation_type: 'v2_consolidated',
      insights_created: totalInsightsCreated,
      focus_areas_updated: 0,
      players_analyzed: players.length,
      execution_time_ms: executionTime,
      metadata: {
        engine_version: 'v2',
        analysis_depth: 'standard',
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
      console.error('[Insights Error]', error);
      return { success: false, error: 'Failed to generate insights. Please try again.', insights: [] };
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
      console.error('[Insights Error]', error);
      return { success: false, error: 'Operation failed. Please try again.' };
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
      console.error('[Insights Error]', error);
      return { success: false, error: 'Operation failed. Please try again.' };
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
      console.error('[Insights Error]', error);
      return { success: false, error: 'Operation failed. Please try again.' };
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
      console.error('[Insights Error]', error);
      return { success: false, error: 'Failed to get focus areas. Please try again.', focus_areas: [] };
    }

    return { success: true, focus_areas: focusAreas || [] };
  } catch (error) {
    console.error('Unexpected error in insights action:', error);
    return { success: false, error: 'An unexpected error occurred', focus_areas: [] };
  }
}

// ============================================================================
// ANALYZE PLAYER (Full Analysis)
// ============================================================================

export async function analyzePlayer(
  playerId: string,
  options?: {
    includePatterns?: boolean;
    includeCausal?: boolean;
    includePredictions?: boolean;
    includeTrajectory?: boolean;
    depth?: 'quick' | 'standard' | 'deep';
  }
): Promise<{ success: boolean; analysis?: PlayerAnalysis; error?: string }> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if CoachHelm is enabled for this player
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: options?.includePatterns ?? true,
      includeCausal: options?.includeCausal ?? true,
      includePredictions: options?.includePredictions ?? true,
      includeTrajectory: options?.includeTrajectory ?? false,
      depth: options?.depth ?? 'standard',
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for analysis' };
    }

    return { success: true, analysis };
  } catch (error) {
    console.error('Error in analyzePlayer:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE PLAYER INSIGHT
// ============================================================================

export async function generatePlayerInsight(playerId: string): Promise<{
  success: boolean;
  insight?: ComposedInsight;
  patterns?: MinedPattern[];
  prediction?: PerformancePrediction;
  error?: string;
}> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      depth: 'standard',
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for analysis' };
    }

    return {
      success: true,
      insight: analysis.primaryInsight,
      patterns: analysis.patterns.filter(p => p.isActive),
      prediction: analysis.predictions[0],
    };
  } catch (error) {
    console.error('Error in generatePlayerInsight:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE TEAM INSIGHT (Returns insights, patterns, predictions)
// ============================================================================

export async function generateTeamInsight(): Promise<{
  success: boolean;
  insights?: ComposedInsight[];
  patterns?: MinedPattern[];
  predictions?: Array<PerformancePrediction & { playerName?: string }>;
  playersAnalyzed?: number;
  playersWithoutData?: number;
  playersMissingData?: string[];
  error?: string;
}> {
  const supabase = await createClient();
  const startTime = Date.now();

  try {
    // 1. Get current coach
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get coach and look up team_id via organization
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get team_id from organization
    let teamId: string | null = null;
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id ?? null;
    }

    if (!teamId) {
      return { success: false, error: 'No team assigned' };
    }

    // 2. Check if CoachHelm is enabled
    const status = await isCoachHelmEnabledForCoach(coach.id);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // 3. Get all players on team via golf_team_members
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    const playerIds = (teamMembers || []).map(m => m.player_id);
    if (playerIds.length === 0) {
      return { success: false, error: 'No players found' };
    }

    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // Fetch stats cache for stat insights
    const { data: statsRows } = await supabase
      .from('golf_player_stats_cache')
      .select(
        'player_id, rounds_in_calculation, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, gir_percentage, driving_accuracy_percentage, scrambling_percentage, putts_per_round, approach_proximity_average'
      )
      .in('player_id', playerIds);

    // Fetch coach philosophy using helper that properly maps DB fields
    const philosophy = await getCoachPhilosophy(coach.id);

    // 4. Analyze each player with V2 engine - BATCHED to avoid connection pool exhaustion
    const allInsights: ComposedInsight[] = [];
    const allPatterns: MinedPattern[] = [];
    const allPredictions: Array<PerformancePrediction & { playerName?: string }> = [];

    // Process players in batches of 3
    const BATCH_SIZE = 3;
    const analysisResults: Array<{ player: TeamPlayerRow; playerName: string; analysis: PlayerAnalysis | null; success: boolean }> = [];

    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (player) => {
          try {
            const playerName = [player.first_name, player.last_name]
              .filter(Boolean)
              .join(' ')
              .trim();

            const analysis = await coachHelmIntelligence.analyzePlayer(player.id, {
              includePatterns: true,
              includeCausal: true,
              includePredictions: true,
              depth: 'standard',
            });

            return { player, playerName, analysis, success: true };
          } catch (playerError) {
            console.error('Error analyzing player:', playerError);
            return { player, playerName: '', analysis: null, success: false };
          }
        })
      );
      analysisResults.push(...batchResults);
    }

    // Aggregate results
    let playersAnalyzed = 0;
    let playersWithoutData = 0;
    const playersMissingData: string[] = [];

    for (const result of analysisResults) {
      if (result.success && result.analysis) {
        playersAnalyzed++;

        // Collect insights
        if (result.analysis.insights) {
          allInsights.push(...result.analysis.insights);
        }

        // Collect patterns
        if (result.analysis.patterns) {
          allPatterns.push(...result.analysis.patterns.filter(p => p.isActive));
        }

        if (result.analysis.predictions) {
          for (const prediction of result.analysis.predictions) {
            allPredictions.push({
              ...prediction,
              playerName: result.playerName || undefined,
            });
          }
        }
      } else {
        // Track players who couldn't be analyzed (likely missing round data)
        playersWithoutData++;
        if (result.playerName) {
          playersMissingData.push(result.playerName);
        }
      }
    }

    // If no players could be analyzed, return informative error
    if (playersAnalyzed === 0 && players.length > 0) {
      return {
        success: false,
        error: `Unable to analyze team: No players have completed rounds in the last 90 days. Players need round data for AI analysis.${playersMissingData.length > 0 ? ` Missing data for: ${playersMissingData.join(', ')}` : ''}`,
        playersAnalyzed: 0,
        playersWithoutData,
      };
    }

    const statInsights = buildStatInsightsForTeam(
      players as TeamPlayerRow[],
      statsRows ?? [],
      philosophy
    );
    if (statInsights.length > 0) {
      allInsights.push(...statInsights);
    }

    // 5. Generate team-level alerts
    const teamAlerts = await coachHelmIntelligence.generateAlerts(coach.id, teamId);
    if (teamAlerts.length > 0) {
      allInsights.push(...teamAlerts);
    }

    // 6. Log generation
    const executionTime = Date.now() - startTime;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logTable = supabase.from('golf_insight_generation_log' as any) as any;
    const { error: logError } = await logTable.insert({
      coach_id: coach.id,
      generation_type: 'team_insight',
      insights_created: allInsights.length,
      focus_areas_updated: 0,
      players_analyzed: playersAnalyzed,
      execution_time_ms: executionTime,
      metadata: {
        patterns_found: allPatterns.length,
        engine_version: 'coachhelm',
      },
    });
    if (logError && process.env.NODE_ENV === 'development') {
      console.warn('Insight generation log skipped:', logError.message);
    }

    // 7. Revalidate dashboard
    revalidatePath('/golf/dashboard');

    return {
      success: true,
      insights: allInsights,
      patterns: allPatterns,
      predictions: allPredictions,
      playersAnalyzed,
      playersWithoutData,
      playersMissingData: playersMissingData.length > 0 ? playersMissingData : undefined,
    };
  } catch (error) {
    console.error('Error in generateTeamInsight:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE PRACTICE RECOMMENDATIONS
// ============================================================================

export async function generatePracticeRecommendations(playerId: string): Promise<{
  success: boolean;
  recommendations?: string[];
  focusAreas?: Array<{
    area: string;
    strokesGained: number;
    trend: 'improving' | 'stable' | 'declining';
    recommendation: string;
  }>;
  error?: string;
}> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: false,
      depth: 'standard',
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for recommendations' };
    }

    // Build focus areas from patterns
    const focusAreas = buildFocusAreasFromAnalysis(analysis);

    return {
      success: true,
      recommendations: analysis.recommendations,
      focusAreas,
    };
  } catch (error) {
    console.error('Error in generatePracticeRecommendations:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE TOURNAMENT PREP
// ============================================================================

export async function generateTournamentPrep(playerId: string): Promise<{
  success: boolean;
  prediction?: PerformancePrediction;
  keyFactors?: string[];
  recommendations?: string[];
  error?: string;
}> {
  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      includeTrajectory: true,
      depth: 'deep',
    });

    if (!analysis) {
      return { success: false, error: 'Insufficient data for tournament prep' };
    }

    const prediction = analysis.predictions[0];
    const keyFactors = prediction?.keyDrivers || prediction?.inputFeatures || [];

    return {
      success: true,
      prediction,
      keyFactors,
      recommendations: analysis.recommendations,
    };
  } catch (error) {
    console.error('Error in generateTournamentPrep:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET PLAYER PATTERNS
// ============================================================================

export async function getPlayerPatterns(playerId: string): Promise<{
  success: boolean;
  patterns?: MinedPattern[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if enabled
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // Query patterns from database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const { data: patterns, error } = await patternsTable
      .select('*')
      .eq('player_id', playerId)
      .eq('is_active', true)
      .order('stroke_impact', { ascending: false })
      .limit(10);

    if (error) {
      // Table might not exist yet
      return { success: true, patterns: [] };
    }

    // Transform to MinedPattern type
    const transformedPatterns: MinedPattern[] = (patterns || []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      playerId: p.player_id as string,
      patternType: p.pattern_type as MinedPattern['patternType'],
      conditions: p.conditions as MinedPattern['conditions'],
      outcome: p.outcome as MinedPattern['outcome'],
      support: p.support as number,
      confidence: p.confidence as number,
      lift: p.lift as number,
      conviction: p.conviction as number,
      strokeImpact: p.stroke_impact as number,
      actionability: p.actionability as number,
      sampleSize: p.sample_size as number,
      firstDetected: p.first_detected as string,
      lastOccurrence: p.last_occurrence as string,
      occurrenceCount: p.occurrence_count as number,
      trend: p.trend as MinedPattern['trend'],
      isActive: p.is_active as boolean,
      description: (p.metadata as Record<string, string>)?.description,
      recommendation: (p.metadata as Record<string, string>)?.recommendation,
    }));

    return { success: true, patterns: transformedPatterns };
  } catch (error) {
    console.error('Error in getPlayerPatterns:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE ROUND REVIEW
// ============================================================================

export async function generateRoundReview(
  roundId: string,
  playerId: string
): Promise<{
  success: boolean;
  review?: Awaited<ReturnType<typeof coachHelmIntelligence.generateRoundReview>>;
  error?: string;
}> {
  try {
    // Verify user has access to this round
    const access = await verifyRoundAccess(roundId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if enabled
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    const review = await coachHelmIntelligence.generateRoundReview(roundId, playerId);

    if (!review) {
      return { success: false, error: 'Insufficient data for review' };
    }

    return { success: true, review };
  } catch (error) {
    console.error('Error in generateRoundReview:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// RECORD USER INTERACTION (LEARNING)
// ============================================================================

export async function recordInteraction(
  entityId: string,
  entityType: 'coach' | 'player',
  interactionType: 'view' | 'click' | 'expand' | 'collapse' | 'dismiss' | 'action' | 'share' | 'feedback',
  targetType?: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean }> {
  try {
    await coachHelmIntelligence.learn({
      entityId,
      entityType,
      interactionType,
      targetType: targetType ?? 'unknown',
      timestamp: new Date().toISOString(),
      metadata,
    });

    return { success: true };
  } catch (error) {
    console.error('Error recording CoachHelm interaction:', error);
    return { success: false };
  }
}

// ============================================================================
// GET COACHHELM STATUS
// ============================================================================

export async function getCoachHelmStatus(
  entityType: 'coach' | 'player',
  entityId: string
): Promise<{
  success: boolean;
  enabled: boolean;
  disabledReason?: string | null;
}> {
  try {
    const status = entityType === 'coach'
      ? await isCoachHelmEnabledForCoach(entityId)
      : await isCoachHelmEnabledForPlayer(entityId);

    return {
      success: true,
      enabled: status.effectivelyEnabled,
      disabledReason: status.disabledReason,
    };
  } catch (error) {
    console.error('Error getting CoachHelm status:', error);
    return { success: false, enabled: true };
  }
}

// ============================================================================
// GET PLAYER COACHHELM DASHBOARD DATA
// ============================================================================

export interface PlayerCoachHelmDashboardData {
  playerId: string;
  playerName: string;
  lastUpdated: string;

  // Performance prediction
  prediction: PerformancePrediction | null;

  // Active insights
  insights: ComposedInsight[];

  // Focus areas with strokes gained context
  focusAreas: Array<{
    area: string;
    strokesGained: number;
    trend: 'improving' | 'stable' | 'declining';
    recommendation: string;
  }>;

  // Recent rounds for review
  recentRounds: Array<{
    id: string;
    courseName: string;
    date: string;
    score: number;
    scoreToPar: number;
    hasReview: boolean;
  }>;

  // Player state for UI customization
  playerState: 'improving' | 'stable' | 'struggling' | 'unknown';
  alertLevel: 'none' | 'info' | 'warning' | 'critical';
}

export async function getPlayerCoachHelmDashboard(
  playerId: string
): Promise<{ success: boolean; data?: PlayerCoachHelmDashboardData; error?: string }> {
  const supabase = await createClient();

  try {
    // Verify user has access to this player
    const access = await verifyPlayerAccess(playerId);
    if (!access.authorized) {
      return { success: false, error: access.error || 'Not authorized' };
    }

    // Check if CoachHelm is enabled for this player
    const status = await isCoachHelmEnabledForPlayer(playerId);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // Get player info
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
      .single();

    if (playerError || !player) {
      return { success: false, error: 'Player not found' };
    }

    const playerName = [player.first_name, player.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Player';

    // Run analysis to get all insights
    const analysis = await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true,
      includeCausal: true,
      includePredictions: true,
      includeShotPatterns: true,
      depth: 'standard',
    });

    // Get recent rounds for review
    const { data: recentRoundsData } = await supabase
      .from('golf_rounds')
      .select('id, course_name, round_date, total_score, score_to_par')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false })
      .limit(5);

    const recentRounds = (recentRoundsData || []).map(r => ({
      id: r.id,
      courseName: r.course_name || 'Unknown Course',
      date: r.round_date,
      score: r.total_score || 0,
      scoreToPar: r.score_to_par || 0,
      hasReview: true, // All completed rounds can have AI review generated
    }));

    // Build focus areas from patterns and features
    const focusAreas = buildFocusAreasFromAnalysis(analysis);

    // Determine player state from analysis
    const playerState = analysis?.features?.contextual?.formCycle === 'peak' ||
                        analysis?.features?.contextual?.formCycle === 'rising'
      ? 'improving'
      : analysis?.features?.contextual?.formCycle === 'declining' ||
        analysis?.features?.contextual?.formCycle === 'trough'
        ? 'struggling'
        : analysis?.features?.temporal?.recentFormScore !== undefined
          ? analysis.features.temporal.recentFormScore > 0.2
            ? 'improving'
            : analysis.features.temporal.recentFormScore < -0.2
              ? 'struggling'
              : 'stable'
          : 'unknown';

    const dashboardData: PlayerCoachHelmDashboardData = {
      playerId,
      playerName,
      lastUpdated: new Date().toISOString(),
      prediction: analysis?.predictions?.[0] ?? null,
      insights: analysis?.insights ?? [],
      focusAreas,
      recentRounds,
      playerState,
      alertLevel: analysis?.alertLevel ?? 'none',
    };

    return { success: true, data: dashboardData };
  } catch (error) {
    console.error('Error getting player CoachHelm dashboard:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Build focus areas from analysis data */
function buildFocusAreasFromAnalysis(analysis: PlayerAnalysis | null): PlayerCoachHelmDashboardData['focusAreas'] {
  if (!analysis) return [];

  const focusAreas: PlayerCoachHelmDashboardData['focusAreas'] = [];

  // Add focus areas from patterns
  const activePatterns = analysis.patterns?.filter(p => p.isActive && p.strokeImpact > 0.3) || [];
  for (const pattern of activePatterns.slice(0, 3)) {
    const condition = pattern.conditions[0];
    const areaName = condition?.label || condition?.field || 'General';

    // Avoid duplicates
    if (focusAreas.some(f => f.area === areaName)) continue;

    focusAreas.push({
      area: areaName,
      strokesGained: -pattern.strokeImpact, // Negative because it's costing strokes
      trend: pattern.trend === 'strengthening' ? 'declining' :
             pattern.trend === 'weakening' ? 'improving' : 'stable',
      recommendation: pattern.recommendation || 'Focus on improving this area.',
    });
  }

  // Add focus areas from shot patterns
  if (analysis.shotPatterns?.criticalPatterns) {
    for (const shotPattern of analysis.shotPatterns.criticalPatterns.slice(0, 2)) {
      const areaName = `${shotPattern.situation.distanceRange.label} Shots`;

      if (focusAreas.some(f => f.area === areaName)) continue;

      focusAreas.push({
        area: areaName,
        strokesGained: -(shotPattern.avgDistanceError / 10), // Approximate strokes impact
        trend: 'stable',
        recommendation: shotPattern.recommendation,
      });
    }
  }

  // Add focus areas from causal relationships
  for (const causal of (analysis.causalRelationships || []).slice(0, 2)) {
    if (causal.interventionPotential > 0.6) {
      const areaName = causal.cause;

      if (focusAreas.some(f => f.area === areaName)) continue;

      focusAreas.push({
        area: areaName,
        strokesGained: -causal.strength,
        trend: 'stable',
        recommendation: `Improving ${causal.cause} could positively impact ${causal.effect}.`,
      });
    }
  }

  return focusAreas.slice(0, 5); // Return top 5 focus areas
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function averageNumber(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function formatSigned(value: number, decimals = 2): string {
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}` : formatted;
}

function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

function computeInsightConfidence(rounds: number | null | undefined): number {
  const roundsCount = rounds ?? 0;
  const normalized = clampNumber(roundsCount / 20, 0, 1);
  return clampNumber(0.45 + normalized * 0.4, 0.45, 0.85);
}

function buildStatInsightsForTeam(
  players: TeamPlayerRow[],
  statsRows: PlayerStatsCacheRow[],
  philosophy: CoachPhilosophy
): ComposedInsight[] {
  if (!statsRows || statsRows.length === 0) return [];

  const playerNameById = new Map<string, string>();
  for (const player of players) {
    const name = [player.first_name, player.last_name].filter(Boolean).join(' ').trim() || 'Player';
    playerNameById.set(player.id, name);
  }

  const statsByPlayer = new Map(
    statsRows.map((row) => [row.player_id, row])
  );

  const teamAverages = {
    sgTotal: averageNumber(statsRows.map((row) => row.strokes_gained_total)),
    sgTee: averageNumber(statsRows.map((row) => row.strokes_gained_tee)),
    sgApproach: averageNumber(statsRows.map((row) => row.strokes_gained_approach)),
    sgAround: averageNumber(statsRows.map((row) => row.strokes_gained_around_green)),
    sgPutting: averageNumber(statsRows.map((row) => row.strokes_gained_putting)),
    gir: averageNumber(statsRows.map((row) => row.gir_percentage)),
    fairway: averageNumber(statsRows.map((row) => row.driving_accuracy_percentage)),
    scrambling: averageNumber(statsRows.map((row) => row.scrambling_percentage)),
    putts: averageNumber(statsRows.map((row) => row.putts_per_round)),
  };

  const insightsWithSeverity: Array<{ insight: ComposedInsight; severity: number }> = [];

  if (philosophy.showStrokesGained) {
    const teamSgEntries = [
      { key: 'sgTee', label: 'Off the Tee', value: teamAverages.sgTee },
      { key: 'sgApproach', label: 'Approach', value: teamAverages.sgApproach },
      { key: 'sgAround', label: 'Around the Green', value: teamAverages.sgAround },
      { key: 'sgPutting', label: 'Putting', value: teamAverages.sgPutting },
    ].filter((entry) => entry.value !== null);

    if (teamSgEntries.length > 0) {
      const teamWeakness = teamSgEntries.reduce((worst, entry) =>
        (entry.value as number) < (worst.value as number) ? entry : worst
      );
      if ((teamWeakness.value as number) < -0.3) {
        insightsWithSeverity.push({
          insight: {
            headline: `Team focus: ${teamWeakness.label} is the biggest drag`,
            body: `Team SG ${teamWeakness.label} averages ${formatSigned(teamWeakness.value as number)} per round, the lowest category on the roster.`,
            callToAction: `Prioritize practice plans that lift ${teamWeakness.label.toLowerCase()} performance.`,
            tone: 'cautionary',
            confidence: 0.7,
          },
          severity: Math.abs(teamWeakness.value as number),
        });
      }
    }
  }

  for (const player of players) {
    const stats = statsByPlayer.get(player.id);
    if (!stats) continue;

    const rounds = stats.rounds_in_calculation ?? 0;
    if (rounds < 5) continue;

    const playerName = playerNameById.get(player.id) ?? 'Player';
    const confidence = computeInsightConfidence(rounds);

    const playerInsights: Array<{ insight: ComposedInsight; severity: number }> = [];

    if (philosophy.showStrokesGained) {
      const sgMetrics = [
        {
          key: 'strokes_gained_tee',
          label: 'Off the Tee',
          value: stats.strokes_gained_tee,
          action: 'Emphasize fairway-finding lines and tee shot dispersion control.',
          teamAvg: teamAverages.sgTee,
        },
        {
          key: 'strokes_gained_approach',
          label: 'Approach',
          value: stats.strokes_gained_approach,
          action: 'Focus on approach proximity and GIR conversion.',
          teamAvg: teamAverages.sgApproach,
        },
        {
          key: 'strokes_gained_around_green',
          label: 'Around the Green',
          value: stats.strokes_gained_around_green,
          action: 'Sharpen short game reps and up-and-down efficiency.',
          teamAvg: teamAverages.sgAround,
        },
        {
          key: 'strokes_gained_putting',
          label: 'Putting',
          value: stats.strokes_gained_putting,
          action: 'Reduce three-putts with speed control and start-line work.',
          teamAvg: teamAverages.sgPutting,
        },
      ].filter((metric) => metric.value !== null);

      if (sgMetrics.length > 0) {
        const worst = sgMetrics.reduce((a, b) =>
          (a.value as number) < (b.value as number) ? a : b
        );
        const best = sgMetrics.reduce((a, b) =>
          (a.value as number) > (b.value as number) ? a : b
        );

        if ((worst.value as number) <= -0.5) {
          const delta =
            worst.teamAvg != null
              ? ` (${formatSigned((worst.value as number) - worst.teamAvg)} vs team avg ${formatSigned(worst.teamAvg)})`
              : '';
          playerInsights.push({
            insight: {
              headline: `${playerName}: ${worst.label} is costing strokes`,
              body: `SG ${worst.label} is ${formatSigned(worst.value as number)} per round${delta}.`,
              callToAction: worst.action,
              tone: 'cautionary',
              confidence,
            },
            severity: Math.abs(worst.value as number),
          });
        }

        if ((best.value as number) >= 0.5) {
          const delta =
            best.teamAvg != null
              ? ` (${formatSigned((best.value as number) - best.teamAvg)} vs team avg ${formatSigned(best.teamAvg)})`
              : '';
          playerInsights.push({
            insight: {
              headline: `${playerName}: ${best.label} is a clear strength`,
              body: `SG ${best.label} is ${formatSigned(best.value as number)} per round${delta}.`,
              callToAction: `Keep reinforcing ${best.label.toLowerCase()} strengths in practice plans.`,
              tone: 'celebratory',
              confidence,
            },
            severity: Math.abs(best.value as number),
          });
        }
      }
    }

    if (philosophy.showAdvancedStats) {
      const advancedMetrics = [
        {
          key: 'gir_percentage',
          label: 'GIR%',
          value: stats.gir_percentage,
          teamAvg: teamAverages.gir,
          thresholdDiff: 8,
          thresholdAbsolute: 50,
          higherIsBetter: true,
          action: 'Dial in approach targets to raise greens-in-regulation.',
        },
        {
          key: 'driving_accuracy_percentage',
          label: 'Fairway%',
          value: stats.driving_accuracy_percentage,
          teamAvg: teamAverages.fairway,
          thresholdDiff: 8,
          thresholdAbsolute: 50,
          higherIsBetter: true,
          action: 'Prioritize tee shot accuracy to set up scoring chances.',
        },
        {
          key: 'scrambling_percentage',
          label: 'Scrambling%',
          value: stats.scrambling_percentage,
          teamAvg: teamAverages.scrambling,
          thresholdDiff: 8,
          thresholdAbsolute: 45,
          higherIsBetter: true,
          action: 'Work on up-and-down conversion from inside 40 yards.',
        },
        {
          key: 'putts_per_round',
          label: 'Putts per round',
          value: stats.putts_per_round,
          teamAvg: teamAverages.putts,
          thresholdDiff: 1,
          thresholdAbsolute: 33.5,
          higherIsBetter: false,
          action: 'Focus on lag putting and three-putt avoidance.',
        },
      ].filter((metric) => metric.value !== null);

      for (const metric of advancedMetrics) {
        const value = metric.value as number;
        const teamAvg = metric.teamAvg;
        const delta = teamAvg != null
          ? metric.higherIsBetter
            ? teamAvg - value
            : value - teamAvg
          : null;
        const diffTrigger = delta != null && delta >= metric.thresholdDiff;
        const absoluteTrigger = metric.higherIsBetter
          ? value <= metric.thresholdAbsolute
          : value >= metric.thresholdAbsolute;

        if (diffTrigger || absoluteTrigger) {
          const detail = teamAvg != null
            ? ` vs team avg ${metric.higherIsBetter ? formatPercent(teamAvg) : teamAvg.toFixed(1)}`
            : '';
          const formattedValue = metric.higherIsBetter
            ? formatPercent(value)
            : value.toFixed(1);

          const severity = delta != null
            ? Math.abs(delta)
            : Math.abs(value - metric.thresholdAbsolute);

          playerInsights.push({
            insight: {
              headline: `${playerName}: ${metric.label} is lagging`,
              body: `${metric.label} is ${formattedValue}${detail}.`,
              callToAction: metric.action,
              tone: 'cautionary',
              confidence,
            },
            severity,
          });
        }
      }
    }

    if (playerInsights.length > 0) {
      playerInsights.sort((a, b) => b.severity - a.severity);
      insightsWithSeverity.push(...playerInsights.slice(0, 2));
    }
  }

  return insightsWithSeverity
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 8)
    .map((entry) => entry.insight);
}
