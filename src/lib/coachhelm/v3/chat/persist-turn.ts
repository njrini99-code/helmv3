/**
 * Shared post-agent persistence for coach chat turns (batch send + stream).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import {
  appendMessage,
  listMessages,
  touchConversation,
} from '@/lib/coachhelm/v3/chat/persistence';
import {
  requiresDataGrounding,
  type ToolCallRecord,
  type ToolResultRecord,
} from '@/lib/coachhelm/v3/chat/types';
import { estimateCostUsd, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { recordSpend } from '@/lib/coachhelm/v3/llm/budget';

export const FAILED_TURN_TEXT =
  "I couldn't complete that just now — please try again in a moment.";
export const UNGROUNDED_TURN_TEXT =
  "I couldn't ground that answer in your team's data just now, so I'd rather not guess. Please try again.";

export interface AgentTurnResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: Array<{ toolCallId: string; toolName: string; input?: unknown }>;
  toolResults?: Array<{ toolCallId: string; toolName: string; output?: unknown }>;
}

export async function persistCoachChatTurn(args: {
  supabase: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  coachId: string;
  conversationId: string;
  clientTurnId: string | null;
  userMessage: string;
  result: AgentTurnResult;
}): Promise<{ ok: true } | { ok: false; ungrounded: boolean }> {
  const { supabase, admin, coachId, conversationId, clientTurnId, userMessage, result } = args;

  const promptTokens = result.usage?.inputTokens ?? 0;
  const completionTokens = result.usage?.outputTokens ?? 0;
  const cost = estimateCostUsd(MODEL_FOR_TASK.coach_chat, promptTokens, completionTokens);

  const toolCallRecords: ToolCallRecord[] = (result.toolCalls ?? []).map((c) => ({
    tool_call_id: c.toolCallId,
    name: c.toolName,
    arguments: JSON.stringify(c.input ?? {}),
  }));
  const toolResultRecords: ToolResultRecord[] = (result.toolResults ?? []).map((r) => ({
    tool_call_id: r.toolCallId,
    name: r.toolName,
    result: r.output ?? null,
  }));

  const ungrounded =
    requiresDataGrounding(userMessage) && toolCallRecords.length === 0;

  if (ungrounded) {
    await logServerError(
      `chat: ungrounded answer to data question (0 tool calls) for coach_id=${coachId}`,
      { action: 'v3.chat.ungrounded' },
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
    await touchConversation(supabase, conversationId);
    return { ok: false, ungrounded: true };
  }

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

  await admin.from('golf_coachhelm_llm_calls').insert({
    task: 'coach_chat',
    coach_id: coachId,
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

  await recordSpend(admin, {
    coach_id: coachId,
    task: 'coach_chat',
    cost_usd: cost,
  });

  await touchConversation(supabase, conversationId);
  return { ok: true };
}

export async function persistFailedCoachChatTurn(args: {
  supabase: SupabaseClient<Database>;
  conversationId: string;
  clientTurnId: string | null;
}): Promise<void> {
  const { supabase, conversationId, clientTurnId } = args;
  await appendMessage(supabase, {
    conversation_id: conversationId,
    role: 'assistant',
    content: FAILED_TURN_TEXT,
    status: 'failed',
    client_turn_id: clientTurnId,
  });
  await touchConversation(supabase, conversationId);
}

export async function listConversationMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
) {
  return listMessages(supabase, conversationId);
}
