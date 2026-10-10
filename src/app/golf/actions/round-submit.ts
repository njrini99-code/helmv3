'use server';

import { createHash } from 'crypto';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
// Plain server module, NOT a 'use server' export surface — imported for use
// here, never re-exported (see the header of progress-drivers.ts).
import {
  evaluateAndPersistGoals,
  evaluateAndPersistFocusAreas,
} from '@/lib/golf/progress-drivers';
import { enqueueJob, isHelmQueueEnabled } from '@/lib/jobs/enqueue';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import type { HoleStats } from '@/lib/types/golf';
import { z } from 'zod';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse, CommonSchemas } from '@/lib/validation/server-action-validator';
import { invalidateOnRoundComplete } from '@/lib/cache/golf-stats-calculator';
import { roundStage } from '@/lib/observability/spans';
// 2026-05-17: CoachHelm trigger now runs via after(postRoundTrigger) — see
// docs/architecture/coachhelm-evidence-contract.md and Plan 04. The previous
// HTTP self-call + keepalive approach was retired (audit Finding 2/A-NEW-6).
import { logRoundSubmitted } from '@/lib/admin-logger';
import { logServerError, logServerException, logServerEvent } from '@/lib/server-error-logger';
import { findShotChainDiscontinuities } from '@/lib/golf/shot-ledger-continuity';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateQualifierEntryStats } from '@/lib/golf/qualifier-standings';
import { isClubhouseFor } from '@/clubhouse/gate';
import { expectRows } from '@/lib/supabase/expect-rows';
import { deriveLieAfter } from '@/lib/utils/shot-helpers';
import type { Json } from '@/lib/types/database';
import { getQualifierAutomaticTransition } from '@/lib/golf/qualifier-lifecycle';
import { assertHolesPlayedMatchesPayload } from '@/lib/golf/holes-played-assert';
import { validateRoundEntry, validateHolesPlayed } from '@/lib/golf/round-entry-validation';
import { recordRescuedStepOutcome } from '@/lib/observability/helm-flight-recorder';
import { describeError } from '@/lib/utils/describe-error';
import { comprehensiveShotSchema, createSafeFlightRecorder, derivePuttDistanceFeet, derivePuttMade, getPlayerTeamId, helmTracePayload, humanizeHoleFieldIssue, isRealApproachShot, isTransientAuthCheckFailure, resolveCourseId, toDbLieType } from './golf-action-shared';
import type { ActionResult, CompletedRoundUpdatePayload, RoundApproachDetailPayload, RoundHolePayload, RoundPuttDetailPayload, RoundShotGroupPayload, RoundSubmissionBackupPayload } from './golf-action-shared';

const comprehensiveHoleSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  yardage: z.number().min(0),
  score: z.number().int().min(1).max(20),
  putts: z.number().int().min(0).max(10),
  fairwayHit: z.boolean().nullable(),
  greenInRegulation: z.boolean(),
  penaltyStrokes: z.number().int().min(0).max(10),
  scrambleAttempt: z.boolean(),
  scrambleMade: z.boolean(),
  sandSaveAttempt: z.boolean(),
  sandSaveMade: z.boolean(),
  shots: z.array(comprehensiveShotSchema).min(1),
  // Stat fields calculated from shots
  drivingDistance: z.number().nullable().optional(),
  usedDriver: z.boolean().nullable().optional(),
  driveMissDirection: z.string().nullable().optional(),
  approachDistance: z.number().nullable().optional(),
  approachLie: z.string().nullable().optional(),
  approachProximity: z.number().nullable().optional(),
  approachMissDirection: z.string().nullable().optional(),
  firstPuttDistance: z.number().nullable().optional(),
  firstPuttLeave: z.number().nullable().optional(),
  firstPuttBreak: z.string().nullable().optional(),
  firstPuttSlope: z.string().nullable().optional(),
  firstPuttMissDirection: z.string().nullable().optional(),
  holedOutDistance: z.number().nullable().optional(),
  holedOutType: z.string().nullable().optional(),
});
const golfRoundComprehensiveSchema = z.object({
  courseName: z.string().min(1).max(200),
  courseCity: z.string().max(100).optional(),
  // The course library stores a free-text region ("Ontario", not "ON"), and
  // the tee picker copies it into the round verbatim. A 2-character cap here
  // rejected every round at a non-US course (UNCW, Oviinbyrd GC, 2026-09-13).
  courseState: z.string().max(100).optional(),
  courseRating: z.number().min(50).max(85).optional(),
  courseSlope: z.number().int().min(55).max(155).optional(),
  teesPlayed: z.string().max(50).optional(),
  courseId: z.string().uuid().optional(),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string().refine(d => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return false;
    // Allow up to 1 day ahead to handle timezone differences (e.g. UTC+14)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return date <= tomorrow;
  }, 'Round date cannot be in the future'),
  holes: z.array(comprehensiveHoleSchema).min(9).max(18),
  qualifierId: z.string().uuid().optional(),
  qualifierRoundNumber: z.number().int().min(1).optional(),
});
// ============================================================================
// INPUT TYPES
// ============================================================================

// Comprehensive input with full stats
interface GolfRoundInputComprehensive {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  courseId?: string;
  /** Cloud Course Library tee set (golf_course_tees.id). Optional; when present
   *  it records provenance + sources the new-round hole defaults. Par/yards are
   *  STILL snapshot into golf_holes from `holes` — the tee never rewrites them. */
  teeId?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  holes: HoleStats[];
  // Qualifier-specific fields
  qualifierId?: string;
  qualifierRoundNumber?: number;
}
/**
 * Calculate GIR (Green in Regulation) from shot data
 * GIR = reaching the green in (par - 2) strokes or fewer
 * Par 3: 1 shot, Par 4: 2 shots, Par 5: 3 shots
 */
/** Source of truth for GIR calculation on stored rounds. Client-side calculateHoleStats() in shot-helpers.ts mirrors this logic. */
function calculateGirFromShots(
  shots: Array<{ shotNumber: number; result: string | null }>,
  par: number
): boolean {
  const greenHitResults = ['green', 'hole', 'gir'];
  const shotToGreen = shots.find(s =>
    greenHitResults.includes((s.result || '').toLowerCase())
  );

  if (!shotToGreen) return false;

  // GIR means reaching green in (par - 2) strokes or fewer
  return shotToGreen.shotNumber <= (par - 2);
}
function buildRoundSubmissionBackup(
  roundData: CompletedRoundUpdatePayload,
  holesPayload: RoundHolePayload[],
  shotsPayload: RoundShotGroupPayload[],
  puttDetailsPayload: RoundPuttDetailPayload[],
  approachDetailsPayload: RoundApproachDetailPayload[]
): RoundSubmissionBackupPayload {
  return {
    version: 1,
    type: 'submit_backup',
    savedAt: new Date().toISOString(),
    roundData,
    holes: holesPayload,
    shots: shotsPayload,
    puttDetails: puttDetailsPayload,
    approachDetails: approachDetailsPayload,
  };
}
function mergeRoundWarnings(...warningGroups: Array<string[] | undefined>): string[] | undefined {
  const merged = Array.from(new Set(warningGroups.flatMap(group => group ?? [])));
  return merged.length > 0 ? merged : undefined;
}
function getPreservedRoundSubmitError(backupPersisted: boolean): string {
  // Only promise preservation when a backup actually landed. On 2026-08-20 a
  // player was told "your round data was preserved... do not re-enter it" while
  // the backup write had ALSO timed out and the round was then destroyed.
  // Telling someone not to re-enter a round you did not save is the worst
  // available outcome — it costs them the scorecard too.
  return backupPersisted
    ? 'Round submission hit a server error, but your round data was saved. Reload this round and try again — do not re-enter it.'
    : 'Round submission failed and we could not confirm a backup. Reload this round to check what was saved before you re-enter anything.';
}
/**
 * True when a write failed in a way that leaves the transaction's OUTCOME UNKNOWN.
 *
 * An HTTP abort (the `AbortSignal.timeout` in `src/lib/supabase/server.ts`)
 * cancels only the *request*. PostgreSQL keeps executing and frequently COMMITS
 * — these RPCs grant themselves a `statement_timeout` well above the client's
 * abort, so the window is wide. On 2026-08-20 `submit_round_atomic` committed
 * round `8e89c73e` in full, the client aborted at 10s and read that as failure,
 * and the "recovery" fallback then deleted the 18 holes and 72 shots the RPC had
 * just written. See docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md.
 *
 * A DB-returned error (57014 statement_timeout, a constraint, a deadlock) is NOT
 * indeterminate: Postgres rolled the transaction back and the rows are untouched,
 * so a rebuild is safe there. The discriminator is SQLSTATE — a Postgres error
 * always carries one, a client-side abort never does.
 */
function isIndeterminateWriteFailure(
  error: { message?: string | null; code?: string | null } | null | undefined
): boolean {
  if (!error) {
    return false;
  }
  if (typeof error.code === 'string' && error.code.trim() !== '') {
    return false;
  }
  const message = (error.message ?? '').toLowerCase();
  return message.includes('abort')
    || message.includes('timeouterror')
    || message.includes('the operation was aborted')
    || message.includes('fetch failed')
    // Safari/WKWebView's opaque Fetch rejection. This has no SQLSTATE and
    // carries the same unknown-commit semantics as AbortSignal.timeout.
    || message.includes('load failed')
    || message.includes('network');
}
/**
 * A client-side timeout only tells us that the HTTP response was lost, not
 * whether Postgres committed the atomic transaction. Never infer a commit from
 * the error alone: confirm the authenticated player's own round transitioned
 * to completed before acknowledging success. If that read cannot confirm the
 * state, the existing recovery path keeps every durable copy intact and asks
 * the player to retry.
 */
