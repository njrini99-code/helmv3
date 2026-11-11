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
import { stripReadMarkers } from '../read-markers';
import { aboutLine } from './about';
import { defaultGroundingCheck, type GroundingCheck } from './grounding';
import { runModelLoop, toolResultsMessage, type LoopState, type LoopStop, type PendingDecision } from './loop';
import { emptyUsage, fallbackModelOf, profileFor, type ChatFeatures, type FeatureGroup, type ModelClient, type ModelMessage, type ModelProfile, type SystemPrompt, type ToolResultBlock, type UsageTotals } from './model';
import { applyChatEvent, CARD_REVISION_PART, CHAT_STREAM_CONTENT_TYPE, encodeChatEvent, eventsForStoredParts, textOfParts, TURN_META_PART, turnMetaOf, type ChatCardRevision, type ChatErrorAction, type ChatErrorKind, type ChatEvent, type ChatScreenEcho, type ChatTurnMeta, type ChatTurnStatus, type ChatUIMessage, type ChatUIPart, type WireDataPart } from './protocol';
import { suggestFor } from './suggestions';
import { buildHistory, collectReads, findOpenDecision, saveCardState, saveResumeToLedger, saveTurn, type LoadedConversation, type OpenDecision } from './store';
import { lastRowNumberOf, lastSeqOf, workOf } from './steps';
import { declineTask, reviseTask, settleAbandonedTask, startConfirm, startConfirmAll, type DecisionOutcome, type TaskDeps } from './tasks';
import type { ChatTool, TaskTool, ToolContext } from './tool';

/**
 * `revision` (a decision or an edit): the revision of the card the coach was looking at, as its `proposal` part carries it.
 * `revise`: the coach changed fields on a waiting card; no model is called.
 */
export type TurnInput =
  /** `about`: the thing in an earlier answer the coach tapped, as the browser sent it. Resolved here against this conversation's reads. */
  | { kind: 'message'; text: string; about?: unknown }
  | { kind: 'decision'; key: string; approved: boolean; revision?: number }
  | { kind: 'revise'; key: string; edits: Record<string, unknown>; revision?: number }
  /** "Approve all": confirm these waiting cards of one turn, in the order they were proposed (not the order listed here). */
  | { kind: 'approve_all'; cards: Array<{ key: string; revision?: number }> };

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
  /** The API's category when the model declined (`cyber`, `bio`, `frontier_llm`, `general_harms`), for the log. */
  refusalCategory: string | null;
  /** True when the API rejected a request and the turn went on without one or more feature groups. */
  degraded: boolean;
  /** Those groups, in the order they were given up (`engine/model.ts`, `FEATURE_GROUPS`). Empty on a turn that ran as configured. */
  featuresDropped: FeatureGroup[];
  /** The substitute model that answered when a refusal fallback did; null otherwise. */
  fallbackModel: string | null;
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
  /** The model the surface runs on and its settings. Left out, a coach surface's. */
  profile?: ModelProfile;
  /** What requests are sent with. Left out, the profile's own. */
  features?: ChatFeatures;
  /**
   * What the app tells the model about THIS turn: today's date, the screen the chat was opened from, and on a
   * conversation's first turn the coach's standing notes. It is sent as a `role: 'system'` message straight after the
   * user's message and stored with the turn, because nothing that changes during a conversation's life may sit in the
   * system prompt (a thinking block is only valid while everything before it is unchanged). Never in the same block as
   * the user's words.
   */
  turnNote?: string | null;
  /** The screen the request's `screen` resolved to, echoed on `message_start` for the context chip. Words for people, never an id. */
  screen?: ChatScreenEcho | null;
  /** The request's own signal: the browser going away stops the model and the spend. */
  requestSignal: AbortSignal | undefined;
  /** Null: nothing is stored and nothing is replayed (a player's turn until player conversations exist). */
  store: { loaded: LoadedConversation; coachId: string } | null;
  clientTurnId: string;
  describeError: (error: unknown) => { message: string; action: ChatErrorAction; kind?: ChatErrorKind };
  checkGrounding?: GroundingCheck;
  /** Parts to send before anything else (the player's allowance). Not stored. */
  preface?: WireDataPart[];
  /** Bookkeeping after the turn is stored: cost, logs. Its failure never costs the coach the answer. */
  onFinished: (summary: TurnSummary) => void | Promise<void>;
  /**
   * The call that asked for what to ask next was made (`engine/suggestions.ts`): what it cost, how many suggestions passed
   * the checks, and whether the call itself failed. Called only when a call was made. Its failure costs nothing.
   */
  onSuggested?: (result: { usage: UsageTotals; kept: number; failed: boolean }) => void | Promise<void>;
}

