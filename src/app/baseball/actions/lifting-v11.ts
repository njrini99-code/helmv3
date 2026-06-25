'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/lifting-v11.ts
//
// V11 Premium Lifting server actions. EVERY action runs inside withBaseballAction
// so auth + active-team + (where set) server-side capability + Sentry scoping +
// central error logging are guaranteed. RLS on every V11 table backstops paths.
//
// Capability map (V11 corrected):
//   * Groups / exercises / programs / assignments / publish / availability /
//     maxes ........................ can_manage_lifting
//   * Player session lifecycle + set logging + readiness/soreness/bodyweight ...
//     NO requiredCapability (player-self write; RLS enforces ownership).
//
// PUBLISH = MATERIALIZE (spec L463): publishing a program-day assignment expands
// the template (sections + prescriptions) into concrete per-player sessions +
// session_exercises rows. We NEVER recompute template math on the player surface.
//
// NO destructive writes: upsert/stage-and-swap everywhere; the publish path
// upserts sessions on (program_assignment_id, player_id) and replaces a session's
// exercises via a non-destructive "skip removed, upsert present" pass guarded by
// status (no DELETE-then-INSERT in the publish path).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
// The V11 tables require fromUntyped (schema mismatch with generated types pending audit).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
import {
  withBaseballAction,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';
import { appendLiftTimelineEvent } from '@/lib/baseball/timeline-writer';
import { appendGroupAudit, type GroupAuditEntry } from '@/lib/baseball/lifting/group-audit-writer';
import {
  evaluateGroupRule,
  ruleHasPredicates,
  type RuleMatch,
} from '@/lib/baseball/lifting/strength-group-rules';
import {
  getStrengthGroupsBoard,
  DEFAULT_STRENGTH_GROUP_NAMES,
} from '@/lib/baseball/read-models/strength-groups';
import { getLiveWeightRoomData } from '@/lib/baseball/read-models/live-weight-room';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import type {
  BaseballStrengthGroupRules,
  BaseballStrengthGroupType,
  BaseballLiveWeightRoomData,
} from '@/lib/types/baseball-lifting-v11';

const PERFORMANCE = '/baseball/dashboard/performance';
const PLAYER_LIFT = '/baseball/dashboard/lift';
// The player Today screen mounts PlayerLiftToday, which now reads the SAME
// materialized baseball_lift_sessions this file writes — so publishing/logging a
// lift must revalidate Today too, not just the dedicated lift route.
const PLAYER_TODAY = '/baseball/player/today';

export interface ActionResult {
  success: boolean;
  id?: string;
  count?: number;
  error?: string;
}

/** The top-performing set from a completed session (max load, for H2 display). */
export interface TopSet {
  name: string;
  load: number;
  reps: number;
  unit: string;
}

/** Extended result returned by completeLiftSession (H2). */
export interface CompleteSessionResult extends ActionResult {
  /** Number of PRs detected during the session. Mirrors count for convenience. */
  prCount: number;
  /** The highest-load set logged in this session, null when no weighted sets. */
  topSet: TopSet | null;
  /** Average RPE across all logged sets that reported one; null when none. */
  rpeAverage: number | null;
}

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// ============================================================================
// GROUPS
// ============================================================================

const ruleJsonSchema = z.record(z.string(), z.unknown());

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  groupType: z.enum(['static', 'dynamic', 'imported', 'temporary']).optional(),
  ruleJson: ruleJsonSchema.optional(),
  memberPlayerIds: z.array(uuid).max(200).optional(),
});

/**
 * Resolve a group's team (defense in depth) and assert it matches the active
 * team. Every membership mutation gates on this so a forged group id from another
 * team is rejected before any write — RLS backstops it, this fails fast + cleanly.
 */
async function assertGroupOnTeam(
  supabase: Db,
  groupId: string,
  teamId: string,
): Promise<{ id: string; name: string; group_type: BaseballStrengthGroupType }> {
  const { data, error } = await supabase
    .from('baseball_strength_groups')
    .select('id, team_id, name, group_type')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BaseballActionError('Group not found.');
  const g = data as { id: string; team_id: string; name: string; group_type: BaseballStrengthGroupType };
  if (g.team_id !== teamId) throw new BaseballActionError('Group belongs to another team.');
  return { id: g.id, name: g.name, group_type: g.group_type };
}

export const createStrengthGroup = withBaseballAction(
  'createStrengthGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof createGroupSchema>): Promise<ActionResult> => {
    const input = createGroupSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const groupType = input.groupType ?? 'static';

    const { data, error } = await supabase
      .from('baseball_strength_groups')
      .insert({
        team_id: ctx.targetTeamId,
        name: input.name,
        description: input.description ?? null,
        group_type: groupType,
        rule_json: input.ruleJson ?? {},
        created_by_coach_id: ctx.activeCoachId,
      })
      .select('id')
      .single();
    if (error) throw error;
    const groupId = (data as { id: string }).id;

    const auditEntries: GroupAuditEntry[] = [
      {
        eventType: 'group_created',
        source: groupType === 'dynamic' ? 'rule' : 'manual',
        detail: `Created ${groupType} group "${input.name}".`,
        meta: { group_type: groupType },
      },
    ];

    if (input.memberPlayerIds?.length) {
      const rows = input.memberPlayerIds.map((pid) => ({
        group_id: groupId,
        player_id: pid,
        source: 'manual' as const,
        added_by_coach_id: ctx.activeCoachId,
      }));
      const { error: mErr } = await supabase
        .from('baseball_strength_group_members')
        .upsert(rows, { onConflict: 'group_id,player_id' });
      if (mErr) throw mErr;
      for (const pid of input.memberPlayerIds) {
        auditEntries.push({ eventType: 'member_added', playerId: pid, source: 'manual' });
      }
    }

    await appendGroupAudit(supabase, {
      teamId: ctx.targetTeamId,
      groupId,
      actorCoachId: ctx.activeCoachId,
      entries: auditEntries,
    });

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, id: groupId };
  },
);

const setGroupMembersSchema = z.object({
  groupId: uuid,
  playerIds: z.array(uuid).max(200),
  /** How the change happened — 'rule' on a dynamic recompute, else 'manual'. */
  source: z.enum(['manual', 'rule', 'import']).optional(),
});

export const setGroupMembers = withBaseballAction(
  'setGroupMembers',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof setGroupMembersSchema>): Promise<ActionResult> => {
    const input = setGroupMembersSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    await assertGroupOnTeam(supabase, input.groupId, ctx.targetTeamId);
    const source = input.source ?? 'manual';

    // Stage-and-swap (NOT delete-then-insert in a way that loses data on failure):
    // upsert the desired set FIRST, then remove members not in the set. Diff the
    // before/after to emit a precise audit row per added / removed athlete.
    const { data: before, error: exErr } = await supabase
      .from('baseball_strength_group_members')
      .select('id, player_id')
      .eq('group_id', input.groupId);
    if (exErr) throw exErr;
    const priorIds = new Set<string>((before ?? []).map((m: { player_id: string }) => m.player_id));
    const desired = new Set<string>(input.playerIds);

    if (input.playerIds.length) {
      const rows = input.playerIds.map((pid) => ({
        group_id: input.groupId,
        player_id: pid,
        source,
        added_by_coach_id: ctx.activeCoachId,
      }));
      const { error: upErr } = await supabase
        .from('baseball_strength_group_members')
        .upsert(rows, { onConflict: 'group_id,player_id' });
      if (upErr) throw upErr;
    }
    const toRemove = (before ?? [])
      .filter((m: { player_id: string }) => !desired.has(m.player_id))
      .map((m: { id: string }) => m.id);
    if (toRemove.length) {
      const { error: rmErr } = await supabase
        .from('baseball_strength_group_members')
        .delete()
        .in('id', toRemove);
      if (rmErr) throw rmErr;
    }

    // Audit the membership delta (spec L198 — applies to manual edits too).
    const auditEntries: GroupAuditEntry[] = [];
    for (const pid of input.playerIds) {
      if (!priorIds.has(pid)) auditEntries.push({ eventType: 'member_added', playerId: pid, source });
    }
    for (const pid of priorIds) {
      if (!desired.has(pid)) auditEntries.push({ eventType: 'member_removed', playerId: pid, source });
    }
    await appendGroupAudit(supabase, {
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorCoachId: ctx.activeCoachId,
      entries: auditEntries,
    });

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, count: input.playerIds.length };
  },
);

const updateGroupSchema = z.object({
  groupId: uuid,
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  groupType: z.enum(['static', 'dynamic', 'imported', 'temporary']).optional(),
  ruleJson: ruleJsonSchema.optional(),
  isActive: z.boolean().optional(),
});

/**
 * Update a group's metadata / rule / type. PATCH semantics (an absent field never
 * nulls an existing value). Emits `rule_changed` / `type_changed` / `group_updated`
 * audit rows so the ledger explains every lifecycle change — not just memberships.
 */
export const updateStrengthGroup = withBaseballAction(
  'updateStrengthGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof updateGroupSchema>): Promise<ActionResult> => {
    const input = updateGroupSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const existing = await assertGroupOnTeam(supabase, input.groupId, ctx.targetTeamId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.groupType !== undefined) patch.group_type = input.groupType;
    if (input.ruleJson !== undefined) patch.rule_json = input.ruleJson;
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    const { data, error } = await supabase
      .from('baseball_strength_groups')
      .update(patch)
      .eq('id', input.groupId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Group not found or not editable.');

    const auditEntries: GroupAuditEntry[] = [];
    if (input.ruleJson !== undefined) {
      auditEntries.push({ eventType: 'rule_changed', source: 'rule', detail: 'Group rule updated.', meta: { rule_json: input.ruleJson } });
    }
    if (input.groupType !== undefined && input.groupType !== existing.group_type) {
      auditEntries.push({ eventType: 'type_changed', detail: `Type ${existing.group_type} → ${input.groupType}.` });
    }
    if (input.name !== undefined || input.description !== undefined || input.isActive !== undefined) {
      auditEntries.push({ eventType: 'group_updated', detail: 'Group details updated.' });
    }
    await appendGroupAudit(supabase, {
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorCoachId: ctx.activeCoachId,
      entries: auditEntries,
    });

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, id: input.groupId };
  },
);

