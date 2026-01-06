import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamSettingsClient } from './team-settings-client';
import { TeamInfoPlayer } from './team-info-player';

export default async function TeamSettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Check if user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select(`
      id,
      team_id,
      full_name,
      golf_teams (
        id,
        name,
        season,
        invite_code,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .maybeSingle();

  // If coach, show settings view
  if (coach) {
    return (
      <TeamSettingsClient
        coach={coach}
        team={coach.golf_teams as any}
      />
    );
  }

  // Check if user is a player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!player || !player.team_id) {
    redirect('/golf/dashboard'); // No team - redirect to dashboard
  }

  // Get team info for player view
  const { data: team } = await supabase
    .from('golf_teams')
    .select('id, name, season, created_at')
    .eq('id', player.team_id)
    .single();

  if (!team) {
    redirect('/golf/dashboard');
  }

  // Get team coach
  const { data: teamCoach } = await supabase
    .from('golf_coaches')
    .select('full_name, avatar_url')
    .eq('team_id', player.team_id)
    .maybeSingle();

  // Get roster (teammates)
  const { data: roster } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, avatar_url, handicap')
    .eq('team_id', player.team_id)
    .order('last_name');

  // Get recent announcements - column is 'body' not 'content'
  const { data: announcementsRaw } = await supabase
    .from('golf_announcements')
    .select('id, title, body, created_at')
    .eq('team_id', player.team_id)
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
