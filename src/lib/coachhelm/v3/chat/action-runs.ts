/**
 * ============================================================================
 * CoachHelm · chat · action runs — the idempotency + audit ledger
 * ----------------------------------------------------------------------------
 * Every mutation the agent proposes gets a row here BEFORE it executes, keyed
 * by `(coach_id, idempotency_key)` with a unique constraint behind it.
 *
 * That constraint is what makes a lost network response safe. The dangerous
 * sequence is: coach approves → eight events are created → the response never
 * arrives → the client retries → eight more events. Claiming a run before
 * writing turns the retry into a read of the first run's result.
 *
 * The ledger is also the audit trail. Denials are recorded, not dropped: a
 * coach declining what the agent proposed is signal about the agent's judgement
 * and belongs in the record next to the approvals.
 * ========================================================================== */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { ActionReceipt } from './action-types';

type Sb = SupabaseClient<Database>;

const TABLE = 'golf_coachhelm_action_runs';

export type ActionRunStatus = 'proposed' | 'approved' | 'denied' | 'completed' | 'failed';

export interface ActionRun {
  id: string;
  status: ActionRunStatus;
  tool_name: string;
  idempotency_key: string;
  result: ActionReceipt | null;
}

/** Outcome of trying to claim a run for execution. */
export type ClaimResult =
  | { kind: 'claimed'; run_id: string }
  /** A prior run already finished under this key — return its receipt verbatim. */
  | { kind: 'already_completed'; receipt: ActionReceipt }
  /** A run exists and is mid-flight. Do NOT start a second execution. */
  | { kind: 'in_flight' }
  | { kind: 'error'; message: string };

/**
 * Record a proposal. Called when the agent asks for approval, before any write.
 *
 * Deliberately tolerant of a duplicate key: proposing the same action twice is
 * harmless (nothing is written), so a conflict returns the existing run rather
 * than surfacing an error the coach would have to understand.
 */
export async function recordProposal(
  sb: Sb,
  args: {
    coach_id: string;
    team_id: string;
    conversation_id: string | null;
    tool_name: string;
    proposed_input: unknown;
    idempotency_key: string;
  },
): Promise<{ run_id: string } | { error: string }> {
  const { data, error } = await fromUntyped(sb, TABLE)
    .upsert(
      {
        coach_id: args.coach_id,
        team_id: args.team_id,
        conversation_id: args.conversation_id,
        tool_name: args.tool_name,
        proposed_input: args.proposed_input as never,
        idempotency_key: args.idempotency_key,
        status: 'proposed',
      },
      { onConflict: 'coach_id,idempotency_key', ignoreDuplicates: false },
    )
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  const id = (data as { id?: string } | null)?.id;
  return id ? { run_id: id } : { error: 'Could not record the proposal.' };
}

/**
 * Claim a run for execution — the idempotency gate.
 *
 * Moves `proposed`/`denied`/`failed` → `approved` with a conditional UPDATE, so
 * two concurrent confirmations race on the database rather than in application
 * code and exactly one wins. The loser reads the winner's state.
 *
 * `failed` is re-claimable on purpose: a run that failed wrote nothing worth
 * protecting, and the coach should be able to retry.
 */
export async function claimForExecution(
  sb: Sb,
  args: { coach_id: string; idempotency_key: string },
): Promise<ClaimResult> {
  const { data: existing, error: readErr } = await fromUntyped(sb, TABLE)
    .select('id, status, result')
    .eq('coach_id', args.coach_id)
    .eq('idempotency_key', args.idempotency_key)
    .maybeSingle();

  if (readErr) return { kind: 'error', message: readErr.message };
  const row = existing as { id: string; status: ActionRunStatus; result: ActionReceipt | null } | null;
  if (!row) return { kind: 'error', message: 'No proposal recorded for this action.' };

  if (row.status === 'completed' && row.result) {
    return { kind: 'already_completed', receipt: row.result };
  }
  if (row.status === 'approved') {
    // Someone else is already executing this key. A second execution is exactly
    // the duplicate-series bug, so we refuse rather than race.
    return { kind: 'in_flight' };
  }

  const { data: claimed, error: claimErr } = await fromUntyped(sb, TABLE)
    .update({ status: 'approved', decided_at: new Date().toISOString() })
    .eq('id', row.id)
    .in('status', ['proposed', 'denied', 'failed'])
    .select('id')
    .maybeSingle();

  if (claimErr) return { kind: 'error', message: claimErr.message };
  if (!claimed) return { kind: 'in_flight' };
  return { kind: 'claimed', run_id: (claimed as { id: string }).id };
}

/** Record that the coach declined. Kept as evidence, not discarded. */
export async function recordDenial(
  sb: Sb,
  args: { coach_id: string; idempotency_key: string },
): Promise<void> {
  await fromUntyped(sb, TABLE)
    .update({ status: 'denied', decided_at: new Date().toISOString() })
    .eq('coach_id', args.coach_id)
    .eq('idempotency_key', args.idempotency_key)
    .in('status', ['proposed']);
}

/** Record the outcome. The receipt is stored so a retry can return it verbatim. */
export async function recordOutcome(
  sb: Sb,
  args: {
    run_id: string;
    receipt: ActionReceipt;
  },
): Promise<void> {
  await fromUntyped(sb, TABLE)
    .update({
      status: args.receipt.status === 'failed' ? 'failed' : 'completed',
      result: args.receipt as never,
      error_message: args.receipt.error ?? null,
      partial_failures:
        args.receipt.partial_failures.length > 0 ? (args.receipt.partial_failures as never) : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', args.run_id);
}
