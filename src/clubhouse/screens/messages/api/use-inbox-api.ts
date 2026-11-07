import type { ChMessagesApi } from './types';
import type { MessagesApiCtx } from './ctx';
import { haptic } from '../../../lib/haptics';
import { markGolfMessagesAsRead } from '@/app/golf/actions/messages';
import { getPreviewUrl } from '@/app/golf/actions/documents';
import { chReport, chTrail } from '../../../lib/track';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { completeAnnouncementTask, createEnrichedAnnouncement } from '@/app/golf/actions/announcements';

/**
 * Package A: the rail, pins, search, mute and read marks, announcements.
 * Part of the `ChMessagesApi` literal that Messages.tsx composes. Add keys here and nowhere else (docs/clubhouse/messages-v2/SEAMS.md).
 */
export function useInboxApi(ctx: MessagesApiCtx): Pick<ChMessagesApi, 'pins' | 'typingByConv' | 'convs' | 'convsLoading' | 'convsError' | 'refetchConvs' | 'selectedId' | 'select' | 'searchMessages' | 'openHit' | 'focusMessageId' | 'foundMessageId' | 'messageFocused' | 'muteOf' | 'muteConversation' | 'setRead' | 'announcements' | 'annLoading' | 'annError' | 'refetchAnns' | 'selectedAnnId' | 'selectAnn' | 'announcementDetail' | 'openAnnouncementDocument' | 'acknowledge' | 'completeTask' | 'createAnnouncement'> {
  const { data, annError, annLoaded, announcementDetail, anns, attempt, badges, conversations, convs, error, focusMessageId, foundMessageId, loadAnns, loading, mark, muteConversation, muteOf, pins, refetch, rowMutes, searchMessages, select, selectedAnnId, selectedId, setAutoOpened, setFocusMessageId, setFoundMessageId, setSelectedAnnId, setSelectedId, shownConvs, toast, typingByConv } = ctx;
  return {
      pins,
      typingByConv,
      convs: shownConvs,
      convsLoading: loading,
      convsError: !!error && !conversations.length,
      refetchConvs: () => void refetch(),
      selectedId,
      select,
      searchMessages,
      // As Fairway's search does: open the thread, then go to the matched message (useFocusMessage) and mark it.
      openHit: (h) => {
        select(h.conversationId);
        setFocusMessageId(h.messageId);
      },
      focusMessageId,
      foundMessageId,
      messageFocused: (id) => {
        setFocusMessageId(null);
        setFoundMessageId(id);
      },
      muteOf,
      muteConversation: async (id, muted, hours) => {
            const ok = await muteConversation(id, muted, hours);
            if (ok) rowMutes.refresh();
            return ok;
          },
      setRead: async (id, read) => {
        if (!read) {
          // Nothing to write: the mark is this device's own (marked-unread.ts).
          mark(id, true);
          haptic('success');
          return true;
        }
        const had = convs.find((c) => c.id === id)?.unread ?? 0;
        if (!had) {
          mark(id, false);
          haptic('success');
          return true;
        }
        const ok = await attempt('markRead', { failed: "Couldn’t mark the conversation read", hint: 'It still shows as unread. Try again in a moment.', code: 'CH-7026' }, async () => {
          const r: unknown = await markGolfMessagesAsRead(id);
          if ((r as { success?: boolean } | null)?.success !== true) throw new Error('Mark read was not saved');
          mark(id, false);
          haptic('success');
          await refetch();
          void badges.refetch();
        });
        return ok;
      },
      announcements: anns,
      annLoading: !annLoaded,
      annError,
      refetchAnns: () => void loadAnns(),
      selectedAnnId,
      selectAnn: (id) => {
        setSelectedAnnId(id);
        if (id) {
          setSelectedId(null);
          setAutoOpened(null);
        }
      },
      announcementDetail,
      // A short-lived signed link per tap, as Fairway's announcement card and the Team Hub open a document (#1259).
      openAnnouncementDocument: async (documentId) => {
        const res = await getPreviewUrl(documentId);
        if (res.data?.url) return { url: res.data.url };
        chReport(new Error(res.error || 'announcement document link failed'), { surface: 'messages.announcementDocument', severity: 'low' });
        return { url: null, noContent: !!res.noContent };
      },
      acknowledge: (id) =>
        attempt('acknowledge', { failed: "Couldn’t send your acknowledgement", hint: 'Try again in a moment.', code: 'CH-7012' }, async () => {
          const r = await acknowledgeAnnouncement(id);
          if (!r.success) throw new Error(r.error || 'acknowledge failed');
          haptic('success');
          toast({ title: 'Acknowledged · coach can see you read it' });
          await loadAnns();
        }),
      completeTask: (_announcementId, taskId) =>
        attempt('completeTask', { failed: "Couldn’t mark the task done", hint: 'Try again in a moment.', code: 'CH-7013' }, async () => {
          const r = await completeAnnouncementTask(taskId);
          if (!r.success) throw new Error(r.error || 'task update failed');
          haptic('success');
          toast({ title: 'Task marked done' });
          await loadAnns();
        }),
      createAnnouncement: ({ title, body, urgent, ack }) =>
        attempt('createAnnouncement', { failed: "Couldn’t post the announcement", hint: 'Your text is still here. Try again.', code: 'CH-7014' }, async () => {
          chTrail('messages post announcement');
          const r = await createEnrichedAnnouncement({ title, body, urgency: urgent ? 'urgent' : 'normal', requiresAcknowledgement: ack, recipientPlayerIds: null, documentIds: [], inlineTasks: [] });
          if (!r.success || !r.data) throw new Error(r.error || 'announcement failed');
          haptic('success');
          toast({ title: `Posted to ${data.teamName ?? 'the team'} · ${title}` });
          await loadAnns();
          setSelectedId(null);
          setSelectedAnnId(r.data.announcementId);
        })
  };
}
