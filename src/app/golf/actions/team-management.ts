'use server';

import { randomInt } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { z } from 'zod';
import {
  AuthorizationError,
  NotFoundError
} from '@/lib/auth/ownership';
// roundTypeToDb was a no-op (identity function) and has been removed.
// Frontend and DB both use 'practice' | 'qualifier' | 'tournament'.
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { getCoachTeamId } from './golf-action-shared';
import type { ActionResult } from './golf-action-shared';

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']),
  requiresAcknowledgement: z.boolean(),
});
// ============================================================================
// ANNOUNCEMENT ACTIONS
// ============================================================================

async function createAnnouncementImpl(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}): Promise<ActionResult<{ announcementId: string }>> {
  try {
    // Validate input
    const validatedData = announcementSchema.parse(data);

    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to create announcements' };
    }

    // Get coach and team
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    const { data: announcement, error } = await supabase
      .from('golf_announcements')
      .insert({
        team_id: teamId,
        title: validatedData.title,
        body: validatedData.body,
        urgency: validatedData.urgency,
        requires_acknowledgement: validatedData.requiresAcknowledgement,
        send_push: false,
        send_email: false,
        published_at: new Date().toISOString(),
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: 'Failed to create announcement. Please try again.' };
    }

    revalidatePath('/golf/dashboard/announcements');
    updateTag(CACHE_TAGS.DASHBOARD);

    return { success: true, data: { announcementId: announcement.id } };

  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid announcement data. Please check your inputs.' };
    }
    return formatSafeErrorResponse(error);
  }
}
const observedCreateAnnouncement = withAdminObserved(
  'createAnnouncement',
  { demoSafe: true, sport: 'golf', feature: 'announcements' },
  createAnnouncementImpl,
);
export async function createAnnouncement(data: {
  title: string;
  body: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  requiresAcknowledgement: boolean;
}): Promise<ActionResult<{ announcementId: string }>> {
  return observedCreateAnnouncement(data);
}
// ============================================================================
// PLAYER ACTIONS
// ============================================================================

async function invitePlayerToTeamImpl(

  _email: string // Email parameter reserved for future email invitations
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to invite players' };
    }

    // Get coach
    // Note: golf_coaches doesn't have team_id - we look it up via organization_id
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Get team - uses join_code column, not invite_code
    const { data: team } = await supabase
      .from('golf_teams')
      .select('name, join_code')
      .eq('id', teamId)
      .single();

    // Generate join code if not exists or is placeholder
    // Uses 8-char readable format (no confusing chars like 0/O, 1/I/L)
    let joinCode = team?.join_code;
    if (!joinCode || joinCode.length < 6) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      joinCode = '';
      for (let i = 0; i < 8; i++) {
        joinCode += chars.charAt(randomInt(chars.length));
      }
      const { error: updateError } = await supabase
        .from('golf_teams')
        .update({ join_code: joinCode })
        .eq('id', teamId);

      if (updateError) {
        return { success: false, error: 'Failed to generate invite code. Please try again.' };
      }
    }

    return {
      success: true,
      data: {
        inviteCode: joinCode,
        inviteLink: `/golf/join/${joinCode}`,
      },
    };

  } catch (error) {
    return formatSafeErrorResponse(error);
  }
}
const observedInvitePlayerToTeam = withAdminObserved(
  'invitePlayerToTeam',
  { sport: 'golf', feature: 'roster_management' },
  invitePlayerToTeamImpl,
);
export async function invitePlayerToTeam(
  _email: string // Email parameter reserved for future email invitations
): Promise<ActionResult<{ inviteCode: string; inviteLink: string }>> {
  return observedInvitePlayerToTeam(_email);
}
async function updatePlayerStatusImpl(
  playerId: string,
  // The golf_team_members.status column allows active/inactive/removed; the
  // roster UI now offers active/inactive only (B4/F007). 'injured'/'redshirt'
  // remain in the param type as a no-op for any stale caller but can no longer
  // be selected from the UI.
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'You must be signed in to update player status' };
    }

    // F153/F154: resolve the coach's ACTIVE team via the cookie-aware resolver
    // (mirrors removePlayerFromTeam). The previous requireGolfCoach() path
    // resolved the team with an org-wide .maybeSingle() that ERRORS on a
    // two-team org (men's + women's) — the status picker silently failed for any
    // such program. resolveCoachTeamIdWithCookie never throws on multi-team orgs
    // and honours the active-team toggle.
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!coach) {
      return { success: false, error: 'Only coaches can update player status' };
    }

    const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    if (!teamId) {
      return { success: false, error: 'Coach not assigned to a team' };
    }

    // Verify the player is on the coach's resolved team.
    const { data: membership } = await supabase
      .from('golf_team_members')
      .select('id')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (!membership) {
      return { success: false, error: 'Player is not on your team' };
    }

    // Update status on golf_team_members. The status CHECK allows
    // active/inactive/removed; the UI only sends active/inactive.
    const { error } = await supabase
      .from('golf_team_members')
      .update({
        // Cast to bypass strict enum typing — the DB CHECK governs the value.
        status: status as unknown as 'active' | 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('player_id', playerId)
      .eq('team_id', teamId);

    if (error) {
      return { success: false, error: 'Failed to update player status' };
    }

    revalidatePath('/golf/dashboard/roster');
    updateTag(CACHE_TAGS.DASHBOARD);
    updateTag(CACHE_TAGS.ROSTER);
    return { success: true };

  } catch (err) {
    if (err instanceof AuthorizationError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: 'An unexpected error occurred' };
  }
}
const observedUpdatePlayerStatus = withAdminObserved(
  'updatePlayerStatus',
  { demoSafe: true, sport: 'golf', feature: 'roster_management' },
  updatePlayerStatusImpl,
);
export async function updatePlayerStatus(
  playerId: string,
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  return observedUpdatePlayerStatus(playerId, status);
}
