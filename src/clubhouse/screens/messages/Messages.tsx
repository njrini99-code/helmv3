'use client';

import { CH_DESK_QUERY } from '@/clubhouse/lib/phone-query';
import { useConversationPins } from './use-conversation-pins';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { useRowMutes } from './use-row-mutes';
import { useTypingByConversation } from './use-typing-by-conversation';
import { usePrivateTyping } from './typing-channel';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import { summarizeReactions, useMessageReactions } from '@/hooks/golf/use-message-reactions';
import { useMessageAttachments } from '@/hooks/golf/use-message-attachments';
import { useMessageResponses } from '@/hooks/golf/use-message-responses';
import { isPollFallbackText, parsePollPayload, pollHitOnlyInFooter, pollSearchSnippet } from '@/lib/golf/message-polls';
import { addGolfGroupMember, createGolfConversation, createGolfTeamBroadcast, getGolfConversationParticipantIdentities, getGolfGroupAddCandidates, getGolfMessageAttachments, searchGolfMessages } from '@/app/golf/actions/messages';
import { getGolfConversationFiles } from '@/app/golf/actions/message-attachments';
import { canHideGolfConversations } from '@/app/golf/actions/conversation-hide';
import { getGolfConversationMute, setGolfConversationMute } from '@/app/golf/actions/message-mute';
import { getAnnouncementDetail, getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { useChClock } from '../../lib/use-clock';
import { useClassAwareness } from '../../shell/context';
import { useTeamClassDay } from '../../lib/use-class-day';
import { useConversationTeam } from '../../lib/use-conversation-team';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import type { ChMessagesData } from '../../data/messages';
import { useDelayedToast, useToast, useToastPill } from '../../ui/Toast';
import { useNow } from '../../lib/use-now';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, friendlyReason, isOffline } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import type { ChAttachmentRecovery, ChMessagesApi } from './api/types';
import { MessagesView } from './MessagesScreen';
import type { MessagesApiCtx } from './api/ctx';
import { useInboxApi } from './api/use-inbox-api';
import { useThreadApi } from './api/use-thread-api';
import { useOverlayApi, KEY_BY_EMOJI } from './api/use-overlay-api';
import { useDetailsApi } from './api/use-details-api';
import { DraftStore } from './drafts';
import { readMarkedUnread, withMark, writeMarkedUnread } from './marked-unread';
import { FOUND_FOR_MS } from './use-focus-message';
import { onRoster, seedThreadFiles, takePrefill } from './prefill';
import { seedPollDraft } from './polls';
import { directWith, firstName, groupLacksPlayer, isDirect, isGroupRow, isNamedForOneOfTwo, toChAnnouncement, type ChAnnouncement, type ChAnnouncementDetail, type ChConv, type ChFile, type ChMember, type ChMsg, type ChMute, type ChReaction, type ChReactionKey } from './model';

const isGroup = isGroupRow;

/**
 * Live Messages: the existing realtime hooks and server actions, mapped onto
 * the Clubhouse view. Nothing about who can message whom changes here; the
 * actions and RLS decide, and this screen reports what they say.
 */
/**
 * A poll's plain-text copy is several lines (pollFallbackText); the inbox row shows its first, "Poll: Which van?". The row
 * has no message kind, so a poll is known by its whole fallback shape, not its first word: an ordinary message that
 * starts "Poll: " keeps its text.
 */
// A poll's plain-text copy shows as its question; a typed message that merely starts "Poll: " keeps all its lines (D23).
const railText = (text: string) => (isPollFallbackText(text) ? text.split('\n')[0]! : text);

