'use server';

/**
 * Baseball Messaging Actions
 *
 * This file wraps the consolidated messaging actions from @/app/actions/messages
 * Maintained for backward compatibility with existing imports.
 *
 * NOTE: these are async function wrappers, not plain `export { x as y } from`
 * re-exports. A `'use server'` file's exports must each be declared as an
 * async function directly in the file — a bare re-export is treated as a
 * non-async export and fails the Next.js build.
 */

import {
  sendBaseballMessage,
  createBaseballConversation,
  markBaseballMessagesAsRead,
} from '@/app/actions/messages';
import { createClient } from '@/lib/supabase/server';

export async function sendMessage(conversationId: string, content: string) {
  return sendBaseballMessage(conversationId, content);
}

export async function createConversation(participantUserIds: string[]) {
  return createBaseballConversation(participantUserIds);
}

export async function markMessagesAsRead(conversationId: string) {
  return markBaseballMessagesAsRead(conversationId);
}

/**
 * Resolve the auth user_id for a baseball player by their player_id.
 * Coach-only: used when starting a conversation from the Discover peek panel.
 */
export async function getPlayerUserId(playerId: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return null;

  const { data: player, error } = await supabase
    .from('baseball_players')
    .select('user_id')
    .eq('id', playerId)
    .single();

  if (error || !player) return null;

  return player.user_id;
}
