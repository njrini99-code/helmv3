/**
 * CoachHelm chat: the one place that talks to Anthropic's SDK.
 *
 * Everything else in the engine sees a `ModelClient` (one method, `stream`), so the tests run the whole turn against a
 * scripted model and no code outside this file builds a request.
 *
 * Which model answers is a PROFILE chosen by the surface (`profileFor`): a coach's surfaces (Ask, quick chat, the
 * practice helper: about 45 tools, a 20k prompt, multi-read analysis, code for whole-team work, writes into the app)
 * run on Claude Sonnet 5.5; the player's read-only Ask runs on Claude Haiku 5.5 (lead's call of 10 Nov 2026 on the
 * owner's "change it to sonnet if you think it'll be an issue", to be confirmed by the eval). A profile carries
 * everything that differs between the two; `CHAT_MODEL_OVERRIDE` puts every surface on one model for the eval.
 *
 * What binds both models, from Anthropic's migration guide and checked against the installed SDK's types:
 *   - thinking is adaptive (never `disabled`, which is a 400 on Sonnet 5.5); there is no budget and no sampling
 *     parameter to send. Depth is `output_config.effort`, sent on every request.
 *   - a thinking block is valid only while `system`, `tools` and every earlier message are unchanged. So nothing that
 *     changes during a conversation's life is in `system` or `tools` (the date, the screen and the coach's notes go in
 *     a `role: 'system'` message after the user's message, stored with the turn), the stored messages are replayed
 *     as returned, and `drop_block` makes the API drop a block it can no longer verify (after a deploy that changed the
 *     prompt or a tool) instead of failing the coach's question.
 *   - a forced `tool_choice` is never sent (a 400 on Sonnet 5.5; skips thinking on Haiku 5.5).
 *   - a refusal is an HTTP 200 with `stop_reason: 'refusal'`.
 * What differs:
 *   - Sonnet 5.5: effort `medium` (its levels are recalibrated; the guide starts multistep tool use there); server-side
 *     refusal fallback (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`), which retries a `cyber` or
 *     `frontier_llm` decline on another model inside the same call; the model's own short notes between tool calls
 *     (`thinking.display: 'updates'`); $2 / $10 per million tokens at every prompt length.
 *   - Haiku 5.5: effort `high` (its default is `medium`); NO server-side fallback (`fallbacks` is never sent: a list
 *     is a 400 and 'default' does nothing); no progress notes (not listed for it); two rate cards, a prompt over 100K
 *     tokens costing five times as much per token.
 * Thinking blocks across the two: Sonnet 5.5 reads Haiku 5.5's blocks, so a conversation begun on Haiku and continued
 * on Sonnet keeps its reasoning; no other model reads Sonnet 5.5's, so the other direction has them dropped by the API
 * (unbilled, counted in `input_transformations`). Blocks are always passed back unchanged, never stripped here.
 *
 * Every optional feature is one field of a profile's `features`. Turn it off there and the request no longer carries
 * it; if the API ever rejects a request that carries one, the loop retries that call once as a plain request (see
 * `loop.ts`), so a beta the API stops accepting costs the coach nothing but the feature.
 */
import Anthropic from '@anthropic-ai/sdk';
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';
import { z } from 'zod';
import { MODEL_FOR_TASK, PLAYER_CHAT_MODEL } from '@/lib/coachhelm/v3/llm/types';
import type { ChatSurface, ChatTool } from './tool';

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
   * result of the code reaches it, so a question across many players or rounds costs one model call instead of one
   * per read. Stable on this model, no beta. ON for the coach surfaces by the owner's decision of 10 Nov 2026, made
   * knowing that with it on the results of those reads pass through Anthropic's code execution container, which
   * Anthropic retains for up to 30 days and which is not eligible for zero data retention. OFF for a player (a small
   * read-only tool set). With it on the read tools are not `strict` (the two cannot be combined; the engine's own zod
   * check still runs before every read, however it was called) and a task is never callable from code.
   */
  programmaticReads: boolean;
  /**
   * Server-side refusal fallback: `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`). When the model
   * declines for `cyber` or `frontier_llm`, the API runs the same request on its default substitute inside the same
   * call. Only on a model that supports it (Sonnet 5.5); never sent to Haiku 5.5.
   */
  refusalFallback: boolean;
}

