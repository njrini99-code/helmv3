/**
 * CoachHelm chat: the model loop.
 *
 * One turn is a few model calls. Each call streams; its words go to the coach as they are written. When the model asks
 * for tools, every read of that step runs at once and all the results go back in ONE user message. A task is never run
 * here: it is planned, recorded and shown as a card, and the loop returns `awaiting_decision` with everything the next
 * request needs to continue the same turn.
 *
 * The messages are append-only. An assistant message is stored exactly as the API returned it (thinking blocks, empty
 * or not, with their signatures; text with its citations; tool calls; a compaction block), in order. Nothing earlier is
 * ever edited, reordered or dropped. Reasoning is never sent to the browser.
 *
 * Grounding: a read goes back as a `search_result` block, one fact a line, with citations on. The API then attaches to
 * each sentence the read it drew on, and the loop appends that read's marker (` [e3]`) to the sentence as it streams:
 * the markers the thread already turns into evidence chips, now placed by the API instead of asked of the model.
 */
import { logServerError } from '@/lib/server-error-logger';
import { CoachContextError } from '../context';
import type { ToolEnvelope } from '../provenance';
import { addUsage, buildModelRequest, isModelApiError, isPlain, isRejectedRequest, plainFeatures, type ChatFeatures, type ModelClient, type ModelMessage, type ModelResponse, type SearchResultBlock, type SystemPrompt, type ToolResultBlock, type ToolUseBlock, type UsageTotals } from './model';
import { eventForPart, type ChatEvent } from './protocol';
import { proposeTask, type TaskDeps } from './tasks';
import type { ChatTool, ReadTool, TaskTool, ToolContext } from './tool';

/** A tool result as the model is given it: text, or the read as citable lines. */
export interface StoredToolResult {
  content: string | SearchResultBlock[];
  is_error?: boolean;
}

export interface PendingTask {
  key: string;
  tool: string;
  tool_use_id: string;
}

/**
 * A turn suspended on the coach. The assistant message that asked is already in the stored messages; this is the rest:
 * which of its tool calls already have a result (the reads that ran beside the task), and which wait for a decision.
 */
export interface PendingDecision {
  /** The assistant message's tool_use ids in block order: the order the results go back in. */
  order: string[];
  results: Record<string, StoredToolResult>;
  tasks: PendingTask[];
  /** Model calls the turn has used so far. */
  steps: number;
  /** The code execution container a call made from the model's code is waiting in, so the decision's request can name it. */
  container?: string | null;
}

export interface LoopState {
  /** The whole conversation, ending in a user message (or the system message that follows one). Appended in place. */
  messages: ModelMessage[];
  /** What this turn has added to the conversation, for the store. Same objects as in `messages`. */
  appended: ModelMessage[];
  steps: number;
  usage: UsageTotals;
  /** The conversation's reads by `evidence_ref`. The loop adds this turn's. */
  reads: Map<string, ToolEnvelope>;
  nextRef: number;
  nextProgress: number;
  /** What requests are sent with. Starts as the deployment's features; becomes the plain set if the API rejects a request. */
  features: ChatFeatures;
  /** True once a request was rejected and retried plain, for the turn's log line. */
  degraded: boolean;
  /** The code execution container of a programmatic call in progress. */
  container: string | null;
}

export interface LoopDeps {
  model: ModelClient;
  system: SystemPrompt;
  tools: readonly ChatTool[];
  /** The tool context without `reads` (the loop supplies the live map). */
  toolContext: Omit<ToolContext, 'reads'>;
  /** Null where tasks are not offered (the player's Ask): a task call is refused, not planned. */
  tasks: TaskDeps | null;
  maxSteps: number;
  signal: AbortSignal;
  emit: (event: ChatEvent) => void;
}

export type LoopStop =
  | { kind: 'complete'; truncated: boolean }
  | { kind: 'awaiting_decision'; pending: PendingDecision }
  /** The model declined (HTTP 200, `stop_reason: 'refusal'`). `category` is the API's, for the log; null when it gave none. */
  | { kind: 'refusal'; category: string | null }
  /** The model ran out of room in the middle of a tool call. Nothing of that call is run. */
  | { kind: 'truncated' }
  | { kind: 'aborted' }
  | { kind: 'error'; error: unknown };

const isToolUse = (block: ModelResponse['content'][number]): block is ToolUseBlock => block.type === 'tool_use';

/** A tool call made by the model's code in the sandbox, not by the model directly. Its result goes to the code. */
const isProgrammatic = (block: ToolUseBlock): boolean => Boolean(block.caller && block.caller.type !== 'direct');

const toolResultBlock = (id: string, result: StoredToolResult): ToolResultBlock => ({
  type: 'tool_result',
  tool_use_id: id,
  content: result.content,
  ...(result.is_error ? { is_error: true } : {}),
});

