'use server';

/**
 * Baseball Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * Maintained for backward compatibility with existing imports.
 */

import { createClient } from '@/lib/supabase/server';

export {
  sendBaseballMessage as sendMessage,
  createBaseballConversation as createConversation,
  markBaseballMessagesAsRead as markMessagesAsRead,
} from '@/app/actions/messages';

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
