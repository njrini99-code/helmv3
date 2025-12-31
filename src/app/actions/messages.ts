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
    const { data: participant } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', validatedData.conversation_id)
      .eq('user_id', user.id)
      .single();

    if (!participant) {
      console.warn('[Security] Unauthorized message attempt:', { userId: user.id, conversationId: validatedData.conversation_id });
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
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: validatedData.conversation_id,
        sender_id: user.id,
        content: sanitizedContent,
        sent_at: new Date().toISOString(),
        read: false,
      });

    if (messageError) {
      console.error('[Security] Message insert failed:', { userId: user.id, conversationId: validatedData.conversation_id, error: messageError.message });
      throw new Error('Failed to send message');
    }

    // Update conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', validatedData.conversation_id);

    // Create notifications for other participants (if enabled)
    if (createNotifications) {
      const { data: otherParticipants } = await supabase
        .from('conversation_participants')
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
          type: 'new_message',
          title: 'New Message',
          body: notificationBody,
          action_url: `/${sport}/dashboard/messages/${validatedData.conversation_id}`,
          read: false,
          created_at: new Date().toISOString(),
        }));

        await supabase
          .from('notifications')
          .insert(notifications);
      }
    }

    // Revalidate paths
    revalidatePath(`/${sport}/dashboard/messages/${validatedData.conversation_id}`);
    revalidatePath(`/${sport}/dashboard/messages`);

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
  if (participantUserIds.length === 1 && participantUserIds[0]) {
    // One-on-one conversation
    const otherUserId = participantUserIds[0];

    // Find existing conversation
    const { data: existingParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, conversations!inner(*)')
      .eq('user_id', user.id);

    if (existingParticipants) {
      for (const p of existingParticipants) {
        // Check if other user is also in this conversation
        const { data: otherInConv } = await supabase
          .from('conversation_participants')
          .select('id')
          .eq('conversation_id', p.conversation_id)
          .eq('user_id', otherUserId)
          .single();

        if (otherInConv) {
          // Found existing conversation
          return { conversationId: p.conversation_id };
        }
      }
    }
  }

  // Create new conversation
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (convError || !conversation) {
    console.error('Conversation create error:', convError);
    throw new Error('Failed to create conversation');
  }

  // Add all participants (including creator)
  const allParticipants = [user.id, ...participantUserIds];
  const participants = allParticipants.map(userId => ({
    conversation_id: conversation.id,
    user_id: userId,
    last_read_at: new Date().toISOString(),
  }));

  const { error: participantsError } = await supabase
    .from('conversation_participants')
    .insert(participants);

  if (participantsError) {
    console.error('Participants insert error:', participantsError);
    throw new Error('Failed to add participants');
  }

  revalidatePath(`/${sport}/dashboard/messages`);

  return { conversationId: conversation.id };
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
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  // Mark all messages in this conversation as read
  await supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id);

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
