import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyNewMessage } from '@/lib/notifications';
import { sendPushNotification } from '@/lib/notifications/push';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { allSettledReported } from '@/lib/settled-failures';
import {
  gatedDelivery,
  type DeliveryNotificationPreferences,
} from '@/lib/coachhelm/v3/notifications/types';

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

    // The recipient lookup MUST use the service-role client.
    //
    // `public.users` has exactly two SELECT policies — `users_select_own`
    // (auth.uid() = id) and `admin_read_all` (is_admin()). A coach reading a
    // player's row satisfies neither, so under the caller's RLS-scoped client
    // this returned `[]` — not an error, not null, just nothing. Every branch
    // below then mapped over an empty array and the whole fan-out became a
    // no-op: no email, no push, no bell. In production that meant 31 golf
    // messages produced exactly 0 notifications, silently, for months, because
    // the outer try/catch has nothing to catch.
    //
    // This is not a privilege widening. `recipientUserIds` comes from the
    // participant query above, which IS RLS-scoped to the sender — so we only
    // ever resolve emails for users already proven to share a conversation
    // with them. The admin client is used for the narrowest possible read
    // (id + email for that exact id list), never for authorization.
    const adminClient = createAdminClient();

    // Batch every lookup into ONE round-trip of parallel queries: sender name
    // (coach → player → email fallback) and all recipient emails via a single
    // .in() instead of sequential per-recipient fetches.
    const [
      { data: senderCoach },
      { data: senderPlayer },
      { data: senderUser },
      { data: recipientProfiles, error: recipientLookupError },
    ] = await Promise.all([
      supabase.from('golf_coaches').select('full_name').eq('user_id', senderId).maybeSingle(),
      supabase.from('golf_players').select('first_name, last_name').eq('user_id', senderId).maybeSingle(),
      supabase.from('users').select('email').eq('id', senderId).maybeSingle(),
      adminClient.from('users').select('id, email, notification_preferences').in('id', recipientUserIds),
    ]);

    const senderName = senderCoach?.full_name
      || (senderPlayer ? `${senderPlayer.first_name || ''} ${senderPlayer.last_name || ''}`.trim() : '')
      || senderUser?.email
      || 'Someone';

    // `[]` is truthy. The previous guard was `if (!recipientProfiles) return;`,
    // which let an empty array straight through into three `.map()` calls that
    // each did nothing — the failure mode that hid this bug. An empty list here
    // now means something is genuinely wrong (participants exist, but none of
    // them resolve to a user row), so it is LOUD rather than a silent return.
    if (!recipientProfiles || recipientProfiles.length === 0) {
      // Distinguish the two causes. supabase-js RESOLVES network/Postgrest
      // failures as { data: null, error } rather than throwing, so a genuine
      // query failure never reaches the outer catch — reporting it as "0 user
      // rows" would destroy the only diagnostic and send an on-call engineer
      // hunting a data anomaly that does not exist. A true 0-row result is
      // itself near-impossible anyway (participants.user_id is FK'd to
      // public.users ON DELETE CASCADE), so this branch almost always means
      // the query broke.
      await logServerError(
        recipientLookupError
          ? `[notifyGolfMessageRecipients] Recipient lookup FAILED for ${recipientUserIds.length} participant(s): ${recipientLookupError.message}`
          : `[notifyGolfMessageRecipients] ${recipientUserIds.length} participant(s) resolved to 0 user rows — no notification sent`,
        { action: 'notifications.notifyGolfMessageRecipients' },
      );
      return;
    }

    // Per-recipient delivery preferences. `users.notification_preferences` is
    // the store the settings panel already writes (updateNotificationPreferences),
    // and `gatedDelivery` is the gate CoachHelm v3 already uses — including
    // quiet-mode handling and the documented defaults (email_messages ON,
    // push_messages OFF). Nothing new is invented here; this fan-out was simply
    // never wired to any of it.
    //
    // Before this, every message emailed AND pushed AND belled every other
    // participant unconditionally. In a 12-player group chat one coach post is
    // twelve emails, and a player told their coach "Stop spamming my email" on
    // 2026-08-31 after 33 notifications in a day. Their only remedy was the
    // coach's advice — "just turn the notifications off" — because the toggle
    // they DID have was read by nothing.
    const prefsFor = (r: { notification_preferences?: unknown }) =>
      (r.notification_preferences ?? null) as Partial<DeliveryNotificationPreferences> | null;

    // Email notifications. Reasons are reported, not just counted — see
    // src/lib/settled-failures.ts and INC-2026-08-27.
    await allSettledReported(
      recipientProfiles.map(r =>
        r.email && gatedDelivery(prefsFor(r), 'email_messages')
          ? notifyNewMessage(r.id, r.email, senderName, previewText, conversationId, 'golf')
          : Promise.resolve()
      ),
      { action: 'notifications.notifyGolfMessageRecipients', featureArea: 'messaging', label: 'email' },
    );

    // Push notifications — carry the conversation id so the push payload
    // deep-links straight to the thread that fired it (P260).
    await allSettledReported(
      recipientProfiles.map(r =>
        gatedDelivery(prefsFor(r), 'push_messages')
          ? sendPushNotification('new_message', r.id, {
              senderName,
              preview: previewText,
              conversationId,
            })
          : Promise.resolve()
      ),
      { action: 'notifications.notifyGolfMessageRecipients', featureArea: 'messaging', label: 'push' },
    );

    // In-app notifications (golf_calendar_notifications) — DELIBERATELY not
    // gated. This is the in-product bell, not an outbound channel: it is how a
    // recipient discovers the message at all, and suppressing it would hide
    // mail rather than quiet it. The complaint was about email volume.
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
    // Reuses the admin client created above — inserting bell rows for OTHER
    // users needs RLS bypass. The error was previously discarded, so a failed
    // insert looked identical to a successful one.
    const { error: inAppError } = await adminClient
      .from('golf_calendar_notifications')
      .insert(inAppNotifs);
    if (inAppError) {
      await logServerError(
        `[notifyGolfMessageRecipients] In-app notification insert failed: ${inAppError.message}`,
        { action: 'notifications.notifyGolfMessageRecipients' },
      );
    }
  } catch (notifErr) {
    // Never block message delivery on notification failure
    await logServerError(`[notifyGolfMessageRecipients] Notification error (non-fatal): ${describeError(notifErr)}`, { action: 'notifications.notifyGolfMessageRecipients' });
  }
}
