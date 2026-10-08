'use server';

import { createClient } from '@/lib/supabase/server';
import { derivePlayerQualifierProgress } from './qualifier-progress';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { notifyQualifierCreated } from '@/lib/notifications';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import type { Database } from '@/lib/types/database';
import { resolveQualifierRoundNumber } from '@/lib/golf/qualifier-round-number';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';
import { isUuid } from '@/lib/utils/uuid';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { describeError } from '@/lib/utils/describe-error';
import { dateString, getCoachTeamId } from './golf-action-shared';
import type { ActionResult } from './golf-action-shared';

// Feature G — one course assignment per qualifier round (coach-set).
const qualifierRoundCourseSchema = z.object({
  roundNumber: z.number().int().min(1).max(50),
  courseId: z.string().uuid().optional().nullable(),
  courseName: z.string().max(200).optional().nullable(),
  teeId: z.string().uuid().optional().nullable(),
});
const golfQualifierSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    courseName: z.string().max(200).optional(),
    courseId: z.string().uuid().optional(),
    spotsAvailable: z.number().int().min(1).optional(),
    // dateString, not z.string(): a QA run stored start_date '60824-02-02'
    // (a typed 5-digit year) and the list rendered "Feb 2, 60824".
    entryDeadline: dateString.optional(),
    rules: z.string().max(5000).optional(),
    startDate: dateString,
    endDate: dateString.optional(),
    playerIds: z.array(z.string().uuid()),
    // Travel-squad selection model (omit → DB defaults 5 total / 1 coach-pick).
    selectionSlotsTotal: z.number().int().min(1).max(50).optional(),
    selectionSlotsCoachPick: z.number().int().min(0).max(50).optional(),
    // The round cap controls whether a player may enter another result; it
    // must be explicit so a caller can never silently create a one-round
    // qualifier by omitting it.
    numRounds: z.number().int().min(1).max(50),
    roundCourses: z.array(qualifierRoundCourseSchema).max(50).optional(),
  })
  .refine(
    (d) =>
      d.selectionSlotsTotal === undefined ||
      d.selectionSlotsCoachPick === undefined ||
      d.selectionSlotsCoachPick <= d.selectionSlotsTotal,
    { message: 'Coach picks cannot exceed the total travel-squad size', path: ['selectionSlotsCoachPick'] },
  )
  // The qualifier window must be coherent: the end date cannot precede the start.
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  // Players must confirm in before play opens: the entry deadline cannot fall
  // after the qualifier has already started.
  .refine((d) => !d.entryDeadline || d.entryDeadline <= d.startDate, {
    message: 'Entry deadline must be on or before the start date',
    path: ['entryDeadline'],
  });
interface GolfQualifierInput {
  name: string;
  description?: string;
  courseName?: string;
  courseId?: string;
  spotsAvailable?: number;
  entryDeadline?: string;
  rules?: string;
  startDate: string;
  endDate?: string;
  playerIds: string[];
  /** Travel-squad size (omit → DB default 5). */
  selectionSlotsTotal?: number;
  /** Coach's discretionary picks within the squad (omit → DB default 1). */
  selectionSlotsCoachPick?: number;
  /** How many rounds the qualifier runs; this is the enforced player cap. */
  numRounds: number;
  /** Feature G — the course assigned to each round (omit → none). */
  roundCourses?: QualifierRoundCourseInput[];
}
/** Feature G — a single round's course assignment within a qualifier. */
export interface QualifierRoundCourseInput {
  roundNumber: number;
  courseId?: string | null;
  courseName?: string | null;
  teeId?: string | null;
}
/** Feature G — a round's course assignment as read back from the DB. */
export interface QualifierRoundCourse {
  roundNumber: number;
  courseId: string | null;
  courseName: string | null;
  teeId: string | null;
}
// ============================================================================
// QUALIFIER ACTIONS
// ============================================================================

