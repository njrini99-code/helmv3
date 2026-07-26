/**
 * ============================================================================
 * CoachHelm chat — streaming endpoint (AI SDK 7 UI message stream)
 * ----------------------------------------------------------------------------
 * Replaces the blocking POST that returned a finished JSON body. The client now
 * renders text, progress, charts, approval cards and receipts as they arrive.
 *
 * Everything load-bearing from the previous route is preserved and, where it
 * was weak, strengthened:
 *
 *   auth + ownership   the coach is resolved from the session; the conversation
 *                      must belong to them; RLS backs both.
 *   idempotency        an unchanged `client_turn_id` returns the stored turn
 *                      instead of re-running the (paid) model.
 *   budget             the pre-flight gate still runs BEFORE the user turn is
 *                      appended, so an exhausted budget leaves no orphan.
 *   cost logging       token usage lands in `golf_coachhelm_llm_calls` and the
 *                      day's running spend, from the stream's finish callback.
 *   gateway            provider selection stays behind one abstraction.
 *   grounding          upgraded from "did a tool run" to auditing the finished
 *                      text against the measurements the turn actually produced.
 *   durability         UI parts are persisted, so a reload reproduces the
 *                      charts and receipts rather than only the prose.
 * ========================================================================== */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type UIMessage,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import {
  estimateCachedCostUsd,
  estimateCostUsd,
  MODEL_FOR_TASK,
} from '@/lib/coachhelm/v3/llm/types';
import { checkBudget, recordSpend } from '@/lib/coachhelm/v3/llm/budget';
import {
  CoachContextError,
  resolveCoachChatContext,
  type CoachChatContext,
} from '@/lib/coachhelm/v3/chat/context';
import { buildCoachTools, isConfirmRequired } from '@/lib/coachhelm/v3/chat/agent-tools';
import { buildInstructions } from '@/lib/coachhelm/v3/chat/instructions';
import {
  auditNumericClaims,
  collectNumbers,
  type Measurement,
  type MeasurementSeries,
  type ToolEnvelope,
} from '@/lib/coachhelm/v3/chat/provenance';
import {
  appendMessage,
  createConversation,
  findAssistantTurn,
  getConversation,
  listMessages,
  touchConversation,
  upsertUserTurn,
} from '@/lib/coachhelm/v3/chat/persistence';

export const maxDuration = 120;

/** Worst-case one-turn spend, for the pre-flight gate only. */
const CHAT_TURN_COST_ESTIMATE_USD = estimateCostUsd(MODEL_FOR_TASK.coach_chat, 12000, 2500);

const Body = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  /** Full UI message list from `useChat`. */
  messages: z.array(z.unknown()).min(1),
  client_turn_id: z.string().min(1).max(128),
});

/**
 * The parts of a turn that may be stored and replayed to the coach.
 *
 * Reasoning is excluded twice — once at the transport (`sendReasoning: false`)
 * and again here — because the two protect against different failures. The
 * transport flag stops it reaching the browser; this stops an SDK default
 * change quietly filling the conversation table with model deliberation that a
 * reload would then hand back to the client.
 */
function publishableParts(parts: readonly { type: string }[]): unknown[] {
  return parts.filter((p) => p.type !== 'reasoning');
}

const UNGROUNDED_NOTE =
  "\n\n_Some figures in this answer could not be traced back to your program's data, so I've flagged it rather than presenting them as fact. Please ask again._";

