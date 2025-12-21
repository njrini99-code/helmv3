'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { sendMessage as sendMessageAction, markMessagesAsRead } from '@/app/baseball/actions/messages';
import type { Message } from '@/lib/types';
import type { ConversationWithMeta } from '@/lib/types/messages';

export function useMessages(conversationId: string) {
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
    markMessagesAsRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    // Set up real-time subscription
    const channel = supabase
      .channel(`conversation:${conversationId}`)
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
      await sendMessageAction(conversationId, content);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
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

    // Fetch conversations with participants and last message
    const { data: conversationsData } = await supabase
      .from('conversations')
      .select(`
        *,
        conversation_participants!inner (
          user_id,
          users (
            id,
            email,
            role,
            coaches (
              id,
              full_name,
              school_name,
              avatar_url
            ),
            players (
              id,
              first_name,
              last_name,
              primary_position,
              grad_year,
              avatar_url
            )
          )
        )
      `)
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });

    if (!conversationsData) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Fetch last message for each conversation
    const conversationsWithMessages = await Promise.all(
      conversationsData.map(async (conv) => {
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

        // Find the other user in the conversation
        const participants = Array.isArray(conv.conversation_participants)
          ? conv.conversation_participants
          : [conv.conversation_participants];

        const otherParticipant = participants.find(
          (p: any) => p.user_id !== user.id
        );

        return {
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount || 0,
          other_user: otherParticipant?.users,
        };
      })
    );

    setConversations(conversationsWithMessages as ConversationWithMeta[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConversations();

    // Set up real-time subscription for new messages
    if (user) {
      const channel = supabase
        .channel('conversations')
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
