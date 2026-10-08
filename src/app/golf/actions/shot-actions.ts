'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse, CommonSchemas } from '@/lib/validation/server-action-validator';
import { invalidateOnRoundComplete } from '@/lib/cache/golf-stats-calculator';
import { logServerError, logServerException } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { createAdminClient } from '@/lib/supabase/admin';
import { deriveLieAfterFromResult } from '@/lib/utils/shot-helpers';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { describeError } from '@/lib/utils/describe-error';
import { createSafeFlightRecorder, isTransientAuthCheckFailure, toDbLieType } from './golf-action-shared';
import type { ActionResult } from './golf-action-shared';

const shotUpdateSchema = z.object({
  shot_type: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']).optional(),
  club_type: z.enum(['driver', 'non_driver', 'putter']).optional(),
  lie_before: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other']).optional(),
  lie_after: z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other', 'penalty']).nullable().optional(),
  distance_to_hole_before: z.number().min(0).max(1000).optional(),
  distance_unit_before: z.enum(['yards', 'feet']).optional(),
  result: z.enum(['fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty']).optional(),
  distance_to_hole_after: z.number().min(0).optional(),
  distance_unit_after: z.enum(['yards', 'feet']).optional(),
  shot_distance: z.number().min(0).optional(),
  miss_direction: z.string().nullable().optional(),
  putt_break: z.enum(['right_to_left', 'left_to_right', 'straight', 'multiple']).nullable().optional(),
  putt_slope: z.enum(['uphill', 'downhill', 'level', 'severe']).nullable().optional(),
  putt_distance_feet: z.number().min(0).nullable().optional(),
  putt_made: z.boolean().nullable().optional(),
  is_penalty: z.boolean().optional(),
  penalty_type: z.enum(['ob', 'water', 'unplayable', 'lost']).nullable().optional(),
  putt_miss_tags: z.array(z.string()).nullable().optional(),
  approach_miss_direction: z.string().nullable().optional(),
  approach_miss_lie_type: z.string().nullable().optional(),
}).refine(data => Object.keys(data).length > 0, 'At least one field is required');
// ============================================================================
// SHOT MANAGEMENT ACTIONS
// ============================================================================

/**
 * Delete a specific shot from a round
 * The database trigger will automatically resequence remaining shots
 */
