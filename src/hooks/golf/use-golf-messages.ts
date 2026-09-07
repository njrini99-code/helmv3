'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendGolfMessage, markGolfMessagesAsRead, updateGolfMessage, deleteGolfMessage, getGolfActiveTeamConversationIds } from '@/app/golf/actions/messages';
import { isTransientNetworkErrorMessage, withOneTransportRetry } from '@/lib/transient-network-error';
import type { GolfMessageRow } from '@/lib/types';
import { logError } from '@/lib/error-logging';
import { describeError, postgrestErrorContext, toPostgrestError } from '@/lib/utils/describe-error';
import { observeRealtimeChannel } from '@/lib/observability/supabase/realtime';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

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

/**
 * The last-message PREVIEW carried on a conversation row — not a message.
 *
 * `get_golf_conversations_with_details` returns exactly three scalars about the
 * newest message (`last_message_content`, `last_message_at`,
 * `last_message_sender_id`); it does not return that message's id, and it does
 * not return its read state. This type therefore has three fields and no more.
 *
 * It used to be typed `GolfMessageRow`, which forced the transform to invent
 * the missing columns: every conversation's preview was built with a literal
 * `id: ''` and `read: false` (G-15, §16.1). A consumer keyed on
 * `last_message.id` would have found every conversation in the inbox sharing
 * one empty id, and `read` was a constant lie about a real column.
 *
 * Narrowing the type rather than grepping for the literal is what actually
 * proves nothing consumed the fabrication: the compiler now rejects any read
 * of `.id` or `.read` here. This mirrors what baseball already does honestly
 * in `src/hooks/use-messages.ts` (content / sent_at / sender_id, no id).
 */
export interface GolfConversationLastMessage {
  content: string;
  /** `last_message_at` is nullable in the function's own signature. */
  created_at: string | null;
  sender_id: string | null;
}

export interface GolfConversationWithMeta {
  id: string;
  created_at: string;
  updated_at: string;
  last_message?: GolfConversationLastMessage | null;
  unread_count: number;
  other_participant?: GolfConversationParticipant;
  // Group conversation fields
  is_group?: boolean;
  title?: string | null;
  participant_count?: number;
  /**
   * G-33 / D-03a — who is in this group, and who made it.
   *
   * Both facts existed one step upstream and were dropped by the transform, so
   * every group conversation reached the UI having lost them:
   *
   * - `participant_ids` is returned by `get_golf_conversations_with_details`
   *   itself (`participant_ids uuid[]`, baseline migration :2810) and was set
   *   to a literal `[]` on the supplemental team-chat path. The RPC-origin
   *   rows always carried real ids; nothing downstream could see either.
   * - `creator_id` is `c.created_by AS creator_id` in the same function
   *   (:2820) AND is set on the supplemental push, so it is present on BOTH
   *   paths — this corrects G-34's reading, which inferred the RPC branch
   *   never populates it. D-03a's Admin pill reads exactly this column;
   *   `golf_conversation_participants` has no role column of any kind, and
   *   `users.role = 'admin'` means *platform* super-admin, which would badge
   *   the wrong account in both directions (§24.5).
   *
   * Optional rather than required because a row that predates a refetch, or
   * one built by a test fixture, must be able to say "I don't know" — the
   * member list and the pill render from real data or not at all, never from
   * a placeholder.
   */
  participant_ids?: string[];
  creator_id?: string | null;
}

// Extended message type with read receipt info
export interface GolfMessage extends GolfMessageRow {
  isRead?: boolean; // Whether the other participant has read this message
  /**
   * CLIENT-ONLY, and only ever set on an optimistic row whose send failed
   * (G-19). It is never selected, never written, and no realtime payload
   * carries it — a row that came back from the database always leaves this
   * undefined.
   *
   * It exists because the previous behaviour on a failed send was to remove
   * the optimistic bubble from the thread, which deletes what the user wrote
   * and leaves a toast as the only trace. §9.2 requires the message to be
   * RETAINED, shown muted, and offered a retry.
   */
  sendFailed?: boolean;
  /**
   * WHY the send failed, in the only two classes we can actually distinguish
   * (G-20b, §9.5).
   *
   * `refused` — the server answered and said no. `fetch` resolved, so the
   * request demonstrably arrived; whatever it says is the truth.
   *
   * `unknown` — the transport died and there is no answer to read. The POST
   * may have committed with only the response lost, which is exactly the case
   * §9.5 says must NOT be reported as a definitive failure: "An unknown commit
   * outcome uses Checking status or Confirmation unavailable, not a red
   * definitive failure that invites duplication."
   *
   * Only these two, deliberately. §9.5 names eight outcomes, but M03C's F3
   * documents this one collapse as the gap; the other six have no evidence
   * asking for them and are not invented here.
   */
  sendOutcome?: 'refused' | 'unknown';
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

