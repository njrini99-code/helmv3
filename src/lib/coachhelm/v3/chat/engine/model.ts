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
 * it. The fields form GROUPS (`FEATURE_GROUPS`): if the API rejects a request (a 400), the loop gives up ONE group,
 * the one the API's message names or else the next in the list's order, and sends the call again; the rest of the turn
 * runs without that group, and which groups a turn gave up is logged with the API's own reason, sent on the `usage`
 * event and written to the ledger row. A request that is accepted only after a group was dropped is a fault to fix,
 * never a pass (the eval's `--require-features` fails the run on one).
 *
 * `strict: true` has a budget the API enforces per REQUEST, not per tool (structured outputs, "Schema complexity
 * limits"): at most 20 strict tools, 24 optional parameters and 16 parameters with a union type, summed over every
 * strict tool. `modelToolsFor` spends that budget in the tool list's own order, tasks first; a tool that does not fit
 * is sent without `strict` (the engine checks every input itself, strict or not).
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
  /** `strict: true` on a tool, so the model's input matches the schema exactly. Stable; no beta. On as many tools as the API's per-request budget allows (`strictToolNames`). */
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
  /**
   * What to ask next: after a turn has completed and `done` has gone out, one small call on the player profile's model
   * asks for two to four follow-ups (`engine/suggestions.ts`). It is a call of its own, not part of the turn's
   * requests, so it is in no feature group: nothing of the answer waits on it or fails with it. Off for a player.
   */
  suggestions: boolean;
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
    features: { dropStaleThinking: true, strictTools: true, citations: true, compaction: true, taskBudgetTokens: null, progressNotes: true, programmaticReads: true, refusalFallback: true, suggestions: true },
  },
  'claude-haiku-5-5': {
    modelId: 'claude-haiku-5-5',
    ledgerId: PLAYER_CHAT_MODEL,
    effort: 'high',
    features: { dropStaleThinking: true, strictTools: true, citations: true, compaction: true, taskBudgetTokens: null, progressNotes: false, programmaticReads: true, refusalFallback: false, suggestions: true },
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
    // A player's read-only Ask, on whichever model: the same request without the model's code, and no suggestions after it.
    profile = surface === 'player' ? { ...base, features: { ...base.features, programmaticReads: false, suggestions: false } } : base;
    profiles.set(key, profile);
  }
  return profile;
}

/** A coach surface's features on the model coaches run on. */
export const CHAT_FEATURES: ChatFeatures = profileFor('ask', null).features;

/** The features a surface's requests are sent with. A function so the route has one thing to call and a test one thing to replace. */
export const chatFeatures = (surface: ChatSurface = 'ask'): ChatFeatures => profileFor(surface).features;

/**
 * The optional request features, as the API accepts or rejects them together, in the order they are given up when a
 * rejected request does not say which one it objects to: what is newest and costs the coach least to lose comes
 * first; the thinking-binding control comes last, because without it a stored conversation whose prompt has since
 * changed is a 400 instead of a dropped block.
 */
export const FEATURE_GROUPS = ['progress_notes', 'refusal_fallback', 'task_budget', 'strict_tools', 'compaction', 'programmatic_reads', 'thinking_binding'] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

const GROUPS: Record<FeatureGroup, { on: (f: ChatFeatures) => boolean; off: Partial<ChatFeatures>; named: RegExp }> = {
  progress_notes: { on: (f) => f.progressNotes, off: { progressNotes: false }, named: /thinking-display-updates|display/i },
  refusal_fallback: { on: (f) => f.refusalFallback, off: { refusalFallback: false }, named: /fallback/i },
  task_budget: { on: (f) => f.taskBudgetTokens !== null, off: { taskBudgetTokens: null }, named: /task[-_]budget/i },
  // `strict` is the only structured-output feature a chat request carries, and structured outputs are what the API documents as
  // incompatible with citations (every read goes back with citations on): a message about either is about this group.
  strict_tools: { on: (f) => f.strictTools, off: { strictTools: false }, named: /strict|structured.outputs?|citations?|schema is too complex|optional parameters|union|grammar|additionalProperties/i },
  compaction: { on: (f) => f.compaction, off: { compaction: false }, named: /context_management|compact/i },
  programmatic_reads: { on: (f) => f.programmaticReads, off: { programmaticReads: false }, named: /allowed_callers|code_execution|programmatic|container/i },
  thinking_binding: { on: (f) => f.dropStaleThinking, off: { dropStaleThinking: false }, named: /block_binding|thinking-binding-controls|prefix_mismatch/i },
};