async function hasConfirmedRoundSubmission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roundId: string,
  playerId: string
): Promise<boolean> {
  try {
    const { data, error } = await fromUntyped(supabase, 'golf_rounds')
      .select('id, status')
      .eq('id', roundId)
      .eq('player_id', playerId)
      .maybeSingle();

    return !error && data?.status === 'completed';
  } catch {
    // A failed confirmation is deliberately treated as unknown. The caller
    // must preserve the round and recovery backup rather than guess.
    return false;
  }
}
async function persistRoundSubmissionBackup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roundId: string,
  playerId: string,
  backup: RoundSubmissionBackupPayload
): Promise<void> {
  const roundsTable = fromUntyped(supabase, 'golf_rounds');
  const { data: existingRound } = await roundsTable
    .select('draft_data')
    .eq('id', roundId)
    .eq('player_id', playerId)
    .maybeSingle();

  const existingDraftData = existingRound?.draft_data;
  const mergedDraftData = existingDraftData && typeof existingDraftData === 'object' && !Array.isArray(existingDraftData)
    ? { ...existingDraftData, submissionBackup: backup }
    : { submissionBackup: backup };

  const { error } = await roundsTable
    .update({ draft_data: mergedDraftData })
    .eq('id', roundId)
    .eq('player_id', playerId);

  if (error) {
    throw error;
  }
}
// ============================================================================
// ROUND ACTIONS
// ============================================================================

/**
 * Submit a golf round with comprehensive shot-by-shot stats
 */
