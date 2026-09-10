'use client';

/** Full-window team inbox. This orchestrator owns conversation selection,
 * group actions, identity and send wiring; panes own presentation and scrolling. */

import { useMessageReactions } from '@/hooks/golf/use-message-reactions';
import { conversationRecipientName, isGroupConversation } from './conversation-kind';
import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SquarePen, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { fairwayScope } from '@/lib/redesign/flag';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { logError } from '@/lib/error-logging';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import { useMessageAttachments } from '@/hooks/golf/use-message-attachments';
import {
  createGolfConversation,
  getPlayerUserId,
  getGolfGroupAddCandidates,
  addGolfGroupMember,
  removeGolfGroupMember,
  leaveGolfGroup,
} from '@/app/golf/actions/messages';
import { FairwayNewMessageSheet } from './FairwayNewMessageSheet';
import { FairwayTeamBroadcastSheet } from './FairwayTeamBroadcastSheet';
import { PullToRefresh } from '@/components/golf/PullToRefresh';
import { useImmersiveSurface } from '@/hooks/use-immersive-surface';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { PendingAttachment } from '@/lib/storage/attachments';

import { Button, IconButton } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback';

import { MessageConversationRail } from './MessageConversationRail';
import { MessageThreadPane } from './MessageThreadPane';
import {
  GroupDetailsSheet,
  type GroupMember,
  type GroupAddCandidate,
} from './GroupDetailsSheet';
import { MessageComposer } from './MessageComposer';
import { isTransientNetworkErrorMessage } from '@/lib/transient-network-error';

