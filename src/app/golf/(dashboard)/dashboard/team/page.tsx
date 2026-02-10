import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { redirect } from 'next/navigation';
import { TeamSettingsClient } from './team-settings-client';
import { TeamInfoPlayer } from './team-info-player';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

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
      <AnimatedPage>
        <AnimatedItem>
          <TeamSettingsClient
            coach={coachData}
            team={team}
          />
        </AnimatedItem>
      </AnimatedPage>
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

  // Get player's task assignments
  const { data: taskAssignments } = await fromUntyped(supabase, 'golf_task_assignments')
    .select('id, task_id, status, completed_at')
    .eq('player_id', player.id) as { data: Array<{ id: string; task_id: string; status: string | null; completed_at: string | null }> | null };

  const taskIds = (taskAssignments ?? []).map(ta => ta.task_id);

  const { data: tasksRaw } = taskIds.length > 0
    ? await fromUntyped(supabase, 'golf_tasks')
        .select('id, title, description, due_date, priority')
        .in('id', taskIds)
        .order('created_at', { ascending: false }) as { data: Array<{ id: string; title: string; description: string | null; due_date: string | null; priority: string | null }> | null }
    : { data: [] as Array<{ id: string; title: string; description: string | null; due_date: string | null; priority: string | null }> };

  const tasks = (tasksRaw ?? []).map(task => {
    const assignment = (taskAssignments ?? []).find(ta => ta.task_id === task.id);
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      due_date: task.due_date,
      status: assignment?.status ?? null,
      priority: task.priority,
    };
  });

  return (
    <AnimatedPage>
      <AnimatedItem>
        <TeamInfoPlayer
          team={team}
          coach={teamCoach}
          roster={roster ?? []}
          announcements={announcements ?? []}
          tasks={tasks}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}
