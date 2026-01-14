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
  invite_code: string | null;
  created_at: string | null;
}

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a readable invite code
 * Uses uppercase letters and numbers, excluding ambiguous characters (O, 0, I, 1, L)
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================================
// TEAM CRUD OPERATIONS
// ============================================================================

/**
 * Create a new team and link it to the current coach
 * Uses a single transaction to prevent orphaned teams
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
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Check if coach already has a team
  if (coach.team_id) {
    return { success: false, error: 'You already have a team. Please update it instead.' };
  }

  const inviteCode = generateInviteCode();

  // Create team
  const { data: newTeam, error: teamError } = await supabase
    .from('golf_teams')
    .insert({
      name: name.trim(),
      season: season,
      invite_code: inviteCode,
    })
    .select('id, name, season, invite_code, created_at')
    .single();

  if (teamError) {
    console.error('Failed to create team:', teamError);
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  // Link coach to team
  const { error: linkError } = await supabase
    .from('golf_coaches')
    .update({
      team_id: newTeam.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', coach.id);

  if (linkError) {
    // Rollback: delete the team we just created
    await supabase.from('golf_teams').delete().eq('id', newTeam.id);
    console.error('Failed to link coach to team:', linkError);
    return { success: false, error: 'Failed to link team to your account. Please try again.' };
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
 * Only the team owner (coach linked to team) can update
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
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  if (coach.team_id !== teamId) {
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
    .select('id, name, season, invite_code, created_at')
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
 * Regenerate team invite code
 * Invalidates the old code immediately
 */
export async function regenerateInviteCode(
  teamId: string
): Promise<TeamActionResult<{ inviteCode: string }>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and verify ownership
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  if (coach.team_id !== teamId) {
    return { success: false, error: 'You can only regenerate invite codes for your own team' };
  }

  const newInviteCode = generateInviteCode();

  // Update invite code
  const { error: updateError } = await supabase
    .from('golf_teams')
    .update({
      invite_code: newInviteCode,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId);

  if (updateError) {
    console.error('Failed to regenerate invite code:', updateError);
    return { success: false, error: 'Failed to regenerate invite code. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard/team');

  return {
    success: true,
    data: { inviteCode: newInviteCode }
  };
}

/**
 * Get team by ID with authorization check
 */
export async function getTeamForCoach(): Promise<TeamActionResult<TeamData | null>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach record
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  if (!coach.team_id) {
    return { success: true, data: null };
  }

  // Get team
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name, season, invite_code, created_at')
    .eq('id', coach.team_id)
    .single();

  if (teamError) {
    console.error('Failed to fetch team:', teamError);
    return { success: false, error: 'Failed to load team' };
  }

  return { success: true, data: team };
}
