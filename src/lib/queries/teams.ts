import { createClient } from '@/lib/supabase/server';

/**
 * Get a team's full details with members and coaches
 */
export async function getTeamDetails(teamId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('baseball_teams')
    .select(
      `
      *,
      organization:organizations(*),
      head_coach:baseball_coaches(*),
      members:baseball_team_members(
        *,
        player:baseball_players(*)
      ),
      coaching_staff:baseball_team_coach_staff(
        *,
        coach:baseball_coaches(*)
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
    .from('baseball_team_members')
    .select(
      `
      *,
      player:baseball_players(
        *,
        metrics:baseball_player_metrics(*),
        achievements:baseball_player_achievements(*)
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
    .from('baseball_events')
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
    .from('baseball_team_invitations')
    .insert({
      team_id: teamId,
      code: inviteCode,
      created_by_coach_id: createdBy,
      expires_at: expiresAt,
      max_uses: maxUses,
      is_active: true,
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
    .from('baseball_team_invitations')
    .select(
      `
      *,
      team:baseball_teams(
        *,
        organization:organizations(*),
        head_coach:baseball_coaches(*)
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
  if (data.max_uses && data.used_count && data.used_count >= data.max_uses) {
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

  // Get the team being joined
  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type')
    .eq('id', invitation.team_id)
    .single();

  if (teamError || !team) {
    throw new Error('Team not found');
  }

  // Get player info
  const { data: player, error: playerError } = await supabase
    .from('baseball_players')
    .select('id, player_type')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    throw new Error('Player not found');
  }

  // Check if player is already a member
  const { data: existing } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', invitation.team_id)
    .eq('player_id', playerId)
    .single();

  if (existing) {
    throw new Error('Already a member of this team');
  }

  // Get player's current teams
  const { data: currentTeams, error: teamsError } = await supabase
    .from('baseball_team_members')
    .select('team:baseball_teams(id, name, team_type)')
    .eq('player_id', playerId)
    .eq('status', 'active');

  if (teamsError) {
    throw teamsError;
  }

  type TeamMemberWithTeam = { team?: { id: string; name: string; team_type: string } | null };
  const activeTeams = currentTeams?.map((tm: TeamMemberWithTeam) => tm.team).filter(Boolean) || [];
  const teamTypes = activeTeams.map((t) => t?.team_type);

  // Validate team limits based on player type
  const playerType = player.player_type;
  if (playerType === 'college' || playerType === 'juco') {
    // College and JUCO players can only be on 1 team
    if (activeTeams.length >= 1) {
      const label = playerType === 'college' ? 'College' : 'JUCO';
      throw new Error(`${label} players can only be on one team`);
    }
    // Must match their player type
    if (team.team_type !== playerType) {
      const label = playerType === 'college' ? 'College' : 'JUCO';
      throw new Error(`${label} players can only join ${playerType} teams`);
    }
  } else if (playerType === 'high_school' || playerType === 'showcase') {
    // HS and Showcase players can be on max 2 teams
    if (activeTeams.length >= 2) {
      throw new Error('You can only be on 2 teams maximum');
    }
    // Can only have 1 HS team and 1 Showcase team
    if (team.team_type === 'high_school' && teamTypes.includes('high_school')) {
      throw new Error('You are already on a high school team');
    }
    if (team.team_type === 'showcase' && teamTypes.includes('showcase')) {
      throw new Error('You are already on a showcase team');
    }
    // Must be HS or Showcase team
    if (team.team_type !== 'high_school' && team.team_type !== 'showcase') {
      throw new Error('High school and showcase players can only join high school or showcase teams');
    }
  }

  // Add player to team
  const { data: member, error: memberError } = await supabase
    .from('baseball_team_members')
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
    .from('baseball_team_invitations')
    .update({
      used_count: (invitation.used_count || 0) + 1,
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
    .from('baseball_team_members')
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
    .from('baseball_developmental_plans')
    .select(
      `
      *,
      coach:baseball_coaches(id, full_name),
      player:baseball_players(id, first_name, last_name)
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
  createdBy: string,
  data: {
    name: string;
    team_type: 'college' | 'juco' | 'high_school' | 'showcase';
  }
) {
  const supabase = await createClient();

  // Generate a random join code
  const joinCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  const { data: team, error } = await supabase
    .from('baseball_teams')
    .insert({
      organization_id: organizationId,
      created_by: createdBy,
      join_code: joinCode,
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
