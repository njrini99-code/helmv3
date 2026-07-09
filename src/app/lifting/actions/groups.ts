'use server';

// =============================================================================
// src/app/lifting/actions/groups.ts
//
// Helm Lifting Lab — strength group CRUD + membership management.
//
//   createGroup      — create a new static or dynamic group
//   updateGroup      — rename, describe, or change group type / rules
//   deleteGroup      — soft-delete (is_active=false) if no active members
//   addGroupMember   — add one athlete to a static group
//   removeGroupMember — remove one athlete from a group
//
// All writes wrapped in withLiftingAction with requireEdit:true.
// No destructive deletes of member rows: removeGroupMember sets ends_at=now()
// (soft-remove, preserving history). The group itself is never hard-deleted —
// only archived via is_active=false.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withLiftingAction, LiftingActionError } from '@/lib/lifting/with-lifting-action';
import type {
  HelmLiftingGroupInsert,
  HelmLiftingGroupUpdate,
  HelmLiftingGroupMemberInsert,
  HelmLiftingGroupType,
} from '@/lib/types/helm-lifting-data';
import type { Json } from '@/lib/types';

const GROUPS_PATH = '/lifting/dashboard/groups';

// Baseball Wave C renders these same helm_lifting_groups reads at
// /baseball/dashboard/performance/groups (mirroring the pattern in
// programs.ts) — bust that portal's RSC cache alongside the lifting one.
const BASEBALL_GROUPS_PATH = '/baseball/dashboard/performance/groups';

// -----------------------------------------------------------------------------
// Shared result
// -----------------------------------------------------------------------------

export interface GroupActionResult {
  success: boolean;
  id?: string;
  error?: string;
}

// -----------------------------------------------------------------------------
// Validation schemas
// -----------------------------------------------------------------------------

const uuid = z.string().uuid();

const createGroupSchema = z.object({
  orgId: uuid.optional(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  groupType: z.enum(['static', 'dynamic', 'imported', 'temporary']).optional(),
  sport: z.enum(['baseball', 'golf']).optional(),
  teamId: uuid.optional().nullable(),
  ruleJson: z.record(z.string(), z.unknown()).optional().nullable(),
  initialAthleteIds: z.array(uuid).max(500).optional(),
});

const updateGroupSchema = z.object({
  orgId: uuid.optional(),
  groupId: uuid,
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  groupType: z.enum(['static', 'dynamic', 'imported', 'temporary']).optional(),
  ruleJson: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
});

const deleteGroupSchema = z.object({ orgId: uuid.optional(), groupId: uuid });

const addMemberSchema = z.object({
  orgId: uuid.optional(),
  groupId: uuid,
  athleteId: uuid,
  source: z.enum(['manual', 'rule', 'import']).optional(),
});

const removeMemberSchema = z.object({
  orgId: uuid.optional(),
  groupId: uuid,
  athleteId: uuid,
});

// -----------------------------------------------------------------------------
// Helper: verify group belongs to org
// -----------------------------------------------------------------------------

async function assertGroupInOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  orgId: string,
): Promise<{ id: string; name: string; group_type: string; is_active: boolean }> {
  const { data } = await fromUntyped(supabase, 'helm_lifting_groups')
    .select('id, organization_id, name, group_type, is_active')
    .eq('id', groupId)
    .eq('organization_id', orgId)
    .maybeSingle() as {
      data: { id: string; organization_id: string; name: string; group_type: string; is_active: boolean } | null
    };

  if (!data) throw new LiftingActionError('Group not found or not accessible.');
  return data;
}

// Dynamic groups are rule-managed (membership/rules computed off `rule_json`),
// so no mutation path in this file may touch them directly. The user-facing
// message must match what the caller is actually trying to do — a coach
// renaming or deleting a dynamic group should not be told "membership can't
// be edited" (that wording is for addGroupMember/removeGroupMember only).
function assertGroupIsEditable(group: { group_type: string }, message: string): void {
  if (group.group_type === 'dynamic') {
    throw new LiftingActionError(message);
  }
}

// -----------------------------------------------------------------------------
// 1. createGroup
// -----------------------------------------------------------------------------

