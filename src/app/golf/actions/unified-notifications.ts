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
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import {
  calendarUnreadCutoffIso,
  clampNotificationsLimit,
  composeFirstPage,
  insightIdOfReceipt,
  mergeAndSortNotifications,
  normalizeCalendarNotificationRow,
  partitionExpiredReceipts,
  normalizeNotificationRow,
  type NotificationSource,
  type RawCalendarNotificationRow,
  type RawNotificationRow,
  type UnifiedNotificationItem,
} from './unified-notifications-model';
import { describeError } from '@/lib/utils/describe-error';

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
// EXPIRED COACHHELM RECEIPTS (audit row 53)
// ----------------------------------------------------------------------------
// A receipt points at an insight via data.insightId. When that insight is later
// archived, dismissed or otherwise hidden (5 of 90 prod receipts), the tap
// lands on nothing, yet the row stayed unread forever. Read-side expiry: such
// receipts are dropped from the feed and from the unread count. No row is
// deleted. Fails open: on any query error nothing is treated as expired.
// ============================================================================

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const RECEIPT_EXPIRY_SCAN_LIMIT = 500;
const INSIGHT_ID_CHUNK = 100;

async function visibleInsightIds(supabase: ServerClient, ids: readonly string[]): Promise<Set<string> | null> {
  const visible = new Set<string>();
  for (let i = 0; i < ids.length; i += INSIGHT_ID_CHUNK) {
    const chunk = ids.slice(i, i + INSIGHT_ID_CHUNK);
    const { data, error } = await applyInsightVisibility(
      supabase.from('golf_coach_insights').select('id').in('id', chunk),
    );
    if (error) return null;
    for (const row of data ?? []) visible.add(row.id);
  }
  return visible;
}

/** Ids of the user's CoachHelm receipts whose insight is no longer visible,
 *  and how many of those are unread. */
async function expiredReceipts(
  supabase: ServerClient,
  userId: string,
  pageRows: ReadonlyArray<{ id: string; read_at: string | null; data: RawNotificationRow['data'] }>,
): Promise<{ expired: Set<string>; expiredUnread: number }> {
  const none = { expired: new Set<string>(), expiredUnread: 0 };
  try {
    const { data: unreadRows, error } = await supabase
      .from('notifications')
      .select('id, read_at, data')
      .eq('user_id', userId)
      .is('read_at', null)
      .not('data->>insightId', 'is', null)
      .limit(RECEIPT_EXPIRY_SCAN_LIMIT);
    if (error) return none;

    const rows = [...pageRows, ...((unreadRows ?? []) as typeof pageRows)];
    const insightIds = [...new Set(rows.map((r) => insightIdOfReceipt(r.data)).filter((id): id is string => !!id))];
    if (insightIds.length === 0) return none;

    const visible = await visibleInsightIds(supabase, insightIds);
    if (!visible) return none;
    return partitionExpiredReceipts(rows, visible);
  } catch {
    return none;
  }
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

    // Calendar rows older than the cutoff no longer count as unread and are
    // collapsed into one summary item on the first page (audit row 56).
    const calendarCutoff = calendarUnreadCutoffIso();

    let calendarQuery = supabase
      .from('golf_calendar_notifications')
      .select('id, notification_type, title, message, action_url, created_at, read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) calendarQuery = calendarQuery.lt('created_at', before);
    else calendarQuery = calendarQuery.gte('created_at', calendarCutoff);

    const [notificationsResult, calendarResult, notificationsUnread, calendarUnread, staleCalendar] = await Promise.all([
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
        .is('read_at', null)
        .gte('created_at', calendarCutoff),
      before
        ? Promise.resolve({ count: 0 })
        : supabase
            .from('golf_calendar_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .lt('created_at', calendarCutoff),
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

    const notificationRows = (notificationsResult.data ?? []) as RawNotificationRow[];
    const { expired, expiredUnread } = await expiredReceipts(supabase, user.id, notificationRows);

    const notificationItems = notificationRows
      .filter((row) => !expired.has(row.id))
      .map((row) => normalizeNotificationRow(row));
    const calendarItems = (calendarResult.data ?? []).map((row) =>
      normalizeCalendarNotificationRow(row as RawCalendarNotificationRow),
    );
    const items = before
      ? mergeAndSortNotifications(notificationItems, calendarItems, limit)
      : composeFirstPage({
          notifications: notificationItems,
          calendar: calendarItems,
          staleCalendarCount: staleCalendar.count ?? 0,
          limit,
        });

    const unreadCount =
      Math.max(0, (notificationsUnread.count ?? 0) - expiredUnread) + (calendarUnread.count ?? 0);

    return { success: true, data: { items, unreadCount } };
  } catch (error) {
    await logServerError(`getUnifiedNotifications failed: ${describeError(error)}`, {
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

    // Same expiry as the feed, so the badge never counts a receipt the feed hides.
    const { expiredUnread } = await expiredReceipts(supabase, user.id, []);
    return { success: true, data: { unread: Math.max(0, (count ?? 0) - expiredUnread) } };
  } catch (error) {
    await logServerError(`getNotificationsUnreadCount failed: ${describeError(error)}`, {
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
    await logServerError(`markNotificationRead failed: ${describeError(error)}`, {
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
    await logServerError(`markAllNotificationsRead failed: ${describeError(error)}`, {
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
