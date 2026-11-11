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
import { addUsage, buildModelRequest, isModelApiError, isPlain, isRejectedRequest, plainFeatures, type ChatFeatures, type ModelClient, type ModelMessage, type ModelProfile, type ModelResponse, type SearchResultBlock, type SystemPrompt, type ToolResultBlock, type ToolUseBlock, type UsageTotals } from './model';
import { partialInput } from './draft';
import { COMPUTED_PART, eventForPart, type ChatComputed, type ChatEvent } from './protocol';
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
  /** The model this turn runs on and its settings. Fixed for the turn. */
  profile: ModelProfile;
  features: ChatFeatures;
  /** True once a request was rejected and retried plain, for the turn's log line. */
  degraded: boolean;
  /** The code execution container of a programmatic call in progress. */
  container: string | null;
  /** The progress row of the model's code while it runs. In memory only. */
  codeRow?: string | null;
  /** What that run of the code has done so far: the reads it called, and the method line its code began with. In memory only. */
  codeRun?: { refs: string[]; method: string | null; wide: boolean } | null;
  /** Tool calls whose input is being shown as a draft and has not been settled yet, by tool_use id. In memory only. */
  drafts?: Set<string>;
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

/** The text of a progress block that stands in for work a cut-off response did not finish: not a note for the coach. */
const INTERRUPTED_NOTE = 'This part of the response was interrupted before it finished.';

/**
 * The one case where an assistant turn is not kept exactly as returned. When a refusal fallback took over part-way, the
 * turn holds a `fallback` block, and the API requires that what the model that declined left before the LAST such block
 * is not sent back: its thinking, its tool calls (which are never run and get no result) and any server tool call
 * without its result. Text before the boundary, everything after it and the marker itself are kept. A turn with no
 * `fallback` block is returned untouched.
 */
export function echoable(content: ModelResponse['content']): ModelResponse['content'] {
  const boundary = content.map((b) => b.type as string).lastIndexOf('fallback');
  if (boundary === -1) return content;
  const answered = new Set(content.flatMap((b) => (typeof (b as { tool_use_id?: unknown }).tool_use_id === 'string' ? [(b as { tool_use_id: string }).tool_use_id] : [])));
  return content.filter((block, index) => {
    if (index >= boundary) return true;
    const type = block.type as string;
    if (type === 'thinking' || type === 'redacted_thinking' || type === 'tool_use') return false;
    if (type === 'server_tool_use') return answered.has((block as { id: string }).id);
    return true;
  });
}

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

/** The model's code, as the thread names it: arithmetic on figures already read, or reads across more than one player. */
const CODE_LABEL = 'Working out the figures';
const CODE_LABEL_WIDE = 'Working it out across the team';

/** The players a set of reads measured, by id. */
function playersOf(envelopes: ToolEnvelope[]): Set<string> {
  const ids = new Set<string>();
  for (const envelope of envelopes) {
    for (const m of [...(envelope.measurements ?? []), ...(envelope.series ?? [])]) if (m.entity?.kind === 'player') ids.add(m.entity.id);
  }
  return ids;
}

/**
 * The sentence the model's code may begin with, `# Method: ...`: how it works the figure out, for the coach. Only that marked line
 * is ever lifted, and not when it names a tool or anything that reads as code: the coach never sees code or a tool name.
 */
