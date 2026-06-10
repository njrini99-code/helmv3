'use server';

import { randomInt } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
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
  organizationId: string | null,
  coachId: string | null
): Promise<string | null> {
  // Cookie-aware: honours the program head's golf_active_team selection
  // (validated server-side) so coach WRITES target the toggled team.
  return resolveCoachTeamIdWithCookie(supabase, organizationId, coachId);
}

/**
 * Generate a readable 6-character join code
 * Uses uppercase letters and numbers, excluding ambiguous characters (I, O, L, 0, 1)
 * Must match the format used in onboarding.ts
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomInt(chars.length));
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

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      canJoin: false,
      reason: 'You must be logged in to join a team',
    };
  }

  // Get player and verify ownership
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id, onboarding_completed')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return {
      canJoin: false,
      reason: 'Player not found',
    };
  }

  // Verify the authenticated user owns this player profile
  if (player.user_id !== user.id) {
    return {
      canJoin: false,
      reason: 'You can only join teams with your own player profile',
    };
  }

  // Verify onboarding is completed
  if (!player.onboarding_completed) {
    return {
      canJoin: false,
      reason: 'Please complete your player profile before joining a team',
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
 * Also notifies coaches when a player joins
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

  // Get player details for notification
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, user_id')
    .eq('id', playerId)
    .single();

  // Get team details including organization
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id, name, organization_id')
    .eq('id', teamId)
    .single();

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

  // Notify coaches about the new team member
  if (player && team?.organization_id) {
    try {
      // Find all coaches for this organization
      const { data: coaches } = await supabase
        .from('golf_coaches')
        .select('id, user_id')
        .eq('organization_id', team.organization_id);

      if (coaches && coaches.length > 0) {
        const playerName = `${player.first_name} ${player.last_name}`.trim();

        // Create notifications for each coach
        const notifications = coaches.map((coach) => ({
          user_id: coach.user_id,
          type: 'team_join' as const,
          title: 'New Player Joined',
          body: `${playerName} has joined ${team.name}`,
          action_url: '/golf/dashboard/roster',
          data: {
            player_id: playerId,
            player_name: playerName,
            team_id: teamId,
            team_name: team.name,
          },
          read: false,
        }));

        // Notification shape includes metadata field not in generated types
        await fromUntyped(supabase, 'notifications').insert(notifications);
      }
    } catch (error) {
      // Don't fail the join if notification fails
      await logServerError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'teams.joinGolfTeam', featureArea: 'teams' },
        'warning'
      );
    }
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

  // Normalize join code to uppercase for case-insensitive matching
  const normalizedCode = joinCode.toUpperCase();

  // Find the team by join code
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name, join_code')
    .eq('join_code', normalizedCode)
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

  // Get coach record — maybeSingle() to avoid PGRST116 if user is not a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Check if coach already has a team via organization
  const existingTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
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
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  // Add coach to team staff (required for RLS policies to grant access)
  const { error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .insert({
      team_id: newTeam.id,
      coach_id: coach.id,
      role: 'head_coach',
      is_primary: true,
    });

  if (staffError) {
    // Clean up the team we just created since the coach can't manage it without staff record
    await supabase.from('golf_teams').delete().eq('id', newTeam.id);
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

  // Get coach and verify ownership — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
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
  const { data: updatedTeam, error: updateError } = await fromUntyped(supabase, 'golf_teams')
    .update(updateData)
    .eq('id', teamId)
    .select('id, name, season, join_code, created_at')
    .single();

  if (updateError) {
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

  // Get coach and verify ownership — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
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
    return { success: false, error: 'Failed to regenerate join code. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard/team');

  return {
    success: true,
    data: { joinCode: newJoinCode }
  };
}

// ============================================================================
// TEAM JOIN REQUEST OPERATIONS (Request-based flow)
// ============================================================================

export interface JoinRequestData {
  id: string;
  team_id: string;
  player_id: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string | null;
  created_at: string;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    graduation_year: number | null;
    handicap: number | null;
    hometown: string | null;
    state: string | null;
  };
}

/**
 * Create a join request for a team
 * Player requests to join → Coach reviews → Accept/Reject
 */
