import 'server-only';

/**
 * SECURITY: this module intentionally has NO 'use server' directive. Per
 * Next.js's server-actions guidance, EVERY exported async function in a
 * 'use server' file becomes a public, directly-POSTable endpoint — keyed by
 * its build-time action id, and registered whether or not any client
 * component imports it. Both exports here (`sendPushNotification`,
 * `sendBulkPushNotification`) read `device_tokens` with createAdminClient()
 * (full RLS bypass) on a caller-supplied userId and then fan out to the paid
 * APNs/FCM edge functions, so as actions they would let anyone deliver a
 * spoofed push to any user's real devices. Their auth is the CALLER's:
 * every real call site (server actions under src/app/golf/actions/**, the
 * v3 notification dispatch, the event-reminders cron) derives userId from
 * the DB or an authenticated session before calling in. Keep this a plain
 * server module — the same shape src/lib/notifications/email.ts and
 * src/lib/notifications/golf-message-fanout.ts already use, and the same
 * rationale spelled out at src/lib/golf/progress-drivers.ts:1-28. Import it
 * directly from server code (static or dynamic import); never re-export it
 * from a 'use server' file's export surface.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationType, NotificationPreferences } from './types';
import { getUserNotificationPreferences } from './email';
import { gatedDelivery, type DeliveryNotificationKey } from '@/lib/coachhelm/v3/notifications/types';
import { logServerEvent } from '@/lib/server-error-logger';

/**
 * Maps a notification type to the `push_*` preference key that gates it.
 * `null` means there's no dedicated push preference for this type — it
 * always sends (matches the pre-existing default fall-through below).
 */
function pushDeliveryKeyFor(type: NotificationType): DeliveryNotificationKey | null {
  switch (type) {
    case 'new_message':
      return 'push_messages';
    case 'team_announcement':
    case 'qualifier_created':
    case 'qualifier_updated':
    case 'event_rsvp_reminder':
    case 'round_submitted':
      return 'push_events';
    // Was grouped under 'push_events' — copy/paste drift from before
    // CoachHelm push had its own settings toggle. A user who left
    // "CoachHelm AI" push ON but "Events & reminders" push OFF never
    // received insight pushes even though the switch they saved has
    // nothing to do with push_events.
    case 'coachhelm_insight':
      return 'push_coachhelm';
    case 'task_reminder':
    case 'task_assigned':
    case 'task_completed':
    case 'dev_plan_assigned':
      return 'push_task_reminders';
    default:
      return null;
  }
}

/**
 * Check if user wants push notifications for a specific type.
 *
 * Routed through `gatedDelivery` — the same single source of truth the
 * settings UI (FairwaySettingsGeneral) and `DELIVERY_NOTIFICATION_GROUPS`
 * are built around — so this can't drift from the toggle the user actually
 * sees again, and so `quiet_mode` (persisted on the same
 * users.notification_preferences row `prefs` is read from, even though it
 * isn't part of the `NotificationPreferences` shape) is honoured for push.
 */
function shouldSendPush(
  type: NotificationType,
  prefs: NotificationPreferences
): boolean {
  const key = pushDeliveryKeyFor(type);
  if (!key) return true;
  return gatedDelivery(prefs, key);
}

/**
 * Generate push notification payload based on notification type
 */
