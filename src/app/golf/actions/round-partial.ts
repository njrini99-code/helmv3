'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import type { HoleStats, ShotRecord } from '@/lib/types/golf';
import { z } from 'zod';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { CommonSchemas } from '@/lib/validation/server-action-validator';
import { roundStage, classifyAutosaveOutcome, OPERATION } from '@/lib/observability/spans';
import { recordWorkflow } from '@/lib/observability/metrics';
import { helmLog } from '@/lib/observability/structured-log';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { isClubhouseFor } from '@/clubhouse/gate';
import { deriveLieAfter } from '@/lib/utils/shot-helpers';
import { resolveQualifierRoundNumber } from '@/lib/golf/qualifier-round-number';
import { firstBlockingPartialHoleIssue } from '@/lib/golf/round-entry-validation';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { describeError } from '@/lib/utils/describe-error';
import { comprehensiveShotSchema, createSafeFlightRecorder, derivePuttDistanceFeet, derivePuttMade, formatIssuePath, getPlayerTeamId, helmTracePayload, humanizeHoleFieldIssue, isRealApproachShot, isTransientAuthCheckFailure, resolveCourseId, toDbLieType } from './golf-action-shared';
import type { ActionResult } from './golf-action-shared';

/**
 * One completed hole in an auto-save payload.
 *
 * Named (rather than inlined into `partialRoundSchema`) so a validation
 * failure can be re-run against THIS schema alone. When the array element
 * fails, Zod reports the issue at the element path (`holes.16`) and — for a
 * nullable/union wrapper — collapses the reason to a bare "Invalid input"
 * with no field path. Production logged exactly that three times on
 * 2026-08-23 (`holes.1`, `holes.6`, `holes.16`, each at `currentHole - 1`),
 * which told nobody which field was actually wrong. See
 * `describeHoleValidationFailure`.
 */
const partialHoleSchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  yardage: z.number().min(0),
  score: z.number().int().min(1).max(20).optional().nullable(),
  putts: z.number().int().min(0).max(10).optional().nullable(),
  fairwayHit: z.boolean().optional().nullable(),
  greenInRegulation: z.boolean().optional().nullable(),
  penaltyStrokes: z.number().int().min(0).max(10).optional().nullable(),
  scrambleAttempt: z.boolean().optional().nullable(),
  scrambleMade: z.boolean().optional().nullable(),
  sandSaveAttempt: z.boolean().optional().nullable(),
  sandSaveMade: z.boolean().optional().nullable(),
  shots: z.array(comprehensiveShotSchema).optional(),
}).passthrough();
const partialRoundSchema = z.object({
  courseName: z.string().min(1).max(200),
  courseCity: z.string().max(100).optional(),
  // Same cap as golfRoundComprehensiveSchema — see the note there. A fresh
  // round's first save carries no holes, so a failure on this field was
  // "unsalvageable" and surfaced as a bare `retry`, which the player read as
  // "start round does nothing".
  courseState: z.string().max(100).optional(),
  courseRating: z.number().min(50).max(85).optional().nullable(),
  courseSlope: z.number().int().min(55).max(155).optional().nullable(),
  teesPlayed: z.string().max(50).optional(),
  courseId: z.string().uuid().optional().nullable(),
  roundType: z.enum(['practice', 'tournament', 'qualifier']),
  roundDate: z.string(),
  // Coerce 0 to null — callers occasionally hit auto-save before the user
  // has selected hole 1 (incident 10: "Too small: expected number to be >=1").
  // Downstream code already treats null and 0 identically (see
  // `data.currentHole || null` / `(data.currentHole || 1) - 1`), so
  // collapsing the two here avoids a payload-level validation rejection.
  currentHole: z.preprocess(
    (v) => (v === 0 ? null : v),
    z.number().int().min(1).max(18).optional().nullable(),
  ),
  holesToPlay: z.union([z.literal(9), z.literal(18)]).optional().nullable(),
  qualifierId: z.string().uuid().optional().nullable(),
  qualifierRoundNumber: z.number().int().min(1).optional().nullable(),
  holes: z.array(partialHoleSchema.nullable()).max(18),
  inProgressShots: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    shots: z.array(comprehensiveShotSchema),
  })).optional(),
  holeConfigs: z.array(z.object({
    holeNumber: z.number().int().min(1).max(18),
    par: z.number().int().min(3).max(6),
    yardage: z.number().min(0).optional().nullable(),
  })).optional(),
});
type ZodIssueLike = { path: readonly PropertyKey[]; message: string };
/**
 * Recover the real cause behind a masked `holes.<n>` validation failure.
 *
 * Zod reports a failing array element at the element path. Depending on how
 * the element is wrapped (`.nullable()`, a union, a refine) the reason can
 * collapse to a bare "Invalid input" with no field path — which is exactly
 * what production logged, and exactly why three successive repairs to this
 * code path could not identify what was wrong. Re-validating the single hole
 * against `partialHoleSchema` restores the field-level issue.
 *
 * Diagnostic only: it never changes what is accepted or rejected.
 */
function describeHoleValidationFailure(
  issues: readonly ZodIssueLike[],
  holes: unknown,
): string[] {
  const described: string[] = [];

  for (const issue of issues.slice(0, 10)) {
    const path = formatIssuePath(issue.path);
    const elementOnly = /^holes\.(\d+)$/.exec(path);

    if (!elementOnly || !Array.isArray(holes)) {
      described.push(`${path || '(root)'}: ${issue.message}`);
      continue;
    }

    const index = Number(elementOnly[1]);
    const hole: unknown = holes[index];

    if (hole === null || hole === undefined) {
      described.push(
        `${path}: hole slot is ${hole === null ? 'null' : 'undefined'} — no data for hole ${index + 1}`,
      );
      continue;
    }

    const inner = partialHoleSchema.safeParse(hole);
    if (inner.success) {
      // The element parses fine on its own, so the wrapper rejected it.
      described.push(`${path}: ${issue.message} (element valid in isolation)`);
      continue;
    }

    for (const innerIssue of inner.error.issues.slice(0, 5)) {
      const suffix = innerIssue.path.length ? `.${formatIssuePath(innerIssue.path)}` : '';
      described.push(`${path}${suffix}: ${innerIssue.message}`);
    }
  }

  return described;
}
/**
 * The structured `{hole, field, message}` for the FIRST hole the salvage
 * path blanked (A3). Two shapes reach here:
 *
 * 1. A direct deep-path issue (`holes.2.score`, `holes.2.shots.0.distanceToHoleBefore`)
 *    — Zod already attributed the failure to a specific field; humanize it
 *    in place.
 * 2. A collapsed element-level issue (`holes.2`, a bare "Invalid input") —
 *    the wrapper union/nullable/refine swallowed the real cause, so
 *    re-validate the element alone against `partialHoleSchema` to recover it
 *    (the same recovery `describeHoleValidationFailure` performs for
 *    logging).
 *
 * Returns null only when no reported issue actually points at a hole array
 * element (the unsalvageable branch already handles that case).
 */
function describeHoleInvalidDetail(
  issues: readonly (ZodIssueLike & { code?: string; maximum?: unknown; minimum?: unknown })[],
  holes: unknown,
): { hole: number; field: string; message: string } | null {
  if (!Array.isArray(holes)) return null;
  for (const issue of issues) {
    const pathStr = formatIssuePath(issue.path);

    if (/^holes\.\d+\./.test(pathStr)) {
      const described = humanizeHoleFieldIssue(issue.path, issue);
      if (described.hole != null) {
        return { hole: described.hole, field: described.field, message: described.message };
      }
      continue;
    }

    const elementOnly = /^holes\.(\d+)$/.exec(pathStr);
    if (!elementOnly) continue;
    const index = Number(elementOnly[1]);
    const hole: unknown = holes[index];
    if (hole == null) continue;
    const inner = partialHoleSchema.safeParse(hole);
    if (inner.success) continue;
    const innerIssue = inner.error.issues[0];
    if (!innerIssue) continue;
    const described = humanizeHoleFieldIssue(['holes', index, ...innerIssue.path], innerIssue);
    if (described.hole == null) continue;
    return { hole: described.hole, field: described.field, message: described.message };
  }
  return null;
}
// ============================================================================
// SAVE FOR LATER - INCOMPLETE ROUND MANAGEMENT
// ============================================================================

export interface PartialRoundData {
  // Round setup
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  courseId?: string;
  /** Cloud Library tee link (golf_course_tees.id) so a draft/partial save keeps
   *  its catalog tee provenance instead of writing tee_id=NULL. */
  teeId?: string;
  roundType: 'practice' | 'tournament' | 'qualifier';
  roundDate: string;
  qualifierId?: string;
  qualifierRoundNumber?: number;
  // Progress tracking
  currentHole: number;
  holesToPlay: number; // 9 or 18
  // Completed holes data
  // Sparse browser arrays cross the Server Action boundary as `undefined`
  // entries. The persistence contract represents an uncompleted hole as an
  // explicit null instead, so every transport can validate the same shape.
  holes: Array<HoleStats | null>;
  // In-progress holes with recorded shots
  inProgressShots?: Array<{
    holeNumber: number;
    shots: ShotRecord[];
  }>;
  // Hole configuration for full round (completed + remaining)
  holeConfigs?: Array<{
    holeNumber: number;
    par: number;
    yardage?: number | null;
  }>;
  // Optimistic locking: pass the round's updated_at from last fetch/save
  // to detect concurrent edits from another device/tab
  expectedUpdatedAt?: string;
}
/**
 * Save an incomplete round to database
 * Status will be 'in_progress' and stats will NOT be calculated
 *
 * For existing rounds, uses an atomic RPC (save_partial_round_atomic) that wraps
 * delete+insert in a single DB transaction to prevent data loss on partial failures.
 *
 * Wrapped in withAdminObserved below (Helm Bridge W6 exemplar retrofit) —
 * the mutation-heaviest golf path. Renamed to *Impl and re-exported under
 * the original name so no caller changes.
 */
