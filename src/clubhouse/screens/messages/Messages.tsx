'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGolfConversations, useGolfMessages, type GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';
import { MESSAGE_REACTIONS, summarizeReactions, useMessageReactions } from '@/hooks/golf/use-message-reactions';
import { useMessageAttachments } from '@/hooks/golf/use-message-attachments';
import {
  addGolfGroupMember,
  createGolfConversation,
  createGolfTeamBroadcast,
  getGolfConversationParticipantIdentities,
  getGolfGroupAddCandidates,
  getGolfMessageAttachments,
  leaveGolfGroup,
  searchGolfMessages,
} from '@/app/golf/actions/messages';
import { getGolfConversationFiles } from '@/app/golf/actions/message-attachments';
import { getGolfConversationMute, setGolfConversationMute } from '@/app/golf/actions/message-mute';
import { completeAnnouncementTask, createEnrichedAnnouncement, getAnnouncementDetail, getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { validateFile, type PendingAttachment } from '@/lib/storage/attachments';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type { ChMessagesData } from '../../data/messages';
import { useToast } from '../../ui/Toast';
import { useNow } from '../../lib/use-now';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, friendlyReason, isOffline } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import type { ChMessagesApi } from './MessagesView';
import { MessagesView } from './MessagesScreen';
import { firstName, type ChAnnouncement, type ChAnnouncementDetail, type ChConv, type ChFile, type ChMember, type ChMsg, type ChMute, type ChReaction, type ChReactionKey } from './model';

const isGroup = (c: GolfConversationWithMeta) => {
  const n = c.participant_count ?? c.participant_ids?.length ?? 0;
  return n > 0 ? n > 2 : !!c.is_group;
};
const EMOJI_BY_KEY = Object.fromEntries(MESSAGE_REACTIONS.map((r) => [r.label, r.emoji])) as Record<ChReactionKey, string>;
const KEY_BY_EMOJI = Object.fromEntries(MESSAGE_REACTIONS.map((r) => [r.emoji, r.label])) as Record<string, ChReactionKey>;

/**
 * Live Messages: the existing realtime hooks and server actions, mapped onto
 * the Clubhouse view. Nothing about who can message whom changes here; the
 * actions and RLS decide, and this screen reports what they say.
 */
