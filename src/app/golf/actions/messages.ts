/**
 * Golf Messaging Actions
 *
 * This file re-exports consolidated messaging actions from @/app/actions/messages
 * and attachment actions from @/app/golf/actions/message-attachments
 * Maintained for backward compatibility with existing imports.
 */

// Re-export golf messaging functions
export {
  sendGolfMessage,
  createGolfConversation,
  markGolfMessagesAsRead,
  createGolfTeamBroadcast,
  getGolfTeamPlayersForBroadcast,
  updateGolfMessage,
  deleteGolfMessage,
  getGolfPlayerUserId,
  searchGolfMessages,
  // Alias for backward compatibility
  getGolfPlayerUserId as getPlayerUserId,
  // Type re-exports
  type MessageSearchResult,
} from '@/app/actions/messages';

// Attachment actions
export {
  sendGolfMessageWithAttachments,
  getGolfMessageAttachments,
  deleteGolfMessageAttachment,
  getSignedUrlsForAttachments,
  type AttachmentUploadData,
} from './message-attachments';
