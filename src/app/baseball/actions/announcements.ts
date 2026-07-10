'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
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
import { logServerError } from '@/lib/server-error-logger';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const ANNOUNCEMENTS_PATH = '/baseball/dashboard/announcements';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

function mapAnnouncementActionError<T = void>(error: unknown): ActionResult<T> {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage announcements' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the announcement action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

export interface BaseballAnnouncementMeta {
  id: string;
  team_id: string;
  title: string;
  content: string;
  urgency: string | null;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string | null;
  created_by_id: string | null;
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
  content: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  isPinned?: boolean;
  recipientPlayerIds: string[] | null;
}): Promise<ActionResult<{ announcementId: string }>> {
  try {
    return await createAnnouncementAction(input);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_announcements.createAnnouncement', featureArea: 'baseball_announcements' },
    );
    return mapAnnouncementActionError(error);
  }
}

const createAnnouncementAction = withBaseballAction(
  'createAnnouncement',
  { featureArea: 'baseball-announcements', requiredCapability: 'can_manage_settings' },
  async (ctx, input: {
    teamId: string;
    title: string;
    content: string;
    urgency: 'low' | 'normal' | 'high' | 'urgent';
    isPinned?: boolean;
    recipientPlayerIds: string[] | null;
  }): Promise<ActionResult<{ announcementId: string }>> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) return { success: false, error: 'Coach profile not found' };

    if (input.teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(input.teamId, 'can_manage_settings');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: announcement, error: annError } = await (supabase as any)
      .from('baseball_announcements')
      .insert({
        team_id: input.teamId,
        title: input.title,
        content: input.content,
        urgency: input.urgency,
        is_pinned: input.isPinned ?? false,
        published_at: new Date().toISOString(),
        created_by_id: coachId,
      })
      .select()
      .single();

    if (annError || !announcement) {
      maybeCaptureRlsDenial(annError, {
        table: 'baseball_announcements',
        verb: 'insert',
        action: 'createAnnouncement',
        feature: 'baseball_announcements',
        sport: 'baseball',
      });
      return { success: false, error: 'Failed to create announcement' };
    }

    const announcementId = announcement.id as string;

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

    revalidatePath(ANNOUNCEMENTS_PATH);
    return { success: true, data: { announcementId } };
  },
);

// ============================================================================
// GET ANNOUNCEMENTS WITH META (list view)
// ============================================================================

async function getAnnouncementsWithMetaImpl(
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

    if (error) {
      maybeCaptureRlsDenial(error, {
        table: 'baseball_announcements',
        verb: 'select',
        action: 'getAnnouncementsWithMeta',
        feature: 'baseball_announcements',
        sport: 'baseball',
      });
      return { success: false, error: 'Failed to load announcements' };
    }
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
        content: ann.content as string,
        urgency: ann.urgency as string | null,
        is_pinned: (ann.is_pinned as boolean | null) ?? false,
        published_at: ann.published_at as string | null,
        created_at: ann.created_at as string | null,
        created_by_id: ann.created_by_id as string | null,
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

  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_announcements.getAnnouncementsWithMeta', featureArea: 'baseball_announcements' }
    );
    return { success: false, error: 'An unexpected error occurred' };
  }
}

// ============================================================================
// ACKNOWLEDGE ANNOUNCEMENT (player action)
// ============================================================================

async function acknowledgeAnnouncementImpl(
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
      maybeCaptureRlsDenial(insertError, {
        table: 'baseball_announcement_acknowledgements',
        verb: 'insert',
        action: 'acknowledgeAnnouncement',
        feature: 'baseball_announcements',
        sport: 'baseball',
      });
      return { success: false, error: 'Failed to acknowledge announcement' };
    }

    revalidatePath('/baseball/dashboard/announcements');
    return { success: true };

  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_announcements.acknowledgeAnnouncement', featureArea: 'baseball_announcements' }
    );
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
    return await deleteAnnouncementAction(announcementId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_announcements.deleteAnnouncement', featureArea: 'baseball_announcements' },
    );
    return mapAnnouncementActionError(error);
  }
}

const deleteAnnouncementAction = withBaseballAction(
  'deleteAnnouncement',
  { featureArea: 'baseball-announcements' },
  async (ctx, announcementId: string): Promise<ActionResult> => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) return { success: false, error: 'Coach not found' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ann } = await (supabase as any)
      .from('baseball_announcements')
      .select('id, created_by_id, team_id')
      .eq('id', announcementId)
      .single();

    if (!ann) {
      return { success: false, error: 'Not authorized to delete this announcement' };
    }

    await requireBaseballCapability(String(ann.team_id), 'can_manage_settings');

    if (ann.created_by_id !== coachId) {
      return { success: false, error: 'Not authorized to delete this announcement' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_announcements')
      .delete()
      .eq('id', announcementId);

    if (error) {
      maybeCaptureRlsDenial(error, {
        table: 'baseball_announcements',
        verb: 'delete',
        action: 'deleteAnnouncement',
        feature: 'baseball_announcements',
        sport: 'baseball',
      });
      return { success: false, error: 'Failed to delete announcement' };
    }

    revalidatePath(ANNOUNCEMENTS_PATH);
    return { success: true };
  },
);

export const getAnnouncementsWithMeta = withAdminObserved(
  'getAnnouncementsWithMeta',
  { sport: 'baseball', feature: 'baseball_announcements', featureArea: 'baseball-announcements' },
  getAnnouncementsWithMetaImpl,
);

export const acknowledgeAnnouncement = withAdminObserved(
  'acknowledgeAnnouncement',
  { sport: 'baseball', feature: 'baseball_announcements', featureArea: 'baseball-announcements' },
  acknowledgeAnnouncementImpl,
);
