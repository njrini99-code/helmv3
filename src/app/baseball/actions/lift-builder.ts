'use server';

// =============================================================================
// src/app/baseball/actions/lift-builder.ts
//
// Wave 4 — Lift Builder server actions.
//
// Three server actions for building and saving advanced lift session plans:
//
//   saveLiftSessionPlan  — persist a coach-authored session plan (blocks +
//                          exercises) for a date, materializing one
//                          helm_lifting_session + helm_lifting_session_exercises
//                          per resolved athlete. Uses stage-and-swap; never
//                          deletes rows.
//
//   createExercise       — add a new exercise to the library, including all
//                          new stress-profile columns (throwing_arm_stress etc.).
//
//   updateExercise       — patch an existing exercise (PATCH semantics; absent
//                          fields are never nulled).
//
// Auth: every action runs inside withBaseballAction → auth + active-team
// context + can_manage_lifting capability + Sentry scoping.
//
// DEPENDENCY: shared types imported from '@/lib/baseball/exercise-conflict'
//   (owned by the conflict-engine agent — that file must exist to compile).
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
} from '@/lib/lifting/resolve-baseball-context';
import type { StressLevel, GroupAvailabilityCell } from '@/lib/baseball/exercise-conflict';
import type {
  HelmLiftingSessionInsert,
  HelmLiftingSessionExerciseInsert,
} from '@/lib/types/helm-lifting-data';
import {
  getGroupAvailability,
  type LiftBuilderScope,
} from '@/lib/baseball/read-models/lift-builder';

/** Narrow alias for the resolved server Supabase client — avoids `any` on helper params. */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// =============================================================================
// Path constants
// =============================================================================

const PERFORMANCE = '/baseball/dashboard/performance';
const BUILDER = '/baseball/dashboard/performance/builder';
const PLAYER_LIFT = '/baseball/dashboard/lift';

// =============================================================================
// Shared result shape
// =============================================================================

export interface BuilderActionResult {
  success: boolean;
  id?: string;
  count?: number;
  error?: string;
}

// =============================================================================
// Zod schemas
// =============================================================================

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const stressLevel = z.enum(['none', 'low', 'medium', 'high']);

const prescriptionSchema = z.object({
  sets: z.number().int().min(0).max(50).optional(),
  reps: z.number().int().min(0).max(500).optional(),
  loadMode: z.enum(['weight', 'percent', 'rpe', 'bodyweight']).optional(),
  load: z.number().min(0).max(2000).optional(),
  rpe: z.number().min(0).max(10).optional(),
  rest: z.number().int().min(0).max(3600).optional(),
  note: z.string().max(500).optional(),
});

const draftExerciseSchema = z.object({
  id: uuid,
  exerciseId: uuid,
  prescription: prescriptionSchema,
});

const liftBlockTypeValues = [
  'warmup', 'power', 'main', 'accessory', 'arm_care', 'conditioning', 'recovery',
] as const;

const draftBlockSchema = z.object({
  id: uuid,
  title: z.string().trim().min(1).max(80),
  type: z.enum(liftBlockTypeValues),
  exercises: z.array(draftExerciseSchema).max(50),
});

const saveLiftSessionPlanSchema = z.object({
  teamId: uuid,
  groupId: uuid.optional().nullable(),
  date: ymd,
  title: z.string().trim().min(1).max(160),
  blocks: z.array(draftBlockSchema).max(20),
  status: z
    .enum(['assigned', 'started', 'completed', 'missed', 'excused', 'modified'])
    .optional()
    .default('assigned'),
  /**
   * Optional subset of player IDs to target within the resolved group/team.
   * When present, the resolved athlete list is intersected with these IDs —
   * callers cannot expand scope beyond what the group/team already grants.
   * An explicitly-provided empty array targets nobody (count: 0); only an
   * omitted (undefined) value falls back to the whole resolved scope.
   */
  playerIds: z.array(uuid).max(200).optional(),
});

// Exercise write schema (covers both create and update inputs)
const exerciseWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z
    .enum(['warmup', 'power', 'strength', 'accessory', 'arm_care', 'mobility', 'conditioning', 'recovery', 'test'])
    .optional(),
  movementPattern: z.string().max(40).optional().nullable(),
  primaryBodyRegions: z.array(z.string().max(60)).max(10).optional(),
  secondaryBodyRegions: z.array(z.string().max(60)).max(10).optional(),
  stressRegions: z.array(z.string().max(60)).max(10).optional(),
  throwingArmStress: stressLevel.optional(),
  spineLoading: stressLevel.optional(),
  lowerBodyLoading: stressLevel.optional(),
  rotationalStress: stressLevel.optional(),
  gripStress: stressLevel.optional(),
  isPitcherSensitive: z.boolean().optional(),
  equipment: z.array(z.string().max(60)).max(10).optional(),
  demoVideoUrl: z.string().url().max(500).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
});

