'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateGolfReplyTarget } from '@/lib/golf/message-replies';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { notifyGolfMessageRecipients } from '@/lib/notifications/golf-message-fanout';
import { describeError } from '@/lib/utils/describe-error';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isClubhouseFor } from '@/clubhouse/gate';
import { CommonSchemas } from '@/lib/validation/server-action-validator';

/**
 * Attachment data from upload
 */
export interface AttachmentUploadData {
  /** Stable across retries of this attachment send; existing attachment PK. */
  id?: string;
  fileName: string;
  fileType: 'image' | 'video' | 'document' | 'audio';
  mimeType: string;
  fileSize: number;
  storagePath: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface AttachmentSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attachmentsFailed?: boolean;
  sendOutcome?: 'refused' | 'unknown';
}

function definiteDatabaseRefusal(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  // Deadlocks, serialization failures, cancellations and resource failures
  // can race another exact attempt still committing; they are not proof that
  // this logical send failed. Only stable input/constraint/auth refusals qualify.
  return typeof code === 'string' && code !== '23505' &&
    (/^(22|23)[0-9A-Z]{3}$/.test(code) || code === '42501');
}

const unknownSend = (messageId?: string): AttachmentSendResult => ({
  success: false, messageId, sendOutcome: 'unknown',
  error: 'Could not confirm this attachment send. Check the thread or retry this same send.',
});

/**
 * Attachment-aware notification preview: prefer the message text when the
 * sender wrote one, otherwise describe the attachment(s) so the email/push/
 * in-app notification isn't just a blank body for a photo-only send.
 */
function buildAttachmentPreview(content: string, attachments: AttachmentUploadData[]): string {
  const trimmed = content?.trim();
  if (trimmed) {
    return trimmed.length > 80 ? trimmed.substring(0, 80) + '…' : trimmed;
  }
  if (attachments.length > 1) {
    return `📎 ${attachments.length} attachments`;
  }
  switch (attachments[0]?.fileType) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎵 Audio';
    case 'document':
      return '📎 Document';
    default:
      return 'Sent a message';
  }
}

/**
 * Send a message with attachments
 * Note: Actual file upload happens client-side to Supabase Storage.
 * This action saves the message and attachment metadata to the database.
 * SEMGREP-ALLOW: realtime-subscribed messages UI; revalidate would cause reload loop
 */
