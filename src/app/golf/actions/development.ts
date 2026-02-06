'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

export interface DevelopmentActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateFocusAreaData {
  player_id: string;
  coach_id: string;
  area_type: string;
  title: string;
  description: string | null;
  target_metric: string | null;
  current_value: number | null;
  target_value: number | null;
  source_insight_id?: string | null;
}

interface UpdateFocusAreaData {
  area_type?: string;
  title?: string;
  description?: string | null;
  status?: string;
  target_metric?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  completed_at?: string | null;
}

// ============================================================================
// FOCUS AREA OPERATIONS
// ============================================================================

/**
 * Create a new focus area for a player
 * Only coaches who manage the player can create focus areas
 */
export async function createFocusArea(
  data: CreateFocusAreaData
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach and has access to this player
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to create focus areas' };
  }

  // Verify coach manages this player via team membership
  if (coach.organization_id && data.player_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (orgTeam?.id) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', orgTeam.id)
        .eq('player_id', data.player_id)
        .maybeSingle();

      if (!membership) {
        return { success: false, error: 'Player is not on your team' };
      }
    }
  }

  const { error } = await supabase.from('golf_player_focus_areas').insert({
    player_id: data.player_id,
    coach_id: data.coach_id,
    area_type: data.area_type,
    title: data.title,
    description: data.description,
    status: 'active',
    target_metric: data.target_metric,
    current_value: data.current_value,
    target_value: data.target_value,
    started_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to create focus area:', error);
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Update an existing focus area
 * Only the coach who created it can update focus areas
 */
export async function updateFocusArea(
  id: string,
  data: UpdateFocusAreaData
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to update focus areas' };
  }

  // Verify the focus area belongs to this coach
  const { error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('coach_id', coach.id);

  if (error) {
    console.error('Failed to update focus area:', error);
    return { success: false, error: 'Failed to update focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Delete a focus area
 * Only the coach who created it can delete focus areas
 */
export async function deleteFocusArea(id: string): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to delete focus areas' };
  }

  // Only delete if this coach owns the focus area
  const { error } = await supabase
    .from('golf_player_focus_areas')
    .delete()
    .eq('id', id)
    .eq('coach_id', coach.id);

  if (error) {
    console.error('Failed to delete focus area:', error);
    return { success: false, error: 'Failed to delete focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Update progress on a focus area
 * Players or coaches can update progress
 */
export async function updateFocusAreaProgress(
  id: string,
  currentValue: number
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      current_value: currentValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Failed to update focus area progress:', error);
    return { success: false, error: 'Failed to update progress. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

// ============================================================================
// INSIGHT TYPE TO FOCUS AREA TYPE MAPPING
// ============================================================================

/**
 * Maps CoachHelm insight types to focus area types
 * This allows automatic categorization when creating focus areas from insights
 */
function mapInsightTypeToAreaType(insightType: string): string {
  const mapping: Record<string, string> = {
    // Scoring & performance insights
    scoring_decline: 'course_management',
    stat_regression: 'other',
    tournament_pressure: 'mental_game',
    plateau: 'other',
    bubble_player: 'mental_game',
    surge_player: 'other',
    streak: 'mental_game',

    // Specific weakness insights
    recurring_weakness: 'other', // Will be refined based on metadata
    closing_holes: 'mental_game',
    par_3_issues: 'iron_play',

    // Team-level insights
    team_trend: 'other',
    roster_recommendation: 'other',
  };

  return mapping[insightType] || 'other';
}

/**
 * Refines area type based on insight metadata
 * For recurring_weakness and stat_regression, we can get more specific
 */
function refineAreaTypeFromMetadata(
  baseType: string,
  insightType: string,
  metadata: Record<string, unknown> | null
): string {
  if (!metadata) return baseType;

  // For stat_regression, check which stat is declining
  if (insightType === 'stat_regression') {
    const statName = metadata.stat_name as string | undefined;
    if (statName) {
      if (statName.includes('putt') || statName.includes('putting')) return 'putting';
      if (statName.includes('gir') || statName.includes('approach')) return 'iron_play';
      if (statName.includes('fairway') || statName.includes('driving')) return 'driving';
      if (statName.includes('scrambl') || statName.includes('sand') || statName.includes('chip')) return 'short_game';
    }
  }

  // For recurring_weakness, check the weakness category
  if (insightType === 'recurring_weakness') {
    const weaknessArea = metadata.weakness_area as string | undefined;
    if (weaknessArea) {
      if (weaknessArea.includes('putt')) return 'putting';
      if (weaknessArea.includes('approach') || weaknessArea.includes('iron')) return 'iron_play';
      if (weaknessArea.includes('drive') || weaknessArea.includes('tee')) return 'driving';
      if (weaknessArea.includes('chip') || weaknessArea.includes('short')) return 'short_game';
      if (weaknessArea.includes('mental') || weaknessArea.includes('pressure')) return 'mental_game';
    }
  }

  return baseType;
}

// ============================================================================
// CREATE FOCUS AREA FROM INSIGHT
// ============================================================================

interface CreateFocusAreaFromInsightData {
  insight_id: string;
  player_id: string;
  coach_id: string;
  title: string;
  description: string | null;
  insight_type: string;
  target_metric?: string | null;
  current_value?: number | null;
  target_value?: number | null;
}

/**
 * Creates a focus area directly from a CoachHelm insight
 * Pre-populates fields based on insight data and links them together
 */
export async function createFocusAreaFromInsight(
  data: CreateFocusAreaFromInsightData
): Promise<DevelopmentActionResult<{ focusAreaId: string }>> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify user is a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Not authorized to create focus areas' };
  }

  // Fetch the insight to get its metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insight, error: insightError } = await (supabase as any)
    .from('golf_coach_insights')
    .select('metadata, content')
    .eq('id', data.insight_id)
    .single();

  if (insightError) {
    return { success: false, error: 'Failed to fetch insight details' };
  }

  // Determine the area type based on insight type and metadata
  const baseAreaType = mapInsightTypeToAreaType(data.insight_type);
  const areaType = refineAreaTypeFromMetadata(
    baseAreaType,
    data.insight_type,
    insight?.metadata as Record<string, unknown> | null
  );

  // Build description - combine provided description with recommendation if available
  let finalDescription = data.description || '';
  if (insight?.content && !finalDescription.includes(insight.content)) {
    finalDescription = finalDescription
      ? `${finalDescription}\n\nFrom insight: ${insight.content}`
      : insight.content;
  }

  // Create the focus area with link to source insight
  const { data: focusArea, error: insertError } = await supabase
    .from('golf_player_focus_areas')
    .insert({
      player_id: data.player_id,
      coach_id: data.coach_id,
      area_type: areaType,
      title: data.title,
      description: finalDescription || null,
      status: 'active',
      target_metric: data.target_metric || null,
      current_value: data.current_value ?? null,
      target_value: data.target_value ?? null,
      source_insight_id: data.insight_id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to create focus area from insight:', insertError);
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  // Acknowledge the insight (mark as "acknowledged" since action was taken)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('golf_coach_insights')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', data.insight_id);

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true, data: { focusAreaId: focusArea.id } };
}

// ============================================================================
// RESOLVE INSIGHT WITH FOCUS AREA COMPLETION
// ============================================================================

/**
 * When a focus area is completed, optionally resolve its linked insight
 */
export async function resolveFocusAreaAndInsight(
  focusAreaId: string
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the focus area with its source insight
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: focusArea, error: faError } = await (supabase as any)
    .from('golf_player_focus_areas')
    .select('id, source_insight_id')
    .eq('id', focusAreaId)
    .single() as { data: { id: string; source_insight_id?: string } | null; error: unknown };

  if (faError || !focusArea) {
    return { success: false, error: 'Focus area not found' };
  }

  // Mark focus area as completed
  const { error: updateError } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', focusAreaId);

  if (updateError) {
    return { success: false, error: 'Failed to complete focus area' };
  }

  // If there's a linked insight, resolve it
  if (focusArea.source_insight_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_coach_insights')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', focusArea.source_insight_id);
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}