  /**
   * G-13 — the conversation currently on screen, readable from inside an
   * async closure that captured an OLDER one.
   *
   * `useGolfMessages(id)` takes the id as an ARGUMENT, not a React key, so
   * switching conversations does not remount: there is one persistent hook
   * instance owning one `messages` state. An in-flight fetch for conversation A
   * therefore resolves into whatever thread is open by then, and wrote A's
   * messages, loading and error into B's view. Recreating the `useCallback` on
   * an id change does not help — a new callback identity cannot cancel a
   * promise the old one already started, and both call the same setter.
   *
   * Assigned on every render so it is never stale, and compared after every
   * await below: if the answer changed while we were waiting, the response
   * belongs to a thread nobody is looking at and is dropped.
   */
  const liveConversationIdRef = useRef(conversationId);
  liveConversationIdRef.current = conversationId;

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

    // G-13: dropped if the reader moved on while this was in flight.
    if (liveConversationIdRef.current !== conversationId) return;

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
      // G-13: an abandoned thread's failure must not surface as an error on
      // the thread the user is actually reading.
      if (liveConversationIdRef.current !== conversationId) return;
      setError(true);
      setLoading(false);
      return;
    }

    // G-13: the whole reason this guard exists — this setter is shared, and
    // an unguarded write here replaced the open thread's messages with a
    // slower response belonging to a conversation the user already left.
    if (liveConversationIdRef.current !== conversationId) return;

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

  /**
   * G-19: retain the optimistic row and mark it failed, instead of deleting it.
   *
   * Every failure branch below used to call
   * `setMessages(prev => prev.filter(m => m.id !== optimisticId))`, which threw
   * away the text the user wrote and left a toast as its only trace. Marking
   * keeps the message on screen, muted, with a retry — and because the row is
   * still present under the SAME optimistic id, `retryMessage` can re-send it
   * with that id and inherit the existing primary-key collision handling that
   * makes a duplicate attempt safe.
   */
  const markSendFailed = (optimisticId: string, sendOutcome: 'refused' | 'unknown') => {
    setMessages(prev =>
      prev.map(m => (m.id === optimisticId ? { ...m, sendFailed: true, sendOutcome } : m)),
    );
  };

  /**
   * Classify a send failure into the two outcomes §9.5 needs kept apart.
   *
   * The discriminator is already sitting there and needs no new plumbing: a
   * transport-layer error means `fetch` itself threw, so no response was ever
   * read and the commit state is genuinely unknown. Anything else — including
   * an `{ error }` the action returned — means the request arrived and the
   * server refused it.
   */
  const classifySendFailure = (error: unknown): 'refused' | 'unknown' =>
    isTransientNetworkErrorMessage(error instanceof Error ? error.message : String(error))
      ? 'unknown'
      : 'refused';

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
      // The action answered. Whatever it says, the request demonstrably
      // arrived, so this is a refusal and not an unknown commit (G-20b).
      if (result && 'error' in result && result.error) {
        markSendFailed(optimisticId, 'refused');
        throw new Error(result.error);
      }

      if (!result || !result.success) {
        markSendFailed(optimisticId, 'refused');
        throw new Error('Failed to send message');
      }

      return true;
    } catch (error) {
      // Retain the message, marked failed — see markSendFailed (G-19) — and
      // record WHICH kind of failure it was (G-20b). Re-marking a row the
      // branches above already marked is harmless: those errors carry app
      // wording, so they classify as `refused` a second time.
      markSendFailed(optimisticId, classifySendFailure(error));
      logError(
        error instanceof Error ? error : new Error(String(error)),
        { component: 'useGolfMessages', action: 'send-message', sport: 'golf', conversationId },
        'high'
      );
      throw error;
    }
  };

  /**
   * Re-send a message that is sitting in the thread marked failed (G-19).
   *
   * Reuses the row's EXISTING id rather than minting a new one, which is what
   * makes this safe to press twice: `sendGolfMessage` writes the client id as
   * the real `golf_messages.id`, so a retry that races an attempt which
   * actually committed collides on the primary key and the action reports that
   * 23505 back as the success it is, instead of creating a duplicate. Same
   * property `withOneTransportRetry` already relies on above.
   *
   * Returns true on success. The failed flag is cleared optimistically before
   * the attempt so the bubble stops looking failed while it is in flight, and
   * restored if the attempt fails again.
   */
  const retryMessage = async (messageId: string): Promise<boolean> => {
    const target = messages.find(m => m.id === messageId && m.sendFailed);
    if (!target) return false;

    setMessages(prev =>
      prev.map(m =>
        // The outcome goes with the flag. Left behind, a row that retried out
        // of `unknown` into `refused` would still be carrying the old label.
        m.id === messageId ? { ...m, sendFailed: false, sendOutcome: undefined } : m,
      ),
    );

    try {
      const result = await withOneTransportRetry(
        () => sendGolfMessage(conversationId, target.content, messageId),
        SEND_TRANSPORT_RETRY_DELAY_MS,
      );
      if (!result || !result.success || ('error' in result && result.error)) {
        markSendFailed(messageId, 'refused');
        return false;
      }
      return true;
    } catch (error) {
      markSendFailed(messageId, classifySendFailure(error));
      logError(
        error instanceof Error ? error : new Error(String(error)),
        { component: 'useGolfMessages', action: 'retry-message', sport: 'golf', conversationId },
        'high',
      );
      return false;
    }
  };

  /**
   * Drop a failed message the user has decided not to send (G-19).
   *
   * Guarded on `sendFailed` so this can only ever remove a client-side row that
   * never reached the database — it must not become a second delete path for a
   * real message, which is `removeMessage`'s job.
   */
  const discardFailedMessage = (messageId: string) => {
    setMessages(prev => prev.filter(m => !(m.id === messageId && m.sendFailed)));
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
    retryMessage,
    discardFailedMessage,
    editMessage,
    removeMessage,
    refetch: fetchMessages,
    isOtherTyping,
    sendTypingStatus,
    currentUserId,
  };
}

