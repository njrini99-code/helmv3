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
} from '@/types/travel.types';

// -----------------------------------------------------------------------------
// Travel Team Actions
// -----------------------------------------------------------------------------

/**
 * Get all travel teams for the current user's program
 */
export async function getTravelTeams(): Promise<ActionResult<TravelTeamWithDetails[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the coach's high school program
  const { data: coach } = await supabase
    .from('high_school_coaches')
    .select('id, high_school_program_id')
    .eq('profile_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not a coach' };
  }

  const { data: teams, error } = await supabase
    .from('travel_teams')
    .select(`
      *,
      high_school_program:high_school_programs(id, name, city, state),
      coach:high_school_coaches(
        id,
        profile_id,
        title,
        profile:profiles(full_name, avatar_url)
      )
    `)
    .eq('coach_id', coach.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get member counts
  const teamsWithCounts = await Promise.all(
    (teams || []).map(async (team) => {
      const { count } = await supabase
        .from('travel_team_members')
        .select('*', { count: 'exact', head: true })
        .eq('travel_team_id', team.id);

      return {
        ...team,
        member_count: count || 0,
      };
    })
  );

  return { success: true, data: teamsWithCounts };
}

/**
 * Get a single travel team by ID
 */
export async function getTravelTeam(id: string): Promise<ActionResult<TravelTeamWithDetails>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: team, error } = await supabase
    .from('travel_teams')
    .select(`
      *,
      high_school_program:high_school_programs(id, name, city, state),
      coach:high_school_coaches(
        id,
        profile_id,
        title,
        profile:profiles(full_name, avatar_url)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Get member count
  const { count } = await supabase
    .from('travel_team_members')
    .select('*', { count: 'exact', head: true })
    .eq('travel_team_id', id);

  return {
    success: true,
    data: {
      ...team,
      member_count: count || 0,
    },
  };
}

/**
 * Create a new travel team
 */
export async function createTravelTeam(data: CreateTravelTeamData): Promise<ActionResult<TravelTeam>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the coach
  const { data: coach } = await supabase
    .from('high_school_coaches')
    .select('id, high_school_program_id')
    .eq('profile_id', user.id)
    .single();

  if (!coach) {
    return { success: false, error: 'Not a coach' };
  }

  const { data: team, error } = await supabase
    .from('travel_teams')
    .insert({
      ...data,
      coach_id: coach.id,
      high_school_program_id: data.high_school_program_id || coach.high_school_program_id,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: team };
}

/**
 * Update a travel team
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
    .from('travel_teams')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: team };
}

/**
 * Delete (deactivate) a travel team
 */
export async function deleteTravelTeam(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('travel_teams')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true };
}

// -----------------------------------------------------------------------------
// Team Member Actions
// -----------------------------------------------------------------------------

/**
 * Get all members of a travel team
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
    .from('travel_team_members')
    .select(`
      *,
      player:players(
        id,
        profile_id,
        primary_position,
        grad_year,
        profile:profiles(full_name, avatar_url)
      )
    `)
    .eq('travel_team_id', teamId)
    .order('added_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: members || [] };
}

/**
 * Add a player to a travel team
 */
export async function addTeamMember(
  teamId: string,
  playerId: string,
  role: 'player' | 'captain' | 'manager' = 'player'
): Promise<ActionResult<TravelTeamMember>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: member, error } = await supabase
    .from('travel_team_members')
    .insert({
      travel_team_id: teamId,
      player_id: playerId,
      role,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Player is already a member of this team' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: member };
}

/**
 * Update a team member's role
 */
export async function updateTeamMemberRole(
  memberId: string,
  role: 'player' | 'captain' | 'manager'
): Promise<ActionResult<TravelTeamMember>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { data: member, error } = await supabase
    .from('travel_team_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true, data: member };
}

/**
 * Remove a player from a travel team
 */
export async function removeTeamMember(memberId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const { error } = await supabase
    .from('travel_team_members')
    .delete()
    .eq('id', memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/travel');
  return { success: true };
}
