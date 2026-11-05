import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { askTables } from './ask-db';
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
  const { error } = await askTables(sb).from(TABLE)
    .update({ status: 'held', run_at } as never)
    .eq('id', args.run_id)
    .eq('status', 'approved');
  if (!error) return { kind: 'held', run_at };
  if (error.code === '42703' || error.code === '23514') return { kind: 'no_column' };
  return { kind: 'error' };
}

/** A held ledger row, as the sweep and Open need it to rebuild the write. */
export interface HeldRow {
  id: string;
  tool_name: string;
  proposed_input: unknown;
  team_id: string;
  run_at: string;
}
/** How to write a held row. Nothing has started until `run` is called, and only the winner of `takeHeld` calls it. */
export interface HeldCommit {
  run: () => Promise<ActionReceipt>;
  readBack?: () => Promise<ActionReceipt | null>;
}
/** Null: not this request's to write (another team's row); it stays held. */
export type HeldResolver = (row: HeldRow) => HeldCommit | null;

const HELD_COLUMNS = 'id, tool_name, proposed_input, team_id, run_at';

/**
 * Held to approved in one update: whoever wins runs it, and `claimForExecution`'s in-flight and TTL rules then apply unchanged.
 * `decided_at` restarts here: the TTL measures a run in flight, and a row swept late has only just started.
 */
async function takeHeld(sb: Sb, where: { run_id: string }): Promise<string | null> {
  const { data, error } = await askTables(sb).from(TABLE).update({ status: 'approved', decided_at: new Date().toISOString() } as never).eq('status', 'held').eq('id', where.run_id).select('id').maybeSingle();
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
  const { data, error } = await askTables(sb).from(TABLE)
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

/** Open (`due_only` off): commits now. The ring ending (`due_only`): commits only once `run_at` has passed, if `after()` died. The losing `after()` then finds nothing to take. */
export async function commitHeldNow(sb: Sb, args: { coach_id: string; idempotency_key: string; resolve: HeldResolver; due_only?: boolean; now?: number }): Promise<ActionReceipt | null> {
  const { data, error } = await askTables(sb).from(TABLE).select(HELD_COLUMNS).eq('coach_id', args.coach_id).eq('idempotency_key', args.idempotency_key).eq('status', 'held').maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as HeldRow;
  if (args.due_only && Date.parse(row.run_at) > (args.now ?? Date.now())) return null;
  const commit = args.resolve(row);
  if (!commit) return null;
  const id = await takeHeld(sb, { run_id: row.id });
  return id ? execute(sb, id, commit.run, commit.readBack) : null;
}

/** On the next chat request: runs any overdue held row once. The function that held it may have been cut off; the take keeps it single, and the write starts only after the take. */
export async function sweepHeld(sb: Sb, args: { coach_id: string; team_id: string; resolve: HeldResolver }): Promise<number> {
  const { data, error } = await askTables(sb).from(TABLE).select(HELD_COLUMNS).eq('coach_id', args.coach_id).eq('team_id', args.team_id).eq('status', 'held').lte('run_at', new Date().toISOString()).order('run_at').limit(10);
  if (error || !data) return 0;
  let done = 0;
  for (const row of data as unknown as HeldRow[]) {
    const commit = args.resolve(row);
    if (!commit) continue;
    const id = await takeHeld(sb, { run_id: row.id });
    if (!id) continue;
    await execute(sb, id, commit.run, commit.readBack);
    done++;
  }
  return done;
}

/** The ledger's receipt for a key: what the client fetches when the ring ends, and on reload. */
export async function receiptFor(sb: Sb, args: { coach_id: string; idempotency_key: string }): Promise<{ status: string; receipt: ActionReceipt | null; run_at: string | null } | null> {
  const { data, error } = await askTables(sb).from(TABLE).select('status, result, run_at').eq('coach_id', args.coach_id).eq('idempotency_key', args.idempotency_key).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { status: string; result: ActionReceipt | null; run_at: string | null };
  return { status: row.status, receipt: row.result, run_at: row.run_at };
}
