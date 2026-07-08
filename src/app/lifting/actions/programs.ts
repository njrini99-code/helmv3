'use server';

// =============================================================================
// src/app/lifting/actions/programs.ts
//
// Helm Lifting Lab — program CRUD + publish (materialize sessions from the
// day graph). Wraps every mutation in withLiftingAction with requireEdit:true
// so VIEW-ONLY users are rejected server-side (RLS backstops every path).
//
// publishProgram materializes helm_lifting_sessions + session_exercises rows
// for each athlete in the assignment target, mirroring the bridge logic in
// src/app/baseball/actions/lifting.ts L186-347 but pointed at helm_lifting_*
// tables and using helm_lifting_athletes.id as the subject key.
//
// NO destructive writes: all session materializations upsert on
// (program_assignment_id, athlete_id) UNIQUE index; exercises are seeded only
// when a session row is fresh (empty exercise list). Stage-and-swap for dedup.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import { logServerError } from '@/lib/server-error-logger';
import type {
  HelmLiftingProgramInsert,
  HelmLiftingProgramUpdate,
  HelmLiftingProgramAssignmentInsert,
  HelmLiftingSessionInsert,
  HelmLiftingSessionExerciseInsert,
  HelmLiftingProgramStatus,
  HelmLiftingProgramPhase,
  HelmLiftingProgramGoal,
  HelmLiftingProgramAssignmentStatus,
  HelmLiftingAssignmentTargetType,
  HelmLiftingWeekInsert,
  HelmLiftingDayInsert,
  HelmLiftingDayType,
  HelmLiftingSectionInsert,
  HelmLiftingSectionType,
  HelmLiftingPrescriptionInsert,
  HelmLiftingPrescriptionType,
  HelmLiftingExerciseInsert,
  HelmLiftingExerciseRow,
  HelmLiftingExerciseCategory,
  HelmLiftingPrimaryPattern,
  HelmLiftingBodyRegion,
  HelmLiftingUnit,
} from '@/lib/types/helm-lifting-data';

const LAB_PATH = '/lifting/dashboard/programs';

// Baseball Wave C now renders these same helm_lifting_* reads at parallel
// baseball routes (src/app/baseball/(dashboard)/dashboard/performance/...),
// so every mutation here must also bust the baseball portal's RSC cache —
// otherwise a coach editing a program from /lifting sees it update, but the
// same org's baseball staff at /baseball/dashboard/performance/programs keep
// serving stale data until the next unrelated navigation.
const BASEBALL_PROGRAMS_PATH = '/baseball/dashboard/performance/programs';
const BASEBALL_LIVE_PATH = '/baseball/dashboard/performance/live';
const BASEBALL_LIFT_PATH = '/baseball/dashboard/lift';

// -----------------------------------------------------------------------------
// Shared result shape
// -----------------------------------------------------------------------------

export interface LiftingProgramActionResult {
  success: boolean;
  id?: string;
  count?: number;
  error?: string;
}

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const createProgramSchema = z.object({
  orgId: uuid.optional(), // for orgFrom extraction — ignored in action body (ctx.orgId used)
  name: z.string().trim().min(1, 'Name is required').max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  phase: z.enum(['fall', 'winter', 'preseason', 'in_season', 'postseason', 'summer', 'return_to_play', 'testing']).optional(),
  goal: z.enum(['strength', 'power', 'hypertrophy', 'speed', 'maintenance', 'recovery', 'arm_care', 'testing']).optional(),
  sport: z.enum(['baseball', 'golf']).optional(),
  teamId: uuid.optional().nullable(),
  startDate: ymd.optional().nullable(),
  endDate: ymd.optional().nullable(),
  isTemplate: z.boolean().optional(),
});

const updateProgramSchema = createProgramSchema.partial().extend({
  orgId: uuid.optional(), // for orgFrom extraction
  programId: uuid,
  status: z.enum(['draft', 'active', 'archived']).optional(),
  visibility: z.enum(['staff_only', 'assigned_players']).optional(),
});

const deleteProgramSchema = z.object({ orgId: uuid.optional(), programId: uuid });
const publishProgramSchema = z.object({
  orgId: uuid.optional(),
  programId: uuid,
  // Optional: override publish date (default = today)
  scheduleDate: ymd.optional().nullable(),
  // Target: a specific group_id, or athlete_id, or team-wide (all athletes)
  targetGroupId: uuid.optional().nullable(),
  targetAthleteId: uuid.optional().nullable(),
});

// -----------------------------------------------------------------------------
// 1. createProgram
// -----------------------------------------------------------------------------