function generatePushPayload(
  type: NotificationType,
  data: Record<string, unknown>
): { title: string; body: string; data: Record<string, unknown> } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  switch (type) {
    case 'new_message': {
      // P260: deep-link to the originating thread when the caller supplies its id
      // (?conversation=<id>); fall back to the inbox root otherwise.
      const messagesUrl = data.conversationId
        ? `${baseUrl}/golf/dashboard/messages?conversation=${data.conversationId}`
        : `${baseUrl}/golf/dashboard/messages`;
      return {
        title: `Message from ${data.senderName || 'Someone'}`,
        body: String(data.preview || '').slice(0, 100),
        data: { url: messagesUrl, type },
      };
    }
    case 'team_announcement':
      return {
        title: 'Team Announcement',
        body: String(data.title || ''),
        data: { url: `${baseUrl}/golf/dashboard/announcements`, type },
      };
    case 'task_assigned':
      return {
        title: 'New Task Assigned',
        body: String(data.taskTitle || ''),
        data: { url: `${baseUrl}/golf/dashboard/tasks`, type },
      };
    case 'task_reminder':
      return {
        title: 'Task Reminder',
        body: `"${data.taskTitle}" is due soon`,
        data: { url: `${baseUrl}/golf/dashboard/tasks`, type },
      };
    case 'event_rsvp_reminder':
      return {
        title: 'RSVP Reminder',
        body: `Please RSVP for ${data.eventName || 'an event'}`,
        data: { url: `${baseUrl}/golf/dashboard/calendar`, type },
      };
    case 'qualifier_created':
      return {
        title: 'New Qualifier Posted',
        body: String(data.qualifierName || ''),
        data: { url: `${baseUrl}/golf/dashboard/qualifiers`, type },
      };
    case 'round_submitted':
      return {
        title: 'Round Submitted',
        body: `${data.playerName || 'A player'} shot ${data.totalScore}${data.scoreToPar ? ` (${Number(data.scoreToPar) > 0 ? '+' : ''}${data.scoreToPar})` : ''} at ${data.courseName || 'a course'}`,
        data: { url: `${baseUrl}/golf/dashboard/stats/team`, type },
      };
    case 'coachhelm_insight':
      return {
        title: 'New CoachHelm Insight',
        body: String(data.insightTitle || 'New coaching insight available'),
        data: { url: `${baseUrl}/golf/dashboard/coachhelm`, type },
      };
    case 'qualifier_updated':
      return {
        title: 'Qualifier Updated',
        body: String(data.qualifierName || 'A qualifier has been updated'),
        data: { url: `${baseUrl}/golf/dashboard/qualifiers`, type },
      };
    case 'task_completed':
      return {
        title: 'Task Completed',
        body: `${data.playerName || 'A player'} completed "${data.taskTitle || 'a task'}"`,
        data: { url: `${baseUrl}/golf/dashboard/tasks`, type },
      };
    case 'dev_plan_assigned':
      return {
        title: 'New Development Plan',
        body: String(data.planTitle || ''),
        data: { url: `${baseUrl}/golf/dashboard/my-development`, type },
      };
    default:
      return {
        title: 'Helm Sports',
        body: 'You have a new notification',
        data: { url: baseUrl, type },
      };
  }
}

/**
 * Send a push notification to a single user via the APNs Edge Function.
 *
 * SECURITY CONTRACT: `userId` MUST be server-sourced (authenticated session or
 * trusted DB lookup) — NEVER raw user input. The device-token read below uses
 * the service-role client (so it works from background notifier/cron contexts),
 * which BYPASSES RLS; a user-supplied `userId` would leak another user's device
 * tokens. All current callers pass DB-derived ids.
 */
