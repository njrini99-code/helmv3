'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { notifyDevPlanAssigned } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { recordInsightAction } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// TYPES
// ============================================================================

export interface DevelopmentActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * The TIMEFRAME bound on a focus area's measurable target (Feature F).
 * `date` → hit the target by `target_date`; `rounds` → within `target_rounds`.
 * All three live in not-yet-propagated DB columns (migration
 * 20260621230000_focus_areas_timeframe.sql) so writes route through
 * `fromUntyped` until the generated Database types catch up.
 */
export type FocusAreaTargetKind = 'date' | 'rounds';

interface FocusAreaTimeframeFields {
  /** 'date' | 'rounds' | null (no timeframe). */
  target_kind?: FocusAreaTargetKind | null;
  /** ISO date (YYYY-MM-DD) when target_kind === 'date', else null. */
  target_date?: string | null;
  /** Round count when target_kind === 'rounds', else null. */
  target_rounds?: number | null;
}

interface CreateFocusAreaData extends FocusAreaTimeframeFields {
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
  /**
   * Lifecycle on create. A coach creating an area is PRESCRIBING it, so the
   * default is `'proposed'` — the player must accept (→ `'active'`) before the
   * improvement window starts. Pass `'active'` explicitly only when the coach
   * and player are setting it up together and it should start immediately.
   * `started_at` is deferred (null) until acceptance for proposed areas.
   */
  status?: 'active' | 'proposed';
}

interface UpdateFocusAreaData extends FocusAreaTimeframeFields {
  area_type?: string;
  title?: string;
  description?: string | null;
  status?: string;
  target_metric?: string | null;
  current_value?: number | null;
  target_value?: number | null;
  completed_at?: string | null;
}

/**
 * Normalize the three timeframe fields into a coherent insert/update fragment:
 *  - target_kind === 'date'   → keep target_date, force target_rounds = null
 *  - target_kind === 'rounds' → keep target_rounds, force target_date = null
 *  - anything else            → clear all three (no timeframe)
 * Returns an object suitable for spreading into an untyped insert/update payload.
 */
function normalizeTimeframe(
  data: FocusAreaTimeframeFields,
): { target_kind: FocusAreaTargetKind | null; target_date: string | null; target_rounds: number | null } {
  if (data.target_kind === 'date') {
    return { target_kind: 'date', target_date: data.target_date ?? null, target_rounds: null };
  }
  if (data.target_kind === 'rounds') {
    return {
      target_kind: 'rounds',
      target_date: null,
      target_rounds:
        typeof data.target_rounds === 'number' && Number.isFinite(data.target_rounds)
          ? data.target_rounds
          : null,
    };
  }
  return { target_kind: null, target_date: null, target_rounds: null };
}

// ============================================================================
// FOCUS AREA OPERATIONS
// ============================================================================

/**
 * Create a new focus area for a player
 * Only coaches who manage the player can create focus areas
 */