async function deleteShotImpl(shotId: string): Promise<ActionResult<void>> {
  // Constructed FIRST, same convention as savePartialRound/submit above —
  // shotId is the only identity known this early; round/player ids are
  // attached as `observed` metadata on their own step once resolved.
  // startTimeoutMs: 300 — tighter than the shared 500ms default. This
  // construction now sits before any business logic, so a hung
  // `trace_runs` insert would otherwise add up to the default bound to a
  // single shot delete that previously paid nothing for tracing at all.
  // submit/savePartialRound keep the default deliberately — see the
  // field's own doc.
  const flightRecorder = await createSafeFlightRecorder({ workflow: 'golf.shot.delete', startTimeoutMs: 300 });
  let traceEnded = false;
  const endTrace = (status: 'success' | 'failure' | 'warning' | 'pending') => {
    if (traceEnded) return;
    traceEnded = true;
    void flightRecorder.finalize(status);
  };

  try {
    // Validate UUID format
    void flightRecorder.start('server.validation');
    const validId = CommonSchemas.uuid.safeParse(shotId);
    if (!validId.success) {
      void flightRecorder.fail('server.validation', { errorSummary: 'invalid_shot_id' });
      endTrace('failure');
      return { success: false, error: 'Invalid shot ID' };
    }
    void flightRecorder.complete('server.validation');

    const supabase = await createClient();

    // Resilient, not raw — a transient GoTrue blip must not read as a
    // sign-out mid-round (A5, 2026-09-02). See getUserResilient's header.
    void flightRecorder.start('server.auth');
    const { user } = await getUserResilient(supabase);
    // #1728 reconciled with A5 at the merge (2026-09-02): getUserResilient
    // absorbs a blip (one retry, then the local-session fallback) but does
    // not expose WHY it still came back empty, and that null conflates
    // "GoTrue ruled against the session" with "GoTrue never ruled". Re-read
    // the raw error once — on this null path only, so the signed-in path
    // stays a single call — to keep the honest 'retry' sentence below.
    const authCheckError = user ? null : (await supabase.auth.getUser()).error;
    if (!user) {
      // See isTransientAuthCheckFailure. A destructive edit must not be reported as a sign-out when GoTrue was
      // merely unreachable. The shot is still there; the only honest answer is
      // 'retry'.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Delete-shot auth check failed in transit (NOT a session expiry) — retryable', {
          action: 'deleteShot',
          featureArea: 'shot_tracking',
          errorDetails: authCheckError?.message,
          extra: { authStatus: authCheckError?.status ?? null },
        }, 'warning');
        void flightRecorder.warn('server.auth', { errorSummary: 'transient_auth_check_failure' });
        endTrace('warning');
        return { success: false, error: 'Could not verify your session — check your connection and try again. Your shot was not deleted.' };
      }
      void flightRecorder.fail('server.auth', { errorSummary: 'session_expired' });
      endTrace('failure');
      return { success: false, error: 'You must be signed in' };
    }
    void flightRecorder.complete('server.auth', { observed: { user_id: user.id } });

    // Get player record. The error is BOUND, not discarded: a transport or
    // RLS failure on this read is not "this user has no profile", and telling
    // a mid-round player their profile is missing invites them to give up on
    // a shot that a retry would have saved. Mirrors savePartialRound (fixed
    // 2026-08-27). The message deliberately carries no `shot_not_found` code —
    // that is the one signal the client answers by deleting its LOCAL shot.
    void flightRecorder.start('server.player');
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (playerError) {
      void flightRecorder.warn('server.player', { errorCode: playerError.code, errorSummary: playerError.message });
      endTrace('warning');
      return { success: false, error: 'Failed to verify your player profile. Please try again.' };
    }

    if (!player) {
      void flightRecorder.fail('server.player', { errorSummary: 'player_not_found' });
      endTrace('failure');
      return { success: false, error: 'Player profile not found' };
    }
    void flightRecorder.complete('server.player', { observed: { player_id: player.id } });

    // Verify ownership: Get the shot and its associated round
    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id, hole_number')
      .eq('id', shotId)
      .maybeSingle();

    // A missing row (null data, no error) is the one case the client may
    // safely reconcile as a stale local ID. A transport/database error must
    // remain a normal failure: treating it as a missing shot would make an
    // offline player temporarily hide valid progress from their own
    // scorecard. `.maybeSingle()`, not `.single()`: the old PGRST116 error
    // for "no row" was handled here but still reached Sentry as an unhandled
    // integration auto-capture (JAVASCRIPT-NEXTJS-SZ, 34 events).
    if (shotError) {
      endTrace('failure');
      return { success: false, error: 'Failed to verify shot. Please try again.' };
    }

    if (!shot) {
      // The caller may still hold a locally persisted ID after another tab,
      // an earlier retry, or a successfully committed request deleted it.
      // Keep the user-scoped/RLS-safe message (do not disclose row
      // existence), but give round-entry clients a stable reconciliation code
      // so they can remove only their stale local reference.
      endTrace('warning');
      return { success: false, error: 'Shot not found', code: 'shot_not_found' };
    }

    // Verify the round belongs to this player and is still in progress
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, status')
      .eq('id', shot.round_id)
      .eq('player_id', player.id)
      .single();

    if (roundError || !round) {
      endTrace('failure');
      return { success: false, error: 'You do not have permission to delete this shot' };
    }

    // Prevent score tampering on completed/verified rounds
    if (round.status !== 'in_progress') {
      endTrace('failure');
      return { success: false, error: 'Cannot delete shots from a completed or verified round' };
    }

    // Delete the shot - the database trigger will resequence remaining shots
    void flightRecorder.start('db.delete_shot');
    const { error: deleteError } = await supabase
      .from('golf_shots')
      .delete()
      .eq('id', shotId);

    if (deleteError) {
      void flightRecorder.fail('db.delete_shot', { errorCode: deleteError.code, errorSummary: deleteError.message });
      endTrace('failure');
      return { success: false, error: 'Failed to delete shot' };
    }
    void flightRecorder.complete('db.delete_shot', { observed: { round_id: shot.round_id } });

    // Best-effort read-back: prove the row is actually gone. Non-fatal — the
    // delete already committed, so a failed verification read must not turn
    // it into an error.
    void flightRecorder.start('verify.shots');
    try {
      const { data: stillThere, error: verifyError } = await supabase
        .from('golf_shots')
        .select('id')
        .eq('id', shotId)
        .maybeSingle();
      // A failed read must not render as "row confirmed gone" — bind and
      // check the error explicitly rather than trusting `data` alone.
      if (verifyError) {
        void flightRecorder.warn('verify.shots', { errorSummary: verifyError.message });
      } else {
        void flightRecorder.complete('verify.shots', { observed: { deleted: !stillThere } });
      }
    } catch (verifyErr) {
      void flightRecorder.warn('verify.shots', { errorSummary: describeError(verifyErr) });
    }

    // Revalidate relevant paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${shot.round_id}`);
    updateTag(CACHE_TAGS.ROUNDS);

    // 2026-05-17: closes audit P-HIGH-4. Previously this only invalidated
    // CACHE_TAGS.ROUNDS — leaving stats stale until the next round submit or
    // nightly roster sweep (up to ~22h). Now we also invalidate the stats
    // cache so coach corrections show up on the player's dashboard quickly.
    // Run via after() to avoid blocking the user response. player_id is
    // looked up via the round inside the callback (golf_shots has no
    // direct player_id column). 'post.stats' is declared 'async' — started
    // here, completed/failed inside the callback (see submitGolfRound
    // Comprehensive's identical ordering comment for why that is safe and
    // lands outside the trace's already-finalized window by design).
    const revalidateRoundId = shot.round_id;
    void flightRecorder.start('post.stats');
    endTrace('success');
    after(async () => {
      try {
        const admin = createAdminClient();
        const { data: roundRow } = await admin
          .from('golf_rounds')
          .select('player_id')
          .eq('id', revalidateRoundId)
          .single();
        if (roundRow?.player_id) {
          await invalidateOnRoundComplete(roundRow.player_id, revalidateRoundId);
        }
        await flightRecorder.complete('post.stats');
      } catch (err) {
        void logServerError(`deleteShot stats cache invalidation failed: ${describeError(err)}`, {
          action: 'deleteShot.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: revalidateRoundId,
        }, 'warning');
        await flightRecorder.fail('post.stats', { errorSummary: describeError(err) });
      }
    });

    return { success: true, data: undefined };

  } catch (error) {
    await logServerException(error instanceof Error ? error : new Error(String(error)), { action: 'deleteShot' });
    return formatSafeErrorResponse(error);
  } finally {
    // Safety net for any branch above not individually instrumented (e.g.
    // the shot/round ownership lookups, which are not declared workflow
    // steps) — see savePartialRoundImpl's identical comment.
    endTrace('failure');
  }
}
const observedDeleteShot = withAdminObserved(
  'deleteShot',
  { sport: 'golf', feature: 'round_tracking' },
  deleteShotImpl,
);
export async function deleteShot(shotId: string): Promise<ActionResult<void>> {
  return observedDeleteShot(shotId);
}
/**
 * Shot data that can be updated
 */
