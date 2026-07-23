'use server';

/**
 * ============================================================================
 * Unified in-app notifications feed — server actions
 * ----------------------------------------------------------------------------
 * Reads a merged, per-user feed across the two real notification pipelines
 * that already write rows but (until this file) had zero UI reader:
 *
 *   • `notifications`               — CoachHelm dispatch.ts + task-reminders.ts
 *   • `golf_calendar_notifications` — event/RSVP lifecycle (golf.ts)
 *
 * Own-rows only (RLS-scoped by `user_id = auth.uid()` on both tables, plus an
 * explicit `.eq('user_id', user.id)` filter here as defense-in-depth on every
 * query — never a service-role/admin client). All pure normalize/categorize/
 * merge/sort logic lives in `unified-notifications-model.ts` (a plain module —
 * a `'use server'` file may only export async server actions, so none of that
 * logic could live here directly).
 *
 * Auth-missing contract (mirrors alerts.ts / coach-notifications.ts): the
 * badge-adjacent reads in this file are polled from a client provider that
 * outlives logout/session-idle-expiry, so a missing session is an EXPECTED,
 * frequent state, not an incident. Every read here returns a silent, honest
 * empty result (`success: true`, `authExpired: true`) instead of
 * `{success:false}` — the latter shape gets persisted to the Bridge by
 * `observeActionSoftFailure` on every single poll for the lifetime of a
 * stale tab.
 * ========================================================================== */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import {
  clampNotificationsLimit,
  mergeAndSortNotifications,
  normalizeCalendarNotificationRow,
  normalizeNotificationRow,
  type NotificationSource,
  type RawCalendarNotificationRow,
  type RawNotificationRow,
  type UnifiedNotificationItem,
} from './unified-notifications-model';

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  /**
   * True when the caller has no live session. Several callers here (the
   * badge poll, a freshly-mounted feed panel) keep calling after logout /
   * idle-timeout expiry — see notification-badge-context.tsx — so this is an
   * honest "nothing to show", never a soft failure worth Bridge noise.
   */
  authExpired?: boolean;
}

export interface UnifiedNotificationsResult {
  items: UnifiedNotificationItem[];
  /** Total unread across BOTH sources — independent of the fetched page/limit. */
  unreadCount: number;
}

// ============================================================================
// GET UNIFIED NOTIFICATIONS (the feed panel + home "Latest" module)
// ============================================================================

async function getUnifiedNotificationsImpl(
  params: { limit?: number; before?: string } = {},
): Promise<ActionResult<UnifiedNotificationsResult>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: true, data: { items: [], unreadCount: 0 }, authExpired: true };
  }

  const limit = clampNotificationsLimit(params.limit);
  const before = params.before;

  try {
    let notificationsQuery = supabase
      .from('notifications')
      .select('id, type, title, body, action_url, created_at, read_at, data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) notificationsQuery = notificationsQuery.lt('created_at', before);

    let calendarQuery = supabase
      .from('golf_calendar_notifications')
      .select('id, notification_type, title, message, action_url, created_at, read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) calendarQuery = calendarQuery.lt('created_at', before);

    const [notificationsResult, calendarResult, notificationsUnread, calendarUnread] = await Promise.all([
      notificationsQuery,
      calendarQuery,
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null),
      supabase
        .from('golf_calendar_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null),
    ]);

    if (notificationsResult.error) {
      await logServerError(`getUnifiedNotifications: notifications query failed: ${notificationsResult.error.message}`, {
        action: 'getUnifiedNotifications',
        featureArea: 'notifications',
        extra: { errorCode: notificationsResult.error.code },
      });
    }
    if (calendarResult.error) {
      await logServerError(`getUnifiedNotifications: golf_calendar_notifications query failed: ${calendarResult.error.message}`, {
        action: 'getUnifiedNotifications',
        featureArea: 'notifications',
        extra: { errorCode: calendarResult.error.code },
      });
    }

    const notificationItems = (notificationsResult.data ?? []).map((row) =>
      normalizeNotificationRow(row as RawNotificationRow),
    );
    const calendarItems = (calendarResult.data ?? []).map((row) =>
      normalizeCalendarNotificationRow(row as RawCalendarNotificationRow),
    );
    const items = mergeAndSortNotifications(notificationItems, calendarItems, limit);

    const unreadCount = (notificationsUnread.count ?? 0) + (calendarUnread.count ?? 0);

    return { success: true, data: { items, unreadCount } };
  } catch (error) {
    await logServerError(`getUnifiedNotifications failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getUnifiedNotifications',
      featureArea: 'notifications',
    });
    return { success: false, error: 'Failed to load notifications' };
  }
}

const observedGetUnifiedNotifications = withAdminObserved(
  'getUnifiedNotifications',
  { sport: 'golf', feature: 'notifications' },
  getUnifiedNotificationsImpl,
);

export async function getUnifiedNotifications(
  params: { limit?: number; before?: string } = {},
): Promise<ActionResult<UnifiedNotificationsResult>> {
  return observedGetUnifiedNotifications(params);
}

// ============================================================================
// GET UNREAD COUNT (lightweight — for the badge poll's existing 45s cycle;
// `golf_calendar_notifications` unread is already covered by
// getCoachNotificationCounts/getPlayerNotificationCounts' `calendarNotifications`
// field, so this covers ONLY the `notifications` table to avoid a redundant
// second count of the same rows on every poll tick).
// ============================================================================

async function getNotificationsUnreadCountImpl(): Promise<ActionResult<{ unread: number }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: true, data: { unread: 0 }, authExpired: true };
  }

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (error) {
      return { success: false, error: 'Failed to fetch unread count' };
    }

    return { success: true, data: { unread: count ?? 0 } };
  } catch (error) {
    await logServerError(`getNotificationsUnreadCount failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'getNotificationsUnreadCount',
      featureArea: 'notifications',
    });
    return { success: false, error: 'Failed to fetch unread count' };
  }
}

