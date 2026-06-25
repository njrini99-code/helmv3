// =============================================================================
// src/lib/baseball/lifting/group-audit-writer.ts
//
// V11 Strength-group audit writer (spec L198: "Dynamic group membership changes
// create audit events"). One server-only helper that appends immutable rows to
// baseball_strength_group_audit whenever a group is created/updated or a member is
// added/removed — for BOTH manual edits and dynamic-rule recomputes.
//
// WHY A WRITER (not raw inserts in every action): one place enforces append-only
// provenance + the team/group consistency the RLS WITH CHECK also asserts, so the
// ledger is honest and a forged team_id can never land. It NEVER throws into the
// caller's happy path — an audit write is a side-effect of the membership mutation
// and must not roll the membership change back; it returns { ok } the caller logs.
//
// Coach-initiated writes go through the caller's RLS-scoped client (the INSERT
// policy requires has_baseball_staff_capability(team_id,'can_manage_lifting')).
// =============================================================================

import 'server-only';

import { logServerError } from '@/lib/server-error-logger';
import type {
  BaseballStrengthGroupAuditEvent,
  BaseballStrengthGroupAuditSource,
} from '@/lib/types/baseball-lifting-v11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface GroupAuditEntry {
  eventType: BaseballStrengthGroupAuditEvent;
  playerId?: string | null;
  source?: BaseballStrengthGroupAuditSource;
  detail?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Append one or more audit rows for a group change. Batched insert (one round
 * trip). Side-effect only: swallows its own errors so a membership mutation is
 * never rolled back by a failed audit write.
 */
export async function appendGroupAudit(
  supabase: Db,
  args: {
    teamId: string;
    groupId: string;
    actorCoachId: string | null;
    entries: GroupAuditEntry[];
  },
): Promise<{ ok: boolean }> {
  if (!args.entries.length) return { ok: true };
  try {
    const rows = args.entries.map((e) => ({
      team_id: args.teamId,
      group_id: args.groupId,
      event_type: e.eventType,
      player_id: e.playerId ?? null,
      source: e.source ?? 'manual',
      detail: e.detail ?? null,
      meta_json: e.meta ?? {},
      actor_coach_id: args.actorCoachId,
    }));
    const { error } = await supabase.from('baseball_strength_group_audit').insert(rows);
    if (error) {
      await logServerError(
        `Failed to append strength-group audit: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { action: 'group-audit-writer.appendGroupAudit' },
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    await logServerError(
      `Strength-group audit writer threw: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'group-audit-writer.appendGroupAudit' },
    );
    return { ok: false };
  }
}