async function createGolfQualifierImpl(data: GolfQualifierInput): Promise<ActionResult<{ qualifierId: string }>> {
  try {
    // Validate input
    const validatedData = golfQualifierSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create qualifiers' };
    }

    // Get coach with organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach?.organization_id) {
      return { success: false, error: 'Coach profile not found' };
    }

    // Resolve the coach's ACTIVE team (cookie-aware; honours the program
    // head's team toggle and never throws on multi-team orgs).
    const orgTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);

    if (!orgTeamId) {
      return { success: false, error: 'Team not found for your organization' };
    }

    // `playerIds` arrive from the browser and shape-validation only proves they
    // are uuids. Entered into a qualifier, a player gets a row on this team's
    // leaderboard and a notification, so a uuid that is not on THIS team's active
    // roster must stop the create (setQualifierEntrants applies the same rule to
    // edits). Checked before anything is written, so a refusal leaves nothing
    // behind. Duplicates are dropped: the entries table is unique per player.
    const playerIds = [...new Set(validatedData.playerIds)];
    if (playerIds.length > 0) {
      const onRoster = new Set<string>();
      for (const ids of chunkIds(playerIds)) {
        const { data: members, error: rosterError } = await supabase
          .from('golf_team_members')
          .select('player_id')
          .eq('team_id', orgTeamId)
          .eq('status', 'active')
          .in('player_id', ids);
        if (rosterError) {
          await logServerError(`createGolfQualifier roster read failed: ${describeError(rosterError)}`, {
            action: 'createGolfQualifier.roster',
            featureArea: 'qualifiers',
          });
          return { success: false, error: "Couldn't check your roster just now, so the qualifier wasn't created. Please try again." };
        }
        for (const m of members ?? []) onRoster.add(m.player_id);
      }
      if (playerIds.some((id) => !onRoster.has(id))) {
        return { success: false, error: 'Some selected players are not on your team' };
      }
    }

    // Create qualifier
    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .insert({
        team_id: orgTeamId,
        name: validatedData.name,
        description: validatedData.description || null,
        course_name: validatedData.courseName || null,
        course_id: validatedData.courseId || null,
        spots_available: validatedData.spotsAvailable || null,
        entry_deadline: validatedData.entryDeadline || null,
        rules: validatedData.rules || null,
        start_date: validatedData.startDate,
        end_date: validatedData.endDate || null,
        status: 'upcoming',
        created_by: coach.id,
        // The round cap is an entry rule, not optional follow-up metadata.
        // Persist it in the same write as the qualifier so a transient
        // secondary UPDATE can never leave a multi-round qualifier capped at
        // the database default of one round.
        num_rounds: validatedData.numRounds,
        // Only set when provided so omitted values fall back to DB defaults
        // (5 total / 1 coach-pick) — keeps the legacy create path byte-identical.
        ...(validatedData.selectionSlotsTotal !== undefined
          ? { selection_slots_total: validatedData.selectionSlotsTotal }
          : {}),
        ...(validatedData.selectionSlotsCoachPick !== undefined
          ? { selection_slots_coach_pick: validatedData.selectionSlotsCoachPick }
          : {}),
      })
      .select()
      .single();

    if (qualifierError) {
      return { success: false, error: 'Failed to create qualifier. Please try again.' };
    }

    // Feature G — persist the per-round course assignments. Best-effort write
    // through fromUntyped (golf_qualifier_round_courses is not yet in the
    // generated Database types; the migration is unapplied). A failure here must
    // NOT roll back the qualifier the coach already created — surface it and move
    // on so courses can be re-assigned via setQualifierRoundCourses().
    if (validatedData.roundCourses && validatedData.roundCourses.length > 0) {
      const numRounds = validatedData.numRounds;
      const rows = validatedData.roundCourses
        // Defensive: never write a round beyond the declared count.
        .filter((rc) => rc.roundNumber >= 1 && rc.roundNumber <= numRounds)
        .map((rc) => ({
          qualifier_id: qualifier.id,
          round_number: rc.roundNumber,
          course_id: rc.courseId ?? null,
          course_name: rc.courseName ?? null,
          tee_id: rc.teeId ?? null,
        }));

      if (rows.length > 0) {
        const { error: roundCoursesError } = await fromUntyped(
          supabase,
          'golf_qualifier_round_courses',
        ).insert(rows);

        if (roundCoursesError) {
          await logServerError(
            `createGolfQualifier round-course write failed: ${roundCoursesError.message}`,
            { action: 'createGolfQualifier.roundCourses', featureArea: 'qualifiers' },
          );
        }
      }
    }

    // Add player entries
    if (playerIds.length > 0) {
      const entries = playerIds.map(playerId => ({
        qualifier_id: qualifier.id,
        player_id: playerId,
        status: 'entered',
      }));

      const { error: entriesError } = await supabase
        .from('golf_qualifier_entries')
        .insert(entries);

      if (entriesError) {
        // The qualifier row is already committed, so returning failure here left
        // a half-made qualifier behind and the coach's Retry made a second one
        // (a duplicate on the list, each with its own deadline and rounds). Take
        // the row back out so a failure leaves nothing and Retry starts clean.
        // The entries insert is one statement, so none of the entries landed.
        const { data: removed, error: rollbackError } = await supabase
          .from('golf_qualifiers')
          .delete()
          .eq('id', qualifier.id)
          .select('id');
        const rolledBack = !rollbackError && (removed?.length ?? 0) === 1;
        await logServerError(
          `createGolfQualifier entries insert failed for qualifier ${qualifier.id}; ${rolledBack ? 'the qualifier was removed' : 'ROLLBACK ALSO FAILED, the qualifier is left without players'}: ${describeError(entriesError)}`,
          { action: 'createGolfQualifier.entries', featureArea: 'qualifiers' },
        );
        return {
          success: false,
          error: rolledBack
            ? 'Failed to add players to qualifier. Please try again.'
            : 'The qualifier was created but its players could not be added. Open it from Qualifiers and add them there; do not create it again.',
        };
      }
    }

    // Notify registered players (fire-and-forget)
    if (playerIds.length > 0) {
      try {
        const { data: playerRows } = await supabase
          .from('golf_players')
          .select('user_id')
          .in('id', playerIds);

        if (playerRows?.length) {
          // `user_id` is nullable once an account is deleted and the player's history
          // is preserved (20260819200000). A null is not a recipient — drop it so the
          // rest of the batch still gets notified, matching the three fan-outs in
          // golf.ts that already do this. NOT NULL in production today, so this
          // removes nothing yet: that is what lets it ship before the migration.
          const userIds = playerRows.map(p => p.user_id).filter((id): id is string => Boolean(id));
          const { data: userRows } = await supabase
            .from('users')
            .select('id, email')
            .in('id', userIds);

          if (userRows) {
            const formattedDate = validatedData.startDate
              ? new Date(validatedData.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : validatedData.startDate;

            await Promise.allSettled(
              userRows.map(u =>
                u.email
                  ? notifyQualifierCreated(u.id, u.email, validatedData.name, formattedDate, 1, qualifier.id)
                  : Promise.resolve()
              )
            );

            // Push notifications for qualifier creation
            const { sendBulkPushNotification } = await import('@/lib/notifications/push');
            await sendBulkPushNotification(
              'qualifier_created',
              userRows.map(u => u.id),
              { qualifierName: validatedData.name, startDate: formattedDate }
            ).catch(() => {});
          }
        }
      } catch (notifErr) {
        await logServerError(`createGolfQualifier notification failed: ${describeError(notifErr)}`, {
          action: 'createGolfQualifier.notifications',
          featureArea: 'qualifiers',
        });
      }
    }

    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: { qualifierId: qualifier.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid qualifier data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}
const observedCreateGolfQualifier = withAdminObserved(
  'createGolfQualifier',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers' },
  createGolfQualifierImpl,
);
export async function createGolfQualifier(data: GolfQualifierInput): Promise<ActionResult<{ qualifierId: string }>> {
  return observedCreateGolfQualifier(data);
}
/**
 * Feature G — read the per-round course assignments for a qualifier.
 * Returns one entry per assigned round (ascending). RLS lets any team member
 * (coach OR active player) read these, so this powers BOTH the coach edit view
 * and the player detail view. Reads through fromUntyped because the table is not
 * yet in the generated Database types (migration unapplied).
 */
async function getQualifierRoundCoursesImpl(
  qualifierId: string,
): Promise<QualifierRoundCourse[]> {
  try {
    const supabase = await createClient();

    // Auth gate (project hard rule: every exported action checks auth before a
    // DB call). RLS would silently return [] for an anonymous caller, which is
    // indistinguishable from "no courses assigned" — fail fast instead.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await fromUntyped(supabase, 'golf_qualifier_round_courses')
      .select('round_number, course_id, course_name, tee_id')
      .eq('qualifier_id', qualifierId)
      .order('round_number', { ascending: true });

    if (error || !Array.isArray(data)) {
      // withAdminObserved cannot see this: it only inspects an ActionResult
      // ({success:false}) shape, and Array.isArray(result) short-circuits
      // extractActionSoftFailure to null for this function's return type —
      // a real read failure here was silently indistinguishable from "no
      // courses assigned yet". Observability only; the fallback [] is
      // unchanged.
      void logServerError(
        `getQualifierRoundCourses read failed: ${error?.message ?? 'non-array data returned'}`,
        {
          action: 'getQualifierRoundCourses',
          featureArea: 'qualifiers',
          errorCode: error?.code,
          errorDetails: error?.details,
          extra: { qualifierId },
        },
        'warning'
      );
      // Deliberate, not a swallow — the comment above already documents
      // this: observability was added in a prior pass and the empty
      // fallback was explicitly kept unchanged.
      return [];
    }

    return (data as Array<{
      round_number: number;
      course_id: string | null;
      course_name: string | null;
      tee_id: string | null;
    }>).map((row) => ({
      roundNumber: row.round_number,
      courseId: row.course_id ?? null,
      courseName: row.course_name ?? null,
      teeId: row.tee_id ?? null,
    }));
  } catch (err) {
    void logServerError(
      `getQualifierRoundCourses threw: ${describeError(err)}`,
      {
        action: 'getQualifierRoundCourses',
        featureArea: 'qualifiers',
        extra: { qualifierId, stack: err instanceof Error ? err.stack : undefined },
      },
      'error'
    );
    return [];
  }
}
const observedGetQualifierRoundCourses = withAdminObserved(
  'getQualifierRoundCourses',
  { sport: 'golf', feature: 'qualifiers' },
  getQualifierRoundCoursesImpl,
);
export async function getQualifierRoundCourses(
  qualifierId: string,
): Promise<QualifierRoundCourse[]> {
  return observedGetQualifierRoundCourses(qualifierId);
}
/**
 * Feature G — set (replace) the round count + per-round course assignments for an
 * existing qualifier. Coach-only; RLS enforces team ownership on every write.
 *
 * Strategy: stage-and-swap by round_number via upsert on the
 * (qualifier_id, round_number) unique key, then delete any rounds that fell
 * outside the new num_rounds — never a blind delete-all-then-insert (that would
 * destroy assignments on a transient failure). Reads/writes through fromUntyped
 * because the table is not yet in the generated Database types.
 */
async function setQualifierRoundCoursesImpl(
  qualifierId: string,
  numRounds: number,
  roundCourses: QualifierRoundCourseInput[],
): Promise<ActionResult> {
  try {
    if (!isUuid(qualifierId)) {
      return { success: false, error: 'That qualifier link isn’t valid.' };
    }
    if (roundCourses.some((rc) => [rc.courseId, rc.teeId].some((id) => id != null && !isUuid(id)))) {
      return { success: false, error: 'A round’s course or tees aren’t valid. Choose them again.' };
    }

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to edit a qualifier' };
    }

    // The caller must coach the qualifier's team before anything is written;
    // RLS stays the second gate. The team comes from the row, never the caller.
    const { data: owner, error: ownerError } = await supabase.from('golf_qualifiers').select('team_id').eq('id', qualifierId).maybeSingle();
    if (ownerError) {
      await logServerError(`setQualifierRoundCourses: qualifier read failed: ${ownerError.message}`, { action: 'setQualifierRoundCourses.access', featureArea: 'qualifiers' }, 'warning');
      return { success: false, error: 'Couldn’t check this qualifier. Try again.' };
    }
    if (!owner) {
      return { success: false, error: 'That qualifier wasn’t found. It may have been deleted.' };
    }
    const access = await verifyTeamAccess(owner.team_id, user.id, supabase);
    if (!access.allowed) {
      return {
        success: false,
        error: access.reason === 'unavailable' ? 'Couldn’t confirm your access to this team. Try again.' : 'Only a coach of this team can change this qualifier.',
      };
    }

    // Never coerce a malformed update into a one-round qualifier. That turns a
    // client bug into a live cap that can strand players after their next
    // completed round. Reject it and preserve the existing configuration.
    if (!Number.isInteger(numRounds) || numRounds < 1 || numRounds > 50) {
      return { success: false, error: 'Round count must be between 1 and 50.' };
    }
    const safeNumRounds = numRounds;

    // Keep golf_qualifiers.num_rounds in sync. RLS (coach-only UPDATE) gates
    // this — and `.select('id')` is what makes that gate observable. A
    // PostgREST UPDATE that RLS refuses matches no rows and resolves
    // `{ data: null, error: null }`, indistinguishable from a successful one,
    // so relying on `error` alone reported "saved" for a write that did
    // nothing. The single-round edit path is the one that bites: it sends an
    // empty roundCourses array, so this is the ONLY write in the function and
    // there is nothing downstream to fail loudly instead.
    const { data: qualifierRows, error: numRoundsError } = await fromUntyped(supabase, 'golf_qualifiers')
      .update({ num_rounds: safeNumRounds })
      .eq('id', qualifierId)
      .select('id');

    if (numRoundsError) {
      return { success: false, error: 'Failed to update the round count. Please try again.' };
    }

    if (!Array.isArray(qualifierRows) || qualifierRows.length === 0) {
      await logServerError(
        `setQualifierRoundCourses matched no rows for qualifier ${qualifierId} — the write was refused or the qualifier is gone`,
        { action: 'setQualifierRoundCourses.numRounds', featureArea: 'qualifiers' },
        'warning',
      );
      return {
        success: false,
        error: "Couldn't save the round setup — the qualifier may have been deleted, or you may not have edit access to this team.",
      };
    }

    // Upsert the assignments that fall within the declared round count.
    const rows = roundCourses
      .filter((rc) => rc.roundNumber >= 1 && rc.roundNumber <= safeNumRounds)
      .map((rc) => ({
        qualifier_id: qualifierId,
        round_number: rc.roundNumber,
        course_id: rc.courseId ?? null,
        course_name: rc.courseName ?? null,
        tee_id: rc.teeId ?? null,
      }));

    if (rows.length > 0) {
      const { error: upsertError } = await fromUntyped(supabase, 'golf_qualifier_round_courses')
        .upsert(rows, { onConflict: 'qualifier_id,round_number' });

      if (upsertError) {
        return { success: false, error: 'Failed to save the round courses. Please try again.' };
      }
    }

    // Prune any assignments left over above the new round count (e.g. the coach
    // reduced num_rounds). Targeted delete, never delete-all.
    const { error: pruneError } = await fromUntyped(supabase, 'golf_qualifier_round_courses')
      .delete()
      .eq('qualifier_id', qualifierId)
      .gt('round_number', safeNumRounds);

    if (pruneError) {
      await logServerError(`setQualifierRoundCourses prune failed: ${pruneError.message}`, {
        action: 'setQualifierRoundCourses.prune',
        featureArea: 'qualifiers',
      });
    }

    revalidatePath('/golf/dashboard/qualifiers');
    revalidatePath(`/golf/dashboard/qualifiers/${qualifierId}`);
    revalidatePath('/golf/dashboard/my-qualifiers');

    return { success: true, data: undefined };
  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedSetQualifierRoundCourses = withAdminObserved(
  'setQualifierRoundCourses',
  { sport: 'golf', feature: 'qualifiers', demoSafe: true },
  setQualifierRoundCoursesImpl,
);
export async function setQualifierRoundCourses(
  qualifierId: string,
  numRounds: number,
  roundCourses: QualifierRoundCourseInput[],
): Promise<ActionResult> {
  return observedSetQualifierRoundCourses(qualifierId, numRounds, roundCourses);
}
async function updateQualifierStatusImpl(
  qualifierId: string,
  status: 'upcoming' | 'in_progress' | 'completed'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update qualifier status' };
    }

    // THREE READS, ONE VERDICT, AND EVERY FAILURE LOOKED LIKE A FINDING.
    //
    // The qualifier read said "Qualifier not found" for one the coach has
    // open. The coach and team reads both feed a single `!coach ||
    // !qualifierTeam || org mismatch` test, so a failure in either produced a
    // bare "Unauthorized" — the least informative thing this surface can say,
    // and one that reads as a statement about the coach's standing.
    //
    // Refusing when the check cannot run is right and is kept. `.single()`
    // reports a genuine no-row as PGRST116, so a qualifier that really is gone
    // still says so, and a coach who really is in another org is still
    // refused.
    const QUALIFIER_UNREADABLE =
      "Couldn't verify your access to this qualifier. Please try again.";

    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .select('team_id')
      .eq('id', qualifierId)
      .single();

    if (qualifierError && qualifierError.code !== 'PGRST116') {
      await logServerError(
        `qualifier gate: qualifier read failed for ${qualifierId}: ${describeError(qualifierError)}`,
        { action: 'golf.qualifierGate', featureArea: 'qualifiers' },
        'warning',
      );
      return { success: false, error: QUALIFIER_UNREADABLE };
    }

    if (!qualifier) return { success: false, error: 'Qualifier not found' };

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    const { data: qualifierTeam, error: qualifierTeamError } = await supabase
      .from('golf_teams')
      .select('organization_id')
      .eq('id', qualifier.team_id)
      .single();

    const gateReadFailed =
      (coachError && coachError.code !== 'PGRST116') ||
      (qualifierTeamError && qualifierTeamError.code !== 'PGRST116');

    if (gateReadFailed) {
      await logServerError(
        `qualifier gate: authorization read failed for ${qualifierId}: ${describeError(coachError ?? qualifierTeamError)}`,
        { action: 'golf.qualifierGate', featureArea: 'qualifiers' },
        'warning',
      );
      return { success: false, error: QUALIFIER_UNREADABLE };
    }

    if (!coach || !qualifierTeam || coach.organization_id !== qualifierTeam.organization_id) {
      return { success: false, error: 'Unauthorized' };
    }

    // PostgREST reports an RLS-filtered UPDATE as a successful request with
    // zero returned rows. Select the id so the coach is never told a manual
    // close worked when the qualifier was not actually changed.
    const { data: updatedQualifiers, error } = await supabase
      .from('golf_qualifiers')
      .update({ status })
      .eq('id', qualifierId)
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to update qualifier status. Please try again.' };
    }

    if (!updatedQualifiers || updatedQualifiers.length !== 1) {
      await logServerError(
        `qualifier status update matched no row for ${qualifierId}`,
        { action: 'golf.updateQualifierStatus', featureArea: 'qualifiers' },
        'warning',
      );
      return {
        success: false,
        error: "Couldn't update this qualifier — it may have been deleted, or you may not have edit access to this team.",
      };
    }

    revalidatePath('/golf/dashboard/qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: undefined };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedUpdateQualifierStatus = withAdminObserved(
  'updateQualifierStatus',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers' },
  updateQualifierStatusImpl,
);
export async function updateQualifierStatus(
  qualifierId: string,
  status: 'upcoming' | 'in_progress' | 'completed'
): Promise<ActionResult> {
  return observedUpdateQualifierStatus(qualifierId, status);
}
/** Editable scalar fields on an existing qualifier. All optional — only the
 *  keys the caller actually sends are written. */
export interface UpdateGolfQualifierDetailsInput {
  name?: string;
  description?: string | null;
  courseName?: string | null;
  rules?: string | null;
  entryDeadline?: string | null;
  startDate?: string;
  endDate?: string | null;
  spotsAvailable?: number | null;
}
const updateGolfQualifierDetailsSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    courseName: z.string().max(200).nullable().optional(),
    rules: z.string().max(5000).nullable().optional(),
    entryDeadline: dateString.nullable().optional(),
    startDate: dateString.optional(),
    endDate: dateString.nullable().optional(),
    spotsAvailable: z.number().int().min(1).nullable().optional(),
  })
  .refine((d) => !d.endDate || !d.startDate || d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  .refine((d) => !d.entryDeadline || !d.startDate || d.entryDeadline <= d.startDate, {
    message: 'Entry deadline must be on or before the start date',
    path: ['entryDeadline'],
  });
/**
 * Feature — edit an existing qualifier's basic details (name, description,
 * dates, rules, spots). Coach-only; mirrors the auth/team-ownership check
 * every other qualifier mutation in this file uses. Round count + per-round
 * course assignments are a separate concern, already handled by the
 * existing setQualifierRoundCourses — this only touches golf_qualifiers'
 * scalar columns, closing the "no edit surface after creation" gap.
 */
async function updateGolfQualifierDetailsImpl(
  qualifierId: string,
  data: UpdateGolfQualifierDetailsInput,
): Promise<ActionResult> {
  try {
    const validatedData = updateGolfQualifierDetailsSchema.parse(data);
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to edit a qualifier' };
    }

    // Verify coach owns this qualifier's team (same check as updateQualifierStatusImpl).
    const { data: qualifier } = await supabase
      .from('golf_qualifiers')
      .select('team_id')
      .eq('id', qualifierId)
      .single();

    if (!qualifier) return { success: false, error: 'Qualifier not found' };

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    const { data: qualifierTeam } = await supabase
      .from('golf_teams')
      .select('organization_id')
      .eq('id', qualifier.team_id)
      .single();

    if (!coach || !qualifierTeam || coach.organization_id !== qualifierTeam.organization_id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Only write fields the caller actually sent — undefined keys stay
    // untouched, an explicit null clears the column.
    const updateData: Database['public']['Tables']['golf_qualifiers']['Update'] = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.courseName !== undefined) updateData.course_name = validatedData.courseName;
    if (validatedData.rules !== undefined) updateData.rules = validatedData.rules;
    if (validatedData.entryDeadline !== undefined) updateData.entry_deadline = validatedData.entryDeadline;
    if (validatedData.startDate !== undefined) updateData.start_date = validatedData.startDate;
    if (validatedData.endDate !== undefined) updateData.end_date = validatedData.endDate;
    if (validatedData.spotsAvailable !== undefined) updateData.spots_available = validatedData.spotsAvailable;

    if (Object.keys(updateData).length === 0) {
      return { success: true, data: undefined };
    }

    // `.select('id')` so a 0-row update surfaces as a failure instead of a
    // false success — a PostgREST UPDATE matching no rows resolves
    // `{ data: null, error: null }`, exactly like one that matched. Same
    // reasoning, and the same fix, as recordFocusAreaOutcomeImpl in
    // development.ts and the WriteIntegrityError guard in rsvp.ts.
    //
    // It can genuinely match nothing. The gate above compares ORGANISATIONS,
    // while `golf_qualifiers_update_coach` is `is_golf_team_coach(team_id)` —
    // a `golf_team_coach_staff` row for that specific team, which is the
    // narrower set. A concurrently deleted qualifier does it too. Either way
    // `FairwayEditQualifier` used to navigate to the detail page as though the
    // edit had landed, and the coach found out on reload.
    const { data: updatedRows, error } = await supabase
      .from('golf_qualifiers')
      .update(updateData)
      .eq('id', qualifierId)
      .select('id');

    if (error) {
      return { success: false, error: 'Failed to update qualifier. Please try again.' };
    }

    if (!updatedRows || updatedRows.length === 0) {
      await logServerError(
        `updateGolfQualifierDetails matched no rows for qualifier ${qualifierId} — the org-level gate passed but the write did not land`,
        { action: 'golf.updateGolfQualifierDetails', featureArea: 'qualifiers' },
        'warning',
      );
      return {
        success: false,
        error: "Couldn't save this qualifier — it may have been deleted, or you may not have edit access to this team.",
      };
    }

    revalidatePath('/golf/dashboard/qualifiers');
    revalidatePath(`/golf/dashboard/qualifiers/${qualifierId}`);
    revalidatePath('/golf/dashboard/my-qualifiers');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: undefined };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid qualifier data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}
