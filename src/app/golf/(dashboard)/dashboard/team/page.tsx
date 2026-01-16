import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamSettingsClient } from './team-settings-client';
import { TeamInfoPlayer } from './team-info-player';

// Type for the team data that the client component expects
interface TeamForClient {
  id: string;
  name: string;
  season: string | null;
  join_code: string | null;
  created_at: string;
}

interface CoachWithTeam {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  team_id: string | null; // Computed from golf_teams
  golf_teams: TeamForClient | null;
}

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Check if user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id, full_name')
    .eq('user_id', user.id)
    .maybeSingle();

  // If coach, get team via organization_id
  let coachData: CoachWithTeam | null = null;
  if (coach?.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id, name, season, join_code, created_at')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    coachData = {
      id: coach.id,
      organization_id: coach.organization_id,
      full_name: coach.full_name,
      team_id: orgTeam?.id || null,
      golf_teams: orgTeam ? {
        id: orgTeam.id,
        name: orgTeam.name,
        season: orgTeam.season,
        join_code: orgTeam.join_code,
        created_at: orgTeam.created_at || '',
      } : null,
    };
  } else if (coach) {
    coachData = {
      id: coach.id,
      organization_id: coach.organization_id,
      full_name: coach.full_name,
      team_id: null,
      golf_teams: null,
    };
  }

  // If coach, show settings view
  if (coachData) {
    const team = coachData.golf_teams
      ? { ...coachData.golf_teams, created_at: coachData.golf_teams.created_at ?? '' }
      : null;
    return (
      <TeamSettingsClient
        coach={coachData}
        team={team}
      />
    );
  }

  // Check if user is a player - get team via golf_team_members
  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player) {
    redirect('/golf/dashboard'); // No player profile - redirect to dashboard
  }

  // Get team_id via golf_team_members
  const { data: teamMember } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', player.id)
    .maybeSingle();

  if (!teamMember?.team_id) {
    redirect('/golf/dashboard'); // No team - redirect to dashboard
  }

  // Get team info for player view
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id, name, season, created_at, organization_id')
    .eq('id', teamMember.team_id)
    .single();

  if (!team) {
    redirect('/golf/dashboard');
  }

  // Get team coach via organization_id
  const { data: teamCoach } = team.organization_id
    ? await supabase
        .from('golf_coaches')
        .select('full_name, avatar_url')
        .eq('organization_id', team.organization_id)
        .maybeSingle()
    : { data: null };

  // Get roster (teammates) via golf_team_members
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamMember.team_id);

  const rosterPlayerIds = (teamMembers || []).map(tm => tm.player_id);

  const { data: roster } = rosterPlayerIds.length > 0
    ? await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url, handicap')
        .in('id', rosterPlayerIds)
        .order('last_name')
    : { data: [] };

  // Get recent announcements - column is 'body' not 'content'
  const { data: announcementsRaw } = await supabase
    .from('golf_announcements')
    .select('id, title, body, created_at')
    .eq('team_id', teamMember.team_id)
    .order('created_at', { ascending: false })
    .limit(5);

  // Map 'body' to 'content' for component compatibility
  const announcements = (announcementsRaw ?? []).map(a => ({
    id: a.id,
    title: a.title,
    content: a.body,
    created_at: a.created_at
  }));

  return (
    <TeamInfoPlayer
      team={team}
      coach={teamCoach}
      roster={roster ?? []}
      announcements={announcements ?? []}
    />
  );
}
