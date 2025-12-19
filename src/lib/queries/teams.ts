import { createClient } from '@/lib/supabase/server';

/**
 * Get a team's full details with members and coaches
 */
export async function getTeamDetails(teamId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('teams')
    .select(
      `
      *,
      organization:organizations(*),
      head_coach:coaches(*),
      members:team_members(
        *,
        player:players(*)
      ),
      coaching_staff:team_coach_staff(
        *,
        coach:coaches(*)
      )
    `
    )
    .eq('id', teamId)
    .single();

  if (error) {
    console.error('Error fetching team details:', error);
    throw error;
  }

  return data;
}

/**
 * Get team roster (active members only)
 */
export async function getTeamRoster(teamId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('team_members')
    .select(
      `
      *,
      player:players(
        *,
        metrics:player_metrics(*),
        achievements:player_achievements(*)
      )
    `
    )
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (error) {
    console.error('Error fetching team roster:', error);
    throw error;
  }

  return data;
}

/**
 * Get team events (games, practices, etc.)
 */
export async function getTeamEvents(
  teamId: string,
  startDate?: string,
  endDate?: string
) {
  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select('*')
    .eq('team_id', teamId);

  if (startDate) {
    query = query.gte('start_time', startDate);
  }
  if (endDate) {
    query = query.lte('start_time', endDate);
  }

  query = query.order('start_time', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching team events:', error);
    throw error;
  }

  return data;
}

/**
 * Create a team invitation link
 */
export async function createTeamInvitation(
  teamId: string,
  createdBy: string,
  expiresAt?: string,
  maxUses?: number
) {
  const supabase = await createClient();

  // Generate random invite code
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  const { data, error } = await supabase
    .from('team_invitations')
    .insert({
      team_id: teamId,
      invite_code: inviteCode,
      created_by: createdBy,
      expires_at: expiresAt,
      max_uses: maxUses,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating team invitation:', error);
    throw error;
  }

  return data;
}

/**
 * Get team invitation by code
 */
export async function getTeamInvitation(inviteCode: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('team_invitations')
    .select(
      `
      *,
      team:teams(
        *,
        organization:organizations(*),
        head_coach:coaches(*)
      )
    `
    )
    .eq('invite_code', inviteCode)
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('Error fetching team invitation:', error);
    throw error;
  }

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    throw new Error('Invitation expired');
  }

  // Check if max uses reached
  if (data.max_uses && data.current_uses && data.current_uses >= data.max_uses) {
    throw new Error('Invitation limit reached');
  }

  return data;
}

/**
 * Join a team using invitation code
 */
export async function joinTeam(playerId: string, inviteCode: string) {
  const supabase = await createClient();

  // Get and validate invitation
  const invitation = await getTeamInvitation(inviteCode);

  // Check if player is already a member
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', invitation.team_id)
    .eq('player_id', playerId)
    .single();

  if (existing) {
    throw new Error('Already a member of this team');
  }

  // Add player to team
  const { data: member, error: memberError } = await supabase
    .from('team_members')
    .insert({
      team_id: invitation.team_id,
      player_id: playerId,
      joined_at: new Date().toISOString(),
      status: 'active',
    })
    .select()
    .single();

  if (memberError) {
    console.error('Error joining team:', memberError);
    throw memberError;
  }

  // Increment invitation uses
  await supabase
    .from('team_invitations')
    .update({
      current_uses: (invitation.current_uses || 0) + 1,
    })
    .eq('id', invitation.id);

  return member;
}

/**
 * Leave a team
 */
export async function leaveTeam(teamId: string, playerId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('team_members')
    .update({
      status: 'inactive',
      left_at: new Date().toISOString(),
    })
    .eq('team_id', teamId)
    .eq('player_id', playerId);

  if (error) {
    console.error('Error leaving team:', error);
    throw error;
  }

  return true;
}

/**
 * Get team developmental plans
 */
export async function getTeamDevelopmentalPlans(teamId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('developmental_plans')
    .select(
      `
      *,
      coach:coaches(id, full_name),
      player:players(id, first_name, last_name)
    `
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching team developmental plans:', error);
    throw error;
  }

  return data;
}

/**
 * Create a team
 */
export async function createTeam(
  organizationId: string,
  headCoachId: string,
  data: {
    name: string;
    team_type: string;
    season_year?: number;
    age_group?: string;
  }
) {
  const supabase = await createClient();

  const { data: team, error } = await supabase
    .from('teams')
    .insert({
      organization_id: organizationId,
      head_coach_id: headCoachId,
      ...data,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating team:', error);
    throw error;
  }

  return team;
}
