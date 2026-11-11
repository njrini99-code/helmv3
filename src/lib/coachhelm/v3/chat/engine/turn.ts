/**
 * CoachHelm chat: one request, start to finish.
 *
 * A request is either a new message or the coach's decision on a waiting card. Both run the same loop over the server's
 * own record of the conversation and end the same way: the turn is stored, THEN `done` is sent, so a reload or a Confirm
 * straight after the last word finds what it needs.
 *
 *   new message   append it (after declining any card still waiting: a new question is a Cancel), run the loop.
 *   decision      a decision request continues the SAME assistant turn: its tool call gets its tool_result (ran, held
 *                 for Undo, declined, failed) and the loop goes on to the closing words. It is not a new question and
 *                 no second assistant row is written.
 *
 * A turn that ends waiting for the coach is a complete, successful turn. A task that committed is never stored as a
 * failed turn because the closing words did not arrive: the receipt is the record.
 */
import { logServerError } from '@/lib/server-error-logger';
import type { ToolEnvelope } from '../provenance';
import { defaultGroundingCheck, type GroundingCheck } from './grounding';
import { runModelLoop, toolResultsMessage, type LoopState, type LoopStop, type PendingDecision } from './loop';
import { emptyUsage, modelToolFor, type ModelClient, type ModelMessage, type SystemPrompt, type ToolResultBlock, type UsageTotals } from './model';
import { applyChatEvent, CHAT_STREAM_CONTENT_TYPE, encodeChatEvent, textOfParts, type ChatErrorAction, type ChatEvent, type ChatTurnStatus, type ChatUIMessage, type ChatUIPart, type WireDataPart } from './protocol';
import { buildHistory, collectReads, findOpenDecision, saveCardState, saveResumeToLedger, saveTurn, type LoadedConversation, type OpenDecision } from './store';
import { confirmTask, declineTask, type TaskDeps } from './tasks';
import type { ChatTool, TaskTool, ToolContext } from './tool';

export type TurnInput = { kind: 'message'; text: string } | { kind: 'decision'; key: string; approved: boolean };

export interface TurnSummary {
  status: ChatTurnStatus;
  /** How the loop stopped; `none` when no model call was made (a decision that left another card waiting, or a refused request). */
  stop: LoopStop['kind'] | 'none';
  /** The stored assistant row, when one was written. */
  messageId: string | null;
  usage: UsageTotals;
  text: string;
  grounded: boolean;
  unmatched: string[];
  /** Milliseconds to the first word the coach could read. Null when the turn had no words. */
  firstTextMs: number | null;
  totalMs: number;
  /** Keys of the cards this request proposed. */
  proposalKeys: string[];
  error: unknown;
}

export interface TurnDeps {
  /** Called once, inside the stream, so a missing key is a sentence on the coach's screen and not a 500. */
  model: () => ModelClient;
  tools: readonly ChatTool[];
  system: SystemPrompt;
  /** Everything a tool is given except the conversation's reads and the abort signal, which the turn supplies. */
  toolContext: Omit<ToolContext, 'reads' | 'signal'>;
  /** Null where tasks are not offered (the player's Ask). */
  tasks: TaskDeps | null;
  maxSteps: number;
  /** The request's own signal: the browser going away stops the model and the spend. */
  requestSignal: AbortSignal | undefined;
  /** Null: nothing is stored and nothing is replayed (a player's turn until player conversations exist). */
  store: { loaded: LoadedConversation; coachId: string } | null;
  clientTurnId: string;
  describeError: (error: unknown) => { message: string; action: ChatErrorAction };
  checkGrounding?: GroundingCheck;
  /** Parts to send before anything else (the player's allowance). Not stored. */
  preface?: WireDataPart[];
  /** Bookkeeping after the turn is stored: cost, logs. Its failure never costs the coach the answer. */
  onFinished: (summary: TurnSummary) => void | Promise<void>;
}

