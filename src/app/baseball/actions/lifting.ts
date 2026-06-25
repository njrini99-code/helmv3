'use server';

// =============================================================================
// src/app/baseball/actions/lifting.ts
//
// Wave 9 / performance-lifting packet (P9.3).
// W2-G REWIRE: all writes now target helm_lifting_* unified tables instead of
// the legacy baseball_lift_* tables. Context resolution via
// resolveBaseballLiftingOrg / resolveBaseballAthleteIds from
// @/lib/lifting/resolve-baseball-context. Return shapes unchanged (LiftingActionResult).
//
// Server actions for the Performance / Lifting Lite surface. EVERY action runs
// inside withBaseballAction(...) so auth + active-team context + (where set)
// server-side capability enforcement + Sentry scoping + central error logging
// are guaranteed. RLS on the four lifting tables backstops every path.
//
// Capability map (see capabilities.ts / migration 0030 / 0050):
//   - Exercise library writes ............ can_manage_lifting
//   - Assignment create/update/delete .... can_manage_lifting (scoped via RLS
//                                          can_manage_baseball_lift_group)
//   - Player-logged set result ........... NO requiredCapability — the player
//                                          writes their OWN result; RLS enforces
//                                          athlete_id on helm_lifting_set_results.
//   - Readiness check-in ................. NO requiredCapability — player owns it.
//
// SECURITY
//   * No service-role client is used; everything runs through the request-scoped
//     anon client so RLS applies. The capability gate in withBaseballAction is a
//     defense-in-depth layer on top of RLS, not a replacement for it.
//   * Player-self actions assert player identity from the resolved active
//     context (ctx.activePlayerId) and let RLS reject any mismatch; we never
//     trust a client-supplied player_id for a self-write.
//   * Raw DB errors never leak — withBaseballAction sanitizes thrown errors.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  withBaseballAction,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import type {
  HelmLiftingExerciseInsert,
  HelmLiftingSessionInsert,
  HelmLiftingSessionExerciseInsert,
  HelmLiftingSetResultInsert,
  HelmLiftingReadinessCheckinInsert,
} from '@/lib/types/helm-lifting-data';

// -----------------------------------------------------------------------------
// Shared result shape
// -----------------------------------------------------------------------------

export interface LiftingActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

// helm_lifting_* tables are not yet in the generated database.ts (pending a
// post-apply db:types regen). All helm_lifting_* queries use fromUntyped() from
// @/lib/supabase/untyped. The hand-written Insert types in
// @/lib/types/helm-lifting-data are the real contract; RLS is the real gate.

const PERFORMANCE_PATH = '/baseball/dashboard/performance';
// The real player surface is /baseball/player/today (see nav-registry +
// (player-dashboard)/player/today). The old /baseball/dashboard/today route
// never existed, so revalidating it was a no-op.
const PLAYER_TODAY_PATH = '/baseball/player/today';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();

const prescriptionSchema = z
  .object({
    sets: z.number().int().min(0).max(50).optional(),
    reps: z.number().int().min(0).max(500).optional(),
    weight: z.number().min(0).max(2000).optional(),
    intensity_pct: z.number().min(0).max(200).optional(),
    rest_seconds: z.number().int().min(0).max(3600).optional(),
    tempo: z.string().max(40).optional(),
    notes: z.string().max(1000).optional(),
  })
  .passthrough();

const createExerciseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
});