/** The groups a request with these features carries, in the order they would be given up. */
export const groupsOn = (features: ChatFeatures): FeatureGroup[] => FEATURE_GROUPS.filter((group) => GROUPS[group].on(features));

/** The same features without one group. */
export const withoutGroup = (features: ChatFeatures, group: FeatureGroup): ChatFeatures => ({ ...features, ...GROUPS[group].off });

/**
 * Which group to give up after the API rejected a request: the one its message names, when it names exactly one of
 * the groups the request carried (a 400 names the field or the beta it objects to); otherwise the next in order.
 * Null when the request carried none: there is nothing plainer to send. The message is only a hint, and a wrong one
 * costs one more rejected request, never the answer.
 */
export function groupToDrop(features: ChatFeatures, apiMessage: string): FeatureGroup | null {
  const on = groupsOn(features);
  const named = on.filter((group) => GROUPS[group].named.test(apiMessage));
  return (named.length === 1 ? named[0] : on[0]) ?? null;
}

/**
 * The same request without anything the API could refuse as unknown: every group off. (A conversation that already
 * holds a call made from the model's code cannot be replayed without the code tool; if the request without it is
 * rejected too, the turn fails with a sentence, as any other.)
 */
export const plainFeatures = (features: ChatFeatures): ChatFeatures => FEATURE_GROUPS.reduce(withoutGroup, features);

export const isPlain = (f: ChatFeatures): boolean => groupsOn(f).length === 0;

/**
 * What the API said when it rejected a request, for the log: the status, its error type, its stable code when it has
 * one, and its own message cut to 300 characters with ids removed. The API's validation messages name the field or
 * header they object to; nothing of the request body is read here.
 */
export interface ModelRejection {
  status: number | null;
  type: string | null;
  /** `error.details.error_code`: set for account, billing and key faults, which no plainer request cures. */
  code: string | null;
  message: string;
}
export function rejectionOf(error: unknown): ModelRejection {
  const e = (error ?? {}) as { status?: unknown; type?: unknown; errorCode?: unknown; apiMessage?: unknown; message?: unknown };
  const words = typeof e.apiMessage === 'string' && e.apiMessage ? e.apiMessage : typeof e.message === 'string' ? e.message : '';
  return {
    status: typeof e.status === 'number' ? e.status : null,
    type: typeof e.type === 'string' ? e.type : null,
    code: typeof e.errorCode === 'string' ? e.errorCode : null,
    message: words
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300),
  };
}

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
 * The API's limits on `strict` across ONE request (structured outputs, "Schema complexity limits"; read 10 Nov 2026):
 * the number of strict tools, the optional parameters summed over them, and their parameters that use a union type
 * (`anyOf` or a list of types). Over any of them the whole request is a 400.
 */
export const STRICT_LIMITS = { tools: 20, optional: 24, unions: 16 } as const;

// A tool is the same object on every request (the registry builds each once), so its schemas are worked out once.
const plainSchemas = new WeakMap<object, Record<string, unknown>>();
const strictSchemas = new WeakMap<object, { schema: ModelTool['input_schema'] | null }>();

const jsonSchemaOf = (tool: ChatTool): Record<string, unknown> => {
  let schema = plainSchemas.get(tool.input);
  if (!schema) {
    const { $schema: _draft, ...rest } = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    schema = rest;
    plainSchemas.set(tool.input, schema);
  }
  return schema;
};

