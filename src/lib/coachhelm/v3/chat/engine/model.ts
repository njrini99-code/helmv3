/**
 * CoachHelm chat: the one place that talks to Anthropic's SDK.
 *
 * Everything else in the engine sees a `ModelClient` (one method, `stream`), so the tests run the whole turn against a
 * scripted model and no code outside this file builds a request.
 *
 * The model is Claude Haiku 5.5 at effort `high` (owner, 10 Nov 2026). What that binds, from Anthropic's migration
 * guide and checked against the installed SDK's types:
 *   - thinking is adaptive and on by default; there is no budget and no sampling parameter to send. Depth is
 *     `output_config.effort`, whose default on this model is `medium`, so `high` is sent on every request.
 *   - a thinking block is valid only while `system`, `tools` and every earlier message are unchanged. So nothing that
 *     changes during a conversation's life is in `system` or `tools` (the date, the screen and the coach's notes go in
 *     a `role: 'system'` message after the user's message, stored with the turn), the stored messages are replayed
 *     exactly as returned, and `drop_block` makes the API drop a block it can no longer verify (after a deploy that
 *     changed the prompt or a tool) instead of failing the coach's question.
 *   - a refusal is an HTTP 200 with `stop_reason: 'refusal'`. There is NO server-side fallback on this model:
 *     `fallbacks` is never sent.
 *   - two rate cards: a prompt over 100K tokens costs five times as much per token.
 *
 * Every optional feature is one field of `CHAT_FEATURES`. Turn it off there and the request no longer carries it; if
 * the API ever rejects a request that carries one, the loop retries that call once as a plain request (see `loop.ts`),
 * so a beta the API stops accepting costs the coach nothing but the feature.
 */
import Anthropic from '@anthropic-ai/sdk';
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';
import { z } from 'zod';
import { MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import type { ChatTool } from './tool';

export type ModelMessage = Anthropic.Beta.BetaMessageParam;
export type ModelResponse = Anthropic.Beta.BetaMessage;
export type ModelStreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent;
export type ModelRequest = Parameters<Anthropic['beta']['messages']['stream']>[0];
export type ModelTool = Anthropic.Beta.BetaTool;
export type ToolResultBlock = Anthropic.Beta.BetaToolResultBlockParam;
export type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
export type SearchResultBlock = Anthropic.Beta.BetaSearchResultBlockParam;

/** One streamed model call: iterate it for the events, then read the complete message. */
export interface ModelStream extends AsyncIterable<ModelStreamEvent> {
  finalMessage(): Promise<ModelResponse>;
}

export interface ModelClient {
  stream(request: ModelRequest, options: { signal: AbortSignal }): ModelStream;
}

/** The ledger and budget key (gateway-style id, as every cost table in the repo is keyed). */
export const CHAT_MODEL_LEDGER_ID = MODEL_FOR_TASK.coach_chat;
/** The id the API takes: the same model, prefix stripped. */
export const CHAT_MODEL_ID = CHAT_MODEL_LEDGER_ID.replace(/^anthropic\//, '');

/** How hard the model thinks. One constant. Not `xhigh` or `max`: this model writes empty replies and thinks far longer there. */
export const CHAT_EFFORT: 'low' | 'medium' | 'high' = 'high';
/** Per response, thinking included. */
export const CHAT_MAX_TOKENS = 16_000;
/** Model calls in one turn before it must answer with what it has (one more call, with no tools, follows the last). */
export const CHAT_MAX_STEPS = 12;
export const PLAYER_MAX_STEPS = 8;

export interface ChatFeatures {
  /**
   * `thinking.block_binding.prefix_mismatch_behavior: 'drop_block'` (beta `thinking-binding-controls-2026-08-01`): a
   * stored thinking block the API can no longer verify is dropped, not a 400. Confirmed in the SDK types and the guide.
   */
  dropStaleThinking: boolean;
  /** `strict: true` on each tool, so the model's input matches the schema exactly. Stable; no beta. */
  strictTools: boolean;
  /**
   * A read goes back to the model as a `search_result` block with citations on (stable, no beta; this model is listed
   * in the feature's own docs). The API then says which read each sentence drew on, and the engine turns that into the
   * read markers the thread already draws. Off: reads go back as text and nothing marks them.
   */
  citations: boolean;
  /** Server-side compaction at the default trigger (beta `compact-2026-01-12`): a very long conversation never fails for its length. */
  compaction: boolean;
  /**
   * `output_config.task_budget` (beta `task-budgets-2026-03-13`, minimum 20,000). Null: not sent. It is null because
   * the guide says not to set a value that has not been measured on the workload, and whether its countdown runs over
   * one turn or the whole stored conversation is not stated in the reference: the eval sets it.
   */
  taskBudgetTokens: number | null;
  /**
   * `thinking.display: 'updates'` (beta `thinking-display-updates-2026-08-18`): the model's own short notes between
   * tool calls, shown as progress rows. Off: the reference's availability table does not list Claude Haiku 5.5 for it.
   */
  progressNotes: boolean;
  /**
   * Programmatic tool calling: the model writes code that calls the READ tools in Anthropic's sandbox and only the
   * result of the code reaches it. Stable on this model. Off by default, for the eval to compare. With it on the read
   * tools are not `strict` (the two cannot be combined) and tool results pass through a code execution container that
   * Anthropic retains for up to 30 days, which matters for a team of minors: see CONTRACT_NOTES.md before turning it on.
   */
  programmaticReads: boolean;
}

export const CHAT_FEATURES: ChatFeatures = {
  dropStaleThinking: true,
  strictTools: true,
  citations: true,
  compaction: true,
  taskBudgetTokens: null,
  progressNotes: false,
  programmaticReads: false,
};

/** The features a request is sent with. A function so the route has one thing to call and a test one thing to replace. */
export const chatFeatures = (): ChatFeatures => CHAT_FEATURES;

/** The same request without anything the API could refuse as unknown: no beta, no strict schema. What a rejected request is retried as. */
export const plainFeatures = (features: ChatFeatures): ChatFeatures => ({
  ...features,
  dropStaleThinking: false,
  strictTools: false,
  compaction: false,
  taskBudgetTokens: null,
  progressNotes: false,
});

export const isPlain = (f: ChatFeatures): boolean => !f.dropStaleThinking && !f.strictTools && !f.compaction && f.taskBudgetTokens === null && !f.progressNotes;

const CODE_EXECUTION = 'code_execution_20260120' as const;

export class MissingModelKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set');
    this.name = 'MissingModelKeyError';
  }
}