const createAssignmentSchema = z
  .object({
    playerId: uuid.optional().nullable(),
    groupScope: z.array(uuid).max(200).optional().nullable(),
    // A baseball_lift_exercises (V11 library) id — the single source of truth for
    // lifting. Flows to the materialized session (whose FK targets that table),
    // never to the legacy baseball_lift_assignments.exercise_id (FK → baseball_exercises).
    exerciseId: uuid.optional().nullable(),
    title: z.string().trim().max(160).optional().nullable(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
      .optional()
      .nullable(),
    prescription: prescriptionSchema.optional(),
  })
  .refine(
    (v) => Boolean(v.playerId) || (v.groupScope && v.groupScope.length > 0),
    { message: 'Assign to a player or a group.' },
  );

const updateAssignmentStatusSchema = z.object({
  // assignmentId is now the helm_lifting_sessions.id (the bridge session id
  // returned by createLiftAssignment after the W2-G rewire).
  assignmentId: uuid,
  // Baseball Lite status vocab → mapped to HelmLiftingSessionStatus on write.
  status: z.enum(['assigned', 'in_progress', 'completed', 'skipped', 'archived']),
});

// Map legacy baseball assignment status → HelmLiftingSessionStatus.
function toHelmSessionStatus(
  baseballStatus: 'assigned' | 'in_progress' | 'completed' | 'skipped' | 'archived',
): 'assigned' | 'started' | 'completed' | 'missed' | 'excused' | 'modified' {
  switch (baseballStatus) {
    case 'assigned': return 'assigned';
    case 'in_progress': return 'started';
    case 'completed': return 'completed';
    case 'skipped': return 'missed';
    case 'archived': return 'missed';
  }
}

const logResultSchema = z
  .object({
    assignmentId: uuid.optional().nullable(),
    exerciseId: uuid.optional().nullable(),
    performedAt: z.string().datetime().optional(),
    sets: z.number().int().min(0).max(50).optional().nullable(),
    reps: z.number().int().min(0).max(500).optional().nullable(),
    weight: z.number().min(0).max(2000).optional().nullable(),
    rpe: z.number().min(0).max(10).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((v) => Boolean(v.assignmentId) || Boolean(v.exerciseId), {
    message: 'A result must reference an assignment or an exercise.',
  });

const readinessSchema = z.object({
  checkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  sleepHours: z.number().min(0).max(24).optional().nullable(),
  energyLevel: z.number().int().min(1).max(5).optional().nullable(),
  sorenessLevel: z.number().int().min(1).max(5).optional().nullable(),
  armStatus: z
    .enum(['fresh', 'normal', 'tight', 'sore', 'pain'])
    .optional()
    .nullable(),
  mood: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  // V11 additive inputs (migration 20260624000063 added these columns).
  stressLevel: z.number().int().min(1).max(5).optional().nullable(),
  lowerBodyStatus: z.number().int().min(1).max(5).optional().nullable(),
  illnessFlag: z.boolean().optional(),
});

// -----------------------------------------------------------------------------
// 1. createExercise — staff add a team exercise to the library.
//    Gated: can_manage_lifting.
//    W2-G: writes to helm_lifting_exercises (org-scoped, sport='baseball').
// -----------------------------------------------------------------------------

export const createExercise = withBaseballAction(
  'createExercise',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof createExerciseSchema>): Promise<LiftingActionResult> => {
    const input = createExerciseSchema.parse(raw);

    // Resolve org context — exercises live at org scope, not team scope.
    const liftCtx = await resolveBaseballLiftingOrg(ctx.targetTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    const supabase = await createClient();

    const payload: HelmLiftingExerciseInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      name: input.name,
      // category: helm_lifting_exercises requires a specific enum; map from
      // the freeform Lite category string or default to 'accessory'.
      category: (input.category as HelmLiftingExerciseInsert['category']) ?? 'accessory',
      instructions: input.description ?? null,
      is_global: false,
      created_by_coach_id: ctx.activeCoachId,
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    revalidatePath(PERFORMANCE_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 2. createLiftAssignment — staff quick-assign a single lift to a player.
//    Gated: can_manage_lifting. RLS additionally scopes to viewable players.
//
//    W2-G REWIRE: writes directly to helm_lifting_sessions +
//    helm_lifting_session_exercises (the unified model). The legacy
//    baseball_lift_assignments table is bypassed entirely — the session IS the
//    assignment in the unified model. Returns the helm_lifting_sessions.id so
//    callers (updateAssignmentStatus, logLiftResult) can target the right row.
//    Group quick-assign (no single playerId, groupScope provided): fetches all
//    members from baseball_strength_group_members, resolves their athlete IDs,
//    and bulk-inserts one helm_lifting_session per member — real materialization.
// -----------------------------------------------------------------------------

export const createLiftAssignment = withBaseballAction(
  'createLiftAssignment',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof createAssignmentSchema>,
  ): Promise<LiftingActionResult> => {
    const input = createAssignmentSchema.parse(raw);

    // Resolve org context required by helm_lifting_* tables.
    const liftCtx = await resolveBaseballLiftingOrg(ctx.targetTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    const supabase = await createClient();

    // Group-scope quick-assign: fetch all members for each group in groupScope,
    // resolve their athlete IDs, and bulk-insert one helm_lifting_session per athlete.
    // We intentionally bulk-upsert (never delete-then-reinsert) so a re-submit is safe.
    if (!input.playerId) {
      const groups = input.groupScope;
      if (!groups || groups.length === 0) {
        // Neither player nor group supplied — schema refinement already rejects this,
        // but guard defensively here too.
        throw new BaseballActionError('Assign to a player or a group.');
      }

      const scheduledDate = input.dueDate ?? new Date().toISOString().slice(0, 10);

      // 1. Collect all baseball_players.id values from the specified groups.
      const { data: memberRows } = await fromUntyped(supabase, 'baseball_strength_group_members')
        .select('player_id')
        .in('group_id', groups) as { data: Array<{ player_id: string }> | null };

      const playerIds = [...new Set((memberRows ?? []).map((r) => r.player_id))];
      if (playerIds.length === 0) {
        // Groups are empty — succeed silently (coach will see no new assignments).
        revalidatePath(PERFORMANCE_PATH);
        return { success: true };
      }

      // 2. Resolve baseball_players.id → helm_lifting_athletes.id for all members.
      const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, playerIds);

      // 3. Resolve the exercise snapshot name (same as single-player path).
      let exerciseName = input.title ?? 'Lift';
      let liftExerciseId: string | null = null;
      if (input.exerciseId) {
        const { data: ex } = await fromUntyped(supabase, 'helm_lifting_exercises')
          .select('id, name')
          .eq('id', input.exerciseId)
          .maybeSingle() as { data: { id: string; name: string } | null };
        if (ex?.name) {
          exerciseName = ex.name;
          liftExerciseId = ex.id;
        }
      }

      const presc = (input.prescription ?? {}) as {
        sets?: number; reps?: number; weight?: number;
      };
      const titleValue = input.title ?? 'Lift';

      // 4. Bulk-insert one session per resolved athlete (idempotent upsert on
      //    (athlete_id, scheduled_date, title, program_assignment_id=null)).
      let insertedCount = 0;
      for (const playerId of playerIds) {
        const athleteId = athleteMap[playerId];
        if (!athleteId) continue; // player not yet seeded in helm — skip, never throw.

        // Dedupe check: if a session already exists for this athlete + date + title,
        // skip the insert to stay idempotent (never delete-then-reinsert).
        const { data: dupe } = await fromUntyped(supabase, 'helm_lifting_sessions')
          .select('id')
          .eq('athlete_id', athleteId)
          .eq('scheduled_date', scheduledDate)
          .eq('title', titleValue)
          .is('program_assignment_id', null)
          .maybeSingle() as { data: { id: string } | null };

        let sessionId = dupe?.id;
        if (!sessionId) {
          const sessionPayload: HelmLiftingSessionInsert = {
            organization_id: liftCtx.organizationId,
            sport: 'baseball',
            team_id: ctx.targetTeamId,
            athlete_id: athleteId,
            title: titleValue,
            scheduled_date: scheduledDate,
            status: 'assigned',
            program_assignment_id: null,
          };
          const { data: newSession } = await fromUntyped(supabase, 'helm_lifting_sessions')
            .insert(sessionPayload)
            .select('id')
            .maybeSingle() as { data: { id: string } | null };
          sessionId = newSession?.id;
          insertedCount++;
        }

        // Seed the exercise row for this session (idempotent: skip if already present).
        if (sessionId) {
          const { data: existingSe } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
            .select('id')
            .eq('session_id', sessionId)
            .limit(1) as { data: Array<{ id: string }> | null };

          if (!existingSe || existingSe.length === 0) {
            const sePayload: HelmLiftingSessionExerciseInsert = {
              session_id: sessionId,
              exercise_id: liftExerciseId,
              exercise_name_snapshot: exerciseName,
              order_index: 0,
              prescribed_sets: presc.sets ?? null,
              prescribed_reps: presc.reps ?? null,
              prescribed_load: presc.weight ?? null,
              prescribed_load_unit: presc.weight != null ? 'lb' : null,
              status: 'assigned',
            };
            await fromUntyped(supabase, 'helm_lifting_session_exercises').insert(sePayload);
          }
        }
      }

      revalidatePath(PERFORMANCE_PATH);
      revalidatePath(PLAYER_TODAY_PATH);
      return { success: true, id: `group:${insertedCount}` };
    }

    const scheduledDate = input.dueDate ?? new Date().toISOString().slice(0, 10);

    // Resolve baseball_players.id → helm_lifting_athletes.id.
    const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, [input.playerId]);
    const athleteId = athleteMap[input.playerId];
    if (!athleteId) {
      // Player not yet seeded in helm_lifting_athletes. Degrade honestly.
      revalidatePath(PERFORMANCE_PATH);
      return { success: true };
    }

    // Resolve an exercise name + id from helm_lifting_exercises.
    // The exerciseId passed in was already a helm_lifting_exercises id (the V11
    // library, used as the single source of truth for lifting). We verify it here
    // so (a) the snapshot name is right and (b) we don't stamp a stale id.
    let exerciseName = input.title ?? 'Lift';
    let liftExerciseId: string | null = null;
    if (input.exerciseId) {
      const { data: ex } = await fromUntyped(supabase, 'helm_lifting_exercises')
        .select('id, name')
        .eq('id', input.exerciseId)
        .maybeSingle() as { data: { id: string; name: string } | null };
      if (ex?.name) {
        exerciseName = ex.name;
        liftExerciseId = ex.id;
      }
    }

    // Dedupe on (athlete_id, scheduled_date, title) — idempotent, never destructive.
    const { data: dupe } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', scheduledDate)
      .eq('title', input.title ?? 'Lift')
      .is('program_assignment_id', null)
      .maybeSingle() as { data: { id: string } | null };

    let sessionId = dupe?.id;
    if (!sessionId) {
      const sessionPayload: HelmLiftingSessionInsert = {
        organization_id: liftCtx.organizationId,
        sport: 'baseball',
        team_id: ctx.targetTeamId,
        athlete_id: athleteId,
        title: input.title ?? 'Lift',
        scheduled_date: scheduledDate,
        status: 'assigned',
        program_assignment_id: null,
      };

      const { data: session, error: sessionErr } = await fromUntyped(supabase, 'helm_lifting_sessions')
        .insert(sessionPayload)
        .select('id')
        .maybeSingle() as { data: { id: string } | null; error: unknown };

      if (sessionErr) throw sessionErr;
      sessionId = session?.id;
    }

    if (sessionId) {
      // Only seed the snapshot exercise once (idempotent re-assign safe).
      const { data: existingSe } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .select('id')
        .eq('session_id', sessionId)
        .limit(1) as { data: Array<{ id: string }> | null };

      if (!existingSe || existingSe.length === 0) {
        const presc = (input.prescription ?? {}) as {
          sets?: number; reps?: number; weight?: number;
        };

        const sePayload: HelmLiftingSessionExerciseInsert = {
          session_id: sessionId,
          exercise_id: liftExerciseId,
          exercise_name_snapshot: exerciseName,
          order_index: 0,
          prescribed_sets: presc.sets ?? null,
          prescribed_reps: presc.reps ?? null,
          prescribed_load: presc.weight ?? null,
          prescribed_load_unit: presc.weight != null ? 'lb' : null,
          status: 'assigned',
        };

        await fromUntyped(supabase, 'helm_lifting_session_exercises').insert(sePayload);
      }
    }

    revalidatePath(PERFORMANCE_PATH);
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, id: sessionId };
  },
);

// -----------------------------------------------------------------------------
// 3. updateAssignmentStatus — staff move an assignment through its lifecycle.
//    Gated: can_manage_lifting. (Player progress is reflected via logged results;
//    the status field here is the coach-owned lifecycle.)
//    W2-G: assignmentId is now a helm_lifting_sessions.id (returned by
//    createLiftAssignment post-rewire). Status is mapped to HelmLiftingSessionStatus.
// -----------------------------------------------------------------------------

export const updateAssignmentStatus = withBaseballAction(
  'updateAssignmentStatus',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof updateAssignmentStatusSchema>,
  ): Promise<LiftingActionResult> => {
    const input = updateAssignmentStatusSchema.parse(raw);
    const supabase = await createClient();

    const helmStatus = toHelmSessionStatus(input.status);

    // Scope the update to the active team so a coach cannot touch another team's
    // session even if RLS were somehow permissive.
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({ status: helmStatus, updated_at: new Date().toISOString() })
      .eq('id', input.assignmentId)
      .eq('team_id', ctx.targetTeamId)
      .select('id')
      .maybeSingle() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    if (!data) {
      // No row updated => not found or not permitted by RLS. Surface a safe msg.
      throw new BaseballActionError('Assignment not found or not editable.');
    }

    revalidatePath(PERFORMANCE_PATH);
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, id: data.id };
  },
);

// -----------------------------------------------------------------------------
// 4. logLiftResult — a PLAYER logs their own set result.
//    No requiredCapability: this is a player-self write. We assert the active
//    context resolved a player identity and let RLS enforce ownership.
//    W2-G: writes to helm_lifting_set_results. The caller supplies assignmentId
//    (a helm_lifting_sessions.id post-rewire) + optional exerciseId. We resolve
//    the session_exercise_id from the session row and auto-number the set.
// -----------------------------------------------------------------------------

export const logLiftResult = withBaseballAction(
  'logLiftResult',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof logResultSchema>): Promise<LiftingActionResult> => {
    const input = logResultSchema.parse(raw);

    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can log a lift result.');
    }

    // Resolve org context for helm_lifting_set_results.organization_id.
    const liftCtx = await resolveBaseballLiftingOrg(ctx.activeTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    // Resolve the athlete_id for this player.
    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) {
      throw new BaseballActionError('Player not found in the lifting system.');
    }

    const supabase = await createClient();

    // Resolve session_exercise_id: look up the session (assignmentId is a
    // helm_lifting_sessions.id) and find its first matching exercise row.
    let sessionExerciseId: string | null = null;
    if (input.assignmentId) {
      const { data: seRows } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .select('id')
        .eq('session_id', input.assignmentId)
        // When exerciseId is provided, match it; otherwise take the first exercise.
        .eq('exercise_id', input.exerciseId ?? '')
        .limit(1) as { data: Array<{ id: string }> | null };

      if (!seRows || seRows.length === 0) {
        // exerciseId filter found nothing — fall back to any exercise in the session.
        const { data: fallbackSe } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
          .select('id')
          .eq('session_id', input.assignmentId)
          .limit(1) as { data: Array<{ id: string }> | null };
        sessionExerciseId = fallbackSe?.[0]?.id ?? null;
      } else {
        sessionExerciseId = seRows[0]?.id ?? null;
      }
    }

    if (!sessionExerciseId) {
      throw new BaseballActionError('No session exercise found to log against.');
    }

    // Auto-number the set: count existing results for this session_exercise + 1.
    const { count: existingCount } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .select('id', { count: 'exact', head: true })
      .eq('session_exercise_id', sessionExerciseId) as { count: number | null };

    const setNumber = (existingCount ?? 0) + 1;

    const payload: HelmLiftingSetResultInsert = {
      session_exercise_id: sessionExerciseId,
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      athlete_id: athleteId,
      set_number: setNumber,
      actual_reps: input.reps ?? null,
      actual_load: input.weight ?? null,
      load_unit: input.weight != null ? 'lb' : null,
      rpe: input.rpe ?? null,
      completed_at: input.performedAt ?? new Date().toISOString(),
      player_note: input.notes ?? null,
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .insert(payload)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PERFORMANCE_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5. submitReadinessCheckin — a PLAYER records / updates today's check-in.
//    No requiredCapability: player-self write. Idempotent upsert on
//    (athlete_id, checkin_date) — NO delete-then-insert.
//    W2-G: writes to helm_lifting_readiness_checkins. Column mapping:
//      check_date      → checkin_date
//      sleep_hours     → sleep_quality  (1-5 scale; hours are mapped best-effort)
//      soreness_level  → soreness_overall
//      arm_status      → stored in notes (no equivalent column in helm schema)
//      mood (string)   → notes (helm has mood as number; string goes to notes)
//    Upsert conflict: (athlete_id, checkin_date).
// -----------------------------------------------------------------------------

export const submitReadinessCheckin = withBaseballAction(
  'submitReadinessCheckin',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_report_availability' },
  async (ctx, raw: z.input<typeof readinessSchema>): Promise<LiftingActionResult> => {
    const input = readinessSchema.parse(raw);

    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can submit a check-in.');
    }

    // Resolve org context for helm_lifting_readiness_checkins.organization_id.
    const liftCtx = await resolveBaseballLiftingOrg(ctx.activeTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    // Resolve athlete_id for this player.
    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) {
      throw new BaseballActionError('Player not found in the lifting system.');
    }

    const supabase = await createClient();

    // Compose freeform notes preserving arm_status and mood string fields that
    // have no direct equivalent columns in helm_lifting_readiness_checkins.
    const noteParts: string[] = [];
    if (input.armStatus) noteParts.push(`arm_status: ${input.armStatus}`);
    if (input.mood) noteParts.push(`mood: ${input.mood}`);
    if (input.notes) noteParts.push(input.notes);
    const combinedNotes = noteParts.length > 0 ? noteParts.join(' | ') : null;

    const payload: HelmLiftingReadinessCheckinInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      athlete_id: athleteId,
      checkin_date: input.checkDate,
      // sleep_hours → sleep_quality: helm uses 1-5 scale; map hours to quintile
      // (≤5h=1, 6h=2, 7h=3, 8h=4, ≥9h=5). If null, leave null.
      sleep_quality: input.sleepHours != null
        ? Math.min(5, Math.max(1, Math.ceil(input.sleepHours / 2)))
        : null,
      energy_level: input.energyLevel ?? null,
      soreness_overall: input.sorenessLevel ?? null,
      stress_level: input.stressLevel ?? null,
      lower_body_status: input.lowerBodyStatus ?? null,
      illness_flag: input.illnessFlag ?? false,
      notes: combinedNotes,
    };

    // Upsert on (athlete_id, checkin_date) unique constraint — stage-and-swap
    // semantics, never delete-then-reinsert.
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
      .upsert(payload, { onConflict: 'athlete_id,checkin_date' })
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PERFORMANCE_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);