const deleteGroupSchema = z.object({ groupId: uuid });

/**
 * Soft-delete a group (set is_active=false). Non-destructive: membership +
 * audit rows are retained so a group can be reactivated and history is preserved.
 */
export const deleteStrengthGroup = withBaseballAction(
  'deleteStrengthGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof deleteGroupSchema>): Promise<ActionResult> => {
    const input = deleteGroupSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    await assertGroupOnTeam(supabase, input.groupId, ctx.targetTeamId);
    const { error } = await supabase
      .from('baseball_strength_groups')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', input.groupId);
    if (error) throw error;
    await appendGroupAudit(supabase, {
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorCoachId: ctx.activeCoachId,
      entries: [{ eventType: 'group_updated', detail: 'Group archived (deactivated).' }],
    });
    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, id: input.groupId };
  },
);

// ---- Dynamic rule: server-side live preview (NO write) ----------------------
const previewRuleSchema = z.object({
  ruleJson: ruleJsonSchema,
  lookbackDays: z.number().int().min(1).max(365).optional(),
});

export interface RulePreviewResult {
  success: boolean;
  empty_rule?: boolean;
  matches?: RuleMatch[];
  count?: number;
  error?: string;
}

/**
 * Evaluate a draft rule against the live roster snapshot and return EXACTLY the
 * players it would include — the same engine the recompute path persists, so the
 * preview never lies. Read-only: no membership or audit row is written. Runs the
 * evaluation SERVER-SIDE (guardrail) so the client never re-implements the rules.
 */
export const previewDynamicGroup = withBaseballAction(
  'previewDynamicGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof previewRuleSchema>): Promise<RulePreviewResult> => {
    const input = previewRuleSchema.parse(raw);
    const rule = input.ruleJson as BaseballStrengthGroupRules;
    const board = await getStrengthGroupsBoard(ctx.targetTeamId, input.lookbackDays ?? rule.lookback_days ?? 14);
    const evaluation = evaluateGroupRule(rule, board.roster);
    return {
      success: true,
      empty_rule: evaluation.empty_rule,
      matches: evaluation.matches,
      count: evaluation.included_ids.length,
    };
  },
);

// ---- Dynamic rule: recompute + persist membership (with audit) --------------
const recomputeSchema = z.object({ groupId: uuid });

/**
 * Recompute a DYNAMIC group's membership from its saved rule_json and reconcile
 * the membership table to the rule's output — additive/removed deltas are
 * stage-and-swapped (no destructive bulk delete) and EVERY delta writes a `rule`
 * -sourced audit row, plus a `recomputed` summary row (spec L198). A static group
 * is a no-op (its membership is coach-authored, not rule-driven).
 */
export const recomputeDynamicGroup = withBaseballAction(
  'recomputeDynamicGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof recomputeSchema>): Promise<ActionResult> => {
    const input = recomputeSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    const { data: groupData, error: gErr } = await supabase
      .from('baseball_strength_groups')
      .select('id, team_id, group_type, rule_json, is_active')
      .eq('id', input.groupId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!groupData) throw new BaseballActionError('Group not found.');
    const group = groupData as {
      id: string; team_id: string; group_type: BaseballStrengthGroupType;
      rule_json: unknown; is_active: boolean;
    };
    if (group.team_id !== ctx.targetTeamId) throw new BaseballActionError('Group belongs to another team.');
    if (group.group_type !== 'dynamic') {
      throw new BaseballActionError('Only dynamic groups can be recomputed.');
    }
    const rule = (group.rule_json ?? {}) as BaseballStrengthGroupRules;
    if (!ruleHasPredicates(rule)) {
      throw new BaseballActionError('This dynamic group has no rule to evaluate.');
    }

    const board = await getStrengthGroupsBoard(ctx.targetTeamId, rule.lookback_days ?? 14);
    const evaluation = evaluateGroupRule(rule, board.roster);
    const desired = new Set(evaluation.included_ids);
    const reasonById = new Map(evaluation.matches.map((m) => [m.player_id, m.reasons]));

    const { data: before, error: bErr } = await supabase
      .from('baseball_strength_group_members')
      .select('id, player_id, source')
      .eq('group_id', input.groupId);
    if (bErr) throw bErr;
    type PriorMember = { id: string; player_id: string; source: string };
    const priorById = new Map<string, PriorMember>(
      (before ?? []).map((m: PriorMember) => [m.player_id, m] as [string, PriorMember]),
    );

    // Upsert rule-matched players (rule source). Preserve coach-pinned manual rows
    // by NOT downgrading their source — only insert/keep, never overwrite manual.
    const toUpsert = evaluation.included_ids
      .filter((pid) => priorById.get(pid)?.source !== 'manual')
      .map((pid) => ({
        group_id: input.groupId,
        player_id: pid,
        source: 'rule' as const,
        added_by_coach_id: ctx.activeCoachId,
      }));
    if (toUpsert.length) {
      const { error: upErr } = await supabase
        .from('baseball_strength_group_members')
        .upsert(toUpsert, { onConflict: 'group_id,player_id' });
      if (upErr) throw upErr;
    }

    // Remove ONLY rule-sourced members no longer matched (manual pins are kept).
    const toRemove = (before ?? [])
      .filter((m: { player_id: string; source: string }) => m.source === 'rule' && !desired.has(m.player_id))
      .map((m: { id: string }) => m.id);
    if (toRemove.length) {
      const { error: rmErr } = await supabase
        .from('baseball_strength_group_members')
        .delete()
        .in('id', toRemove);
      if (rmErr) throw rmErr;
    }

    // Audit: a row per real delta + a summary recompute row.
    const auditEntries: GroupAuditEntry[] = [];
    for (const pid of evaluation.included_ids) {
      if (!priorById.has(pid)) {
        auditEntries.push({
          eventType: 'member_added',
          playerId: pid,
          source: 'rule',
          detail: reasonById.get(pid)?.join('; ') ?? 'Matched group rule.',
        });
      }
    }
    for (const [pid, m] of priorById) {
      if (m.source === 'rule' && !desired.has(pid)) {
        auditEntries.push({ eventType: 'member_removed', playerId: pid, source: 'rule', detail: 'No longer matches group rule.' });
      }
    }
    auditEntries.push({
      eventType: 'recomputed',
      source: 'rule',
      detail: `Recomputed: ${evaluation.included_ids.length} matched.`,
      meta: { matched: evaluation.included_ids.length, added: auditEntries.filter((e) => e.eventType === 'member_added').length, removed: auditEntries.filter((e) => e.eventType === 'member_removed').length },
    });
    await appendGroupAudit(supabase, {
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorCoachId: ctx.activeCoachId,
      entries: auditEntries,
    });

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, id: input.groupId, count: evaluation.included_ids.length };
  },
);

// ---- Seed the 12 default groups (spec L155-168), idempotent -----------------
export const seedDefaultStrengthGroups = withBaseballAction(
  'seedDefaultStrengthGroups',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx): Promise<ActionResult> => {
    const supabase = (await createClient()) as Db;
    // Only create the names that don't already exist (idempotent re-runs).
    const { data: existing } = await supabase
      .from('baseball_strength_groups')
      .select('name')
      .eq('team_id', ctx.targetTeamId);
    const have = new Set(
      (existing ?? []).map((g: { name: string }) => g.name.toLowerCase()),
    );
    const missing = DEFAULT_STRENGTH_GROUP_NAMES.filter((n) => !have.has(n.toLowerCase()));
    if (missing.length === 0) return { success: true, count: 0 };

    const rows = missing.map((name) => ({
      team_id: ctx.targetTeamId,
      name,
      group_type: 'static' as const,
      rule_json: {},
      created_by_coach_id: ctx.activeCoachId,
    }));
    const { data: created, error } = await supabase
      .from('baseball_strength_groups')
      .insert(rows)
      .select('id');
    if (error) throw error;

    // One created-audit row per seeded group.
    for (const g of (created ?? []) as Array<{ id: string }>) {
      await appendGroupAudit(supabase, {
        teamId: ctx.targetTeamId,
        groupId: g.id,
        actorCoachId: ctx.activeCoachId,
        entries: [{ eventType: 'group_created', detail: 'Seeded default group.', source: 'system' }],
      });
    }

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, count: missing.length };
  },
);

// ============================================================================
// EXERCISE LIBRARY
// ============================================================================

const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum([
    'warmup', 'power', 'strength', 'accessory', 'arm_care',
    'mobility', 'conditioning', 'recovery', 'test',
  ]).optional(),
  primaryPattern: z.string().max(40).optional().nullable(),
  bodyRegion: z.enum(['lower', 'upper', 'trunk', 'arm', 'full_body']).optional().nullable(),
  equipment: z.string().max(60).optional().nullable(),
  unilateral: z.boolean().optional(),
  defaultUnit: z.enum(['lb', 'kg', 'bodyweight', 'seconds', 'yards', 'reps', 'mph', 'watts', 'mps']).optional(),
  videoUrl: z.string().url().max(500).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  coachingCues: z.array(z.string().max(200)).max(20).optional(),
  baseballTags: z.array(z.string().max(40)).max(20).optional(),
});

