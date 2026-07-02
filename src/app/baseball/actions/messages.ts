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

export async function sendMessage(conversationId: string, content: string) {
  return sendBaseballMessage(conversationId, content);
}

export async function createConversation(participantUserIds: string[]) {
  return createBaseballConversation(participantUserIds);
}

export async function markMessagesAsRead(conversationId: string) {
  return markBaseballMessagesAsRead(conversationId);
}
