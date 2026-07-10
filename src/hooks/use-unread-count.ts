'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  // useRef prevents new client instance on every render (was causing infinite refetch loop)
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  // Stable, unique-per-mount realtime channel name (see subscribe block below).
  const channelNameRef = useRef(`unread-baseball-messages-${Math.random().toString(36).slice(2)}`);
  // Conversation IDs this user participates in — populated by fetchUnreadCount,
  // used to discard `baseball_conversations` UPDATE events for conversations
  // this user isn't part of (that table has no user_id column to filter on
  // server-side; same client-side-filter pattern as use-messages.ts fix #451).
  const conversationIdsRef = useRef<Set<string>>(new Set());

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Get all conversation IDs the user is part of
      const { data: participantData } = await supabase
        .from('baseball_conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participantData || participantData.length === 0) {
        conversationIdsRef.current = new Set();
        setUnreadCount(0);
        setLoading(false);
        return;
      }

      conversationIdsRef.current = new Set(participantData.map((p) => p.conversation_id));

      // Count unread messages across all conversations
      let totalUnread = 0;

      for (const participant of participantData) {
        const { count } = await supabase
          .from('baseball_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', participant.conversation_id)
          .neq('sender_id', user.id)
          .gt('created_at', participant.last_read_at || '1970-01-01');

        totalUnread += count || 0;
      }

      setUnreadCount(totalUnread);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    fetchUnreadCount();

    // Set up real-time subscription for new messages
    if (user) {
      // Unique channel name per mount. With a fixed name, supabase-js returned the
      // already-subscribed channel on remount/multi-mount, so the chained `.on()` ran
      // AFTER `.subscribe()` → "cannot add postgres_changes callbacks ... after
      // subscribe()". A per-mount id guarantees a fresh channel each time.
      const channel = supabase
        .channel(channelNameRef.current)
        // OPTIMIZED: was an unfiltered `baseball_messages` INSERT subscription
        // — any message sent by any user in the org re-triggered this
        // client's full unread refetch, not just messages in this user's own
        // conversations. sendMessage() (src/app/actions/messages.ts) bumps
        // baseball_conversations.updated_at on every new message, so listen
        // there instead. That table has no user_id column to filter on
        // server-side, so — same pattern as use-messages.ts fix #451 —
        // accept the unfiltered UPDATE stream and discard rows outside the
        // viewer's own conversations client-side via conversationIdsRef.
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'baseball_conversations',
          },
          (payload) => {
            if (conversationIdsRef.current.has(payload.new.id as string)) {
              fetchUnreadCount();
            }
          }
        )
        // OPTIMIZED: scoped to this user's own participant rows (read-state
        // changes from another of the user's own devices/tabs) instead of an
        // unfiltered table-wide subscription that re-fired on every user's
        // read-receipt update platform-wide.
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'baseball_conversation_participants',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchUnreadCount();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
    return undefined;
  }, [user, fetchUnreadCount, supabase]);

  return { unreadCount, loading, refetch: fetchUnreadCount };
}