const createExerciseSchema = exerciseWriteSchema;

const updateExerciseSchema = exerciseWriteSchema.partial().extend({
  exerciseId: uuid,
});

// =============================================================================
// Internal helpers
// =============================================================================

/** Flatten draft blocks into an ordered list of (order_index, block, exercise). */
function flattenBlocks(blocks: z.infer<typeof draftBlockSchema>[]): Array<{
  orderIndex: number;
  blockTitle: string;
  blockType: string;
  exerciseId: string;
  prescription: z.infer<typeof prescriptionSchema>;
}> {
  const out: ReturnType<typeof flattenBlocks> = [];
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi]!;
    for (let ei = 0; ei < block.exercises.length; ei++) {
      const ex = block.exercises[ei]!;
      out.push({
        orderIndex: bi * 100 + ei,
        blockTitle: block.title,
        blockType: block.type,
        exerciseId: ex.exerciseId,
        prescription: ex.prescription,
      });
    }
  }
  return out;
}

/** Load mode → prescribed_load_unit mapping. */
function toLoadUnit(loadMode?: string): string | null {
  switch (loadMode) {
    case 'weight': return 'lb';
    case 'percent': return '%1rm';
    case 'rpe': return 'rpe';
    case 'bodyweight': return 'bodyweight';
    default: return null;
  }
}

/**
 * Stage-and-swap exercises for a single session.
 *
 * Approach (never delete-then-reinsert):
 *   1. Fetch current session_exercises ordered by order_index.
 *   2. For each new exercise at position i:
 *        - If an existing row is at that position → UPDATE it in-place.
 *        - If no existing row → INSERT a new one.
 *   3. For any existing rows beyond the new exercise count → mark 'skipped'.
 *
 * This gives upsert-like semantics without a unique constraint on
 * (session_id, order_index).
 */
async function upsertSessionExercises(
  supabase: SupabaseServerClient,
  sessionId: string,
  flatExercises: ReturnType<typeof flattenBlocks>,
  nameById: Map<string, string>,
): Promise<void> {
  // Fetch existing exercises for this session ordered by order_index.
  const { data: existing } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
    .select('id, order_index, status')
    .eq('session_id', sessionId)
    .order('order_index', { ascending: true }) as {
    data: Array<{ id: string; order_index: number; status: string }> | null;
  };
  const existingRows = existing ?? [];

  for (let i = 0; i < flatExercises.length; i++) {
    const item = flatExercises[i]!;
    const existingRow = existingRows[i];

    // Name snapshot comes from the pre-fetched batch map (no per-row query).
    const exerciseNameSnapshot = nameById.get(item.exerciseId) ?? 'Exercise';

    const payload: Partial<HelmLiftingSessionExerciseInsert> = {
      session_id: sessionId,
      exercise_id: item.exerciseId,
      exercise_name_snapshot: exerciseNameSnapshot,
      section_name_snapshot: item.blockTitle,
      section_type_snapshot: item.blockType,
      order_index: item.orderIndex,
      prescribed_sets: item.prescription.sets ?? null,
      prescribed_reps: item.prescription.reps ?? null,
      prescribed_load: item.prescription.load ?? null,
      prescribed_load_unit: toLoadUnit(item.prescription.loadMode),
      prescribed_rpe: item.prescription.rpe ?? null,
    };

    if (existingRow && existingRow.status !== 'completed') {
      // UPDATE the existing (non-completed) row in-place (stage-and-swap).
      await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existingRow.id);
    } else {
      // No row at this position, OR the existing row is 'completed' (immutable):
      // preserve any logged data and add the newly-planned exercise as a fresh
      // 'assigned' row rather than silently dropping it.
      await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .insert({ ...payload, status: 'assigned' } as HelmLiftingSessionExerciseInsert);
    }
  }

  // Rows beyond the new count → mark 'skipped' (never delete).
  for (let i = flatExercises.length; i < existingRows.length; i++) {
    const stale = existingRows[i]!;
    if (stale.status !== 'completed' && stale.status !== 'skipped') {
      await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', stale.id);
    }
  }
}

