/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses 'as any' casts for dynamic table names (baseball_* vs golf_* tables)
// because Supabase types can't infer types from dynamic table name strings.
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

// Supabase error type for type-safe error handling
interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

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
    const participantsTable = sport === 'golf' ? 'golf_conversation_participants' : 'baseball_conversation_participants';
    const { data: participant, error: participantError } = await (supabase
      .from(participantsTable as any) as any)
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
      .from(messagesTable as any)
      .insert({
        conversation_id: validatedData.conversation_id,
        sender_id: user.id,
        content: sanitizedContent,
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
      .from(conversationsTable as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', validatedData.conversation_id);

    // Create notifications for other participants (if enabled)
    if (createNotifications) {
      const { data: otherParticipants } = await supabase
        .from(participantsTable as any)
        .select('user_id')
        .eq('conversation_id', validatedData.conversation_id)
        .neq('user_id', user.id) as { data: { user_id: string }[] | null };

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
  teamId?: string; // Required for golf conversations
}

/**
 * Create a new conversation or return existing one
 * @param participantUserIds - Array of user IDs to include in conversation
 * @param sport - The sport context (for revalidation paths)
 * @param teamId - Team ID (required for golf conversations)
 */
export async function createConversation({
  participantUserIds,
  sport = 'baseball',
  teamId,
}: CreateConversationOptions) {
  console.log('[createConversation] Called with:', { participantUserIds, sport, teamId });

  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  console.log('[createConversation] Current user:', user?.id);
  if (!user) {
    console.error('[createConversation] No authenticated user');
    throw new Error('Unauthorized');
  }

  // Check if conversation already exists between these users
  // Optimized: Single query instead of N+1 pattern
  const participantsTable = sport === 'golf' ? 'golf_conversation_participants' : 'baseball_conversation_participants';
  if (participantUserIds.length === 1 && participantUserIds[0]) {
    const otherUserId = participantUserIds[0];

    // Get all conversation IDs where current user participates
    const { data: myConversations } = await supabase
      .from(participantsTable as any)
      .select('conversation_id')
      .eq('user_id', user.id) as { data: { conversation_id: string }[] | null };

    if (myConversations && myConversations.length > 0) {
      const conversationIds = myConversations.map(c => c.conversation_id);

      // Find conversations where the other user also participates (single query)
      const { data: sharedConversations } = await supabase
        .from(participantsTable as any)
        .select('conversation_id')
        .eq('user_id', otherUserId)
        .in('conversation_id', conversationIds)
        .limit(1) as { data: { conversation_id: string }[] | null };

      if (sharedConversations && sharedConversations.length > 0 && sharedConversations[0]) {
        // Found existing conversation
        console.log('[createConversation] Found existing conversation:', sharedConversations[0].conversation_id);
        return { conversationId: sharedConversations[0].conversation_id };
      }
    }
  }

  // Create new conversation
  console.log('[createConversation] Creating new conversation...');
  const conversationsTable = sport === 'golf' ? 'golf_conversations' : 'baseball_conversations';

  // Build insert data - golf requires team_id
  const insertData: Record<string, unknown> = {
    created_by: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Golf conversations require team_id
  if (sport === 'golf') {
    if (!teamId) {
      console.error('[createConversation] Missing teamId for golf conversation');
      throw new Error('Team ID is required for golf conversations');
    }
    insertData.team_id = teamId;
  }

  console.log('[createConversation] Insert data:', insertData);
  console.log('[createConversation] Table:', conversationsTable);

  const { data: newConversation, error: convError } = await supabase
    .from(conversationsTable as any)
    .insert(insertData)
    .select('id')
    .single() as { data: { id: string } | null; error: SupabaseError | null };

  console.log('[createConversation] Insert result:', { newConversation, convError });

  if (convError || !newConversation) {
    console.error('[createConversation] Conversation create error:', {
      error: convError?.message,
      code: convError?.code,
      details: convError?.details,
      hint: convError?.hint,
      userId: user.id,
      participantUserIds,
      insertData,
    });
    throw new Error(`Failed to create conversation: ${convError?.message || 'Unknown error'}`);
  }

  const conversationId = newConversation.id;
  console.log('[createConversation] Conversation created with id:', conversationId);

  // Add all participants (including current user)
  const allParticipantIds = [...new Set([user.id, ...participantUserIds].filter(Boolean))];
  const participantInserts = allParticipantIds.map(userId => ({
    conversation_id: conversationId,
    user_id: userId,
    joined_at: new Date().toISOString(),
  }));

  console.log('[createConversation] Adding participants:', participantInserts);

  const { error: participantsError } = await supabase
    .from(participantsTable as any)
    .insert(participantInserts);

  if (participantsError) {
    console.error('[createConversation] Participants insert error:', {
      error: participantsError.message,
      code: (participantsError as any).code,
      details: (participantsError as any).details,
      conversationId,
      userId: user.id,
    });
    await supabase.from(conversationsTable as any).delete().eq('id', conversationId);
    throw new Error(`Failed to add participants: ${participantsError.message}`);
  }

  console.log('[createConversation] Success! Returning conversationId:', conversationId);
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
    .from(participantsTable as any)
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
    .from(messagesTable as any)
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

export async function createGolfConversation(participantUserIds: string[], teamId?: string) {
  return createConversation({ participantUserIds, sport: 'golf', teamId });
}

export async function markGolfMessagesAsRead(conversationId: string) {
  return markMessagesAsRead({ conversationId, sport: 'golf' });
}

// ============================================================================
// Team Broadcast / Group Chat (Golf)
// ============================================================================

interface CreateTeamBroadcastOptions {
  teamId: string;
  title: string;
  selectedPlayerIds?: string[]; // If empty/undefined, all team players are included
}

/**
 * Create a team broadcast conversation (coaches only)
 * @param teamId - The team ID
 * @param title - The conversation title (e.g., "Team Updates", "Practice Reminder")
 * @param selectedPlayerIds - Optional array of specific player IDs to include (if not provided, all team players are included)
 */
export async function createGolfTeamBroadcast({
  teamId,
  title,
  selectedPlayerIds,
}: CreateTeamBroadcastOptions): Promise<{ conversationId: string } | { error: string }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Verify user is a coach
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach || coachError) {
      throw new Error('Only coaches can create team broadcasts');
    }

    // Verify team belongs to coach's organization
    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id, organization_id')
      .eq('id', teamId)
      .single();

    if (!team || teamError || team.organization_id !== coach.organization_id) {
      throw new Error('Team not found or not authorized');
    }

    // Get team players (all or selected)
    let playerQuery = supabase
      .from('golf_team_members')
      .select('player_id, player:golf_players(user_id)')
      .eq('team_id', teamId);

    if (selectedPlayerIds && selectedPlayerIds.length > 0) {
      playerQuery = playerQuery.in('player_id', selectedPlayerIds);
    }

    const { data: teamMembers, error: membersError } = await playerQuery;

    if (membersError) {
      throw new Error('Failed to fetch team members');
    }

    // Extract user IDs from players
    const playerUserIds: string[] = [];
    teamMembers?.forEach(member => {
      const player = member.player as { user_id: string | null } | null;
      if (player?.user_id) {
        playerUserIds.push(player.user_id);
      }
    });

    if (playerUserIds.length === 0) {
      throw new Error('No players with accounts found on this team');
    }

    // Check if a team broadcast with this title already exists
    const { data: existingConv } = await supabase
      .from('golf_conversations')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_team_chat', true)
      .eq('title', title)
      .single();

    if (existingConv) {
      // Return existing conversation instead of creating duplicate
      return { conversationId: existingConv.id };
    }

    // Create new group conversation
    const { data: newConversation, error: convError } = await supabase
      .from('golf_conversations')
      .insert({
        team_id: teamId,
        title: title,
        is_team_chat: true,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (convError || !newConversation) {
      console.error('[Broadcast] Conversation create error:', convError);
      throw new Error(`Failed to create broadcast: ${convError?.message || 'Unknown error'}`);
    }

    const conversationId = newConversation.id;

    // Add all participants (coach + selected/all players)
    const allParticipantIds = [user.id, ...playerUserIds];
    const uniqueParticipantIds = [...new Set(allParticipantIds)];

    const participantInserts = uniqueParticipantIds.map(userId => ({
      conversation_id: conversationId,
      user_id: userId,
      joined_at: new Date().toISOString(),
    }));

    const { error: participantsError } = await supabase
      .from('golf_conversation_participants')
      .insert(participantInserts);

    if (participantsError) {
      console.error('[Broadcast] Failed to add participants:', participantsError);
      throw new Error(`Failed to add participants: ${participantsError.message}`);
    }

    // Log security event
    await logSecurityEvent({
      event: 'team_broadcast_created',
      action: 'team_broadcast_created',
      userId: user.id,
      metadata: {
        conversationId,
        teamId,
        title,
        participantCount: uniqueParticipantIds.length,
      },
    });

    revalidatePath('/golf/dashboard/messages');

    return { conversationId };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

/**
 * Get all team players for the broadcast selection UI
 * @param teamId - The team ID
 */
export async function getGolfTeamPlayersForBroadcast(teamId: string): Promise<{
  players: Array<{ id: string; userId: string; name: string; gradYear: number | null; avatarUrl: string | null }>
} | { error: string }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Verify user is a coach for this team
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      throw new Error('Only coaches can access team players');
    }

    // Verify team belongs to coach's organization
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id, organization_id')
      .eq('id', teamId)
      .single();

    if (!team || team.organization_id !== coach.organization_id) {
      throw new Error('Team not found or not authorized');
    }

    // Get all team players
    const { data: teamMembers, error: membersError } = await supabase
      .from('golf_team_members')
      .select('player_id, player:golf_players(id, user_id, first_name, last_name, graduation_year, avatar_url)')
      .eq('team_id', teamId);

    if (membersError) {
      throw new Error('Failed to fetch team members');
    }

    const players = (teamMembers || [])
      .map(member => {
        const player = member.player as {
          id: string;
          user_id: string | null;
          first_name: string | null;
          last_name: string | null;
          graduation_year: number | null;
          avatar_url: string | null;
        } | null;

        if (!player?.user_id) return null;

        return {
          id: player.id,
          userId: player.user_id,
          name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Unknown Player',
          gradYear: player.graduation_year,
          avatarUrl: player.avatar_url,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return { players };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

// ============================================================================
// Message Edit/Delete Actions
// ============================================================================

interface UpdateMessageOptions {
  messageId: string;
  content: string;
  sport?: Sport;
}

/**
 * Update a message's content (edit)
 * @param messageId - The message ID to update
 * @param content - The new message content
 * @param sport - The sport context
 */
export async function updateMessage({
  messageId,
  content,
  sport = 'baseball',
}: UpdateMessageOptions) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    if (content.length > 5000) {
      throw new Error('Message content is too long');
    }

    // Sanitize content to prevent XSS
    const sanitizedContent = sanitizeHtml(content.trim());

    const messagesTable = sport === 'golf' ? 'golf_messages' : 'baseball_messages';

    // Verify user owns this message
    const { data: existingMessage, error: fetchError } = await supabase
      .from(messagesTable as any)
      .select('id, sender_id, conversation_id')
      .eq('id', messageId)
      .single() as { data: { id: string; sender_id: string; conversation_id: string } | null; error: SupabaseError | null };

    if (fetchError || !existingMessage) {
      throw new Error('Message not found');
    }

    const msg = existingMessage as { id: string; sender_id: string; conversation_id: string };
    if (msg.sender_id !== user.id) {
      console.warn('[Security] Unauthorized message edit attempt:', {
        userId: user.id,
        messageId,
        actualSenderId: msg.sender_id,
      });
      throw new Error('You can only edit your own messages');
    }

    // Log security event
    await logSecurityEvent({
      event: 'message_updated',
      action: 'message_updated',
      userId: user.id,
      metadata: { messageId, contentLength: sanitizedContent.length },
    });

    // Update the message
    const { error: updateError } = await supabase
      .from(messagesTable as any)
      .update({
        content: sanitizedContent,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('sender_id', user.id); // Extra safety check

    if (updateError) {
      console.error('[Messages] Failed to update message:', updateError);
      throw new Error('Failed to update message');
    }

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

interface DeleteMessageOptions {
  messageId: string;
  sport?: Sport;
}

/**
 * Soft-delete a message
 * @param messageId - The message ID to delete
 * @param sport - The sport context
 */
export async function deleteMessage({
  messageId,
  sport = 'baseball',
}: DeleteMessageOptions) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const messagesTable = sport === 'golf' ? 'golf_messages' : 'baseball_messages';

    // Verify user owns this message
    const { data: existingMessage, error: fetchError } = await supabase
      .from(messagesTable as any)
      .select('id, sender_id, conversation_id')
      .eq('id', messageId)
      .single() as { data: { id: string; sender_id: string; conversation_id: string } | null; error: SupabaseError | null };

    if (fetchError || !existingMessage) {
      throw new Error('Message not found');
    }

    const msg = existingMessage as { id: string; sender_id: string; conversation_id: string };
    if (msg.sender_id !== user.id) {
      console.warn('[Security] Unauthorized message delete attempt:', {
        userId: user.id,
        messageId,
        actualSenderId: msg.sender_id,
      });
      throw new Error('You can only delete your own messages');
    }

    // Log security event
    await logSecurityEvent({
      event: 'message_deleted',
      action: 'message_deleted',
      userId: user.id,
      metadata: { messageId },
    });

    // Soft-delete the message
    const { error: deleteError } = await supabase
      .from(messagesTable as any)
      .update({
        is_deleted: true,
        content: '', // Clear content on delete for privacy
      })
      .eq('id', messageId)
      .eq('sender_id', user.id); // Extra safety check

    if (deleteError) {
      console.error('[Messages] Failed to delete message:', deleteError);
      throw new Error('Failed to delete message');
    }

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

// Golf-specific edit/delete exports
export async function updateGolfMessage(messageId: string, content: string) {
  return updateMessage({ messageId, content, sport: 'golf' });
}

export async function deleteGolfMessage(messageId: string) {
  return deleteMessage({ messageId, sport: 'golf' });
}

// Baseball-specific edit/delete exports
export async function updateBaseballMessage(messageId: string, content: string) {
  return updateMessage({ messageId, content, sport: 'baseball' });
}

export async function deleteBaseballMessage(messageId: string) {
  return deleteMessage({ messageId, sport: 'baseball' });
}

/**
 * Get the user_id for a golf player by their player_id
 * Used when starting conversations from the roster page
 */
export async function getGolfPlayerUserId(playerId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from('golf_players')
    .select('user_id')
    .eq('id', playerId)
    .single();

  if (error || !player) {
    console.error('[getGolfPlayerUserId] Error:', error);
    return null;
  }

  return player.user_id;
}
