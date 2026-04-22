'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Attachment data from upload
 */
export interface AttachmentUploadData {
  fileName: string;
  fileType: 'image' | 'video' | 'document' | 'audio';
  mimeType: string;
  fileSize: number;
  storagePath: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

/**
 * Send a message with attachments
 * Note: Actual file upload happens client-side to Supabase Storage.
 * This action saves the message and attachment metadata to the database.
 */
export async function sendGolfMessageWithAttachments(
  conversationId: string,
  content: string,
  attachments: AttachmentUploadData[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Unauthorized' };
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

    // Determine if message has attachments
    const hasAttachments = attachments && attachments.length > 0;

    // Insert the message
    const { data: message, error: messageError } = await supabase
      .from('golf_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content || '', // Allow empty content if there are attachments
        read: false,
        has_attachments: hasAttachments,
      })
      .select('id')
      .single();

    if (messageError || !message) {
      console.error('[Attachments] Failed to insert message:', messageError);
      return { success: false, error: 'Failed to send message' };
    }

    // Insert attachment records
    if (hasAttachments) {
      const attachmentInserts = attachments.map((att) => ({
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
        console.error('[Attachments] Failed to insert attachments:', attachmentError);
        // Message was sent but attachments failed - log but don't fail completely
        // The message is already in the DB, we could try to clean up but that risks data loss
      }
    }

    // Update conversation updated_at timestamp
    await supabase
      .from('golf_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return { success: true, messageId: message.id };
  } catch (err) {
    console.error('[Attachments] Unexpected error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get attachments for a message
 */
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
      console.error('[Attachments] Failed to get attachments:', error);
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
    console.error('[Attachments] Unexpected error:', err);
    return { error: 'Failed to load attachments' };
  }
}

/**
 * Delete an attachment (only by sender)
 */
export async function deleteGolfMessageAttachment(attachmentId: string): Promise<{
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
      console.error('[Attachments] Failed to delete from storage:', storageError);
      // Continue anyway - we should still remove the DB record
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('golf_message_attachments')
      .delete()
      .eq('id', attachmentId);

    if (deleteError) {
      console.error('[Attachments] Failed to delete attachment record:', deleteError);
      return { success: false, error: 'Failed to delete attachment' };
    }

    return { success: true };
  } catch (err) {
    console.error('[Attachments] Unexpected error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get signed URLs for multiple attachments (batch operation)
 * Used when loading messages with attachments
 */
export async function getSignedUrlsForAttachments(
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
    console.error('[Attachments] Failed to get signed URLs:', err);
    return {};
  }
}