/** The attachment facts a message payload carries (kind, size, duration), when it carries them; nothing otherwise. */
function attachmentMeta(payload: unknown): Pick<ChMsg, 'attachmentKind' | 'attachmentWidth' | 'attachmentHeight' | 'durationSeconds'> {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  if (!p) return {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
  const kind = p.attachment_kind === 'photo' || p.attachment_kind === 'file' || p.attachment_kind === 'video' ? p.attachment_kind : undefined;
  return {
    ...(kind ? { attachmentKind: kind } : {}),
    ...(num(p.width) ? { attachmentWidth: num(p.width) } : {}),
    ...(num(p.height) ? { attachmentHeight: num(p.height) } : {}),
    ...(num(p.duration_seconds) ? { durationSeconds: num(p.duration_seconds) } : {}),
  };
}

export function Messages({ data }: { data: ChMessagesData }) {
  const hours = useChClock();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const delayedToast = useDelayedToast();
  const clock = useNow();
  const now = clock ? clock.toISOString() : data.now;
  const { conversations, loading, error, refetch } = useGolfConversations(data.viewerUserId, data.teamId, { allowIds: data.activeConversationIds });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // P-10: class awareness is a coach's line. Off (the flag, a player, the migrations unapplied) it reads nothing.
  const awareness = useClassAwareness();
  const classOn = awareness && data.role === 'coach';
  const teamClass = useTeamClassDay(data.teamId, { enabled: classOn });
  const convTeamId = useConversationTeam(selectedId, classOn);
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
  const [returnToAsk, setReturnToAsk] = useState(false);
  /** The prefilled draft lands in the composer of the conversation New message creates; the coach still presses Send. */
  const pendingDraft = useRef<string | null>(null);
  /** The same for a board's picture. */
  const pendingFiles = useRef<File[] | null>(null);

  const people = useMemo(() => new Map(data.directory.map((p) => [p.userId, p])), [data.directory]);
  /** Conversations the viewer marked unread on this device (marked-unread.ts, owner decision 14). */
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => readMarkedUnread(data.viewerUserId));
  const mark = useCallback(
    (id: string, unread: boolean) =>
      setMarked((ids) => {
        const next = withMark(ids, id, unread);
        if (next !== ids) writeMarkedUnread(data.viewerUserId, next);
        return next;
      }),
    [data.viewerUserId],
  );

  const loadedConvs: ChConv[] = useMemo(
    () =>
      conversations.map((c) => {
        const other = c.other_participant;
        const otherId = other?.id ?? (c.participant_ids ?? []).find((id) => id !== data.viewerUserId);
        const dir = otherId ? people.get(otherId) : undefined;
        // A player's 1:1 with the coach reads as the coach, never "Cole Bennett · 2 members" and the group mark.
        const group = isGroup(c) && !isNamedForOneOfTwo(c, [data.viewerName, dir?.name, other?.name]);
        return {
          id: c.id,
          group,
          channel: c.is_team_channel === true,
          title: group ? c.title?.trim() || 'Group' : dir?.name ?? other?.name ?? 'Conversation',
          subtitle: group ? '' : dir?.subtitle ?? other?.subtitle ?? '',
          memberIds: group ? (c.participant_ids ?? []).filter((id) => id !== data.viewerUserId) : otherId ? [otherId] : [],
          memberCount: c.participant_count ?? c.participant_ids?.length ?? 2,
          unread: c.unread_count ?? 0,
          markedUnread: marked.has(c.id),
          lastAt: c.last_message?.created_at ?? c.updated_at ?? null,
          lastSenderId: c.last_message?.sender_id ?? null,
          // A last message with no words is an attachment sent alone.
          lastText: railText(decodeMessageContent(c.last_message?.content ?? '')) || (c.last_message ? 'Sent an attachment' : ''),
          lastIsPoll: isPollFallbackText(decodeMessageContent(c.last_message?.content ?? '')),
          creatorId: c.creator_id ?? null,
        };
      }),
    [conversations, people, data.viewerUserId, data.viewerName, marked],
  );
  // A one-to-one thread just made, shown at once until the list's next read carries it (F-0045).
  const [started, setStarted] = useState<ChConv | null>(null);
  const convs = useMemo(() => (started && !loadedConvs.some((c) => c.id === started.id) ? [started, ...loadedConvs] : loadedConvs), [started, loadedConvs]);
  // The nav badge follows the rail: it polls every 45 s, so reading a thread left the tab's count up for that long, and
  // a new message raised the rail long before the badge (audit 2026-10-31). A beat after the rail's total moves, after
  // the read mark has landed, the badge reads again.
  const badges = useNotificationBadges();
  const railUnread = convs.reduce((n, c) => n + (c.unread ?? 0), 0);
  const firstRail = useRef(true);
  useEffect(() => {
    if (firstRail.current) {
      firstRail.current = false;
      return;
    }
    const t = window.setTimeout(() => void badges.refetch(), 1200);
    return () => window.clearTimeout(t);
  }, [railUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  const msgs = useGolfMessages(selectedId ?? '', data.viewerUserId, { ...({ typingExpiryMs: 5000 }), deferMarkRead: !!selectedId && selectedId === autoOpened, classAwareness: awareness });
  const privateTyping = usePrivateTyping(selectedId, data.viewerUserId);
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
    if (typeof window !== 'undefined' && window.matchMedia(CH_DESK_QUERY).matches) {
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
      // A draft for one thread names nobody: the thread itself is the recipient, if the coach can see it.
      const named = pre.conversationId ? convs.find((c) => c.id === pre.conversationId) : undefined;
      if (!to.length && !named) {
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
      setReturnToAsk(pre.returnTo === 'ask');
      // Nothing posts a poll from here: its words land in the draft, and the coach is told (W-MSG-16).
      const words = pre.poll && !pre.draft ? [pre.poll.question, ...pre.poll.options].join('\n') : pre.draft;
      // A poll for a group thread opens in that thread's sheet (TASK_FIELDS 5.5): the coach presses Send there.
      if (pre.poll && named?.group) {
        seedPollDraft(named.id, pre.poll, data.timeZone);
        setSelectedId(named.id);
        return;
      }
      if (pre.poll) toast({ tone: 'error', title: 'Couldn’t open the poll draft', body: 'Nothing was posted.', code: 'CH-7001' });
      // A thread the coach can see opens; one they can't falls back to the one-player message, never another group.
      const existing = named ?? (to.length === 1 ? directWith(convs, to[0]!) : undefined);
      if (existing) {
        // An unsent draft of the coach's own wins over the prefill.
        const own = drafts.get(existing.id);
        if (words && !own) drafts.set(existing.id, words);
        else if (words && own && own !== words) toast({ title: 'You already had a draft here.', code: 'CH-7001' });
        if (pre.files) seedThreadFiles(existing.id, pre.files);
        setSelectedId(existing.id);
        return;
      }
      pendingFiles.current = pre.files ?? null;
      pendingDraft.current = words || null;
      setPrefill({ to, draft: words, title: pre.title ?? '' });
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
      // Redesign: after a failed deep link, leaving the thread lets the desktop open the newest beside the rail (02 Completeness 11b).
      if (!id) setParamsDone(true);
      if (id) setSelectedAnnId(null);
      // Opening a conversation reads it, so a mark from Mark as unread goes.
      if (id) mark(id, false);
      // A search hit sets its own target after this (openHit); any other pick leaves the last one behind.
      setFocusMessageId(null);
      setFoundMessageId(null);
      setSelectedId(id);
    },
    [autoOpened, selectedId, msgs, mark],
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
      if (pendingFiles.current) seedThreadFiles(conversationId, pendingFiles.current);
      pendingFiles.current = null;
      setPrefill(null);
    },
    [drafts],
  );

  const startDirect = useCallback(
    async (userId: string): Promise<boolean> => {
      const existing = directWith(convs, userId);
      if (existing) {
        setSelectedId(existing.id);
        return true;
      }
      return attempt('startDirect', { failed: "Couldn’t start the conversation", hint: 'Try again in a moment.', code: 'CH-7002' }, async () => {
        chTrail('messages start direct');
        const res = await createGolfConversation([userId], data.teamId);
        if (!('conversationId' in res) || !res.conversationId) throw new Error('error' in res ? String(res.error) : 'Could not start the conversation');
        // F-0003, a second line behind the server's: an answer the list knows as a group or the channel is refused, so
        // nothing written for one person lands there. An id the list doesn't hold yet opens below (or says CH-7015).
        const known = convs.find((c) => c.id === res.conversationId);
        if (known && !isDirect(known)) {
          chTrail('messages start direct: refused a group or channel');
          throw new Error('The conversation returned is not a direct thread');
        }
        landDraft(res.conversationId);
        // F-0045: the thread opens now, from what is known of it; the list reads again behind it.
        const dir = people.get(userId);
        setStarted({ id: res.conversationId, group: false, channel: false, title: dir?.name ?? 'Conversation', subtitle: dir?.subtitle ?? '', memberIds: [userId], memberCount: 2, unread: 0, lastAt: new Date().toISOString(), lastSenderId: null, lastText: '', creatorId: data.viewerUserId });
        setSelectedId(res.conversationId);
        haptic('success');
        void refetch().catch(() => undefined);
      });
    },
    [convs, people, data.teamId, data.viewerUserId, refetch, attempt, landDraft],
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
          // "Notified anyway" only once a push really went out (the fan-out stamps it), never because the coach asked for one.
          ...(m.notify_anyway && m.notify_anyway_pushed_at ? { notifiedAnyway: true } : {}),
          // A poll whose payload doesn't parse draws as its plain-text copy (`content`), never as a broken card.
          poll: m.kind === 'poll' && !m.is_deleted ? parsePollPayload(m.payload) : null,
          pending: !!m.pending,
          ...attachmentMeta(m.payload),
        })),
    [msgs.messages, msgs.currentUserId, selectedId, data.viewerUserId],
  );

  // Votes on the thread's polls (P-2): one read and one realtime channel for all of them, as reactions do.
  const pollIds = useMemo(() => chMsgs.filter((m) => m.poll && !m.failed).map((m) => m.id), [chMsgs]);
  const responses = useMessageResponses(selectedId ?? '', pollIds, data.viewerUserId);

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

  const convIdsRef = useRef<ReadonlySet<string>>(new Set());
  const searchMessages = useCallback(
    async (q: string) => {
      const res = await searchGolfMessages(q, data.teamId);
      if ('error' in res) {
        chReport(new Error(res.error), { surface: 'messages.search', severity: 'low' });
        return null;
      }
      // A poll's hit reads as one line ("Poll: Q · A, B"), and one that matched only its "Vote in GolfHelm." footer is
      // dropped, so "vote" doesn't find every poll (D24).
      return res.results
        .map((r) => ({ r, text: decodeMessageContent(r.content) }))
        .filter(({ text }) => !(isPollFallbackText(text) && pollHitOnlyInFooter(text, q)))
        // Redesign: a hidden conversation isn't in the list, so the hits leave it out too until a newer message brings it back.
        .filter(({ r }) => convIdsRef.current.has(r.conversationId))
        .map(({ r, text }) => ({
          messageId: r.messageId,
          conversationId: r.conversationId,
          conversationName: r.conversationName,
          senderName: r.senderName,
          text: isPollFallbackText(text) ? pollSearchSnippet(text) : text,
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

  /** Any conversation's mute, read when a row's Mute sheet opens (owner decision 14). Null when it didn't load. */
  const muteOf = useCallback(async (id: string): Promise<ChMute | null> => {
    try {
      const r = await getGolfConversationMute(id);
      if (r.success) return r.data;
      chReport(new Error(r.error), { surface: 'messages.mute', severity: 'low' });
    } catch (err) {
      chReport(err, { surface: 'messages.mute' });
    }
    return null;
  }, []);

  /** Mute or unmute a conversation by id: the open one's details and any row's menu. The open one's state follows. */
  const muteConversation = (id: string, muted: boolean, hours: number | null) =>
    attempt('mute', { failed: muted ? "Couldn’t mute the conversation" : "Couldn’t turn notifications back on", hint: 'Try again in a moment.', code: 'CH-7011' }, async () => {
      const r = await setGolfConversationMute(id, muted, hours);
      if (!r.success) throw new Error(r.error);
      if (id === selectedId) setMuteState(r.data);
      haptic('success');
    });

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

  useToastPill(true);
  convIdsRef.current = new Set(convs.map((c) => c.id));
  const rowMutes = useRowMutes(data.viewerUserId, true);
  const convIds = useMemo(() => convs.map((c) => c.id), [convs]);
  const pins = useConversationPins(data.viewerUserId, data.teamId ?? '', convIds, true, !loading && !error);
  const typingByConv = useTypingByConversation(data.viewerUserId, convIds, selectedId, true);
  const shownConvs = useMemo(() => (rowMutes.muted ? convs.map((c) => ({ ...c, muted: rowMutes.muted!.has(c.id) })) : convs), [rowMutes.muted, convs]);

  const ctx: MessagesApiCtx = {
    data,
    addCandidates,
    annError,
    annLoaded,
    announcementDetail,
    anns,
    attachmentRecovery,
    attempt,
    autoOpened,
    badges,
    canHide,
    chMsgs,
    classOn,
    convTeamId,
    conversations,
    convs,
    createGroup,
    drafts,
    error,
    fail,
    focusMessageId,
    foundMessageId,
    getPendingAttachmentSend,
    hours,
    landDraft,
    loadAnns,
    loadAttachments,
    loadFiles,
    loading,
    mark,
    members,
    membersError,
    msgs,
    privateTyping,
    mute,
    muteConversation,
    muteError,
    muteOf,
    pendingDraft,
    pins,
    prefill,
    quietMembers,
    reactionMap,
    reactions,
    refetch,
    responses,
    retryPendingAttachmentSend,
    router,
    rowMutes,
    searchMessages,
    select,
    selected,
    selectedAnnId,
    selectedId,
    sendMessageWithAttachments,
    setAutoOpened,
    setFocusMessageId,
    setFoundMessageId,
    setMembers,
    setMembersAttempt,
    setMuteAttempt,
    setPrefill,
    setSelectedAnnId,
    setSelectedId,
    setStarted,
    shownConvs,
    startDirect,
    teamClass,
    toast,
    typingByConv,
  };
  // The api is composed from one slice per package (api/use-*-api.ts); `ChMessagesApi` stays one interface.
  const inboxApi = useInboxApi(ctx);
  const threadApi = useThreadApi(ctx);
  const overlayApi = useOverlayApi(ctx);
  const detailsApi = useDetailsApi(ctx);
  const api: ChMessagesApi = {
    ...(returnToAsk
      ? {
          leaveToAsk: () => {
            setReturnToAsk(false);
            router.push('/golf/dashboard/coachhelm?view=ask');
          },
        }
      : {}),
    viewer: { userId: data.viewerUserId, role: data.role, name: data.viewerName },
    signers: data.signers,
    timeZone: data.timeZone,
    clock: hours,
    now,
    teamName: data.teamName,
    ...inboxApi,
    ...threadApi,
    ...overlayApi,
    ...detailsApi,
  };

  return <MessagesView api={api} />;
}
