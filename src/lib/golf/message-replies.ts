import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { CommonSchemas } from '@/lib/validation/server-action-validator';

/** Called after conversation membership is established, using that same session client. */
export async function validateGolfReplyTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  replyToId: unknown,
): Promise<{ success: true; replyToId: string | null } | { success: false; error: string }> {
  if (replyToId == null) return { success: true, replyToId: null };
  const parsed = CommonSchemas.uuid.safeParse(replyToId);
  if (!parsed.success) return { success: false, error: 'Invalid message to reply to' };
  // A self-referential FK alone permits links into another conversation.
  // Never use an admin client or fetch the parent's content to prove access.
  const { data, error } = await supabase.from('golf_messages')
    .select('id, conversation_id')
    .eq('id', parsed.data)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error || !data || data.conversation_id !== conversationId) {
    return { success: false, error: 'The message to reply to is unavailable in this conversation' };
  }
  return { success: true, replyToId: parsed.data };
}
