/**
 * v3 coach chat — send-message endpoint (W32-pt2).
 *
 * POST body:
 *   { conversation_id?: string; user_message: string }
 *
 * - conversation_id null/missing → create a new conversation
 * - Appends the user message
 * - Runs the ToolLoopAgent (Sonnet) with the full prior + new history
 * - Appends one assistant message (final text + cost) and, when the
 *   agent called tools, one synthetic "tool" message carrying the
 *   tool_calls + tool_results jsonb so the UI can render them
 * - Returns { conversation_id, messages: ChatMessage[] }
 *
 * Auth: caller must be an authenticated coach. RLS on chat tables
 * prevents cross-coach reads regardless.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { buildCoachChatAgent } from '@/lib/coachhelm/v3/chat/agent';
import {
  appendMessage,
  createConversation,
  findAssistantTurn,
  getConversation,
  listMessages,
  touchConversation,
  upsertUserTurn,
} from '@/lib/coachhelm/v3/chat/persistence';
import {
  requiresDataGrounding,
  type ToolCallRecord,
  type ToolResultRecord,
} from '@/lib/coachhelm/v3/chat/types';
import { estimateCostUsd, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { checkBudget, recordSpend } from '@/lib/coachhelm/v3/llm/budget';
import type { ModelMessage } from 'ai';

// Conservative upper bound for one chat turn (agent may loop through
// several tool calls before the final assistant text). Used only for the
// pre-flight budget gate; actual spend is recorded from the gateway's
// reported token counts.
const CHAT_TURN_COST_ESTIMATE_USD = estimateCostUsd(
  MODEL_FOR_TASK.coach_chat,
  8000, // worst-case prompt incl. tool-call ledger
  1500, // worst-case completion incl. final summary
);

const SendBody = z.object({
  conversation_id: z.string().uuid().optional(),
  user_message: z.string().min(1).max(4000),
  /**
   * P1-11 — client-supplied idempotency key for this user→assistant exchange.
   * A retried send with the same id returns the prior answer instead of
   * re-running the (paid) agent and creating a duplicate turn.
   */
  client_turn_id: z.string().min(1).max(128).optional(),
});

/** User-facing copy for a turn the agent couldn't complete. */
const FAILED_TURN_TEXT =
  "I couldn't complete that just now — please try again in a moment.";
