'use client';

import type { ChMessagesApi } from './types';
import type { MessagesApiCtx } from './ctx';
import { isOffline } from '../../../lib/use-action';
import { isTransientNetworkErrorMessage } from '@/lib/transient-network-error';
import { validateFile, type PendingAttachment } from '@/lib/storage/attachments';
import { haptic } from '../../../lib/haptics';

/**
 * Package B: the open thread, sending, retry, typing and the composer's recovery state.
 * Part of the `ChMessagesApi` literal that Messages.tsx composes. Add keys here and nowhere else (docs/clubhouse/messages-v2/SEAMS.md).
 */
export function useThreadApi(ctx: MessagesApiCtx): Pick<ChMessagesApi, 'drafts' | 'attachmentRecovery' | 'classDay' | 'msgs' | 'msgsLoading' | 'msgsError' | 'msgsStale' | 'refetchMsgs' | 'typing' | 'typingUserIds' | 'onTyping' | 'loadPendingAttachmentSend' | 'retryPendingAttachmentSend' | 'send' | 'sendFiles' | 'retry' | 'discard'> {
  const { data, attachmentRecovery, attempt, autoOpened, chMsgs, classOn, convTeamId, drafts, fail, getPendingAttachmentSend, msgs, privateTyping, retryPendingAttachmentSend, select, selectedId, sendMessageWithAttachments, teamClass, toast } = ctx;
  return {
      drafts,
      attachmentRecovery,
      classDay: classOn ? { day: teamClass.day, now: teamClass.now, teamId: data.teamId, convTeamId } : null,
      msgs: chMsgs,
      msgsLoading: msgs.loading,
      msgsError: !!msgs.error && !chMsgs.length,
      // The read failed but an earlier copy is on screen: it stays, marked as possibly out of date (PAGE_PERFORMANCE.md rule 4).
      msgsStale: !!msgs.error && chMsgs.length > 0,
      refetchMsgs: () => void msgs.refetch(),
      // M4: typing arrives on the private topic and on the public one (Fairway clients), and goes out on both until Fairway moves.
      typing: msgs.isOtherTyping || privateTyping.typingUserIds.length > 0,
      typingUserIds: [...new Set([...(msgs.typingUserIds ?? []), ...privateTyping.typingUserIds])],
      onTyping: (on) => {
        msgs.sendTypingStatus(on);
        privateTyping.send(on);
      },
      loadPendingAttachmentSend: async () => {
        if (!selectedId) return null;
        const pending = await getPendingAttachmentSend(selectedId);
        return pending ? { id: pending.clientMessageId, text: pending.content, replyToId: pending.replyToId, filenames: pending.attachments.map((file) => file.fileName) } : null;
      },
      retryPendingAttachmentSend: async () => {
        if (!selectedId) return 'unknown';
        if (isOffline()) {
          toast({ tone: 'error', title: "Couldn’t check this send: you’re offline", body: 'Reconnect, then retry the same send.', code: 'CH-1903' });
          return 'unknown';
        }
        try {
          const result = await retryPendingAttachmentSend(selectedId);
          if (result.sendOutcome === 'unknown') return 'unknown';
          if (result.attachmentsFailed) {
            toast({ tone: 'error', title: 'Message sent; attachments not saved', body: 'Your text was delivered. Choose the files again if they are no longer in this composer.', code: 'CH-7022' });
            return 'partial';
          }
          return result.success;
        } catch {
          return 'unknown';
        }
      },
      send: async (text, replyToId, sendOptions) => {
        try {
          if (selectedId === autoOpened) select(selectedId);
          if (sendOptions?.notifyAnyway) await msgs.sendMessage(text, replyToId ?? null, { notifyAnyway: true });
          else if (replyToId) await msgs.sendMessage(text, replyToId);
          else await msgs.sendMessage(text);
          return true;
        } catch (err) {
          // The bubble's state comes from the hook's classifySendFailure, which is this same test: the toast and the bubble
          // tell one story (audit A-06: WebKit's "Load failed" read "Couldn’t send" over a "Couldn’t confirm" bubble).
          if (isTransientNetworkErrorMessage(err instanceof Error ? err.message : String(err))) {
            fail('send', err, "Couldn’t confirm this message sent", 'It is in the thread: check it, then Retry from there if it did not arrive.', 'CH-7005', false);
          } else {
            fail('send', err, "Couldn’t send the message", 'It is in the thread, marked Not sent. Retry from there.', 'CH-7004');
          }
          return false;
        }
      },
      sendFiles: async (text, files, replyToId) => {
        if (!selectedId) return false;
        const bad = files.map((f) => ({ f, v: validateFile(f) })).find((x) => !x.v.valid);
        if (bad) {
          haptic('warning');
          toast({ tone: 'error', title: `Can’t attach ${bad.f.name}`, body: bad.v.error ?? 'That file type or size isn’t supported.', code: 'CH-7101' });
          return false;
        }
        const pending: PendingAttachment[] = files.map((file, i) => ({
          id: `ch-${Date.now()}-${i}`,
          file,
          previewUrl: '',
          metadata: {
            fileName: file.name,
            fileType: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document',
            mimeType: file.type,
            fileSize: file.size,
          },
          status: 'pending',
          uploadProgress: 0,
        }));
        let partial = false;
        let unknown = false;
        let checked = false;
        const ok = await attempt('sendFiles', { failed: "Couldn’t send the attachment", hint: 'Your message and files are still in the box. Try again.', code: 'CH-7006' }, async () => {
          let res: Awaited<ReturnType<typeof sendMessageWithAttachments>>;
          try {
            res = await sendMessageWithAttachments({ conversationId: selectedId, content: text, attachments: pending, ...(replyToId ? { replyToId } : {}) });
          } catch (err) {
            // No answer while the composer holds this attempt: the send reads as unconfirmed (CH-7023 in the composer), so
            // the toast says the same rather than "Try again" (audit A-06).
            if (!attachmentRecovery.has(selectedId)) throw err;
            unknown = true;
            fail('sendFiles', err, "Couldn’t confirm this send", 'Your draft and files are kept. Retry send checks the same attempt before sending again.', 'CH-7023', false);
            return true;
          }
          if (res.cancelled) return false;
          checked = true;
          if (res.sendOutcome === 'unknown') {
            unknown = true;
            toast({ tone: 'error', title: "Couldn’t confirm this send", body: 'Your draft and files are kept. Retry send checks the same attempt before sending again.', code: 'CH-7023' });
            return true;
          }
          if (!res.success) throw new Error(res.error || 'Attachment send failed');
          if (res.attachmentsFailed) {
            partial = true;
            toast({ tone: 'error', title: 'Message sent; attachments not saved', body: 'Your text was delivered. The files are still in the composer; send them again when ready.', code: 'CH-7022' });
          }
          return true;
        });
        return (ok && unknown) || (!ok && !checked && attachmentRecovery.has(selectedId)) ? 'unknown' : ok && partial ? 'partial' : ok;
      },
      // Through attempt() like every other change: offline it refuses with the shared notice (nothing is sent), and a
      // retry that fails again says so; the hook clears the row's pending mark when it lands.
      retry: (id) =>
        void attempt('retry', { failed: "Couldn’t send the message", hint: 'It is still in the thread, marked Not sent. Try again.', code: 'CH-7004' }, async () => {
          const sent = await msgs.retryMessage(id);
          if (!sent) {
            haptic('error');
            toast({ tone: 'error', title: "Couldn’t send the message", body: 'It is still in the thread, marked Not sent. Try again.', code: 'CH-7004' });
            return false;
          }
          return true;
        }),
      discard: (id) => msgs.discardFailedMessage(id)
  };
}