/** The user message that answers an assistant message's tool calls: every result, in call order, in one message, and nothing else. */
export function toolResultsMessage(pending: Pick<PendingDecision, 'order' | 'results'>): ModelMessage {
  return {
    role: 'user',
    content: pending.order.map((id) => toolResultBlock(id, pending.results[id] ?? { content: 'No result was produced for this call.', is_error: true })),
  };
}

const READ_SOURCE = 'read:';
const refOfSource = (source: unknown): string | null => (typeof source === 'string' && source.startsWith(READ_SOURCE) ? source.slice(READ_SOURCE.length) : null);

/** A read as the model cites it: the read's ref as the source, one fact a block (a block is the smallest thing a citation can point at). */
function searchResult(ref: string, title: string, text: string): SearchResultBlock[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [{ type: 'search_result', source: `${READ_SOURCE}${ref}`, title: title.trim().slice(0, 200) || 'Read', content: (lines.length > 0 ? lines : [title.trim() || 'No data.']).map((line) => ({ type: 'text', text: line })), citations: { enabled: true } }];
}

interface Call {
  response: ModelResponse;
  streamedText: boolean;
}

/** One streamed model call, with the features given. Only an unparseable tool input is retried here (twice). */
async function streamOnce(deps: LoopDeps, state: LoopState, answerOnly: boolean): Promise<Call> {
  const request = buildModelRequest({ tools: deps.tools, system: deps.system, messages: state.messages, features: state.features, answerOnly, container: state.container });
  for (let attempt = 0; ; attempt += 1) {
    let streamedText = false;
    // Per content block: the reads its sentences cite, and (only with progress notes on) the model's own note.
    const cited = new Map<number, string[]>();
    const notes = new Map<number, string>();
    let previousBlock: string | null = null;
    try {
      // The server's own word for the wait before the first event of a model call.
      deps.emit({ type: 'phase', phase: 'thinking' });
      const stream = deps.model.stream(request, { signal: deps.signal });
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          // Words either side of a thinking block or a tool call are separate paragraphs. Two text blocks in a row are one sentence the
          // API split where a citation begins or ends: nothing may be put between them.
          if (event.content_block.type === 'text' && streamedText && previousBlock !== 'text') deps.emit({ type: 'text_delta', delta: '\n\n' });
          previousBlock = event.content_block.type;
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta' && delta.text) {
            streamedText = true;
            deps.emit({ type: 'text_delta', delta: delta.text });
          } else if (delta.type === 'citations_delta') {
            const ref = refOfSource((delta.citation as { source?: unknown }).source);
            if (ref && state.reads.has(ref)) cited.set(event.index, [...new Set([...(cited.get(event.index) ?? []), ref])]);
          } else if (delta.type === 'thinking_delta' && state.features.progressNotes && delta.thinking) {
            // With `display: 'updates'` the only thinking text the API returns is the model's short note on what it is doing.
            notes.set(event.index, `${notes.get(event.index) ?? ''}${delta.thinking}`);
          }
        } else if (event.type === 'content_block_stop') {
          const refs = cited.get(event.index);
          if (refs?.length) deps.emit({ type: 'text_delta', delta: refs.map((ref) => ` [${ref}]`).join('') });
          const note = notes.get(event.index);
          if (note?.trim()) deps.emit({ type: 'note', id: `note-${(state.nextProgress += 1)}`, text: note });
        }
      }
      return { response: await stream.finalMessage(), streamedText };
    } catch (err) {
      if (deps.signal.aborted || isModelApiError(err) || isRejectedRequest(err) || attempt >= 2) {
        if (streamedText && !deps.signal.aborted) deps.emit({ type: 'text_discard' });
        throw err;
      }
      // The SDK could not parse a tool input at all. The call never completed, so there is nothing to answer: ask again.
      if (streamedText) deps.emit({ type: 'text_discard' });
    }
  }
}

/**
 * One model call. If the API rejects the request as malformed while it carries an optional feature (a beta it no
 * longer accepts, a schema `strict` does not take), the call is sent once more as a plain request and the rest of the
 * turn stays plain: the coach loses the feature, not the answer. The rejection is logged as an error to be fixed.
 */
async function callModel(deps: LoopDeps, state: LoopState, answerOnly: boolean): Promise<Call> {
  try {
    return await streamOnce(deps, state, answerOnly);
  } catch (err) {
    if (deps.signal.aborted || !isRejectedRequest(err) || isPlain(state.features)) throw err;
    void logServerError('chat/stream: the API rejected a request with optional features; retried as a plain request', { action: 'v3.chat.stream.degraded', feature: 'coachhelm_chat', handled: true, extra: { features: state.features, providerMessage: String((err as Error)?.message ?? '').slice(0, 300) } }, 'error');
    state.features = plainFeatures(state.features);
    state.degraded = true;
    return streamOnce(deps, state, answerOnly);
  }
}