export interface SavePartialRoundOptions {
  /**
   * Explicit recovery/reuse intent for the no-id branch (A1, 2026-09-02).
   * Set ONLY by restore flows that are reconnecting a player to progress
   * they already have on the server — New Round's recovered-snapshot
   * restore (`handleRestoreRecovery`) and FairwayRecoverRound's partial
   * restore — never by `persistRoundStart`'s plain "begin a new round" call,
   * and never propagated into the round_missing re-create retry inside
   * `writeRoundRecreatingIfMissing` (that retry's intent is CREATE, not
   * reuse; see that module's own comment). Without this flag the no-id
   * branch reuses a course/date-matched round only when it is an empty
   * shell — see `isEmptyShellRound`.
   */
  allowReuse?: boolean;
  /**
   * R8 (2026-09-22): set ONLY by `persistRoundStart` — the "begin a brand
   * new round" call, never autosave, never `writeRoundRecreatingIfMissing`'s
   * round_missing retry (that retry's intent is CREATE, not "is this a
   * duplicate", and must keep persisting shots even if a stray match
   * exists). An opt-IN flag rather than an opt-out one so every existing
   * caller — autosave, the beacon, the API route, the recreate retry — is
   * unaffected by construction.
   *
   * When set, the no-id branch's course/date/qualifier heuristic stops
   * silently falling through to a fresh INSERT in two cases that produced
   * real stranded rounds in production (measured 2026-09-22: 10 abandoned
   * `in_progress` duplicates, most created BEFORE the sibling that went on
   * to complete):
   *   - a matching in_progress round exists but is NOT an empty shell (real
   *     progress) → returns `in_progress_exists` instead of inserting a
   *     second round that stealth-strands the first.
   *   - no in_progress match, but a COMPLETED round already occupies that
   *     exact player/course/date/qualifier slot → returns
   *     `duplicate_completed_round` so the caller can warn instead of
   *     silently starting a second round for a day already logged.
   * Pass `confirmDuplicateCourse: true` to proceed anyway after the player
   * has seen that warning.
   */
  startIntent?: boolean;
  /** See `startIntent` — bypasses only the `duplicate_completed_round` warning. */
  confirmDuplicateCourse?: boolean;
  /**
   * R8 follow-up (2026-09-23): college golf routinely plays 36 holes in one
   * day — two genuinely separate rounds for the same player, course, AND
   * date. The `in_progress_exists` check above cannot tell "an abandoned
   * duplicate of the same round" apart from "round 1 of 36 is still open
   * while the player starts round 2" from server data alone; only the
   * player knows. Set ONLY after the player has seen the `in_progress_exists`
   * signal and explicitly chosen "Start a new round" over Resume/Discard —
   * bypasses just that one check so the insert proceeds; every other
   * `startIntent` rule (empty-shell reuse, the `duplicate_completed_round`
   * warning) still applies.
   */
  confirmSeparateRound?: boolean;
}
/**
 * A hole in the payload failed validation and is NOT durable on the server
 * (A3, 2026-09-02): salvaging it (as the RPC/reuse paths otherwise do) would
 * silently drop real player-entered data with no trace, while the save still
 * reports success. Returned instead of a write, so the caller can surface
 * exactly which hole/field needs fixing rather than discovering the gap only
 * at submit, via a raw Zod path string.
 */
export interface SavePartialRoundHoleInvalid {
  success: false;
  error: 'hole_invalid';
  code: 'hole_invalid';
  hole: number;
  field: string;
  message: string;
}
/**
 * R8: the no-id branch (`startIntent: true` only) found the player's own
 * in_progress round already occupying this exact course/date/qualifier slot,
 * with real progress (not an empty shell). Returned instead of inserting a
 * second round, which is exactly how the production orphans this closes were
 * produced. 36-hole-day follow-up: the caller presents Resume / Discard /
 * Start a new round rather than assuming Resume — `scoredHoles`/`updatedAt`
 * are for the Discard confirmation, which must show what it would delete
 * before the player commits to it.
 */
export interface SavePartialRoundInProgressExists {
  success: false;
  error: 'in_progress_exists';
  code: 'in_progress_exists';
  roundId: string;
  scoredHoles: number;
  updatedAt: string | null;
}
/**
 * R8: the no-id branch (`startIntent: true` only) found a COMPLETED round
 * already occupying this exact player/course/date/qualifier slot. Returned
 * instead of silently inserting a duplicate; the caller should warn and let
 * the player confirm (re-call with `confirmDuplicateCourse: true`) or view
 * the existing round.
 */
export interface SavePartialRoundDuplicateCompleted {
  success: false;
  error: 'duplicate_completed_round';
  code: 'duplicate_completed_round';
  completedRoundId: string;
}
export type SavePartialRoundResult =
  | ActionResult<{ roundId: string; updatedAt?: string; warnings?: string[] }>
  | SavePartialRoundHoleInvalid
  | SavePartialRoundInProgressExists
  | SavePartialRoundDuplicateCompleted;