export interface ShotUpdateData {
  shot_type?: string;
  club_type?: string;
  lie_before?: string;
  lie_after?: string | null;
  distance_to_hole_before?: number;
  distance_unit_before?: string;
  result?: string;
  distance_to_hole_after?: number;
  distance_unit_after?: string;
  shot_distance?: number;
  miss_direction?: string | null;
  putt_break?: string | null;
  putt_slope?: string | null;
  putt_distance_feet?: number | null;
  putt_made?: boolean | null;
  is_penalty?: boolean;
  penalty_type?: string | null;
  putt_miss_tags?: string[] | null;
  approach_miss_direction?: string | null;
  approach_miss_lie_type?: string | null;
}
/**
 * Update a specific shot in a round
 */
async function updateShotImpl(
  shotId: string,
  data: ShotUpdateData
): Promise<ActionResult<void>> {
  // Constructed FIRST — same convention as deleteShot/savePartialRound/
  // submit above. startTimeoutMs: 300 — see deleteShot's identical comment.
  const flightRecorder = await createSafeFlightRecorder({ workflow: 'golf.shot.add_or_edit', startTimeoutMs: 300 });
  let traceEnded = false;
  const endTrace = (status: 'success' | 'failure' | 'warning' | 'pending') => {
    if (traceEnded) return;
    traceEnded = true;
    void flightRecorder.finalize(status);
  };

  try {
    // Validate UUID format + update payload — both are 'server.validation'.
    void flightRecorder.start('server.validation');
    const validId = CommonSchemas.uuid.safeParse(shotId);
    if (!validId.success) {
      void flightRecorder.fail('server.validation', { errorSummary: 'invalid_shot_id' });
      endTrace('failure');
      return { success: false, error: 'Invalid shot ID' };
    }

    // Validate update data
    const validData = shotUpdateSchema.safeParse(data);
    if (!validData.success) {
      void flightRecorder.fail('server.validation', { errorSummary: 'invalid_update_data' });
      endTrace('failure');
      return { success: false, error: 'Invalid update data' };
    }
    void flightRecorder.complete('server.validation');

    const supabase = await createClient();

    // Resilient, not raw — a transient GoTrue blip must not read as a
    // sign-out mid-round (A5, 2026-09-02). See getUserResilient's header.
    void flightRecorder.start('server.auth');
    const { user } = await getUserResilient(supabase);
    // #1728 reconciled with A5 at the merge (2026-09-02): getUserResilient
    // absorbs a blip (one retry, then the local-session fallback) but does
    // not expose WHY it still came back empty, and that null conflates
    // "GoTrue ruled against the session" with "GoTrue never ruled". Re-read
    // the raw error once — on this null path only, so the signed-in path
    // stays a single call — to keep the honest 'retry' sentence below.
    const authCheckError = user ? null : (await supabase.auth.getUser()).error;
    if (!user) {
      // See isTransientAuthCheckFailure. The player is mid-round correcting a shot. Telling them to sign in costs
      // them the edit for a failure that never reached the auth server.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Update-shot auth check failed in transit (NOT a session expiry) — retryable', {
          action: 'updateShot',
          featureArea: 'shot_tracking',
          errorDetails: authCheckError?.message,
          extra: { authStatus: authCheckError?.status ?? null },
        }, 'warning');
        void flightRecorder.warn('server.auth', { errorSummary: 'transient_auth_check_failure' });
        endTrace('warning');
        return { success: false, error: 'Could not verify your session — check your connection and try again. Your change was not saved.' };
      }
      void flightRecorder.fail('server.auth', { errorSummary: 'session_expired' });
      endTrace('failure');
      return { success: false, error: 'You must be signed in' };
    }
    void flightRecorder.complete('server.auth', { observed: { user_id: user.id } });

    // Get player record. The error is BOUND, not discarded: a transport or
    // RLS failure on this read is not "this user has no profile", and telling
    // a mid-round player their profile is missing invites them to give up on
    // a shot that a retry would have saved. Mirrors savePartialRound (fixed
    // 2026-08-27). The message deliberately carries no `shot_not_found` code —
    // that is the one signal the client answers by deleting its LOCAL shot.
    void flightRecorder.start('server.player');
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (playerError) {
      void flightRecorder.warn('server.player', { errorCode: playerError.code, errorSummary: playerError.message });
      endTrace('warning');
      return { success: false, error: 'Failed to verify your player profile. Please try again.' };
    }

    if (!player) {
      void flightRecorder.fail('server.player', { errorSummary: 'player_not_found' });
      endTrace('failure');
      return { success: false, error: 'Player profile not found' };
    }
    void flightRecorder.complete('server.player', { observed: { player_id: player.id } });

    // Verify ownership: Get the shot and its associated round
    const { data: shot, error: shotError } = await supabase
      .from('golf_shots')
      .select('id, round_id')
      .eq('id', shotId)
      .maybeSingle();

    // Match deleteShot's reconciliation contract: only an explicit no-row
    // response is stale local state. A transient lookup failure must preserve
    // the local shot and let the player retry.
    if (shotError) {
      endTrace('failure');
      return { success: false, error: 'Failed to verify shot. Please try again.' };
    }

    if (!shot) {
      // An edit can race with an Undo, a second tab, or a request whose
      // successful response never reached this browser. Keep ownership/RLS
      // opaque, but give the round-entry UI the same stable reconciliation
      // signal as deleteShot so it removes only its stale local reference.
      endTrace('warning');
      return { success: false, error: 'Shot not found', code: 'shot_not_found' };
    }

    // Verify the round belongs to this player and is still in progress
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, status')
      .eq('id', shot.round_id)
      .eq('player_id', player.id)
      .single();

    if (roundError || !round) {
      endTrace('failure');
      return { success: false, error: 'You do not have permission to update this shot' };
    }

    // Bug #44: Prevent score tampering on completed/verified rounds
    if (round.status !== 'in_progress') {
      endTrace('failure');
      return { success: false, error: 'Cannot modify shots on a completed or verified round' };
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.shot_type !== undefined) updateData.shot_type = data.shot_type;
    if (data.club_type !== undefined) updateData.club_type = data.club_type;
    if (data.lie_before !== undefined) updateData.lie_before = data.lie_before;
    if (data.lie_after !== undefined) updateData.lie_after = data.lie_after;
    if (data.distance_to_hole_before !== undefined) updateData.distance_to_hole_before = data.distance_to_hole_before;
    if (data.distance_unit_before !== undefined) updateData.distance_unit_before = data.distance_unit_before;
    if (data.result !== undefined) updateData.result = data.result;
    if (data.distance_to_hole_after !== undefined) updateData.distance_to_hole_after = data.distance_to_hole_after;
    if (data.distance_unit_after !== undefined) updateData.distance_unit_after = data.distance_unit_after;
    if (data.shot_distance !== undefined) updateData.shot_distance = data.shot_distance;
    if (data.miss_direction !== undefined) updateData.miss_direction = data.miss_direction;
    if (data.putt_break !== undefined) updateData.putt_break = data.putt_break;
    if (data.putt_slope !== undefined) updateData.putt_slope = data.putt_slope;
    if (data.putt_distance_feet !== undefined) updateData.putt_distance_feet = data.putt_distance_feet;
    if (data.putt_made !== undefined) updateData.putt_made = data.putt_made;
    if (data.is_penalty !== undefined) updateData.is_penalty = data.is_penalty;
    if (data.penalty_type !== undefined) updateData.penalty_type = data.penalty_type;

    if (data.result !== undefined && data.lie_after === undefined) {
      updateData.lie_after = deriveLieAfterFromResult(data.result);
    }

    // Update the shot
    void flightRecorder.start('db.shot_mutation');
    const { error: updateError } = await fromUntyped(supabase, 'golf_shots')
      .update(updateData)
      .eq('id', shotId);

    if (updateError) {
      // Record the real Supabase error, same as deleteShot's db.delete_shot
      // fail() does — the player-facing message stays the generic sentence
      // below; only what lands in the trace changes.
      void flightRecorder.fail('db.shot_mutation', { errorCode: updateError.code, errorSummary: updateError.message });
      endTrace('failure');
      return { success: false, error: 'Failed to update shot' };
    }

    // Upsert putt miss details (separate table, non-critical IF the table is
    // genuinely absent in this deployment — 42501/23xxx etc. are real
    // failures the caller believes succeeded (the outer function still
    // returns success:true) and must not be swallowed identically to
    // "table doesn't exist". See PHASE_A_FINDINGS.md §(e)#1.
    if (data.putt_miss_tags !== undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const clampedDist = data.putt_distance_feet != null ? Math.min(data.putt_distance_feet, 500) : null;
        let puttError: { code?: string; message?: string } | null = null;
        if (data.putt_miss_tags && data.putt_miss_tags.length > 0) {
          ({ error: puttError } = await sb.from('putt_details').upsert({
            shot_id: shotId,
            miss_tags: data.putt_miss_tags,
            break_direction: data.putt_break ?? null,
            distance_feet: clampedDist,
            made: data.putt_made ?? false,
          }, { onConflict: 'shot_id' }));
        } else if (data.putt_made !== undefined) {
          // Still upsert for made putts (even with empty miss tags) to keep conversion data accurate
          ({ error: puttError } = await sb.from('putt_details').upsert({
            shot_id: shotId,
            miss_tags: [],
            break_direction: data.putt_break ?? null,
            distance_feet: clampedDist,
            made: data.putt_made,
          }, { onConflict: 'shot_id' }));
        }
        if (puttError && puttError.code !== '42P01') {
          void logServerError(
            `updateShot: putt_details upsert failed (non-fatal, shot save still succeeds): ${puttError.message ?? 'unknown'}`,
            { action: 'golf.updateShot.puttDetails', errorCode: puttError.code ?? undefined, roundId: shot.round_id, sport: 'golf' },
            'warning',
          );
        }
      } catch (err) {
        // Genuine thrown exception (network, etc.) — table-missing (42P01)
        // never throws here since we now read `.error` above instead.
        void logServerException(err, { action: 'golf.updateShot.puttDetails', roundId: shot.round_id, sport: 'golf' }, 'warning');
      }
    }

    // Upsert approach miss details (separate table, non-critical IF the
    // table is genuinely absent — same reasoning as putt_details above.
    if (data.approach_miss_direction !== undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        let approachError: { code?: string; message?: string } | null = null;
        if (data.approach_miss_direction) {
          ({ error: approachError } = await sb.from('approach_miss_details').upsert({
            shot_id: shotId,
            miss_direction: data.approach_miss_direction,
            lie_type: toDbLieType(data.approach_miss_lie_type),
          }, { onConflict: 'shot_id' }));
        } else {
          // Clear approach miss details if direction was removed
          ({ error: approachError } = await sb.from('approach_miss_details').delete().eq('shot_id', shotId));
        }
        if (approachError && approachError.code !== '42P01') {
          void logServerError(
            `updateShot: approach_miss_details write failed (non-fatal, shot save still succeeds): ${approachError.message ?? 'unknown'}`,
            { action: 'golf.updateShot.approachMissDetails', errorCode: approachError.code ?? undefined, roundId: shot.round_id, sport: 'golf' },
            'warning',
          );
        }
      } catch (err) {
        void logServerException(err, { action: 'golf.updateShot.approachMissDetails', roundId: shot.round_id, sport: 'golf' }, 'warning');
      }
    }
    void flightRecorder.complete('db.shot_mutation', { observed: { round_id: shot.round_id } });

    // Best-effort read-back — see deleteShot's identical comment.
    void flightRecorder.start('verify.shots');
    try {
      const { data: verifyShot, error: verifyError } = await supabase
        .from('golf_shots')
        .select('id')
        .eq('id', shotId)
        .maybeSingle();
      // A failed read must not render as "row confirmed missing" — bind and
      // check the error explicitly rather than trusting `data` alone.
      if (verifyError) {
        void flightRecorder.warn('verify.shots', { errorSummary: verifyError.message });
      } else {
        void flightRecorder.complete('verify.shots', { observed: { found: Boolean(verifyShot) } });
      }
    } catch (verifyErr) {
      void flightRecorder.warn('verify.shots', { errorSummary: describeError(verifyErr) });
    }

    // Revalidate relevant paths
    revalidatePath('/golf/dashboard/rounds');
    revalidatePath(`/golf/dashboard/rounds/${shot.round_id}`);
    updateTag(CACHE_TAGS.ROUNDS);

    // 2026-05-17: closes audit P-HIGH-4 (same fix as deleteShot above).
    // 'post.stats' is declared 'async' — started here, completed/failed
    // inside the callback (see deleteShot/submitGolfRoundComprehensive's
    // identical ordering comment).
    const revalidateRoundId = shot.round_id;
    void flightRecorder.start('post.stats');
    endTrace('success');
    after(async () => {
      try {
        const admin = createAdminClient();
        const { data: roundRow } = await admin
          .from('golf_rounds')
          .select('player_id')
          .eq('id', revalidateRoundId)
          .single();
        if (roundRow?.player_id) {
          await invalidateOnRoundComplete(roundRow.player_id, revalidateRoundId);
        }
        await flightRecorder.complete('post.stats');
      } catch (err) {
        void logServerError(`updateShot stats cache invalidation failed: ${describeError(err)}`, {
          action: 'updateShot.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: revalidateRoundId,
        }, 'warning');
        await flightRecorder.fail('post.stats', { errorSummary: describeError(err) });
      }
    });

    return { success: true, data: undefined };

  } catch (error) {
    await logServerException(error instanceof Error ? error : new Error(String(error)), { action: 'updateShot' });
    return formatSafeErrorResponse(error);
  } finally {
    // Safety net — see deleteShot's identical comment.
    endTrace('failure');
  }
}
const observedUpdateShot = withAdminObserved(
  'updateShot',
  { sport: 'golf', feature: 'round_tracking' },
  updateShotImpl,
);
export async function updateShot(
  shotId: string,
  data: ShotUpdateData
): Promise<ActionResult<void>> {
  return observedUpdateShot(shotId, data);
}
// ============================================================================
// SHOT-BY-SHOT REVIEW TYPES & ACTION
// ============================================================================

