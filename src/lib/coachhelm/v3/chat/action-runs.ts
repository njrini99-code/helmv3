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
  /**
   * A run sat in 'approved' past {@link APPROVED_RUN_TTL_MS} — its execution
   * crashed or timed out somewhere between the claim and `recordOutcome`. It
   * has just been marked 'failed' and is NOT re-executed here: the write may
   * or may not have landed (see the TTL doc comment), so the coach checks and
   * retries explicitly. `message` is coach-facing.
   */
  | { kind: 'stale_failed'; message: string }
  | { kind: 'error'; message: string };

/**
 * How long a run may sit in 'approved' before it is treated as abandoned
 * (audit row 50a).
 *
 * 'approved' means "claimed, executing". Execution happens inside the chat
 * stream route (`maxDuration = 120` s), so a run still 'approved' ten minutes
 * later belongs to a function that crashed or was torn down before
 * `recordOutcome` — and before this TTL, it returned `in_flight` forever.
 *
 * WHY STALE FAILS CLOSED INSTEAD OF BEING RE-CLAIMED. A reclaim is only safe
 * if the downstream write is idempotent on `idempotency_key`. It is not:
 * `executeRecurringPractice`, `executeFocusArea`, `executeTask` and
 * `executeAnnouncement` call `createRecurringEvent`, `createFocusArea`,
 * `createTask` and `createEnrichedAnnouncement` with no idempotency key and
 * no unique constraint behind them. The crashed attempt may have created the
 * eight practices before it died, so silently re-running would double them.
 * A stale run is therefore moved to 'failed' with an error that tells the
 * coach to check first; 'failed' is re-claimable, so their next confirmation
 * is the explicit retry.
 */
export const APPROVED_RUN_TTL_MS = 10 * 60 * 1000;

const STALE_RUN_ERROR =
  'This action was interrupted before it finished, so it may or may not have gone through.';
const STALE_RUN_MESSAGE =
  "That action was interrupted before it finished. Please check whether it was created before confirming it again — I won't re-run it automatically.";

/**
 * Record a proposal. Called when the agent asks for approval, before any write.
 *
 * Deliberately tolerant of a duplicate key: proposing the same action twice is
 * harmless (nothing is written), so a conflict returns the existing run rather
 * than surfacing an error the coach would have to understand.
 *
 * Insert-or-ignore, never insert-or-update (audit row 50). This used to
 * upsert `status: 'proposed'` with `ignoreDuplicates: false` — ON CONFLICT DO
 * UPDATE — so re-proposing the same plan reset a COMPLETED or APPROVED run to
 * 'proposed', which `claimForExecution` then treats as claimable: the write
 * ran a second time. The idempotency key is derived from the plan, so the
 * existing row already holds the same `proposed_input`; there is nothing to
 * update, and the existing row's status is the truth.
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
      { onConflict: 'coach_id,idempotency_key', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  const id = (data as { id?: string } | null)?.id;
  if (id) return { run_id: id };

  // A conflict inserts nothing and returns no row — read the existing one.
  const { data: existing, error: readErr } = await fromUntyped(sb, TABLE)
    .select('id')
    .eq('coach_id', args.coach_id)
    .eq('idempotency_key', args.idempotency_key)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  const existingId = (existing as { id?: string } | null)?.id;
  return existingId ? { run_id: existingId } : { error: 'Could not record the proposal.' };
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
    .select('id, status, result, decided_at')
    .eq('coach_id', args.coach_id)
    .eq('idempotency_key', args.idempotency_key)
    .maybeSingle();

  if (readErr) return { kind: 'error', message: readErr.message };
  const row = existing as {
    id: string;
    status: ActionRunStatus;
    result: ActionReceipt | null;
    decided_at?: string | null;
  } | null;
  if (!row) return { kind: 'error', message: 'No proposal recorded for this action.' };

  if (row.status === 'completed' && row.result) {
    return { kind: 'already_completed', receipt: row.result };
  }
  if (row.status === 'approved') {
    const decidedMs = row.decided_at ? Date.parse(row.decided_at) : NaN;
    const cutoffMs = Date.now() - APPROVED_RUN_TTL_MS;
    if (Number.isFinite(decidedMs) && decidedMs < cutoffMs) {
      // Abandoned mid-execution — fail it closed; see APPROVED_RUN_TTL_MS.
      // Conditional on still being 'approved' AND still stale, so a run that
      // completed between the read and here is never overwritten.
      const { data: failed, error: failErr } = await fromUntyped(sb, TABLE)
        .update({
          status: 'failed',
          error_message: STALE_RUN_ERROR,
          completed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'approved')
        .lt('decided_at', new Date(cutoffMs).toISOString())
        .select('id')
        .maybeSingle();
      if (failErr) return { kind: 'error', message: failErr.message };
      if (failed) return { kind: 'stale_failed', message: STALE_RUN_MESSAGE };
    }
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

/**
 * Tie proposed runs to the assistant message that proposed them (audit row
 * 50b — `message_id` was NULL on every production row, so a run could not be
 * traced back to its card). Called once the assistant turn is persisted and
 * its id is known. `.is('message_id', null)` makes the FIRST message that
 * carried the proposal win: an approval continuation re-streams the same
 * card and must not re-point the run at itself.
 */
export async function linkProposalsToMessage(
  sb: Sb,
  args: { coach_id: string; message_id: string; idempotency_keys: readonly string[] },
): Promise<void> {
  const keys = [...new Set(args.idempotency_keys.filter((k) => typeof k === 'string' && k.length > 0))];
  if (keys.length === 0) return;
  await fromUntyped(sb, TABLE)
    .update({ message_id: args.message_id })
    .eq('coach_id', args.coach_id)
    .in('idempotency_key', keys)
    .is('message_id', null);
}

/** The idempotency keys of every action card (`data-action-proposal`) in a turn's parts. */
export function proposalKeysFromParts(parts: readonly unknown[]): string[] {
  const keys: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    const part = p as { type?: unknown; data?: { idempotency_key?: unknown } | null };
    if (part.type === 'data-action-proposal' && typeof part.data?.idempotency_key === 'string') {
      keys.push(part.data.idempotency_key);
    }
  }
  return keys;
}