const observedUpdateGolfQualifierDetails = withAdminObserved(
  'updateGolfQualifierDetails',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers' },
  updateGolfQualifierDetailsImpl,
);
export async function updateGolfQualifierDetails(
  qualifierId: string,
  data: UpdateGolfQualifierDetailsInput,
): Promise<ActionResult> {
  return observedUpdateGolfQualifierDetails(qualifierId, data);
}
// ============================================================================
// QUALIFIER ACTIONS (PLAYER)
// ============================================================================

/** Qualifier info with player's progress */
export interface PlayerQualifierInfo {
  id: string;
  name: string;
  description: string | null;
  courseName: string | null;
  location: string | null;
  numRounds: number;
  holesPerRound: number;
  startDate: string;
  endDate: string | null;
  status: 'upcoming' | 'in_progress' | 'completed';
  showLiveLeaderboard: boolean;
  // Player's progress
  roundsCompleted: number;
  completedRoundNumbers: number[];
  totalScore: number | null;
  totalToPar: number | null;
}
/**
 * Get all qualifiers the current player is entered in
 * Returns qualifier info along with player's round completion status
 */
async function getPlayerQualifiersImpl(): Promise<ActionResult<PlayerQualifierInfo[]>> {
  try {
    const supabase = await createClient();

    // Resilient, not raw — a transient GoTrue blip must not read as a
    // sign-out (A5, 2026-09-02). See getUserResilient's header.
    const { user } = await getUserResilient(supabase);
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Get all qualifier entries for this player
    const { data: entries, error: entriesError } = await supabase
      .from('golf_qualifier_entries')
      .select(`
        rounds_completed,
        total_score,
        total_to_par,
        qualifier_id,
        qualifier:golf_qualifiers(
          id,
          name,
          description,
          course_name,
          start_date,
          end_date,
          status,
          num_rounds,
          is_test
        )
      `)
      .eq('player_id', player.id);

    // A failed read is NOT "you are in no qualifiers". It used to fold into the
    // empty list below, so a transient error rendered as an empty qualifier
    // picker with no way to tell it from a real empty state or to retry; callers
    // (Fairway loadQualifiers, Clubhouse setup-reads) already show their
    // "didn't load" notice for success:false.
    if (entriesError) {
      await logServerError(`getPlayerQualifiers: entries read failed: ${describeError(entriesError)}`, {
        action: 'golf.getPlayerQualifiers',
        featureArea: 'qualifiers',
      });
      return { success: false, error: 'Failed to load your qualifiers. Please try again.' };
    }
    // No entries is a real, empty answer.
    if (!entries || entries.length === 0) {
      return { success: true, data: [] };
    }

    // Get all qualifier rounds for this player
    const qualifierIds = entries.map(e => e.qualifier_id);
    const roundsResult = await supabase
      .from('golf_rounds')
      .select('qualifier_id, qualifier_round_number, total_score, score_to_par')
      .eq('player_id', player.id)
      .eq('is_test', false)
      .in('qualifier_id', qualifierIds)
      .eq('status', 'completed');

    if (roundsResult.error) {
      return { success: false, error: 'Failed to load qualifier round history.' };
    }

    const rounds = (roundsResult.data as unknown) as Array<{
      qualifier_id: string | null;
      qualifier_round_number: number | null;
      total_score: number | null;
      score_to_par: number | null;
    }> | null;

    // Build result with progress info
    type QualifierEntry = {
      qualifier_id: string;
      rounds_completed: number | null;
      total_score: number | null;
      total_to_par: number | null;
      qualifier: {
        id: string;
        name: string;
        description: string | null;
        course_name: string | null;
        start_date: string;
        end_date: string | null;
        status: string;
        num_rounds: number | null;
        is_test: boolean;
      } | null;
    };
    const qualifiers: PlayerQualifierInfo[] = (entries as unknown as QualifierEntry[])
      // QA qualifiers (is_test, OD-03) are hidden from players.
      .filter((e) => e.qualifier && typeof e.qualifier === 'object' && !('error' in e.qualifier) && !e.qualifier.is_test)
      .map((entry) => {
        const q = entry.qualifier as {
          id: string;
          name: string;
          description: string | null;
          course_name: string | null;
          start_date: string;
          end_date: string | null;
          status: string;
          num_rounds: number | null;
        };

        // Get rounds for this qualifier
        const qualifierRounds = (rounds || []).filter((r) => r.qualifier_id === q.id);
        const { roundsCompleted, completedRoundNumbers, totalScore, totalToPar } =
          derivePlayerQualifierProgress(qualifierRounds, {
            roundsCompleted: entry.rounds_completed,
            totalScore: entry.total_score,
            totalToPar: entry.total_to_par,
          });
        // num_rounds is a live, typed golf_qualifiers column (NOT NULL, default
        // 1) — read it directly instead of falling back to a computed guess
        // that was always roundsCompleted+1 (structurally always "one more
        // round to go", so a 1-round qualifier never left the active picker).
        const numRounds = q.num_rounds ?? 1;

        return {
          id: q.id,
          name: q.name,
          description: q.description,
          courseName: q.course_name,
          location: null,
          numRounds,
          holesPerRound: 18,
          startDate: q.start_date,
          endDate: q.end_date,
          status: (q.status || 'upcoming') as 'upcoming' | 'in_progress' | 'completed',
          showLiveLeaderboard: true,
          roundsCompleted,
          completedRoundNumbers,
          totalScore,
          totalToPar,
        };
      });

    return { success: true, data: qualifiers };

  } catch {
    return {
      success: false,
      error: 'Failed to fetch qualifiers. Please try again.'
    };
  }
}
const observedGetPlayerQualifiers = withAdminObserved(
  'getPlayerQualifiers',
  { sport: 'golf', feature: 'my_qualifiers' },
  getPlayerQualifiersImpl,
);
export async function getPlayerQualifiers(): Promise<ActionResult<PlayerQualifierInfo[]>> {
  return observedGetPlayerQualifiers();
}
/**
 * Get the next available round number for a qualifier
 */
