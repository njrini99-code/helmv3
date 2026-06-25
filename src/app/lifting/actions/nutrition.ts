'use server';

// =============================================================================
// src/app/lifting/actions/nutrition.ts
//
// Helm Lifting Lab — Nutrition Plan server actions (spec §10, §16).
//
//   uploadNutritionPlan      — coach creates a plan; uploads file to Storage
//                              (document), saves a link, or stores a note.
//   assignNutritionPlan      — coach assigns an existing plan to team/group/athlete.
//   archiveNutritionPlan     — coach soft-archives a plan and its assignments.
//   acknowledgeNutritionPlan — athlete marks their own assignment as seen.
//   getPlayerNutritionPlans  — athlete fetches their own active plans w/ signed URLs.
//   getCoachNutritionPlans   — coach fetches all org plans w/ ack X/Y counts.
//
// Storage bucket: 'lifting-nutrition' (private, RLS-enforced on the bucket).
// Storage path:   <org_id>/<plan_id>/<filename>
//
// All mutations use withLiftingAction; reads use fromUntyped.
// No 'any' leaking into exported types; no console.log.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import type {
  NutritionPlan,
  NutritionPlanAssignment,
  NutritionPlanInsert,
  NutritionPlanAssignmentInsert,
  PlanType,
  NutritionVisibility,
  AssignmentType,
} from '@/lib/types/helm-lifting-checkins';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const NUTRITION_BUCKET = 'lifting-nutrition';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

const LIFTING_NUTRITION_PATH = '/lifting/dashboard/nutrition';
const LIFTING_DASHBOARD_PATH = '/lifting/dashboard';
// Baseball player + coach paths that surface nutrition plans
const BASEBALL_PLAYER_PATH = '/baseball/dashboard/player-today';
const BASEBALL_COACH_PATH = '/baseball/dashboard';

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();

const uploadNutritionPlanSchema = z.object({
  orgId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  planType: z.enum(['document', 'link', 'note']),
  /** base64-encoded file content — required when planType = 'document'. */
  fileBase64: z.string().optional().nullable(),
  fileName: z.string().trim().max(255).optional().nullable(),
  fileType: z.string().trim().max(100).optional().nullable(),
  fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
  /** Required when planType = 'link'. */
  externalUrl: z.string().url().max(2000).optional().nullable(),
  /** Free-text body — required when planType = 'note'. */
  noteBody: z.string().trim().max(5000).optional().nullable(),
  visibility: z
    .enum(['athlete_and_performance_staff', 'performance_staff', 'head_coach_only'])
    .default('athlete_and_performance_staff'),
  teamId: uuid.optional().nullable(),
  /** Publish immediately (status = 'published') or save as draft. */
  publish: z.boolean().default(false),
});

const assignNutritionPlanSchema = z.object({
  orgId: uuid,
  planId: uuid,
  assignmentType: z.enum(['team', 'group', 'athlete']),
  teamId: uuid.optional().nullable(),
  groupId: uuid.optional().nullable(),
  athleteId: uuid.optional().nullable(),
  sport: z.enum(['baseball', 'golf']),
});

const archiveNutritionPlanSchema = z.object({
  orgId: uuid,
  planId: uuid,
});

const acknowledgeNutritionPlanSchema = z.object({
  orgId: uuid,
  assignmentId: uuid,
});

const getPlayerNutritionPlansSchema = z.object({
  orgId: uuid,
  athleteId: uuid,
});

const getCoachNutritionPlansSchema = z.object({
  orgId: uuid,
  sport: z.enum(['baseball', 'golf']).optional().nullable(),
  includeArchived: z.boolean().default(false),
});

// -----------------------------------------------------------------------------
// Return types
// -----------------------------------------------------------------------------

export interface UploadNutritionPlanResult {
  success: boolean;
  planId?: string;
  storagePath?: string;
  error?: string;
}

export interface AssignNutritionPlanResult {
  success: boolean;
  assignmentId?: string;
  error?: string;
}

