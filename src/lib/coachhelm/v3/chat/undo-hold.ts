import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { askTables } from './ask-db';
import type { ActionReceipt } from './action-types';
import { APPROVED_RUN_TTL_MS, claimForExecution, recordOutcome } from './action-runs';

type Sb = SupabaseClient<Database>;
const TABLE = 'golf_coachhelm_action_runs';

/** The window players don't hear in (Nick, 31 Oct): Undo inside it leaves no row and tells nobody. */
export const UNDO_HOLD_MS = 8_000;

export type HoldResult = { kind: 'held'; run_at: string } | { kind: 'no_column' } | { kind: 'error' };

/** Sets the claimed run to held. `no_column`: HM1 isn't applied (42703), so the caller writes at once and offers no Undo (S-ASK.kit.no-hold). */
export async function holdForExecution(sb: Sb, args: { run_id: string; now?: number }): Promise<HoldResult> {
  const run_at = new Date((args.now ?? Date.now()) + UNDO_HOLD_MS).toISOString();
  const { data, error } = await askTables(sb).from(TABLE)
    .update({ status: 'held', run_at } as never)
    .eq('id', args.run_id)
    .eq('status', 'approved')
    .select('id')
    .maybeSingle();
  if (!error) return data ? { kind: 'held', run_at } : { kind: 'error' };
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
  /** The row's scoped ledger key: the write's request id comes from it, so a rebuilt write hits the same row. */
  idempotency_key: string;
}
/** How to write a held row. Nothing has started until `run` is called, and only the winner of `takeHeld` calls it. */
export interface HeldCommit {
  run: () => Promise<ActionReceipt>;
  readBack?: () => Promise<ActionReceipt | null>;
}
/** Null: not this request's to write (another team's row); it stays held. */
export type HeldResolver = (row: HeldRow) => HeldCommit | null;

const HELD_COLUMNS = 'id, tool_name, proposed_input, team_id, run_at, idempotency_key';

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

/**
 * The coach pressed Confirm. Claim the proposal and hold it here, then schedule the write for when Undo closes.
 * The chat stream may also try to run it; the claim lets only one of them hold the row.
 */
export async function confirmProposed(
  sb: Sb,
  args: { coach_id: string; idempotency_key: string; resolve: HeldResolver; schedule: (fn: () => Promise<unknown>) => void },
): Promise<ActionReceipt | null> {
  const heldReceipt = (until: string, summary: string, action: string): ActionReceipt => ({
    status: 'held', held_until: until, action, summary, created: [], notifications: [], partial_failures: [], retryable: false, at: new Date().toISOString(),
  });
  const current = await receiptFor(sb, args);
  if (current?.status === 'held' && current.run_at) {
    const title = typeof (current.receipt as { summary?: string } | null)?.summary === 'string' ? current.receipt?.summary : '';
    return heldReceipt(current.run_at, title || 'Saved. Undo is open for 8 seconds.', current.receipt?.action ?? '');
  }
  if (current?.receipt && (current.status === 'completed' || current.receipt.status === 'completed' || current.receipt.status === 'failed')) return current.receipt;

  const claim = await claimForExecution(sb, args);
  if (claim.kind === 'already_completed') return claim.receipt;
  if (claim.kind !== 'claimed') {
    const again = await receiptFor(sb, args);
    if (again?.status === 'held' && again.run_at) return heldReceipt(again.run_at, again.receipt?.summary || 'Saved. Undo is open for 8 seconds.', again.receipt?.action ?? '');
    return again?.receipt ?? null;
  }
  const held = await holdForExecution(sb, { run_id: claim.run_id });
  if (held.kind !== 'held') return null;
  const { data } = await askTables(sb).from(TABLE).select(HELD_COLUMNS).eq('id', claim.run_id).maybeSingle();
  const row = data as unknown as HeldRow | null;
  const commit = row ? args.resolve(row) : null;
  if (commit) args.schedule(() => releaseHeld(sb, { run_id: claim.run_id, run_at: held.run_at, run: () => commit.run(), readBack: commit.readBack }));
  const named = row?.proposed_input && typeof row.proposed_input === 'object' && 'title' in row.proposed_input && typeof (row.proposed_input as { title?: unknown }).title === 'string'
    ? (row.proposed_input as { title: string }).title
    : '';
  const calendar = row?.tool_name === 'create_event' || row?.tool_name === 'add_blocked_time' || row?.tool_name === 'create_recurring_practice';
  return heldReceipt(held.run_at, named ? (calendar ? `${named} is on its way to the calendar.` : `${named} is on its way.`) : 'Saved. Undo is open for 8 seconds.', row?.tool_name ?? '');
}

/** The ledger's receipt for a key: what the client fetches when the ring ends, and on reload. */
export async function receiptFor(sb: Sb, args: { coach_id: string; idempotency_key: string }): Promise<{ status: string; receipt: ActionReceipt | null; run_at: string | null } | null> {
  const read = (columns: string) => askTables(sb).from(TABLE).select(columns).eq('coach_id', args.coach_id).eq('idempotency_key', args.idempotency_key).maybeSingle();
  const columns = 'status, result, error_message, tool_name, decided_at';
  let { data, error } = await read(`${columns}, run_at`);
  // HM1 is optional: an immediate write's receipt is still readable without
  // run_at. Never turn a completed action into a 404 on an older schema.
  if (error?.code === '42703') ({ data, error } = await read(columns));
  if (error || !data) return null;
  const row = data as unknown as { status: string; result: ActionReceipt | null; run_at?: string | null; error_message?: string | null; tool_name?: string; decided_at?: string | null };
  if (row.status === 'approved' && row.decided_at && Date.parse(row.decided_at) < Date.now() - APPROVED_RUN_TTL_MS) {
    // Polling/reload must resolve an interrupted execution too, even when the
    // coach never sends another approval. This gate never re-runs the write.
    await claimForExecution(sb, args);
    const latest = await read(columns);
    if (!latest.error && latest.data) Object.assign(row, latest.data);
  }
  const receipt = row.result ?? (row.status === 'failed' ? {
    status: 'failed' as const, action: row.tool_name ?? '',
    summary: row.error_message ?? 'That action did not finish. Check the destination before trying again.',
    created: [], notifications: [], partial_failures: [],
    error: row.error_message ?? undefined, retryable: false,
    at: row.decided_at ?? new Date().toISOString(),
  } : null);
  return { status: row.status, receipt, run_at: row.status === 'held' ? row.run_at ?? null : null };
}
