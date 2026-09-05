'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendGolfMessage, markGolfMessagesAsRead, updateGolfMessage, deleteGolfMessage, getGolfActiveTeamConversationIds } from '@/app/golf/actions/messages';
import { withOneTransportRetry } from '@/lib/transient-network-error';
import type { GolfMessageRow } from '@/lib/types';
import { logError } from '@/lib/error-logging';
import { describeError, postgrestErrorContext, toPostgrestError } from '@/lib/utils/describe-error';
import { observeRealtimeChannel } from '@/lib/observability/supabase/realtime';

/** Pause before the single transport-failure retry of a message send. */
const SEND_TRANSPORT_RETRY_DELAY_MS = 750;

/**
 * How long to coalesce read-marking after messages arrive in an open thread.
 * Long enough that a burst of four lines is one write instead of four; short
 * enough that the sender's receipt turns over while they are still looking at
 * it.
 */
const MARK_READ_ON_ARRIVAL_DEBOUNCE_MS = 900;

export interface GolfConversationParticipant {
  id: string;
  name: string;
  subtitle: string;
  avatar: string | null;
  type: 'coach' | 'player';
}

export interface GolfConversationWithMeta {
  id: string;
  created_at: string;
  updated_at: string;
  last_message?: GolfMessageRow | null;
  unread_count: number;
  other_participant?: GolfConversationParticipant;
  // Group conversation fields
  is_group?: boolean;
  title?: string | null;
  participant_count?: number;
}

// Extended message type with read receipt info
export interface GolfMessage extends GolfMessageRow {
  isRead?: boolean; // Whether the other participant has read this message
}

// Keep old name for backward compatibility
export type MessageWithReadStatus = GolfMessage;

/**
 * Apply one realtime `golf_messages` UPDATE to the local list.
 *
 * Exported and pure so the property that matters can actually be asserted:
 * when nothing this component RENDERS has changed, it returns the SAME array
 * reference, and React skips the re-render.
 *
 * That bail-out is load-bearing. Opening a thread causes these events —
 * `fetchMessages` ends by calling `markGolfMessagesAsRead`, which flips
 * `read = true` on every message someone else sent, so a group thread with N
 * such messages emits N UPDATEs immediately. Rebuilding the array each time
 * produced N identical lists and re-rendered the thread N times, which is the
 * "it loads and then instantly loads again" a coach reported, and why the
 * thread would not stay where scroll-to-bottom had just put it.
 */
export function applyRealtimeMessageUpdate<
  T extends { id: string; content: string; edited_at: string | null; is_deleted?: boolean | null },
>(prev: T[], updated: T): T[] {
  if (updated.is_deleted) {
    if (!prev.some((msg) => msg.id === updated.id)) return prev;
    return prev.filter((msg) => msg.id !== updated.id);
  }

  const idx = prev.findIndex((msg) => msg.id === updated.id);
  if (idx === -1) return prev;

  const current = prev[idx]!;
  if (current.content === updated.content && current.edited_at === updated.edited_at) {
    return prev;
  }

  const next = prev.slice();
  next[idx] = { ...current, content: updated.content, edited_at: updated.edited_at };
  return next;
}

/**
 * Order two messages by `created_at`, tie-broken by `id`.
 *
 * `created_at` is nullable in the schema, and a comparator doing date
 * arithmetic on `null`/an unparsable string yields `NaN`, which sorts
 * nowhere consistently. Treat an unparsable timestamp as "sorts after
 * everything with a real one" rather than let it corrupt the ordering.
 */
