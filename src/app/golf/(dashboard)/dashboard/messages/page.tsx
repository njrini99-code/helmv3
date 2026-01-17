'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconMail, IconPlus, IconSend, IconArrowLeft, IconMessageSquare, IconAlertCircle, IconPencil, IconTrash, IconCheck, IconX, IconUsers } from '@/components/icons';
import { useToast } from '@/components/ui/toast';
import { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import { createGolfConversation, getPlayerUserId } from '@/app/golf/actions/messages';
import { GolfNewMessageModal } from '@/components/golf/messages/GolfNewMessageModal';
import { GolfTeamBroadcastModal } from '@/components/golf/messages/GolfTeamBroadcastModal';
import { useTeamContext } from '@/hooks/golf/use-team-context';
import type { GolfConversationWithMeta, MessageWithReadStatus } from '@/hooks/golf/use-golf-messages';

export default function GolfMessagesPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playerIdFromUrl = searchParams.get('player');

  // USE THE TEAM CONTEXT HOOK - This ensures we have valid team info
  const {
    userId,
    userRole,
    teamId,
    teamName,
    loading: contextLoading
  } = useTeamContext();

  const { conversations, loading: conversationsLoading, refetch } = useGolfConversations();

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

  // State for editing messages
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Memoize grouped conversations for performance
  const groupedConversations = useMemo(() => {
    return groupConversationsByTime(conversations);
  }, [conversations]);

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
          const result = await createGolfConversation([playerUserId]);
          if (result.conversationId) {
            await refetch();
            setSelectedConversationId(result.conversationId);
            setMobileShowChat(true);
            showToast('Conversation started', 'success');
          }
        } catch {
          showToast('Failed to start conversation', 'error');
        }
        setHandledPlayerParam(true);
        // Clear the URL param
        router.replace('/golf/dashboard/messages', { scroll: false });
      }
    };

    handlePlayerParam();
  }, [conversations, conversationsLoading, playerIdFromUrl, handledPlayerParam, router, refetch, showToast]);

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
      const result = await createGolfConversation([userId]);
      if (result.conversationId) {
        await refetch();
        handleSelectConversation(result.conversationId);
        showToast('Conversation started', 'success');
      }
    } catch {
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

  // Handle starting edit mode
  const handleStartEdit = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditContent(currentContent);
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

  // Loading state
  if (contextLoading || conversationsLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // No team error state - CRITICAL: Show helpful message
  if (!teamId) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <IconAlertCircle size={32} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">No Team Found</h2>
          <p className="text-slate-500 mb-6">
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
    <div className="h-[calc(100vh-64px)] flex">
      {/* Conversation List */}
      <div className={cn(
        'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-slate-200/60 glass-standard flex flex-col',
        mobileShowChat && 'hidden lg:flex'
      )}>
        {/* Header */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-semibold text-slate-900">Messages</h1>
            <div className="flex items-center gap-2">
              {userRole === 'coach' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowTeamBroadcastModal(true)}
                  className="gap-1"
                  title="Message team"
                >
                  <IconUsers size={16} />
                  <span className="hidden sm:inline">Team</span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => setShowNewMessageModal(true)}
                className="gap-1"
              >
                <IconPlus size={16} />
                New
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-500">{teamName || 'Team'} communication</p>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
          {!conversations || conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <IconMail size={20} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500 mb-4">No conversations yet</p>
              <Button size="sm" onClick={() => setShowNewMessageModal(true)}>
                Start a Conversation
              </Button>
            </div>
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
        </div>
      </div>

      {/* Chat Window */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col bg-slate-50',
        !mobileShowChat && 'hidden lg:flex'
      )}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-200/60 glass-standard flex items-center gap-3">
              <button
                onClick={handleBack}
                className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-600"
                aria-label="Back to conversations"
              >
                <IconArrowLeft size={20} />
              </button>
              {selectedConversation.is_group ? (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <IconUsers size={20} className="text-emerald-600" />
                </div>
              ) : (
                <Avatar
                  name={selectedConversation.other_participant?.name || 'User'}
                  src={selectedConversation.other_participant?.avatar}
                  size="md"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">
                  {selectedConversation.is_group
                    ? selectedConversation.title || 'Team Group'
                    : selectedConversation.other_participant?.name || 'Unknown User'}
                </p>
                <p className="text-sm text-slate-500 truncate">
                  {selectedConversation.is_group
                    ? 'Group Conversation'
                    : selectedConversation.other_participant?.subtitle || ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} data-scroll-container>
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full" />
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                    <IconMessageSquare size={20} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">No messages yet</p>
                  <p className="text-xs text-slate-400 mt-1">Start the conversation!</p>
                </div>
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
                        {/* Avatar (only for first message in group) */}
                        {!isOwn && (
                          <div className="w-8 shrink-0">
                            {isFirstInGroup && (
                              <Avatar
                                name={selectedConversation?.other_participant?.name || 'User'}
                                src={selectedConversation?.other_participant?.avatar}
                                size="sm"
                              />
                            )}
                          </div>
                        )}

                        {/* Message bubble with edit/delete controls */}
                        <div className="group relative flex items-center gap-1">
                          {/* Edit/Delete buttons for own messages (appear on hover) */}
                          {isOwn && editingMessageId !== msg.id && deleteConfirmId !== msg.id && (
                            <div className={cn(
                              'absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
                              'right-full mr-1'
                            )}>
                              <button
                                onClick={() => handleStartEdit(msg.id, msg.content)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                                title="Edit message"
                              >
                                <IconPencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(msg.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete message"
                              >
                                <IconTrash size={14} />
                              </button>
                            </div>
                          )}

                          {/* Delete confirmation */}
                          {deleteConfirmId === msg.id && (
                            <div className="flex items-center gap-1 mr-2 bg-red-50 rounded-lg px-2 py-1">
                              <span className="text-xs text-red-600 mr-1">Delete?</span>
                              <button
                                onClick={handleConfirmDelete}
                                className="p-1 rounded text-red-600 hover:bg-red-100 transition-colors"
                                title="Confirm delete"
                              >
                                <IconCheck size={14} />
                              </button>
                              <button
                                onClick={handleCancelDelete}
                                className="p-1 rounded text-slate-500 hover:bg-slate-200 transition-colors"
                                title="Cancel"
                              >
                                <IconX size={14} />
                              </button>
                            </div>
                          )}

                          {/* Message bubble - edit mode */}
                          {editingMessageId === msg.id ? (
                            <div className={cn(
                              'max-w-[70%] px-3 py-2',
                              'bg-emerald-50 border-2 border-emerald-300 shadow-sm',
                              'rounded-2xl'
                            )}>
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full bg-transparent text-sm text-slate-900 resize-none focus:outline-none min-w-[200px]"
                                rows={Math.min(5, editContent.split('\n').length || 1)}
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-emerald-200">
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 rounded transition-colors"
                                  disabled={isEditSaving}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={isEditSaving || !editContent.trim()}
                                  className={cn(
                                    'px-2 py-1 text-xs rounded transition-colors',
                                    isEditSaving || !editContent.trim()
                                      ? 'text-slate-400 cursor-not-allowed'
                                      : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100'
                                  )}
                                >
                                  {isEditSaving ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Message bubble - normal mode */
                            <div className={cn(
                              'max-w-[70%] px-4 py-2.5',
                              isOwn
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white border border-slate-200 text-slate-900 shadow-sm',
                              // Dynamic border radius based on position in group
                              isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'),
                              isFirstInGroup && !isLastInGroup && (isOwn ? 'rounded-2xl rounded-br-lg' : 'rounded-2xl rounded-bl-lg'),
                              !isFirstInGroup && isLastInGroup && (isOwn ? 'rounded-2xl rounded-tr-lg rounded-br-md' : 'rounded-2xl rounded-tl-lg rounded-bl-md'),
                              !isFirstInGroup && !isLastInGroup && (isOwn ? 'rounded-r-2xl rounded-l-lg' : 'rounded-l-2xl rounded-r-lg'),
                            )}>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {msg.content}
                              </p>
                              {/* Edited indicator - check if property exists on message */}
                              {'edited_at' in msg && (msg as MessageWithReadStatus & { edited_at?: string }).edited_at && (
                                <span className={cn(
                                  'text-[10px] mt-1 block',
                                  isOwn ? 'text-emerald-200' : 'text-slate-400'
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
                            <span className="text-[10px] text-slate-400">
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
                </div>
              )}
            </div>

            {/* Message Input */}
            <MessageInput onSend={handleSendMessage} onTyping={sendTypingStatus} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
              <IconMessageSquare size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-slate-500 mb-4">
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
    </div>
  );
}

// Read Receipt Icon Component
function ReadReceiptIcon({ isRead }: { isRead?: boolean }) {
  if (isRead) {
    // Double checkmark (read)
    return (
      <svg
        className="w-4 h-4 text-emerald-500"
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
      className="w-3.5 h-3.5 text-slate-400"
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
    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

// Message Input Component
interface MessageInputProps {
  onSend: (content: string) => Promise<boolean>;
  onTyping?: (isTyping: boolean) => void;
}

function MessageInput({ onSend, onTyping }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    // Clear typing indicator before sending
    if (onTyping) {
      onTyping(false);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    setSending(true);
    const success = await onSend(message.trim());
    if (success) {
      setMessage('');
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200/60">
      <div className={cn(
        'flex items-end gap-3 p-1.5 rounded-2xl',
        'bg-slate-50 border border-slate-200',
        'focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20',
        'transition-all duration-200'
      )}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent px-3 py-2 text-sm',
            'placeholder:text-slate-400',
            'focus:outline-none'
          )}
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        <button
          type="submit"
          disabled={!message.trim() || sending}
          className={cn(
            'h-10 w-10 rounded-xl flex items-center justify-center',
            'transition-all duration-200',
            message.trim() && !sending
              ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          )}
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <IconSend size={18} />
          )}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 px-2">
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
      <h3 className="px-4 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-3 flex items-start gap-3 text-left rounded-xl',
        'transition-all duration-150',
        isSelected
          ? 'bg-emerald-50 shadow-sm'
          : 'hover:bg-slate-50'
      )}
    >
      {/* Avatar with unread indicator */}
      <div className="relative">
        {isGroup ? (
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <IconUsers size={20} className="text-emerald-600" />
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
                          bg-emerald-500 rounded-full
                          flex items-center justify-center
                          text-[10px] font-bold text-white
                          ring-2 ring-white shadow-sm">
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
              hasUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
            )}>
              {displayName}
            </span>
            {isGroup && (
              <span className="px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide bg-emerald-100 text-emerald-700 rounded flex-shrink-0">
                Group
              </span>
            )}
          </div>
          {conv.last_message && (
            <span className={cn(
              'text-[11px] flex-shrink-0',
              hasUnread ? 'text-emerald-600 font-medium' : 'text-slate-400'
            )}>
              {formatTime(conv.last_message.created_at)}
            </span>
          )}
        </div>

        {/* Preview */}
        <p className={cn(
          'text-sm truncate',
          hasUnread ? 'text-slate-900' : 'text-slate-500'
        )}>
          {conv.last_message?.content || 'No messages yet'}
        </p>
      </div>
    </button>
  );
}
