// Shared helpers, schemas and types for the golf action modules split out of golf.ts.
// A plain server module, not a server-action surface (no server directive, no actions).

import { fromUntyped } from '@/lib/supabase/untyped';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import type { ShotRecord } from '@/lib/types/golf';
import { z } from 'zod';
import { isPlausibleApproach } from '@/lib/golf/approach-plausibility';
import { logServerError } from '@/lib/server-error-logger';
import { clampPuttDistanceFeet } from '@/lib/golf/round-entry-validation';
import { createHelmFlightRecorder, type HelmFlightRecorder, type StartHelmFlightRecorderInput } from '@/lib/observability/helm-flight-recorder';
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// COURSE ID RESOLUTION
// ============================================================================

/**
 * Resolve a course_id from golf_courses by name lookup.
 * Returns providedCourseId if already set; otherwise does a case-insensitive
 * lookup of courseName against golf_courses.name.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveCourseId(supabase: any, courseName: string, providedCourseId?: string | null): Promise<string | null> {
  if (providedCourseId) return providedCourseId;
  if (!courseName) return null;

  const { data } = await supabase
    .from('golf_courses')
    .select('id')
    .ilike('name', courseName)
    .limit(1)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}
// ============================================================================
// RESULT TYPE
// ============================================================================

/**
 * Standard action result type for consistent error handling
 * Use this for all server actions to enable toast notifications on the client
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

/**
 * This codebase has two words for the same patch of sand, and they are not
 * interchangeable by field:
 *
 *   lieBefore / result        accept 'sand'   and NOT 'bunker'
 *   approachMissLieType       accepts 'bunker' and NOT 'sand'
 *
 * Verified 2026-08-24 against production `golf_shots`: every stored lie is in
 * the 'sand' vocabulary, so nothing is corrupt today — but the UI layer maps
 * between the two in at least three places (`parseApproachMissLieType`,
 * `FairwayEditShotModal`, `approach-analytics`), and a single missed mapping
 * sends 'bunker' into a `lieBefore` that rejects it. That is a validation
 * failure caused entirely by our own inconsistent naming, and the player pays
 * for it mid-round.
 *
 * Accept both spellings and normalize. Reconciling the vocabulary properly is
 * still worth doing; until then this stops the mismatch reaching a player.
 */
const toLieVocabulary = (value: unknown) => (value === 'bunker' ? 'sand' : value);
const toMissLieVocabulary = (value: unknown) => (value === 'sand' ? 'bunker' : value);
export const comprehensiveShotSchema = z.object({
  shotNumber: z.number().int().min(1),
  shotType: z.enum(['tee', 'approach', 'around_green', 'putting', 'penalty']),
  clubType: z.string().min(1),
  lieBefore: z.preprocess(toLieVocabulary, z.enum(['tee', 'fairway', 'rough', 'sand', 'green', 'other'])),
  distanceToHoleBefore: z.number().min(0).max(1000),
  distanceUnitBefore: z.enum(['yards', 'feet']),
  result: z.preprocess(toLieVocabulary, z.enum(['fairway', 'rough', 'sand', 'green', 'hole', 'other', 'penalty'])),
  distanceToHoleAfter: z.number().min(0),
  distanceUnitAfter: z.enum(['yards', 'feet']),
  shotDistance: z.number().min(0),
  missDirection: z.string().optional(),
  puttBreak: z.enum(['right_to_left', 'left_to_right', 'straight', 'multiple']).optional(),
  puttSlope: z.enum(['uphill', 'downhill', 'level', 'severe']).optional(),
  isPenalty: z.boolean(),
  penaltyType: z.enum(['ob', 'water', 'unplayable', 'lost']).optional(),
  puttMissTags: z.array(z.string()).optional(),
  puttDistanceFeet: z.number().min(0).optional(),
  approachMissDirection: z.string().optional(),
  approachMissLieType: z.preprocess(toMissLieVocabulary, z.enum(['fairway', 'rough', 'bunker', 'hazard']).optional()),
});
export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}
/**
 * Human-readable labels for the hole/shot fields most likely to fail
 * validation with a raw Zod message a player would never understand (A3,
 * 2026-09-02). Fields not listed fall back to a spaced-out camelCase guess.
 */