async function savePartialRoundImpl(
  data: PartialRoundData,
  existingRoundId?: string,
  options?: SavePartialRoundOptions,
): Promise<SavePartialRoundResult> {
  // Hole numbers the salvage path below could not parse and therefore blanked.
  // Checked against durable server state before the destructive RPC runs — see
  // the guard beside the save_partial_round_atomic call.
  let salvagedAwayHoleNumbers: number[] = [];
  // Structured {hole, field, message} for the FIRST salvaged hole (A3,
  // 2026-09-02) — built once, while the original Zod issues are on hand, and
  // used only if that hole turns out to be non-durable on the target round.
  let firstSalvagedHoleDetail: { hole: number; field: string; message: string } | null = null;

  // Constructed FIRST — before Zod, auth, and the player lookup — so those
  // three stages have a live recorder to report to instead of the recorder
  // being built after they already ran (the bug this whole refit closes: a
  // stage cannot report itself to a recorder that does not exist yet).
  // `existingRoundId` is the only identity known this early; player/team/
  // qualifier ids are attached as `observed` metadata on their own step once
  // each is resolved, same convention the RPC-branch code already used for
  // server.auth/server.player below.
  const flightRecorder = await createSafeFlightRecorder({
    workflow: 'golf.round.autosave',
    roundId: existingRoundId ?? null,
    existingRoundId: existingRoundId ?? null,
    qualifierId: data?.qualifierId ?? null,
    // Which UI wrote the round, so a failure rate can be compared between Clubhouse and Fairway (swap audit §18).
    metadata: { ui: (await isClubhouseFor('player')) ? 'clubhouse' : 'fairway' },
  });
  // Idempotent trace terminator. Every explicit finalize call in this
  // function should go through this instead of `flightRecorder.finalize`
  // directly: submit-shaped functions finalize from many different branches,
  // and constructing the recorder above means a branch that used to return
  // before any recorder existed now returns after one does — the `finally`
  // below uses this same guard as a safety net so no branch can leave a trace
  // permanently 'pending' in helm_debug.trace_runs.
  let traceEnded = false;
  const endTrace = (status: 'success' | 'failure' | 'warning' | 'pending') => {
    if (traceEnded) return;
    traceEnded = true;
    void flightRecorder.finalize(status);
  };

  try {
    void flightRecorder.start('server.validation');
    // A browser may retain an older JS bundle across a deployment. Those older
    // bundles built this array sparsely; Server Action transport preserves the
    // empty slots as `undefined`, while the durable persistence contract uses
    // explicit `null` for an uncompleted hole. Normalize at the server boundary
    // as well as in current clients so a cached mobile bundle cannot turn a
    // completed-hole checkpoint into a validation failure.
    //
    // `Array.prototype.map` preserves sparse slots, so use Array.from to visit
    // every index and materialize `null` values before Zod sees the payload.
    const normalizedData = {
      ...data,
      holes: Array.isArray(data?.holes)
        ? Array.from({ length: data.holes.length }, (_, index) => data.holes[index] ?? null)
        : data?.holes,
    } as PartialRoundData;
    data = normalizedData;

    // Validate input with Zod after normalizing legacy transport holes.
    const validated = partialRoundSchema.safeParse(data);
    if (!validated.success) {
      // Drill through the element-level mask BEFORE building the message, so
      // the log names the offending field rather than "holes.16 — Invalid
      // input". Falls back to the raw issue when nothing needs unmasking.
      const described = describeHoleValidationFailure(validated.error.issues, data?.holes);
      const firstError = validated.error.issues[0];
      const rawDetail = `${formatIssuePath(firstError?.path ?? [])} — ${firstError?.message ?? 'unknown'}`;
      const detail = described[0] ?? rawDetail;

      void logServerError(`Auto-save validation failed: ${detail}`, {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        extra: {
          courseName: data.courseName,
          currentHole: data.currentHole,
          // Unmasked, field-level issues — the thing that was missing.
          zodErrors: described,
          // The raw issue kept alongside so a wrapper-level change is still
          // visible if the two ever disagree.
          zodErrorsRaw: validated.error.issues
            .slice(0, 5)
            .map(i => `${formatIssuePath(i.path)}: ${i.message}`),
          holesCount: Array.isArray(data?.holes) ? data.holes.length : null,
          emptyHoleSlots: Array.isArray(data?.holes)
            ? data.holes.reduce<number[]>(
                (acc, hole, index) => (hole === null || hole === undefined ? [...acc, index] : acc),
                [],
              )
            : null,
        },
      }, 'warning');

      // A payload mismatch must NEVER cost the player their shot.
      //
      // This used to `return { success: false }`, which threw away the WHOLE
      // round — 17 good holes discarded because hole 18 had one field the
      // schema didn't like — and surfaced as "Error updating shot" / "Error
      // deleting shot" mid-round. The mismatch is ours to reconcile on the
      // server, not the player's to lose data over.
      //
      // So: keep every hole that validates, null out the ones that don't (the
      // array is positional, so a hole is nulled rather than removed — dropping
      // it would renumber everything after it), and carry on with the save. The
      // discarded holes are logged above with their real field-level cause, so
      // the defect is still visible and still gets fixed — just not by the
      // player, mid-round, on the course.
      const salvagedHoles = Array.isArray(data.holes)
        ? data.holes.map((hole) =>
            hole === null || hole === undefined || partialHoleSchema.safeParse(hole).success
              ? hole ?? null
              : null,
          )
        : data.holes;

      const salvaged = partialRoundSchema.safeParse({ ...data, holes: salvagedHoles });

      if (!salvaged.success) {
        // The failure is outside `holes` (course name, round type, dates) —
        // nothing to salvage, and retrying the identical payload would just
        // fail again. Report `retry` so the caller treats it like a transient
        // skip rather than telling the player their round is broken.
        void logServerError(
          `Auto-save unsalvageable (failure outside holes): ${describeHoleValidationFailure(salvaged.error.issues, salvagedHoles)[0] ?? detail}`,
          {
            action: 'savePartialRound',
            featureArea: 'shot_tracking',
            extra: { courseName: data.courseName, currentHole: data.currentHole },
          },
          'error',
        );
        void flightRecorder.fail('server.validation', { errorSummary: 'unsalvageable' });
        endTrace('failure');
        return { success: false, error: 'retry' };
      }

      const droppedHoles = Array.isArray(data.holes)
        ? data.holes.reduce<number[]>(
            (acc, hole, index) =>
              hole != null && (salvagedHoles as unknown[])[index] === null ? [...acc, index + 1] : acc,
            [],
          )
        : [];

      void logServerEvent(
        `Auto-save salvaged: saved the round without ${droppedHoles.length} unparseable hole(s)`,
        {
          action: 'savePartialRound.salvage',
          featureArea: 'shot_tracking',
          extra: { courseName: data.courseName, currentHole: data.currentHole, droppedHoles },
        },
        'warning',
      );

      salvagedAwayHoleNumbers = droppedHoles;
      firstSalvagedHoleDetail = describeHoleInvalidDetail(validated.error.issues, data.holes);
      data = { ...data, holes: salvagedHoles } as PartialRoundData;
    }

    // `warn`, not `complete`/`fail`: a salvaged-and-continuing save is
    // degraded (some holes were dropped) but is NOT a failed trace —
    // finalize() promotes any 'failure' step to an overall trace failure, and
    // marking this step failed would report every salvaged autosave (a
    // successful save with a logged, non-fatal gap) as a failed one.
    void (validated.success
      ? flightRecorder.complete('server.validation')
      : flightRecorder.warn('server.validation', { metadata: { dropped_holes: salvagedAwayHoleNumbers.length } }));

    // RE-V1: the submit gate's per-hole rules also hold mid-round, on every
    // COMPLETED hole (score + putts present): score range, putts ≤ score − 1,
    // score/putts matching a complete shot chain, no tee shot onto a green
    // 500+ yards away. Before this, a hole the submit would refuse was
    // checkpointed as done and the player only learned at the end of the
    // round. Same `hole_invalid` shape the client already surfaces (B5). The
    // 9/18 round shape is never applied to a round in progress.
    const partialHoleIssue = firstBlockingPartialHoleIssue(
      (data.holes ?? []) as Parameters<typeof firstBlockingPartialHoleIssue>[0],
    );
    if (partialHoleIssue && partialHoleIssue.holeNumber != null) {
      void logServerError(`Auto-save refused: ${partialHoleIssue.rule} on hole ${partialHoleIssue.holeNumber}`, {
        action: 'savePartialRound.plausibility',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        extra: {
          courseName: data.courseName,
          currentHole: data.currentHole,
          rule: partialHoleIssue.rule,
          hole: partialHoleIssue.holeNumber,
          shot: partialHoleIssue.shotNumber ?? null,
        },
      }, 'warning');
      endTrace('failure');
      return {
        success: false,
        error: 'hole_invalid',
        code: 'hole_invalid',
        hole: partialHoleIssue.holeNumber,
        field: partialHoleIssue.rule === 'putts_exceed_score' || partialHoleIssue.rule === 'putts_mismatch_shots' ? 'putts' : 'score',
        message: partialHoleIssue.message,
      };
    }

    // Bug #3: Clamp currentHole to holesToPlay for 9-hole rounds
    if (data.currentHole && data.holesToPlay) {
      data.currentHole = Math.min(data.currentHole, data.holesToPlay);
    }

    const supabase = await createClient();

    void flightRecorder.start('server.auth');
    const { data: { user }, error: authCheckError } = await supabase.auth.getUser();
    if (!user) {
      // See isTransientAuthCheckFailure: on 2026-08-19 this branch logged
      // "session expired mid-round" 6 times for players holding valid tokens,
      // because the auth round trip died in transit during DB contention. A
      // background auto-save must treat that like 'busy' — silent skip, the
      // next tick re-sends everything — not like a sign-out.
      if (isTransientAuthCheckFailure(authCheckError)) {
        void logServerError('Auto-save auth check failed in transit (NOT a session expiry) — skipped, next tick covers', {
          action: 'savePartialRound',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          errorDetails: authCheckError?.message,
          extra: { courseName: data.courseName, currentHole: data.currentHole, authStatus: authCheckError?.status ?? null },
        }, 'warning');
        void flightRecorder.warn('server.auth', { errorSummary: 'transient_auth_check_failure' });
        endTrace('warning');
        return { success: false, error: 'retry' };
      }
      void logServerError('Auto-save failed: user session expired mid-round', {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      void flightRecorder.fail('server.auth', { errorSummary: 'session_expired' });
      endTrace('failure');
      return { success: false, error: 'You must be signed in' };
    }
    void flightRecorder.complete('server.auth', { observed: { user_id: user.id } });

    // Get player record.
    //
    // `.maybeSingle()`, not `.single()`, and the error is BOUND rather than
    // discarded. Both halves were live defects, found 2026-08-27 from four
    // production events on `POST /golf/dashboard/rounds/continue/:id`:
    //
    //   1. `.single()` raises PGRST116 ("Cannot coerce the result to a single
    //      JSON object") when it finds no row. A user without a player
    //      profile is an EXPECTED state here, not an exception — and
    //      `Sentry.instrumentSupabaseClient` reports the failed query
    //      independently of how this code handles it, so a correctly-handled
    //      miss still surfaced as a production error with an unhandled
    //      mechanism. `.maybeSingle()` returns `{ data: null, error: null }`
    //      and the `if (!player)` branch below behaves identically.
    //
    //   2. `const { data: player } =` threw the error away, so an RLS denial
    //      or a transport failure was indistinguishable from "this user has no
    //      player row" — the auto-save reported "Player profile not found" to
    //      a player who has one. `error → []` is the shape the OS contract
    //      forbids; a read that FAILED must not be reported as a read that
    //      found nothing.
    void flightRecorder.start('server.player');
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (playerError) {
      // Distinct message and code from the not-found branch on purpose: this
      // one is retryable and the next auto-save tick may well succeed, so it
      // must not tell the player their profile is missing.
      void logServerError(`Auto-save player lookup failed: ${playerError.message}`, {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        userId: user.id,
        errorCode: playerError.code,
        errorHint: playerError.hint,
        errorDetails: playerError.details,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      void flightRecorder.warn('server.player', { errorCode: playerError.code, errorSummary: playerError.message });
      endTrace('warning');
      return { success: false, error: 'retry' };
    }

    if (!player) {
      void logServerError('Auto-save failed: player profile not found', {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: existingRoundId,
        userId: user.id,
        userEmail: user.email,
        extra: { courseName: data.courseName, currentHole: data.currentHole },
      }, 'error');
      void flightRecorder.fail('server.player', { errorSummary: 'player_not_found' });
      endTrace('failure');
      return { success: false, error: 'Player profile not found' };
    }
    void flightRecorder.complete('server.player', { observed: { player_id: player.id } });

    const teamId = await getPlayerTeamId(supabase, player.id);
    const resolvedCourseId = await resolveCourseId(supabase, data.courseName, data.courseId);

    // A lost browser-side round id must never turn a qualifier restart into an
    // update of a different persisted attempt. The client normally redirects
    // to Continue Round before it reaches this action; this server check is
    // the independent backstop for stale clients and direct callers.
    if (!existingRoundId && data.qualifierId && data.qualifierRoundNumber != null) {
      const { data: activeQualifierRounds, error: activeQualifierRoundsError } = await supabase
        .from('golf_rounds')
        .select('id')
        .eq('player_id', player.id)
        .eq('qualifier_id', data.qualifierId)
        .eq('qualifier_round_number', data.qualifierRoundNumber)
        .eq('status', 'in_progress')
        .limit(2);

      if (activeQualifierRoundsError) {
        return {
          success: false,
          error: 'We could not verify your saved qualifier round. Please try again before starting.',
        };
      }
      if ((activeQualifierRounds?.length ?? 0) > 0) {
        return {
          success: false,
          error: `Qualifier round ${data.qualifierRoundNumber} is already saved. Use Continue Round so its scorecard stays intact.`,
        };
      }
    }

    // An active qualifier round MUST carry its round number.
    //
    // A NULL here is a deadlock with no in-app way out: the cap check in
    // `getNextQualifierRoundNumber` counts the player's COMPLETED round numbers,
    // so a player who has used up the qualifier's rounds cannot start another —
    // and a numberless active round cannot be submitted either, because it has
    // no slot to submit into. Observed 2026-08-24: one player on a one-round
    // qualifier sat stuck for 33 hours with 46 shots recorded, reachable only
    // by a direct database write.
    //
    // Deriving the number costs one read and removes the state entirely.
    //
    // A2 (2026-09-02): this used to be `max(completed) + 1`, considering only
    // COMPLETED rounds — so a lost-id retry on an already-STARTED qualifier
    // round re-derived the SAME number that round already holds and the
    // INSERT below failed 23505 against
    // golf_rounds_qualifier_player_round_number_uq, repeatably (deriving
    // again after the failure reproduces the same number). Shared with
    // getNextQualifierRoundNumber via resolveQualifierRoundNumber, which
    // checks for an in-progress round FIRST and returns it for reuse instead
    // of deriving a fresh number to insert with — see that module's header.
    let resolvedQualifierRoundNumber = data.qualifierRoundNumber ?? null;
    // Set when derivation found the player's OWN already-started round for
    // this exact (qualifier, number) slot — the no-id branch below reuses it
    // directly rather than running the course/date heuristic, and this reuse
    // is safe regardless of emptiness (A1's gate) because the slot is
    // uniquely keyed, not a recency guess.
    let qualifierActiveRoundId: string | null = null;
    if (data.qualifierId && !resolvedQualifierRoundNumber) {
      const derived = await resolveQualifierRoundNumber(supabase, {
        qualifierId: data.qualifierId,
        playerId: player.id,
      });

      if (!derived.success) {
        if (derived.transient) {
          // A failed read must not masquerade as "no prior rounds": deriving
          // number 1 from an outage could claim a slot the player already
          // holds. Skip derivation — the save proceeds numberless exactly as
          // before this feature, and the next auto-save retries the read.
          void logServerEvent(
            'Auto-save could not read prior qualifier rounds; skipping round-number derivation this save',
            {
              action: 'savePartialRound.deriveQualifierRoundNumber',
              featureArea: 'shot_tracking',
              playerId: player.id,
              extra: { qualifierId: data.qualifierId },
            },
            'warning',
          );
        } else {
          // A real business-rule stop (no configured slot free, or more than
          // one in-progress round already exists) — inserting numberless
          // here would only move the deadlock one step later, at submit.
          return { success: false, error: derived.error, code: derived.code };
        }
      } else {
        resolvedQualifierRoundNumber = derived.roundNumber;
        qualifierActiveRoundId = derived.activeRoundId ?? null;

        void logServerEvent(
          derived.activeRoundId
            ? `Auto-save found the player's already-started qualifier round (${derived.roundNumber})`
            : `Auto-save derived a missing qualifier round number (${derived.roundNumber})`,
          {
            action: 'savePartialRound.deriveQualifierRoundNumber',
            featureArea: 'shot_tracking',
            playerId: player.id,
            extra: { qualifierId: data.qualifierId, activeRoundId: derived.activeRoundId ?? null },
          },
          'info',
        );
      }
    }

    const roundData = {
      player_id: player.id,
      team_id: teamId,
      course_id: resolvedCourseId,
      // Cloud Library tee link — the partial-save RPC reads p_round_data->>'tee_id'
      // (migration 20260613170000); without this, draft rounds persist tee_id=NULL.
      tee_id: data.teeId || null,
      course_name: data.courseName,
      course_city: data.courseCity || null,
      course_state: data.courseState || null,
      course_rating: data.courseRating || null,
      course_slope: data.courseSlope || null,
      tees_played: data.teesPlayed || null,
      round_type: data.roundType,
      round_date: data.roundDate,
      status: 'in_progress' as const,
      current_hole: data.currentHole || null,
      holes_played: data.holesToPlay || 18,
      qualifier_id: data.qualifierId || null,
      qualifier_round_number: resolvedQualifierRoundNumber,
      total_score: null,
      score_to_par: null,
      total_putts: null,
      total_fairways_hit: null,
      total_fairways: null,
      total_gir: null,
      total_gir_possible: null,
      // Persist hole configs in draft_data so the continue page can restore
      // correct pars/yardages for uncompleted holes
      draft_data: {
        step: 'tracking',
        holes: data.holeConfigs?.map(h => ({
          number: h.holeNumber,
          par: h.par,
          yardage: h.yardage || 0,
        })),
        currentHoleIndex: (data.currentHole || 1) - 1,
      },
    };

    // Build hole data
    const completedHoles = data.holes.filter((hole): hole is HoleStats => Boolean(hole));
    const holeConfigs = (data.holeConfigs && data.holeConfigs.length > 0)
      ? data.holeConfigs
      : completedHoles.map(hole => ({
        holeNumber: hole.holeNumber,
        par: hole.par,
        yardage: hole.yardage ?? null,
      }));

    const completedHolesByNumber = new Map<number, HoleStats>(
      completedHoles.map(hole => [hole.holeNumber, hole])
    );

    const holesPayload = holeConfigs.map(config => {
      const completed = completedHolesByNumber.get(config.holeNumber);
      if (completed) {
        return {
          hole_number: completed.holeNumber,
          par: completed.par,
          yardage: completed.yardage ?? config.yardage ?? null,
          score: completed.score,
          putts: completed.putts,
          fairway_hit: completed.fairwayHit ?? null,
          gir: completed.greenInRegulation ?? null,
          penalty_strokes: completed.penaltyStrokes ?? null,
          up_and_down: completed.scrambleAttempt ? completed.scrambleMade : null,
          sand_save: completed.sandSaveAttempt ? completed.sandSaveMade : null,
        };
      }
      return {
        hole_number: config.holeNumber,
        par: config.par,
        yardage: config.yardage ?? null,
        score: null,
        putts: null,
        fairway_hit: null,
        gir: null,
        penalty_strokes: null,
        up_and_down: null,
        sand_save: null,
      };
    });

    // Build shots payload — grouped by hole_number
    const holesWithShotsByNumber = new Map<number, ShotRecord[]>();
    for (const hole of data.holes) {
      if (!hole) continue;
      if (hole?.shots && hole.shots.length > 0) {
        holesWithShotsByNumber.set(hole.holeNumber, hole.shots);
      }
    }
    for (const hole of data.inProgressShots || []) {
      if (hole.shots.length === 0) continue;
      if (!holesWithShotsByNumber.has(hole.holeNumber)) {
        holesWithShotsByNumber.set(hole.holeNumber, hole.shots);
      }
    }

    const shotsPayload = Array.from(holesWithShotsByNumber.entries()).map(
      ([holeNumber, shots]) => ({
        hole_number: holeNumber,
        shots: shots.map(shot => ({
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
          miss_direction: shot.missDirection ?? null,
          putt_break: shot.puttBreak ?? null,
          putt_slope: shot.puttSlope ?? null,
          putt_distance_feet: derivePuttDistanceFeet(shot),
          putt_made: derivePuttMade(shot),
          is_penalty: shot.isPenalty,
          penalty_type: shot.penaltyType ?? null,
        })),
      })
    );

    // Build putt and approach detail payloads (mirrors submitGolfRoundComprehensive)
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

    for (const [holeNumber, shots] of holesWithShotsByNumber) {
      for (const shot of shots) {
        if (shot.shotType === 'putting') {
          const rawDist = shot.puttDistanceFeet ?? derivePuttDistanceFeet(shot);
          puttDetailsPayload.push({
            hole_number: holeNumber,
            shot_number: shot.shotNumber,
            miss_tags: shot.puttMissTags || [],
            break_direction: shot.puttBreak || null,
            distance_feet: rawDist != null ? Math.min(rawDist, 500) : null,
            made: shot.result === 'hole',
          });
        }

        // Tee shots on par 3s ARE the approach; layups and post-penalty tee
        // shots are NOT, even though they carry shot_type='approach'.
        const holeData = completedHolesByNumber.get(holeNumber);
        if (holeData?.par != null &&
            isRealApproachShot(shot, holeData.par) &&
            shot.result !== 'green' && shot.result !== 'hole') {
          approachDetailsPayload.push({
            hole_number: holeNumber,
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

    let roundId: string;
    // B9: `round` (below) is scoped to the no-id branch's own block and does
    // not survive to the shared holes/shots upsert + final-return code past
    // it — this outer-scoped twin carries its `updated_at` that far so the
    // no-id create/reuse success path can return the real value instead of
    // a hard-coded `undefined`.
    let roundUpdatedAtForResponse: string | null | undefined;

    /**
     * Returns true when writing this payload to `targetRoundId` would replace a
     * hole the server already holds a SCORE for with a null-score slot.
     *
     * Both persistence branches need this, and until 2026-09-01 only one had
     * it, and only for SALVAGED holes. The RPC branch is a REPLACE (delete +
     * rebuild); the no-id branch can REUSE another in_progress round matched
     * on course + date + qualifier and then UPSERT `holesPayload` on
     * (round_id, hole_number) — and a null-score hole in that payload nulls
     * the durable row exactly as the delete would have, whether it went null
     * because validation salvaged it OR because it is simply a hole this
     * save's payload never reached (a genuinely different round's progress).
     *
     * `holeNumbers` is caller-supplied rather than always `salvagedAwayHoleNumbers`
     * (A1, 2026-09-02): the RPC/existingRoundId path still checks only the
     * salvaged set, because that path also legitimately blanks a hole on
     * purpose when the player reopens it by editing/deleting its final holed
     * shot — an intentional, same-round null that must NOT be refused. The
     * no-id REUSE path has no such legitimate reason to null a durable hole
     * (it is either restoring the SAME progress the round already holds, or
     * it should never have been allowed to reuse this round at all), so it
     * passes every null-score hole number in `holesPayload`, not only the
     * salvaged ones.
     *
     * A failed read is treated as "assume there IS something to lose".
     * Guessing the other way is how the data disappears.
     */
    const holesAtRiskOfErasure = async (
      targetRoundId: string,
      holeNumbers: number[],
      recorder: { traceId: string } | null,
      path: 'existing_round' | 'reuse',
    ): Promise<boolean> => {
      if (holeNumbers.length === 0) return false;

      const { data: durable, error: durableErr } = await supabase
        .from('golf_holes')
        .select('hole_number')
        .eq('round_id', targetRoundId)
        .in('hole_number', holeNumbers)
        .not('score', 'is', null);

      const atRisk = durableErr
        ? holeNumbers
        : (durable ?? []).map((h: { hole_number: number }) => h.hole_number);

      if (atRisk.length === 0) return false;

      await logServerError(
        `Auto-save refused: writing hole(s) ${atRisk.join(', ')} as unscored would have erased a scored hole already saved`,
        {
          action: 'savePartialRound.salvageGuard',
          featureArea: 'shot_tracking',
          roundId: targetRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          helmTraceId: recorder?.traceId,
          extra: {
            courseName: data.courseName,
            currentHole: data.currentHole,
            candidateHoleNumbers: holeNumbers,
            atRisk,
            durableReadFailed: Boolean(durableErr),
            path,
          },
        },
        'error',
      );
      return true;
    };

    /** Back-compat name for the RPC/existingRoundId path — salvaged holes only. */
    const salvageWouldEraseDurableHole = (
      targetRoundId: string,
      recorder: { traceId: string } | null,
    ): Promise<boolean> =>
      holesAtRiskOfErasure(targetRoundId, salvagedAwayHoleNumbers, recorder, 'existing_round');

    /**
     * A round the no-id heuristic below matches is safe to REUSE unconditionally
     * only when nothing durable could be lost: no hole with a recorded score,
     * and no shot rows at all. Anything else needs explicit reuse intent (A1).
     *
     * A failed read is treated as "assume it is NOT empty" — the same
     * fail-safe direction as `holesAtRiskOfErasure` above; guessing the other
     * way is how a real round gets silently merged into.
     */
    const isEmptyShellRound = async (targetRoundId: string): Promise<boolean> => {
      const [scoredHoleRead, shotRead] = await Promise.all([
        supabase
          .from('golf_holes')
          .select('id')
          .eq('round_id', targetRoundId)
          .not('score', 'is', null)
          .limit(1),
        supabase
          .from('golf_shots')
          .select('id')
          .eq('round_id', targetRoundId)
          .limit(1),
      ]);
      if (scoredHoleRead.error || shotRead.error) return false;
      return (scoredHoleRead.data?.length ?? 0) === 0 && (shotRead.data?.length ?? 0) === 0;
    };

    /**
     * A3 (2026-09-02): a salvaged hole that is NOT durable on the round this
     * save will actually write to must not be silently dropped while the
     * save reports success — the player believes it saved, keeps playing,
     * and submit later fails on a hole the server never received. Called
     * BEFORE any write (the parent round row included) for both the
     * existingRoundId/RPC path and the no-id branch, with `targetRoundId`
     * being the round that write is about to touch — `null` for a brand-new
     * INSERT, which trivially has no durable data for any hole.
     *
     * When some (not all) salvaged holes ARE durable there, this returns
     * null and the existing `holesAtRiskOfErasure` guard further down keeps
     * handling that case exactly as before (refuse the whole write, retry) —
     * "keep true salvage as is" from the item's own description.
     *
     * A failed durability read defaults to "assume durable" (defer to the
     * old flow) rather than to "assume invalid": `holesAtRiskOfErasure`'s own
     * fail-safe (assume AT RISK) still guards the actual write either way, so
     * this default only affects which message the player sees on a read
     * failure, never whether data can be lost.
     */
    const checkNonDurableSalvageBeforeWrite = async (
      targetRoundId: string | null,
    ): Promise<SavePartialRoundHoleInvalid | null> => {
      if (salvagedAwayHoleNumbers.length === 0 || !firstSalvagedHoleDetail) return null;

      let anyDurable = false;
      if (targetRoundId) {
        const { data: durable, error: durableErr } = await supabase
          .from('golf_holes')
          .select('hole_number')
          .eq('round_id', targetRoundId)
          .in('hole_number', salvagedAwayHoleNumbers)
          .not('score', 'is', null);
        anyDurable = durableErr ? true : (durable?.length ?? 0) > 0;
      }
      if (anyDurable) return null;

      void logServerError(
        `Auto-save refused: hole ${firstSalvagedHoleDetail.hole} failed validation and has no durable server row — not salvaging silently`,
        {
          action: 'savePartialRound.holeInvalid',
          featureArea: 'shot_tracking',
          roundId: targetRoundId ?? undefined,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          extra: {
            courseName: data.courseName,
            currentHole: data.currentHole,
            hole: firstSalvagedHoleDetail.hole,
            field: firstSalvagedHoleDetail.field,
            salvagedAwayHoleNumbers,
          },
        },
        'warning',
      );

      return {
        success: false,
        error: 'hole_invalid',
        code: 'hole_invalid',
        hole: firstSalvagedHoleDetail.hole,
        field: firstSalvagedHoleDetail.field,
        message: firstSalvagedHoleDetail.message,
      };
    };

    if (existingRoundId) {
      // A3: before anything is written, refuse silent data loss on a
      // salvaged hole this round has no durable row for.
      const holeInvalid = await checkNonDurableSalvageBeforeWrite(existingRoundId);
      if (holeInvalid) {
        endTrace('failure');
        return holeInvalid;
      }

      // server.validation/server.auth/server.player were already started and
      // completed above, against the SAME recorder — it was constructed
      // before any of them ran (see the top of this function). Player/team
      // identity is attached as `observed` metadata on server.player's own
      // completion above rather than at construction, because the recorder
      // exists before the player lookup resolves; trace_runs.player_id/
      // team_id are therefore null for every trace (helm_debug_start_trace
      // extracts them once, from construction-time metadata only), while
      // trace_steps.metadata on server.auth/server.player still carries
      // user_id/player_id for correlation. Documented here and in
      // memory/features/shot-tracking.md rather than worked around: fixing
      // it needs a "backfill identity" write the recorder API does not
      // expose, and real per-stage timing is the point of this refit.

      // Use atomic RPC — wraps delete+insert in a single transaction
      // RPC not in generated types yet — use type escape
      const rpcParams: Record<string, unknown> = {
        p_round_id: existingRoundId,
        p_round_data: { ...roundData, ...helmTracePayload(flightRecorder.traceId) },
        p_holes: holesPayload,
        p_shots: shotsPayload,
        p_putt_details: puttDetailsPayload,
        p_approach_details: approachDetailsPayload,
      };

      // Optimistic locking: pass expected updated_at to detect concurrent edits
      if (data.expectedUpdatedAt) {
        rpcParams.p_expected_updated_at = data.expectedUpdatedAt;
      }

      // A SALVAGED HOLE MUST NOT DELETE A HOLE THAT IS ALREADY SAFE.
      //
      // The salvage path above blanks an unparseable hole and carries on, on
      // the stated principle that "a payload mismatch must never cost the
      // player their shot". That principle is right; the implementation
      // inverted it, because save_partial_round_atomic is a REPLACE, not a
      // merge: it deletes every golf_holes and golf_shots row for the round and
      // rebuilds them from this payload. A blanked hole is filtered out of
      // completedHoles, so it is rebuilt as {score: null, putts: null} with no
      // shot group — and the score and shots that were already durable are
      // gone, while the caller is told the save succeeded.
      //
      // Verified against a live database: saving 3 holes then re-saving with a
      // 1-hole payload leaves exactly 1 hole and 2 shots. The delete is real.
      //
      // So: if any blanked hole already has a scored row on the server, refuse
      // the write and report 'retry' — the same recoverable signal the
      // unsalvageable branch uses. The next auto-save tick re-sends full state,
      // and the durable snapshot is untouched in the meantime. If the blanked
      // holes have nothing stored, there is nothing to lose and the salvage
      // proceeds exactly as before, which keeps the original fix's benefit:
      // one bad hole must not discard seventeen good ones.
      if (await salvageWouldEraseDurableHole(existingRoundId, flightRecorder)) {
        void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'salvage_would_erase' });
        endTrace('warning');
        return { success: false, error: 'retry' };
      }

      void flightRecorder.start('db.save_partial_round_atomic');
      const { data: rpcResult, error: rpcError } = await roundStage<
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { data: any; error: any }
      >(
        'autosave',
        {
          [OPERATION]: 'save_partial_round_atomic',
          round_id: existingRoundId,
          holes_count: holesPayload.length,
          shots_count: shotsPayload.reduce((sum, g) => sum + g.shots.length, 0),
          save_reason: 'auto',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        () => (supabase as any).rpc('save_partial_round_atomic', rpcParams),
        classifyAutosaveOutcome,
      );

      if (rpcError) {
        void flightRecorder.fail('db.save_partial_round_atomic', { errorCode: rpcError.code, errorSummary: rpcError.message });
        endTrace('failure');
        // Single log call per failure — logServerError already carries the
        // richer domain context (roundId/playerId/errorCode/hint/details);
        // a paired logServerException here would just double-write the
        // same failure to admin_events.
        await logServerError(`Auto-save RPC failed: ${rpcError.message}`, {
          action: 'savePartialRound',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          holesCount: holesPayload.length,
          shotsCount: shotsPayload.reduce((sum, g) => sum + g.shots.length, 0),
          errorCode: rpcError.code,
          errorHint: rpcError.hint,
          errorDetails: rpcError.details,
          helmTraceId: flightRecorder.traceId,
          traceStep: 'db.save_partial_round_atomic',
          extra: { courseName: data.courseName, currentHole: data.currentHole },
        });
        return { success: false, error: 'Failed to save round. Please try again.' };
      }

      if (rpcResult && !rpcResult.success) {
        // Return conflict errors with a distinct error key so the UI can prompt a reload
        if (rpcResult.error === 'conflict') {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'conflict' });
          endTrace('warning');
          return { success: false, error: 'conflict', };
        }
        // 'busy' = single-flight skip: another save (or a submit) already holds
        // this round's row, so the RPC declined to queue behind it
        // (FOR UPDATE NOWAIT — see 20260820170000_single_flight_partial_round_save.sql).
        // Expected under normal team-session load, not a failure: every save
        // carries the full round state, so the next tick covers this one. No
        // error event — 15 of these across one Guilford evening is healthy
        // coalescing, not 15 incidents.
        if (rpcResult.error === 'busy') {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'busy' });
          endTrace('warning');
          return { success: false, error: 'busy' };
        }
        // Already-completed rounds are an expected race condition (auto-save fires
        // after submit completes) — return early without logging an error event.
        if (typeof rpcResult.error === 'string' && rpcResult.error.includes('already been completed')) {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: rpcResult.error });
          endTrace('warning');
          return { success: false, error: rpcResult.error };
        }
        // The round row is GONE. save_partial_round_atomic returns one string for
        // "no such row" and "not yours", but in practice this is the first: a client
        // can hold a roundId whose row never landed (a create that failed) or was
        // deleted, and every auto-save after that targets a row that does not exist.
        //
        // Without a distinct key the caller cannot tell this from a transient
        // failure, so it retries the same dead id forever and the player's round has
        // nowhere to land. Measured 2026-09-01: three auto-saves at Winchester CC
        // hole 9 failed this way in 55 seconds, each writing its own error event,
        // while the round id they named had zero rows in golf_rounds, golf_holes and
        // golf_shots — it had never existed.
        //
        // 'round_missing' lets the client drop the stale id and re-save as a CREATE.
        // That is safe even in the genuine not-yours case: the new round is owned by
        // the caller, so this can only ever recreate the caller's own snapshot, never
        // touch someone else's row. Logged as a warning, not an error — the client
        // recovers automatically and a recovered save is not an incident.
        if (typeof rpcResult.error === 'string' && ROUND_MISSING_RPC_ERROR.test(rpcResult.error)) {
          void flightRecorder.warn('db.save_partial_round_atomic', { errorSummary: 'round_missing' });
          endTrace('warning');
          void logServerError(`Auto-save target round is missing — client will re-create: ${rpcResult.error}`, {
            action: 'savePartialRound',
            featureArea: 'shot_tracking',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            helmTraceId: flightRecorder.traceId,
            traceStep: 'db.save_partial_round_atomic',
            extra: { rpcError: rpcResult.error, courseName: data.courseName, currentHole: data.currentHole },
          }, 'warning');
          return { success: false, error: 'round_missing' };
        }
        void flightRecorder.fail('db.save_partial_round_atomic', { errorSummary: rpcResult.error });
        endTrace('failure');
        void logServerError(`Auto-save RPC returned failure: ${rpcResult.error || 'unknown'}`, {
          action: 'savePartialRound',
          featureArea: 'shot_tracking',
          roundId: existingRoundId,
          playerId: player.id,
          userId: user.id,
          userEmail: user.email,
          helmTraceId: flightRecorder.traceId,
          traceStep: 'db.save_partial_round_atomic',
          extra: { rpcError: rpcResult.error, courseName: data.courseName, currentHole: data.currentHole },
        }, 'error');
        return { success: false, error: rpcResult.error || 'Failed to save round.' };
      }

      void flightRecorder.complete('db.save_partial_round_atomic', { observed: { round_id: existingRoundId } });

      // POST-WRITE VERIFICATION — the point of the remaining three stages.
      //
      // A trace that records only the DB call proves the RPC returned success;
      // it cannot prove the rows are there. That gap is exactly what let a
      // destructive snapshot replace look healthy. These read the durable state
      // back and record observed-vs-expected, so a save that silently wrote
      // fewer holes or shots than it was given is visible in the trace itself.
      //
      // Deliberately non-fatal (and 'best_effort' as of 2026-09-02, see
      // golf-round-flight-workflow.ts): the write has already committed, so a
      // failed verification read must not turn a successful save into an
      // error. It records what it saw and nothing more. Started BEFORE the
      // reads (not just completed after) so their real duration is visible —
      // that gap, not the verification logic itself, is what made every
      // verify.* step in production read 0ms.
      void flightRecorder.start('verify.round');
      void flightRecorder.start('verify.holes');
      void flightRecorder.start('verify.shots');
      try {
        const [{ count: holeCount }, { count: shotCount }] = await Promise.all([
          supabase.from('golf_holes').select('id', { count: 'exact', head: true }).eq('round_id', existingRoundId),
          supabase.from('golf_shots').select('id', { count: 'exact', head: true }).eq('round_id', existingRoundId),
        ]);
        const expectedShots = shotsPayload.reduce((sum, g) => sum + g.shots.length, 0);
        void flightRecorder.complete('verify.round', { observed: { round_id: existingRoundId } });
        void flightRecorder.complete('verify.holes', {
          observed: { expected: holesPayload.length, actual: holeCount ?? null },
        });
        void flightRecorder.complete('verify.shots', {
          observed: { expected: expectedShots, actual: shotCount ?? null },
        });
      } catch (verifyErr) {
        // Verification is observability, not a gate. The save stands — but
        // every step that was start()ed above must still reach a terminal
        // transition (warn, not fail: the WRITE already succeeded, only the
        // read-back failed), or it renders as begun-and-never-ended.
        const errorSummary = describeError(verifyErr);
        void flightRecorder.warn('verify.round', { errorSummary });
        void flightRecorder.warn('verify.holes', { errorSummary });
        void flightRecorder.warn('verify.shots', { errorSummary });
      }

      endTrace('success');

      // Log warnings from resilient detail inserts (round saved successfully)
      const partialWarnings = rpcResult?.warnings?.length > 0
        ? (rpcResult.warnings as string[])
        : undefined;
      if (partialWarnings) {
        await logServerError(
          `Partial round saved with ${partialWarnings.length} detail warning(s)`,
          {
            action: 'savePartialRound',
            roundId: existingRoundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            helmTraceId: flightRecorder.traceId,
            extra: { warnings: partialWarnings, courseName: data.courseName },
          },
          'warning'
        );
      }

      roundId = existingRoundId;

      // Extract updated_at from RPC result for optimistic locking
      const rpcUpdatedAt = rpcResult?.updated_at as string | undefined;
      if (rpcUpdatedAt) {
        // NOTE: Do NOT call revalidatePath/updateTag here. Auto-save runs every
        // ~15s and triggering page revalidation on each save causes the Next.js
        // router to refetch layouts, which races with subsequent server action
        // calls and produces "An unexpected response was received from the server"
        // errors. Revalidation happens when the round is actually submitted via
        // submitGolfRoundComprehensive.
        return { success: true, data: { roundId, updatedAt: rpcUpdatedAt, warnings: partialWarnings } };
      }
    } else {
      // Recover a session that lost its local roundId (e.g. a backgrounded/
      // killed tab) by looking for an in_progress round to resume — but
      // scope the match tightly (course + round date + qualifier context),
      // not just "most recently updated in_progress round for this player".
      // An unscoped recency match can collide with an unrelated unfinished
      // round (product supports multiple simultaneous in-progress rounds),
      // silently repurposing it and orphan-trimming its holes/shots away.
      // If the course can't even be resolved to an id there's no safe way
      // to disambiguate, so skip the heuristic and always insert fresh.
      let existingRound: { id: string } | null = null;
      // A2: the player's own already-started round for this exact
      // (qualifier, round number) slot is a uniquely-keyed, always-safe
      // reuse target — golf_rounds_qualifier_player_round_number_uq is NOT
      // scoped to status='in_progress', so at most one such row can exist.
      // Skip the course/date heuristic (and its A1 emptiness gate, below —
      // this is not a recency guess) and go straight to it.
      if (qualifierActiveRoundId) {
        existingRound = { id: qualifierActiveRoundId };
      } else if (resolvedCourseId) {
        let existingRoundQuery = supabase
          .from('golf_rounds')
          .select('id, updated_at')
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .eq('course_id', resolvedCourseId)
          .eq('round_date', data.roundDate);
        existingRoundQuery = data.qualifierId
          ? existingRoundQuery.eq('qualifier_id', data.qualifierId)
          : existingRoundQuery.is('qualifier_id', null);
        // Matched against the RESOLVED number (A2), not the raw incoming
        // one: a client relying on server-side derivation sends no number at
        // all, and matching that raw null against a round that already
        // carries a real derived number never found it — the mechanical
        // cause of the 23505 loop this fix closes.
        existingRoundQuery = resolvedQualifierRoundNumber != null
          ? existingRoundQuery.eq('qualifier_round_number', resolvedQualifierRoundNumber)
          : existingRoundQuery.is('qualifier_round_number', null);

        const { data: candidateRound, error: candidateRoundError } = await existingRoundQuery
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fail CLOSED, on purpose, unlike the completed-round check below: an
        // unreadable in-progress lookup here means we genuinely don't know
        // whether this exact slot is already occupied, and falling through
        // to insert on that unknown is exactly the write pattern that
        // produced the stranded-duplicate rounds this file exists to
        // prevent. A retryable error costs the player one tap; a silent
        // insert can cost them a whole round's data.
        if (candidateRoundError) {
          await logServerError(
            `savePartialRound: in-progress candidate lookup failed for player ${player.id}; refusing to insert (fail-closed): ${candidateRoundError.message}`,
            { action: 'savePartialRound.inProgressCandidateLookup', featureArea: 'round_tracking', playerId: player.id, userId: user.id },
            'error',
          );
          void flightRecorder.warn('db.create_or_update_draft', { errorSummary: 'in_progress_lookup_failed' });
          endTrace('warning');
          return {
            success: false,
            error: 'Could not check for an existing round at this course. Please try again.',
          };
        }

        // A1: a course/date/qualifier match is a HEURISTIC, not a unique
        // key — two legitimate in-progress rounds can share all of it (a
        // player re-playing the same course the same day, or an unrelated
        // practice round with no qualifier context). Reusing one
        // unconditionally let a brand-new round's mostly-null holes payload
        // silently overwrite the OTHER round's already-scored holes via the
        // upsert below, and the orphan trim could delete them outright.
        // Reuse only when the matched round is an EMPTY SHELL (the genuine
        // lost-id-on-a-fresh-round case) or the caller explicitly passed
        // recovery/reuse intent — set by the restore flows in New Round and
        // FairwayRecoverRound, never by persistRoundStart.
        if (candidateRound && (options?.allowReuse || await isEmptyShellRound(candidateRound.id))) {
          existingRound = candidateRound;
        } else if (candidateRound && options?.startIntent && !options?.confirmSeparateRound) {
          // R8: `persistRoundStart` — a brand-new "start a round" action —
          // found the player's OWN in_progress round already occupying this
          // exact slot, with real progress. Falling through to an INSERT
          // here is exactly how the production orphans were produced: the
          // first round sits abandoned while a second one gets played and
          // submitted. Resume it instead of stranding it.
          //
          // 36-hole-day follow-up: `confirmSeparateRound` bypasses ONLY this
          // branch, after the player has explicitly chosen "Start a new
          // round" over Resume/Discard on the client's conflict prompt — the
          // insert below then proceeds with `candidateRound` left untouched
          // (never reused, never discarded from here).
          //
          // The Discard choice on that prompt is destructive, so the client
          // needs enough to show what it would delete before the player
          // commits — a scored-hole count and a last-updated time, not just
          // an opaque id. Unlike the lookup above, a failure here fails OPEN
          // (defaults to 0): it only feeds a display string, never a write
          // decision, so a wrong-but-safe "0 holes scored" is preferable to
          // blocking the whole conflict prompt over a display query.
          const { count: scoredHoleCount } = await supabase
            .from('golf_holes')
            .select('id', { count: 'exact', head: true })
            .eq('round_id', candidateRound.id)
            .not('score', 'is', null);
          void flightRecorder.warn('db.create_or_update_draft', { errorSummary: 'in_progress_exists' });
          endTrace('warning');
          return {
            success: false,
            error: 'in_progress_exists',
            code: 'in_progress_exists',
            roundId: candidateRound.id,
            scoredHoles: scoredHoleCount ?? 0,
            updatedAt: candidateRound.updated_at ?? null,
          };
        }
      }

      // R8: `persistRoundStart` only (`startIntent`) — before inserting a
      // brand-new round, check whether a COMPLETED round already occupies
      // this exact player/course/date/qualifier slot. Unlike the in_progress
      // heuristic above this is not a data-loss risk (nothing here could be
      // overwritten), so it warns rather than resumes: the caller shows the
      // player a confirmation and re-calls with `confirmDuplicateCourse:
      // true` to proceed. Skipped once the player has confirmed, and skipped
      // entirely when the course couldn't be resolved to an id (same
      // disambiguation limit as the heuristic above). A failed read fails
      // OPEN (falls through to the normal insert) rather than blocking a
      // round start on a diagnostic query.
      if (!existingRound && options?.startIntent && !options?.confirmDuplicateCourse && resolvedCourseId) {
        let completedMatchQuery = supabase
          .from('golf_rounds')
          .select('id')
          .eq('player_id', player.id)
          .eq('status', 'completed')
          .eq('course_id', resolvedCourseId)
          .eq('round_date', data.roundDate);
        completedMatchQuery = data.qualifierId
          ? completedMatchQuery.eq('qualifier_id', data.qualifierId)
          : completedMatchQuery.is('qualifier_id', null);
        // Mirror the in-progress heuristic's own qualifier_round_number
        // filter above: without it, a 36-hole one-day qualifier (round 1
        // completed, round 2 legitimately starting) warns spuriously,
        // because round 1's COMPLETED row matches on qualifier_id alone.
        completedMatchQuery = resolvedQualifierRoundNumber != null
          ? completedMatchQuery.eq('qualifier_round_number', resolvedQualifierRoundNumber)
          : completedMatchQuery.is('qualifier_round_number', null);

        const { data: completedMatch, error: completedMatchError } = await completedMatchQuery
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (completedMatchError) {
          await logServerError(
            `savePartialRound: duplicate-completed-round lookup failed for player ${player.id}; proceeding with insert: ${completedMatchError.message}`,
            { action: 'savePartialRound.duplicateCheck', featureArea: 'round_tracking', playerId: player.id, userId: user.id },
            'warning',
          );
        } else if (completedMatch) {
          void flightRecorder.warn('db.create_or_update_draft', { errorSummary: 'duplicate_completed_round' });
          endTrace('warning');
          return {
            success: false,
            error: 'duplicate_completed_round',
            code: 'duplicate_completed_round',
            completedRoundId: completedMatch.id,
          };
        }
      }

      // A3: before any write — the round row included — refuse silent data
      // loss on a salvaged hole. `existingRound` is exactly the round (if
      // any) about to be updated or reused; `null` means this save is about
      // to INSERT a brand-new round, which trivially has no durable row for
      // any hole.
      const holeInvalid = await checkNonDurableSalvageBeforeWrite(existingRound?.id ?? null);
      if (holeInvalid) {
        endTrace('failure');
        return holeInvalid;
      }

      // Workflow golf.round.autosave, when:'new_round' — the parent round
      // create/update/reuse. Unlike the existingRoundId branch's single
      // atomic RPC, everything from here through the orphan trim below is a
      // sequence of separate round trips, which is exactly why this branch
      // had ZERO recorder coverage before this refit: there was no single
      // call site to wrap.
      void flightRecorder.start('db.create_or_update_draft');

      // `updated_at` is carried through so the no-id create/reuse success
      // path below can return it (B9) — both queries already `.select()`
      // the full row; the prior narrower type just discarded the column.
      let round: { id: string; updated_at?: string | null } | null = null;
      if (existingRound) {
        // Identity columns (player_id, team_id, qualifier_id, qualifier_round_number)
        // are set on INSERT and never change for an in-progress round. Stripping
        // them from the UPDATE payload avoids Postgres' per-column UPDATE-privilege
        // check on identity columns the baseline `authenticated` GRANT intentionally
        // omits (see 20260603040000_grant_update_golf_rounds_authenticated.sql) —
        // production stayed 42501-broken on this fallback path while that migration
        // was on disk but not yet applied.
        const { player_id: _pid, team_id: _tid, qualifier_id: _qid, qualifier_round_number: _qrn, ...updatePayload } = roundData;
        void _pid; void _tid; void _qid; void _qrn;
        // Update the existing in-progress round — ONLY if still in_progress
        // (prevents reverting a round that was just completed by submit)
        const { data: updatedRound, error: updateError } = await supabase
          .from('golf_rounds')
          .update(updatePayload)
          .eq('id', existingRound.id)
          .eq('player_id', player.id)
          .eq('status', 'in_progress')
          .select()
          .maybeSingle();
        if (updateError) {
          // maybeCaptureRlsDenial fires first and reports whether it
          // already logged this failure under the rls_denial classification.
          // Only fall through to the generic logServerError when it did NOT
          // — otherwise the same Postgres failure writes two admin_events
          // rows (one per classification) instead of one.
          const capturedAsRlsDenial = maybeCaptureRlsDenial(updateError, {
            table: 'golf_rounds',
            verb: 'update',
            action: 'savePartialRound',
            feature: 'round_tracking',
            sport: 'golf',
          });
          if (!capturedAsRlsDenial) {
            await logServerError(`Auto-save update failed: ${updateError.message}`, {
              action: 'savePartialRound.updateExisting',
              roundId: existingRound.id,
              playerId: player.id,
              userId: user.id,
              userEmail: user.email,
              errorCode: updateError.code,
              errorHint: updateError.hint,
              errorDetails: updateError.details,
            });
          }
          void flightRecorder.fail('db.create_or_update_draft', { errorCode: updateError.code, errorSummary: updateError.message });
          endTrace('failure');
          return { success: false, error: 'Failed to save round. Please try again.' };
        }
        if (!updatedRound) {
          // Round was completed by submit — don't create a new one, just return success
          void flightRecorder.warn('db.create_or_update_draft', { errorSummary: 'round_already_completed' });
          endTrace('warning');
          return { success: true, data: { roundId: existingRound.id } };
        }
        round = updatedRound;

        // Broadened durability check (A1) — NOT the salvage-only guard the
        // RPC/existingRoundId path uses. A REUSED round (found by the
        // heuristic above, or the qualifier-slot match) has no legitimate
        // reason to receive a null score for a hole it already has a
        // durable score for: unlike a continuing session, this path never
        // needs to support the "reopen a hole by deleting its final shot"
        // flow, because that flow always already knows its round id. So
        // every null-score hole in this save's payload is checked, not just
        // the ones validation salvaged — 'retry' is the same recoverable
        // signal, and the next save re-sends full state.
        const nullScoreHoleNumbers = holesPayload
          .filter((h) => h.score == null)
          .map((h) => h.hole_number);
        if (await holesAtRiskOfErasure(existingRound.id, nullScoreHoleNumbers, null, 'reuse')) {
          void flightRecorder.warn('db.create_or_update_draft', { errorSummary: 'holes_at_risk_of_erasure' });
          endTrace('warning');
          return { success: false, error: 'retry' };
        }
      }

      if (!round) {
        // Create the parent round first. If a subsequent child write fails,
        // preserve this in-progress row and every previously durable child so
        // the next auto-save (or local recovery) can retry without losing the
        // player's round.
        const { data: newRound, error: roundError } = await supabase
          .from('golf_rounds')
          .insert(roundData)
          .select()
          .single();

        if (roundError) {
          // Same single-row-per-failure contract as the updateExisting
          // branch above: check RLS classification first, only log the
          // generic error when it wasn't already captured as a denial.
          const capturedAsRlsDenial = maybeCaptureRlsDenial(roundError, {
            table: 'golf_rounds',
            verb: 'insert',
            action: 'savePartialRound',
            feature: 'round_tracking',
            sport: 'golf',
          });
          if (!capturedAsRlsDenial) {
            await logServerError(`Auto-save insert round failed: ${roundError.message}`, {
              action: 'savePartialRound.insertRound',
              playerId: player.id,
              userId: user.id,
              userEmail: user.email,
              errorCode: roundError.code,
              errorDetails: roundError.details,
            });
          }
          void flightRecorder.fail('db.create_or_update_draft', { errorCode: roundError.code, errorSummary: roundError.message });
          endTrace('failure');
          return { success: false, error: 'Failed to save round. Please try again.' };
        }
        round = newRound;
      }

      roundId = round.id;
      roundUpdatedAtForResponse = round.updated_at;
      void flightRecorder.complete('db.create_or_update_draft', { observed: { round_id: roundId } });

      // Upsert holes and shots — feedback_golf_no_destructive_writes:
      // never delete the user's existing data before the replacement is
      // durable. Upsert relies on UNIQUE(round_id, hole_number) from
      // migration 021 and UNIQUE(round_id, hole_number, shot_number)
      // from migration 20260304000003. Orphan trim runs AFTER all
      // upserts succeed so a mid-save failure leaves prior data intact.
      //
      // Wrapped as one 'db.shot_details' step (holes upsert, per-hole shots
      // upsert, and the putt/approach enrichment inserts nested inside that
      // loop) rather than split further: this whole sequence is what the
      // existing-round branch's single atomic RPC does in one transaction,
      // and it is the sequence measured 2026-08-25/26 costing 12-24s of
      // TOTAL DURATION while every step but the RPC read 0ms.
      if (holesPayload.length > 0) {
        void flightRecorder.start('db.shot_details');
        const holesData = holesPayload.map(h => ({ round_id: roundId, ...h }));
        const { data: insertedHoles, error: holesError } = await supabase
          .from('golf_holes')
          .upsert(holesData, { onConflict: 'round_id,hole_number' })
          .select('id, hole_number');

        if (holesError) {
          // Single log call per failure (see updateExisting branch above).
          await logServerError(`Auto-save insert holes failed: ${holesError.message}`, {
            action: 'savePartialRound.insertHoles',
            roundId,
            playerId: player.id,
            userId: user.id,
            userEmail: user.email,
            holesCount: holesPayload.length,
            errorCode: holesError.code,
            errorDetails: holesError.details,
          });
          // Do NOT clean up the parent round here. A network or database
          // failure while saving holes is recoverable; deleting the
          // in-progress round turns that transient failure into data loss.
          void flightRecorder.fail('db.shot_details', { errorCode: holesError.code, errorSummary: holesError.message });
          endTrace('failure');
          return { success: false, error: 'Failed to save hole data. Please try again.' };
        }

        if (insertedHoles) {
          const holeIdMap = new Map(insertedHoles.map(h => [h.hole_number, h.id]));

          for (const group of shotsPayload) {
            const holeId = holeIdMap.get(group.hole_number);
            if (!holeId) continue;

            const shotsData = group.shots.map(shot => ({
              round_id: roundId,
              hole_id: holeId,
              hole_number: group.hole_number,
              ...shot,
            }));

            // Upsert on (round_id, hole_number, shot_number) — see migration
            // 20260304000003 for the UNIQUE constraint. Prior code did .insert()
            // which only worked because holes were deleted first (and cascaded
            // to shots). With the destructive delete removed, we must upsert
            // here too or re-saving the same shot_number would 409.
            const { data: insertedShots, error: shotsError } = await supabase
              .from('golf_shots')
              .upsert(shotsData, { onConflict: 'round_id,hole_number,shot_number' })
              .select('id, hole_number, shot_number');
            if (shotsError) {
              // Single log call per failure (see updateExisting branch above).
              await logServerError(`Auto-save insert shots failed: ${shotsError.message}`, {
                action: 'savePartialRound.insertShots',
                roundId,
                playerId: player.id,
                userId: user.id,
                userEmail: user.email,
                holesCount: holesPayload.length,
                shotsCount: group.shots.length,
                errorCode: shotsError.code,
                errorDetails: shotsError.details,
                extra: { holeNumber: group.hole_number },
              });
              // Do NOT clean up the parent round here. A network or database
              // failure while saving shots is recoverable; deleting the
              // in-progress round turns that transient failure into data loss.
              void flightRecorder.fail('db.shot_details', { errorCode: shotsError.code, errorSummary: shotsError.message });
              endTrace('failure');
              return { success: false, error: 'Failed to save shot data. Please try again.' };
            }

            // Insert putt_details and approach_miss_details for this hole's shots
            if (insertedShots && insertedShots.length > 0) {
              const shotIdMap = new Map(insertedShots.map(s => [`${s.hole_number}-${s.shot_number}`, s.id]));

              // Filter putt details for this hole
              const holePuttDetails = puttDetailsPayload.filter(p => p.hole_number === group.hole_number);
              for (const pd of holePuttDetails) {
                const shotIdForPutt = shotIdMap.get(`${pd.hole_number}-${pd.shot_number}`);
                if (shotIdForPutt) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { error: puttErr } = await (supabase as any).from('putt_details').insert({
                    shot_id: shotIdForPutt,
                    miss_tags: pd.miss_tags || [],
                    break_direction: pd.break_direction,
                    distance_feet: pd.distance_feet,
                    made: pd.made,
                  }).select();
                  if (puttErr) { /* non-critical — putt detail enrichment only */ }
                }
              }

              // Filter approach details for this hole
              const holeApproachDetails = approachDetailsPayload.filter(a => a.hole_number === group.hole_number);
              for (const ad of holeApproachDetails) {
                const shotIdForApproach = shotIdMap.get(`${ad.hole_number}-${ad.shot_number}`);
                if (shotIdForApproach) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { error: approachErr } = await (supabase as any).from('approach_miss_details').insert({
                    shot_id: shotIdForApproach,
                    miss_direction: ad.miss_direction,
                    lie_type: ad.lie_type,
                    distance_from_green_yards: ad.distance_from_green_yards,
                  }).select();
                  if (approachErr) { /* non-critical — approach detail enrichment only */ }
                }
              }
            }
          }
        }
        void flightRecorder.complete('db.shot_details', {
          observed: {
            holes: holesPayload.length,
            shots: shotsPayload.reduce((sum, g) => sum + g.shots.length, 0),
          },
        });
      }
    }

    // Orphan trim — runs AFTER every upsert above has succeeded, so a
    // mid-save failure can never strand the user with deleted data. Any
    // trim error is logged but not surfaced: the user's current draft is
    // intact in DB, just slightly larger than their working set, and the
    // next autosave will trim again. 'db.orphan_trim' mirrors that: it is
    // observability only, so a trim error warns the step rather than failing
    // the trace — the save already stands regardless.
    if (holesPayload.length > 0) {
      void flightRecorder.start('db.orphan_trim');
      let trimHadError = false;
      const keepHoleNumbers = holesPayload.map(h => h.hole_number);

      // A1: never delete a durable scored hole, even one this payload never
      // named at all (e.g. a salvaged hole absent from a stale holeConfigs
      // list never reaches holesPayload, so the null-over-durable upsert
      // guard above can't see it — this is the only thing standing between
      // it and deletion). `.is('score', null)` restricts the trim to holes
      // that were never scored; a genuinely orphaned SCORED hole is left for
      // a human to reconcile rather than silently erased.
      const { error: trimHolesErr } = await supabase
        .from('golf_holes')
        .delete()
        .eq('round_id', roundId)
        .not('hole_number', 'in', `(${keepHoleNumbers.join(',')})`)
        .is('score', null);
      if (trimHolesErr) {
        trimHadError = true;
        await logServerError(`Auto-save orphan-hole trim failed (non-fatal): ${trimHolesErr.message}`, {
          action: 'savePartialRound.trimHoles',
          roundId,
          errorCode: trimHolesErr.code,
        });
      }

      for (const group of shotsPayload) {
        const keepShotNumbers = group.shots.map(s => s.shot_number);
        if (keepShotNumbers.length === 0) continue;

        const { error: trimShotsErr } = await supabase
          .from('golf_shots')
          .delete()
          .eq('round_id', roundId)
          .eq('hole_number', group.hole_number)
          .not('shot_number', 'in', `(${keepShotNumbers.join(',')})`);
        if (trimShotsErr) {
          trimHadError = true;
          await logServerError(`Auto-save orphan-shot trim failed (non-fatal): ${trimShotsErr.message}`, {
            action: 'savePartialRound.trimShots',
            roundId,
            extra: { holeNumber: group.hole_number },
            errorCode: trimShotsErr.code,
          });
        }
      }

      void (trimHadError
        ? flightRecorder.warn('db.orphan_trim', { errorSummary: 'trim_failed_non_fatal' })
        : flightRecorder.complete('db.orphan_trim'));
    }

    // NOTE: Do NOT call revalidatePath/updateTag here — see comment in the
    // RPC path above. Auto-save should be invisible to the router.

    // POST-WRITE VERIFICATION — mirrors the existingRoundId branch's own
    // verify.* block above. This branch had none at all before this refit
    // (it is reached only from the no-id/new-round autosave path, plus the
    // rare existingRoundId fallthrough above when the RPC omits
    // `updated_at`), so every submit through here previously reported
    // "declared but never ran" for verify.round/holes/shots.
    void flightRecorder.start('verify.round');
    void flightRecorder.start('verify.holes');
    void flightRecorder.start('verify.shots');
    try {
      const [{ count: holeCount }, { count: shotCount }] = await Promise.all([
        supabase.from('golf_holes').select('id', { count: 'exact', head: true }).eq('round_id', roundId),
        supabase.from('golf_shots').select('id', { count: 'exact', head: true }).eq('round_id', roundId),
      ]);
      const expectedShots = shotsPayload.reduce((sum, g) => sum + g.shots.length, 0);
      void flightRecorder.complete('verify.round', { observed: { round_id: roundId } });
      void flightRecorder.complete('verify.holes', {
        observed: { expected: holesPayload.length, actual: holeCount ?? null },
      });
      void flightRecorder.complete('verify.shots', {
        observed: { expected: expectedShots, actual: shotCount ?? null },
      });
    } catch (verifyErr) {
      const errorSummary = describeError(verifyErr);
      void flightRecorder.warn('verify.round', { errorSummary });
      void flightRecorder.warn('verify.holes', { errorSummary });
      void flightRecorder.warn('verify.shots', { errorSummary });
    }

    endTrace('success');

    // B9: return the real `updated_at` for the row just created/reused so the
    // caller's optimistic-lock ref reflects the server immediately, rather
    // than staying `undefined` until some later existing-id save happens to
    // populate it — a gap that otherwise widens the window in which an
    // unrelated background beacon write reads as a false multi-device
    // conflict. Both queries above already `.select()` the full row; see
    // `roundUpdatedAtForResponse`'s declaration for why `round` itself
    // cannot be read here directly.
    return { success: true, data: { roundId, updatedAt: roundUpdatedAtForResponse ?? undefined } };

  } catch (err) {
    // Single log call per failure (see updateExisting branch above) — keep
    // logServerError since it already carries the stack via `extra.stack`
    // below; a paired logServerException would only double-write this
    // same unexpected error to admin_events.
    await logServerError(`Auto-save unexpected error: ${describeError(err)}`, {
      action: 'savePartialRound.catch',
      extra: { stack: err instanceof Error ? err.stack : undefined },
    }, 'critical');
    return {
      success: false,
      error: 'Failed to save round. Please try again.'
    };
  } finally {
    // Safety net, not the primary mechanism: every meaningful branch above
    // already calls `endTrace` with a precise status. This only catches a
    // return path that was not individually instrumented — recorder
    // construction moved to the TOP of this function (before it, some of
    // those paths produced no trace at all, so nothing was ever left
    // dangling; now they would be, without this) — and `endTrace`'s own
    // `traceEnded` guard makes it a no-op wherever an explicit call already
    // fired, so this never overwrites a real success/warning/failure status.
    endTrace('failure');
  }
}
/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedSavePartialRound = withAdminObserved(
  'savePartialRound',
  {
    sport: 'golf',
    feature: 'round_tracking',
    // Every returned-failure branch in savePartialRoundImpl already records
    // its own admin_events row (via logServerError or maybeCaptureRlsDenial)
    // with richer domain context (roundId/playerId/errorCode/etc). Without
    // this flag the wrapper's generic soft-failure observer ALSO fires on
    // every success-false return, doubling admin_events writes for real
    // failures and even logging the intentionally-silent 'conflict' /
    // "already been completed" race-condition returns that the impl
    // deliberately chose not to log. See src/app/golf/actions/insights.ts
    // getPlayerPatterns for the established idiom.
    observeSoftFailures: false,
  },
  savePartialRoundImpl,
);
/**
 * The exact failure save_partial_round_atomic returns when the target row is
 * not visible to the caller. Kept as one regex so the string lives in a single
 * place — it is matched against an RPC message, and a second copy is a second
 * thing to drift out of step with the migration that defines it.
 */