// =============================================================================
// saveLiftSessionPlan
// =============================================================================

/**
 * Persist a coach-authored session plan for a given date, materializing one
 * helm_lifting_session + session_exercises per resolved athlete.
 *
 * When groupId is supplied, all members of that group receive sessions.
 * When only teamId is supplied, all team members receive sessions.
 *
 * Sessions are upserted by (athlete_id, scheduled_date, title). Exercises
 * within each session are stage-and-swapped by order index (see helper above).
 *
 * Gated: can_manage_lifting.
 */
export const saveLiftSessionPlan = withBaseballAction(
  'saveLiftSessionPlan',
  { featureArea: 'baseball-lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof saveLiftSessionPlanSchema>,
  ): Promise<BuilderActionResult> => {
    const input = saveLiftSessionPlanSchema.parse(raw);

    // Defense-in-depth: the plan's teamId must match the auth-resolved active team.
    if (input.teamId !== ctx.targetTeamId) {
      throw new BaseballActionError('Plan team does not match your active team context.');
    }

    const supabase = await createClient();

    // Resolve org context for helm_lifting_* tables.
    const liftCtx = await resolveBaseballLiftingOrg(ctx.targetTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    // Resolve player IDs from group or team.
    let playerIds: string[] = [];
    if (input.groupId) {
      // helm_lifting_group_members stores the helm athlete id directly, so
      // reverse it through helm_lifting_athletes.sport_player_id to land back
      // in baseball_players.id — the space the rest of this action (and the
      // input.playerIds intersection filter below) operates in.
      const { data: memberRows } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .select('athlete_id')
        .eq('group_id', input.groupId) as { data: Array<{ athlete_id: string }> | null };
      const memberAthleteIds = [...new Set((memberRows ?? []).map((m) => m.athlete_id))];

      if (memberAthleteIds.length > 0) {
        const { data: athleteRows } = await fromUntyped(supabase, 'helm_lifting_athletes')
          .select('sport_player_id')
          .in('id', memberAthleteIds) as { data: Array<{ sport_player_id: string | null }> | null };
        playerIds = [...new Set(
          (athleteRows ?? [])
            .map((a) => a.sport_player_id)
            .filter((id): id is string => Boolean(id)),
        )];
      }
    } else {
      const { data: members } = await supabase
        .from('baseball_team_members')
        .select('player_id')
        .eq('team_id', ctx.targetTeamId) as { data: Array<{ player_id: string }> | null };
      playerIds = [...new Set((members ?? []).map((m) => m.player_id))];
    }

    // If the caller supplied a player-ID subset, restrict to the intersection
    // with the resolved scope.  Callers cannot expand scope beyond what the
    // group/team membership already grants.  An explicitly-provided empty set
    // means "nobody" (count: 0) — it must NOT fall back to the whole team/group.
    if (input.playerIds) {
      const requested = new Set(input.playerIds);
      playerIds = playerIds.filter((id) => requested.has(id));
    }

    if (playerIds.length === 0) {
      revalidatePath(BUILDER);
      return { success: true, count: 0 };
    }

    // Resolve baseball_players.id → helm_lifting_athletes.id.
    const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, playerIds);

    // Flatten the block/exercise tree into an ordered list once (shared across athletes).
    const flatExercises = flattenBlocks(input.blocks);

    // Batch-resolve exercise name snapshots ONCE — avoids an N+1 of
    // (athletes × exercises) single-row lookups inside the per-athlete loop.
    const uniqueExerciseIds = [...new Set(flatExercises.map((e) => e.exerciseId))];
    const nameById = new Map<string, string>();
    if (uniqueExerciseIds.length > 0) {
      const { data: exLibRows } = await fromUntyped(supabase, 'helm_lifting_exercises')
        .select('id, name')
        .in('id', uniqueExerciseIds) as { data: Array<{ id: string; name: string }> | null };
      for (const row of exLibRows ?? []) {
        if (row.id && row.name) nameById.set(row.id, row.name);
      }
    }

    let upsertedCount = 0;

    for (const playerId of playerIds) {
      const athleteId = athleteMap[playerId];
      if (!athleteId) continue; // player not yet seeded in helm — skip gracefully

      // Upsert session: (athlete_id, scheduled_date, title) uniqueness.
      // program_assignment_id is null for builder-authored sessions.
      const sessionPayload: HelmLiftingSessionInsert = {
        organization_id: liftCtx.organizationId,
        sport: 'baseball',
        team_id: ctx.targetTeamId,
        athlete_id: athleteId,
        title: input.title,
        scheduled_date: input.date,
        status: input.status,
        program_assignment_id: null,
      };

      // Check for existing session (dedupe by athlete+date+title).
      const { data: existingSession } = await fromUntyped(supabase, 'helm_lifting_sessions')
        .select('id, status')
        .eq('athlete_id', athleteId)
        .eq('scheduled_date', input.date)
        .eq('title', input.title)
        .is('program_assignment_id', null)
        .maybeSingle() as { data: { id: string; status: string } | null };

      let sessionId: string | undefined;

      if (existingSession) {
        // Update status if not completed (preserve completed sessions).
        if (existingSession.status !== 'completed') {
          await fromUntyped(supabase, 'helm_lifting_sessions')
            .update({ status: input.status, updated_at: new Date().toISOString() })
            .eq('id', existingSession.id);
        }
        sessionId = existingSession.id;
      } else {
        const { data: newSession, error: sessionErr } = await fromUntyped(
          supabase,
          'helm_lifting_sessions',
        )
          .insert(sessionPayload)
          .select('id')
          .maybeSingle() as { data: { id: string } | null; error: unknown };

        if (sessionErr) throw sessionErr;
        sessionId = newSession?.id;
        upsertedCount++;
      }

      // Stage-and-swap exercises for this session.
      if (sessionId && flatExercises.length > 0) {
        await upsertSessionExercises(supabase, sessionId, flatExercises, nameById);
      }
    }

    revalidatePath(BUILDER);
    revalidatePath(PERFORMANCE);
    revalidatePath(PLAYER_LIFT);
    return { success: true, count: upsertedCount };
  },
);

