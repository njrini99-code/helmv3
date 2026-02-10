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
    // Use explicit columns instead of SELECT * for better performance
    const { data } = await supabase
      .from('baseball_messages')
      .select('id, conversation_id, sender_id, content, read, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    setMessages((data || []) as Message[]);
    setLoading(false);

    // Mark messages as read
    markMessagesAsRead(conversationId);
  }, [conversationId, supabase]);

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
          table: 'baseball_messages',
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
  }, [conversationId, fetchMessages, supabase]);

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

    // Use optimized DB function - single query replaces N+1 pattern (was 30+ queries)
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
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawData, error } = await (supabase.rpc as any)(
      'get_baseball_conversations_with_details',
      { p_user_id: user.id }
    );
    const conversationsData = rawData as ConversationRow[] | null;

    if (error) {
      console.error('Error fetching conversations:', error);
      setConversations([]);
      setLoading(false);
      return;
    }

    if (!conversationsData || conversationsData.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // We need to fetch the other user details for display (coach/player info)
    // Get unique participant IDs (excluding current user)
    const otherUserIds = new Set<string>();
    conversationsData.forEach((conv: { participant_ids: string[] }) => {
      conv.participant_ids?.forEach((id: string) => {
        if (id !== user.id) otherUserIds.add(id);
      });
    });

    // Batch fetch user details (single query for all users)
    const { data: usersData } = await supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        baseball_coaches (
          id,
          full_name,
          avatar_url,
          coach_type,
          organization:organizations(name)
        ),
        baseball_players (
          id,
          first_name,
          last_name,
          primary_position,
          grad_year,
          avatar_url
        )
      `)
      .in('id', Array.from(otherUserIds));

    // Define user detail type for the map
    interface UserDetail {
      id: string;
      email: string | null;
      role: string;
      baseball_coaches: {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
        coach_type: string | null;
        organization?: { name: string | null } | null;
      } | null;
      baseball_players: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        primary_position: string | null;
        grad_year: number | null;
        avatar_url: string | null;
      } | null;
    }

    // Create a lookup map for user details
    const userDetailsMap = new Map<string, UserDetail>(
      (usersData || []).map((u: UserDetail) => [u.id, u])
    );

    // Transform to ConversationWithMeta format
    const transformedConversations = conversationsData.map((conv: {
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
    }) => {
      // Find the other user in this conversation
      const otherUserId = conv.participant_ids?.find((id: string) => id !== user.id);
      const otherUser = otherUserId ? userDetailsMap.get(otherUserId) : null;

      return {
        id: conv.id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        creator_id: conv.creator_id,
        // Required by Conversation base type - defaults for DM conversations
        created_by: conv.creator_id || '',
        is_team_chat: false,
        team_id: null,
        title: null,
        last_message: conv.last_message_content ? {
          content: conv.last_message_content,
          sent_at: conv.last_message_at,
          sender_id: conv.last_message_sender_id || '',
        } : null,
        unread_count: conv.unread_count || 0,
        other_user: otherUser ? {
          id: otherUser.id,
          email: otherUser.email,
          coach: otherUser.baseball_coaches,
          player: otherUser.baseball_players,
        } : null,
      };
    });

    setConversations(transformedConversations as unknown as ConversationWithMeta[]);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    fetchConversations();

    // Set up real-time subscription for new messages
    if (user) {
      const channel = supabase
        .channel('baseball_conversations')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'baseball_messages',
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
    return undefined;
  }, [user, fetchConversations, supabase]);

  return { conversations, loading, refetch: fetchConversations };
}
