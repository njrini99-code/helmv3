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
import { describeError } from '@/lib/utils/describe-error';

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

/**
 * Lifecycle states a focus area's mutating actions (complete / log progress /
 * record outcome) may act on. 'active' and 'in_progress' are the two the
 * coach/player create-flow ever puts a row into for live work; 'paused' is
 * included too since it's already treated as "still being worked" by the
 * my-development loader's own active-bucket query (`status === 'active' ||
 * 'in_progress' || 'paused'`) even though no control currently sets it.
 * Excluded: 'proposed' (coach-prescribed, not yet accepted by the player —
 * the improvement window hasn't started) and 'declined' (player explicitly
 * rejected it). Acting on either would silently fabricate progress/outcomes
 * on work the player never actually did.
 */
const ACTIONABLE_FOCUS_AREA_STATUSES = ['active', 'in_progress', 'paused'] as const;

/**
 * Returns a human error when `status` is NOT one of the actionable lifecycle
 * states above, or null when the write may proceed.
 */
function focusAreaLifecycleError(status: string | null | undefined): string | null {
  if (status && (ACTIONABLE_FOCUS_AREA_STATUSES as readonly string[]).includes(status)) {
    return null;
  }
  if (status === 'proposed') return "This focus area hasn't been accepted by the player yet.";
  if (status === 'declined') return 'This focus area was declined by the player.';
  if (status === 'completed') return 'This focus area is already completed.';
  return 'This focus area cannot be updated in its current state.';
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
    await logServerError(`Failed to create focus area: ${describeError(error)}`, { action: 'development.createFocusArea' });
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
    await logServerError(`[createFocusArea] Notification error (non-fatal): ${describeError(notifErr)}`, { action: 'development.createFocusArea' });
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  // Defense-in-depth: both legacy routes are permanent-redirect shims onto the
  // Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the canonical
  // destinations too so a coach/player landed there already sees this write
  // (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/intelligence');
  revalidatePath('/golf/dashboard/coachhelm');

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
      `Failed to create player focus area: ${describeError(error)}`,
      { action: 'development.createPlayerFocusArea' },
    );
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  // Defense-in-depth: both legacy routes are permanent-redirect shims onto the
  // Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the canonical
  // destinations too (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
      `Failed to accept focus area: ${describeError(error)}`,
      { action: 'development.acceptFocusArea' },
    );
    return { success: false, error: 'Failed to accept. Please try again.' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { success: false, error: 'Focus area not found or no longer pending' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  // Defense-in-depth: both legacy routes are permanent-redirect shims onto the
  // Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the canonical
  // destinations too (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
      `Failed to decline focus area: ${describeError(error)}`,
      { action: 'development.declineFocusArea' },
    );
    return { success: false, error: 'Failed to decline. Please try again.' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { success: false, error: 'Focus area not found or no longer pending' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  // Defense-in-depth: both legacy routes are permanent-redirect shims onto the
  // Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the canonical
  // destinations too (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
    await logServerError(`Failed to update focus area: ${describeError(error)}`, { action: 'development.updateFocusArea' });
    return { success: false, error: 'Failed to update focus area. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');
  // Defense-in-depth: /development, /insights, and /my-development are all
  // permanent-redirect shims onto the Spine & Stage homes (2026-07-19, plan
  // Task 9) — revalidate the canonical destinations too (pattern: v3/goals.ts
  // createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
    await logServerError(`Failed to delete focus area: ${describeError(error)}`, { action: 'development.deleteFocusArea' });
    return { success: false, error: 'Failed to delete focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  // Defense-in-depth: both legacy routes are permanent-redirect shims onto the
  // Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the canonical
  // destinations too (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
    .select('player_id, progress_notes, status')
    .eq('id', id)
    .maybeSingle();

  if (!focusArea?.player_id) {
    return { success: false, error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(focusArea.player_id, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  // Lifecycle guard: a 'proposed' (not yet accepted) or 'declined' area can't
  // take progress — see ACTIONABLE_FOCUS_AREA_STATUSES.
  const lifecycleError = focusAreaLifecycleError(focusArea.status);
  if (lifecycleError) {
    return { success: false, error: lifecycleError };
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
  // matching no rows returns error:null. The status filter is a defense-in-depth
  // mirror of the lifecycle guard above (closes a select-then-update race).
  const { data: updated, error } = await fromUntyped(supabase, 'golf_player_focus_areas')
    .update(updatePayload)
    .eq('id', id)
    .in('status', ACTIONABLE_FOCUS_AREA_STATUSES)
    .select('id');

  if (error) {
    await logServerError(`Failed to update focus area progress: ${describeError(error)}`, { action: 'development.updateFocusAreaProgress' });
    return { success: false, error: 'Failed to update progress. Please try again.' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');
  // Defense-in-depth: /development, /insights, and /my-development are all
  // permanent-redirect shims onto the Spine & Stage homes (2026-07-19, plan
  // Task 9) — revalidate the canonical destinations too (pattern:
  // v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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

  // Lifecycle guard: a 'proposed' (not yet accepted) or 'declined' area can't
  // be marked complete — see ACTIONABLE_FOCUS_AREA_STATUSES.
  const lifecycleError = focusAreaLifecycleError(focusArea.status);
  if (lifecycleError) {
    return { success: false, error: lifecycleError };
  }

  const nowIso = new Date().toISOString();
  // Select the updated row back so a 0-row update (id mismatch) surfaces as a
  // failure rather than a false {success:true} — a PostgREST UPDATE matching no
  // rows returns error:null. The status filter is a defense-in-depth mirror of
  // the lifecycle guard above (closes a select-then-update race).
  const { data: updated, error } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', focusAreaId)
    .in('status', ACTIONABLE_FOCUS_AREA_STATUSES)
    .select('id');

  if (error) {
    await logServerError(`Failed to complete focus area: ${describeError(error)}`, { action: 'development.completeFocusArea' });
    return { success: false, error: 'Failed to mark complete. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');
  // Defense-in-depth: /development, /insights, and /my-development are all
  // permanent-redirect shims onto the Spine & Stage homes (2026-07-19, plan
  // Task 9) — revalidate the canonical destinations too (pattern:
  // v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
    await logServerError(`Failed to reactivate focus area: ${describeError(error)}`, { action: 'development.reactivateFocusArea' });
    return { success: false, error: 'Failed to reopen. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');
  // Defense-in-depth: /development, /insights, and /my-development are all
  // permanent-redirect shims onto the Spine & Stage homes (2026-07-19, plan
  // Task 9) — revalidate the canonical destinations too (pattern:
  // v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
 * Sets `from_review_id`. `status`/`started_at` follow the same consent model
 * as `createFocusAreaImpl`: a COACH promoting a review into a focus area is
 * PRESCRIBING it (status='proposed', started_at=null — the player must accept
 * before the improvement window starts); a PLAYER promoting their own review
 * needs no consent step (status='active', started_at=now()).
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

  // A coach promoting is a PRESCRIPTION (proposed, pending accept); a player
  // promoting their own review needs no consent step (active immediately).
  const isCoachPromoting = access.reason === 'coach';
  const nowIso = new Date().toISOString();
  const insertPayload = {
    player_id: args.playerId,
    team_id: teamId,
    coach_id: coachId,
    area_type: args.areaType,
    title: args.title,
    description: args.description,
    status: (isCoachPromoting ? 'proposed' : 'active') as 'proposed' | 'active',
    target_metric: args.targetMetric ?? null,
    target_value: args.targetValue ?? null,
    from_review_id: args.reviewId,
    review_context: args.reviewContext ?? null,
    started_at: isCoachPromoting ? null : nowIso,
  };
  // RLS on golf_player_focus_areas has a COACH-ONLY insert policy and NO player
  // self-insert policy. A coach's write satisfies that policy via the scoped
  // client. A PLAYER self-promoting (verifyPlayerAccess reason==='self', which
  // already proved the authed user owns args.playerId) has no policy to satisfy,
  // so route that write through the service-role admin client — the verified
  // self-ownership above is the sole gate (mirrors createPlayerFocusAreaImpl).
  // Without this, every player self-promote from Round Review was silently
  // rejected by RLS (the "Add focus area" button did nothing).
  const { data: row, error } = isCoachPromoting
    ? await supabase.from('golf_player_focus_areas').insert(insertPayload).select('id').single()
    : await fromUntyped(createAdminClient(), 'golf_player_focus_areas').insert(insertPayload).select('id').single();

  if (error || !row) {
    await logServerError(
      `Failed to create focus area from review: ${describeError(error)}`,
      { action: 'development.createFocusAreaFromReview' }
    );
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  // Defense-in-depth: both legacy routes are permanent-redirect shims onto the
  // Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the canonical
  // destinations too (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
 * Sets `from_insight_id`. `status`/`started_at` follow the same consent model
 * as `createFocusAreaImpl`: a COACH promoting an insight into a focus area
 * (e.g. via `PromoteToFocusAreaButton` on the Players tab) is PRESCRIBING it
 * (status='proposed', started_at=null — the player must accept before the
 * improvement window starts); a PLAYER promoting their own insight needs no
 * consent step (status='active', started_at=now()).
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

  // A coach promoting is a PRESCRIPTION (proposed, pending accept); a player
  // promoting their own insight needs no consent step (active immediately).
  const isCoachPromoting = access.reason === 'coach';
  const nowIso = new Date().toISOString();
  const insertPayload = {
    player_id: args.playerId,
    team_id: teamId,
    coach_id: coachId,
    area_type: args.areaType,
    title: args.title,
    description: args.description,
    status: (isCoachPromoting ? 'proposed' : 'active') as 'proposed' | 'active',
    target_metric: args.targetMetric ?? null,
    target_value: args.targetValue ?? null,
    from_insight_id: args.insightId,
    started_at: isCoachPromoting ? null : nowIso,
  };
  // Same RLS gap as createFocusAreaFromReviewImpl: coach-only insert policy, no
  // player self-insert policy. Player self-promote (verifyPlayerAccess
  // reason==='self', ownership proven) routes through the admin client; coach
  // stays on the scoped client. Without this, promoting your own CoachHelm/Hub
  // insight to a focus area was silently rejected by RLS.
  const { data: row, error } = isCoachPromoting
    ? await supabase.from('golf_player_focus_areas').insert(insertPayload).select('id').single()
    : await fromUntyped(createAdminClient(), 'golf_player_focus_areas').insert(insertPayload).select('id').single();

  if (error || !row) {
    await logServerError(
      `Failed to create focus area from insight (v2): ${describeError(error)}`,
      { action: 'development.createFocusAreaFromInsightV2' }
    );
    return { success: false, error: 'Failed to create focus area. Please try again.' };
  }

  // P1-12: creating a focus area FROM an insight is a real coach action on that
  // insight — record it (failure-silent) so the effectiveness rollup counts it.
  await recordInsightAction({
    insight_id: args.insightId,
    player_id: args.playerId,
    actor_id: user.id,
    // DS: this path is reachable by a player self-promoting their own insight
    // (access.reason === 'self'), which was hardcoded to 'coach' — derive from
    // the same isCoachPromoting branch used above for status/started_at.
    actor_role: isCoachPromoting ? 'coach' : 'player',
    action_type: 'create_focus',
    metadata: { focus_area_id: row.id },
  });

  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/insights');
  // Defense-in-depth: /my-development, /development, and /insights are all
  // permanent-redirect shims onto the Spine & Stage homes (2026-07-19, plan
  // Task 9) — revalidate the canonical destinations too (pattern:
  // v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
  /**
   * Optional explicit area_type override. When the caller has already
   * resolved a category — e.g. the coach edited FocusAreaModal's Category
   * picker before confirming a "Prescribe focus area" click (see
   * triage/PromoteToFocusAreaButton.tsx) — trust it verbatim instead of the
   * insight_type/metadata-derived guess below. An explicit coach choice must
   * win outright: silently overriding it with a server guess would break
   * "what you see in the modal is what saves." Omitted (every pre-existing
   * caller) keeps the original derived behavior unchanged.
   */
  area_type?: string;
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

  // Determine the area type based on insight type and metadata — unless the
  // caller already resolved one explicitly (see `area_type` doc above). An
  // explicit choice wins outright: overriding it with a metadata-derived
  // guess would silently discard what the coach just confirmed in the modal.
  const areaType = data.area_type
    ? data.area_type
    : refineAreaTypeFromMetadata(
        mapInsightTypeToAreaType(data.insight_type),
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
      // A coach prescription must enter the same consent lifecycle as every
      // other coach-created focus area (createFocusArea, ...FromReview,
      // ...FromInsightV2): it stays proposed until the player accepts it.
      // This legacy path is coach-only (golf_coaches row required above), so
      // it must never silently create active work on the player's behalf.
      status: 'proposed',
      target_metric: data.target_metric || null,
      current_value: data.current_value ?? null,
      target_value: data.target_value ?? null,
      from_insight_id: data.insight_id,
      started_at: null,
    })
    .select('id')
    .single();

  if (insertError) {
    await logServerError(`Failed to create focus area from insight: ${describeError(insertError)}`, { action: 'development.createFocusAreaFromInsight' });
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
  await recordInsightAction({
    insight_id: data.insight_id,
    player_id: data.player_id,
    actor_id: user.id,
    // DS: unlike createFocusAreaFromInsightV2, this legacy path requires a
    // resolved golf_coaches row above (no player self-promotion branch
    // exists here), so 'coach' is always correct.
    actor_role: 'coach',
    action_type: 'create_focus',
    metadata: { focus_area_id: focusArea.id },
  });

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/alerts');
  // Defense-in-depth: /development, /my-development, /insights, and /alerts
  // are all permanent-redirect shims onto the Spine & Stage homes
  // (2026-07-19, plan Task 9) — revalidate the canonical destinations too
  // (pattern: v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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

  // Look up the focus area: we need its player (for the ownership guard), its
  // status (for the lifecycle guard), and its originating insight (the row
  // whose outcome we credit).
  const { data: focusArea } = await supabase
    .from('golf_player_focus_areas')
    .select('player_id, from_insight_id, status')
    .eq('id', focusAreaId)
    .maybeSingle();

  if (!focusArea?.player_id) {
    return { success: false, error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(focusArea.player_id, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  // Lifecycle guard: a 'proposed' (not yet accepted) or 'declined' area has no
  // real outcome to record — see ACTIONABLE_FOCUS_AREA_STATUSES.
  const lifecycleError = focusAreaLifecycleError(focusArea.status);
  if (lifecycleError) {
    return { success: false, error: lifecycleError };
  }

  const nowIso = new Date().toISOString();

  // Always mark the focus area completed (the outcome resolves the work).
  // Select the updated row back so a 0-row update (status changed out from
  // under us since the select above) surfaces as a failure rather than a false
  // {success:true} — a PostgREST UPDATE matching no rows returns error:null.
  const { data: faUpdated, error: faError } = await supabase
    .from('golf_player_focus_areas')
    .update({
      status: 'completed',
      completed_at: nowIso,
      updated_at: nowIso,
      // Persist the verdict on the focus area ITSELF (column added by migration
      // 20260621140000 for exactly this) — previously it was written only to the
      // source insight, so a focus area with no from_insight_id silently lost its
      // Improved/No-change/Worsened outcome. Now the Dev-Plans outcome tally can
      // read it directly, insight-join only as a legacy fallback.
      outcome_status: outcome,
    })
    .eq('id', focusAreaId)
    .in('status', ACTIONABLE_FOCUS_AREA_STATUSES)
    .select('id');

  if (faError) {
    await logServerError(`Failed to complete focus area on outcome: ${describeError(faError)}`, { action: 'development.recordFocusAreaOutcome' });
    return { success: false, error: 'Failed to record outcome. Please try again.' };
  }

  if (!faUpdated || faUpdated.length === 0) {
    return { success: false, error: 'Focus area not found or not permitted' };
  }

  // No source insight → nothing to credit. Soft-notice, still a success.
  if (!focusArea.from_insight_id) {
    revalidatePath('/golf/dashboard/development');
    revalidatePath('/golf/dashboard/my-development');
    // Defense-in-depth: both legacy routes are permanent-redirect shims onto
    // the Spine & Stage homes (2026-07-19, plan Task 9) — revalidate the
    // canonical destinations too (pattern: v3/goals.ts createGoal/createTeamGoal).
    revalidatePath('/golf/dashboard/coachhelm');
    revalidatePath('/golf/dashboard/intelligence');
    return {
      success: true,
      notice: 'Outcome recorded on this focus area. (No source insight to also credit.)',
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
    await logServerError(`Failed to credit insight outcome: ${describeError(insightError)}`, { action: 'development.recordFocusAreaOutcome' });
    // The focus area is already completed; surface the partial failure honestly.
    return { success: false, error: 'Outcome saved on the focus area, but crediting the source insight failed. Please try again.' };
  }

  revalidatePath('/golf/dashboard/development');
  revalidatePath('/golf/dashboard/my-development');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/analytics/coachhelm');
  // Defense-in-depth: /development, /insights, and /my-development are all
  // permanent-redirect shims onto the Spine & Stage homes (2026-07-19, plan
  // Task 9) — revalidate the canonical destinations too (pattern:
  // v3/goals.ts createGoal/createTeamGoal).
  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/intelligence');

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
