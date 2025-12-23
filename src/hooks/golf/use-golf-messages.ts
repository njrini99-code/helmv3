'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { sendGolfMessage, markGolfMessagesAsRead } from '@/app/golf/actions/messages';
import type { Message } from '@/lib/types';

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
  last_message?: Message | null;
  unread_count: number;
  other_participant?: GolfConversationParticipant;
}

export function useGolfMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true });

    setMessages((data || []) as Message[]);
    setLoading(false);

    // Mark messages as read
    markGolfMessagesAsRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    // Set up real-time subscription
    const channel = supabase
      .channel(`golf-conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages]);

  const sendMessage = async (content: string) => {
    try {
      await sendGolfMessage(conversationId, content);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}

export function useGolfConversations() {
  const [conversations, setConversations] = useState<GolfConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const supabase = createClient();

  const fetchConversations = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Get all conversation IDs the user is part of
    const { data: participantData } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (!participantData || participantData.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const conversationIds = participantData.map(p => p.conversation_id);

    // Fetch conversations
    const { data: conversationsData } = await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });

    if (!conversationsData) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Fetch last message and other participant for each conversation
    const conversationsWithMeta = await Promise.all(
      conversationsData.map(async (conv) => {
        // Get last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        const { data: participant } = await supabase
          .from('conversation_participants')
          .select('last_read_at')
          .eq('conversation_id', conv.id)
          .eq('user_id', user.id)
          .single();

        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', user.id)
          .gt('sent_at', participant?.last_read_at || '1970-01-01');

        // Find other participants
        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', user.id);

        let otherParticipant: GolfConversationParticipant | undefined;

        if (otherParticipants && otherParticipants.length > 0 && otherParticipants[0]) {
          const otherUserId = otherParticipants[0].user_id;

          // Try to find as golf coach
          const { data: coach } = await supabase
            .from('golf_coaches')
            .select('id, full_name, title, avatar_url')
            .eq('user_id', otherUserId)
            .single();

          if (coach) {
            otherParticipant = {
              id: coach.id,
              name: coach.full_name || 'Coach',
              subtitle: coach.title || 'Golf Coach',
              avatar: coach.avatar_url,
              type: 'coach',
            };
          } else {
            // Try to find as golf player
            const { data: player } = await supabase
              .from('golf_players')
              .select('id, first_name, last_name, year, avatar_url')
              .eq('user_id', otherUserId)
              .single();

            if (player) {
              otherParticipant = {
                id: player.id,
                name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player',
                subtitle: player.year ? `${player.year.charAt(0).toUpperCase()}${player.year.slice(1)}` : 'Golf Player',
                avatar: player.avatar_url,
                type: 'player',
              };
            }
          }
        }

        return {
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount || 0,
          other_participant: otherParticipant,
        } as GolfConversationWithMeta;
      })
    );

    setConversations(conversationsWithMeta);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();

    // Set up real-time subscription for new messages
    if (user) {
      const channel = supabase
        .channel('golf-conversations')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          () => {
            fetchConversations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}