export const createProgram = withLiftingAction(
  'createProgram',
  {
    featureArea: 'lifting-programs',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof createProgramSchema>): Promise<LiftingProgramActionResult> => {
    const input = createProgramSchema.parse(raw);
    const supabase = await createClient();

    const payload: HelmLiftingProgramInsert = {
      organization_id: ctx.orgId,
      sport: input.sport ?? 'baseball',
      team_id: input.teamId ?? null,
      name: input.name,
      description: input.description ?? null,
      phase: (input.phase as HelmLiftingProgramPhase | undefined) ?? 'preseason',
      goal: (input.goal as HelmLiftingProgramGoal | undefined) ?? 'strength',
      created_by_coach_id: ctx.access.coachRow?.id ?? null,
      visibility: 'staff_only',
      status: 'draft',
      is_template: input.isTemplate ?? false,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_programs')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;
    revalidatePath(LAB_PATH);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 2. updateProgram
// -----------------------------------------------------------------------------

export const updateProgram = withLiftingAction(
  'updateProgram',
  {
    featureArea: 'lifting-programs',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof updateProgramSchema>): Promise<LiftingProgramActionResult> => {
    const input = updateProgramSchema.parse(raw);
    const { programId, ...fields } = input;

    const supabase = await createClient();

    // Verify the program belongs to this org.
    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_programs')
      .select('id, organization_id')
      .eq('id', programId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string } | null };

    if (!existing) throw new LiftingActionError('Program not found or not accessible.');

    const update: HelmLiftingProgramUpdate = {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.description !== undefined && { description: fields.description ?? null }),
      ...(fields.phase !== undefined && { phase: fields.phase as HelmLiftingProgramPhase }),
      ...(fields.goal !== undefined && { goal: fields.goal as HelmLiftingProgramGoal }),
      ...(fields.sport !== undefined && { sport: fields.sport }),
      ...(fields.teamId !== undefined && { team_id: fields.teamId ?? null }),
      ...(fields.startDate !== undefined && { start_date: fields.startDate ?? null }),
      ...(fields.endDate !== undefined && { end_date: fields.endDate ?? null }),
      ...(fields.isTemplate !== undefined && { is_template: fields.isTemplate }),
      ...(fields.status !== undefined && { status: fields.status as HelmLiftingProgramStatus }),
      ...(fields.visibility !== undefined && { visibility: fields.visibility }),
      updated_at: new Date().toISOString(),
    };

    const { error } = await fromUntyped(supabase, 'helm_lifting_programs')
      .update(update)
      .eq('id', programId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(`${LAB_PATH}/${programId}`);
    revalidatePath(LAB_PATH);
    revalidatePath(`${BASEBALL_PROGRAMS_PATH}/${programId}`);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true, id: programId };
  },
);

// -----------------------------------------------------------------------------
// 3. deleteProgram — only allowed on draft programs with no published assignments
// -----------------------------------------------------------------------------

export const deleteProgram = withLiftingAction(
  'deleteProgram',
  {
    featureArea: 'lifting-programs',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof deleteProgramSchema>): Promise<LiftingProgramActionResult> => {
    const { programId } = deleteProgramSchema.parse(raw);
    const supabase = await createClient();

    const { data: prog } = await fromUntyped(supabase, 'helm_lifting_programs')
      .select('id, organization_id, status')
      .eq('id', programId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; status: string } | null };

    if (!prog) throw new LiftingActionError('Program not found.');
    if (prog.status !== 'draft') {
      throw new LiftingActionError('Only draft programs can be deleted. Archive active programs instead.');
    }

    // Check for any published assignments (would have materialised sessions).
    const { data: assignments } = await fromUntyped(supabase, 'helm_lifting_program_assignments')
      .select('id')
      .eq('program_id', programId)
      .eq('status', 'published')
      .limit(1) as { data: Array<{ id: string }> | null };

    if (assignments && assignments.length > 0) {
      throw new LiftingActionError('Cannot delete a program with published assignments. Archive it instead.');
    }

    // Cascade-delete in dependency order (FK ON DELETE is not set to CASCADE so we go manually).
    // prescriptions → sections → days → weeks → program_assignments → program
    const { data: weeks } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('id').eq('program_id', programId) as { data: Array<{ id: string }> | null };
    const weekIds = (weeks ?? []).map((w) => w.id);

    if (weekIds.length > 0) {
      const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
        .select('id').in('week_id', weekIds) as { data: Array<{ id: string }> | null };
      const dayIds = (days ?? []).map((d) => d.id);

      if (dayIds.length > 0) {
        const { data: sections } = await fromUntyped(supabase, 'helm_lifting_sections')
          .select('id').in('lift_day_id', dayIds) as { data: Array<{ id: string }> | null };
        const sectionIds = (sections ?? []).map((s) => s.id);

        if (sectionIds.length > 0) {
          await fromUntyped(supabase, 'helm_lifting_prescriptions').delete().in('section_id', sectionIds);
        }
        await fromUntyped(supabase, 'helm_lifting_sections').delete().in('lift_day_id', dayIds);
      }
      await fromUntyped(supabase, 'helm_lifting_days').delete().in('week_id', weekIds);
    }
    await fromUntyped(supabase, 'helm_lifting_weeks').delete().eq('program_id', programId);
    await fromUntyped(supabase, 'helm_lifting_program_assignments').delete().eq('program_id', programId);
    await fromUntyped(supabase, 'helm_lifting_programs').delete()
      .eq('id', programId)
      .eq('organization_id', ctx.orgId);

    revalidatePath(LAB_PATH);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 4. publishProgram — materialise helm_lifting_sessions from the day graph
//
// Resolve athletes in target scope → for each athlete + each day in the
// program, upsert a session + seed session_exercises from sections+prescriptions.
// Non-destructive: existing sessions for the same (assignment_id, athlete_id)
// are untouched; only NEW rows are inserted. Stage-and-check for dedup.
// -----------------------------------------------------------------------------

export const publishProgram = withLiftingAction(
  'publishProgram',
  {
    featureArea: 'lifting-programs',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof publishProgramSchema>): Promise<LiftingProgramActionResult> => {
    const input = publishProgramSchema.parse(raw);
    const { programId, scheduleDate, targetGroupId, targetAthleteId } = input;
    const supabase = await createClient();

    // Verify program is owned by this org.
    const { data: prog } = await fromUntyped(supabase, 'helm_lifting_programs')
      .select('id, organization_id, sport, team_id, status')
      .eq('id', programId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as {
        data: {
          id: string; organization_id: string; sport: string;
          team_id: string | null; status: string;
        } | null
      };

    if (!prog) throw new LiftingActionError('Program not found.');
    if (prog.status === 'archived') throw new LiftingActionError('Cannot publish an archived program.');

    // Resolve athlete target.
    let athleteIds: string[] = [];

    if (targetAthleteId) {
      athleteIds = [targetAthleteId];
    } else if (targetGroupId) {
      const { data: members } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .select('athlete_id')
        .eq('group_id', targetGroupId) as { data: Array<{ athlete_id: string }> | null };
      athleteIds = (members ?? []).map((m) => m.athlete_id);
    } else {
      // Whole org + sport roster
      const { data: athletes } = await fromUntyped(supabase, 'helm_lifting_athletes')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .eq('sport', prog.sport)
        .eq('is_active', true) as { data: Array<{ id: string }> | null };
      athleteIds = (athletes ?? []).map((a) => a.id);
    }

    if (athleteIds.length === 0) return { success: true, count: 0 };

    // Resolve program structure: weeks → days → sections → prescriptions.
    const { data: weeks } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('id, week_number')
      .eq('program_id', programId)
      .order('week_number', { ascending: true }) as {
        data: Array<{ id: string; week_number: number }> | null
      };

    if (!weeks || weeks.length === 0) return { success: true, count: 0 };

    const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('id, week_id, day_number, name, day_type, sport_context, estimated_minutes')
      .in('week_id', weeks.map((w) => w.id))
      .order('day_number', { ascending: true }) as {
        data: Array<{
          id: string; week_id: string; day_number: number; name: string | null;
          day_type: string; sport_context: string | null; estimated_minutes: number | null;
        }> | null
      };

    if (!days || days.length === 0) return { success: true, count: 0 };

    const { data: sections } = await fromUntyped(supabase, 'helm_lifting_sections')
      .select('id, lift_day_id, section_order, name, section_type')
      .in('lift_day_id', days.map((d) => d.id))
      .order('section_order', { ascending: true }) as {
        data: Array<{
          id: string; lift_day_id: string; section_order: number;
          name: string; section_type: string;
        }> | null
      };

    const { data: prescriptions } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
      .select('id, section_id, exercise_id, order_index, sets, reps, load_value, load_unit, target_rpe, coaching_note')
      .in('section_id', (sections ?? []).map((s) => s.id))
      .order('order_index', { ascending: true }) as {
        data: Array<{
          id: string; section_id: string; exercise_id: string | null;
          order_index: number; sets: number | null; reps: number | null;
          load_value: number | null; load_unit: string | null; target_rpe: number | null;
          coaching_note: string | null;
        }> | null
      };

    // Resolve exercise name snapshots in one batch.
    const exerciseIds = [
      ...new Set((prescriptions ?? []).map((p) => p.exercise_id).filter(Boolean) as string[]),
    ];
    const exerciseNameMap = new Map<string, string>();
    if (exerciseIds.length > 0) {
      const { data: exRows } = await fromUntyped(supabase, 'helm_lifting_exercises')
        .select('id, name')
        .in('id', exerciseIds) as { data: Array<{ id: string; name: string }> | null };
      for (const ex of exRows ?? []) exerciseNameMap.set(ex.id, ex.name);
    }

    // Build lookup maps.
    const weekById = new Map(weeks.map((w) => [w.id, w]));
    const daysBySectionId = new Map<string, (typeof days)[0]>();
    const sectionsByDayId = new Map<string, typeof sections>([]);
    for (const s of sections ?? []) {
      const arr = sectionsByDayId.get(s.lift_day_id) ?? [];
      arr.push(s);
      sectionsByDayId.set(s.lift_day_id, arr);
    }
    for (const s of sections ?? []) {
      const day = days.find((d) => d.id === s.lift_day_id);
      if (day) daysBySectionId.set(s.id, day);
    }
    const prescriptionsBySectionId = new Map<string, typeof prescriptions>([]);
    for (const p of prescriptions ?? []) {
      const arr = prescriptionsBySectionId.get(p.section_id) ?? [];
      arr.push(p);
      prescriptionsBySectionId.set(p.section_id, arr);
    }

    const baseDate = scheduleDate ?? new Date().toISOString().slice(0, 10);
    let sessionCount = 0;

    // Upsert type (workaround for untyped builder).
    type AssignmentInsert = HelmLiftingProgramAssignmentInsert;

    for (const day of days) {
      const week = weekById.get(day.week_id);
      if (!week) continue;

      // Calculate scheduled date offset: week_number * 7 + day_number days from baseDate.
      const offset = (week.week_number - 1) * 7 + (day.day_number - 1);
      const scheduledDateObj = new Date(baseDate);
      scheduledDateObj.setDate(scheduledDateObj.getDate() + offset);
      const scheduledDate = scheduledDateObj.toISOString().slice(0, 10);

      // Create/upsert one program_assignment row per day (team-wide or group scope).
      const assignmentPayload: AssignmentInsert = {
        organization_id: ctx.orgId,
        sport: prog.sport as 'baseball' | 'golf',
        team_id: prog.team_id ?? null,
        program_id: programId,
        lift_day_id: day.id,
        assigned_by_coach_id: ctx.access.coachRow?.id ?? null,
        assignment_type: targetAthleteId
          ? ('player' as HelmLiftingAssignmentTargetType)
          : targetGroupId
            ? ('group' as HelmLiftingAssignmentTargetType)
            : ('team' as HelmLiftingAssignmentTargetType),
        group_id: targetGroupId ?? null,
        athlete_id: targetAthleteId ?? null,
        scheduled_date: scheduledDate,
        status: 'published' as HelmLiftingProgramAssignmentStatus,
        player_visible_at: new Date().toISOString(),
      };

      // helm_lifting_program_assignments has NO unique constraint on
      // (lift_day_id, athlete_id, scheduled_date) — verified via pg_constraint
      // + pg_indexes: only a PK on `id` and a partial unique index on
      // `legacy_baseball_id WHERE legacy_baseball_id IS NOT NULL`. A
      // .upsert({ onConflict: 'lift_day_id,athlete_id,scheduled_date' }) here
      // matched no constraint and Postgres rejected it with 42P10 on EVERY
      // call; the old `if (assignErr) continue;` silently swallowed that, so
      // publishProgram always reported `{ success: true, count: 0 }` without
      // ever reaching the per-athlete session-materialization loop below.
      // Do a select-then-write instead of a DB upsert since there's no
      // constraint to target. `athlete_id` is only non-null for single-player
      // targets, so team/group assignments are looked up with `.is('athlete_id',
      // null)` — matching real UNIQUE-NULL semantics (which the old broken
      // onConflict target would never have honored correctly anyway: NULLs
      // never conflict with each other under a real Postgres unique index).
      const assignmentLookup = fromUntyped(supabase, 'helm_lifting_program_assignments')
        .select('id')
        .eq('lift_day_id', day.id)
        .eq('scheduled_date', scheduledDate)
        .eq('organization_id', ctx.orgId);
      const { data: existingAssignment } = await (
        targetAthleteId
          ? assignmentLookup.eq('athlete_id', targetAthleteId)
          : assignmentLookup.is('athlete_id', null)
      ).maybeSingle() as { data: { id: string } | null };

      let assignmentId: string;
      if (existingAssignment) {
        assignmentId = existingAssignment.id;
        const { error: updateErr } = await fromUntyped(supabase, 'helm_lifting_program_assignments')
          .update({
            assignment_type: assignmentPayload.assignment_type,
            group_id: assignmentPayload.group_id,
            assigned_by_coach_id: assignmentPayload.assigned_by_coach_id,
            status: assignmentPayload.status,
            player_visible_at: assignmentPayload.player_visible_at,
          })
          .eq('id', assignmentId);
        if (updateErr) {
          await logServerError('publishProgram: failed to update existing program assignment', {
            action: 'publishProgram',
            featureArea: 'lifting-programs',
            source: 'server_action',
            handled: true,
          });
          continue;
        }
      } else {
        const { data: inserted, error: insertErr } = await fromUntyped(
          supabase,
          'helm_lifting_program_assignments',
        )
          .insert(assignmentPayload)
          .select('id')
          .single() as { data: { id: string } | null; error: unknown };
        if (insertErr || !inserted) {
          await logServerError('publishProgram: failed to create program assignment', {
            action: 'publishProgram',
            featureArea: 'lifting-programs',
            source: 'server_action',
            handled: true,
          });
          continue;
        }
        assignmentId = inserted.id;
      }

      // Materialise per-athlete sessions.
      for (const athleteId of athleteIds) {
        const sessionPayload: HelmLiftingSessionInsert = {
          program_assignment_id: assignmentId,
          organization_id: ctx.orgId,
          sport: prog.sport as 'baseball' | 'golf',
          team_id: prog.team_id ?? null,
          athlete_id: athleteId,
          title: day.name ?? `${day.day_type.replace('_', ' ')} Day`,
          day_type: day.day_type,
          sport_context: day.sport_context ?? null,
          scheduled_date: scheduledDate,
          estimated_minutes: day.estimated_minutes ?? null,
          status: 'assigned',
          coach_review_status: 'none',
        };

        // Upsert on (program_assignment_id, athlete_id) to deduplicate re-publishes.
        const { data: session, error: sessErr } = await fromUntyped(supabase, 'helm_lifting_sessions')
          .upsert(sessionPayload, { onConflict: 'program_assignment_id,athlete_id' })
          .select('id')
          .single();

        if (sessErr || !session) continue;
        const sessionId = (session as { id: string }).id;

        // Seed session_exercises only if the session has none yet.
        const { data: existingEx } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
          .select('id')
          .eq('session_id', sessionId)
          .limit(1) as { data: Array<{ id: string }> | null };

        if (existingEx && existingEx.length > 0) continue;

        const daySections = sectionsByDayId.get(day.id) ?? [];
        let orderIdx = 0;
        for (const section of daySections) {
          const sectionPrescriptions = prescriptionsBySectionId.get(section.id) ?? [];
          for (const presc of sectionPrescriptions) {
            const exerciseName = presc.exercise_id
              ? (exerciseNameMap.get(presc.exercise_id) ?? 'Exercise')
              : 'Exercise';

            const sePayload: HelmLiftingSessionExerciseInsert = {
              session_id: sessionId,
              prescription_id: presc.id,
              exercise_id: presc.exercise_id ?? null,
              exercise_name_snapshot: exerciseName,
              section_name_snapshot: section.name,
              section_type_snapshot: section.section_type,
              order_index: orderIdx++,
              prescribed_sets: presc.sets ?? null,
              prescribed_reps: presc.reps ?? null,
              prescribed_load: presc.load_value ?? null,
              prescribed_load_unit: presc.load_unit ?? null,
              prescribed_rpe: presc.target_rpe ?? null,
              status: 'assigned',
            };

            await fromUntyped(supabase, 'helm_lifting_session_exercises').insert(sePayload);
          }
        }
        sessionCount++;
      }
    }

    // Mark the program as active if still draft.
    if (prog.status === 'draft') {
      await fromUntyped(supabase, 'helm_lifting_programs')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', programId);
    }

    revalidatePath(LAB_PATH);
    revalidatePath('/lifting/dashboard/sessions');
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    revalidatePath(BASEBALL_LIVE_PATH);
    revalidatePath(BASEBALL_LIFT_PATH);
    return { success: true, count: sessionCount };
  },
);

// =============================================================================
// 5. Sub-resource CRUD — Program structure builder
//
// These actions let coaches build out the week → day → section → prescription
// tree after creating a draft program. Mirrors the equivalents in
// src/app/baseball/actions/lifting-v11.ts (addLiftWeek / addLiftDay / etc.)
// but targets helm_lifting_* tables and uses withLiftingAction instead of
// withBaseballAction.
//
// Every action requires requireEdit:true; RLS backstops every write.
// =============================================================================

// -----------------------------------------------------------------------------
// Validation helpers shared across sub-resource actions
// -----------------------------------------------------------------------------

const addWeekSchema = z.object({
  programId: uuid,
  weekNumber: z.number().int().min(1).max(52),
  name: z.string().max(80).optional().nullable(),
  theme: z.string().max(120).optional().nullable(),
  deload: z.boolean().optional(),
});

const addDaySchema = z.object({
  weekId: uuid,
  dayNumber: z.number().int().min(1).max(7),
  name: z.string().max(80).optional().nullable(),
  dayType: z.enum(['lower', 'upper', 'full_body', 'recovery', 'arm_care', 'conditioning', 'testing', 'custom']).optional(),
  sportContext: z.string().max(40).optional().nullable(),
  estimatedMinutes: z.number().int().min(0).max(300).optional().nullable(),
});

const addSectionSchema = z.object({
  liftDayId: uuid,
  name: z.string().trim().min(1).max(80),
  sectionType: z.enum(['warmup', 'movement_prep', 'power', 'main_strength', 'accessory', 'arm_care', 'mobility', 'conditioning']).optional(),
  sectionOrder: z.number().int().min(0).max(50).optional(),
  instructions: z.string().max(1000).optional().nullable(),
});

const addPrescriptionSchema = z.object({
  sectionId: uuid,
  exerciseId: uuid.optional().nullable(),
  orderIndex: z.number().int().min(0).max(100).optional(),
  prescriptionType: z.enum(['fixed', 'percent_1rm', 'rpe', 'velocity', 'coach_load', 'player_select']).optional(),
  sets: z.number().int().min(0).max(50).optional().nullable(),
  reps: z.number().int().min(0).max(500).optional().nullable(),
  loadValue: z.number().min(0).max(2000).optional().nullable(),
  loadUnit: z.string().max(10).optional().nullable(),
  percent1rm: z.number().min(0).max(200).optional().nullable(),
  targetRpe: z.number().min(0).max(10).optional().nullable(),
  targetRir: z.number().min(0).max(10).optional().nullable(),
  targetVelocityMin: z.number().min(0).max(20).optional().nullable(),
  targetVelocityMax: z.number().min(0).max(20).optional().nullable(),
  restSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  tempo: z.string().max(20).optional().nullable(),
  coachingNote: z.string().max(1000).optional().nullable(),
});

const updatePrescriptionSchema = z.object({
  prescriptionId: uuid,
  exerciseId: uuid.optional().nullable(),
  prescriptionType: z.enum(['fixed', 'percent_1rm', 'rpe', 'velocity', 'coach_load', 'player_select']).optional(),
  sets: z.number().int().min(0).max(50).optional().nullable(),
  reps: z.number().int().min(0).max(500).optional().nullable(),
  loadValue: z.number().min(0).max(2000).optional().nullable(),
  loadUnit: z.string().max(10).optional().nullable(),
  percent1rm: z.number().min(0).max(200).optional().nullable(),
  targetRpe: z.number().min(0).max(10).optional().nullable(),
  targetRir: z.number().min(0).max(10).optional().nullable(),
  targetVelocityMin: z.number().min(0).max(20).optional().nullable(),
  targetVelocityMax: z.number().min(0).max(20).optional().nullable(),
  restSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  tempo: z.string().max(20).optional().nullable(),
  coachingNote: z.string().max(1000).optional().nullable(),
});

const updateSectionSchema = z.object({
  sectionId: uuid,
  name: z.string().trim().min(1).max(80).optional(),
  sectionType: z.enum(['warmup', 'movement_prep', 'power', 'main_strength', 'accessory', 'arm_care', 'mobility', 'conditioning']).optional(),
  instructions: z.string().max(1000).optional().nullable(),
});

const updateDaySchema = z.object({
  dayId: uuid,
  name: z.string().max(80).optional().nullable(),
  dayType: z.enum(['lower', 'upper', 'full_body', 'recovery', 'arm_care', 'conditioning', 'testing', 'custom']).optional(),
  sportContext: z.string().max(40).optional().nullable(),
  estimatedMinutes: z.number().int().min(0).max(300).optional().nullable(),
});

const reorderSchema = z.object({
  orderedIds: z.array(uuid).min(1).max(100),
});

const deleteByIdSchema = z.object({ id: uuid });
const duplicateDaySchema = z.object({ dayId: uuid, targetWeekId: uuid.optional() });
const duplicateWeekSchema = z.object({ weekId: uuid });

// -----------------------------------------------------------------------------
// 5a. addLiftWeek — upsert a week into the program structure
// -----------------------------------------------------------------------------

export const addLiftWeek = withLiftingAction(
  'addLiftWeek',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof addWeekSchema>): Promise<LiftingProgramActionResult> => {
    const input = addWeekSchema.parse(raw);
    const supabase = await createClient();
    const payload: HelmLiftingWeekInsert = {
      program_id: input.programId,
      week_number: input.weekNumber,
      name: input.name ?? null,
      theme: input.theme ?? null,
      deload: input.deload ?? false,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .upsert(payload, { onConflict: 'program_id,week_number' })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(LAB_PATH);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5b. addLiftDay — upsert a day into a week
// -----------------------------------------------------------------------------

export const addLiftDay = withLiftingAction(
  'addLiftDay',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof addDaySchema>): Promise<LiftingProgramActionResult> => {
    const input = addDaySchema.parse(raw);
    const supabase = await createClient();
    const payload: HelmLiftingDayInsert = {
      week_id: input.weekId,
      day_number: input.dayNumber,
      name: input.name ?? null,
      day_type: (input.dayType as HelmLiftingDayType | undefined) ?? 'full_body',
      sport_context: input.sportContext ?? null,
      estimated_minutes: input.estimatedMinutes ?? null,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_days')
      .upsert(payload, { onConflict: 'week_id,day_number' })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(LAB_PATH);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5c. addLiftSection — insert a section into a day
// -----------------------------------------------------------------------------

export const addLiftSection = withLiftingAction(
  'addLiftSection',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof addSectionSchema>): Promise<LiftingProgramActionResult> => {
    const input = addSectionSchema.parse(raw);
    const supabase = await createClient();
    const payload: HelmLiftingSectionInsert = {
      lift_day_id: input.liftDayId,
      name: input.name,
      section_type: (input.sectionType as HelmLiftingSectionType | undefined) ?? 'main_strength',
      section_order: input.sectionOrder ?? 0,
      instructions: input.instructions ?? null,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sections')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(LAB_PATH);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5d. addLiftPrescription — insert an exercise prescription into a section
// -----------------------------------------------------------------------------

export const addLiftPrescription = withLiftingAction(
  'addLiftPrescription',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof addPrescriptionSchema>): Promise<LiftingProgramActionResult> => {
    const input = addPrescriptionSchema.parse(raw);
    const supabase = await createClient();
    const payload: HelmLiftingPrescriptionInsert = {
      section_id: input.sectionId,
      exercise_id: input.exerciseId ?? null,
      order_index: input.orderIndex ?? 0,
      prescription_type: (input.prescriptionType as HelmLiftingPrescriptionType | undefined) ?? 'fixed',
      sets: input.sets ?? null,
      reps: input.reps ?? null,
      load_value: input.loadValue ?? null,
      load_unit: input.loadUnit ?? null,
      percent_1rm: input.percent1rm ?? null,
      target_rpe: input.targetRpe ?? null,
      target_rir: input.targetRir ?? null,
      target_velocity_min: input.targetVelocityMin ?? null,
      target_velocity_max: input.targetVelocityMax ?? null,
      rest_seconds: input.restSeconds ?? null,
      tempo: input.tempo ?? null,
      coaching_note: input.coachingNote ?? null,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(LAB_PATH);
    revalidatePath(BASEBALL_PROGRAMS_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5e. updateLiftPrescription — PATCH an existing prescription (all fields optional)
// -----------------------------------------------------------------------------

export const updateLiftPrescription = withLiftingAction(
  'updateLiftPrescription',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof updatePrescriptionSchema>): Promise<LiftingProgramActionResult> => {
    const input = updatePrescriptionSchema.parse(raw);
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (input.exerciseId !== undefined) patch.exercise_id = input.exerciseId;
    if (input.prescriptionType !== undefined) patch.prescription_type = input.prescriptionType;
    if (input.sets !== undefined) patch.sets = input.sets;
    if (input.reps !== undefined) patch.reps = input.reps;
    if (input.loadValue !== undefined) patch.load_value = input.loadValue;
    if (input.loadUnit !== undefined) patch.load_unit = input.loadUnit;
    if (input.percent1rm !== undefined) patch.percent_1rm = input.percent1rm;
    if (input.targetRpe !== undefined) patch.target_rpe = input.targetRpe;
    if (input.targetRir !== undefined) patch.target_rir = input.targetRir;
    if (input.targetVelocityMin !== undefined) patch.target_velocity_min = input.targetVelocityMin;
    if (input.targetVelocityMax !== undefined) patch.target_velocity_max = input.targetVelocityMax;
    if (input.restSeconds !== undefined) patch.rest_seconds = input.restSeconds;
    if (input.tempo !== undefined) patch.tempo = input.tempo;
    if (input.coachingNote !== undefined) patch.coaching_note = input.coachingNote;
    if (Object.keys(patch).length === 0) return { success: true, id: input.prescriptionId };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
      .update(patch)
      .eq('id', input.prescriptionId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new LiftingActionError('Exercise prescription not found or not editable.');
    return { success: true, id: input.prescriptionId };
  },
);

// -----------------------------------------------------------------------------
// 5f. updateLiftSection — PATCH an existing section
// -----------------------------------------------------------------------------

export const updateLiftSection = withLiftingAction(
  'updateLiftSection',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof updateSectionSchema>): Promise<LiftingProgramActionResult> => {
    const input = updateSectionSchema.parse(raw);
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.sectionType !== undefined) patch.section_type = input.sectionType;
    if (input.instructions !== undefined) patch.instructions = input.instructions;
    if (Object.keys(patch).length === 0) return { success: true, id: input.sectionId };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sections')
      .update(patch)
      .eq('id', input.sectionId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new LiftingActionError('Section not found or not editable.');
    return { success: true, id: input.sectionId };
  },
);

// -----------------------------------------------------------------------------
// 5g. updateLiftDay — PATCH an existing day
// -----------------------------------------------------------------------------

export const updateLiftDay = withLiftingAction(
  'updateLiftDay',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof updateDaySchema>): Promise<LiftingProgramActionResult> => {
    const input = updateDaySchema.parse(raw);
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.dayType !== undefined) patch.day_type = input.dayType;
    if (input.sportContext !== undefined) patch.sport_context = input.sportContext;
    if (input.estimatedMinutes !== undefined) patch.estimated_minutes = input.estimatedMinutes;
    if (Object.keys(patch).length === 0) return { success: true, id: input.dayId };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_days')
      .update(patch)
      .eq('id', input.dayId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new LiftingActionError('Day not found or not editable.');
    return { success: true, id: input.dayId };
  },
);

// -----------------------------------------------------------------------------
// 5h. reorderLiftSections — drag-drop persistence for section order
// -----------------------------------------------------------------------------

export const reorderLiftSections = withLiftingAction(
  'reorderLiftSections',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof reorderSchema>): Promise<LiftingProgramActionResult> => {
    const input = reorderSchema.parse(raw);
    const supabase = await createClient();
    for (let i = 0; i < input.orderedIds.length; i++) {
      const { error } = await fromUntyped(supabase, 'helm_lifting_sections')
        .update({ section_order: i })
        .eq('id', input.orderedIds[i]);
      if (error) throw error;
    }
    return { success: true, count: input.orderedIds.length };
  },
);

// -----------------------------------------------------------------------------
// 5i. reorderLiftPrescriptions — drag-drop persistence for prescription order
// -----------------------------------------------------------------------------

export const reorderLiftPrescriptions = withLiftingAction(
  'reorderLiftPrescriptions',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof reorderSchema>): Promise<LiftingProgramActionResult> => {
    const input = reorderSchema.parse(raw);
    const supabase = await createClient();
    for (let i = 0; i < input.orderedIds.length; i++) {
      const { error } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
        .update({ order_index: i })
        .eq('id', input.orderedIds[i]);
      if (error) throw error;
    }
    return { success: true, count: input.orderedIds.length };
  },
);

// -----------------------------------------------------------------------------
// 5j. deleteLiftPrescription / deleteLiftSection / deleteLiftDay / deleteLiftWeek
// Explicit user-initiated node removal. FK ON DELETE CASCADE prunes children.
// -----------------------------------------------------------------------------

export const deleteLiftPrescription = withLiftingAction(
  'deleteLiftPrescription',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<LiftingProgramActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = await createClient();
    const { error } = await fromUntyped(supabase, 'helm_lifting_prescriptions').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

export const deleteLiftSection = withLiftingAction(
  'deleteLiftSection',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<LiftingProgramActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = await createClient();
    const { error } = await fromUntyped(supabase, 'helm_lifting_sections').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

export const deleteLiftDay = withLiftingAction(
  'deleteLiftDay',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<LiftingProgramActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = await createClient();
    // Manually prune prescriptions + sections before the day row
    // (FK CASCADE may not be configured in all environments).
    const { data: sections } = await fromUntyped(supabase, 'helm_lifting_sections')
      .select('id').eq('lift_day_id', id) as { data: Array<{ id: string }> | null };
    const sectionIds = (sections ?? []).map((s) => s.id);
    if (sectionIds.length > 0) {
      await fromUntyped(supabase, 'helm_lifting_prescriptions').delete().in('section_id', sectionIds);
      await fromUntyped(supabase, 'helm_lifting_sections').delete().eq('lift_day_id', id);
    }
    const { error: dayErr } = await fromUntyped(supabase, 'helm_lifting_days').delete().eq('id', id);
    if (dayErr) throw dayErr;
    return { success: true, id };
  },
);

export const deleteLiftWeek = withLiftingAction(
  'deleteLiftWeek',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<LiftingProgramActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = await createClient();
    // Cascade manually: sections → days → week (FK may not cascade in all envs)
    const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('id').eq('week_id', id) as { data: Array<{ id: string }> | null };
    const dayIds = (days ?? []).map((d) => d.id);
    if (dayIds.length > 0) {
      const { data: sections } = await fromUntyped(supabase, 'helm_lifting_sections')
        .select('id').in('lift_day_id', dayIds) as { data: Array<{ id: string }> | null };
      const sectionIds = (sections ?? []).map((s) => s.id);
      if (sectionIds.length > 0) {
        await fromUntyped(supabase, 'helm_lifting_prescriptions').delete().in('section_id', sectionIds);
        await fromUntyped(supabase, 'helm_lifting_sections').delete().in('lift_day_id', dayIds);
      }
      await fromUntyped(supabase, 'helm_lifting_days').delete().eq('week_id', id);
    }
    const { error } = await fromUntyped(supabase, 'helm_lifting_weeks').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

// -----------------------------------------------------------------------------
// 5k. duplicateLiftDay — deep-copy a day's section+prescription tree
// -----------------------------------------------------------------------------

async function deepCopyLiftDay(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceDayId: string,
  targetDayId: string,
): Promise<void> {
  const { data: sections, error: secErr } = await fromUntyped(supabase, 'helm_lifting_sections')
    .select('id, section_order, name, section_type, instructions')
    .eq('lift_day_id', sourceDayId)
    .order('section_order', { ascending: true }) as {
      data: Array<{
        id: string; section_order: number; name: string;
        section_type: string; instructions: string | null;
      }> | null;
      error: unknown;
    };
  if (secErr) throw secErr;
  for (const s of sections ?? []) {
    const { data: newSec, error: nsErr } = await fromUntyped(supabase, 'helm_lifting_sections')
      .insert({
        lift_day_id: targetDayId,
        section_order: s.section_order,
        name: s.name,
        section_type: s.section_type,
        instructions: s.instructions,
      })
      .select('id')
      .single();
    if (nsErr) throw nsErr;
    const newSectionId = (newSec as { id: string }).id;

    const { data: pres, error: pErr } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
      .select('exercise_id, order_index, prescription_type, sets, reps, load_value, load_unit, percent_1rm, target_rpe, target_rir, target_velocity_min, target_velocity_max, rest_seconds, tempo, coaching_note')
      .eq('section_id', s.id)
      .order('order_index', { ascending: true }) as {
        data: Array<Record<string, unknown>> | null;
        error: unknown;
      };
    if (pErr) throw pErr;
    const presRows = (pres ?? []).map((p) => ({ ...p, section_id: newSectionId }));
    if (presRows.length > 0) {
      const { error: insErr } = await fromUntyped(supabase, 'helm_lifting_prescriptions').insert(presRows);
      if (insErr) throw insErr;
    }
  }
}

export const duplicateLiftDay = withLiftingAction(
  'duplicateLiftDay',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof duplicateDaySchema>): Promise<LiftingProgramActionResult> => {
    const input = duplicateDaySchema.parse(raw);
    const supabase = await createClient();

    const { data: src } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('id, week_id, day_number, name, day_type, sport_context, estimated_minutes')
      .eq('id', input.dayId)
      .maybeSingle() as {
        data: {
          id: string; week_id: string; day_number: number; name: string | null;
          day_type: string; sport_context: string | null; estimated_minutes: number | null;
        } | null
      };
    if (!src) throw new LiftingActionError('Day not found.');
    const weekId = input.targetWeekId ?? src.week_id;

    const { data: siblings } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('day_number').eq('week_id', weekId) as { data: Array<{ day_number: number }> | null };
    const used = new Set((siblings ?? []).map((d) => d.day_number));
    let nextDay = 1;
    while (used.has(nextDay) && nextDay < 7) nextDay++;
    if (used.has(nextDay)) throw new LiftingActionError('That week already has 7 days.');

    const { data: newDay, error: ndErr } = await fromUntyped(supabase, 'helm_lifting_days')
      .insert({
        week_id: weekId,
        day_number: nextDay,
        name: src.name ? `${src.name} (copy)` : null,
        day_type: src.day_type,
        sport_context: src.sport_context,
        estimated_minutes: src.estimated_minutes,
      })
      .select('id')
      .single();
    if (ndErr) throw ndErr;
    const newDayId = (newDay as { id: string }).id;

    await deepCopyLiftDay(supabase, src.id, newDayId);

    const { data: wk } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('program_id').eq('id', weekId).maybeSingle() as {
        data: { program_id?: string } | null
      };
    if (wk?.program_id) {
      revalidatePath(`${LAB_PATH}/${wk.program_id}`);
      revalidatePath(`${BASEBALL_PROGRAMS_PATH}/${wk.program_id}`);
    }
    return { success: true, id: newDayId };
  },
);

// -----------------------------------------------------------------------------
// 5l. duplicateLiftWeek — deep-copy an entire week including all day subtrees
// -----------------------------------------------------------------------------

export const duplicateLiftWeek = withLiftingAction(
  'duplicateLiftWeek',
  { featureArea: 'lifting-programs', requireEdit: true },
  async (_ctx, raw: z.input<typeof duplicateWeekSchema>): Promise<LiftingProgramActionResult> => {
    const input = duplicateWeekSchema.parse(raw);
    const supabase = await createClient();

    const { data: src } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('id, program_id, week_number, name, theme, deload')
      .eq('id', input.weekId)
      .maybeSingle() as {
        data: {
          id: string; program_id: string; week_number: number;
          name: string | null; theme: string | null; deload: boolean;
        } | null
      };
    if (!src) throw new LiftingActionError('Week not found.');

    const { data: siblings } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('week_number').eq('program_id', src.program_id) as { data: Array<{ week_number: number }> | null };
    const maxWeek = (siblings ?? []).reduce((m, w) => Math.max(m, w.week_number), 0);
    const nextWeek = maxWeek + 1;
    if (nextWeek > 52) throw new LiftingActionError('A program cannot exceed 52 weeks.');

    const { data: newWeek, error: nwErr } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .insert({
        program_id: src.program_id,
        week_number: nextWeek,
        name: src.name ? `${src.name} (copy)` : `Week ${nextWeek}`,
        theme: src.theme,
        deload: src.deload,
      })
      .select('id')
      .single();
    if (nwErr) throw nwErr;
    const newWeekId = (newWeek as { id: string }).id;

    const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('id, day_number, name, day_type, sport_context, estimated_minutes')
      .eq('week_id', src.id)
      .order('day_number', { ascending: true }) as {
        data: Array<{
          id: string; day_number: number; name: string | null;
          day_type: string; sport_context: string | null; estimated_minutes: number | null;
        }> | null
      };

    for (const d of days ?? []) {
      const { data: nd, error: ndErr } = await fromUntyped(supabase, 'helm_lifting_days')
        .insert({
          week_id: newWeekId,
          day_number: d.day_number,
          name: d.name,
          day_type: d.day_type,
          sport_context: d.sport_context,
          estimated_minutes: d.estimated_minutes,
        })
        .select('id')
        .single();
      if (ndErr) throw ndErr;
      await deepCopyLiftDay(supabase, d.id, (nd as { id: string }).id);
    }

    revalidatePath(`${LAB_PATH}/${src.program_id}`);
    revalidatePath(`${BASEBALL_PROGRAMS_PATH}/${src.program_id}`);
    return { success: true, id: newWeekId };
  },
);

// =============================================================================
// 6. Exercise library CRUD
//
// createExercise / updateExercise / archiveExercise over helm_lifting_exercises.
// All org-scoped (organization_id = ctx.orgId), requireEdit:true.
// archiveExercise sets is_active=false (non-destructive; exercises already
// referenced in prescriptions/sessions are preserved).
// =============================================================================

const EXERCISES_PATH = '/lifting/dashboard/exercises';

export interface LiftingExerciseActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

const createExerciseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category: z.enum([
    'warmup', 'power', 'strength', 'accessory', 'arm_care',
    'mobility', 'conditioning', 'recovery', 'test',
  ]).optional(),
  primaryPattern: z.enum([
    'squat', 'hinge', 'push', 'pull', 'carry', 'rotate', 'anti_rotate',
    'sprint', 'jump', 'throw', 'shoulder', 'elbow', 'hip', 'ankle',
  ]).optional().nullable(),
  bodyRegion: z.enum(['lower', 'upper', 'trunk', 'arm', 'full_body']).optional().nullable(),
  equipment: z.string().trim().max(60).optional().nullable(),
  unilateral: z.boolean().optional(),
  defaultUnit: z.enum([
    'lb', 'kg', 'bodyweight', 'seconds', 'yards', 'reps', 'mph', 'watts', 'mps',
  ]).optional(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  videoUrl: z.string().trim().url().max(500).optional().nullable(),
  sport: z.enum(['baseball', 'golf']).optional(),
});

const updateExerciseSchema = createExerciseSchema.partial().extend({
  exerciseId: uuid,
});

const archiveExerciseSchema = z.object({ exerciseId: uuid });
const searchExercisesSchema = z.object({
  query: z.string().trim().max(100).optional(),
  sport: z.enum(['baseball', 'golf']).optional(),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const createExercise = withLiftingAction(
  'createExercise',
  { featureArea: 'lifting-exercises', requireEdit: true },
  async (ctx, raw: z.input<typeof createExerciseSchema>): Promise<LiftingExerciseActionResult> => {
    const input = createExerciseSchema.parse(raw);
    const supabase = await createClient();

    const payload: HelmLiftingExerciseInsert = {
      organization_id: ctx.orgId,
      sport: input.sport ?? 'baseball',
      created_by_coach_id: ctx.access.coachRow?.id ?? null,
      name: input.name,
      category: (input.category as HelmLiftingExerciseCategory | undefined) ?? 'strength',
      primary_pattern: (input.primaryPattern as HelmLiftingPrimaryPattern | undefined) ?? null,
      body_region: (input.bodyRegion as HelmLiftingBodyRegion | undefined) ?? null,
      equipment: input.equipment ?? null,
      unilateral: input.unilateral ?? false,
      default_unit: (input.defaultUnit as HelmLiftingUnit | undefined) ?? 'lb',
      instructions: input.instructions ?? null,
      video_url: input.videoUrl ?? null,
      is_active: true,
      is_global: false,
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;
    revalidatePath(EXERCISES_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

export const updateExercise = withLiftingAction(
  'updateExercise',
  { featureArea: 'lifting-exercises', requireEdit: true },
  async (ctx, raw: z.input<typeof updateExerciseSchema>): Promise<LiftingExerciseActionResult> => {
    const input = updateExerciseSchema.parse(raw);
    const { exerciseId, ...fields } = input;
    const supabase = await createClient();

    // Verify the exercise belongs to this org (global exercises are read-only).
    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, organization_id, is_global')
      .eq('id', exerciseId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; is_global: boolean } | null };

    if (!existing) throw new LiftingActionError('Exercise not found or not editable.');
    if (existing.is_global) throw new LiftingActionError('Global exercises cannot be edited.');

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.primaryPattern !== undefined) patch.primary_pattern = fields.primaryPattern;
    if (fields.bodyRegion !== undefined) patch.body_region = fields.bodyRegion;
    if (fields.equipment !== undefined) patch.equipment = fields.equipment;
    if (fields.unilateral !== undefined) patch.unilateral = fields.unilateral;
    if (fields.defaultUnit !== undefined) patch.default_unit = fields.defaultUnit;
    if (fields.instructions !== undefined) patch.instructions = fields.instructions;
    if (fields.videoUrl !== undefined) patch.video_url = fields.videoUrl;
    if (fields.sport !== undefined) patch.sport = fields.sport;

    const { error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .update(patch)
      .eq('id', exerciseId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(EXERCISES_PATH);
    return { success: true, id: exerciseId };
  },
);

export const archiveExercise = withLiftingAction(
  'archiveExercise',
  { featureArea: 'lifting-exercises', requireEdit: true },
  async (ctx, raw: z.input<typeof archiveExerciseSchema>): Promise<LiftingExerciseActionResult> => {
    const { exerciseId } = archiveExerciseSchema.parse(raw);
    const supabase = await createClient();

    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, organization_id, is_global')
      .eq('id', exerciseId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; organization_id: string; is_global: boolean } | null };

    if (!existing) throw new LiftingActionError('Exercise not found.');
    if (existing.is_global) throw new LiftingActionError('Global exercises cannot be archived.');

    const { error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', exerciseId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(EXERCISES_PATH);
    return { success: true, id: exerciseId };
  },
);

export const restoreExercise = withLiftingAction(
  'restoreExercise',
  { featureArea: 'lifting-exercises', requireEdit: true },
  async (ctx, raw: z.input<typeof archiveExerciseSchema>): Promise<LiftingExerciseActionResult> => {
    const { exerciseId } = archiveExerciseSchema.parse(raw);
    const supabase = await createClient();

    const { error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', exerciseId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(EXERCISES_PATH);
    return { success: true, id: exerciseId };
  },
);

// searchExercises — used by ExercisePicker (no requireEdit; read-only).
export const searchExercises = withLiftingAction(
  'searchExercises',
  { featureArea: 'lifting-exercises', requireEdit: false },
  async (ctx, raw: z.input<typeof searchExercisesSchema>): Promise<{
    success: boolean;
    exercises: HelmLiftingExerciseRow[];
    error?: string;
  }> => {
    const input = searchExercisesSchema.parse(raw);
    const supabase = await createClient();

    let q = fromUntyped(supabase, 'helm_lifting_exercises')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(input.limit ?? 100);

    if (input.sport) q = q.eq('sport', input.sport);
    if (input.category) q = q.eq('category', input.category);
    if (input.query) q = q.ilike('name', `%${input.query}%`);

    const { data, error } = await q as { data: HelmLiftingExerciseRow[] | null; error: unknown };
    if (error) throw error as Error;

    return { success: true, exercises: data ?? [] };
  },
);