async function submitGolfRoundComprehensiveImpl(
  data: GolfRoundInputComprehensive,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; warnings?: string[] }>> {
  // Constructed FIRST — before Zod, auth and the player lookup — for the same
  // reason as savePartialRound above: a stage cannot report itself to a
  // recorder that does not exist yet. `existingRoundId` and `data.qualifierId`
  // (read off the raw, not-yet-validated input, same convention the
  // validation-failure log lines below already use) are the only identity
  // known this early; player/team ids are attached as `observed` metadata on
  // their own step once resolved. This means trace_runs.player_id/team_id are
  // null for every submit trace (helm_debug_start_trace extracts them once,
  // from construction-time metadata only) — documented in
  // memory/features/shot-tracking.md rather than worked around.
  const flightRecorder = await createSafeFlightRecorder({
    workflow: 'golf.round.submit',
    roundId: existingRoundId ?? null,
    existingRoundId: existingRoundId ?? null,
    qualifierId: data?.qualifierId ?? null,
    // Which UI wrote the round, so a failure rate can be compared between Clubhouse and Fairway (swap audit §18).
    metadata: { ui: (await isClubhouseFor('player')) ? 'clubhouse' : 'fairway' },
  });
  // Idempotent trace terminator — see savePartialRoundImpl's identical
  // helper for why. Submit finalizes from many branches (RPC success,
  // reconciled-after-transport-error, busy/round_missing/already_completed
  // carve-outs, direct-submit-fallback rescue), so a shared guard against
  // double-finalize matters even more here than in savePartialRound.
  let traceEnded = false;
  const endTrace = (status: 'success' | 'failure' | 'warning' | 'pending') => {
    if (traceEnded) return;
    traceEnded = true;
    void flightRecorder.finalize(status);
  };

  try {
    // Validate input
    void flightRecorder.start('server.validation');
    const zodResult = golfRoundComprehensiveSchema.safeParse(data);
    if (!zodResult.success) {
      const firstIssue = zodResult.error.issues[0];
      // Diagnostic-only raw path, kept for the log line — never shown to a
      // player (see A3, 2026-09-02): "Invalid round data: holes.3.shots.0.
      // distanceToHoleBefore — Number must be less than or equal to 1000"
      // told the player nothing they could act on, and looked like a
      // developer error rather than "fix this one field and resubmit".
      const rawDetail = `${firstIssue?.path.join('.')} — ${firstIssue?.message}`;
      const described = firstIssue
        ? humanizeHoleFieldIssue(firstIssue.path, firstIssue)
        : { hole: null, field: '', message: rawDetail };
      void logServerError(`Round submit validation failed: ${rawDetail}`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          holesCount: data.holes?.length,
          zodErrors: zodResult.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`),
          hole: described.hole,
          field: described.field,
        },
      }, 'warning');
      // A hole/shot-field failure is recoverable with an edit (go fix that
      // field and resubmit) — `hole_invalid` matches savePartialRound's own
      // code for the same class of problem, so a client can branch on one
      // signal across both actions rather than pattern-matching prose.
      void flightRecorder.fail('server.validation', { errorSummary: 'zod_schema' });
      endTrace('failure');
      return described.hole != null
        ? { success: false, error: described.message, code: 'hole_invalid' }
        : { success: false, error: described.message };
    }

    const incompleteHole = data.holes.find(
      (hole) => hole == null || hole.score == null || hole.putts == null
    );
    if (incompleteHole) {
      void logServerError(`Round submit rejected: hole ${incompleteHole.holeNumber} missing score/putts`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holeNumber: incompleteHole.holeNumber },
      }, 'warning');
      void flightRecorder.fail('server.validation', { errorSummary: 'incomplete_hole' });
      endTrace('failure');
      return {
        success: false,
        error: `Cannot submit round: hole ${incompleteHole.holeNumber} is missing score or putts.`,
      };
    }

    // Reject impossibly low scores
    const validationTotalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
    if (validationTotalScore < data.holes.length) {
      void logServerError(`Round submit rejected: impossibly low total score ${validationTotalScore}`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, totalScore: validationTotalScore, holesCount: data.holes.length },
      }, 'warning');
      void flightRecorder.fail('server.validation', { errorSummary: 'impossible_score' });
      endTrace('failure');
      return { success: false, error: 'Total score appears invalid. Please check your scorecard.' };
    }
    if (data.holes.every(h => h.putts === 0)) {
      void logServerError('Round submit rejected: zero putts on every hole', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holesCount: data.holes.length },
      }, 'warning');
      void flightRecorder.fail('server.validation', { errorSummary: 'zero_putts' });
      endTrace('failure');
      return { success: false, error: 'A round with zero putts on every hole is not valid.' };
    }
    // Plausibility gate (shared with the live entry panel — see
    // src/lib/golf/round-entry-validation.ts). Zod checks each field's range;
    // this checks the round is physically possible: putts ≤ score − 1, score
    // within par + 10, no duplicated hole rows, no tee shot onto a green
    // 500+ yards away, and no round total better than one under par per hole
    // (the 2026-09-17 round: 18 holes, 37 strokes). `confirm`-severity issues
    // (a 420-yard drive onto the green) are the player's call and pass here.
    // RE-S4/RE-V1: a submit is a FINISHED round — 9 or 18 holes, numbered as
    // one run (1–18, 1–9 or 10–18). The in-progress row's configured count is
    // checked below, once the row has been read.
    const roundEntry = validateRoundEntry(data.holes, { requireCompleteRound: true });
    const blockingIssue = roundEntry.blocking[0];
    if (blockingIssue) {
      const code = blockingIssue.holeNumber != null ? 'hole_invalid' : 'round_implausible';
      void logServerError(`Round submit rejected: ${blockingIssue.rule}`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          holesCount: data.holes.length,
          rule: blockingIssue.rule,
          hole: blockingIssue.holeNumber ?? null,
          shot: blockingIssue.shotNumber ?? null,
          blockingRules: roundEntry.blocking.slice(0, 5).map(i => `${i.rule}@${i.holeNumber ?? 'round'}`),
        },
      }, 'warning');
      void flightRecorder.fail('server.validation', { errorSummary: blockingIssue.rule });
      endTrace('failure');
      return { success: false, error: blockingIssue.message, code };
    }
    void flightRecorder.complete('server.validation');

    const supabase = await createClient();

    void flightRecorder.start('server.auth');
    const { data: { user }, error: authCheckError } = await supabase.auth.getUser();
    if (!user) {
      // Transit failure ≠ dead session. The player is mid-round with (almost
      // always) a perfectly valid token; telling them to sign in would cost
      // them the flow for nothing. Their data is intact locally either way.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Round submit auth check failed in transit (NOT a session expiry) — retryable', {
          action: 'submitGolfRoundComprehensive',
          featureArea: 'shot_tracking',
          errorDetails: authCheckError?.message,
          extra: { courseName: data.courseName, holesCount: data.holes?.length, authStatus: authCheckError?.status ?? null },
        }, 'warning');
        void flightRecorder.warn('server.auth', { errorSummary: 'transient_auth_check_failure' });
        endTrace('warning');
        return {
          success: false,
          error: 'Could not verify your session — check your connection and submit again. Your round is still saved on this device.',
        };
      }
      void logServerError('Round submit failed: user session expired or not signed in', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: { courseName: data.courseName, holesCount: data.holes?.length },
      }, 'error');
      void flightRecorder.fail('server.auth', { errorSummary: 'session_expired' });
      endTrace('failure');
      return { success: false, error: 'You must be signed in to submit rounds' };
    }
    void flightRecorder.complete('server.auth', { observed: { user_id: user.id } });

    // Get player record.
    //
    // This is the archetype `expectRows` call site (see the header of
    // src/lib/supabase/expect-rows.ts): the block below already classified
    // an empty read here as an 'error'-severity `logServerError` call
    // BEFORE expectRows existed — i.e. the code's own pre-existing judgment
    // is that "no golf_players row for this authenticated user" is an
    // anomaly at this exact call site, not a benign "still onboarding"
    // empty state. (Every route that can invoke this action also sits
    // under the `(dashboard)` layout, which redirects to `/golf/player`
    // unless `player.onboarding_completed` is true — corroborating, though
    // that's a page-render gate, not a guarantee the server action itself
    // re-checks.) And `golf_players_select`'s first RLS clause is the
    // unconditional `user_id = auth.uid()` (verified against production,
    // no team/status predicate), so for a caller reading their OWN row by
    // that exact user_id, RLS can never be the reason a row that exists
    // comes back hidden — the read is "guaranteed-context" in the sense
    // expectRows requires.
    // `.maybeSingle()` (not `.single()`) so a silent `{ data: null, error:
    // null }` reaches expectRows instead of being pre-converted to a
    // PGRST116 Postgres error — same downstream `if (!player)` branch
    // either way, since only `data` was ever destructured here.
    void flightRecorder.start('server.player');
    const playerLookupResult = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: player } = expectRows(playerLookupResult, {
      action: 'submitGolfRoundComprehensive',
      featureArea: 'shot_tracking',
      feature: 'round_tracking',
      table: 'golf_players',
      userId: user.id,
    });

    if (!player) {
      void logServerError('Round submit failed: player profile not found', {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        userId: user.id,
        userEmail: user.email,
        extra: { courseName: data.courseName },
      }, 'error');
      void flightRecorder.fail('server.player', { errorSummary: 'player_not_found' });
      endTrace('failure');
      return { success: false, error: 'Player profile not found' };
    }
    void flightRecorder.complete('server.player', { observed: { player_id: player.id } });

    // Existing in-progress rows are the authority for their identity. A browser
    // can be old, resumed from recovery, or have lost setup state while it was
    // backgrounded; it must never be able to detach or retarget a started
    // qualifier round when it submits the scorecard.
    let effectiveRoundType = data.roundType;
    let effectiveQualifierId = data.qualifierId;
    let effectiveQualifierRoundNumber = data.qualifierRoundNumber;

    // If updating an existing round, verify ownership and that it's not already completed
    if (existingRoundId) {
      // A malformed id never reaches the reads below (and never the id-only service-role probe).
      if (!CommonSchemas.uuid.safeParse(existingRoundId).success) {
        return { success: false, error: 'Invalid round ID' };
      }
      // SECURITY: Verify the round belongs to this player and is not already completed
      const { data: existingRound, error: verifyError } = await supabase
        .from('golf_rounds')
        .select('id, player_id, status, round_type, qualifier_id, qualifier_round_number, holes_played')
        .eq('id', existingRoundId)
        .eq('player_id', player.id)
        .maybeSingle();

      // Swap audit R-5: a round whose row is gone (discarded elsewhere, or a
      // create that never landed) used to get the permission sentence below,
      // which no client recovers from — the round_missing re-create only runs
      // on the bare key, so the submit overlay dead-ended. Answer round_missing
      // when the row provably does not exist for ANYONE: the client then
      // re-submits the same scorecard as a new round (the no-id branch creates
      // and completes it atomically). The id-only existence check uses the
      // admin client because RLS hides another player's row; a row that does
      // exist under another player keeps the refusal, so a scorecard queued on
      // a shared device can never be re-created under the wrong account.
      if (!verifyError && !existingRound) {
        let rowExists: boolean | null = null;
        try {
          const { data: anyRow, error: anyRowError } = await createAdminClient()
            .from('golf_rounds')
            .select('id')
            .eq('id', existingRoundId)
            .maybeSingle();
          rowExists = anyRowError ? null : anyRow != null;
        } catch {
          rowExists = null;
        }
        if (rowExists === false) {
          void logServerError('Round submit target is missing before submit — client may re-submit as new', {
            action: 'submitGolfRoundComprehensive',
            featureArea: 'shot_tracking',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            extra: { path: 'existing_round_preflight' },
          }, 'warning');
          return { success: false, error: 'round_missing' };
        }
        if (rowExists === null) {
          // Unknown, not proven gone: a transient answer the client keeps the
          // round on the device for and offers again.
          return { success: false, error: 'Failed to submit round. Your data was preserved on this device. Please try again.' };
        }
      }

      if (verifyError || !existingRound) {
        void logServerError('Round submit failed: existing round not found or permission denied', {
          action: 'submitGolfRoundComprehensive',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          errorCode: verifyError?.code,
        }, 'warning');
        return { success: false, error: 'Round not found or you do not have permission to update it.' };
      }

      if (existingRound.status === 'completed') {
        void logServerError('Round submit rejected: round already completed (double-submit attempt)', {
          action: 'submitGolfRoundComprehensive',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
        }, 'warning');
        return { success: false, error: 'This round has already been submitted. It cannot be submitted again.' };
      }

      // RE-S4: the payload's own length used to be the only hole count, so an
      // 18-hole round submitted with 9 scored holes was saved as a completed
      // 9-hole round. The in-progress row carries the count it was started
      // with; a missing/non-9/18 value (older rows, test doubles) skips this.
      if (existingRound.status === 'in_progress') {
        const configuredIssue = validateHolesPlayed(
          roundEntry.holesPlayed,
          (existingRound as { holes_played?: number | null }).holes_played,
        )[0];
        if (configuredIssue) {
          void logServerError(`Round submit rejected: ${configuredIssue.rule}`, {
            action: 'submitGolfRoundComprehensive',
            featureArea: 'shot_tracking',
            roundId: existingRoundId,
            playerId: player.id,
            extra: {
              courseName: data.courseName,
              holesCount: data.holes.length,
              holesPlayed: roundEntry.holesPlayed,
              configuredHoles: (existingRound as { holes_played?: number | null }).holes_played ?? null,
            },
          }, 'warning');
          return { success: false, error: configuredIssue.message, code: 'round_implausible' };
        }
      }

      effectiveRoundType = (existingRound.round_type ?? data.roundType) as GolfRoundInputComprehensive['roundType'];
      const persistedQualifierId = existingRound.qualifier_id;
      const persistedQualifierRoundNumber = existingRound.qualifier_round_number;

      if (persistedQualifierId) {
        if (data.qualifierId && data.qualifierId !== persistedQualifierId) {
          void logServerError('Round submit rejected: stale client tried to retarget an existing qualifier round', {
            action: 'submitGolfRoundComprehensive.qualifierIdentity',
            featureArea: 'qualifiers',
            roundId: existingRoundId,
            playerId: player.id,
            extra: { persistedQualifierId, submittedQualifierId: data.qualifierId },
          }, 'warning');
          return { success: false, error: 'This round belongs to a different qualifier. Reload it and try again.' };
        }
        if (
          data.qualifierRoundNumber != null &&
          persistedQualifierRoundNumber != null &&
          data.qualifierRoundNumber !== persistedQualifierRoundNumber
        ) {
          void logServerError('Round submit rejected: stale client tried to change an existing qualifier round number', {
            action: 'submitGolfRoundComprehensive.qualifierIdentity',
            featureArea: 'qualifiers',
            roundId: existingRoundId,
            playerId: player.id,
            extra: {
              persistedQualifierId,
              persistedQualifierRoundNumber,
              submittedQualifierRoundNumber: data.qualifierRoundNumber,
            },
          }, 'warning');
          return { success: false, error: 'This round belongs to a different qualifier round. Reload it and try again.' };
        }

        // A stored qualifier link is always a qualifier round. This also
        // normalizes legacy parents whose type was incorrectly left as
        // "practice" while their qualifier_id was already durable.
        effectiveRoundType = 'qualifier';
        effectiveQualifierId = persistedQualifierId;
        // Older parents can have the qualifier link but lack the round number.
        // Keep the durable number when present; otherwise validate the supplied
        // number instead of silently erasing it at completion.
        effectiveQualifierRoundNumber = persistedQualifierRoundNumber ?? data.qualifierRoundNumber;
      } else if (existingRound.round_type !== 'qualifier' && data.qualifierId) {
        // A submitted scorecard is still not the place to RECLASSIFY a round —
        // that is `updateRoundType`, which validates the qualifier and leaves an
        // audit trail. What changed 2026-08-31 is the consequence: the client's
        // stale qualifier data is now IGNORED rather than used to refuse the
        // submission.
        //
        // Refusing stranded a real case. A player may now change their own live
        // round's type from the scoring screen, so "was a qualifier round when
        // this client loaded, is a practice round now" is an ordinary sequence,
        // not a stale-client attack. The old branch met it with "ask a coach to
        // update its type" — for a change the player had just made themselves,
        // on a round they could no longer submit.
        //
        // Dropping the value keeps the protection intact (the client still
        // cannot reclassify through submit) and honours the rule stated at the
        // top of this block: the persisted row is the authority for its own
        // identity.
        void logServerError(
          'Round submit: client carried qualifier data for a round that is no longer a qualifier round; using the persisted identity and ignoring it',
          {
            action: 'submitGolfRoundComprehensive.qualifierIdentity',
            featureArea: 'qualifiers',
            roundId: existingRoundId,
            playerId: player.id,
            extra: { persistedRoundType: existingRound.round_type, submittedQualifierId: data.qualifierId },
          },
          'warning',
        );
        effectiveQualifierId = undefined;
        effectiveQualifierRoundNumber = undefined;
      }
    }

    // Server-side qualifier validation
    if (effectiveQualifierId) {
      // Verify qualifier exists and is not completed
      const { data: qualifierRaw, error: qualifierError } = await supabase
        .from('golf_qualifiers')
        .select('id, status, num_rounds')
        .eq('id', effectiveQualifierId)
        .single();

      const qualifier = qualifierRaw as { id: string; status: string; num_rounds: number } | null;

      if (qualifierError || !qualifier) {
        return { success: false, error: 'Qualifier not found.' };
      }

      // REMOVED 2026-08-31, owner instruction: "there should be no time
      // constraints." A concluded qualifier used to refuse submission here
      // with `qualifier_closed`. It no longer does — a round that belongs in a
      // qualifier still belongs in it after the coach has closed it, and the
      // coach is the one who closed it.
      //
      // Every other rule below is untouched and is what keeps this safe: the
      // player must be ENTERED, the round number must be within `num_rounds`,
      // and the slot must not already be taken. Those are the rules that
      // protect the standings; the status check only protected the clock.
      //
      // The Sentry-tiering note this comment replaced is preserved in the
      // codepath that still needs it — `qualifier_closed` remains in
      // EXPECTED_SOFT_FAILURE_CODES, and removing the last producer of a code
      // does not make the allowlist wrong, only unused.

      // Verify the player has an entry in this qualifier
      const { data: qualifierEntry, error: entryError } = await supabase
        .from('golf_qualifier_entries')
        .select('id')
        .eq('qualifier_id', effectiveQualifierId)
        .eq('player_id', player.id)
        .single();

      if (entryError || !qualifierEntry) {
        return { success: false, error: 'You are not entered in this qualifier.' };
      }

      // num_rounds IS a live, typed golf_qualifiers column (the "removed in the
      // schema rebuild" note above was stale — the write path was reconciled
      // long ago but this read/cap-check path never was, so a qualifier
      // configured for e.g. 1 round never stopped accepting round 2, 3, 4...).
      const numRounds = qualifier.num_rounds ?? 1;
      if (
        effectiveQualifierRoundNumber == null
        || !Number.isInteger(effectiveQualifierRoundNumber)
        || effectiveQualifierRoundNumber < 1
      ) {
        return {
          success: false,
          error: 'This started qualifier round needs a valid qualifier round number. Reload it and try again.',
        };
      }
      if (effectiveQualifierRoundNumber && effectiveQualifierRoundNumber > numRounds) {
        return {
          success: false,
          error: `This qualifier only has ${numRounds} round${numRounds === 1 ? '' : 's'}. Round ${effectiveQualifierRoundNumber} is beyond the configured count.`,
        };
      }

      // Prevent duplicate qualifier round numbers
      if (effectiveQualifierRoundNumber) {
        const { data: existingRound } = await supabase
          .from('golf_rounds')
          .select('id')
          .eq('qualifier_id', effectiveQualifierId)
          .eq('player_id', player.id)
          .eq('qualifier_round_number', effectiveQualifierRoundNumber)
          .neq('status', 'abandoned')
          .maybeSingle();

        if (existingRound && existingRound.id !== existingRoundId) {
          // `code` keys the Bridge's expected-soft-failure classification
          // (EXPECTED_SOFT_FAILURE_CODES in observe-action-result.ts) — the
          // registry knew this code but no envelope carried it, so this
          // by-design rejection minted error-severity incidents.
          return { success: false, code: 'qualifier_round_already_exists', error: `You have already submitted round ${effectiveQualifierRoundNumber} for this qualifier.` };
        }
      }
    }

    // Calculate round totals from holes (schema-aligned)
    const totalScore = data.holes.reduce((sum, h) => sum + h.score, 0);
    const totalPar = data.holes.reduce((sum, h) => sum + h.par, 0);
    const totalToPar = totalScore - totalPar;
    const totalPutts = data.holes.reduce((sum, h) => sum + h.putts, 0);
    const fairwaysHit = data.holes.filter(h => h.fairwayHit === true && h.par >= 4).length;
    // Denominator = par-4/5 holes where a fairway result was actually recorded.
    // Counting every par-4/5 (incl. holes with no fairway_hit logged) inflates the
    // denominator and deflates driving accuracy (e.g. 121/203=59.6% vs 121/199=60.8%).
    const fairwaysTotal = data.holes.filter(h => h.par >= 4 && h.fairwayHit != null).length;
    // Server-calculate GIR from shot data for accuracy
    const greensInReg = data.holes.filter(h => calculateGirFromShots(h.shots, h.par)).length;

    // Calculate front nine / back nine splits
    const frontNineHoles = data.holes.filter(h => h.holeNumber <= 9);
    const backNineHoles = data.holes.filter(h => h.holeNumber > 9);
    const frontNine = frontNineHoles.length > 0 ? frontNineHoles.reduce((sum, h) => sum + h.score, 0) : null;
    const backNine = backNineHoles.length > 0 ? backNineHoles.reduce((sum, h) => sum + h.score, 0) : null;
    const totalPenalties = data.holes.reduce((sum, h) => sum + (h.penaltyStrokes ?? 0), 0);

    // Prepare round data
    const teamId = await getPlayerTeamId(supabase, player.id);
    let resolvedCourseId = await resolveCourseId(supabase, data.courseName, data.courseId);
    // When a Cloud Course Library tee is chosen, its course is authoritative for
    // course_id (more reliable than fuzzy name matching). Par/yards still come
    // from the client hole payload — the tee only sets provenance + course link.
    if (data.teeId) {
      const { data: teeRow } = await supabase
        .from('golf_course_tees')
        .select('course_id')
        .eq('id', data.teeId)
        .maybeSingle();
      if (teeRow?.course_id) resolvedCourseId = teeRow.course_id;
    }
    const roundData: CompletedRoundUpdatePayload = {
      player_id: player.id,
      team_id: teamId,
      course_id: resolvedCourseId,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating ?? null,
      course_slope: data.courseSlope ?? null,
      tees_played: data.teesPlayed || null,
      tee_id: data.teeId || null,
      round_type: effectiveRoundType,
      round_date: data.roundDate,
      // Derived from the distinct hole rows (duplicates were refused above),
      // never from a client-supplied count — so the A4 assert below compares
      // two independently computed numbers instead of one value with itself.
      holes_played: roundEntry.holesPlayed,
      total_score: totalScore,
      score_to_par: totalToPar,
      total_putts: totalPutts,
      total_fairways_hit: fairwaysHit,
      total_fairways: fairwaysTotal,
      total_gir: greensInReg,
      total_gir_possible: data.holes.length,
      total_penalties: totalPenalties,
      front_nine: frontNine,
      back_nine: backNine,
      status: 'completed' as const, // Mark as completed when all holes are done
      qualifier_id: effectiveQualifierId || null,
      qualifier_round_number: effectiveQualifierRoundNumber || null,
    };

    // Build hole/shot/detail payloads for RPC or manual insert
    const holesPayload = data.holes.map(hole => ({
      hole_number: hole.holeNumber,
      par: hole.par,
      yardage: hole.yardage ?? null,
      score: hole.score,
      putts: hole.putts,
      fairway_hit: hole.fairwayHit ?? null,
      gir: calculateGirFromShots(hole.shots, hole.par),
      penalty_strokes: hole.penaltyStrokes ?? null,
      up_and_down: hole.scrambleAttempt ? hole.scrambleMade : null,
      sand_save: hole.sandSaveAttempt ? hole.sandSaveMade : null,
    }));

    // A4: the RPC treats a missing/mismatched holes_played as trust-the-
    // payload ("accepts any count when holes_played is omitted") rather than
    // a refusal — assert it here, before either RPC call below, so a future
    // change that decouples `roundData.holes_played` from `holesPayload`
    // (a client-supplied count, a renamed/dropped field at the call site)
    // fails loudly at the TS layer with an actionable message instead of
    // silently trusting whatever was supplied.
    const holesPlayedCheck = assertHolesPlayedMatchesPayload(roundData.holes_played, holesPayload.length);
    if (!holesPlayedCheck.ok) {
      void logServerError(`Round submit refused: ${holesPlayedCheck.error}`, {
        action: 'submitGolfRoundComprehensive',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          holesPlayed: roundData.holes_played,
          holesPayloadLength: holesPayload.length,
        },
      }, 'error');
      return { success: false, error: holesPlayedCheck.error };
    }

    const shotsPayload = data.holes.map(hole => ({
      hole_number: hole.holeNumber,
      shots: hole.shots.map(shot => ({
        shot_number: shot.shotNumber,
        shot_type: shot.shotType,
        club_type: shot.clubType,
        lie_before: shot.lieBefore,
        lie_after: deriveLieAfter(shot),
        distance_to_hole_before: shot.distanceToHoleBefore,
        distance_unit_before: shot.distanceUnitBefore,
        result: shot.result,
        distance_to_hole_after: shot.distanceToHoleAfter,
        distance_unit_after: shot.distanceUnitAfter,
        shot_distance: shot.shotDistance,
        miss_direction: shot.missDirection || null,
        putt_break: shot.puttBreak || null,
        putt_slope: shot.puttSlope || null,
        putt_distance_feet: derivePuttDistanceFeet(shot),
        putt_made: derivePuttMade(shot),
        is_penalty: shot.isPenalty,
        penalty_type: shot.penaltyType || null,
      })),
    }));

    // Build putt and approach detail payloads keyed by (hole_number, shot_number)
    const puttDetailsPayload: Array<{
      hole_number: number;
      shot_number: number;
      miss_tags: string[];
      break_direction: string | null;
      distance_feet: number | null;
      made: boolean;
    }> = [];
    const approachDetailsPayload: Array<{
      hole_number: number;
      shot_number: number;
      miss_direction: string | null;
      lie_type: string | null;
      distance_from_green_yards: number | null;
    }> = [];

    for (const hole of data.holes) {
      for (const shot of hole.shots) {
        if (shot.shotType === 'putting') {
          const rawDist = shot.puttDistanceFeet ?? derivePuttDistanceFeet(shot);
          puttDetailsPayload.push({
            hole_number: hole.holeNumber,
            shot_number: shot.shotNumber,
            miss_tags: shot.puttMissTags || [],
            break_direction: shot.puttBreak || null,
            distance_feet: rawDist != null ? Math.min(rawDist, 500) : null,
            made: shot.result === 'hole',
          });
        }

        // Tee shots on par 3s ARE the approach; layups and post-penalty tee
        // shots are NOT, even though they carry shot_type='approach'.
        if (isRealApproachShot(shot, hole.par) &&
            shot.result !== 'green' && shot.result !== 'hole') {
          approachDetailsPayload.push({
            hole_number: hole.holeNumber,
            shot_number: shot.shotNumber,
            miss_direction: shot.approachMissDirection || null,
            lie_type: toDbLieType(shot.approachMissLieType),
            distance_from_green_yards: shot.distanceToHoleAfter != null
              ? (shot.distanceUnitAfter === 'feet'
                ? Math.round(shot.distanceToHoleAfter / 3)
                : shot.distanceToHoleAfter)
              : null,
          });
        }
      }
    }

    const submissionBackup = buildRoundSubmissionBackup(
      roundData,
      holesPayload,
      shotsPayload,
      puttDetailsPayload,
      approachDetailsPayload
    );
    const shotsCount = shotsPayload.reduce((sum, group) => sum + group.shots.length, 0);

    // Audit row 46: per-shot SG assumes each shot starts where the previous
    // one ended. Flag (never refuse) a submitted ledger that does not chain,
    // so a discontinuity shows up in telemetry instead of silently shifting
    // strokes gained between shots. Info-level: this is data quality, not an
    // outage.
    const chainBreaks = findShotChainDiscontinuities(shotsPayload);
    if (chainBreaks.length > 0) {
      void logServerEvent(`Round submit: ${chainBreaks.length} shot-chain discontinuities`, {
        action: 'submitGolfRoundComprehensive.shotChain',
        featureArea: 'shot_tracking',
        extra: { shotsCount, discontinuities: chainBreaks.slice(0, 20) },
      });
    }

    const attemptDirectSubmitFallback = async (
      _roundId: string,
      _path: 'existing_round' | 'new_round_rpc',
      _trigger: Record<string, unknown>,
      backupPersisted: boolean
    ): Promise<{ success: true; warnings?: string[] } | { success: false; error: string }> => {
      // A direct delete-and-reinsert submit path can never prove that an
      // indeterminate RPC did not already commit. Preserve the server draft
      // and local recovery payload; recovery retries only the atomic RPC.
      return { success: false, error: getPreservedRoundSubmitError(backupPersisted) };
    };

    let round: { id: string };
    let detailWarnings: string[] | undefined;

    // The recorder for the whole submit call — constructed at the TOP of
    // this function (before Zod/auth/player), not here. It already spans
    // both the existing-round and new-round branches below, correlated to
    // the same db.submit_round_atomic step either way.

    // POST-WRITE VERIFICATION — the submit path had NONE of this before this
    // refit (server.validation/auth/player and verify.round/holes/shots were
    // declared but had no call site at all: "1 of 11 declared steps, 6 never
    // ran"). Mirrors savePartialRound's own verify.* block: read the durable
    // state back after a successful commit and record observed-vs-expected.
    // Deliberately non-fatal and 'best_effort' (golf-round-flight-workflow.ts)
    // — the write already committed, so a failed or slow read must not turn a
    // successful submit into an error. One helper shared by every success
    // branch below (both the existingRoundId and new-round RPC paths, each
    // with their own round id).
    const runSubmitVerification = async (targetRoundId: string): Promise<void> => {
      void flightRecorder.start('verify.round');
      void flightRecorder.start('verify.holes');
      void flightRecorder.start('verify.shots');
      try {
        const [{ count: holeCount }, { count: shotCount }] = await Promise.all([
          supabase.from('golf_holes').select('id', { count: 'exact', head: true }).eq('round_id', targetRoundId),
          supabase.from('golf_shots').select('id', { count: 'exact', head: true }).eq('round_id', targetRoundId),
        ]);
        void flightRecorder.complete('verify.round', { observed: { round_id: targetRoundId } });
        void flightRecorder.complete('verify.holes', {
          observed: { expected: holesPayload.length, actual: holeCount ?? null },
        });
        void flightRecorder.complete('verify.shots', {
          observed: { expected: shotsCount, actual: shotCount ?? null },
        });
      } catch (verifyErr) {
        const errorSummary = describeError(verifyErr);
        void flightRecorder.warn('verify.round', { errorSummary });
        void flightRecorder.warn('verify.holes', { errorSummary });
        void flightRecorder.warn('verify.shots', { errorSummary });
      }
    };

    if (existingRoundId) {
      let backupPersisted = false;
      try {
        await persistRoundSubmissionBackup(supabase, existingRoundId, player.id, submissionBackup);
        backupPersisted = true;
      } catch (backupError) {
        await logServerError(
          `Failed to persist round submission backup: ${describeError(backupError)}`,
          {
            action: 'submitGolfRoundComprehensive',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            extra: { path: 'existing_round', stage: 'backup_persist' },
          },
          'error'
        );
      }

      // Use atomic RPC — wraps entire submit in a single transaction
      void flightRecorder.start('db.submit_round_atomic');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await roundStage<{ data: any; error: any }>(
        'submit_round_atomic',
        {
          holes_count: holesPayload.length,
          shots_count: shotsPayload.length,
          existing_round: true,
        },
        () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc('submit_round_atomic', {
            p_round_id: existingRoundId,
            p_round_data: { ...roundData, ...helmTracePayload(flightRecorder.traceId) },
            p_holes: holesPayload,
            p_shots: shotsPayload,
            p_putt_details: puttDetailsPayload,
            p_approach_details: approachDetailsPayload,
          })
      );

      if (rpcError) {
        const submissionCommitted = isIndeterminateWriteFailure(rpcError)
          && await hasConfirmedRoundSubmission(supabase, existingRoundId, player.id);

        if (submissionCommitted) {
          // The atomic RPC completed after the client lost its response. Its
          // transaction guarantees the scorecard and shots committed together,
          // so acknowledge the actual durable result instead of inviting a
          // duplicate submit or emitting a false production error.
          void flightRecorder.complete('db.submit_round_atomic', { metadata: { reconciled_after_transport_error: true } });
          await runSubmitVerification(existingRoundId);
          // Not finalized here — see the single `endTrace('success')` after
          // the qualifier-transition block below, which is what this and
          // every other success fall-through in this function defers to.
          round = { id: existingRoundId };
        } else {
          await logServerException(new Error(rpcError.message), { action: 'submitGolfRoundComprehensive.rpc', helmTraceId: flightRecorder.traceId, traceStep: 'db.submit_round_atomic' });
          await logServerError(`Round submit RPC failed: ${rpcError.message}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            errorCode: rpcError.code,
            errorHint: rpcError.hint,
            errorDetails: rpcError.details,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
            extra: { path: 'existing_round', courseName: data.courseName },
          }, 'critical');
          const fallbackResult = await attemptDirectSubmitFallback(
            existingRoundId,
            'existing_round',
            {
              source: 'rpc_error',
              code: rpcError.code,
              message: rpcError.message,
              hint: rpcError.hint,
              details: rpcError.details,
            },
            backupPersisted
          );
          // `deferFinalizeOnRescue: true` — a RESCUED outcome falls through
          // to the qualifier-transition block below, whose real,
          // response-blocking duration must land inside the trace's window
          // before it closes; the single `endTrace('success')` after that
          // block is the one finalize call for every success path in this
          // function, this one included. An UNRESCUED outcome is unaffected
          // by the flag (see recordRescuedStepOutcome's own doc) — it
          // finalizes 'failure' immediately and returns below, so
          // `traceEnded` is marked synchronously to guard the `finally`
          // safety net against a second, conflicting finalize call racing
          // this fire-and-forget one.
          if (!fallbackResult.success) {
            traceEnded = true;
          }
          void recordRescuedStepOutcome(flightRecorder, {
            failedStepKey: 'db.submit_round_atomic',
            fallbackStepKey: 'db.direct_submit_fallback',
            rescued: fallbackResult.success,
            stepInput: { errorCode: rpcError.code, errorSummary: rpcError.message },
            fallbackStepInput: { observed: { round_id: existingRoundId } },
            deferFinalizeOnRescue: true,
          });
          if (!fallbackResult.success) {
            return fallbackResult;
          }

          detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
          round = { id: existingRoundId };
        }
      } else {
        if (rpcResult && !rpcResult.success) {
          // 'busy' = single-flight guard: a same-round auto-save (or a second
          // submit) still held the row past the RPC's bounded 3s wait
          // (supabase/migrations/20260821043500_single_flight_round_submit.sql).
          // Expected under concurrent-save load, not a failure — no
          // error-severity log.
          if (rpcResult.error === 'busy') {
            void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'busy' });
            endTrace('warning');
            return { success: false, error: 'Another save for this round is just finishing — try again in a moment.' };
          }
          // submit_round_atomic only ever returns {success:false, error:<a
          // fixed validation/lock message>} — see supabase/migrations/
          // 20260821043500_single_flight_round_submit.sql and
          // 20260820170000_single_flight_partial_round_save.sql, its shared
          // template. It never emits error_code/step/detail; a genuine
          // internal fault surfaces as a transport `rpcError` (handled
          // above, with a real SQLSTATE) instead. The prior isInternalError
          // branch here — keyed on an `error === 'internal_error'` value
          // this RPC has never produced — is removed rather than kept as
          // dead code implying a response shape that isn't real.
          // submit_round_atomic answers "not found", "already completed" and
          // "not yours" with ONE message, so the raw string cannot tell a player
          // which of the three happened — and two of them have opposite fixes.
          // Disambiguate against the row itself before deciding.
          //
          // This is the submit-side twin of the savePartialRound 'round_missing'
          // bug measured 2026-09-01: there, a client held a roundId with no row
          // and retried forever. Here the failure is user-visible rather than a
          // silent loop, but the outcome is the same — a finished round that
          // cannot be submitted.
          if (rpcResult.error === 'conflict') {
            // The held submit lock (20261001000000) answers 'conflict' when the
            // round changed since this client read it. Same key as the save
            // path, so the round screen prompts a reload instead of reporting
            // an error (swap audit §16).
            void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'conflict' });
            endTrace('warning');
            return { success: false, error: 'conflict' };
          }
          if (typeof rpcResult.error === 'string' && SUBMIT_ROUND_UNAVAILABLE.test(rpcResult.error)) {
            const alreadyCommitted = await hasConfirmedRoundSubmission(supabase, existingRoundId, player.id);
            if (alreadyCommitted) {
              // The round IS submitted — an auto-save racing the submit, or a
              // double-tap. Acknowledge the durable result rather than telling
              // the player their finished round is missing.
              void flightRecorder.complete('db.submit_round_atomic', { metadata: { already_completed: true } });
              await runSubmitVerification(existingRoundId);
              // Deferred to the single `endTrace('success')` after the
              // qualifier-transition block — see that call's own comment.
              round = { id: existingRoundId };
            } else {
              // No row for this id. Re-submitting as a NEW round is safe
              // precisely BECAUSE we just proved nothing is there to duplicate;
              // blind recreation without this check could duplicate a completed
              // round, which is why the key is only returned after the lookup.
              void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'round_missing' });
              endTrace('warning');
              await logServerError(`Round submit target is missing — client may re-submit as new: ${rpcResult.error}`, {
                action: 'submitGolfRoundComprehensive',
                roundId: existingRoundId,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                holesCount: holesPayload.length,
                shotsCount,
                helmTraceId: flightRecorder.traceId,
                traceStep: 'db.submit_round_atomic',
                extra: { rpcResult, path: 'existing_round' },
              }, 'warning');
              return { success: false, error: 'round_missing' };
            }
          } else {
          void flightRecorder.fail('db.submit_round_atomic', { errorSummary: rpcResult.error });
          endTrace('failure');
          await logServerError(`Round submit RPC returned failure: ${rpcResult.error}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
            extra: { rpcResult, path: 'existing_round' },
          }, 'error');
          return { success: false, error: rpcResult.error || 'Failed to submit round.' };
          }
        } else {
          void flightRecorder.complete('db.submit_round_atomic', { observed: { round_id: existingRoundId } });
          await runSubmitVerification(existingRoundId);
          // Deferred to the single `endTrace('success')` after the
          // qualifier-transition block — see that call's own comment.
          // Log warnings from resilient detail inserts (round saved successfully)
          if (rpcResult?.warnings?.length > 0) {
            detailWarnings = rpcResult.warnings as string[];
            await logServerError(
              `Round submitted with ${rpcResult.warnings.length} detail warning(s)`,
              {
                action: 'submitGolfRoundComprehensive',
                roundId: existingRoundId,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                helmTraceId: flightRecorder.traceId,
                extra: { warnings: rpcResult.warnings, path: 'existing_round' },
              },
              'warning'
            );
          }

          round = { id: existingRoundId };
        }
      }
    } else {
      // Insert as draft — stats trigger only fires when status='completed'
      const { data: newRound, error: roundError } = await supabase
        .from('golf_rounds')
        .insert({
          ...roundData,
          status: 'draft',
          draft_data: { submissionBackup } as unknown as Json,
        })
        .select('id')
        .single();

      if (roundError || !newRound) {
        await logServerError(`Round draft insert failed: ${roundError?.message || 'no data returned'}`, {
          action: 'submitGolfRoundComprehensive',
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          errorCode: roundError?.code,
          errorHint: roundError?.hint,
          errorDetails: roundError?.details,
          extra: { path: 'new_round_draft', courseName: data.courseName },
        }, 'critical');
        // The draft insert never reached the RPC, so db.submit_round_atomic
        // stays 'pending' (a missing required step) rather than being marked
        // failed for a step that was never attempted.
        endTrace('failure');
        return { success: false, error: 'Failed to save round. Please try again.' };
      }

      // Atomically set status='completed' + insert holes/shots inside one transaction.
      // The stats trigger fires AFTER all hole data exists.
      void flightRecorder.start('db.submit_round_atomic');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcResult, error: rpcError } = await roundStage<{ data: any; error: any }>(
        'submit_round_atomic',
        {
          holes_count: holesPayload.length,
          shots_count: shotsPayload.length,
          existing_round: false,
        },
        () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc('submit_round_atomic', {
            p_round_id: newRound.id,
            p_round_data: { ...roundData, ...helmTracePayload(flightRecorder.traceId) },
            p_holes: holesPayload,
            p_shots: shotsPayload,
            p_putt_details: puttDetailsPayload,
            p_approach_details: approachDetailsPayload,
          })
      );

      if (rpcError) {
        const submissionCommitted = isIndeterminateWriteFailure(rpcError)
          && await hasConfirmedRoundSubmission(supabase, newRound.id, player.id);

        if (submissionCommitted) {
          void flightRecorder.complete('db.submit_round_atomic', { metadata: { reconciled_after_transport_error: true } });
          await runSubmitVerification(newRound.id);
          // Deferred to the single `endTrace('success')` after the
          // qualifier-transition block — see that call's own comment.
          round = { id: newRound.id };
        } else {
          // Do NOT delete the round — preserve it so the user can retry.
          // Deleting here caused permanent data loss when the RPC failed
          // (e.g., trigger errors, network timeouts, race conditions).
          await logServerException(new Error(rpcError.message), { action: 'submitGolfRoundComprehensive.rpc.new', helmTraceId: flightRecorder.traceId, traceStep: 'db.submit_round_atomic' });
          await logServerError(`Round submit RPC failed (new round): ${rpcError.message}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: newRound.id,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            errorCode: rpcError.code,
            errorHint: rpcError.hint,
            errorDetails: rpcError.details,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
            extra: { path: 'new_round_rpc', courseName: data.courseName },
          }, 'critical');
          const fallbackResult = await attemptDirectSubmitFallback(
            newRound.id,
            'new_round_rpc',
            {
              source: 'rpc_error',
              code: rpcError.code,
              message: rpcError.message,
              hint: rpcError.hint,
              details: rpcError.details,
            },
            true
          );
          // See the mirrored comment on the existing-round branch above for
          // why `deferFinalizeOnRescue: true` is passed unconditionally and
          // `traceEnded` is only set for the unrescued outcome.
          if (!fallbackResult.success) {
            traceEnded = true;
          }
          void recordRescuedStepOutcome(flightRecorder, {
            failedStepKey: 'db.submit_round_atomic',
            fallbackStepKey: 'db.direct_submit_fallback',
            rescued: fallbackResult.success,
            stepInput: { errorCode: rpcError.code, errorSummary: rpcError.message },
            fallbackStepInput: { observed: { round_id: newRound.id } },
            deferFinalizeOnRescue: true,
          });
          if (!fallbackResult.success) {
            return fallbackResult;
          }

          detailWarnings = mergeRoundWarnings(detailWarnings, fallbackResult.warnings);
          round = { id: newRound.id };
        }
      } else {
        if (rpcResult && !rpcResult.success) {
          // Do NOT delete — the round is preserved as a draft for retry
          // 'busy' = single-flight guard: a same-round auto-save (or a second
          // submit) still held the row past the RPC's bounded 3s wait
          // (supabase/migrations/20260821043500_single_flight_round_submit.sql).
          // Expected under concurrent-save load, not a failure — no
          // error-severity log.
          if (rpcResult.error === 'busy') {
            void flightRecorder.warn('db.submit_round_atomic', { errorSummary: 'busy' });
            endTrace('warning');
            return { success: false, error: 'Another save for this round is just finishing — try again in a moment.' };
          }
          // submit_round_atomic only ever returns {success:false,
          // error:<a fixed validation/lock message>} — see
          // supabase/migrations/20260821043500_single_flight_round_submit.sql.
          // It never emits error_code/step/detail; a genuine internal fault
          // surfaces as a transport `rpcError` (handled above, with a real
          // SQLSTATE) instead. The prior isInternalError branch here is
          // removed rather than kept as dead code implying a response shape
          // that isn't real — see the mirrored comment on the existing-round
          // branch above.
          void flightRecorder.fail('db.submit_round_atomic', { errorSummary: rpcResult.error });
          endTrace('failure');
          await logServerError(`Round submit RPC returned failure (new round): ${rpcResult.error}`, {
            action: 'submitGolfRoundComprehensive',
            roundId: newRound.id,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            shotsCount,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.submit_round_atomic',
            extra: { rpcResult, path: 'new_round_rpc' },
          }, 'error');
          return { success: false, error: rpcResult.error || 'Failed to submit round.' };
        } else {
          void flightRecorder.complete('db.submit_round_atomic', { observed: { round_id: newRound.id } });
          await runSubmitVerification(newRound.id);
          // Deferred to the single `endTrace('success')` after the
          // qualifier-transition block — see that call's own comment.
          // Log warnings from resilient detail inserts (round saved successfully)
          if (rpcResult?.warnings?.length > 0) {
            detailWarnings = rpcResult.warnings as string[];
            await logServerError(
              `Round submitted with ${rpcResult.warnings.length} detail warning(s)`,
              {
                action: 'submitGolfRoundComprehensive',
                roundId: newRound.id,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                helmTraceId: flightRecorder.traceId,
                extra: { warnings: rpcResult.warnings, path: 'new_round_rpc' },
              },
              'warning'
            );
          }

          round = { id: newRound.id };
        }
      }
    }

    // If this is a qualifier round, update the qualifier entry stats and
    // auto-advance its start only (F029/F138). The first completed round
    // transitions upcoming→in_progress. Completion is intentionally manual:
    // neither entrant progress nor scheduled dates can close a qualifier.
    //
    // Declared 'conditional'/when:'qualifier' in golf-round-flight-workflow.ts
    // and runs synchronously here (not deferred into after() below, despite
    // its 'background' layer label) — start/complete/warn wrap it in place.
    if (effectiveQualifierId) {
      void flightRecorder.start('post.qualifier_transition');
      let qualifierTransitionHadError = false;
      try {
        await updateQualifierEntryStats(effectiveQualifierId, player.id);
      } catch (err) {
        qualifierTransitionHadError = true;
        await logServerError(`Failed to update qualifier entry stats after round submit: ${describeError(err)}`, {
          action: 'submitGolfRoundComprehensive.qualifierStats',
          featureArea: 'qualifiers',
          roundId: round.id,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: {
            qualifierId: effectiveQualifierId,
            stack: err instanceof Error ? err.stack : undefined,
          },
        }, 'warning');
      }

      try {
        await advanceQualifierOnRoundSubmit(supabase, effectiveQualifierId);
      } catch (err) {
        qualifierTransitionHadError = true;
        await logServerError(`Failed to auto-advance qualifier status after round submit: ${describeError(err)}`, {
          action: 'submitGolfRoundComprehensive.qualifierAutoAdvance',
          featureArea: 'qualifiers',
          roundId: round.id,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: { qualifierId: effectiveQualifierId },
        }, 'warning');
      }

      void (qualifierTransitionHadError
        ? flightRecorder.warn('post.qualifier_transition', { errorSummary: 'qualifier_transition_failed_non_fatal' })
        : flightRecorder.complete('post.qualifier_transition', { observed: { qualifier_id: effectiveQualifierId } }));
    }

    // The single finalize point for every success path in this function
    // (direct RPC success, the already_completed/reconciled carve-outs, and
    // a rescued direct-submit-fallback) — every one of those branches above
    // sets `round` and falls through to here instead of calling `endTrace`
    // itself. Placed AFTER the qualifier-transition block on purpose: that
    // block is awaited synchronously, on the response-blocking path (see its
    // own comment above), so its real duration must land inside the trace's
    // window. Finalizing any earlier — as each branch used to do individually
    // — closes the trace before that work runs and silently drops it from
    // duration_ms, which is the exact bug class this refit closes. `endTrace`'s
    // own `traceEnded` guard makes this a no-op on every branch that already
    // finalized directly (the early-return warning/failure paths above, and
    // an unrescued direct-submit-fallback via recordRescuedStepOutcome).
    endTrace('success');

    // 2026-05-17: closes audit P-HIGH-1. Previously this awaited the stats-
    // cache invalidation inside the user-facing response, adding 0.5–2s of
    // p99 latency to round submits. Move to after() so the user response
    // returns immediately; warnings are still logged from the after callback.
    //
    // 2026-07-17: closes #920 (race). This used to be a SECOND, independent
    // after() callback that ran concurrently with the postRoundTrigger
    // after() below — the CoachHelm engine could read golf_player_stats_cache
    // before invalidateOnRoundComplete finished writing it, producing
    // insights/predictions off a stale cache. Chained into a single after()
    // so the cache refresh is fully awaited BEFORE postRoundTrigger runs.
    const cacheRoundId = round.id;
    const cachePlayerId = player.id;
    const cacheHolesCount = holesPayload.length;
    const cacheShotsCount = shotsCount;
    const cacheUserId = user.id;
    const cacheUserEmail = user.email;
    const backgroundPlayerId = player.id;
    const backgroundRoundId = round.id;
    // Both declared 'async' on golf.round.submit — start them here, BEFORE
    // after(), and complete/fail them INSIDE the callback below. Unlike
    // post.qualifier_transition above (awaited synchronously, so its timing
    // lands inside the trace via the single `endTrace('success')` call
    // right after that block), these two are genuinely deferred: the trace
    // is already finalized by the time after() runs — through that same
    // shared `endTrace('success')`, or one of the early-return
    // warning/failure calls above it — so helm_debug_finalize_trace has
    // already stamped the trace row's own finished_at/duration_ms. These
    // two steps' real start/finish timestamps land AFTER that window by
    // design, not a bug: moving finalize() into after() instead would leave
    // the player-facing trace open for the whole background tail, which is
    // worse, since the response has already been sent by the time after()
    // runs and nothing is waiting on it. The admin client the recorder uses
    // internally (createAdminClient) is request-independent, so calling it
    // from inside after() is safe — same as the existing stats-cache and
    // postRoundTrigger calls in this same callback already do. See the
    // flight-recorder section of memory/features/shot-tracking.md.
    void flightRecorder.start('post.stats');
    void flightRecorder.start('post.coachhelm');
    after(async () => {
      try {
        const cacheResult = await roundStage(
          'post_submit_stats',
          { round_id: cacheRoundId, player_id: cachePlayerId, holes_count: cacheHolesCount, shots_count: cacheShotsCount },
          () => invalidateOnRoundComplete(cachePlayerId, cacheRoundId),
        );
        if (cacheResult.warnings.length > 0) {
          await logServerError(
            `Stats cache warnings after round submit: ${cacheResult.warnings.join(' | ')}`,
            {
              action: 'submitGolfRoundComprehensive',
              roundId: cacheRoundId,
              playerId: cachePlayerId,
              userId: cacheUserId,
              userEmail: cacheUserEmail,
              holesCount: cacheHolesCount,
              shotsCount: cacheShotsCount,
              extra: { warnings: cacheResult.warnings },
            },
            'warning'
          );
          await flightRecorder.warn('post.stats', { errorSummary: 'detail_warnings' });
        } else {
          await flightRecorder.complete('post.stats');
        }
      } catch (err) {
        await logServerError(`Failed to invalidate stats cache after round submit: ${describeError(err)}`, {
          action: 'submitGolfRoundComprehensive.invalidateStatsCache',
          featureArea: 'stats_cache',
          roundId: cacheRoundId,
          playerId: cachePlayerId,
          userId: cacheUserId,
          userEmail: cacheUserEmail,
          extra: {
            stack: err instanceof Error ? err.stack : undefined,
          },
        }, 'critical');
        await flightRecorder.fail('post.stats', { errorSummary: describeError(err) });
      }

      // ── Goal + focus-area progress (#1243) ──────────────────────────────
      // A completed round is the state change these track, so advance them
      // HERE. Before this, the ONLY caller of the progress drivers was the
      // nightly standing-refresh cron (02:20 UTC), so a player finished a
      // round, opened My Development to see whether it helped, and the bar had
      // not moved — for up to ~24h. Verified end-to-end on 2026-08-02: two
      // completed rounds took an accepted 61 → 66 fairways area from 61 to
      // nowhere; invoking the cron by hand immediately produced the correct
      // windowed 82.
      //
      // Deliberately placed BEFORE the queue branch below, which `return`s
      // when the job is enqueued — putting this after it would leave the
      // durable-queue path still stale-until-morning.
      //
      // This is the round-SUBMIT write path, not a page render: it does not
      // reintroduce the read-path-writes problem that had the on-view hooks
      // removed (a page read racing the coachhelm crons into a 40P01 deadlock;
      // see player-coachhelm-dashboard-readonly.test.ts). The drivers are
      // idempotent and same-day deduped, so this composes with the nightly
      // cron rather than replacing it — the cron stays as the durability net
      // for players whose standing moves without a submission.
      try {
        await Promise.all([
          evaluateAndPersistGoals(backgroundPlayerId),
          evaluateAndPersistFocusAreas(backgroundPlayerId),
        ]);
        revalidatePath('/golf/dashboard/coachhelm');
        revalidatePath('/golf/dashboard/intelligence');
      } catch (progressErr) {
        // Never let progress tracking take down round analysis behind it.
        await logServerError(
          `Post-round goal/focus-area progress failed: ${describeError(progressErr)}`,
          {
            action: 'submitGolfRoundComprehensive.progressDrivers',
            featureArea: 'coachhelm',
            roundId: backgroundRoundId,
            playerId: backgroundPlayerId,
            extra: { stack: progressErr instanceof Error ? progressErr.stack : undefined },
          },
          'warning',
        );
      }

      // 2026-05-17: closes audit Finding 2 + A-NEW-6. Previously this fetched
      // /api/coachhelm/analyze-player with `keepalive: true`. That had three
      // problems: (1) an extra internal HTTP hop with cold-start risk;
      // (2) keepalive's lifetime guarantees are best-effort on Fluid Compute;
      // (3) the COACHHELM_INTERNAL_SECRET was a credential management surface.
      //
      // Runs via Next.js `after()` so the trigger fires post-response in the
      // same function instance, AFTER the stats-cache refresh above has
      // resolved (success or failure — postRoundTrigger reads the round's own
      // shot/hole data, not the cache, so it still proceeds even if the cache
      // refresh warned). postRoundTrigger writes terminal state to
      // golf_rounds.coachhelm_{analyzed,failed}_at so the safety-net cron can
      // recover deterministically if the after-callback dies.
      //
      // `after()` is fire-and-forget and NOT durable — if this instance is torn
      // down before postRoundTrigger finishes, it silently never ran (206 of
      // 290 rounds went unanalyzed before the 2026-07-25 remediation). The
      // durability layers are, in order: the pgmq queue below (when
      // HELM_QUEUE_ENABLED=true and the facade migration is applied —
      // Postgres-native, no external provider credentials), then the direct
      // postRoundTrigger call, then the coachhelm-safety-net cron.
      // `enqueueJob` fails open (queue disabled, facade not yet applied, or a
      // transient error) by returning `{ queued: false }`, in which case this
      // falls through to the direct call below.
      if (isHelmQueueEnabled()) {
        // N12: a bare `round:${id}:analysis` key dedupes on round id alone,
        // so a correction to this round's shots/holes within the 24h
        // rolling window (`helm_jobs_enqueue`'s SQL-side dedupe) would
        // collide with the original analysis job and never re-enqueue.
        // Folding a short content hash of the submitted payload in means a
        // resubmission with different content gets a distinct key
        // (re-analyzed) while a verbatim duplicate submit still collapses
        // onto the same job.
        //
        // Verified: `submitGolfRoundComprehensiveImpl` above refuses to
        // resubmit a round whose row already reads `status === 'completed'`
        // (see the check ~100 lines above `existingRound.status ===
        // 'completed'`), and both `savePartialRoundImpl` and
        // `save_partial_round_atomic` refuse to touch a completed round too
        // — so editing an already-completed round's content and having it
        // reach this call site is not currently possible. What this DOES
        // still cover live: the continue/new/recover-round client flows all
        // call this action with the same `existingRoundId` on retry while
        // the row is still `in_progress` (e.g. a failed attempt, or the
        // player fixing a hole before the retry succeeds) — those retries
        // reach this exact line, and a bare round-id key would have
        // deduped a content-changed retry onto the first attempt's job.
        const roundContentHash = createHash('sha256')
          .update(
            JSON.stringify({ holesPayload, shotsPayload, puttDetailsPayload, approachDetailsPayload }),
          )
          .digest('hex')
          .slice(0, 12);
        const enqueueResult = await enqueueJob(
          'coachhelm_analysis',
          { roundId: backgroundRoundId, playerId: backgroundPlayerId },
          { dedupeKey: `round:${backgroundRoundId}:analysis:${roundContentHash}` },
        );
        if (enqueueResult.queued) {
          await flightRecorder.complete('post.coachhelm', {
            metadata: { handed_off_to: 'helm_jobs_queue', msg_id: enqueueResult.msgId },
          });
          return;
        }
      }

      // Direct path: the pgmq queue above is the durable path when enabled; when
      // it is disabled, not yet migrated, or the enqueue fails open, the
      // analysis runs inline here. postRoundTrigger writes terminal state to
      // golf_rounds.coachhelm_{analyzed,failed}_at, so the coachhelm-safety-net
      // cron recovers any round this call never finishes.
      const admin = createAdminClient();
      // Not wrapped to swallow a throw — postRoundTrigger's own error
      // handling (and Next's `after()`) is unchanged. Only reports the
      // outcome to the recorder before letting it propagate exactly as it
      // did before this refit.
      try {
        await postRoundTrigger(admin, {
          playerId: backgroundPlayerId,
          roundId: backgroundRoundId,
          triggerReason: 'round_submitted',
        });
        await flightRecorder.complete('post.coachhelm', { metadata: { handed_off_to: 'direct' } });
      } catch (err) {
        await flightRecorder.fail('post.coachhelm', { errorSummary: describeError(err) });
        throw err;
      }
    });

    try {
      revalidatePath('/golf/dashboard');
      revalidatePath('/golf/dashboard/rounds');
      revalidatePath('/golf/dashboard/stats');
      // Engine-driven screens. LIVE-22: these paths were missing, so players
      // had to hard-reload CoachHelm / My Development to see post-round
      // insights, qualifier progress, or focus-area shifts.
      revalidatePath('/golf/dashboard/coachhelm');
      revalidatePath('/golf/dashboard/my-development');
      revalidatePath('/golf/dashboard/my-qualifiers');
      updateTag(CACHE_TAGS.DASHBOARD);
      updateTag(CACHE_TAGS.ROUNDS);
      updateTag(CACHE_TAGS.STATS);

      if (effectiveQualifierId) {
        revalidatePath('/golf/dashboard/qualifiers');
        revalidatePath(`/golf/dashboard/qualifiers/${effectiveQualifierId}`);
      }
    } catch (cacheErr) {
      await logServerError(`Next cache revalidation failed after round submit: ${describeError(cacheErr)}`, {
        action: 'submitGolfRoundComprehensive.revalidatePaths',
        featureArea: 'stats_cache',
        roundId: round.id,
        playerId: player.id,
        userId: user.id,
        userEmail: user.email,
        extra: {
          qualifierId: effectiveQualifierId ?? null,
          stack: cacheErr instanceof Error ? cacheErr.stack : undefined,
        },
      }, 'warning');
    }

    // Log round submission event (fire-and-forget)
    logRoundSubmitted(user.id, user.email || '', round.id, {
      courseName: data.courseName,
      totalScore,
      scoreToPar: totalToPar,
      roundType: effectiveRoundType,
      holesPlayed: data.holes.length,
    }).catch((err) => {
      logServerError(`logRoundSubmitted failed: ${describeError(err)}`, {
        action: 'submitGolfRoundComprehensive.logRoundSubmitted',
        featureArea: 'rounds',
        extra: { roundId: round.id },
      });
    });

    // Push notification to coaches: player submitted a round (fire-and-forget)
    if (teamId) {
      (async () => {
        try {
          // Get player name for the notification
          const { data: playerInfo } = await supabase
            .from('golf_players')
            .select('first_name, last_name')
            .eq('id', player.id)
            .single();

          // Get coaches for this team via golf_team_coach_staff → golf_coaches (user_id).
          // golf_coaches has no team_id column; must join through the staff table.
          const { data: staffRows } = await supabase
            .from('golf_team_coach_staff')
            .select('coach:golf_coaches!inner(user_id)')
            .eq('team_id', teamId);

          const userIds = (staffRows ?? [])
            .map((row: { coach: { user_id: string | null } | null }) => row.coach?.user_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

          if (userIds.length) {
            const { sendBulkPushNotification } = await import('@/lib/notifications/push');
            const playerName = playerInfo?.first_name && playerInfo?.last_name
              ? `${playerInfo.first_name} ${playerInfo.last_name}`
              : 'A player';
            await sendBulkPushNotification(
              'round_submitted',
              userIds,
              { playerName, courseName: data.courseName, totalScore, scoreToPar: totalToPar, roundId: round.id }
            );
          }
        } catch (pushErr) {
          await logServerError(`[Push] round_submitted notification failed: ${describeError(pushErr)}`, { action: 'golf.submitGolfRoundComprehensive' });
        }
      })();
    }

    return { success: true, data: { roundId: round.id, warnings: detailWarnings } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid round data. Please check your inputs.' };
    }
    await logServerError(`Round submit unexpected error: ${describeError(error)}`, {
      action: 'submitGolfRoundComprehensive.catch',
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
        courseName: data.courseName,
        holesCount: data.holes?.length,
      },
    }, 'critical');
    return formatSafeErrorResponse(error);
  } finally {
    // Safety net — see savePartialRoundImpl's identical comment. Every
    // meaningful branch above (RPC success/failure/reconciliation, the
    // busy/round_missing/already_completed carve-outs, the fallback rescue
    // via recordRescuedStepOutcome) already ends the trace with a precise
    // status; `endTrace`'s `traceEnded` guard makes this a no-op there and
    // only catches a business-rule return (qualifier checks, existing-round
    // ownership, the draft-insert-never-reached-the-RPC path) that was not
    // individually instrumented.
    endTrace('failure');
  }
}
const observedSubmitGolfRoundComprehensive = withAdminObserved(
  'submitGolfRoundComprehensive',
  { sport: 'golf', feature: 'round_tracking' },
  submitGolfRoundComprehensiveImpl,
);
export async function submitGolfRoundComprehensive(
  data: GolfRoundInputComprehensive,
  existingRoundId?: string
): Promise<ActionResult<{ roundId: string; warnings?: string[] }>> {
  return observedSubmitGolfRoundComprehensive(data, existingRoundId);
}
/**
 * submit_round_atomic's equivalent. It deliberately conflates three causes in
 * one sentence, so matching it is only the FIRST half of the decision — the
 * caller must then look the round up to tell "gone" from "already submitted".
 */