export async function createTeamJoinRequest(
  joinCode: string,
  playerId: string,
  message?: string
): Promise<TeamActionResult<JoinRequestData>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in to request to join a team' };
  }

  // Get player and verify ownership
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name, onboarding_completed')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return { success: false, error: 'Player not found' };
  }

  if (player.user_id !== user.id) {
    return { success: false, error: 'You can only request to join teams with your own player profile' };
  }

  if (!player.onboarding_completed) {
    return { success: false, error: 'Please complete your player profile before requesting to join a team' };
  }

  // Find team by join code (case-insensitive)
  const normalizedCode = joinCode.toUpperCase();
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, name, organization_id')
    .eq('join_code', normalizedCode)
    .single();

  if (teamError || !team) {
    return { success: false, error: 'Invalid team code. Please check and try again.' };
  }

  // Check if already on any team
  const { data: existingMembership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .maybeSingle();

  if (existingMembership) {
    if (existingMembership.team_id === team.id) {
      return { success: false, error: 'You are already a member of this team' };
    }
    return { success: false, error: 'You are already on a team. Leave your current team before requesting to join another.' };
  }

  // Check for existing pending request to this team
  const { data: existingRequest } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select('id, status')
    .eq('player_id', playerId)
    .eq('team_id', team.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingRequest) {
    return { success: false, error: 'You already have a pending request to join this team' };
  }

  // Create the join request
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .insert({
      team_id: team.id,
      player_id: playerId,
      status: 'pending',
      message: message?.trim() || null,
    })
    .select('id, team_id, player_id, status, message, created_at')
    .single();

  if (requestError) {
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }

  // Notify coaches about the join request
  if (team.organization_id) {
    try {
      const { data: coaches } = await supabase
        .from('golf_coaches')
        .select('id, user_id')
        .eq('organization_id', team.organization_id);

      if (coaches && coaches.length > 0) {
        const playerName = `${player.first_name} ${player.last_name}`.trim();

        const notifications = coaches.map((coach) => ({
          user_id: coach.user_id,
          type: 'team_join_request' as const,
          title: 'New Join Request',
          body: `${playerName} has requested to join ${team.name}`,
          action_url: '/golf/dashboard/roster?tab=requests',
          data: {
            request_id: request.id,
            player_id: playerId,
            player_name: playerName,
            team_id: team.id,
            team_name: team.name,
          },
          read: false,
        }));

        // Notification shape includes metadata field not in generated types
        await fromUntyped(supabase, 'notifications').insert(notifications);
      }
    } catch (error) {
      // Don't fail the request if notification fails
      await logServerError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'teams.createTeamJoinRequest', featureArea: 'teams' },
        'warning'
      );
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');
  revalidatePath('/golf/dashboard/settings');

  return {
    success: true,
    data: request,
  };
}

/**
 * Get pending join requests for the coach's team
 */