/** User-facing copy when a data question came back ungrounded (no tool call). */
const UNGROUNDED_TURN_TEXT =
  "I couldn't ground that answer in your team's data just now, so I'd rather not guess. Please try again.";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return NextResponse.json({ error: 'Not a coach' }, { status: 403 });

    const json = await req.json();
    const parsed = SendBody.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Bad request', details: parsed.error.format() }, { status: 400 });
    }

    const clientTurnId = parsed.data.client_turn_id ?? null;

    // --- Conversation: load or create ---
    let conversationId = parsed.data.conversation_id;
    if (conversationId) {
      const existing = await getConversation(supabase, conversationId);
      if (!existing || existing.coach_id !== coach.id) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      // --- Idempotency (P1-11) ---
      // A retried send for an exchange we already answered must NOT re-run the
      // (paid) agent or append a duplicate turn. If this client_turn_id already
      // has an assistant turn, return the conversation as-is.
      if (clientTurnId) {
        const existingAssistant = await findAssistantTurn(supabase, conversationId, clientTurnId);
        if (existingAssistant) {
          const messages = await listMessages(supabase, conversationId);
          return NextResponse.json({ conversation_id: conversationId, messages });
        }
      }
    } else {
      const created = await createConversation(supabase, {
        coach_id: coach.id,
        title: parsed.data.user_message.slice(0, 60),
      });
      conversationId = created.id;
    }

    // --- Budget gate BEFORE appending the user turn (P1-11) ---
    // Gating after the user append left an orphan user-only turn whenever the
    // budget was exhausted. Gate first so an exhausted budget creates NO turn at
    // all (the client surfaces a recoverable error and can retry tomorrow).
    // Uses an admin client so the per-day spend table can be read/upserted
    // outside player/coach RLS. Same gate the round-review + hero-narrative
    // surfaces go through via compose().
    const admin = createAdminClient();
    const gate = await checkBudget(admin, coach.id, CHAT_TURN_COST_ESTIMATE_USD);
    if (!gate.allowed) {
      await logServerError(
        `chat/send: budget exhausted for coach_id=${coach.id} (${gate.fallback_reason})`,
        { action: 'v3.chat.send.budget' },
      );
      return NextResponse.json(
        {
          error: 'LLM budget exhausted for today',
          reason: gate.fallback_reason ?? 'budget_gated',
          remaining_usd: gate.remaining_usd,
        },
        { status: 429 },
      );
    }

    // --- Append (idempotent) user turn — only after the budget gate passed ---
    await upsertUserTurn(supabase, {
      conversation_id: conversationId,
      content: parsed.data.user_message,
      client_turn_id: clientTurnId,
    });

    // --- Build prior history as ModelMessages (skip 'tool' rows from our
    //     synthetic ledger — the agent recomputes its own tool loop).
    const prior = await listMessages(supabase, conversationId);
    const history: ModelMessage[] = prior
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content ?? '',
      }));

    // --- Run agent (model failures persist a visible assistant failure) ---
    const agent = await buildCoachChatAgent({
      sb: supabase,
      authed_user_id: user.id,
      coach_id: coach.id,
    });

    let result: Awaited<ReturnType<typeof agent.generate>>;
    try {
      result = await agent.generate({ messages: history });
    } catch (agentErr) {
      // Re-throw upstream-quota errors so the outer handler can map them to a
      // 503 (operational, not a per-turn failure) without persisting a turn.
      const m = agentErr instanceof Error ? agentErr.message : String(agentErr);
      const isUpstreamQuota =
        m.includes('Free tier users do not have access to this model') ||
        (m.includes('AI Gateway') && /quota|credit|tier/i.test(m));
      if (isUpstreamQuota) throw agentErr;

      // P1-11 — a model failure must leave a VISIBLE assistant failure turn (not
      // an orphan user-only turn). Persist it carrying the same client_turn_id so
      // a retry is idempotent against THIS turn.
      await logServerError(
        `chat/send: agent.generate failed — ${m}`,
        { action: 'v3.chat.send.agent' },
        'warning',
      );
      await appendMessage(supabase, {
        conversation_id: conversationId,
        role: 'assistant',
        content: FAILED_TURN_TEXT,
        status: 'failed',
        client_turn_id: clientTurnId,
      });
      await touchConversation(supabase, conversationId);
      const messages = await listMessages(supabase, conversationId);
      return NextResponse.json({ conversation_id: conversationId, messages });
    }

    // --- Cost + tool-call ledger ---
    const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    const promptTokens = usage?.inputTokens ?? 0;
    const completionTokens = usage?.outputTokens ?? 0;
    const cost = estimateCostUsd(MODEL_FOR_TASK.coach_chat, promptTokens, completionTokens);

    const toolCallRecords: ToolCallRecord[] = (result.toolCalls ?? []).map(
      (c: { toolCallId: string; toolName: string; input?: unknown }) => ({
        tool_call_id: c.toolCallId,
        name: c.toolName,
        arguments: JSON.stringify(c.input ?? {}),
      }),
    );
    const toolResultRecords: ToolResultRecord[] = (result.toolResults ?? []).map(
      (r: { toolCallId: string; toolName: string; output?: unknown }) => ({
        tool_call_id: r.toolCallId,
        name: r.toolName,
        result: r.output ?? null,
      }),
    );

    // P1-11 — grounding verification. A data-grounded question answered with ZERO
    // tool calls is not trustworthy, so we do NOT present the model's ungrounded
    // prose as fact: persist an honest failure turn and fall back. (Goal-proposal
    // turns DO call a tool, so a warranted goal still surfaces normally.)
    const ungrounded =
      requiresDataGrounding(parsed.data.user_message) && toolCallRecords.length === 0;

    if (ungrounded) {
      await logServerError(
        `chat/send: ungrounded answer to data question (0 tool calls) for coach_id=${coach.id}`,
        { action: 'v3.chat.send.ungrounded' },
        'warning',
      );
      await appendMessage(supabase, {
        conversation_id: conversationId,
        role: 'assistant',
        content: UNGROUNDED_TURN_TEXT,
        status: 'failed',
        cost_usd: cost,
        client_turn_id: clientTurnId,
      });
    } else {
      // Persist the tool ledger (every data-grounded answer) THEN the answer.
      if (toolCallRecords.length > 0) {
        await appendMessage(supabase, {
          conversation_id: conversationId,
          role: 'tool',
          content: null,
          tool_calls: toolCallRecords,
          tool_results: toolResultRecords,
        });
      }

      await appendMessage(supabase, {
        conversation_id: conversationId,
        role: 'assistant',
        content: result.text,
        cost_usd: cost,
        status: 'complete',
        client_turn_id: clientTurnId,
      });
    }

    // Mirror W30: log this call into golf_coachhelm_llm_calls so the
    // admin spend view + budget enforcement see chat costs alongside
    // round-review and hero-narrative. Use the admin client so the row
    // lands even under RLS contexts that would otherwise block.
    await admin.from('golf_coachhelm_llm_calls').insert({
      task: 'coach_chat',
      coach_id: coach.id,
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

    // Record actual spend so the next request's gate sees today's running
    // total. Without this, chat spend accumulated invisibly to checkBudget.
    await recordSpend(admin, {
      coach_id: coach.id,
      task: 'coach_chat',
      cost_usd: cost,
    });

    await touchConversation(supabase, conversationId);

    const messages = await listMessages(supabase, conversationId);
    return NextResponse.json({ conversation_id: conversationId, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Vercel AI Gateway upstream-quota errors are operational (the team's
    // gateway tier or credit balance is too low for the chosen model), not
    // code bugs. Surface a 503 with a structured reason and downgrade the
    // log severity so Sentry doesn't page on what the user can't fix.
    const isUpstreamQuota =
      message.includes('Free tier users do not have access to this model') ||
      message.includes('AI Gateway') && /quota|credit|tier/i.test(message);
    if (isUpstreamQuota) {
      await logServerError(
        `chat/send: AI Gateway upstream quota — ${message}`,
        { action: 'v3.chat.send.upstream_quota' },
        'warning',
      );
      return NextResponse.json(
        {
          error: 'Chat is temporarily unavailable',
          reason: 'upstream_quota',
        },
        { status: 503 },
      );
    }

    await logServerError(
      `chat/send failed: ${message}`,
      { action: 'v3.chat.send' },
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
