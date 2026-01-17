'use server';

/**
 * Pattern Management Server Actions
 *
 * Server actions for managing AI-detected patterns:
 * - Fetching team/player patterns
 * - Validating patterns (coach confirms AI finding)
 * - Dismissing patterns (pattern is incorrect)
 * - Resolving patterns (issue has been addressed)
 * - Creating focus areas from patterns
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MinedPattern, PatternTrend } from '@/lib/coachhelm/v2/types';

// ============================================================================
// TYPES
// ============================================================================

/** Pattern lifecycle state */
export type PatternLifecycleState =
  | 'detected'    // AI just found it
  | 'confirmed'   // Coach validated it's real
  | 'addressed'   // Working on fixing it
  | 'resolved'    // Issue fixed
  | 'dismissed';  // Pattern was incorrect/irrelevant

/** Pattern severity level */
export type PatternSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Pattern filter options */
export interface PatternFilters {
  playerId?: string;
  patternType?: string;
  lifecycleState?: PatternLifecycleState;
  severity?: PatternSeverity;
  isActive?: boolean;
}

/** Pattern with extended metadata for UI */
export interface ExtendedPattern extends MinedPattern {
  lifecycleState: PatternLifecycleState;
  severity: PatternSeverity;
  coachNotes?: string;
  validatedAt?: string;
  validatedBy?: string;
  addressedAt?: string;
  resolvedAt?: string;
  dismissedAt?: string;
  dismissedReason?: string;
  playerName?: string;
  playerAvatarUrl?: string | null;
}

/** Pattern validation input */
export interface PatternValidation {
  isAccurate: boolean;
  severity: PatternSeverity;
  notes?: string;
  createFocusArea?: boolean;
}

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

