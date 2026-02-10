'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/lib/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseMessagesSubscriptionOptions {
  conversationId: string;
  initialMessages?: Message[];
  onNewMessage?: (message: Message) => void;
  onUpdateMessage?: (message: Message) => void;
  onDeleteMessage?: (messageId: string) => void;
}

export function useMessagesSubscription({
  conversationId,
  initialMessages = [],
  onNewMessage,
  onUpdateMessage,
  onDeleteMessage,
}: UseMessagesSubscriptionOptions) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const supabase = createClient();

  // Load initial messages
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    } else {
      loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally only re-run when conversationId changes; initialMessages and loadMessages are used for the initial load only
  }, [conversationId]);

  // Load messages from database
  const loadMessages = async (limit = 50) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('baseball_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (fetchError) throw fetchError;

      setMessages(data || []);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load more messages (for pagination)
  const loadMoreMessages = async (beforeMessageId: string, limit = 25) => {
    setLoading(true);

    try {
      const oldestMessage = messages.find((m) => m.id === beforeMessageId);
      if (!oldestMessage || !oldestMessage.created_at) return;

      const { data, error: fetchError } = await supabase
        .from('baseball_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .lt('created_at', oldestMessage.created_at)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        // Reverse to maintain chronological order
        const olderMessages = data.reverse();
        setMessages((prev) => [...olderMessages, ...prev]);
      }
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load more messages:', err);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to real-time message changes
  useEffect(() => {
    const channel = supabase
      .channel(`baseball_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'baseball_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const newMessage = payload.new as Message;

          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });

          if (onNewMessage) {
            onNewMessage(newMessage);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'baseball_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const updatedMessage = payload.new as Message;

          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m))
          );

          if (onUpdateMessage) {
            onUpdateMessage(updatedMessage);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'baseball_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const deletedMessage = payload.old as Message;

          setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));

          if (onDeleteMessage) {
            onDeleteMessage(deletedMessage.id);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId, onNewMessage, onUpdateMessage, onDeleteMessage, supabase]);

  // Send a new message
  const sendMessage = async (
    content: string,
    senderId: string
  ): Promise<Message | null> => {
    try {
      const { data, error: insertError } = await supabase
        .from('baseball_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return data as Message;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to send message:', err);
      return null;
    }
  };

  // Delete a message (hard delete, not soft delete since schema doesn't support it)
  const deleteMessage = async (messageId: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('baseball_messages')
        .delete()
        .eq('id', messageId);

      if (deleteError) throw deleteError;

      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to delete message:', err);
      return false;
    }
  };

  // Mark message as read
  const markAsRead = async (messageId: string): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from('baseball_messages')
        .update({ read: true })
        .eq('id', messageId);

      if (updateError) throw updateError;

      return true;
    } catch (err) {
      setError(err as Error);
      console.error('Failed to mark message as read:', err);
      return false;
    }
  };

  return {
    messages,
    loading,
    error,
    loadMessages,
    loadMoreMessages,
    sendMessage,
    deleteMessage,
    markAsRead,
  };
}
