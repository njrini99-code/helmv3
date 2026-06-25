'use server';

// =============================================================================
// src/app/baseball/actions/lifting.ts
//
// Wave 9 / performance-lifting packet (P9.3).
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
//                                          player_id = get_my_baseball_player_id.
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
import {
  withBaseballAction,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import type {
  BaseballExerciseInsert,
  BaseballLiftAssignmentInsert,
  BaseballLiftResultInsert,
  BaseballReadinessCheckinInsert,
} from '@/lib/types/baseball-lifting';

// -----------------------------------------------------------------------------
// Shared result shape
// -----------------------------------------------------------------------------

export interface LiftingActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

// The four lifting tables ship via migration 20260624000061 and are NOT in the
// generated database.ts (we cannot db:types regen without a live apply). Cast the
// query-builder for these new tables — the hand-written Row/Insert types in
// @/lib/types/baseball-lifting are the real contract; RLS is the real gate.
// Mirrors the established baseball pattern (see command-center/page.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedBuilder = any;

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
  assignmentId: uuid,
  status: z.enum(['assigned', 'in_progress', 'completed', 'skipped', 'archived']),
});

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
// -----------------------------------------------------------------------------

export const createExercise = withBaseballAction(
  'createExercise',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof createExerciseSchema>): Promise<LiftingActionResult> => {
    const input = createExerciseSchema.parse(raw);
    const supabase = await createClient();

    const payload: BaseballExerciseInsert = {
      team_id: ctx.targetTeamId,
      name: input.name,
      category: input.category ?? null,
      description: input.description ?? null,
      is_global: false,
      created_by_coach_id: ctx.activeCoachId,
    };

    const { data, error } = await (supabase as UntypedBuilder).from('baseball_exercises')
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
//    UNIFIED STORAGE BRIDGE: a quick-assignment is ALSO materialized into the
//    V11 baseball_lift_sessions model so it reaches the SAME surfaces the V11
//    program builder's publishLiftDay feeds — the player Today card, the player
//    lift route (getPlayerLiftHome), and the CoachHelm engine (loaders-v10).
//    Without this, a quick-assigned lift wrote only the legacy
//    baseball_lift_assignments table that nothing reads anymore, recreating the
//    very island this fix closes. The assignment row is kept for backward compat
//    + the coach's Lifting-Lite list; the session is the row everything consumes.
//    Player-group quick-assign (no single player) writes only the assignment row
//    (multi-player materialization is the V11 program builder's job) — the action
//    degrades honestly rather than guessing a roster here.
// -----------------------------------------------------------------------------

export const createLiftAssignment = withBaseballAction(
  'createLiftAssignment',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof createAssignmentSchema>,
  ): Promise<LiftingActionResult> => {
    const input = createAssignmentSchema.parse(raw);
    const supabase = await createClient();
    const db = supabase as UntypedBuilder;

    // NOTE on exercise identity: the dashboard now picks from the V11
    // baseball_lift_exercises library (the single source of truth for lifting —
    // V11 depth rule). That id is NOT valid for the legacy
    // baseball_lift_assignments.exercise_id column, whose FK targets the Lite
    // baseball_exercises table (migration 0061 L82). Writing a V11 id there would
    // violate that FK. We therefore leave the legacy FK column NULL (the Lite
    // assignment row is kept only for backward-compat + the coach's Lite list,
    // which renders from the title) and carry the V11 exercise id into the
    // materialized session, whose exercise_id FKs to baseball_lift_exercises —
    // the table everything actually reads.
    const payload: BaseballLiftAssignmentInsert = {
      team_id: ctx.targetTeamId,
      player_id: input.playerId ?? null,
      group_scope: input.groupScope ?? null,
      assigned_by_coach_id: ctx.activeCoachId,
      exercise_id: null,
      title: input.title ?? null,
      due_date: input.dueDate ?? null,
      prescription: (input.prescription ?? {}) as BaseballLiftAssignmentInsert['prescription'],
      status: 'assigned',
    };

    const { data, error } = await db
      .from('baseball_lift_assignments')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;
    const assignmentId = (data as { id: string }).id;

    // Bridge: materialize a single-player session so this quick-assign shows up
    // on Today + in the lift route + to the engine (same model as publishLiftDay).
    // Best-effort + non-destructive (upsert): a bridge failure must NOT roll back
    // the assignment the coach just made, so we swallow it and let the coach's
    // list still reflect the assignment.
    if (input.playerId) {
      try {
        const presc = (input.prescription ?? {}) as {
          sets?: number; reps?: number; weight?: number;
        };
        const scheduledDate = input.dueDate ?? new Date().toISOString().slice(0, 10);

        // Resolve an exercise name for the snapshot (no FK reliance on read path).
        // The exercise picked in the wired dashboard is a baseball_lift_exercises
        // (V11) row — the SAME library the program builder + session FK use. We
        // resolve it here so (a) the snapshot name is right and (b) we can prove
        // the id is a valid baseball_lift_exercises id before stamping it on the
        // session_exercise. baseball_lift_session_exercises.exercise_id FKs to
        // baseball_lift_exercises (migration 0063 L347), so writing a Lite
        // baseball_exercises id there would violate the FK — the bridge insert
        // would fail and be silently swallowed, materializing an EMPTY Today card.
        // We therefore only carry exercise_id through when it resolves in the V11
        // library; otherwise we keep the snapshot name but null the id (honest:
        // the set still logs, it just has no progression identity to PR against).
        let exerciseName = input.title ?? 'Lift';
        let liftExerciseId: string | null = null;
        if (input.exerciseId) {
          const { data: ex } = await db
            .from('baseball_lift_exercises')
            .select('id, name')
            .eq('id', input.exerciseId)
            .maybeSingle();
          if (ex?.name) {
            exerciseName = ex.name as string;
            liftExerciseId = ex.id as string;
          }
        }

        // A quick-assign is NOT a V11 program assignment, so program_assignment_id
        // stays NULL (the FK + UNIQUE(program_assignment_id, player_id) on the
        // sessions table only apply to materialized program days). We therefore
        // dedupe ourselves on (player, date, title) so an accidental double
        // quick-assign does not create two Today rows — stage-and-check, never a
        // destructive write.
        const { data: dupe } = await db
          .from('baseball_lift_sessions')
          .select('id')
          .eq('player_id', input.playerId)
          .eq('scheduled_date', scheduledDate)
          .eq('title', input.title ?? 'Lift')
          .is('program_assignment_id', null)
          .maybeSingle();

        let sessionId = (dupe as { id: string } | null)?.id;
        if (!sessionId) {
          const { data: session } = await db
            .from('baseball_lift_sessions')
            .insert({
              team_id: ctx.targetTeamId,
              player_id: input.playerId,
              title: input.title ?? 'Lift',
              scheduled_date: scheduledDate,
              status: 'assigned',
              program_assignment_id: null,
            })
            .select('id')
            .maybeSingle();
          sessionId = (session as { id: string } | null)?.id;
        }
        if (sessionId) {
          // Only seed the snapshot exercise once (idempotent re-assign safe).
          const { data: existingSe } = await db
            .from('baseball_lift_session_exercises')
            .select('id')
            .eq('session_id', sessionId)
            .limit(1);
          if (!existingSe || existingSe.length === 0) {
            await db.from('baseball_lift_session_exercises').insert({
              session_id: sessionId,
              // Only a valid baseball_lift_exercises id (resolved above) — never a
              // Lite baseball_exercises id, which would violate the FK.
              exercise_id: liftExerciseId,
              exercise_name_snapshot: exerciseName,
              order_index: 0,
              prescribed_sets: presc.sets ?? null,
              prescribed_reps: presc.reps ?? null,
              prescribed_load: presc.weight ?? null,
              prescribed_load_unit: presc.weight != null ? 'lb' : null,
              status: 'assigned',
            });
          }
        }
      } catch {
        // Bridge is best-effort; the assignment already committed. Silent by
        // design so the coach's quick-assign never appears to fail mid-flow.
      }
    }

    revalidatePath(PERFORMANCE_PATH);
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, id: assignmentId };
  },
);