export const createLiftExercise = withBaseballAction(
  'createLiftExercise',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof createExerciseSchema>): Promise<ActionResult> => {
    const input = createExerciseSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    const { data, error } = await supabase
      .from('baseball_lift_exercises')
      .insert({
        team_id: ctx.targetTeamId,
        created_by_coach_id: ctx.activeCoachId,
        name: input.name,
        category: input.category ?? 'strength',
        primary_pattern: input.primaryPattern ?? null,
        body_region: input.bodyRegion ?? null,
        equipment: input.equipment ?? null,
        unilateral: input.unilateral ?? false,
        default_unit: input.defaultUnit ?? 'lb',
        video_url: input.videoUrl ?? null,
        instructions: input.instructions ?? null,
        coaching_cues: input.coachingCues ?? [],
        baseball_tags: input.baseballTags ?? [],
        is_global: false,
      })
      .select('id')
      .single();
    if (error) {
      // Surface the team-name duplicate guard without leaking raw DB error.
      if (String((error as { code?: string }).code) === '23505') {
        throw new BaseballActionError('An exercise with that name already exists.');
      }
      throw error;
    }
    revalidatePath(`${PERFORMANCE}/exercises`);
    return { success: true, id: (data as { id: string }).id };
  },
);

// ============================================================================
// PROGRAM BUILDER (program / week / day / section / prescription)
// ============================================================================

const createProgramSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  phase: z.enum(['fall', 'winter', 'preseason', 'in_season', 'postseason', 'summer', 'return_to_play', 'testing']).optional(),
  goal: z.enum(['strength', 'power', 'hypertrophy', 'speed', 'maintenance', 'recovery', 'arm_care', 'testing']).optional(),
  startDate: ymd.optional().nullable(),
  endDate: ymd.optional().nullable(),
});

export const createLiftProgram = withBaseballAction(
  'createLiftProgram',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof createProgramSchema>): Promise<ActionResult> => {
    const input = createProgramSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_programs')
      .insert({
        team_id: ctx.targetTeamId,
        name: input.name,
        description: input.description ?? null,
        phase: input.phase ?? 'in_season',
        goal: input.goal ?? 'strength',
        created_by_coach_id: ctx.activeCoachId,
        status: 'draft',
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: (data as { id: string }).id };
  },
);

const addWeekSchema = z.object({
  programId: uuid,
  weekNumber: z.number().int().min(1).max(52),
  name: z.string().max(80).optional().nullable(),
  theme: z.string().max(120).optional().nullable(),
  deload: z.boolean().optional(),
});

export const addLiftWeek = withBaseballAction(
  'addLiftWeek',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof addWeekSchema>): Promise<ActionResult> => {
    const input = addWeekSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_weeks')
      .upsert(
        {
          program_id: input.programId,
          week_number: input.weekNumber,
          name: input.name ?? null,
          theme: input.theme ?? null,
          deload: input.deload ?? false,
        },
        { onConflict: 'program_id,week_number' },
      )
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: (data as { id: string }).id };
  },
);

const addDaySchema = z.object({
  weekId: uuid,
  dayNumber: z.number().int().min(1).max(7),
  name: z.string().max(80).optional().nullable(),
  dayType: z.enum(['lower', 'upper', 'full_body', 'recovery', 'arm_care', 'conditioning', 'testing', 'custom']).optional(),
  baseballContext: z.string().max(40).optional().nullable(),
  estimatedMinutes: z.number().int().min(0).max(300).optional().nullable(),
});

export const addLiftDay = withBaseballAction(
  'addLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof addDaySchema>): Promise<ActionResult> => {
    const input = addDaySchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_days')
      .upsert(
        {
          week_id: input.weekId,
          day_number: input.dayNumber,
          name: input.name ?? null,
          day_type: input.dayType ?? 'full_body',
          baseball_context: input.baseballContext ?? null,
          estimated_minutes: input.estimatedMinutes ?? null,
        },
        { onConflict: 'week_id,day_number' },
      )
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: (data as { id: string }).id };
  },
);

const addSectionSchema = z.object({
  liftDayId: uuid,
  name: z.string().trim().min(1).max(80),
  sectionType: z.enum(['warmup', 'movement_prep', 'power', 'main_strength', 'accessory', 'arm_care', 'mobility', 'conditioning']).optional(),
  sectionOrder: z.number().int().min(0).max(50).optional(),
  instructions: z.string().max(1000).optional().nullable(),
});

export const addLiftSection = withBaseballAction(
  'addLiftSection',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof addSectionSchema>): Promise<ActionResult> => {
    const input = addSectionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_sections')
      .insert({
        lift_day_id: input.liftDayId,
        name: input.name,
        section_type: input.sectionType ?? 'main_strength',
        section_order: input.sectionOrder ?? 0,
        instructions: input.instructions ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: (data as { id: string }).id };
  },
);

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
  targetVelocityMin: z.number().min(0).max(20).optional().nullable(),
  targetVelocityMax: z.number().min(0).max(20).optional().nullable(),
  restSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  tempo: z.string().max(20).optional().nullable(),
  coachingNote: z.string().max(1000).optional().nullable(),
});

export const addLiftPrescription = withBaseballAction(
  'addLiftPrescription',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof addPrescriptionSchema>): Promise<ActionResult> => {
    const input = addPrescriptionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_prescriptions')
      .insert({
        section_id: input.sectionId,
        exercise_id: input.exerciseId ?? null,
        order_index: input.orderIndex ?? 0,
        prescription_type: input.prescriptionType ?? 'fixed',
        sets: input.sets ?? null,
        reps: input.reps ?? null,
        load_value: input.loadValue ?? null,
        load_unit: input.loadUnit ?? null,
        percent_1rm: input.percent1rm ?? null,
        target_rpe: input.targetRpe ?? null,
        target_velocity_min: input.targetVelocityMin ?? null,
        target_velocity_max: input.targetVelocityMax ?? null,
        rest_seconds: input.restSeconds ?? null,
        tempo: input.tempo ?? null,
        coaching_note: input.coachingNote ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: (data as { id: string }).id };
  },
);

// ============================================================================
// PROGRAM EDITOR OPERATIONS (update / reorder / delete / duplicate / template)
//
// These wire the deepest coach authoring layer (spec L200-228 + Packet E). Every
// one runs inside withBaseballAction with can_manage_lifting; RLS (FOR ALL on the
// program tree, gated to has_baseball_staff_capability) backstops every write.
//
// NO destructive writes in a save/sync sense: duplicate is pure insert; reorder
// is an in-place UPDATE of order columns; delete is an explicit, user-initiated
// removal of a single tree node (the ON DELETE CASCADE prunes its descendants).
// ============================================================================

const updateProgramSchema = z.object({
  programId: uuid,
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).optional().nullable(),
  phase: z.enum(['fall', 'winter', 'preseason', 'in_season', 'postseason', 'summer', 'return_to_play', 'testing']).optional(),
  goal: z.enum(['strength', 'power', 'hypertrophy', 'speed', 'maintenance', 'recovery', 'arm_care', 'testing']).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  visibility: z.enum(['staff_only', 'assigned_players']).optional(),
  startDate: ymd.optional().nullable(),
  endDate: ymd.optional().nullable(),
});

export const updateLiftProgram = withBaseballAction(
  'updateLiftProgram',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof updateProgramSchema>): Promise<ActionResult> => {
    const input = updateProgramSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    // Build a patch of only the fields the caller actually sent (PATCH semantics):
    // an absent key never overwrites an existing value with null.
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.phase !== undefined) patch.phase = input.phase;
    if (input.goal !== undefined) patch.goal = input.goal;
    if (input.status !== undefined) patch.status = input.status;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.endDate !== undefined) patch.end_date = input.endDate;

    const { data, error } = await supabase
      .from('baseball_lift_programs')
      .update(patch)
      .eq('id', input.programId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Program not found or not editable.');
    revalidatePath(`${PERFORMANCE}/programs`);
    revalidatePath(`${PERFORMANCE}/programs/${input.programId}`);
    return { success: true, id: input.programId };
  },
);

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
  targetVelocityMin: z.number().min(0).max(20).optional().nullable(),
  targetVelocityMax: z.number().min(0).max(20).optional().nullable(),
  restSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  tempo: z.string().max(20).optional().nullable(),
  coachingNote: z.string().max(1000).optional().nullable(),
});

export const updateLiftPrescription = withBaseballAction(
  'updateLiftPrescription',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof updatePrescriptionSchema>): Promise<ActionResult> => {
    const input = updatePrescriptionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const patch: Record<string, unknown> = {};
    if (input.exerciseId !== undefined) patch.exercise_id = input.exerciseId;
    if (input.prescriptionType !== undefined) patch.prescription_type = input.prescriptionType;
    if (input.sets !== undefined) patch.sets = input.sets;
    if (input.reps !== undefined) patch.reps = input.reps;
    if (input.loadValue !== undefined) patch.load_value = input.loadValue;
    if (input.loadUnit !== undefined) patch.load_unit = input.loadUnit;
    if (input.percent1rm !== undefined) patch.percent_1rm = input.percent1rm;
    if (input.targetRpe !== undefined) patch.target_rpe = input.targetRpe;
    if (input.targetVelocityMin !== undefined) patch.target_velocity_min = input.targetVelocityMin;
    if (input.targetVelocityMax !== undefined) patch.target_velocity_max = input.targetVelocityMax;
    if (input.restSeconds !== undefined) patch.rest_seconds = input.restSeconds;
    if (input.tempo !== undefined) patch.tempo = input.tempo;
    if (input.coachingNote !== undefined) patch.coaching_note = input.coachingNote;
    if (Object.keys(patch).length === 0) return { success: true, id: input.prescriptionId };

    const { data, error } = await supabase
      .from('baseball_lift_prescriptions')
      .update(patch)
      .eq('id', input.prescriptionId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Exercise prescription not found or not editable.');
    return { success: true, id: input.prescriptionId };
  },
);

const updateSectionSchema = z.object({
  sectionId: uuid,
  name: z.string().trim().min(1).max(80).optional(),
  sectionType: z.enum(['warmup', 'movement_prep', 'power', 'main_strength', 'accessory', 'arm_care', 'mobility', 'conditioning']).optional(),
  instructions: z.string().max(1000).optional().nullable(),
});