/**
 * The production model client. Chat calls Anthropic directly with the app's key; there is no gateway fallback, so a
 * missing key is a configuration fault the route reports plainly instead of a silent reroute. One key for chat also
 * means every stored thinking block is replayed through the account that produced it, which this model requires.
 */
export function anthropicModelClient(): ModelClient {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new MissingModelKeyError();
  // The loop retries nothing but a rejected feature and an unparseable tool input; the SDK's two retries cover connection resets and 429/5xx.
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  return { stream: (request, options) => client.beta.messages.stream(request, { signal: options.signal }) };
}

/**
 * A tool as the API takes it. `eager_input_streaming` streams large inputs as written; the engine validates every input
 * itself either way. With `strict`, the schema is passed through the SDK's own transform (objects closed, keywords the
 * API does not take moved into the description); a schema it cannot express is sent without `strict` rather than
 * failing the request.
 */
export function modelToolFor(tool: ChatTool, features: ChatFeatures = CHAT_FEATURES): ModelTool {
  const { $schema: _draft, ...schema } = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  const base = { name: tool.name, description: tool.description, eager_input_streaming: true };
  // The code may call the reads; a task is only ever asked for directly, so it can be planned, shown and confirmed.
  const programmatic = features.programmaticReads && tool.kind === 'read';
  const callers = programmatic ? { allowed_callers: ['direct' as const, CODE_EXECUTION] } : {};
  if (features.strictTools && !programmatic) {
    try {
      return { ...base, input_schema: { ...transformJSONSchema({ ...schema, type: 'object' }), type: 'object' } as ModelTool['input_schema'], strict: true };
    } catch {
      // Falls through to the plain definition.
    }
  }
  return { ...base, ...callers, input_schema: { ...schema, type: 'object' } as ModelTool['input_schema'] };
}

/** The prompt, in cache order: policy first (identical for every team and conversation, one hour), then the team's own block (five minutes). */
export interface SystemPrompt {
  stable: string;
  team: string;
}

export function systemBlocks(prompt: SystemPrompt): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: prompt.stable, cache_control: { type: 'ephemeral', ttl: '1h' } }];
  if (prompt.team.trim()) blocks.push({ type: 'text', text: prompt.team, cache_control: { type: 'ephemeral' } });
  return blocks;
}

/**
 * One model call's request. Render order is tools, system, messages, so the one-hour breakpoint on the policy block
 * also covers the tool definitions. The conversation tail is cached by the request-level `cache_control`, which moves
 * forward by itself each step: no marker is ever written into a stored message.
 */
