'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface TeamValidationResult {
  canJoin: boolean;
  reason?: string;
  currentTeam?: { id: string; name: string };
}

/**
 * Validates whether a golf player can join a team
 * Golf players can only be on ONE team at a time
 */
export async function validateGolfPlayerCanJoinTeam(
  playerId: string,
  teamId: string
): Promise<TeamValidationResult> {
  const supabase = await createClient();

  // Get player
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return {
      canJoin: false,
      reason: 'Player not found',
    };
  }

  // Get team being joined
  const { data: targetTeam, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name')
    .eq('id', teamId)
    .single();

  if (teamError || !targetTeam) {
    return {
      canJoin: false,
      reason: 'Team not found',
    };
  }

  // Check if already on this team
  if (player.team_id === teamId) {
    return {
      canJoin: false,
      reason: 'You are already a member of this team',
    };
  }

  // Check if already on a different team
  if (player.team_id) {
    const { data: currentTeam } = await supabase
      .from('golf_teams')
      .select('id, name')
      .eq('id', player.team_id)
      .single();

    return {
      canJoin: false,
      reason: `You are already on ${currentTeam?.name || 'another team'}. Golf players can only be on one team at a time.`,
      currentTeam: currentTeam || undefined,
    };
  }

  // Validation passed
  return {
    canJoin: true,
  };
}

/**
 * Add a golf player to a team
 */
export async function joinGolfTeam(playerId: string, teamId: string) {
  const supabase = await createClient();

  // Validate first
  const validation = await validateGolfPlayerCanJoinTeam(playerId, teamId);

  if (!validation.canJoin) {
    return {
      success: false,
      error: validation.reason || 'Cannot join this team',
    };
  }

  // Update player's team_id
  const { error } = await supabase
    .from('golf_players')
    .update({ team_id: teamId })
    .eq('id', playerId);

  if (error) {
    return {
      success: false,
      error: 'Failed to join team. Please try again.',
    };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');
  revalidatePath('/golf/dashboard/team');

  return {
    success: true,
  };
}

/**
 * Process a golf team invitation code
 */
export async function processGolfTeamInvitation(inviteCode: string, playerId: string) {
  const supabase = await createClient();

  // Find the team by invite code
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name, invite_code')
    .eq('invite_code', inviteCode)
    .single();

  if (teamError || !team) {
    return {
      success: false,
      error: 'Invalid invitation code',
    };
  }

  // Join the team
  return await joinGolfTeam(playerId, team.id);
}