export function methodOf(code: unknown, toolNames: readonly string[]): string | null {
  if (typeof code !== 'string') return null;
  const line = /^\s*#\s*Method:\s*(.+)$/im.exec(code)?.[1]?.trim();
  if (!line || line.length > 240) return null;
  if (/[`_{}()[\]=<>]/.test(line) || toolNames.some((name) => line.toLowerCase().includes(name.toLowerCase()))) return null;
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** What one finished run of the model's code covered: the `data-computed` part's data. */
export function computedOf(run: { refs: string[]; method: string | null }, reads: Map<string, ToolEnvelope>): ChatComputed {
  const envelopes = run.refs.map((ref) => reads.get(ref)).filter((e): e is ToolEnvelope => Boolean(e));
  const windows = new Set(envelopes.map((e) => e.window_label?.trim() || null));
  const [only] = [...windows];
  // Reads run side by side and finish in any order; their refs were reserved in the order the code asked for them.
  const refs = [...run.refs].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return { refs, reads: run.refs.length, players: playersOf(envelopes).size, window: windows.size === 1 && only ? only : null, ...(run.method ? { method: run.method } : {}) };
}

interface Call {
  response: ModelResponse;
  streamedText: boolean;
}

/** How often a draft is read from the input so far and shown, at most. */
export const DRAFT_INTERVAL_MS = 150;

/** A draft is over: accepted (what it became follows) or not. Says so once, and only for a draft that was shown. */
function endDraft(deps: LoopDeps, state: LoopState, id: string, ok: boolean): void {
  if (!state.drafts?.delete(id)) return;
  deps.emit({ type: 'draft_done', id, state: ok ? 'done' : 'failed' });
}
function endDrafts(deps: LoopDeps, state: LoopState, ok: boolean, keep: ReadonlySet<string> = new Set()): void {
  for (const id of [...(state.drafts ?? [])]) if (!keep.has(id)) endDraft(deps, state, id, ok);
}

/** One streamed model call, with the features given. Only an unparseable tool input is retried here (twice). */
async function streamOnce(deps: LoopDeps, state: LoopState, answerOnly: boolean): Promise<Call> {
  const request = buildModelRequest({ tools: deps.tools, system: deps.system, messages: state.messages, profile: state.profile, features: state.features, answerOnly, container: state.container });
  for (let attempt = 0; ; attempt += 1) {
    let streamedText = false;
    // Per content block: the reads its sentences cite, and (only with progress notes on) the model's own note.
    const cited = new Map<number, string[]>();
    const notes = new Map<number, string>();
    let previousBlock: string | null = null;
    let continues = false;
    // The model's code as it is written, only to read the method line it may begin with.
    let codeBlock: number | null = null;
    let codeInput = '';
    // Tool calls whose input is a draft, by content block: the input so far, when it was last shown, and what was shown.
    const drafting = new Map<number, { id: string; tool: string; fields: readonly string[]; json: string; at: number; shown: Record<string, string> }>();
    const showDraft = (index: number, last: boolean) => {
      const draft = drafting.get(index);
      if (!draft || (!last && Date.now() - draft.at < DRAFT_INTERVAL_MS)) return;
      draft.at = Date.now();
      const { fields, open } = partialInput(draft.json, draft.fields);
      const changed: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(fields)) {
        const text = JSON.stringify(value);
        // Only ever more of a field than was shown before: a piece that momentarily reads as less is passed over.
        if (text === draft.shown[name] || text.length < (draft.shown[name]?.length ?? 0)) continue;
        draft.shown[name] = text;
        changed[name] = value;
      }
      if (Object.keys(changed).length === 0) return;
      (state.drafts ??= new Set()).add(draft.id);
      deps.emit({ type: 'draft_delta', id: draft.id, tool: draft.tool, fields: changed, open: last ? null : open });
    };
    try {
      // The server's own word for the wait before the first event of a model call.
      deps.emit({ type: 'phase', phase: 'thinking' });
      const stream = deps.model.stream(request, { signal: deps.signal });
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          // The model's own code, in Anthropic's sandbox: one progress row from the moment it starts until its result is back, with the
          // reads it calls listed under it as they run.
          const block = event.content_block as { type: string; name?: string };
          if (block.type === 'server_tool_use' && String(block.name ?? '').endsWith('code_execution')) {
            codeBlock = event.index;
            codeInput = '';
            if (!state.codeRow) {
              state.codeRow = `progress-${(state.nextProgress += 1)}`;
              state.codeRun = { refs: [], method: null, wide: false };
              deps.emit({ type: 'read_started', id: state.codeRow, label: CODE_LABEL, tool: 'code_execution' });
            }
          } else if (block.type.endsWith('code_execution_tool_result') && state.codeRow) {
            // The run is over: its row closes saying how many reads it covered, and a part records what it worked from.
            const computed = computedOf(state.codeRun ?? { refs: [], method: null }, state.reads);
            deps.emit({
              type: 'read_finished',
              id: state.codeRow,
              label: state.codeRun?.wide ? CODE_LABEL_WIDE : CODE_LABEL,
              tool: 'code_execution',
              state: 'done',
              ...(computed.reads > 0 ? { detail: `${computed.reads} ${computed.reads === 1 ? 'read' : 'reads'}` } : {}),
            });
            deps.emit({ type: 'part', part: { type: COMPUTED_PART, id: `computed-${state.codeRow}`, data: computed } });
            state.codeRow = null;
            state.codeRun = null;
          }
          // A tool whose input is a draft: what the model writes is shown as it is written (never from its code, which writes none).
          if (block.type === 'tool_use') {
            const use = event.content_block as { id: string; name: string; caller?: { type?: string } };
            const tool = deps.tools.find((t) => t.name === use.name);
            if (tool?.draft?.fields.length && (!use.caller || use.caller.type === 'direct')) drafting.set(event.index, { id: use.id, tool: tool.name, fields: tool.draft.fields, json: '', at: 0, shown: {} });
          }
          // Words either side of a thinking block or a tool call are separate paragraphs. Two text blocks in a row are one sentence the
          // API split where a citation begins or ends: nothing may be put between them.
          // A refusal fallback's marker: the substitute's next words continue the sentence the first model began, whatever the model
          // that declined left between (its thinking, a tool call that is never run).
          if ((event.content_block.type as string) === 'fallback') continues = true;
          else if (event.content_block.type === 'text') {
            if (streamedText && previousBlock !== 'text' && !continues) deps.emit({ type: 'text_delta', delta: '\n\n' });
            continues = false;
          }
          if ((event.content_block.type as string) !== 'fallback') previousBlock = event.content_block.type;
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if (delta.type === 'text_delta' && delta.text) {
            streamedText = true;
            deps.emit({ type: 'text_delta', delta: delta.text });
          } else if (delta.type === 'citations_delta') {
            const ref = refOfSource((delta.citation as { source?: unknown }).source);
            if (ref && state.reads.has(ref)) cited.set(event.index, [...new Set([...(cited.get(event.index) ?? []), ref])]);
          } else if (delta.type === 'input_json_delta' && event.index === codeBlock) {
            codeInput += delta.partial_json;
          } else if (delta.type === 'input_json_delta' && drafting.has(event.index)) {
            drafting.get(event.index)!.json += delta.partial_json;
            showDraft(event.index, false);
          } else if (delta.type === 'thinking_delta' && state.features.progressNotes && delta.thinking) {
            // With `display: 'updates'` the only thinking text the API returns is the model's short note on what it is doing.
            notes.set(event.index, `${notes.get(event.index) ?? ''}${delta.thinking}`);
          }
        } else if (event.type === 'content_block_stop') {
          if (event.index === codeBlock && state.codeRun) {
            try {
              state.codeRun.method = methodOf((JSON.parse(codeInput || '{}') as { code?: unknown }).code, deps.tools.map((t) => t.name));
            } catch {
              // No method line can be read from input that did not parse; the run is unaffected.
            }
            codeBlock = null;
          }
          // The input is complete: the draft is shown whole (it is checked and planned once the model's message has ended).
          showDraft(event.index, true);
          const refs = cited.get(event.index);
          if (refs?.length) deps.emit({ type: 'text_delta', delta: refs.map((ref) => ` [${ref}]`).join('') });
          const note = notes.get(event.index);
          if (note?.trim() && note.trim() !== INTERRUPTED_NOTE) deps.emit({ type: 'note', id: `note-${(state.nextProgress += 1)}`, text: note });
        }
      }
      return { response: await stream.finalMessage(), streamedText };
    } catch (err) {
      // Whatever was being drafted in this call never became anything.
      endDrafts(deps, state, false);
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
      // `via: 'code'`: the model's code asked for this read. Its answer then cites no read, so this is how the thread knows which
      // reads a computed figure came from.
      deps.emit({ type: 'evidence', part: { type: 'data-evidence', id: `evidence-${ref}`, data: { tool: tool.name, envelope, ref, ...(programmatic ? { via: 'code' } : {}) } } });
      if (programmatic && state.codeRun && state.codeRow) {
        state.codeRun.refs.push(ref);
        // Once its reads cover a second player the row says so. Said once, and only because a read showed it.
        if (!state.codeRun.wide && playersOf(state.codeRun.refs.map((r) => state.reads.get(r)).filter((e): e is ToolEnvelope => Boolean(e))).size > 1) {
          state.codeRun.wide = true;
          deps.emit({ type: 'read_started', id: state.codeRow, label: CODE_LABEL_WIDE, tool: 'code_execution' });
        }
      }
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

async function runTask(deps: LoopDeps, state: LoopState, tool: TaskTool<unknown>, input: unknown, block: ToolUseBlock, progressId: string, codeWaiting: boolean): Promise<{ result: StoredToolResult | null; task: PendingTask | null }> {
  if (!deps.tasks) return { result: { is_error: true, content: 'Changes cannot be made from here. Nothing was written.' }, task: null };
  // A change is only ever asked for by the model itself, where it can be planned, shown and confirmed: never from its code.
  if (isProgrammatic(block)) return { result: { is_error: true, content: 'A change cannot be made from code. Ask for it directly, once, and the coach will be shown it to confirm. Nothing was written.' }, task: null };
  // A card cannot wait on the coach while the model's code waits on a read: the code would be left hanging for as long as the coach takes.
  if (codeWaiting) return { result: { is_error: true, content: 'Not prepared: your code is still running. Ask for this change on its own after the code has finished. Nothing was written.' }, task: null };
  const label = safeLabel(tool, input);
  deps.emit({ type: 'read_started', id: progressId, label, tool: tool.name });
  const proposed = await proposeTask(deps.tasks, tool, { ...deps.toolContext, reads: state.reads }, input, block.id);
  if (!proposed.ok) {
    deps.emit({ type: 'read_finished', id: progressId, label, tool: tool.name, state: 'failed' });
    return { result: { is_error: true, content: `Not prepared: ${proposed.message}` }, task: null };
  }
  const key = proposed.proposal.idempotency_key;
  // The draft gives way to the card it became.
  endDraft(deps, state, block.id, true);
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
    addUsage(state.usage, response, state.profile.modelId);
    if (response.container?.id) state.container = response.container.id;

    // A refusal can arrive after words were streamed and can cut a tool call off mid-input: the content is not read.
    if (response.stop_reason === 'refusal') {
      endDrafts(deps, state, false);
      if (streamedText) deps.emit({ type: 'text_discard' });
      return { kind: 'refusal', category: (response.stop_details as { category?: string | null } | null | undefined)?.category ?? null };
    }

    // What is kept of the turn, and so which tool calls are answered: everything, unless a refusal fallback took over part-way.
    const content = echoable(response.content);
    const toolUses = content.filter(isToolUse);
    // A draft whose tool call is not kept (cut off at the length limit, or left behind by a fallback) became nothing.
    const cutOff = toolUses.length > 0 && response.stop_reason === 'max_tokens';
    endDrafts(deps, state, false, cutOff ? undefined : new Set(toolUses.map((b) => b.id)));
    if (cutOff) return { kind: 'truncated' };

    // Exactly what the API returned, in order.
    const assistant: ModelMessage = { role: 'assistant', content };
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
    const codeWaiting = toolUses.some(isProgrammatic);
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
            // A draft the coach watched being written, and the schema does not accept: it ends as failed, in front of them.
            endDraft(deps, state, block.id, false);
            results[block.id] = invalidInput(parsed.error.issues);
            return;
          }
          if (tool.kind === 'read') {
            if (tool.direct_only && isProgrammatic(block)) {
              results[block.id] = { is_error: true, content: 'This cannot be called from code. Call it directly. Nothing was changed.' };
              return;
            }
            const ran = await runRead(deps, state, tool, parsed.data, progressId, refNumber, isProgrammatic(block));
            endDraft(deps, state, block.id, !ran.result.is_error);
            results[block.id] = ran.result;
            if (ran.endTurn) endTurn = true;
            return;
          }
          const planned = await runTask(deps, state, tool, parsed.data, block, progressId, codeWaiting);
          // (An accepted draft is ended inside `runTask`, just before its card.) One that could not be planned failed.
          endDraft(deps, state, block.id, false);
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