export type ChatModelId = 'claude-sonnet-5-5' | 'claude-haiku-5-5';

/** Everything that differs between the models the chat can run on. */
export interface ModelProfile {
  /** The id the API takes. */
  modelId: ChatModelId;
  /** The ledger and budget key (gateway-style id, as every cost table in the repo is keyed). */
  ledgerId: string;
  /** `output_config.effort`, sent on every request. Never `xhigh` or `max`. */
  effort: 'low' | 'medium' | 'high';
  /** What a coach surface's requests are sent with on this model. A player's are the same without the model's code. */
  features: ChatFeatures;
}

export const MODEL_PROFILES: Record<ChatModelId, ModelProfile> = {
  'claude-sonnet-5-5': {
    modelId: 'claude-sonnet-5-5',
    ledgerId: MODEL_FOR_TASK.coach_chat,
    effort: 'medium',
    features: { dropStaleThinking: true, strictTools: true, citations: true, compaction: true, taskBudgetTokens: null, progressNotes: true, programmaticReads: true, refusalFallback: true },
  },
  'claude-haiku-5-5': {
    modelId: 'claude-haiku-5-5',
    ledgerId: PLAYER_CHAT_MODEL,
    effort: 'high',
    features: { dropStaleThinking: true, strictTools: true, citations: true, compaction: true, taskBudgetTokens: null, progressNotes: false, programmaticReads: true, refusalFallback: false },
  },
};

/** Which model each surface runs on. One line per surface. A conversation never changes surface family mid-way (a coach's three surfaces share a model). */
export const SURFACE_MODEL: Record<ChatSurface, ChatModelId> = {
  ask: 'claude-sonnet-5-5',
  quick_chat: 'claude-sonnet-5-5',
  practice_helper: 'claude-sonnet-5-5',
  player: 'claude-haiku-5-5',
};

/** Set to a model id to run EVERY surface on it (the eval: everything on Haiku, then everything on Sonnet). Null in production. */
export const CHAT_MODEL_OVERRIDE: ChatModelId | null = null;

const profiles = new Map<string, ModelProfile>();
/** The profile a surface's requests use. The same object every time for a surface and a model, so it can be compared by identity. */
export function profileFor(surface: ChatSurface = 'ask', override: ChatModelId | null = CHAT_MODEL_OVERRIDE): ModelProfile {
  const model = override ?? SURFACE_MODEL[surface];
  const key = `${surface === 'player' ? 'player' : 'coach'}:${model}`;
  let profile = profiles.get(key);
  if (!profile) {
    const base = MODEL_PROFILES[model];
    // A player's read-only Ask, on whichever model: the same request without the model's code.
    profile = surface === 'player' ? { ...base, features: { ...base.features, programmaticReads: false } } : base;
    profiles.set(key, profile);
  }
  return profile;
}

/** A coach surface's features on the model coaches run on. */
export const CHAT_FEATURES: ChatFeatures = profileFor('ask', null).features;

/** The features a surface's requests are sent with. A function so the route has one thing to call and a test one thing to replace. */
export const chatFeatures = (surface: ChatSurface = 'ask'): ChatFeatures => profileFor(surface).features;

/**
 * The same request without anything the API could refuse as unknown: no beta, no strict schema, no code tool. What a
 * rejected request is retried as. (A conversation that already holds a call made from the model's code cannot be
 * replayed without the code tool; if the plain request is rejected too, the turn fails with a sentence, as any other.)
 */
export const plainFeatures = (features: ChatFeatures): ChatFeatures => ({
  ...features,
  dropStaleThinking: false,
  strictTools: false,
  compaction: false,
  taskBudgetTokens: null,
  progressNotes: false,
  programmaticReads: false,
  refusalFallback: false,
});