async function sendGolfMessageWithAttachmentsImpl(
  conversationId: string,
  content: string,
  attachments: AttachmentUploadData[],
  replyToId?: string | null,
  clientMessageId?: string,
  expectedSenderId?: string,
): Promise<AttachmentSendResult> {
  let writesStarted = false;
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }
    if (expectedSenderId != null && expectedSenderId !== user.id) {
      return { success: false, sendOutcome: 'refused', error: 'The signed-in account changed before this send' };
    }

    // Verify user is a participant in this conversation
    const { data: participant } = await supabase
      .from('golf_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single();

    if (!participant) {
      return { success: false, error: 'Not a participant in this conversation' };
    }

    if (clientMessageId != null && (!CommonSchemas.uuid.safeParse(clientMessageId).success ||
      attachments.some((attachment) => !CommonSchemas.uuid.safeParse(attachment.id).success) ||
      new Set(attachments.map((attachment) => attachment.id)).size !== attachments.length)) {
      return { success: false, sendOutcome: 'refused', error: 'Invalid attachment send identity' };
    }

    const reply = await validateGolfReplyTarget(supabase, conversationId, replyToId);
    if (!reply.success) return { success: false, error: reply.error };

    // Determine if message has attachments
    const hasAttachments = attachments && attachments.length > 0;
    // Set when the attachment rows fail but the message text survives, so the
    // send still completes (timestamp, fan-out) and the sender is told the
    // truth at the end rather than the caller getting a bare success.
    let attachmentsFailed = false;

    // Insert the message
    writesStarted = true;
    const { data: insertedMessage, error: messageError } = await supabase
      .from('golf_messages')
      .insert({ // nosemgrep: helmv3-action-missing-revalidate -- realtime-subscribed messages UI; revalidate would cause reload loop
        ...(clientMessageId ? { id: clientMessageId } : {}),
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || '', // Allow empty content if there are attachments
        read: false,
        has_attachments: hasAttachments,
        ...(reply.replyToId ? { reply_to_id: reply.replyToId } : {}),
      })
      .select('id')
      .single();

    let message = insertedMessage;
    let replayedMessage = false;
    if ((messageError || !message) && clientMessageId) {
      // A lost INSERT response and a concurrent replay are the same question:
      // is this exact sender/conversation/payload already stored under our ID?
      const { data: existing, error: lookupError } = await supabase.from('golf_messages')
        .select('id, conversation_id, sender_id, content, reply_to_id, has_attachments')
        .eq('id', clientMessageId).eq('conversation_id', conversationId).maybeSingle();
      if (lookupError) return unknownSend(clientMessageId);
      if (existing) {
        if (existing.sender_id !== user.id || existing.conversation_id !== conversationId ||
          existing.content !== (content || '') || (existing.reply_to_id ?? null) !== reply.replyToId) {
          return { success: false, sendOutcome: 'refused', error: 'This send identity belongs to another message' };
        }
        if (hasAttachments && !existing.has_attachments) {
          return { success: true, messageId: existing.id, attachmentsFailed: true,
            error: 'Your message was sent, but the attachments could not be saved.' };
        }
        message = { id: existing.id };
        replayedMessage = true;
      } else if (!definiteDatabaseRefusal(messageError)) {
        return unknownSend(clientMessageId);
      }
    }

    if (!message) {
      await logServerError(`[Attachments] Failed to insert message: ${describeError(messageError)}`, { action: 'message_attachments.sendGolfMessageWithAttachments' });
      return definiteDatabaseRefusal(messageError)
        ? { success: false, sendOutcome: 'refused', error: 'Failed to send message' }
        : unknownSend(clientMessageId);
    }

    // Insert attachment records
    if (hasAttachments) {
      const attachmentInserts = attachments.map((att) => ({
        ...(clientMessageId ? { id: att.id } : {}),
        message_id: message.id,
        file_name: att.fileName,
        file_type: att.fileType,
        mime_type: att.mimeType,
        file_size: att.fileSize,
        storage_path: att.storagePath,
        width: att.width || null,
        height: att.height || null,
        duration_seconds: att.durationSeconds || null,
      }));

      const { error: attachmentError } = await supabase
        .from('golf_message_attachments')
        .insert(attachmentInserts);

      if (attachmentError) {
        let metadataConfirmed = false;
        if (clientMessageId) {
          const { data: stored, error: readError } = await supabase.from('golf_message_attachments')
            .select('id, message_id, file_name, file_type, mime_type, file_size, storage_path, width, height, duration_seconds')
            .eq('message_id', message.id);
          if (readError) return unknownSend(message.id);
          const same = stored?.length === attachmentInserts.length && attachmentInserts.every((wanted) =>
            (stored ?? []).some((row) => Object.entries(wanted).every(([key, value]) => row[key as keyof typeof row] === value)));
          if (same) {
            if (replayedMessage) return { success: true, messageId: message.id };
            metadataConfirmed = true;
          }
          // No compensation when a response was lost or another replay may
          // still be completing the exact same PK-protected metadata batch.
          if (!metadataConfirmed && (replayedMessage || !definiteDatabaseRefusal(attachmentError) || stored?.length)) {
            return unknownSend(message.id);
          }
        } else if (!definiteDatabaseRefusal(attachmentError)) {
          return unknownSend(message.id);
        }
        if (!metadataConfirmed) {
          await logServerError(`[Attachments] Failed to insert attachments: ${describeError(attachmentError)}`, { action: 'message_attachments.sendGolfMessageWithAttachments' });

          // COMPENSATE, don't swallow. The `golf_messages` row already committed
          // with `has_attachments: true`, and leaving it that way is what strands
          // the bubble permanently: the reader treats "flagged, but no attachment
          // rows" as the rows not having committed YET (see MessageThreadPane's
          // SUCCESSFUL-BUT-EMPTY branch) and offers a retry. That reasoning is
          // correct for the commit race it was written for and wrong here — this
          // failure is permanent, so the retry can never succeed and the bubble
          // stays dead for the rest of the session. Returning success on top of
          // that told the sender their photo had been delivered.
          //
          // Both compensations below are permitted for the sender by RLS:
          // golf_messages_update_v2 and golf_messages_delete are each
          // `sender_id = auth.uid()`.
          const storagePaths = attachments.map((att) => att.storagePath).filter(Boolean);
          const cleanupUploads = async () => {
            if (!storagePaths.length) return;
            // These objects were uploaded client-side and nothing references them
            // now. The uploader owns them (golf_attachments_owner_delete), and
            // this action runs as that same user.
            const { error: cleanupError } = await supabase.storage
              .from('golf-attachments')
              .remove(storagePaths);
            if (cleanupError) {
              await logServerError(`[Attachments] Failed to clean up orphaned objects: ${describeError(cleanupError)}`, { action: 'message_attachments.sendGolfMessageWithAttachments' });
            }
          };

          const trimmedContent = content?.trim() ?? '';
          if (!trimmedContent) {
            // Nothing survives — no text, no attachments. An empty bubble is
            // worse than no bubble, so remove it and report the failure, which
            // lets the composer retain the draft for a real retry.
            const { error: compensationError } = await supabase.from('golf_messages').delete().eq('id', message.id);
            if (compensationError) return unknownSend(message.id);
            await cleanupUploads();
            return { success: false, error: 'Attachments could not be saved. Nothing was sent.' };
          }

          // The text is real and already delivered. Downgrade the row to
          // text-only so it renders as what it actually is, then fall through:
          // the conversation timestamp and the recipient fan-out below still
          // owe this message, and returning here would deliver it silently.
          // buildAttachmentPreview prefers the text, so the notification body is
          // already correct for a message that no longer has attachments.
          const { error: compensationError } = await supabase
            .from('golf_messages')
            .update({ has_attachments: false }) // nosemgrep: helmv3-action-missing-revalidate -- realtime-subscribed messages UI
            .eq('id', message.id);
          if (compensationError) return unknownSend(message.id);
          await cleanupUploads();
          attachmentsFailed = true;
        }
      }
    }

    // Update conversation updated_at timestamp
    await supabase
      .from('golf_conversations')
      .update({ updated_at: new Date().toISOString() }) // nosemgrep: helmv3-action-missing-revalidate -- realtime-subscribed messages UI
      .eq('id', conversationId);

    // Fan out email/push/in-app notifications to the other participants —
    // mirrors sendGolfMessageImpl's text-only fan-out (P1: this attachments
    // path previously fired none of these, so a photo/document send was
    // invisible to the recipient until they manually opened Messages).
    //
    // 2026-08-26: runs via after(), NOT awaited in the response. Awaiting it
    // inline meant a group send paid one email + one push edge-function call
    // per participant before the sender heard back — on a 13-person team chat
    // that pushed the action past what mobile Safari would wait for, the
    // response was lost, and the composer reported failure for a send that
    // had fully landed (observed live 2026-08-26: three copies of the same
    // photo, each "failed" to the sender). Same response-loss class the round
    // submit path fixed; same after() idiom golf.ts documents for it. The
    // fan-out has its own internal try/catch and never throws.
    const fanoutPreview = buildAttachmentPreview(content, attachments);
    after(async () => {
      await notifyGolfMessageRecipients(conversationId, user.id, fanoutPreview);
    });

    if (attachmentsFailed) {
      return {
        success: true,
        messageId: message.id,
        attachmentsFailed: true,
        error: 'Your message was sent, but the attachments could not be saved.',
      };
    }

    return { success: true, messageId: message.id };
  } catch (err) {
    await logServerError(`[Attachments] Unexpected error: ${describeError(err)}`, { action: 'message_attachments.sendGolfMessageWithAttachments' });
    if (writesStarted) return unknownSend(clientMessageId);
    return {
      success: false,
      sendOutcome: 'refused',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

const observedSendGolfMessageWithAttachments = withAdminObserved(
  'sendGolfMessageWithAttachments',
  { sport: 'golf', feature: 'messaging' },
  sendGolfMessageWithAttachmentsImpl,
);

export async function sendGolfMessageWithAttachments(
  conversationId: string,
  content: string,
  attachments: AttachmentUploadData[],
  replyToId?: string | null,
  clientMessageId?: string,
  expectedSenderId?: string,
): Promise<AttachmentSendResult> {
  return observedSendGolfMessageWithAttachments(conversationId, content, attachments, replyToId, clientMessageId, expectedSenderId);
}

/**
 * Get attachments for a message
 */
async function getGolfMessageAttachmentsImpl(messageId: string): Promise<{
  attachments?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    url?: string;
    thumbnailUrl?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
  }>;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Unauthorized' };
    }

    // Get attachments
    const { data: attachments, error } = await supabase
      .from('golf_message_attachments')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true });

    if (error) {
      await logServerError(`[Attachments] Failed to get attachments: ${describeError(error)}`, { action: 'message_attachments.getGolfMessageAttachments' });
      return { error: 'Failed to load attachments' };
    }

    // Generate signed URLs for each attachment
    const attachmentsWithUrls = await Promise.all(
      (attachments || []).map(async (att) => {
        const { data: urlData } = await supabase.storage
          .from('golf-attachments')
          .createSignedUrl(att.storage_path, 3600); // 1 hour

        return {
          id: att.id,
          fileName: att.file_name,
          fileType: att.file_type,
          mimeType: att.mime_type,
          fileSize: att.file_size,
          storagePath: att.storage_path,
          url: urlData?.signedUrl,
          thumbnailUrl: att.thumbnail_url,
          width: att.width,
          height: att.height,
          durationSeconds: att.duration_seconds,
        };
      })
    );

    return { attachments: attachmentsWithUrls };
  } catch (err) {
    await logServerError(`[Attachments] Unexpected error: ${describeError(err)}`, { action: 'message_attachments.getGolfMessageAttachments' });
    return { error: 'Failed to load attachments' };
  }
}