/** How long the call for what to ask next may take before it is given up: it holds the response open, never the answer. */
export const SUGGESTIONS_TIMEOUT_MS = 8_000;

const REFUSAL_NOTE = 'I can’t help with that one. Try asking it another way, or ask me about your team, your players or your schedule.';
const TRUNCATED_NOTE = 'That answer ran too long to finish. Ask for a smaller piece of it.';
const STOPPED_NOTE = 'Stopped before it finished.';
const CARD_GONE_NOTE = 'This card can no longer be confirmed. Ask CoachHelm to prepare it again.';
const CARD_RETRY_NOTE = 'That could not be confirmed just now. Try again, or ask CoachHelm to prepare it again.';
const NOT_SAVED_NOTE = 'That answer could not be saved, so it may be gone after a reload. Please ask again.';

/** The words of a turn as stored and checked: the read markers are the thread's, not prose (the "3" in `[e3]` is not a figure). */
const wordsOf = (parts: readonly ChatUIPart[]): string => stripReadMarkers(textOfParts(parts)).trim();

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
      const turn = runTurn(deps, input, abort.signal, send);
      // A confirmed action is written by this request even if the browser goes away during the Undo window: the platform keeps the
      // function alive until the turn has finished.
      deps.tasks?.defer(() => turn.catch(() => undefined));
      void turn
        .catch((err) => {
          // Nothing below should throw; if it does the coach still gets a sentence and a closed stream.
          void logServerError(`chat/stream: turn crashed: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.turn' });
          send({ type: 'error', kind: 'model', ...deps.describeError(err) });
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
  const startedAt = new Date(started).toISOString();
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
  let refusalCategory: string | null = null;
  const finish = async (status: ChatTurnStatus, stop: TurnSummary['stop'], error: unknown, grounding: { grounded: boolean; unmatched: string[] }, before: readonly ChatUIPart[]) => {
    // `features_dropped`: the request features this turn had to give up to be accepted. Names only, never the API's words.
    const gaveUp = state.dropped.map((d) => d.group);
    send({ type: 'usage', input_tokens: usage.input + usage.cacheRead + usage.cacheWrite, output_tokens: usage.output, cache_read_input_tokens: usage.cacheRead, cache_creation_input_tokens: usage.cacheWrite, ...(gaveUp.length > 0 ? { features_dropped: gaveUp } : {}) });
    // The turn's work, beside its whole duration: how many steps, and for how long at least one of them was running.
    const work = workOf(ui.parts);
    send({ type: 'done', status, duration_ms: Date.now() - started, ...(work.steps > 0 ? { work } : {}) });
    const earlier = new Set(proposalKeysOf(before));
    try {
      await deps.onFinished({
        status,
        stop,
        messageId,
        usage,
        text: wordsOf(ui.parts),
        ...grounding,
        firstTextMs,
        totalMs: Date.now() - started,
        proposalKeys: proposalKeysOf(ui.parts).filter((k) => !earlier.has(k)),
        error,
        refusalCategory,
        degraded: state.dropped.length > 0,
        featuresDropped: state.dropped.map((d) => d.group),
        fallbackModel: fallbackModelOf(usage),
      });
    } catch {
      // Accounting never fails a turn.
    }
  };
  const fail = (message: string, action: ChatErrorAction, kind: ChatErrorKind) => send({ type: 'error', message, action, kind });

  /**
   * What to ask next. Runs AFTER `done` has gone out, on a turn that completed with an answer: the coach is never kept waiting
   * for it and can already ask something else (which ends this). One small call; what comes back is checked against the caller's
   * own tools and the things the assistant never does (`engine/suggestions.ts`); what passes is sent as the one event that may
   * follow `done` and stored with the turn. Whatever goes wrong here, the turn has already ended well.
   */
  const suggest = async (question: string): Promise<void> => {
    if (!state.features.suggestions || signal.aborted) return;
    const answer = wordsOf(ui.parts);
    if (!question.trim() || !answer) return;
    let model: ModelClient;
    try {
      model = deps.model();
    } catch {
      return;
    }
    const within = AbortSignal.any([signal, AbortSignal.timeout(SUGGESTIONS_TIMEOUT_MS)]);
    const asked = await suggestFor(model, within, { question, answer, tools: deps.tools, surface: deps.toolContext.surface });
    if (asked.usage.calls.length > 0) {
      try {
        await deps.onSuggested?.({ usage: asked.usage, kept: asked.suggestions.length, failed: asked.failed });
      } catch {
        // Accounting never fails a turn.
      }
    }
    // The coach has moved on (asked something else, or left): these belong to an answer that is no longer the last.
    if (asked.suggestions.length === 0 || signal.aborted) return;
    const event: ChatEvent = { type: 'suggestions', items: asked.suggestions };
    ui = applyChatEvent(ui, event);
    send(event);
    const row = rowId ?? messageId;
    if (!deps.store || !row) return;
    // Only the drawn parts change: the model's own record of the turn never holds a suggestion.
    await saveCardState(sb, loaded.mode, row, ui.parts, { stillWaiting: true }).catch((err) => {
      void logServerError(`chat/stream: suggestions not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist', handled: true }, 'warning');
    });
  };

  // Facts about the turn that are not the answer, kept as one part so they are stored with it and restored with it. Written again
  // (in place) each time the turn is stored: `earlier` is what requests before this one already spent on the same turn.
  const readNames = new Set(deps.tools.filter((t) => t.kind === 'read').map((t) => t.name));
  let earlier: ChatTurnMeta | null = null;
  let refused = false;
  const stamp = () => {
    const finished = (p: ChatUIPart) => ['done', 'failed'].includes(String((p.data as { state?: unknown } | undefined)?.state));
    const reads = ui.parts.filter((p) => p.type === 'data-progress' && readNames.has(String((p.data as { tool?: unknown } | undefined)?.tool)) && finished(p)).length;
    // The steps are the turn's own rows, earlier requests' included, so these two need no adding up.
    const work = workOf(ui.parts);
    const meta: ChatTurnMeta = { started_at: earlier?.started_at ?? startedAt, duration_ms: (earlier?.duration_ms ?? 0) + (Date.now() - started), reads, ...(work.steps > 0 ? work : {}), ...(refused || earlier?.declined ? { declined: true as const } : {}) };
    emit({ type: 'part', part: { type: TURN_META_PART, id: 'turn-meta', data: meta } });
  };

  const open = deps.store ? await findOpenDecision(sb, loaded, coachId).catch(() => null) : null;
  const { reads, nextRef } = collectReads(loaded);
  const profile = deps.profile ?? profileFor('ask');
  const state: LoopState = { messages: [], appended: [], steps: 0, usage, reads, nextRef, nextProgress: 0, profile, features: deps.features ?? profile.features, dropped: [], container: null };
  /** The assistant row this request writes: the waiting turn (a decision), or a failed attempt a retry replaces. */
  let rowId: string | undefined;

  const proposalPart = (key: string, proposal: unknown): WireDataPart => ({ type: 'data-action-proposal', id: `proposal-${key}`, data: proposal });
  const revisionPart = (data: ChatCardRevision): WireDataPart => ({ type: CARD_REVISION_PART, id: `revision-${data.key}`, data });

  // ── An edit to a waiting card ───────────────────────────────────────────────────────────────────────────────────
  // No model is called and nothing is written to the domain: the task plans again and the stored plan is replaced. The response is
  // the card as it now stands and whether the edit was made.
  if (input.kind === 'revise') {
    const key = input.key;
    const task = open?.pending?.tasks.find((t) => t.key === key);
    const holder = task && open ? open.row : [...loaded.rows].reverse().find((r) => r.role === 'assistant' && (r.ui_parts ?? []).some((p) => p.type === 'data-action-proposal' && p.id === `proposal-${key}`));
    send({ type: 'message_start', conversation_id: conversationId, message_id: holder?.id ?? crypto.randomUUID(), resumed: true });
    const shown = holder?.ui_parts?.find((p) => p.type === 'data-action-proposal' && p.id === `proposal-${key}`);
    if (!deps.tasks || !open || !task) {
      // The card is not waiting (answered, withdrawn, or never there): it is shown as stored and nothing is touched.
      if (shown) send({ type: 'proposal', part: proposalPart(key, shown.data) });
      const card = holder?.ui_parts?.find((p) => p.type.startsWith('tool-') && (p as { approval?: { id?: unknown } }).approval?.id === key) as { approval?: { approved?: unknown } } | undefined;
      // Drawn as waiting, but its turn could not be found this time (a read that failed for a moment): say so, and leave it waiting.
      const unread = Boolean(shown && card && typeof card.approval?.approved !== 'boolean');
      const verdict: ChatCardRevision = unread
        ? { key, accepted: false, kind: 'invalid', reason: 'That change could not be made just now. The card is as it was.' }
        : shown
          ? { key, accepted: false, kind: 'decided', reason: 'This card has already been answered, so it can no longer be changed.' }
          : { key, accepted: false, kind: 'gone', reason: 'This card can no longer be changed. Ask for it again.' };
      send({ type: 'part', part: revisionPart(verdict) });
      send({ type: 'done', status: unread ? 'awaiting_decision' : 'complete' });
      return;
    }
    const tool = deps.tools.find((t): t is TaskTool<unknown> => t.kind === 'task' && t.name === task.tool);
    const result = await reviseTask(deps.tasks, tool, { ...toolContext, reads }, key, input.edits, input.revision);
    const current = result.proposal ?? shown?.data;
    if (result.ok) {
      // The stored card is replaced in place, and the turn goes on waiting. If this save fails the ledger still holds the new plan:
      // a reload then shows the old card, and its Confirm is answered with the new one (its revision no longer matches).
      const parts = applyChatEvent({ id: open.row.id, role: 'assistant', parts: open.row.ui_parts ?? [] }, { type: 'proposal', part: proposalPart(key, result.proposal) }).parts;
      await saveCardState(sb, loaded.mode, open.row.id, parts, { stillWaiting: true }).catch((err) => {
        void logServerError(`chat/stream: revised card not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist' }, 'warning');
      });
    }
    if (current) send({ type: 'proposal', part: proposalPart(key, current) });
    send({ type: 'part', part: revisionPart(result.ok ? { key, accepted: true } : { key, accepted: false, kind: result.kind, reason: result.reason }) });
    // A card that turned out to be answered already is not waiting; every other outcome leaves it waiting.
    send({ type: 'done', status: !result.ok && (result.kind === 'decided' || result.kind === 'gone') ? 'complete' : 'awaiting_decision' });
    return;
  }

  // ── A decision on a waiting card, or on several at once ─────────────────────────────────────────────────────────
  if (input.kind === 'decision' || input.kind === 'approve_all') {
    const wantedKeys = input.kind === 'decision' ? [input.key] : input.cards.map((c) => c.key);
    // In the order proposed, whatever order the request lists them in.
    const wanted = open?.pending?.tasks.filter((t) => wantedKeys.includes(t.key)) ?? [];
    const task = wanted[0];
    if (!deps.tasks || !open || !open.pending || !task) {
      // Nothing listed is waiting any more: each card is answered with what is stored for it, and nothing is changed.
      if (input.kind === 'decision') await answerStaleDecision(deps, loaded, open, input.key, send);
      else await answerStaleBatch(deps, loaded, wantedKeys, send);
      return;
    }
    const pending: PendingDecision = open.pending;
    rowId = open.row.id;
    messageId = open.row.id;
    const before = open.row.ui_parts ?? [];
    ui = { id: open.row.id, role: 'assistant', parts: before };
    earlier = turnMetaOf(before);
    // This request's steps are numbered on from the turn's stored ones, and never take a stored step's id (which would replace it).
    state.seq = lastSeqOf(before);
    state.nextProgress = lastRowNumberOf(before);
    send({ type: 'message_start', conversation_id: conversationId, message_id: ui.id, resumed: true, started_at: startedAt });

    const toolFor = (name: string) => deps.tools.find((t): t is TaskTool<unknown> => t.kind === 'task' && t.name === name);
    const tool = toolFor(task.tool);
    const ctx: ToolContext = { ...toolContext, reads };
    // Whatever happens to the closing words, a turn whose card the coach has answered is stored as complete.
    const store = async (appended: ModelMessage[], stillPending: PendingDecision | null) => {
      stamp();
      if (!deps.store) return;
      try {
        const saved = await saveTurn(sb, loaded.mode, { id: rowId, conversation_id: conversationId, client_turn_id: open.row.client_turn_id, content: wordsOf(ui.parts), status: 'complete', ui_parts: ui.parts, model_messages: appended, pending: stillPending });
        if (saved.mode === 'legacy' && stillPending) await saveResumeToLedger(sb, coachId, { appended, pending: stillPending });
      } catch (err) {
        void logServerError(`chat/stream: decision not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist' });
      }
    };

    // What this request settled: each card's tool call gets its result. A card left waiting (or reopened) is not among them.
    const settled: Array<{ key: string; tool_use_id: string; outcome: DecisionOutcome }> = [];
    if (input.kind === 'approve_all') {
      const seen = new Map(input.cards.map((c) => [c.key, c.revision]));
      const batch = await startConfirmAll(deps.tasks, ctx, wanted.map((t) => ({ key: t.key, tool: toolFor(t.tool), seen: seen.get(t.key) })));
      if (batch.kind === 'changed') {
        // A card in the batch is not the one on the coach's screen. Nothing at all is confirmed.
        for (const card of batch.cards) {
          send({ type: 'proposal', part: proposalPart(card.key, card.proposal) });
          send({ type: 'part', part: revisionPart({ key: card.key, accepted: false, kind: 'changed', reason: 'This card was changed somewhere else. This is how it stands now. Nothing was confirmed.' }) });
        }
        send({ type: 'done', status: 'awaiting_decision' });
        return;
      }
      // At once, in the order proposed: each card that is going ahead says so, and a held one shows the shared Undo time.
      for (const card of batch.cards) {
        if (card.state === 'skipped') continue;
        emit({ type: 'decision', key: card.key, approved: true });
        if (card.state === 'held') emit({ type: 'receipt', part: receiptPart(card.key, card.receipt) });
      }
      if (batch.cards.some((c) => c.state === 'held' || c.state === 'queued')) await store(open.appended, pending);
      // The open request waits the window out and writes them in order. It does not stop if the browser goes away.
      for (const end of await batch.finish()) {
        if ('reopened' in end) {
          emit({ type: 'decision_reopened', key: end.key, reason: 'batch_stopped' });
          continue;
        }
        if (end.outcome.receipt) emit({ type: 'receipt', part: receiptPart(end.key, end.outcome.receipt) });
        const done = wanted.find((t) => t.key === end.key);
        if (done) settled.push({ key: end.key, tool_use_id: done.tool_use_id, outcome: end.outcome });
      }
    } else {
      let outcome: DecisionOutcome;
      if (!input.approved) {
        outcome = await declineTask(deps.tasks, ctx, task.key, 'declined');
        emit({ type: 'decision', key: task.key, approved: false });
      } else {
        const started = await startConfirm(deps.tasks, tool, ctx, task.key, input.revision);
        if (started.kind === 'changed') {
          // The card on the coach's screen is not the stored one (it was edited in another tab). Nothing is confirmed: they are shown
          // the card as it stands and can confirm that.
          send({ type: 'proposal', part: proposalPart(task.key, started.proposal) });
          send({ type: 'part', part: revisionPart({ key: task.key, accepted: false, kind: 'changed', reason: 'This card was changed somewhere else. This is how it stands now. Nothing was confirmed.' }) });
          send({ type: 'done', status: 'awaiting_decision' });
          return;
        }
        if (started.kind === 'in_flight') {
          // The request that confirmed first is still inside the Undo window (or writing). It owns the card, the model's closing words
          // and the stored row: this one shows what is stored and changes nothing, so the two can never write over each other.
          send({ type: 'decision', key: task.key, approved: true });
          const shown = before.find((p) => p.type === 'data-action-receipt' && p.id === `receipt-${task.key}`);
          if (shown) send({ type: 'receipt', part: receiptPart(task.key, shown.data) });
          send({ type: 'done', status: 'complete' });
          return;
        }
        emit({ type: 'decision', key: task.key, approved: true });
        if (started.kind === 'held') {
          // The coach sees "held, Undo until ..." at once, and it is stored at once: a reload during the window shows the same card.
          emit({ type: 'receipt', part: receiptPart(task.key, started.receipt) });
          await store(open.appended, pending);
          // The open request waits the window out and writes. It does not stop waiting if the browser goes away.
          outcome = await started.finish();
        } else {
          outcome = started.outcome;
        }
      }
      if (outcome.receipt) emit({ type: 'receipt', part: receiptPart(task.key, outcome.receipt) });
      settled.push({ key: task.key, tool_use_id: task.tool_use_id, outcome });
    }

    const next: PendingDecision = {
      ...pending,
      results: { ...pending.results, ...Object.fromEntries(settled.map((s) => [s.tool_use_id, { content: s.outcome.result, ...(s.outcome.isError ? { is_error: true } : {}) }])) },
      tasks: pending.tasks.filter((t) => !settled.some((s) => s.key === t.key)),
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
    state.container = pending.container ?? null;
    const stop = await runLoop(deps, toolContext, state, emit, signal);
    if (stop.kind === 'awaiting_decision') {
      await store(state.appended, stop.pending);
      await finish('awaiting_decision', stop.kind, null, { grounded: true, unmatched: [] }, before);
      return;
    }
    if (stop.kind === 'refusal') refusalCategory = stop.category;
    await store(state.appended, null);
    const error = stop.kind === 'error' ? stop.error : null;
    if (stop.kind !== 'complete') {
      void logServerError(`chat/stream: closing words after a decision did not arrive (${stop.kind})`, { action: 'v3.chat.stream.decision_tail', handled: true }, 'warning');
    }
    await finish('complete', stop.kind, error, ground(deps, ui, reads, ''), before);
    // After the closing words of a turn whose cards are all answered: what to do next, from the question that began the turn.
    if (stop.kind === 'complete') await suggest(loaded.rows.find((r) => r.role === 'user' && r.client_turn_id !== null && r.client_turn_id === open.row.client_turn_id)?.content ?? '');
    return;
  }

  // ── A new message ───────────────────────────────────────────────────────────────────────────────────────────────
  const question = input.text;
  // What the coach tapped, if anything: resolved against the reads this conversation has stored, and nothing else.
  const tapped = input.about === undefined ? undefined : aboutLine(reads, input.about);
  send({ type: 'message_start', conversation_id: conversationId, message_id: ui.id, resumed: false, started_at: startedAt, context: deps.screen ?? null, ...(tapped === undefined ? {} : { about: tapped?.about ?? null }) });
  for (const part of deps.preface ?? []) send({ type: 'part', part });

  // A card still waiting when the coach asks something else is a Cancel: the model is told so before the new question.
  const declined: ToolResultBlock[] = [];
  // The message before this one, if it holds cards: how each of them ended is sent again below.
  const lastRow = loaded.rows.filter((r) => r.role === 'assistant' && r.client_turn_id !== deps.clientTurnId).at(-1);
  let priorCards: { id: string; parts: readonly ChatUIPart[] } | null = lastRow ? { id: lastRow.id, parts: (lastRow.ui_parts ?? []) as ChatUIPart[] } : null;
  if (open && deps.tasks) {
    const ctx: ToolContext = { ...toolContext, reads };
    let cards: ChatUIMessage = { id: open.row.id, role: 'assistant', parts: open.row.ui_parts ?? [] };
    const results = { ...(open.pending?.results ?? {}) };
    const keys = [...new Set([...open.keys, ...(open.pending?.tasks.map((t) => t.key) ?? [])])];
    for (const key of keys) {
      const outcome = await settleAbandonedTask(deps.tasks, ctx, key);
      if (outcome.declined) {
        // Nobody pressed Cancel: the card was withdrawn because the coach asked something else. The browser is told which message
        // holds it, and the stored card says so too, so a reload draws "withdrawn" as a fact and not from its position.
        cards = applyChatEvent(cards, { type: 'decision', key, approved: false, reason: 'superseded' });
      } else if (outcome.receipt) cards = applyChatEvent(cards, { type: 'receipt', part: receiptPart(key, outcome.receipt) });
      const task = open.pending?.tasks.find((t) => t.key === key);
      if (task) results[task.tool_use_id] = { content: outcome.result, ...(outcome.isError ? { is_error: true } : {}) };
    }
    await saveCardState(sb, loaded.mode, open.row.id, cards.parts).catch((err) => {
      void logServerError(`chat/stream: declined card not stored: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'v3.chat.stream.persist' }, 'warning');
    });
    // Only where the asking tool call is itself in the replayed history does it need its results; a text replay has no call to answer.
    if (loaded.mode === 'columns' && open.pending && open.row.model_messages) {
      const answer = toolResultsMessage({ order: open.pending.order, results });
      declined.push(...(answer.content as ToolResultBlock[]));
    }
    priorCards = { id: open.row.id, parts: cards.parts };
  }
  // How the cards of the message before this one ended, addressed to that message. The browser usually knows. It does not when the
  // Confirm that settled a card lost its connection (the write went on without it), or when the card was withdrawn just now: these
  // few events bring that card up to date without a reload. They change nothing in a browser that already has them.
  if (priorCards) {
    for (const event of eventsForStoredParts(priorCards.parts)) {
      if (event.type === 'decision' || event.type === 'receipt') send({ ...event, message_id: priorCards.id });
    }
  }

  // A retry of a turn that failed replaces that attempt: its rows are not replayed and its assistant row is overwritten.
  rowId = loaded.rows.find((r) => r.role === 'assistant' && r.client_turn_id === deps.clientTurnId)?.id;
  // The coach's words are their own text block, after the result of any card they left: never inside a tool_result.
  const userMessage: ModelMessage = { role: 'user', content: declined.length > 0 ? [...declined, { type: 'text', text: input.text }] : input.text };
  const note = [deps.turnNote?.trim(), tapped?.line].filter(Boolean).join('\n');
  const asked: ModelMessage[] = note ? [userMessage, { role: 'system', content: note }] : [userMessage];
  state.messages = [...buildHistory(loaded, { withoutTurn: deps.clientTurnId }), ...asked];
  state.appended = [...asked];

  const stop = await runLoop(deps, toolContext, state, emit, signal);

  const store = async (status: 'complete' | 'failed', note: string | null, pending: PendingDecision | null, kind?: ChatErrorKind): Promise<boolean> => {
    stamp();
    if (!deps.store) return true;
    const failed = status === 'failed';
    try {
      const saved = await saveTurn(sb, loaded.mode, {
        id: rowId,
        conversation_id: conversationId,
        client_turn_id: deps.clientTurnId,
        content: failed ? '' : wordsOf(ui.parts),
        status,
        // `kind` lets a restored failed turn pick the same notice the live one showed. A turn the coach stopped has none.
        ui_parts: failed ? [...ui.parts, { type: 'data-turn-incomplete', id: 'turn-verdict', data: { note: note ?? STOPPED_NOTE, ...(kind ? { kind } : {}) } }] : ui.parts,
        // A failed turn leaves only the question behind: nothing half-finished is ever replayed to the model. Its system message is
        // left out too: one may only stand last or before an assistant message, and the next thing stored will be another question.
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
    if (!saved) fail(NOT_SAVED_NOTE, 'retry', 'lost');
    await finish('complete', stop.kind, null, ground(deps, ui, reads, question), []);
    if (saved) await suggest(question);
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
      fail(CARD_GONE_NOTE, 'none', 'card_gone');
      await finish('failed', stop.kind, null, { grounded: true, unmatched: [] }, []);
      return;
    }
    await finish('awaiting_decision', stop.kind, null, { grounded: true, unmatched: [] }, []);
    return;
  }

  if (stop.kind === 'refusal') {
    // The model declined. That is an answer, not a fault: the coach is told so in a sentence they can act on, the turn is stored
    // complete, and the sentence stands in the stored conversation as the reply (there is no content of the model's to keep).
    refusalCategory = stop.category;
    refused = true;
    emit({ type: 'text_delta', delta: REFUSAL_NOTE });
    const reply: ModelMessage = { role: 'assistant', content: [{ type: 'text', text: REFUSAL_NOTE }] };
    state.messages.push(reply);
    state.appended.push(reply);
    const saved = await store('complete', null, null);
    if (!saved) fail(NOT_SAVED_NOTE, 'retry', 'lost');
    await finish('complete', stop.kind, null, { grounded: true, unmatched: [] }, []);
    return;
  }

  const described: { message: string; action: ChatErrorAction; kind?: ChatErrorKind } =
    stop.kind === 'truncated'
      ? { message: TRUNCATED_NOTE, action: 'none', kind: 'truncated' }
      : stop.kind === 'aborted'
        ? { message: STOPPED_NOTE, action: 'retry' }
        : deps.describeError(stop.error);
  await store('failed', described.message, null, stop.kind === 'aborted' ? undefined : (described.kind ?? 'model'));
  if (stop.kind !== 'aborted') fail(described.message, described.action, described.kind ?? 'model');
  await finish(stop.kind === 'aborted' ? 'stopped' : 'failed', stop.kind, stop.kind === 'error' ? stop.error : null, { grounded: false, unmatched: [] }, []);
}

async function runLoop(deps: TurnDeps, toolContext: Omit<ToolContext, 'reads'>, state: LoopState, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<LoopStop> {
  let model: ModelClient;
  try {
    model = deps.model();
  } catch (err) {
    return { kind: 'error', error: err };
  }
  return runModelLoop({ model, system: deps.system, tools: deps.tools, toolContext, tasks: deps.tasks, maxSteps: deps.maxSteps, signal, emit }, state);
}

function ground(deps: TurnDeps, ui: ChatUIMessage, reads: ReadonlyMap<string, ToolEnvelope>, question: string): { grounded: boolean; unmatched: string[] } {
  try {
    return (deps.checkGrounding ?? defaultGroundingCheck)({ text: wordsOf(ui.parts), reads: [...reads.values()], question });
  } catch {
    return { grounded: false, unmatched: [] };
  }
}

/**
 * A decision for a card that is not waiting. Either it was already answered (a double press, a retry after a lost
 * response): the stored answer is sent again and nothing runs twice. Or its turn cannot be continued: the coach is told
 * plainly and the card is withdrawn.
 */
/** "Approve all" over cards none of which is waiting any more: each is answered with what is stored for it. Nothing is changed. */
async function answerStaleBatch(deps: TurnDeps, loaded: LoadedConversation, keys: string[], send: (event: ChatEvent) => void): Promise<void> {
  const holds = (key: string) => (p: ChatUIPart) => p.type.startsWith('tool-') && (p as { approval?: { id?: unknown } }).approval?.id === key;
  const row = [...loaded.rows].reverse().find((r) => r.role === 'assistant' && keys.some((key) => (r.ui_parts ?? []).some(holds(key))));
  send({ type: 'message_start', conversation_id: deps.toolContext.conversationId, message_id: row?.id ?? crypto.randomUUID(), resumed: true });
  for (const event of eventsForStoredParts(row?.ui_parts ?? [])) {
    if ((event.type === 'decision' && keys.includes(event.key)) || (event.type === 'receipt' && keys.some((key) => event.part.id === `receipt-${key}`))) send(event);
  }
  send({ type: 'done', status: 'complete' });
}

async function answerStaleDecision(deps: TurnDeps, loaded: LoadedConversation, open: OpenDecision | null, key: string, send: (event: ChatEvent) => void): Promise<void> {
  const conversationId = deps.toolContext.conversationId;
  const row = [...loaded.rows].reverse().find((r) => r.role === 'assistant' && (r.ui_parts ?? []).some((p) => p.type.startsWith('tool-') && (p as { approval?: { id?: unknown } }).approval?.id === key));
  send({ type: 'message_start', conversation_id: conversationId, message_id: row?.id ?? crypto.randomUUID(), resumed: true });
  const card = row?.ui_parts?.find((p) => p.type.startsWith('tool-') && (p as { approval?: { id?: unknown } }).approval?.id === key) as { approval?: { approved?: boolean; reason?: unknown } } | undefined;
  if (row && typeof card?.approval?.approved === 'boolean') {
    send({ type: 'decision', key, approved: card.approval.approved, ...(card.approval.reason === 'superseded' && !card.approval.approved ? { reason: 'superseded' as const } : {}) });
    const receipt = row.ui_parts?.find((p) => p.type === 'data-action-receipt' && p.id === `receipt-${key}`);
    if (receipt) send({ type: 'receipt', part: receiptPart(key, receipt.data) });
    send({ type: 'done', status: 'complete' });
    return;
  }
  // Still drawn as waiting, but its turn could not be found this time. Nothing is changed: a read that failed for a moment must not
  // cancel the coach's card. They can press again, or ask something else (which declines it).
  if (row && open && open.row.id === row.id) {
    send({ type: 'error', message: CARD_RETRY_NOTE, action: 'retry', kind: 'card_retry' });
    send({ type: 'done', status: 'awaiting_decision' });
    return;
  }
  send({ type: 'decision', key, approved: false });
  send({ type: 'error', message: CARD_GONE_NOTE, action: 'none', kind: 'card_gone' });
  send({ type: 'done', status: 'complete' });
}