interface PatternDbRow {
  id: string;
  player_id: string;
  pattern_type: string;
  conditions: unknown;
  outcome: unknown;
  support: number;
  confidence: number;
  lift: number;
  conviction: number;
  stroke_impact: number;
  actionability: number;
  sample_size: number;
  first_detected: string;
  last_occurrence: string;
  occurrence_count: number;
  trend: string;
  is_active: boolean;
  lifecycle_state?: string;
  severity?: string;
  coach_notes?: string;
  validated_at?: string;
  validated_by?: string;
  addressed_at?: string;
  resolved_at?: string;
  dismissed_at?: string;
  dismissed_reason?: string;
  metadata?: {
    description?: string;
    recommendation?: string;
  };
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Calculate severity from stroke impact */
function calculateSeverity(strokeImpact: number): PatternSeverity {
  const absImpact = Math.abs(strokeImpact);
  if (absImpact >= 2.5) return 'critical';
  if (absImpact >= 1.5) return 'high';
  if (absImpact >= 0.8) return 'medium';
  return 'low';
}

/** Transform database row to ExtendedPattern */
function transformPatternRow(
  row: PatternDbRow,
  playerInfo?: { first_name?: string | null; last_name?: string | null; avatar_url?: string | null }
): ExtendedPattern {
  const playerName = playerInfo
    ? [playerInfo.first_name, playerInfo.last_name].filter(Boolean).join(' ').trim()
    : undefined;

  return {
    id: row.id,
    playerId: row.player_id,
    patternType: row.pattern_type as MinedPattern['patternType'],
    conditions: row.conditions as MinedPattern['conditions'],
    outcome: row.outcome as MinedPattern['outcome'],
    support: row.support,
    confidence: row.confidence,
    lift: row.lift,
    conviction: row.conviction,
    strokeImpact: row.stroke_impact,
    actionability: row.actionability,
    sampleSize: row.sample_size,
    firstDetected: row.first_detected,
    lastOccurrence: row.last_occurrence,
    occurrenceCount: row.occurrence_count,
    trend: row.trend as PatternTrend,
    isActive: row.is_active,
    description: row.metadata?.description,
    recommendation: row.metadata?.recommendation,
    lifecycleState: (row.lifecycle_state as PatternLifecycleState) || 'detected',
    severity: (row.severity as PatternSeverity) || calculateSeverity(row.stroke_impact),
    coachNotes: row.coach_notes,
    validatedAt: row.validated_at,
    validatedBy: row.validated_by,
    addressedAt: row.addressed_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
    dismissedReason: row.dismissed_reason,
    playerName,
    playerAvatarUrl: playerInfo?.avatar_url,
  };
}

// ============================================================================
// GET TEAM PATTERNS
// ============================================================================

export async function getTeamPatterns(
  filters?: PatternFilters
): Promise<{
  success: boolean;
  patterns?: ExtendedPattern[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get current coach and team
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
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

    // Get team player IDs
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    const playerIds = (teamMembers || []).map(m => m.player_id);
    if (playerIds.length === 0) {
      return { success: true, patterns: [] };
    }

    // Get players for names/avatars
    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .in('id', playerIds);

    const playerMap = new Map(
      (players || []).map(p => [p.id, p])
    );

    // Build patterns query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('golf_patterns_v2' as any) as any)
      .select('*')
      .in('player_id', playerIds);

    // Apply filters
    if (filters?.playerId) {
      query = query.eq('player_id', filters.playerId);
    }
    if (filters?.patternType) {
      query = query.eq('pattern_type', filters.patternType);
    }
    if (filters?.lifecycleState) {
      query = query.eq('lifecycle_state', filters.lifecycleState);
    }
    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }

    query = query.order('stroke_impact', { ascending: false });

    const { data: patterns, error } = await query;

    if (error) {
      console.error('[Pattern Management] Error fetching patterns:', error);
      return { success: true, patterns: [] };
    }

    const transformedPatterns = (patterns || []).map((row: PatternDbRow) =>
      transformPatternRow(row, playerMap.get(row.player_id))
    );

    return { success: true, patterns: transformedPatterns };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET PLAYER PATTERNS (WITH EXTENDED DATA)
// ============================================================================

export async function getPlayerPatternsExtended(
  playerId: string
): Promise<{
  success: boolean;
  patterns?: ExtendedPattern[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get player info
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url')
      .eq('id', playerId)
      .single();

    // Get patterns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: patterns, error } = await (supabase.from('golf_patterns_v2' as any) as any)
      .select('*')
      .eq('player_id', playerId)
      .order('stroke_impact', { ascending: false });

    if (error) {
      console.error('[Pattern Management] Error fetching player patterns:', error);
      return { success: true, patterns: [] };
    }

    const transformedPatterns = (patterns || []).map((row: PatternDbRow) =>
      transformPatternRow(row, player || undefined)
    );

    return { success: true, patterns: transformedPatterns };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// VALIDATE PATTERN
// ============================================================================

export async function validatePattern(
  patternId: string,
  validation: PatternValidation
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const updateData: Record<string, unknown> = {
      lifecycle_state: validation.isAccurate ? 'confirmed' : 'dismissed',
      severity: validation.severity,
      validated_at: new Date().toISOString(),
      validated_by: coach.id,
      updated_at: new Date().toISOString(),
    };

    if (validation.notes) {
      updateData.coach_notes = validation.notes;
    }

    if (!validation.isAccurate) {
      updateData.dismissed_at = new Date().toISOString();
      updateData.dismissed_reason = 'Coach marked as inaccurate';
      updateData.is_active = false;
    }

    const { error } = await patternsTable
      .update(updateData)
      .eq('id', patternId);

    if (error) {
      console.error('[Pattern Management] Error validating pattern:', error);
      return { success: false, error: 'Failed to validate pattern' };
    }

    // Optionally create focus area from pattern
    if (validation.isAccurate && validation.createFocusArea) {
      await createFocusAreaFromPatternInternal(patternId, coach.id);
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// DISMISS PATTERN
// ============================================================================

export async function dismissPattern(
  patternId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const { error } = await patternsTable
      .update({
        lifecycle_state: 'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason || 'Dismissed by coach',
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patternId);

    if (error) {
      console.error('[Pattern Management] Error dismissing pattern:', error);
      return { success: false, error: 'Failed to dismiss pattern' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// MARK PATTERN AS ADDRESSED
// ============================================================================

export async function markPatternAddressed(
  patternId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const updateData: Record<string, unknown> = {
      lifecycle_state: 'addressed',
      addressed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updateData.coach_notes = notes;
    }

    const { error } = await patternsTable
      .update(updateData)
      .eq('id', patternId);

    if (error) {
      console.error('[Pattern Management] Error marking pattern addressed:', error);
      return { success: false, error: 'Failed to update pattern' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// RESOLVE PATTERN
// ============================================================================

export async function resolvePattern(
  patternId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const updateData: Record<string, unknown> = {
      lifecycle_state: 'resolved',
      resolved_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updateData.coach_notes = notes;
    }

    const { error } = await patternsTable
      .update(updateData)
      .eq('id', patternId);

    if (error) {
      console.error('[Pattern Management] Error resolving pattern:', error);
      return { success: false, error: 'Failed to resolve pattern' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// CREATE FOCUS AREA FROM PATTERN
// ============================================================================

async function createFocusAreaFromPatternInternal(
  patternId: string,
  coachId: string
): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  const supabase = await createClient();

  try {
    // Get the pattern
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const { data: pattern, error: patternError } = await patternsTable
      .select('*')
      .eq('id', patternId)
      .single();

    if (patternError || !pattern) {
      return { success: false, error: 'Pattern not found' };
    }

    const typedPattern = pattern as PatternDbRow;

    // Determine category from pattern conditions
    const conditions = typedPattern.conditions as Array<{ field?: string; label?: string }> | undefined;
    const condition = conditions?.[0];
    let category = 'general';

    if (condition?.field) {
      const fieldLower = condition.field.toLowerCase();
      if (fieldLower.includes('putt')) category = 'putting';
      else if (fieldLower.includes('gir') || fieldLower.includes('approach')) category = 'approach';
      else if (fieldLower.includes('drive') || fieldLower.includes('fairway')) category = 'driving';
      else if (fieldLower.includes('chip') || fieldLower.includes('short')) category = 'short_game';
      else if (fieldLower.includes('mental') || fieldLower.includes('pressure')) category = 'mental';
    }

    // Create focus area
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const focusAreasTable = supabase.from('golf_player_focus_areas' as any) as any;

    const { data: focusArea, error: insertError } = await focusAreasTable
      .insert({
        player_id: typedPattern.player_id,
        category,
        title: typedPattern.metadata?.description || 'Pattern-Based Focus Area',
        description: typedPattern.metadata?.recommendation || 'Work on this area based on detected pattern.',
        priority: typedPattern.stroke_impact >= 1.5 ? 1 : typedPattern.stroke_impact >= 1 ? 2 : 3,
        status: 'active',
        source: 'pattern',
        source_id: patternId,
        created_by: coachId,
        target_improvement: `Reduce ${Math.abs(typedPattern.stroke_impact).toFixed(1)} strokes`,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Pattern Management] Error creating focus area:', insertError);
      return { success: false, error: 'Failed to create focus area' };
    }

    return { success: true, focusAreaId: focusArea?.id };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export async function createFocusAreaFromPattern(
  patternId: string,
  playerId: string
): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    const result = await createFocusAreaFromPatternInternal(patternId, coach.id);

    if (result.success) {
      revalidatePath('/golf/dashboard/patterns');
      revalidatePath(`/golf/dashboard/roster/${playerId}`);
    }

    return result;
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// UPDATE PATTERN NOTES
// ============================================================================

export async function updatePatternNotes(
  patternId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patternsTable = supabase.from('golf_patterns_v2' as any) as any;

    const { error } = await patternsTable
      .update({
        coach_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patternId);

    if (error) {
      console.error('[Pattern Management] Error updating notes:', error);
      return { success: false, error: 'Failed to update notes' };
    }

    revalidatePath('/golf/dashboard/patterns');
    return { success: true };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET PATTERN STATS
// ============================================================================

export async function getPatternStats(): Promise<{
  success: boolean;
  stats?: {
    total: number;
    detected: number;
    confirmed: number;
    addressed: number;
    resolved: number;
    dismissed: number;
    byPlayer: Array<{
      playerId: string;
      playerName: string;
      count: number;
    }>;
    byType: Record<string, number>;
    bySeverity: Record<PatternSeverity, number>;
  };
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
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

    // Get team player IDs
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    const playerIds = (teamMembers || []).map(m => m.player_id);
    if (playerIds.length === 0) {
      return {
        success: true,
        stats: {
          total: 0,
          detected: 0,
          confirmed: 0,
          addressed: 0,
          resolved: 0,
          dismissed: 0,
          byPlayer: [],
          byType: {},
          bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
        },
      };
    }

    // Get players for names
    const { data: players } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    const playerMap = new Map(
      (players || []).map(p => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()])
    );

    // Get all patterns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: patterns, error } = await (supabase.from('golf_patterns_v2' as any) as any)
      .select('player_id, pattern_type, lifecycle_state, severity, stroke_impact')
      .in('player_id', playerIds);

    if (error) {
      console.error('[Pattern Management] Error fetching pattern stats:', error);
      return { success: true, stats: {
        total: 0,
        detected: 0,
        confirmed: 0,
        addressed: 0,
        resolved: 0,
        dismissed: 0,
        byPlayer: [],
        byType: {},
        bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      }};
    }

    // Calculate stats
    const typedPatterns = (patterns || []) as Array<{
      player_id: string;
      pattern_type: string;
      lifecycle_state?: string;
      severity?: string;
      stroke_impact: number;
    }>;

    const stats = {
      total: typedPatterns.length,
      detected: typedPatterns.filter(p => !p.lifecycle_state || p.lifecycle_state === 'detected').length,
      confirmed: typedPatterns.filter(p => p.lifecycle_state === 'confirmed').length,
      addressed: typedPatterns.filter(p => p.lifecycle_state === 'addressed').length,
      resolved: typedPatterns.filter(p => p.lifecycle_state === 'resolved').length,
      dismissed: typedPatterns.filter(p => p.lifecycle_state === 'dismissed').length,
      byPlayer: [] as Array<{ playerId: string; playerName: string; count: number }>,
      byType: {} as Record<string, number>,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<PatternSeverity, number>,
    };

    // Count by player
    const playerCounts = new Map<string, number>();
    for (const pattern of typedPatterns) {
      playerCounts.set(pattern.player_id, (playerCounts.get(pattern.player_id) || 0) + 1);
    }
    stats.byPlayer = Array.from(playerCounts.entries()).map(([playerId, count]) => ({
      playerId,
      playerName: playerMap.get(playerId) || 'Unknown',
      count,
    }));

    // Count by type
    for (const pattern of typedPatterns) {
      stats.byType[pattern.pattern_type] = (stats.byType[pattern.pattern_type] || 0) + 1;
    }

    // Count by severity
    for (const pattern of typedPatterns) {
      const severity = (pattern.severity as PatternSeverity) || calculateSeverity(pattern.stroke_impact);
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    }

    return { success: true, stats };
  } catch (error) {
    console.error('[Pattern Management] Unexpected error:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
