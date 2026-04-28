'use server';

import { createClient } from '@/lib/supabase/server';
import { notifyDevPlanAssigned } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';

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
  /** Canonical live-schema column name. The old `source_insight_id` does not exist. */
  from_insight_id?: string | null;
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
    .select('id, organization_id, full_name')
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
        .eq('status', 'active')
        .maybeSingle();

      if (!membership) {
        return { success: false, error: 'Player is not an active member on your team' };
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
    from_insight_id: data.from_insight_id ?? null,
  });

  if (error) {
    await logServerError(`Failed to create focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.createFocusArea' });
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  // Notify the player (fire-and-forget)
  try {
    const { data: playerRow } = await supabase
      .from('golf_players')
      .select('user_id')
      .eq('id', data.player_id)
      .single();

    if (playerRow?.user_id) {
      const { data: userRow } = await supabase
        .from('users')
        .select('email')
        .eq('id', playerRow.user_id)
        .single();

      if (userRow?.email) {
        await notifyDevPlanAssigned(
          playerRow.user_id,
          userRow.email,
          data.title,
          data.area_type,
          coach.full_name?.trim() || 'Your Coach'
        );
      }
    }
  } catch (notifErr) {
    await logServerError(`[createFocusArea] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'development.createFocusArea' });
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
    await logServerError(`Failed to update focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.updateFocusArea' });
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
    await logServerError(`Failed to delete focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.deleteFocusArea' });
    return { success: false, error: 'Failed to delete focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Shape of the per-row `progress_notes` jsonb column.
 * Locked schema: `{ entries: [{ at: ISO ts, value: number, note: string|null }] }`.
 *
 * Kept non-exported because this module has the `'use server'` directive,
 * which requires every export to be an async function.
 */
interface ProgressNoteEntry {
  at: string;
  value: number;
  note: string | null;
}
interface ProgressNotes {
  entries: ProgressNoteEntry[];
}

/**
 * Update progress on a focus area
 * Players or coaches can update progress
 *
 * When `options.note` is a non-empty trimmed string, an entry is appended to
 * the row's `progress_notes` jsonb column via read-modify-write:
 *   { at: <ISO now>, value: <newValue>, note: <trimmed note> }
 */
export async function updateFocusAreaProgress(
  id: string,
  currentValue: number,
  options?: { note?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Ownership guard: look up the focus area's player and verify either the
  // player-self or a staff coach is making the update.
  const { data: focusArea } = await supabase
    .from('golf_player_focus_areas')
    .select('player_id, progress_notes')
    .eq('id', id)
    .maybeSingle();

  if (!focusArea?.player_id) {
    return { success: false, error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(focusArea.player_id, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  // Build the update payload. Always bump current_value + updated_at.
  // `progress_notes` is typed as Json | null in the generated DB types.
  const updatePayload: Record<string, unknown> = {
    current_value: currentValue,
    updated_at: new Date().toISOString(),
  };

  // Append a progress_notes entry only when a non-empty note is supplied.
  const trimmedNote = options?.note?.trim();
  if (trimmedNote) {
    const existingRaw = focusArea.progress_notes as ProgressNotes | null | undefined;
    const existingEntries: ProgressNoteEntry[] = Array.isArray(existingRaw?.entries)
      ? existingRaw!.entries
      : [];
    const newEntry: ProgressNoteEntry = {
      at: new Date().toISOString(),
      value: currentValue,
      note: trimmedNote,
    };
    const next: ProgressNotes = { entries: [...existingEntries, newEntry] };
    updatePayload.progress_notes = next;
  }

  const { error } = await supabase
    .from('golf_player_focus_areas')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    await logServerError(`Failed to update focus area progress: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.updateFocusAreaProgress' });
    return { success: false, error: 'Failed to update progress. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Mark a focus area as completed.
 * Caller must be the player whose focus area it is, or a coach staffing
 * any team that player is on.
 */
export async function completeFocusArea(
  focusAreaId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: focusArea } = await supabase
    .from('golf_player_focus_areas')
    .select('player_id, status')
    .eq('id', focusAreaId)
    .maybeSingle();

  if (!focusArea?.player_id) {
    return { success: false, error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(focusArea.player_id, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', focusAreaId);

  if (error) {
    await logServerError(`Failed to complete focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.completeFocusArea' });
    return { success: false, error: 'Failed to mark complete. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

/**
 * Resolve a player's current team + a coach to attribute a new focus area to.
 * Returns the first active team membership for the player.
 * `coach_id` falls back to whichever coach staffs that team (any one), or null.
 */
async function resolvePlayerTeamAndCoach(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
): Promise<{ teamId: string | null; coachId: string | null }> {
  const { data: membership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const teamId = membership?.team_id ?? null;
  if (!teamId) return { teamId: null, coachId: null };

  const { data: staff } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id')
    .eq('team_id', teamId)
    .limit(1)
    .maybeSingle();

  return { teamId, coachId: staff?.coach_id ?? null };
}

interface CreateFocusAreaFromReviewArgs {
  playerId: string;
  reviewId: string;
  title: string;
  description: string;
  areaType: string;
  targetMetric?: string;
  targetValue?: number;
  reviewContext?: string;
}

/**
 * Insert a new focus area whose source is a round review.
 * Sets `from_review_id`, `status='active'`, `started_at=now()`.
 * Resolves `team_id` and `coach_id` from the player's current active team.
 *
 * NOTE: This is the new (camelCase-args) variant added per the My Development
 * spec. There is also an older `createFocusAreaFromReview` in
 * `round-reviews.ts` with a different signature; both can coexist because
 * consumers import by module path.
 */
export async function createFocusAreaFromReview(
  args: CreateFocusAreaFromReviewArgs
): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Authz: caller must be the player or a coach who staffs one of their teams.
  const access = await verifyPlayerAccess(args.playerId, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  const { teamId, coachId } = await resolvePlayerTeamAndCoach(supabase, args.playerId);

  const nowIso = new Date().toISOString();
  const { data: row, error } = await supabase
    .from('golf_player_focus_areas')
    .insert({
      player_id: args.playerId,
      team_id: teamId,
      coach_id: coachId,
      area_type: args.areaType,
      title: args.title,
      description: args.description,
      status: 'active',
      target_metric: args.targetMetric ?? null,
      target_value: args.targetValue ?? null,
      from_review_id: args.reviewId,
      review_context: args.reviewContext ?? null,
      started_at: nowIso,
    })
    .select('id')
    .single();

  if (error || !row) {
    await logServerError(
      `Failed to create focus area from review: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'development.createFocusAreaFromReview' }
    );
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');

  return { success: true, focusAreaId: row.id };
}

interface CreateFocusAreaFromInsightArgsV2 {
  playerId: string;
  insightId: string;
  title: string;
  description: string;
  areaType: string;
  targetMetric?: string;
  targetValue?: number;
}

/**
 * Insert a new focus area whose source is a CoachHelm insight.
 * Sets `from_insight_id`, `status='active'`, `started_at=now()`.
 * Resolves `team_id` and `coach_id` from the player's current active team.
 *
 * NOTE: This is the new (camelCase-args) variant added per the My Development
 * spec. The legacy `createFocusAreaFromInsight` (snake_case args) below is
 * preserved unchanged because many existing consumers depend on it.
 */
export async function createFocusAreaFromInsightV2(
  args: CreateFocusAreaFromInsightArgsV2
): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const access = await verifyPlayerAccess(args.playerId, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  const { teamId, coachId } = await resolvePlayerTeamAndCoach(supabase, args.playerId);

  const nowIso = new Date().toISOString();
  const { data: row, error } = await supabase
    .from('golf_player_focus_areas')
    .insert({
      player_id: args.playerId,
      team_id: teamId,
      coach_id: coachId,
      area_type: args.areaType,
      title: args.title,
      description: args.description,
      status: 'active',
      target_metric: args.targetMetric ?? null,
      target_value: args.targetValue ?? null,
      from_insight_id: args.insightId,
      started_at: nowIso,
    })
    .select('id')
    .single();

  if (error || !row) {
    await logServerError(
      `Failed to create focus area from insight (v2): ${error instanceof Error ? error.message : String(error)}`,
      { action: 'development.createFocusAreaFromInsightV2' }
    );
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/insights');

  return { success: true, focusAreaId: row.id };
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

  // Fetch the insight to get its metadata (live columns: metadata, content).
  const { data: insight, error: insightError } = await supabase
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

  // Create the focus area with link to source insight.
  // Live schema column is `from_insight_id`, not `source_insight_id`.
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
      from_insight_id: data.insight_id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    await logServerError(`Failed to create focus area from insight: ${insertError instanceof Error ? insertError.message : String(insertError)}`, { action: 'development.createFocusAreaFromInsight' });
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  // Acknowledge the insight (mark as "acknowledged" since action was taken)
  await supabase
    .from('golf_coach_insights')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', data.insight_id);

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/alerts');

  return { success: true, data: { focusAreaId: focusArea.id } };
}

// ============================================================================
// RESOLVE INSIGHT WITH FOCUS AREA COMPLETION
// ============================================================================
// `resolveFocusAreaAndInsight` removed 2026-04-27 — orphaned export with no
// callers in src/. Use `completeFocusArea` (above) for player-driven completion.