async function getNextQualifierRoundNumberImpl(
  qualifierId: string
): Promise<ActionResult<{
  nextRoundNumber: number;
  availableRounds: number[];
  /** A started qualifier round is never replaced by a blank new-round save. */
  activeRoundId?: string;
}>> {
  try {
    const supabase = await createClient();

    // Resilient, not raw — a transient GoTrue blip must not read as a
    // sign-out (A5, 2026-09-02). See getUserResilient's header.
    const { user } = await getUserResilient(supabase);
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get player record
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) {
      return { success: false, error: 'Player profile not found' };
    }

    // Verify player is entered in this qualifier
    const { data: entry } = await supabase
      .from('golf_qualifier_entries')
      .select('id')
      .eq('qualifier_id', qualifierId)
      .eq('player_id', player.id)
      .single();

    if (!entry) {
      return { success: false, error: 'You are not entered in this qualifier' };
    }

    // Verify qualifier exists and remains coach-open. Scheduled dates never
    // close a qualifier, but an explicit coach completion must stop stale
    // direct links before they can start another round.
    const { data: qualifier } = await supabase
      .from('golf_qualifiers')
      .select('id, num_rounds, status')
      .eq('id', qualifierId)
      .single();

    if (!qualifier) {
      return { success: false, error: 'Qualifier not found' };
    }
    // REMOVED 2026-08-31 alongside the submit-side check above. Opening only
    // submission would have been half a fix: a round has to be STARTED before
    // it can be submitted, so this guard would have become the new dead end
    // one step earlier, with a message about the coach closing the qualifier
    // rather than anything the player could act on.

    // A started qualifier round owns its number until it is submitted or
    // explicitly discarded. Returning it here lets the client resume the
    // durable parent instead of creating a second parent or overwriting the
    // existing scorecard with a blank setup payload.
    //
    // Shared with savePartialRound's no-id derivation (A2, 2026-09-02) so the
    // two paths cannot disagree about what "the next round number" means —
    // see resolveQualifierRoundNumber's own header for why an in-progress
    // round must be returned for reuse rather than treated as available.
    const derived = await resolveQualifierRoundNumber(supabase, {
      qualifierId,
      playerId: player.id,
      numRounds: qualifier.num_rounds ?? 1,
    });

    if (!derived.success) {
      return { success: false, error: derived.error, code: derived.code };
    }
    if (derived.activeRoundId) {
      return {
        success: true,
        data: {
          nextRoundNumber: derived.roundNumber,
          availableRounds: [],
          activeRoundId: derived.activeRoundId,
        },
      };
    }

    return {
      success: true,
      data: { nextRoundNumber: derived.roundNumber, availableRounds: [derived.roundNumber] }
    };

  } catch {
    return {
      success: false,
      error: 'Failed to get round number. Please try again.'
    };
  }
}
const observedGetNextQualifierRoundNumber = withAdminObserved(
  'getNextQualifierRoundNumber',
  { sport: 'golf', feature: 'qualifiers' },
  getNextQualifierRoundNumberImpl,
);
export async function getNextQualifierRoundNumber(
  qualifierId: string
): Promise<ActionResult<{
  nextRoundNumber: number;
  availableRounds: number[];
  activeRoundId?: string;
}>> {
  return observedGetNextQualifierRoundNumber(qualifierId);
}
/**
 * Get qualifier leaderboard (accessible to both coaches and players)
 */
