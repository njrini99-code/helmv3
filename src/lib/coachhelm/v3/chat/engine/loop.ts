/**
 * CoachHelm chat: the model loop.
 *
 * One turn is a few model calls. Each call streams; its words go to the coach as they are written. When the model asks
 * for tools, every read of that step runs at once and all the results go back in ONE user message. A task is never run
 * here: it is planned, recorded and shown as a card, and the loop returns `awaiting_decision` with everything the next
 * request needs to continue the same turn.
 *
 * The messages are append-only. An assistant message is stored exactly as the API returned it (thinking blocks and
 * their signatures included, in order); nothing earlier is ever edited, reordered or dropped. Thinking is never sent
 * to the browser: only `text_delta` leaves this file.
 */
import { logServerError } from '@/lib/server-error-logger';
import { CoachContextError } from '../context';
import type { ToolEnvelope } from '../provenance';
import { addUsage, buildModelRequest, isModelApiError, type ModelClient, type ModelMessage, type ModelResponse, type ModelTool, type SystemPrompt, type ToolResultBlock, type ToolUseBlock, type UsageTotals } from './model';
import { eventForPart, type ChatEvent } from './protocol';
import { proposeTask, type TaskDeps } from './tasks';
import type { ChatTool, ReadTool, TaskTool, ToolContext } from './tool';

/** A tool result as the model is given it. */
export interface StoredToolResult {
  content: string;
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
}

export interface LoopState {
  /** The whole conversation, ending in a user message. Appended in place. */
  messages: ModelMessage[];
  /** What this turn has added to the conversation, for the store. Same objects as in `messages`. */
  appended: ModelMessage[];
  steps: number;
  usage: UsageTotals;
  /** The conversation's reads by `evidence_ref`. The loop adds this turn's. */
  reads: Map<string, ToolEnvelope>;
  nextRef: number;
  nextProgress: number;
}

export interface LoopDeps {
  model: ModelClient;
  system: SystemPrompt;
  tools: readonly ChatTool[];
  modelTools: readonly ModelTool[];
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
  | { kind: 'refusal' }
  /** The model ran out of room in the middle of a tool call. Nothing of that call is run. */
  | { kind: 'truncated' }
  | { kind: 'aborted' }
  | { kind: 'error'; error: unknown };

const isToolUse = (block: ModelResponse['content'][number]): block is ToolUseBlock => block.type === 'tool_use';

const toolResultBlock = (id: string, result: StoredToolResult): ToolResultBlock => ({
  type: 'tool_result',
  tool_use_id: id,
  content: result.content,
  ...(result.is_error ? { is_error: true } : {}),
});

/** The user message that answers an assistant message's tool calls: every result, in call order, in one message. */
export function toolResultsMessage(pending: Pick<PendingDecision, 'order' | 'results'>): ModelMessage {
  return {
    role: 'user',
    content: pending.order.map((id) => toolResultBlock(id, pending.results[id] ?? { content: 'No result was produced for this call.', is_error: true })),
  };
}

/** One streamed model call. Only an unparseable tool input is retried (twice); an API error or an abort is thrown. */
async function callModel(deps: LoopDeps, state: LoopState, answerOnly: boolean): Promise<{ response: ModelResponse; streamedText: boolean }> {
  const request = buildModelRequest({ tools: deps.modelTools, system: deps.system, messages: state.messages, answerOnly });
  for (let attempt = 0; ; attempt += 1) {
    let streamedText = false;
    try {
      const stream = deps.model.stream(request, { signal: deps.signal });
      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'text' && streamedText) {
          deps.emit({ type: 'text_delta', delta: '\n\n' });
        }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
          streamedText = true;
          deps.emit({ type: 'text_delta', delta: event.delta.text });
        }
      }
      return { response: await stream.finalMessage(), streamedText };
    } catch (err) {
      if (deps.signal.aborted || isModelApiError(err) || attempt >= 2) throw err;
      // The SDK could not parse a tool input at all. The call never completed, so there is nothing to answer: ask again.
      if (streamedText) deps.emit({ type: 'text_discard' });
    }
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

async function runRead(deps: LoopDeps, state: LoopState, tool: ReadTool<unknown>, input: unknown, progressId: string, refNumber: number): Promise<{ result: StoredToolResult; endTurn: boolean }> {
  const label = safeLabel(tool, input);
  deps.emit({ type: 'read_started', id: progressId, label, tool: tool.name });
  try {
    const { parts, evidence, end_turn, ...envelope } = await tool.run({ ...deps.toolContext, reads: state.reads }, input);
    const isEvidence = evidence !== false;
    const ref = `e${refNumber}`;
    if (isEvidence) {
      state.reads.set(ref, envelope);
      deps.emit({ type: 'evidence', part: { type: 'data-evidence', id: `evidence-${ref}`, data: { tool: tool.name, envelope, ref } } });
    }
    for (const part of parts ?? []) deps.emit(eventForPart(part));
    deps.emit({ type: 'read_finished', id: progressId, label, tool: tool.name, state: envelope.coverage === 'unavailable' ? 'failed' : 'done' });
    return { result: { content: JSON.stringify(isEvidence ? { ...envelope, evidence_ref: ref } : envelope) }, endTurn: end_turn === true };
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
 * `state.messages` must end in a user message (the question, or the results of the tool calls that were pending).
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
    addUsage(state.usage, response.usage);

    // A refusal can arrive after words were streamed and can cut a tool call off mid-input: the content is not read.
    if (response.stop_reason === 'refusal') {
      if (streamedText) deps.emit({ type: 'text_discard' });
      return { kind: 'refusal' };
    }

    const toolUses = response.content.filter(isToolUse);
    if (toolUses.length > 0 && response.stop_reason === 'max_tokens') return { kind: 'truncated' };

    // Exactly what the API returned, in order: thinking blocks with their signatures, text, tool calls.
    const assistant: ModelMessage = { role: 'assistant', content: response.content };
    state.messages.push(assistant);
    state.appended.push(assistant);
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
            const ran = await runRead(deps, state, tool, parsed.data, progressId, refNumber);
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
      return { kind: 'awaiting_decision', pending: { order, results, tasks, steps: state.steps } };
    }

    const answer = toolResultsMessage({ order, results });
    state.messages.push(answer);
    state.appended.push(answer);
    if (endTurn) return { kind: 'complete', truncated: false };
  }
}
