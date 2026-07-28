'use server';

/**
 * Server Actions for Player Notification Badges & Unseen Announcements
 *
 * Provides:
 * - Badge counts for sidebar (announcements, tasks, messages)
 * - Unseen announcements for the login modal
 * - Mark announcements as seen
 * - Recent announcements for the player hub
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PlayerNotificationCounts {
  unreadAnnouncements: number;
  pendingTasks: number;
  unreadMessages: number;
  unseenTravel: number;
  calendarNotifications: number;
  unseenAnnouncements: GolfAnnouncementMeta[];
  lastSeenAt: string | null;
}

// ============================================================================
// GET PLAYER NOTIFICATION COUNTS
// ============================================================================

/**
 * Returns badge counts + unseen announcements for the login modal.
 * Runs parallel queries for performance.
 */
async function getPlayerNotificationCountsImpl(
  playerId: string,
  userId: string,
  teamId: string,
): Promise<ActionResult<PlayerNotificationCounts>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Run all queries in parallel
    const [
      notifStateResult,
      announcementsResult,
      recipientsResult,
      acksResult,
      tasksResult,
      conversationsResult,
      calendarNotifResult,
    ] = await Promise.all([
      // 1. Get notification state (last_announcements_seen_at, last_travel_seen_at)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_player_notification_state')
        .select('last_announcements_seen_at, last_travel_seen_at')
        .eq('player_id', playerId)
        .maybeSingle() as Promise<{ data: { last_announcements_seen_at: string; last_travel_seen_at: string } | null; error: unknown }>,

      // 2. Get all team announcements (published, last 30 days)
      supabase
        .from('golf_announcements')
        .select('*')
        .eq('team_id', teamId)
        .not('published_at', 'is', null)
        .gte('published_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('published_at', { ascending: false }),

      // 3. Get announcement recipients (to filter player-visible ones)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_announcement_recipients')
        .select('announcement_id, player_id') as Promise<{ data: Array<{ announcement_id: string; player_id: string }> | null }>,

      // 4. Get player's acknowledgements
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_announcement_acknowledgements')
        .select('announcement_id')
        .eq('player_id', playerId) as Promise<{ data: Array<{ announcement_id: string }> | null }>,

      // 5. Get pending task count
      (supabase
        .from('golf_task_assignments' as 'golf_shots')
        .select('id', { count: 'exact', head: true })
        .eq('player_id' as 'id', playerId)
        .eq('status' as 'id', 'pending')) as unknown as Promise<{ count: number | null; error: unknown }>,

      // 6. Get unread messages count
      supabase
        .from('golf_conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId),

      // 7. Get unread calendar notifications count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_calendar_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null) as Promise<{ count: number | null; error: unknown }>,
    ]);

    const lastSeenAt = notifStateResult.data?.last_announcements_seen_at || null;
    const announcements = announcementsResult.data || [];
    const allRecipients = recipientsResult.data || [];
    const playerAcks = new Set((acksResult.data || []).map(a => a.announcement_id));

    // Build recipient map: announcement_id -> player_ids[]
    const recipientsByAnn: Record<string, string[]> = {};
    for (const r of allRecipients) {
      if (!recipientsByAnn[r.announcement_id]) recipientsByAnn[r.announcement_id] = [];
      recipientsByAnn[r.announcement_id]!.push(r.player_id);
    }

    // Filter announcements visible to this player
    const visibleAnnouncements = announcements.filter(ann => {
      const recipients = recipientsByAnn[ann.id];
      if (!recipients || recipients.length === 0) return true; // all team
      return recipients.includes(playerId);
    });

    // Count unread announcements (for badge)
    let unreadAnnouncements = 0;
    for (const ann of visibleAnnouncements) {
      const isAcked = playerAcks.has(ann.id);
      if (ann.requires_acknowledgement && !isAcked) {
        unreadAnnouncements++;
      } else if (!ann.requires_acknowledgement && ann.published_at) {
        const age = Date.now() - new Date(ann.published_at).getTime();
        if (age < 24 * 3600000) unreadAnnouncements++;
      }
    }

    // Get unseen announcements (for login modal)
    // Skip already-acknowledged announcements — they're clearly not "new" to the player
    const unseenAnnouncements: GolfAnnouncementMeta[] = [];
    for (const ann of visibleAnnouncements) {
      const isAcked = playerAcks.has(ann.id);
      if (isAcked) continue; // already acknowledged = not new

      const isUnseen = lastSeenAt
        ? ann.published_at && new Date(ann.published_at) > new Date(lastSeenAt)
        : true; // no state row yet = everything is unseen

      if (isUnseen) {
        const recipients = recipientsByAnn[ann.id] || [];
        unseenAnnouncements.push({
          ...ann,
          recipient_count: recipients.length,
          acknowledged_count: 0, // not needed for modal
          total_recipients: recipients.length || 0,
          task_count: 0,
          completed_task_count: 0,
          document_count: 0,
          has_player_acknowledged: false,
        });
      }
    }

    // Count unread messages - batch query instead of N+1
    let unreadMessages = 0;
    const participants = conversationsResult.data || [];
    if (participants.length > 0) {
      // Parallel queries instead of sequential N+1 loop
      // Each conversation has different last_read_at, so we parallelize the individual queries
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

    // Count unseen travel itineraries
    const lastTravelSeenAt = notifStateResult.data?.last_travel_seen_at || null;
    let unseenTravel = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let travelQuery = (supabase as any)
      .from('golf_travel_itineraries')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);
    if (lastTravelSeenAt) {
      travelQuery = travelQuery.gt('created_at', lastTravelSeenAt);
    }
    const travelResult = await travelQuery as { count: number | null };
    unseenTravel = travelResult.count || 0;

    return {
      success: true,
      data: {
        unreadAnnouncements,
        pendingTasks: tasksResult.count || 0,
        unreadMessages,
        unseenTravel,
        calendarNotifications: calendarNotifResult.count || 0,
        unseenAnnouncements,
        lastSeenAt,
      },
    };
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'player_notifications.getPlayerNotificationCounts', featureArea: 'notifications' }
    );
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch notification counts' };
  }
}

