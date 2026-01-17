'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  TravelTeam,
  TravelTeamWithDetails,
  TravelTeamMember,
  TravelTeamMemberWithPlayer,
  CreateTravelTeamData,
  UpdateTravelTeamData,
  ActionResult,
  TeamMemberStatus,
} from '@/lib/types/travel';

// -----------------------------------------------------------------------------
// Helper to transform database team to UI-compatible format
// -----------------------------------------------------------------------------

function transformTeam(dbTeam: Record<string, unknown>): TravelTeamWithDetails {
  return {
    id: dbTeam.id as string,
    name: dbTeam.name as string,
    organization_id: dbTeam.organization_id as string | null,
    join_code: dbTeam.join_code as string,
    description: dbTeam.description as string | null,
    logo_url: dbTeam.logo_url as string | null,
    primary_color: dbTeam.primary_color as string | null,
    secondary_color: dbTeam.secondary_color as string | null,
    season: dbTeam.season as string | null,
    created_by: dbTeam.created_by as string | null,
    created_at: dbTeam.created_at as string | null,
    updated_at: dbTeam.updated_at as string | null,
    // UI compatibility
    is_active: true,  // Teams don't have is_active column
    organization: dbTeam.organization ? {
      id: (dbTeam.organization as Record<string, unknown>).id as string,
      name: (dbTeam.organization as Record<string, unknown>).name as string,
      city: (dbTeam.organization as Record<string, unknown>).city as string | undefined,
      state: (dbTeam.organization as Record<string, unknown>).state as string | undefined,
    } : null,
    member_count: dbTeam.member_count as number | undefined,
  };
}

function transformTeamMember(dbMember: Record<string, unknown>): TravelTeamMemberWithPlayer {
  return {
    id: dbMember.id as string,
    team_id: dbMember.team_id as string,
    player_id: dbMember.player_id as string,
    status: dbMember.status as TeamMemberStatus | null,
    jersey_number: dbMember.jersey_number as number | null,
    joined_at: dbMember.joined_at as string | null,
    approved_at: dbMember.approved_at as string | null,
    approved_by: dbMember.approved_by as string | null,
    created_at: dbMember.created_at as string | null,
    updated_at: dbMember.updated_at as string | null,
    // UI compatibility
    role: 'player',
    player: dbMember.player ? {
      id: (dbMember.player as Record<string, unknown>).id as string,
      user_id: (dbMember.player as Record<string, unknown>).user_id as string | undefined,
      profile: (dbMember.player as Record<string, unknown>).user ? {
        full_name: ((dbMember.player as Record<string, unknown>).user as Record<string, unknown>).full_name as string,
        avatar_url: ((dbMember.player as Record<string, unknown>).user as Record<string, unknown>).avatar_url as string | undefined,
      } : undefined,
    } : null,
  };
}

// -----------------------------------------------------------------------------
// Travel Team Actions (using golf_teams)
// -----------------------------------------------------------------------------

/**
 * Get all teams for the current coach's organization
 */
export async function getTravelTeams(): Promise<ActionResult<TravelTeamWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the coach's organization
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not a coach' };
  }

  if (!coach.organization_id) {
    return { success: true, data: [] };
  }

  const { data: teams, error } = await supabase
    .from('golf_teams')
    .select(`
      *,
      organization:organizations(id, name, city, state)
    `)
    .eq('organization_id', coach.organization_id)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get member counts
  const teamsWithCounts = await Promise.all(
    (teams || []).map(async (team) => {
      const { count } = await supabase
        .from('golf_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', team.id);

      return {
        ...team,
        member_count: count || 0,
      };
    })
  );

  const transformedTeams = teamsWithCounts.map(transformTeam);
  return { success: true, data: transformedTeams };
}

/**
 * Get a single team by ID
 */
