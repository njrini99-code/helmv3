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
  type UIMessage,
} from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { estimateCostUsd, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
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
    return NextResponse.json(
      { error: 'Daily analysis budget reached', reason: gate.fallback_reason ?? 'budget_gated' },
      { status: 429 },
    );
  }

  if (userText) {
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
    ? anthropic('claude-sonnet-4-6')
    : MODEL_FOR_TASK.coach_chat;

  const startedAt = Date.now();
  let firstTokenMs: number | null = null;

  // Everything the turn measured, for the post-generation claim audit.
  const measurements: Measurement[] = [];
  const seriesAll: MeasurementSeries[] = [];
  const collect = (envelope: ToolEnvelope) => {
    measurements.push(...envelope.measurements);
    seriesAll.push(...envelope.series);
  };

  const convId = conversationId;

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const tools = buildCoachTools({ sb: supabase, ctx, conversationId: convId, writer, collect });

      const result = streamText({
        model,
        instructions: buildInstructions(ctx, new Date().toISOString()),
        messages: convertToModelMessages(uiMessages),
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

      writer.merge(result.toUIMessageStream({ sendStart: true, sendFinish: true }));
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
        const unsupported = auditNumericClaims(text, measurements, seriesAll);
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
          ui_parts: assistant.parts as unknown,
        });
        await touchConversation(supabase, convId);
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

  // Cost + telemetry, recorded out of band so the response is not held up.
  void recordTurnCost({ admin, ctx, conversationId: convId, startedAt });

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
 * Record spend against the day's budget.
 *
 * Uses the same conservative per-turn estimate the gate used. The streaming
 * API reports usage on the result promise rather than synchronously, and a
 * turn whose cost is recorded late is a turn that can be spent twice — an
 * estimate applied immediately is the safer error.
 *
 * Telemetry carries the model, latency and cost. It deliberately carries no
 * player name, prompt text or database value.
 */
async function recordTurnCost(args: {
  admin: ReturnType<typeof createAdminClient>;
  ctx: CoachChatContext;
  conversationId: string;
  startedAt: number;
}): Promise<void> {
  const { admin, ctx, conversationId } = args;
  const cost = CHAT_TURN_COST_ESTIMATE_USD;
  try {
    await admin.from('golf_coachhelm_llm_calls').insert({
      task: 'coach_chat',
      coach_id: ctx.coach_id,
      player_id: null,
      prompt_hash: conversationId.slice(0, 16),
      model_id: MODEL_FOR_TASK.coach_chat,
      prompt_tokens: 0,
      completion_tokens: 0,
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
