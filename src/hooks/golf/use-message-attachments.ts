'use client';

import { describeError } from '@/lib/utils/describe-error';
import { useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  uploadAttachment,
  type PendingAttachment,
  STORAGE_BUCKET,
} from '@/lib/storage/attachments';
import { sendGolfMessageWithAttachments } from '@/app/golf/actions/messages';
import type { AttachmentUploadData, AttachmentSendResult } from '@/app/golf/actions/message-attachments';
import { logError } from '@/lib/error-logging';
import { withOneTransportRetry } from '@/lib/transient-network-error';
import { getCacheEpoch } from '@/lib/golf/client-resource-cache';
import { isUuid } from '@/lib/utils/uuid';

export interface PendingAttachmentSend {
  version: 1;
  userId: string;
  conversationId: string;
  clientMessageId: string;
  content: string;
  replyToId: string | null;
  attachments: AttachmentUploadData[];
}

interface AttachmentAttempt {
  key: string;
  id: string;
  metadata?: AttachmentUploadData[];
  busy: boolean;
  hasStarted?: boolean;
}

// Same namespace as client-resource-cache: sign-out removes pending content.
const PENDING_STORAGE_PREFIX = 'helm.golf.cache.v1:pending-attachment-send:';
const pendingStorageKey = (userId: string, conversationId: string) =>
  `${PENDING_STORAGE_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(conversationId)}`;
const pendingAttemptKey = (userId: string, conversationId: string) => JSON.stringify([userId, conversationId]);
const unknownResult = (messageId?: string): AttachmentSendResult => ({ success: false, sendOutcome: 'unknown', messageId,
  error: 'Could not confirm this attachment send. Check the thread or retry this same send.' });

async function authenticatedViewer(): Promise<string> {
  const { data: { user }, error } = await createClient().auth.getUser();
  if (error || !user) throw new Error('Sign in to confirm this attachment send');
  return user.id;
}

function readPending(userId: string, conversationId: string): PendingAttachmentSend | null {
  const raw = window.sessionStorage.getItem(pendingStorageKey(userId, conversationId));
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<PendingAttachmentSend>;
  if (value.version !== 1 || value.userId !== userId || value.conversationId !== conversationId ||
    !isUuid(value.clientMessageId) || typeof value.content !== 'string' ||
    !(value.replyToId === null || isUuid(value.replyToId)) || !Array.isArray(value.attachments) ||
    !value.attachments.length || value.attachments.some((a) => !a || !isUuid(a.id) ||
      typeof a.fileName !== 'string' || typeof a.storagePath !== 'string' || typeof a.mimeType !== 'string' ||
      !['image', 'video', 'document', 'audio'].includes(a.fileType) || typeof a.fileSize !== 'number')) {
    throw new Error('Stored attachment send could not be verified. Check the thread before sending another attachment.');
  }
  return value as PendingAttachmentSend;
}

function newSendId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

interface SendMessageWithAttachmentsOptions {
  conversationId: string;
  content: string;
  replyToId?: string | null;
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
  const fileIds = useRef(new WeakMap<File, string>());
  const attempts = useRef(new Map<string, AttachmentAttempt>());
  const epochAtMount = useRef(getCacheEpoch());