export const updateLiftSection = withBaseballAction(
  'updateLiftSection',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof updateSectionSchema>): Promise<ActionResult> => {
    const input = updateSectionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.sectionType !== undefined) patch.section_type = input.sectionType;
    if (input.instructions !== undefined) patch.instructions = input.instructions;
    if (Object.keys(patch).length === 0) return { success: true, id: input.sectionId };
    const { data, error } = await supabase
      .from('baseball_lift_sections')
      .update(patch)
      .eq('id', input.sectionId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Section not found or not editable.');
    return { success: true, id: input.sectionId };
  },
);

const updateDaySchema = z.object({
  dayId: uuid,
  name: z.string().max(80).optional().nullable(),
  dayType: z.enum(['lower', 'upper', 'full_body', 'recovery', 'arm_care', 'conditioning', 'testing', 'custom']).optional(),
  baseballContext: z.enum(['pre_game', 'post_game', 'bullpen_day', 'starter_plus_1', 'starter_plus_2', 'travel_day', 'off_day', 'practice_day']).optional().nullable(),
  estimatedMinutes: z.number().int().min(0).max(300).optional().nullable(),
});

export const updateLiftDay = withBaseballAction(
  'updateLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof updateDaySchema>): Promise<ActionResult> => {
    const input = updateDaySchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.dayType !== undefined) patch.day_type = input.dayType;
    if (input.baseballContext !== undefined) patch.baseball_context = input.baseballContext;
    if (input.estimatedMinutes !== undefined) patch.estimated_minutes = input.estimatedMinutes;
    if (Object.keys(patch).length === 0) return { success: true, id: input.dayId };
    const { data, error } = await supabase
      .from('baseball_lift_days')
      .update(patch)
      .eq('id', input.dayId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Day not found or not editable.');
    return { success: true, id: input.dayId };
  },
);

// ---- Reorder (drag-drop persistence; in-place UPDATE of order columns) -------
const reorderSchema = z.object({
  // Ordered list of node ids in their new position. Index becomes the order value.
  orderedIds: z.array(uuid).min(1).max(100),
});

export const reorderLiftSections = withBaseballAction(
  'reorderLiftSections',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof reorderSchema>): Promise<ActionResult> => {
    const input = reorderSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    // Sequential in-place updates — small N (a day has a handful of sections).
    // RLS rejects any id outside the staff member's manageable programs.
    for (let i = 0; i < input.orderedIds.length; i++) {
      const { error } = await supabase
        .from('baseball_lift_sections')
        .update({ section_order: i })
        .eq('id', input.orderedIds[i]);
      if (error) throw error;
    }
    return { success: true, count: input.orderedIds.length };
  },
);

export const reorderLiftPrescriptions = withBaseballAction(
  'reorderLiftPrescriptions',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof reorderSchema>): Promise<ActionResult> => {
    const input = reorderSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    for (let i = 0; i < input.orderedIds.length; i++) {
      const { error } = await supabase
        .from('baseball_lift_prescriptions')
        .update({ order_index: i })
        .eq('id', input.orderedIds[i]);
      if (error) throw error;
    }
    return { success: true, count: input.orderedIds.length };
  },
);

// ---- Delete (explicit, user-initiated node removal; CASCADE prunes children) -
const deleteByIdSchema = z.object({ id: uuid });

export const deleteLiftPrescription = withBaseballAction(
  'deleteLiftPrescription',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<ActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { error } = await fromUntyped(supabase, 'baseball_lift_prescriptions').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

export const deleteLiftSection = withBaseballAction(
  'deleteLiftSection',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<ActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { error } = await fromUntyped(supabase, 'baseball_lift_sections').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

export const deleteLiftDay = withBaseballAction(
  'deleteLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<ActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { error } = await fromUntyped(supabase, 'baseball_lift_days').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

export const deleteLiftWeek = withBaseballAction(
  'deleteLiftWeek',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof deleteByIdSchema>): Promise<ActionResult> => {
    const { id } = deleteByIdSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { error } = await fromUntyped(supabase, 'baseball_lift_weeks').delete().eq('id', id);
    if (error) throw error;
    return { success: true, id };
  },
);

// ---- Duplicate week / day (deep copy of the template subtree) ----------------
// Deep-copies a day's sections + prescriptions into a freshly-inserted day. Pure
// inserts — never touches the source rows. The order columns are preserved.
async function deepCopyDay(
  supabase: Db,
  sourceDayId: string,
  targetDayId: string,
): Promise<void> {
  const { data: sections, error: secErr } = await supabase
    .from('baseball_lift_sections')
    .select('id, section_order, name, section_type, instructions')
    .eq('lift_day_id', sourceDayId)
    .order('section_order', { ascending: true });
  if (secErr) throw secErr;
  for (const s of (sections ?? []) as Array<{
    id: string; section_order: number; name: string; section_type: string; instructions: string | null;
  }>) {
    const { data: newSec, error: nsErr } = await supabase
      .from('baseball_lift_sections')
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

    const { data: pres, error: pErr } = await supabase
      .from('baseball_lift_prescriptions')
      .select('exercise_id, order_index, prescription_type, sets, reps, load_value, load_unit, percent_1rm, target_rpe, target_rir, target_velocity_min, target_velocity_max, rest_seconds, tempo, coaching_note, substitution_group_id')
      .eq('section_id', s.id)
      .order('order_index', { ascending: true });
    if (pErr) throw pErr;
    const presRows = (pres ?? []).map((p: Record<string, unknown>) => ({ ...p, section_id: newSectionId }));
    if (presRows.length) {
      const { error: insErr } = await supabase
        .from('baseball_lift_prescriptions')
        .insert(presRows);
      if (insErr) throw insErr;
    }
  }
}

const duplicateDaySchema = z.object({
  dayId: uuid,
  // Target week defaults to the source day's week; pass to copy into another week.
  targetWeekId: uuid.optional(),
});

export const duplicateLiftDay = withBaseballAction(
  'duplicateLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof duplicateDaySchema>): Promise<ActionResult> => {
    const input = duplicateDaySchema.parse(raw);
    const supabase = (await createClient()) as Db;

    const { data: src, error: srcErr } = await supabase
      .from('baseball_lift_days')
      .select('id, week_id, day_number, name, day_type, baseball_context, estimated_minutes')
      .eq('id', input.dayId)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src) throw new BaseballActionError('Day not found.');
    const source = src as {
      id: string; week_id: string; day_number: number; name: string | null;
      day_type: string; baseball_context: string | null; estimated_minutes: number | null;
    };
    const weekId = input.targetWeekId ?? source.week_id;

    // Next free day_number in the target week (unique on week_id,day_number).
    const { data: siblings } = await supabase
      .from('baseball_lift_days')
      .select('day_number')
      .eq('week_id', weekId);
    const used = new Set((siblings ?? []).map((d: { day_number: number }) => d.day_number));
    let nextDay = 1;
    while (used.has(nextDay) && nextDay < 7) nextDay++;
    if (used.has(nextDay)) throw new BaseballActionError('That week already has 7 days.');

    const { data: newDay, error: ndErr } = await supabase
      .from('baseball_lift_days')
      .insert({
        week_id: weekId,
        day_number: nextDay,
        name: source.name ? `${source.name} (copy)` : null,
        day_type: source.day_type,
        baseball_context: source.baseball_context,
        estimated_minutes: source.estimated_minutes,
      })
      .select('id')
      .single();
    if (ndErr) throw ndErr;
    const newDayId = (newDay as { id: string }).id;

    await deepCopyDay(supabase, source.id, newDayId);

    // Resolve the owning program for revalidation.
    const { data: wk } = await supabase
      .from('baseball_lift_weeks')
      .select('program_id')
      .eq('id', weekId)
      .maybeSingle();
    const programId = (wk as { program_id?: string } | null)?.program_id;
    if (programId) revalidatePath(`${PERFORMANCE}/programs/${programId}`);
    return { success: true, id: newDayId };
  },
);

const duplicateWeekSchema = z.object({ weekId: uuid });

export const duplicateLiftWeek = withBaseballAction(
  'duplicateLiftWeek',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof duplicateWeekSchema>): Promise<ActionResult> => {
    const input = duplicateWeekSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    const { data: src, error: srcErr } = await supabase
      .from('baseball_lift_weeks')
      .select('id, program_id, week_number, name, theme, deload')
      .eq('id', input.weekId)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src) throw new BaseballActionError('Week not found.');
    const source = src as {
      id: string; program_id: string; week_number: number;
      name: string | null; theme: string | null; deload: boolean;
    };

    // Next free week_number in the program (unique on program_id,week_number).
    const { data: siblings } = await supabase
      .from('baseball_lift_weeks')
      .select('week_number')
      .eq('program_id', source.program_id);
    const maxWeek = (siblings ?? []).reduce(
      (m: number, w: { week_number: number }) => Math.max(m, w.week_number),
      0,
    );
    const nextWeek = maxWeek + 1;
    if (nextWeek > 52) throw new BaseballActionError('A program cannot exceed 52 weeks.');

    const { data: newWeek, error: nwErr } = await supabase
      .from('baseball_lift_weeks')
      .insert({
        program_id: source.program_id,
        week_number: nextWeek,
        name: source.name ? `${source.name} (copy)` : `Week ${nextWeek}`,
        theme: source.theme,
        deload: source.deload,
      })
      .select('id')
      .single();
    if (nwErr) throw nwErr;
    const newWeekId = (newWeek as { id: string }).id;

    // Copy each day (and its subtree) into the new week, preserving day_number.
    const { data: days, error: dErr } = await supabase
      .from('baseball_lift_days')
      .select('id, day_number, name, day_type, baseball_context, estimated_minutes')
      .eq('week_id', source.id)
      .order('day_number', { ascending: true });
    if (dErr) throw dErr;
    for (const d of (days ?? []) as Array<{
      id: string; day_number: number; name: string | null; day_type: string;
      baseball_context: string | null; estimated_minutes: number | null;
    }>) {
      const { data: nd, error: ndErr } = await supabase
        .from('baseball_lift_days')
        .insert({
          week_id: newWeekId,
          day_number: d.day_number,
          name: d.name,
          day_type: d.day_type,
          baseball_context: d.baseball_context,
          estimated_minutes: d.estimated_minutes,
        })
        .select('id')
        .single();
      if (ndErr) throw ndErr;
      await deepCopyDay(supabase, d.id, (nd as { id: string }).id);
    }

    revalidatePath(`${PERFORMANCE}/programs/${source.program_id}`);
    return { success: true, id: newWeekId };
  },
);

