'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { IconMail, IconPlus, IconSend, IconArrowLeft, IconMessageSquare, IconAlertCircle, IconPencil, IconTrash, IconCheck, IconX, IconUsers } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { AnimatedPage } from '@/components/golf/layout/AnimatedPage';
import { useToast } from '@/components/ui/sonner';
import { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import { createGolfConversation, getPlayerUserId } from '@/app/golf/actions/messages';
import { GolfNewMessageModal } from '@/components/golf/messages/GolfNewMessageModal';
import { GolfTeamBroadcastModal } from '@/components/golf/messages/GolfTeamBroadcastModal';
import { useGolfUser } from '@/contexts/golf-user-context';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';
import { AttachmentButton } from '@/components/golf/messages/AttachmentButton';
import { AttachmentPreview } from '@/components/golf/messages/AttachmentPreview';
import { useMessageAttachments } from '@/hooks/golf/use-message-attachments';
import type { PendingAttachment } from '@/lib/storage/attachments';
import { PullToRefresh } from '@/components/golf/PullToRefresh';
import { isRedesignEnabled } from '@/lib/redesign/flag';
import { FairwayMessages } from '@/components/fairway/pages/messages';

export default function GolfMessagesPage() {
  // ── Fairway redesign fork ───────────────────────────────────────────────────
  // Build-time-inlined flag, safe at the top of this 'use client' component body
  // (NextJS inlines NEXT_PUBLIC_REDESIGN, so the branch is statically resolved
  // and the legacy branch below is dead-code-eliminated when off). Flag-off: the
  // legacy implementation below renders BYTE-FOR-BYTE unchanged.
  if (isRedesignEnabled()) {
    return <FairwayMessages />;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LEGACY (flag-off) — unchanged.
  // ──────────────────────────────────────────────────────────────────────────
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playerIdFromUrl = searchParams.get('player');

  // Use server-resolved user data — no client-side loading needed
  const { userId, role: userRole, teamId, teamName } = useGolfUser();

  const { conversations, loading: conversationsLoading, refetch } = useGolfConversations();

  const handleConversationsRefresh = async () => {
    await refetch();
  };

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showTeamBroadcastModal, setShowTeamBroadcastModal] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Get messages for selected conversation with read receipts and typing indicator
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

  // Attachment support
  const { sendMessageWithAttachments } = useMessageAttachments();

  // State for editing messages
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [mobileActionsId, setMobileActionsId] = useState<string | null>(null);

  // Auto-scroll to bottom when messages change — only if user is near bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      // Fallback: scroll if no container ref yet
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Memoize grouped conversations for performance
  const groupedConversations = useMemo(() => {
    return groupConversationsByTime(conversations);
  }, [conversations]);

  // Subtitle stats — unread count + thread count for the editorial hero
  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations],
  );
  const threadCount = conversations.length;

  // Track if we've handled the player URL param
  const [handledPlayerParam, setHandledPlayerParam] = useState(false);

  // Handle player query parameter - find or create conversation with specific player
  useEffect(() => {
    if (handledPlayerParam || conversationsLoading || !playerIdFromUrl) return;

    const handlePlayerParam = async () => {
      // First, get the user_id for this player_id (since conversations use user IDs)
      const playerUserId = await getPlayerUserId(playerIdFromUrl);

      if (!playerUserId) {
        showToast('Could not find player', 'error');
        setHandledPlayerParam(true);
        router.replace('/golf/dashboard/messages', { scroll: false });
        return;
      }

      // Look for existing conversation with this player
      const existingConversation = conversations.find(conv => {
        // Check if other_participant exists and matches the user_id
        return !conv.is_group && conv.other_participant?.id === playerUserId;
      });

      if (existingConversation) {
        // Found existing conversation, select it
        setSelectedConversationId(existingConversation.id);
        setMobileShowChat(true);
        setHandledPlayerParam(true);
        // Clear the URL param
        router.replace('/golf/dashboard/messages', { scroll: false });
      } else {
        // No existing conversation, create one using the user_id
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
        // Clear the URL param
        router.replace('/golf/dashboard/messages', { scroll: false });
      }
    };

    handlePlayerParam();
  }, [conversations, conversationsLoading, playerIdFromUrl, handledPlayerParam, router, refetch, showToast, teamId]);

  // Auto-select first conversation (only if no player param was provided)
  useEffect(() => {
    const firstConversation = conversations[0];
    if (!conversationsLoading && firstConversation && !selectedConversationId && !playerIdFromUrl) {
      setSelectedConversationId(firstConversation.id);
    }
  }, [conversations, conversationsLoading, selectedConversationId, playerIdFromUrl]);

  // Get selected conversation details
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find(c => c.id === selectedConversationId);
  }, [conversations, selectedConversationId]);

  // Handle conversation selection
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowChat(true);
  };

  // Handle back button on mobile
  const handleBack = () => {
    setMobileShowChat(false);
  };

  // Handle new conversation creation
  const handleNewConversation = async (userId: string) => {
    try {
      const result = await createGolfConversation([userId], teamId || undefined);
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

  // Handle team broadcast creation
  const handleTeamBroadcastCreated = async (conversationId: string) => {
    await refetch();
    handleSelectConversation(conversationId);
    showToast('Team group created', 'success');
  };

  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    if (!selectedConversationId) return false;

    try {
      await sendMessage(content);
      // NOTE: Removed refetch() - real-time subscription automatically updates messages
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      showToast(errorMessage, 'error');
      return false;
    }
  };

  // Handle sending a message with attachments
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      showToast(errorMessage, 'error');
      return false;
    }
  };

  // Handle starting edit mode
  const handleStartEdit = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditContent(decodeMessageContent(currentContent));
    setDeleteConfirmId(null);
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  // Handle saving edit
  const handleSaveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    setIsEditSaving(true);
    try {
      await editMessage(editingMessageId, editContent.trim());
      showToast('Message updated', 'success');
      setEditingMessageId(null);
      setEditContent('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update message';
      showToast(errorMessage, 'error');
    } finally {
      setIsEditSaving(false);
    }
  };

  // Handle delete confirmation
  const handleDeleteClick = (messageId: string) => {
    setDeleteConfirmId(messageId);
    setEditingMessageId(null);
  };

  // Handle confirming delete
  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;

    try {
      await removeMessage(deleteConfirmId);
      showToast('Message deleted', 'success');
      setDeleteConfirmId(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete message';
      showToast(errorMessage, 'error');
    }
  };

  // Handle canceling delete
  const handleCancelDelete = () => {
    setDeleteConfirmId(null);
  };

  // No team error state - CRITICAL: Show helpful message
  if (!teamId) {
    return (
      <div className="h-[calc(100dvh-var(--golf-mobile-bottom-nav-offset))] lg:h-[100dvh] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <IconAlertCircle size={32} className="text-amber-500" />
          </div>
          <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">No Team Found</h2>
          <p className="text-warm-500 mb-6">
            You need to be assigned to a team before you can send messages.
            {userRole === 'coach'
              ? ' Please create a team in Team Settings or contact support.'
              : ' Please contact your coach to be added to a team.'}
          </p>
          {userRole === 'coach' && (
            <Button onClick={() => window.location.href = '/golf/dashboard/team'}>
              Go to Team Settings
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <AnimatedPage className="h-[calc(100dvh-var(--golf-mobile-bottom-nav-offset))] lg:h-[100dvh] flex">
      {/* Conversation List */}
      <div className={cn(
        'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-warm-200/60 surface-matte flex flex-col',
        mobileShowChat && 'hidden lg:flex'
      )}>
        {/* Header — uses shared LargeTitleHeader for consistent safe area, sticky, backdrop */}
        <LargeTitleHeader
          title="Messages"
          subtitle={teamName ? `${teamName} communication` : 'Team conversations'}
        >
          {userRole === 'coach' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowTeamBroadcastModal(true)}
              className="gap-1"
              title="Message team"
              aria-label="Message team"
            >
              <IconUsers size={16} />
              <span className="hidden sm:inline">Team</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setShowNewMessageModal(true)}
            className="gap-1"
            aria-label="New message"
          >
            <IconPlus size={16} />
            <span className="hidden xs:inline sm:inline">New</span>
          </Button>
        </LargeTitleHeader>

        {/* Editorial hero band — sits between the sticky title header and the
            conversation list so the inbox column reads with magazine rhythm.
            Tight padding keeps the conversation list above the fold. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-5 md:p-6 mx-4 md:mx-6 mt-2 mb-3">
            <PageHeader
              eyebrow="Messages"
              eyebrowAccent="primary"
              title="Your inbox."
              subtitle={
                threadCount === 0
                  ? 'Stay in touch with your team.'
                  : unreadCount > 0
                    ? `${unreadCount} unread · ${threadCount} thread${threadCount === 1 ? '' : 's'}.`
                    : `${threadCount} thread${threadCount === 1 ? '' : 's'}.`
              }
            />
          </div>
        </Reveal>

        {/* Conversation List */}
        <div className="flex-1 min-h-0" data-scroll-container>
          <PullToRefresh onRefresh={handleConversationsRefresh} className="overscroll-contain touch-pan-y">
          {conversationsLoading ? (
            <div className="p-2 space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-warm-200 skeleton-shimmer flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-4 w-24 bg-warm-200 rounded skeleton-shimmer" />
                      <div className="h-3 w-10 bg-warm-100 rounded skeleton-shimmer" />
                    </div>
                    <div className="h-3 w-40 bg-warm-100 rounded skeleton-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<IconMail size={28} />}
              title="No conversations yet"
              description="Reach out to a teammate or coach to get a thread started."
              action={{
                label: 'Start a Conversation',
                onClick: () => setShowNewMessageModal(true),
              }}
            />
          ) : (
            <div className="py-2">
              {groupedConversations.today.length > 0 && (
                <ConversationGroup
                  label="Today"
                  conversations={groupedConversations.today}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                />
              )}
              {groupedConversations.yesterday.length > 0 && (
                <ConversationGroup
                  label="Yesterday"
                  conversations={groupedConversations.yesterday}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                />
              )}
              {groupedConversations.thisWeek.length > 0 && (
                <ConversationGroup
                  label="This Week"
                  conversations={groupedConversations.thisWeek}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                />
              )}
              {groupedConversations.older.length > 0 && (
                <ConversationGroup
                  label="Earlier"
                  conversations={groupedConversations.older}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                />
              )}
            </div>
          )}
          </PullToRefresh>
        </div>
      </div>

      {/* Chat Window */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col bg-warm-50',
        !mobileShowChat && 'hidden lg:flex'
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div
              className="border-b border-warm-200/60 surface-matte flex items-center gap-3 px-4"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
                paddingBottom: '0.75rem',
              }}
            >
              <IconButton variant="default"
                onClick={handleBack}
                className="lg:hidden p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-warm-600 hover:text-warm-900 active:bg-warm-100 transition-colors"
                aria-label="Back to conversations"
              >
                <IconArrowLeft size={22} />
              </IconButton>
              {selectedConversation.is_group ? (
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <IconUsers size={20} className="text-primary-600" />
                </div>
              ) : (
                <Avatar
                  name={selectedConversation.other_participant?.name || 'User'}
                  src={selectedConversation.other_participant?.avatar}
                  size="md"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-warm-900 truncate">
                  {selectedConversation.is_group
                    ? selectedConversation.title || 'Team Group'
                    : selectedConversation.other_participant?.name || 'Unknown User'}
                </p>
                <p className="text-sm text-warm-500 truncate">
                  {selectedConversation.is_group
                    ? 'Group Conversation'
                    : selectedConversation.other_participant?.subtitle || ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 overscroll-contain touch-pan-y" data-scroll-container>
              {messagesLoading ? (
                <div className="space-y-3 py-8 px-4">
                  <div className="h-4 w-3/4 bg-warm-200 rounded skeleton-shimmer" />
                  <div className="h-4 w-1/2 bg-warm-200 rounded skeleton-shimmer" />
                  <div className="h-4 w-2/3 bg-warm-200 rounded skeleton-shimmer" />
                </div>
              ) : !messages || messages.length === 0 ? (
                <EmptyState
                  variant="minimal"
                  icon={<IconMessageSquare size={20} />}
                  description="No messages yet — start the conversation!"
                />
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => {
                    const isOwn = msg.sender_id === userId || msg.sender_id === currentUserId;
                    const prevMsg = messages[idx - 1];
                    const nextMsg = messages[idx + 1];

                    // Group consecutive messages from same sender
                    const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                    const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;

                    // Only show time on last message of group
                    const showTime = isLastInGroup;

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex items-end gap-2',
                          isOwn ? 'justify-end' : 'justify-start',
                          !isLastInGroup && 'mb-0.5' // Tighter spacing within groups
                        )}
                      >
                        {/* Avatar + sender name for incoming messages */}
                        {!isOwn && (
                          <div className="w-8 shrink-0 flex flex-col items-center">
                            {isFirstInGroup ? (
                              selectedConversation?.is_group ? (
                                <Avatar
                                  name={msg.sender_id.slice(0, 8)}
                                  size="sm"
                                />
                              ) : (
                                <Avatar
                                  name={selectedConversation?.other_participant?.name || 'User'}
                                  src={selectedConversation?.other_participant?.avatar}
                                  size="sm"
                                />
                              )
                            ) : null}
                          </div>
                        )}

                        {/* Message bubble with edit/delete controls */}
                        <div className={cn('group relative flex flex-col gap-1 max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
                          {/* Sender name above first incoming message in group */}
                          {!isOwn && isFirstInGroup && (
                            <span className="text-eyebrow font-medium text-warm-500 ml-1 mb-0.5">
                              {selectedConversation?.other_participant?.name || 'User'}
                            </span>
                          )}
                          {/* Edit/Delete buttons for own messages — desktop: hover, mobile: tap row below bubble */}
                          {isOwn && editingMessageId !== msg.id && deleteConfirmId !== msg.id && (
                            <>
                              {/* Desktop: absolute positioned, hover reveal */}
                              <div className={cn(
                                'absolute hidden lg:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
                                'right-full mr-1 top-1/2 -translate-y-1/2'
                              )}>
                                <IconButton variant="default" aria-label="Edit"
                                  onClick={() => handleStartEdit(msg.id, msg.content)}
                                  className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 active:bg-warm-200 transition-colors"
                                  title="Edit message"
                                >
                                  <IconPencil size={14} />
                                </IconButton>
                                <IconButton variant="default" aria-label="Delete"
                                  onClick={() => handleDeleteClick(msg.id)}
                                  className="p-1.5 rounded-lg text-warm-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Delete message"
                                >
                                  <IconTrash size={14} />
                                </IconButton>
                              </div>
                              {/* Mobile: "..." button that expands edit/delete */}
                              <div className="relative flex lg:hidden items-center mt-0.5">
                                {mobileActionsId === msg.id ? (
                                  <div className="flex items-center gap-1 bg-warm-50 rounded-lg px-1 py-0.5">
                                    <IconButton variant="default"
                                      onClick={() => { handleStartEdit(msg.id, msg.content); setMobileActionsId(null); }}
                                      className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-warm-400 active:text-warm-600 active:bg-warm-100 transition-colors"
                                      aria-label="Edit message"
                                    >
                                      <IconPencil size={18} />
                                    </IconButton>
                                    <IconButton variant="default"
                                      onClick={() => { handleDeleteClick(msg.id); setMobileActionsId(null); }}
                                      className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-warm-400 active:text-red-500 active:bg-red-50 transition-colors"
                                      aria-label="Delete message"
                                    >
                                      <IconTrash size={18} />
                                    </IconButton>
                                    <IconButton variant="default"
                                      onClick={() => setMobileActionsId(null)}
                                      className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-warm-400 active:text-warm-600 transition-colors"
                                      aria-label="Close"
                                    >
                                      <IconX size={16} />
                                    </IconButton>
                                  </div>
                                ) : (
                                  <IconButton variant="default"
                                    onClick={() => setMobileActionsId(msg.id)}
                                    className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-warm-300 active:text-warm-500 transition-colors"
                                    aria-label="Message actions"
                                  >
                                    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                                  </IconButton>
                                )}
                              </div>
                            </>
                          )}

                          {/* Delete confirmation */}
                          {deleteConfirmId === msg.id && (
                            <div className="flex items-center gap-1 mr-2 bg-red-50 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs text-red-600 mr-1">Delete?</span>
                              <IconButton variant="default"
                                onClick={handleConfirmDelete}
                                className="p-2 min-w-[40px] min-h-[40px] rounded-lg text-red-600 hover:bg-red-100 active:bg-red-100 transition-colors flex items-center justify-center"
                                title="Confirm delete"
                                aria-label="Confirm delete"
                              >
                                <IconCheck size={18} />
                              </IconButton>
                              <IconButton variant="default"
                                onClick={handleCancelDelete}
                                className="p-2 min-w-[40px] min-h-[40px] rounded-lg text-warm-500 hover:bg-warm-200 active:bg-warm-200 transition-colors flex items-center justify-center"
                                title="Cancel"
                                aria-label="Cancel delete"
                              >
                                <IconX size={18} />
                              </IconButton>
                            </div>
                          )}

                          {/* Message bubble - edit mode */}
                          {editingMessageId === msg.id ? (
                            <div className={cn(
                              'w-full px-3 py-2',
                              'bg-primary-50 border-2 border-primary-300 shadow-sm',
                              'rounded-2xl'
                            )}>
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full bg-transparent text-sm text-warm-900 resize-none focus:outline-none min-w-[200px]"
                                rows={Math.min(5, editContent.split('\n').length || 1)}
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-primary-200">
                                <Button variant="ghost"
                                  onClick={handleCancelEdit}
                                  className="px-2 py-1 text-xs text-warm-500 hover:text-warm-700 rounded transition-colors"
                                  disabled={isEditSaving}
                                >
                                  Cancel
                                </Button>
                                <Button variant="primary"
                                  onClick={handleSaveEdit}
                                  disabled={isEditSaving || !editContent.trim()}
                                  className={cn(
                                    'px-2 py-1 text-xs rounded transition-colors',
                                    isEditSaving || !editContent.trim()
                                      ? 'text-warm-400 cursor-not-allowed'
                                      : 'text-primary-600 hover:text-primary-700 hover:bg-primary-100'
                                  )}
                                >
                                  {isEditSaving ? 'Saving...' : 'Save'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* Message bubble - normal mode */
                            <div className={cn(
                              'px-4 py-2.5',
                              isOwn
                                ? 'bg-primary-500 text-white'
                                : 'bg-cream-100/75 backdrop-blur-sm border border-warm-200/45 text-warm-900 ',
                              // Dynamic border radius based on position in group
                              isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'),
                              isFirstInGroup && !isLastInGroup && (isOwn ? 'rounded-2xl rounded-br-lg' : 'rounded-2xl rounded-bl-lg'),
                              !isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-2xl rounded-tr-lg rounded-br-md' : 'rounded-2xl rounded-tl-lg rounded-bl-md'),
                              !isFirstInGroup && !isLastInGroup && (isOwn ? 'rounded-r-2xl rounded-l-lg' : 'rounded-l-2xl rounded-r-lg'),
                            )}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {decodeMessageContent(msg.content)}
                              </p>
                              {/* Edited indicator - check if property exists on message */}
                              {'edited_at' in msg && (msg as MessageWithReadStatus & { edited_at?: string }).edited_at && (
                                <span className={cn(
                                  'text-xs mt-1 block',
                                  isOwn ? 'text-primary-200' : 'text-warm-400'
                                )}>
                                  (edited)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Time + read receipt (only on last message of group) */}
                        {showTime && editingMessageId !== msg.id && (
                          <div className={cn(
                            'flex items-center gap-1 pb-1',
                            isOwn ? 'flex-row-reverse' : ''
                          )}>
                            <span className="text-xs text-warm-400">
                              {formatTime(msg.created_at)}
                            </span>
                            {/* Read receipt indicator for own messages */}
                            {isOwn && (
                              <ReadReceiptIcon isRead={(msg as MessageWithReadStatus).isRead} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {isOtherTyping && (
                    <div className="flex items-end gap-2 justify-start">
                      <div className="w-8 shrink-0">
                        <Avatar
                          name={selectedConversation?.other_participant?.name || 'User'}
                          src={selectedConversation?.other_participant?.avatar}
                          size="sm"
                        />
                      </div>
                      <TypingIndicator />
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <MessageInput
              onSend={handleSendMessage}
              onSendWithAttachments={handleSendMessageWithAttachments}
              onTyping={sendTypingStatus}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <div className="w-16 h-16 rounded-full bg-warm-200 flex items-center justify-center mb-4">
              <IconMessageSquare size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-medium text-warm-900 mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-warm-500 mb-4">
              Choose a conversation from the left to start messaging
            </p>
            <Button onClick={() => setShowNewMessageModal(true)}>
              Start New Conversation
            </Button>
          </div>
        )}
      </div>

      {/* New Message Modal - NOW WITH CORRECT teamId */}
      <GolfNewMessageModal
        isOpen={showNewMessageModal}
        onClose={() => setShowNewMessageModal(false)}
        onSelect={handleNewConversation}
        currentUserRole={userRole || 'player'}
        teamId={teamId}  // THIS IS NOW GUARANTEED TO BE SET OR MODAL WON'T OPEN
      />

      {/* Team Broadcast Modal (coaches only) */}
      {userRole === 'coach' && teamId && (
        <GolfTeamBroadcastModal
          isOpen={showTeamBroadcastModal}
          onClose={() => setShowTeamBroadcastModal(false)}
          onSuccess={handleTeamBroadcastCreated}
          teamId={teamId}
        />
      )}
    </AnimatedPage>
  );
}

// Read Receipt Icon Component
function ReadReceiptIcon({ isRead }: { isRead?: boolean }) {
  if (isRead) {
    // Double checkmark (read)
    return (
      <svg
        className="w-4 h-4 text-primary-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-label="Read"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M2 13l4 4L16 7M8 13l4 4L22 7"
        />
      </svg>
    );
  }
  // Single checkmark (sent but not read)
  return (
    <svg
      className="w-3.5 h-3.5 text-warm-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-label="Sent"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// Typing Indicator Component
function TypingIndicator() {
  return (
    <div className="bg-white border border-warm-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-warm-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// Message Input Component
interface MessageInputProps {
  onSend: (content: string) => Promise<boolean>;
  onSendWithAttachments?: (content: string, attachments: PendingAttachment[]) => Promise<boolean>;
  onTyping?: (isTyping: boolean) => void;
}

function MessageInput({ onSend, onSendWithAttachments, onTyping }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attachmentIdCounter = useRef(0);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Handle typing status
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setMessage(newValue);

    // Broadcast typing status
    if (onTyping) {
      if (newValue.trim()) {
        onTyping(true);
        // Clear previous timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        // Set timeout to stop typing indicator after 2 seconds of no input
        typingTimeoutRef.current = setTimeout(() => {
          onTyping(false);
        }, 2000);
      } else {
        onTyping(false);
      }
    }
  };

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Handle file selection from AttachmentButton
  const handleFilesSelected = (files: File[]) => {
    const newAttachments: PendingAttachment[] = files.map(file => {
      attachmentIdCounter.current += 1;
      const isPreviewable = file.type.startsWith('image/') || file.type.startsWith('video/');
      return {
        id: `pending-${attachmentIdCounter.current}-${Date.now()}`,
        file,
        previewUrl: isPreviewable ? URL.createObjectURL(file) : '',
        metadata: {
          fileName: file.name,
          fileType: (file.type.startsWith('image/') ? 'image' :
            file.type.startsWith('video/') ? 'video' :
            file.type.startsWith('audio/') ? 'audio' : 'document') as 'image' | 'video' | 'audio' | 'document',
          mimeType: file.type,
          fileSize: file.size,
        },
        status: 'pending' as const,
        uploadProgress: 0,
      };
    });
    setPendingAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments(prev => {
      const removed = prev.find(a => a.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!message.trim() && !hasAttachments) || sending) return;

    // Clear typing indicator before sending
    if (onTyping) {
      onTyping(false);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setSending(true);

    let success = false;
    if (hasAttachments && onSendWithAttachments) {
      success = await onSendWithAttachments(message.trim(), pendingAttachments);
    } else {
      success = await onSend(message.trim());
    }

    if (success) {
      // Revoke object URLs for previews
      pendingAttachments.forEach(a => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
      setMessage('');
      setPendingAttachments([]);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const canSend = (message.trim() || pendingAttachments.length > 0) && !sending;

  return (
    <form onSubmit={handleSubmit} className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4 bg-cream-100/68 backdrop-blur-sm border-t border-warm-200/45">
      {/* Pending attachment previews */}
      {pendingAttachments.length > 0 && (
        <AttachmentPreview
          attachments={pendingAttachments}
          onRemove={handleRemoveAttachment}
          className="mb-2 rounded-xl"
        />
      )}
      <div className={cn(
        'flex items-end gap-2 p-1.5 rounded-2xl',
        'bg-cream-100/60 border border-warm-200/45',
        'focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20',
        'transition-all duration-200'
      )}>
        {/* Attachment button */}
        <AttachmentButton
          onFilesSelected={handleFilesSelected}
          disabled={sending}
          className="mb-0.5"
        />
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent px-2 py-2 text-base lg:text-sm',
            'placeholder:text-warm-400',
            'focus:outline-none'
          )}
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        <Button variant="primary"
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className={cn(
            'h-11 w-11 md:h-10 md:w-10 rounded-xl flex items-center justify-center flex-shrink-0',
            'transition-all duration-200 active:scale-90',
            canSend
              ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-sm'
              : 'bg-warm-200 text-warm-400 cursor-not-allowed'
          )}
        >
          {sending ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
            </span>
          ) : (
            <IconSend size={18} />
          )}
        </Button>
      </div>
      <p className="text-xs text-warm-400 mt-1.5 px-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  );
}

// Time formatting helper
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Group conversations by recency
function groupConversationsByTime(conversations: GolfConversationWithMeta[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    today: [] as GolfConversationWithMeta[],
    yesterday: [] as GolfConversationWithMeta[],
    thisWeek: [] as GolfConversationWithMeta[],
    older: [] as GolfConversationWithMeta[],
  };

  conversations.forEach(conv => {
    const lastMsgDate = conv.last_message?.created_at
      ? new Date(conv.last_message.created_at)
      : new Date(0);

    if (lastMsgDate >= today) {
      groups.today.push(conv);
    } else if (lastMsgDate >= yesterday) {
      groups.yesterday.push(conv);
    } else if (lastMsgDate >= lastWeek) {
      groups.thisWeek.push(conv);
    } else {
      groups.older.push(conv);
    }
  });

  return groups;
}

// Conversation Group Component
function ConversationGroup({
  label,
  conversations,
  selectedId,
  onSelect,
}: {
  label: string;
  conversations: GolfConversationWithMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-2">
      <h3 className="px-4 py-1.5 text-eyebrow font-medium text-warm-500 uppercase tracking-[0.12em] opacity-80">
        {label}
      </h3>
      <div className="space-y-0.5 px-2">
        {conversations.map(conv => (
          <ConversationRow
            key={conv.id}
            conversation={conv}
            isSelected={selectedId === conv.id}
            onSelect={() => onSelect(conv.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Premium Conversation Row Component
function ConversationRow({
  conversation: conv,
  isSelected,
  onSelect,
}: {
  conversation: GolfConversationWithMeta;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasUnread = conv.unread_count > 0;
  const isGroup = conv.is_group;

  // Determine display name and avatar for groups vs 1:1
  const displayName = isGroup
    ? conv.title || 'Team Group'
    : conv.other_participant?.name || 'Unknown User';

  return (
    <Button variant="primary"
      onClick={onSelect}
      className={cn(
        'w-full p-3 min-h-[72px] flex items-start gap-3 text-left rounded-xl',
        'transition-all duration-150',
        isSelected
          ? 'bg-primary-50 shadow-sm'
          : 'hover:bg-warm-50 active:bg-warm-100'
      )}
    >
      {/* Avatar with unread indicator */}
      <div className="relative">
        {isGroup ? (
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <IconUsers size={20} className="text-primary-600" />
          </div>
        ) : (
          <Avatar
            name={conv.other_participant?.name || 'User'}
            src={conv.other_participant?.avatar}
            size="md"
          />
        )}
        {hasUnread && (
          <span className="absolute -top-1 -right-1 w-5 h-5
                          bg-primary-500 rounded-full
                          flex items-center justify-center
                          text-eyebrow font-medium text-white
                          ring-2 ring-cream-50">
            {conv.unread_count > 9 ? '9+' : conv.unread_count}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Name + time row */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              'truncate',
              hasUnread ? 'font-medium text-warm-900' : 'font-medium text-warm-700'
            )}>
              {displayName}
            </span>
            {isGroup && (
              <span className="px-1.5 py-0.5 text-eyebrow font-medium uppercase tracking-wide bg-primary-100 text-primary-700 rounded flex-shrink-0">
                Group
              </span>
            )}
          </div>
          {conv.last_message && (
            <span className={cn(
              'text-xs flex-shrink-0',
              hasUnread ? 'text-primary-600 font-medium' : 'text-warm-400'
            )}>
              {formatTime(conv.last_message.created_at)}
            </span>
          )}
        </div>

        {/* Preview */}
        <p className={cn(
          'text-sm truncate',
          hasUnread ? 'text-warm-900' : 'text-warm-500'
        )}>
          {conv.last_message?.content ? decodeMessageContent(conv.last_message.content) : 'No messages yet'}
        </p>
      </div>
    </Button>
  );
}
