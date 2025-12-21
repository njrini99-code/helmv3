'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Loading } from '@/components/ui/loading';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { EmptyChatState } from '@/components/messages/EmptyChatState';
import { NewMessageModal } from '@/components/messages/NewMessageModal';
import { useConversations, useMessages } from '@/hooks/use-messages';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { createConversation } from '@/app/baseball/actions/messages';
import type { ConversationWithMeta } from '@/lib/types/messages';
import { getParticipantDetails } from '@/lib/types/messages';

function MessagesContent() {
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('conversation');
  const { showToast } = useToast();

  const { user } = useAuthStore();
  const { conversations, loading: conversationsLoading, refetch } = useConversations();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Get messages for selected conversation
  const { messages, loading: messagesLoading, sendMessage } = useMessages(selectedConversationId || '');

  // Handle URL-based conversation selection
  useEffect(() => {
    if (conversationIdParam) {
      setSelectedConversationId(conversationIdParam);
      setMobileShowChat(true);
    }
  }, [conversationIdParam]);

  // Auto-select first conversation on desktop
  useEffect(() => {
    const firstConversation = conversations[0];
    if (!conversationsLoading && firstConversation && !selectedConversationId) {
      setSelectedConversationId(firstConversation.id);
    }
  }, [conversations, conversationsLoading, selectedConversationId]);

  // Get current user's role
  const currentUserRole = user?.role === 'coach' ? 'coach' : 'player';

  // Get participant details for selected conversation
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find(c => c.id === selectedConversationId) as ConversationWithMeta | undefined;
  }, [conversations, selectedConversationId]);

  const selectedParticipant = useMemo(() => {
    if (!selectedConversation || !user) return null;
    return getParticipantDetails(selectedConversation, user.id);
  }, [selectedConversation, user]);

  // Handle conversation selection
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowChat(true);
    // Update URL without full navigation
    const url = new URL(window.location.href);
    url.searchParams.set('conversation', id);
    window.history.pushState({}, '', url);
  };

  // Handle back button on mobile
  const handleBack = () => {
    setMobileShowChat(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('conversation');
    window.history.pushState({}, '', url);
  };

  // Handle new conversation creation
  const handleNewConversation = async (userId: string) => {
    try {
      const result = await createConversation([userId]);
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
      refetch(); // Refresh conversation list to update last message
    } else {
      showToast('Failed to send message', 'error');
    }
    return success;
  };

  if (conversationsLoading) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-[#FAF6F1]">
        <Loading />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex bg-[#FAF6F1]">
      {/* Conversation List - Hidden on mobile when viewing chat */}
      <div className={cn(
        'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-slate-200',
        'transition-transform duration-300',
        mobileShowChat && 'hidden lg:block'
      )}>
        <ConversationList
          conversations={conversations as ConversationWithMeta[]}
          selectedId={selectedConversationId}
          currentUserId={user?.id || ''}
          onSelect={handleSelectConversation}
          onNewConversation={() => setShowNewMessageModal(true)}
          className="h-full"
        />
      </div>

      {/* Chat Window - Full width on mobile, split on desktop */}
      <div className={cn(
        'flex-1 min-w-0',
        !mobileShowChat && 'hidden lg:block'
      )}>
        {selectedConversationId ? (
          <ChatWindow
            messages={messages}
            participant={selectedParticipant}
            currentUserId={user?.id || ''}
            loading={messagesLoading}
            onSend={handleSendMessage}
            onBack={handleBack}
            className="h-full"
          />
        ) : (
          <EmptyChatState
            onNewConversation={() => setShowNewMessageModal(true)}
            className="h-full"
          />
        )}
      </div>

      {/* New Message Modal */}
      <NewMessageModal
        isOpen={showNewMessageModal}
        onClose={() => setShowNewMessageModal(false)}
        onSelect={handleNewConversation}
        currentUserRole={currentUserRole}
      />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={
      <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-[#FAF6F1]">
        <Loading />
      </div>
    }>
      <MessagesContent />
    </Suspense>
  );
}
