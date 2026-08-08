import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { fromUntyped } from '@/lib/supabase/untyped';
import { redirect } from 'next/navigation';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayTeam } from '@/components/fairway/pages/team';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team | GolfHelm',
  description: 'View and manage your golf team information, settings, and roster details.',
};

// Type for the team data that the client component expects
interface TeamForClient {
  id: string;
  name: string;
  season: string | null;
  join_code: string | null;
  created_at: string;
  gender: string | null;
}

interface CoachWithTeam {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  team_id: string | null; // Computed from golf_teams
  golf_teams: TeamForClient | null;
}

export default async function TeamSettingsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const supabase = await createClient();

  // Build coachData (still need team lookup via supabase).
  // Deterministic org→team resolution (handles orgs with >1 team), then load
  // the chosen team's display fields by id.
  let coachData: CoachWithTeam | null = null;
  if (coach?.organization_id) {
    const orgTeamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
    const { data: orgTeam } = orgTeamId
      ? await supabase
          .from('golf_teams')
          .select('id, name, season, join_code, created_at, gender')
          .eq('id', orgTeamId)
          .maybeSingle()
      : { data: null };

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
        gender: orgTeam.gender ?? null,
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

    // Every team this coach staffs, with its OWN join code.
    //
    // A program running both a Men's and a Women's squad previously saw only
    // the ACTIVE team's code — the other one existed but was reachable solely
    // by flipping the top-bar toggle first. Both codes are 8 uppercase
    // characters in the same position on the page, and nothing on the code says
    // which squad it belongs to, so a coach writing two invite emails back to
    // back could hand the women's team the men's code. The code would be
    // perfectly valid, the players would land on the wrong roster, and nothing
    // would flag it.
    //
    // Readable under RLS without elevation: golf_teams_select admits a coach
    // staffed on the team, and these are exactly the teams they staff.
    const { data: staffRows } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id')
      .eq('coach_id', coachData.id);

    const staffedIds = [...new Set((staffRows ?? []).map((r) => r.team_id).filter(Boolean))] as string[];
    const { data: programTeamRows } = staffedIds.length > 1
      ? await supabase
          .from('golf_teams')
          .select('id, name, gender, join_code')
          .in('id', staffedIds)
          .order('gender', { ascending: true })
      : { data: null };

    return (
      <div className={fairwayScope('min-h-full bg-canvas')}>
        <FairwayTeam
          // eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role
          role="coach"
          coach={{
            id: coachData.id,
            team_id: coachData.team_id,
            full_name: coachData.full_name,
          }}
          team={team}
          programTeams={(programTeamRows ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            gender: t.gender ?? null,
            join_code: t.join_code ?? null,
          }))}
        />
      </div>
    );
  }

  if (!player) redirect('/golf/dashboard');

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
    .maybeSingle();

  if (!team) {
    redirect('/golf/dashboard');
  }

  // Get team coach via the team's staff roster (F031). The previous lookup
  // filtered golf_coaches by organization_id with .maybeSingle(), which returns
  // NULL whenever an org has more than one coach (PGRST116) — so a player on a
  // two-coach program saw NO head coach. Resolve through golf_team_coach_staff
  // by THIS team_id, preferring the primary/head coach (is_primary first), then
  // take a single row.
  const { data: staffRows } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id, is_primary, role, created_at')
    .eq('team_id', teamMember.team_id)
    .order('is_primary', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true });

  const headStaff = (staffRows ?? [])[0] ?? null;

  const { data: teamCoach } = headStaff?.coach_id
    ? await supabase
        .from('golf_coaches')
        .select('full_name, avatar_url')
        .eq('id', headStaff.coach_id)
        .maybeSingle()
    : team.organization_id
      // Legacy fallback for teams with no staff rows yet — pick any org coach.
      ? await supabase
          .from('golf_coaches')
          .select('full_name, avatar_url')
          .eq('organization_id', team.organization_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      : { data: null };

  // Get roster (teammates) via golf_team_members (F083: active members only —
  // the player Team Info roster was listing pending/removed members too).
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamMember.team_id)
    .eq('status', 'active');

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
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <FairwayTeam
        // eslint-disable-next-line jsx-a11y/aria-role -- role is a custom component prop, not an ARIA role
        role="player"
        team={team}
        coach={teamCoach}
        roster={roster ?? []}
        announcements={announcements ?? []}
        tasks={tasks}
      />
    </div>
  );
}