// ---- Save as template (deep-copy the whole program into a template program) --
const saveTemplateSchema = z.object({
  programId: uuid,
  name: z.string().trim().min(1).max(160).optional().nullable(),
});

export const saveProgramAsTemplate = withBaseballAction(
  'saveProgramAsTemplate',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof saveTemplateSchema>): Promise<ActionResult> => {
    const input = saveTemplateSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    const { data: src, error: srcErr } = await supabase
      .from('baseball_lift_programs')
      .select('id, team_id, name, description, phase, goal, visibility')
      .eq('id', input.programId)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src) throw new BaseballActionError('Program not found.');
    const source = src as {
      id: string; team_id: string; name: string; description: string | null;
      phase: string; goal: string; visibility: string;
    };
    // Defense in depth: a template is created on the SOURCE program's team only.
    if (source.team_id !== ctx.targetTeamId) {
      throw new BaseballActionError('Program belongs to another team.');
    }

    const { data: tpl, error: tplErr } = await supabase
      .from('baseball_lift_programs')
      .insert({
        team_id: source.team_id,
        name: input.name?.trim() || `${source.name} (template)`,
        description: source.description,
        phase: source.phase,
        goal: source.goal,
        visibility: source.visibility,
        status: 'draft',
        is_template: true,
        created_by_coach_id: ctx.activeCoachId,
      })
      .select('id')
      .single();
    if (tplErr) throw tplErr;
    const templateId = (tpl as { id: string }).id;

    // Deep copy every week + day subtree.
    const { data: weeks, error: wErr } = await supabase
      .from('baseball_lift_weeks')
      .select('id, week_number, name, theme, deload')
      .eq('program_id', source.id)
      .order('week_number', { ascending: true });
    if (wErr) throw wErr;
    for (const w of (weeks ?? []) as Array<{
      id: string; week_number: number; name: string | null; theme: string | null; deload: boolean;
    }>) {
      const { data: nw, error: nwErr } = await supabase
        .from('baseball_lift_weeks')
        .insert({
          program_id: templateId,
          week_number: w.week_number,
          name: w.name,
          theme: w.theme,
          deload: w.deload,
        })
        .select('id')
        .single();
      if (nwErr) throw nwErr;
      const newWeekId = (nw as { id: string }).id;

      const { data: days, error: dErr } = await supabase
        .from('baseball_lift_days')
        .select('id, day_number, name, day_type, baseball_context, estimated_minutes')
        .eq('week_id', w.id)
        .order('day_number', { ascending: true });
      if (dErr) throw dErr;
      for (const d of (days ?? []) as Array<{
        id: string; day_number: number; name: string | null; day_type: string;
        baseball_context: string | null; estimated_minutes: number | null;
      }>) {
        const { data: nd, error: ndErr } = await supabase
          .from('baseball_lift_days')
          .insert({
            week_id: newWeekId,
            day_number: d.day_number,
            name: d.name,
            day_type: d.day_type,
            baseball_context: d.baseball_context,
            estimated_minutes: d.estimated_minutes,
          })
          .select('id')
          .single();
        if (ndErr) throw ndErr;
        await deepCopyDay(supabase, d.id, (nd as { id: string }).id);
      }
    }

    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: templateId };
  },
);

// ============================================================================
// PUBLISH = MATERIALIZE (the heart of V11; spec L463)
// ============================================================================

const publishSchema = z.object({
  programId: uuid,
  liftDayId: uuid,
  scheduledDate: ymd,
  /** Resolved player ids the session is being materialized for. */
  playerIds: z.array(uuid).min(1).max(200),
  assignmentType: z.enum(['team', 'group', 'player']).optional(),
  groupId: uuid.optional().nullable(),
  /** When true, also create/link a baseball_events Lift event for the calendar. */
  createCalendarEvent: z.boolean().optional(),
  title: z.string().max(160).optional().nullable(),
});

/**
 * Publish a program-day to a set of players: create the program assignment,
 * (optionally) a calendar event, then MATERIALIZE one session per player with a
 * frozen snapshot of every prescription as session_exercises. Idempotent re-runs
 * upsert sessions on (assignment, player) — no on-the-fly template math anywhere
 * on the player surface.
 */
export const publishLiftDay = withBaseballAction(
  'publishLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof publishSchema>): Promise<ActionResult> => {
    const input = publishSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const teamId = ctx.targetTeamId;

    // 1. Read the template day -> sections -> prescriptions (+ exercise names).
    const { data: sections, error: secErr } = await supabase
      .from('baseball_lift_sections')
      .select('id, name, section_type, section_order')
      .eq('lift_day_id', input.liftDayId)
      .order('section_order', { ascending: true });
    if (secErr) throw secErr;
    const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);

    let prescriptions: Array<{
      id: string; section_id: string; exercise_id: string | null; order_index: number;
      sets: number | null; reps: number | null; load_value: number | null;
      load_unit: string | null; target_rpe: number | null;
    }> = [];
    if (sectionIds.length) {
      const { data: pres, error: preErr } = await supabase
        .from('baseball_lift_prescriptions')
        .select('id, section_id, exercise_id, order_index, sets, reps, load_value, load_unit, target_rpe')
        .in('section_id', sectionIds)
        .order('order_index', { ascending: true });
      if (preErr) throw preErr;
      prescriptions = pres ?? [];
    }

    // Resolve exercise names for the snapshot (no FK reliance on read path).
    const exIds = Array.from(
      new Set(prescriptions.map((p) => p.exercise_id).filter((x): x is string => Boolean(x))),
    );
    const nameById = new Map<string, string>();
    if (exIds.length) {
      const { data: exs } = await supabase
        .from('baseball_lift_exercises')
        .select('id, name')
        .in('id', exIds);
      for (const e of exs ?? []) nameById.set((e as { id: string }).id, (e as { name: string }).name);
    }
    const sectionMeta = new Map<string, { name: string; type: string }>();
    for (const s of sections ?? []) {
      sectionMeta.set((s as { id: string }).id, {
        name: (s as { name: string }).name,
        type: (s as { section_type: string }).section_type,
      });
    }

    // 2. Optional calendar event (spec "Calendar Integration" L876-897).
    let eventId: string | null = null;
    if (input.createCalendarEvent) {
      const start = `${input.scheduledDate}T16:00:00Z`;
      const { data: ev, error: evErr } = await supabase
        .from('baseball_events')
        .insert({
          team_id: teamId,
          title: input.title ?? 'Lift',
          event_type: 'lift',
          start_time: start,
          created_by: ctx.user?.id ?? null,
        })
        .select('id')
        .single();
      if (evErr) throw evErr;
      eventId = (ev as { id: string }).id;
    }

    // 3. Program assignment row.
    const { data: asg, error: asgErr } = await supabase
      .from('baseball_lift_program_assignments')
      .insert({
        team_id: teamId,
        program_id: input.programId,
        lift_day_id: input.liftDayId,
        assigned_by_coach_id: ctx.activeCoachId,
        assignment_type: input.assignmentType ?? 'group',
        group_id: input.groupId ?? null,
        event_id: eventId,
        scheduled_date: input.scheduledDate,
        status: 'published',
        player_visible_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (asgErr) throw asgErr;
    const assignmentId = (asg as { id: string }).id;

    // 4. MATERIALIZE: one session per player (upsert; no delete-then-insert).
    const sessionRows = input.playerIds.map((pid) => ({
      program_assignment_id: assignmentId,
      team_id: teamId,
      player_id: pid,
      event_id: eventId,
      title: input.title ?? 'Lift',
      scheduled_date: input.scheduledDate,
      status: 'assigned' as const,
    }));
    const { data: sessions, error: sErr } = await supabase
      .from('baseball_lift_sessions')
      .upsert(sessionRows, { onConflict: 'program_assignment_id,player_id' })
      .select('id, player_id');
    if (sErr) throw sErr;

    // 5. Snapshot the prescriptions into session_exercises for each session.
    const sessionExerciseRows: Array<Record<string, unknown>> = [];
    for (const sess of sessions ?? []) {
      let order = 0;
      for (const p of prescriptions) {
        const meta = sectionMeta.get(p.section_id);
        sessionExerciseRows.push({
          session_id: (sess as { id: string }).id,
          prescription_id: p.id,
          exercise_id: p.exercise_id,
          exercise_name_snapshot: p.exercise_id ? (nameById.get(p.exercise_id) ?? 'Exercise') : 'Exercise',
          section_name_snapshot: meta?.name ?? null,
          section_type_snapshot: meta?.type ?? null,
          order_index: order++,
          prescribed_sets: p.sets,
          prescribed_reps: p.reps,
          prescribed_load: p.load_value,
          prescribed_load_unit: p.load_unit,
          prescribed_rpe: p.target_rpe,
          status: 'assigned',
        });
      }
    }
    if (sessionExerciseRows.length) {
      // Insert snapshots; on idempotent re-publish the prior session_exercises
      // remain valid (same prescription snapshot) — we skip duplicate inserts by
      // only inserting when a session had none yet.
      const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
      const { data: existingSe } = await supabase
        .from('baseball_lift_session_exercises')
        .select('session_id')
        .in('session_id', sessionIds);
      const seeded = new Set((existingSe ?? []).map((r: { session_id: string }) => r.session_id));
      const fresh = sessionExerciseRows.filter((r) => !seeded.has(r.session_id as string));
      if (fresh.length) {
        const { error: seErr } = await supabase
          .from('baseball_lift_session_exercises')
          .insert(fresh);
        if (seErr) throw seErr;
      }
    }

    revalidatePath(PERFORMANCE);
    revalidatePath(PLAYER_LIFT);
    revalidatePath(PLAYER_TODAY);
    return { success: true, id: assignmentId, count: (sessions ?? []).length };
  },
);