// -----------------------------------------------------------------------------
// 3. updateAssignmentStatus — staff move an assignment through its lifecycle.
//    Gated: can_manage_lifting. (Player progress is reflected via logged results;
//    the status field here is the coach-owned lifecycle.)
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

    // Scope the update to the active team so a coach cannot touch another team's
    // assignment even if RLS were somehow permissive.
    const { data, error } = await (supabase as UntypedBuilder).from('baseball_lift_assignments')
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq('id', input.assignmentId)
      .eq('team_id', ctx.targetTeamId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      // No row updated => not found or not permitted by RLS. Surface a safe msg.
      throw new BaseballActionError('Assignment not found or not editable.');
    }

    revalidatePath(PERFORMANCE_PATH);
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 4. logLiftResult — a PLAYER logs their own set result.
//    No requiredCapability: this is a player-self write. We assert the active
//    context resolved a player identity and let RLS enforce ownership
//    (player_id = get_my_baseball_player_id()).
// -----------------------------------------------------------------------------

export const logLiftResult = withBaseballAction(
  'logLiftResult',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof logResultSchema>): Promise<LiftingActionResult> => {
    const input = logResultSchema.parse(raw);

    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can log a lift result.');
    }

    const supabase = await createClient();

    const payload: BaseballLiftResultInsert = {
      team_id: ctx.activeTeamId,
      player_id: ctx.activePlayerId,
      assignment_id: input.assignmentId ?? null,
      exercise_id: input.exerciseId ?? null,
      performed_at: input.performedAt ?? new Date().toISOString(),
      sets: input.sets ?? null,
      reps: input.reps ?? null,
      weight: input.weight ?? null,
      rpe: input.rpe ?? null,
      notes: input.notes ?? null,
      source: 'manual',
    };

    const { data, error } = await (supabase as UntypedBuilder).from('baseball_lift_results')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PERFORMANCE_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5. submitReadinessCheckin — a PLAYER records / updates today's check-in.
