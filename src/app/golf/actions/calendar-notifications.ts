'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { withAdminObserved } from '@/lib/admin/observed-action';
import type { ActionResult } from './golf-action-shared';

/** Calendar notification */
export interface CalendarNotification {
  id: string;
  user_id: string;
  event_id: string | null;
  notification_type: string;
  title: string | null;
  message: string | null;
  sent_at: string | null;
  read_at: string | null;
  action_url: string | null;
  created_at: string | null;
}
/**
 * Get all calendar notifications for the current user
 * Note: golf_calendar_notifications table may not be in types
 */
async function getNotificationsImpl(limit: number = 50): Promise<ActionResult<CalendarNotification[]>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('golf_calendar_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: 'Failed to fetch notifications' };
    }

    return { success: true, data: (data || []) as CalendarNotification[] };

  } catch {
    return { success: false, error: 'Failed to fetch notifications' };
  }
}
const observedGetNotifications = withAdminObserved(
  'getNotifications',
  { sport: 'golf', feature: 'notifications' },
  getNotificationsImpl,
);
export async function getNotifications(limit: number = 50): Promise<ActionResult<CalendarNotification[]>> {
  return observedGetNotifications(limit);
}
/**
 * Mark a notification as read
 * Note: golf_calendar_notifications table may not be in types
 */
async function markNotificationReadImpl(
  notificationId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_calendar_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch {
    return { success: false, error: 'Failed to mark notification read' };
  }
}
const observedMarkNotificationRead = withAdminObserved(
  'markNotificationRead',
  { sport: 'golf', feature: 'notifications' },
  markNotificationReadImpl,
);
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  return observedMarkNotificationRead(notificationId);
}
/**
 * Mark all notifications as read for the current user
 * Note: golf_calendar_notifications table may not be in types
 */
async function markAllNotificationsReadImpl(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_calendar_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);

    revalidatePath('/golf/dashboard');
    return { success: true, data: undefined };

  } catch {
    return { success: false, error: 'Failed to mark notifications read' };
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
