/**
 * v3 coach chat — conversation + message persistence (W32-pt2).
 *
 * Thin reads/writes over the W32-pt1 tables. RLS enforces coach
 * ownership at the DB layer; this module trusts the supplied client
 * and just shapes the data.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import type {
  ChatConversation,
  ChatMessage,
  ChatMessageStatus,
  ChatRole,
  ToolCallRecord,
  ToolResultRecord,
} from './types';

type Sb = SupabaseClient<Database>;

/** Columns selected for every message read (single source of truth). */
const MESSAGE_COLUMNS =
  'id, conversation_id, role, content, tool_calls, tool_results, cost_usd, created_at, client_turn_id, status, ui_parts';

function rowToMessage(row: {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_calls: Json | null;
  tool_results: Json | null;
  cost_usd: number | null;
  created_at: string;
  client_turn_id?: string | null;
  status?: string | null;
  ui_parts?: Json | null;
}): ChatMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role as ChatRole,
    content: row.content,
    tool_calls: (row.tool_calls as unknown as ToolCallRecord[] | null) ?? null,
    tool_results: (row.tool_results as unknown as ToolResultRecord[] | null) ?? null,
    cost_usd: row.cost_usd,
    created_at: row.created_at,
    client_turn_id: row.client_turn_id ?? null,
    // Legacy rows (status NULL) read as a completed answer.
    status: (row.status as ChatMessageStatus | null) ?? null,
    // Legacy rows have no parts and render from `content` alone.
    ui_parts: Array.isArray(row.ui_parts) ? (row.ui_parts as unknown[]) : null,
  };
}

export async function listConversations(sb: Sb): Promise<ChatConversation[]> {
  const { data } = await sb
    .from('golf_coachhelm_chat_conversations')
    .select('id, coach_id, title, pinned, archived_at, created_at, updated_at')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  return (data ?? []) as ChatConversation[];
}

export async function getConversation(
  sb: Sb,
  conversation_id: string,
): Promise<ChatConversation | null> {
  const { data } = await sb
    .from('golf_coachhelm_chat_conversations')
    .select('id, coach_id, title, pinned, archived_at, created_at, updated_at')
    .eq('id', conversation_id)
    .maybeSingle();
  return (data as ChatConversation) ?? null;
}

export async function listMessages(sb: Sb, conversation_id: string): Promise<ChatMessage[]> {
  const { data } = await fromUntyped(sb, 'golf_coachhelm_chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true });
  return (data ?? []).map(rowToMessage);
}

/**
 * P1-11 — idempotency probe. Returns the existing assistant turn for a given
 * client_turn_id in this conversation, if one was already completed. The send
 * route uses this so a retried request returns the prior answer instead of
 * re-running the (paid) agent and creating a duplicate turn.
 */
export async function findAssistantTurn(
  sb: Sb,
  conversation_id: string,
  client_turn_id: string,
): Promise<ChatMessage | null> {
  const { data } = await fromUntyped(sb, 'golf_coachhelm_chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversation_id)
    .eq('client_turn_id', client_turn_id)
    .eq('role', 'assistant')
    // A FAILED turn is not an answer, and must not satisfy idempotency.
    //
    // This is the "replayed" branch in the stream route: a matching assistant
    // row short-circuits the request and returns the stored turn instead of
    // running the model. Without this filter a turn that failed — and was
    // stored anyway — poisons its own key: every retry replays the failure and
    // the model is never called again for that question.
    .neq('status', 'failed')
    .maybeSingle();
  return data ? rowToMessage(data) : null;
}

export async function createConversation(
  sb: Sb,
  args: { coach_id: string; title?: string | null },
): Promise<ChatConversation> {
  const { data, error } = await sb
    .from('golf_coachhelm_chat_conversations')
    .insert({ coach_id: args.coach_id, title: args.title ?? null })
    .select('id, coach_id, title, pinned, archived_at, created_at, updated_at')
    .single();
  if (error) throw new Error(`createConversation: ${error.message}`);
  return data as ChatConversation;
}

export async function touchConversation(sb: Sb, conversation_id: string): Promise<void> {
  await sb
    .from('golf_coachhelm_chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversation_id);
}

export async function appendMessage(
  sb: Sb,
  args: {
    conversation_id: string;
    role: ChatRole;
    content?: string | null;
    tool_calls?: ToolCallRecord[] | null;
    tool_results?: ToolResultRecord[] | null;
    cost_usd?: number | null;
    client_turn_id?: string | null;
    status?: ChatMessageStatus | null;
    /** Durable UI parts — see {@link ChatMessage.ui_parts}. */
    ui_parts?: unknown;
  },
): Promise<ChatMessage> {
  const { data, error } = await fromUntyped(sb, 'golf_coachhelm_chat_messages')
    .insert({
      conversation_id: args.conversation_id,
      role: args.role,
      content: args.content ?? null,
      tool_calls: (args.tool_calls as unknown as Json) ?? null,
      tool_results: (args.tool_results as unknown as Json) ?? null,
      cost_usd: args.cost_usd ?? null,
      client_turn_id: args.client_turn_id ?? null,
      status: args.status ?? null,
      ui_parts: (args.ui_parts as Json | undefined) ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(`appendMessage: ${error.message}`);
  return rowToMessage(data);
}

/**
 * P1-11 — idempotently record the user turn. When a `client_turn_id` is present
 * the partial unique index (conversation_id, role, client_turn_id) makes a
 * retried send a no-op upsert (returns the existing row) instead of a duplicate
 * user bubble. Without a client_turn_id it behaves like a plain append.
 */
export async function upsertUserTurn(
  sb: Sb,
  args: { conversation_id: string; content: string; client_turn_id?: string | null },
): Promise<ChatMessage> {
  if (!args.client_turn_id) {
    return appendMessage(sb, {
      conversation_id: args.conversation_id,
      role: 'user',
      content: args.content,
    });
  }
  const { data, error } = await fromUntyped(sb, 'golf_coachhelm_chat_messages')
    .upsert(
      {
        conversation_id: args.conversation_id,
        role: 'user',
        content: args.content,
        client_turn_id: args.client_turn_id,
      },
      { onConflict: 'conversation_id,role,client_turn_id', ignoreDuplicates: false },
    )
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(`upsertUserTurn: ${error.message}`);
  return rowToMessage(data);
}
