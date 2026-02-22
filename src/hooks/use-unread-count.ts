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
        setUnreadCount(0);
        setLoading(false);
        return;
      }

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
      const channel = supabase
        .channel('unread-baseball-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'baseball_messages',
          },
          () => {
            fetchUnreadCount();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'baseball_conversation_participants',
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
