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
  // Alias for backward compatibility
  getGolfPlayerUserId as getPlayerUserId,
} from '@/app/actions/messages';

// Attachment actions
export {
  sendGolfMessageWithAttachments,
  getGolfMessageAttachments,
  deleteGolfMessageAttachment,
  getSignedUrlsForAttachments,
  type AttachmentUploadData,
} from './message-attachments';
