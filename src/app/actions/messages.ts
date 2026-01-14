'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  formatSafeErrorResponse,
  logSecurityEvent,
  sanitizeHtml
} from '@/lib/validation/server-action-validator';
import { MessageSchemas } from '@/lib/validation/action-schemas';

type Sport = 'baseball' | 'golf';

interface SendMessageOptions {
  conversationId: string;
  content: string;
  sport?: Sport;
  createNotifications?: boolean;
}

/**
 * Send a message in a conversation
 * @param conversationId - The conversation ID
 * @param content - The message content
 * @param sport - The sport context (for revalidation paths)
 * @param createNotifications - Whether to create notifications for other participants (default: true)
 */
export async function sendMessage({
  conversationId,
  content,
  sport = 'baseball',
  createNotifications = true,
}: SendMessageOptions) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Validate input with centralized schema
    const validatedData = MessageSchemas.send.parse({
      conversation_id: conversationId,
      content
    });

    // Sanitize content to prevent XSS
    const sanitizedContent = sanitizeHtml(validatedData.content);

    // Verify user is a participant in this conversation
    // Use sport-specific table names (baseball_conversation_participants or golf_conversation_participants)
    const participantsTable = sport === 'golf' ? 'golf_conversation_participants' : 'baseball_conversation_participants';
    const { data: participant, error: participantError } = await supabase
      .from(participantsTable)
      .select('id')
      .eq('conversation_id', validatedData.conversation_id)
      .eq('user_id', user.id)
      .single();

    if (!participant) {
      console.warn('[Security] Unauthorized message attempt:', {
        userId: user.id,
        conversationId: validatedData.conversation_id,
        participantError: participantError?.message
      });
      throw new Error('Not a participant in this conversation');
    }

    // Log security event
    await logSecurityEvent({
      event: 'message_sent',
      action: 'message_sent',
      userId: user.id,
      metadata: { conversationId: validatedData.conversation_id, contentLength: sanitizedContent.length },
    });

    // Insert message
    const messagesTable = sport === 'golf' ? 'golf_messages' : 'baseball_messages';
    const { data: insertedMessage, error: messageError } = await supabase
      .from(messagesTable)
      .insert({
        conversation_id: validatedData.conversation_id,
        sender_id: user.id,
        content: sanitizedContent,
        sent_at: new Date().toISOString(),
        read: false,
      })
      .select()
      .single();

    if (messageError) {
      console.error('[Security] Message insert failed:', {
        userId: user.id,
        conversationId: validatedData.conversation_id,
        error: messageError.message,
        code: messageError.code,
        details: messageError.details,
        hint: messageError.hint
      });
      throw new Error(`Failed to send message: ${messageError.message}`);
    }

    if (!insertedMessage) {
      console.error('[Security] Message insert succeeded but no data returned:', { userId: user.id, conversationId: validatedData.conversation_id });
      throw new Error('Failed to send message: No data returned');
    }

    // Update conversation updated_at
    const conversationsTable = sport === 'golf' ? 'golf_conversations' : 'baseball_conversations';
    await supabase
      .from(conversationsTable)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', validatedData.conversation_id);

    // Create notifications for other participants (if enabled)
    if (createNotifications) {
      const { data: otherParticipants } = await supabase
        .from(participantsTable)
        .select('user_id')
        .eq('conversation_id', validatedData.conversation_id)
        .neq('user_id', user.id);

      if (otherParticipants && otherParticipants.length > 0) {
        // Use sanitized content for notification preview
        const notificationBody = sanitizedContent.length > 50
          ? sanitizedContent.substring(0, 50) + '...'
          : sanitizedContent;

        const notifications = otherParticipants.map(p => ({
          user_id: p.user_id,
          type: 'message' as const,
          title: 'New Message',
          body: notificationBody,
          read: false,
          created_at: new Date().toISOString(),
        }));

        await supabase
          .from('notifications')
          .insert(notifications);
      }
    }

    // NOTE: Removed revalidatePath calls - messages page uses real-time subscriptions
    // Revalidation was causing unnecessary page reloads on every message send

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

interface CreateConversationOptions {
  participantUserIds: string[];
  sport?: Sport;
}

/**
 * Create a new conversation or return existing one
 * @param participantUserIds - Array of user IDs to include in conversation
 * @param sport - The sport context (for revalidation paths)
 */