export interface ArchiveNutritionPlanResult {
  success: boolean;
  error?: string;
}

export interface AcknowledgeNutritionPlanResult {
  success: boolean;
  error?: string;
}

/** A player-facing plan card with an optional signed download URL. */
export interface PlayerNutritionPlanCard {
  plan: NutritionPlan;
  assignment: NutritionPlanAssignment;
  /** Pre-signed download URL; null for link/note plans or if signing failed. */
  signedUrl: string | null;
}

/** A coach-facing plan row with acknowledgment counts. */
export interface CoachNutritionPlanRow {
  plan: NutritionPlan;
  /** Total number of athlete assignments for this plan. */
  assignmentCount: number;
  /** Count of assignments with acknowledged_at set. */
  acknowledgedCount: number;
  /** Most recent assignment timestamp (ISO). */
  lastAssignedAt: string | null;
}

// -----------------------------------------------------------------------------
// Helper — revalidate all nutrition-related paths
// -----------------------------------------------------------------------------

function revalidateNutritionPaths(): void {
  revalidatePath(LIFTING_NUTRITION_PATH);
  revalidatePath(LIFTING_DASHBOARD_PATH);
  revalidatePath(BASEBALL_PLAYER_PATH);
  revalidatePath(BASEBALL_COACH_PATH);
}

// -----------------------------------------------------------------------------
// 1. uploadNutritionPlan
//
// Coach creates a nutrition plan. For 'document' plans the file is uploaded to
// the 'lifting-nutrition' Storage bucket at <org_id>/<plan_id>/<filename>.
// For 'link' plans, external_url is saved. For 'note' plans the body goes into
// description. The plan row is inserted first (to get the plan_id for the path)
// then the Storage upload happens.
// -----------------------------------------------------------------------------

