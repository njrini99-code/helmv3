/**
 * CoachHelm chat: the one place that talks to Anthropic's SDK.
 *
 * Everything else in the engine sees a `ModelClient` (one method, `stream`), so the tests run the whole turn against a
 * scripted model and no code outside this file builds a request.
 *
 * Facts about `claude-sonnet-5-5` this file encodes (each from Anthropic's migration guide, checked against the
 * installed SDK's types):
 *   - thinking cannot be turned off and takes no budget: adaptive only. Depth is `output_config.effort`.
 *   - `temperature`, `top_p`, `top_k` and a forced `tool_choice` are rejected. `auto` and `none` are accepted.
 *   - thinking blocks are bound to the conversation: every earlier message, the system prompt and the tool list must be
 *     byte-identical to when a block was produced, or the request is refused. The stored messages are replayed exactly
 *     as returned, but the team block of the prompt changes with the day and the roster, and the tool list changes with
 *     a deploy. `prefix_mismatch_behavior: 'drop_block'` makes the API drop the blocks it can no longer verify instead
 *     of failing the coach's question.
 *   - a refusal is an HTTP 200 with `stop_reason: 'refusal'`; `fallbacks: 'default'` lets Anthropic retry it server-side.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { estimateCachedCostUsd, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import type { ChatTool } from './tool';

export type ModelMessage = Anthropic.Beta.BetaMessageParam;
export type ModelResponse = Anthropic.Beta.BetaMessage;
export type ModelStreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent;
export type ModelRequest = Parameters<Anthropic['beta']['messages']['stream']>[0];
export type ModelTool = Anthropic.Beta.BetaTool;
export type ToolResultBlock = Anthropic.Beta.BetaToolResultBlockParam;
export type ToolUseBlock = Anthropic.Beta.BetaToolUseBlock;

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

/** How hard the model thinks. One constant: change it after the eval, nowhere else. */
export const CHAT_EFFORT: 'low' | 'medium' | 'high' = 'medium';
export const CHAT_MAX_TOKENS = 16_000;
/** Model calls in one turn before it must answer with what it has. */
export const CHAT_MAX_STEPS = 8;
/** The player's read-only Ask stops sooner, as it did. */
export const PLAYER_MAX_STEPS = 6;

const BETAS = ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'];

export class MissingModelKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set');
    this.name = 'MissingModelKeyError';
  }
}

/**
 * The production model client. Chat calls Anthropic directly with the app's key; there is no gateway fallback, so a
 * missing key is a configuration fault the route reports plainly instead of a silent reroute.
 */
export function anthropicModelClient(): ModelClient {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new MissingModelKeyError();
  // The loop retries nothing itself; the SDK's two retries cover connection resets and 429/5xx before any byte is streamed.
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  return { stream: (request, options) => client.beta.messages.stream(request, { signal: options.signal }) };
}

/** A tool as the API takes it. `eager_input_streaming` streams large inputs as written; the engine validates every input itself. */
export function modelToolFor(tool: ChatTool): ModelTool {
  const schema = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  const { $schema: _draft, ...input_schema } = schema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { ...input_schema, type: 'object' } as ModelTool['input_schema'],
    eager_input_streaming: true,
  };
}

/** The prompt, in cache order: policy first (shared by every team, one hour), then the team's own block (five minutes). */
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
 * One model call's request. Render order is tools, system, messages, so the breakpoint on the policy block also covers
 * the tool definitions. The conversation tail is cached by the request-level `cache_control`, which moves forward by
 * itself each step: no marker is ever written into a stored message.
 */
export function buildModelRequest(args: { tools: readonly ModelTool[]; system: SystemPrompt; messages: readonly ModelMessage[]; answerOnly?: boolean }): ModelRequest {
  return {
    model: CHAT_MODEL_ID,
    max_tokens: CHAT_MAX_TOKENS,
    system: systemBlocks(args.system),
    tools: [...args.tools],
    // `none` on the step after the last allowed read: the model writes its closing words from what it has. A forced tool is not accepted on this model.
    tool_choice: { type: args.answerOnly ? 'none' : 'auto' },
    messages: [...args.messages],
    cache_control: { type: 'ephemeral' },
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    output_config: { effort: CHAT_EFFORT },
    betas: BETAS,
    fallbacks: 'default',
  };
}

/** Token counts of a turn, summed over its model calls. `input` is the uncached part only, as the API reports it. */
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  calls: Array<{ input: number; output: number; cache_read: number; cache_write: number }>;
}

export const emptyUsage = (): UsageTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: [] });

export function addUsage(total: UsageTotals, usage: ModelResponse['usage'] | null | undefined): void {
  if (!usage) return;
  const call = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cache_read: usage.cache_read_input_tokens ?? 0,
    cache_write: usage.cache_creation_input_tokens ?? 0,
  };
  total.input += call.input;
  total.output += call.output;
  total.cacheRead += call.cache_read;
  total.cacheWrite += call.cache_write;
  total.calls.push(call);
}

/** Every input token the turn was billed for, cached or not: the figure the ledger's `prompt_tokens` has always held. */
export const promptTokens = (usage: UsageTotals): number => usage.input + usage.cacheRead + usage.cacheWrite;

export function turnCostUsd(usage: UsageTotals): number {
  return estimateCachedCostUsd(CHAT_MODEL_LEDGER_ID, promptTokens(usage), usage.output, {
    noCacheTokens: usage.input,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
  });
}

/** True for the SDK's own API errors (a status, a provider message): never retried by the loop, always sanitised before the coach sees it. */
export const isModelApiError = (error: unknown): boolean => error instanceof Anthropic.APIError;