/** What a strict schema spends of the request's budget: its optional parameters and its parameters with a union type, at every depth. */
export function strictCostOf(schema: unknown): { optional: number; unions: number } {
  const cost = { optional: 0, unions: 0 };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const object = node as Record<string, unknown>;
    if (object.properties && typeof object.properties === 'object') {
      const required = new Set(Array.isArray(object.required) ? (object.required as unknown[]) : []);
      for (const [name, property] of Object.entries(object.properties as Record<string, unknown>)) {
        if (!required.has(name)) cost.optional += 1;
        const p = (property ?? {}) as { anyOf?: unknown; type?: unknown };
        if (Array.isArray(p.anyOf) || Array.isArray(p.type)) cost.unions += 1;
      }
    }
    Object.values(object).forEach(visit);
  };
  visit(schema);
  return cost;
}

/** The schema `strict` takes for a tool (the SDK's own transform), or null when it cannot be expressed. */
function strictSchemaOf(tool: ChatTool): ModelTool['input_schema'] | null {
  let known = strictSchemas.get(tool.input);
  if (!known) {
    try {
      known = { schema: { ...transformJSONSchema({ ...jsonSchemaOf(tool), type: 'object' }), type: 'object' } as ModelTool['input_schema'] };
    } catch {
      known = { schema: null };
    }
    strictSchemas.set(tool.input, known);
  }
  return known.schema;
}

/** The code may call the reads; a task is only ever asked for directly, so it can be planned, shown and confirmed. */
const isProgrammatic = (tool: ChatTool, features: ChatFeatures): boolean => features.programmaticReads && tool.kind === 'read' && !tool.direct_only;

/**
 * A tool as the API takes it. `eager_input_streaming` streams large inputs as written; the engine validates every input
 * itself either way. With `strict`, the schema is passed through the SDK's own transform (objects closed, keywords the
 * API does not take moved into the description); a schema it cannot express is sent without `strict` rather than
 * failing the request. `strict` here is this ONE tool's: whether it fits the request's budget is `modelToolsFor`'s.
 */
export function modelToolFor(tool: ChatTool, features: ChatFeatures = CHAT_FEATURES, strict: boolean = features.strictTools): ModelTool {
  const base = { name: tool.name, description: tool.description, eager_input_streaming: true };
  const programmatic = isProgrammatic(tool, features);
  const callers = programmatic ? { allowed_callers: ['direct' as const, CODE_EXECUTION] } : {};
  const strictSchema = strict && !programmatic ? strictSchemaOf(tool) : null;
  if (strictSchema) return { ...base, input_schema: strictSchema, strict: true };
  return { ...base, ...callers, input_schema: { ...jsonSchemaOf(tool), type: 'object' } as ModelTool['input_schema'] };
}

/**
 * The names of the tools sent `strict`, within the request's budget (`STRICT_LIMITS`). Tasks come first, because a
 * write's arguments matter most; within tasks and within reads the list's own order decides, so the order of the
 * registry is the order of priority. A tool that would take the request over any limit is left out and the next one
 * is tried. The same list and features always give the same names: the tools are part of the cached prefix.
 */
export function strictToolNames(tools: readonly ChatTool[], features: ChatFeatures = CHAT_FEATURES): Set<string> {
  const names = new Set<string>();
  if (!features.strictTools) return names;
  const spent = { optional: 0, unions: 0 };
  for (const tool of [...tools.filter((t) => t.kind === 'task'), ...tools.filter((t) => t.kind !== 'task')]) {
    if (names.size >= STRICT_LIMITS.tools) break;
    if (isProgrammatic(tool, features)) continue;
    const schema = strictSchemaOf(tool);
    if (!schema) continue;
    const cost = strictCostOf(schema);
    if (spent.optional + cost.optional > STRICT_LIMITS.optional || spent.unions + cost.unions > STRICT_LIMITS.unions) continue;
    spent.optional += cost.optional;
    spent.unions += cost.unions;
    names.add(tool.name);
  }
  return names;
}

/** Every tool of a request as the API takes it, in the list's order, `strict` on the ones the budget allows. */
export function modelToolsFor(tools: readonly ChatTool[], features: ChatFeatures = CHAT_FEATURES): ModelTool[] {
  const strict = strictToolNames(tools, features);
  return tools.map((tool) => modelToolFor(tool, features, strict.has(tool.name)));
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
  const tools: NonNullable<ModelRequest['tools']> = modelToolsFor(args.tools, f);
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
