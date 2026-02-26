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
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

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
export async function getPlayerNotificationCounts(
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
        unseenAnnouncements,
        lastSeenAt,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch notification counts' };
  }
}

// ============================================================================
// MARK ANNOUNCEMENTS SEEN
// ============================================================================

/**
 * Updates last_announcements_seen_at to now, so the login modal won't show again
 * for announcements published before this timestamp.
 */
export async function markAnnouncementsSeen(): Promise<ActionResult> {
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

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to mark announcements seen' };
  }
}

// ============================================================================
// MARK TRAVEL SEEN
// ============================================================================

/**
 * Updates last_travel_seen_at to now, clearing the travel badge for this player.
 */
export async function markTravelSeen(): Promise<ActionResult> {
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

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to mark travel seen' };
  }
}

// ============================================================================
// GET PLAYER HUB ANNOUNCEMENTS
// ============================================================================

/**
 * Returns last 5 player-visible announcements for the hub section.
 * Lightweight version of getAnnouncementsWithMeta.
 */
export async function getPlayerHubAnnouncements(
  teamId: string,
  playerId: string,
): Promise<ActionResult<GolfAnnouncementMeta[]>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Get recent published announcements (last 30 days)
    const { data: announcements, error } = await supabase
      .from('golf_announcements')
      .select('*')
      .eq('team_id', teamId)
      .not('published_at', 'is', null)
      .gte('published_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('published_at', { ascending: false })
      .limit(10);

    if (error) return { success: false, error: 'Failed to load announcements' };
    if (!announcements || announcements.length === 0) return { success: true, data: [] };

    const announcementIds = announcements.map(a => a.id);

    // Fetch recipients + acknowledgements in parallel
    const [recipientsResult, acksResult, docsResult, tasksResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_announcement_recipients')
        .select('announcement_id, player_id')
        .in('announcement_id', announcementIds) as Promise<{ data: Array<{ announcement_id: string; player_id: string }> | null }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_announcement_acknowledgements')
        .select('announcement_id, player_id')
        .in('announcement_id', announcementIds) as Promise<{ data: Array<{ announcement_id: string; player_id: string }> | null }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_announcement_documents')
        .select('announcement_id')
        .in('announcement_id', announcementIds) as Promise<{ data: Array<{ announcement_id: string }> | null }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('golf_announcement_tasks')
        .select('announcement_id')
        .in('announcement_id', announcementIds) as Promise<{ data: Array<{ announcement_id: string }> | null }>,
    ]);

    const allRecipients = recipientsResult.data || [];
    const allAcks = acksResult.data || [];
    const allDocs = docsResult.data || [];
    const allTasks = tasksResult.data || [];

    // Build maps
    const recipientsByAnn: Record<string, string[]> = {};
    for (const r of allRecipients) {
      if (!recipientsByAnn[r.announcement_id]) recipientsByAnn[r.announcement_id] = [];
      recipientsByAnn[r.announcement_id]!.push(r.player_id);
    }

    const acksByAnn: Record<string, string[]> = {};
    for (const a of allAcks) {
      if (!acksByAnn[a.announcement_id]) acksByAnn[a.announcement_id] = [];
      acksByAnn[a.announcement_id]!.push(a.player_id);
    }

    const docCountByAnn: Record<string, number> = {};
    for (const d of allDocs) {
      docCountByAnn[d.announcement_id] = (docCountByAnn[d.announcement_id] || 0) + 1;
    }

    const taskCountByAnn: Record<string, number> = {};
    for (const t of allTasks) {
      taskCountByAnn[t.announcement_id] = (taskCountByAnn[t.announcement_id] || 0) + 1;
    }

    // Filter to player-visible and build meta
    const result: GolfAnnouncementMeta[] = [];
    for (const ann of announcements) {
      const recipients = recipientsByAnn[ann.id] || [];
      // Filter: all-team (no recipients) or player is in recipients
      if (recipients.length > 0 && !recipients.includes(playerId)) continue;

      const acks = acksByAnn[ann.id] || [];

      result.push({
        ...ann,
        recipient_count: recipients.length,
        acknowledged_count: acks.length,
        total_recipients: recipients.length || 0,
        task_count: taskCountByAnn[ann.id] || 0,
        completed_task_count: 0, // lightweight: not needed for hub cards
        document_count: docCountByAnn[ann.id] || 0,
        has_player_acknowledged: acks.includes(playerId),
      });

      if (result.length >= 5) break;
    }

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch hub announcements' };
  }
}
