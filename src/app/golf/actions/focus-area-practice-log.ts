'use server';

// Addendum A8 slice 2 (folded into Pkg 9): persist actual practice
// completion and coach-authored review criteria against a focus area.
// Deliberately a NEW file, not development.ts — this feature is entirely
// behind coachhelm_focus_area_practice_log (default off everywhere) and
// its own migration (20260923110000_golf_focus_area_practice_log.sql,
// NOT yet applied to production), while development.ts is under active,
// concurrent edit by two other A8 slices (evidence_revision / evidence
// badge). Keeping this here avoids a guaranteed rebase conflict on a file
// neither slice needs to touch. Loader/UI wiring for either surface (the
// intelligence/coachhelm page loaders, FocusAreaCard) is deliberately OUT
// OF SCOPE for this file too, for the same reason — see
// memory/features/player-coachhelm-development.md.
//
// Every exported action below checks the flag FIRST, before any `.from()`
// call against either surface — while the flag is off, this module makes
// zero reads or writes of golf_player_focus_areas.criteria or
// golf_focus_area_practice_sessions.

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { isFlagEnabled } from '@/lib/flags';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const FLAG = 'coachhelm_focus_area_practice_log';

/**
 * Lifecycle states a focus area may log a practice session or take a
 * criteria edit against. Deliberately duplicated from development.ts's
 * `ACTIONABLE_FOCUS_AREA_STATUSES` (not imported) — that module is under
 * concurrent edit by two other in-flight A8 slices, and this small,
 * stable set is cheaper to keep in sync by eye than to risk a rebase
 * conflict over an import change to a shared, contested file.
 */
const ACTIONABLE_FOCUS_AREA_STATUSES = ['active', 'in_progress', 'paused'] as const;

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
// Practice sessions (append-only log)
// ============================================================================

export interface LogFocusAreaPracticeSessionInput {
  focusAreaId: string;
  /** Idempotency key: a retried/double-tapped submit with the same id is a
   *  no-op success, not a duplicate row (UNIQUE(focus_area_id, client_request_id)). */
  clientRequestId: string;
  drillId?: string | null;
  reps?: number | null;
  note?: string | null;
  /** ISO timestamp of when the practice happened; defaults to now(). */
  practicedAt?: string;
}