function compareByCreatedAtThenId(
  a: { readonly id: string; readonly created_at: string | null },
  b: { readonly id: string; readonly created_at: string | null },
): number {
  const at = a.created_at ? Date.parse(a.created_at) : NaN;
  const bt = b.created_at ? Date.parse(b.created_at) : NaN;
  const aValid = !Number.isNaN(at);
  const bValid = !Number.isNaN(bt);
  if (aValid && bValid && at !== bt) return at - bt;
  if (aValid !== bValid) return aValid ? -1 : 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Apply one realtime `golf_messages` INSERT to the local list.
 *
 * Exported and pure for the same reason as `applyRealtimeMessageUpdate`
 * above: this is a merge/ordering algorithm, and it deserves a test that
 * does not have to stand up a realtime channel + auth harness to exercise
 * it.
 *
 * Reconciliation with an optimistic row matches on the id ALONE.
 * `sendMessage` inserts the client-generated id that `useGolfMessages`
 * already rendered the optimistic row under AS the row's real
 * `golf_messages.id` (a normal `DEFAULT uuid_generate_v4()` column, not
 * GENERATED ALWAYS — a client-supplied override is a legitimate insert, not
 * a workaround), so the optimistic row and its echo carry the SAME id from
 * the start. That replaces the old "first `optimistic-*` row from me"
 * heuristic — which reconciled the WRONG message when two sends were in
 * flight and their echoes arrived out of order — with an exact match: there
 * is no longer any ambiguity to resolve, and a mismatched send can no longer
 * mismatch a receive.
 *
 * On a match: replace IN PLACE, never reorder. The optimistic row already
 * rendered at the position its sender is looking at; re-sorting it by the
 * server's `created_at` (never earlier than the optimistic client
 * timestamp, and essentially never equal to it) would move a bubble the
 * user just watched appear out from under them — this hook's own history
 * (P258, F124, the 2026-08-31 churn fix above) is about exactly that kind
 * of self-inflicted reflow. This also folds in the old plain "avoid
 * duplicates" guard: any exact id match, from any sender, replaces in
 * place instead of appending a second copy.
 *
 * On no match (a message from someone else, or our own echo arriving with
 * no local optimistic row to meet — e.g. a second tab, or a channel that
 * reconnected mid-send): insert in `created_at` order instead of always
 * appending, so two people sending near-simultaneously still render in the
 * order their messages were created rather than the order their INSERTs
 * happened to arrive over the wire. The common case — the feed already
 * arriving in order — stays an O(1) append; only an out-of-order arrival
 * pays for the scan.
 */
export function applyRealtimeMessageInsert<
  T extends { id: string; created_at: string | null },
>(prev: T[], inserted: T): T[] {
  const idx = prev.findIndex((m) => m.id === inserted.id);
  if (idx !== -1) {
    const current = prev[idx]!;
    if (current === inserted) return prev;
    const next = prev.slice();
    next[idx] = inserted;
    return next;
  }

  const last = prev[prev.length - 1];
  if (!last || compareByCreatedAtThenId(last, inserted) <= 0) {
    return [...prev, inserted];
  }

  let pos = prev.length;
  while (pos > 0 && compareByCreatedAtThenId(prev[pos - 1]!, inserted) > 0) {
    pos--;
  }
  const next = prev.slice();
  next.splice(pos, 0, inserted);
  return next;
}

/**
 * A collision-proof id for the optimistic row, threaded through to the
 * server as `golf_messages.id` (see `sendMessage` / `applyRealtimeMessageInsert`
 * above). Was an `optimistic-` prefix glued to a millisecond timestamp — two
 * sends in the same millisecond produced the SAME id, which corrupted both
 * the dedupe guard and, before this rewrite, the reconciliation search.
 *
 * Prefers `crypto.randomUUID`; falls back to a Math.random-seeded v4-shaped
 * string on engines/contexts where it's unavailable (older WKWebView,
 * non-secure contexts — this repo ships iOS Capacitor and Android, see
 * `newKey()` in useCoachHelmChat.ts for the same guard on the same
 * platforms). The fallback MUST stay UUID-shaped: it is optionally sent to
 * the server as `client_message_id`, which `MessageSchemas.send` validates
 * with `z.string().uuid()` — a malformed id would fail that validation and
 * turn every send on an affected device into a hard failure instead of a
 * merely lower-entropy one.
 */
function generateClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useGolfMessages(conversationId: string) {
  const [messages, setMessages] = useState<MessageWithReadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes "this thread failed to load" from "this thread is truly empty".
  // A swallowed query error used to surface as the honest-empty state (P258); the
  // consumer (MessageThreadPane) reads this to render a recoverable error instead.
  const [error, setError] = useState<boolean>(false);
  const [otherParticipantLastReadAt, setOtherParticipantLastReadAt] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /**
   * The same value, readable without becoming a dependency.
   *
   * `currentUserId` resolves ASYNCHRONOUSLY from `auth.getUser()`, so it is
   * null on the first render and a string a moment later. It was a dependency
   * of `fetchOtherParticipantReadStatus`, which was a dependency of
   * `fetchMessages`, which was a dependency of the effect that fetches the
   * thread AND opens the realtime channel. One late-arriving id therefore
   * rebuilt that entire chain and re-ran the effect:
   *
   *   mount            -> fetch #1 -> loading false -> thread scrolls to latest
   *   id resolves      -> fetch #2 -> loading TRUE again -> container remounts
   *                                   at scrollTop 0, and the one-shot
   *                                   scroll-to-latest sentinel was already
   *                                   consumed by fetch #1, so nothing put it
   *                                   back.
   *
   * That is both halves of what was reported on 2026-08-31: "whenever messages
   * loads, it instantly loads again", and threads opening at the oldest
   * message instead of the newest. Reading the id through a ref keeps every
   * callback identity stable, so the thread is fetched and subscribed exactly
   * once per conversation.
   */
  const currentUserIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const supabaseRef = useRef(createClient());
  const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null);
  const supabase = supabaseRef.current;

  // Get current user ID on mount
  useEffect(() => {
    let mounted = true;
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && mounted) {
        currentUserIdRef.current = user.id;
        setCurrentUserId(user.id);
      }
    };
    getUser();
    return () => {
      mounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch other participant's last_read_at for read receipts
  const fetchOtherParticipantReadStatus = useCallback(async () => {
    const uid = currentUserIdRef.current;
    if (!conversationId || !uid) return;

    const { data: participants, error: participantsError } = await supabase
      .from('golf_conversation_participants')
      .select('user_id, last_read_at')
      .eq('conversation_id', conversationId);

    if (participantsError) {
      logError(
        toPostgrestError(participantsError),
        {
          component: 'useGolfMessages',
          action: 'fetch-other-participant-read-status',
          sport: 'golf',
          conversationId,
          ...postgrestErrorContext(participantsError),
        },
        'medium'
      );
    }

    if (participants) {
      const otherParticipant = participants.find(p => p.user_id !== uid);
      if (otherParticipant) {
        setOtherParticipantLastReadAt(otherParticipant.last_read_at);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    // Fetch most recent 200 messages (descending for limit), then reverse for display order
    const { data, error: fetchError } = await supabase
      .from('golf_messages')
      // `has_attachments` is REQUIRED here, not decorative. MessageThreadPane
      // only calls getGolfMessageAttachments for messages whose
      // `has_attachments` is truthy, so omitting the column from this select
      // made it `undefined` on every message loaded from the database — the
      // signing fetch never fired and the bubble rendered empty.
      //
      // It looked intermittent rather than broken because the realtime INSERT
      // handler below takes `payload.new`, which is the FULL row and does
      // carry the flag. So an image was visible to whoever had the thread open
      // when it arrived, and disappeared for everyone the next time the
      // conversation was opened. That is the "Can't see pics" report from the
      // team chat: the sender saw it send, the recipients opened the thread
      // later and saw nothing.
      .select('id, conversation_id, sender_id, content, read, has_attachments, created_at, is_deleted, edited_at')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(200);

    // P258: a failed fetch must NOT masquerade as an empty thread. Capture the
    // error so the thread can render a recoverable error state with Retry; leave
    // the existing message list untouched so a transient blip doesn't blank a
    // thread the user was already reading.
    if (fetchError) {
      console.error('[useGolfMessages] Failed to load messages:', describeError(fetchError));
      logError(
        toPostgrestError(fetchError),
        {
          component: 'useGolfMessages',
          action: 'fetch-messages',
          sport: 'golf',
          conversationId,
          ...postgrestErrorContext(fetchError),
        },
        'medium'
      );
      setError(true);
      setLoading(false);
      return;
    }

    setMessages(((data || []) as MessageWithReadStatus[]).reverse());
    setLoading(false);

    // Mark messages as read. Awaited + caught so a DB error in the server action
    // can't surface as an unhandled promise rejection and tear down the hook.
    // Clearing the unread badge for the viewer relies on this write completing:
    // it bumps the participant's last_read_at + flips read=true on others' messages,
    // which fires the realtime refetch in useGolfConversations (F124).
    try {
      await markGolfMessagesAsRead(conversationId);
    } catch (err) {
      console.error('[useGolfMessages] Failed to mark messages as read:', describeError(err));
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'useGolfMessages', action: 'mark-messages-as-read', sport: 'golf', conversationId },
        'medium'
      );
    }

    // Fetch read receipt status
    fetchOtherParticipantReadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, fetchOtherParticipantReadStatus]);

  // Compute read status for messages when otherParticipantLastReadAt changes
  useEffect(() => {
    if (!otherParticipantLastReadAt || !currentUserId) return;

    setMessages(prev => prev.map(msg => {
      // Only show read status for messages sent by current user
      if (msg.sender_id !== currentUserId) return msg;

      // Message is read if it was created before the other participant's last_read_at
      const isRead = msg.created_at
        ? new Date(msg.created_at) <= new Date(otherParticipantLastReadAt)
        : false;
      return { ...msg, isRead };
    }));
  }, [otherParticipantLastReadAt, currentUserId]);

  useEffect(() => {
    if (!conversationId) return;

    fetchMessages();

    /**
     * Mark the thread read shortly after someone else's message lands here.
     *
     * Debounced because a burst — a coach firing off four lines — would
     * otherwise be four writes and four realtime round trips for one act of
     * reading. Coalescing to a single call a beat later is the same outcome at
     * a fraction of the cost.
     *
     * Gated on `visibilityState` so a backgrounded tab does not claim the
     * player read something they never saw: this hook stays mounted while the
     * phone is locked or the app is in the background, and "delivered" is not
     * "read". When they come back, the next arrival — or the re-fetch on
     * re-entering the thread — marks it properly.
     *
     * Declared inside the effect so it closes over THIS conversation's id;
     * the effect is keyed on `conversationId`, so a switch tears the timer
     * down with everything else and no write can land against a thread the
     * player has already left.
     */
    let markReadTimer: ReturnType<typeof setTimeout> | null = null;
    const markReadSoon = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (markReadTimer) clearTimeout(markReadTimer);
      markReadTimer = setTimeout(() => {
        void markGolfMessagesAsRead(conversationId).catch((err) => {
          // Non-fatal: the badge stays stale until the next read attempt. Never
          // allowed to reject unhandled and tear the hook down mid-conversation.
          logError(
            err instanceof Error ? err : new Error(String(err)),
            { component: 'useGolfMessages', action: 'mark-read-on-arrival', sport: 'golf', conversationId },
            'low'
          );
        });
      }, MARK_READ_ON_ARRIVAL_DEBOUNCE_MS);
    };

    // Set up real-time subscription for messages and typing
    const channel = supabase.channel(`golf-conversation:${conversationId}`);
    channelRef.current = channel;
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'golf_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as MessageWithReadStatus;
          // See applyRealtimeMessageInsert above: id-exact reconciliation
          // with our own optimistic row, in-order insertion otherwise.
          setMessages(prev => applyRealtimeMessageInsert(prev, newMessage));
          // Clear typing indicator when message is received
          if (newMessage.sender_id !== currentUserIdRef.current) {
            setIsOtherTyping(false);
            // ...and mark it read, because the reader is looking at it RIGHT NOW.
            //
            // `markGolfMessagesAsRead` used to run only inside `fetchMessages`,
            // which re-runs on conversation change alone. So a message that
            // arrived while the thread was already open was appended to the
            // list, read by a human, and never marked read in the database:
            // the sender's receipt sat on "Sent" indefinitely while the
            // recipient was demonstrably reading it, and the recipient's own
            // rail badge stayed stale until they navigated away and back.
            markReadSoon();
          }
        }
      )
      // Listen for message updates (edits and soft-deletes)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as MessageWithReadStatus;
          setMessages(prev => applyRealtimeMessageUpdate<MessageWithReadStatus>(prev, updatedMessage));
        }
      )
      // Listen for read receipt updates (when other participant reads messages)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_conversation_participants',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as { user_id: string; last_read_at: string | null };
          // Only update if it's the other participant's read status
          if (updated.user_id !== currentUserIdRef.current && updated.last_read_at) {
            setOtherParticipantLastReadAt(updated.last_read_at);
          }
        }
      )
      // Listen for typing broadcasts
      .on(
        'broadcast',
        { event: 'typing' },
        (payload) => {
          const { userId, isTyping } = payload.payload as { userId: string; isTyping: boolean };
          if (userId !== currentUserIdRef.current) {
            setIsOtherTyping(isTyping);
            // Auto-clear typing indicator after 3 seconds if no update
            if (isTyping) {
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
              }
              typingTimeoutRef.current = setTimeout(() => {
                setIsOtherTyping(false);
              }, 3000);
            }
          }
        }
      );
    observeRealtimeChannel(channel, { feature: 'golf.messages', channelClass: 'golf_conversation', subscriptionType: 'mixed' });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // A pending read-mark belongs to the conversation being left, so it dies
      // with it rather than landing against a thread the player has moved on
      // from.
      if (markReadTimer) clearTimeout(markReadTimer);
    };
    // Deliberately keyed on the CONVERSATION only. `fetchMessages` is now
    // identity-stable and every handler above reads `currentUserIdRef`, so a
    // late-arriving user id no longer tears this down and re-runs it — which
    // is what fetched the thread twice and stranded it at the top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Function to broadcast typing status (throttled to avoid spam)
  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!conversationId || !currentUserId || !channelRef.current) return;

    const now = Date.now();
    // Throttle typing broadcasts to once every 500ms
    if (isTyping && now - lastTypingBroadcastRef.current < 500) return;
    lastTypingBroadcastRef.current = now;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, isTyping },
    });
  }, [conversationId, currentUserId]);

  const sendMessage = async (content: string) => {
    // Clear typing indicator when sending
    sendTypingStatus(false);

    // Optimistic update: add message to UI immediately. The id is generated
    // ONCE, above the retry, and reused for both the optimistic row and every
    // send attempt below — see generateClientMessageId's docstring for why it
    // must be collision-proof, and the comment on the retry call for why
    // reusing it across a retry is safe rather than merely convenient.
    const optimisticId = generateClientMessageId();
    const optimisticMessage: MessageWithReadStatus = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId || '',
      content,
      read: false,
      has_attachments: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      is_deleted: false,
      // A plain text message from the composer — never one of the
      // structured kinds (poll/rsvp/event/etc), never a reply, never pinned.
      // These columns (and golf_message_reactions/_mentions/_responses)
      // shipped to production 2026-09-04 with no committed migration; see
      // supabase/migrations/20260904160000_golf_messaging_structured.sql.
      kind: 'text',
      payload: null,
      pinned_at: null,
      pinned_by: null,
      reply_to_id: null,
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      // The action POST can die on the wire in WKWebView ("Load failed") with
      // the phone reporting itself online: two Shenandoah players hit it
      // mid-send on 2026-09-01/02, and Vercel logged no message_sent for
      // either, so the request never arrived. One retry after a beat is what
      // they did by hand — see withOneTransportRetry for why that is safe here.
      // Passing the SAME optimisticId on both attempts also makes a retry
      // that fires after the first attempt actually committed safe: the
      // second insert collides on golf_messages' primary key and the server
      // reports it back as the success it is (see sendMessage/action's 23505
      // handling) instead of creating a second, duplicate row.
      const result = await withOneTransportRetry(
        () => sendGolfMessage(conversationId, content, optimisticId),
        SEND_TRANSPORT_RETRY_DELAY_MS,
      );

      // Check if the result indicates an error
      if (result && 'error' in result && result.error) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        throw new Error(result.error);
      }

      if (!result || !result.success) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        throw new Error('Failed to send message');
      }

      return true;
    } catch (error) {
      // Roll back optimistic message on any error
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      logError(
        error instanceof Error ? error : new Error(String(error)),
        { component: 'useGolfMessages', action: 'send-message', sport: 'golf', conversationId },
        'high'
      );
      throw error;
    }
  };

  // Edit a message
  const editMessage = async (messageId: string, newContent: string) => {
    const result = await updateGolfMessage(messageId, newContent);

    if (result && 'error' in result && result.error) {
      logError(
        new Error(result.error),
        { component: 'useGolfMessages', action: 'edit-message', sport: 'golf', conversationId, messageId },
        'high'
      );
      throw new Error(result.error);
    }

    if (!result || !result.success) {
      logError(
        new Error('Failed to edit message'),
        { component: 'useGolfMessages', action: 'edit-message', sport: 'golf', conversationId, messageId },
        'high'
      );
      throw new Error('Failed to edit message');
    }

    return true;
  };

  // Delete a message (optimistic removal)
  const removeMessage = async (messageId: string) => {
    // Optimistically remove from local state
    setMessages(prev => prev.filter(msg => msg.id !== messageId));

    const result = await deleteGolfMessage(messageId);

    if (result && 'error' in result && result.error) {
      // Rollback: re-fetch messages on failure
      fetchMessages();
      logError(
        new Error(result.error),
        { component: 'useGolfMessages', action: 'delete-message', sport: 'golf', conversationId, messageId },
        'high'
      );
      throw new Error(result.error);
    }

    if (!result || !result.success) {
      fetchMessages();
      logError(
        new Error('Failed to delete message'),
        { component: 'useGolfMessages', action: 'delete-message', sport: 'golf', conversationId, messageId },
        'high'
      );
      throw new Error('Failed to delete message');
    }

    return true;
  };

  return {
    messages,
    loading,
    error,
    sendMessage,
    editMessage,
    removeMessage,
    refetch: fetchMessages,
    isOtherTyping,
    sendTypingStatus,
    currentUserId,
  };
}

