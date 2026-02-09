'use server';

/**
 * Server Actions for Baseball Announcements
 *
 * Handles:
 * - Creating announcements with recipients
 * - Fetching enriched announcement data for coach and player views
 * - Acknowledging announcements (player action)
 * - Deleting announcements (coach action)
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BaseballAnnouncementMeta {
  id: string;
  team_id: string;
  title: string;
  body: string;
  urgency: string | null;
  requires_acknowledgement: boolean | null;
  published_at: string | null;
  created_at: string | null;
  created_by: string | null;
  recipient_count: number;
  acknowledged_count: number;
  total_recipients: number;
  has_player_acknowledged?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getTeamPlayerIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');
  return (data || []).map((m: { player_id: string }) => m.player_id);
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// ============================================================================
// CREATE ANNOUNCEMENT
// ============================================================================

export async function createAnnouncement(input: {
  teamId: string;
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
  recipientPlayerIds: string[] | null; // null = all team
}): Promise<ActionResult<{ announcementId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!coach) return { success: false, error: 'Coach profile not found' };

    // 1. Create the announcement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: announcement, error: annError } = await (supabase as any)
      .from('baseball_announcements')
      .insert({
        team_id: input.teamId,
        title: input.title,
        body: input.body,
        urgency: input.urgency,
        requires_acknowledgement: input.requiresAcknowledgement,
        published_at: new Date().toISOString(),
        created_by: coach.id,
      })
      .select()
      .single();

    if (annError || !announcement) {
      return { success: false, error: 'Failed to create announcement' };
    }

    const announcementId = announcement.id;

    // 2. Insert recipients (only if specific players selected)
    if (input.recipientPlayerIds && input.recipientPlayerIds.length > 0) {
      const recipientRows = input.recipientPlayerIds.map((pid: string) => ({
        announcement_id: announcementId,
        player_id: pid,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('baseball_announcement_recipients')
        .insert(recipientRows);
    }

    revalidatePath('/baseball/dashboard/announcements');
    return { success: true, data: { announcementId } };

  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// GET ANNOUNCEMENTS WITH META (list view)
// ============================================================================

export async function getAnnouncementsWithMeta(
  teamId: string,
  _userId: string,
  isCoach: boolean,
  playerId?: string | null,
): Promise<ActionResult<BaseballAnnouncementMeta[]>> {
  try {
    const supabase = await createClient();

    // Fetch all announcements for this team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: announcements, error } = await (supabase as any)
      .from('baseball_announcements')
      .select('*')
      .eq('team_id', teamId)
      .order('published_at', { ascending: false });

    if (error) return { success: false, error: 'Failed to load announcements' };
    if (!announcements || announcements.length === 0) {
      return { success: true, data: [] };
    }

    const announcementIds = announcements.map((a: { id: string }) => a.id);

    // Fetch all recipients for these announcements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allRecipients } = await (supabase as any)
      .from('baseball_announcement_recipients')
      .select('announcement_id, player_id')
      .in('announcement_id', announcementIds) as { data: Array<{ announcement_id: string; player_id: string }> | null };

    // Fetch all acknowledgements
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allAcks } = await (supabase as any)
      .from('baseball_announcement_acknowledgements')
      .select('announcement_id, player_id')
      .in('announcement_id', announcementIds) as { data: Array<{ announcement_id: string; player_id: string }> | null };

    // Get total team member count for "all team" announcements
    const teamPlayerIds = await getTeamPlayerIds(supabase, teamId);
    const totalTeamCount = teamPlayerIds.length;

    // Build meta for each announcement
    const recipientsByAnn = groupBy(allRecipients || [], 'announcement_id');
    const acksByAnn = groupBy(allAcks || [], 'announcement_id');

    const enriched: BaseballAnnouncementMeta[] = announcements.map((ann: Record<string, unknown>) => {
      const recipients = recipientsByAnn[ann.id as string] || [];
      const acks = acksByAnn[ann.id as string] || [];

      const isAllTeam = recipients.length === 0;
      const totalRecipients = isAllTeam ? totalTeamCount : recipients.length;

      return {
        id: ann.id as string,
        team_id: ann.team_id as string,
        title: ann.title as string,
        body: ann.body as string,
        urgency: ann.urgency as string | null,
        requires_acknowledgement: ann.requires_acknowledgement as boolean | null,
        published_at: ann.published_at as string | null,
        created_at: ann.created_at as string | null,
        created_by: ann.created_by as string | null,
        recipient_count: recipients.length,
        acknowledged_count: acks.length,
        total_recipients: totalRecipients,
        has_player_acknowledged: !isCoach && playerId
          ? acks.some((a: { player_id: string }) => a.player_id === playerId)
          : undefined,
      };
    });

    // For players, filter to only show announcements they're a recipient of (or all-team)
    if (!isCoach && playerId) {
      const filtered = enriched.filter(ann => {
        const recipients = recipientsByAnn[ann.id] || [];
        if (recipients.length === 0) return true; // all team
        return recipients.some((r: { player_id: string }) => r.player_id === playerId);
      });
      return { success: true, data: filtered };
    }

    return { success: true, data: enriched };

  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// ACKNOWLEDGE ANNOUNCEMENT (player action)
// ============================================================================

export async function acknowledgeAnnouncement(
  announcementId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: player } = await supabase
      .from('baseball_players')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!player) return { success: false, error: 'Player not found' };

    // Verify announcement exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: announcement } = await (supabase as any)
      .from('baseball_announcements')
      .select('id, team_id')
      .eq('id', announcementId)
      .single();

    if (!announcement) return { success: false, error: 'Announcement not found' };

    // Verify player is on the same team
    const { data: membership } = await supabase
      .from('baseball_team_members')
      .select('id')
      .eq('player_id', player.id)
      .eq('team_id', announcement.team_id)
      .single();

    if (!membership) {
      return { success: false, error: 'You are not authorized to acknowledge this announcement' };
    }

    // Upsert acknowledgement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('baseball_announcement_acknowledgements')
      .upsert(
        {
          announcement_id: announcementId,
          player_id: player.id,
          acknowledged_at: new Date().toISOString(),
        },
        {
          onConflict: 'announcement_id,player_id',
          ignoreDuplicates: false,
        }
      );

    if (insertError) {
      return { success: false, error: 'Failed to acknowledge announcement' };
    }

    revalidatePath('/baseball/dashboard/announcements');
    return { success: true };

  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// DELETE ANNOUNCEMENT (coach action)
// ============================================================================

export async function deleteAnnouncement(
  announcementId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!coach) return { success: false, error: 'Coach not found' };

    // Verify ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ann } = await (supabase as any)
      .from('baseball_announcements')
      .select('id, created_by')
      .eq('id', announcementId)
      .single();

    if (!ann || ann.created_by !== coach.id) {
      return { success: false, error: 'Not authorized to delete this announcement' };
    }

    // CASCADE handles junction tables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_announcements')
      .delete()
      .eq('id', announcementId);

    if (error) return { success: false, error: 'Failed to delete announcement' };

    revalidatePath('/baseball/dashboard/announcements');
    return { success: true };

  } catch {
    return { success: false, error: 'An unexpected error occurred' };
  }
}