export const isPlain = (f: ChatFeatures): boolean => !f.dropStaleThinking && !f.strictTools && !f.compaction && f.taskBudgetTokens === null && !f.progressNotes && !f.programmaticReads && !f.refusalFallback;

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
  const programmatic = features.programmaticReads && tool.kind === 'read' && !tool.direct_only;
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
  /** The model and its settings. Left out, a coach surface's. */
  profile?: ModelProfile;
  /** Left out, the profile's own. The loop passes its own copy, which a rejected request makes plainer. */
  features?: ChatFeatures;
  /** The step after the last allowed read: no tool may be called, the model answers from what it has. */
  answerOnly?: boolean;
  /** The code execution container of a programmatic call that is waiting for its results. Required then, by the API. */
  container?: string | null;
}): ModelRequest {
  const profile = args.profile ?? profileFor('ask');
  const f = args.features ?? profile.features;
  const betas: string[] = [];
  if (f.dropStaleThinking) betas.push('thinking-binding-controls-2026-08-01');
  if (f.progressNotes) betas.push('thinking-display-updates-2026-08-18');
  if (f.taskBudgetTokens !== null) betas.push('task-budgets-2026-03-13');
  if (f.compaction) betas.push('compact-2026-01-12');
  if (f.refusalFallback) betas.push('server-side-fallback-2026-07-01');
  const tools: NonNullable<ModelRequest['tools']> = args.tools.map((t) => modelToolFor(t, f));
  if (f.programmaticReads) tools.push({ type: CODE_EXECUTION, name: 'code_execution' });
  return {
    model: profile.modelId,
    max_tokens: CHAT_MAX_TOKENS,
    system: systemBlocks(args.system),
    tools,
    // `auto`, never a forced tool: a forced call is a 400 on Sonnet 5.5 and skips thinking on Haiku 5.5. The prompt says when to use a tool.
    tool_choice: { type: args.answerOnly ? 'none' : 'auto' },
    messages: [...args.messages],
    cache_control: { type: 'ephemeral' },
    thinking: {
      type: 'adaptive',
      ...(f.dropStaleThinking ? { block_binding: { prefix_mismatch_behavior: 'drop_block' as const } } : {}),
      ...(f.progressNotes ? { display: 'updates' as const } : {}),
    },
    output_config: { effort: profile.effort, ...(f.taskBudgetTokens !== null ? { task_budget: { type: 'tokens' as const, total: f.taskBudgetTokens } } : {}) },
    ...(f.compaction ? { context_management: { edits: [{ type: 'compact_20260112' as const }] } } : {}),
    ...(args.container ? { container: args.container } : {}),
    // The scalar form with its own header: the array form uses a different header and pairing either with the other is a 400.
    ...(f.refusalFallback ? { fallbacks: 'default' as const } : {}),
    ...(betas.length > 0 ? { betas } : {}),
  };
}

