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
// zero reads or writes of golf_focus_area_criteria or
// golf_focus_area_practice_sessions.
//
// Criteria live in their OWN table (golf_focus_area_criteria), not a jsonb
// column on golf_player_focus_areas — the db-migration-reviewer's design
// change (see this migration's own header for why: a player-writable jsonb
// blob on a row a player can already PATCH would make "coach-authored, cap
// 10" false at the DB layer, and an ALTER TABLE on the live focus-areas
// table takes an ACCESS EXCLUSIVE lock). One row per criterion also means
// `setFocusAreaCriterionMet` is a single-row UPDATE, not a
// compare-and-swap retry loop over a shared blob.

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { isFlagEnabled } from '@/lib/flags';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isUuid } from '@/lib/utils/uuid';

const FLAG = 'coachhelm_focus_area_practice_log';

const NOTE_MAX_LENGTH = 1000;
const DRILL_ID_MAX_LENGTH = 100;
const LABEL_MAX_LENGTH = 200;
const REPS_MIN = 0;
const REPS_MAX = 1000;
const PRACTICED_AT_MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // 1 day
const PRACTICED_AT_MAX_PAST_MS = 365 * 24 * 60 * 60 * 1000; // 365 days
const MAX_CRITERIA_ENTRIES = 10;

/**
 * Lifecycle states a focus area may log a practice session or take a
 * criteria edit against. Deliberately duplicated from development.ts's
 * `ACTIONABLE_FOCUS_AREA_STATUSES` (not imported) — that module is under
 * concurrent edit by two other in-flight A8 slices, and this small,
 * stable set is cheaper to keep in sync by eye than to risk a rebase
 * conflict over an import change to a shared, contested file. Mirrored
 * exactly in the RLS policies added by this migration (fa.status IN
 * ('active', 'in_progress', 'paused')).
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

/**
 * `code === '42501'` (insufficient_privilege) means an RLS WITH CHECK
 * rejected the write — the action's own checks above should always catch
 * this first, so reaching it here means the world changed between our read
 * and the write (e.g. a team membership lapsed mid-request). Never an
 * "outage" log: this is the database doing its job as defense in depth.
 */
function isRlsDenied(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42501';
}

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
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

function validateLogFocusAreaPracticeSessionInput(
  input: LogFocusAreaPracticeSessionInput,
): string | null {
  if (!isUuid(input.focusAreaId)) return 'Invalid focus area.';
  if (!isUuid(input.clientRequestId)) return 'Invalid request id.';
  if (input.drillId != null) {
    if (typeof input.drillId !== 'string' || input.drillId.trim().length > DRILL_ID_MAX_LENGTH) {
      return `Drill id must be ${DRILL_ID_MAX_LENGTH} characters or fewer.`;
    }
  }
  if (input.note != null) {
    if (typeof input.note !== 'string' || input.note.length > NOTE_MAX_LENGTH) {
      return `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`;
    }
  }
  if (input.reps != null) {
    if (!Number.isInteger(input.reps) || input.reps < REPS_MIN || input.reps > REPS_MAX) {
      return `Reps must be a whole number between ${REPS_MIN} and ${REPS_MAX}.`;
    }
  }
  if (input.practicedAt != null) {
    const parsed = Date.parse(input.practicedAt);
    if (Number.isNaN(parsed)) return 'Invalid practice date.';
    const now = Date.now();
    if (parsed > now + PRACTICED_AT_MAX_FUTURE_MS) {
      return 'Practice date cannot be more than a day in the future.';
    }
    if (parsed < now - PRACTICED_AT_MAX_PAST_MS) {
      return 'Practice date cannot be more than a year in the past.';
    }
  }
  return null;
}

