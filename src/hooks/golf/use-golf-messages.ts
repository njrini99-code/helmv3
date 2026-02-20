'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendGolfMessage, markGolfMessagesAsRead, updateGolfMessage, deleteGolfMessage } from '@/app/golf/actions/messages';
import type { GolfMessageRow } from '@/lib/types';

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

export function useGolfMessages(conversationId: string) {
  const [messages, setMessages] = useState<MessageWithReadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [otherParticipantLastReadAt, setOtherParticipantLastReadAt] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingBroadcastRef = useRef<number>(0);
  const supabase = createClient();

  // Get current user ID on mount
  useEffect(() => {
    let mounted = true;
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && mounted) {
        setCurrentUserId(user.id);
      }
    };
    getUser();
    return () => {
      mounted = false;
    };
  }, [supabase.auth]);

  // Fetch other participant's last_read_at for read receipts
  const fetchOtherParticipantReadStatus = useCallback(async () => {
    if (!conversationId || !currentUserId) return;

    const { data: participants } = await supabase
      .from('golf_conversation_participants')
      .select('user_id, last_read_at')
      .eq('conversation_id', conversationId);

    if (participants) {
      const otherParticipant = participants.find(p => p.user_id !== currentUserId);
      if (otherParticipant) {
        setOtherParticipantLastReadAt(otherParticipant.last_read_at);
      }
    }
  }, [conversationId, currentUserId, supabase]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Fetch most recent 200 messages (descending for limit), then reverse for display order
    const { data } = await supabase
      .from('golf_messages')
      .select('id, conversation_id, sender_id, content, read, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200);

    setMessages(((data || []) as MessageWithReadStatus[]).reverse());
    setLoading(false);

    // Mark messages as read
    markGolfMessagesAsRead(conversationId);

    // Fetch read receipt status
    fetchOtherParticipantReadStatus();
  }, [conversationId, fetchOtherParticipantReadStatus, supabase]);

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

    // Set up real-time subscription for messages and typing
    const channel = supabase
      .channel(`golf-conversation:${conversationId}`)
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
          setMessages(prev => {
            // Replace optimistic message if this is our own message arriving via realtime
            if (newMessage.sender_id === currentUserId) {
              const optimisticIdx = prev.findIndex(m => m.id.startsWith('optimistic-') && m.sender_id === currentUserId);
              if (optimisticIdx !== -1) {
                const updated = [...prev];
                updated[optimisticIdx] = newMessage;
                return updated;
              }
            }
            // Avoid duplicates (message already exists by ID)
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
          // Clear typing indicator when message is received
          if (newMessage.sender_id !== currentUserId) {
            setIsOtherTyping(false);
          }
        }
      )
      // Listen for message updates
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
          setMessages(prev =>
            prev.map(msg =>
              msg.id === updatedMessage.id
                ? { ...msg, content: updatedMessage.content }
                : msg
            )
          );
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
          if (updated.user_id !== currentUserId && updated.last_read_at) {
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
          if (userId !== currentUserId) {
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
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, fetchMessages, currentUserId, supabase]);

  // Function to broadcast typing status (debounced to avoid spam)
  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!conversationId || !currentUserId) return;

    const now = Date.now();
    // Throttle typing broadcasts to once every 500ms
    if (isTyping && now - lastTypingBroadcastRef.current < 500) return;
    lastTypingBroadcastRef.current = now;

    const channel = supabase.channel(`golf-conversation:${conversationId}`);
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUserId, isTyping },
    });
  }, [conversationId, currentUserId, supabase]);

  const sendMessage = async (content: string) => {
    // Clear typing indicator when sending
    sendTypingStatus(false);

    // Optimistic update: add message to UI immediately
    const optimisticId = `optimistic-${Date.now()}`;
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
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const result = await sendGolfMessage(conversationId, content);

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
      throw error;
    }
  };

  // Edit a message
  const editMessage = async (messageId: string, newContent: string) => {
    const result = await updateGolfMessage(messageId, newContent);

    if (result && 'error' in result && result.error) {
      throw new Error(result.error);
    }

    if (!result || !result.success) {
      throw new Error('Failed to edit message');
    }

    return true;
  };

  // Delete a message
  const removeMessage = async (messageId: string) => {
    const result = await deleteGolfMessage(messageId);

    if (result && 'error' in result && result.error) {
      throw new Error(result.error);
    }

    if (!result || !result.success) {
      throw new Error('Failed to delete message');
    }

    return true;
  };

  return {
    messages,
    loading,
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
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();
  const conversationIdsRef = useRef<Set<string>>(new Set());

  // Get the current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, [supabase.auth]);

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
      is_group?: boolean;
      title?: string | null;
      participant_count?: number;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawData, error } = await (supabase.rpc as any)(
      'get_golf_conversations_with_details',
      { p_user_id: userId }
    );
    let conversationsData = rawData as ConversationRow[] | null;

    // Also fetch team chat conversations directly (in case DB function doesn't include them)
    const { data: groupConvs } = await supabase
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

        if (conv && conv.is_team_chat && !existingIds.has(conv.id)) {
          teamChats.push(conv);
        }
      }

      // Batch fetch all group chat metadata in parallel (instead of N+1 per chat)
      if (teamChats.length > 0) {
        const teamChatIds = teamChats.map(c => c.id);

        const [participantCounts, lastMessages, userParticipantData] = await Promise.all([
          // Participant counts for all group chats
          supabase
            .from('golf_conversation_participants')
            .select('conversation_id')
            .in('conversation_id', teamChatIds),
          // Last messages for all group chats
          supabase
            .from('golf_messages')
            .select('conversation_id, content, created_at, sender_id')
            .in('conversation_id', teamChatIds)
            .order('created_at', { ascending: false }),
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

        const lastMsgByConv = new Map<string, { content: string | null; created_at: string | null; sender_id: string }>();
        (lastMessages.data || []).forEach(m => {
          if (!lastMsgByConv.has(m.conversation_id)) {
            lastMsgByConv.set(m.conversation_id, { content: m.content, created_at: m.created_at, sender_id: m.sender_id });
          }
        });

        const lastReadByConv = new Map<string, string | null>();
        (userParticipantData.data || []).forEach(p => {
          lastReadByConv.set(p.conversation_id, p.last_read_at);
        });

        // Batch fetch unread counts — get all messages from others in these conversations
        const { data: allOtherMessages } = await supabase
          .from('golf_messages')
          .select('conversation_id, created_at')
          .in('conversation_id', teamChatIds)
          .neq('sender_id', userId);

        const otherMsgsByConv = new Map<string, Array<{ created_at: string | null }>>();
        (allOtherMessages || []).forEach(m => {
          if (!otherMsgsByConv.has(m.conversation_id)) {
            otherMsgsByConv.set(m.conversation_id, []);
          }
          otherMsgsByConv.get(m.conversation_id)!.push({ created_at: m.created_at });
        });

        for (const conv of teamChats) {
          const lastMsg = lastMsgByConv.get(conv.id);
          const lastReadAt = lastReadByConv.get(conv.id);
          const otherMsgs = otherMsgsByConv.get(conv.id) || [];

          let unreadCount = 0;
          if (lastReadAt) {
            unreadCount = otherMsgs.filter(m => m.created_at && m.created_at > lastReadAt).length;
          } else if (lastMsg) {
            unreadCount = otherMsgs.length;
          }

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

    if (error && !conversationsData?.length) {
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
  }, [userId, supabase]);

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
          table: 'golf_conversation_participants',
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
          table: 'golf_conversations',
        },
        (payload) => {
          // Only refetch if this conversation involves the current user
          // Use ref to avoid stale closure and async side effects in state updater
          if (conversationIdsRef.current.has(payload.new.id as string)) {
            fetchConversations();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations, supabase]);

  return { conversations, loading, refetch: fetchConversations };
}