export interface QualifierLeaderboardEntry {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  position: number;
  isTied: boolean;
  roundsCompleted: number;
  totalScore: number;
  totalToPar: number;
  averageScore: number | null;
  roundScores: Array<{
    roundNumber: number;
    score: number;
    toPar: number;
  }>;
}
export interface QualifierLeaderboardData {
  qualifier: {
    id: string;
    name: string;
    description: string | null;
    courseName: string | null;
    startDate: string;
    endDate: string | null;
    status: string;
    spotsAvailable: number | null;
    entryDeadline: string | null;
    rules: string | null;
  };
  leaderboard: QualifierLeaderboardEntry[];
  isPlayerEntered: boolean;
  currentPlayerId: string | null;
}
async function getQualifierLeaderboardImpl(
  qualifierId: string
): Promise<ActionResult<QualifierLeaderboardData>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in' };
    }

    // Get qualifier details
    const { data: qualifier, error: qualifierError } = await supabase
      .from('golf_qualifiers')
      .select('*')
      .eq('id', qualifierId)
      .single();

    // PGRST116 is PostgREST's "no rows" for .single(); that one really is
    // "not found". Every other error is a read that failed, and telling a
    // coach their qualifier doesn't exist because a connection dropped sends
    // them looking for data loss that never happened.
    if (qualifierError && (qualifierError as { code?: string }).code !== 'PGRST116') {
      await logServerError(
        `[getQualifierLeaderboard] qualifier read failed: ${describeError(qualifierError)}`,
        { action: 'getQualifierLeaderboard.qualifier', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load this qualifier. Please try again." };
    }

    if (!qualifier) {
      return { success: false, error: 'Qualifier not found' };
    }

    // Get current player (if exists).
    //
    // "No row" and "the read failed" are NOT the same answer, and this used to
    // discard the error and treat both as no row. A coach legitimately has no
    // golf_players row, so null is expected — but when the query itself fails,
    // `isPlayerEntered` below would be computed against a player id we never
    // learned, and the page would tell an entered player they hadn't entered
    // and offer them the Enter button again.
    const { data: currentPlayer, error: currentPlayerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentPlayerError) {
      await logServerError(
        `[getQualifierLeaderboard] player lookup failed: ${describeError(currentPlayerError)}`,
        { action: 'getQualifierLeaderboard.playerLookup', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load this qualifier. Please try again." };
    }

    // Get all entries with player info
    const { data: entries, error: entriesError } = await supabase
      .from('golf_qualifier_entries')
      .select(`
        player_id,
        player:golf_players(
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('qualifier_id', qualifierId);

    // A failed read is not an empty field. Without this branch the early
    // return below answers `success: true, leaderboard: []` — the exact same
    // payload as a qualifier nobody has entered yet — so an RLS denial or a
    // dropped connection rendered as "no entries yet" on a full field.
    if (entriesError) {
      await logServerError(
        `[getQualifierLeaderboard] entries read failed: ${describeError(entriesError)}`,
        { action: 'getQualifierLeaderboard.entries', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load the field for this qualifier. Please try again." };
    }

    if (!entries || entries.length === 0) {
      return {
        success: true,
        data: {
          qualifier: {
            id: qualifier.id,
            name: qualifier.name,
            description: qualifier.description,
            courseName: qualifier.course_name,
            startDate: qualifier.start_date,
            endDate: qualifier.end_date,
            status: qualifier.status || 'upcoming',
            spotsAvailable: qualifier.spots_available,
            entryDeadline: qualifier.entry_deadline,
            rules: qualifier.rules,
          },
          leaderboard: [],
          isPlayerEntered: false,
          currentPlayerId: currentPlayer?.id || null,
        }
      };
    }

    // Get all rounds for this qualifier
    const roundsResult = await supabase
      .from('golf_rounds')
      .select('player_id, qualifier_round_number, total_score, score_to_par')
      .eq('qualifier_id', qualifierId)
      .eq('status', 'completed');

    // This one is the most dangerous of the three to swallow. Every downstream
    // calculation reads `rounds || []`, so a failed read doesn't blank the
    // page — it produces a complete, confident leaderboard in which nobody has
    // posted a score. Coaches make lineup decisions off this screen.
    if (roundsResult.error) {
      await logServerError(
        `[getQualifierLeaderboard] rounds read failed: ${describeError(roundsResult.error)}`,
        { action: 'getQualifierLeaderboard.rounds', featureArea: 'qualifiers', userId: user.id },
      );
      return { success: false, error: "Couldn't load scores for this qualifier. Please try again." };
    }

    const rounds = (roundsResult.data as unknown) as Array<{
      player_id: string;
      qualifier_round_number: number | null;
      total_score: number | null;
      score_to_par: number | null;
    }> | null;

    // Build leaderboard
    type LeaderboardEntry = { player_id: string; player: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null };
    const leaderboard: QualifierLeaderboardEntry[] = (entries as unknown as LeaderboardEntry[])
      .filter((e) => e.player && typeof e.player === 'object' && !('error' in e.player))
      .map((entry) => {
        const player = entry.player as {
          id: string;
          first_name: string;
          last_name: string;
          avatar_url: string | null;
        };

        const playerRounds = (rounds || [])
          .filter((r) => r.player_id === entry.player_id)
          .sort((a, b) => (a.qualifier_round_number || 0) - (b.qualifier_round_number || 0));

        const totalScore = playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
        const totalToPar = playerRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0);
        const roundsCompleted = playerRounds.length;
        // Per-round average for this qualifier (display only — ranking is by
        // cumulative to-par below). null, not 0, when the player has no
        // completed rounds so the UI renders "—" rather than a fake "0.0".
        const averageScore = roundsCompleted > 0 ? totalScore / roundsCompleted : null;

        const roundScores = playerRounds.map((r) => ({
          roundNumber: r.qualifier_round_number || 0,
          score: r.total_score || 0,
          toPar: r.score_to_par || 0,
        }));

        return {
          playerId: entry.player_id,
          playerName: `${player.first_name} ${player.last_name}`,
          avatarUrl: player.avatar_url,
          position: 0, // Will be set after sorting
          isTied: false,
          roundsCompleted,
          totalScore,
          totalToPar,
          averageScore,
          roundScores,
        };
      })
      // College qualifying ranks by CUMULATIVE TO-PAR (lower is better) — to-par
      // normalizes rounds played on different-par setups across the window.
      // Players with no completed round sink to the bottom (never rank "even").
      // Ties broken by raw total strokes, then by more rounds completed.
      .sort((a, b) => {
        const aScored = a.roundsCompleted > 0;
        const bScored = b.roundsCompleted > 0;
        if (aScored !== bScored) return aScored ? -1 : 1;
        const aPar = a.totalToPar ?? Infinity;
        const bPar = b.totalToPar ?? Infinity;
        if (aPar !== bPar) return aPar - bPar;
        if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
        return b.roundsCompleted - a.roundsCompleted;
      });

    // Assign positions and mark ties
    let currentPosition = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i]!;

      if (i > 0) {
        const prevEntry = leaderboard[i - 1]!;
        // Ties are on cumulative to-par (the ranking key) — and only between
        // players who have actually posted a round. Two no-score players don't
        // "tie for last"; they're both unranked.
        const bothScored = entry.roundsCompleted > 0 && prevEntry.roundsCompleted > 0;
        if (bothScored && entry.totalToPar === prevEntry.totalToPar && entry.totalScore === prevEntry.totalScore) {
          entry.position = prevEntry.position;
          entry.isTied = true;
          prevEntry.isTied = true;
        } else {
          entry.position = currentPosition;
        }
      } else {
        entry.position = currentPosition;
      }
      currentPosition++;
    }

    // Check if current player is entered
    const isPlayerEntered = currentPlayer
      ? entries.some(e => e.player_id === currentPlayer.id)
      : false;

    return {
      success: true,
      data: {
        qualifier: {
          id: qualifier.id,
          name: qualifier.name,
          description: qualifier.description,
          courseName: qualifier.course_name,
          startDate: qualifier.start_date,
          endDate: qualifier.end_date,
          status: qualifier.status || 'upcoming',
          spotsAvailable: qualifier.spots_available,
          entryDeadline: qualifier.entry_deadline,
          rules: qualifier.rules,
        },
        leaderboard,
        isPlayerEntered,
        currentPlayerId: currentPlayer?.id || null,
      }
    };

  } catch {
    return {
      success: false,
      error: 'Failed to fetch leaderboard. Please try again.'
    };
  }
}
const observedGetQualifierLeaderboard = withAdminObserved(
  'getQualifierLeaderboard',
  { sport: 'golf', feature: 'qualifiers' },
  getQualifierLeaderboardImpl,
);
export async function getQualifierLeaderboard(
  qualifierId: string
): Promise<ActionResult<QualifierLeaderboardData>> {
  return observedGetQualifierLeaderboard(qualifierId);
}
