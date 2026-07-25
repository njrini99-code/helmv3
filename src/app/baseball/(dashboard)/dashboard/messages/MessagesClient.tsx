'use client';

/**
 * ============================================================================
 * MessagesClient — inbox parity pass (design review packet [inbox-parity-a])
 * ----------------------------------------------------------------------------
 * The conversation rail + open thread are now built on the SAME shared
 * Fairway "glass" primitives GolfHelm's own messages surface uses
 * (`InstrumentPanel` / `Avatar` / `Badge` / `Readout` — see
 * `src/components/fairway/pages/messages/{MessageConversationRail,
 * MessageThreadPane}.tsx`), per design-system-living-annual.md §4.3's rule
 * that "Glass" (live/interactive tooling) surfaces "keep parity with
 * GolfHelm's glass tokens." Golf's own rail/pane aren't reused directly —
 * they're typed to `GolfConversationWithMeta`/`golf_messages` and call
 * golf-only server actions (search, attachments) baseball's schema doesn't
 * have — so this rebuilds the same visual grammar as local presentation
 * wired to baseball's OWN unchanged data path. Honest-empty states route
 * through the Living-Annual `<EmptyIssue>` (product-wide empty-state
 * doctrine), not a generic Fairway empty box.
 *
 * DATA WIRING IS UNCHANGED: `useConversations()` / `useMessages()` (with
 * their stale-guard + 200-row-limit fix), `createConversation`,
 * `getPlayerUserId`, and every handler below are byte-for-byte the same as
 * before this pass — only the rail/pane/composer presentation was rebuilt.
 * Own-message bubbles are `bg-accent-500` (the Fairway accent token, which
 * resolves to `#16A34A` / `--team-ink` — the SAME team-green ink, not the
 * legacy `bg-primary-600`).
 * ========================================================================== */

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import {
  InstrumentPanel,
  Readout,
  Avatar,
  Badge,
  Button,
  IconButton,
  Input,
} from '@/components/fairway';
import { EmptyIssue, Reveal } from '@/components/baseball/living-annual';
import { EmptyChatState } from '@/components/messages/EmptyChatState';
import { NewMessageModal } from '@/components/messages/NewMessageModal';
import { useConversations, useMessages } from '@/hooks/use-messages';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/sonner';
import { createConversation, getPlayerUserId } from '@/app/baseball/actions/messages';
import type { ConversationWithMeta, ParticipantDetails } from '@/lib/types/messages';
import { getParticipantDetails } from '@/lib/types/messages';
import type { Message } from '@/lib/types';
import { MessagesFairway } from '@/components/baseball/messages/MessagesFairway';
import { IconArrowLeft, IconSend, IconCheck, IconCheckCheck, IconPlus } from '@/components/icons';

/** The rail's masthead — an `<h2>` (not InstrumentPanel's default `<h3>`
 *  string-header) so the page keeps ONE real "Messages" heading. */
const RAIL_TITLE = (
  <h2 className="font-fw-display text-h3 font-semibold leading-tight text-text-primary">
    Messages
  </h2>
);

/** Relative time for a rail row — preserves the legacy ConversationList wording. */
function formatRelativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Message-bubble timestamp — preserves the legacy ChatWindow wording
 *  (bare time today, "Mon Day, time" otherwise). */
function formatMessageTime(timestamp: string | null): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return (
    date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  );
}

interface ConversationRowProps {
  conversation: ConversationWithMeta;
  currentUserId: string;
  isSelected: boolean;
  onSelect: () => void;
}

