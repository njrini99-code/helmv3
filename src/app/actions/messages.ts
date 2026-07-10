/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses 'as any' casts for dynamic table names (baseball_* vs golf_* tables)
// because Supabase types can't infer types from dynamic table name strings.
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  formatSafeErrorResponse,
  logSecurityEvent,
} from '@/lib/validation/server-action-validator';
import { MessageSchemas } from '@/lib/validation/action-schemas';
import { notifyNewMessage } from '@/lib/notifications';
import { sendPushNotification } from '@/lib/notifications/push';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getCoachTeamSwitchContext } from '@/lib/golf/resolve-team';
import { withAdminObserved } from '@/lib/admin/observed-action';

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
 * Whether the program that owns this conversation still wants new-message
 * bell notifications created. Reads the real, persisted preference at
 * baseball_program_settings.notification_defaults.message.in_app (set via the
 * Program Settings > Notifications UI, ProgramSettingsClient +
 * updateProgramSettings). Defaults to enabled (true) when the conversation
 * has no team_id (not every baseball conversation is team-scoped) or when the
 * program has no explicit preference recorded yet — matches the same
 * "missing key => true" default the settings UI itself uses.
 */
async function isBaseballMessageNotificationEnabled(conversationId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from('baseball_conversations' as any)
    .select('team_id')
    .eq('id', conversationId)
    .maybeSingle() as { data: { team_id: string | null } | null };

  const teamId = conversation?.team_id;
  if (!teamId) return true;

  const { data: settings } = await supabase
    .from('baseball_program_settings' as any)
    .select('notification_defaults')
    .eq('team_id', teamId)
    .maybeSingle() as { data: { notification_defaults: Record<string, { in_app?: boolean }> | null } | null };

  const pref = settings?.notification_defaults?.message;
  return pref?.in_app ?? true;
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

    // React's text interpolation auto-escapes on render — store raw user text.
    const sanitizedContent = validatedData.content;

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
      await logServerError(`[Security] Message insert failed: ${messageError.message}`, {
        action: 'messages.sendMessage',
        metadata: {
          userId: user.id,
          conversationId: validatedData.conversation_id,
          code: messageError.code,
          details: messageError.details,
          hint: messageError.hint,
        },
      });
      maybeCaptureRlsDenial(messageError, {
        table: messagesTable,
        verb: 'insert',
        action: 'messages.sendMessage',
        feature: sport === 'golf' ? 'messaging' : 'baseball_messages',
        sport,
        userId: user.id,
      });
      throw new Error(`Failed to send message: ${messageError.message}`);
    }

    if (!insertedMessage) {
      await logServerError('[Security] Message insert succeeded but no data returned', {
        action: 'messages.sendMessage',
        metadata: { userId: user.id, conversationId: validatedData.conversation_id },
      });
      throw new Error('Failed to send message: No data returned');
    }

    // Update conversation updated_at
    const conversationsTable = sport === 'golf' ? 'golf_conversations' : 'baseball_conversations';
    await supabase
      .from(conversationsTable as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', validatedData.conversation_id);

    // Create notifications for other participants (if enabled AND the program
    // hasn't disabled message notifications — honors the real, persisted
    // baseball_program_settings.notification_defaults.message preference set
    // on Program Settings; see #454/#466).
    const messageNotificationsEnabled =
      createNotifications && sport === 'baseball'
        ? await isBaseballMessageNotificationEnabled(validatedData.conversation_id)
        : true;

    if (createNotifications && messageNotificationsEnabled) {
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
          data: { conversation_id: validatedData.conversation_id },
          created_at: new Date().toISOString(),
        }));

        await (supabase as any)
          .from('baseball_notifications')
          .insert(notifications);
      }
    }

    // NOTE: Removed revalidatePath calls - messages page uses real-time subscriptions
    // Revalidation was causing unnecessary page reloads on every message send
    // SEMGREP-ALLOW: realtime-subscribed messages UI; revalidate would cause reload loop

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
        return { conversationId: sharedConversations[0].conversation_id };
      }
    }
  }

  // Create new conversation
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
      await logServerError('[createConversation] Missing teamId for golf conversation', { action: 'messages.createConversation' });
      throw new Error('Team ID is required for golf conversations');
    }
    insertData.team_id = teamId;
  }

  const { data: newConversation, error: convError } = await supabase
    .from(conversationsTable as any)
    .insert(insertData)
    .select('id')
    .single() as { data: { id: string } | null; error: SupabaseError | null };

  if (convError || !newConversation) {
    await logServerError(`[createConversation] Conversation create error: ${convError?.message ?? 'unknown'}`, {
      action: 'messages.createConversation',
      metadata: {
        code: convError?.code,
        details: convError?.details,
        hint: convError?.hint,
        userId: user.id,
        participantUserIds,
        insertData,
      },
    });
    maybeCaptureRlsDenial(convError, {
      table: conversationsTable,
      verb: 'insert',
      action: 'messages.createConversation',
      feature: sport === 'golf' ? 'messaging' : 'baseball_messages',
      sport,
      userId: user.id,
    });
    throw new Error(`Failed to create conversation: ${convError?.message || 'Unknown error'}`);
  }

  const conversationId = newConversation.id;

  // Add all participants (including current user)
  const allParticipantIds = [...new Set([user.id, ...participantUserIds].filter(Boolean))];
  const participantInserts = allParticipantIds.map(userId => ({
    conversation_id: conversationId,
    user_id: userId,
    joined_at: new Date().toISOString(),
  }));

  const { error: participantsError } = await supabase
    .from(participantsTable as any)
    .insert(participantInserts);

  if (participantsError) {
    await logServerError(`[createConversation] Participants insert error: ${participantsError.message}`, {
      action: 'messages.createConversation',
      metadata: {
        code: (participantsError as any).code,
        details: (participantsError as any).details,
        conversationId,
        userId: user.id,
      },
    });
    maybeCaptureRlsDenial(participantsError, {
      table: participantsTable,
      verb: 'insert',
      action: 'messages.createConversation',
      feature: sport === 'golf' ? 'messaging' : 'baseball_messages',
      sport,
      userId: user.id,
    });
    await supabase.from(conversationsTable as any).delete().eq('id', conversationId);
    throw new Error(`Failed to add participants: ${participantsError.message}`);
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

  // Update last_read_at for this participant. This is the primary read marker:
  // group-chat unread badges are computed app-side from last_read_at, and writing
  // it fires the realtime golf_conversation_participants UPDATE that re-runs the
  // conversation rail's refetch — clearing the viewer's unread badge on open (F124).
  const participantsTable = sport === 'golf' ? 'golf_conversation_participants' : 'baseball_conversation_participants';
  const { error: participantError } = await supabase
    .from(participantsTable as any)
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  if (participantError) {
    await logServerError(`[Messages] Failed to update last_read_at: ${participantError instanceof Error ? participantError.message : String(participantError)}`, { action: 'messages.markMessagesAsRead' });
    maybeCaptureRlsDenial(participantError, {
      table: participantsTable,
      verb: 'update',
      action: 'messages.markMessagesAsRead',
      feature: sport === 'golf' ? 'messaging' : 'baseball_messages',
      sport,
      userId: user.id,
    });
    throw new Error('Failed to mark messages as read');
  }

  // Flip read=true on messages from OTHERS (never the viewer's own — that would
  // forge a read receipt for the sender). The 1:1 unread_count basis in
  // get_*_conversations_with_details counts `read = FALSE AND sender_id != viewer`,
  // so this write is what clears the 1:1 badge and stays reconciled with that count.
  // last_read_at already committed above, so a failure here is non-fatal: log it but
  // still revalidate + report success so the badge isn't stuck on a transient error.
  const messagesTable = sport === 'golf' ? 'golf_messages' : 'baseball_messages';
  const { error: messagesError } = await supabase
    .from(messagesTable as any)
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id);

  if (messagesError) {
    await logServerError(`[Messages] Failed to mark messages as read: ${messagesError instanceof Error ? messagesError.message : String(messagesError)}`, { action: 'messages.markMessagesAsRead' });
    maybeCaptureRlsDenial(messagesError, {
      table: messagesTable,
      verb: 'update',
      action: 'messages.markMessagesAsRead',
      feature: sport === 'golf' ? 'messaging' : 'baseball_messages',
      sport,
      userId: user.id,
    });
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
// SEMGREP-ALLOW: realtime-subscribed messages + notifications UI; revalidate would cause reload loop
async function sendGolfMessageImpl(conversationId: string, content: string) {
  const result = await sendMessage({ conversationId, content, sport: 'golf', createNotifications: false });

  if (result.success) {
    // Send email notifications to other participants (fire-and-forget)
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Get other participants' user IDs
        const { data: otherParticipants } = await (supabase as any)
          .from('golf_conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversationId)
          .neq('user_id', user.id) as { data: { user_id: string }[] | null };

        if (otherParticipants && otherParticipants.length > 0) {
          const recipientUserIds = otherParticipants.map(p => p.user_id);

          // Batch every lookup into ONE round-trip of parallel queries: sender name
          // (coach → player → email fallback) and all recipient emails via a single
          // .in() instead of sequential per-recipient fetches.
          const [
            { data: senderCoach },
            { data: senderPlayer },
            { data: senderUser },
            { data: recipientProfiles },
          ] = await Promise.all([
            supabase.from('golf_coaches').select('full_name').eq('user_id', user.id).maybeSingle(),
            supabase.from('golf_players').select('first_name, last_name').eq('user_id', user.id).maybeSingle(),
            supabase.from('users').select('email').eq('id', user.id).maybeSingle(),
            supabase.from('users').select('id, email').in('id', recipientUserIds),
          ]);

          const senderName = senderCoach?.full_name
            || (senderPlayer ? `${senderPlayer.first_name || ''} ${senderPlayer.last_name || ''}`.trim() : '')
            || senderUser?.email
            || 'Someone';
          const preview = content.length > 80 ? content.substring(0, 80) + '…' : content;

          if (recipientProfiles) {
            // Email notifications
            await Promise.allSettled(
              recipientProfiles.map(r =>
                r.email
                  ? notifyNewMessage(r.id, r.email, senderName, preview, conversationId, 'golf')
                  : Promise.resolve()
              )
            );

            // Push notifications — carry the conversation id so the push payload
            // deep-links straight to the thread that fired it (P260).
            await Promise.allSettled(
              recipientProfiles.map(r =>
                sendPushNotification('new_message', r.id, {
                  senderName,
                  preview,
                  conversationId,
                })
              )
            );

            // In-app notifications (golf_calendar_notifications)
            // P260: deep-link to the conversation that fired the notification via
            // ?conversation=<id> (NotificationCenter does router.push(action_url),
            // and FairwayMessages pre-selects from this param). Mirrors the existing
            // ?event= / ?task= deep-link convention used elsewhere in this codebase.
            const inAppNotifs = recipientProfiles.map(r => ({
              user_id: r.id,
              notification_type: 'message',
              title: `Message from ${senderName}`,
              message: preview,
              action_url: `/golf/dashboard/messages?conversation=${conversationId}`,
            }));
            // Use admin client to bypass RLS — inserting notifications for other users
            const adminClient = createAdminClient();
            await (adminClient as any)
              .from('golf_calendar_notifications')
              .insert(inAppNotifs);
          }
        }
      }
    } catch (notifErr) {
      // Never block message delivery on notification failure
      await logServerError(`[sendGolfMessage] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'messages.sendGolfMessage' });
    }
  }

  return result;
}

const observedSendGolfMessage = withAdminObserved(
  'sendGolfMessage',
  { sport: 'golf', feature: 'messaging' },
  sendGolfMessageImpl,
);

export async function sendGolfMessage(conversationId: string, content: string) {
  return observedSendGolfMessage(conversationId, content);
}

async function createGolfConversationImpl(participantUserIds: string[], teamId?: string) {
  return createConversation({ participantUserIds, sport: 'golf', teamId });
}

const observedCreateGolfConversation = withAdminObserved(
  'createGolfConversation',
  { sport: 'golf', feature: 'messaging' },
  createGolfConversationImpl,
);

export async function createGolfConversation(participantUserIds: string[], teamId?: string) {
  return observedCreateGolfConversation(participantUserIds, teamId);
}

async function markGolfMessagesAsReadImpl(conversationId: string) {
  return markMessagesAsRead({ conversationId, sport: 'golf' });
}

const observedMarkGolfMessagesAsRead = withAdminObserved(
  'markGolfMessagesAsRead',
  { sport: 'golf', feature: 'messaging' },
  markGolfMessagesAsReadImpl,
);

export async function markGolfMessagesAsRead(conversationId: string) {
  return observedMarkGolfMessagesAsRead(conversationId);
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
async function createGolfTeamBroadcastImpl({
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
      await logServerError(`[Broadcast] Conversation create error: ${convError instanceof Error ? convError.message : String(convError)}`, { action: 'messages.createGolfTeamBroadcast' });
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
      await logServerError(`[Broadcast] Failed to add participants: ${participantsError instanceof Error ? participantsError.message : String(participantsError)}`, { action: 'messages.createGolfTeamBroadcast' });
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

const observedCreateGolfTeamBroadcast = withAdminObserved(
  'createGolfTeamBroadcast',
  { sport: 'golf', feature: 'messaging' },
  createGolfTeamBroadcastImpl,
);

export async function createGolfTeamBroadcast(
  options: CreateTeamBroadcastOptions,
): Promise<{ conversationId: string } | { error: string }> {
  return observedCreateGolfTeamBroadcast(options);
}

/**
 * Get all team players for the broadcast selection UI
 * @param teamId - The team ID
 */
async function getGolfTeamPlayersForBroadcastImpl(teamId: string): Promise<{
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

const observedGetGolfTeamPlayersForBroadcast = withAdminObserved(
  'getGolfTeamPlayersForBroadcast',
  { sport: 'golf', feature: 'messaging' },
  getGolfTeamPlayersForBroadcastImpl,
);

export async function getGolfTeamPlayersForBroadcast(teamId: string): Promise<{
  players: Array<{ id: string; userId: string; name: string; gradYear: number | null; avatarUrl: string | null }>
} | { error: string }> {
  return observedGetGolfTeamPlayersForBroadcast(teamId);
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

    // React's text interpolation auto-escapes on render — store raw user text.
    const sanitizedContent = content.trim();

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
      await logServerError(`[Messages] Failed to update message: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'messages.updateMessage' });
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
      await logServerError(`[Messages] Failed to delete message: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'messages.deleteMessage' });
      throw new Error('Failed to delete message');
    }

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

// Golf-specific edit/delete exports
async function updateGolfMessageImpl(messageId: string, content: string) {
  return updateMessage({ messageId, content, sport: 'golf' });
}

const observedUpdateGolfMessage = withAdminObserved(
  'updateGolfMessage',
  { sport: 'golf', feature: 'messaging' },
  updateGolfMessageImpl,
);

export async function updateGolfMessage(messageId: string, content: string) {
  return observedUpdateGolfMessage(messageId, content);
}

async function deleteGolfMessageImpl(messageId: string) {
  return deleteMessage({ messageId, sport: 'golf' });
}

const observedDeleteGolfMessage = withAdminObserved(
  'deleteGolfMessage',
  { sport: 'golf', feature: 'messaging' },
  deleteGolfMessageImpl,
);

export async function deleteGolfMessage(messageId: string) {
  return observedDeleteGolfMessage(messageId);
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
async function getGolfPlayerUserIdImpl(playerId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: player, error } = await supabase
    .from('golf_players')
    .select('user_id')
    .eq('id', playerId)
    .single();

  if (error || !player) {
    await logServerError(`[getGolfPlayerUserId] Error: ${error instanceof Error ? error.message : String(error)}`, { action: 'messages.getGolfPlayerUserId' });
    return null;
  }

  return player.user_id;
}

const observedGetGolfPlayerUserId = withAdminObserved(
  'getGolfPlayerUserId',
  { sport: 'golf', feature: 'messaging' },
  getGolfPlayerUserIdImpl,
);

export async function getGolfPlayerUserId(playerId: string): Promise<string | null> {
  return observedGetGolfPlayerUserId(playerId);
}

// ============================================================================
// Message Search
// ============================================================================

export interface MessageSearchResult {
  messageId: string;
  conversationId: string;
  content: string;
  senderName: string;
  senderAvatar: string | null;
  conversationName: string;
  createdAt: string | null;
}

/**
 * Search golf messages across all conversations the user participates in
 * @param query - The search query string
 * @param teamId - Optional team ID to scope the search
 * @returns Array of matching messages with context
 */
async function searchGolfMessagesImpl(
  query: string,
  teamId?: string
): Promise<{ results: MessageSearchResult[] } | { error: string }> {
  try {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Validate query
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      return { results: [] };
    }

    // Get all conversation IDs the user participates in
    const { data: participantRows, error: participantError } = await supabase
      .from('golf_conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (participantError || !participantRows || participantRows.length === 0) {
      return { results: [] };
    }

    const conversationIds = participantRows.map(r => r.conversation_id);

    // Search messages using ilike for case-insensitive partial matching
    // Only within conversations the user is a participant of
    // Escape SQL wildcards in user input
    const escapedQuery = trimmedQuery.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const searchPattern = `%${escapedQuery}%`;

    let messagesQuery = supabase
      .from('golf_messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .in('conversation_id', conversationIds)
      .eq('is_deleted', false)
      .ilike('content', searchPattern)
      .order('created_at', { ascending: false })
      .limit(50);

    // If teamId is provided, further filter by conversations that belong to the team
    if (teamId) {
      const { data: teamConversations } = await supabase
        .from('golf_conversations')
        .select('id')
        .eq('team_id', teamId)
        .in('id', conversationIds);

      if (teamConversations && teamConversations.length > 0) {
        const teamConvIds = teamConversations.map(c => c.id);
        messagesQuery = supabase
          .from('golf_messages')
          .select('id, conversation_id, sender_id, content, created_at')
          .in('conversation_id', teamConvIds)
          .eq('is_deleted', false)
          .ilike('content', searchPattern)
          .order('created_at', { ascending: false })
          .limit(50);
      } else {
        return { results: [] };
      }
    }

    const { data: matchingMessages, error: messagesError } = await messagesQuery;

    if (messagesError || !matchingMessages || matchingMessages.length === 0) {
      return { results: [] };
    }

    // Collect unique sender IDs and conversation IDs for batch lookups
    const senderIds = [...new Set(matchingMessages.map(m => m.sender_id))];
    const matchedConvIds = [...new Set(matchingMessages.map(m => m.conversation_id))];

    // Batch fetch sender info (coaches and players)
    const [{ data: coaches }, { data: players }] = await Promise.all([
      supabase
        .from('golf_coaches')
        .select('user_id, full_name, avatar_url')
        .in('user_id', senderIds),
      supabase
        .from('golf_players')
        .select('user_id, first_name, last_name, avatar_url')
        .in('user_id', senderIds),
    ]);

    // Build sender lookup map
    const senderMap = new Map<string, { name: string; avatar: string | null }>();
    (coaches || []).forEach(c => {
      if (c.user_id) {
        senderMap.set(c.user_id, {
          name: c.full_name || 'Coach',
          avatar: c.avatar_url,
        });
      }
    });
    (players || []).forEach(p => {
      if (p.user_id) {
        senderMap.set(p.user_id, {
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Player',
          avatar: p.avatar_url,
        });
      }
    });

    // Batch fetch conversation details for naming
    const { data: conversationDetails } = await supabase
      .from('golf_conversations')
      .select('id, title, is_team_chat')
      .in('id', matchedConvIds);

    // Also fetch participant info for 1:1 conversations to build conversation names
    const { data: allParticipants } = await supabase
      .from('golf_conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', matchedConvIds);

    // Build conversation name lookup
    const convNameMap = new Map<string, string>();
    (conversationDetails || []).forEach(conv => {
      if (conv.is_team_chat && conv.title) {
        convNameMap.set(conv.id, conv.title);
      } else {
        // For 1:1 conversations, find the other participant's name
        const participants = (allParticipants || []).filter(
          p => p.conversation_id === conv.id && p.user_id !== user.id
        );
        if (participants.length > 0 && participants[0]) {
          const otherUserId = participants[0].user_id;
          const senderInfo = senderMap.get(otherUserId);
          convNameMap.set(conv.id, senderInfo?.name || 'Conversation');
        } else {
          convNameMap.set(conv.id, 'Conversation');
        }
      }
    });

    // Build results
    const results: MessageSearchResult[] = matchingMessages.map(msg => {
      const sender = senderMap.get(msg.sender_id);
      return {
        messageId: msg.id,
        conversationId: msg.conversation_id,
        content: msg.content,
        senderName: msg.sender_id === user.id ? 'You' : (sender?.name || 'Unknown'),
        senderAvatar: sender?.avatar || null,
        conversationName: convNameMap.get(msg.conversation_id) || 'Conversation',
        createdAt: msg.created_at,
      };
    });

    return { results };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

const observedSearchGolfMessages = withAdminObserved(
  'searchGolfMessages',
  { sport: 'golf', feature: 'messaging' },
  searchGolfMessagesImpl,
);

export async function searchGolfMessages(
  query: string,
  teamId?: string
): Promise<{ results: MessageSearchResult[] } | { error: string }> {
  return observedSearchGolfMessages(query, teamId);
}

/**
 * Active-team scoping for the golf conversation rail.
 *
 * A dual-team head / director-of-golf is a participant in conversations stamped
 * with BOTH teams' `team_id` (every golf conversation is stamped with the active
 * team it was created under — see createConversation, golf requires team_id).
 * The rail's RPC (`get_golf_conversations_with_details`) scopes only by
 * participant membership, so without this the rail shows the UNION across both
 * teams. This returns the set of conversation ids that belong to the coach's
 * ACTIVE team so the client can filter the rail to one team at a time.
 *
 * Returns `null` to mean "DO NOT team-scope" — the caller must then behave
 * exactly as before. This is the no-op contract for:
 *   - players (no golf_coaches row),
 *   - coaches staffed on 0 or 1 team (nothing to disambiguate),
 *   - an unresolved active team (fail-open: never blank the rail).
 *
 * Only a coach staffed on >1 team (head OR assistant) ever gets a real allow-set.
 * Scoping lives server-side + cookie-aware, so flipping the TeamSwitcher (which
 * rewrites the `golf_active_team` cookie) re-scopes the rail on the next fetch.
 *
 * @returns conversation ids for the active team, or `null` for no scoping.
 */
async function getGolfActiveTeamConversationIdsImpl(): Promise<string[] | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Only coaches are team-scoped; players are unaffected.
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return null;

    // No-op for single/zero-team coaches — nothing to disambiguate.
    // getCoachTeamSwitchContext is the canonical multi-team detector (staff
    // rows from golf_team_coach_staff, with an org fallback). Gate on team
    // count (NOT canSwitch) so a dual-team ASSISTANT is also correctly scoped.
    const ctx = await getCoachTeamSwitchContext(supabase, coach.id, coach.organization_id);
    if (ctx.teams.length <= 1) return null;

    // Resolve the ACTIVE team (cookie-aware; a forged cookie is validated +
    // falls back to the coach's staffed/default team inside the resolver).
    const activeTeam = await resolveCoachTeamIdWithCookie(
      supabase,
      coach.organization_id,
      coach.id,
    );
    if (!activeTeam) return null; // fail-open: never blank the rail

    // The user's participant conversations that belong to the active team.
    const { data: parts } = await supabase
      .from('golf_conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);
    const partIds = [
      ...new Set((parts ?? []).map((p) => p.conversation_id).filter(Boolean)),
    ] as string[];
    if (partIds.length === 0) return [];

    const { data: teamConvs } = await supabase
      .from('golf_conversations')
      .select('id')
      .eq('team_id', activeTeam)
      .in('id', partIds);

    return (teamConvs ?? []).map((c) => c.id as string);
  } catch (err) {
    // Fail-open: a scoping failure must never blank the rail. Returning null
    // restores the exact pre-change (unscoped) behaviour.
    await logServerError(
      `[getGolfActiveTeamConversationIds] ${err instanceof Error ? err.message : 'unknown'}`,
      { action: 'messages.getGolfActiveTeamConversationIds' },
    );
    return null;
  }
}

const observedGetGolfActiveTeamConversationIds = withAdminObserved(
  'getGolfActiveTeamConversationIds',
  { sport: 'golf', feature: 'messaging' },
  getGolfActiveTeamConversationIdsImpl,
);

export async function getGolfActiveTeamConversationIds(): Promise<string[] | null> {
  return observedGetGolfActiveTeamConversationIds();
}
