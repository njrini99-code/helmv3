import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { ActionReceipt } from './action-types';
import { recordOutcome } from './action-runs';

type Sb = SupabaseClient<Database>;
const TABLE = 'golf_coachhelm_action_runs';

/** The window players don't hear in (Nick, 31 Oct): Undo inside it leaves no row and tells nobody. */
export const UNDO_HOLD_MS = 8_000;

export type HoldResult = { kind: 'held'; run_at: string } | { kind: 'no_column' } | { kind: 'error' };

/** Sets the claimed run to held. `no_column`: HM1 isn't applied (42703), so the caller writes at once and offers no Undo (S-ASK.kit.no-hold). */
export async function holdForExecution(sb: Sb, args: { run_id: string; now?: number }): Promise<HoldResult> {
  const run_at = new Date((args.now ?? Date.now()) + UNDO_HOLD_MS).toISOString();
  const { error } = await fromUntyped(sb, TABLE)
    .update({ status: 'held', run_at } as never)
    .eq('id', args.run_id)
    .eq('status', 'approved');
  if (!error) return { kind: 'held', run_at };
  if (error.code === '42703' || error.code === '23514') return { kind: 'no_column' };
  return { kind: 'error' };
}

/** Held to approved in one update: whoever wins runs it, and `claimForExecution`'s in-flight and TTL rules then apply unchanged. */
async function takeHeld(sb: Sb, where: { run_id: string } | { coach_id: string; idempotency_key: string }): Promise<string | null> {
  let q = fromUntyped(sb, TABLE).update({ status: 'approved' } as never).eq('status', 'held');
  q = 'run_id' in where ? q.eq('id', where.run_id) : q.eq('coach_id', where.coach_id).eq('idempotency_key', where.idempotency_key);
  const { data, error } = await q.select('id').maybeSingle();
  if (error) return null;
  return (data as { id?: string } | null)?.id ?? null;
}

const waitUntil = (at: string) => new Promise<void>((r) => setTimeout(r, Math.max(0, Date.parse(at) - Date.now())));

/** Runs once `run_at` passes, only if still held. A run that failed its action but whose row a read-back finds is `completed`: never offered Try again. */
export async function releaseHeld(sb: Sb, args: { run_id: string; run_at: string; run: () => Promise<ActionReceipt>; readBack?: () => Promise<ActionReceipt | null> }): Promise<ActionReceipt | null> {
  await waitUntil(args.run_at);
  const id = await takeHeld(sb, { run_id: args.run_id });
  if (!id) return null;
  return execute(sb, id, args.run, args.readBack);
}

async function execute(sb: Sb, run_id: string, run: () => Promise<ActionReceipt>, readBack?: () => Promise<ActionReceipt | null>): Promise<ActionReceipt> {
  let receipt: ActionReceipt;
  try {
    receipt = await run();
  } catch (err) {
    receipt = { status: 'failed', action: '', summary: 'Could not finish that.', created: [], notifications: [], partial_failures: [], error: err instanceof Error ? err.message : String(err), retryable: false, at: new Date().toISOString() };
  }
  if (receipt.status === 'failed' && readBack) {
    const found = await readBack().catch(() => null);
    if (found) receipt = found;
  }
  await recordOutcome(sb, { run_id, receipt });
  return receipt;
}

/** Undo. Held to cancelled only while `run_at` is still ahead; nothing else may stop it. */
export async function cancelHeld(sb: Sb, args: { coach_id: string; idempotency_key: string; now?: number }): Promise<'cancelled' | 'late' | 'error'> {
  const { data, error } = await fromUntyped(sb, TABLE)
    .update({ status: 'cancelled' } as never)
    .eq('coach_id', args.coach_id)
    .eq('idempotency_key', args.idempotency_key)
    .eq('status', 'held')
    .gt('run_at', new Date(args.now ?? Date.now()).toISOString())
    .select('id')
    .maybeSingle();
  if (error) return 'error';
  return data ? 'cancelled' : 'late';
}

/** Open: commits now. The losing `after()` then finds nothing to take. */
export async function commitHeldNow(sb: Sb, args: { coach_id: string; idempotency_key: string; run: () => Promise<ActionReceipt> }): Promise<ActionReceipt | null> {
  const id = await takeHeld(sb, { coach_id: args.coach_id, idempotency_key: args.idempotency_key });
  return id ? execute(sb, id, args.run) : null;
}

/** On the next chat request: runs any overdue held row once. The function that held it may have been cut off; the key keeps it single. */
export async function sweepHeld(sb: Sb, args: { coach_id: string; run: (row: { tool_name: string; proposed_input: unknown }) => Promise<ActionReceipt> | null }): Promise<number> {
  const { data, error } = await fromUntyped(sb, TABLE).select('id, tool_name, proposed_input').eq('coach_id', args.coach_id).eq('status', 'held').lte('run_at', new Date().toISOString()).limit(10);
  if (error || !data) return 0;
  let done = 0;
  for (const row of data as unknown as Array<{ id: string; tool_name: string; proposed_input: unknown }>) {
    const running = args.run(row);
    if (!running) continue;
    const id = await takeHeld(sb, { run_id: row.id });
    if (!id) continue;
    await execute(sb, id, () => running);
    done++;
  }
  return done;
}

/** The ledger's receipt for a key: what the client fetches when the ring ends, and on reload. */
export async function receiptFor(sb: Sb, args: { coach_id: string; idempotency_key: string }): Promise<{ status: string; receipt: ActionReceipt | null; run_at: string | null } | null> {
  const { data, error } = await fromUntyped(sb, TABLE).select('status, result, run_at').eq('coach_id', args.coach_id).eq('idempotency_key', args.idempotency_key).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { status: string; result: ActionReceipt | null; run_at: string | null };
  return { status: row.status, receipt: row.result, run_at: row.run_at };
}
