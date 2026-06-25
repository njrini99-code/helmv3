'use server';

// =============================================================================
// src/app/baseball/actions/notifications.ts
//
// Phase F1 — Baseball notification server actions.
//
// Exports four actions scoped to the currently-authenticated user:
//   getBaseballNotifications(limit?)     — ordered list of notifications
//   getUnreadNotificationCount()         — badge integer
//   markNotificationRead(id)             — stamps read_at on one row
//   markAllNotificationsRead()           — stamps read_at on all unread rows
//
// All four run inside withBaseballAction so auth + active-context resolution
// + Sentry scoping are guaranteed. Notification rows are user_id-scoped and
// RLS enforces uid() = user_id — the server actions use ctx.user.id as a
// defense-in-depth secondary filter.
//
// SECURITY
//   - No service_role client — anon client + RLS only.
//   - mark-read operations filter by user_id AND .is('read_at', null) so they
//     are idempotent and never touch another user's rows.
//   - No DELETE. Only UPDATE (read_at) and SELECT.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type { Tables } from '@/lib/types';

// ---------------------------------------------------------------------------
// Exported notification row type
// ---------------------------------------------------------------------------

export type BaseballNotification = Tables['baseball_notifications']['Row'];

// ---------------------------------------------------------------------------
// Shared result shapes
// ---------------------------------------------------------------------------

export interface NotificationsResult {
  success: boolean;
  data?: BaseballNotification[];
  error?: string;
}

export interface CountResult {
  success: boolean;
  count?: number;
  error?: string;
}

export interface NotificationMutationResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Paths to revalidate after a read mutation so server-rendered shells refresh.
// ---------------------------------------------------------------------------

const BASEBALL_SHELL_PATH = '/baseball';

// =============================================================================
// getBaseballNotifications
//
// Returns the most-recent `limit` notifications for the signed-in user,
// newest first. Defaults to 20; callers pass 10 for the popover preview.
// =============================================================================

export const getBaseballNotifications = withBaseballAction(
  'getBaseballNotifications',
  { featureArea: 'baseball-notifications' },
  async (ctx, limit: number = 20): Promise<NotificationsResult> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('baseball_notifications')
      .select('*')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: 'Could not load notifications.' };
    return { success: true, data: (data ?? []) as BaseballNotification[] };
  },
);

// =============================================================================
// getUnreadNotificationCount
//
// Returns the integer count of unread (read_at IS NULL) notifications for
// the signed-in user. Used to drive the bell badge poll every 60 s.
// =============================================================================

export const getUnreadNotificationCount = withBaseballAction(
  'getUnreadNotificationCount',
  { featureArea: 'baseball-notifications' },
  async (ctx): Promise<CountResult> => {
    const supabase = await createClient();

    const { count, error } = await supabase
      .from('baseball_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.user.id)
      .is('read_at', null);

    if (error) return { success: false, error: 'Could not fetch notification count.' };
    return { success: true, count: count ?? 0 };
  },
);

// =============================================================================
// markNotificationRead
//
// Stamps read_at = now() on a single notification belonging to the signed-in
// user. No-op (success) if it is already read or belongs to another user.
// =============================================================================

export const markNotificationRead = withBaseballAction(
  'markNotificationRead',
  { featureArea: 'baseball-notifications' },
  async (ctx, id: string): Promise<NotificationMutationResult> => {
    const supabase = await createClient();

    const { error } = await supabase
      .from('baseball_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', ctx.user.id)
      .is('read_at', null);

    if (error) return { success: false, error: 'Could not mark notification as read.' };
    revalidatePath(BASEBALL_SHELL_PATH);
    return { success: true };
  },
);

// =============================================================================
// markAllNotificationsRead
//
// Stamps read_at = now() on every unread notification for the signed-in user.
// Clears the badge; the NotificationBell calls this when the coach taps
// "Mark all as read".
// =============================================================================

export const markAllNotificationsRead = withBaseballAction(
  'markAllNotificationsRead',
  { featureArea: 'baseball-notifications' },
  async (ctx): Promise<NotificationMutationResult> => {
    const supabase = await createClient();

    const { error } = await supabase
      .from('baseball_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', ctx.user.id)
      .is('read_at', null);

    if (error) return { success: false, error: 'Could not mark all notifications as read.' };
    revalidatePath(BASEBALL_SHELL_PATH);
    return { success: true };
  },
);
