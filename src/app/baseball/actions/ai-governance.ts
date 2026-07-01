'use server';

// =============================================================================
// src/app/baseball/actions/ai-governance.ts
//
// Packet: qa-screens (AI-settings enforcement remediation)
//
// Server actions for the AI-governance surface in Program Settings:
//   - getAiAuditLog        : read the recent AI-audit rows (v4 §AI Settings).
//   - approveAiOutput      : a coach approves a PENDING player-visible AI output;
//                            promotes the paired signal to its desired player
//                            visibility (the staff-approval backstop made real).
//   - dismissAiOutput      : a coach rejects a pending output; the audit row is
//                            marked withheld and the paired signal stays staff_only.
//
// Every action runs inside withBaseballAction so auth + active-context + SERVER-
// SIDE capability enforcement + Sentry are uniform. AI governance is a settings/
// staff action — gated on `can_manage_stats` (the same capability the engine run
// requires), so only a coach who can run the engine can approve its output.
//
// NON-DESTRUCTIVE: approval/dismissal UPDATE the audit row + paired signal in
// place — no delete-then-insert.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { readAiPolicyWithClient } from '@/lib/baseball/ai-policy-server';
import type { BaseballAiAuditRow } from '@/lib/types/baseball-ai-audit';

// baseball_ai_audit + baseball_signals are not yet in the generated db types
// (migrations unapplied / shared prod DB). RLS still applies; the cast only
// loosens TS typing (established pattern — imports.ts / coachhelm.ts).
type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const SETTINGS_PATH = '/baseball/dashboard/settings';
const SIGNALS_PATH = '/baseball/dashboard/signals';

export interface AiAuditLogResult {
  success: boolean;
  rows: BaseballAiAuditRow[];
  /** Count of rows awaiting a coach's approval (pending player-visible AI). */
  pendingCount: number;
  error?: string;
}

/**
 * Read the recent AI-audit rows for the active team (staff-only; RLS enforces it).
 * Returns newest-first, bounded. Surfaces in the AI Settings audit log.
 */
export const getAiAuditLog = withBaseballAction(
  'getAiAuditLog',
  { featureArea: 'baseball-coachhelm', requiredCapability: 'can_manage_stats' },
  async (ctx, opts?: { limit?: number }): Promise<AiAuditLogResult> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));

    const { data, error } = await db
      .from('baseball_ai_audit')
      .select('*')
      .eq('team_id', ctx.targetTeamId)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, rows: [], pendingCount: 0, error: 'Could not load the AI audit log.' };
    }

    const rows = (data ?? []) as BaseballAiAuditRow[];
    const pendingCount = rows.filter((r) => r.disposition === 'pending').length;
    return { success: true, rows, pendingCount };
  },
);

export interface AiApprovalResult {
  success: boolean;
  error?: string;
}

/**
 * Approve a PENDING player-visible AI output. This is the staff-approval backstop
 * the engine deferred: a fresh player-visible candidate is held at staff_only
 * (disposition='pending', reason='awaiting_approval') until a coach approves it
 * here. Approval:
 *   1. stamps the audit row approved + reviewed_by/reviewed_at,
 *   2. promotes the paired signal to its DESIRED player visibility (the visibility
 *      the generator originally wanted, recorded as desired_visibility).
 *
 * Only an output that is genuinely pending-for-approval is promotable — a withheld
 * output (below confidence / missing refs / AI disabled) is NOT made player-visible
 * by approval (the gate that withheld it still stands).
 */