// =============================================================================
// createExercise
// =============================================================================

/**
 * Add a new exercise to the team's helm_lifting_exercises library, including
 * all new stress-profile columns. Gated: can_manage_lifting.
 *
 * Note: `equipment` is stored as a comma-joined text value in the DB (the
 * column is `text | null`). `primary_body_regions`, `secondary_body_regions`,
 * and `stress_regions` require the new stress-profile columns to be LIVE in
 * prod; reads use fromUntyped.
 */
export const createBuilderExercise = withBaseballAction(
  'createBuilderExercise',
  { featureArea: 'baseball-lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof createExerciseSchema>,
  ): Promise<BuilderActionResult> => {
    const input = createExerciseSchema.parse(raw);

    const liftCtx = await resolveBaseballLiftingOrg(ctx.targetTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    const supabase = await createClient();

    // Build the insert payload including stress-profile columns.
    // fromUntyped is used so the stress columns (not in generated types) are sent.
    const payload: Record<string, unknown> = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      created_by_coach_id: ctx.activeCoachId,
      name: input.name,
      category: input.category ?? 'accessory',
      primary_pattern: input.movementPattern ?? null,
      // equipment: comma-joined (DB column is text | null)
      equipment: input.equipment && input.equipment.length > 0
        ? input.equipment.join(', ')
        : null,
      video_url: input.demoVideoUrl ?? null,
      instructions: input.instructions ?? null,
      is_global: false,
      is_active: true,
      // Stress-profile columns (LIVE in prod, not in generated types):
      throwing_arm_stress: (input.throwingArmStress ?? 'none') satisfies StressLevel,
      spine_loading: (input.spineLoading ?? 'none') satisfies StressLevel,
      lower_body_loading: (input.lowerBodyLoading ?? 'none') satisfies StressLevel,
      rotational_stress: (input.rotationalStress ?? 'none') satisfies StressLevel,
      grip_stress: (input.gripStress ?? 'none') satisfies StressLevel,
      is_pitcher_sensitive: input.isPitcherSensitive ?? false,
      // text[] columns — Supabase/Postgres handles JS arrays:
      primary_body_regions: input.primaryBodyRegions ?? [],
      secondary_body_regions: input.secondaryBodyRegions ?? [],
      stress_regions: input.stressRegions ?? [],
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .insert(payload)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (error) {
      const pgErr = error as { code?: string };
      if (pgErr.code === '23505') {
        throw new BaseballActionError('An exercise with that name already exists in this org.');
      }
      throw error;
    }

    revalidatePath(BUILDER);
    revalidatePath(PERFORMANCE);
    return { success: true, id: (data as { id: string }).id };
  },
);

// =============================================================================
// updateExercise
// =============================================================================

/**
 * Patch an existing exercise (PATCH semantics: absent fields are never nulled).
 * Includes all stress-profile columns. Gated: can_manage_lifting.
 */
export const updateBuilderExercise = withBaseballAction(
  'updateBuilderExercise',
  { featureArea: 'baseball-lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof updateExerciseSchema>,
  ): Promise<BuilderActionResult> => {
    const input = updateExerciseSchema.parse(raw);
    const { exerciseId, ...fields } = input;

    const supabase = await createClient();

    // Build a partial patch — only include keys that were explicitly provided.
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.movementPattern !== undefined) patch.primary_pattern = fields.movementPattern;
    if (fields.equipment !== undefined) {
      patch.equipment = fields.equipment.length > 0 ? fields.equipment.join(', ') : null;
    }
    if (fields.demoVideoUrl !== undefined) patch.video_url = fields.demoVideoUrl;
    if (fields.instructions !== undefined) patch.instructions = fields.instructions;
    if (fields.throwingArmStress !== undefined) patch.throwing_arm_stress = fields.throwingArmStress;
    if (fields.spineLoading !== undefined) patch.spine_loading = fields.spineLoading;
    if (fields.lowerBodyLoading !== undefined) patch.lower_body_loading = fields.lowerBodyLoading;
    if (fields.rotationalStress !== undefined) patch.rotational_stress = fields.rotationalStress;
    if (fields.gripStress !== undefined) patch.grip_stress = fields.gripStress;
    if (fields.isPitcherSensitive !== undefined) patch.is_pitcher_sensitive = fields.isPitcherSensitive;
    if (fields.primaryBodyRegions !== undefined) patch.primary_body_regions = fields.primaryBodyRegions;
    if (fields.secondaryBodyRegions !== undefined) patch.secondary_body_regions = fields.secondaryBodyRegions;
    if (fields.stressRegions !== undefined) patch.stress_regions = fields.stressRegions;

    // Scope the update to the staff member's own org exercises — RLS enforces this
    // additionally, but we add org + team scope for defense-in-depth.
    const liftCtx = await resolveBaseballLiftingOrg(ctx.targetTeamId);
    if (!liftCtx) {
      throw new BaseballActionError('Team has no lifting organization configured.');
    }

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .update(patch)
      .eq('id', exerciseId)
      .eq('organization_id', liftCtx.organizationId)
      .select('id')
      .maybeSingle() as { data: { id: string } | null; error: unknown };

    if (error) throw error;
    if (!data) {
      throw new BaseballActionError('Exercise not found or not editable.');
    }

    revalidatePath(BUILDER);
    revalidatePath(PERFORMANCE);
    return { success: true, id: exerciseId };
  },
);

