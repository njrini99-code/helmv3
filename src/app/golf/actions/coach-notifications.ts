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
  /**
   * True when the caller has no live session — the 45s badge poll in
   * notification-badge-context.tsx keeps calling this after logout/session
   * expiry until the tab reloads, which is expected, not an incident. Signals
   * the client to stop polling instead of repeating the same expected miss.
   */
  authExpired?: boolean;
}

export interface CoachNotificationCounts {
  calendarNotifications: number;
  /** NULL means UNKNOWN — a read failed. Not the same as "no unread messages". */
  unreadMessages: number | null;
}

/**
 * Returns badge counts for a coach.
 * Queries golf_calendar_notifications and golf_messages.
 */
async function getCoachNotificationCountsImpl(
  _userId: string,
  _teamId?: string,
): Promise<ActionResult<CoachNotificationCounts>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Silent, expected empty result — see ActionResult.authExpired above.
      // Not a `{success:false}` soft failure: that shape would get persisted
      // to the Bridge (error_logs/admin_events) by observeActionSoftFailure
      // on every 45s poll for the lifetime of a stale/logged-out tab.
      return {
        success: true,
        data: { calendarNotifications: 0, unreadMessages: 0 },
        authExpired: true,
      };
    }

    // DS-04: every query below used to key off the caller-supplied `_userId`,
    // never the session. golf_participants_select_v2 grants read on ANY
    // participant row in a conversation you also belong to, so passing a
    // teammate's id returned their last_read_at — and the per-conversation
    // count below then revealed their unread count. The parameter is kept for
    // the exported signature (notification-badge-context.tsx) but is now
    // ignored: identity comes from the session only.
    const viewerId = user.id;

    // Run queries in parallel
    const [calendarResult, conversationsResult] = await Promise.all([
      // 1. Unread calendar notifications
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_calendar_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', viewerId)
        .is('read_at', null) as Promise<{ count: number | null; error: unknown }>,

      // 2. Conversations the coach participates in
      supabase
        .from('golf_conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', viewerId),
    ]);

    const calendarNotifications = calendarResult.count || 0;

    // Count unread messages.
    //
    // `count || 0` mapped the error channel onto the empty-result value: on a
    // failed read `count` is null, so a fault rendered as a confident "no
    // unread messages". Each conversation is counted independently, so a
    // partial failure produced a partially-wrong badge (2 instead of 7) with
    // nothing to indicate it. A failed participants read is worse — it yields
    // [], skipping the loop, and zeroes every conversation at once.
    //
    // `null` now means UNKNOWN, and the badge holds its previous value rather
    // than dropping to zero. Deliberately NOT returning `{success:false}`: the
    // note at the top of this file records that doing so makes
    // observeActionSoftFailure persist a row on every 45-second poll for the
    // life of a stale tab, which would flood the Bridge during exactly the
    // outage this is meant to survive. For the same reason there is no new log
    // line on this path.
    let unreadMessages: number | null = 0;
    const participantsError = conversationsResult.error != null;
    const participants = conversationsResult.data || [];

    if (participantsError) {
      unreadMessages = null;
    } else if (participants.length > 0) {
      const counts = await Promise.all(
        participants.map(async (p) => {
          const { count, error } = await supabase
            .from('golf_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', p.conversation_id)
            .neq('sender_id', viewerId)
            .gt('created_at', p.last_read_at || '1970-01-01');
          return error ? null : (count ?? 0);
        })
      );
      // One unreadable conversation makes the TOTAL unknown — reporting the
      // partial sum as if it were complete is the same lie, just smaller.
      unreadMessages = counts.some((c) => c === null)
        ? null
        : counts.reduce((sum: number, c) => sum + (c ?? 0), 0);
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
