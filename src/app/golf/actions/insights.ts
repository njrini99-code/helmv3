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

// Re-export types for consumers
export type { ComposedInsight, MinedPattern, PerformancePrediction, PlayerAnalysis };

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

    // 3. Get team players via golf_team_members
    const { data: teamMembers, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId);

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

    // 5. Analyze each player with V2 engine (parallelized)
    const analysisPromises = players.map(async (player) => {
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
    });

    const analysisResults = await Promise.all(analysisPromises);

    // 6. Convert V2 insights to InsightRecords
    let totalInsightsCreated = 0;
    const allInsights: InsightRecord[] = [];

    for (const result of analysisResults) {
      if (!result.success || !result.analysis) continue;

      const { player, analysis } = result;

      // Convert each V2 insight
      for (let i = 0; i < analysis.insights.length; i++) {
        const insight = analysis.insights[i];
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

        // Check for duplicates
        const insightKey = `${player.id}:${record.insight_type}`;
        if (!existingInsightKeys.has(insightKey)) {
          allInsights.push(record);
          existingInsightKeys.add(insightKey);
          totalInsightsCreated++;
        }
      }

      // Also add pattern-specific insights if high impact
      for (const pattern of analysis.patterns.filter(p => p.isActive && p.strokeImpact > 1)) {
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
      .eq('team_id', teamId);

    const playerIds = (teamMembers || []).map(m => m.player_id);

    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // 4. Analyze each player with V2 engine - PARALLELIZED for performance
    const allInsights: ComposedInsight[] = [];
    const allPatterns: MinedPattern[] = [];
    const allPredictions: Array<PerformancePrediction & { playerName?: string }> = [];

    // Prepare player analysis tasks
    const analysisPromises = players.map(async (player) => {
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
    });

    // Execute all analyses in parallel
    const analysisResults = await Promise.all(analysisPromises);

    // Aggregate results
    let playersAnalyzed = 0;
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
      }
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
    await logTable.insert({
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
    }).catch(() => { /* Table may not exist */ });

    // 7. Revalidate dashboard
    revalidatePath('/golf/dashboard');

    return {
      success: true,
      insights: allInsights,
      patterns: allPatterns,
      predictions: allPredictions,
      playersAnalyzed,
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