export function useGolfConversations() {
  const [conversations, setConversations] = useState<GolfConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  // P257: distinguishes "the rail failed to load" from "the inbox is truly
  // empty". A swallowed RPC error used to surface as the cheerful empty state
  // ("No conversations yet…"), making a backend failure indistinguishable from
  // a genuine empty inbox. The rail reads this to render a recoverable error
  // (explain + Retry) instead.
  const [error, setError] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const conversationIdsRef = useRef<Set<string>>(new Set());
  const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Get the current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    // Use optimized DB function - single query replaces N+1 pattern (was 50-60 queries)
    // Note: Function added in migration, types may need regeneration with `npm run db:types`
    interface ConversationRow {
      id: string;
      created_at: string;
      updated_at: string;
      creator_id: string | null;
      last_message_content: string | null;
      last_message_at: string | null;
      last_message_sender_id: string | null;
      unread_count: number;
      participant_ids: string[];
      participant_names: string[];
      is_group?: boolean;
      title?: string | null;
      participant_count?: number;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawData, error } = await (supabase.rpc as any)(
      'get_golf_conversations_with_details',
      { p_user_id: userId }
    );
    // Active-team scoping (multi-team coaches only). A `null` allow-set means
    // "do NOT scope" — players and single-team coaches see the exact same rail
    // as before. Fail-open: a scoping error leaves the rail unscoped, never blank.
    let teamAllow: Set<string> | null = null;
    try {
      const allowedIds = await getGolfActiveTeamConversationIds();
      if (allowedIds !== null) teamAllow = new Set(allowedIds);
    } catch (teamAllowErr) {
      teamAllow = null;
      logError(
        teamAllowErr instanceof Error ? teamAllowErr : new Error(String(teamAllowErr)),
        { component: 'useGolfMessages', action: 'fetch-active-team-scope', sport: 'golf', userId },
        'medium'
      );
    }

    let conversationsData = rawData as ConversationRow[] | null;
    if (teamAllow) {
      const allow = teamAllow;
      conversationsData = (conversationsData ?? []).filter((c) => allow.has(c.id));
    }

    // Also fetch team chat conversations directly (in case DB function doesn't include them)
    const { data: groupConvs, error: groupConvsError } = await supabase
      .from('golf_conversation_participants')
      .select(`
        conversation:golf_conversations!inner(
          id,
          created_at,
          updated_at,
          is_team_chat,
          title,
          created_by
        )
      `)
      .eq('user_id', userId);

    if (groupConvsError) {
      logError(
        toPostgrestError(groupConvsError),
        {
          component: 'useGolfConversations',
          action: 'fetch-team-chat-conversations',
          sport: 'golf',
          userId,
          ...postgrestErrorContext(groupConvsError),
        },
        'medium'
      );
    }

    // Extract team chat conversations and merge them
    const groupConversations: ConversationRow[] = [];
    const existingIds = new Set(conversationsData?.map(c => c.id) || []);

    if (groupConvs) {
      // Collect team chat conversations that aren't already in the RPC results
      const teamChats: Array<{
        id: string;
        created_at: string;
        updated_at: string;
        title: string | null;
        created_by: string | null;
      }> = [];

      for (const gc of groupConvs) {
        const conv = gc.conversation as {
          id: string;
          created_at: string;
          updated_at: string;
          is_team_chat: boolean | null;
          title: string | null;
          created_by: string | null;
        } | null;

        if (
          conv &&
          conv.is_team_chat &&
          !existingIds.has(conv.id) &&
          (!teamAllow || teamAllow.has(conv.id))
        ) {
          teamChats.push(conv);
        }
      }

      // Batch fetch all group chat metadata in parallel (instead of N+1 per chat)
      if (teamChats.length > 0) {
        const teamChatIds = teamChats.map(c => c.id);

        const [participantCounts, userParticipantData] = await Promise.all([
          // Participant counts for all group chats
          supabase
            .from('golf_conversation_participants')
            .select('conversation_id')
            .in('conversation_id', teamChatIds),
          // User's last_read_at for all group chats
          supabase
            .from('golf_conversation_participants')
            .select('conversation_id, last_read_at')
            .in('conversation_id', teamChatIds)
            .eq('user_id', userId),
        ]);

        // Build lookup maps
        const countByConv = new Map<string, number>();
        (participantCounts.data || []).forEach(p => {
          countByConv.set(p.conversation_id, (countByConv.get(p.conversation_id) || 0) + 1);
        });

        const lastReadByConv = new Map<string, string | null>();
        (userParticipantData.data || []).forEach(p => {
          lastReadByConv.set(p.conversation_id, p.last_read_at);
        });

        // P447: compute last-message + unread COUNT in SQL, per conversation.
        // The old approach fetched EVERY message of EVERY team chat (no .limit)
        // and counted client-side — past the PostgREST 1000-row cap a busy team
        // chat would silently cap/under-count its unread badge, and the "last
        // message" could be wrong once total rows across the .in() exceeded the
        // cap. A `head:true, count:'exact'` query transfers ZERO rows and is not
        // subject to the row cap; the last message is a single-row fetch. Team
        // chats per user are few, so per-conversation parallelism is cheap.
        const lastMsgByConv = new Map<string, { content: string | null; created_at: string | null; sender_id: string }>();
        const unreadByConv = new Map<string, number>();

        await Promise.all(
          teamChatIds.map(async (cid) => {
            const lastReadAt = lastReadByConv.get(cid) ?? null;

            // Latest message in this chat (single row, server-ordered).
            const lastMsgQuery = supabase
              .from('golf_messages')
              .select('content, created_at, sender_id')
              .eq('conversation_id', cid)
              .eq('is_deleted', false)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            // Unread = others' messages newer than the user's last_read_at.
            // count-only (head) → no rows transferred, no 1000-row truncation.
            let unreadQuery = supabase
              .from('golf_messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', cid)
              .eq('is_deleted', false)
              .neq('sender_id', userId);
            if (lastReadAt) {
              unreadQuery = unreadQuery.gt('created_at', lastReadAt);
            }

            const [{ data: lastMsg }, { count: unreadCount }] = await Promise.all([
              lastMsgQuery,
              unreadQuery,
            ]);

            if (lastMsg) {
              lastMsgByConv.set(cid, {
                content: lastMsg.content,
                created_at: lastMsg.created_at,
                sender_id: lastMsg.sender_id,
              });
            }
            unreadByConv.set(cid, unreadCount ?? 0);
          }),
        );

        for (const conv of teamChats) {
          const lastMsg = lastMsgByConv.get(conv.id);
          const unreadCount = unreadByConv.get(conv.id) ?? 0;

          groupConversations.push({
            id: conv.id,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            creator_id: conv.created_by,
            last_message_content: lastMsg?.content || null,
            last_message_at: lastMsg?.created_at || null,
            last_message_sender_id: lastMsg?.sender_id || null,
            unread_count: unreadCount,
            participant_ids: [],
            participant_names: [],
            is_group: true,
            title: conv.title,
            participant_count: countByConv.get(conv.id) || 0,
          });
        }
      }
    }

    // Merge group conversations with regular ones
    if (groupConversations.length > 0) {
      conversationsData = [...(conversationsData || []), ...groupConversations];
    }

    // `groupConvsError` joins the RPC error here rather than early-returning at
    // its own call site. The team-chat query is a SUPPLEMENT to the RPC ("in
    // case DB function doesn't include them"), so returning on its failure
    // would blank a rail whose DMs loaded fine. But when BOTH paths yield
    // nothing and either one failed, that is a backend failure — and it was
    // previously logged and then allowed to fall through to the cheerful "No
    // conversations yet" empty, which is the exact masquerade P257 exists to
    // stop. MessageConversationRail keeps rows on screen when
    // `error && conversations.length > 0`, so the partial case stays readable.
    const loadFailure = error ?? groupConvsError;
    if (loadFailure && !conversationsData?.length) {
      // P257: a real backend failure (fetch error AND no rows recovered) must
      // NOT masquerade as an empty inbox. Flag it so the rail shows a
      // recoverable error with Retry instead of the cheerful empty.
      logError(
        toPostgrestError(loadFailure),
        {
          component: 'useGolfConversations',
          action: 'fetch-conversations',
          sport: 'golf',
          userId,
          ...postgrestErrorContext(loadFailure),
        },
        'medium'
      );
      setError(true);
      setConversations([]);
      setLoading(false);
      return;
    }

    if (!conversationsData || conversationsData.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Get unique other user IDs for batch fetching (only for non-group conversations)
    const otherUserIds = new Set<string>();
    conversationsData.forEach((conv) => {
      if (!conv.is_group) {
        conv.participant_ids?.forEach((id) => {
          if (id !== userId) otherUserIds.add(id);
        });
      }
    });

    // Batch fetch golf coaches and players (2 queries instead of N*2)
    const [{ data: coaches }, { data: players }] = await Promise.all([
      otherUserIds.size > 0
        ? supabase
            .from('golf_coaches')
            .select('id, user_id, full_name, title, avatar_url')
            .in('user_id', Array.from(otherUserIds))
        : Promise.resolve({ data: [] }),
      otherUserIds.size > 0
        ? supabase
            .from('golf_players')
            .select('id, user_id, first_name, last_name, graduation_year, avatar_url')
            .in('user_id', Array.from(otherUserIds))
        : Promise.resolve({ data: [] }),
    ]);

    // Create lookup maps with proper types
    interface CoachLookup {
      id: string;
      user_id: string | null;
      full_name: string | null;
      title: string | null;
      avatar_url: string | null;
    }
    interface PlayerLookup {
      id: string;
      user_id: string | null;
      first_name: string | null;
      last_name: string | null;
      graduation_year: number | null;
      avatar_url: string | null;
    }

    const coachByUserId = new Map<string, CoachLookup>();
    (coaches || []).forEach((c) => {
      if (c.user_id) coachByUserId.set(c.user_id, c as CoachLookup);
    });

    const playerByUserId = new Map<string, PlayerLookup>();
    (players || []).forEach((p) => {
      if (p.user_id) playerByUserId.set(p.user_id, p as PlayerLookup);
    });

    // Transform to GolfConversationWithMeta format
    const transformedConversations = conversationsData.map((conv) => {
      // Handle group conversations differently
      if (conv.is_group) {
        return {
          id: conv.id,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
          last_message: conv.last_message_content ? {
            id: '',
            conversation_id: conv.id,
            sender_id: conv.last_message_sender_id || '',
            content: conv.last_message_content,
            created_at: conv.last_message_at,
            read: false,
          } : null,
          unread_count: conv.unread_count || 0,
          is_group: true,
          title: conv.title,
          participant_count: conv.participant_count || conv.participant_ids?.length || 0,
        } as GolfConversationWithMeta;
      }

      // Find the other user in this conversation
      const otherUserId = conv.participant_ids?.find((id) => id !== userId);

      let otherParticipant: GolfConversationParticipant | undefined;

      if (otherUserId) {
        const coach = coachByUserId.get(otherUserId);
        const player = playerByUserId.get(otherUserId);

        if (coach) {
          otherParticipant = {
            id: otherUserId, // Use user_id for consistent comparison (conversations use user IDs)
            name: coach.full_name || 'Coach',
            subtitle: coach.title || 'Golf Coach',
            avatar: coach.avatar_url,
            type: 'coach',
          };
        } else if (player) {
          otherParticipant = {
            id: otherUserId, // Use user_id for consistent comparison (conversations use user IDs)
            name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player',
            subtitle: player.graduation_year ? `Class of ${player.graduation_year}` : 'Golf Player',
            avatar: player.avatar_url,
            type: 'player',
          };
        }
      }

      return {
        id: conv.id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        last_message: conv.last_message_content ? {
          id: '', // Not returned by function, but not typically needed
          conversation_id: conv.id,
          sender_id: conv.last_message_sender_id || '',
          content: conv.last_message_content,
          created_at: conv.last_message_at,
          read: false,
        } : null,
        unread_count: conv.unread_count || 0,
        other_participant: otherParticipant,
        is_group: false,
      } as GolfConversationWithMeta;
    });

    // Sort by last message time (most recent first)
    transformedConversations.sort((a, b) => {
      const aTime = a.last_message?.created_at || a.updated_at;
      const bTime = b.last_message?.created_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setConversations(transformedConversations);
    conversationIdsRef.current = new Set(transformedConversations.map(c => c.id));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Fetch conversations when userId is set
  useEffect(() => {
    if (userId) {
      fetchConversations();
    }
  }, [userId, fetchConversations]);

  // Set up real-time subscription for conversation updates
  // OPTIMIZED: Subscribe to conversation_participants table filtered by user_id
  // This triggers only when the user's conversations are updated (new message, etc.)
  // Previously subscribed to ALL messages which caused excessive refetches
  useEffect(() => {
    if (!userId) return;

    // Debounced refetch to batch rapid realtime updates
    const debouncedFetch = () => {
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
      }
      fetchDebounceRef.current = setTimeout(() => {
        fetchConversations();
      }, 300);
    };

    const channel = observeRealtimeChannel(
      supabase
      .channel(`golf-conversations:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'golf_conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          debouncedFetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'golf_conversations',
        },
        (payload) => {
          // Only refetch if this conversation involves the current user
          if (conversationIdsRef.current.has(payload.new.id as string)) {
            debouncedFetch();
          }
        }
      ),
      { feature: 'golf.messages', channelClass: 'golf_conversations_list', subscriptionType: 'postgres_changes' },
    );

    return () => {
      supabase.removeChannel(channel);
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchConversations]);

  return { conversations, loading, error, refetch: fetchConversations };
}
