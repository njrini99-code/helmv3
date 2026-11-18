/**
 * `writeRead`: one player's written "why" and "what to do", checked by code.
 *
 *   1. Project the fact sheet and the notability for the view (`payloadFor`). No priority: nothing to write.
 *   2. Ask the model once, with the facts and one tool, `submit_read`.
 *   3. Check the draft (`checkDraft`). It passes: return it.
 *   4. It fails: ONE repair. The assistant turn goes back exactly as returned, followed by a `tool_result` for its
 *      `submit_read` call marked as an error, carrying the checker's reasons (`repairFeedback`; the pattern of
 *      `buildRetryPrompt` in `llm/compose.ts`).
 *   5. It fails again, the model refuses, or the call fails: `written: null`. The stage 1 card stands. There is never a
 *      template stand-in.
 *
 * The client is injected (the chat engine's `ModelClient`): `anthropicModelClient()` in production, a fake in tests.
 * This module never reads the database, the clock (`deps.now`) or the environment, and never throws for a model
 * failure: whatever happens, the caller saving a read gets a result.
 */
import Anthropic from '@anthropic-ai/sdk';
import { addUsage, emptyUsage, fallbackModelOf, turnCostUsd, type ChatModelId, type ModelMessage, type ModelRequest, type ModelResponse } from '@/lib/coachhelm/v3/chat/engine/model';
import { checkDraft, repairFeedback } from './checker';
import { payloadFor, type WriterPayload } from './payload';
import { DraftSchema, SUBMIT_TOOL, WRITER_SYSTEM, WRITER_TOOLS, factsMessage } from './prompt';
import type { Draft, Rejection, WriteResult, WriterDeps, WriterInput, WrittenRead } from './types';

/**
 * This surface's model settings. Kept here, not in `chat/engine/model.ts`, because the chat's profiles are keyed by
 * chat surface and adding one there would change the chat's own types. Same model and effort as the coach's Ask.
 * OWNER DECISION: the model, the effort and the monthly cost cap are not yet approved (see the README).
 */
export const WRITER_PROFILE = {
  modelId: 'claude-sonnet-5-5' satisfies ChatModelId,
  effort: 'medium' as const,
  /** Server-side refusal fallback (`fallbacks: 'default'`), as the chat sends it on this model. */
  refusalFallback: true,
  maxTokens: 16_000,
  /** The first draft and one repair. */
  maxAttempts: 2,
} as const;