const HOLE_FIELD_LABELS: Readonly<Record<string, string>> = {
  score: 'score',
  putts: 'putts',
  par: 'par',
  yardage: 'yardage',
  penaltyStrokes: 'penalty strokes',
  distanceToHoleBefore: 'distance to the hole',
  distanceToHoleAfter: 'distance to the hole',
  shotDistance: 'shot distance',
  puttDistanceFeet: 'putt distance',
};
/** Fields whose min/max constraint below is expressed in yards. */
const HOLE_FIELD_YARD_UNITS: ReadonlySet<string> = new Set(['distanceToHoleBefore', 'shotDistance']);
type HoleIssueLike = { code?: string; message: string; maximum?: unknown; minimum?: unknown };
/**
 * One human sentence for a single field-level Zod issue inside a hole (or
 * one of its shots) — "Hole 4, shot 1: distance to the hole must be 1000
 * yards or less." instead of a dotted path and the library's raw message.
 *
 * Shared by savePartialRound's `hole_invalid` result and
 * submitGolfRoundComprehensive's validation-failure message (A3) — both
 * schemas use the same `holes.<n>` / `holes.<n>.shots.<m>.<field>` shape.
 */
export function humanizeHoleFieldIssue(
  path: readonly PropertyKey[],
  issue: HoleIssueLike,
): { hole: number | null; field: string; message: string } {
  const parts = path.map(String);
  const holeIndex = parts[0] === 'holes' && /^\d+$/.test(parts[1] ?? '') ? Number(parts[1]) : null;
  const hole = holeIndex != null ? holeIndex + 1 : null;
  const shotsAt = parts.indexOf('shots');
  const shotNumber = shotsAt !== -1 && /^\d+$/.test(parts[shotsAt + 1] ?? '')
    ? Number(parts[shotsAt + 1]) + 1
    : null;
  const fieldKey = parts[parts.length - 1] ?? '';
  const field = hole != null ? (parts.slice(2).join('.') || fieldKey) : formatIssuePath(path);
  const label = HOLE_FIELD_LABELS[fieldKey]
    ?? fieldKey.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

  let sentence: string;
  const max = issue.maximum;
  const min = issue.minimum;
  if (issue.code === 'too_big' && typeof max === 'number') {
    const unit = HOLE_FIELD_YARD_UNITS.has(fieldKey) ? ' yards' : '';
    sentence = `${label} must be ${max}${unit} or less`;
  } else if (issue.code === 'too_small' && typeof min === 'number') {
    sentence = `${label} must be at least ${min}`;
  } else {
    sentence = `${label} — ${issue.message}`;
  }

  const location = shotNumber != null && hole != null
    ? `Hole ${hole}, shot ${shotNumber}`
    : hole != null
      ? `Hole ${hole}`
      : (formatIssuePath(path) || '(round)');

  return { hole, field, message: `${location}: ${sentence}.` };
}
export const dateString = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD');
/**
 * Helper to get team_id for a coach (since golf_coaches doesn't have team_id column).
 * Looks up via organization_id -> golf_teams.
 * Delegates to the shared deterministic resolver (never throws on orgs with >1 team).
 */
export async function getCoachTeamId(
  supabase: SupabaseClient,
  organizationId: string | null,
  coachId: string | null
): Promise<string | null> {
  // Cookie-aware: honours the program head's golf_active_team selection
  // (validated server-side) so coach WRITES target the toggled team.
  return resolveCoachTeamIdWithCookie(supabase, organizationId, coachId);
}
/**
 * Helper to get team_id for a player (since golf_players doesn't have team_id column)
 * Looks up via golf_team_members
 */