// ============================================================================
// PR DETECTION — closes the lifting loop (assign -> session -> sets -> PRs)
//
// A logged set is compared against the player's prior best for that exercise. On
// a new best we (a) record a baseball_strength_prs row, (b) — coach actor only,
// because RLS gates maxes to staff — refresh the estimated 1RM in
// baseball_strength_maxes, and (c) append a `lift` timeline event marking the PR.
//
// HONESTY: only weighted, rep-bearing sets qualify (a 0-load or 0-rep set is not
// a PR). Estimated 1RM uses Epley and is only computed for ≤12-rep sets, where
// the 1RM estimate is meaningful; high-rep sets contribute a "load" PR only.
// Detection NEVER throws into the logging happy path — a failed PR write must not
// roll back the set the athlete just logged.
// ============================================================================

/** Epley estimated 1RM. Only meaningful at lowish reps (we gate to ≤12). */
function epley1rm(load: number, reps: number): number {
  if (load <= 0 || reps <= 0) return 0;
  if (reps === 1) return load;
  return Math.round(load * (1 + reps / 30) * 10) / 10;
}

interface PrBest {
  load: number;
  estimated1rm: number;
}

/**
 * Compare one logged set against the player's prior best for an exercise and, on
 * a new best, record the PR(s), refresh the estimated 1RM max (coach actor only),
 * and append a `lift` timeline PR event. Returns the number of PR rows written.
 *
 * Side-effect only — swallows its own errors so a logging happy-path is never
 * rolled back by a PR side-effect.
 */
async function detectAndRecordPr(
  supabase: Db,
  args: {
    teamId: string;
    playerId: string;
    sessionId: string;
    sessionExerciseId: string;
    actualLoad: number | null;
    actualReps: number | null;
    loadUnit: string | null;
    actorIsCoach: boolean;
    activeCoachId: string | null;
  },
): Promise<number> {
  try {
    const load = args.actualLoad ?? 0;
    const reps = args.actualReps ?? 0;
    // Only a weighted, rep-bearing set can set a load/1RM PR.
    if (load <= 0 || reps <= 0) return 0;

    // Resolve the exercise this set belongs to (id + name for the timeline copy).
    const { data: se, error: seErr } = await supabase
      .from('baseball_lift_session_exercises')
      .select('exercise_id, exercise_name_snapshot')
      .eq('id', args.sessionExerciseId)
      .maybeSingle();
    if (seErr || !se) return 0;
    const exerciseId = (se as { exercise_id: string | null }).exercise_id;
    const exerciseName =
      (se as { exercise_name_snapshot: string | null }).exercise_name_snapshot ?? 'lift';
    // A free/unlinked exercise has no progression identity to PR against.
    if (!exerciseId) return 0;

    const unit = args.loadUnit ?? 'lb';
    const est1rm = epley1rm(load, reps); // 0 when not 1..N; gated below by reps

    // Prior best LOAD (from PRs first, then maxes as a floor) for this exercise.
    const { data: priorPrs } = await supabase
      .from('baseball_strength_prs')
      .select('pr_type, value')
      .eq('player_id', args.playerId)
      .eq('exercise_id', exerciseId)
      .in('pr_type', ['load', 'estimated_1rm']);
    const { data: priorMaxes } = await supabase
      .from('baseball_strength_maxes')
      .select('max_type, value')
      .eq('player_id', args.playerId)
      .eq('exercise_id', exerciseId)
      .in('max_type', ['tested_1rm', 'estimated_1rm']);

    const best: PrBest = { load: 0, estimated1rm: 0 };
    for (const p of (priorPrs ?? []) as Array<{ pr_type: string; value: number }>) {
      if (p.pr_type === 'load') best.load = Math.max(best.load, Number(p.value) || 0);
      if (p.pr_type === 'estimated_1rm')
        best.estimated1rm = Math.max(best.estimated1rm, Number(p.value) || 0);
    }
    for (const m of (priorMaxes ?? []) as Array<{ max_type: string; value: number }>) {
      // A tested/estimated 1RM acts as a floor for the estimated-1RM PR.
      best.estimated1rm = Math.max(best.estimated1rm, Number(m.value) || 0);
    }

    const prRows: Array<Record<string, unknown>> = [];
    const EPS = 0.01;
    const isLoadPr = load > best.load + EPS;
    // Estimated-1RM PR only when the estimate is meaningful (≤12 reps) and beats
    // the prior estimated/tested 1RM.
    const is1rmPr = reps <= 12 && est1rm > best.estimated1rm + EPS && est1rm > 0;

    if (isLoadPr) {
      prRows.push({
        team_id: args.teamId,
        player_id: args.playerId,
        exercise_id: exerciseId,
        pr_type: 'load',
        value: load,
        unit,
        lift_session_id: args.sessionId,
        verified_by_coach_id: args.actorIsCoach ? args.activeCoachId : null,
      });
    }
    if (is1rmPr) {
      prRows.push({
        team_id: args.teamId,
        player_id: args.playerId,
        exercise_id: exerciseId,
        pr_type: 'estimated_1rm',
        value: est1rm,
        unit,
        lift_session_id: args.sessionId,
        verified_by_coach_id: args.actorIsCoach ? args.activeCoachId : null,
      });
    }
    if (!prRows.length) return 0;

    // Record the PR(s). RLS allows a player to insert their OWN PR.
    const { error: prErr } = await fromUntyped(supabase, 'baseball_strength_prs').insert(prRows);
    if (prErr) return 0;

    // Refresh the estimated 1RM max — ONLY a coach actor (RLS gates maxes to
    // staff). A player-self 1RM PR is recorded as a PR and surfaced to the coach
    // for verification rather than silently overwriting the training max.
    if (is1rmPr && args.actorIsCoach) {
      await fromUntyped(supabase, 'baseball_strength_maxes').insert({
        team_id: args.teamId,
        player_id: args.playerId,
        exercise_id: exerciseId,
        max_type: 'estimated_1rm',
        value: est1rm,
        unit,
        source: 'calculated',
        confidence: 0.8,
      });
    }

    // Append a `lift` timeline PR event (player_only). Honest, source-cited:
    // the PR cites its originating lift session.
    const headline = is1rmPr
      ? `New ${exerciseName} PR — est. 1RM ${est1rm} ${unit} (${load}×${reps})`
      : `New ${exerciseName} PR — ${load} ${unit} × ${reps}`;
    await appendLiftTimelineEvent({
      teamId: args.teamId,
      playerId: args.playerId,
      title: headline,
      sourceId: args.sessionId,
      actorIsCoach: args.actorIsCoach,
      createdBy: args.actorIsCoach ? args.activeCoachId : null,
    });

    return prRows.length;
  } catch {
    // Side-effect only: never roll back the athlete's logged set.
    return 0;
  }
}

// ============================================================================
// SESSION LIFECYCLE + SET LOGGING (player-self + coach-observed)
// ============================================================================

const startSessionSchema = z.object({ sessionId: uuid });

export const startLiftSession = withBaseballAction(
  'startLiftSession',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof startSessionSchema>): Promise<ActionResult> => {
    const input = startSessionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_sessions')
      .update({ status: 'started', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', input.sessionId)
      .eq('status', 'assigned')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    void ctx;
    revalidatePath(`${PLAYER_LIFT}/${input.sessionId}`);
    revalidatePath(PLAYER_TODAY);
    return { success: true, id: input.sessionId, count: data ? 1 : 0 };
  },
);

const logSetSchema = z.object({
  sessionId: uuid,
  sessionExerciseId: uuid,
  setNumber: z.number().int().min(1).max(50),
  actualReps: z.number().int().min(0).max(500).optional().nullable(),
  actualLoad: z.number().min(0).max(2000).optional().nullable(),
  loadUnit: z.string().max(10).optional().nullable(),
  rpe: z.number().min(0).max(10).optional().nullable(),
  velocity: z.number().min(0).max(20).optional().nullable(),
  playerNote: z.string().max(500).optional().nullable(),
});

/**
 * Log (or correct) a single set on a session exercise. Upsert on
 * (session_exercise_id, set_number) — no delete-then-insert. RLS enforces the
 * player owns the session (or a managing coach is entering it).
 */
export const logSetResult = withBaseballAction(
  'logSetResult',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof logSetSchema>): Promise<ActionResult> => {
    const input = logSetSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    // Resolve the session's player + team so we set the row's owner correctly
    // (RLS will reject a mismatch). A coach-entered set marks coach_observed.
    const { data: sess, error: sErr } = await supabase
      .from('baseball_lift_sessions')
      .select('id, team_id, player_id')
      .eq('id', input.sessionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!sess) throw new BaseballActionError('Session not found or not accessible.');

    const isCoach = ctx.activeRole === 'coach';
    const { data, error } = await supabase
      .from('baseball_lift_set_results')
      .upsert(
        {
          session_exercise_id: input.sessionExerciseId,
          team_id: (sess as { team_id: string }).team_id,
          player_id: (sess as { player_id: string }).player_id,
          set_number: input.setNumber,
          actual_reps: input.actualReps ?? null,
          actual_load: input.actualLoad ?? null,
          load_unit: input.loadUnit ?? null,
          rpe: input.rpe ?? null,
          velocity: input.velocity ?? null,
          player_note: input.playerNote ?? null,
          coach_observed: isCoach,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'session_exercise_id,set_number' },
      )
      .select('id')
      .single();
    if (error) throw error;

    // Close the loop to PRs: a freshly logged set is checked against the player's
    // prior best for this exercise. Side-effect only — never rolls back the set.
    const prCount = await detectAndRecordPr(supabase, {
      teamId: (sess as { team_id: string }).team_id,
      playerId: (sess as { player_id: string }).player_id,
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      actualLoad: input.actualLoad ?? null,
      actualReps: input.actualReps ?? null,
      loadUnit: input.loadUnit ?? null,
      actorIsCoach: isCoach,
      activeCoachId: ctx.activeCoachId,
    });

    revalidatePath(`${PLAYER_LIFT}/${input.sessionId}`);
    revalidatePath(`${PERFORMANCE}/live`);
    revalidatePath(PLAYER_TODAY);
    if (prCount > 0) {
      revalidatePath(`${PERFORMANCE}/players/${(sess as { player_id: string }).player_id}`);
    }
    return { success: true, id: (data as { id: string }).id, count: prCount };
  },
);

