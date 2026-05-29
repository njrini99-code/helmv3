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
  getConversation,
  listMessages,
  touchConversation,
} from '@/lib/coachhelm/v3/chat/persistence';
import type { ToolCallRecord, ToolResultRecord } from '@/lib/coachhelm/v3/chat/types';
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
});

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

    // --- Conversation: load or create ---
    let conversationId = parsed.data.conversation_id;
    if (conversationId) {
      const existing = await getConversation(supabase, conversationId);
      if (!existing || existing.coach_id !== coach.id) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    } else {
      const created = await createConversation(supabase, {
        coach_id: coach.id,
        title: parsed.data.user_message.slice(0, 60),
      });
      conversationId = created.id;
    }

    // --- Append user turn ---
    await appendMessage(supabase, {
      conversation_id: conversationId,
      role: 'user',
      content: parsed.data.user_message,
    });

    // --- Budget gate (W30 governance for the chat surface) ---
    // Uses an admin client so the per-day spend table can be read/upserted
    // outside player/coach RLS. Same gate the round-review + hero-narrative
    // surfaces go through via compose() — chat is structurally different
    // (tool loop, not single-shot) so we gate here instead.
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

    // --- Build prior history as ModelMessages (skip 'tool' rows from our
    //     synthetic ledger — the agent recomputes its own tool loop).
    const prior = await listMessages(supabase, conversationId);
    const history: ModelMessage[] = prior
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content ?? '',
      }));

    // --- Run agent ---
    const agent = await buildCoachChatAgent({
      sb: supabase,
      authed_user_id: user.id,
      coach_id: coach.id,
    });

    const result = await agent.generate({ messages: history });

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
    });

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