async function logFocusAreaPracticeSessionImpl(
  input: LogFocusAreaPracticeSessionInput,
): Promise<{ success: boolean; error?: string }> {
  if (!isFlagEnabled(FLAG)) {
    return { success: false, error: 'Not enabled' };
  }

  const validationError = validateLogFocusAreaPracticeSessionInput(input);
  if (validationError) {
    return { success: false, error: validationError };
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
  // true` for. The INSERT policy independently re-verifies this same
  // binding at the database layer, so a forged role can never slip through
  // even if this line had a bug.
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
    if (isRlsDenied(error)) {
      return { success: false, error: 'Forbidden' };
    }
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
  { sport: 'golf', feature: 'development_plans_coach', observeSoftFailures: false },
  logFocusAreaPracticeSessionImpl,
);

export async function logFocusAreaPracticeSession(
  input: LogFocusAreaPracticeSessionInput,
): Promise<{ success: boolean; error?: string }> {
  return observedLogFocusAreaPracticeSession(input);
}

// ============================================================================
// Criteria (coach-authored "done" definitions — golf_focus_area_criteria)
// ============================================================================

interface FocusAreaAccessContext {
  playerId: string;
  status: string | null;
}

/**
 * Loads the focus area row needed by both criteria mutations below, coach
 * access included. Returns an error string (never throws) so both callers
 * can `return` it directly on a non-null result.
 */
async function loadFocusAreaForCriteria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  focusAreaId: string,
  userId: string,
): Promise<{ context: FocusAreaAccessContext } | { error: string }> {
  const { data: focusArea, error: focusAreaError } = await supabase
    .from('golf_player_focus_areas')
    .select('player_id, status')
    .eq('id', focusAreaId)
    .maybeSingle();

  if (focusAreaError) {
    await logServerError(
      `[focus-area-practice-log] criteria read failed — denying, but this is an outage not a missing record: ${describeError(focusAreaError)}`,
      { action: 'focusAreaPracticeLog.criteriaRead', featureArea: 'development' },
    );
    return { error: "Couldn't load this focus area. Please try again." };
  }

  if (!focusArea?.player_id) {
    return { error: 'Focus area not found' };
  }

  const access = await verifyPlayerAccess(focusArea.player_id, userId, supabase);
  // Only a coach may author or resolve criteria — a player's own access
  // ('self') is deliberately excluded here, unlike the practice-session log
  // above. Mirrored at the database layer by criteria_insert_coach and
  // criteria_update_coach, which require an active is_golf_team_coach
  // membership and have no 'self' branch at all.
  if (!access.allowed || access.reason !== 'coach') {
    return { error: 'Forbidden' };
  }

  const lifecycleError = focusAreaLifecycleError(focusArea.status);
  if (lifecycleError) {
    return { error: lifecycleError };
  }

  return { context: { playerId: focusArea.player_id, status: focusArea.status } };
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

  if (!isUuid(input.focusAreaId)) {
    return { success: false, error: 'Invalid focus area.' };
  }
  if (typeof input.label !== 'string') {
    return { success: false, error: 'A criterion needs a label.' };
  }
  const label = input.label.trim();
  if (!label) {
    return { success: false, error: 'A criterion needs a label.' };
  }
  if (label.length > LABEL_MAX_LENGTH) {
    return { success: false, error: `Label must be ${LABEL_MAX_LENGTH} characters or fewer.` };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const loaded = await loadFocusAreaForCriteria(supabase, input.focusAreaId, user.id);
  if ('error' in loaded) {
    return { success: false, error: loaded.error };
  }

  const { count, error: countError } = await fromUntyped(supabase, 'golf_focus_area_criteria')
    .select('id', { count: 'exact', head: true })
    .eq('focus_area_id', input.focusAreaId);

  if (countError) {
    await logServerError(`Failed to count focus area criteria: ${describeError(countError)}`, {
      action: 'focusAreaPracticeLog.addCriterion.count',
      featureArea: 'development',
    });
    return { success: false, error: 'Failed to save this criterion. Please try again.' };
  }
  if ((count ?? 0) >= MAX_CRITERIA_ENTRIES) {
    return { success: false, error: `A focus area can have at most ${MAX_CRITERIA_ENTRIES} criteria.` };
  }

  const { error } = await fromUntyped(supabase, 'golf_focus_area_criteria')
    .insert({
      focus_area_id: input.focusAreaId,
      player_id: loaded.context.playerId,
      label,
      source: 'coach',
      created_by_user_id: user.id,
    })
    .select('id');

  if (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: 'A criterion with this label already exists.' };
    }
    if (isRlsDenied(error)) {
      return { success: false, error: 'Forbidden' };
    }
    await logServerError(`Failed to add focus area criterion: ${describeError(error)}`, {
      action: 'focusAreaPracticeLog.addCriterion',
      featureArea: 'development',
    });
    return { success: false, error: 'Failed to save this criterion. Please try again.' };
  }

  return { success: true };
}

const observedAddFocusAreaCriterion = withAdminObserved(
  'addFocusAreaCriterion',
  { sport: 'golf', feature: 'development_plans_coach', observeSoftFailures: false },
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

  if (!isUuid(input.focusAreaId)) {
    return { success: false, error: 'Invalid focus area.' };
  }
  if (!isUuid(input.criterionId)) {
    return { success: false, error: 'Invalid criterion.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  const loaded = await loadFocusAreaForCriteria(supabase, input.focusAreaId, user.id);
  if ('error' in loaded) {
    return { success: false, error: loaded.error };
  }

  // Single-row UPDATE, no compare-and-swap: one row per criterion means
  // there's no shared blob another writer could concurrently clobber. The
  // column-restricted GRANT (met, met_at, updated_at only) is what actually
  // keeps this from touching label/source, not application logic.
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await fromUntyped(supabase, 'golf_focus_area_criteria')
    .update({
      met: input.met,
      met_at: input.met ? nowIso : null,
      updated_at: nowIso,
    })
    .eq('id', input.criterionId)
    .eq('focus_area_id', input.focusAreaId)
    .select('id');

  if (error) {
    if (isRlsDenied(error)) {
      return { success: false, error: 'Forbidden' };
    }
    await logServerError(`Failed to update focus area criterion: ${describeError(error)}`, {
      action: 'focusAreaPracticeLog.setCriterionMet',
      featureArea: 'development',
    });
    return { success: false, error: 'Failed to save this criterion. Please try again.' };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Criterion not found' };
  }

  return { success: true };
}

const observedSetFocusAreaCriterionMet = withAdminObserved(
  'setFocusAreaCriterionMet',
  { sport: 'golf', feature: 'development_plans_coach', observeSoftFailures: false },
  setFocusAreaCriterionMetImpl,
);

export async function setFocusAreaCriterionMet(
  input: SetFocusAreaCriterionMetInput,
): Promise<{ success: boolean; error?: string }> {
  return observedSetFocusAreaCriterionMet(input);
}
