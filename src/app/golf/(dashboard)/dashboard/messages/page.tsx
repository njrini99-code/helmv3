'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconMail, IconPlus, IconSend, IconArrowLeft, IconMessageSquare } from '@/components/icons';
import { useToast } from '@/components/ui/toast';
import { useGolfConversations, useGolfMessages } from '@/hooks/golf/use-golf-messages';
import { createGolfConversation } from '@/app/golf/actions/messages';
import { GolfNewMessageModal } from '@/components/golf/messages/GolfNewMessageModal';
import { createClient } from '@/lib/supabase/client';
import type { GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';

export default function GolfMessagesPage() {
  const { showToast } = useToast();
  const { conversations, loading: conversationsLoading, refetch } = useGolfConversations();
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [teamId, setTeamId] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<'coach' | 'player'>('player');

  // Get messages for selected conversation
  const { messages, loading: messagesLoading, sendMessage } = useGolfMessages(selectedConversationId || '');

  // Memoize grouped conversations for performance
  const groupedConversations = useMemo(() => {
    return groupConversationsByTime(conversations);
  }, [conversations]);

  // Fetch current user and their team/role
  useEffect(() => {
    const fetchUserInfo = async () => {
      const supabase = createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);
      
      // Check if user is a golf coach
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id, team_id')
        .eq('user_id', user.id)
        .single();
      
      if (coach) {
        setUserRole('coach');
        if (!coach.team_id) {
          console.warn('Coach has no team assigned');
        }
        setTeamId(coach.team_id || undefined);
        return;
      }

      // Check if user is a golf player
      const { data: player } = await supabase
        .from('golf_players')
        .select('id, team_id')
        .eq('user_id', user.id)
        .single();

      if (player) {
        setUserRole('player');
        if (!player.team_id) {
          console.warn('Player has no team assigned');
        }
        setTeamId(player.team_id || undefined);
      }
    };
    
    fetchUserInfo();
  }, []);

  // Auto-select first conversation
  useEffect(() => {
    const firstConversation = conversations[0];
    if (!conversationsLoading && firstConversation && !selectedConversationId) {
      setSelectedConversationId(firstConversation.id);
    }
  }, [conversations, conversationsLoading, selectedConversationId]);

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
    } catch (error) {
      console.error('Error creating conversation:', error);
      showToast('Failed to start conversation', 'error');
    }
  };

  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    if (!selectedConversationId) return false;

    try {
      await sendMessage(content);
      refetch();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('Message send error:', error);
      showToast(errorMessage, 'error');
      return false;
    }
  };

  if (conversationsLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
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
            <Button
              size="sm"
              onClick={() => setShowNewMessageModal(true)}
              className="gap-1"
            >
              <IconPlus size={16} />
              New
            </Button>
          </div>
          <p className="text-sm text-slate-500">Team communication</p>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
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
                  currentUserId={currentUserId}
                />
              )}
              {groupedConversations.yesterday.length > 0 && (
                <ConversationGroup
                  label="Yesterday"
                  conversations={groupedConversations.yesterday}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                  currentUserId={currentUserId}
                />
              )}
              {groupedConversations.thisWeek.length > 0 && (
                <ConversationGroup
                  label="This Week"
                  conversations={groupedConversations.thisWeek}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                  currentUserId={currentUserId}
                />
              )}
              {groupedConversations.older.length > 0 && (
                <ConversationGroup
                  label="Earlier"
                  conversations={groupedConversations.older}
                  selectedId={selectedConversationId}
                  onSelect={handleSelectConversation}
                  currentUserId={currentUserId}
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
              <Avatar
                name={selectedConversation.other_participant?.name || 'User'}
                src={selectedConversation.other_participant?.avatar}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">
                  {selectedConversation.other_participant?.name || 'Unknown User'}
                </p>
                <p className="text-sm text-slate-500 truncate">
                  {selectedConversation.other_participant?.subtitle || ''}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
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
                    const isOwn = msg.sender_id === currentUserId;
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

                        {/* Message bubble */}
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
                        </div>

                        {/* Time + read receipt (only on last message of group) */}
                        {showTime && (
                          <div className={cn(
                            'flex items-center gap-1 pb-1',
                            isOwn ? 'flex-row-reverse' : ''
                          )}>
                            <span className="text-[10px] text-slate-400">
                              {formatTime(msg.sent_at)}
                            </span>
                            {isOwn && (
                              <svg
                                className="w-3.5 h-3.5 text-emerald-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Message Input */}
            <MessageInput onSend={handleSendMessage} />
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

      {/* New Message Modal */}
      <GolfNewMessageModal
        isOpen={showNewMessageModal}
        onClose={() => setShowNewMessageModal(false)}
        onSelect={handleNewConversation}
        currentUserRole={userRole}
        teamId={teamId}
      />
    </div>
  );
}

// Message Input Component
function MessageInput({ onSend }: { onSend: (content: string) => Promise<boolean> }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

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
          onChange={(e) => setMessage(e.target.value)}
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
    const lastMsgDate = conv.last_message?.sent_at
      ? new Date(conv.last_message.sent_at)
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
  currentUserId,
}: {
  label: string;
  conversations: GolfConversationWithMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentUserId: string | null;
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
        <Avatar
          name={conv.other_participant?.name || 'User'}
          src={conv.other_participant?.avatar}
          size="md"
        />
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
          <span className={cn(
            'truncate',
            hasUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
          )}>
            {conv.other_participant?.name || 'Unknown User'}
          </span>
          {conv.last_message && (
            <span className={cn(
              'text-[11px] flex-shrink-0',
              hasUnread ? 'text-emerald-600 font-medium' : 'text-slate-400'
            )}>
              {formatTime(conv.last_message.sent_at)}
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
