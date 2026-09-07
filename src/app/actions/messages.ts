/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses 'as any' casts for dynamic table names (baseball_* vs golf_* tables)
// because Supabase types can't infer types from dynamic table name strings.
'use server';

import { createClient } from '@/lib/supabase/server';
import { escapeLikePattern } from '@/lib/utils/escape-like';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import {
  formatSafeErrorResponse,
  logSecurityEvent,
} from '@/lib/validation/server-action-validator';
import { MessageSchemas } from '@/lib/validation/action-schemas';
import { notifyGolfMessageRecipients } from '@/lib/notifications/golf-message-fanout';
import { logServerError } from '@/lib/server-error-logger';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { getCoachTeamSwitchContext } from '@/lib/golf/resolve-team';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

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
  /**
   * Client-generated id for the optimistic row that will represent this
   * message locally. When present it is inserted as the row's real `id`
   * (a normal `DEFAULT uuid_generate_v4()` column, not GENERATED ALWAYS, so
   * a client-supplied override is a legitimate insert) instead of letting
   * Postgres generate one. That makes the realtime echo of this send carry
   * the SAME id the caller already rendered, so reconciliation in
   * useGolfMessages is an exact match instead of a heuristic guess.
   */
  clientMessageId?: string;
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
// nosemgrep: helmv3-action-missing-revalidate -- realtime-subscribed messages UI; revalidatePath caused a full reload on every send (see note above the return)
export async function sendMessage({
  conversationId,
  content,
  sport = 'baseball',
  createNotifications = true,
  clientMessageId,
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
      content,
      client_message_id: clientMessageId,
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
        ...(validatedData.client_message_id ? { id: validatedData.client_message_id } : {}),
        conversation_id: validatedData.conversation_id,
        sender_id: user.id,
        content: sanitizedContent,
        read: false,
      })
      .select()
      .single();

    if (messageError) {
      // withOneTransportRetry (transient-network-error.ts) reruns this exact
      // call — same clientMessageId both times — when the FIRST attempt's
      // response was lost to a transport error after the insert had already
      // committed. That collides on the primary key. `*_messages_pkey` is the
      // only unique constraint either messages table has, so 23505 here can
      // only mean "this exact row already exists" — the send already
      // succeeded once; report that success rather than a failure the caller
      // would use to roll back a message realtime has already delivered.
      // (An id collision with someone else's message is not reachable this
      // way either: INSERT cannot overwrite an existing row, so a client that
      // deliberately reused a foreign id would just fail its own write.)
      if (validatedData.client_message_id && messageError.code === '23505') {
        // …but "the pkey is already taken" is not by itself proof that WE took
        // it (G-18, §17.3). The reasoning above is about what the client is
        // known to do, not about what the code enforces, and reporting success
        // for a row this caller did not write would tell the sender their
        // message was delivered when it never existed. So verify equivalence
        // before claiming the send succeeded.
        //
        // RLS makes the negative case safe: a row in a conversation this user
        // is not a participant of is simply invisible here, so `existing` is
        // null and we fail rather than guess. Unverifiable is treated exactly
        // like not-ours — the only claim we are willing to make is one the
        // database just confirmed.
        //
        // Content is compared against `sanitizedContent`, i.e. the raw text
        // this call would have stored. A retry of a row written by an older
        // sanitizer would therefore fail rather than short-circuit; failing
        // closed is the right direction, and the caller retains the message.
        const { data: existing, error: existingError } = await (supabase
          .from(messagesTable as any) as any)
          .select('id, conversation_id, sender_id, content')
          .eq('id', validatedData.client_message_id)
          .maybeSingle();

        const alreadySentByThisUser =
          !existingError &&
          !!existing &&
          existing.conversation_id === validatedData.conversation_id &&
          existing.sender_id === user.id &&
          existing.content === sanitizedContent;

        if (alreadySentByThisUser) {
          return { success: true };
        }

        await logServerError('[Security] Duplicate message id is not this sender\'s message', {
          action: 'messages.sendMessage',
          metadata: {
            userId: user.id,
            conversationId: validatedData.conversation_id,
            clientMessageId: validatedData.client_message_id,
            existingFound: !!existing,
            lookupFailed: !!existingError,
          },
        });
        // Falls through to the normal failure path below: the send is reported
        // as failed, and the optimistic bubble is RETAINED with a retry (G-19)
        // rather than being silently accepted.
      }
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
    // (the nosemgrep suppression for this lives on the function declaration)

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

  // The id is generated HERE rather than read back from the insert.
  //
  // This used to be `.insert(insertData).select('id').single()`, i.e.
  // `INSERT ... RETURNING id`. RETURNING makes Postgres apply the SELECT
  // policy to the new row on top of the INSERT check, and a brand-new 1:1
  // conversation cannot satisfy `golf_conversations_select_v2`:
  //
  //   id IN user_conversation_ids(auth.uid())          -- false: the
  //       participant rows are inserted on the NEXT statement, so the creator
  //       is not yet a participant of the row they just created
  //   (is_team_chat OR is_team_channel) AND is_golf_team_coach(team_id)
  //                                                    -- false: a DM sets
  //       neither flag (only createGolfTeamBroadcast does, which is exactly
  //       why broadcasts worked and coach→player DMs did not)
  //
  // All disjuncts false → RETURNING denied → the statement fails 42501 with
  // "new row violates row-level security policy", which reads like the INSERT
  // was rejected. It was not; the INSERT check passes fine. Verified against
  // production: identical row, identical RETURNING, is_team_chat=true
  // succeeds and unset fails.
  //
  // Supplying the id means no RETURNING, so no SELECT policy is consulted.
  // Nothing about who may create a conversation changes.
  const conversationId = crypto.randomUUID();

  // Build insert data - golf requires team_id
  const insertData: Record<string, unknown> = {
    id: conversationId,
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

  const { error: convError } = await supabase
    .from(conversationsTable as any)
    .insert(insertData) as { error: SupabaseError | null };

  if (convError) {
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

  // Participants go in TWO statements, self first. The order is load-bearing.
  //
  // `golf_participants_insert_v2` allows a row when either
  //   (a) user_id = auth.uid(), or
  //   (b) EXISTS (SELECT 1 FROM golf_conversations gc
  //               WHERE gc.id = conversation_id AND gc.created_by = auth.uid())
  //
  // Adding the OTHER person needs (b) — and that subquery reads
  // `golf_conversations`, so it is itself subject to that table's SELECT
  // policy. For a brand-new DM that policy denies the row (see the note on
  // the insert above), so the EXISTS finds nothing and the insert is refused:
  // "new row violates row-level security policy for table
  // golf_conversation_participants". Batching everyone into one statement
  // therefore fails as a whole, which is the second half of this bug and the
  // reason removing RETURNING alone was not enough.
  //
  // Inserting SELF first goes through branch (a), which has no subquery at
  // all. That single row then puts the conversation into
  // user_conversation_ids(auth.uid()), so the SELECT policy's first disjunct
  // now passes, the EXISTS in (b) can finally see the row, and everyone else
  // inserts normally.
  //
  // SCOPE — this is verified against production for GOLF ONLY. This function
  // is shared with baseball, and baseball is NOT fixed by it: its
  // `baseball_conversations_select` policy is a raw inline EXISTS against
  // baseball_conversation_participants rather than golf's SECURITY DEFINER
  // `user_conversation_ids()` wrapper, so the self-participant insert below
  // dies with 42P17 "infinite recursion detected in policy" instead. Baseball
  // DM creation was already 100% broken before this change (it failed one
  // step earlier, with 42501), so this is not a regression — but it is also
  // not a fix, and the failure is now a more confusing error. Repairing it
  // needs a migration wrapping baseball's policy in a SECURITY DEFINER
  // function the way golf's already is; that is deliberately not done here.
  const otherParticipantIds = [...new Set(participantUserIds.filter(Boolean))].filter(
    id => id !== user.id,
  );

  const { error: selfParticipantError } = await supabase
    .from(participantsTable as any)
    .insert([{ conversation_id: conversationId, user_id: user.id, joined_at: new Date().toISOString() }]);

  const { error: othersParticipantError } = otherParticipantIds.length
    ? await supabase.from(participantsTable as any).insert(
        otherParticipantIds.map(userId => ({
          conversation_id: conversationId,
          user_id: userId,
          joined_at: new Date().toISOString(),
        })),
      )
    : { error: null };

  const participantsError = selfParticipantError ?? othersParticipantError;

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
    // Roll back the conversation via the SERVICE-ROLE client, not the caller's.
    //
    // Neither golf_conversations nor baseball_conversations has a DELETE
    // policy at all, so under RLS this delete matched zero rows and reported
    // no error — the rollback has never actually worked. That was masked
    // before, because the conversation INSERT itself failed and there was
    // nothing to clean up. Now that the insert succeeds, a failure on the
    // participant statements would strand a conversation the recipient can
    // never see, so the rollback has to be real.
    //
    // Scoped to the id THIS request just generated, so it can only ever
    // remove the row we created. Participants and messages cascade
    // (…_conversation_id_fkey ON DELETE CASCADE), so the self-participant row
    // written a moment ago goes with it.
    const { error: rollbackError } = await createAdminClient()
      .from(conversationsTable as any)
      .delete()
      .eq('id', conversationId);
    if (rollbackError) {
      await logServerError(
        `[createConversation] Rollback of orphaned conversation ${conversationId} failed: ${rollbackError.message}`,
        { action: 'messages.createConversation' },
      );
    }
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
    await logServerError(`[Messages] Failed to update last_read_at: ${describeError(participantError)}`, { action: 'messages.markMessagesAsRead' });
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
  //
  // Golf-only wrinkle: `golf_messages_update_v2` is `USING (sender_id =
  // auth.uid()) WITH CHECK (sender_id = auth.uid())` — mutually exclusive
  // with the `sender_id != viewer` filter this write needs, so a plain
  // client-side update here always affects 0 rows on golf_messages (the 1:1
  // badge could never clear). Route golf through the participant-checked
  // `mark_golf_messages_read` SECURITY DEFINER RPC instead (see migration
  // 20260710160000_mark_golf_messages_read_rpc.sql), which bypasses that
  // sender-only policy from inside a function that itself verifies the
  // caller is a participant. Baseball's `baseball_messages_update`/
  // `_update_read` policies already permit any conversation participant
  // (not sender-only) to flip the column, so the direct update keeps
  // working there unchanged. If the RPC migration hasn't been applied yet,
  // this degrades gracefully: the call errors, is logged as non-fatal below
  // (same as any other messagesError), and last_read_at (committed above)
  // still clears the group-chat badge.
  let messagesError: { message: string } | null = null;
  if (sport === 'golf') {
    const { error } = await (supabase as any).rpc('mark_golf_messages_read', {
      p_conversation_id: conversationId,
    });
    messagesError = error;
  } else {
    const { error } = await supabase
      .from('baseball_messages' as any)
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id);
    messagesError = error;
  }

  if (messagesError) {
    await logServerError(`[Messages] Failed to mark messages as read: ${describeError(messagesError)}`, { action: 'messages.markMessagesAsRead' });
    maybeCaptureRlsDenial(messagesError, {
      table: sport === 'golf' ? 'golf_messages' : 'baseball_messages',
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
async function sendGolfMessageImpl(conversationId: string, content: string, clientMessageId?: string) {
  const result = await sendMessage({ conversationId, content, sport: 'golf', createNotifications: false, clientMessageId });

  if (result.success) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const preview = content.length > 80 ? content.substring(0, 80) + '…' : content;
      await notifyGolfMessageRecipients(conversationId, user.id, preview);
    }
  }

  return result;
}

const observedSendGolfMessage = withAdminObserved(
  'sendGolfMessage',
  { sport: 'golf', feature: 'messaging' },
  sendGolfMessageImpl,
);

export async function sendGolfMessage(conversationId: string, content: string, clientMessageId?: string) {
  return observedSendGolfMessage(conversationId, content, clientMessageId);
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
}: CreateTeamBroadcastOptions): Promise<{ conversationId: string; reused?: boolean } | { error: string }> {
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

    // Check if a team broadcast with this title + audience already exists.
    // Dedupe by (team_id, title, participant set) instead of title alone —
    // title-only dedupe (the prior behavior) silently reused a STALE
    // conversation whenever a coach reused a title (the sheet's own
    // TITLE_SUGGESTIONS chips actively encourage this — "Practice" for the
    // JV squad after already using "Practice" for varsity) for a DIFFERENT
    // audience, discarding the freshly-selected selectedPlayerIds entirely.
    const desiredParticipantIds = [...new Set([user.id, ...playerUserIds])].sort();

    const { data: existingConvs } = await supabase
      .from('golf_conversations')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_team_chat', true)
      .eq('title', title)
      .order('created_at', { ascending: true });

    if (existingConvs && existingConvs.length > 0) {
      for (const candidate of existingConvs) {
        const { data: candidateParticipants } = await supabase
          .from('golf_conversation_participants')
          .select('user_id')
          .eq('conversation_id', candidate.id);

        const candidateIds = [...new Set((candidateParticipants ?? []).map((p) => p.user_id))].sort();
        const sameAudience =
          candidateIds.length === desiredParticipantIds.length &&
          candidateIds.every((id, i) => id === desiredParticipantIds[i]);

        if (sameAudience) {
          // Exact audience match — reuse in place, nothing to reconcile.
          return { conversationId: candidate.id, reused: true };
        }
      }

      // A broadcast with this title exists, but for a DIFFERENT audience
      // than the one just selected. Reuse the oldest such thread (rather
      // than fragmenting into yet another same-titled conversation) but
      // reconcile membership first: add anyone newly selected who isn't
      // already a participant, so the message the coach is about to send
      // actually reaches every recipient they just chose. Never remove
      // existing participants here — golf messaging never does destructive
      // participant writes.
      const reuseTarget = existingConvs[0];
      if (reuseTarget) {
        const { data: existingParticipants, error: existingParticipantsError } = await supabase
          .from('golf_conversation_participants')
          .select('user_id')
          .eq('conversation_id', reuseTarget.id);

        // The `error` is READ. Discarded, a failure produced an EMPTY set of
        // existing ids, so `missingIds` below became every desired recipient and
        // the insert re-added people who were already in the conversation.
        // golf_conversation_participants carries UNIQUE (conversation_id,
        // user_id), so that insert raises 23505, the checked `syncError` throws,
        // and the coach's team broadcast fails outright with "Failed to update
        // broadcast recipients" — blaming their recipient list for a dropped
        // read.
        //
        // Refuse honestly instead: if we cannot see who is already in the
        // conversation, we cannot tell who is missing.
        if (existingParticipantsError) {
          await logServerError(
            `[Broadcast] participant read failed on reuse of conversation ${reuseTarget.id}; refusing rather than re-adding every recipient into a unique-constraint failure: ${describeError(existingParticipantsError)}`,
            { action: 'messages.createGolfTeamBroadcast' },
          );
          throw new Error('Could not confirm the current recipients. Please try again.');
        }

        const existingIds = new Set((existingParticipants ?? []).map((p) => p.user_id));
        const missingIds = desiredParticipantIds.filter((id) => !existingIds.has(id));

        if (missingIds.length > 0) {
          const { error: syncError } = await supabase
            .from('golf_conversation_participants')
            .insert(
              missingIds.map((userId) => ({
                conversation_id: reuseTarget.id,
                user_id: userId,
                joined_at: new Date().toISOString(),
              })),
            );

          if (syncError) {
            await logServerError(`[Broadcast] Failed to sync participants on reuse: ${describeError(syncError)}`, { action: 'messages.createGolfTeamBroadcast' });
            throw new Error(`Failed to update broadcast recipients: ${syncError.message}`);
          }
        }

        return { conversationId: reuseTarget.id, reused: true };
      }
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
      await logServerError(`[Broadcast] Conversation create error: ${describeError(convError)}`, { action: 'messages.createGolfTeamBroadcast' });
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
      await logServerError(`[Broadcast] Failed to add participants: ${describeError(participantsError)}`, { action: 'messages.createGolfTeamBroadcast' });
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

    return { conversationId, reused: false };
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
): Promise<{ conversationId: string; reused?: boolean } | { error: string }> {
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
      await logServerError(`[Messages] Failed to update message: ${describeError(updateError)}`, { action: 'messages.updateMessage' });
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
      await logServerError(`[Messages] Failed to delete message: ${describeError(deleteError)}`, { action: 'messages.deleteMessage' });
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
    await logServerError(`[getGolfPlayerUserId] Error: ${describeError(error)}`, { action: 'messages.getGolfPlayerUserId' });
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
    // Escape SQL wildcards AND the escape character itself. Escaping only
    // `%`/`_` left a user-typed backslash in the pattern, where it re-armed
    // the very wildcard it was meant to neutralise (CodeQL
    // js/incomplete-sanitization).
    const escapedQuery = escapeLikePattern(trimmedQuery);
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

// ============================================================================
// Golf group membership — add, remove, leave
// ============================================================================
//
// These three write paths sit behind `golf_participants_insert_v2` and
// `golf_participants_delete`. Only LEAVE is permitted by the policies as they
// stand in production today (`USING (user_id = auth.uid())`).
//
// ADD and REMOVE additionally require
// `20260907160000_golf_team_chat_membership_management.sql` to have been
// APPLIED. Until it is, both return the database's refusal rather than
// pretending to succeed, and `maybeCaptureRlsDenial` records the 42501 so a
// pre-migration attempt shows up as a signal instead of a mystery toast. The
// UI reaches these only for a team chat's creator, which is the same predicate
// both new policy branches carry — so a permitted click and a refused one are
// distinguished by whether the migration is live, not by who is asking.
//
// Every membership bound is enforced by RLS, not here. The checks below exist
// to fail EARLY with a readable message and to keep an unauthorized attempt out
// of the database, never as the security boundary: an action that only checked
// in TypeScript would be bypassable by any other client holding the same JWT.

interface GolfGroupMemberCandidate {
  userId: string;
  name: string;
  avatarUrl: string | null;
  subtitle: string | null;
  type: 'coach' | 'player';
}

/**
 * The conversation, if it is a golf TEAM CHAT the current user created.
 *
 * Returns the row rather than a boolean because every caller needs `team_id`
 * next, and re-reading it would be a second round trip against a row the RLS
 * check already had to touch.
 */
async function loadGolfGroupIOwn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string,
): Promise<{ id: string; team_id: string | null }> {
  const { data: conversation, error } = await supabase
    .from('golf_conversations')
    .select('id, team_id, created_by, is_team_chat')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    maybeCaptureRlsDenial(error, {
      table: 'golf_conversations',
      verb: 'select',
      action: 'messages.loadGolfGroupIOwn',
      sport: 'golf',
      feature: 'messaging',
      userId,
    });
    throw new Error('Conversation not found');
  }
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  if (!conversation.is_team_chat || !conversation.team_id) {
    // Deliberately the same bound both new policy branches carry: a DM's
    // membership is fixed at creation, which is what the 2026-08-19 hardening
    // was written to guarantee.
    throw new Error('Only team group chats can change members');
  }
  if (conversation.created_by !== userId) {
    throw new Error('Only the group creator can change members');
  }

  return { id: conversation.id, team_id: conversation.team_id };
}

/**
 * Everyone on the group's team who is not already in it.
 *
 * Coaches AND players — `getGolfTeamPlayersForBroadcast` returns players only,
 * which would silently make assistant coaches unaddable.
 */
async function getGolfGroupAddCandidatesImpl(
  conversationId: string,
): Promise<{ candidates: GolfGroupMemberCandidate[] } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const conversation = await loadGolfGroupIOwn(supabase, conversationId, user.id);
    const teamId = conversation.team_id as string;

    const [existing, members, staff] = await Promise.all([
      supabase
        .from('golf_conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId),
      supabase
        .from('golf_team_members')
        .select('status, player:golf_players(user_id, first_name, last_name, avatar_url, graduation_year)')
        .eq('team_id', teamId)
        .eq('status', 'active'),
      supabase
        .from('golf_team_coach_staff')
        .select('coach:golf_coaches(user_id, full_name, avatar_url, title)')
        .eq('team_id', teamId),
    ]);

    // The participant list is the exclusion set, so an error here cannot be
    // absorbed: an empty set would offer to add people who are already in the
    // group, and adding them again is a unique-violation the user reads as a
    // bug.
    if (existing.error) {
      maybeCaptureRlsDenial(existing.error, {
        table: 'golf_conversation_participants',
        verb: 'select',
        action: 'messages.getGolfGroupAddCandidates',
        sport: 'golf',
        feature: 'messaging',
        userId: user.id,
      });
      throw new Error('Failed to load current members');
    }

    // The roster reads cannot be absorbed either, and for the opposite reason.
    // Both run under the caller's RLS; on error `.data` is null, both loops
    // below iterate zero times, and the sheet renders "Everyone on this team
    // is already in the group." A failed read and a genuinely-full group would
    // be indistinguishable — and one of them means "try again".
    //
    // Each `.error` is named directly rather than walked through a list.
    // `helm/no-unchecked-supabase-error` is syntactic: it pairs a `.data` read
    // with a `.error` read on the SAME identifier, and cannot see an error
    // reached through an intermediate object. Both of these reads were
    // unchecked before this change, and both were counted.
    if (members.error) {
      maybeCaptureRlsDenial(members.error, {
        table: 'golf_team_members',
        verb: 'select',
        action: 'messages.getGolfGroupAddCandidates',
        sport: 'golf',
        feature: 'messaging',
        userId: user.id,
      });
      throw new Error('Failed to load the team roster');
    }

    if (staff.error) {
      maybeCaptureRlsDenial(staff.error, {
        table: 'golf_team_coach_staff',
        verb: 'select',
        action: 'messages.getGolfGroupAddCandidates',
        sport: 'golf',
        feature: 'messaging',
        userId: user.id,
      });
      throw new Error('Failed to load the team roster');
    }

    const alreadyIn = new Set((existing.data ?? []).map((p) => p.user_id));

    const candidates: GolfGroupMemberCandidate[] = [];

    for (const row of staff.data ?? []) {
      const coach = row.coach as {
        user_id: string | null;
        full_name: string | null;
        avatar_url: string | null;
        title: string | null;
      } | null;
      if (!coach?.user_id || alreadyIn.has(coach.user_id)) continue;
      candidates.push({
        userId: coach.user_id,
        name: coach.full_name || 'Coach',
        avatarUrl: coach.avatar_url,
        subtitle: coach.title || null,
        type: 'coach',
      });
    }

    for (const row of members.data ?? []) {
      const player = row.player as {
        user_id: string | null;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        graduation_year: number | null;
      } | null;
      if (!player?.user_id || alreadyIn.has(player.user_id)) continue;
      candidates.push({
        userId: player.user_id,
        name: [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Player',
        avatarUrl: player.avatar_url,
        subtitle: player.graduation_year ? `Class of ${player.graduation_year}` : null,
        type: 'player',
      });
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));

    return { candidates };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

const observedGetGolfGroupAddCandidates = withAdminObserved(
  'getGolfGroupAddCandidates',
  { sport: 'golf', feature: 'messaging' },
  getGolfGroupAddCandidatesImpl,
);

export async function getGolfGroupAddCandidates(
  conversationId: string,
): Promise<{ candidates: GolfGroupMemberCandidate[] } | { error: string }> {
  return observedGetGolfGroupAddCandidates(conversationId);
}

async function addGolfGroupMemberImpl(
  conversationId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    await loadGolfGroupIOwn(supabase, conversationId, user.id);

    const { error } = await supabase
      .from('golf_conversation_participants')
      .insert({ conversation_id: conversationId, user_id: userId });

    if (error) {
      // 23505 is a duplicate participant, which is a race (two coaches, or a
      // double tap) rather than a failure — the desired end state already
      // holds, so report success rather than an error the user cannot act on.
      if (error.code === '23505') {
        return { success: true };
      }
      maybeCaptureRlsDenial(error, {
        table: 'golf_conversation_participants',
        verb: 'insert',
        action: 'messages.addGolfGroupMember',
        sport: 'golf',
        feature: 'messaging',
        userId: user.id,
      });
      await logServerError(
        `[Messages] Failed to add group member: ${describeError(error)}`,
        {
          action: 'messages.addGolfGroupMember',
          metadata: { code: error.code, conversationId, targetUserId: userId },
        },
      );
      throw new Error('Could not add that member');
    }

    await logSecurityEvent({
      event: 'golf_group_member_added',
      action: 'golf_group_member_added',
      userId: user.id,
      metadata: { conversationId, targetUserId: userId },
    });

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

const observedAddGolfGroupMember = withAdminObserved(
  'addGolfGroupMember',
  { sport: 'golf', feature: 'messaging' },
  addGolfGroupMemberImpl,
);

export async function addGolfGroupMember(
  conversationId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  return observedAddGolfGroupMember(conversationId, userId);
}

async function removeGolfGroupMemberImpl(
  conversationId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    if (userId === user.id) {
      // Not a policy bound — the creator CAN delete their own row, through the
      // self branch. It is a product bound: that path is "Leave group", which
      // has its own confirmation and its own consequence (you lose the thread),
      // and routing it through "Remove" would hide that behind a member row.
      throw new Error('Use Leave group to remove yourself');
    }

    await loadGolfGroupIOwn(supabase, conversationId, user.id);

    // Deleting by (conversation_id, user_id) rather than by the row's own id:
    // the caller names a person, not a row, and the pair is what RLS is written
    // against. Both equalities are present so this can never widen to "every
    // row for this user" if the conversation filter were ever dropped.
    const { error } = await supabase
      .from('golf_conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (error) {
      maybeCaptureRlsDenial(error, {
        table: 'golf_conversation_participants',
        verb: 'delete',
        action: 'messages.removeGolfGroupMember',
        sport: 'golf',
        feature: 'messaging',
        userId: user.id,
      });
      await logServerError(
        `[Messages] Failed to remove group member: ${describeError(error)}`,
        {
          action: 'messages.removeGolfGroupMember',
          metadata: { code: error.code, conversationId, targetUserId: userId },
        },
      );
      throw new Error('Could not remove that member');
    }

    await logSecurityEvent({
      event: 'golf_group_member_removed',
      action: 'golf_group_member_removed',
      userId: user.id,
      metadata: { conversationId, targetUserId: userId },
    });

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

const observedRemoveGolfGroupMember = withAdminObserved(
  'removeGolfGroupMember',
  { sport: 'golf', feature: 'messaging' },
  removeGolfGroupMemberImpl,
);

export async function removeGolfGroupMember(
  conversationId: string,
  userId: string,
): Promise<{ success: true } | { error: string }> {
  return observedRemoveGolfGroupMember(conversationId, userId);
}

/**
 * Leave a golf group.
 *
 * The one membership mutation permitted by production RLS as it stands: the
 * baseline `golf_participants_delete` is `USING (user_id = auth.uid())`. It
 * needs no creator check and no team check — the policy's own predicate is the
 * whole bound, and there is nothing this action could usefully verify that the
 * database does not already.
 */
async function leaveGolfGroupImpl(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { error } = await supabase
      .from('golf_conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    if (error) {
      maybeCaptureRlsDenial(error, {
        table: 'golf_conversation_participants',
        verb: 'delete',
        action: 'messages.leaveGolfGroup',
        sport: 'golf',
        feature: 'messaging',
        userId: user.id,
      });
      await logServerError(
        `[Messages] Failed to leave group: ${describeError(error)}`,
        {
          action: 'messages.leaveGolfGroup',
          metadata: { code: error.code, conversationId },
        },
      );
      throw new Error('Could not leave that group');
    }

    await logSecurityEvent({
      event: 'golf_group_left',
      action: 'golf_group_left',
      userId: user.id,
      metadata: { conversationId },
    });

    return { success: true };
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

const observedLeaveGolfGroup = withAdminObserved(
  'leaveGolfGroup',
  { sport: 'golf', feature: 'messaging' },
  leaveGolfGroupImpl,
);

export async function leaveGolfGroup(
  conversationId: string,
): Promise<{ success: true } | { error: string }> {
  return observedLeaveGolfGroup(conversationId);
}
