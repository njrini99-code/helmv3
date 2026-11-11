/**
 * CoachHelm chat: the server's own record of a conversation.
 *
 * The browser sends one new message or one decision. Everything the model is shown comes from here.
 *
 * Two shapes of database are served, because the release must not wait for a migration:
 *
 *   columns  `golf_coachhelm_chat_messages` has `model_messages` and `pending_decision` (the held migration
 *            20261110120000). An assistant row holds the exact messages its turn added to the conversation, and the
 *            state of a card that waits for the coach.
 *   legacy   those columns do not exist. Earlier turns are replayed as text (what they have always been after a
 *            reload), and a waiting card's turn is kept in its action-ledger row (`proposed_input.resume`), a jsonb
 *            column production already has, so Confirm still continues the same turn.
 *
 * `ui_parts` is written the same way in both, so every conversation restores for the coach either way.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import { isStoredProposal, readRun, updateProposedInput } from '../action-runs';
import type { ActionProposal, ActionReceipt } from '../action-types';
import { ToolEnvelope } from '../provenance';
import type { PendingDecision } from './loop';
import type { ModelMessage } from './model';
import { pendingDecisionKeys, type ChatUIPart } from './protocol';

type Sb = SupabaseClient<Database>;

const TABLE = 'golf_coachhelm_chat_messages';
const BASE_COLUMNS = 'id, conversation_id, role, content, created_at, client_turn_id, status, ui_parts';
const MODEL_COLUMNS = `${BASE_COLUMNS}, model_messages, pending_decision`;
/** Postgres "column does not exist", and PostgREST's own answer for a column missing from its schema cache. */
const MISSING_COLUMN = new Set(['42703', 'PGRST204']);
/** Newest rows read for one request. Far under PostgREST's 1,000-row cap, and far more than a real conversation holds. */
const HISTORY_ROW_LIMIT = 300;

export type StoreMode = 'columns' | 'legacy';

export interface TurnRow {
  id: string;
  role: string;
  content: string | null;
  created_at: string;
  client_turn_id: string | null;
  status: string | null;
  ui_parts: ChatUIPart[] | null;
  model_messages: ModelMessage[] | null;
  pending_decision: PendingDecision | null;
}

export interface LoadedConversation {
  mode: StoreMode;
  rows: TurnRow[];
}

const asParts = (value: unknown): ChatUIPart[] | null =>
  Array.isArray(value) ? value.filter((p): p is ChatUIPart => Boolean(p) && typeof p === 'object' && typeof (p as { type?: unknown }).type === 'string') : null;

function toRow(raw: Record<string, unknown>): TurnRow {
  const pending = raw.pending_decision as PendingDecision | null | undefined;
  return {
    id: String(raw.id),
    role: String(raw.role),
    content: typeof raw.content === 'string' ? raw.content : null,
    created_at: String(raw.created_at ?? ''),
    client_turn_id: typeof raw.client_turn_id === 'string' ? raw.client_turn_id : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    ui_parts: asParts(raw.ui_parts),
    model_messages: Array.isArray(raw.model_messages) && raw.model_messages.length > 0 ? (raw.model_messages as ModelMessage[]) : null,
    pending_decision: pending && Array.isArray(pending.tasks) && pending.tasks.length > 0 ? pending : null,
  };
}

/** The conversation's rows, oldest first, and which shape of database answered. Throws when the rows cannot be read at all. */
export async function loadConversation(sb: Sb, conversationId: string): Promise<LoadedConversation> {
  const read = (columns: string) =>
    fromUntyped(sb, TABLE).select(columns).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(HISTORY_ROW_LIMIT);
  const full = await read(MODEL_COLUMNS);
  if (!full.error) return { mode: 'columns', rows: ((full.data ?? []) as unknown as Record<string, unknown>[]).map(toRow).reverse() };
  if (!MISSING_COLUMN.has(String(full.error.code))) throw new Error(`chat history: ${full.error.message}`);
  const base = await read(BASE_COLUMNS);
  if (base.error) throw new Error(`chat history: ${base.error.message}`);
  return { mode: 'legacy', rows: ((base.data ?? []) as unknown as Record<string, unknown>[]).map(toRow).reverse() };
}