const ROUND_MISSING_RPC_ERROR = /round not found or you do not have permission to update it/i;
export async function savePartialRound(
  data: PartialRoundData,
  existingRoundId?: string,
  options?: SavePartialRoundOptions,
): Promise<SavePartialRoundResult> {
  return observedSavePartialRound(data, existingRoundId, options);
}
/**
 * Delete an in-progress round
 */
/**
 * Emits `helm.workflow.*` (metrics.ts) + one `helmLog` line for the
 * 'golf.round.recover' workflow — the "discard an in-progress round so the
 * player can start clean" action, at each of this function's EXISTING return
 * branches (no new branches added). No `attachHelmTrace` call here, unlike
 * the flight-recorder-covered workflows (submit/autosave/shot ops, wired in
 * helm-flight-recorder.ts's `finalize`): this function never constructs a
 * flight recorder, so there is no `traceId` to attach.
 *
 * `outcome` values distinguish the ordinary "someone else got there first"
 * race (`stale_round_state` — the function's own pre-existing comment calls
 * this "ordinary": a submit that already succeeded server-side, or a round
 * finished in another tab) from a genuine system fault (`db_error`,
 * `exception`) — the same "transient/expected vs terminal" split
 * Deliverable 6 asks for, just expressed as this action's own outcome
 * vocabulary rather than the flight recorder's success/failure/warning/
 * pending one.
 */
