'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconMail, IconPlus, IconSend, IconArrowLeft, IconMessageSquare } from '@/components/icons';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { useGolfConversations, useGolfMessages, type GolfConversationWithMeta } from '@/hooks/golf/use-golf-messages';
import { createGolfConversation } from '@/app/golf/actions/messages';
import { GolfNewMessageModal } from '@/components/golf/messages/GolfNewMessageModal';
import { createClient } from '@/lib/supabase/client';

export default function GolfMessagesPage() {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const { conversations, loading: conversationsLoading, refetch } = useGolfConversations();
  
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [teamId, setTeamId] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<'coach' | 'player'>('player');

  // Get messages for selected conversation
  const { messages, loading: messagesLoading, sendMessage } = useGolfMessages(selectedConversationId || '');

  // Fetch user's team and role
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!user) return;
      
      const supabase = createClient();
      
      // Check if user is a golf coach
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id, team_id')
        .eq('user_id', user.id)
        .single();
      
      if (coach) {
        setUserRole('coach');
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
        setTeamId(player.team_id || undefined);
      }
    };
    
    fetchUserInfo();
  }, [user]);

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
    const success = await sendMessage(content);
    if (success) {
      refetch();
    } else {
      showToast('Failed to send message', 'error');
    }
    return success;
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
        'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col',
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
          {conversations.length === 0 ? (
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
            <div className="divide-y divide-slate-100">
              {conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={cn(
                    'w-full p-4 flex items-start gap-3 text-left transition-colors',
                    selectedConversationId === conv.id
                      ? 'bg-green-50'
                      : 'hover:bg-slate-50'
                  )}
                >
                  <Avatar
                    name={conv.other_participant?.name || 'User'}
                    src={conv.other_participant?.avatar}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={cn(
                        'font-medium truncate',
                        conv.unread_count > 0 ? 'text-slate-900' : 'text-slate-700'
                      )}>
                        {conv.other_participant?.name || 'Unknown User'}
                      </span>
                      {conv.last_message && (
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {formatTime(conv.last_message.sent_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-sm truncate flex-1',
                        conv.unread_count > 0 ? 'text-slate-900 font-medium' : 'text-slate-500'
                      )}>
                        {conv.last_message?.content || 'No messages yet'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="w-5 h-5 rounded-full bg-green-600 text-white text-xs flex items-center justify-center flex-shrink-0">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
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
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3">
              <button
                onClick={handleBack}
                className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-600"
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
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-green-600 border-t-transparent rounded-full" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                    <IconMessageSquare size={20} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-500">No messages yet</p>
                  <p className="text-xs text-slate-400 mt-1">Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOwn = msg.sender_id === user?.id;
                  const showAvatar = !isOwn && (idx === 0 || messages[idx - 1]?.sender_id !== msg.sender_id);
                  
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex items-end gap-2',
                        isOwn ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {!isOwn && (
                        <div className="w-8">
                          {showAvatar && (
                            <Avatar
                              name={selectedConversation.other_participant?.name || 'User'}
                              src={selectedConversation.other_participant?.avatar}
                              size="sm"
                            />
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl px-4 py-2',
                          isOwn
                            ? 'bg-green-600 text-white rounded-br-md'
                            : 'bg-white text-slate-900 rounded-bl-md shadow-sm'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className={cn(
                          'text-[10px] mt-1',
                          isOwn ? 'text-green-100' : 'text-slate-400'
                        )}>
                          {formatTime(msg.sent_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
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
    <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200">
      <div className="flex items-end gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500"
          style={{ minHeight: '44px', maxHeight: '120px' }}
        />
        <Button
          type="submit"
          disabled={!message.trim() || sending}
          className="h-11 w-11 p-0 rounded-xl"
        >
          {sending ? (
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <IconSend size={18} />
          )}
        </Button>
      </div>
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