  const getPendingAttachmentSend = useCallback(async (conversationId: string): Promise<PendingAttachmentSend | null> => {
    if (getCacheEpoch() !== epochAtMount.current) return null;
    // No marker anywhere proves absence without slowing every ordinary thread
    // opening with a remote auth read. Access errors still propagate to the UI.
    let hasMarker = false;
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      if (window.sessionStorage.key(i)?.startsWith(PENDING_STORAGE_PREFIX)) { hasMarker = true; break; }
    }
    if (!hasMarker) return null;
    const userId = await authenticatedViewer();
    if (getCacheEpoch() !== epochAtMount.current) return null;
    return readPending(userId, conversationId);
  }, []);

  const performPendingSend = useCallback(async (pending: PendingAttachmentSend, attempt: AttachmentAttempt): Promise<AttachmentSendResult> => {
    const key = pendingAttemptKey(pending.userId, pending.conversationId);
    try {
      const userId = await authenticatedViewer();
      if (getCacheEpoch() !== epochAtMount.current || userId !== pending.userId) {
        attempt.busy = false;
        return unknownResult(pending.clientMessageId);
      }
      const current = readPending(pending.userId, pending.conversationId);
      if (current && current.clientMessageId !== pending.clientMessageId) {
        attempt.busy = false;
        return unknownResult(pending.clientMessageId);
      }
      // Required before every request. A denied/quota-limited store must never
      // let a server write proceed with an identity lost on the next reload.
      window.sessionStorage.setItem(pendingStorageKey(pending.userId, pending.conversationId), JSON.stringify(pending));
    } catch (error) {
      attempt.busy = false;
      if (!attempt.hasStarted) attempts.current.delete(key);
      return { success: false, sendOutcome: attempt.hasStarted ? 'unknown' : 'refused', messageId: pending.clientMessageId,
        error: error instanceof Error ? error.message : 'Could not preserve the attachment retry state' };
    }
    try {
      const previouslyStarted = !!attempt.hasStarted;
      let requests = 0;
      const send = async () => {
        const userId = await authenticatedViewer();
        if (getCacheEpoch() !== epochAtMount.current || userId !== pending.userId) return unknownResult(pending.clientMessageId);
        const current = readPending(pending.userId, pending.conversationId);
        if (current && current.clientMessageId !== pending.clientMessageId) return unknownResult(pending.clientMessageId);
        requests += 1;
        attempt.hasStarted = true;
        return sendGolfMessageWithAttachments(pending.conversationId, pending.content,
          pending.attachments, pending.replyToId, pending.clientMessageId, pending.userId);
      };
      let result = await withOneTransportRetry(send, 750);
      if (result.sendOutcome === 'unknown') result = await send();
      // A refusal on replay proves only that THIS request was refused. It
      // cannot erase evidence of an earlier write whose response was lost.
      if (!result.success && (previouslyStarted || requests > 1)) return unknownResult(pending.clientMessageId);
      if (!result.success && result.sendOutcome !== 'unknown') result = { ...result, sendOutcome: 'refused' };
      // An old response cannot confirm the new session's composer or erase a
      // newer request marker after logout/login or another hook instance.
      if (getCacheEpoch() !== epochAtMount.current) return unknownResult(pending.clientMessageId);
      const stored = readPending(pending.userId, pending.conversationId);
      if (stored && stored.clientMessageId !== pending.clientMessageId) return unknownResult(pending.clientMessageId);
      if (result.sendOutcome !== 'unknown') {
        if (attempts.current.get(key)?.id === pending.clientMessageId) attempts.current.delete(key);
        if (stored?.clientMessageId === pending.clientMessageId) {
          window.sessionStorage.removeItem(pendingStorageKey(pending.userId, pending.conversationId));
        }
      }
      return result;
    } catch {
      // The server may have committed. Preserve the exact marker and files.
      return unknownResult(pending.clientMessageId);
    } finally {
      attempt.busy = false;
    }
  }, []);

  const retryPendingAttachmentSend = useCallback(async (conversationId: string): Promise<AttachmentSendResult> => {
    try {
      const pending = await getPendingAttachmentSend(conversationId);
      if (!pending) return { success: false, sendOutcome: 'refused', error: 'No unconfirmed attachment send is available' };
      const key = pendingAttemptKey(pending.userId, conversationId);
      const cached = attempts.current.get(key);
      const existing = cached?.id === pending.clientMessageId ? cached : undefined;
      if (existing?.busy) return unknownResult(pending.clientMessageId);
      const attempt = existing ?? { key: 'recovered', id: pending.clientMessageId, metadata: pending.attachments, busy: false, hasStarted: true };
      attempt.busy = true;
      attempts.current.set(key, attempt);
      return performPendingSend(pending, attempt);
    } catch (error) {
      return { ...unknownResult(), error: error instanceof Error ? error.message : 'Could not confirm this attachment send' };
    }
  }, [getPendingAttachmentSend, performPendingSend]);
  const sendMessageWithAttachments = useCallback(
    async ({
      conversationId,
      content,
      replyToId,
      attachments,
      onProgress,
      signal,
    }: SendMessageWithAttachmentsOptions): Promise<{
      success: boolean;
      messageId?: string;
      error?: string;
      cancelled?: boolean;
      /** Text was delivered, but the attachment metadata batch failed. */
      attachmentsFailed?: boolean;
      sendOutcome?: 'refused' | 'unknown';
    }> => {
      /** Objects already in storage, so a give-up can take them with it. */
      const uploadedPaths: string[] = [];
      let attempt: AttachmentAttempt | undefined;
      let attemptKey: string | undefined;

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
        const userId = await authenticatedViewer();
        if (getCacheEpoch() !== epochAtMount.current) return unknownResult();
        attemptKey = pendingAttemptKey(userId, conversationId);
        const recovered = readPending(userId, conversationId);
        // If no attachments, just call the regular send action
        if (!attachments || attachments.length === 0) {
          if (attempts.current.has(attemptKey) || recovered) {
            return { success: false, sendOutcome: 'unknown', error: 'A previous attachment send is still unconfirmed. Retry that same send first.' };
          }
          const result = replyToId
            ? await sendGolfMessageWithAttachments(conversationId, content, [], replyToId)
            : await sendGolfMessageWithAttachments(conversationId, content, []);
          return result;
        }

        const key = JSON.stringify([content, replyToId ?? null, attachments.map(({ file }) => {
          let id = fileIds.current.get(file);
          if (!id) { id = newSendId(); fileIds.current.set(file, id); }
          return id;
        })]);
        const existing = attempts.current.get(attemptKey);
        if (recovered && (!existing || recovered.clientMessageId !== existing.id)) return unknownResult(recovered.clientMessageId);
        if (existing && (existing.key !== key || existing.busy)) {
          return { success: false, sendOutcome: 'unknown', error: 'A previous attachment send is still unconfirmed. Retry that same send first.' };
        }
        attempt = existing ?? { key, id: newSendId(), busy: false };
        attempt.busy = true;
        attempts.current.set(attemptKey, attempt);
        if (signal?.aborted && attempt.hasStarted) { attempt.busy = false; return unknownResult(attempt.id); }
        if (signal?.aborted) throw new Error('Upload cancelled');

        if (!attempt.metadata) {

          // The upload path and database row share the stable send identity.
          const tempMessageId = attempt.id;

          // Upload all attachments in parallel
          const settledUploads = await Promise.allSettled(
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
          const rejected = settledUploads.find((result) => result.status === 'rejected');
          if (rejected?.status === 'rejected') throw rejected.reason;
          const uploadResults = settledUploads.map((result) => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          });

          // Prepare attachment data for server action
          const attachmentData: AttachmentUploadData[] = uploadResults.map((result) => ({
            id: newSendId(),
            fileName: result.metadata!.fileName,
            fileType: result.metadata!.fileType,
            mimeType: result.metadata!.mimeType,
            fileSize: result.metadata!.fileSize,
            storagePath: result.storagePath!,
            width: result.metadata?.width,
            height: result.metadata?.height,
            durationSeconds: result.metadata?.durationSeconds,
          }));
          attempt.metadata = attachmentData;
        }
        const pending: PendingAttachmentSend = { version: 1, userId, conversationId, clientMessageId: attempt.id,
          content, replyToId: replyToId ?? null, attachments: attempt.metadata! };
        if (signal?.aborted && attempt.hasStarted) { attempt.busy = false; return unknownResult(attempt.id); }
        if (signal?.aborted) throw new Error('Upload cancelled');
        const previouslyStarted = !!attempt.hasStarted;
        const result = await performPendingSend(pending, attempt);
        if (!previouslyStarted && result.sendOutcome === 'refused') {
          await removeOrphans(attempt.metadata!.map((attachment) => attachment.storagePath), 'cleanup-refused-attachments');
        }
        return result;
      } catch (err) {
        if (attempt) attempt.busy = false;
        if (attempt && attemptKey) attempts.current.delete(attemptKey);
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
        await removeOrphans(uploadedPaths, 'cleanup-unsubmitted-attachments');
        return {
          success: false,
          sendOutcome: 'refused',
          error: err instanceof Error ? err.message : 'Failed to send message with attachments',
        };
      }
    },
    [performPendingSend]
  );

  return {
    sendMessageWithAttachments,
    getPendingAttachmentSend,
    retryPendingAttachmentSend,
  };
}
