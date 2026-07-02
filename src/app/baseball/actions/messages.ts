/**
 * Baseball Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * Maintained for backward compatibility with existing imports.
 */

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction, BaseballActionError } from '@/lib/baseball/with-baseball-action';
import { createBaseballConversation } from '@/app/actions/messages';

export {
  sendBaseballMessage as sendMessage,
  createBaseballConversation as createConversation,
  markBaseballMessagesAsRead as markMessagesAsRead,
} from '@/app/actions/messages';

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
