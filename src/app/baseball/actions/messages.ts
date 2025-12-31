/**
 * Baseball Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * Maintained for backward compatibility with existing imports.
 */

export {
  sendBaseballMessage as sendMessage,
  createBaseballConversation as createConversation,
  markBaseballMessagesAsRead as markMessagesAsRead,
} from '@/app/actions/messages';
