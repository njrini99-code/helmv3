'use client';

import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  uploadAttachment,
  type PendingAttachment,
  STORAGE_BUCKET,
} from '@/lib/storage/attachments';
import {
  sendGolfMessageWithAttachments,
  type AttachmentUploadData,
} from '@/app/golf/actions/messages';
import { logError } from '@/lib/error-logging';

interface SendMessageWithAttachmentsOptions {
  conversationId: string;
  content: string;
  attachments?: PendingAttachment[];
  onProgress?: (attachmentId: string, progress: number) => void;
}

/**
 * Hook for sending messages with attachments
 *
 * Handles the full flow:
 * 1. Upload files to Supabase Storage (client-side)
 * 2. Call server action to save message and attachment metadata
 */
export function useMessageAttachments() {
  const sendMessageWithAttachments = useCallback(
    async ({
      conversationId,
      content,
      attachments,
      onProgress,
    }: SendMessageWithAttachmentsOptions): Promise<{
      success: boolean;
      messageId?: string;
      error?: string;
    }> => {
      try {
        // If no attachments, just call the regular send action
        if (!attachments || attachments.length === 0) {
          const result = await sendGolfMessageWithAttachments(conversationId, content, []);
          return result;
        }

        // Generate a temporary message ID for storage paths
        // This will be replaced by the actual message ID after insertion
        const tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Upload all attachments in parallel
        const uploadResults = await Promise.all(
          attachments.map(async (attachment) => {
            const result = await uploadAttachment(
              attachment.file,
              conversationId,
              tempMessageId,
              (progress) => {
                onProgress?.(attachment.id, progress);
              }
            );

            if (!result.success) {
              logError(
                new Error(`Failed to upload ${attachment.file.name}: ${result.error}`),
                { component: 'useMessageAttachments', action: 'upload-attachment', sport: 'golf', conversationId, fileName: attachment.file.name },
                'high'
              );
              throw new Error(`Failed to upload ${attachment.file.name}: ${result.error}`);
            }

            return {
              attachmentId: attachment.id,
              ...result,
            };
          })
        );

        // Prepare attachment data for server action
        const attachmentData: AttachmentUploadData[] = uploadResults.map((result) => ({
          fileName: result.metadata!.fileName,
          fileType: result.metadata!.fileType,
          mimeType: result.metadata!.mimeType,
          fileSize: result.metadata!.fileSize,
          storagePath: result.storagePath!,
          width: result.metadata?.width,
          height: result.metadata?.height,
          durationSeconds: result.metadata?.durationSeconds,
        }));

        // Send message with attachment metadata
        const messageResult = await sendGolfMessageWithAttachments(
          conversationId,
          content,
          attachmentData
        );

        if (!messageResult.success) {
          logError(
            new Error(messageResult.error || 'Failed to send message with attachments'),
            { component: 'useMessageAttachments', action: 'send-message-with-attachments', sport: 'golf', conversationId },
            'high'
          );
          // Message failed - clean up uploaded files. Own try/catch so a failed
          // cleanup can't mask the original send failure returned below.
          const pathsToDelete = uploadResults
            .filter((r) => r.storagePath)
            .map((r) => r.storagePath!);

          if (pathsToDelete.length > 0) {
            try {
              const supabase = createClient();
              await supabase.storage.from(STORAGE_BUCKET).remove(pathsToDelete);
            } catch (cleanupErr) {
              logError(
                cleanupErr instanceof Error ? cleanupErr : new Error(String(cleanupErr)),
                { component: 'useMessageAttachments', action: 'cleanup-orphaned-attachments', sport: 'golf', conversationId },
                'medium'
              );
            }
          }
        }

        return messageResult;
      } catch (err) {
        console.error('[useMessageAttachments] Error:', err);
        logError(
          err instanceof Error ? err : new Error(String(err)),
          { component: 'useMessageAttachments', action: 'send-message-with-attachments', sport: 'golf', conversationId },
          'high'
        );
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to send message with attachments',
        };
      }
    },
    []
  );

  return {
    sendMessageWithAttachments,
  };
}
