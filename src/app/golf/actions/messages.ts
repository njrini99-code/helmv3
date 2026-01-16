/**
 * Golf Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * and attachment actions from @/app/golf/actions/message-attachments
 * Maintained for backward compatibility with existing imports.
 */

'use server';

import { createClient } from '@/lib/supabase/server';

export {
  sendGolfMessage,
  createGolfConversation,
  markGolfMessagesAsRead,
  createGolfTeamBroadcast,
  getGolfTeamPlayersForBroadcast,
  updateGolfMessage,
  deleteGolfMessage,
} from '@/app/actions/messages';

/**
 * Get the user_id for a golf player by their player_id
 * Used when starting conversations from the roster page
 */
export async function getPlayerUserId(playerId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from('golf_players')
    .select('user_id')
    .eq('id', playerId)
    .single();

  if (error || !player) {
    console.error('[getPlayerUserId] Error:', error);
    return null;
  }

  return player.user_id;
}

// Attachment actions
export {
  sendGolfMessageWithAttachments,
  getGolfMessageAttachments,
  deleteGolfMessageAttachment,
  getSignedUrlsForAttachments,
  type AttachmentUploadData,
} from './message-attachments';