const observedGetNotificationsUnreadCount = withAdminObserved(
  'getNotificationsUnreadCount',
  { sport: 'golf', feature: 'notifications' },
  getNotificationsUnreadCountImpl,
);

export async function getNotificationsUnreadCount(): Promise<ActionResult<{ unread: number }>> {
  return observedGetNotificationsUnreadCount();
}

// ============================================================================
// MARK ONE READ
// ============================================================================

async function markNotificationReadImpl(id: string, source: NotificationSource): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: true, authExpired: true };
  }

  try {
    const readAt = new Date().toISOString();

    if (source === 'notifications') {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: readAt })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('golf_calendar_notifications')
        .update({ read_at: readAt })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    }

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    await logServerError(`markNotificationRead failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'markNotificationRead',
      featureArea: 'notifications',
      extra: { source },
    });
    return { success: false, error: 'Failed to mark notification read' };
  }
}

const observedMarkNotificationRead = withAdminObserved(
  'markNotificationRead',
  { sport: 'golf', feature: 'notifications' },
  markNotificationReadImpl,
);

export async function markNotificationRead(id: string, source: NotificationSource): Promise<ActionResult> {
  return observedMarkNotificationRead(id, source);
}

// ============================================================================
// MARK ALL READ (both sources, own rows only)
// ============================================================================

async function markAllNotificationsReadImpl(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: true, authExpired: true };
  }

  try {
    const readAt = new Date().toISOString();
    const [notificationsUpdate, calendarUpdate] = await Promise.all([
      supabase
        .from('notifications')
        .update({ read: true, read_at: readAt })
        .eq('user_id', user.id)
        .is('read_at', null),
      supabase
        .from('golf_calendar_notifications')
        .update({ read_at: readAt })
        .eq('user_id', user.id)
        .is('read_at', null),
    ]);

    if (notificationsUpdate.error) throw notificationsUpdate.error;
    if (calendarUpdate.error) throw calendarUpdate.error;

    revalidatePath('/golf/dashboard');
    return { success: true };
  } catch (error) {
    await logServerError(`markAllNotificationsRead failed: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'markAllNotificationsRead',
      featureArea: 'notifications',
    });
    return { success: false, error: 'Failed to mark all notifications read' };
  }
}

const observedMarkAllNotificationsRead = withAdminObserved(
  'markAllNotificationsRead',
  { sport: 'golf', feature: 'notifications' },
  markAllNotificationsReadImpl,
);

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return observedMarkAllNotificationsRead();
}