const completeSessionSchema = z.object({
  sessionId: uuid,
  playerNote: z.string().max(1000).optional().nullable(),
});

export const completeLiftSession = withBaseballAction(
  'completeLiftSession',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof completeSessionSchema>): Promise<CompleteSessionResult> => {
    const input = completeSessionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        player_note: input.playerNote ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.sessionId)
      .select('id, team_id, player_id, title')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Session not found or not editable.');

    const session = data as {
      id: string;
      team_id: string;
      player_id: string;
      title: string | null;
    };
    const isCoach = ctx.activeRole === 'coach';

    // Gather this session's exercise ids + name snapshots (needed for both PR
    // sweep and the H2 completion stats: top-set display and RPE average).
    const { data: seRows } = await supabase
      .from('baseball_lift_session_exercises')
      .select('id, exercise_name_snapshot')
      .eq('session_id', input.sessionId);
    type SeRow = { id: string; exercise_name_snapshot: string | null };
    const seIds = (seRows ?? []).map((r: SeRow) => r.id);
    const seNameMap = new Map<string, string>(
      (seRows ?? []).map((r: SeRow) => [r.id, r.exercise_name_snapshot ?? 'Exercise']),
    );

    // All logged sets for this session — no load/reps filter so bodyweight sets
    // contribute to the RPE average and the top-set scan covers everything.
    type SetStatRow = {
      session_exercise_id: string;
      actual_load: number | null;
      actual_reps: number | null;
      load_unit: string | null;
      rpe: number | null;
    };
    const allSets: SetStatRow[] = [];
    if (seIds.length > 0) {
      const { data: setData } = await supabase
        .from('baseball_lift_set_results')
        .select('session_exercise_id, actual_load, actual_reps, load_unit, rpe')
        .in('session_exercise_id', seIds);
      if (setData) allSets.push(...(setData as SetStatRow[]));
    }

    // Final PR sweep: catch any best from a logged set in this session that
    // hasn't already produced a PR (idempotent — detectAndRecordPr re-reads the
    // current best each time, so an already-recorded PR is not re-emitted).
    let prCount = 0;
    if (seIds.length > 0) {
      const { data: sweepSets } = await supabase
        .from('baseball_lift_set_results')
        .select('session_exercise_id, actual_load, actual_reps, load_unit')
        .eq('player_id', session.player_id)
        .gt('actual_load', 0)
        .gt('actual_reps', 0)
        .in('session_exercise_id', seIds);
      for (const s of (sweepSets ?? []) as Array<{
        session_exercise_id: string;
        actual_load: number | null;
        actual_reps: number | null;
        load_unit: string | null;
      }>) {
        prCount += await detectAndRecordPr(supabase, {
          teamId: session.team_id,
          playerId: session.player_id,
          sessionId: input.sessionId,
          sessionExerciseId: s.session_exercise_id,
          actualLoad: s.actual_load,
          actualReps: s.actual_reps,
          loadUnit: s.load_unit,
          actorIsCoach: isCoach,
          activeCoachId: ctx.activeCoachId,
        });
      }
    }

    // Compute H2 completion stats from all logged sets.
    let topSet: TopSet | null = null;
    let maxLoad = -1;
    const rpeValues: number[] = [];
    for (const s of allSets) {
      const load = Number(s.actual_load ?? 0);
      const reps = Number(s.actual_reps ?? 0);
      if (load > 0 && reps > 0 && load > maxLoad) {
        maxLoad = load;
        topSet = {
          name: seNameMap.get(s.session_exercise_id) ?? 'Exercise',
          load,
          reps,
          unit: s.load_unit ?? 'lb',
        };
      }
      if (s.rpe !== null && Number(s.rpe) > 0) rpeValues.push(Number(s.rpe));
    }
    const rpeAverage =
      rpeValues.length > 0
        ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
        : null;

    // Always close the loop to the timeline: even with no PR, a completed lift is
    // a real player_only event so the lifting loop reaches the player timeline.
    await appendLiftTimelineEvent({
      teamId: session.team_id,
      playerId: session.player_id,
      title:
        prCount > 0
          ? `Completed ${session.title ?? 'lift'} — ${prCount} new PR${prCount === 1 ? '' : 's'}`
          : `Completed ${session.title ?? 'lift'}`,
      sourceId: input.sessionId,
      actorIsCoach: isCoach,
      createdBy: isCoach ? ctx.activeCoachId : null,
    });

    revalidatePath(`${PLAYER_LIFT}/${input.sessionId}`);
    revalidatePath(PERFORMANCE);
    revalidatePath(PLAYER_TODAY);
    revalidatePath(`${PERFORMANCE}/players/${session.player_id}`);
    return { success: true, id: input.sessionId, count: prCount, prCount, topSet, rpeAverage };
  },
);

// ---- Live Weight Room: polling refresh (read-only, capability-gated) --------
// The client polls this to re-materialize the grid + queues without a full route
// navigation (spec L572 — realtime-or-polling). It's a thin wrapper over the
// server-only read model, wrapped in withBaseballAction so the same capability +
// active-team + Sentry guarantees apply to the poll as to the writes.
const refreshLiveSchema = z.object({
  groupId: uuid.optional().nullable(),
});

export const getLiveWeightRoomSnapshot = withBaseballAction(
  'getLiveWeightRoomSnapshot',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof refreshLiveSchema>): Promise<{
    success: boolean;
    data?: BaseballLiveWeightRoomData;
    error?: string;
  }> => {
    const input = refreshLiveSchema.parse(raw ?? {});
    const caps = await resolveBaseballCapabilities(ctx.targetTeamId);
    const data = await getLiveWeightRoomData(
      ctx.targetTeamId,
      caps.can_view_readiness,
      input.groupId ?? null,
    );
    return { success: true, data };
  },
);

// ---- Live Weight Room: coach modifies a session exercise's load -------------
const modifyExerciseSchema = z.object({
  sessionExerciseId: uuid,
  prescribedLoad: z.number().min(0).max(2000).optional().nullable(),
  prescribedSets: z.number().int().min(0).max(50).optional().nullable(),
  reason: z.string().max(500),
});

export const modifySessionExercise = withBaseballAction(
  'modifySessionExercise',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof modifyExerciseSchema>): Promise<ActionResult> => {
    const input = modifyExerciseSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_lift_session_exercises')
      .update({
        prescribed_load: input.prescribedLoad ?? undefined,
        prescribed_sets: input.prescribedSets ?? undefined,
        modified_by_coach_id: ctx.activeCoachId,
        modification_reason: input.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.sessionExerciseId)
      .select('id, session_id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Exercise not found or not editable.');
    revalidatePath(`${PERFORMANCE}/live`);
    revalidatePath(PLAYER_TODAY);
    revalidatePath(`${PLAYER_LIFT}/${(data as { session_id: string }).session_id}`);
    return { success: true, id: input.sessionExerciseId };
  },
);

// ---- Live Weight Room: coach substitutes the exercise on a station ----------
// Swaps the exercise on a materialized session_exercise to a different library
// exercise (e.g. readiness flag → swap the barbell back squat for a goblet squat).
// Re-snapshots the exercise name (the player surface reads snapshots, never the
// live FK) and stamps status='substituted' + the reason, so the change is honest
// and explainable on both the live grid and the player's Today screen.
const substituteExerciseSchema = z.object({
  sessionExerciseId: uuid,
  newExerciseId: uuid,
  reason: z.string().trim().min(1).max(500),
  /** Optional new prescribed load for the substitute (often lighter). */
  prescribedLoad: z.number().min(0).max(2000).optional().nullable(),
});

export const substituteSessionExercise = withBaseballAction(
  'substituteSessionExercise',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof substituteExerciseSchema>): Promise<ActionResult> => {
    const input = substituteExerciseSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    // Resolve the substitute exercise's name for the snapshot (RLS scopes reads to
    // this team's + global library, so a cross-team id resolves to nothing).
    const { data: ex, error: exErr } = await supabase
      .from('baseball_lift_exercises')
      .select('id, name')
      .eq('id', input.newExerciseId)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!ex) throw new BaseballActionError('Substitute exercise not found.');

    const patch: Record<string, unknown> = {
      exercise_id: input.newExerciseId,
      exercise_name_snapshot: (ex as { name: string }).name,
      status: 'substituted',
      modified_by_coach_id: ctx.activeCoachId,
      modification_reason: `Substituted: ${input.reason}`,
      updated_at: new Date().toISOString(),
    };
    if (input.prescribedLoad != null) patch.prescribed_load = input.prescribedLoad;

    const { data, error } = await supabase
      .from('baseball_lift_session_exercises')
      .update(patch)
      .eq('id', input.sessionExerciseId)
      .select('id, session_id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Exercise not found or not editable.');

    revalidatePath(`${PERFORMANCE}/live`);
    revalidatePath(PLAYER_TODAY);
    revalidatePath(`${PLAYER_LIFT}/${(data as { session_id: string }).session_id}`);
    return { success: true, id: input.sessionExerciseId };
  },
);

