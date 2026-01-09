'use server';

// ============================================================================
// COACHHELM V2 INTELLIGENCE - SERVER ACTIONS
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { 
  coachHelmIntelligence,
  isCoachHelmEnabledForCoach,
  isCoachHelmEnabledForPlayer,
} from '@/lib/coachhelm/v2';
import type { PlayerAnalysis, ComposedInsight, MinedPattern, PerformancePrediction } from '@/lib/coachhelm/v2/types';

// ============================================================================
// ANALYZE PLAYER (V2 FULL ANALYSIS)
// ============================================================================

export async function analyzePlayerV2(
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
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE V2 TEAM INSIGHTS
// ============================================================================

export async function generateTeamInsightsV2(): Promise<{
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

    // 2. Check if CoachHelm is enabled
    const status = await isCoachHelmEnabledForCoach(coach.id);
    if (!status.effectivelyEnabled) {
      return { success: false, error: status.disabledReason || 'CoachHelm is disabled' };
    }

    // 3. Get all players on team
    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('team_id', coach.team_id);

    if (playersError || !players || players.length === 0) {
      return { success: false, error: 'No players found' };
    }

    // 4. Analyze each player with V2 engine
    const allInsights: ComposedInsight[] = [];
    const allPatterns: MinedPattern[] = [];
    const allPredictions: Array<PerformancePrediction & { playerName?: string }> = [];
    let playersAnalyzed = 0;

    for (const player of players) {
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

        if (analysis) {
          playersAnalyzed++;
          
          // Collect insights
          if (analysis.insights) {
            allInsights.push(...analysis.insights);
          }

          // Collect patterns
          if (analysis.patterns) {
            allPatterns.push(...analysis.patterns.filter(p => p.isActive));
          }

          if (analysis.predictions) {
            for (const prediction of analysis.predictions) {
              allPredictions.push({
                ...prediction,
                playerName: playerName || undefined,
              });
            }
          }
        }
      } catch {
        // Continue with other players
      }
    }

    // 5. Generate team-level alerts
    const teamAlerts = await coachHelmIntelligence.generateAlerts(coach.id, coach.team_id);
    if (teamAlerts.length > 0) {
      allInsights.push(...teamAlerts);
    }

    // 6. Log generation
    const executionTime = Date.now() - startTime;

    // Log generation (table may not exist in dev)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logTable = supabase.from('golf_insight_generation_log' as any) as any;
    await logTable.insert({
      coach_id: coach.id,
      generation_type: 'v2_intelligence',
      insights_created: allInsights.length,
      focus_areas_updated: 0,
      players_analyzed: playersAnalyzed,
      execution_time_ms: executionTime,
      metadata: {
        patterns_found: allPatterns.length,
        engine_version: 'v2',
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
  } catch {
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
  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GENERATE ROUND REVIEW (V2)
// ============================================================================

export async function generateRoundReviewV2(
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
  } catch {
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
  } catch {
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
  } catch {
    return { success: false, enabled: true };
  }
}
