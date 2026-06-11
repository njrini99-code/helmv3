'use client';

/**
 * ============================================================================
 * Fairway · messages · FairwayMessages — the team-inbox orchestrator
 * ----------------------------------------------------------------------------
 * The flag-on /golf/dashboard/messages surface. A calm two-pane inbox that
 * MIRRORS the shipped /coachhelm/chat pattern (AskWorkspace → rail + thread):
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  ViewHeader · "Messages" · Team messages · <team name>          │  ← ONE masthead
 *   │                              [Team] (coach)   [New message]     │  ← 1 primary
 *   ├──────────────────┬─────────────────────────────────────────────┤
 *   │ MessageConvers-  │  MessageThreadPane (the ONE focal hero)       │
 *   │ ationRail (aside)│  + MessageComposer (sunken matte track)       │
 *   └──────────────────┴─────────────────────────────────────────────┘
 *
 * This is a SHARED page — coach + player render the SAME inbox; role differs
 * only at the edges (spec §role): the coach-only quiet "Team" broadcast
 * secondaryAction, the modal's currentUserRole, and the no-team copy branch.
 *
 * ── REUSE, DON'T REBUILD ────────────────────────────────────────────────────
 * Every behavior the legacy page.tsx wired is PRESERVED here, unchanged in
 * substance — this component only re-skins presentation:
 *   • useGolfConversations() — conversations + loading + refetch (UNCHANGED hook)
 *   • useGolfMessages(id)    — messages, sendMessage, editMessage, removeMessage,
 *                              isOtherTyping, sendTypingStatus, currentUserId
 *                              (UNCHANGED hook; soft-delete + optimistic rollback
 *                              live inside it — we never touch the write paths)
 *   • useMessageAttachments() — sendMessageWithAttachments (UNCHANGED hook)
 *   • createGolfConversation / getPlayerUserId (UNCHANGED server actions)
 *   • GolfNewMessageModal / GolfTeamBroadcastModal (UNCHANGED shared modals —
 *     triggered from our state, never forked)
 * Preserved interactions: the ?player= deep-link (find-or-create), auto-select
 * first conversation, mobile master-detail (mobileShowChat), PullToRefresh on the
 * rail, auto-scroll-to-bottom (in the thread pane), and the typing throttle
 * (in the composer).
 *
 * Renders inside a `.fairway-ds` scope on a `bg-canvas` page (like
 * FairwayPlayerStats) WITHOUT CoachHelmShell — this is a team-management page.
 * ========================================================================== */

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

import { fairwayScope } from '@/lib/redesign/flag';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import { useToast } from '@/components/ui/sonner';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import { useMessageAttachments } from '@/hooks/golf/use-message-attachments';
import { createGolfConversation, getPlayerUserId } from '@/app/golf/actions/messages';
import { GolfNewMessageModal } from '@/components/golf/messages/GolfNewMessageModal';
import { GolfTeamBroadcastModal } from '@/components/golf/messages/GolfTeamBroadcastModal';
import { PullToRefresh } from '@/components/golf/PullToRefresh';
import type { PendingAttachment } from '@/lib/storage/attachments';

import { ViewHeader } from '@/components/fairway/view-header';
import { Button } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback';

import { MessageConversationRail } from './MessageConversationRail';
import { MessageThreadPane } from './MessageThreadPane';
import { MessageComposer } from './MessageComposer';