// ---- Live Weight Room: coach marks form observed on a logged set -----------
// Coach watched the athlete's set live — stamp coach_observed=true on the latest
// (or a specific) set of an exercise. Honest provenance: marks who verified the
// work without inventing numbers. Idempotent (re-marking is a no-op delta).
const markObservedSchema = z.object({
  sessionExerciseId: uuid,
  /** Specific set to mark; omit to mark the highest-numbered logged set. */
  setNumber: z.number().int().min(1).max(50).optional(),
});

export const markExerciseObserved = withBaseballAction(
  'markExerciseObserved',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof markObservedSchema>): Promise<ActionResult> => {
    const input = markObservedSchema.parse(raw);
    if (ctx.activeRole !== 'coach') {
      throw new BaseballActionError('Only a coach can mark a set observed.');
    }
    const supabase = (await createClient()) as Db;

    // Find the target set: the named one, or the highest set_number with results.
    let setNumber = input.setNumber ?? null;
    if (setNumber == null) {
      const { data: latest } = await supabase
        .from('baseball_lift_set_results')
        .select('set_number')
        .eq('session_exercise_id', input.sessionExerciseId)
        .order('set_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      setNumber = (latest as { set_number?: number } | null)?.set_number ?? null;
    }
    if (setNumber == null) {
      throw new BaseballActionError('No logged set to mark observed yet.');
    }

    const { data, error } = await supabase
      .from('baseball_lift_set_results')
      .update({ coach_observed: true })
      .eq('session_exercise_id', input.sessionExerciseId)
      .eq('set_number', setNumber)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Set not found.');

    revalidatePath(`${PERFORMANCE}/live`);
    return { success: true, id: (data as { id: string }).id };
  },
);

// ---- Live Weight Room: coach sends a quick message to an athlete -----------
// Lightweight floor-to-athlete note. Uses baseball_notifications (direct to the
// player's auth user) — NOT a DM conversation — because the weight-room flow is a
// one-way coaching cue, not a thread. Resolves the player's user_id server-side.
const quickMessageSchema = z.object({
  playerId: uuid,
  message: z.string().trim().min(1).max(500),
});

export const sendLiftQuickMessage = withBaseballAction(
  'sendLiftQuickMessage',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof quickMessageSchema>): Promise<ActionResult> => {
    const input = quickMessageSchema.parse(raw);
    const supabase = (await createClient()) as Db;

    // Defense in depth: the player must be on the active team.
    const { data: member } = await supabase
      .from('baseball_team_members')
      .select('player_id, baseball_players!inner ( id, user_id )')
      .eq('team_id', ctx.targetTeamId)
      .eq('player_id', input.playerId)
      .maybeSingle();
    const userId = (member as { baseball_players?: { user_id?: string } } | null)
      ?.baseball_players?.user_id;
    if (!userId) {
      throw new BaseballActionError('That athlete is not on this team or has no linked account.');
    }

    const { data, error } = await supabase
      .from('baseball_notifications')
      .insert({
        user_id: userId,
        type: 'lift_message',
        title: 'Message from your coach',
        body: input.message,
        data: { source: 'live_weight_room', team_id: ctx.targetTeamId },
      })
      .select('id')
      .single();
    if (error) throw error;

    revalidatePath(`${PERFORMANCE}/live`);
    return { success: true, id: (data as { id: string }).id };
  },
);

// ---- Live Weight Room: coach creates a follow-up task ----------------------
// Spins a session observation into a tracked task (e.g. "Re-test back squat 1RM
// for Smith next week"). Writes baseball_tasks scoped to the active team; the
// task feed picks it up. created_by_id is the coach's auth user.
const followupTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  dueDate: ymd.optional().nullable(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export const createLiftFollowupTask = withBaseballAction(
  'createLiftFollowupTask',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof followupTaskSchema>): Promise<ActionResult> => {
    const input = followupTaskSchema.parse(raw);
    if (!ctx.user?.id) throw new BaseballActionError('No authenticated coach.');
    const supabase = (await createClient()) as Db;

    const { data, error } = await supabase
      .from('baseball_tasks')
      .insert({
        team_id: ctx.targetTeamId,
        title: input.title,
        description: input.description ?? null,
        due_date: input.dueDate ? `${input.dueDate}T00:00:00Z` : null,
        category: 'conditioning',
        priority: input.priority ?? 'normal',
        status: 'pending',
        created_by_id: ctx.user.id,
      })
      .select('id')
      .single();
    if (error) throw error;

    revalidatePath(`${PERFORMANCE}/live`);
    revalidatePath('/baseball/dashboard/tasks');
    return { success: true, id: (data as { id: string }).id };
  },
);

// ============================================================================
// READINESS EXTRAS — soreness map + bodyweight (player-self)
// ============================================================================

const sorenessSchema = z.object({
  checkinId: uuid,
  regions: z.array(z.object({
    bodyRegion: z.string().max(40),
    side: z.enum(['left', 'right', 'both', 'center']).optional(),
    severity: z.number().int().min(0).max(10),
    note: z.string().max(300).optional().nullable(),
  })).max(20),
});

export const saveSorenessMap = withBaseballAction(
  'saveSorenessMap',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_report_availability' },
  async (ctx, raw: z.input<typeof sorenessSchema>): Promise<ActionResult> => {
    const input = sorenessSchema.parse(raw);
    if (!ctx.activePlayerId) throw new BaseballActionError('Only a player can report soreness.');
    const supabase = (await createClient()) as Db;

    // Stage-and-swap: insert the new regions, then remove prior regions for this
    // check-in that the player no longer reports (scoped to this check-in only).
    const { data: existing } = await supabase
      .from('baseball_soreness_maps')
      .select('id')
      .eq('checkin_id', input.checkinId);

    if (input.regions.length) {
      const rows = input.regions.map((r) => ({
        checkin_id: input.checkinId,
        team_id: ctx.activeTeamId,
        player_id: ctx.activePlayerId,
        body_region: r.bodyRegion,
        side: r.side ?? 'both',
        severity: r.severity,
        note: r.note ?? null,
      }));
      const { error } = await fromUntyped(supabase, 'baseball_soreness_maps').insert(rows);
      if (error) throw error;
    }
    const oldIds = (existing ?? []).map((r: { id: string }) => r.id);
    if (oldIds.length) {
      const { error: delErr } = await fromUntyped(supabase, 'baseball_soreness_maps').delete().in('id', oldIds);
      if (delErr) throw delErr;
    }

    revalidatePath('/baseball/dashboard/readiness');
    return { success: true, count: input.regions.length };
  },
);

const bodyweightSchema = z.object({
  entryDate: ymd,
  weightLbs: z.number().min(50).max(500),
});

export const logBodyweight = withBaseballAction(
  'logBodyweight',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_report_availability' },
  async (ctx, raw: z.input<typeof bodyweightSchema>): Promise<ActionResult> => {
    const input = bodyweightSchema.parse(raw);
    if (!ctx.activePlayerId) throw new BaseballActionError('Only a player can log bodyweight.');
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_bodyweight_entries')
      .upsert(
        {
          team_id: ctx.activeTeamId,
          player_id: ctx.activePlayerId,
          entry_date: input.entryDate,
          weight_lbs: input.weightLbs,
          source: 'player',
        },
        { onConflict: 'player_id,entry_date' },
      )
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath('/baseball/dashboard/readiness');
    return { success: true, id: (data as { id: string }).id };
  },
);

// ============================================================================
// AVAILABILITY (staff-authored) + MAXES (staff)
// ============================================================================

const availabilitySchema = z.object({
  playerId: uuid,
  status: z.enum(['available', 'limited', 'hold', 'return_to_play', 'unavailable']),
  reasonCategory: z.enum(['soreness', 'illness', 'injury_note', 'academic', 'travel', 'coach_decision', 'other']).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const setAvailabilityStatus = withBaseballAction(
  'setAvailabilityStatus',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof availabilitySchema>): Promise<ActionResult> => {
    const input = availabilitySchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const { data, error } = await supabase
      .from('baseball_availability_statuses')
      .insert({
        team_id: ctx.targetTeamId,
        player_id: input.playerId,
        status: input.status,
        reason_category: input.reasonCategory ?? null,
        note: input.note ?? null,
        ends_at: input.endsAt ?? null,
        created_by_coach_id: ctx.activeCoachId,
      })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/readiness`);
    return { success: true, id: (data as { id: string }).id };
  },
);

const setMaxSchema = z.object({
  playerId: uuid,
  exerciseId: uuid,
  maxType: z.enum(['estimated_1rm', 'tested_1rm', 'training_max', 'velocity_profile']),
  value: z.number().min(0).max(2000),
  unit: z.string().max(10).optional(),
  testDate: ymd.optional().nullable(),
});

export const setStrengthMax = withBaseballAction(
  'setStrengthMax',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof setMaxSchema>): Promise<ActionResult> => {
    const input = setMaxSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    // Training max is coach-editable and never silently overwritten by estimates
    // (spec L674-676) — each call inserts a new dated row; reads take the latest.
    const { data, error } = await supabase
      .from('baseball_strength_maxes')
      .insert({
        team_id: _ctx.targetTeamId,
        player_id: input.playerId,
        exercise_id: input.exerciseId,
        max_type: input.maxType,
        value: input.value,
        unit: input.unit ?? 'lb',
        test_date: input.testDate ?? null,
        source: 'coach_test',
      })
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/players/${input.playerId}`);
    return { success: true, id: (data as { id: string }).id };
  },
);