export async function getTravelTeam(id: string): Promise<ActionResult<TravelTeamWithDetails>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: team, error } = await supabase
    .from('golf_teams')
    .select(`
      *,
      organization:organizations(id, name, city, state)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Get member count
  const { count } = await supabase
    .from('golf_team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', id);

  return {
    success: true,
    data: transformTeam({
      ...team,
      member_count: count || 0,
    }),
  };
}

/**
 * Create a new team
 */
export async function createTravelTeam(data: CreateTravelTeamData): Promise<ActionResult<TravelTeam>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the coach's organization
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not a coach' };
  }

  // Generate a unique join code
  const joinCode = data.join_code || Math.random().toString(36).substring(2, 8).toUpperCase();

  const { data: team, error } = await supabase
    .from('golf_teams')
    .insert({
      name: data.name,
      organization_id: data.organization_id || coach.organization_id,
      join_code: joinCode,
      description: data.description,
      logo_url: data.logo_url,
      primary_color: data.primary_color,
      secondary_color: data.secondary_color,
      season: data.season,
      created_by: coach.id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return {
    success: true,
    data: {
      id: team.id,
      name: team.name,
      organization_id: team.organization_id,
      join_code: team.join_code,
      description: team.description,
      logo_url: team.logo_url,
      primary_color: team.primary_color,
      secondary_color: team.secondary_color,
      season: team.season,
      created_by: team.created_by,
      created_at: team.created_at,
      updated_at: team.updated_at,
      is_active: true,
    } as TravelTeam
  };
}

/**
 * Update a team
 */
export async function updateTravelTeam(
  id: string,
  data: UpdateTravelTeamData
): Promise<ActionResult<TravelTeam>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: team, error } = await supabase
    .from('golf_teams')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return {
    success: true,
    data: {
      id: team.id,
      name: team.name,
      organization_id: team.organization_id,
      join_code: team.join_code,
      description: team.description,
      logo_url: team.logo_url,
      primary_color: team.primary_color,
      secondary_color: team.secondary_color,
      season: team.season,
      created_by: team.created_by,
      created_at: team.created_at,
      updated_at: team.updated_at,
      is_active: true,
    } as TravelTeam
  };
}

/**
 * Delete a team
 * Note: Golf teams don't have is_active column, so we actually delete
 */
export async function deleteTravelTeam(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('golf_teams')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return { success: true };
}

// -----------------------------------------------------------------------------
// Team Member Actions (using golf_team_members)
// -----------------------------------------------------------------------------

/**
 * Get all members of a team
 */
export async function getTeamMembers(
  teamId: string
): Promise<ActionResult<TravelTeamMemberWithPlayer[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: members, error } = await supabase
    .from('golf_team_members')
    .select(`
      *,
      player:golf_players(
        id,
        user_id,
        user:users(full_name, avatar_url)
      )
    `)
    .eq('team_id', teamId)
    .order('joined_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  const transformedMembers = (members || []).map(transformTeamMember);
  return { success: true, data: transformedMembers };
}

/**
 * Add a player to a team
 */
export async function addTeamMember(
  teamId: string,
  playerId: string,
  _role?: string  // Kept for API compatibility, but not used (no role column)
): Promise<ActionResult<TravelTeamMember>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: member, error } = await supabase
    .from('golf_team_members')
    .insert({
      team_id: teamId,
      player_id: playerId,
      status: 'active' as const,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Player is already a member of this team' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return {
    success: true,
    data: {
      id: member.id,
      team_id: member.team_id,
      player_id: member.player_id,
      status: member.status,
      jersey_number: member.jersey_number,
      joined_at: member.joined_at,
      approved_at: member.approved_at,
      approved_by: member.approved_by,
      created_at: member.created_at,
      updated_at: member.updated_at,
      role: 'player',
    } as TravelTeamMember
  };
}

/**
 * Update a team member's status
 */
export async function updateTeamMemberStatus(
  memberId: string,
  status: TeamMemberStatus
): Promise<ActionResult<TravelTeamMember>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: member, error } = await supabase
    .from('golf_team_members')
    .update({ status })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return {
    success: true,
    data: {
      id: member.id,
      team_id: member.team_id,
      player_id: member.player_id,
      status: member.status,
      jersey_number: member.jersey_number,
      joined_at: member.joined_at,
      approved_at: member.approved_at,
      approved_by: member.approved_by,
      created_at: member.created_at,
      updated_at: member.updated_at,
      role: 'player',
    } as TravelTeamMember
  };
}

/**
 * Update a team member's role (legacy - kept for compatibility)
 * @deprecated Use updateTeamMemberStatus instead
 */
export async function updateTeamMemberRole(
  memberId: string,
  _role: string
): Promise<ActionResult<TravelTeamMember>> {
  // Role column doesn't exist, just return the current member
  return updateTeamMemberStatus(memberId, 'active');
}

/**
 * Remove a player from a team
 */
export async function removeTeamMember(memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('golf_team_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/golf/dashboard/travel');
  return { success: true };
}
