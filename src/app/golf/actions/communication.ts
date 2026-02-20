'use server';

/**
 * Server Actions for Communication
 *
 * Handles:
 * - Announcement acknowledgements
 * - Getting acknowledgement status
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AcknowledgementRecord {
  id: string;
  announcement_id: string;
  player_id: string;
  acknowledged_at: string;
  player?: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

// ============================================================================
// ACKNOWLEDGE ANNOUNCEMENT
// ============================================================================

/**
 * Acknowledge an announcement as a player
 * Creates a record in golf_announcement_acknowledgements
 */
export async function acknowledgeAnnouncement(
  announcementId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player_id from golf_players where user_id = auth.uid()
    const { data: player, error: playerError } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (playerError || !player) {
      return { success: false, error: 'Player not found' };
    }

    // Verify announcement exists
    const { data: announcement, error: announcementError } = await supabase
      .from('golf_announcements')
      .select('id, team_id')
      .eq('id', announcementId)
      .single();

    if (announcementError || !announcement) {
      return { success: false, error: 'Announcement not found' };
    }

    // Verify player is on the same team (via golf_team_members)
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', player.id)
      .eq('team_id', announcement.team_id)
      .single();

    if (!membership) {
      return { success: false, error: 'You are not authorized to acknowledge this announcement' };
    }

    // Insert into golf_announcement_acknowledgements
    // Use upsert with ignoreDuplicates (ON CONFLICT DO NOTHING) so re-acknowledging
    // is a no-op rather than an error. This avoids needing an UPDATE RLS policy.
    // Note: golf_announcement_acknowledgements may not be in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .upsert(
        {
          announcement_id: announcementId,
          player_id: player.id,
          acknowledged_at: new Date().toISOString(),
        },
        {
          onConflict: 'announcement_id,player_id',
          ignoreDuplicates: true,
        }
      );

    if (insertError) {
      console.error('[acknowledgeAnnouncement Error]', insertError);
      return { success: false, error: insertError.message };
    }

    revalidatePath('/golf/dashboard/announcements');
    return { success: true };
  } catch (error) {
    console.error('[acknowledgeAnnouncement Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// GET ANNOUNCEMENT ACKNOWLEDGEMENTS
// ============================================================================

/**
 * Get all acknowledgements for an announcement
 * For coaches to see who has acknowledged
 */
export async function getAnnouncementAcknowledgements(
  announcementId: string
): Promise<ActionResult<AcknowledgementRecord[]>> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Only coaches can view acknowledgement details' };
    }

    // Get team_id via organization
    let teamId: string | null = null;
    if (coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id || null;
    }

    // Verify announcement exists and belongs to coach's team
    const { data: announcement, error: announcementError } = await supabase
      .from('golf_announcements')
      .select('id, team_id')
      .eq('id', announcementId)
      .single();

    if (announcementError || !announcement) {
      return { success: false, error: 'Announcement not found' };
    }

    if (teamId && announcement.team_id !== teamId) {
      return { success: false, error: 'Not authorized to view this announcement' };
    }

    // Fetch acknowledgements with player info
    // Note: golf_announcement_acknowledgements may not be in generated types
    interface RawAcknowledgement {
      id: string;
      announcement_id: string;
      player_id: string;
      acknowledged_at: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: acknowledgements, error: ackError } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .select('id, announcement_id, player_id, acknowledged_at')
      .eq('announcement_id', announcementId)
      .order('acknowledged_at', { ascending: false }) as { data: RawAcknowledgement[] | null; error: Error | null };

    if (ackError) {
      console.error('[getAnnouncementAcknowledgements Error]', ackError);
      return { success: false, error: 'Failed to fetch acknowledgements' };
    }

    // Get player info for each acknowledgement
    const playerIds = (acknowledgements || []).map(a => a.player_id);
    let playersMap: Record<string, { first_name: string | null; last_name: string | null }> = {};

    if (playerIds.length > 0) {
      const { data: playersData } = await supabase
        .from('golf_players')
        .select('id, first_name, last_name')
        .in('id', playerIds);

      playersMap = (playersData || []).reduce((acc, p) => {
        acc[p.id] = { first_name: p.first_name, last_name: p.last_name };
        return acc;
      }, {} as Record<string, { first_name: string | null; last_name: string | null }>);
    }

    // Combine acknowledgements with player info
    const enrichedAcknowledgements: AcknowledgementRecord[] = (acknowledgements || []).map(ack => ({
      id: ack.id,
      announcement_id: ack.announcement_id,
      player_id: ack.player_id,
      acknowledged_at: ack.acknowledged_at,
      player: playersMap[ack.player_id] || null,
    }));

    return { success: true, data: enrichedAcknowledgements };
  } catch (error) {
    console.error('[getAnnouncementAcknowledgements Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// CHECK IF PLAYER HAS ACKNOWLEDGED
// ============================================================================

/**
 * Check if the current player has acknowledged an announcement
 */
export async function hasPlayerAcknowledged(
  announcementId: string
): Promise<ActionResult<{ acknowledged: boolean; acknowledgedAt: string | null }>> {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player_id
    const { data: player } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!player) {
      return { success: true, data: { acknowledged: false, acknowledgedAt: null } };
    }

    // Check for acknowledgement
    interface AckCheck {
      id: string;
      acknowledged_at: string;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ack } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .select('id, acknowledged_at')
      .eq('announcement_id', announcementId)
      .eq('player_id', player.id)
      .maybeSingle() as { data: AckCheck | null; error: Error | null };

    return {
      success: true,
      data: {
        acknowledged: !!ack,
        acknowledgedAt: ack?.acknowledged_at || null,
      },
    };
  } catch (error) {
    console.error('[hasPlayerAcknowledged Error]', error);
    return formatSafeErrorResponse(error);
  }
}
