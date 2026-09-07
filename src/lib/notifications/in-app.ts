import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { Json } from '@/lib/types/database';

/**
 * In-app bell fan-out for events whose only other delivery is email.
 *
 * Why this exists: `sendEmailNotification` is gated by the customer-email kill
 * switch, and its own comment used to claim the generic `notifications` table
 * "is not read by any golf UI, so we skip it." That has not been true since
 * the unified notification surface shipped — `getUnifiedNotifications` and
 * `getNotificationsUnreadCount` (src/app/golf/actions/unified-notifications.ts)
 * read exactly that table to drive NotificationBell and the badge context. So
 * with the email gate off, a player whose coach created a qualifier or
 * assigned them a development plan received NO signal anywhere: no email, no
 * bell row, no badge. The only way to find out was to browse to the page.
 *
 * Writing the row here, rather than inside the email path, is the point: the
 * in-app signal must not inherit the email gate's state.
 *
 * SERVICE-ROLE, for the same reason announcements.ts uses it on this table:
 * RLS on `notifications` permits self-inserts only, and these rows are written
 * FOR a player BY the coach's request. Callers must have already authorized
 * the recipient set (both current callers derive it from the coach's own team
 * via golf_players.user_id).
 *
 * Best-effort by contract: a failure is logged and swallowed. The bell is a
 * convenience surface; it must never take down the action that triggered it.
 */
export async function recordInAppNotification(input: {
  /** auth user id — NOT a golf_players.id / golf_coaches.id domain id. */
  userIds: readonly string[];
  type: 'event_reminder' | 'dev_plan_assigned';
  title: string;
  body: string;
  actionUrl: string;
  /**
   * Categorization tag read by `categorizeNotificationRow`. Rows sharing the
   * `event_reminder` enum value are told apart by a discriminator here.
   */
  data?: Record<string, Json>;
  /** For the error log, so a failure names the feature that lost its signal. */
  context: string;
}): Promise<void> {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (userIds.length === 0) return;

  try {
    const { error } = await createAdminClient()
      .from('notifications')
      .insert(
        userIds.map((userId) => ({
          user_id: userId,
          type: input.type,
          title: input.title,
          body: input.body,
          action_url: input.actionUrl,
          data: (input.data ?? null) as Json,
          read: false,
        })),
      );
    if (error) {
      await logServerError(
        `${input.context}: in-app notification insert failed for ${userIds.length} recipient(s); they will see no bell entry or badge for this event: ${error.message}`,
        { action: input.context, featureArea: 'notifications' },
        'warning',
      );
    }
  } catch (err) {
    await logServerError(
      `${input.context}: in-app notification insert threw: ${describeError(err)}`,
      { action: input.context, featureArea: 'notifications' },
      'warning',
    );
  }
}