function recordDiscardRoundOutcome(outcome: string, errorCode?: string): void {
  recordWorkflow({
    feature: 'golf_round_lifecycle',
    action: 'golf.round.recover',
    outcome,
    sport: 'golf',
    runtime: process.env.NEXT_RUNTIME,
    errorCode,
  });
  helmLog[outcome === 'success' ? 'info' : 'warn']('golf.round_lifecycle.finished', {
    sport: 'golf',
    feature: 'golf_round_lifecycle',
    action: 'golf.round.recover',
    result: outcome,
    runtime: process.env.NEXT_RUNTIME,
    error_code: errorCode,
  });
}
async function deleteInProgressRoundImpl(roundId: string): Promise<ActionResult<void>> {
  try {
    // Validate UUID format
    const validId = CommonSchemas.uuid.safeParse(roundId);
    if (!validId.success) {
      recordDiscardRoundOutcome('invalid_input');
      return { success: false, error: 'Invalid round ID' };
    }

    const supabase = await createClient();

    // Resilient, not raw — a transient GoTrue blip must not read as a
    // sign-out (A5, 2026-09-02). See getUserResilient's header.
    const { user } = await getUserResilient(supabase);
    if (!user) {
      recordDiscardRoundOutcome('unauthenticated');
      return { success: false, error: 'You must be signed in' };
    }

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      recordDiscardRoundOutcome('player_not_found');
      return { success: false, error: 'Player profile not found' };
    }

    // Delete the round (cascades to holes and shots).
    //
    // `.select('id')` so a 0-row delete is distinguishable from a real one. Two
    // of the three filters are ownership and are unremarkable; the third,
    // `status = 'in_progress'`, is SEMANTIC — a round that has already been
    // submitted stops matching. A PostgREST DELETE that matches nothing
    // resolves `{ data: null, error: null }`, so checking `error` alone
    // returned success for a discard that discarded nothing.
    //
    // The caller acts on that answer: continue-round-client's handleDeleteRound
    // calls `clearEmergencySave(roundId)` — an irreversible
    // localStorage.removeItem — and navigates away. So the player lost their
    // local recovery snapshot while the round stayed on the server, and was
    // told nothing. The race is ordinary: a submit that succeeded server-side
    // but errored on the client, or a round finished in another tab.
    const { data: deletedRows, error } = await supabase
      .from('golf_rounds')
      .delete()
      .eq('id', roundId)
      .eq('player_id', player.id)
      .eq('status', 'in_progress')
      .select('id');

    if (error) {
      recordDiscardRoundOutcome('db_error', typeof error.code === 'string' ? error.code : undefined);
      return { success: false, error: 'Failed to delete round' };
    }

    if (!deletedRows || deletedRows.length === 0) {
      // Swap audit R-4: a discard is idempotent. When the row is simply gone
      // (this discard's first response was lost, or the Library or another
      // device discarded it first) the player's intent already holds — say
      // so, rather than an error whose Retry can never succeed while the
      // client resets its discarded flag and re-creates the round. Only a
      // row that still exists in another state (a submitted round) refuses.
      // A failed probe proves nothing and keeps the refusal below.
      const { data: remaining, error: probeError } = await supabase
        .from('golf_rounds')
        .select('id, status')
        .eq('id', roundId)
        .eq('player_id', player.id)
        .maybeSingle();
      if (!probeError && !remaining) {
        // Nothing changed here, so nothing to revalidate.
        recordDiscardRoundOutcome('already_removed');
        return { success: true, data: undefined };
      }

      // Deliberately specific. The player is one tap from losing their local
      // recovery copy, so "try again" would be the wrong steer — the round is
      // not in a discardable state and retrying cannot change that.
      //
      // `stale_round_state`, not `db_error` — nothing failed here. The round
      // is just no longer in the state this action expected (already
      // submitted, or removed elsewhere), an ordinary race rather than a
      // system fault. See this branch's own comment above the query.
      recordDiscardRoundOutcome('stale_round_state');
      return {
        success: false,
        error: "This round can no longer be discarded — it looks like it was already finished or removed.",
      };
    }

    revalidatePath('/golf/dashboard/rounds');
    updateTag(CACHE_TAGS.ROUNDS);

    recordDiscardRoundOutcome('success');
    return { success: true, data: undefined };

  } catch (error) {
    await logServerError(
      `deleteInProgressRound failed: ${describeError(error)}`,
      {
        action: 'golf.deleteInProgressRound',
        featureArea: 'golf_rounds',
        roundId,
        extra: { stack: error instanceof Error ? error.stack : undefined },
      }
    );
    recordDiscardRoundOutcome('exception');
    return {
      success: false,
      error: 'Failed to delete round. Please try again.'
    };
  }
}
const observedDeleteInProgressRound = withAdminObserved(
  'deleteInProgressRound',
  { sport: 'golf', feature: 'round_tracking' },
  deleteInProgressRoundImpl,
);
export async function deleteInProgressRound(roundId: string): Promise<ActionResult<void>> {
  return observedDeleteInProgressRound(roundId);
}