export function buildModelRequest(args: {
  tools: readonly ChatTool[];
  system: SystemPrompt;
  messages: readonly ModelMessage[];
  features?: ChatFeatures;
  /** The step after the last allowed read: no tool may be called, the model answers from what it has. */
  answerOnly?: boolean;
  /** The code execution container of a programmatic call that is waiting for its results. Required then, by the API. */
  container?: string | null;
}): ModelRequest {
  const f = args.features ?? CHAT_FEATURES;
  const betas: string[] = [];
  if (f.dropStaleThinking) betas.push('thinking-binding-controls-2026-08-01');
  if (f.progressNotes) betas.push('thinking-display-updates-2026-08-18');
  if (f.taskBudgetTokens !== null) betas.push('task-budgets-2026-03-13');
  if (f.compaction) betas.push('compact-2026-01-12');
  const tools: NonNullable<ModelRequest['tools']> = args.tools.map((t) => modelToolFor(t, f));
  if (f.programmaticReads) tools.push({ type: CODE_EXECUTION, name: 'code_execution' });
  return {
    model: CHAT_MODEL_ID,
    max_tokens: CHAT_MAX_TOKENS,
    system: systemBlocks(args.system),
    tools,
    // `auto`, never a forced tool: a forced call skips thinking on this model. The prompt says when to use a tool.
    tool_choice: { type: args.answerOnly ? 'none' : 'auto' },
    messages: [...args.messages],
    cache_control: { type: 'ephemeral' },
    thinking: {
      type: 'adaptive',
      ...(f.dropStaleThinking ? { block_binding: { prefix_mismatch_behavior: 'drop_block' as const } } : {}),
      ...(f.progressNotes ? { display: 'updates' as const } : {}),
    },
    output_config: { effort: CHAT_EFFORT, ...(f.taskBudgetTokens !== null ? { task_budget: { type: 'tokens' as const, total: f.taskBudgetTokens } } : {}) },
    ...(f.compaction ? { context_management: { edits: [{ type: 'compact_20260112' as const }] } } : {}),
    ...(args.container ? { container: args.container } : {}),
    ...(betas.length > 0 ? { betas } : {}),
  };
}

/** One model call's tokens, as the API reports them. `input` is the uncached part only. */
export interface CallUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  /** Stored thinking blocks the API dropped on this call because what came before them had changed. */
  dropped_thinking: number;
}

/** A turn's tokens, summed over its model calls. */
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  calls: CallUsage[];
}

export const emptyUsage = (): UsageTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: [] });

export function addUsage(total: UsageTotals, response: Pick<ModelResponse, 'usage'> & { input_transformations?: ReadonlyArray<{ type?: string }> | null }): void {
  const usage = response.usage;
  if (!usage) return;
  const written = usage.cache_creation_input_tokens ?? 0;
  const hour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const call: CallUsage = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cache_read: usage.cache_read_input_tokens ?? 0,
    cache_write_1h: Math.min(hour, written),
    // Whatever was written and is not reported as a one-hour entry is billed as a five-minute one.
    cache_write_5m: Math.max(0, written - hour),
    dropped_thinking: (response.input_transformations ?? []).filter((t) => t?.type === 'thinking_dropped').length,
  };
  total.input += call.input;
  total.output += call.output;
  total.cacheRead += call.cache_read;
  total.cacheWrite += written;
  total.calls.push(call);
}

/** Every input token of one call, cached or not: what decides its rate card. */
export const callPromptTokens = (call: CallUsage): number => call.input + call.cache_read + call.cache_write_5m + call.cache_write_1h;

/** Every input token the turn was billed for: the figure the ledger's `prompt_tokens` has always held. */
export const promptTokens = (usage: UsageTotals): number => usage.calls.reduce((n, call) => n + callPromptTokens(call), 0);

/** A prompt above this many tokens is billed on the long-prompt rate card, five times the short one. */
export const LONG_PROMPT_TOKENS = 100_000;

/** Claude Haiku 5.5, US dollars per million tokens. Cache reads are a tenth of input; a five-minute write 1.25x, a one-hour write 2x. */
export const CHAT_PRICING = {
  short: { input: 0.1, output: 0.5 },
  long: { input: 0.5, output: 2.5 },
  cacheRead: 0.1,
  cacheWrite5m: 1.25,
  cacheWrite1h: 2,
} as const;

export function callCostUsd(call: CallUsage): number {
  const rate = callPromptTokens(call) > LONG_PROMPT_TOKENS ? CHAT_PRICING.long : CHAT_PRICING.short;
  const inputEquivalent = call.input + call.cache_read * CHAT_PRICING.cacheRead + call.cache_write_5m * CHAT_PRICING.cacheWrite5m + call.cache_write_1h * CHAT_PRICING.cacheWrite1h;
  return (inputEquivalent * rate.input + call.output * rate.output) / 1_000_000;
}

/** What the turn cost: each call on its own rate card. */
export const turnCostUsd = (usage: UsageTotals): number => usage.calls.reduce((usd, call) => usd + callCostUsd(call), 0);

/** True for the SDK's own API errors (a status, a provider message): always sanitised before the coach sees one. */
export const isModelApiError = (error: unknown): boolean => error instanceof Anthropic.APIError;

/** The API refused the request as malformed: the one failure a plainer request can cure. */
export const isRejectedRequest = (error: unknown): boolean => error instanceof Anthropic.BadRequestError || (error as { status?: unknown } | null)?.status === 400;
