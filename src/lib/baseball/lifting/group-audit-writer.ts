// =============================================================================
// src/lib/baseball/lifting/group-audit-writer.ts
//
// Helm Lift Lab strength-group audit writer (spec L198: "Dynamic group
// membership changes create audit events"). One server-only helper that
// appends immutable rows to helm_lifting_group_audit whenever a group is
// created/updated or a member is added/removed — for BOTH manual edits and
// dynamic-rule recomputes.
//
// helm_lifting_group_audit (migration 20260704120000) is the helm mirror of
// the legacy baseball_strength_group_audit table — the ONE legacy Lift Lab
// table with no pre-existing helm equivalent, created ahead of the
// program-builder→helm unification specifically so this writer could swap
// targets. Column shape differs from the legacy table by the helm family
// convention: `action` (was event_type), `actor_id` (an auth users.id — this
// column has no FK, unlike the *_by_coach_id columns elsewhere in the Lift
// Lab which FK to helm_lifting_coaches; mirrors the golf_review_events.actor_id
// convention of storing users.id directly), `target_athlete_id` (was
// player_id, now helm_lifting_athletes.id), `before_state`/`after_state`
// (jsonb — replaces the old free-form `source` + `meta_json` pair; callers
// fold `{ source, ...meta }` into `afterState`), `note` (was `detail`).
//
// WHY A WRITER (not raw inserts in every action): one place enforces
// append-only provenance + the org/group consistency the RLS WITH CHECK also
// asserts, so the ledger is honest and a forged organization_id can never
// land. It NEVER throws into the caller's happy path — an audit write is a
// side-effect of the membership mutation and must not roll the membership
// change back; it returns { ok } the caller logs.
//
// Coach-initiated writes go through the caller's RLS-scoped client (the
// INSERT policy requires helm_lifting_can_edit_org(organization_id) — see
// migration 20260704120000_helm_lifting_group_audit.sql, hlga_insert).
// =============================================================================

import 'server-only';

import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * helm_lifting_group_audit is not yet in the generated Database types (it was
 * added ahead of this unification — see migration
 * 20260704120000_helm_lifting_group_audit.sql). Typed locally instead of
 * `as any`, narrowly scoped to this insert shape.
 */
interface HelmLiftingGroupAuditInsert {
  organization_id: string;
  sport: 'baseball' | 'golf';
  team_id: string | null;
  group_id: string;
  action: string;
  actor_id: string | null;
  target_athlete_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  note: string | null;
}

export interface GroupAuditEntry {
  /** Free-text action label (e.g. 'group_created', 'member_added', 'rule_changed'). */
  action: string;
  targetAthleteId?: string | null;
  /** Human-readable note (was `detail`). */
  note?: string | null;
  /** Structured context from before the change. */
  beforeState?: Record<string, unknown> | null;
  /**
   * Structured context from after the change — callers fold the legacy
   * `source` ('manual' | 'rule' | 'import') and any extra `meta` fields in
   * here, e.g. `{ source: 'rule', matched: 12 }`.
   */
  afterState?: Record<string, unknown> | null;
}

/**
 * Append one or more audit rows for a group change. Batched insert (one round
 * trip). Side-effect only: swallows its own errors so a membership mutation is
 * never rolled back by a failed audit write.
 */
export async function appendGroupAudit(
  supabase: Db,
  args: {
    organizationId: string;
    /** Defaults to 'baseball' — this writer is currently baseball-only. */
    sport?: 'baseball' | 'golf';
    teamId: string | null;
    groupId: string;
    /** The acting auth user's id (users.id) — null for system-initiated entries. */
    actorId: string | null;
    entries: GroupAuditEntry[];
  },
): Promise<{ ok: boolean }> {
  if (!args.entries.length) return { ok: true };
  try {
    const rows: HelmLiftingGroupAuditInsert[] = args.entries.map((e) => ({
      organization_id: args.organizationId,
      sport: args.sport ?? 'baseball',
      team_id: args.teamId,
      group_id: args.groupId,
      action: e.action,
      actor_id: args.actorId,
      target_athlete_id: e.targetAthleteId ?? null,
      before_state: e.beforeState ?? null,
      after_state: e.afterState ?? null,
      note: e.note ?? null,
    }));
    const { error } = await fromUntyped(supabase, 'helm_lifting_group_audit').insert(rows);
    if (error) {
      await logServerError(
        `Failed to append Lift Lab group audit: ${
          describeError(error)
        }`,
        { action: 'group-audit-writer.appendGroupAudit' },
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    await logServerError(
      `Lift Lab group audit writer threw: ${describeError(err)}`,
      { action: 'group-audit-writer.appendGroupAudit' },
    );
    return { ok: false };
  }
}