export async function createConversation({
  participantUserIds,
  sport = 'baseball',
}: CreateConversationOptions) {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Check if conversation already exists between these users
  // Optimized: Single query instead of N+1 pattern
  const participantsTable = sport === 'golf' ? 'golf_conversation_participants' : 'baseball_conversation_participants';
  if (participantUserIds.length === 1 && participantUserIds[0]) {
    const otherUserId = participantUserIds[0];

    // Get all conversation IDs where current user participates
    const { data: myConversations } = await supabase
      .from(participantsTable)
      .select('conversation_id')
      .eq('user_id', user.id);

    if (myConversations && myConversations.length > 0) {
      const conversationIds = myConversations.map(c => c.conversation_id);

      // Find conversations where the other user also participates (single query)
      const { data: sharedConversations } = await supabase
        .from(participantsTable)
        .select('conversation_id')
        .eq('user_id', otherUserId)
        .in('conversation_id', conversationIds)
        .limit(1);

      if (sharedConversations && sharedConversations.length > 0 && sharedConversations[0]) {
        // Found existing conversation
        return { conversationId: sharedConversations[0].conversation_id };
      }
    }
  }

  // Create new conversation using SECURITY DEFINER function (bypasses RLS issues)
  const { data: conversationId, error: convError } = await supabase.rpc('create_conversation_with_participants', {
    participant_user_ids: participantUserIds,
  }) as {
    data: string | null;
    error: { message?: string; code?: string; details?: string; hint?: string } | null;
  };

  if (convError || !conversationId) {
    console.error('[Security] Conversation create error:', {
      error: convError?.message,
      code: convError?.code,
      details: convError?.details,
      hint: convError?.hint,
      userId: user.id,
      participantUserIds,
    });
    throw new Error(`Failed to create conversation: ${convError?.message || 'Unknown error'}`);
  }

  revalidatePath(`/${sport}/dashboard/messages`);

  return { conversationId };
}

interface MarkMessagesAsReadOptions {
  conversationId: string;
  sport?: Sport;
}

/**
 * Mark all messages in a conversation as read
 * @param conversationId - The conversation ID
 * @param sport - The sport context (for revalidation paths)
 */
export async function markMessagesAsRead({
  conversationId,
  sport = 'baseball',
}: MarkMessagesAsReadOptions) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // Update last_read_at for this participant
  const participantsTable = sport === 'golf' ? 'golf_conversation_participants' : 'baseball_conversation_participants';
  const { error: participantError } = await supabase
    .from(participantsTable)
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  if (participantError) {
    console.error('[Messages] Failed to update last_read_at:', participantError);
    throw new Error('Failed to mark messages as read');
  }

  // Mark all messages in this conversation as read
  const messagesTable = sport === 'golf' ? 'golf_messages' : 'baseball_messages';
  const { error: messagesError } = await supabase
    .from(messagesTable)
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id);

  if (messagesError) {
    console.error('[Messages] Failed to mark messages as read:', messagesError);
    throw new Error('Failed to mark messages as read');
  }

  revalidatePath(`/${sport}/dashboard/messages/${conversationId}`);
  revalidatePath(`/${sport}/dashboard/messages`);

  return { success: true };
}

// ============================================================================
// Legacy Compatibility Exports (maintain existing API)
// ============================================================================

// Baseball-specific exports (maintain existing function signatures)
export async function sendBaseballMessage(conversationId: string, content: string) {
  return sendMessage({ conversationId, content, sport: 'baseball', createNotifications: true });
}

export async function createBaseballConversation(participantUserIds: string[]) {
  return createConversation({ participantUserIds, sport: 'baseball' });
}

export async function markBaseballMessagesAsRead(conversationId: string) {
  return markMessagesAsRead({ conversationId, sport: 'baseball' });
}

// Golf-specific exports (maintain existing function signatures)
export async function sendGolfMessage(conversationId: string, content: string) {
  return sendMessage({ conversationId, content, sport: 'golf', createNotifications: false });
}

export async function createGolfConversation(participantUserIds: string[]) {
  return createConversation({ participantUserIds, sport: 'golf' });
}

export async function markGolfMessagesAsRead(conversationId: string) {
  return markMessagesAsRead({ conversationId, sport: 'golf' });
}
