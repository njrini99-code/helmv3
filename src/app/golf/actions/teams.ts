'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TeamData {
  id: string;
  name: string;
  season: string | null;
  join_code: string;
  created_at: string | null;
}

export interface TeamValidationResult {
  canJoin: boolean;
  reason?: string;
  currentTeam?: { id: string; name: string };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team_id for a coach via organization lookup
 * Note: golf_coaches doesn't have team_id directly - we get it from golf_teams via organization_id
 */
async function getCoachTeamId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('organization_id', organizationId)
    .maybeSingle();
  return team?.id ?? null;
}

/**
 * Generate a readable join code
 * Uses uppercase letters and numbers, excluding ambiguous characters (O, 0, I, 1, L)
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================================
// TEAM VALIDATION
// ============================================================================

/**
 * Validates whether a golf player can join a team
 * Golf players can only be on ONE team at a time
 * Note: golf_players doesn't have team_id - we check golf_team_members
 */
export async function validateGolfPlayerCanJoinTeam(
  playerId: string,
  teamId: string
): Promise<TeamValidationResult> {
  const supabase = await createClient();

  // Get player
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id')
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

  // Check if already on any team via golf_team_members
  const { data: existingMembership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .maybeSingle();

  if (existingMembership) {
    // Check if already on this team
    if (existingMembership.team_id === teamId) {
      return {
        canJoin: false,
        reason: 'You are already a member of this team',
      };
    }

    // Already on a different team
    const { data: currentTeam } = await supabase
      .from('golf_teams')
      .select('id, name')
      .eq('id', existingMembership.team_id)
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
 * Add a golf player to a team via golf_team_members
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

  // Create team membership record
  const { error } = await supabase
    .from('golf_team_members')
    .insert({
      player_id: playerId,
      team_id: teamId,
      status: 'active',
    });

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
 * Process a golf team join code
 * Note: golf_teams uses join_code, not invite_code
 */
export async function processGolfTeamInvitation(joinCode: string, playerId: string) {
  const supabase = await createClient();

  // Find the team by join code
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name, join_code')
    .eq('join_code', joinCode)
    .single();

  if (teamError || !team) {
    return {
      success: false,
      error: 'Invalid join code',
    };
  }

  // Join the team
  return await joinGolfTeam(playerId, team.id);
}

// ============================================================================
// TEAM CRUD OPERATIONS
// ============================================================================

/**
 * Create a new team and link it to the current coach's organization
 */
export async function createTeam(
  name: string,
  season: string
): Promise<TeamActionResult<TeamData>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Check if coach already has a team via organization
  const existingTeamId = await getCoachTeamId(supabase, coach.organization_id);
  if (existingTeamId) {
    return { success: false, error: 'You already have a team. Please update it instead.' };
  }

  const joinCode = generateJoinCode();

  // Create team linked to coach's organization
  const { data: newTeam, error: teamError } = await supabase
    .from('golf_teams')
    .insert({
      name: name.trim(),
      season: season,
      join_code: joinCode,
      organization_id: coach.organization_id,
      created_by: coach.id,
    })
    .select('id, name, season, join_code, created_at')
    .single();

  if (teamError) {
    console.error('Failed to create team:', teamError);
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard/roster');

  return {
    success: true,
    data: newTeam
  };
}

/**
 * Update team details
 * Only the team owner (coach linked to team via organization) can update
 */
export async function updateTeam(
  teamId: string,
  updates: { name?: string; season?: string }
): Promise<TeamActionResult<TeamData>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and verify ownership
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id);
  if (coachTeamId !== teamId) {
    return { success: false, error: 'You can only update your own team' };
  }

  // Verify team exists
  const { data: existingTeam, error: fetchError } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('id', teamId)
    .single();

  if (fetchError || !existingTeam) {
    return { success: false, error: 'Team not found' };
  }

  // Build update object
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (updates.name !== undefined) updateData.name = updates.name.trim();
  if (updates.season !== undefined) updateData.season = updates.season;

  // Update team
  const { data: updatedTeam, error: updateError } = await supabase
    .from('golf_teams')
    .update(updateData)
    .eq('id', teamId)
    .select('id, name, season, join_code, created_at')
    .single();

  if (updateError) {
    console.error('Failed to update team:', updateError);
    return { success: false, error: 'Failed to update team. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard/roster');

  return {
    success: true,
    data: updatedTeam
  };
}

/**
 * Regenerate team join code
 * Invalidates the old code immediately
 */
export async function regenerateJoinCode(
  teamId: string
): Promise<TeamActionResult<{ joinCode: string }>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and verify ownership
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id);
  if (coachTeamId !== teamId) {
    return { success: false, error: 'You can only regenerate join codes for your own team' };
  }

  const newJoinCode = generateJoinCode();

  // Update join code
  const { error: updateError } = await supabase
    .from('golf_teams')
    .update({
      join_code: newJoinCode,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId);

  if (updateError) {
    console.error('Failed to regenerate join code:', updateError);
    return { success: false, error: 'Failed to regenerate join code. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard/team');

  return {
    success: true,
    data: { joinCode: newJoinCode }
  };
}