export async function POST(req: NextRequest) {
  let ctx: CoachChatContext;
  const supabase = await createClient();

  try {
    ctx = await resolveCoachChatContext(supabase);
  } catch (err) {
    if (err instanceof CoachContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    await logServerError(`chat/stream: context resolution failed`, { action: 'v3.chat.stream.ctx' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const uiMessages = parsed.data.messages as UIMessage[];
  const clientTurnId = parsed.data.client_turn_id;
  const lastUser = [...uiMessages].reverse().find((m) => m.role === 'user');
  const userText = textOf(lastUser);

  // Is this a new question, or the continuation of one the coach already asked?
  //
  // When an action is approved, the client resubmits the SAME thread so the
  // suspended tool call can run. There is no new user message in it — the
  // approval rides on the assistant message as a tool-approval-response part, so
  // the last entry is the assistant, not the coach.
  //
  // `lastUser` still resolves to the original question in that case, which is
  // correct for the model (it needs the full thread) and wrong for persistence:
  // the resubmit carries a fresh `client_turn_id`, so the upsert's
  // (conversation_id, role, client_turn_id) conflict target does not match the
  // stored turn and it would INSERT the coach's question a second time. Every
  // approved action would leave a duplicate of the question above it.
  const isApprovalContinuation = uiMessages[uiMessages.length - 1]?.role !== 'user';

  // ── Conversation: load (and verify ownership) or create ──────────────────
  let conversationId = parsed.data.conversation_id ?? null;
  if (conversationId) {
    const existing = await getConversation(supabase, conversationId);
    if (!existing || existing.coach_id !== ctx.coach_id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    // Idempotency: an already-answered turn is returned, not re-run.
    const done = await findAssistantTurn(supabase, conversationId, clientTurnId);
    if (done) {
      const messages = await listMessages(supabase, conversationId);
      return NextResponse.json({ conversation_id: conversationId, replayed: true, messages });
    }
  } else {
    const created = await createConversation(supabase, {
      coach_id: ctx.coach_id,
      title: userText.slice(0, 60) || 'New conversation',
    });
    conversationId = created.id;
  }

  // ── Budget gate BEFORE the user turn is appended ─────────────────────────
  const admin = createAdminClient();
  const gate = await checkBudget(admin, ctx.coach_id, CHAT_TURN_COST_ESTIMATE_USD);
  if (!gate.allowed) {
    // "Reached your daily limit" is the wrong sentence for a coach whose team
    // was switched off, and both are the wrong sentence for an account we
    // could not resolve at all. A coach who is told the wrong thing waits for
    // tomorrow instead of asking the one person who can fix it.
    const message =
      gate.fallback_reason === 'budget_unresolved'
        ? 'CoachHelm could not verify your program’s analysis settings. Contact support — this is not something waiting will fix.'
        : gate.fallback_reason === 'budget_disabled'
          ? 'AI analysis is switched off for your program. An administrator can turn it on in coaching settings.'
          : 'You have reached today’s analysis limit for your program. It resets tomorrow.';
    return NextResponse.json(
      { error: message, reason: gate.fallback_reason ?? 'budget_gated' },
      { status: 429 },
    );
  }

  if (userText && !isApprovalContinuation) {
    await upsertUserTurn(supabase, {
      conversation_id: conversationId,
      content: userText,
      client_turn_id: clientTurnId,
    });
  }

  // Provider selection stays behind one abstraction: the coach's own Anthropic
  // key when present, else the gateway model string. No provider name appears
  // in tool or UI code.
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic('claude-sonnet-5')
    : MODEL_FOR_TASK.coach_chat;

  const startedAt = Date.now();
  let firstTokenMs: number | null = null;

  // Everything the turn measured, for the post-generation claim audit.
  const measurements: Measurement[] = [];
  const seriesAll: MeasurementSeries[] = [];
  // Numbers a tool returned in its structured `detail` — team averages, round
  // rows, RSVP counts. The model may legitimately cite these, so they count as
  // supported. See auditNumericClaims' `extraSupported`.
  const detailNumbers: number[] = [];
  const collect = (envelope: ToolEnvelope) => {
    measurements.push(...envelope.measurements);
    seriesAll.push(...envelope.series);
    if (envelope.detail !== undefined) detailNumbers.push(...collectNumbers(envelope.detail));
  };

  const convId = conversationId;
  // Captured in `execute` so `onFinish` can bill ACTUAL tokens, not the gate's
  // worst-case estimate. See recordTurnCost below.
  let usagePromise: Promise<{ inputTokens?: number; outputTokens?: number }> | null = null;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const tools = buildCoachTools({ sb: supabase, ctx, conversationId: convId, writer, collect });

      const result = streamText({
        model,
        // ── Prompt caching on the static prefix ─────────────────────────
        //
        // One turn is several model calls: the agent loop re-sends the system
        // prompt AND every tool definition on each step, and the ledger shows
        // what that costs — a turn's median input is 19,120 tokens while the
        // smallest single-step turn is 3,363. Most of the difference is the
        // same prefix, paid for again and again.
        //
        // A cache breakpoint on the system block covers the tool definitions
        // too (Anthropic orders the payload tools → system → messages and
        // caches everything before the breakpoint), so steps 2..N of a turn
        // read the whole prefix at a tenth of the input rate.
        //
        // This only works because `buildInstructions` is stable: it formats the
        // date to the DAY, not to an ISO timestamp. A prefix carrying
        // `new Date().toISOString()` would change on every request and could
        // never produce a cache hit — worth preserving deliberately if that
        // string is ever edited.
        instructions: {
          role: 'system',
          content: buildInstructions(ctx, new Date().toISOString()),
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        },
        // Pass the tool set so tool parts from earlier turns convert correctly —
        // without it, a resumed approval loses the call it belongs to.
        messages: await convertToModelMessages(uiMessages, { tools }),
        tools,
        // Every mutating tool suspends for an explicit coach decision. This is
        // the gate the whole action framework rests on — a model cannot reach
        // a write, only an approval request.
        toolApproval: ({ toolCall }) => (isConfirmRequired(toolCall.toolName) ? 'user-approval' : 'not-applicable'),
        stopWhen: stepCountIs(8),
        onChunk: () => {
          if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
        },
        onError: ({ error }) => {
          void logServerError(
            `chat/stream: model error — ${error instanceof Error ? error.message : String(error)}`,
            { action: 'v3.chat.stream.model' },
            'warning',
          );
        },
      });

      usagePromise = result.usage;
      // `sendReasoning: false` keeps the model's private deliberation off the
      // wire entirely. It renders nowhere today, but "not rendered" is not the
      // requirement — the requirement is that it never reaches the browser,
      // where it sits in network responses and React state either way.
      writer.merge(result.toUIMessageStream({ sendStart: true, sendFinish: true, sendReasoning: false }));
    },

    /**
     * Persist the finished turn.
     *
     * Both halves matter: `content` keeps the conversation replayable to the
     * model, and `ui_parts` keeps it reproducible for the coach. Storing only
     * the first is what made a reload throw away every chart.
     */
    onFinish: async ({ messages }) => {
      try {
        const assistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (!assistant) return;

        const text = textOf(assistant);
        const unsupported = auditNumericClaims(text, measurements, seriesAll, detailNumbers);
        const grounded = unsupported.length === 0;

        if (!grounded) {
          await logServerError(
            `chat/stream: ${unsupported.length} unsupported numeric claim(s) for coach_id=${ctx.coach_id}`,
            { action: 'v3.chat.stream.ungrounded' },
            'warning',
          );
        }

        await appendMessage(supabase, {
          conversation_id: convId,
          role: 'assistant',
          content: grounded ? text : text + UNGROUNDED_NOTE,
          status: grounded ? 'complete' : 'failed',
          client_turn_id: clientTurnId,
          ui_parts: publishableParts(assistant.parts) as unknown,
        });
        await touchConversation(supabase, convId);

        // Latency telemetry: first token and total. No player name, prompt
        // text or database value — only timings and the model tier.
        if (firstTokenMs !== null && firstTokenMs > 8000) {
          await logServerError(
            `chat/stream: slow first token ${firstTokenMs}ms (total ${Date.now() - startedAt}ms) model=${MODEL_FOR_TASK.coach_chat}`,
            { action: 'v3.chat.stream.latency' },
            'warning',
          );
        }

        // Bill the turn from REPORTED token counts. Recording the gate's
        // worst-case estimate instead (which an earlier revision of this route
        // did) over-charges every short answer several times over and
        // exhausts a coach's daily budget long before they have spent it.
        await recordTurnCost({ admin, ctx, conversationId: convId, usagePromise });
      } catch (err) {
        await logServerError(
          `chat/stream: persistence failed — ${err instanceof Error ? err.message : String(err)}`,
          { action: 'v3.chat.stream.persist' },
        );
      }
    },

    /**
     * Sanitised for the wire. An upstream error message can carry provider
     * internals or echo prompt text, neither of which belongs in a browser.
     */
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/quota|credit|tier|Free tier users/i.test(message)) {
        return 'Analysis is temporarily unavailable — the model quota is exhausted.';
      }
      return 'Something went wrong while answering. Please try again.';
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { 'x-conversation-id': convId },
  });
}

/** Concatenate the text parts of a UI message. */
function textOf(message: UIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
    .trim();
}

/**
 * Record what the turn actually cost.
 *
 * The pre-flight gate reserves a conservative worst case so a turn cannot start
 * without headroom; what gets BILLED has to be the real number. Using the
 * estimate for both means a $0.01 answer is charged like a $0.12 one, and a
 * coach hits "daily budget reached" after a handful of questions.
 *
 * Telemetry carries model, latency and cost. It carries no player name, no
 * prompt text and no database value.
 */
async function recordTurnCost(args: {
  admin: ReturnType<typeof createAdminClient>;
  ctx: CoachChatContext;
  conversationId: string;
  usagePromise: Promise<LanguageModelUsage> | null;
}): Promise<void> {
  const { admin, ctx, conversationId, usagePromise } = args;
  try {
    const usage = usagePromise ? await usagePromise : undefined;
    const promptTokens = usage?.inputTokens ?? 0;
    const completionTokens = usage?.outputTokens ?? 0;
    // If the provider reported nothing, fall back to the reserved estimate
    // rather than billing zero — an unmeasured turn must not be free.
    // Cache-aware: `promptTokens` INCLUDES the cached portions, and a cache
    // read costs a tenth of a fresh token. Billing the total at the full input
    // rate would spend a coach's daily budget on tokens that were never
    // freshly processed.
    const cost =
      promptTokens + completionTokens > 0
        ? estimateCachedCostUsd(
            MODEL_FOR_TASK.coach_chat,
            promptTokens,
            completionTokens,
            usage?.inputTokenDetails,
          )
        : CHAT_TURN_COST_ESTIMATE_USD;

    await admin.from('golf_coachhelm_llm_calls').insert({
      task: 'coach_chat',
      coach_id: ctx.coach_id,
      player_id: null,
      prompt_hash: conversationId.slice(0, 16),
      model_id: MODEL_FOR_TASK.coach_chat,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: cost,
      citations: null,
      verified: false,
      fallback_to_template: false,
    });
    await recordSpend(admin, { coach_id: ctx.coach_id, task: 'coach_chat', cost_usd: cost });
  } catch {
    // Never fail a coach's answer because accounting hiccuped.
  }
}
