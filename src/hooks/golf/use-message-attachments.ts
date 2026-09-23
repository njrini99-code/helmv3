'use client';

import { describeError } from '@/lib/utils/describe-error';
import { useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  uploadAttachment,
  type PendingAttachment,
  STORAGE_BUCKET,
} from '@/lib/storage/attachments';
import { sendGolfMessageWithAttachments } from '@/app/golf/actions/messages';
import type { AttachmentUploadData } from '@/app/golf/actions/message-attachments';
import { logError } from '@/lib/error-logging';

interface SendMessageWithAttachmentsOptions {
  conversationId: string;
  content: string;
  attachments?: PendingAttachment[];
  onProgress?: (attachmentId: string, progress: number) => void;
  /**
   * Stops the uploads mid-transfer (G-24). One signal for the whole send, not
   * one per file: the message is the unit here, and a message cannot be
   * committed with some of its attachments — `sendGolfMessageWithAttachments`
   * takes them all at once. Cancelling therefore abandons the send and leaves
   * the composer holding the draft, which is where the user can act on it.
   */
  signal?: AbortSignal;
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
      signal,
    }: SendMessageWithAttachmentsOptions): Promise<{
      success: boolean;
      messageId?: string;
      error?: string;
      cancelled?: boolean;
    }> => {
      /** Objects already in storage, so a give-up can take them with it. */
      const uploadedPaths: string[] = [];

      /**
       * Delete objects no message will ever reference. Its own try/catch in
       * both callers' sense: a failed cleanup must not mask the outcome that
       * caused it.
       */
      const removeOrphans = async (paths: string[], action: string) => {
        if (paths.length === 0) return;
        try {
          const supabase = createClient();
          await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        } catch (cleanupErr) {
          logError(
            cleanupErr instanceof Error ? cleanupErr : new Error(String(cleanupErr)),
            { component: 'useMessageAttachments', action, sport: 'golf', conversationId },
            'medium'
          );
        }
      };

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
              },
              signal
            );

            if (result.success && result.storagePath) {
              uploadedPaths.push(result.storagePath);
            }

            if (result.cancelled) {
              // Deliberately not logged. The user stopping their own upload is
              // not an incident, and the parallel siblings are already
              // stopping on the same signal.
              throw new Error('Upload cancelled');
            }

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
          // Message failed - clean up uploaded files.
          await removeOrphans(
            uploadResults.filter((r) => r.storagePath).map((r) => r.storagePath!),
            'cleanup-orphaned-attachments'
          );
        }

        return messageResult;
      } catch (err) {
        if (signal?.aborted) {
          // G-24 — a cancel, not a failure. Whatever finished before the
          // signal fired is an object no message will reference, so it goes
          // with the send it was part of.
          await removeOrphans(uploadedPaths, 'cleanup-cancelled-attachments');
          return { success: false, cancelled: true, error: 'Upload cancelled' };
        }
        console.error('[useMessageAttachments] Error:', describeError(err));
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
