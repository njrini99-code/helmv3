'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface TeamValidationResult {
  canJoin: boolean;
  reason?: string;
  currentTeams?: Array<{ id: string; name: string; team_type: string }>;
}

/**
 * Validates whether a player can join a specific team based on multi-team rules:
 * - HS Player: 1 HS team + 1 Showcase team
 * - Showcase Player: 1 Showcase team + 1 HS team
 * - JUCO Player: 1 JUCO team only
 * - College Player: 1 College team only
 */
export async function validatePlayerCanJoinTeam(
  playerId: string,
  teamId: string
): Promise<TeamValidationResult> {
  const supabase = await createClient();

  // Get player type
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('player_type')
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
    .from('teams')
    .select('id, name, team_type')
    .eq('id', teamId)
    .single();

  if (teamError || !targetTeam) {
    return {
      canJoin: false,
      reason: 'Team not found',
    };
  }

  // Get player's current teams
  const { data: currentMemberships } = await supabase
    .from('team_members')
    .select(`
      team_id,
      teams!inner (
        id,
        name,
        team_type
      )
    `)
    .eq('player_id', playerId);

  const currentTeams = (currentMemberships || []).map((m: any) => ({
    id: m.teams.id,
    name: m.teams.name,
    team_type: m.teams.team_type,
  }));

  // Check if already on this team
  if (currentTeams.some((t) => t.id === teamId)) {
    return {
      canJoin: false,
      reason: 'You are already a member of this team',
      currentTeams,
    };
  }

  // JUCO players can only be on 1 JUCO team
  if (player.player_type === 'juco') {
    if (currentTeams.length >= 1) {
      return {
        canJoin: false,
        reason: 'JUCO players can only be on one team',
        currentTeams,
      };
    }
    if (targetTeam.team_type !== 'juco') {
      return {
        canJoin: false,
        reason: 'JUCO players can only join JUCO teams',
        currentTeams,
      };
    }
  }

  // College players can only be on 1 college team
  if (player.player_type === 'college') {
    if (currentTeams.length >= 1) {
      return {
        canJoin: false,
        reason: 'College players can only be on one team',
        currentTeams,
      };
    }
    if (targetTeam.team_type !== 'college') {
      return {
        canJoin: false,
        reason: 'College players can only join college teams',
        currentTeams,
      };
    }
  }

  // HS players: 1 HS team + 1 Showcase team max
  if (player.player_type === 'high_school') {
    if (currentTeams.length >= 2) {
      return {
        canJoin: false,
        reason: 'High school players can only be on two teams (1 HS + 1 Showcase)',
        currentTeams,
      };
    }

    // Check team type compatibility
    if (targetTeam.team_type === 'high_school') {
      const hasHSTeam = currentTeams.some((t) => t.team_type === 'high_school');
      if (hasHSTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a high school team',
          currentTeams,
        };
      }
    } else if (targetTeam.team_type === 'showcase') {
      const hasShowcaseTeam = currentTeams.some((t) => t.team_type === 'showcase');
      if (hasShowcaseTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a showcase team',
          currentTeams,
        };
      }
    } else {
      return {
        canJoin: false,
        reason: 'High school players can only join HS or Showcase teams',
        currentTeams,
      };
    }
  }

  // Showcase players: 1 Showcase team + 1 HS team max
  if (player.player_type === 'showcase') {
    if (currentTeams.length >= 2) {
      return {
        canJoin: false,
        reason: 'Showcase players can only be on two teams (1 Showcase + 1 HS)',
        currentTeams,
      };
    }

    // Check team type compatibility
    if (targetTeam.team_type === 'showcase') {
      const hasShowcaseTeam = currentTeams.some((t) => t.team_type === 'showcase');
      if (hasShowcaseTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a showcase team',
          currentTeams,
        };
      }
    } else if (targetTeam.team_type === 'high_school') {
      const hasHSTeam = currentTeams.some((t) => t.team_type === 'high_school');
      if (hasHSTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a high school team',
          currentTeams,
        };
      }
    } else {
      return {
        canJoin: false,
        reason: 'Showcase players can only join Showcase or HS teams',
        currentTeams,
      };
    }
  }

  // Validation passed
  return {
    canJoin: true,
    currentTeams,
  };
}

/**
 * Add a player to a team with validation
 */
export async function joinTeam(playerId: string, teamId: string) {
  const supabase = await createClient();

  // Validate first
  const validation = await validatePlayerCanJoinTeam(playerId, teamId);

  if (!validation.canJoin) {
    return {
      success: false,
      error: validation.reason || 'Cannot join this team',
    };
  }

  // Add player to team
  const { error } = await supabase
    .from('team_members')
    .insert({
      team_id: teamId,
      player_id: playerId,
      joined_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Error joining team:', error);
    return {
      success: false,
      error: 'Failed to join team. Please try again.',
    };
  }

  // Revalidate relevant paths
  revalidatePath('/baseball/dashboard/team');
  revalidatePath('/baseball/dashboard/roster');

  return {
    success: true,
  };
}

/**
 * Process a team invitation code
 */
export async function processTeamInvitation(inviteCode: string, playerId: string) {
  const supabase = await createClient();

  // Find the invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('team_invitations')
    .select(`
      id,
      team_id,
      expires_at,
      is_active,
      max_uses,
      teams!inner (
        id,
        name,
        team_type
      )
    `)
    .eq('invite_code', inviteCode)
    .single();

  if (inviteError || !invitation) {
    return {
      success: false,
      error: 'Invalid invitation code',
    };
  }

  // Check if invitation is active
  if (!invitation.is_active) {
    return {
      success: false,
      error: 'This invitation is no longer active',
    };
  }

  // Check if invitation has expired
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return {
      success: false,
      error: 'This invitation has expired',
    };
  }

  // Check max uses (if applicable)
  if (invitation.max_uses) {
    const { count } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', invitation.team_id);

    if (count && count >= invitation.max_uses) {
      return {
        success: false,
        error: 'This invitation has reached its maximum number of uses',
      };
    }
  }

  // Join the team
  return await joinTeam(playerId, invitation.team_id);
}