const SUBMIT_ROUND_UNAVAILABLE = /round not found, already completed, or no permission/i;
/**
 * Auto-advance a qualifier's lifecycle when a round is submitted (F029/F138).
 *
 * The first completed round flips an 'upcoming' qualifier to 'in_progress'.
 * This is the missing server-side caller that updateQualifierStatus never had:
 * without it the leaderboard's realtime "Live" pill (status === 'in_progress')
 * never illuminated once play actually started.
 *
 * Its calendar dates and entrant progress are scheduling/reporting metadata,
 * never a player lockout. A coach closes a qualifier manually via
 * updateQualifierStatus (the qualifying workspace's "Conclude qualifier"
 * action); there is deliberately no automatic `completed` transition.
 *
 * Uses the admin client for both status writes below: this is a system
 * transition triggered by a PLAYER's round submission, and
 * golf_qualifiers_update_coach RLS only grants UPDATE to the team's coach —
 * a player-session client would silently no-op (0 rows matched, no error).
 *
 * Best-effort and non-fatal: a failure here must never block the round submit.
 */
async function advanceQualifierOnRoundSubmit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  qualifierId: string,
): Promise<void> {
  const { data: qualifier } = await supabase
    .from('golf_qualifiers')
    .select('status')
    .eq('id', qualifierId)
    .maybeSingle();

  const automaticTransition = getQualifierAutomaticTransition(qualifier?.status);
  if (!automaticTransition) return;

  // This is the one permitted system transition. It starts play after a
  // verified submitted round; it never closes a qualifier.
  const admin = createAdminClient();
  await admin
    .from('golf_qualifiers')
    .update({ status: automaticTransition })
    .eq('id', qualifierId)
    // Guard against a concurrent transition (only start from 'upcoming').
    .eq('status', 'upcoming');
}