export const createGroup = withLiftingAction(
  'createGroup',
  {
    featureArea: 'lifting-groups',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof createGroupSchema>): Promise<GroupActionResult> => {
    const input = createGroupSchema.parse(raw);
    const supabase = await createClient();

    const payload: HelmLiftingGroupInsert = {
      organization_id: ctx.orgId,
      sport: input.sport ?? 'baseball',
      team_id: input.teamId ?? null,
      name: input.name,
      description: input.description ?? null,
      group_type: (input.groupType ?? 'static') as HelmLiftingGroupType,
      rule_json: (input.ruleJson ?? {}) as Json,
      created_by_coach_id: ctx.access.coachRow?.id ?? null,
      is_active: true,
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;
    const groupId = (data as { id: string }).id;

    // Seed initial members if provided.
    if (input.initialAthleteIds && input.initialAthleteIds.length > 0) {
      const memberPayloads: HelmLiftingGroupMemberInsert[] = input.initialAthleteIds.map(
        (athleteId) => ({
          group_id: groupId,
          athlete_id: athleteId,
          source: 'manual' as const,
          added_by_coach_id: ctx.access.coachRow?.id ?? null,
        }),
      );

      // ON CONFLICT DO NOTHING — idempotent
      await fromUntyped(supabase, 'helm_lifting_group_members')
        .upsert(memberPayloads, { onConflict: 'group_id,athlete_id', ignoreDuplicates: true });
    }

    revalidatePath(GROUPS_PATH);
    revalidatePath(BASEBALL_GROUPS_PATH);
    return { success: true, id: groupId };
  },
);

// -----------------------------------------------------------------------------
// 2. updateGroup
// -----------------------------------------------------------------------------

export const updateGroup = withLiftingAction(
  'updateGroup',
  {
    featureArea: 'lifting-groups',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof updateGroupSchema>): Promise<GroupActionResult> => {
    const input = updateGroupSchema.parse(raw);
    const supabase = await createClient();

    const group = await assertGroupInOrg(supabase, input.groupId, ctx.orgId);
    assertGroupIsEditable(
      group,
      "Dynamic groups are rule-managed; they can't be edited manually.",
    );

    const update: HelmLiftingGroupUpdate = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.groupType !== undefined && { group_type: input.groupType as HelmLiftingGroupType }),
      ...(input.ruleJson !== undefined && { rule_json: (input.ruleJson ?? {}) as Json }),
      ...(input.isActive !== undefined && { is_active: input.isActive }),
      updated_at: new Date().toISOString(),
    };

    const { error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .update(update)
      .eq('id', input.groupId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;
    revalidatePath(GROUPS_PATH);
    revalidatePath(BASEBALL_GROUPS_PATH);
    return { success: true, id: input.groupId };
  },
);

// -----------------------------------------------------------------------------
// 3. deleteGroup — soft-delete (is_active=false)
// -----------------------------------------------------------------------------

export const deleteGroup = withLiftingAction(
  'deleteGroup',
  {
    featureArea: 'lifting-groups',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof deleteGroupSchema>): Promise<GroupActionResult> => {
    const { groupId } = deleteGroupSchema.parse(raw);
    const supabase = await createClient();

    const group = await assertGroupInOrg(supabase, groupId, ctx.orgId);
    assertGroupIsEditable(
      group,
      "Dynamic groups are rule-managed; they can't be deleted manually.",
    );

    // Soft delete.
    const { error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', groupId)
      .eq('organization_id', ctx.orgId);

    if (error) throw error;

    // Also end all active memberships.
    await fromUntyped(supabase, 'helm_lifting_group_members')
      .update({ ends_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .is('ends_at', null);

    revalidatePath(GROUPS_PATH);
    revalidatePath(BASEBALL_GROUPS_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// 4. addGroupMember
// -----------------------------------------------------------------------------

export const addGroupMember = withLiftingAction(
  'addGroupMember',
  {
    featureArea: 'lifting-groups',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof addMemberSchema>): Promise<GroupActionResult> => {
    const input = addMemberSchema.parse(raw);
    const supabase = await createClient();

    const group = await assertGroupInOrg(supabase, input.groupId, ctx.orgId);
    assertGroupIsEditable(
      group,
      "Dynamic groups are rule-managed; membership can't be edited manually.",
    );

    // Verify the athlete is in this org.
    const { data: athlete } = await fromUntyped(supabase, 'helm_lifting_athletes')
      .select('id')
      .eq('id', input.athleteId)
      .eq('organization_id', ctx.orgId)
      .maybeSingle() as { data: { id: string } | null };

    if (!athlete) throw new LiftingActionError('Athlete not found in this org.');

    // If there's an existing soft-removed member row, reactivate it.
    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .select('id, ends_at')
      .eq('group_id', input.groupId)
      .eq('athlete_id', input.athleteId)
      .maybeSingle() as { data: { id: string; ends_at: string | null } | null };

    if (existing) {
      if (existing.ends_at !== null) {
        // Reactivate.
        await fromUntyped(supabase, 'helm_lifting_group_members')
          .update({ ends_at: null })
          .eq('id', existing.id);
      }
      // Already active — no-op.
      revalidatePath(GROUPS_PATH);
      revalidatePath(BASEBALL_GROUPS_PATH);
      return { success: true, id: existing.id };
    }

    const payload: HelmLiftingGroupMemberInsert = {
      group_id: input.groupId,
      athlete_id: input.athleteId,
      source: (input.source ?? 'manual') as 'manual' | 'rule' | 'import',
      added_by_coach_id: ctx.access.coachRow?.id ?? null,
    };

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;
    revalidatePath(GROUPS_PATH);
    revalidatePath(BASEBALL_GROUPS_PATH);
    return { success: true, id: (data as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// 5. removeGroupMember — soft-remove (sets ends_at, never hard-deletes)
// -----------------------------------------------------------------------------

export const removeGroupMember = withLiftingAction(
  'removeGroupMember',
  {
    featureArea: 'lifting-groups',
    requireEdit: true,
    orgFrom: (...args) => (args[0] as { orgId?: string })?.orgId,
  },
  async (ctx, raw: z.input<typeof removeMemberSchema>): Promise<GroupActionResult> => {
    const input = removeMemberSchema.parse(raw);
    const supabase = await createClient();

    const group = await assertGroupInOrg(supabase, input.groupId, ctx.orgId);
    assertGroupIsEditable(
      group,
      "Dynamic groups are rule-managed; membership can't be edited manually.",
    );

    // Soft-remove: set ends_at=now() on any active member row.
    const { error } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .update({ ends_at: new Date().toISOString() })
      .eq('group_id', input.groupId)
      .eq('athlete_id', input.athleteId)
      .is('ends_at', null);

    if (error) throw error;
    revalidatePath(GROUPS_PATH);
    revalidatePath(BASEBALL_GROUPS_PATH);
    return { success: true };
  },
);
