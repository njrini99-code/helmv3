'use server';

/**
 * Server Actions for Coach Notification Badge Counts
 *
 * Provides notification counts for coaches:
 * - Unread calendar notifications (RSVP responses, etc.)
 * - Unread messages
 */

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CoachNotificationCounts {
  calendarNotifications: number;
  unreadMessages: number;
}

/**
 * Returns badge counts for a coach.
 * Queries golf_calendar_notifications and golf_messages.
 */
async function getCoachNotificationCountsImpl(
  userId: string,
  _teamId?: string,
): Promise<ActionResult<CoachNotificationCounts>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Run queries in parallel
    const [calendarResult, conversationsResult] = await Promise.all([
      // 1. Unread calendar notifications
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_calendar_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null) as Promise<{ count: number | null; error: unknown }>,

      // 2. Conversations the coach participates in
      supabase
        .from('golf_conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId),
    ]);

    const calendarNotifications = calendarResult.count || 0;

    // Count unread messages
    let unreadMessages = 0;
    const participants = conversationsResult.data || [];
    if (participants.length > 0) {
      const counts = await Promise.all(
        participants.map(async (p) => {
          const { count } = await supabase
            .from('golf_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', p.conversation_id)
            .neq('sender_id', userId)
            .gt('created_at', p.last_read_at || '1970-01-01');
          return count || 0;
        })
      );
      unreadMessages = counts.reduce((sum, c) => sum + c, 0);
    }

    return {
      success: true,
      data: {
        calendarNotifications,
        unreadMessages,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch coach notification counts' };
  }
}

const observedGetCoachNotificationCounts = withAdminObserved(
  'getCoachNotificationCounts',
  { sport: 'golf', feature: 'notifications' },
  getCoachNotificationCountsImpl,
);

export async function getCoachNotificationCounts(
  userId: string,
  _teamId?: string,
): Promise<ActionResult<CoachNotificationCounts>> {
  return observedGetCoachNotificationCounts(userId, _teamId);
}