/** One rail row — mirrors `MessageConversationRail`'s `ConversationRow` grammar. */
function ConversationRow({ conversation, currentUserId, isSelected, onSelect }: ConversationRowProps) {
  const participant = getParticipantDetails(conversation, currentUserId);
  const name = participant?.name ?? 'Unknown User';
  const unreadCount = conversation.unread_count ?? 0;
  const hasUnread = unreadCount > 0;
  const time = formatRelativeTime(conversation.last_message?.sent_at);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-current={isSelected ? 'true' : undefined}
      data-testid="conversation-item"
      className={cn(
        'group block h-auto min-h-0 w-full items-stretch justify-start rounded-fw-md border-0 px-3 py-2.5 text-left font-normal outline-none transition-colors [transition-duration:200ms]',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        isSelected
          ? 'bg-surface-sunken/90 shadow-[inset_2px_0_0_0_var(--fw-color-accent-500)] ring-1 ring-inset ring-accent-200/60'
          : 'hover:bg-surface-sunken/60',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar decorative name={name} src={participant?.avatar} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate font-fw-sans text-body-sm',
                hasUnread || isSelected ? 'font-medium text-text-primary' : 'font-medium text-text-secondary',
              )}
            >
              {name}
            </span>
            {time ? (
              <time
                className={cn(
                  'flex-shrink-0 font-fw-mono text-eyebrow tabular-nums',
                  hasUnread ? 'text-accent-700' : 'text-text-tertiary',
                )}
              >
                {time}
              </time>
            ) : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {participant?.role === 'coach' ? (
                <Badge tone="neutral" size="sm" className="flex-shrink-0">
                  Coach
                </Badge>
              ) : null}
              <p
                className={cn(
                  'min-w-0 flex-1 truncate font-fw-sans text-eyebrow leading-relaxed',
                  hasUnread ? 'text-text-primary' : 'text-text-tertiary',
                )}
              >
                {conversation.last_message?.content
                  ? decodeMessageContent(conversation.last_message.content)
                  : 'No messages yet'}
              </p>
            </div>
            {hasUnread ? (
              <Badge tone="accent" size="sm" numeric data-testid="unread-count" className="flex-shrink-0">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </Button>
  );
}

interface ConversationRailProps {
  conversations: ConversationWithMeta[];
  selectedId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}

/** The list pane — glass-parity `InstrumentPanel` well (mirrors `MessageConversationRail`). */
function ConversationRail({ conversations, selectedId, currentUserId, onSelect, onNewConversation }: ConversationRailProps) {
  const count = conversations.length;

  return (
    <InstrumentPanel
      as="nav"
      depth="base"
      padding="md"
      header={RAIL_TITLE}
      readout={
        <div className="flex items-center gap-2">
          <Readout
            value={count}
            format={{ maximumFractionDigits: 0 }}
            label={count === 1 ? 'conversation' : 'conversations'}
            size="sm"
            align="end"
            state={count > 0 ? 'live' : 'awaiting'}
            samples={count === 0 ? { have: 0, need: 1 } : undefined}
            awaitingLabel="None yet"
          />
          <IconButton
            type="button"
            variant="ghost"
            size="md"
            aria-label="New message"
            onClick={onNewConversation}
            data-testid="new-message"
          >
            <IconPlus size={18} aria-hidden="true" />
          </IconButton>
        </div>
      }
      aria-label="Conversations"
      data-testid="conversation-list"
      className="flex h-full min-h-0 flex-col"
    >
      {count === 0 ? (
        <EmptyIssue
          variant="messages"
          ink="team"
          action={
            <Button type="button" onClick={onNewConversation} leftIcon={<IconPlus size={16} aria-hidden="true" />}>
              New message
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto">
          {conversations.map((conversation, i) => (
            <li key={conversation.id}>
              <Reveal staggerIndex={Math.min(i, 8)}>
                <ConversationRow
                  conversation={conversation}
                  currentUserId={currentUserId}
                  isSelected={selectedId === conversation.id}
                  onSelect={() => onSelect(conversation.id)}
                />
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </InstrumentPanel>
  );
}

interface MessageThreadPaneProps {
  messages: Message[];
  loading: boolean;
  currentUserId: string;
  /** Name/avatar/subtitle for the header + incoming bubbles — already resolved
   *  by the parent via `getParticipantDetails()`, so this pane needs no
   *  `conversation` object of its own (baseball has no group threads). */
  participant: ParticipantDetails | null;
  onSend: (content: string) => Promise<boolean>;
  onBack: () => void;
}

/** The open-thread pane — glass-parity raised `InstrumentPanel` well
 *  (mirrors `MessageThreadPane`). Own bubble = team-green `bg-accent-500`. */
function MessageThreadPane({ messages, loading, currentUserId, participant, onSend, onBack }: MessageThreadPaneProps) {
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;

  // Auto-scroll to bottom on new messages — ONLY when near the bottom, so a
  // reply from the other side doesn't yank someone away from scrollback
  // they're reading. Honors prefers-reduced-motion (instant jump instead of
  // an animated scroll). Ported from the (now-removed, orphaned-by-this-
  // rebuild) legacy ChatWindow's near-bottom check
  // (scrollTop + clientHeight >= scrollHeight - 100).
  useEffect(() => {
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const container = messagesContainerRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior });
      return;
    }
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, [messages, reduceMotion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sending) return;

    setSending(true);
    const success = await onSend(inputValue.trim());
    if (success) setInputValue('');
    setSending(false);
  };

  const headerName = participant?.name ?? 'Unknown User';

  return (
    <InstrumentPanel
      as="section"
      depth="raised"
      padding="none"
      aria-label="Conversation"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <header className="flex min-w-0 items-center gap-3 border-b border-border-subtle px-4 py-3 sm:px-5">
        <IconButton
          type="button"
          variant="ghost"
          size="md"
          aria-label="Back to conversations"
          onClick={onBack}
          className="lg:hidden"
        >
          <IconArrowLeft size={20} aria-hidden="true" />
        </IconButton>
        <Avatar decorative name={headerName} src={participant?.avatar} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-fw-sans text-body font-medium text-text-primary">{headerName}</p>
          {participant?.subtitle ? (
            <p className="truncate font-fw-sans text-eyebrow text-text-tertiary">{participant.subtitle}</p>
          ) : null}
        </div>
      </header>

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y bg-surface px-4 py-5 sm:px-5"
      >
        {loading ? (
          <div className="space-y-3 py-8">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-sunken" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-sunken" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyIssue variant="messages" ink="team" className="max-w-md" />
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => {
              const isOwn = message.sender_id === currentUserId;
              const showAvatar = !isOwn && (index === 0 || messages[index - 1]?.sender_id !== message.sender_id);

              return (
                <Reveal key={message.id} staggerIndex={Math.min(index, 8)}>
                  <div data-testid="message" className={cn('flex items-end gap-2', isOwn ? 'justify-end' : 'justify-start')}>
                    {!isOwn && (
                      <div className="w-8 flex-shrink-0">
                        {showAvatar ? <Avatar name={headerName} src={participant?.avatar} size="sm" /> : null}
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-fw-lg px-3.5 py-2',
                        isOwn
                          ? 'rounded-br-sm bg-accent-700 text-text-on-accent'
                          : 'rounded-bl-sm bg-surface-sunken text-text-primary',
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words font-fw-sans text-body-sm leading-snug">
                        {decodeMessageContent(message.content)}
                      </p>
                      <p
                        className={cn(
                          'mt-1 flex items-center gap-1 font-fw-mono text-eyebrow tabular-nums',
                          isOwn ? 'justify-end text-text-on-accent/80' : 'text-text-tertiary',
                        )}
                      >
                        {formatMessageTime(message.created_at)}
                        {isOwn ? (
                          <span data-testid="message-status" className="inline-flex items-center gap-0.5">
                            {message.read ? (
                              <IconCheckCheck size={12} aria-hidden="true" className="text-text-on-accent" />
                            ) : (
                              <IconCheck size={12} aria-hidden="true" className="text-text-on-accent/70" />
                            )}
                            <span className="sr-only">{message.read ? 'Read' : 'Sent'}</span>
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-shrink-0 border-t border-border-subtle bg-surface-sunken p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-4"
      >
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message…"
            aria-label="Message"
            data-testid="message-input"
            disabled={sending}
            className="flex-1"
          />
          <IconButton
            type="submit"
            variant="primary"
            size="md"
            aria-label="Send message"
            disabled={!inputValue.trim() || sending}
            data-testid="send-button"
          >
            <IconSend size={18} aria-hidden="true" />
          </IconButton>
        </div>
      </form>
    </InstrumentPanel>
  );
}

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

  return (
    <MessagesFairway
      loading={conversationsLoading}
      mobileShowChat={mobileShowChat}
      listSlot={
        <ConversationRail
          conversations={conversations as ConversationWithMeta[]}
          selectedId={selectedConversationId}
          currentUserId={user?.id || ''}
          onSelect={handleSelectConversation}
          onNewConversation={() => setShowNewMessageModal(true)}
        />
      }
      chatSlot={
        selectedConversationId ? (
          <MessageThreadPane
            messages={messages}
            loading={messagesLoading}
            currentUserId={user?.id || ''}
            participant={selectedParticipant}
            onSend={handleSendMessage}
            onBack={handleBack}
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

export default function MessagesClient() {
  return (
    <Suspense
      fallback={<MessagesFairway loading mobileShowChat={false} listSlot={null} chatSlot={null} modalSlot={null} />}
    >
      <MessagesContent />
    </Suspense>
  );
}