export const uploadNutritionPlan = withLiftingAction(
  'uploadNutritionPlan',
  {
    featureArea: 'lifting-nutrition',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof uploadNutritionPlanSchema>): Promise<UploadNutritionPlanResult> => {
    const input = uploadNutritionPlanSchema.parse(raw);
    const supabase = await createClient();

    // Validate plan-type-specific requirements.
    if (input.planType === 'document' && !input.fileBase64) {
      throw new LiftingActionError('A file is required for document-type nutrition plans.');
    }
    if (input.planType === 'link' && !input.externalUrl) {
      throw new LiftingActionError('An external URL is required for link-type nutrition plans.');
    }
    if (input.planType === 'note' && !input.noteBody) {
      throw new LiftingActionError('Note body is required for note-type nutrition plans.');
    }

    // Resolve coach record for created_by_coach_id.
    const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
      .select('id, sport')
      .eq('user_id', ctx.user.id)
      .eq('organization_id', ctx.orgId)
      .eq('status', 'active')
      .maybeSingle() as { data: { id: string; sport: string } | null };

    const sport = (coachRow?.sport ?? 'baseball') as 'baseball' | 'golf';
    const now = new Date().toISOString();

    // Insert the plan row first (generates the id for the Storage path).
    const planInsert: NutritionPlanInsert = {
      organization_id: ctx.orgId,
      sport,
      team_id: input.teamId ?? null,
      created_by_coach_id: coachRow?.id ?? null,
      title: input.title,
      description: input.planType === 'note' ? (input.noteBody ?? null) : (input.description ?? null),
      plan_type: input.planType as PlanType,
      storage_path: null,
      file_name: input.fileName ?? null,
      file_type: input.fileType ?? null,
      file_size: input.fileSizeBytes ?? null,
      external_url: input.planType === 'link' ? (input.externalUrl ?? null) : null,
      visibility: input.visibility as NutritionVisibility,
      status: input.publish ? 'published' : 'draft',
      published_at: input.publish ? now : null,
    };

    const { data: planRow, error: insertErr } = await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
      .insert(planInsert)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (insertErr || !planRow) {
      throw insertErr instanceof Error ? insertErr : new LiftingActionError('Failed to create nutrition plan.');
    }

    const planId = planRow.id;
    let storagePath: string | null = null;

    // Upload file for 'document' plan type.
    if (input.planType === 'document' && input.fileBase64 && input.fileName) {
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath = `${ctx.orgId}/${planId}/${safeName}`;

      // Decode base64 to Uint8Array for Supabase Storage.
      const binaryStr = atob(input.fileBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const { error: uploadErr } = await supabase.storage
        .from(NUTRITION_BUCKET)
        .upload(storagePath, bytes, {
          contentType: input.fileType ?? 'application/octet-stream',
          upsert: false,
        });

      if (uploadErr) {
        // Best-effort cleanup: remove the plan row so we don't leave orphans.
        await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
          .delete()
          .eq('id', planId);
        throw new LiftingActionError(`File upload failed: ${uploadErr.message}`);
      }

      // Patch storage_path back onto the plan row.
      await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
        .update({ storage_path: storagePath })
        .eq('id', planId);
    }

    revalidateNutritionPaths();
    return { success: true, planId, storagePath: storagePath ?? undefined };
  },
);

// -----------------------------------------------------------------------------
// 2. assignNutritionPlan
//
// Coach assigns a published plan to a team, group, or individual athlete.
// Inserts a row into helm_lifting_nutrition_plan_assignments. Idempotent on
// (plan_id, assignment_type, team_id, group_id, athlete_id) — duplicate
// assignments for the same target silently succeed.
// -----------------------------------------------------------------------------

export const assignNutritionPlan = withLiftingAction(
  'assignNutritionPlan',
  {
    featureArea: 'lifting-nutrition',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof assignNutritionPlanSchema>): Promise<AssignNutritionPlanResult> => {
    const input = assignNutritionPlanSchema.parse(raw);
    const supabase = await createClient();

    // Validate plan exists in this org and is published.
    const { data: plan } = await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
      .select('id, status')
      .eq('id', input.planId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string; status: string } | null };

    if (!plan) throw new LiftingActionError('Nutrition plan not found in this org.');
    if (plan.status === 'archived') throw new LiftingActionError('Cannot assign an archived plan.');

    // Validate assignment target fields.
    if (input.assignmentType === 'athlete' && !input.athleteId) {
      throw new LiftingActionError('athleteId is required for athlete assignments.');
    }
    if (input.assignmentType === 'group' && !input.groupId) {
      throw new LiftingActionError('groupId is required for group assignments.');
    }
    if (input.assignmentType === 'team' && !input.teamId) {
      throw new LiftingActionError('teamId is required for team assignments.');
    }

    // Resolve coach record for assigned_by_coach_id.
    const { data: coachRow } = await fromUntyped(supabase, 'helm_lifting_coaches')
      .select('id')
      .eq('user_id', ctx.user.id)
      .eq('organization_id', ctx.orgId)
      .eq('status', 'active')
      .maybeSingle() as { data: { id: string } | null };

    const assignmentInsert: NutritionPlanAssignmentInsert = {
      plan_id: input.planId,
      organization_id: ctx.orgId,
      sport: input.sport,
      assignment_type: input.assignmentType as AssignmentType,
      team_id: input.teamId ?? null,
      group_id: input.groupId ?? null,
      athlete_id: input.athleteId ?? null,
      assigned_by_coach_id: coachRow?.id ?? null,
      assigned_at: new Date().toISOString(),
      acknowledged_at: null,
    };

    const { data: assignment, error: assignErr } = await fromUntyped(
      supabase,
      'helm_lifting_nutrition_plan_assignments',
    )
      .insert(assignmentInsert)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };

    if (assignErr) {
      throw assignErr instanceof Error ? assignErr : new LiftingActionError('Failed to assign nutrition plan.');
    }

    revalidateNutritionPaths();
    return { success: true, assignmentId: (assignment as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 3. archiveNutritionPlan
//
// Coach soft-archives a plan. The plan row status → 'archived'. No cascade
// delete on assignments; players lose access via RLS policy on the plan status.
// -----------------------------------------------------------------------------

export const archiveNutritionPlan = withLiftingAction(
  'archiveNutritionPlan',
  {
    featureArea: 'lifting-nutrition',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (ctx, raw: z.input<typeof archiveNutritionPlanSchema>): Promise<ArchiveNutritionPlanResult> => {
    const input = archiveNutritionPlanSchema.parse(raw);
    const supabase = await createClient();

    const { error } = await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', input.planId)
      .eq('organization_id', ctx.orgId);

    if (error) {
      throw error instanceof Error ? error : new LiftingActionError('Failed to archive nutrition plan.');
    }

    revalidateNutritionPaths();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 4. acknowledgeNutritionPlan
//
// Athlete sets acknowledged_at on their own assignment row. Only the athlete
// whose assignment row it is (enforced via RLS athlete_id = auth.uid() linkage)
// may call this. We verify org membership via the athlete row.
// -----------------------------------------------------------------------------

export const acknowledgeNutritionPlan = withLiftingAction(
  'acknowledgeNutritionPlan',
  {
    featureArea: 'lifting-nutrition',
    requireEdit: false, // athlete self-action; RLS enforces ownership
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (
    ctx,
    raw: z.input<typeof acknowledgeNutritionPlanSchema>,
  ): Promise<AcknowledgeNutritionPlanResult> => {
    const input = acknowledgeNutritionPlanSchema.parse(raw);
    const supabase = await createClient();

    // Resolve the athlete row for this user within the org.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id')
      .eq('organization_id', ctx.orgId)
      .eq('is_active', true)
      // sport_player_id is the baseball_players.id; the auth user could also be
      // directly linked via user_id — accept either (RLS handles the rest).
      .maybeSingle() as { data: { id: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete record not found for this org.');

    // Verify the assignment belongs to this athlete and this org.
    const { data: assignment } = await fromUntyped(
      supabase,
      'helm_lifting_nutrition_plan_assignments',
    )
      .select('id, athlete_id, acknowledged_at')
      .eq('id', input.assignmentId)
      .eq('organization_id', ctx.orgId)
      .eq('athlete_id', athlete.id)
      .maybeSingle() as {
        data: { id: string; athlete_id: string; acknowledged_at: string | null } | null;
      };

    if (!assignment) {
      throw new LiftingActionError('Assignment not found or does not belong to you.');
    }

    // Idempotent: if already acknowledged, return success.
    if (assignment.acknowledged_at) {
      return { success: true };
    }

    const { error } = await fromUntyped(supabase, 'helm_lifting_nutrition_plan_assignments')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', input.assignmentId);

    if (error) {
      throw error instanceof Error ? error : new LiftingActionError('Failed to acknowledge plan.');
    }

    revalidatePath(LIFTING_DASHBOARD_PATH);
    revalidatePath(BASEBALL_PLAYER_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 5. getPlayerNutritionPlans
//
// Returns the athlete's active (published) nutrition plan assignments with
// pre-signed download URLs for document-type plans. Ordered by assigned_at desc
// so the most recent plan appears first.
// -----------------------------------------------------------------------------

export const getPlayerNutritionPlans = withLiftingAction(
  'getPlayerNutritionPlans',
  {
    featureArea: 'lifting-nutrition',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (
    ctx,
    raw: z.input<typeof getPlayerNutritionPlansSchema>,
  ): Promise<PlayerNutritionPlanCard[]> => {
    const input = getPlayerNutritionPlansSchema.parse(raw);
    const supabase = await createClient();

    // Validate the athlete is in this org.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id, organization_id')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .eq('is_active', true)
      .maybeSingle() as { data: { id: string; organization_id: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    // Fetch athlete-level assignments.
    const { data: assignments } = await fromUntyped(
      supabase,
      'helm_lifting_nutrition_plan_assignments',
    )
      .select('*')
      .eq('athlete_id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .order('assigned_at', { ascending: false })
      .limit(50) as { data: NutritionPlanAssignment[] | null };

    if (!assignments || assignments.length === 0) return [];

    const planIds = [...new Set(assignments.map((a) => a.plan_id))];

    // Fetch associated plans (published only for players).
    const { data: plans } = await fromUntyped(supabase, 'helm_lifting_nutrition_plans')
      .select('*')
      .in('id', planIds)
      .eq('organization_id', ctx.orgId)
      .eq('status', 'published') as { data: NutritionPlan[] | null };

    if (!plans || plans.length === 0) return [];

    const planMap = new Map(plans.map((p) => [p.id, p]));

    // Generate signed URLs for document plans.
    const cards: PlayerNutritionPlanCard[] = [];

    for (const assignment of assignments) {
      const plan = planMap.get(assignment.plan_id);
      if (!plan) continue; // draft or archived — skip

      let signedUrl: string | null = null;

      if (plan.plan_type === 'document' && plan.storage_path) {
        const { data: urlData } = await supabase.storage
          .from(NUTRITION_BUCKET)
          .createSignedUrl(plan.storage_path, SIGNED_URL_TTL_SECONDS);
        signedUrl = urlData?.signedUrl ?? null;
      }

      cards.push({ plan, assignment, signedUrl });
    }

    return cards;
  },
);

// -----------------------------------------------------------------------------
// 6. getCoachNutritionPlans
//
// Returns all nutrition plans for the org with acknowledged X/Y counts derived
// from the assignments table. Coaches see all statuses (unless includeArchived
// is false, in which case archived plans are excluded).
// -----------------------------------------------------------------------------

export const getCoachNutritionPlans = withLiftingAction(
  'getCoachNutritionPlans',
  {
    featureArea: 'lifting-nutrition',
    requireEdit: false,
    orgFrom: (...args) => (args[0] as { orgId?: string | null })?.orgId ?? null,
  },
  async (
    ctx,
    raw: z.input<typeof getCoachNutritionPlansSchema>,
  ): Promise<CoachNutritionPlanRow[]> => {
    const input = getCoachNutritionPlansSchema.parse(raw);
    const supabase = await createClient();

    // Build plan query.
    let planQuery = fromUntyped(supabase, 'helm_lifting_nutrition_plans')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (input.sport) {
      planQuery = planQuery.eq('sport', input.sport);
    }
    if (!input.includeArchived) {
      planQuery = planQuery.neq('status', 'archived');
    }

    const { data: plans } = await planQuery as { data: NutritionPlan[] | null };
    if (!plans || plans.length === 0) return [];

    const planIds = plans.map((p) => p.id);

    // Fetch all assignments for these plans to compute ack counts.
    const { data: assignments } = await fromUntyped(
      supabase,
      'helm_lifting_nutrition_plan_assignments',
    )
      .select('plan_id, athlete_id, acknowledged_at, assigned_at')
      .in('plan_id', planIds)
      .eq('organization_id', ctx.orgId)
      .not('athlete_id', 'is', null) as {
        data: Array<{
          plan_id: string;
          athlete_id: string | null;
          acknowledged_at: string | null;
          assigned_at: string;
        }> | null;
      };

    // Aggregate per-plan stats.
    const statsByPlan = new Map<
      string,
      { total: number; acked: number; latestAssignedAt: string | null }
    >();

    for (const assignment of assignments ?? []) {
      const existing = statsByPlan.get(assignment.plan_id) ?? {
        total: 0,
        acked: 0,
        latestAssignedAt: null,
      };
      existing.total += 1;
      if (assignment.acknowledged_at) existing.acked += 1;
      if (
        !existing.latestAssignedAt ||
        assignment.assigned_at > existing.latestAssignedAt
      ) {
        existing.latestAssignedAt = assignment.assigned_at;
      }
      statsByPlan.set(assignment.plan_id, existing);
    }

    return plans.map((plan) => {
      const stats = statsByPlan.get(plan.id) ?? {
        total: 0,
        acked: 0,
        latestAssignedAt: null,
      };
      return {
        plan,
        assignmentCount: stats.total,
        acknowledgedCount: stats.acked,
        lastAssignedAt: stats.latestAssignedAt,
      };
    });
  },
);