/**
 * One row of `get_golf_conversations_with_details`, and the shape the
 * supplemental team-chat path builds to match it.
 *
 * Declared at module scope rather than inside the fetch so the two pure
 * decisions below can be exercised directly — the fetch itself needs a full
 * supabase + auth harness to reach.
 */
export interface GolfConversationRpcRow {
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
  /**
   * The RPC's 14th and final column. It was omitted from this interface, so it
   * described 13 of the 14 columns the function actually returns and the value
   * never reached the client (G-15).
   *
   * `is_team_channel` and `is_team_chat` are two DIFFERENT flags, not two
   * spellings of one — both exist on `golf_conversations`. The function's
   * `is_group` output is literally `COALESCE(c.is_team_chat, FALSE)`, so
   * is_team_chat is the GROUPING flag; is_team_channel is separate and is used
   * inside the function only by its own `ORDER BY`. See
   * `audit/M01-TEAM-FLAGS.md`.
   *
   * Nothing branches on it yet — the inbox's ordering and sectioning are the
   * client's own (G-01), and this only stops the type from lying.
   */
  is_team_channel?: boolean;
}

/**
 * G-40 — which conversations must have their unread badge recomputed for THIS
 * viewer.
 *
 * The RPC's `unread_count` is `COUNT(*) WHERE read = FALSE AND sender_id <>
 * me`, i.e. it runs on `golf_messages.read`, ONE boolean shared by every
 * participant. `mark_golf_messages_read` flips that boolean on every message
 * the opener did not send — so in a 3+ person team chat, one member opening
 * the thread clears the badge for everyone, including members who never saw
 * those messages (§17.2).
 *
 * A DM is unaffected and deliberately left alone: with two people, "not sent
 * by me" and "not read by me" are the same set, so the shared boolean is
 * already per-viewer there, and it is what DM read receipts are built on.
 *
 * `alreadyPerViewer` is the set the supplemental team-chat path computed
 * itself — those rows arrive with an honest count and must not be re-queried.
 * That path was the "correct per-viewer fallback" the audit found: right, but
 * reached only for team chats the RPC MISSED, so the normal path was the
 * broken one.
 */
export function perViewerUnreadTargets(
  rows: readonly GolfConversationRpcRow[] | null,
  alreadyPerViewer: ReadonlySet<string>,
): string[] {
  return (rows ?? [])
    .filter((row) => row.is_group === true && !alreadyPerViewer.has(row.id))
    .map((row) => row.id);
}

