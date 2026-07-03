'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Loading } from '@/components/ui/loading';
import { LazyConversationList, LazyChatWindow } from '@/lib/lazy-components';
import { EmptyChatState } from '@/components/messages/EmptyChatState';
import { NewMessageModal } from '@/components/messages/NewMessageModal';
import { useConversations, useMessages } from '@/hooks/use-messages';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/sonner';
import { createConversation, getPlayerUserId } from '@/app/baseball/actions/messages';
import type { ConversationWithMeta } from '@/lib/types/messages';
import { getParticipantDetails } from '@/lib/types/messages';
import { MessagesFairway } from '@/components/baseball/messages/MessagesFairway';
import { isRedesignEnabled } from '@/lib/redesign/flag';

function MessagesContent() {
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('conversation');
  const openNewParam = searchParams.get('new');
  const playerIdParam = searchParams.get('player');
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

  // Auto-open new message modal when ?new=1 is in URL
  useEffect(() => {
    if (openNewParam === '1') {
      setShowNewMessageModal(true);
    }
  }, [openNewParam]);

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
    } catch {
      showToast('Failed to start conversation', 'error');
    }
  };

  // Guards the auto-start effect below against double-firing for the same
  // player id (e.g. React StrictMode's dev-only mount/cleanup/remount cycle,
  // or any other spurious re-run). Persists for the life of this component
  // instance rather than being reset on cleanup, so a genuine StrictMode
  // double-invoke is suppressed while a later visit with a *different*
  // player id still fires normally.
  const autoStartedPlayerRef = useRef<string | null>(null);

  // Auto-start (or open) a conversation with a player when ?player=<playerId> is in URL
  // (e.g. from the Discover peek panel's "Message" action).
  useEffect(() => {
    if (!playerIdParam) return;
    if (autoStartedPlayerRef.current === playerIdParam) return;
    autoStartedPlayerRef.current = playerIdParam;

    // Strip the `player` param from the CURRENT history entry FIRST, using the
    // raw history API synchronously -- not router.replace(), whose
    // navigation is async and wouldn't guarantee this lands before
    // handleNewConversation's own window.history.pushState() call (inside
    // handleSelectConversation) reads window.location.href.
    //
    // Why the ordering matters: handleNewConversation() -> handleSelectConversation()
    // calls window.history.pushState(...) using window.location.href AT THAT
    // MOMENT. If `player` is still in the URL when that runs, it gets copied
    // into the newly pushed history entry too -- and the entry underneath
    // (pushed by DiscoverView's router.push('/messages?player=...')) also
    // still carries it. Either way, pressing Back would land on a
    // `?player=...` URL and re-fire this entire effect (duplicate
    // getPlayerUserId/createConversation round-trips + a duplicate
    // "Conversation started" toast, and a second Back press repeats the
    // cycle -- a history trap). Stripping the param from the *current* entry
    // before any of that runs means every entry involved ends up clean, so
    // Back always lands on a URL with no `player` param.
    const url = new URL(window.location.href);
    url.searchParams.delete('player');
    window.history.replaceState({}, '', url);

    let cancelled = false;

    (async () => {
      const resolvedUserId = await getPlayerUserId(playerIdParam);
      if (cancelled) return;

      if (resolvedUserId) {
        await handleNewConversation(resolvedUserId);
      } else {
        showToast('Could not start conversation with this player', 'error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerIdParam]);

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

  if (isRedesignEnabled()) {
    return (
      <MessagesFairway
        loading={conversationsLoading}
        mobileShowChat={mobileShowChat}
        listSlot={
          <LazyConversationList
            conversations={conversations as ConversationWithMeta[]}
            selectedId={selectedConversationId}
            currentUserId={user?.id || ''}
            onSelect={handleSelectConversation}
            onNewConversation={() => setShowNewMessageModal(true)}
            className="h-full"
          />
        }
        chatSlot={
          selectedConversationId ? (
            <LazyChatWindow
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
          )
        }
        modalSlot={
          <NewMessageModal
            isOpen={showNewMessageModal}
            onClose={() => setShowNewMessageModal(false)}
            onSelect={handleNewConversation}
            currentUserRole={currentUserRole}
          />
        }
      />
    );
  }

  if (conversationsLoading) {
    return (
      <div className="h-[calc(100dvh-64px)] flex bg-[#FAF6F1]">
        {/* Conversation list skeleton */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-warm-200 bg-cream-50">
          <div className="p-4 border-b border-warm-200">
            <div className="h-10 bg-warm-100 rounded-lg animate-pulse" />
          </div>
          <div className="divide-y divide-warm-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-warm-200 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-warm-200 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-warm-100 rounded w-4/5" />
                </div>
                <div className="h-3 bg-warm-100 rounded w-10" />
              </div>
            ))}
          </div>
        </div>
        {/* Chat area skeleton */}
        <div className="flex-1 hidden lg:flex items-center justify-center">
          <Loading />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-64px)] flex bg-[#FAF6F1]">
      {/* Conversation List - Hidden on mobile when viewing chat */}
      <div className={cn(
        'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-warm-200',
        'transition-transform duration-300',
        mobileShowChat && 'hidden lg:block'
      )}>
        <LazyConversationList
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
          <LazyChatWindow
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
      <div className="h-[calc(100dvh-64px)] flex items-center justify-center bg-[#FAF6F1]">
        <Loading />
      </div>
    }>
      <MessagesContent />
    </Suspense>
  );
}