const REFUSAL_NOTE = 'CoachHelm can’t help with that one. Try asking it another way.';
const TRUNCATED_NOTE = 'That answer ran too long to finish. Ask for a smaller piece of it.';
const STOPPED_NOTE = 'Stopped before it finished.';
const CARD_GONE_NOTE = 'This card can no longer be confirmed. Ask CoachHelm to prepare it again.';
const CARD_RETRY_NOTE = 'That could not be confirmed just now. Try again, or ask CoachHelm to prepare it again.';
const NOT_SAVED_NOTE = 'That answer could not be saved, so it may be gone after a reload. Please ask again.';

const receiptPart = (key: string, receipt: unknown): WireDataPart => ({ type: 'data-action-receipt', id: `receipt-${key}`, data: receipt });

const proposalKeysOf = (parts: readonly ChatUIPart[]): string[] =>
  parts.flatMap((p) => (p.type === 'data-action-proposal' && typeof (p.data as { idempotency_key?: unknown } | undefined)?.idempotency_key === 'string' ? [(p.data as { idempotency_key: string }).idempotency_key] : []));

/** The streamed response for one request. The caller has already authenticated, gated and (for a new message) stored the user's row. */
export function chatTurnResponse(deps: TurnDeps, input: TurnInput, headers: Record<string, string> = {}): Response {
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  if (deps.requestSignal?.aborted) abort.abort();
  else deps.requestSignal?.addEventListener('abort', onRequestAbort, { once: true });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeChatEvent(event)));
        } catch {
          open = false;
        }
      };
      void runTurn(deps, input, abort.signal, send)
        .catch((err) => {
          // Nothing below should throw; if it does the coach still gets a sentence and a closed stream.
          void logServerError(`chat/stream: turn crashed: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.turn' });
          send({ type: 'error', ...deps.describeError(err) });
          send({ type: 'done', status: 'failed' });
        })
        .finally(() => {
          deps.requestSignal?.removeEventListener('abort', onRequestAbort);
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the browser going away.
          }
        });
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: { 'content-type': CHAT_STREAM_CONTENT_TYPE, 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no', ...headers },
  });
}

async function runTurn(deps: TurnDeps, input: TurnInput, signal: AbortSignal, send: (event: ChatEvent) => void): Promise<void> {
  const started = Date.now();
  const sb = deps.toolContext.sb;
  const conversationId = deps.toolContext.conversationId;
  const loaded: LoadedConversation = deps.store?.loaded ?? { mode: 'legacy', rows: [] };
  const coachId = deps.store?.coachId ?? '';
  const toolContext: Omit<ToolContext, 'reads'> = { ...deps.toolContext, signal };
  const usage = emptyUsage();
  let firstTextMs: number | null = null;
  let ui: ChatUIMessage = { id: crypto.randomUUID(), role: 'assistant', parts: [] };
  const emit = (event: ChatEvent) => {
    if (event.type === 'text_delta' && firstTextMs === null) firstTextMs = Date.now() - started;
    ui = applyChatEvent(ui, event);
    send(event);
  };

  let messageId: string | null = null;
  const finish = async (status: ChatTurnStatus, stop: TurnSummary['stop'], error: unknown, grounding: { grounded: boolean; unmatched: string[] }, before: readonly ChatUIPart[]) => {
    send({ type: 'usage', input_tokens: usage.input + usage.cacheRead + usage.cacheWrite, output_tokens: usage.output, cache_read_input_tokens: usage.cacheRead });
    send({ type: 'done', status });
    const earlier = new Set(proposalKeysOf(before));
    try {
      await deps.onFinished({
        status,
        stop,
        messageId,
        usage,
        text: textOfParts(ui.parts),
        ...grounding,
        firstTextMs,
        totalMs: Date.now() - started,
        proposalKeys: proposalKeysOf(ui.parts).filter((k) => !earlier.has(k)),
        error,
      });
    } catch {
      // Accounting never fails a turn.
    }
  };
  const fail = (message: string, action: ChatErrorAction) => send({ type: 'error', message, action });

  const open = deps.store ? await findOpenDecision(sb, loaded, coachId).catch(() => null) : null;
  const { reads, nextRef } = collectReads(loaded);
  const state: LoopState = { messages: [], appended: [], steps: 0, usage, reads, nextRef, nextProgress: 0 };
  /** The assistant row this request writes: the waiting turn (a decision), or a failed attempt a retry replaces. */
  let rowId: string | undefined;

  // ── A decision on a waiting card ────────────────────────────────────────────────────────────────────────────────
  if (input.kind === 'decision') {
    const task = open?.pending?.tasks.find((t) => t.key === input.key);
    if (!deps.tasks || !open || !open.pending || !task) {
      await answerStaleDecision(deps, loaded, open, input.key, send);
      return;
    }
    const pending: PendingDecision = open.pending;
    rowId = open.row.id;
    messageId = open.row.id;
    const before = open.row.ui_parts ?? [];
    ui = { id: open.row.id, role: 'assistant', parts: before };
    send({ type: 'message_start', conversation_id: conversationId, message_id: ui.id, resumed: true });

    const tool = deps.tools.find((t): t is TaskTool<unknown> => t.kind === 'task' && t.name === task.tool);
    const ctx: ToolContext = { ...toolContext, reads };
    const outcome = input.approved ? await confirmTask(deps.tasks, tool, ctx, task.key) : await declineTask(deps.tasks, ctx, task.key, 'declined');
    emit({ type: 'decision', key: task.key, approved: input.approved });
    if (outcome.receipt) emit({ type: 'receipt', part: receiptPart(task.key, outcome.receipt) });

    const next: PendingDecision = {
      ...pending,
      results: { ...pending.results, [task.tool_use_id]: { content: outcome.result, ...(outcome.isError ? { is_error: true } : {}) } },
      tasks: pending.tasks.filter((t) => t.key !== task.key),
    };

    // From here the coach's decision has been carried out. Whatever happens to the closing words, the turn is stored as complete.
    const store = async (appended: ModelMessage[], stillPending: PendingDecision | null) => {
      if (!deps.store) return;
      try {
        const saved = await saveTurn(sb, loaded.mode, { id: rowId, conversation_id: conversationId, client_turn_id: open.row.client_turn_id, content: textOfParts(ui.parts), status: 'complete', ui_parts: ui.parts, model_messages: appended, pending: stillPending });
        if (saved.mode === 'legacy' && stillPending) await saveResumeToLedger(sb, coachId, { appended, pending: stillPending });
      } catch (err) {
        void logServerError(`chat/stream: decision not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist' });
      }
    };

    if (next.tasks.length > 0) {
      await store(open.appended, next);
      await finish('awaiting_decision', 'none', null, { grounded: true, unmatched: [] }, before);
      return;
    }

    const answer = toolResultsMessage(next);
    state.messages = [...buildHistory(loaded, { before: open.row }), ...open.appended, answer];
    state.appended = [...open.appended, answer];
    state.steps = pending.steps;
    const stop = await runLoop(deps, toolContext, state, emit, signal);
    if (stop.kind === 'awaiting_decision') {
      await store(state.appended, stop.pending);
      await finish('awaiting_decision', stop.kind, null, { grounded: true, unmatched: [] }, before);
      return;
    }
    await store(state.appended, null);
    const error = stop.kind === 'error' ? stop.error : null;
    if (stop.kind !== 'complete') {
      void logServerError(`chat/stream: closing words after a decision did not arrive (${stop.kind})`, { action: 'v3.chat.stream.decision_tail', handled: true }, 'warning');
    }
    await finish('complete', stop.kind, error, ground(deps, ui, reads, ''), before);
    return;
  }

  // ── A new message ───────────────────────────────────────────────────────────────────────────────────────────────
  const question = input.text;
  send({ type: 'message_start', conversation_id: conversationId, message_id: ui.id, resumed: false });
  for (const part of deps.preface ?? []) send({ type: 'part', part });

  // A card still waiting when the coach asks something else is a Cancel: the model is told so before the new question.
  const declined: ToolResultBlock[] = [];
  if (open && deps.tasks) {
    const ctx: ToolContext = { ...toolContext, reads };
    let cards: ChatUIMessage = { id: open.row.id, role: 'assistant', parts: open.row.ui_parts ?? [] };
    const results = { ...(open.pending?.results ?? {}) };
    for (const key of open.keys) {
      const outcome = await declineTask(deps.tasks, ctx, key, 'superseded');
      cards = applyChatEvent(cards, { type: 'decision', key, approved: false });
      const task = open.pending?.tasks.find((t) => t.key === key);
      if (task) results[task.tool_use_id] = { content: outcome.result };
    }
    await saveCardState(sb, loaded.mode, open.row.id, cards.parts).catch((err) => {
      void logServerError(`chat/stream: declined card not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist' }, 'warning');
    });
    // Only where the asking tool call is itself in the replayed history does it need its results; a text replay has no call to answer.
    if (loaded.mode === 'columns' && open.pending && open.row.model_messages) {
      const answer = toolResultsMessage({ order: open.pending.order, results });
      declined.push(...(answer.content as ToolResultBlock[]));
    }
  }

  // A retry of a turn that failed replaces that attempt: its rows are not replayed and its assistant row is overwritten.
  rowId = loaded.rows.find((r) => r.role === 'assistant' && r.client_turn_id === deps.clientTurnId)?.id;
  const userMessage: ModelMessage = { role: 'user', content: declined.length > 0 ? [...declined, { type: 'text', text: input.text }] : input.text };
  state.messages = [...buildHistory(loaded, { withoutTurn: deps.clientTurnId }), userMessage];
  state.appended = [userMessage];

  const stop = await runLoop(deps, toolContext, state, emit, signal);

  const store = async (status: 'complete' | 'failed', note: string | null, pending: PendingDecision | null): Promise<boolean> => {
    if (!deps.store) return true;
    const failed = status === 'failed';
    try {
      const saved = await saveTurn(sb, loaded.mode, {
        id: rowId,
        conversation_id: conversationId,
        client_turn_id: deps.clientTurnId,
        content: failed ? '' : textOfParts(ui.parts),
        status,
        ui_parts: failed ? [...ui.parts, { type: 'data-turn-incomplete', id: 'turn-verdict', data: { note: note ?? STOPPED_NOTE } }] : ui.parts,
        // A failed turn leaves only the question behind: nothing half-finished is ever replayed to the model.
        model_messages: failed ? [userMessage] : state.appended,
        pending,
      });
      messageId = saved.id;
      if (saved.mode === 'legacy' && pending) return await saveResumeToLedger(sb, coachId, { appended: state.appended, pending });
      return true;
    } catch (err) {
      void logServerError(`chat/stream: turn not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist' });
      return false;
    }
  };

  if (stop.kind === 'complete') {
    const saved = await store('complete', null, null);
    if (!saved) fail(NOT_SAVED_NOTE, 'retry');
    await finish('complete', stop.kind, null, ground(deps, ui, reads, question), []);
    return;
  }
  if (stop.kind === 'awaiting_decision') {
    const saved = await store('complete', null, stop.pending);
    if (!saved) {
      // A card whose turn is not stored could only fail on Confirm: say so now and withdraw it.
      for (const task of stop.pending.tasks) {
        await declineTask(deps.tasks as TaskDeps, { ...toolContext, reads }, task.key, 'declined');
        emit({ type: 'decision', key: task.key, approved: false });
      }
      fail(CARD_GONE_NOTE, 'none');
      await finish('failed', stop.kind, null, { grounded: true, unmatched: [] }, []);
      return;
    }
    await finish('awaiting_decision', stop.kind, null, { grounded: true, unmatched: [] }, []);
    return;
  }

  const described =
    stop.kind === 'refusal'
      ? { message: REFUSAL_NOTE, action: 'none' as const }
      : stop.kind === 'truncated'
        ? { message: TRUNCATED_NOTE, action: 'none' as const }
        : stop.kind === 'aborted'
          ? { message: STOPPED_NOTE, action: 'retry' as const }
          : deps.describeError(stop.error);
  await store('failed', described.message, null);
  if (stop.kind !== 'aborted') fail(described.message, described.action);
  await finish(stop.kind === 'aborted' ? 'stopped' : 'failed', stop.kind, stop.kind === 'error' ? stop.error : null, { grounded: false, unmatched: [] }, []);
}

async function runLoop(deps: TurnDeps, toolContext: Omit<ToolContext, 'reads'>, state: LoopState, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<LoopStop> {
  let model: ModelClient;
  try {
    model = deps.model();
  } catch (err) {
    return { kind: 'error', error: err };
  }
  return runModelLoop(
    { model, system: deps.system, tools: deps.tools, modelTools: deps.tools.map(modelToolFor), toolContext, tasks: deps.tasks, maxSteps: deps.maxSteps, signal, emit },
    state,
  );
}

function ground(deps: TurnDeps, ui: ChatUIMessage, reads: ReadonlyMap<string, ToolEnvelope>, question: string): { grounded: boolean; unmatched: string[] } {
  try {
    return (deps.checkGrounding ?? defaultGroundingCheck)({ text: textOfParts(ui.parts), reads: [...reads.values()], question });
  } catch {
    return { grounded: false, unmatched: [] };
  }
}

/**
 * A decision for a card that is not waiting. Either it was already answered (a double press, a retry after a lost
 * response): the stored answer is sent again and nothing runs twice. Or its turn cannot be continued: the coach is told
 * plainly and the card is withdrawn.
 */
async function answerStaleDecision(deps: TurnDeps, loaded: LoadedConversation, open: OpenDecision | null, key: string, send: (event: ChatEvent) => void): Promise<void> {
  const conversationId = deps.toolContext.conversationId;
  const row = [...loaded.rows].reverse().find((r) => r.role === 'assistant' && (r.ui_parts ?? []).some((p) => p.type.startsWith('tool-') && (p as { approval?: { id?: unknown } }).approval?.id === key));
  send({ type: 'message_start', conversation_id: conversationId, message_id: row?.id ?? crypto.randomUUID(), resumed: true });
  const card = row?.ui_parts?.find((p) => p.type.startsWith('tool-') && (p as { approval?: { id?: unknown } }).approval?.id === key) as { approval?: { approved?: boolean } } | undefined;
  if (row && typeof card?.approval?.approved === 'boolean') {
    send({ type: 'decision', key, approved: card.approval.approved });
    const receipt = row.ui_parts?.find((p) => p.type === 'data-action-receipt' && p.id === `receipt-${key}`);
    if (receipt) send({ type: 'receipt', part: receiptPart(key, receipt.data) });
    send({ type: 'done', status: 'complete' });
    return;
  }
  // Still drawn as waiting, but its turn could not be found this time. Nothing is changed: a read that failed for a moment must not
  // cancel the coach's card. They can press again, or ask something else (which declines it).
  if (row && open && open.row.id === row.id) {
    send({ type: 'error', message: CARD_RETRY_NOTE, action: 'retry' });
    send({ type: 'done', status: 'awaiting_decision' });
    return;
  }
  send({ type: 'decision', key, approved: false });
  send({ type: 'error', message: CARD_GONE_NOTE, action: 'none' });
  send({ type: 'done', status: 'complete' });
}
