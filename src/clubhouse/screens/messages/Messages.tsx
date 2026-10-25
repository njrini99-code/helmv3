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
  removeGolfGroupMember,
  searchGolfMessages,
} from '@/app/golf/actions/messages';
import { getGolfConversationFiles } from '@/app/golf/actions/message-attachments';
import { canHideGolfConversations, hideGolfConversation } from '@/app/golf/actions/conversation-hide';
import { getGolfConversationMute, setGolfConversationMute } from '@/app/golf/actions/message-mute';
import { completeAnnouncementTask, createEnrichedAnnouncement, getAnnouncementDetail, getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { getPreviewUrl } from '@/app/golf/actions/documents';
import { validateFile, type PendingAttachment } from '@/lib/storage/attachments';
import { useChClock } from '../../lib/use-clock';
import { isTransientNetworkErrorMessage } from '@/lib/transient-network-error';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type { ChMessagesData } from '../../data/messages';
import { useDelayedToast, useToast } from '../../ui/Toast';
import { useNow } from '../../lib/use-now';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, friendlyReason, isOffline } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import type { ChAttachmentRecovery, ChMessagesApi } from './MessagesView';
import { MessagesView } from './MessagesScreen';
import { DraftStore } from './drafts';
import { FOUND_FOR_MS } from './use-focus-message';
import { onRoster, takePrefill } from './prefill';
import { firstName, groupLacksPlayer, toChAnnouncement, type ChAnnouncement, type ChAnnouncementDetail, type ChConv, type ChFile, type ChMember, type ChMsg, type ChMute, type ChReaction, type ChReactionKey } from './model';

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
  const hours = useChClock();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const delayedToast = useDelayedToast();
  const clock = useNow();
  const now = clock ? clock.toISOString() : data.now;
  const { conversations, loading, error, refetch } = useGolfConversations(data.viewerUserId, data.teamId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  /**
   * The deep link last taken (null before the first read). A new one arriving while Messages is already open (a bell
   * notification tapped on this page, which keeps it mounted) is taken too; Fairway's one-shot flag dropped it.
   */
  const handledParams = useRef<string | null>(null);
  /** Unsent drafts by conversation, so switching threads (71202) or reloading (F-12) never loses what was written. */
  const [drafts] = useState<Map<string, string>>(() => new DraftStore(data.viewerUserId));
  const [attachmentRecovery] = useState(() => new Map<string, ChAttachmentRecovery>());
  const [paramsDone, setParamsDone] = useState(false);
  /** A prefilled message waiting in New message (prefill.ts): the recipients and the group's name. */
  const [prefill, setPrefill] = useState<{ to: string[]; draft: string; title: string } | null>(null);
  /** The prefilled draft lands in the composer of the conversation New message creates; the coach still presses Send. */
  const pendingDraft = useRef<string | null>(null);

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
  const { sendMessageWithAttachments, getPendingAttachmentSend, retryPendingAttachmentSend } = useMessageAttachments({ recoverable: true });

  // "Delete conversation" is offered only once the database has the per-person hide (a held migration, HELD.md).
  const [canHide, setCanHide] = useState(data.canHide ?? false);
  useEffect(() => {
    if (data.canHide !== undefined) return;
    let live = true;
    void canHideGolfConversations().then(
      (ok) => live && setCanHide(ok),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [data.canHide]);

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
  // `?compose=1` (the command palette's New message, A16) opens New message with no one chosen.
  const linkKey = ['conversation', 'player', 'user', 'prefill', 'compose'].map((k) => params.get(k) ?? '').join('\u0000');
  useEffect(() => {
    if (loading || handledParams.current === linkKey) return;
    const first = handledParams.current === null;
    handledParams.current = linkKey;
    const conv = params.get('conversation');
    const player = params.get('player');
    const user = params.get('user');
    // Read once: the entry is deleted as it is taken, so Back or a reload never brings the draft back.
    const pre = takePrefill(params);
    const compose = params.get('compose') === '1';
    // New message opens over the inbox as it is (the newest thread beside the rail on desktop), so it waits for nothing.
    if (first) setParamsDone(!conv && !player && !user && !pre);
    if (params.get('prefill')) router.replace('/golf/dashboard/messages', { scroll: false });
    if (pre) {
      // Only people on this team, with an account, are written to; anyone else is left out and the coach is told.
      const userOf = (id: string) => data.directory.find((p) => p.playerId === id)?.userId;
      const { kept, dropped } = onRoster(pre.players, (id) => !!userOf(id));
      const to = kept.map((id) => userOf(id)!);
      if (!to.length) {
        toast({ tone: 'error', title: "Couldn’t open that conversation", body: 'Those players aren’t on your team, or haven’t set up their accounts yet.', code: 'CH-7001' });
        return;
      }
      if (dropped.length) {
        toast({
          tone: 'error',
          title: dropped.length === 1 ? 'One player was left out' : `${dropped.length} players were left out`,
          body: 'They aren’t on your team, or haven’t set up their accounts yet. Everyone else is chosen.',
          code: 'CH-7001',
        });
      }
      chTrail('messages prefill');
      const existing = to.length === 1 ? convs.find((c) => !c.group && c.memberIds[0] === to[0]) : undefined;
      if (existing) {
        // An unsent draft of the coach's own wins over the prefill.
        if (pre.draft && !drafts.get(existing.id)) drafts.set(existing.id, pre.draft);
        setSelectedId(existing.id);
        return;
      }
      pendingDraft.current = pre.draft || null;
      setPrefill({ to, draft: pre.draft, title: pre.title ?? '' });
    } else if (conv) {
      router.replace('/golf/dashboard/messages', { scroll: false });
      // A thread the list doesn't hold yet (one just started with the viewer) is looked for once more before it is
      // opened; one that still isn't there says so (CH-7015, MessagesScreen) rather than opening nothing.
      if (convs.length && !convs.some((c) => c.id === conv)) void refetch().catch(() => undefined).then(() => select(conv));
      else select(conv);
    } else if (compose) {
      router.replace('/golf/dashboard/messages', { scroll: false });
      setPrefill({ to: [], draft: '', title: '' });
    } else if (player || user) {
      const person = data.directory.find((p) => (player ? p.playerId === player : p.userId === user));
      router.replace('/golf/dashboard/messages', { scroll: false });
      if (!person) {
        toast({
          tone: 'error',
          title: "Couldn’t open that conversation",
          body: player ? 'That player isn’t on your team, or hasn’t set up their account yet.' : 'That person isn’t on your team, or hasn’t set up their account yet.',
          code: 'CH-7001',
        });
        return;
      }
      void startDirect(person.userId);
    }
    // startDirect and select are stable enough for a deep link taken once per address.
  }, [loading, linkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = useCallback(
    (id: string | null) => {
      if (id && id === autoOpened && id === selectedId) {
        setAutoOpened(null);
        void msgs.markRead();
      } else setAutoOpened(null);
      if (id) setSelectedAnnId(null);
      // A search hit sets its own target after this (openHit); any other pick leaves the last one behind.
      setFocusMessageId(null);
      setFoundMessageId(null);
      setSelectedId(id);
    },
    [autoOpened, selectedId, msgs],
  );
  /** A search hit's message, gone to in the open thread (useFocusMessage), then marked for a moment. */
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [foundMessageId, setFoundMessageId] = useState<string | null>(null);
  useEffect(() => {
    if (!foundMessageId) return;
    const t = window.setTimeout(() => setFoundMessageId(null), FOUND_FOR_MS);
    return () => window.clearTimeout(t);
  }, [foundMessageId]);

  const fail = useCallback(
    (surface: string, err: unknown, title: string, hint: string, code: string, withReason = true) => {
      chReport(err, { surface: `messages.${surface}`, action: `messages.${surface}` });
      // CH-7701: a change that fails gives the error pattern; CH-7702: one that lands, the success pattern (each write below).
      haptic('error');
      const reason = withReason && err instanceof Error ? friendlyReason(err.message) : null;
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
        toast({ tone: 'error', title: `${copy.failed}: you’re offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
        return false;
      }
      const stopSlow = delayedToast({ title: 'Still saving…', body: 'This is taking longer than usual. Keep this page open.', code: 'CH-1902' }, CH_SLOW_SAVE_AFTER);
      try {
        return (await fn()) !== false;
      } catch (err) {
        fail(surface, err, copy.failed, copy.hint, copy.code);
        return false;
      } finally {
        stopSlow();
      }
    },
    [delayedToast, toast, fail],
  );

  const landDraft = useCallback(
    (conversationId: string) => {
      if (pendingDraft.current && !drafts.get(conversationId)) drafts.set(conversationId, pendingDraft.current);
      pendingDraft.current = null;
      setPrefill(null);
    },
    [drafts],
  );

  const startDirect = useCallback(
    async (userId: string): Promise<boolean> => {
      const existing = convs.find((c) => !c.group && c.memberIds[0] === userId);
      if (existing) {
        setSelectedId(existing.id);
        return true;
      }
      return attempt('startDirect', { failed: "Couldn’t start the conversation", hint: 'Try again in a moment.', code: 'CH-7002' }, async () => {
        chTrail('messages start direct');
        const res = await createGolfConversation([userId], data.teamId);
        if (!('conversationId' in res) || !res.conversationId) throw new Error('error' in res ? String(res.error) : 'Could not start the conversation');
        landDraft(res.conversationId);
        await refetch();
        setSelectedId(res.conversationId);
        haptic('success');
      });
    },
    [convs, data.teamId, refetch, attempt, landDraft],
  );

  const createGroup = useCallback(
    async (userIds: string[], title: string): Promise<boolean> => {
      // A coach's group is a broadcast to the players chosen, so it needs at least one (createGolfTeamBroadcast refuses
      // none). New message says so before it gets here (CH-7105); this holds the line for any other caller, and for a
      // group whose chosen players have no player id here.
      const playerIds = userIds.map((u) => people.get(u)?.playerId).filter((x): x is string => !!x);
      if (groupLacksPlayer(data.role, userIds, data.directory) || (data.role === 'coach' && playerIds.length === 0)) {
        haptic('warning');
        toast({ tone: 'error', title: "Couldn’t create the group", body: 'Choose at least one player. Coaches join the group once it exists.', code: 'CH-7105' });
        return false;
      }
      return attempt('createGroup', { failed: "Couldn’t create the group", hint: 'Try again in a moment.', code: 'CH-7003' }, async () => {
        chTrail('messages create group');
        const res =
          data.role === 'coach'
            ? await createGolfTeamBroadcast({ teamId: data.teamId, title, selectedPlayerIds: playerIds })
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
        landDraft(res.conversationId);
        await refetch();
        setSelectedId(res.conversationId);
        haptic('success');
        toast({ title: data.role === 'coach' ? `Group created · ${title}` : 'Group created' });
        if (missed.length) {
          chReport(new Error(`${missed.length} coach(es) not added to a new group`), { surface: 'messages.createGroup', severity: 'low' });
          haptic('warning');
          const names = missed.map((u) => firstName(people.get(u)?.name ?? 'A coach')).join(', ');
          toast({ tone: 'error', title: `Group created, but ${names} ${missed.length === 1 ? "wasn’t" : "weren’t"} added`, body: 'Add them from Details.', code: 'CH-7019' });
        }
      });
    },
    [data.role, data.teamId, data.directory, people, refetch, toast, attempt, landDraft],
  );

  const [members, setMembers] = useState<ChMember[] | null>(null);
  const [membersError, setMembersError] = useState(false);
  const [membersAttempt, setMembersAttempt] = useState(0);
  /** The next members read keeps the list on screen (after a removal) instead of drawing the skeleton. */
  const quietMembers = useRef(false);
  const selected = convs.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (!quietMembers.current) setMembers(null);
    quietMembers.current = false;
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
          replyToId: m.reply_to_id ?? null,
        })),
    [msgs.messages, msgs.currentUserId, selectedId, data.viewerUserId],
  );

  const reactionMap = useMemo(() => {
    const out = new Map<string, ChReaction[]>();
    for (const id of liveIds) {
      const groups = summarizeReactions(reactions.rows, id, data.viewerUserId)
        .map((g) => ({
          key: KEY_BY_EMOJI[g.emoji],
          count: g.count,
          mine: g.active,
          userIds: [...new Set(reactions.rows.filter((r) => r.message_id === id && r.emoji === g.emoji).map((r) => r.user_id))],
        }))
        .filter((g): g is { key: ChReactionKey; count: number; mine: boolean; userIds: string[] } => !!g.key);
      if (groups.length) out.set(id, groups);
    }
    return out;
  }, [liveIds, reactions.rows, data.viewerUserId]);

  // Announcements: the team feed, pinned above conversations.
  // The route reads them with the page; when it couldn't (or in the preview), the first read is here.
  const [anns, setAnns] = useState<ChAnnouncement[]>(data.announcements ?? []);
  const [annError, setAnnError] = useState(false);
  // Announcements sit above the conversations: until their first read answers, the inbox keeps its skeleton.
  const [annLoaded, setAnnLoaded] = useState(data.announcements != null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const loadAnns = useCallback(async () => {
    try {
      const res = await getAnnouncementsWithMeta(data.teamId, data.viewerUserId, data.role === 'coach', data.viewerPlayerId);
      if (!res.success || !res.data) throw new Error(res.error || 'announcements read failed');
      setAnnError(false);
      setAnns(res.data.map(toChAnnouncement));
    } catch (err) {
      chReport(err, { surface: 'messages.announcements', severity: 'low' });
      setAnnError(true);
    } finally {
      setAnnLoaded(true);
    }
  }, [data.teamId, data.viewerUserId, data.role, data.viewerPlayerId]);
  const annsPreloaded = useRef(data.announcements != null);
  useEffect(() => {
    // Read with the page: the first read is already on screen.
    if (annsPreloaded.current) {
      annsPreloaded.current = false;
      return;
    }
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
        // Opened through a signed link (openAnnouncementDocument), never the stored file_url (Fairway #1259).
        documents: d.documents.filter((x) => x.document).map((x) => ({ id: x.document!.id, title: x.document!.title, size: x.document!.file_size })),
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
    signers: data.signers,
    timeZone: data.timeZone,
    clock: hours,
    now,
    teamName: data.teamName,
    convs,
    convsLoading: loading,
    convsError: !!error && !conversations.length,
    refetchConvs: () => void refetch(),
    drafts,
    attachmentRecovery,
    selectedId,
    select,
    msgs: chMsgs,
    msgsLoading: msgs.loading,
    msgsError: !!msgs.error && !chMsgs.length,
    // The read failed but an earlier copy is on screen: it stays, marked as possibly out of date (PAGE_PERFORMANCE.md rule 4).
    msgsStale: !!msgs.error && chMsgs.length > 0,
    refetchMsgs: () => void msgs.refetch(),
    typing: msgs.isOtherTyping,
    onTyping: (on) => msgs.sendTypingStatus(on),
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
    send: async (text, replyToId) => {
      try {
        if (selectedId === autoOpened) select(selectedId);
        if (replyToId) await msgs.sendMessage(text, replyToId);
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
    retry: (id) => void msgs.retryMessage(id),
    discard: (id) => msgs.discardFailedMessage(id),
    edit: (id, text) =>
      attempt('edit', { failed: "Couldn’t edit the message", hint: 'Your edit is still in the box. Try again.', code: 'CH-7007' }, async () => {
        await msgs.editMessage(id, text);
        haptic('success');
        toast({ title: 'Message edited' });
      }),
    remove: async (id) => {
      const ok = await attempt('remove', { failed: "Couldn’t delete the message", hint: 'It’s back in the thread. Try again in a moment.', code: 'CH-7008' }, async () => {
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
      // The hook takes one reaction at a time; a tap while one is saving is dropped, not reported as a failure.
      if (!emoji || reactions.pending) return;
      void attempt('react', { failed: "Couldn’t save the reaction", hint: 'Try again in a moment.', code: 'CH-7009' }, async () => {
        // setReaction answers false (session gone, write refused) and never throws: that is a failure too.
        if ((await reactions.setReaction(messageId, emoji, active)) === false) throw new Error('Reaction was not saved');
      });
    },
    attachments: loadAttachments,
    members,
    membersError,
    retryMembers: () => setMembersAttempt((n) => n + 1),
    leave: async () => {
      if (!selectedId) return false;
      return attempt('leave', { failed: "Couldn’t leave the group", hint: 'Try again in a moment.', code: 'CH-7010' }, async () => {
        const res = await leaveGolfGroup(selectedId);
        if ('error' in res) throw new Error(res.error);
        haptic('success');
        toast({ title: 'You left the group' });
        setSelectedId(null);
        await refetch();
      });
    },
    deleteConversation: canHide
      ? async () => {
          if (!selectedId) return false;
          return attempt('deleteConversation', { failed: "Couldn’t delete the conversation", hint: 'Try again in a moment.', code: 'CH-7025' }, async () => {
            const res = await hideGolfConversation(selectedId);
            if (!res.success) throw new Error(res.error);
            haptic('success');
            toast({ title: 'Conversation deleted' });
            setSelectedId(null);
            await refetch();
          });
        }
      : null,
    addCandidates,
    addMember: (userId, name) =>
      attempt('addMember', { failed: `Couldn’t add ${firstName(name)}`, hint: 'Try again in a moment.', code: 'CH-7018' }, async () => {
        if (!selectedId) throw new Error('No conversation open');
        const res = await addGolfGroupMember(selectedId, userId);
        if ('error' in res) throw new Error(res.error);
        haptic('success');
        toast({ title: `Added ${firstName(name)} to ${selected?.title ?? 'the group'}` });
        setMembersAttempt((n) => n + 1);
        await refetch();
      }),
    removeMember: async (userId, name) => {
      if (!selectedId) return false;
      // The row leaves at once; a refusal puts the list back as it was (removeGolfGroupMember: the creator only, never
      // their own row, a team group only).
      const before = members;
      setMembers((list) => list?.filter((m) => m.userId !== userId) ?? list);
      const ok = await attempt('removeMember', { failed: `Couldn’t remove ${firstName(name)}`, hint: 'They’re still in the group. Try again in a moment.', code: 'CH-7024' }, async () => {
        const res = await removeGolfGroupMember(selectedId, userId);
        if ('error' in res) throw new Error(res.error);
        haptic('success');
        toast({ title: `Removed ${firstName(name)} from ${selected?.title ?? 'the group'}` });
        // As Fairway does after a removal: the list and the group's members are read again.
        quietMembers.current = true;
        setMembersAttempt((n) => n + 1);
        await refetch();
      });
      if (!ok) setMembers(before);
      return ok;
    },
    files: loadFiles,
    directory: data.directory,
    directoryError: data.directoryError,
    retryDirectory: () => router.refresh(),
    startDirect: async (userId) => {
      const existing = convs.find((c) => !c.group && c.memberIds[0] === userId);
      if (existing) landDraft(existing.id);
      return startDirect(userId);
    },
    createGroup,
    prefill,
    clearPrefill: () => {
      pendingDraft.current = null;
      setPrefill(null);
    },

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

    mute,
    muteError,
    retryMute: () => setMuteAttempt((n) => n + 1),
    setMute: async (muted, hours) => {
      if (!selectedId) return false;
      return attempt('mute', { failed: muted ? "Couldn’t mute the conversation" : "Couldn’t turn notifications back on", hint: 'Try again in a moment.', code: 'CH-7011' }, async () => {
        const r = await setGolfConversationMute(selectedId, muted, hours);
        if (!r.success) throw new Error(r.error);
        setMuteState(r.data);
        haptic('success');
        // One mute toast at a time: a quick mute, unmute, mute leaves only the last (CH-1910).
        toast({ title: muted ? 'Conversation muted' : 'Notifications back on', replace: 'mute' });
      });
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
      }),
  };

  return <MessagesView api={api} />;
}
