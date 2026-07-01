'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { sendMessage as sendMessageAction, markMessagesAsRead } from '@/app/baseball/actions/messages';
import type { Message } from '@/lib/types';
import type { ConversationWithMeta } from '@/lib/types/messages';

export function useMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef at line 13). Adding it would noise the dep array without changing behavior.
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
          table: 'baseball_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        }
      )
      // Read-receipt updates (#455): when the recipient opens this thread,
      // markMessagesAsRead flips `read=true` on our sent messages. Reflect
      // that here so the single-check -> double-check upgrade happens live
      // instead of requiring a full reload.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'baseball_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages(prev => prev.map(m => (
            m.id === updatedMessage.id ? { ...m, read: updatedMessage.read } : m
          )));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef at line 13). Adding it would noise the dep array without changing behavior.
  }, [conversationId, fetchMessages]);

  const sendMessage = async (content: string) => {
    try {
      const result = await sendMessageAction(conversationId, content);
      // The server action never throws on failure -- it catches everything
      // internally and returns `{ success: false, error }` (formatSafeErrorResponse).
      // Without this check a rejected send (auth, validation, not-a-participant)
      // was reported as sent: the input cleared and no error surfaced (#450).
      if (!result.success) {
        console.error('Error sending message:', 'error' in result ? result.error : 'Unknown error');
        return false;
      }
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
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the current user's known conversation IDs so the
  // baseball_conversations UPDATE listener (below) can ignore rows that
  // belong to other users' conversations without a server-side filter.
  const conversationIdsRef = useRef<Set<string>>(new Set());

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

    // Batch fetch user details (single query for all users).
    // Players stay embedded; coaches are fetched separately from the
    // baseball_coaches_public view (non-PII columns only) so they remain
    // resolvable after baseball_coaches RLS is narrowed to self-or-teammate.
    const otherUserIdList = Array.from(otherUserIds);
    const { data: usersData } = await supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        baseball_players (
          id,
          first_name,
          last_name,
          primary_position,
          grad_year,
          avatar_url
        )
      `)
      .in('id', otherUserIdList);

    // Coaches: two-step fetch via the public view + org names, keyed by user_id
    // (avoids depending on reverse view-embedding through the users table).
    const { data: coachesData } = await supabase
      .from('baseball_coaches_public')
      .select('id, user_id, full_name, avatar_url, coach_type, organization_id')
      .in('user_id', otherUserIdList);

    const coachOrgIds = Array.from(
      new Set(
        (coachesData || [])
          .map((c) => c.organization_id)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const orgNameById = new Map<string, string | null>();
    if (coachOrgIds.length) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', coachOrgIds);
      (orgs || []).forEach((o) => orgNameById.set(o.id, o.name));
    }

    const coachByUserId = new Map<string, UserDetail['baseball_coaches']>();
    (coachesData || []).forEach((c) => {
      if (!c.id || !c.user_id) return;
      coachByUserId.set(c.user_id, {
        id: c.id,
        full_name: c.full_name,
        avatar_url: c.avatar_url,
        coach_type: c.coach_type,
        organization: c.organization_id
          ? { name: orgNameById.get(c.organization_id) ?? null }
          : null,
      });
    });

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

    // Create a lookup map for user details, merging in coach data from the
    // public-view fetch above (coaches are no longer embedded in usersData).
    const userDetailsMap = new Map<string, UserDetail>(
      (usersData || []).map((u) => [
        u.id,
        {
          id: u.id,
          email: u.email,
          role: u.role,
          baseball_coaches: coachByUserId.get(u.id) ?? null,
          baseball_players: u.baseball_players,
        },
      ])
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
    conversationIdsRef.current = new Set(conversationsData.map((c) => c.id));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef at line 79). Adding it would noise the dep array without changing behavior.
  }, [user]);

  useEffect(() => {
    fetchConversations();

    // Set up real-time subscription for new messages and read-state changes
    if (user) {
      // Debounced refetch: markMessagesAsRead can flip `read=true` on many
      // rows at once (opening a busy thread), which fires one UPDATE event
      // per row -- batch those into a single refetch instead of a stampede.
      const debouncedFetch = () => {
        if (fetchDebounceRef.current) {
          clearTimeout(fetchDebounceRef.current);
        }
        fetchDebounceRef.current = setTimeout(() => {
          fetchConversations();
        }, 300);
      };

      // OPTIMIZED (#451): subscribe to baseball_conversation_participants
      // filtered by user_id instead of ALL rows of baseball_messages. The old
      // unfiltered `event: '*'` on baseball_messages fired a refetch for every
      // message in every conversation, platform-wide, for every connected
      // user -- the exact anti-pattern already fixed on the golf side (see
      // src/hooks/golf/use-golf-messages.ts useGolfConversations). Opening a
      // thread writes last_read_at on THIS participant row
      // (markMessagesAsRead in src/app/actions/messages.ts), which clears the
      // viewer's own unread badge without ever touching another user's rows.
      const channel = supabase
        .channel(`baseball_conversations:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'baseball_conversation_participants',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            debouncedFetch();
          }
        )
        // sendMessage() (src/app/actions/messages.ts) bumps
        // baseball_conversations.updated_at on every new message but does NOT
        // touch the recipient's participant row, so the listener above alone
        // would miss "someone sent me a message" for conversations the viewer
        // isn't currently reading. This table has no user_id column to filter
        // on server-side, so -- same as golf's useGolfConversations -- accept
        // the unfiltered UPDATE stream and discard rows outside the viewer's
        // own conversations client-side via conversationIdsRef.
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'baseball_conversations',
          },
          (payload) => {
            if (conversationIdsRef.current.has(payload.new.id as string)) {
              debouncedFetch();
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
        if (fetchDebounceRef.current) {
          clearTimeout(fetchDebounceRef.current);
        }
      };
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `supabase` is stable across renders (useRef at line 79). Adding it would noise the dep array without changing behavior.
  }, [user, fetchConversations]);

  return { conversations, loading, refetch: fetchConversations };
}