export async function getTeamJoinRequests(): Promise<TeamActionResult<JoinRequestData[]>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and their team — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (!teamId) {
    return { success: false, error: 'No team found' };
  }

  // Get pending requests with player details
  const { data: requests, error: requestsError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      team_id,
      player_id,
      status,
      message,
      created_at,
      player:golf_players (
        id,
        first_name,
        last_name,
        graduation_year,
        handicap,
        hometown,
        state
      )
    `)
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (requestsError) {
    return { success: false, error: 'Failed to fetch requests' };
  }

  return {
    success: true,
    data: requests as unknown as JoinRequestData[],
  };
}

/**
 * Accept a join request - adds player to the team
 */
export async function acceptJoinRequest(
  requestId: string
): Promise<TeamActionResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Get the request with player and team details
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      team_id,
      player_id,
      status,
      player:golf_players (
        id,
        first_name,
        last_name,
        user_id
      ),
      team:golf_teams (
        id,
        name,
        organization_id
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  // Verify coach owns this team
  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (coachTeamId !== request.team_id) {
    return { success: false, error: 'You can only accept requests for your own team' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been processed' };
  }

  // Check if player is already on a team (race condition protection)
  const { data: existingMembership } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', request.player_id)
    .maybeSingle();

  if (existingMembership) {
    // Update request to rejected since they're already on a team
    await fromUntyped(supabase, 'golf_team_join_requests')
      .update({
        status: 'rejected',
        rejection_reason: 'Player is already on another team',
        reviewed_by: coach.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return { success: false, error: 'Player has already joined another team' };
  }

  // Add player to team
  const { error: memberError } = await supabase
    .from('golf_team_members')
    .insert({
      player_id: request.player_id,
      team_id: request.team_id,
      status: 'active',
    });

  if (memberError) {
    return { success: false, error: 'Failed to add player to team' };
  }

  // Update request status
  const { error: updateError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .update({
      status: 'approved',
      reviewed_by: coach.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: 'Failed to update request status' };
  }

  // Notify player of approval
  const player = request.player as unknown as { id: string; first_name: string; last_name: string; user_id: string } | null;
  const team = request.team as unknown as { id: string; name: string; organization_id: string } | null;

  if (player?.user_id && team) {
    try {
      // Notification shape includes 'data' and custom 'type' not in generated types
      await fromUntyped(supabase, 'notifications').insert({
        user_id: player.user_id,
        type: 'team_join_approved',
        title: 'Request Approved!',
        body: `Your request to join ${team.name} has been approved. Welcome to the team!`,
        action_url: '/golf/dashboard',
        data: {
          team_id: team.id,
          team_name: team.name,
        },
        read: false,
      });
    } catch (error) {
      // Don't fail the approval if notification fails
      await logServerError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'teams.acceptJoinRequest', featureArea: 'teams' },
        'warning'
      );
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');

  return { success: true };
}

/**
 * Reject a join request
 */
export async function rejectJoinRequest(
  requestId: string,
  reason?: string
): Promise<TeamActionResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Get the request
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      team_id,
      player_id,
      status,
      player:golf_players (
        id,
        first_name,
        last_name,
        user_id
      ),
      team:golf_teams (
        id,
        name
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  // Verify coach owns this team
  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (coachTeamId !== request.team_id) {
    return { success: false, error: 'You can only reject requests for your own team' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been processed' };
  }

  // Update request status
  const { error: updateError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason?.trim() || null,
      reviewed_by: coach.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: 'Failed to reject request' };
  }

  // Notify player of rejection
  const player = request.player as unknown as { id: string; first_name: string; last_name: string; user_id: string } | null;
  const team = request.team as unknown as { id: string; name: string } | null;

  if (player?.user_id && team) {
    try {
      // Notification shape includes 'data' and custom 'type' not in generated types
      await fromUntyped(supabase, 'notifications').insert({
        user_id: player.user_id,
        type: 'team_join_rejected',
        title: 'Request Not Approved',
        body: reason
          ? `Your request to join ${team.name} was not approved: ${reason}`
          : `Your request to join ${team.name} was not approved at this time.`,
        action_url: '/golf/dashboard/settings',
        data: {
          team_id: team.id,
          team_name: team.name,
          reason: reason || null,
        },
        read: false,
      });
    } catch (error) {
      // Don't fail the rejection if notification fails
      await logServerError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'teams.rejectJoinRequest', featureArea: 'teams' },
        'warning'
      );
    }
  }

  revalidatePath('/golf/dashboard/roster');

  return { success: true };
}

/**
 * Cancel a pending join request (by the player)
 */
export async function cancelJoinRequest(
  requestId: string
): Promise<TeamActionResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the request
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select('id, player_id, status, player:golf_players(user_id)')
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  // Verify user owns this request
  const player = request.player as unknown as { user_id: string } | null;
  if (player?.user_id !== user.id) {
    return { success: false, error: 'You can only cancel your own requests' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been processed' };
  }

  // Delete the request
  const { error: deleteError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    return { success: false, error: 'Failed to cancel request' };
  }

  revalidatePath('/golf/dashboard/settings');

  return { success: true };
}

/**
 * Get player's pending join requests
 */
export async function getPlayerJoinRequests(
  playerId: string
): Promise<TeamActionResult<Array<{
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  team: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  };
}>>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .eq('id', playerId)
    .single();

  if (playerError || !player || player.user_id !== user.id) {
    return { success: false, error: 'Player not found' };
  }

  // Get requests with team details
  const { data: requests, error: requestsError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      status,
      message,
      created_at,
      team:golf_teams (
        id,
        name,
        organization:organizations (
          name
        )
      )
    `)
    .eq('player_id', playerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (requestsError) {
    return { success: false, error: 'Failed to fetch requests' };
  }

  return {
    success: true,
    data: requests as unknown as Array<{
      id: string;
      status: string;
      message: string | null;
      created_at: string;
      team: {
        id: string;
        name: string;
        organization?: { name: string } | null;
      };
    }>,
  };
}