/**
 * G-40 — apply recomputed per-viewer counts.
 *
 * A conversation with no entry keeps the number it already had. That is the
 * important half: when the recompute fails for one conversation, the badge
 * degrades to the shared-boolean number rather than silently reading zero,
 * which would look exactly like "you are caught up".
 */
export function applyPerViewerUnread(
  rows: readonly GolfConversationRpcRow[] | null,
  counts: ReadonlyMap<string, number>,
): GolfConversationRpcRow[] {
  return (rows ?? []).map((row) =>
    counts.has(row.id) ? { ...row, unread_count: counts.get(row.id) as number } : row,
  );
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

    let conversationsData = rawData as GolfConversationRpcRow[] | null;
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
          is_team_channel,
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
    const groupConversations: GolfConversationRpcRow[] = [];
    const existingIds = new Set(conversationsData?.map(c => c.id) || []);
    /**
     * Conversations whose unread count this function computed itself, from the
     * viewer's own `last_read_at`. They must NOT be recomputed below (G-40).
     */
    const perViewerUnreadIds = new Set<string>();

    if (groupConvs) {
      // Collect team chat conversations that aren't already in the RPC results
      const teamChats: Array<{
        id: string;
        created_at: string;
        updated_at: string;
        is_team_channel: boolean | null;
        title: string | null;
        created_by: string | null;
      }> = [];

      for (const gc of groupConvs) {
        const conv = gc.conversation as {
          id: string;
          created_at: string;
          updated_at: string;
          is_team_chat: boolean | null;
          is_team_channel: boolean | null;
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
          // Every participant row for these group chats.
          //
          // G-33 — this now supplies IDENTITY, not just a count, so it is
          // paginated. As a count the PostgREST 1000-row cap degraded quietly
          // (a big team channel under-counted); as the source of the member
          // list it would silently truncate WHO is in the group, which is the
          // class of defect this audit exists to remove. `.limit(2000)` does
          // not raise the cap — `fetchAllRowsResult` ranges through it and
          // preserves the `{ data, error }` shape the callers below read.
          fetchAllRowsResult<{ conversation_id: string; user_id: string }>(
            (from, to) =>
              supabase
                .from('golf_conversation_participants')
                .select('conversation_id, user_id')
                .in('conversation_id', teamChatIds)
                // Stable order on the primary key — the helper's own contract.
                // Ranging an unordered query lets page boundaries drift, which
                // duplicates some rows and drops others.
                .order('id', { ascending: true })
                .range(from, to),
            undefined,
            {
              table: 'golf_conversation_participants',
              action: 'fetch-team-chat-participants',
              sport: 'golf',
              userId,
            },
          ),
          // User's last_read_at for all group chats
          supabase
            .from('golf_conversation_participants')
            .select('conversation_id, last_read_at')
            .in('conversation_id', teamChatIds)
            .eq('user_id', userId),
        ]);

        // Build lookup maps.
        //
        // G-33 — the ids and the count come off the SAME rows now, so the
        // header's "N members" and the details sheet's member list cannot
        // disagree with each other. They used to be two separate facts: a
        // count from here and a hardcoded empty array below.
        const idsByConv = new Map<string, string[]>();
        (participantCounts.data || []).forEach(p => {
          const ids = idsByConv.get(p.conversation_id);
          if (ids) ids.push(p.user_id);
          else idsByConv.set(p.conversation_id, [p.user_id]);
        });
        const countByConv = new Map<string, number>();
        idsByConv.forEach((ids, cid) => countByConv.set(cid, ids.length));

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
          perViewerUnreadIds.add(conv.id);

          groupConversations.push({
            id: conv.id,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            creator_id: conv.created_by,
            last_message_content: lastMsg?.content || null,
            last_message_at: lastMsg?.created_at || null,
            last_message_sender_id: lastMsg?.sender_id || null,
            unread_count: unreadCount,
            // G-33 — was a literal `[]` here, for every group, forever. The
            // ids were one query away and that query was already being run;
            // it just asked for `conversation_id` alone.
            participant_ids: idsByConv.get(conv.id) ?? [],
            // Still empty, and deliberately: NOTHING on the golf side reads
            // `participant_names` (the RPC declares it, the DM path resolves
            // its one name through `coachByUserId`/`playerByUserId` at
            // transform time, and the group path resolves every name the same
            // way). Filling it here would be a second, independently-staleable
            // copy of names the transform already has. `participant_ids` is
            // the identity carried forward; names are looked up from it.
            participant_names: [],
            is_group: true,
            title: conv.title,
            participant_count: countByConv.get(conv.id) || 0,
            // Carried so a merged row has the same shape as an RPC row. These
            // rows only reach here when `is_team_chat` is true; whether they
            // are ALSO the team channel is a separate fact (G-15).
            is_team_channel: conv.is_team_channel ?? false,
          });
        }
      }
    }

    // Merge group conversations with regular ones
    if (groupConversations.length > 0) {
      conversationsData = [...(conversationsData || []), ...groupConversations];
    }

    /**
     * G-40 — recompute group unread for THIS viewer.
     *
     * See `perViewerUnreadTargets` for why the RPC's number is wrong for a 3+
     * person chat and right for a DM. This is the same computation the
     * supplemental team-chat path above already performs; it now covers the
     * normal path too, which is where nearly every group conversation arrives.
     *
     * `head: true, count: 'exact'` transfers zero rows and is not subject to
     * the PostgREST 1000-row cap, so a busy team chat cannot silently
     * under-count. The id list is chunked because PostgREST filters travel in
     * the URL and a long `.in()` is rejected with a bare 400.
     *
     * A viewer with a null `last_read_at` counts every message someone else
     * sent, which is the honest reading of "has never opened this thread".
     * `markMessagesAsRead` has written that column as the primary read marker
     * for some time, so this is the same source the global unread badge and
     * the notification digests already use.
     */
    const perViewerTargets = perViewerUnreadTargets(conversationsData, perViewerUnreadIds);
    if (perViewerTargets.length > 0) {
      const ID_CHUNK = 200;
      const lastReadByConv = new Map<string, string | null>();
      let lastReadFailed = false;

      for (let i = 0; i < perViewerTargets.length; i += ID_CHUNK) {
        const chunk = perViewerTargets.slice(i, i + ID_CHUNK);
        const { data: myRows, error: myRowsError } = await supabase
          .from('golf_conversation_participants')
          .select('conversation_id, last_read_at')
          .in('conversation_id', chunk)
          .eq('user_id', userId);

        if (myRowsError) {
          lastReadFailed = true;
          logError(
            toPostgrestError(myRowsError),
            {
              component: 'useGolfConversations',
              action: 'fetch-per-viewer-last-read',
              sport: 'golf',
              userId,
              ...postgrestErrorContext(myRowsError),
            },
            'medium'
          );
          continue;
        }
        (myRows || []).forEach((row) => {
          lastReadByConv.set(row.conversation_id, row.last_read_at);
        });
      }

      // A failed read-marker lookup means we cannot compute an honest count,
      // so leave every badge as the RPC reported it rather than counting every
      // message as unread.
      if (!lastReadFailed) {
        const perViewerCounts = new Map<string, number>();

        await Promise.all(
          perViewerTargets.map(async (cid) => {
            const lastReadAt = lastReadByConv.get(cid) ?? null;
            let unreadQuery = supabase
              .from('golf_messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', cid)
              .eq('is_deleted', false)
              .neq('sender_id', userId);
            if (lastReadAt) {
              unreadQuery = unreadQuery.gt('created_at', lastReadAt);
            }

            const { count, error: unreadError } = await unreadQuery;
            if (unreadError) {
              // Leave this one conversation on the RPC's shared-boolean number.
              logError(
                toPostgrestError(unreadError),
                {
                  component: 'useGolfConversations',
                  action: 'count-per-viewer-unread',
                  sport: 'golf',
                  userId,
                  ...postgrestErrorContext(unreadError),
                },
                'medium'
              );
              return;
            }
            perViewerCounts.set(cid, count ?? 0);
          }),
        );

        conversationsData = applyPerViewerUnread(conversationsData, perViewerCounts);
      }
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
            content: conv.last_message_content,
            created_at: conv.last_message_at,
            sender_id: conv.last_message_sender_id,
          } : null,
          unread_count: conv.unread_count || 0,
          is_group: true,
          title: conv.title,
          participant_count: conv.participant_count || conv.participant_ids?.length || 0,
          // G-33 / D-03a — forward, do not re-derive. Both fields are already
          // on `conv` for RPC-origin rows and are set on the supplemental push
          // below; the transform was simply not copying them out.
          participant_ids: conv.participant_ids ?? [],
          creator_id: conv.creator_id ?? null,
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
          content: conv.last_message_content,
          created_at: conv.last_message_at,
          sender_id: conv.last_message_sender_id,
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