export function FairwayMessages() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playerIdFromUrl = searchParams.get('player');

  // Server-resolved user data — role/team via the same context the legacy used.
  const { userId, role: userRole, teamId, teamName } = useGolfUser();

  // ── UNCHANGED hook: conversations + refetch ─────────────────────────────────
  const { conversations, loading: conversationsLoading, refetch } = useGolfConversations();

  const handleConversationsRefresh = async () => {
    await refetch();
  };

  const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = React.useState(false);
  const [showTeamBroadcastModal, setShowTeamBroadcastModal] = React.useState(false);
  const [mobileShowChat, setMobileShowChat] = React.useState(false);

  // ── UNCHANGED hook: messages + send/edit/delete + typing + realtime ─────────
  const {
    messages,
    loading: messagesLoading,
    sendMessage,
    editMessage,
    removeMessage,
    isOtherTyping,
    sendTypingStatus,
    currentUserId,
  } = useGolfMessages(selectedConversationId || '');

  // ── UNCHANGED hook: attachment send ─────────────────────────────────────────
  const { sendMessageWithAttachments } = useMessageAttachments();

  // Edit / delete UI state (the page owns it; the hook owns the writes).
  const [editingMessageId, setEditingMessageId] = React.useState<string | null>(null);
  const [editContent, setEditContent] = React.useState('');
  const [isEditSaving, setIsEditSaving] = React.useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [mobileActionsId, setMobileActionsId] = React.useState<string | null>(null);

  // ── Group participant name map: user_id → { name, avatar } (Bug fix #1) ─────
  // For group conversations, each incoming bubble's sender_id is resolved to a
  // real name + avatar by fetching golf_conversation_participants → coaches/players.
  // Mirrors the legacy fetchGroupParticipants / groupParticipants pattern.
  const [groupParticipants, setGroupParticipants] = React.useState<
    Map<string, { name: string; avatar: string | null }>
  >(new Map());

  const fetchGroupParticipants = React.useCallback(async (conversationId: string) => {
    const supabase = createClient();
    const { data: participants } = await supabase
      .from('golf_conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId);

    if (!participants || participants.length === 0) return;

    const userIds = participants.map(p => p.user_id);

    const [{ data: coaches }, { data: players }] = await Promise.all([
      supabase
        .from('golf_coaches')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds),
      supabase
        .from('golf_players')
        .select('user_id, first_name, last_name, avatar_url')
        .in('user_id', userIds),
    ]);

    const map = new Map<string, { name: string; avatar: string | null }>();
    (coaches ?? []).forEach(c => {
      if (c.user_id) {
        map.set(c.user_id, { name: c.full_name ?? 'Coach', avatar: c.avatar_url ?? null });
      }
    });
    (players ?? []).forEach(p => {
      if (p.user_id) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Player';
        map.set(p.user_id, { name, avatar: p.avatar_url ?? null });
      }
    });
    setGroupParticipants(map);
  }, []);

  // Fetch participant names whenever we enter a group conversation; clear on 1:1.
  React.useEffect(() => {
    if (!selectedConversationId) {
      setGroupParticipants(new Map());
      return;
    }
    const conv = conversations.find(c => c.id === selectedConversationId);
    if (conv?.is_group) {
      fetchGroupParticipants(selectedConversationId);
    } else {
      setGroupParticipants(new Map());
    }
  }, [selectedConversationId, conversations, fetchGroupParticipants]);

  // Thread-count meta — HONEST: count only, NO unread chip in the masthead.
  const threadCount = conversations.length;

  // ── ?player= deep-link: find-or-create, then select (PRESERVED verbatim) ─────
  const [handledPlayerParam, setHandledPlayerParam] = React.useState(false);
  React.useEffect(() => {
    if (handledPlayerParam || conversationsLoading || !playerIdFromUrl) return;

    const handlePlayerParam = async () => {
      const playerUserId = await getPlayerUserId(playerIdFromUrl);

      if (!playerUserId) {
        showToast('Could not find player', 'error');
        setHandledPlayerParam(true);
        router.replace('/golf/dashboard/messages', { scroll: false });
        return;
      }

      const existingConversation = conversations.find(conv => {
        return !conv.is_group && conv.other_participant?.id === playerUserId;
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
            showToast('Conversation started', 'success');
          }
        } catch (err) {
          void err;
          showToast('Failed to start conversation', 'error');
        }
        setHandledPlayerParam(true);
        router.replace('/golf/dashboard/messages', { scroll: false });
      }
    };

    handlePlayerParam();
  }, [conversations, conversationsLoading, playerIdFromUrl, handledPlayerParam, router, refetch, showToast, teamId]);

  // ── Auto-select first conversation (only when no player param) (PRESERVED) ───
  React.useEffect(() => {
    const firstConversation = conversations[0];
    if (!conversationsLoading && firstConversation && !selectedConversationId && !playerIdFromUrl) {
      setSelectedConversationId(firstConversation.id);
    }
  }, [conversations, conversationsLoading, selectedConversationId, playerIdFromUrl]);

  const selectedConversation = React.useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find(c => c.id === selectedConversationId) ?? null;
  }, [conversations, selectedConversationId]);

  // ── Selection + mobile master-detail (PRESERVED) ────────────────────────────
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowChat(true);
  };
  const handleBack = () => setMobileShowChat(false);

  // ── New conversation (UNCHANGED action) ─────────────────────────────────────
  const handleNewConversation = async (newUserId: string) => {
    try {
      const result = await createGolfConversation([newUserId], teamId || undefined);
      if (result.conversationId) {
        await refetch();
        handleSelectConversation(result.conversationId);
        showToast('Conversation started', 'success');
      } else if ('error' in result) {
        showToast(String(result.error) || 'Failed to start conversation', 'error');
      }
    } catch (err) {
      void err;
      showToast('Failed to start conversation', 'error');
    }
  };

  // ── Team broadcast created (UNCHANGED modal callback) ───────────────────────
  const handleTeamBroadcastCreated = async (conversationId: string) => {
    await refetch();
    handleSelectConversation(conversationId);
    showToast('Team group created', 'success');
  };

  // ── Send (UNCHANGED hook; realtime replaces the optimistic stub) ────────────
  const handleSendMessage = async (content: string) => {
    if (!selectedConversationId) return false;
    try {
      await sendMessage(content);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to send message', 'error');
      return false;
    }
  };

  const handleSendMessageWithAttachments = async (content: string, attachments: PendingAttachment[]) => {
    if (!selectedConversationId) return false;
    try {
      const result = await sendMessageWithAttachments({
        conversationId: selectedConversationId,
        content,
        attachments,
      });
      if (!result.success) {
        showToast(result.error || 'Failed to send message', 'error');
        return false;
      }
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to send message', 'error');
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
      showToast('Message updated', 'success');
      setEditingMessageId(null);
      setEditContent('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update message', 'error');
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
      showToast('Message deleted', 'success');
      setDeleteConfirmId(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete message', 'error');
    }
  };
  const handleCancelDelete = () => setDeleteConfirmId(null);

  // ── HONEST-EMPTY (f): no-team error state, role-branched copy ────────────────
  if (!teamId) {
    return (
      <div className={fairwayScope('flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] items-center justify-center bg-canvas p-6')}>
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
    // Bug fix #2 — scroll: overflow-hidden + flex flex-col propagates the fixed
    // dvh height down to the grid so the thread pane's flex-1 overflow-y-auto
    // activates. Without overflow-hidden the inner flex-1 has no bounded parent
    // and the message list grows instead of scrolling.
    <div className={fairwayScope('flex h-[calc(100dvh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-canvas')}>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6 lg:py-8">
        {/* ── ONE MASTHEAD — replaces the legacy LargeTitleHeader + PageHeader ── */}
        <ViewHeader
          eyebrow="Messages"
          title="Team messages"
          description={teamName || undefined}
          meta={
            <span className="font-fw-mono tabular-nums">
              {threadCount} {threadCount === 1 ? 'conversation' : 'conversations'}
            </span>
          }
          secondaryActions={
            userRole === 'coach' && teamId ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Users size={16} aria-hidden="true" />}
                onClick={() => setShowTeamBroadcastModal(true)}
              >
                Team
              </Button>
            ) : undefined
          }
          primaryAction={
            <Button size="sm" onClick={() => setShowNewMessageModal(true)}>
              New message
            </Button>
          }
        />

        {/* ── Two-pane inbox: rail (supporting aside) + thread (focal hero) ──── */}
        {/* flex-1 min-h-0 on the grid so it fills remaining height without
            overflowing; min-h-0 overrides the implicit min-h-auto on flex items. */}
        <div className="mt-6 flex min-h-0 flex-1 grid-cols-12 items-stretch gap-5 md:grid md:gap-6">
          {/* TRIAGE — conversation rail. On mobile it hides when a chat is open. */}
          <aside
            className={
              mobileShowChat
                ? 'hidden md:col-span-5 md:flex md:flex-col lg:col-span-4'
                : 'col-span-12 flex flex-col md:col-span-5 lg:col-span-4'
            }
          >
            <PullToRefresh onRefresh={handleConversationsRefresh} className="overscroll-contain touch-pan-y">
              <MessageConversationRail
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={handleSelectConversation}
                onNewMessage={() => setShowNewMessageModal(true)}
                loading={conversationsLoading}
              />
            </PullToRefresh>
          </aside>

          {/* PULSE — the open thread (focal hero) + WHAT'S-NEXT composer track.
              flex flex-col min-h-0 so MessageThreadPane fills the grid cell height. */}
          <div className={mobileShowChat ? 'flex min-h-0 flex-col md:col-span-7 lg:col-span-8' : 'hidden min-h-0 flex-col md:col-span-7 md:flex lg:col-span-8'}>
            <MessageThreadPane
              conversation={selectedConversation}
              messages={messages}
              loading={messagesLoading}
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
              groupParticipants={groupParticipants}
              className="flex-1 min-h-0"
            >
              {selectedConversation ? (
                <MessageComposer
                  onSend={handleSendMessage}
                  onSendWithAttachments={handleSendMessageWithAttachments}
                  onTyping={sendTypingStatus}
                />
              ) : null}
            </MessageThreadPane>
          </div>
        </div>
      </div>

      {/* ── UNCHANGED shared modals — triggered from our state, never forked ── */}
      <GolfNewMessageModal
        isOpen={showNewMessageModal}
        onClose={() => setShowNewMessageModal(false)}
        onSelect={handleNewConversation}
        currentUserRole={userRole || 'player'}
        teamId={teamId}
      />

      {userRole === 'coach' && teamId && (
        <GolfTeamBroadcastModal
          isOpen={showTeamBroadcastModal}
          onClose={() => setShowTeamBroadcastModal(false)}
          onSuccess={handleTeamBroadcastCreated}
          teamId={teamId}
        />
      )}
    </div>
  );
}