async function createFocusAreaImpl(
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

  // Verify coach manages this player via team membership. Resolve the coach's
  // ACTIVE team (cookie-aware; toggle-safe for a two-team program) rather than
  // assuming the org has a single team — the old org-filtered .maybeSingle()
  // throws/nulls when an org runs both a men's and a women's team.
  if (coach.organization_id && data.player_id) {
    const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);

    if (teamId) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('player_id', data.player_id)
        .eq('status', 'active')
        .maybeSingle();

      if (!membership) {
        return { success: false, error: 'Player is not an active member on your team' };
      }
    }
  }

  // Coach create == prescription. Default to 'proposed' (player must accept),
  // and defer started_at until acceptance so the improvement window begins when
  // the player commits — not when the coach drafts it. Pass status:'active'
  // explicitly to start immediately (e.g. coach + player setting it up together).
  const status = data.status ?? 'proposed';
  const startedAt = status === 'active' ? new Date().toISOString() : null;

  // Timeframe columns (target_kind/target_date/target_rounds) are not yet in the
  // generated Database types (migration 20260621230000), so route the insert
  // through fromUntyped to persist them without an as-any cast scattered inline.
  const { error } = await fromUntyped(supabase, 'golf_player_focus_areas').insert({
    player_id: data.player_id,
    coach_id: data.coach_id,
    area_type: data.area_type,
    title: data.title,
    description: data.description,
    status,
    target_metric: data.target_metric,
    current_value: data.current_value,
    target_value: data.target_value,
    started_at: startedAt,
    from_insight_id: data.from_insight_id ?? null,
    ...normalizeTimeframe(data),
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

const observedCreateFocusArea = withAdminObserved(
  'createFocusArea',
  { sport: 'golf', feature: 'development_plans_coach' },
  createFocusAreaImpl,
);

export async function createFocusArea(data: CreateFocusAreaData): Promise<DevelopmentActionResult> {
  return observedCreateFocusArea(data);
}

/**
 * Player self-create: a player sets their OWN focus area (status='active',
 * no coach attribution). The improvement window starts immediately.
 *
 * RLS has a coach-only INSERT policy and NO player self-insert policy, so this
 * runs through the service-role admin client and enforces ownership in code:
 * the caller's authenticated user must own the target `golf_players` row. The
 * admin client bypasses RLS, so this manual check is the ONLY thing gating the
 * write — keep it strict.
 */
async function createPlayerFocusAreaImpl(
  data: Omit<CreateFocusAreaData, 'coach_id' | 'status'>,
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Ownership: the authenticated user must own this player profile. Resolve the
  // player from the user (don't trust the caller-supplied player_id blindly),
  // then require it to match.
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerError || !player) {
    return { success: false, error: 'Only players can create their own focus areas' };
  }
  if (player.id !== data.player_id) {
    return { success: false, error: 'You can only create focus areas for yourself' };
  }

  // Service-role client: RLS has no player self-insert policy. The ownership
  // check above is the gate — the player_id is forced to the resolved profile.
  const admin = createAdminClient();
  const { error } = await fromUntyped(admin, 'golf_player_focus_areas').insert({
    player_id: player.id,
    coach_id: null,
    area_type: data.area_type,
    title: data.title,
    description: data.description,
    status: 'active',
    target_metric: data.target_metric,
    current_value: data.current_value,
    target_value: data.target_value,
    started_at: new Date().toISOString(),
    from_insight_id: data.from_insight_id ?? null,
    ...normalizeTimeframe(data),
  });

  if (error) {
    await logServerError(
      `Failed to create player focus area: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'development.createPlayerFocusArea' },
    );
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');

  return { success: true };
}

const observedCreatePlayerFocusArea = withAdminObserved(
  'createPlayerFocusArea',
  { sport: 'golf', feature: 'development_plans_coach' },
  createPlayerFocusAreaImpl,
);

export async function createPlayerFocusArea(data: Omit<CreateFocusAreaData, 'coach_id' | 'status'>): Promise<DevelopmentActionResult> {
  return observedCreatePlayerFocusArea(data);
}

/**
 * Player accepts a coach-prescribed focus area: 'proposed' → 'active', and the
 * improvement window starts now (started_at = now). Idempotent-safe: only a row
 * the player owns AND that is currently 'proposed' is flipped; anything else
 * (already active, not yours, missing) is a no-op failure via the select-back
 * guard. Uses the RLS client — the player UPDATE policy gates it to own rows.
 */
async function acceptFocusAreaImpl(
  id: string,
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await fromUntyped(supabase, 'golf_player_focus_areas')
    .update({ status: 'active', started_at: nowIso, updated_at: nowIso })
    .eq('id', id)
    .eq('status', 'proposed')
    .select('id');

  if (error) {
    await logServerError(
      `Failed to accept focus area: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'development.acceptFocusArea' },
    );
    return { success: false, error: 'Failed to accept. Please try again.' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { success: false, error: 'Focus area not found or no longer pending' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');

  return { success: true };
}

const observedAcceptFocusArea = withAdminObserved(
  'acceptFocusArea',
  { sport: 'golf', feature: 'my_development' },
  acceptFocusAreaImpl,
);

export async function acceptFocusArea(id: string): Promise<DevelopmentActionResult> {
  return observedAcceptFocusArea(id);
}

/**
 * Player declines a coach-prescribed focus area: 'proposed' → 'declined'.
 * Mirror of {@link acceptFocusArea} — RLS-gated to the player's own rows, only
 * acts on a currently-'proposed' row, select-back guard surfaces a 0-row update.
 */
async function declineFocusAreaImpl(
  id: string,
): Promise<DevelopmentActionResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await fromUntyped(supabase, 'golf_player_focus_areas')
    .update({ status: 'declined', updated_at: nowIso })
    .eq('id', id)
    .eq('status', 'proposed')
    .select('id');

  if (error) {
    await logServerError(
      `Failed to decline focus area: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'development.declineFocusArea' },
    );
    return { success: false, error: 'Failed to decline. Please try again.' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { success: false, error: 'Focus area not found or no longer pending' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');

  return { success: true };
}

const observedDeclineFocusArea = withAdminObserved(
  'declineFocusArea',
  { sport: 'golf', feature: 'my_development' },
  declineFocusAreaImpl,
);

export async function declineFocusArea(id: string): Promise<DevelopmentActionResult> {
  return observedDeclineFocusArea(id);
}

/**
 * Update an existing focus area
 * Only the coach who created it can update focus areas
 */
async function updateFocusAreaImpl(
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

  // Split the timeframe fields out so a partial update only touches them when the
  // caller actually sent one (an absent target_kind means "leave timeframe as-is",
  // not "clear it"). The remaining fields update as before.
  const { target_kind, target_date, target_rounds, ...rest } = data;
  const sentTimeframe =
    'target_kind' in data || 'target_date' in data || 'target_rounds' in data;
  const updatePayload: Record<string, unknown> = {
    ...rest,
    updated_at: new Date().toISOString(),
  };
  if (sentTimeframe) {
    Object.assign(updatePayload, normalizeTimeframe({ target_kind, target_date, target_rounds }));
  }

  // Verify the focus area belongs to this coach. Select the updated row back so
  // a scope mismatch (0 rows matched by .eq('coach_id', ...)) surfaces as a
  // failure instead of a false {success:true} — a PostgREST UPDATE matching no
  // rows returns error:null. Routed through fromUntyped because the timeframe
  // columns are not yet in the generated Database types (migration 20260621230000).
  const { data: updated, error } = await fromUntyped(supabase, 'golf_player_focus_areas')
    .update(updatePayload)
    .eq('id', id)
    .eq('coach_id', coach.id)
    .select('id');

  if (error) {
    await logServerError(`Failed to update focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.updateFocusArea' });
    return { success: false, error: 'Failed to update focus area. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');

  return { success: true };
}

const observedUpdateFocusArea = withAdminObserved(
  'updateFocusArea',
  { sport: 'golf', feature: 'development_plans_coach' },
  updateFocusAreaImpl,
);

export async function updateFocusArea(id: string, data: UpdateFocusAreaData): Promise<DevelopmentActionResult> {
  return observedUpdateFocusArea(id, data);
}

/**
 * Delete a focus area
 * Only the coach who created it can delete focus areas
 */
async function deleteFocusAreaImpl(id: string): Promise<DevelopmentActionResult> {
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

const observedDeleteFocusArea = withAdminObserved(
  'deleteFocusArea',
  { sport: 'golf', feature: 'development_plans_coach' },
  deleteFocusAreaImpl,
);

export async function deleteFocusArea(id: string): Promise<DevelopmentActionResult> {
  return observedDeleteFocusArea(id);
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
async function updateFocusAreaProgressImpl(
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

  // Select the updated row back so a scope/id mismatch (0 rows matched) surfaces
  // as a failure rather than a false {success:true} — a PostgREST UPDATE
  // matching no rows returns error:null.
  const { data: updated, error } = await fromUntyped(supabase, 'golf_player_focus_areas')
    .update(updatePayload)
    .eq('id', id)
    .select('id');

  if (error) {
    await logServerError(`Failed to update focus area progress: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.updateFocusAreaProgress' });
    return { success: false, error: 'Failed to update progress. Please try again.' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');

  return { success: true };
}

const observedUpdateFocusAreaProgress = withAdminObserved(
  'updateFocusAreaProgress',
  { sport: 'golf', feature: 'my_development' },
  updateFocusAreaProgressImpl,
);

export async function updateFocusAreaProgress(id: string, currentValue: number, options?: { note?: string }): Promise<{ success: boolean; error?: string }> {
  return observedUpdateFocusAreaProgress(id, currentValue, options);
}

/**
 * Mark a focus area as completed.
 * Caller must be the player whose focus area it is, or a coach staffing
 * any team that player is on.
 */
async function completeFocusAreaImpl(
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
  // Select the updated row back so a 0-row update (id mismatch) surfaces as a
  // failure rather than a false {success:true} — a PostgREST UPDATE matching no
  // rows returns error:null.
  const { data: updated, error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', focusAreaId)
    .select('id');

  if (error) {
    await logServerError(`Failed to complete focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.completeFocusArea' });
    return { success: false, error: 'Failed to mark complete. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');

  return { success: true };
}

const observedCompleteFocusArea = withAdminObserved(
  'completeFocusArea',
  { sport: 'golf', feature: 'development_plans_coach' },
  completeFocusAreaImpl,
);

export async function completeFocusArea(focusAreaId: string): Promise<{ success: boolean; error?: string }> {
  return observedCompleteFocusArea(focusAreaId);
}

/**
 * Reactivate (re-open) a completed focus area.
 *
 * The inverse of `completeFocusArea` — used to recover from an accidental
 * "Mark complete" tap (toast Undo) and to re-open a finished area from the
 * completed list. Sets `status='active'` and clears `completed_at`. Mirrors the
 * same auth + access checks and the select-back guard so a 0-row update (id
 * mismatch / not permitted) surfaces as a failure rather than a false success.
 */
async function reactivateFocusAreaImpl(
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
  const { data: updated, error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'active',
      completed_at: null,
      updated_at: nowIso,
    })
    .eq('id', focusAreaId)
    .select('id');

  if (error) {
    await logServerError(`Failed to reactivate focus area: ${error instanceof Error ? error.message : String(error)}`, { action: 'development.reactivateFocusArea' });
    return { success: false, error: 'Failed to reopen. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');

  return { success: true };
}

const observedReactivateFocusArea = withAdminObserved(
  'reactivateFocusArea',
  { sport: 'golf', feature: 'development_plans_coach' },
  reactivateFocusAreaImpl,
);

export async function reactivateFocusArea(focusAreaId: string): Promise<{ success: boolean; error?: string }> {
  return observedReactivateFocusArea(focusAreaId);
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
async function createFocusAreaFromReviewImpl(
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

const observedCreateFocusAreaFromReview = withAdminObserved(
  'createFocusAreaFromReview',
  { sport: 'golf', feature: 'development_plans_coach' },
  createFocusAreaFromReviewImpl,
);

export async function createFocusAreaFromReview(args: CreateFocusAreaFromReviewArgs): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  return observedCreateFocusAreaFromReview(args);
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
async function createFocusAreaFromInsightV2Impl(
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

  // P1-12: creating a focus area FROM an insight is a real coach action on that
  // insight — record it (failure-silent) so the effectiveness rollup counts it.
  void recordInsightAction({
    insight_id: args.insightId,
    player_id: args.playerId,
    actor_id: user.id,
    actor_role: 'coach',
    action_type: 'create_focus',
    metadata: { focus_area_id: row.id },
  });

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/insights');

  return { success: true, focusAreaId: row.id };
}

const observedCreateFocusAreaFromInsightV2 = withAdminObserved(
  'createFocusAreaFromInsightV2',
  { sport: 'golf', feature: 'development_plans_coach' },
  createFocusAreaFromInsightV2Impl,
);

export async function createFocusAreaFromInsightV2(args: CreateFocusAreaFromInsightArgsV2): Promise<{ success: boolean; focusAreaId?: string; error?: string }> {
  return observedCreateFocusAreaFromInsightV2(args);
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
async function createFocusAreaFromInsightImpl(
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

  // Verify coach has access to the target player (closes 2026-05-23 audit
  // finding: function previously trusted caller-supplied player_id/coach_id,
  // letting a coach forge focus areas against any player on any team).
  const access = await verifyPlayerAccess(data.player_id, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Not authorized to create a focus area for this player' };
  }

  // Always derive coach_id from auth — never trust the caller-supplied value.
  const coachId = coach.id;

  // Fetch the insight to get its metadata (live columns: metadata, content).
  // Also fetch team_id so we can scope the acknowledge update below.
  const { data: insight, error: insightError } = await supabase
    .from('golf_coach_insights')
    .select('metadata, content, team_id')
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
      coach_id: coachId,
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

  // Acknowledge the insight (mark as "acknowledged" since action was taken).
  // Scope by team_id from the fetched insight so a malformed insight_id
  // can't be used to acknowledge an unrelated row.
  const ackQuery = supabase
    .from('golf_coach_insights')
    .update({
      status: 'acknowledged',
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', data.insight_id);
  await (insight?.team_id ? ackQuery.eq('team_id', insight.team_id) : ackQuery);

  // P1-12: record the focus-area creation as a real action on the source
  // insight (failure-silent). Only a confirmed insert of an authorized row
  // reaches here, so a non-action can never be counted as one.
  void recordInsightAction({
    insight_id: data.insight_id,
    player_id: data.player_id,
    actor_id: user.id,
    actor_role: 'coach',
    action_type: 'create_focus',
    metadata: { focus_area_id: focusArea.id },
  });

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/alerts');

  return { success: true, data: { focusAreaId: focusArea.id } };
}

const observedCreateFocusAreaFromInsight = withAdminObserved(
  'createFocusAreaFromInsight',
  { sport: 'golf', feature: 'development_plans_coach' },
  createFocusAreaFromInsightImpl,
);

export async function createFocusAreaFromInsight(data: CreateFocusAreaFromInsightData): Promise<DevelopmentActionResult<{ focusAreaId: string }>> {
  return observedCreateFocusAreaFromInsight(data);
}

// ============================================================================
// RECORD FOCUS-AREA OUTCOME (closes the effectiveness write loop)
// ============================================================================

/**
 * Allowed outcome verdicts a coach can record against a focus area.
 * These map 1:1 onto the values the CoachHelm effectiveness reader expects in
 * `golf_coach_insights.outcome_status`.
 */
export type FocusAreaOutcome = 'improved' | 'no_change' | 'worsened';

/**
 * Record the measured outcome of a focus area and credit its source insight.
 *
 * Closes the effectiveness write loop that the CoachHelm Effectiveness reader
 * depends on. Behavior:
 *   1. Look up the focus area by id to get `from_insight_id` (and `player_id`
 *      for the same ownership guard the other writers use).
 *   2. If `from_insight_id` is present, UPDATE the originating insight:
 *        outcome_status = <outcome>, outcome_measured_at = now(),
 *        action_taken = true  (these are the exact live columns the reader uses).
 *   3. ALSO mark the focus area `status='completed'` (the work is resolved).
 *   4. If `from_insight_id` is null, just complete the focus area and return a
 *      soft notice (there is no insight to credit).
 *
 * Authz mirrors `completeFocusArea`: caller must be the player whose focus area
 * it is, or a coach staffing any team that player is on. Return shape matches
 * the other simple writers in this file: { success, error? } (+ optional notice).
 */
async function recordFocusAreaOutcomeImpl(
  focusAreaId: string,
  outcome: FocusAreaOutcome
): Promise<{ success: boolean; error?: string; notice?: string }> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Look up the focus area: we need its player (for the ownership guard) and
  // its originating insight (the row whose outcome we credit).
  const { data: focusArea } = await supabase
    .from('golf_player_focus_areas')
    .select('player_id, from_insight_id')
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

  // Always mark the focus area completed (the outcome resolves the work).
  const { error: faError } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', focusAreaId);

  if (faError) {
    await logServerError(`Failed to complete focus area on outcome: ${faError instanceof Error ? faError.message : String(faError)}`, { action: 'development.recordFocusAreaOutcome' });
    return { success: false, error: 'Failed to record outcome. Please try again.' };
  }

  // No source insight → nothing to credit. Soft-notice, still a success.
  if (!focusArea.from_insight_id) {
    revalidatePath('/golf/dashboard/development');
    revalidatePath('/golf/dashboard/my-development');
    return {
      success: true,
      notice: 'Outcome recorded. This focus area had no source insight to credit.',
    };
  }

  // Credit the originating insight — the exact columns the effectiveness reader
  // consumes (outcome_status / outcome_measured_at / action_taken).
  const { error: insightError } = await supabase
    .from('golf_coach_insights')
    .update({
      outcome_status: outcome,
      outcome_measured_at: nowIso,
      action_taken: true,
    })
    .eq('id', focusArea.from_insight_id);

  if (insightError) {
    await logServerError(`Failed to credit insight outcome: ${insightError instanceof Error ? insightError.message : String(insightError)}`, { action: 'development.recordFocusAreaOutcome' });
    // The focus area is already completed; surface the partial failure honestly.
    return { success: false, error: 'Outcome saved on the focus area, but crediting the source insight failed. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');

  return { success: true };
}

const observedRecordFocusAreaOutcome = withAdminObserved(
  'recordFocusAreaOutcome',
  { sport: 'golf', feature: 'development_plans_coach' },
  recordFocusAreaOutcomeImpl,
);

export async function recordFocusAreaOutcome(focusAreaId: string, outcome: FocusAreaOutcome): Promise<{ success: boolean; error?: string; notice?: string }> {
  return observedRecordFocusAreaOutcome(focusAreaId, outcome);
}

// ============================================================================
// RESOLVE INSIGHT WITH FOCUS AREA COMPLETION
// ============================================================================
// `resolveFocusAreaAndInsight` removed 2026-04-27 — orphaned export with no
// callers in src/. Use `completeFocusArea` (above) for player-driven completion.
