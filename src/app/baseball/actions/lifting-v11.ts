'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/lifting-v11.ts
//
// V11 Premium Lifting server actions — Helm Lift Lab native. EVERY action runs
// inside withBaseballAction so auth + active-team + (where set) server-side
// capability + Sentry scoping + central error logging are guaranteed. RLS on
// every helm_lifting_* table (helm_lifting_can_view_org / can_edit_org /
// is_my_athlete) backstops every path below.
//
// HISTORY: this file used to write baseball_lift_* / baseball_strength_*
// (the "V11 legacy" tables) and, for the player-facing surfaces, additionally
// bridge those rows into their helm_lifting_* mirrors (see PR history for
// "Helm Lifting Lab bridge #486/#492"). Both the legacy materialization and
// the bridge have been removed: this file now writes helm_lifting_* directly
// and exclusively. The 16 legacy tables are 0 rows in prod and are being
// moved to a graveyard schema — nothing in this file may reference them.
//
// Capability map (unchanged from V11):
//   * Groups / exercises / programs / assignments / publish / availability /
//     maxes ........................ can_manage_lifting
//   * Player session lifecycle + set logging + readiness/soreness/bodyweight ...
//     NO requiredCapability (player-self write; RLS enforces ownership).
//
// PUBLISH = MATERIALIZE (spec L463): publishing a program-day assignment
// expands the template (sections + prescriptions) into concrete per-athlete
// sessions + session_exercises rows. We NEVER recompute template math on the
// player surface.
//
// NO destructive writes: upsert/stage-and-swap everywhere; the publish path
// upserts sessions on (program_assignment_id, athlete_id) and replaces a
// session's exercises via a non-destructive "match-and-update, else insert"
// pass (no DELETE-then-INSERT — a session_exercise row referenced by logged
// helm_lifting_set_results is always updated in place, never replaced).
//
// IDENTITY: helm_lifting_* tables are athlete-keyed (helm_lifting_athletes.id),
// not baseball_players.id-keyed. Every exported function below still accepts
// baseball_players.id from its callers (the roster / UI contract is
// unchanged) and resolves player→athlete internally via
// resolveBaseballAthleteIds / resolveMyBaseballAthleteId. A player not yet
// seeded into helm_lifting_athletes for the org is skipped, never thrown —
// ensureBaseballAthletesSynced (wrapping the helm_lifting_sync_org_athletes
// RPC) is called first, best-effort, to backfill any newly-rostered players.
//
// PROVENANCE: every helm_lifting_* "*_by_coach_id" column FKs to
// helm_lifting_coaches(id) — a DIFFERENT identity space from
// ctx.activeCoachId (baseball_coaches.id). A baseball coach who manages
// lifting without a dedicated Lift Lab profile (the "no-coach mode"
// onboarding path grants them a helm_lifting_org_viewers row instead) has no
// helm_lifting_coaches row at all. resolveHelmCoachId() below resolves
// ctx.user.id → helm_lifting_coaches.id when one exists and returns null
// otherwise — every such column is nullable for exactly this reason.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
// The helm_lifting_* tables require fromUntyped (not yet in generated types).
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
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
  resolveMyBaseballAthleteId,
} from '@/lib/lifting/resolve-baseball-context';
import type {
  BaseballStrengthGroupRules,
  BaseballLiveWeightRoomData,
} from '@/lib/types/baseball-lifting-v11';
import type { Json } from '@/lib/types';
import type {
  HelmLiftingGroupType,
  HelmLiftingGroupInsert,
  HelmLiftingGroupUpdate,
  HelmLiftingGroupMemberInsert,
  HelmLiftingProgramInsert,
  HelmLiftingWeekInsert,
  HelmLiftingDayInsert,
  HelmLiftingSectionInsert,
  HelmLiftingPrescriptionInsert,
  HelmLiftingProgramAssignmentInsert,
  HelmLiftingSessionInsert,
  HelmLiftingSessionExerciseInsert,
  HelmLiftingBodyweightEntryInsert,
  HelmLiftingAvailabilityStatusInsert,
  HelmLiftingMaxInsert,
  HelmLiftingPrInsert,
} from '@/lib/types/helm-lifting-data';

const PERFORMANCE = '/baseball/dashboard/performance';
const PLAYER_LIFT = '/baseball/dashboard/lift';
// The player Today screen (and PlayerLiftToday) and the coach Live Weight Room
// both read helm_lifting_sessions / helm_lifting_session_exercises directly —
// revalidate both surfaces on every publish/log so neither goes stale.
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
// SHARED HELPERS
// ============================================================================

/** Resolve organization_id for the active team, throwing a friendly error if Lift Lab isn't configured. */
async function requireLiftingOrg(teamId: string): Promise<{ organizationId: string; teamId: string }> {
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) {
    throw new BaseballActionError('This team has no Lift Lab organization configured.');
  }
  return liftCtx;
}

/**
 * Resolve the caller's helm_lifting_coaches.id for provenance columns. See
 * the file header PROVENANCE note — null is a legitimate, common result (a
 * baseball coach managing lifting via the "no-coach mode" org_viewer grant
 * has no dedicated Lift Lab coach profile).
 */
async function resolveHelmCoachId(
  supabase: Db,
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const { data } = (await fromUntyped(supabase, 'helm_lifting_coaches')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()) as { data: { id: string } | null };
  return data?.id ?? null;
}

/**
 * Best-effort backfill of helm_lifting_athletes for the team's current roster
 * before resolving player→athlete ids. Wraps the helm_lifting_sync_org_athletes
 * SECURITY DEFINER RPC (idempotent — ON CONFLICT DO NOTHING on the athlete
 * unique constraint). Swallows its own error (e.g. the caller has baseball
 * can_manage_lifting but no Lift Lab edit grant): callers always handle a
 * still-missing athlete id gracefully afterward (skip, never throw).
 */
async function ensureBaseballAthletesSynced(
  supabase: Db,
  organizationId: string,
  teamId: string,
): Promise<void> {
  const { error } = (await supabase.rpc('helm_lifting_sync_org_athletes' as never, {
    p_org: organizationId,
    p_sport: 'baseball',
    p_team_id: teamId,
  } as never)) as { error: unknown };
  void error; // best-effort — resolveBaseballAthleteIds below handles any still-missing athlete.
}

/** Resolve a helm_lifting_athletes.id back to the baseball_players.id it was seeded from. */
async function resolveAthletePlayerId(supabase: Db, athleteId: string): Promise<string | null> {
  const { data } = (await fromUntyped(supabase, 'helm_lifting_athletes')
    .select('sport_player_id')
    .eq('id', athleteId)
    .maybeSingle()) as { data: { sport_player_id: string | null } | null };
  return data?.sport_player_id ?? null;
}

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
 * Resolve a group's org + team (defense in depth) and assert it matches the
 * active team. Every membership mutation gates on this so a forged group id
 * from another team is rejected before any write — RLS backstops it, this
 * fails fast + cleanly.
 */