const observedGetGolfMessageAttachments = withAdminObserved(
  'getGolfMessageAttachments',
  { sport: 'golf', feature: 'messaging' },
  getGolfMessageAttachmentsImpl,
);

export async function getGolfMessageAttachments(messageId: string): Promise<{
  attachments?: Array<{
    id: string;
    fileName: string;
    fileType: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    url?: string;
    thumbnailUrl?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
  }>;
  error?: string;
}> {
  return observedGetGolfMessageAttachments(messageId);
}

/**
 * A conversation's shared files, newest first, for the phone's Details
 * (owner decision D-48). Metadata only: no storage paths and no signed URLs;
 * opening one goes through getGolfMessageAttachments(messageId), which signs
 * a URL for that message's files. Participants only: the caller is checked
 * against golf_conversation_participants before anything is read, and the
 * read itself is RLS-scoped ("Users can view attachments in their
 * conversations"). Files on deleted messages are left out.
 *
 * HELD (D-61, docs/clubhouse/held/features/conversation-files.md): a new
 * server capability, so it answers only where the Clubhouse UI is on for the
 * caller, and refuses everywhere else until the owner releases it.
 */
async function getGolfConversationFilesImpl(conversationId: string): Promise<{
  files?: Array<{
    id: string;
    messageId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    sentAt: string | null;
    senderId: string | null;
  }>;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Unauthorized' };
    }

    const session = await getGolfSessionProfile();
    if (!(await isClubhouseFor(session?.role))) {
      return { error: 'Not available' };
    }

    const { data: membership, error: membershipError } = await supabase
      .from('golf_conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (membershipError) {
      await logServerError(`[Attachments] Failed to check conversation membership: ${describeError(membershipError)}`, { action: 'message_attachments.getGolfConversationFiles' });
      return { error: 'Failed to load files' };
    }
    if (!membership) {
      return { error: 'Not a participant in this conversation' };
    }

    const { data, error } = await supabase
      .from('golf_message_attachments')
      .select('id, message_id, file_name, mime_type, file_size, created_at, message:golf_messages!inner(conversation_id, sender_id, is_deleted)')
      .eq('message.conversation_id', conversationId)
      // In the query, so files on deleted messages don't take slots under the cap.
      .not('message.is_deleted', 'is', true)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      await logServerError(`[Attachments] Failed to list conversation files: ${describeError(error)}`, { action: 'message_attachments.getGolfConversationFiles' });
      return { error: 'Failed to load files' };
    }

    type Row = {
      id: string;
      message_id: string;
      file_name: string;
      mime_type: string;
      file_size: number;
      created_at: string | null;
      message: { conversation_id: string; sender_id: string; is_deleted: boolean | null } | null;
    };
    const files = ((data ?? []) as unknown as Row[])
      .filter((row) => row.message && !row.message.is_deleted)
      .map((row) => ({
        id: row.id,
        messageId: row.message_id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        sentAt: row.created_at,
        senderId: row.message?.sender_id ?? null,
      }));

    return { files };
  } catch (err) {
    await logServerError(`[Attachments] Unexpected error: ${describeError(err)}`, { action: 'message_attachments.getGolfConversationFiles' });
    return { error: 'Failed to load files' };
  }
}