//    No requiredCapability: player-self write. Idempotent upsert on
//    (player_id, check_date) — NO delete-then-insert.
// -----------------------------------------------------------------------------

export const submitReadinessCheckin = withBaseballAction(
  'submitReadinessCheckin',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_report_availability' },
  async (ctx, raw: z.input<typeof readinessSchema>): Promise<LiftingActionResult> => {
    const input = readinessSchema.parse(raw);

    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can submit a check-in.');
    }

    const supabase = await createClient();

    const payload: BaseballReadinessCheckinInsert & {
      stress_level?: number | null;
      lower_body_status?: number | null;
      illness_flag?: boolean;
    } = {
      team_id: ctx.activeTeamId,
      player_id: ctx.activePlayerId,
      check_date: input.checkDate,
      sleep_hours: input.sleepHours ?? null,
      energy_level: input.energyLevel ?? null,
      soreness_level: input.sorenessLevel ?? null,
      arm_status: input.armStatus ?? null,
      mood: input.mood ?? null,
      notes: input.notes ?? null,
      // V11 columns (additive; safe when present in the DB).
      stress_level: input.stressLevel ?? null,
      lower_body_status: input.lowerBodyStatus ?? null,
      illness_flag: input.illnessFlag ?? false,
      updated_at: new Date().toISOString(),
    };

    // Upsert on the (player_id, check_date) unique constraint — stage-and-swap
    // semantics, never delete-then-reinsert.
    const { data, error } = await (supabase as UntypedBuilder).from('baseball_readiness_checkins')
      .upsert(payload, { onConflict: 'player_id,check_date' })
      .select('id')
      .single();

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PERFORMANCE_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);