async function assertGroupOnTeam(
  supabase: Db,
  groupId: string,
  organizationId: string,
  teamId: string,
): Promise<{ id: string; name: string; group_type: HelmLiftingGroupType }> {
  const { data, error } = await fromUntyped(supabase, 'helm_lifting_groups')
    .select('id, organization_id, team_id, name, group_type')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BaseballActionError('Group not found.');
  const g = data as {
    id: string; organization_id: string; team_id: string | null;
    name: string; group_type: HelmLiftingGroupType;
  };
  if (g.organization_id !== organizationId || g.team_id !== teamId) {
    throw new BaseballActionError('Group belongs to another team.');
  }
  return { id: g.id, name: g.name, group_type: g.group_type };
}

export const createStrengthGroup = withBaseballAction(
  'createStrengthGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof createGroupSchema>): Promise<ActionResult> => {
    const input = createGroupSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const groupType = (input.groupType ?? 'static') as HelmLiftingGroupType;
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    const payload: HelmLiftingGroupInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      team_id: ctx.targetTeamId,
      name: input.name,
      description: input.description ?? null,
      group_type: groupType,
      rule_json: (input.ruleJson ?? {}) as Json,
      created_by_coach_id: helmCoachId,
      is_active: true,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    const groupId = (data as { id: string }).id;

    const auditEntries: GroupAuditEntry[] = [
      {
        action: 'group_created',
        note: `Created ${groupType} group "${input.name}".`,
        afterState: { source: groupType === 'dynamic' ? 'rule' : 'manual', group_type: groupType },
      },
    ];

    if (input.memberPlayerIds?.length) {
      await ensureBaseballAthletesSynced(supabase, liftCtx.organizationId, ctx.targetTeamId);
      const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, input.memberPlayerIds);
      const memberRows: HelmLiftingGroupMemberInsert[] = [];
      for (const pid of input.memberPlayerIds) {
        const athleteId = athleteMap[pid];
        if (!athleteId) continue; // player not yet seeded in the Lift Lab — skip, never throw.
        memberRows.push({
          group_id: groupId,
          athlete_id: athleteId,
          source: 'manual',
          added_by_coach_id: helmCoachId,
        });
        auditEntries.push({ action: 'member_added', targetAthleteId: athleteId, afterState: { source: 'manual' } });
      }
      if (memberRows.length) {
        const { error: mErr } = await fromUntyped(supabase, 'helm_lifting_group_members')
          .upsert(memberRows, { onConflict: 'group_id,athlete_id' });
        if (mErr) throw mErr;
      }
    }

    await appendGroupAudit(supabase, {
      organizationId: liftCtx.organizationId,
      teamId: ctx.targetTeamId,
      groupId,
      actorId: ctx.user.id,
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    await assertGroupOnTeam(supabase, input.groupId, liftCtx.organizationId, ctx.targetTeamId);
    const source = input.source ?? 'manual';
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    // Ensure roster players have an athlete row, then resolve the desired set
    // to athlete ids. A player still unresolved after sync (e.g. not on the
    // active roster) is silently skipped — honest, never thrown.
    await ensureBaseballAthletesSynced(supabase, liftCtx.organizationId, ctx.targetTeamId);
    const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, input.playerIds);
    const desiredAthleteIds = new Set<string>();
    for (const pid of input.playerIds) {
      const athleteId = athleteMap[pid];
      if (athleteId) desiredAthleteIds.add(athleteId);
    }

    // Stage-and-swap (NOT delete-then-insert in a way that loses data on
    // failure): upsert the desired set FIRST, then remove members not in the
    // set. Diff the before/after to emit a precise audit row per added /
    // removed athlete.
    const { data: before, error: exErr } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .select('id, athlete_id')
      .eq('group_id', input.groupId);
    if (exErr) throw exErr;
    const priorAthleteIds = new Set<string>(
      (before ?? []).map((m: { athlete_id: string }) => m.athlete_id),
    );

    if (desiredAthleteIds.size) {
      const rows: HelmLiftingGroupMemberInsert[] = Array.from(desiredAthleteIds).map((athleteId) => ({
        group_id: input.groupId,
        athlete_id: athleteId,
        source,
        added_by_coach_id: helmCoachId,
      }));
      const { error: upErr } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .upsert(rows, { onConflict: 'group_id,athlete_id' });
      if (upErr) throw upErr;
    }
    const toRemove = (before ?? [])
      .filter((m: { athlete_id: string }) => !desiredAthleteIds.has(m.athlete_id))
      .map((m: { id: string }) => m.id);
    if (toRemove.length) {
      const { error: rmErr } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .delete()
        .in('id', toRemove);
      if (rmErr) throw rmErr;
    }

    // Audit the membership delta (spec L198 — applies to manual edits too).
    const auditEntries: GroupAuditEntry[] = [];
    for (const athleteId of desiredAthleteIds) {
      if (!priorAthleteIds.has(athleteId)) {
        auditEntries.push({ action: 'member_added', targetAthleteId: athleteId, afterState: { source } });
      }
    }
    for (const athleteId of priorAthleteIds) {
      if (!desiredAthleteIds.has(athleteId)) {
        auditEntries.push({ action: 'member_removed', targetAthleteId: athleteId, afterState: { source } });
      }
    }
    await appendGroupAudit(supabase, {
      organizationId: liftCtx.organizationId,
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorId: ctx.user.id,
      entries: auditEntries,
    });

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, count: desiredAthleteIds.size };
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const existing = await assertGroupOnTeam(supabase, input.groupId, liftCtx.organizationId, ctx.targetTeamId);

    const patch: HelmLiftingGroupUpdate = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.groupType !== undefined) patch.group_type = input.groupType as HelmLiftingGroupType;
    if (input.ruleJson !== undefined) patch.rule_json = input.ruleJson as Json;
    if (input.isActive !== undefined) patch.is_active = input.isActive;

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .update(patch)
      .eq('id', input.groupId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Group not found or not editable.');

    const auditEntries: GroupAuditEntry[] = [];
    if (input.ruleJson !== undefined) {
      auditEntries.push({ action: 'rule_changed', note: 'Group rule updated.', afterState: { rule_json: input.ruleJson } });
    }
    if (input.groupType !== undefined && input.groupType !== existing.group_type) {
      auditEntries.push({ action: 'type_changed', note: `Type ${existing.group_type} → ${input.groupType}.` });
    }
    if (input.name !== undefined || input.description !== undefined || input.isActive !== undefined) {
      auditEntries.push({ action: 'group_updated', note: 'Group details updated.' });
    }
    await appendGroupAudit(supabase, {
      organizationId: liftCtx.organizationId,
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorId: ctx.user.id,
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    await assertGroupOnTeam(supabase, input.groupId, liftCtx.organizationId, ctx.targetTeamId);
    const { error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', input.groupId);
    if (error) throw error;
    await appendGroupAudit(supabase, {
      organizationId: liftCtx.organizationId,
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorId: ctx.user.id,
      entries: [{ action: 'group_updated', note: 'Group archived (deactivated).' }],
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
 *
 * The rule engine works in baseball_players.id space (getStrengthGroupsBoard /
 * evaluateGroupRule are unaffected by this unification); this action maps the
 * rule's player-id output to helm_lifting_athletes.id ONLY at the write
 * boundary, so no reverse athlete→player DB scan is needed — the forward map
 * built for the desired set doubles as the reason lookup.
 */
export const recomputeDynamicGroup = withBaseballAction(
  'recomputeDynamicGroup',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof recomputeSchema>): Promise<ActionResult> => {
    const input = recomputeSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    const { data: groupData, error: gErr } = await fromUntyped(supabase, 'helm_lifting_groups')
      .select('id, organization_id, team_id, group_type, rule_json, is_active')
      .eq('id', input.groupId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!groupData) throw new BaseballActionError('Group not found.');
    const group = groupData as {
      id: string; organization_id: string; team_id: string | null;
      group_type: HelmLiftingGroupType; rule_json: unknown; is_active: boolean;
    };
    if (group.organization_id !== liftCtx.organizationId || group.team_id !== ctx.targetTeamId) {
      throw new BaseballActionError('Group belongs to another team.');
    }
    if (group.group_type !== 'dynamic') {
      throw new BaseballActionError('Only dynamic groups can be recomputed.');
    }
    const rule = (group.rule_json ?? {}) as BaseballStrengthGroupRules;
    if (!ruleHasPredicates(rule)) {
      throw new BaseballActionError('This dynamic group has no rule to evaluate.');
    }

    const board = await getStrengthGroupsBoard(ctx.targetTeamId, rule.lookback_days ?? 14);
    const evaluation = evaluateGroupRule(rule, board.roster);
    const reasonByPlayerId = new Map(evaluation.matches.map((m) => [m.player_id, m.reasons]));

    await ensureBaseballAthletesSynced(supabase, liftCtx.organizationId, ctx.targetTeamId);
    const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, evaluation.included_ids);
    const desiredAthleteIds = new Set<string>();
    const athleteToPlayerId = new Map<string, string>();
    for (const pid of evaluation.included_ids) {
      const athleteId = athleteMap[pid];
      if (!athleteId) continue; // rule-matched player not yet seeded — skip, never throw.
      desiredAthleteIds.add(athleteId);
      athleteToPlayerId.set(athleteId, pid);
    }

    const { data: before, error: bErr } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .select('id, athlete_id, source')
      .eq('group_id', input.groupId);
    if (bErr) throw bErr;
    type PriorMember = { id: string; athlete_id: string; source: string };
    const priorByAthleteId = new Map<string, PriorMember>(
      (before ?? []).map((m: PriorMember) => [m.athlete_id, m] as [string, PriorMember]),
    );

    // Upsert rule-matched athletes (rule source). Preserve coach-pinned manual
    // rows by NOT downgrading their source — only insert/keep, never overwrite manual.
    const toUpsert: HelmLiftingGroupMemberInsert[] = [];
    for (const athleteId of desiredAthleteIds) {
      if (priorByAthleteId.get(athleteId)?.source === 'manual') continue;
      toUpsert.push({ group_id: input.groupId, athlete_id: athleteId, source: 'rule', added_by_coach_id: helmCoachId });
    }
    if (toUpsert.length) {
      const { error: upErr } = await fromUntyped(supabase, 'helm_lifting_group_members')
        .upsert(toUpsert, { onConflict: 'group_id,athlete_id' });
      if (upErr) throw upErr;
    }

    // Remove ONLY rule-sourced members no longer matched (manual pins are kept).
    const toRemove = (before ?? [])
      .filter((m: { athlete_id: string; source: string }) => m.source === 'rule' && !desiredAthleteIds.has(m.athlete_id))
      .map((m: { id: string }) => m.id);
    if (toRemove.length) {
      const { error: rmErr } = await fromUntyped(supabase, 'helm_lifting_group_members').delete().in('id', toRemove);
      if (rmErr) throw rmErr;
    }

    // Audit: a row per real delta + a summary recompute row.
    const auditEntries: GroupAuditEntry[] = [];
    for (const athleteId of desiredAthleteIds) {
      if (!priorByAthleteId.has(athleteId)) {
        const pid = athleteToPlayerId.get(athleteId);
        auditEntries.push({
          action: 'member_added',
          targetAthleteId: athleteId,
          note: (pid && reasonByPlayerId.get(pid)?.join('; ')) || 'Matched group rule.',
          afterState: { source: 'rule' },
        });
      }
    }
    for (const [athleteId, m] of priorByAthleteId) {
      if (m.source === 'rule' && !desiredAthleteIds.has(athleteId)) {
        auditEntries.push({
          action: 'member_removed',
          targetAthleteId: athleteId,
          note: 'No longer matches group rule.',
          afterState: { source: 'rule' },
        });
      }
    }
    auditEntries.push({
      action: 'recomputed',
      note: `Recomputed: ${desiredAthleteIds.size} matched.`,
      afterState: {
        matched: desiredAthleteIds.size,
        added: auditEntries.filter((e) => e.action === 'member_added').length,
        removed: auditEntries.filter((e) => e.action === 'member_removed').length,
      },
    });
    await appendGroupAudit(supabase, {
      organizationId: liftCtx.organizationId,
      teamId: ctx.targetTeamId,
      groupId: input.groupId,
      actorId: ctx.user.id,
      entries: auditEntries,
    });

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, id: input.groupId, count: desiredAthleteIds.size };
  },
);

// ---- Seed the 12 default groups (spec L155-168), idempotent -----------------
export const seedDefaultStrengthGroups = withBaseballAction(
  'seedDefaultStrengthGroups',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx): Promise<ActionResult> => {
    const supabase = (await createClient()) as Db;
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    // Only create the names that don't already exist (idempotent re-runs).
    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_groups')
      .select('name')
      .eq('organization_id', liftCtx.organizationId)
      .eq('team_id', ctx.targetTeamId);
    const have = new Set(
      (existing ?? []).map((g: { name: string }) => g.name.toLowerCase()),
    );
    const missing = DEFAULT_STRENGTH_GROUP_NAMES.filter((n) => !have.has(n.toLowerCase()));
    if (missing.length === 0) return { success: true, count: 0 };

    const rows: HelmLiftingGroupInsert[] = missing.map((name) => ({
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      team_id: ctx.targetTeamId,
      name,
      group_type: 'static',
      rule_json: {},
      created_by_coach_id: helmCoachId,
    }));
    const { data: created, error } = await fromUntyped(supabase, 'helm_lifting_groups')
      .insert(rows)
      .select('id');
    if (error) throw error;

    // One created-audit row per seeded group.
    for (const g of (created ?? []) as Array<{ id: string }>) {
      await appendGroupAudit(supabase, {
        organizationId: liftCtx.organizationId,
        teamId: ctx.targetTeamId,
        groupId: g.id,
        actorId: ctx.user.id,
        entries: [{ action: 'group_created', note: 'Seeded default group.', afterState: { source: 'system' } }],
      });
    }

    revalidatePath(`${PERFORMANCE}/groups`);
    return { success: true, count: missing.length };
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    const payload: HelmLiftingProgramInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      team_id: ctx.targetTeamId,
      name: input.name,
      description: input.description ?? null,
      phase: input.phase ?? 'in_season',
      goal: input.goal ?? 'strength',
      created_by_coach_id: helmCoachId,
      status: 'draft',
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_programs')
      .insert(payload)
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
    revalidatePath(`${PERFORMANCE}/programs`);
    return { success: true, id: (data as { id: string }).id };
  },
);

const addDaySchema = z.object({
  weekId: uuid,
  dayNumber: z.number().int().min(1).max(7),
  name: z.string().max(80).optional().nullable(),
  dayType: z.enum(['lower', 'upper', 'full_body', 'recovery', 'arm_care', 'conditioning', 'testing', 'custom']).optional(),
  // External field name kept as `baseballContext` (UI contract —
  // ProgramEditorClient.tsx passes this key); maps to the sport_context
  // column internally (helm family rename: baseball_context → sport_context).
  baseballContext: z.string().max(40).optional().nullable(),
  estimatedMinutes: z.number().int().min(0).max(300).optional().nullable(),
});

export const addLiftDay = withBaseballAction(
  'addLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (_ctx, raw: z.input<typeof addDaySchema>): Promise<ActionResult> => {
    const input = addDaySchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const payload: HelmLiftingDayInsert = {
      week_id: input.weekId,
      day_number: input.dayNumber,
      name: input.name ?? null,
      day_type: input.dayType ?? 'full_body',
      sport_context: input.baseballContext ?? null,
      estimated_minutes: input.estimatedMinutes ?? null,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_days')
      .upsert(payload, { onConflict: 'week_id,day_number' })
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
    const payload: HelmLiftingSectionInsert = {
      lift_day_id: input.liftDayId,
      name: input.name,
      section_type: input.sectionType ?? 'main_strength',
      section_order: input.sectionOrder ?? 0,
      instructions: input.instructions ?? null,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sections')
      .insert(payload)
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
    const payload: HelmLiftingPrescriptionInsert = {
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
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
      .insert(payload)
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
// one runs inside withBaseballAction with can_manage_lifting; RLS (split
// SELECT/INSERT/UPDATE/DELETE policies on the helm_lifting_* program tree,
// gated to helm_lifting_can_edit_org via the owning program's organization_id)
// backstops every write.
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

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_programs')
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

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
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
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sections')
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
  // External field name kept as `baseballContext` — see addDaySchema note above.
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
    if (input.baseballContext !== undefined) patch.sport_context = input.baseballContext;
    if (input.estimatedMinutes !== undefined) patch.estimated_minutes = input.estimatedMinutes;
    if (Object.keys(patch).length === 0) return { success: true, id: input.dayId };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_days')
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
      const { error } = await fromUntyped(supabase, 'helm_lifting_sections')
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
      const { error } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
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
    const { error } = await fromUntyped(supabase, 'helm_lifting_prescriptions').delete().eq('id', id);
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
    const { error } = await fromUntyped(supabase, 'helm_lifting_sections').delete().eq('id', id);
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
    const { error } = await fromUntyped(supabase, 'helm_lifting_days').delete().eq('id', id);
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
    const { error } = await fromUntyped(supabase, 'helm_lifting_weeks').delete().eq('id', id);
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
  const { data: sections, error: secErr } = await fromUntyped(supabase, 'helm_lifting_sections')
    .select('id, section_order, name, section_type, instructions')
    .eq('lift_day_id', sourceDayId)
    .order('section_order', { ascending: true });
  if (secErr) throw secErr;
  for (const s of (sections ?? []) as Array<{
    id: string; section_order: number; name: string; section_type: string; instructions: string | null;
  }>) {
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
      .select('exercise_id, order_index, prescription_type, sets, reps, load_value, load_unit, percent_1rm, target_rpe, target_rir, target_velocity_min, target_velocity_max, rest_seconds, tempo, coaching_note, substitution_group_id')
      .eq('section_id', s.id)
      .order('order_index', { ascending: true });
    if (pErr) throw pErr;
    const presRows = (pres ?? []).map((p: Record<string, unknown>) => ({ ...p, section_id: newSectionId }));
    if (presRows.length) {
      const { error: insErr } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
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

    const { data: src, error: srcErr } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('id, week_id, day_number, name, day_type, sport_context, estimated_minutes')
      .eq('id', input.dayId)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src) throw new BaseballActionError('Day not found.');
    const source = src as {
      id: string; week_id: string; day_number: number; name: string | null;
      day_type: string; sport_context: string | null; estimated_minutes: number | null;
    };
    const weekId = input.targetWeekId ?? source.week_id;

    // Next free day_number in the target week (unique on week_id,day_number).
    const { data: siblings } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('day_number')
      .eq('week_id', weekId);
    const used = new Set((siblings ?? []).map((d: { day_number: number }) => d.day_number));
    let nextDay = 1;
    while (used.has(nextDay) && nextDay < 7) nextDay++;
    if (used.has(nextDay)) throw new BaseballActionError('That week already has 7 days.');

    const { data: newDay, error: ndErr } = await fromUntyped(supabase, 'helm_lifting_days')
      .insert({
        week_id: weekId,
        day_number: nextDay,
        name: source.name ? `${source.name} (copy)` : null,
        day_type: source.day_type,
        sport_context: source.sport_context,
        estimated_minutes: source.estimated_minutes,
      })
      .select('id')
      .single();
    if (ndErr) throw ndErr;
    const newDayId = (newDay as { id: string }).id;

    await deepCopyDay(supabase, source.id, newDayId);

    // Resolve the owning program for revalidation.
    const { data: wk } = await fromUntyped(supabase, 'helm_lifting_weeks')
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

    const { data: src, error: srcErr } = await fromUntyped(supabase, 'helm_lifting_weeks')
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
    const { data: siblings } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('week_number')
      .eq('program_id', source.program_id);
    const maxWeek = (siblings ?? []).reduce(
      (m: number, w: { week_number: number }) => Math.max(m, w.week_number),
      0,
    );
    const nextWeek = maxWeek + 1;
    if (nextWeek > 52) throw new BaseballActionError('A program cannot exceed 52 weeks.');

    const { data: newWeek, error: nwErr } = await fromUntyped(supabase, 'helm_lifting_weeks')
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
    const { data: days, error: dErr } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('id, day_number, name, day_type, sport_context, estimated_minutes')
      .eq('week_id', source.id)
      .order('day_number', { ascending: true });
    if (dErr) throw dErr;
    for (const d of (days ?? []) as Array<{
      id: string; day_number: number; name: string | null; day_type: string;
      sport_context: string | null; estimated_minutes: number | null;
    }>) {
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

    const { data: src, error: srcErr } = await fromUntyped(supabase, 'helm_lifting_programs')
      .select('id, organization_id, team_id, name, description, phase, goal, visibility')
      .eq('id', input.programId)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!src) throw new BaseballActionError('Program not found.');
    const source = src as {
      id: string; organization_id: string; team_id: string | null; name: string; description: string | null;
      phase: string; goal: string; visibility: string;
    };
    // Defense in depth: a template is created on the SOURCE program's team only.
    if (source.team_id !== ctx.targetTeamId) {
      throw new BaseballActionError('Program belongs to another team.');
    }
    const helmCoachId = await resolveHelmCoachId(supabase, source.organization_id, ctx.user.id);

    const { data: tpl, error: tplErr } = await fromUntyped(supabase, 'helm_lifting_programs')
      .insert({
        organization_id: source.organization_id,
        sport: 'baseball',
        team_id: source.team_id,
        name: input.name?.trim() || `${source.name} (template)`,
        description: source.description,
        phase: source.phase,
        goal: source.goal,
        visibility: source.visibility,
        status: 'draft',
        is_template: true,
        created_by_coach_id: helmCoachId,
      })
      .select('id')
      .single();
    if (tplErr) throw tplErr;
    const templateId = (tpl as { id: string }).id;

    // Deep copy every week + day subtree.
    const { data: weeks, error: wErr } = await fromUntyped(supabase, 'helm_lifting_weeks')
      .select('id, week_number, name, theme, deload')
      .eq('program_id', source.id)
      .order('week_number', { ascending: true });
    if (wErr) throw wErr;
    for (const w of (weeks ?? []) as Array<{
      id: string; week_number: number; name: string | null; theme: string | null; deload: boolean;
    }>) {
      const { data: nw, error: nwErr } = await fromUntyped(supabase, 'helm_lifting_weeks')
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

      const { data: days, error: dErr } = await fromUntyped(supabase, 'helm_lifting_days')
        .select('id, day_number, name, day_type, sport_context, estimated_minutes')
        .eq('week_id', w.id)
        .order('day_number', { ascending: true });
      if (dErr) throw dErr;
      for (const d of (days ?? []) as Array<{
        id: string; day_number: number; name: string | null; day_type: string;
        sport_context: string | null; estimated_minutes: number | null;
      }>) {
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
  /** Resolved player ids (baseball_players.id) the session is being materialized for. */
  playerIds: z.array(uuid).min(1).max(200),
  assignmentType: z.enum(['team', 'group', 'player']).optional(),
  groupId: uuid.optional().nullable(),
  /** When true, also create/link a baseball_events Lift event for the calendar. */
  createCalendarEvent: z.boolean().optional(),
  title: z.string().max(160).optional().nullable(),
});

/**
 * Publish a program-day to a set of players: create the program assignment,
 * (optionally) a calendar event, then MATERIALIZE one session per athlete with a
 * frozen snapshot of every prescription as session_exercises. Idempotent re-runs
 * upsert sessions on (assignment, athlete) — no on-the-fly template math anywhere
 * on the player surface. Writes helm_lifting_* exclusively — there is no legacy
 * materialization and no bridge step anymore (see file header HISTORY note).
 */
export const publishLiftDay = withBaseballAction(
  'publishLiftDay',
  { featureArea: 'lifting', requiredCapability: 'can_manage_lifting' },
  async (ctx, raw: z.input<typeof publishSchema>): Promise<ActionResult> => {
    const input = publishSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const teamId = ctx.targetTeamId;
    const liftCtx = await requireLiftingOrg(teamId);
    const orgId = liftCtx.organizationId;
    const helmCoachId = await resolveHelmCoachId(supabase, orgId, ctx.user.id);

    // 1. Read the template day -> sections -> prescriptions (+ exercise names).
    const { data: sections, error: secErr } = await fromUntyped(supabase, 'helm_lifting_sections')
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
      const { data: pres, error: preErr } = await fromUntyped(supabase, 'helm_lifting_prescriptions')
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
      const { data: exs } = await fromUntyped(supabase, 'helm_lifting_exercises')
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

    // 2. Find-or-create the program assignment. helm_lifting_program_assignments
    // has NO usable unique constraint (organization_id, team_id, program_id,
    // lift_day_id, scheduled_date) to .upsert({ onConflict }) against — look it
    // up first and UPDATE in place when it already exists (never delete-then-
    // insert), so assignmentId — and therefore the session upsert target below
    // — stays stable across re-publishes.
    //
    // KNOWN RACE (documented, not fixed here): this is a check-then-act (SELECT
    // then INSERT), not an atomic upsert. Two concurrent publish calls for the
    // same program day/date (e.g. a coach double-clicking "Publish") can both
    // read existingAsg = null and both INSERT, producing two assignment rows.
    // Closing this fully requires a migration adding a unique constraint (or an
    // advisory lock), out of scope for this file.
    const { data: existingAsg, error: existingAsgErr } = await fromUntyped(supabase, 'helm_lifting_program_assignments')
      .select('id')
      .eq('organization_id', orgId)
      .eq('sport', 'baseball')
      .eq('team_id', teamId)
      .eq('program_id', input.programId)
      .eq('lift_day_id', input.liftDayId)
      .eq('scheduled_date', input.scheduledDate)
      .maybeSingle();
    if (existingAsgErr) throw existingAsgErr;

    // Optional calendar event (spec "Calendar Integration" L876-897).
    // helm_lifting_program_assignments has NO event_id column (unlike the
    // legacy baseball_lift_program_assignments it replaces — a real schema
    // gap this file cannot close without a migration, out of scope here), so
    // the assignment↔event link can't be stored. Dedupe by querying
    // baseball_events for a same-team/same-day 'lift' event instead of
    // reusing a stored FK, so a re-publish still doesn't mint a duplicate
    // calendar event for the same program day/date. baseball_events stays a
    // real baseball table — untouched by this migration.
    if (input.createCalendarEvent) {
      const start = `${input.scheduledDate}T16:00:00Z`;
      const { data: existingEvent } = await supabase
        .from('baseball_events')
        .select('id')
        .eq('team_id', teamId)
        .eq('event_type', 'lift')
        .eq('start_time', start)
        .maybeSingle();
      if (!existingEvent) {
        const { error: evErr } = await supabase
          .from('baseball_events')
          .insert({
            team_id: teamId,
            title: input.title ?? 'Lift',
            event_type: 'lift',
            start_time: start,
            created_by: ctx.user?.id ?? null,
          });
        if (evErr) throw evErr;
      }
    }

    let assignmentId: string;
    if (existingAsg) {
      assignmentId = (existingAsg as { id: string }).id;
      const { error: asgUpdErr } = await fromUntyped(supabase, 'helm_lifting_program_assignments')
        .update({
          assigned_by_coach_id: helmCoachId,
          assignment_type: input.assignmentType ?? 'group',
          group_id: input.groupId ?? null,
          status: 'published',
          player_visible_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignmentId);
      if (asgUpdErr) throw asgUpdErr;
    } else {
      const asgPayload: HelmLiftingProgramAssignmentInsert = {
        organization_id: orgId,
        sport: 'baseball',
        team_id: teamId,
        program_id: input.programId,
        lift_day_id: input.liftDayId,
        assigned_by_coach_id: helmCoachId,
        assignment_type: input.assignmentType ?? 'group',
        group_id: input.groupId ?? null,
        scheduled_date: input.scheduledDate,
        status: 'published',
        player_visible_at: new Date().toISOString(),
      };
      const { data: asg, error: asgErr } = await fromUntyped(supabase, 'helm_lifting_program_assignments')
        .insert(asgPayload)
        .select('id')
        .single();
      if (asgErr) throw asgErr;
      assignmentId = (asg as { id: string }).id;
    }

    // 3. Resolve player→athlete ids (ensure roster players are seeded first;
    // best-effort — a not-yet-seeded player is skipped, never thrown).
    await ensureBaseballAthletesSynced(supabase, orgId, teamId);
    const athleteMap = await resolveBaseballAthleteIds(orgId, input.playerIds);
    const athleteIds = input.playerIds
      .map((pid) => athleteMap[pid])
      .filter((x): x is string => Boolean(x));

    // 4. MATERIALIZE: one session per athlete (upsert; no delete-then-insert).
    const sessionRows: HelmLiftingSessionInsert[] = athleteIds.map((athleteId) => ({
      program_assignment_id: assignmentId,
      organization_id: orgId,
      sport: 'baseball',
      team_id: teamId,
      athlete_id: athleteId,
      title: input.title ?? 'Lift',
      scheduled_date: input.scheduledDate,
      status: 'assigned',
    }));
    let sessions: Array<{ id: string; athlete_id: string }> = [];
    if (sessionRows.length) {
      const { data, error: sErr } = await fromUntyped(supabase, 'helm_lifting_sessions')
        .upsert(sessionRows, { onConflict: 'program_assignment_id,athlete_id' })
        .select('id, athlete_id');
      if (sErr) throw sErr;
      sessions = data ?? [];
    }

    // 5. Snapshot the prescriptions into session_exercises for each session.
    const sessionExerciseRows: Array<Record<string, unknown>> = [];
    for (const sess of sessions) {
      let order = 0;
      for (const p of prescriptions) {
        const meta = sectionMeta.get(p.section_id);
        sessionExerciseRows.push({
          session_id: sess.id,
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
      // Stage-and-swap: match each snapshot row to an already-materialized row
      // for the SAME (session_id, prescription_id) and UPDATE it in place with
      // the latest prescription values — never delete-then-reinsert, so a
      // session_exercise row referenced by logged helm_lifting_set_results is
      // always preserved and simply gets its snapshot columns refreshed.
      const sessionIds = sessions.map((s) => s.id);
      const { data: existingSe, error: existingSeErr } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
        .select('id, session_id, prescription_id')
        .in('session_id', sessionIds);
      if (existingSeErr) throw existingSeErr;
      const existingSeIdByKey = new Map(
        (existingSe ?? []).map((r: { id: string; session_id: string; prescription_id: string | null }) => [
          `${r.session_id}:${r.prescription_id}`,
          r.id,
        ]),
      );

      const fresh: HelmLiftingSessionExerciseInsert[] = [];
      for (const row of sessionExerciseRows) {
        const key = `${row.session_id}:${row.prescription_id}`;
        const existingSeId = existingSeIdByKey.get(key);
        if (existingSeId) {
          // Status is intentionally NOT overwritten here — a player may have
          // already progressed this session_exercise (started/completed) and a
          // coach re-publish must not silently reset that progress.
          const { error: seUpdErr } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
            .update({
              exercise_id: row.exercise_id,
              exercise_name_snapshot: row.exercise_name_snapshot,
              section_name_snapshot: row.section_name_snapshot,
              section_type_snapshot: row.section_type_snapshot,
              order_index: row.order_index,
              prescribed_sets: row.prescribed_sets,
              prescribed_reps: row.prescribed_reps,
              prescribed_load: row.prescribed_load,
              prescribed_load_unit: row.prescribed_load_unit,
              prescribed_rpe: row.prescribed_rpe,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSeId);
          if (seUpdErr) throw seUpdErr;
          continue;
        }
        fresh.push(row as unknown as HelmLiftingSessionExerciseInsert);
      }
      if (fresh.length) {
        const { error: seErr } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
          .insert(fresh);
        if (seErr) throw seErr;
      }
    }

    revalidatePath(PERFORMANCE);
    revalidatePath(PLAYER_LIFT);
    revalidatePath(PLAYER_TODAY);
    return { success: true, id: assignmentId, count: sessions.length };
  },
);

// ============================================================================
// PR DETECTION — closes the lifting loop (assign -> session -> sets -> PRs)
//
// A logged set is compared against the athlete's prior best for that exercise.
// On a new best we (a) record a helm_lifting_prs row, (b) — coach actor only,
// because RLS gates maxes to staff — refresh the estimated 1RM in
// helm_lifting_maxes, and (c) append a `lift` timeline event marking the PR
// (the timeline table itself stays baseball_players.id-keyed, so we resolve
// athlete→player once here for that call only).
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
 * Compare one logged set against the athlete's prior best for an exercise and,
 * on a new best, record the PR(s), refresh the estimated 1RM max (coach actor
 * only), and append a `lift` timeline PR event. Returns the number of PR rows
 * written.
 *
 * Side-effect only — swallows its own errors so a logging happy-path is never
 * rolled back by a PR side-effect.
 */
async function detectAndRecordPr(
  supabase: Db,
  args: {
    organizationId: string;
    athleteId: string;
    /** helm_lifting_sessions.id */
    sessionId: string;
    /** helm_lifting_session_exercises.id */
    sessionExerciseId: string;
    actualLoad: number | null;
    actualReps: number | null;
    loadUnit: string | null;
    actorIsCoach: boolean;
    /** helm_lifting_coaches.id — for helm_lifting_prs/maxes provenance. */
    helmCoachId: string | null;
    /** baseball team id — for the timeline event only. */
    teamId: string;
    /** baseball_coaches.id — for the timeline event's createdBy only. */
    activeCoachId: string | null;
  },
): Promise<number> {
  try {
    const load = args.actualLoad ?? 0;
    const reps = args.actualReps ?? 0;
    // Only a weighted, rep-bearing set can set a load/1RM PR.
    if (load <= 0 || reps <= 0) return 0;

    // Resolve the exercise this set belongs to (id + name for the timeline copy).
    const { data: se, error: seErr } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
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
    const { data: priorPrs } = await fromUntyped(supabase, 'helm_lifting_prs')
      .select('pr_type, value')
      .eq('athlete_id', args.athleteId)
      .eq('exercise_id', exerciseId)
      .in('pr_type', ['load', 'estimated_1rm']);
    const { data: priorMaxes } = await fromUntyped(supabase, 'helm_lifting_maxes')
      .select('max_type, value')
      .eq('athlete_id', args.athleteId)
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

    const prRows: HelmLiftingPrInsert[] = [];
    const EPS = 0.01;
    const isLoadPr = load > best.load + EPS;
    // Estimated-1RM PR only when the estimate is meaningful (≤12 reps) and beats
    // the prior estimated/tested 1RM.
    const is1rmPr = reps <= 12 && est1rm > best.estimated1rm + EPS && est1rm > 0;

    if (isLoadPr) {
      prRows.push({
        organization_id: args.organizationId,
        sport: 'baseball',
        athlete_id: args.athleteId,
        exercise_id: exerciseId,
        pr_type: 'load',
        value: load,
        unit,
        lift_session_id: args.sessionId,
        verified_by_coach_id: args.actorIsCoach ? args.helmCoachId : null,
      });
    }
    if (is1rmPr) {
      prRows.push({
        organization_id: args.organizationId,
        sport: 'baseball',
        athlete_id: args.athleteId,
        exercise_id: exerciseId,
        pr_type: 'estimated_1rm',
        value: est1rm,
        unit,
        lift_session_id: args.sessionId,
        verified_by_coach_id: args.actorIsCoach ? args.helmCoachId : null,
      });
    }
    if (!prRows.length) return 0;

    // Record the PR(s). RLS allows an athlete to insert their OWN PR.
    const { error: prErr } = await fromUntyped(supabase, 'helm_lifting_prs').insert(prRows);
    if (prErr) return 0;

    // Refresh the estimated 1RM max — ONLY a coach actor (RLS gates maxes to
    // staff). A player-self 1RM PR is recorded as a PR and surfaced to the coach
    // for verification rather than silently overwriting the training max.
    if (is1rmPr && args.actorIsCoach) {
      const maxRow: HelmLiftingMaxInsert = {
        organization_id: args.organizationId,
        sport: 'baseball',
        athlete_id: args.athleteId,
        exercise_id: exerciseId,
        max_type: 'estimated_1rm',
        value: est1rm,
        unit,
        source: 'calculated',
        confidence: 0.8,
      };
      await fromUntyped(supabase, 'helm_lifting_maxes').insert(maxRow);
    }

    // Append a `lift` timeline PR event (player_only). Honest, source-cited:
    // the PR cites its originating lift session. The timeline stays keyed to
    // baseball_players.id — resolve the athlete's player id once here.
    const playerId = await resolveAthletePlayerId(supabase, args.athleteId);
    if (playerId) {
      const headline = is1rmPr
        ? `New ${exerciseName} PR — est. 1RM ${est1rm} ${unit} (${load}×${reps})`
        : `New ${exerciseName} PR — ${load} ${unit} × ${reps}`;
      await appendLiftTimelineEvent({
        teamId: args.teamId,
        playerId,
        title: headline,
        sourceId: args.sessionId,
        actorIsCoach: args.actorIsCoach,
        createdBy: args.actorIsCoach ? args.activeCoachId : null,
      });
    }

    return prRows.length;
  } catch {
    // Side-effect only: never roll back the athlete's logged set.
    return 0;
  }
}

// ============================================================================
// SESSION LIFECYCLE + SET LOGGING (player-self + coach-observed)
//
// Both the player Lift surface (PlayerLiftSessionClient, via
// getPlayerLiftSession) and the coach Live Weight Room (LiveWeightRoom.tsx,
// via getLiveWeightRoomData) read from helm_lifting_sessions /
// helm_lifting_session_exercises — the legacy baseball_lift_sessions
// materialization + the dual-space session resolver that used to bridge them
// are gone (see file header HISTORY). Every action below resolves a session
// id directly against helm_lifting_sessions; RLS
// (helm_lifting_is_my_athlete OR helm_lifting_can_edit_org) backstops
// ownership either way.
// ============================================================================

interface HelmLiftSessionContext {
  sessionId: string;
  organizationId: string;
  teamId: string | null;
  athleteId: string;
}

/** Resolve a helm_lifting_sessions.id to its org/team/athlete context, or throw. */
async function requireHelmSession(supabase: Db, sessionId: string): Promise<HelmLiftSessionContext> {
  const { data } = (await fromUntyped(supabase, 'helm_lifting_sessions')
    .select('id, organization_id, team_id, athlete_id')
    .eq('id', sessionId)
    .maybeSingle()) as {
    data: { id: string; organization_id: string; team_id: string | null; athlete_id: string } | null;
  };
  if (!data) throw new BaseballActionError('Session not found or not accessible.');
  return {
    sessionId: data.id,
    organizationId: data.organization_id,
    teamId: data.team_id,
    athleteId: data.athlete_id,
  };
}

const startSessionSchema = z.object({ sessionId: uuid });

export const startLiftSession = withBaseballAction(
  'startLiftSession',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof startSessionSchema>): Promise<ActionResult> => {
    const input = startSessionSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    void ctx;

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({ status: 'started', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', input.sessionId)
      .eq('status', 'assigned')
      .select('id')
      .maybeSingle();
    if (error) throw error;

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
 * athlete owns the session (or a managing coach is entering it).
 */
export const logSetResult = withBaseballAction(
  'logSetResult',
  { featureArea: 'lifting', requiredPlayerAccess: 'can_self_log_lift' },
  async (ctx, raw: z.input<typeof logSetSchema>): Promise<ActionResult> => {
    const input = logSetSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const session = await requireHelmSession(supabase, input.sessionId);
    const isCoach = ctx.activeRole === 'coach';

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .upsert(
        {
          session_exercise_id: input.sessionExerciseId,
          organization_id: session.organizationId,
          sport: 'baseball',
          athlete_id: session.athleteId,
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
        // Matches the real DB constraint (uq_helm_lifting_set): UNIQUE
        // (session_exercise_id, set_number). NOT (..., athlete_id, ...) — a
        // 3-column onConflict targets a constraint that doesn't exist and
        // would 400 on every upsert.
        { onConflict: 'session_exercise_id,set_number' },
      )
      .select('id')
      .single();
    if (error) throw error;
    const setRowId = (data as { id: string }).id;

    // Auto-advance assigned -> started.
    await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({ status: 'started', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', input.sessionId)
      .eq('status', 'assigned');

    const helmCoachId = isCoach ? await resolveHelmCoachId(supabase, session.organizationId, ctx.user.id) : null;
    const prCount = await detectAndRecordPr(supabase, {
      organizationId: session.organizationId,
      athleteId: session.athleteId,
      sessionId: input.sessionId,
      sessionExerciseId: input.sessionExerciseId,
      actualLoad: input.actualLoad ?? null,
      actualReps: input.actualReps ?? null,
      loadUnit: input.loadUnit ?? null,
      actorIsCoach: isCoach,
      helmCoachId,
      teamId: session.teamId ?? ctx.targetTeamId,
      activeCoachId: ctx.activeCoachId,
    });

    revalidatePath(`${PLAYER_LIFT}/${input.sessionId}`);
    revalidatePath(`${PERFORMANCE}/live`);
    revalidatePath(PLAYER_TODAY);
    if (prCount > 0) {
      const playerId = await resolveAthletePlayerId(supabase, session.athleteId);
      if (playerId) revalidatePath(`${PERFORMANCE}/players/${playerId}`);
    }
    return { success: true, id: setRowId, count: prCount };
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
    const session = await requireHelmSession(supabase, input.sessionId);
    const isCoach = ctx.activeRole === 'coach';

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        player_note: input.playerNote ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.sessionId)
      .select('id, title')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BaseballActionError('Session not found or not editable.');
    const title = (data as { title: string | null }).title;

    const { data: seRows } = (await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .select('id, exercise_name_snapshot')
      .eq('session_id', input.sessionId)) as {
      data: Array<{ id: string; exercise_name_snapshot: string | null }> | null;
    };
    const seList = (seRows ?? []).map((r) => ({ id: r.id, nameSnapshot: r.exercise_name_snapshot ?? 'Exercise' }));
    const seIds = seList.map((s) => s.id);
    const seNameMap = new Map(seList.map((s) => [s.id, s.nameSnapshot]));

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
      const { data: setData } = await fromUntyped(supabase, 'helm_lifting_set_results')
        .select('session_exercise_id, actual_load, actual_reps, load_unit, rpe')
        .in('session_exercise_id', seIds);
      if (setData) allSets.push(...(setData as SetStatRow[]));
    }

    // Final PR sweep: catch any best from a logged set in this session that
    // hasn't already produced a PR (idempotent — detectAndRecordPr re-reads the
    // current best each time, so an already-recorded PR is not re-emitted).
    const helmCoachId = isCoach ? await resolveHelmCoachId(supabase, session.organizationId, ctx.user.id) : null;
    let prCount = 0;
    for (const s of allSets) {
      const load = Number(s.actual_load ?? 0);
      const reps = Number(s.actual_reps ?? 0);
      if (load <= 0 || reps <= 0) continue;
      prCount += await detectAndRecordPr(supabase, {
        organizationId: session.organizationId,
        athleteId: session.athleteId,
        sessionId: input.sessionId,
        sessionExerciseId: s.session_exercise_id,
        actualLoad: s.actual_load,
        actualReps: s.actual_reps,
        loadUnit: s.load_unit,
        actorIsCoach: isCoach,
        helmCoachId,
        teamId: session.teamId ?? ctx.targetTeamId,
        activeCoachId: ctx.activeCoachId,
      });
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
    const playerId = await resolveAthletePlayerId(supabase, session.athleteId);
    if (playerId) {
      await appendLiftTimelineEvent({
        teamId: session.teamId ?? ctx.targetTeamId,
        playerId,
        title:
          prCount > 0
            ? `Completed ${title ?? 'lift'} — ${prCount} new PR${prCount === 1 ? '' : 's'}`
            : `Completed ${title ?? 'lift'}`,
        sourceId: input.sessionId,
        actorIsCoach: isCoach,
        createdBy: isCoach ? ctx.activeCoachId : null,
      });
    }

    revalidatePath(`${PLAYER_LIFT}/${input.sessionId}`);
    revalidatePath(PERFORMANCE);
    revalidatePath(PLAYER_TODAY);
    if (playerId) revalidatePath(`${PERFORMANCE}/players/${playerId}`);
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .update({
        prescribed_load: input.prescribedLoad ?? undefined,
        prescribed_sets: input.prescribedSets ?? undefined,
        modified_by_coach_id: helmCoachId,
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    // Resolve the substitute exercise's name for the snapshot (RLS scopes reads to
    // this org's + global library, so a cross-org id resolves to nothing).
    const { data: ex, error: exErr } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name')
      .eq('id', input.newExerciseId)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!ex) throw new BaseballActionError('Substitute exercise not found.');

    const patch: Record<string, unknown> = {
      exercise_id: input.newExerciseId,
      exercise_name_snapshot: (ex as { name: string }).name,
      status: 'substituted',
      modified_by_coach_id: helmCoachId,
      modification_reason: `Substituted: ${input.reason}`,
      updated_at: new Date().toISOString(),
    };
    if (input.prescribedLoad != null) patch.prescribed_load = input.prescribedLoad;

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
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
      const { data: latest } = await fromUntyped(supabase, 'helm_lifting_set_results')
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

    const { data, error } = await fromUntyped(supabase, 'helm_lifting_set_results')
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
// Unaffected by this unification — baseball_team_members / baseball_players /
// baseball_notifications stay real baseball tables.
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
// task feed picks it up. created_by_id is the coach's auth user. Unaffected by
// this unification — baseball_tasks stays a real baseball table.
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

    const liftCtx = await resolveBaseballLiftingOrg(ctx.activeTeamId);
    if (!liftCtx) throw new BaseballActionError('Team has no lifting organization configured.');
    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) throw new BaseballActionError('Player not found in the lifting system.');

    // Stage-and-swap: insert the new regions, then remove prior regions for this
    // check-in that the player no longer reports (scoped to this check-in only).
    const { data: existing } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
      .select('id')
      .eq('checkin_id', input.checkinId)
      .eq('athlete_id', athleteId);

    if (input.regions.length) {
      const rows = input.regions.map((r) => ({
        checkin_id: input.checkinId,
        organization_id: liftCtx.organizationId,
        sport: 'baseball' as const,
        athlete_id: athleteId,
        body_region: r.bodyRegion,
        side: r.side ?? 'both',
        severity: r.severity,
        note: r.note ?? null,
      }));
      const { error } = await fromUntyped(supabase, 'helm_lifting_soreness_maps').insert(rows);
      if (error) throw error;
    }
    const oldIds = (existing ?? []).map((r: { id: string }) => r.id);
    if (oldIds.length) {
      const { error: delErr } = await fromUntyped(supabase, 'helm_lifting_soreness_maps').delete().in('id', oldIds);
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

    const liftCtx = await resolveBaseballLiftingOrg(ctx.activeTeamId);
    if (!liftCtx) throw new BaseballActionError('Team has no lifting organization configured.');
    const athleteId = await resolveMyBaseballAthleteId(liftCtx.organizationId);
    if (!athleteId) throw new BaseballActionError('Player not found in the lifting system.');

    const payload: HelmLiftingBodyweightEntryInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      athlete_id: athleteId,
      entry_date: input.entryDate,
      weight_lbs: input.weightLbs,
      source: 'player',
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
      .upsert(payload, { onConflict: 'athlete_id,entry_date' })
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
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);
    const helmCoachId = await resolveHelmCoachId(supabase, liftCtx.organizationId, ctx.user.id);

    await ensureBaseballAthletesSynced(supabase, liftCtx.organizationId, ctx.targetTeamId);
    const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, [input.playerId]);
    const athleteId = athleteMap[input.playerId];
    if (!athleteId) throw new BaseballActionError('Player not found in the lifting system.');

    // Training-status history is coach-editable and never silently overwritten
    // (spec L674-676 analog) — each call inserts a new dated row; reads take
    // the latest by starts_at (no usable unique constraint on this table).
    const payload: HelmLiftingAvailabilityStatusInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      athlete_id: athleteId,
      status: input.status,
      reason_category: input.reasonCategory ?? null,
      note: input.note ?? null,
      ends_at: input.endsAt ?? null,
      created_by_coach_id: helmCoachId,
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_availability_statuses')
      .insert(payload)
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
  async (ctx, raw: z.input<typeof setMaxSchema>): Promise<ActionResult> => {
    const input = setMaxSchema.parse(raw);
    const supabase = (await createClient()) as Db;
    const liftCtx = await requireLiftingOrg(ctx.targetTeamId);

    await ensureBaseballAthletesSynced(supabase, liftCtx.organizationId, ctx.targetTeamId);
    const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, [input.playerId]);
    const athleteId = athleteMap[input.playerId];
    if (!athleteId) throw new BaseballActionError('Player not found in the lifting system.');

    // Training max is coach-editable and never silently overwritten by estimates
    // (spec L674-676) — each call inserts a new dated row; reads take the latest.
    const payload: HelmLiftingMaxInsert = {
      organization_id: liftCtx.organizationId,
      sport: 'baseball',
      athlete_id: athleteId,
      exercise_id: input.exerciseId,
      max_type: input.maxType,
      value: input.value,
      unit: input.unit ?? 'lb',
      test_date: input.testDate ?? null,
      source: 'coach_test',
    };
    const { data, error } = await fromUntyped(supabase, 'helm_lifting_maxes')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    revalidatePath(`${PERFORMANCE}/players/${input.playerId}`);
    return { success: true, id: (data as { id: string }).id };
  },
);
