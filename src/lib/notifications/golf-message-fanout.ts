import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyNewMessage } from '@/lib/notifications';
import { sendPushNotification } from '@/lib/notifications/push';
import { logServerError } from '@/lib/server-error-logger';

/**
 * Fan out "new message" notifications (email + push + in-app bell) to every
 * OTHER participant in a golf conversation. Shared by the text-only send
 * path (sendGolfMessageImpl in src/app/actions/messages.ts) and the
 * attachments send path (sendGolfMessageWithAttachmentsImpl in
 * src/app/golf/actions/message-attachments.ts) so the two stay symmetric —
 * the attachments path previously fired none of these at all (P1), so a
 * photo/document-only message was invisible to the recipient until they
 * manually opened Messages.
 *
 * Lives here (not as an export of messages.ts) so it isn't itself a
 * client-callable 'use server' action subject to the messaging
 * coverage-contract's withAdminObserved-wrap requirement — it's an internal
 * fan-out helper invoked by already-wrapped actions, not an action itself.
 *
 * Best-effort / non-fatal: the caller has already committed the message by
 * the time this runs, so a notification failure here is logged and
 * swallowed, never surfaced as a send failure.
 */
export async function notifyGolfMessageRecipients(
  conversationId: string,
  senderId: string,
  previewText: string,
): Promise<void> {
  try {
    const supabase = await createClient();

    // Get other participants' user IDs
    const { data: otherParticipants } = await supabase
      .from('golf_conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', senderId);

    if (!otherParticipants || otherParticipants.length === 0) return;

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
      supabase.from('golf_coaches').select('full_name').eq('user_id', senderId).maybeSingle(),
      supabase.from('golf_players').select('first_name, last_name').eq('user_id', senderId).maybeSingle(),
      supabase.from('users').select('email').eq('id', senderId).maybeSingle(),
      supabase.from('users').select('id, email').in('id', recipientUserIds),
    ]);

    const senderName = senderCoach?.full_name
      || (senderPlayer ? `${senderPlayer.first_name || ''} ${senderPlayer.last_name || ''}`.trim() : '')
      || senderUser?.email
      || 'Someone';

    if (!recipientProfiles) return;

    // Email notifications
    await Promise.allSettled(
      recipientProfiles.map(r =>
        r.email
          ? notifyNewMessage(r.id, r.email, senderName, previewText, conversationId, 'golf')
          : Promise.resolve()
      )
    );

    // Push notifications — carry the conversation id so the push payload
    // deep-links straight to the thread that fired it (P260).
    await Promise.allSettled(
      recipientProfiles.map(r =>
        sendPushNotification('new_message', r.id, {
          senderName,
          preview: previewText,
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
      message: previewText,
      action_url: `/golf/dashboard/messages?conversation=${conversationId}`,
    }));
    // Use admin client to bypass RLS — inserting notifications for other users
    const adminClient = createAdminClient();
    await adminClient
      .from('golf_calendar_notifications')
      .insert(inAppNotifs);
  } catch (notifErr) {
    // Never block message delivery on notification failure
    await logServerError(`[notifyGolfMessageRecipients] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'notifications.notifyGolfMessageRecipients' });
  }
}