/**
 * An earlier turn as text, for a row that has no stored model messages. The cards are named in a line each, from parts
 * this server wrote, so the model knows what was proposed and what was done without being shown a tool call it cannot
 * answer.
 */
function replayText(row: TurnRow): string {
  const lines: string[] = [];
  if (row.content?.trim()) lines.push(row.content.trim());
  const receipts = new Set<string>();
  for (const part of row.ui_parts ?? []) {
    if (part.type !== 'data-action-receipt') continue;
    const receipt = part.data as ActionReceipt | undefined;
    if (!receipt) continue;
    receipts.add(String(part.id ?? '').replace(/^receipt-/, ''));
    lines.push(`[Action ${receipt.status}: ${receipt.summary}]`);
  }
  for (const part of row.ui_parts ?? []) {
    if (part.type !== 'data-action-proposal') continue;
    const proposal = part.data as ActionProposal | undefined;
    if (proposal && !receipts.has(proposal.idempotency_key)) lines.push(`[Proposed, not confirmed: ${proposal.summary}]`);
  }
  return lines.join('\n');
}

/**
 * The messages the model is shown for the turns before this one. A turn the engine stored is replayed exactly; any
 * other turn is replayed as text. `withoutTurn` leaves out one turn's rows (the turn being retried or continued, whose
 * messages the caller supplies itself); `before` stops at a row.
 */
export function buildHistory(loaded: LoadedConversation, opts: { withoutTurn?: string | null; before?: TurnRow } = {}): ModelMessage[] {
  const rows = opts.before ? loaded.rows.slice(0, loaded.rows.indexOf(opts.before)) : loaded.rows;
  const skip = opts.withoutTurn ?? opts.before?.client_turn_id ?? null;
  // A stored turn's first model message IS the coach's question, so its user row is not replayed a second time.
  const storedTurns = new Set(rows.filter((r) => r.role === 'assistant' && r.model_messages && r.client_turn_id).map((r) => r.client_turn_id as string));
  const history: ModelMessage[] = [];
  for (const row of rows) {
    if (skip && row.client_turn_id === skip) continue;
    if (row.role === 'user') {
      if (row.client_turn_id && storedTurns.has(row.client_turn_id)) continue;
      if (row.content?.trim()) history.push({ role: 'user', content: row.content });
    } else if (row.role === 'assistant') {
      if (row.model_messages) history.push(...row.model_messages);
      else if (row.status !== 'failed') {
        const text = replayText(row);
        if (text) history.push({ role: 'assistant', content: text });
      }
    }
  }
  // The API requires the first message to be the user's. A window that opens mid-conversation drops what precedes one.
  while (history.length > 0 && history[0]?.role !== 'user') history.shift();
  return history;
}

/** The conversation's reads by `evidence_ref`, from the evidence parts this server stored, and the highest ref number in use. */
export function collectReads(loaded: LoadedConversation): { reads: Map<string, ToolEnvelope>; nextRef: number } {
  const reads = new Map<string, ToolEnvelope>();
  let nextRef = 0;
  for (const row of loaded.rows) {
    if (row.role !== 'assistant' || row.status === 'failed') continue;
    for (const part of row.ui_parts ?? []) {
      if (part.type !== 'data-evidence') continue;
      const data = part.data as { envelope?: unknown; ref?: unknown } | undefined;
      if (typeof data?.ref !== 'string') continue;
      // It round-tripped through a table the coach can write to: a part that no longer has an envelope's shape is not a read.
      const parsed = ToolEnvelope.safeParse(data.envelope);
      if (!parsed.success) continue;
      reads.set(data.ref, parsed.data);
      const n = Number(/^e(\d+)$/.exec(data.ref)?.[1] ?? 0);
      if (n > nextRef) nextRef = n;
    }
  }
  return { reads, nextRef };
}

export interface OpenDecision {
  row: TurnRow;
  /** Null: the card is on screen but its turn cannot be continued (no stored state). The caller says so plainly. */
  pending: PendingDecision | null;
  /** The model messages the waiting turn has added so far, ending in the assistant message that asked. */
  appended: ModelMessage[];
  /** Every key still waiting on this row's cards, whether or not the turn can be continued. */
  keys: string[];
}

interface ResumeState {
  appended: ModelMessage[];
  pending: PendingDecision;
}