const observedGetGolfConversationFiles = withAdminObserved(
  'getGolfConversationFiles',
  { sport: 'golf', feature: 'messaging' },
  getGolfConversationFilesImpl,
);

export async function getGolfConversationFiles(conversationId: string): Promise<{
  files?: Array<{
    id: string;
    messageId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    sentAt: string | null;
    senderId: string | null;
  }>;
  error?: string;
}> {
  return observedGetGolfConversationFiles(conversationId);
}

/**
 * Delete an attachment (only by sender)
 */
async function deleteGolfMessageAttachmentImpl(attachmentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get attachment details (verify ownership via message)
    const { data: attachment, error: fetchError } = await supabase
      .from('golf_message_attachments')
      .select('*, message:golf_messages(sender_id)')
      .eq('id', attachmentId)
      .single();

    if (fetchError || !attachment) {
      return { success: false, error: 'Attachment not found' };
    }

    // Type assertion for the joined data
    const message = attachment.message as { sender_id: string } | null;
    if (!message || message.sender_id !== user.id) {
      return { success: false, error: 'You can only delete your own attachments' };
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('golf-attachments')
      .remove([attachment.storage_path]);

    if (storageError) {
      await logServerError(`[Attachments] Failed to delete from storage: ${describeError(storageError)}`, { action: 'message_attachments.deleteGolfMessageAttachment' });
      // Continue anyway - we should still remove the DB record
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('golf_message_attachments')
      .delete() // nosemgrep: helmv3-action-missing-revalidate -- realtime-subscribed messages UI
      .eq('id', attachmentId);

    if (deleteError) {
      await logServerError(`[Attachments] Failed to delete attachment record: ${describeError(deleteError)}`, { action: 'message_attachments.deleteGolfMessageAttachment' });
      return { success: false, error: 'Failed to delete attachment' };
    }

    return { success: true };
  } catch (err) {
    await logServerError(`[Attachments] Unexpected error: ${describeError(err)}`, { action: 'message_attachments.deleteGolfMessageAttachment' });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

const observedDeleteGolfMessageAttachment = withAdminObserved(
  'deleteGolfMessageAttachment',
  { sport: 'golf', feature: 'messaging' },
  deleteGolfMessageAttachmentImpl,
);

export async function deleteGolfMessageAttachment(attachmentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return observedDeleteGolfMessageAttachment(attachmentId);
}

/**
 * Get signed URLs for multiple attachments (batch operation)
 * Used when loading messages with attachments
 */
async function getSignedUrlsForAttachmentsImpl(
  storagePaths: string[]
): Promise<Record<string, string>> {
  try {
    const supabase = await createClient();

    // Get current user (auth check)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {};
    }

    const urlMap: Record<string, string> = {};

    // Generate signed URLs in parallel
    await Promise.all(
      storagePaths.map(async (path) => {
        const { data } = await supabase.storage
          .from('golf-attachments')
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) {
          urlMap[path] = data.signedUrl;
        }
      })
    );

    return urlMap;
  } catch (err) {
    await logServerError(`[Attachments] Failed to get signed URLs: ${describeError(err)}`, { action: 'message_attachments.getSignedUrlsForAttachments' });
    return {};
  }
}

const observedGetSignedUrlsForAttachments = withAdminObserved(
  'getSignedUrlsForAttachments',
  { sport: 'golf', feature: 'messaging' },
  getSignedUrlsForAttachmentsImpl,
);

export async function getSignedUrlsForAttachments(
  storagePaths: string[]
): Promise<Record<string, string>> {
  return observedGetSignedUrlsForAttachments(storagePaths);
}