/** One model call's tokens, as the API reports them. `input` is the uncached part only. */
export interface CallUsage {
  /** The model that ran it: the profile's, or the substitute a refusal fallback ran on. Decides the rate. */
  model: string;
  /** `fallback_message`: a substitute model produced the answer. `compaction`: the server summarising a long conversation. */
  kind: 'message' | 'fallback_message' | 'compaction';
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  /** Stored thinking blocks the API dropped on this call because what came before them had changed, or the model cannot read them. */
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

type UsageEntry = { type?: string; model?: string | null; input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_creation?: { ephemeral_1h_input_tokens?: number | null } | null };

/**
 * Add one response's usage. `usage.iterations` is the per-attempt record when the API sends it: an attempt that
 * declined and the substitute that answered are separate entries on separate models, a compaction is an entry the
 * top-level figures leave out, and each is billed. Without it the top-level figures are the one call.
 * `requested`: the model the request named, for an entry that does not name one.
 */
export function addUsage(
  total: UsageTotals,
  response: { usage?: (UsageEntry & { iterations?: ReadonlyArray<UsageEntry> | null }) | null; model?: string | null; input_transformations?: ReadonlyArray<{ type?: string }> | null },
  requested: string = 'claude-haiku-5-5',
): void {
  const usage = response.usage;
  if (!usage) return;
  const dropped = (response.input_transformations ?? []).filter((t) => t?.type === 'thinking_dropped').length;
  const iterations = Array.isArray(usage.iterations) ? usage.iterations.filter((e) => e && (e.type === 'message' || e.type === 'fallback_message' || e.type === 'compaction')) : [];
  const entries: UsageEntry[] = iterations.length > 0 ? iterations : [{ ...usage, type: 'message', model: response.model ?? requested }];
  entries.forEach((entry, index) => {
    const written = entry.cache_creation_input_tokens ?? 0;
    const hour = entry.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const call: CallUsage = {
      model: entry.model ?? response.model ?? requested,
      kind: entry.type === 'fallback_message' || entry.type === 'compaction' ? entry.type : 'message',
      input: entry.input_tokens ?? 0,
      output: entry.output_tokens ?? 0,
      cache_read: entry.cache_read_input_tokens ?? 0,
      cache_write_1h: Math.min(hour, written),
      // Whatever was written and is not reported as a one-hour entry is billed as a five-minute one.
      cache_write_5m: Math.max(0, written - hour),
      dropped_thinking: index === 0 ? dropped : 0,
    };
    total.input += call.input;
    total.output += call.output;
    total.cacheRead += call.cache_read;
    total.cacheWrite += written;
    total.calls.push(call);
  });
}

/** The substitute model that answered, when a refusal fallback did; null otherwise. */
export const fallbackModelOf = (usage: UsageTotals): string | null => usage.calls.find((c) => c.kind === 'fallback_message')?.model ?? null;

/** Every input token of one call, cached or not: what decides its rate card. */
export const callPromptTokens = (call: CallUsage): number => call.input + call.cache_read + call.cache_write_5m + call.cache_write_1h;

/** Every input token the turn was billed for: the figure the ledger's `prompt_tokens` has always held. */
export const promptTokens = (usage: UsageTotals): number => usage.calls.reduce((n, call) => n + callPromptTokens(call), 0);

/** A Claude Haiku 5.5 prompt above this many tokens is billed on its long-prompt rate card, five times the short one. */
export const LONG_PROMPT_TOKENS = 100_000;

/** US dollars per million tokens. `long`: a second rate card for a prompt over `over` tokens. */
export interface ModelRates {
  input: number;
  output: number;
  long?: { over: number; input: number; output: number };
}

/** On every model here a cache read is a tenth of input, a five-minute write 1.25x and a one-hour write 2x. */
export const CACHE_MULTIPLIERS = { read: 0.1, write5m: 1.25, write1h: 2 } as const;

/**
 * The rates of each model a chat call can be billed on, from Anthropic's migration guide (10 Nov 2026).
 * `claude-sonnet-5` is the substitute Sonnet 5.5's refusal fallback runs on, at the same prices.
 */
export const CHAT_RATES: Record<string, ModelRates> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, long: { over: LONG_PROMPT_TOKENS, input: 0.5, output: 2.5 } },
};

/** A model id as the API names it may carry a date suffix. A model that is not in the table is charged at the dearest card, never as free. */
export function ratesFor(model: string): ModelRates {
  const known = Object.keys(CHAT_RATES)
    .sort((a, b) => b.length - a.length)
    .find((id) => model === id || model.startsWith(`${id}-`));
  return CHAT_RATES[known ?? 'claude-sonnet-5-5']!;
}

/** True when the call was billed on its model's long-prompt card. */
export const onLongCard = (call: CallUsage): boolean => {
  const long = ratesFor(call.model).long;
  return Boolean(long) && callPromptTokens(call) > long!.over;
};

export function callCostUsd(call: CallUsage): number {
  const rates = ratesFor(call.model);
  const rate = onLongCard(call) ? rates.long! : rates;
  const inputEquivalent = call.input + call.cache_read * CACHE_MULTIPLIERS.read + call.cache_write_5m * CACHE_MULTIPLIERS.write5m + call.cache_write_1h * CACHE_MULTIPLIERS.write1h;
  return (inputEquivalent * rate.input + call.output * rate.output) / 1_000_000;
}

/** What the turn cost: each call at the rate of the model that ran it, on its own rate card. */
export const turnCostUsd = (usage: UsageTotals): number => usage.calls.reduce((usd, call) => usd + callCostUsd(call), 0);

/** True for the SDK's own API errors (a status, a provider message): always sanitised before the coach sees one. */
export const isModelApiError = (error: unknown): boolean => error instanceof Anthropic.APIError;

/** The API refused the request as malformed: the one failure a plainer request can cure. */
export const isRejectedRequest = (error: unknown): boolean => error instanceof Anthropic.BadRequestError || (error as { status?: unknown } | null)?.status === 400;
