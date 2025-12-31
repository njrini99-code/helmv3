/**
 * Golf Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * Maintained for backward compatibility with existing imports.
 */

export {
  sendGolfMessage,
  createGolfConversation,
  markGolfMessagesAsRead,
} from '@/app/actions/messages';