async function logFocusAreaPracticeSessionImpl(
  input: LogFocusAreaPracticeSessionInput,
): Promise<{ success: boolean; error?: string }> {
  if (!isFlagEnabled(FLAG)) {
    return { success: false, error: 'Not enabled' };
  }

  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: focusArea, error: focusAreaError } = await supabase
    .from('golf_player_focus_areas')
    .select('player_id, status')
    .eq('id', input.focusAreaId)
    .maybeSingle();

  if (focusAreaError) {
    await logServerError(
      `[focus-area-practice-log] focus-area read failed — denying, but this is an outage not a missing record: ${describeError(focusAreaError)}`,
      { action: 'focusAreaPracticeLog.ownership', featureArea: 'development' },
    );
    return { success: false, error: "Couldn't load this focus area. Please try again." };
  }

  if (!focusArea?.player_id) {
    return { success: false, error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(focusArea.player_id, user.id, supabase);
  if (!access.allowed) {
    return { success: false, error: 'Forbidden' };
  }

  const lifecycleError = focusAreaLifecycleError(focusArea.status);
  if (lifecycleError) {
    return { success: false, error: lifecycleError };
  }

  // logged_by_role is derived from the VERIFIED access result, never from
  // client input — `access.reason` is either 'self' (the caller IS the
  // player) or 'coach' (the caller staffs the player's active team); both
  // are the only two branches `verifyPlayerAccess` can return `allowed:
  // true` for.
  const loggedByRole = access.reason === 'coach' ? 'coach' : 'player';

  // ON CONFLICT DO NOTHING via ignoreDuplicates: a retried/double-tapped
  // submit with the same client_request_id matches zero rows and returns no
  // error — that MUST read as success, not as "not found" or a failure, or a
  // network retry would show the player a false error for a session that
  // was already logged.
  const { error } = await fromUntyped(supabase, 'golf_focus_area_practice_sessions')
    .upsert(
      {
        focus_area_id: input.focusAreaId,
        player_id: focusArea.player_id,
        logged_by_user_id: user.id,
        logged_by_role: loggedByRole,
        drill_id: input.drillId ?? null,
        reps: input.reps ?? null,
        note: input.note ?? null,
        practiced_at: input.practicedAt ?? new Date().toISOString(),
        client_request_id: input.clientRequestId,
      },
      { onConflict: 'focus_area_id,client_request_id', ignoreDuplicates: true },
    )
    .select('id');

  if (error) {
    await logServerError(`Failed to log practice session: ${describeError(error)}`, {
      action: 'focusAreaPracticeLog.log',
      featureArea: 'development',
    });
    return { success: false, error: 'Failed to log this session. Please try again.' };
  }

  return { success: true };
}

const observedLogFocusAreaPracticeSession = withAdminObserved(
  'logFocusAreaPracticeSession',
  { sport: 'golf', feature: 'development_plans_coach' },
  logFocusAreaPracticeSessionImpl,
);

export async function logFocusAreaPracticeSession(
  input: LogFocusAreaPracticeSessionInput,
): Promise<{ success: boolean; error?: string }> {
  return observedLogFocusAreaPracticeSession(input);
}

// ============================================================================
// Criteria (coach-authored, compare-and-swap)
// ============================================================================

interface FocusAreaCriterionEntry {
  id: string;
  label: string;
  source: 'coach' | 'engine';
  created_at: string;
  met: boolean;
  met_at: string | null;
}

interface FocusAreaCriteriaRow {
  player_id: string | null;
  status: string | null;
  updated_at: string | null;
  criteria: { entries: FocusAreaCriterionEntry[] } | null;
}

const MAX_CRITERIA_ENTRIES = 10;
const CRITERIA_CAS_MAX_ATTEMPTS = 2;

/**
 * Loads the focus area row needed by both criteria mutations below, coach
 * access included. Returns an error string (never throws) so both callers
 * can `return` it directly on a non-null result.
 */
async function loadCriteriaMutationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  focusAreaId: string,
  userId: string,
): Promise<{ row: FocusAreaCriteriaRow; coachId?: string } | { error: string }> {
  const { data: focusArea, error: focusAreaError } = await fromUntyped(supabase, 'golf_player_focus_areas')
    .select('player_id, status, updated_at, criteria')
    .eq('id', focusAreaId)
    .maybeSingle();

  if (focusAreaError) {
    await logServerError(
      `[focus-area-practice-log] criteria read failed — denying, but this is an outage not a missing record: ${describeError(focusAreaError)}`,
      { action: 'focusAreaPracticeLog.criteriaRead', featureArea: 'development' },
    );
    return { error: "Couldn't load this focus area. Please try again." };
  }

  const row = focusArea as FocusAreaCriteriaRow | null;
  if (!row?.player_id) {
    return { error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(row.player_id, userId, supabase);
  // Only a coach may author criteria — a player's own access ('self') is
  // deliberately excluded here, unlike the practice-session log above.
  if (!access.allowed || access.reason !== 'coach') {
    return { error: 'Forbidden' };
  }

  const lifecycleError = focusAreaLifecycleError(row.status);
  if (lifecycleError) {
    return { error: lifecycleError };
  }

  return { row, coachId: access.coachId };
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export interface AddFocusAreaCriterionInput {
  focusAreaId: string;
  label: string;
}

async function addFocusAreaCriterionImpl(
  input: AddFocusAreaCriterionInput,
): Promise<{ success: boolean; error?: string }> {
  if (!isFlagEnabled(FLAG)) {
    return { success: false, error: 'Not enabled' };
  }

  const label = input.label.trim();
  if (!label) {
    return { success: false, error: 'A criterion needs a label.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  for (let attempt = 0; attempt < CRITERIA_CAS_MAX_ATTEMPTS; attempt++) {
    const context = await loadCriteriaMutationContext(supabase, input.focusAreaId, user.id);
    if ('error' in context) {
      return { success: false, error: context.error };
    }

    const existingEntries = context.row.criteria?.entries ?? [];
    if (existingEntries.some((entry) => normalizeLabel(entry.label) === normalizeLabel(label))) {
      return { success: false, error: 'A criterion with this label already exists.' };
    }
    if (existingEntries.length >= MAX_CRITERIA_ENTRIES) {
      return { success: false, error: `A focus area can have at most ${MAX_CRITERIA_ENTRIES} criteria.` };
    }

    const nowIso = new Date().toISOString();
    const nextEntries: FocusAreaCriterionEntry[] = [
      ...existingEntries,
      {
        id: crypto.randomUUID(),
        label,
        source: 'coach',
        created_at: nowIso,
        met: false,
        met_at: null,
      },
    ];

    // Compare-and-swap: the WHERE also pins updated_at (or its absence) to
    // the value just read, so a concurrent writer's change since our read
    // makes this UPDATE match zero rows instead of silently overwriting
    // their append.
    let query = fromUntyped(supabase, 'golf_player_focus_areas')
      .update({ criteria: { entries: nextEntries }, updated_at: nowIso })
      .eq('id', input.focusAreaId);
    query = context.row.updated_at
      ? query.eq('updated_at', context.row.updated_at)
      : query.is('updated_at', null);
    const { data: updated, error } = await query.select('id');

    if (error) {
      await logServerError(`Failed to add focus area criterion: ${describeError(error)}`, {
        action: 'focusAreaPracticeLog.addCriterion',
        featureArea: 'development',
      });
      return { success: false, error: 'Failed to save this criterion. Please try again.' };
    }

    if (updated && updated.length > 0) {
      return { success: true };
    }
    // 0 rows: another writer changed updated_at between our read and this
    // update. Retry once with a fresh read; otherwise report the conflict.
  }

  return {
    success: false,
    error: 'This focus area changed while you were editing. Please try again.',
  };
}

const observedAddFocusAreaCriterion = withAdminObserved(
  'addFocusAreaCriterion',
  { sport: 'golf', feature: 'development_plans_coach' },
  addFocusAreaCriterionImpl,
);

export async function addFocusAreaCriterion(
  input: AddFocusAreaCriterionInput,
): Promise<{ success: boolean; error?: string }> {
  return observedAddFocusAreaCriterion(input);
}

export interface SetFocusAreaCriterionMetInput {
  focusAreaId: string;
  criterionId: string;
  met: boolean;
}

async function setFocusAreaCriterionMetImpl(
  input: SetFocusAreaCriterionMetInput,
): Promise<{ success: boolean; error?: string }> {
  if (!isFlagEnabled(FLAG)) {
    return { success: false, error: 'Not enabled' };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  for (let attempt = 0; attempt < CRITERIA_CAS_MAX_ATTEMPTS; attempt++) {
    const context = await loadCriteriaMutationContext(supabase, input.focusAreaId, user.id);
    if ('error' in context) {
      return { success: false, error: context.error };
    }

    const existingEntries = context.row.criteria?.entries ?? [];
    const targetIndex = existingEntries.findIndex((entry) => entry.id === input.criterionId);
    if (targetIndex === -1) {
      return { success: false, error: 'Criterion not found' };
    }

    const nowIso = new Date().toISOString();
    const nextEntries = existingEntries.map((entry, index) =>
      index === targetIndex
        ? { ...entry, met: input.met, met_at: input.met ? nowIso : null }
        : entry,
    );

    let query = fromUntyped(supabase, 'golf_player_focus_areas')
      .update({ criteria: { entries: nextEntries }, updated_at: nowIso })
      .eq('id', input.focusAreaId);
    query = context.row.updated_at
      ? query.eq('updated_at', context.row.updated_at)
      : query.is('updated_at', null);
    const { data: updated, error } = await query.select('id');

    if (error) {
      await logServerError(`Failed to update focus area criterion: ${describeError(error)}`, {
        action: 'focusAreaPracticeLog.setCriterionMet',
        featureArea: 'development',
      });
      return { success: false, error: 'Failed to save this criterion. Please try again.' };
    }

    if (updated && updated.length > 0) {
      return { success: true };
    }
  }

  return {
    success: false,
    error: 'This focus area changed while you were editing. Please try again.',
  };
}

const observedSetFocusAreaCriterionMet = withAdminObserved(
  'setFocusAreaCriterionMet',
  { sport: 'golf', feature: 'development_plans_coach' },
  setFocusAreaCriterionMetImpl,
);

export async function setFocusAreaCriterionMet(
  input: SetFocusAreaCriterionMetInput,
): Promise<{ success: boolean; error?: string }> {
  return observedSetFocusAreaCriterionMet(input);
}