export function writerRequest(messages: readonly ModelMessage[]): ModelRequest {
  return {
    model: WRITER_PROFILE.modelId,
    max_tokens: WRITER_PROFILE.maxTokens,
    // Tools render before system, so this breakpoint caches both. Five minutes: a team's players are written in one run.
    system: [{ type: 'text', text: WRITER_SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: WRITER_TOOLS,
    // `auto`, never forced: a forced tool is a 400 on Sonnet 5.5. The prompt names the tool.
    tool_choice: { type: 'auto' },
    messages: [...messages],
    thinking: { type: 'adaptive' },
    output_config: { effort: WRITER_PROFILE.effort },
    ...(WRITER_PROFILE.refusalFallback ? { fallbacks: 'default' as const, betas: ['server-side-fallback-2026-07-01'] } : {}),
  };
}

/** What may be sent back: after a refusal fallback, only what follows the switch point (as the chat loop's `echoable`). */
function echoable(content: ModelResponse['content']): ModelResponse['content'] {
  const boundary = content.map((b) => b.type as string).lastIndexOf('fallback');
  if (boundary === -1) return content;
  return content.filter((block, i) => i >= boundary || !['thinking', 'redacted_thinking', 'tool_use'].includes(block.type as string));
}

type ToolUse = Anthropic.Beta.BetaToolUseBlock;
const isToolUse = (b: { type: string }): b is ToolUse => b.type === 'tool_use';

function parseDraft(input: unknown): { draft: Draft } | { reasons: Rejection[] } {
  const parsed = DraftSchema.safeParse(input);
  if (parsed.success) return { draft: { ...parsed.data, declared: parsed.data.declared.map((d) => ({ ...d })) } };
  return { reasons: parsed.error.issues.slice(0, 8).map((i) => ({ rule: 'malformed' as const, field: 'draft' as const, detail: `${i.path.join('.') || 'input'}: ${i.message}` })) };
}

export async function writeRead(input: WriterInput, deps: WriterDeps): Promise<WriteResult> {
  const usage = emptyUsage();
  const rejections: WriteResult['rejections'] = [];
  const done = (written: WrittenRead | null, attempts: number): WriteResult => ({ written, attempts, rejections, usage, cost_usd: turnCostUsd(usage) });

  const payload: WriterPayload | null = payloadFor(input.sheet, input.notability, input.view);
  if (!payload) return done(null, 0);

  const messages: ModelMessage[] = [{ role: 'user', content: factsMessage(payload) }];
  const signal = deps.signal ?? new AbortController().signal;

  for (let attempt = 1; attempt <= WRITER_PROFILE.maxAttempts; attempt++) {
    let response: ModelResponse;
    try {
      response = await deps.client.stream(writerRequest(messages), { signal }).finalMessage();
    } catch (error) {
      // Never into the save path: the stage 1 card stands. The message is the SDK's class and status only, no prompt text.
      const status = (error as { status?: unknown } | null)?.status;
      rejections.push({ attempt, reasons: [{ rule: 'api_error', field: 'draft', detail: `${error instanceof Anthropic.APIError ? 'API error' : 'call failed'}${typeof status === 'number' ? ` ${status}` : ''}` }] });
      return done(null, attempt);
    }
    addUsage(usage, response, WRITER_PROFILE.modelId);

    if (response.stop_reason === 'refusal') {
      rejections.push({ attempt, reasons: [{ rule: 'refused', field: 'draft', detail: 'the model declined to write this read' }] });
      return done(null, attempt);
    }

    const content = echoable(response.content);
    const calls = content.filter(isToolUse);
    const submit = calls.find((c) => c.name === SUBMIT_TOOL);
    let reasons: Rejection[];
    let draft: Draft | null = null;
    if (!submit || response.stop_reason === 'max_tokens') {
      reasons = [{ rule: 'no_read_returned', field: 'draft', detail: response.stop_reason === 'max_tokens' ? 'the reply was cut off before the read was complete' : `no ${SUBMIT_TOOL} call was made` }];
    } else {
      const parsed = parseDraft(submit.input);
      if ('reasons' in parsed) reasons = parsed.reasons;
      else {
        draft = parsed.draft;
        reasons = checkDraft(draft, payload, { others: input.others });
      }
    }

    if (draft && reasons.length === 0) {
      return done(
        {
          what: draft.what.trim(),
          rules_in_out: draft.rules_in_out.trim(),
          this_week: draft.this_week.trim(),
          watch: draft.watch.trim(),
          model: fallbackModelOf(usage) ?? response.model ?? WRITER_PROFILE.modelId,
          checked_at: deps.now().toISOString(),
        },
        attempt,
      );
    }
    rejections.push({ attempt, reasons });
    // A reply cut off at the length limit cannot be echoed back safely (its last block may be half a tool call): stop.
    if (attempt === WRITER_PROFILE.maxAttempts || response.stop_reason === 'max_tokens') return done(null, attempt);

    // The repair: the turn exactly as returned, then an answer to every tool call in it, the checker's reasons on ours.
    messages.push({ role: 'assistant', content: content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
    const feedback = repairFeedback(reasons);
    if (calls.length > 0) {
      messages.push({
        role: 'user',
        content: calls.map((c) => ({
          type: 'tool_result' as const,
          tool_use_id: c.id,
          is_error: true,
          content: c.id === submit?.id ? feedback : `There is no tool named ${c.name}. Use ${SUBMIT_TOOL}.`,
        })),
      });
      if (!submit) messages.push({ role: 'user', content: feedback });
    } else {
      messages.push({ role: 'user', content: feedback });
    }
  }
  return done(null, WRITER_PROFILE.maxAttempts);
}