const safeLabel = (tool: ChatTool, input: unknown): string => {
  try {
    return tool.progress(input) || 'Working';
  } catch {
    return 'Working';
  }
};

const invalidInput = (issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): StoredToolResult => ({
  is_error: true,
  content: `The input was not valid, so nothing was run. ${issues
    .slice(0, 6)
    .map((i) => `${i.path.map(String).join('.') || 'input'}: ${i.message}`)
    .join('; ')}. Call it again with a corrected input.`,
});

/** What a read covered, in a few words, when the tool does not say: its first measurement's sample ("10 rounds", "1 round"). */
function sampleDetail(envelope: ToolEnvelope): string | null {
  const m = envelope.measurements?.[0];
  if (!m || !m.sample_size || !m.sample_unit) return null;
  const unit = String(m.sample_unit);
  return `${m.sample_size.toLocaleString('en-US')} ${m.sample_size === 1 ? unit.replace(/s$/, '') : unit}`;
}

async function runRead(deps: LoopDeps, state: LoopState, tool: ReadTool<unknown>, input: unknown, progressId: string, refNumber: number, programmatic: boolean): Promise<{ result: StoredToolResult; endTurn: boolean }> {
  const label = safeLabel(tool, input);
  deps.emit({ type: 'read_started', id: progressId, label, tool: tool.name });
  try {
    // `model_text` stays on the envelope: the grounding check reads the lines the model was shown.
    const { parts, evidence, end_turn, progress_detail, progress_picture, ...envelope } = await tool.run({ ...deps.toolContext, reads: state.reads }, input);
    const isEvidence = evidence !== false;
    const ref = `e${refNumber}`;
    if (isEvidence) {
      state.reads.set(ref, envelope);
      deps.emit({ type: 'evidence', part: { type: 'data-evidence', id: `evidence-${ref}`, data: { tool: tool.name, envelope, ref } } });
    }
    for (const part of parts ?? []) deps.emit(eventForPart(part));
    const detail = (typeof progress_detail === 'string' && progress_detail.trim()) || sampleDetail(envelope);
    deps.emit({
      type: 'read_finished',
      id: progressId,
      label,
      tool: tool.name,
      state: envelope.coverage === 'unavailable' ? 'failed' : 'done',
      ...(detail ? { detail: detail.slice(0, 80) } : {}),
      ...(progress_picture === undefined || progress_picture === null ? {} : { picture: progress_picture }),
    });

    const lines = typeof envelope.model_text === 'string' && envelope.model_text.trim() ? envelope.model_text : null;
    let content: StoredToolResult['content'];
    if (!isEvidence) content = lines ?? JSON.stringify(envelope);
    // The model's code can only be handed text, and a read that failed has nothing to cite.
    else if (state.features.citations && !programmatic && envelope.coverage !== 'unavailable') content = searchResult(ref, envelope.summary || label, lines ?? JSON.stringify(envelope));
    else content = lines ? `[${ref}] ${lines}` : JSON.stringify({ ...envelope, evidence_ref: ref });
    return { result: { content }, endTurn: end_turn === true };
  } catch (err) {
    if (deps.signal.aborted) throw err;
    const expected = err instanceof CoachContextError;
    void logServerError(`coachhelm tool read failed: ${tool.name}`, { action: `coachhelm.tool.${tool.name}`, feature: 'coachhelm_chat', handled: true, skipSentry: expected }, 'warning');
    deps.emit({ type: 'read_finished', id: progressId, label, tool: tool.name, state: 'failed' });
    return { result: { is_error: true, content: expected ? (err as Error).message : 'That read could not be completed. Say so plainly; do not guess the figure.' }, endTurn: false };
  }
}

async function runTask(deps: LoopDeps, state: LoopState, tool: TaskTool<unknown>, input: unknown, block: ToolUseBlock, progressId: string): Promise<{ result: StoredToolResult | null; task: PendingTask | null }> {
  if (!deps.tasks) return { result: { is_error: true, content: 'Changes cannot be made from here. Nothing was written.' }, task: null };
  // A change is only ever asked for by the model itself, where it can be planned, shown and confirmed: never from its code.
  if (isProgrammatic(block)) return { result: { is_error: true, content: 'A change cannot be made from code. Ask for it directly, once, and the coach will be shown it to confirm. Nothing was written.' }, task: null };
  const label = safeLabel(tool, input);
  deps.emit({ type: 'read_started', id: progressId, label, tool: tool.name });
  const proposed = await proposeTask(deps.tasks, tool, { ...deps.toolContext, reads: state.reads }, input, block.id);
  if (!proposed.ok) {
    deps.emit({ type: 'read_finished', id: progressId, label, tool: tool.name, state: 'failed' });
    return { result: { is_error: true, content: `Not prepared: ${proposed.message}` }, task: null };
  }
  const key = proposed.proposal.idempotency_key;
  deps.emit({ type: 'proposal', part: { type: 'data-action-proposal', id: `proposal-${key}`, data: proposed.proposal } });
  deps.emit({ type: 'read_finished', id: progressId, label, tool: tool.name, state: 'done' });
  return { result: null, task: { key, tool: tool.name, tool_use_id: block.id } };
}