// =============================================================================
// getGroupAvailabilityForWeek
// =============================================================================

const getGroupAvailabilityForWeekSchema = z.object({
  teamId: uuid,
  groupId: uuid.optional().nullable(),
  weekOf: ymd,
});

/**
 * Return per-player block-schedule cells for the week starting at `weekOf`.
 *
 * Delegates to the `getGroupAvailability` read-model, which resolves games,
 * practices, and player-level availability holds from baseball_games,
 * baseball_events, and baseball_availability_statuses.
 *
 * Gated: can_manage_lifting.  Exposed as a server action so clients can
 * refetch on week-navigation without a full page reload.
 */
export const getGroupAvailabilityForWeek = withBaseballAction(
  'getGroupAvailabilityForWeek',
  { featureArea: 'baseball-lifting', requiredCapability: 'can_manage_lifting' },
  async (
    ctx,
    raw: z.input<typeof getGroupAvailabilityForWeekSchema>,
  ): Promise<GroupAvailabilityCell[]> => {
    const input = getGroupAvailabilityForWeekSchema.parse(raw);

    // Defense-in-depth: the request's teamId must match the auth-resolved
    // active team so callers cannot read another team's schedule.
    if (input.teamId !== ctx.targetTeamId) {
      throw new BaseballActionError('Team does not match your active team context.');
    }

    const scope: LiftBuilderScope = input.groupId
      ? { groupId: input.groupId }
      : { teamId: input.teamId };

    return getGroupAvailability(scope, input.weekOf);
  },
);
