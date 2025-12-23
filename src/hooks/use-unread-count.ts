'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

export function useUnreadCount() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const supabase = createClient();

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Get all conversation IDs the user is part of
      const { data: participantData } = await supabase
        .from('conversation_participants')
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
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', participant.conversation_id)
          .neq('sender_id', user.id)
          .gt('sent_at', participant.last_read_at || '1970-01-01');

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
        .channel('unread-messages')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
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
            table: 'conversation_participants',
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
  }, [user, fetchUnreadCount, supabase]);

  return { unreadCount, loading, refetch: fetchUnreadCount };
}
