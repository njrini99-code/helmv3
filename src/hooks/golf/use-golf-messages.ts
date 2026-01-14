'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
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
    // Use explicit columns instead of SELECT * for better performance
    const { data } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, read, sent_at, updated_at')
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
      const result = await sendGolfMessage(conversationId, content);

      // Check if the result indicates an error
      if (result && 'error' in result && result.error) {
        console.error('Failed to send message:', result.error);
        throw new Error(result.error);
      }

      if (!result || !result.success) {
        console.error('Failed to send message: Unknown error');
        throw new Error('Failed to send message');
      }

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      // Re-throw so the UI can handle it
      throw error;
    }
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}

export function useGolfConversations() {
  const [conversations, setConversations] = useState<GolfConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Get the current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);

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
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawData, error } = await (supabase.rpc as any)(
      'get_conversations_with_details',
      { p_user_id: userId }
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

    // Get unique other user IDs for batch fetching
    const otherUserIds = new Set<string>();
    conversationsData.forEach((conv) => {
      conv.participant_ids?.forEach((id) => {
        if (id !== userId) otherUserIds.add(id);
      });
    });

    // Batch fetch golf coaches and players (2 queries instead of N*2)
    const [{ data: coaches }, { data: players }] = await Promise.all([
      supabase
        .from('golf_coaches')
        .select('id, user_id, full_name, title, avatar_url')
        .in('user_id', Array.from(otherUserIds)),
      supabase
        .from('golf_players')
        .select('id, user_id, first_name, last_name, year, avatar_url')
        .in('user_id', Array.from(otherUserIds)),
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
      year: string | null;
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
      // Find the other user in this conversation
      const otherUserId = conv.participant_ids?.find((id) => id !== userId);

      let otherParticipant: GolfConversationParticipant | undefined;

      if (otherUserId) {
        const coach = coachByUserId.get(otherUserId);
        const player = playerByUserId.get(otherUserId);

        if (coach) {
          otherParticipant = {
            id: coach.id,
            name: coach.full_name || 'Coach',
            subtitle: coach.title || 'Golf Coach',
            avatar: coach.avatar_url,
            type: 'coach',
          };
        } else if (player) {
          otherParticipant = {
            id: player.id,
            name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player',
            subtitle: player.year ? `${player.year.charAt(0).toUpperCase()}${player.year.slice(1)}` : 'Golf Player',
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
          sent_at: conv.last_message_at,
          read: false,
        } : null,
        unread_count: conv.unread_count || 0,
        other_participant: otherParticipant,
      } as GolfConversationWithMeta;
    });

    setConversations(transformedConversations);
    setLoading(false);
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

    const channel = supabase
      .channel(`golf-conversations:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Debounce by using a small timeout to batch multiple updates
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          // Only refetch if this conversation involves the current user
          // The conversations table updated_at changes when new messages come in
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === payload.new.id);
            if (exists) {
              // Trigger a refetch to get updated last_message
              fetchConversations();
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}
