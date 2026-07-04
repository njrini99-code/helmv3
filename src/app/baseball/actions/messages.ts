'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
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

import 'server-only';

import {
  sendBaseballMessage,
  createBaseballConversation,
  markBaseballMessagesAsRead,
} from '@/app/actions/messages';
import { createClient } from '@/lib/supabase/server';
import { withBaseballAction, BaseballActionError } from '@/lib/baseball/with-baseball-action';

async function sendMessageImpl(conversationId: string, content: string) {
  return sendBaseballMessage(conversationId, content);
}

async function createConversationImpl(participantUserIds: string[]) {
  return createBaseballConversation(participantUserIds);
}

async function markMessagesAsReadImpl(conversationId: string) {
  return markBaseballMessagesAsRead(conversationId);
}

/**
 * Resolve the auth user_id for a baseball player by their player_id.
 * Coach-only: used when starting a conversation from the Discover peek panel.
 */
async function getPlayerUserIdImpl(playerId: string): Promise<string | null> {
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

/**
 * Coach-only: start (or resurface) a 1:1 conversation with a player, reached
 * from a player-profile surface (e.g. PlayerProfileCoachActions on
 * /baseball/dashboard/players/[id]/profile). This wraps the shared
 * createBaseballConversation primitive — which itself only checks
 * supabase.auth.getUser(), no role/capability check — with a SERVER-SIDE
 * `can_message_players` capability enforcement via withBaseballAction.
 *
 * The calling page/component gates the "Send Message" button on a real
 * coach-role check, but that UI gate is a UX affordance only, not the
 * security boundary — this is what actually stops a non-coach (e.g. a
 * player viewing another player's profile) from creating a conversation
 * with an arbitrary user by calling the action directly.
 */
export const createPlayerProfileConversation = withBaseballAction(
  'createPlayerProfileConversation',
  { featureArea: 'baseball-messages', requiredCapability: 'can_message_players' },
  async (_ctx, playerId: string) => {
    const supabase = await createClient();

    const { data: player } = await supabase
      .from('baseball_players')
      .select('user_id')
      .eq('id', playerId)
      .maybeSingle();

    if (!player?.user_id) {
      throw new BaseballActionError('Player not found');
    }

    return createBaseballConversation([player.user_id]);
  },
);

export const sendMessage = withAdminObserved(
  'sendMessage',
  { sport: 'baseball', feature: 'baseball_messages', featureArea: 'baseball-messages' },
  sendMessageImpl,
);

export const createConversation = withAdminObserved(
  'createConversation',
  { sport: 'baseball', feature: 'baseball_messages', featureArea: 'baseball-messages' },
  createConversationImpl,
);

export const markMessagesAsRead = withAdminObserved(
  'markMessagesAsRead',
  { sport: 'baseball', feature: 'baseball_messages', featureArea: 'baseball-messages' },
  markMessagesAsReadImpl,
);

export const getPlayerUserId = withAdminObserved(
  'getPlayerUserId',
  { sport: 'baseball', feature: 'baseball_messages', featureArea: 'baseball-messages' },
  getPlayerUserIdImpl,
);