const observedGetPlayerNotificationCounts = withAdminObserved(
  'getPlayerNotificationCounts',
  { sport: 'golf', feature: 'notifications' },
  getPlayerNotificationCountsImpl,
);

export async function getPlayerNotificationCounts(
  playerId: string,
  userId: string,
  teamId: string,
): Promise<ActionResult<PlayerNotificationCounts>> {
  return observedGetPlayerNotificationCounts(playerId, userId, teamId);
}

// ============================================================================
// MARK ANNOUNCEMENTS SEEN
// ============================================================================

/**
 * Updates last_announcements_seen_at to now, so the login modal won't show again
 * for announcements published before this timestamp.
 */
async function markAnnouncementsSeenImpl(): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) return { success: false, error: 'Player not found' };

    // Upsert notification state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('golf_player_notification_state')
      .upsert(
        {
          player_id: player.id,
          last_announcements_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id' }
      );

    if (error) return { success: false, error: 'Failed to update notification state' };

    // WAVE W2: the Hub's triage content lives on /golf/dashboard now (the
    // standalone /hub route is a redirect stub) — revalidate the real surface.
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/announcements');
    return { success: true };
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'player_notifications.markAnnouncementsSeen', featureArea: 'notifications' }
    );
    return { success: false, error: error instanceof Error ? error.message : 'Failed to mark announcements seen' };
  }
}

const observedMarkAnnouncementsSeen = withAdminObserved(
  'markAnnouncementsSeen',
  { sport: 'golf', feature: 'notifications' },
  markAnnouncementsSeenImpl,
);

export async function markAnnouncementsSeen(): Promise<ActionResult> {
  return observedMarkAnnouncementsSeen();
}

// ============================================================================
// MARK TRAVEL SEEN
// ============================================================================

/**
 * Updates last_travel_seen_at to now, clearing the travel badge for this player.
 */
async function markTravelSeenImpl(): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!player) return { success: false, error: 'Player not found' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('golf_player_notification_state')
      .upsert(
        {
          player_id: player.id,
          last_travel_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id' }
      );

    if (error) return { success: false, error: 'Failed to update notification state' };

    // WAVE W2: the Hub's triage content lives on /golf/dashboard now (the
    // standalone /hub route is a redirect stub) — revalidate the real surface.
    revalidatePath('/golf/dashboard');
    revalidatePath('/golf/dashboard/travel');
    return { success: true };
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'player_notifications.markTravelSeen', featureArea: 'notifications' }
    );
    return { success: false, error: error instanceof Error ? error.message : 'Failed to mark travel seen' };
  }
}

const observedMarkTravelSeen = withAdminObserved(
  'markTravelSeen',
  { sport: 'golf', feature: 'notifications' },
  markTravelSeenImpl,
);

export async function markTravelSeen(): Promise<ActionResult> {
  return observedMarkTravelSeen();
}

// ============================================================================
// GET PLAYER HUB ANNOUNCEMENTS
// ============================================================================

/**
 * Returns last 5 player-visible announcements for the hub section.
 * Lightweight version of getAnnouncementsWithMeta.
 */
async function getPlayerHubAnnouncementsImpl(
  teamId: string,
  playerId: string,
): Promise<ActionResult<GolfAnnouncementMeta[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Single RPC call — replaces the 5-query block
    // (announcements → recipients → acks → docs → tasks → JS visibility filter).
    // Server-side visibility matches the old semantic: no recipients rows = all-team;
    // otherwise player must be in recipients.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_player_hub_announcements', {
      p_team_id:   teamId,
      p_player_id: playerId,
    });

    if (error) return { success: false, error: 'Failed to load announcements' };

    const rows = (data as GolfAnnouncementMeta[] | null) ?? [];
    return { success: true, data: rows };
  } catch (error) {
    await logServerError(
      `Unexpected error: ${describeError(error)}`,
      { action: 'player_notifications.getPlayerHubAnnouncements', featureArea: 'notifications' }
    );
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch hub announcements' };
  }
}

const observedGetPlayerHubAnnouncements = withAdminObserved(
  'getPlayerHubAnnouncements',
  { sport: 'golf', feature: 'notifications' },
  getPlayerHubAnnouncementsImpl,
);

export async function getPlayerHubAnnouncements(
  teamId: string,
  playerId: string,
): Promise<ActionResult<GolfAnnouncementMeta[]>> {
  return observedGetPlayerHubAnnouncements(teamId, playerId);
}