/** Shot detail for the shot-by-shot review */
export interface ShotDetail {
  id: string;
  shot_number: number;
  shot_type: string;
  club_type: string;
  lie_before: string | null;
  result: string;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  is_penalty: boolean | null;
  penalty_type: string | null;
  putt_miss_tags: string[] | null;
  approach_miss_direction: string | null;
  approach_miss_lie_type: string | null;
  approach_distance_from_green: number | null;
}
/** Hole summary with shots for review */
export interface HoleReviewData {
  id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
  score: number | null;
  score_to_par: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
  penalty_strokes: number | null;
  driving_distance: number | null;
  approach_distance: number | null;
  approach_proximity: number | null;
  first_putt_distance: number | null;
  scramble_attempt: boolean | null;
  scramble_made: boolean | null;
  sand_save_attempt: boolean | null;
  sand_save_made: boolean | null;
  shots: ShotDetail[];
}
/** Full round shot review data */
export interface RoundShotReviewData {
  roundId: string;
  courseName: string | null;
  roundDate: string;
  totalScore: number | null;
  scoreToPar: number | null;
  holes: HoleReviewData[];
  hasShotData: boolean;
}
/**
 * Get detailed shot-by-shot data for a round
 * Used for the shot-by-shot review feature
 */
async function getRoundShotDetailsImpl(
  roundId: string
): Promise<ActionResult<RoundShotReviewData>> {
  try {
    const validId = CommonSchemas.uuid.safeParse(roundId);
    if (!validId.success) {
      return { success: false, error: 'Invalid round ID' };
    }

    const supabase = await createClient();

    // Verify user is authenticated
    const { data: { user }, error: authCheckError } = await supabase.auth.getUser();
    if (!user) {
      // See isTransientAuthCheckFailure. A read, so nothing is at risk but the screen. Still worth separating: a
      // transit blip rendering as 'Not authenticated' is what sent players to
      // the login screen mid-round on 2026-08-19.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Round shot-review auth check failed in transit (NOT a session expiry) — retryable', {
          action: 'getRoundShotDetails',
          featureArea: 'shot_tracking',
          errorDetails: authCheckError?.message,
          extra: { authStatus: authCheckError?.status ?? null },
        }, 'warning');
        return { success: false, error: 'Could not verify your session — check your connection and try again.' };
      }
      return { success: false, error: 'Not authenticated' };
    }

    // Fetch round with holes
    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        course_name,
        round_date,
        total_score,
        score_to_par,
        player_id
      `)
      .eq('id', roundId)
      .single();

    if (roundError || !round) {
      return { success: false, error: 'Round not found' };
    }

    // Check authorization - user must be player or coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOwnRound = player?.id === round.player_id;

    // Check if coach has access
    // Staff-scoped: the coach may view this round iff the round's player is an
    // active member of a team the coach STAFFS. (Was an org `.maybeSingle()` that
    // THREW on a two-team program and only checked one arbitrary team.)
    let isCoach = false;
    if (coach?.id) {
      const { data: staffRows } = await supabase
        .from('golf_team_coach_staff')
        .select('team_id')
        .eq('coach_id', coach.id);
      const staffTeamIds = (staffRows ?? []).map((r) => r.team_id).filter(Boolean) as string[];

      if (staffTeamIds.length > 0) {
        const { data: teamMembership } = await supabase
          .from('golf_team_members')
          .select('id')
          .in('team_id', staffTeamIds)
          .eq('player_id', round.player_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        isCoach = !!teamMembership;
      }
    }

    if (!isOwnRound && !isCoach) {
      return { success: false, error: 'Not authorized to view this round' };
    }

    // Fetch holes for the round
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: holes, error: holesError } = await (supabase as any)
      .from('golf_holes')
      .select(`
        id,
        hole_number,
        par,
        yardage,
        score,
        putts,
        fairway_hit,
        gir,
        penalty_strokes,
        sand_save,
        up_and_down,
        notes
      `)
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true }) as { data: Array<{
        id: string;
        hole_number: number;
        par: number;
        yardage: number | null;
        score: number | null;
        putts: number | null;
        fairway_hit: boolean | null;
        gir: boolean | null;
        penalty_strokes: number | null;
        sand_save: boolean | null;
        up_and_down: boolean | null;
        notes: string | null;
      }> | null; error: unknown };

    if (holesError) {
      return { success: false, error: 'Failed to fetch holes' };
    }

    // Fetch all shots for the round
    const { data: shots, error: shotsError } = await supabase
      .from('golf_shots')
      .select(`
        id,
        hole_number,
        shot_number,
        shot_type,
        club_type,
        lie_before,
        result,
        distance_to_hole_before,
        distance_to_hole_after,
        distance_unit_before,
        distance_unit_after,
        shot_distance,
        miss_direction,
        putt_break,
        putt_slope,
        is_penalty,
        penalty_type
      `)
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true });

    if (shotsError) {
      return { success: false, error: 'Failed to fetch shots' };
    }

    // Fetch putt_details and approach_miss_details for the round's shots
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const shotIds = (shots || []).map((s: { id: string }) => s.id);
    const puttDetailsByShot: Record<string, { miss_tags: string[] | null }> = {};
    const approachDetailsByShot: Record<string, { miss_direction: string | null; lie_type: string | null; distance_from_green_yards: number | null }> = {};

    if (shotIds.length > 0) {
      const [puttRes, approachRes] = await Promise.all([
        sb.from('putt_details')
          .select('shot_id, miss_tags')
          .in('shot_id', shotIds),
        sb.from('approach_miss_details')
          .select('shot_id, miss_direction, lie_type, distance_from_green_yards')
          .in('shot_id', shotIds),
      ]);

      for (const pd of (puttRes?.data || [])) {
        puttDetailsByShot[pd.shot_id] = { miss_tags: pd.miss_tags };
      }
      for (const ad of (approachRes?.data || [])) {
        approachDetailsByShot[ad.shot_id] = {
          miss_direction: ad.miss_direction,
          lie_type: ad.lie_type,
          distance_from_green_yards: ad.distance_from_green_yards,
        };
      }
    }

    // Group shots by hole_number, merging detail table data
    const shotsByHole: Record<number, ShotDetail[]> = {};
    for (const shot of (shots || [])) {
      if (!shotsByHole[shot.hole_number]) {
        shotsByHole[shot.hole_number] = [];
      }
      const holeShots = shotsByHole[shot.hole_number];
      const puttDetail = puttDetailsByShot[shot.id];
      const approachDetail = approachDetailsByShot[shot.id];
      if (holeShots) {
        holeShots.push({
          id: shot.id,
          shot_number: shot.shot_number,
          shot_type: shot.shot_type ?? 'approach',
          club_type: shot.club_type ?? 'non_driver',
          lie_before: shot.lie_before,
          result: shot.result ?? 'other',
          distance_to_hole_before: shot.distance_to_hole_before,
          distance_to_hole_after: shot.distance_to_hole_after,
          distance_unit_before: shot.distance_unit_before,
          distance_unit_after: shot.distance_unit_after,
          shot_distance: shot.shot_distance,
          miss_direction: shot.miss_direction,
          putt_break: shot.putt_break,
          putt_slope: shot.putt_slope,
          is_penalty: shot.is_penalty,
          penalty_type: shot.penalty_type,
          putt_miss_tags: puttDetail?.miss_tags ?? null,
          approach_miss_direction: approachDetail?.miss_direction ?? null,
          approach_miss_lie_type: approachDetail?.lie_type ?? null,
          approach_distance_from_green: approachDetail?.distance_from_green_yards ?? null,
        });
      }
    }

    // Combine holes with their shots
    const holesWithShots: HoleReviewData[] = (holes || []).map((hole) => {
      const holeShots = shotsByHole[hole.hole_number] || [];
      const teeShot = holeShots.find(shot => shot.shot_type === 'tee');
      const firstPutt = holeShots.find(shot => shot.shot_type === 'putting');

      // SG-2: a putt distance is ALWAYS in feet. Distance recorded with
      // distance_unit_before === 'yards' was being ×3'd into impossible
      // 390-foot "putts". Treat the raw value as feet regardless of the stored
      // unit and clamp to a realistic max (a putt can't be 120ft+).
      let firstPuttDistance: number | null = null;
      if (firstPutt?.distance_to_hole_before != null) {
        firstPuttDistance = Math.min(Math.max(Math.round(firstPutt.distance_to_hole_before), 0), 120);
      }

      return {
        id: hole.id,
        hole_number: hole.hole_number,
        par: hole.par,
        yardage: hole.yardage ?? null,
        score: hole.score,
        score_to_par: hole.score !== null ? hole.score - hole.par : null,
        putts: hole.putts,
        fairway_hit: hole.fairway_hit,
        green_in_regulation: hole.gir,
        penalty_strokes: hole.penalty_strokes,
        driving_distance: teeShot?.shot_distance ?? null,
        approach_distance: null,
        approach_proximity: null,
        first_putt_distance: firstPuttDistance,
        // Canonical scramble definition (matches the DB round-stats trigger):
        // attempt = missed GIR with a recorded score (gir=false AND score IS
        // NOT NULL); made = that attempt scored par or better. The old
        // up_and_down-based flag counted "has an up/down entry" as an attempt,
        // which both over- and under-counted vs every stats surface.
        scramble_attempt: hole.gir === false && hole.score !== null,
        scramble_made: hole.gir === false && hole.score !== null && hole.score <= hole.par,
        sand_save_attempt: hole.sand_save !== null,
        sand_save_made: hole.sand_save === true,
        shots: holeShots,
      };
    });

    const hasShotData = (shots || []).length > 0;

    return {
      success: true,
      data: {
        roundId: round.id,
        courseName: round.course_name,
        roundDate: round.round_date,
        totalScore: round.total_score,
        scoreToPar: round.score_to_par,
        holes: holesWithShots,
        hasShotData,
      },
    };
  } catch (error) {
    await logServerError(
      `getRoundShotDetails failed: ${describeError(error)}`,
      {
        action: 'golf.getRoundShotDetails',
        featureArea: 'golf_rounds',
        roundId,
        extra: { stack: error instanceof Error ? error.stack : undefined },
      }
    );
    return formatSafeErrorResponse(error);
  }
}
const observedGetRoundShotDetails = withAdminObserved(
  'getRoundShotDetails',
  { sport: 'golf', feature: 'round_tracking' },
  getRoundShotDetailsImpl,
);
export async function getRoundShotDetails(
  roundId: string
): Promise<ActionResult<RoundShotReviewData>> {
  return observedGetRoundShotDetails(roundId);
}