const isResume = (value: unknown): value is ResumeState =>
  Boolean(value) && typeof value === 'object' && Array.isArray((value as ResumeState).appended) && Array.isArray((value as ResumeState).pending?.tasks);

/** The newest turn, if a card of it still waits for the coach. Only the newest can: a newer question declines an older card. */
export async function findOpenDecision(sb: Sb, loaded: LoadedConversation, coachId: string): Promise<OpenDecision | null> {
  const row = [...loaded.rows].reverse().find((r) => r.role === 'assistant');
  if (!row || row.status === 'failed') return null;
  const keys = pendingDecisionKeys({ id: row.id, role: 'assistant', parts: row.ui_parts ?? [] });
  if (loaded.mode === 'columns' && row.pending_decision) {
    return { row, pending: row.pending_decision, appended: row.model_messages ?? [], keys: row.pending_decision.tasks.map((t) => t.key) };
  }
  if (keys.length === 0) return null;
  for (const key of keys) {
    const run = await readRun(sb, { coach_id: coachId, idempotency_key: key });
    if (run && run.status === 'proposed' && isStoredProposal(run.proposed_input) && isResume(run.proposed_input.resume)) {
      return { row, pending: run.proposed_input.resume.pending, appended: run.proposed_input.resume.appended, keys };
    }
  }
  return { row, pending: null, appended: [], keys };
}

/** Legacy shape only: keep the waiting turn in the ledger rows of its undecided cards. False when none could be written. */
export async function saveResumeToLedger(sb: Sb, coachId: string, state: ResumeState): Promise<boolean> {
  let saved = false;
  for (const task of state.pending.tasks) {
    const run = await readRun(sb, { coach_id: coachId, idempotency_key: task.key });
    if (!run || !isStoredProposal(run.proposed_input)) continue;
    if (await updateProposedInput(sb, { coach_id: coachId, idempotency_key: task.key, proposed_input: { ...run.proposed_input, resume: state } })) saved = true;
  }
  return saved;
}

export interface TurnWrite {
  /** An existing assistant row to update: the turn being continued, or the failed attempt a retry replaces. */
  id?: string;
  conversation_id: string;
  client_turn_id: string | null;
  content: string;
  status: 'complete' | 'failed';
  ui_parts: ChatUIPart[];
  /** Everything this turn has added to the conversation so far. Ignored on the legacy shape. */
  model_messages: ModelMessage[];
  pending: PendingDecision | null;
}

/**
 * Insert or update the assistant row of a turn. Returns its id and the shape of database that took it: a conversation
 * with no rows yet is written as `columns` first, and learns here that the columns are not there. Throws when the row
 * could not be written at all.
 */
export async function saveTurn(sb: Sb, mode: StoreMode, turn: TurnWrite): Promise<{ id: string; mode: StoreMode }> {
  const base = { content: turn.content, status: turn.status, ui_parts: turn.ui_parts as never };
  const write = async (withModel: boolean) => {
    const values = withModel ? { ...base, model_messages: turn.model_messages as never, pending_decision: turn.pending as never } : base;
    return turn.id
      ? fromUntyped(sb, TABLE).update(values).eq('id', turn.id).select('id').maybeSingle()
      : fromUntyped(sb, TABLE).insert({ ...values, conversation_id: turn.conversation_id, role: 'assistant', client_turn_id: turn.client_turn_id }).select('id').maybeSingle();
  };
  let used = mode;
  let res = await write(mode === 'columns');
  if (res.error && mode === 'columns' && MISSING_COLUMN.has(String(res.error.code))) {
    used = 'legacy';
    res = await write(false);
  }
  if (res.error) throw new Error(`chat turn not saved: ${res.error.message}`);
  const id = (res.data as { id?: string } | null)?.id ?? turn.id;
  if (!id) throw new Error('chat turn not saved: no row returned');
  return { id, mode: used };
}

/** Update the cards of an earlier row (a card declined by a newer question) without touching what the model was shown. */
export async function saveCardState(sb: Sb, mode: StoreMode, id: string, ui_parts: ChatUIPart[]): Promise<void> {
  const values = mode === 'columns' ? { ui_parts: ui_parts as never, pending_decision: null } : { ui_parts: ui_parts as never };
  const { error } = await fromUntyped(sb, TABLE).update(values).eq('id', id);
  if (error) throw new Error(`chat card not saved: ${error.message}`);
}