/**
 * Run the turn from where `state` stands until the model has answered, a card waits for the coach, or something stops it.
 * `state.messages` must end in a user message (the question, or the results of the tool calls that were pending) or in
 * the system message that follows the question.
 */
export async function runModelLoop(deps: LoopDeps, state: LoopState): Promise<LoopStop> {
  const byName = new Map(deps.tools.map((t) => [t.name, t]));
  for (;;) {
    if (deps.signal.aborted) return { kind: 'aborted' };
    // After the last allowed step the model gets one call with no tools, to say what it found.
    const answerOnly = state.steps >= deps.maxSteps;

    let response: ModelResponse;
    let streamedText: boolean;
    try {
      ({ response, streamedText } = await callModel(deps, state, answerOnly));
    } catch (err) {
      return deps.signal.aborted ? { kind: 'aborted' } : { kind: 'error', error: err };
    }
    state.steps += 1;
    addUsage(state.usage, response);
    if (response.container?.id) state.container = response.container.id;

    // A refusal can arrive after words were streamed and can cut a tool call off mid-input: the content is not read.
    if (response.stop_reason === 'refusal') {
      if (streamedText) deps.emit({ type: 'text_discard' });
      return { kind: 'refusal', category: (response.stop_details as { category?: string | null } | null | undefined)?.category ?? null };
    }

    const toolUses = response.content.filter(isToolUse);
    if (toolUses.length > 0 && response.stop_reason === 'max_tokens') return { kind: 'truncated' };

    // Exactly what the API returned, in order.
    const assistant: ModelMessage = { role: 'assistant', content: response.content };
    state.messages.push(assistant);
    state.appended.push(assistant);

    // The server paused its own work (a long run of the model's code, or a compaction): send the turn back and it goes on.
    if (toolUses.length === 0 && (response.stop_reason === 'pause_turn' || response.stop_reason === 'compaction') && !answerOnly) continue;
    if (toolUses.length === 0 || answerOnly) return { kind: 'complete', truncated: response.stop_reason === 'max_tokens' };

    // Ids are reserved in call order before anything runs, so parallel reads get the same refs whichever returns first.
    const jobs = toolUses.map((block) => {
      const tool = byName.get(block.name);
      const progressId = `progress-${(state.nextProgress += 1)}`;
      const refNumber = tool?.kind === 'read' ? (state.nextRef += 1) : 0;
      return { block, tool, progressId, refNumber };
    });
    const results: Record<string, StoredToolResult> = {};
    const tasks: PendingTask[] = [];
    let endTurn = false;
    try {
      await Promise.all(
        jobs.map(async ({ block, tool, progressId, refNumber }) => {
          if (!tool) {
            results[block.id] = { is_error: true, content: `There is no tool named ${block.name}.` };
            return;
          }
          // A truncated or loosely parsed input can still be valid JSON: nothing runs on input the schema does not accept.
          const parsed = tool.input.safeParse(block.input);
          if (!parsed.success) {
            results[block.id] = invalidInput(parsed.error.issues);
            return;
          }
          if (tool.kind === 'read') {
            const ran = await runRead(deps, state, tool, parsed.data, progressId, refNumber, isProgrammatic(block));
            results[block.id] = ran.result;
            if (ran.endTurn) endTurn = true;
            return;
          }
          const planned = await runTask(deps, state, tool, parsed.data, block, progressId);
          if (planned.result) results[block.id] = planned.result;
          if (planned.task) tasks.push(planned.task);
        }),
      );
    } catch (err) {
      return deps.signal.aborted ? { kind: 'aborted' } : { kind: 'error', error: err };
    }

    const order = toolUses.map((b) => b.id);
    if (tasks.length > 0) {
      tasks.sort((a, b) => order.indexOf(a.tool_use_id) - order.indexOf(b.tool_use_id));
      for (const task of tasks) deps.emit({ type: 'decision_needed', key: task.key, tool: task.tool, tool_use_id: task.tool_use_id });
      return { kind: 'awaiting_decision', pending: { order, results, tasks, steps: state.steps, ...(state.container ? { container: state.container } : {}) } };
    }

    const answer = toolResultsMessage({ order, results });
    state.messages.push(answer);
    state.appended.push(answer);
    // A call made by the model's code is waiting on these results: the turn cannot end before the code has them.
    if (endTurn && !toolUses.some(isProgrammatic)) return { kind: 'complete', truncated: false };
  }
}