export function FairwayMessages() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const playerIdFromUrl = searchParams.get('player');
  // P260: notification deep-link target (?conversation=<id>). Notifications set
  // this so clicking "New message from X" opens the thread that fired, not just
  // the most-recent one auto-selected below.
  const conversationIdFromUrl = searchParams.get('conversation');

  // Server-resolved user data — role/team via the same context the legacy used.
  const { userId, role: userRole, teamId } = useGolfUser();

  /**
   * Wall-clock reference for both children's relative-time formatting
   * (conversation timestamps, day-boundary chips). `null` until mount so the
   * server render and the client's first paint agree (both see "no now yet"
   * and fall back to an absolute date) rather than diverging on whatever
   * instant each happened to run at (React #418). Ticks every minute after
   * mount so a thread left open overnight still relabels "Today" to
   * "Yesterday" without a refresh — mirrors FairwayAgendaView's useMinuteClock.
   */
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── UNCHANGED hook: conversations + refetch ─────────────────────────────────
  const {
    conversations,
    loading: conversationsLoading,
    error: conversationsError,
    refetch,
  } = useGolfConversations();

  const handleConversationsRefresh = async () => {
    await refetch();
  };

  const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = React.useState(false);
  const [showTeamBroadcastModal, setShowTeamBroadcastModal] = React.useState(false);
  const [mobileShowChat, setMobileShowChat] = React.useState(false);

  // An open conversation owns the phone. Hides the bottom tab bar (and its
  // reserved padding) for as long as the thread is open — see
  // use-immersive-surface.ts for why this is scoped to the destination and NOT
  // to the keyboard.
  useImmersiveSurface(mobileShowChat);

  // ── UNCHANGED hook: messages + send/edit/delete + typing + realtime ─────────
  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
    sendMessage,
    retryMessage,
    discardFailedMessage,
    editMessage,
    removeMessage,
    isOtherTyping,
    sendTypingStatus,
    currentUserId,
  } = useGolfMessages(selectedConversationId || '');
  const reactions = useMessageReactions(selectedConversationId ?? '', messages.filter((message) => message.conversation_id === selectedConversationId && !message.sendFailed).map((message) => message.id), currentUserId ?? userId);

  // ── UNCHANGED hook: attachment send ─────────────────────────────────────────
  const { sendMessageWithAttachments } = useMessageAttachments();

  // Edit / delete UI state (the page owns it; the hook owns the writes).
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editContent, setEditContent] = React.useState('');
  const [isEditSaving, setIsEditSaving] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [mobileActionsId, setMobileActionsId] = React.useState<string | null>(null);
  // G-30 — the details sheet the header's new info control opens. Page-level
  // state, like every other overlay on this surface: the thread pane owns the
  // trigger, this file owns what the trigger opens.
  const [showGroupDetails, setShowGroupDetails] = React.useState(false);

  React.useEffect(() => {
    setMobileActionsId(null);
    setShowGroupDetails(false);
    setEditingMessageId(null);
    setDeleteConfirmId(null);
  }, [selectedConversationId]);

  // ── Group participant name map: user_id → { name, avatar } (Bug fix #1) ─────
  // For group conversations, each incoming bubble's sender_id is resolved to a
  // real name + avatar by fetching golf_conversation_participants → coaches/players.
  // Mirrors the legacy fetchGroupParticipants / groupParticipants pattern.
  const [groupParticipants, setGroupParticipants] = React.useState<
    Map<string, GroupMember>
  >(new Map());

  // W7b — the identity map above resolves MESSAGE SENDERS, which is a strictly
  // larger set than the group's current members: once Remove and Leave exist,
  // somebody who is gone can still own messages in the backlog. Keying the map
  // on current participants alone made their bubbles read "Unknown", which is
  // both wrong and alarming. So the map covers senders too, and this set is
  // what the details sheet lists — a former sender must never appear there.
  const [groupMemberIds, setGroupMemberIds] = React.useState<Set<string>>(
    new Set(),
  );

  const groupFetchVersion = React.useRef(0);
  const groupSelection = React.useRef<string | null>(null);

  const fetchGroupParticipants = React.useCallback(async (conversationId: string) => {
    if (groupSelection.current !== conversationId) return;
    const version = ++groupFetchVersion.current;
    const supabase = createClient();
    const { data: participants, error: participantsError } = await supabase
      .from('golf_conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    if (participantsError) {
      logError(
        new Error(participantsError.message || 'Failed to fetch group participants'),
        { component: 'FairwayMessages', action: 'fetchGroupParticipants', sport: 'shared' },
        'medium'
      );
    }

    if (!participants || participants.length === 0) {
      if (version === groupFetchVersion.current) {
        setGroupParticipants(new Map());
        setGroupMemberIds(new Set());
      }
      return;
    }

    const memberIds = new Set(participants.map(p => p.user_id));

    // Everyone who has SPOKEN here, which after a removal is not the same set
    // as everyone who is here. PostgREST caps this at 1000 rows and returns
    // the oldest first, so on a thread longer than that the names that could
    // go unresolved are the most RECENT senders — who are, by construction,
    // the ones most likely to still be participants and therefore already
    // covered above. Anything still unresolved renders as "Former member" in
    // the thread pane, never "Unknown".
    const { data: senders, error: sendersError } = await supabase
      .from('golf_messages')
      .select('sender_id')
      .eq('conversation_id', conversationId);

    if (sendersError) {
      logError(
        new Error(sendersError.message || 'Failed to fetch group message senders'),
        { component: 'FairwayMessages', action: 'fetchGroupParticipants', sport: 'shared' },
        'low'
      );
    }

    const userIds = Array.from(
      new Set([...memberIds, ...(senders ?? []).map(m => m.sender_id)]),
    );

    // D-03a — `title` and `graduation_year` are the member row's subtitle, and
    // they are the ONLY two new columns this whole wave asks for. Both are
    // confirmed-live and both nullable, which is why the derivation below
    // renders NO subtitle when either is missing rather than a placeholder:
    // "Golf Coach" under a coach's name is the category restating itself, and
    // the artboard's rows carry a real fact or nothing.
    const [{ data: coaches, error: coachesError }, { data: players, error: playersError }] = await Promise.all([
      supabase
        .from('golf_coaches')
        .select('user_id, full_name, avatar_url, title')
        .in('user_id', userIds),
      supabase
        .from('golf_players')
        .select('user_id, first_name, last_name, avatar_url, graduation_year')
        .in('user_id', userIds),
    ]);

    if (coachesError || playersError) {
      logError(
        new Error(coachesError?.message || playersError?.message || 'Failed to fetch group participant details'),
        { component: 'FairwayMessages', action: 'fetchGroupParticipants', sport: 'shared' },
        'medium'
      );
    }

    const map = new Map<string, GroupMember>();
    (coaches ?? []).forEach(c => {
      if (c.user_id) {
        map.set(c.user_id, {
          id: c.user_id,
          name: c.full_name ?? 'Coach',
          avatar: c.avatar_url ?? null,
          // `|| undefined`, not `?? undefined` — an empty-string title is as
          // absent as a null one, and an empty <span> would still draw the
          // row's second line.
          subtitle: c.title || undefined,
          type: 'coach',
        });
      }
    });
    (players ?? []).forEach(p => {
      if (p.user_id) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Player';
        map.set(p.user_id, {
          id: p.user_id,
          name,
          avatar: p.avatar_url ?? null,
          subtitle: p.graduation_year ? `Class of ${p.graduation_year}` : undefined,
          type: 'player',
        });
      }
    });
    if (version !== groupFetchVersion.current) return;
    setGroupParticipants(map);
    setGroupMemberIds(memberIds);
  }, []);

  // Invalidate in-flight results when the selected conversation changes.
  React.useEffect(() => {
    if (groupSelection.current !== selectedConversationId) {
      groupSelection.current = selectedConversationId;
      setGroupParticipants(new Map());
      setGroupMemberIds(new Set());
    }
    if (!selectedConversationId) {
      setGroupParticipants(new Map());
      setGroupMemberIds(new Set());
      return;
    }
    const conv = conversations.find(c => c.id === selectedConversationId);
    if (isGroupConversation(conv)) {
      fetchGroupParticipants(selectedConversationId);
    } else {
      setGroupParticipants(new Map());
      setGroupMemberIds(new Set());
    }
    return () => { groupFetchVersion.current += 1; };
  }, [selectedConversationId, conversations, fetchGroupParticipants]);

  // Thread-count meta — HONEST: count only, NO unread chip in the masthead.

  // ── ?player= deep-link: find-or-create, then select (PRESERVED verbatim) ─────
  const [handledPlayerParam, setHandledPlayerParam] = React.useState(false);
  React.useEffect(() => {
    if (handledPlayerParam || conversationsLoading || !playerIdFromUrl) return;

    const handlePlayerParam = async () => {
      const playerUserId = await getPlayerUserId(playerIdFromUrl);

      if (!playerUserId) {
        fairwayToast.danger('Could not find player');
        setHandledPlayerParam(true);
        router.replace('/golf/dashboard/messages', { scroll: false });
        return;
      }

      const existingConversation = conversations.find(conv => {
        return !isGroupConversation(conv) && conv.other_participant?.id === playerUserId;
      });

      if (existingConversation) {
        setSelectedConversationId(existingConversation.id);
        setMobileShowChat(true);
        setHandledPlayerParam(true);
        router.replace('/golf/dashboard/messages', { scroll: false });
      } else {
        try {
          const result = await createGolfConversation([playerUserId], teamId || undefined);
          if (result.conversationId) {
            await refetch();
            setSelectedConversationId(result.conversationId);
            setMobileShowChat(true);
            fairwayToast.success('Conversation started');
          }
        } catch (err) {
          fairwayToast.danger('Failed to start conversation');
          logError(
            err instanceof Error ? err : new Error('Failed to start conversation'),
            { component: 'FairwayMessages', action: 'handlePlayerParam', sport: 'shared' },
            'high'
          );
        }
        setHandledPlayerParam(true);
        router.replace('/golf/dashboard/messages', { scroll: false });
      }
    };

    handlePlayerParam();
  }, [conversations, conversationsLoading, playerIdFromUrl, handledPlayerParam, router, refetch, teamId]);

  // ── ?conversation= deep-link: pre-select the thread that fired a notification ─
  // P260. Runs once per param value: select the conversation if the user is a
  // participant, otherwise fall through to auto-select. The param is stripped so
  // a later auto-select isn't blocked and the link isn't re-applied on refetch.
  const [handledConversationParam, setHandledConversationParam] = React.useState(false);
  React.useEffect(() => {
    if (handledConversationParam || conversationsLoading || !conversationIdFromUrl) return;

    const target = conversations.find(c => c.id === conversationIdFromUrl);
    if (target) {
      setSelectedConversationId(target.id);
      setMobileShowChat(true);
    }
    // Either way, consume the param so the rest of the page behaves normally.
    setHandledConversationParam(true);
    router.replace('/golf/dashboard/messages', { scroll: false });
  }, [conversations, conversationsLoading, conversationIdFromUrl, handledConversationParam, router]);

  // Desktop shows a thread beside the rail; a phone must not read a hidden thread.
  React.useEffect(() => {
    const firstConversation = conversations[0];
    if (
      isDesktop &&
      !conversationsLoading &&
      firstConversation &&
      !selectedConversationId &&
      !playerIdFromUrl &&
      !conversationIdFromUrl
    ) {
      setSelectedConversationId(firstConversation.id);
    }
  }, [isDesktop, conversations, conversationsLoading, selectedConversationId, playerIdFromUrl, conversationIdFromUrl]);

  const selectedConversation = React.useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find(c => c.id === selectedConversationId) ?? null;
  }, [conversations, selectedConversationId]);

  // ── Selection + mobile master-detail (PRESERVED) ────────────────────────────
  const handleSelectConversation = (id: string) => {
    setMobileActionsId(null);
    setShowGroupDetails(false);
    setSelectedConversationId(id);
    setMobileShowChat(true);
  };
  const handleBack = () => setMobileShowChat(false);

  // ── P259: open a conversation FROM a cross-conversation search hit, then
  // scroll the thread to the matched message once it loads.
  const [pendingScrollMessageId, setPendingScrollMessageId] = React.useState<string | null>(null);
  const handleOpenFromSearch = (conversationId: string, messageId: string) => {
    setPendingScrollMessageId(messageId);
    handleSelectConversation(conversationId);
  };

  // ── New conversation (UNCHANGED action) ─────────────────────────────────────
  const handleNewConversation = async (newUserId: string) => {
    try {
      const result = await createGolfConversation([newUserId], teamId || undefined);
      if (result.conversationId) {
        await refetch();
        handleSelectConversation(result.conversationId);
        fairwayToast.success('Conversation started');
      } else if ('error' in result) {
        fairwayToast.danger(String(result.error) || 'Failed to start conversation');
        logError(
          new Error(String(result.error) || 'Failed to start conversation'),
          { component: 'FairwayMessages', action: 'handleNewConversation', sport: 'shared' },
          'high'
        );
      }
    } catch (err) {
      fairwayToast.danger('Failed to start conversation');
      logError(
        err instanceof Error ? err : new Error('Failed to start conversation'),
        { component: 'FairwayMessages', action: 'handleNewConversation', sport: 'shared' },
        'high'
      );
    }
  };

  // ── Team broadcast created (UNCHANGED modal callback) ───────────────────────
  const handleTeamBroadcastCreated = async (conversationId: string) => {
    await refetch();
    handleSelectConversation(conversationId);
    fairwayToast.success('Team group created');
  };

  // ── Send (UNCHANGED hook; realtime replaces the optimistic stub) ────────────
  const handleSendMessage = async (content: string) => {
    if (!selectedConversationId) return false;
    try {
      await sendMessage(content);
      return true;
    } catch (error) {
      // G-20b — the two outcomes §9.5 requires kept apart. A transport error
      // means `fetch` itself threw, so no response was ever read and the POST
      // may have committed: reporting that as a definitive failure is what
      // "invites duplication". Anything else means the server answered.
      //
      // The row in the thread carries the same distinction (`sendOutcome`), so
      // the toast and the bubble cannot disagree — both read the same class of
      // error through the same helper.
      const unknownCommit = isTransientNetworkErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      fairwayToast.danger(
        unknownCommit
          ? 'Couldn’t confirm this send — check the thread before sending again.'
          : error instanceof Error ? error.message : 'Failed to send message',
      );
      logError(
        error instanceof Error ? error : new Error('Failed to send message'),
        { component: 'FairwayMessages', action: 'handleSendMessage', sport: 'shared' },
        'high'
      );
      return false;
    }
  };

  /**
   * G-09a — `onProgress` is forwarded, not invented here.
   *
   * `useMessageAttachments` accepts a per-file `onProgress` and threads it into
   * `uploadAttachment`; this call site simply never passed one, which is why
   * nothing the transport reported could reach the screen. The composer owns
   * the staged tiles and therefore owns the callback; this handler's only job
   * is to stop dropping it on the floor.
   */
  const handleSendMessageWithAttachments = async (
    content: string,
    attachments: PendingAttachment[],
    onProgress?: (attachmentId: string, progress: number) => void,
    signal?: AbortSignal,
  ) => {
    if (!selectedConversationId) return false;
    try {
      const result = await sendMessageWithAttachments({
        conversationId: selectedConversationId,
        content,
        attachments,
        onProgress,
        signal,
      });
      if (result.cancelled) {
        // G-24 — the user stopped it. No toast, because they already know:
        // they pressed the control that did it, and the composer has put the
        // draft back in front of them. No logError either — a cancel is not an
        // incident, and reporting one as `high` would bury real ones.
        return false;
      }
      if (!result.success) {
        fairwayToast.danger(result.error || 'Failed to send message');
        logError(
          new Error(result.error || 'Failed to send message with attachments'),
          { component: 'FairwayMessages', action: 'handleSendMessageWithAttachments', sport: 'shared' },
          'high'
        );
        return false;
      }
      return true;
    } catch (error) {
      fairwayToast.danger(error instanceof Error ? error.message : 'Failed to send message');
      logError(
        error instanceof Error ? error : new Error('Failed to send message with attachments'),
        { component: 'FairwayMessages', action: 'handleSendMessageWithAttachments', sport: 'shared' },
        'high'
      );
      return false;
    }
  };

  // ── Edit (UNCHANGED hook action) ────────────────────────────────────────────
  const handleStartEdit = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditContent(decodeMessageContent(currentContent));
    setDeleteConfirmId(null);
  };
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };
  const handleSaveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;
    setIsEditSaving(true);
    try {
      await editMessage(editingMessageId, editContent.trim());
      fairwayToast.success('Message updated');
      setEditingMessageId(null);
      setEditContent('');
    } catch (error) {
      fairwayToast.danger(error instanceof Error ? error.message : 'Failed to update message');
      logError(
        error instanceof Error ? error : new Error('Failed to update message'),
        { component: 'FairwayMessages', action: 'handleSaveEdit', sport: 'shared' },
        'high'
      );
    } finally {
      setIsEditSaving(false);
    }
  };

  // ── Delete (UNCHANGED hook action: soft-delete + optimistic rollback) ───────
  const handleDeleteClick = (messageId: string) => {
    setDeleteConfirmId(messageId);
    setEditingMessageId(null);
  };
  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await removeMessage(deleteConfirmId);
      fairwayToast.success('Message deleted');
      setDeleteConfirmId(null);
    } catch (error) {
      fairwayToast.danger(error instanceof Error ? error.message : 'Failed to delete message');
      logError(
        error instanceof Error ? error : new Error('Failed to delete message'),
        { component: 'FairwayMessages', action: 'handleConfirmDelete', sport: 'shared' },
        'high'
      );
    }
  };
  const handleCancelDelete = () => setDeleteConfirmId(null);

  // ── HONEST-EMPTY (f): no-team error state, role-branched copy ────────────────
  if (!teamId) {
    return (
      // Mobile subtracts FairwayBottomNav's 56px (md:hidden) too, so this empty
      // state never renders taller than the visible viewport above the tab bar.
      <div className={fairwayScope('flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-2rem-56px-env(safe-area-inset-bottom,0px))] items-center justify-center bg-canvas bg-canvas-gradient p-6 md:h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-2rem-env(safe-area-inset-bottom,0px))]')}>
        <EmptyState
          icon={Users}
          title="No team found"
          description={
            userRole === 'coach'
              ? 'You need a team before you can send messages. Create a team in Team Settings or contact support.'
              : 'You need to be on a team before you can send messages. Please contact your coach to be added.'
          }
          action={
            userRole === 'coach' ? (
              <Button onClick={() => { window.location.href = '/golf/dashboard/team'; }}>
                Go to Team Settings
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div
      data-fw-messages
      data-fw-keyboard-aware
      className={fairwayScope(
        mobileShowChat
          ? 'flex h-[calc(100dvh-var(--keyboard-height,0px))] flex-col overflow-hidden bg-canvas bg-canvas-gradient pt-[env(safe-area-inset-top,0px)] md:h-dvh md:pt-0'
          : 'flex h-[calc(100dvh-var(--fw-mobile-nav-height))] flex-col overflow-hidden bg-canvas bg-canvas-gradient pt-[env(safe-area-inset-top,0px)] md:h-dvh md:pt-0'
      )}
    >
      <div className="flex w-full min-h-0 flex-1 flex-col overflow-hidden">
        {/* The workspace fills its window; only individual bubbles limit line length. */}
        <div className="flex min-h-0 flex-1 items-stretch md:grid md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)]">
          <aside className={mobileShowChat
            ? 'hidden min-h-0 md:flex md:flex-col md:border-r md:border-border-subtle md:bg-surface'
            : 'flex w-full min-h-0 flex-col md:border-r md:border-border-subtle md:bg-surface'}>
            <div className="flex min-h-16 shrink-0 items-center justify-between gap-1 px-4 md:border-b md:border-border-subtle">
              <h1 className="font-fw-sans text-h2 font-semibold tracking-tight text-text-primary md:text-h3">Messages</h1>
              <div className="flex items-center gap-1">
                {userRole === 'coach' && teamId ? (
                  <IconButton variant="ghost" aria-label="Message team" title="Message team" onClick={() => setShowTeamBroadcastModal(true)}>
                    <Users size={20} aria-hidden="true" />
                  </IconButton>
                ) : null}
                <IconButton variant="primary" aria-label="New message" title="New message" onClick={() => setShowNewMessageModal(true)}>
                  <SquarePen size={20} aria-hidden="true" />
                </IconButton>
              </div>
            </div>
            <PullToRefresh onRefresh={handleConversationsRefresh} className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-3 py-3">
              <MessageConversationRail
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={handleSelectConversation}
                onNewMessage={() => setShowNewMessageModal(true)}
                loading={conversationsLoading}
                error={conversationsError}
                onRetry={refetch}
                teamId={teamId}
                onOpenMessage={handleOpenFromSearch}
                now={now}
              />
            </PullToRefresh>
          </aside>

          <div className={mobileShowChat
            ? 'flex w-full min-h-0 min-w-0 flex-col'
            : 'hidden min-h-0 min-w-0 flex-col md:flex'}>
            <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col">
              <MessageThreadPane
                reactions={reactions}
                conversation={selectedConversation}
                messages={messages}
                loading={messagesLoading}
                error={messagesError}
                onRetry={refetchMessages}
                userId={userId}
                currentUserId={currentUserId}
                isOtherTyping={isOtherTyping}
                onBack={handleBack}
                onNewMessage={() => setShowNewMessageModal(true)}
                editingMessageId={editingMessageId}
                editContent={editContent}
                isEditSaving={isEditSaving}
                deleteConfirmId={deleteConfirmId}
                mobileActionsId={mobileActionsId}
                onStartEdit={handleStartEdit}
                onEditContentChange={setEditContent}
                onCancelEdit={handleCancelEdit}
                onSaveEdit={handleSaveEdit}
                onDeleteClick={handleDeleteClick}
                onConfirmDelete={handleConfirmDelete}
                onCancelDelete={handleCancelDelete}
                onSetMobileActions={setMobileActionsId}
                onRetryMessage={retryMessage}
                onDiscardFailedMessage={discardFailedMessage}
                groupParticipants={groupParticipants}
                onOpenGroupDetails={() => setShowGroupDetails(true)}
                scrollToMessageId={pendingScrollMessageId}
                onScrolledToMessage={() => setPendingScrollMessageId(null)}
                now={now}
                className="flex-1 min-h-0"
              >
                {selectedConversation ? (
                  // `key` IS the fix, not a list-rendering formality.
                  //
                  // The composer owns `message` and `pendingAttachments` as
                  // local state and clears them only on a SUCCESSFUL send.
                  // Mounted without a key it survived a conversation switch,
                  // while both send handlers read whatever
                  // `selectedConversationId` is current AT SEND TIME. So a
                  // draft — or an attached photo — typed to one person and
                  // abandoned would be delivered to whoever was selected next,
                  // with nothing on screen suggesting the text had carried
                  // over. That is private content sent to the wrong recipient.
                  //
                  // Keying on the conversation makes the composer a fresh
                  // instance per thread, so its contents can only ever be sent
                  // to the thread they were typed into. Per-conversation DRAFT
                  // PERSISTENCE is a separate feature (spec P1) and deliberately
                  // not smuggled in here: keeping the text would recreate the
                  // exact hazard unless it is also scoped per conversation.
                  <MessageComposer
                    key={selectedConversation.id}
                    onSend={handleSendMessage}
                    onSendWithAttachments={handleSendMessageWithAttachments}
                    onTyping={sendTypingStatus}
                    recipientName={conversationRecipientName(selectedConversation)}
                  />
                ) : null}
              </MessageThreadPane>
            </div>
          </div>
        </div>
      </div>

      {/* ── New-message picker (Fairway-tokenized; same search logic) ──────── */}
      <FairwayNewMessageSheet
        isOpen={showNewMessageModal}
        onClose={() => setShowNewMessageModal(false)}
        onSelect={handleNewConversation}
        currentUserRole={userRole || 'player'}
        teamId={teamId}
      />

      {/* ── Group details (G-33 · D-03a · G-30 · G-57) ─────────────────────
          Mounted only for a selected GROUP, so a DM cannot open it even if the
          state were somehow set. `groupParticipants` is the same map the
          thread header and every incoming bubble already read — one fetch
          serves all three, so the sheet's member list can never disagree with
          the names on the messages above it.

          `participant_count` is passed separately and deliberately: it counts
          participant ROWS, while the map counts members whose coach/player row
          resolved. Handing the sheet both lets it say "9 members" honestly
          while listing the 8 it can name, instead of silently reporting the
          smaller number as the truth. */}
      {selectedConversation && isGroupConversation(selectedConversation) && (
        <GroupDetailsSheet
          open={showGroupDetails}
          onOpenChange={setShowGroupDetails}
          title={selectedConversation.title || 'Group'}
          createdAt={selectedConversation.created_at}
          creatorId={selectedConversation.creator_id}
          currentUserId={currentUserId || userId}
          memberCount={selectedConversation.participant_count}
          members={Array.from(groupParticipants.values()).filter((m) =>
            groupMemberIds.has(m.id),
          )}
          /* Membership management. Every one of these ends in a refetch of
             the conversation list rather than a local mutation of
             `groupParticipants`: that map is derived from the same rows the
             header's "N members" counts, so patching it locally would let the
             two disagree for exactly as long as the sheet stayed open — the
             disagreement W7 removed. `fetchGroupParticipants` re-runs from the
             refreshed conversation, so both come from one read. */
          onAddMember={async (targetUserId) => {
            const result = await addGolfGroupMember(selectedConversation.id, targetUserId);
            if ('error' in result) return { error: result.error };
            await refetch();
            await fetchGroupParticipants(selectedConversation.id);
            return;
          }}
          onRemoveMember={async (targetUserId) => {
            const result = await removeGolfGroupMember(selectedConversation.id, targetUserId);
            if ('error' in result) return { error: result.error };
            await refetch();
            await fetchGroupParticipants(selectedConversation.id);
            return;
          }}
          onLeaveGroup={async () => {
            const result = await leaveGolfGroup(selectedConversation.id);
            if ('error' in result) return { error: result.error };
            // The conversation is gone for this user, so the open thread has
            // to go with it — leaving it selected would show a thread whose
            // participant row no longer exists.
            setSelectedConversationId(null);
            await refetch();
            return;
          }}
          loadAddCandidates={async () => {
            const result = await getGolfGroupAddCandidates(selectedConversation.id);
            if ('error' in result) throw new Error(result.error);
            return result.candidates as GroupAddCandidate[];
          }}
        />
      )}

      {userRole === 'coach' && teamId && (
        <FairwayTeamBroadcastSheet
          isOpen={showTeamBroadcastModal}
          onClose={() => setShowTeamBroadcastModal(false)}
          onSuccess={handleTeamBroadcastCreated}
          teamId={teamId}
        />
      )}
    </div>
  );
}
