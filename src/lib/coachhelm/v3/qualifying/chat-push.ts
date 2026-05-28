/**
 * v3 Qualifying chat push (W32).
 *
 * Inserts a pre-composed travel-brief message directly into the coach
 * chat tables. No LLM round-trip — this is a deterministic DB write
 * using the same persistence helpers the chat backend uses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  appendMessage,
  createConversation,
} from '@/lib/coachhelm/v3/chat/persistence';

type Sb = SupabaseClient<Database>;

const QUALIFYING_CONVERSATION_TITLE = 'Qualifying Updates';

/**
 * Push a travel brief into the coach's "Qualifying Updates" conversation.
 * Creates the conversation if it doesn't exist yet.
 */
export async function pushTravelBriefToChat(
  supabase: Sb,
  coach_id: string,
  brief: string,
): Promise<void> {
  const conversationId = await findOrCreateConversation(supabase, coach_id);

  await appendMessage(supabase, {
    conversation_id: conversationId,
    role: 'assistant',
    content: brief,
  });
}

async function findOrCreateConversation(
  supabase: Sb,
  coach_id: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('golf_coachhelm_chat_conversations')
    .select('id')
    .eq('coach_id', coach_id)
    .eq('title', QUALIFYING_CONVERSATION_TITLE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const created = await createConversation(supabase, {
    coach_id,
    title: QUALIFYING_CONVERSATION_TITLE,
  });
  return created.id;
}
