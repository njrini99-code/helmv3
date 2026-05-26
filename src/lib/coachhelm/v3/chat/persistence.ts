/**
 * v3 coach chat — conversation + message persistence (W32-pt2).
 *
 * Thin reads/writes over the W32-pt1 tables. RLS enforces coach
 * ownership at the DB layer; this module trusts the supplied client
 * and just shapes the data.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import type {
  ChatConversation,
  ChatMessage,
  ChatRole,
  ToolCallRecord,
  ToolResultRecord,
} from './types';

type Sb = SupabaseClient<Database>;

function rowToMessage(row: {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_calls: Json | null;
  tool_results: Json | null;
  cost_usd: number | null;
  created_at: string;
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
  const { data } = await sb
    .from('golf_coachhelm_chat_messages')
    .select('id, conversation_id, role, content, tool_calls, tool_results, cost_usd, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true });
  return (data ?? []).map(rowToMessage);
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
  },
): Promise<ChatMessage> {
  const { data, error } = await sb
    .from('golf_coachhelm_chat_messages')
    .insert({
      conversation_id: args.conversation_id,
      role: args.role,
      content: args.content ?? null,
      tool_calls: (args.tool_calls as unknown as Json) ?? null,
      tool_results: (args.tool_results as unknown as Json) ?? null,
      cost_usd: args.cost_usd ?? null,
    })
    .select('id, conversation_id, role, content, tool_calls, tool_results, cost_usd, created_at')
    .single();
  if (error) throw new Error(`appendMessage: ${error.message}`);
  return rowToMessage(data);
}