export function Messages({ data }: { data: ChMessagesData }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const clock = useNow();
  const now = clock ? clock.toISOString() : data.now;
  const { conversations, loading, error, refetch } = useGolfConversations(data.viewerUserId, data.teamId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  const handledParams = useRef(false);
  /** Unsent drafts by conversation, so switching threads never loses what was written (71202). */
  const drafts = useRef(new Map<string, string>());
  const [paramsDone, setParamsDone] = useState(false);

  const people = useMemo(() => new Map(data.directory.map((p) => [p.userId, p])), [data.directory]);

  const convs: ChConv[] = useMemo(
    () =>
      conversations.map((c) => {
        const group = isGroup(c);
        const other = c.other_participant;
        const dir = other ? people.get(other.id) : undefined;
        return {
          id: c.id,
          group,
          title: group ? c.title?.trim() || 'Group' : dir?.name ?? other?.name ?? 'Conversation',
          subtitle: group ? '' : dir?.subtitle ?? other?.subtitle ?? '',
          memberIds: group ? (c.participant_ids ?? []).filter((id) => id !== data.viewerUserId) : other ? [other.id] : [],
          memberCount: c.participant_count ?? c.participant_ids?.length ?? 2,
          unread: c.unread_count ?? 0,
          lastAt: c.last_message?.created_at ?? c.updated_at ?? null,
          lastSenderId: c.last_message?.sender_id ?? null,
          lastText: decodeMessageContent(c.last_message?.content ?? ''),
          creatorId: c.creator_id ?? null,
        };
      }),
    [conversations, people, data.viewerUserId],
  );

  const msgs = useGolfMessages(selectedId ?? '', data.viewerUserId, { deferMarkRead: !!selectedId && selectedId === autoOpened });
  const liveIds = useMemo(() => msgs.messages.filter((m) => m.conversation_id === selectedId && !m.sendFailed).map((m) => m.id), [msgs.messages, selectedId]);
  const reactions = useMessageReactions(selectedId ?? '', liveIds, data.viewerUserId);
  const { sendMessageWithAttachments } = useMessageAttachments();

  // Desktop opens the newest thread beside the rail without marking it read (the coach hasn't read it yet).
  useEffect(() => {
    if (loading || selectedId || !convs.length || !paramsDone) return;
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 821px)').matches) {
      setSelectedId(convs[0]!.id);
      setAutoOpened(convs[0]!.id);
    }
  }, [loading, selectedId, convs, paramsDone]);

  // Deep links: ?conversation=<id>, or ?player=<golf_players.id> or ?user=<auth user id> (a player's
  // "Message coach" on Home) to open (or start) a direct thread.
  useEffect(() => {
    if (loading || handledParams.current) return;
    const conv = params.get('conversation');
    const player = params.get('player');
    const user = params.get('user');
    handledParams.current = true;
    setParamsDone(!conv && !player && !user);
    if (conv) {
      setSelectedId(conv);
      router.replace('/golf/dashboard/messages', { scroll: false });
    } else if (player || user) {
      const person = data.directory.find((p) => (player ? p.playerId === player : p.userId === user));
      router.replace('/golf/dashboard/messages', { scroll: false });
      if (!person) {
        toast({
          tone: 'error',
          title: "Couldn't open that conversation",
          body: player ? 'That player isn’t on your team, or hasn’t set up their account yet.' : 'That person isn’t on your team, or hasn’t set up their account yet.',
          code: 'CH-7001',
        });
        return;
      }
      void startDirect(person.userId);
    }
    // startDirect is stable enough for a one-shot deep link.
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback(
    (id: string | null) => {
      if (id && id === autoOpened && id === selectedId) {
        setAutoOpened(null);
        void msgs.markRead();
      } else setAutoOpened(null);
      if (id) setSelectedAnnId(null);
      setSelectedId(id);
    },
    [autoOpened, selectedId, msgs],
  );

  const fail = useCallback(
    (surface: string, err: unknown, title: string, hint: string, code: string) => {
      chReport(err, { surface: `messages.${surface}`, action: `messages.${surface}` });
      haptic('error');
      const reason = err instanceof Error ? friendlyReason(err.message) : null;
      toast({ tone: 'error', title, body: reason ?? hint, code });
    },
    [toast],
  );

  /**
   * Every Messages change runs through here, with the same rules as useAction:
   * offline, nothing is sent (CH-1903); slow, it says so once (CH-1902); a
   * failure is reported and toasted with its catalog number.
   */
  const attempt = useCallback(
    async (surface: string, copy: { failed: string; hint: string; code: string }, fn: () => Promise<boolean | void>): Promise<boolean> => {
      if (isOffline()) {
        haptic('error');
        toast({ tone: 'error', title: `${copy.failed}: you're offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
        return false;
      }
      const slow = window.setTimeout(() => toast({ title: 'Still saving…', body: 'This is taking longer than usual. Keep this page open.', code: 'CH-1902' }), CH_SLOW_SAVE_AFTER);
      try {
        return (await fn()) !== false;
      } catch (err) {
        fail(surface, err, copy.failed, copy.hint, copy.code);
        return false;
      } finally {
        window.clearTimeout(slow);
      }
    },
    [toast, fail],
  );

  const startDirect = useCallback(
    async (userId: string): Promise<boolean> => {
      const existing = convs.find((c) => !c.group && c.memberIds[0] === userId);
      if (existing) {
        setSelectedId(existing.id);
        return true;
      }
      return attempt('startDirect', { failed: "Couldn't start the conversation", hint: 'Try again in a moment.', code: 'CH-7002' }, async () => {
        chTrail('messages start direct');
        const res = await createGolfConversation([userId], data.teamId);
        if (!('conversationId' in res) || !res.conversationId) throw new Error('error' in res ? String(res.error) : 'Could not start the conversation');
        await refetch();
        setSelectedId(res.conversationId);
        haptic('success');
      });
    },
    [convs, data.teamId, refetch, attempt],
  );

  const createGroup = useCallback(
    async (userIds: string[], title: string): Promise<boolean> => {
      return attempt('createGroup', { failed: "Couldn't create the group", hint: 'Try again in a moment.', code: 'CH-7003' }, async () => {
        chTrail('messages create group');
        const res =
          data.role === 'coach'
            ? await createGolfTeamBroadcast({ teamId: data.teamId, title, selectedPlayerIds: userIds.map((u) => people.get(u)?.playerId).filter((x): x is string => !!x) })
            : await createGolfConversation(userIds, data.teamId);
        if (!('conversationId' in res) || !res.conversationId) throw new Error('error' in res ? String(res.error) : 'Could not create the group');
        // A coach's group can include other coaches (D-45): a broadcast adds players only, so they join right after.
        const coaches = data.role === 'coach' ? userIds.filter((u) => people.get(u)?.role === 'coach') : [];
        const missed: string[] = [];
        for (const coachId of coaches) {
          try {
            const added = await addGolfGroupMember(res.conversationId, coachId);
            if ('error' in added) missed.push(coachId);
          } catch {
            missed.push(coachId);
          }
        }
        await refetch();
        setSelectedId(res.conversationId);
        haptic('success');
        toast({ title: data.role === 'coach' ? `Group created · ${title}` : 'Group created' });
        if (missed.length) {
          chReport(new Error(`${missed.length} coach(es) not added to a new group`), { surface: 'messages.createGroup', severity: 'low' });
          haptic('warning');
          const names = missed.map((u) => firstName(people.get(u)?.name ?? 'A coach')).join(', ');
          toast({ tone: 'error', title: `Group created, but ${names} ${missed.length === 1 ? "wasn't" : "weren't"} added`, body: 'Add them from Details.', code: 'CH-7019' });
        }
      });
    },
    [data.role, data.teamId, people, refetch, toast, attempt],
  );

  const [members, setMembers] = useState<ChMember[] | null>(null);
  const [membersError, setMembersError] = useState(false);
  const [membersAttempt, setMembersAttempt] = useState(0);
  const selected = convs.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    setMembers(null);
    setMembersError(false);
    if (!selected?.group) return;
    let live = true;
    getGolfConversationParticipantIdentities([selected.id])
      .then((res) => {
        if (!live) return;
        if (res.error) {
          chReport(new Error(res.error), { surface: 'messages.members', severity: 'low' });
          setMembersError(true);
          return;
        }
        setMembers(
          res.participants
            .map((p) => ({ userId: p.userId, name: people.get(p.userId)?.name ?? p.name, subtitle: people.get(p.userId)?.subtitle ?? p.subtitle, role: p.type }))
            .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'coach' ? -1 : 1)),
        );
      })
      .catch((err) => {
        chReport(err, { surface: 'messages.members' });
        if (live) setMembersError(true);
      });
    return () => {
      live = false;
    };
  }, [selected?.id, selected?.group, people, membersAttempt]);

  const chMsgs: ChMsg[] = useMemo(
    () =>
      msgs.messages
        .filter((m) => m.conversation_id === selectedId)
        .map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          text: decodeMessageContent(m.content),
          at: m.created_at ?? new Date(0).toISOString(),
          mine: m.sender_id === (msgs.currentUserId ?? data.viewerUserId),
          seen: !!m.isRead,
          failed: m.sendFailed ? (m.sendOutcome ?? 'refused') : null,
          edited: !!m.edited_at,
          deleted: !!m.is_deleted,
          hasAttachments: !!m.has_attachments,
        })),
    [msgs.messages, msgs.currentUserId, selectedId, data.viewerUserId],
  );

  const reactionMap = useMemo(() => {
    const out = new Map<string, ChReaction[]>();
    for (const id of liveIds) {
      const groups = summarizeReactions(reactions.rows, id, data.viewerUserId)
        .map((g) => ({ key: KEY_BY_EMOJI[g.emoji], count: g.count, mine: g.active }))
        .filter((g): g is ChReaction => !!g.key);
      if (groups.length) out.set(id, groups);
    }
    return out;
  }, [liveIds, reactions.rows, data.viewerUserId]);

  // Announcements: the team feed, pinned above conversations.
  const [anns, setAnns] = useState<ChAnnouncement[]>([]);
  const [annError, setAnnError] = useState(false);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const loadAnns = useCallback(async () => {
    try {
      const res = await getAnnouncementsWithMeta(data.teamId, data.viewerUserId, data.role === 'coach', data.viewerPlayerId);
      if (!res.success || !res.data) throw new Error(res.error || 'announcements read failed');
      setAnnError(false);
      setAnns(
        res.data.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body ?? '',
          urgent: a.urgency === 'urgent' || a.urgency === 'high',
          publishedAt: a.published_at ?? a.publish_at ?? a.created_at,
          requiresAck: !!a.requires_acknowledgement,
          ackCount: a.acknowledged_count ?? 0,
          total: a.total_recipients ?? a.recipient_count ?? 0,
          acknowledgedByMe: !!a.has_player_acknowledged,
          taskCount: a.task_count ?? 0,
          completedTaskCount: a.completed_task_count ?? 0,
          docCount: a.document_count ?? 0,
        })),
      );
    } catch (err) {
      chReport(err, { surface: 'messages.announcements', severity: 'low' });
      setAnnError(true);
    }
  }, [data.teamId, data.viewerUserId, data.role, data.viewerPlayerId]);
  useEffect(() => {
    void loadAnns();
  }, [loadAnns]);

  const announcementDetail = useCallback(
    async (id: string): Promise<ChAnnouncementDetail | null> => {
      const res = await getAnnouncementDetail(id);
      if (!res.success || !res.data) {
        chReport(new Error(res.error || 'announcement detail failed'), { surface: 'messages.announcement', severity: 'low' });
        return null;
      }
      const d = res.data;
      const nameOf = (p: { first_name: string | null; last_name: string | null } | null | undefined, id: string) =>
        [p?.first_name, p?.last_name].filter(Boolean).join(' ') || data.directory.find((x) => x.playerId === id)?.name || 'Player';
      const acked = d.acknowledgements.map((a) => ({ playerId: a.player_id, name: nameOf(a.player, a.player_id), at: a.acknowledged_at }));
      const ackedIds = new Set(acked.map((a) => a.playerId));
      // No explicit recipients means the whole team.
      const recipients = d.recipients.length
        ? d.recipients.map((r) => ({ playerId: r.player_id, name: nameOf(r.player, r.player_id) }))
        : data.directory.filter((p) => p.role === 'player' && p.playerId).map((p) => ({ playerId: p.playerId!, name: p.name }));
      return {
        id: d.id,
        acknowledged: acked.sort((a, b) => a.name.localeCompare(b.name)),
        waiting: recipients.filter((r) => !ackedIds.has(r.playerId)).sort((a, b) => a.name.localeCompare(b.name)),
        tasks: d.tasks
          .filter((t) => t.task)
          .map((t) => ({
            taskId: t.task_id,
            title: t.task!.title,
            due: t.task!.due_date,
            doneByMe: t.assignments.some((x) => x.player_id === data.viewerPlayerId && x.status === 'completed'),
            done: t.assignments.filter((x) => x.status === 'completed').length,
            total: t.assignments.length,
          })),
        documents: d.documents.filter((x) => x.document).map((x) => ({ id: x.document!.id, title: x.document!.title, url: x.document!.file_url, size: x.document!.file_size })),
      };
    },
    [data.directory, data.viewerPlayerId],
  );

  const searchMessages = useCallback(
    async (q: string) => {
      const res = await searchGolfMessages(q, data.teamId);
      if ('error' in res) {
        chReport(new Error(res.error), { surface: 'messages.search', severity: 'low' });
        return null;
      }
      return res.results.map((r) => ({
        messageId: r.messageId,
        conversationId: r.conversationId,
        conversationName: r.conversationName,
        senderName: r.senderName,
        text: decodeMessageContent(r.content),
        at: r.createdAt,
      }));
    },
    [data.teamId],
  );

  // Mute state for the open conversation.
  const [mute, setMuteState] = useState<ChMute | null>(null);
  const [muteError, setMuteError] = useState(false);
  const [muteAttempt, setMuteAttempt] = useState(0);
  useEffect(() => {
    setMuteState(null);
    setMuteError(false);
    if (!selectedId) return;
    let live = true;
    getGolfConversationMute(selectedId)
      .then((r) => {
        if (!live) return;
        if (r.success) setMuteState(r.data);
        else {
          chReport(new Error(r.error), { surface: 'messages.mute', severity: 'low' });
          setMuteError(true);
        }
      })
      .catch((err) => {
        chReport(err, { surface: 'messages.mute' });
        if (live) setMuteError(true);
      });
    return () => {
      live = false;
    };
  }, [selectedId, muteAttempt]);

  // Stable, like loadAttachments: the Add sheet and the Files list key their fetch on them.
  const addCandidates = useCallback(async (): Promise<ChMember[] | null> => {
    if (!selectedId) return null;
    const res = await getGolfGroupAddCandidates(selectedId);
    if ('error' in res) {
      chReport(new Error(res.error), { surface: 'messages.addCandidates', severity: 'low' });
      return null;
    }
    return res.candidates.map((c) => ({
      userId: c.userId,
      name: people.get(c.userId)?.name ?? c.name,
      subtitle: people.get(c.userId)?.subtitle ?? c.subtitle ?? (c.type === 'coach' ? 'Coach' : 'Player'),
      role: c.type,
    }));
  }, [selectedId, people]);
  const loadFiles = useCallback(async (conversationId: string): Promise<ChFile[] | null> => {
    const res = await getGolfConversationFiles(conversationId);
    if (res.error || !res.files) {
      chReport(new Error(res.error || 'files read failed'), { surface: 'messages.files', severity: 'low' });
      return null;
    }
    return res.files.map((f) => ({ id: f.id, messageId: f.messageId, name: f.fileName, size: f.fileSize, mime: f.mimeType, sentAt: f.sentAt, senderId: f.senderId }));
  }, []);

  // Stable across renders: the attachment tiles key their fetch on it, and signed URLs cost a round trip.
  const loadAttachments = useCallback(async (messageId: string) => {
    const res = await getGolfMessageAttachments(messageId);
    if (res.error || !res.attachments) {
      chReport(new Error(res.error || 'attachments read failed'), { surface: 'messages.attachments', severity: 'low' });
      return null;
    }
    return res.attachments.map((a) => ({ id: a.id, name: a.fileName, size: a.fileSize, mime: a.mimeType, url: a.url ?? null }));
  }, []);

  const api: ChMessagesApi = {
    viewer: { userId: data.viewerUserId, role: data.role, name: data.viewerName },
    timeZone: data.timeZone,
    now,
    teamName: data.teamName,
    convs,
    convsLoading: loading,
    convsError: !!error && !conversations.length,
    refetchConvs: () => void refetch(),
    drafts: drafts.current,
    selectedId,
    select,
    msgs: chMsgs,
    msgsLoading: msgs.loading,
    msgsError: !!msgs.error && !chMsgs.length,
    refetchMsgs: () => void msgs.refetch(),
    typing: msgs.isOtherTyping,
    onTyping: (on) => msgs.sendTypingStatus(on),
    send: async (text) => {
      try {
        if (selectedId === autoOpened) select(selectedId);
        await msgs.sendMessage(text);
        return true;
      } catch (err) {
        const unknown = /network|fetch|timeout|aborted/i.test(err instanceof Error ? err.message : '');
        fail('send', err, unknown ? "Couldn't confirm this message sent" : "Couldn't send the message", unknown ? 'Check the thread before sending again.' : 'Your message is still in the box. Try again.', unknown ? 'CH-7005' : 'CH-7004');
        return false;
      }
    },
    sendFiles: async (text, files) => {
      if (!selectedId) return false;
      const bad = files.map((f) => ({ f, v: validateFile(f) })).find((x) => !x.v.valid);
      if (bad) {
        haptic('warning');
        toast({ tone: 'error', title: `Can't attach ${bad.f.name}`, body: bad.v.error ?? 'That file type or size isn’t supported.', code: 'CH-7101' });
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
      return attempt('sendFiles', { failed: "Couldn't send the attachment", hint: 'Your message and files are still in the box. Try again.', code: 'CH-7006' }, async () => {
        const res = await sendMessageWithAttachments({ conversationId: selectedId, content: text, attachments: pending });
        if (res.cancelled) return false;
        if (!res.success) throw new Error(res.error || 'Attachment send failed');
        return true;
      });
    },
    retry: (id) => void msgs.retryMessage(id),
    discard: (id) => msgs.discardFailedMessage(id),
    edit: (id, text) =>
      attempt('edit', { failed: "Couldn't edit the message", hint: 'Your edit is still in the box. Try again.', code: 'CH-7007' }, async () => {
        await msgs.editMessage(id, text);
        haptic('success');
        toast({ title: 'Message edited' });
      }),
    remove: async (id) => {
      const ok = await attempt('remove', { failed: "Couldn't delete the message", hint: 'It’s back in the thread. Try again in a moment.', code: 'CH-7008' }, async () => {
        await msgs.removeMessage(id);
        haptic('success');
        toast({ title: 'Message deleted' });
      });
      if (!ok) void msgs.refetch();
      return ok;
    },
    reactions: reactionMap,
    react: (messageId, key, active) => {
      const emoji = EMOJI_BY_KEY[key];
      if (!emoji) return;
      void attempt('react', { failed: "Couldn't save the reaction", hint: 'Try again in a moment.', code: 'CH-7009' }, async () => {
        await reactions.setReaction(messageId, emoji, active);
      });
    },
    attachments: loadAttachments,
    members,
    membersError,
    retryMembers: () => setMembersAttempt((n) => n + 1),
    leave: async () => {
      if (!selectedId) return false;
      return attempt('leave', { failed: "Couldn't leave the group", hint: 'Try again in a moment.', code: 'CH-7010' }, async () => {
        const res = await leaveGolfGroup(selectedId);
        if ('error' in res) throw new Error(res.error);
        haptic('success');
        toast({ title: 'You left the group' });
        setSelectedId(null);
        await refetch();
      });
    },
    addCandidates,
    addMember: (userId, name) =>
      attempt('addMember', { failed: `Couldn't add ${firstName(name)}`, hint: 'Try again in a moment.', code: 'CH-7018' }, async () => {
        if (!selectedId) throw new Error('No conversation open');
        const res = await addGolfGroupMember(selectedId, userId);
        if ('error' in res) throw new Error(res.error);
        haptic('success');
        toast({ title: `Added ${firstName(name)} to ${selected?.title ?? 'the group'}` });
        setMembersAttempt((n) => n + 1);
        await refetch();
      }),
    files: loadFiles,
    directory: data.directory,
    directoryError: data.directoryError,
    retryDirectory: () => router.refresh(),
    startDirect,
    createGroup,

    searchMessages,
    openHit: (h) => select(h.conversationId),

    mute,
    muteError,
    retryMute: () => setMuteAttempt((n) => n + 1),
    setMute: async (muted, hours) => {
      if (!selectedId) return false;
      return attempt('mute', { failed: muted ? "Couldn't mute the conversation" : "Couldn't turn notifications back on", hint: 'Try again in a moment.', code: 'CH-7011' }, async () => {
        const r = await setGolfConversationMute(selectedId, muted, hours);
        if (!r.success) throw new Error(r.error);
        setMuteState(r.data);
        haptic('success');
        toast({ title: muted ? 'Conversation muted' : 'Notifications back on' });
      });
    },

    announcements: anns,
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
    acknowledge: (id) =>
      attempt('acknowledge', { failed: "Couldn't send your acknowledgement", hint: 'Try again in a moment.', code: 'CH-7012' }, async () => {
        const r = await acknowledgeAnnouncement(id);
        if (!r.success) throw new Error(r.error || 'acknowledge failed');
        haptic('success');
        toast({ title: 'Acknowledged · coach can see you read it' });
        await loadAnns();
      }),
    completeTask: (_announcementId, taskId) =>
      attempt('completeTask', { failed: "Couldn't mark the task done", hint: 'Try again in a moment.', code: 'CH-7013' }, async () => {
        const r = await completeAnnouncementTask(taskId);
        if (!r.success) throw new Error(r.error || 'task update failed');
        haptic('success');
        toast({ title: 'Task marked done' });
        await loadAnns();
      }),
    createAnnouncement: ({ title, body, urgent, ack }) =>
      attempt('createAnnouncement', { failed: "Couldn't post the announcement", hint: 'Your text is still here. Try again.', code: 'CH-7014' }, async () => {
        chTrail('messages post announcement');
        const r = await createEnrichedAnnouncement({ title, body, urgency: urgent ? 'urgent' : 'normal', requiresAcknowledgement: ack, recipientPlayerIds: null, documentIds: [], inlineTasks: [] });
        if (!r.success || !r.data) throw new Error(r.error || 'announcement failed');
        haptic('success');
        toast({ title: `Posted to ${data.teamName ?? 'the team'} · ${title}` });
        await loadAnns();
        setSelectedId(null);
        setSelectedAnnId(r.data.announcementId);
      }),
  };

  return <MessagesView api={api} />;
}