export const approveAiOutput = withBaseballAction(
  'approveAiOutput',
  { featureArea: 'baseball-coachhelm', requiredCapability: 'can_manage_stats' },
  async (ctx, auditId: string): Promise<AiApprovalResult> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const now = new Date().toISOString();

    // Load + team-scope the audit row (defense in depth on top of RLS).
    const { data: auditRaw } = await db
      .from('baseball_ai_audit')
      .select('*')
      .eq('id', auditId)
      .eq('team_id', ctx.targetTeamId)
      .maybeSingle();
    const audit = auditRaw as BaseballAiAuditRow | null;
    if (!audit) return { success: false, error: 'Audit entry not found.' };

    if (audit.disposition !== 'pending') {
      // Idempotent: an already-approved entry is a no-op success; a withheld entry
      // cannot be approved into player-visibility (its hard gate still applies).
      if (audit.disposition === 'approved') return { success: true };
      return { success: false, error: 'This AI output was withheld and cannot be approved.' };
    }

    // A 'pending' row can be pending for two different reasons that must NOT be
    // treated the same: 'awaiting_approval' (a fresh player-visible candidate
    // genuinely waiting on staff sign-off) vs 'player_visible_disabled' (the
    // player-visible toggle itself is OFF — this row was downgraded to staff_only
    // by the hard policy gate, not by a pending-approval workflow). Only the
    // former is promotable; approving the latter would bypass the
    // ai_player_visible_enabled switch entirely.
    if (audit.withheld_reason !== 'awaiting_approval') {
      return { success: false, error: 'This AI output was withheld and cannot be approved.' };
    }

    // Re-check the LIVE policy: a coach may have flipped player-visible AI off (or
    // disabled AI entirely) since this row was generated. Approval must reflect the
    // current toggle state, not a stale one captured at generation time — otherwise
    // a delayed approval click could still leak output while the switch is off.
    const policy = await readAiPolicyWithClient(supabase, ctx.targetTeamId);
    if (!policy.enabled || !policy.playerVisibleEnabled) {
      return { success: false, error: 'Player-visible AI is currently disabled for this team.' };
    }

    // The visibility the output should land at once approved is the visibility the
    // generator originally wanted. If that desired visibility is not player-facing
    // there is nothing to promote (approval is a no-op state change).
    const targetVisibility = audit.desired_visibility ?? 'staff_only';

    // 1. Mark the audit row approved.
    const { error: auditErr } = await db
      .from('baseball_ai_audit')
      .update({
        disposition: 'approved',
        visibility: targetVisibility,
        withheld_reason: null,
        reviewed_by: ctx.user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', auditId)
      .eq('team_id', ctx.targetTeamId);
    if (auditErr) return { success: false, error: 'Could not approve the AI output.' };

    // 2. Promote the paired signal to the approved (player-facing) visibility, but
    // only when the signal is still open/untriaged — never re-open or re-expose a
    // signal a coach already dismissed/resolved.
    if (audit.output_table === 'baseball_signals' && audit.output_id) {
      await db
        .from('baseball_signals')
        .update({ visibility: targetVisibility, updated_at: now })
        .eq('id', audit.output_id)
        .eq('team_id', ctx.targetTeamId)
        .in('disposition', ['new', 'acknowledged', 'sample_too_small']);
    }

    revalidatePath(SETTINGS_PATH);
    revalidatePath(SIGNALS_PATH);
    revalidatePath('/baseball/player');
    return { success: true };
  },
);

/**
 * Dismiss a PENDING player-visible AI output: the coach declines to expose it to
 * players. The audit row is marked withheld (reason kept as awaiting_approval ->
 * the coach chose not to approve) and the paired signal stays staff_only. Idempotent.
 */
export const dismissAiOutput = withBaseballAction(
  'dismissAiOutput',
  { featureArea: 'baseball-coachhelm', requiredCapability: 'can_manage_stats' },
  async (ctx, auditId: string): Promise<AiApprovalResult> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const now = new Date().toISOString();

    const { data: auditRaw } = await db
      .from('baseball_ai_audit')
      .select('*')
      .eq('id', auditId)
      .eq('team_id', ctx.targetTeamId)
      .maybeSingle();
    const audit = auditRaw as BaseballAiAuditRow | null;
    if (!audit) return { success: false, error: 'Audit entry not found.' };
    if (audit.disposition !== 'pending') return { success: true };

    const { error } = await db
      .from('baseball_ai_audit')
      .update({
        disposition: 'withheld',
        visibility: 'staff_only',
        reviewed_by: ctx.user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', auditId)
      .eq('team_id', ctx.targetTeamId);
    if (error) return { success: false, error: 'Could not dismiss the AI output.' };

    revalidatePath(SETTINGS_PATH);
    return { success: true };
  },
);