export async function sendPushNotification(
  type: NotificationType,
  userId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check user preferences
    const prefs = await getUserNotificationPreferences(userId);
    if (!shouldSendPush(type, prefs)) {
      return { success: true }; // User opted out
    }

    // Service-role client: sendPushNotification is invoked from BOTH request
    // scopes (a coach posts a message) AND background contexts (the CoachHelm
    // insight-notifier hook fired from the upsert/cron path). The cookie-based
    // server client calls `cookies()`, which throws "cookies was called outside
    // a request scope" in the background path — surfacing as recurring
    // "insight-notifier: push send reported failure" warnings. The admin client
    // never reads cookies and works in both contexts; device-token reads/writes
    // here are server-trusted and keyed by user_id.
    const supabase = createAdminClient();

    // Get user's active device tokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokens, error: tokenError } = await (supabase as any)
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', userId)
      .eq('active', true) as { data: Array<{ token: string; platform: string }> | null; error: { message: string } | null };

    if (tokenError || !tokens || tokens.length === 0) {
      return { success: true }; // No tokens, not an error
    }

    const payload = generatePushPayload(type, data);

    // Send to each device token via the Edge Function — invoked through the
    // admin client so the service-role auth travels inside the client instead
    // of a raw key in a hand-built header (helmv3-service-role-outside-admin).
    for (const deviceToken of tokens) {
      try {
        // Route by transport, not by one hardcoded function. `send-apns-push`
        // talks to Apple; an Android FCM token sent there is rejected, and a
        // rejection only bumps failed_count, so it fails silently forever.
        // Anything not explicitly 'android' keeps the historical APNs path —
        // rows predating platform-aware registration are iOS.
        const fn = deviceToken.platform === 'android' ? 'send-fcm-push' : 'send-apns-push';
        const { error: invokeError } = await supabase.functions.invoke(fn, {
          body: {
            deviceToken: deviceToken.token,
            platform: deviceToken.platform,
            title: payload.title,
            body: payload.body,
            data: payload.data,
          },
        });

        if (invokeError) {
          // send-apns-push returns { success: false, error, shouldDeactivateToken? }
          // on 410 (Unregistered) / 400 (BadDeviceToken) — Apple's own "this token
          // is dead" signal. Parse it so a permanently-dead token stops being
          // retried on every cron sweep instead of accumulating failed_count
          // forever with zero corrective action. On a non-2xx the error's
          // `context` is the raw Response (FunctionsHttpError); network-level
          // failures have no readable body and fall back to the message.
          let errorText = invokeError.message;
          const errorContext = (invokeError as { context?: Response }).context;
          if (errorContext && typeof errorContext.text === 'function') {
            try {
              errorText = await errorContext.text();
            } catch {
              /* body unreadable — keep the generic error message */
            }
          }
          // Two independent signals, because the DEPLOYED edge function and
          // the copy in this repo have drifted.
          //
          // `supabase/functions/send-apns-push/index.ts` returns
          // `shouldDeactivateToken: true` on 410/400 — but the function
          // actually live in production (slug send-apns-push, v5) returns only
          // `{ success, error, apnsStatus }`; the string
          // "shouldDeactivateToken" does not appear in it. So that flag was
          // permanently `undefined`, no token was ever deactivated, and in
          // production one token reached failed_count 364 while still
          // `active: true` — hammered by the hourly cron forever.
          //
          // Reading the deployed shape as well makes pruning work against BOTH
          // versions, so this self-heals without an edge-function redeploy.
          //
          // BUT: match on the REASON, never on a bare 400. Apple returns 400
          // for roughly fourteen unrelated reasons — BadTopic, MissingTopic,
          // PayloadEmpty, BadExpirationDate, TopicDisallowed, InvalidPushType
          // and friends — of which only a couple are about the token. Those
          // others are CONFIGURATION faults, and a config fault is by nature
          // identical for every token in the sweep. Treating 400 as "dead
          // token" would therefore mass-deactivate every live device in the
          // batch the first time someone mistyped a bundle id — the exact
          // "worse than the bug being fixed" outcome this prune exists to
          // avoid. (Caught in review of this very change, which did do that.)
          //
          // 410 is safe to match on its status alone: Apple only ever returns
          // it for Unregistered, and it is per-token by construction.
          const DEAD_TOKEN_REASONS = new Set([
            'Unregistered',
            'BadDeviceToken',
            'DeviceTokenNotForTopic',
          ]);
          let shouldDeactivateToken = false;
          try {
            const parsed = JSON.parse(errorText) as {
              shouldDeactivateToken?: boolean;
              apnsStatus?: number;
              /** The deployed function puts Apple's `reason` string here. */
              error?: string;
              reason?: string;
            };
            const reason = parsed.reason ?? parsed.error ?? '';
            shouldDeactivateToken =
              parsed.shouldDeactivateToken === true ||
              parsed.apnsStatus === 410 ||
              [...DEAD_TOKEN_REASONS].some((r) => reason.includes(r));
          } catch {
            /* not JSON — fall through, treated as a transient failure */
          }
          console.error(`Push failed for token ${deviceToken.token.slice(0, 8)}...:`, errorText);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: currentToken } = await (supabase as any)
            .from('device_tokens')
            .select('failed_count')
            .eq('token', deviceToken.token)
            .single() as { data: { failed_count: number } | null };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: deactivateError } = await (supabase as any)
            .from('device_tokens')
            .update({
              failed_count: (currentToken?.failed_count || 0) + 1,
              ...(shouldDeactivateToken ? { active: false } : {}),
            })
            .eq('token', deviceToken.token) as { error: { message: string } | null };

          // Prune confirmation: the row's `active: true` gate on the token
          // read above means a deactivated token is never selected again, so
          // this fires exactly once per dead token. Logged at info (not
          // error/warning) so it surfaces as a routine Sentry message / admin
          // feed entry, not an Error issue competing with real incidents.
          if (shouldDeactivateToken && !deactivateError) {
            await logServerEvent(
              `device_tokens pruned: dead APNs token deactivated (user=${userId}, platform=${deviceToken.platform})`,
              {
                action: 'push.sendPushNotification.pruneDeadToken',
                featureArea: 'notifications',
                userId,
                extra: { tokenPrefix: deviceToken.token.slice(0, 8), platform: deviceToken.platform },
              },
              'info',
            );
          }
        } else {
          // Update last_push_at
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('device_tokens')
            .update({ last_push_at: new Date().toISOString(), failed_count: 0 })
            .eq('token', deviceToken.token);
        }
      } catch (err) {
        console.error('Push send error:', err);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send push notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send push notifications to multiple users
 */
export async function sendBulkPushNotification(
  type: NotificationType,
  userIds: string[],
  data: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendPushNotification(type, userId, data);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}