export async function getPlayerTeamId(
  supabase: SupabaseClient,
  playerId: string
): Promise<string | null> {
  // Prefer the active membership.
  //
  // Both reads below bind their error for a specific reason: this function's
  // only failure signal is `null`, and both callers write that null straight
  // into `golf_rounds.team_id`. The coach SELECT policy is keyed on
  // `team_id IS NOT NULL AND is_golf_team_coach(team_id)`, so a round saved
  // with a null team is invisible to the coach forever — and the player, who
  // can always see their own rounds, has no way to notice. A read that failed
  // and a player who genuinely has no team produce the identical null, so
  // without these logs there is nothing to tell them apart afterwards.
  const { data: active, error: activeError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .maybeSingle();

  // PGRST116 is not a failure here — it is `.maybeSingle()` meeting a player
  // with two active memberships, and the ordered fallback below handles that
  // case correctly. Logging it would be noise on a working path.
  if (activeError && activeError.code !== 'PGRST116') {
    await logServerError(
      `active membership read failed for player ${playerId}: ${describeError(activeError)}`,
      { action: 'golf.getPlayerTeamId', featureArea: 'rounds' },
      'warning'
    );
  }
  if (active?.team_id) return active.team_id;

  // F147: an injured/redshirt/inactive member still belongs to a team. If we
  // returned null here, the round would be saved with team_id = NULL and become
  // invisible to the coach — the golf_rounds coach SELECT RLS is keyed on
  // `team_id IS NOT NULL AND is_golf_team_coach(team_id)`, and the roster query
  // asks for the round by player_id expecting to see it. Fall back to the
  // player's most recent membership so the round stays coach-visible. This does
  // NOT loosen RLS (no cross-team leak): the round only carries the player's own
  // real team_id, which only that team's coach can read.
  const { data: anyMembership, error: anyError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyError) {
    // Both reads are now exhausted, so this null is about to be written to a
    // round. Record it at error level: the round still saves — a player who
    // has just entered eighteen holes must never lose them to a membership
    // lookup — but the round will not reach their coach, and this line is the
    // only trace of why.
    await logServerError(
      `membership lookup failed for player ${playerId}; the round will be saved with no team and will not appear on the coach's roster: ${describeError(anyError)}`,
      { action: 'golf.getPlayerTeamId', featureArea: 'rounds' },
      'error'
    );
  }

  return anyMembership?.team_id ?? null;
}
// deriveLieAfterFromResult, deriveLieAfter imported from '@/lib/utils/shot-helpers'

export function derivePuttDistanceFeet(shot: ShotRecord): number | null {
  if (shot.shotType !== 'putting') return null;
  // A client-supplied putt distance is clamped to 0–150 ft like every other
  // on-green distance; unclamped, a typo'd 2000 ft "putt" went straight into SG.
  if (shot.puttDistanceFeet !== undefined) return clampPuttDistanceFeet(shot.puttDistanceFeet);
  const distance = shot.distanceToHoleBefore;
  if (!Number.isFinite(distance)) return null;
  // SG-2: a putt distance is ALWAYS in feet. Converting a 'yards'-unit value to
  // feet (×3) fabricated impossible 90-500ft "putts" that then ×3'd again
  // downstream in SG. Treat the raw value as feet regardless of the stored unit
  // and clamp to a realistic putt max (120ft).
  return Math.min(Math.max(distance, 0), 120);
}
/** Allowed lie_type values for approach_miss_details CHECK constraint */
const VALID_APPROACH_LIE_TYPES = new Set([
  'fairway',
  'rough',
  'sand',
  'bunker',
  'recovery',
  'hazard',
  'green',
  'tee',
  'other',
  'penalty',
  'deep_rough',
]);
const VALID_APPROACH_MISS_DIRECTIONS = new Set([
  'short',
  'long',
  'left',
  'right',
  'short_left',
  'short_right',
  'long_left',
  'long_right',
]);
/** Validate client approachMissLieType against DB-safe lie_type values */
export function toDbLieType(lieType: string | undefined | null): string | null {
  if (!lieType) return null;
  return VALID_APPROACH_LIE_TYPES.has(lieType) ? lieType : null;
}
function toDbApproachMissDirection(missDirection: string | undefined | null): string | null {
  if (!missDirection) return null;
  return VALID_APPROACH_MISS_DIRECTIONS.has(missDirection) ? missDirection : null;
}
export function derivePuttMade(shot: ShotRecord): boolean | null {
  if (shot.shotType !== 'putting') return null;
  return shot.result === 'hole';
}
const toYards = (
  distance: number | null | undefined,
  unit: string | null | undefined,
): number | null =>
  distance == null ? null : unit === 'feet' ? distance / 3 : distance;
/**
 * Should this shot produce an `approach_miss_details` row?
 *
 * `shot_type` is assigned by ordinal, so 'approach' also covers layups on par
 * 5s and the replayed tee shot after a penalty. Neither is a shot at the
 * green, but the tracker still forces a miss direction on both (it offers no
 * "laid up" option), so they used to be written as approach misses tagged
 * 'short' — dragging every approach-miss aggregate short with them. Gate on
 * the shared plausibility rule so those rows never reach the table.
 */
export function isRealApproachShot(shot: ShotRecord, par: number): boolean {
  const isApproachShot =
    shot.shotType === 'approach' ||
    shot.shotType === 'around_green' ||
    (shot.shotType === 'tee' && par === 3);
  if (!isApproachShot) return false;

  return isPlausibleApproach({
    distanceToHoleBeforeYards: toYards(shot.distanceToHoleBefore, shot.distanceUnitBefore),
    distanceToHoleAfterYards: toYards(shot.distanceToHoleAfter, shot.distanceUnitAfter),
    lieBefore: shot.lieBefore,
    par,
  });
}
export interface RoundHolePayload {
  hole_number: number;
  par: number;
  yardage: number | null;
  score: number;
  putts: number;
  fairway_hit: boolean | null;
  gir: boolean | null;
  penalty_strokes: number | null;
  up_and_down: boolean | null;
  sand_save: boolean | null;
}
interface RoundShotPayload {
  shot_number: number;
  shot_type: string;
  club_type: string;
  lie_before: string;
  lie_after: string | null;
  distance_to_hole_before: number;
  distance_unit_before: string;
  result: string;
  distance_to_hole_after: number | null;
  distance_unit_after: string | null;
  shot_distance: number | null;
  miss_direction: string | null;
  putt_break: string | null;
  putt_slope: string | null;
  putt_distance_feet: number | null;
  putt_made: boolean | null;
  is_penalty: boolean;
  penalty_type: string | null;
}
export interface RoundShotGroupPayload {
  hole_number: number;
  shots: RoundShotPayload[];
}
export interface RoundPuttDetailPayload {
  hole_number: number;
  shot_number: number;
  miss_tags: string[];
  break_direction: string | null;
  distance_feet: number | null;
  made: boolean;
}
export interface RoundApproachDetailPayload {
  hole_number: number;
  shot_number: number;
  miss_direction: string | null;
  lie_type: string | null;
  distance_from_green_yards: number | null;
}
export interface CompletedRoundUpdatePayload {
  player_id: string;
  team_id: string | null;
  course_id: string | null;
  course_name: string;
  course_city: string | null;
  course_state: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  tee_id: string | null;
  round_type: 'practice' | 'tournament' | 'qualifier';
  round_date: string;
  holes_played: number;
  total_score: number;
  score_to_par: number;
  total_putts: number;
  total_fairways_hit: number;
  total_fairways: number;
  total_gir: number;
  total_gir_possible: number;
  total_penalties: number;
  front_nine: number | null;
  back_nine: number | null;
  status: 'completed';
  qualifier_id: string | null;
  qualifier_round_number: number | null;
}
export interface RoundSubmissionBackupPayload {
  version: 1;
  type: 'submit_backup';
  savedAt: string;
  roundData: CompletedRoundUpdatePayload;
  holes: RoundHolePayload[];
  shots: RoundShotGroupPayload[];
  puttDetails: RoundPuttDetailPayload[];
  approachDetails: RoundApproachDetailPayload[];
}
/**
 * Mirrors createHelmFlightRecorder's own production opt-in gate
 * (src/lib/observability/helm-flight-recorder.ts: `enabled`) so the
 * Postgres-side helm_private.trace_checkpoint() log volume follows the
 * IDENTICAL policy as the JS-side helm_debug persistence, instead of firing
 * on every round write in production while the JS side stays silently
 * disabled (helm_private.configure_trace_context has no gate of its own —
 * whatever _helm_trace.enabled the caller sends is what runs). This
 * necessarily duplicates that file's expression rather than inventing a new
 * one; see crossFile note asking the recorder to expose it instead.
 */
function shouldEmitHelmTraceContext(): boolean {
  return process.env.VERCEL_ENV !== 'production' || process.env.HELM_FLIGHT_RECORDER_ENABLED === 'true';
}
/**
 * The `_helm_trace` key shape helm_private.configure_trace_context expects
 * (supabase/migrations/20260825200811_helm_flight_recorder.sql). Omitted
 * entirely when tracing is off so the RPC's own no-op default applies —
 * never sent as `enabled: false`, which would still cost a jsonb key lookup
 * per checkpoint for zero benefit.
 */
export function helmTracePayload(traceId: string): Record<string, unknown> {
  return shouldEmitHelmTraceContext() ? { _helm_trace: { trace_id: traceId, enabled: true } } : {};
}
/**
 * The flight recorder must NEVER fail or slow a round write. Every write
 * createHelmFlightRecorder makes already fails open internally (see that
 * file's `failOpen`), but this guards construction itself so an unexpected
 * rejection there can't propagate into a round-lifecycle action. Returns a
 * fully inert recorder on failure — same shape as the library's own
 * disabled-mode no-op.
 */
export async function createSafeFlightRecorder(input: StartHelmFlightRecorderInput): Promise<HelmFlightRecorder> {
  try {
    return await createHelmFlightRecorder(input);
  } catch {
    const noop = async () => undefined;
    return {
      traceId: input.traceId ?? 'unavailable',
      workflow: input.workflow,
      start: noop,
      complete: noop,
      fail: noop,
      warn: noop,
      skip: noop,
      finalize: noop,
    };
  }
}
/**
 * True when getUser() failed to REACH the auth server, as opposed to the auth
 * server rejecting the session.
 *
 * `const { data: { user } } = await supabase.auth.getUser()` conflates two
 * different facts behind `user === null`:
 *   - the session is genuinely invalid (GoTrue answered 401/403), and
 *   - the auth check itself failed in transit (abort, network, 5xx) — GoTrue
 *     never ruled on the session at all.
 *
 * On 2026-08-19 the second case fired 6 times across 4 Guilford rounds and was
 * logged as "user session expired mid-round". It wasn't: every affected player
 * held a valid, unexpired access token at that moment (verified against
 * auth.refresh_tokens rotation chains), the failures exist ONLY inside the
 * DB-contention window of the round-submit incident, and GoTrue shares the
 * contended Postgres — the old 10s client abort was killing the /auth/v1/user
 * round trip. Treating that as "signed out" tells a mid-round player their
 * session died when nothing is wrong with it.
 *
 * Discriminator: a real rejection carries a 4xx status. Everything else —
 * AuthRetryableFetchError (status 0), missing status, 5xx, fetch/abort
 * message shapes — is transit failure, and the only honest answer is "retry".
 */
export function isTransientAuthCheckFailure(
  error: { status?: number; name?: string; message?: string } | null | undefined
): boolean {
  if (!error) {
    return false;
  }
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
    return false;
  }
  return true;
}
async function submitRoundDirectFallback({
  supabase,
  roundId,
  playerId,
  roundData,
  holesPayload,
  shotsPayload,
  puttDetailsPayload,
  approachDetailsPayload,
  submissionBackup,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  roundId: string;
  playerId: string;
  roundData: CompletedRoundUpdatePayload;
  holesPayload: RoundHolePayload[];
  shotsPayload: RoundShotGroupPayload[];
  puttDetailsPayload: RoundPuttDetailPayload[];
  approachDetailsPayload: RoundApproachDetailPayload[];
  submissionBackup: RoundSubmissionBackupPayload;
}): Promise<{ success: true; warnings: string[] } | { success: false; error: string }> {
  const warnings: string[] = [];
  const roundsTable = fromUntyped(supabase, 'golf_rounds');
  const { data: existingRound } = await roundsTable
    .select('draft_data')
    .eq('id', roundId)
    .eq('player_id', playerId)
    .maybeSingle();

  const existingDraftData = existingRound?.draft_data;

  // Snapshot the existing holes + shots BEFORE we clear them. The JS client can't
  // wrap this in a DB transaction (that's exactly what the atomic RPC this is a
  // fallback FOR does), so if an insert fails after the deletes we manually restore
  // the snapshot instead of leaving the round with no holes/shots. This honors the
  // no-destructive-writes rule on a save/submit path — a transient failure must not
  // lose the round. Restore is best-effort: if it also fails we surface the original
  // error, but the common case (transient insert error) is fully recoverable.
  const { data: shotSnapshot, error: shotSnapshotError } = await supabase.from('golf_shots').select('*').eq('round_id', roundId);
  const { data: holeSnapshot, error: holeSnapshotError } = await supabase.from('golf_holes').select('*').eq('round_id', roundId);
  if (shotSnapshotError || holeSnapshotError || shotSnapshot == null || holeSnapshot == null) {
    // Could not capture a reliable snapshot — abort BEFORE any delete so a later
    // restoreSnapshot() can never wipe shots/holes and re-insert nothing (data-loss guard).
    return {
      success: false,
      error: `Fallback aborted: could not snapshot existing round data: ${shotSnapshotError?.message || holeSnapshotError?.message || 'snapshot returned null'}`,
    };
  }
  const restoreSnapshot = async (): Promise<void> => {
    // At this point the snapshot in memory is the ONLY remaining copy of the
    // player's round. A restore that fails silently loses it for good — that is
    // exactly how round 8e89c73e was destroyed on 2026-08-20: the deletes below
    // succeeded, the re-inserts timed out, and the bare `catch {}` that used to
    // sit here swallowed it. If we cannot re-seat the rows, the snapshot MUST
    // reach the log so the round is recoverable from something.
    const failRestore = async (stage: string, detail: string): Promise<void> => {
      await logServerError(
        `CRITICAL: round rollback failed at ${stage} — holes/shots may be LOST for round ${roundId}. Snapshot attached.`,
        {
          action: 'submitRoundDirectFallback.restoreSnapshot',
          roundId,
          playerId,
          holesCount: Array.isArray(holeSnapshot) ? holeSnapshot.length : 0,
          shotsCount: Array.isArray(shotSnapshot) ? shotSnapshot.length : 0,
          extra: { stage, detail, holeSnapshot, shotSnapshot },
        },
        'critical'
      );
    };

    try {
      // nosemgrep: helmv3-destructive-write-pattern -- this IS the rollback: re-seating the snapshot captured (and null-guarded) above after a failed swap
      const { error: clearShots } = await supabase.from('golf_shots').delete().eq('round_id', roundId);
      if (clearShots) {
        await failRestore('clear_shots', clearShots.message);
        return;
      }
      // nosemgrep: helmv3-destructive-write-pattern -- rollback path, see above
      const { error: clearHoles } = await supabase.from('golf_holes').delete().eq('round_id', roundId);
      if (clearHoles) {
        await failRestore('clear_holes', clearHoles.message);
        return;
      }
      if (Array.isArray(holeSnapshot) && holeSnapshot.length > 0) {
        const { error: holesBack } = await supabase.from('golf_holes').insert(holeSnapshot);
        if (holesBack) {
          await failRestore('reinsert_holes', holesBack.message);
          return;
        }
      }
      if (Array.isArray(shotSnapshot) && shotSnapshot.length > 0) {
        const { error: shotsBack } = await supabase.from('golf_shots').insert(shotSnapshot);
        if (shotsBack) {
          await failRestore('reinsert_shots', shotsBack.message);
        }
      }
    } catch (restoreError) {
      await failRestore(
        'threw',
        restoreError instanceof Error ? restoreError.message : String(restoreError)
      );
    }
  };

  // nosemgrep: helmv3-destructive-write-pattern -- guarded swap: snapshot captured + null-checked BEFORE any delete, every failure path restores it (restoreSnapshot above); this is the manual fallback for the atomic RPC
  const { error: deleteShotsError } = await supabase
    .from('golf_shots')
    .delete()
    .eq('round_id', roundId);

  if (deleteShotsError) {
    // Nothing destroyed yet (the delete itself failed) — no restore needed.
    return { success: false, error: `Fallback failed while clearing shots: ${deleteShotsError.message}` };
  }

  // nosemgrep: helmv3-destructive-write-pattern -- same guarded swap (snapshot + restore on every failure path), see the shots delete above
  const { error: deleteHolesError } = await supabase
    .from('golf_holes')
    .delete()
    .eq('round_id', roundId);

  if (deleteHolesError) {
    await restoreSnapshot(); // shots were already cleared — put them back
    return { success: false, error: `Fallback failed while clearing holes: ${deleteHolesError.message}` };
  }

  const { data: insertedHoles, error: holesError } = await supabase
    .from('golf_holes')
    .insert(holesPayload.map(hole => ({ round_id: roundId, ...hole })))
    .select('id, hole_number');

  if (holesError || !insertedHoles) {
    await restoreSnapshot(); // holes+shots cleared, new holes failed — restore originals
    return { success: false, error: `Fallback failed while writing holes: ${holesError?.message || 'unknown error'}` };
  }

  const holeIdMap = new Map<number, string>(
    insertedHoles.map((hole: { hole_number: number; id: string }) => [hole.hole_number, hole.id])
  );
  const shotIdMap = new Map<string, string>();

  for (const group of shotsPayload) {
    const holeId = holeIdMap.get(group.hole_number);
    if (!holeId || group.shots.length === 0) {
      continue;
    }

    const { data: insertedShots, error: shotsError } = await supabase
      .from('golf_shots')
      .insert(group.shots.map(shot => ({
        round_id: roundId,
        hole_id: holeId,
        hole_number: group.hole_number,
        ...shot,
      })))
      .select('id, hole_number, shot_number');

    if (shotsError || !insertedShots) {
      await restoreSnapshot(); // partial new holes/shots written — roll back to originals
      return { success: false, error: `Fallback failed while writing shots: ${shotsError?.message || 'unknown error'}` };
    }

    for (const shot of insertedShots) {
      shotIdMap.set(`${shot.hole_number}-${shot.shot_number}`, shot.id);
    }
  }

  for (const pd of puttDetailsPayload) {
    const shotId = shotIdMap.get(`${pd.hole_number}-${pd.shot_number}`);
    if (!shotId) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('putt_details').insert({
      shot_id: shotId,
      miss_tags: pd.miss_tags || [],
      break_direction: pd.break_direction,
      distance_feet: pd.distance_feet != null ? Math.max(0, Math.min(500, pd.distance_feet)) : null,
      made: pd.made,
    });

    if (error) {
      warnings.push(
        `Putt detail skipped for hole ${pd.hole_number} shot ${pd.shot_number}: ${error.message || 'unknown error'}`
      );
    }
  }

  for (const ad of approachDetailsPayload) {
    const shotId = shotIdMap.get(`${ad.hole_number}-${ad.shot_number}`);
    if (!shotId) {
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('approach_miss_details').insert({
      shot_id: shotId,
      miss_direction: toDbApproachMissDirection(ad.miss_direction),
      lie_type: toDbLieType(ad.lie_type),
      distance_from_green_yards: ad.distance_from_green_yards != null
        ? Math.max(0, ad.distance_from_green_yards)
        : null,
    });

    if (error) {
      warnings.push(
        `Approach detail skipped for hole ${ad.hole_number} shot ${ad.shot_number}: ${error.message || 'unknown error'}`
      );
    }
  }

  const mergedDraftData = existingDraftData && typeof existingDraftData === 'object' && !Array.isArray(existingDraftData)
    ? { ...existingDraftData, submissionBackup: { ...submissionBackup, usedDirectFallback: true, fallbackCompletedAt: new Date().toISOString(), warnings } }
    : { submissionBackup: { ...submissionBackup, usedDirectFallback: true, fallbackCompletedAt: new Date().toISOString(), warnings } };

  const { error: finalizeError } = await roundsTable
    .update({
      ...roundData,
      draft_data: mergedDraftData,
    })
    .eq('id', roundId)
    .eq('player_id', playerId);

  if (finalizeError) {
    return { success: false, error: `Fallback failed while finalizing round: ${finalizeError.message}` };
  }

  return { success: true, warnings };
}
// The destructive fallback is intentionally not callable from the submit
// workflow. Keep this historical implementation temporarily for forensic
// rollback review, but make that non-use explicit to TypeScript and future
// maintainers; the protected atomic RPC is the only live submission path.
void submitRoundDirectFallback;
