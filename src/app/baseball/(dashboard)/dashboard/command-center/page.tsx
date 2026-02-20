'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CommandCenterClient } from '@/components/baseball/command-center/CommandCenterClient';
import type { BaseballPlayerAggregates, BaseballCoachInsight } from '@/lib/types';

// Local type for baseball player data from the query
interface BaseballPlayerData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  bats: string | null;
  throws: string | null;
  height_feet: number | null;
  height_inches: number | null;
  weight_lbs: number | null;
  gpa: number | null;
  city: string | null;
  state: string | null;
}

// Extended type for roster players with aggregates and insights
interface BaseballRosterPlayerLocal extends BaseballPlayerData {
  aggregates?: BaseballPlayerAggregates;
  insights?: BaseballCoachInsight[];
  jersey_number?: number | null;
  team_position?: string | null;
  team_status?: string | null;
  joined_at?: string | null;
}

export default async function CommandCenterPage() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/baseball/login');
  }

  // Get coach profile
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id, full_name')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    redirect('/baseball/coach');
  }

  // Only college and JUCO coaches have access to command center
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard');
  }

  if (!coach.organization_id) {
    // No organization - show setup prompt
    return (
      <div className="min-h-screen bg-[#FFFEFA]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 mb-4">
              Set Up Your Program
            </h1>
            <p className="text-slate-600 mb-6">
              Before you can use the Command Center, you need to complete your program setup.
            </p>
            <a
              href="/baseball/dashboard/program"
              className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-medium transition-colors"
            >
              Complete Setup
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Get team for this organization
  // Note: invite_code column added via migration - types will be regenerated
  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type, invite_code')
    .eq('organization_id', coach.organization_id)
    .single() as { data: { id: string; name: string; team_type: string; invite_code: string | null } | null; error: unknown };

  // If no team exists, show create team prompt
  if (teamError || !team) {
    return (
      <div className="min-h-screen bg-[#FFFEFA]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 mb-4">
              Create Your Team
            </h1>
            <p className="text-slate-600 mb-6">
              You need to create a team before you can start managing players.
            </p>
            <a
              href="/baseball/dashboard/team"
              className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-medium transition-colors"
            >
              Create Team
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Get team members (players on this team)
  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select(`
      player_id,
      position,
      jersey_number,
      status,
      joined_at,
      baseball_players!inner (
        id,
        first_name,
        last_name,
        avatar_url,
        primary_position,
        secondary_position,
        grad_year,
        bats,
        throws,
        height_feet,
        height_inches,
        weight_lbs,
        gpa,
        city,
        state
      )
    `)
    .eq('team_id', team.id);

  // Get aggregates for all players on the team
  // Note: Table created via migration - types will be regenerated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aggregates } = await (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('team_id', team.id) as { data: BaseballPlayerAggregates[] | null };

  // Get active insights for the team
  // Note: Table created via migration - types will be regenerated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insights } = await (supabase as any)
    .from('baseball_coach_insights')
    .select('*')
    .eq('team_id', team.id)
    .eq('coach_id', coach.id)
    .eq('status', 'active')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(10) as { data: BaseballCoachInsight[] | null };

  // Map players with their aggregates and insights
  const players: BaseballRosterPlayerLocal[] = (teamMembers || []).map((member) => {
    const player = member.baseball_players as unknown as BaseballPlayerData;
    const playerAggregates = (aggregates || []).find(
      (a: BaseballPlayerAggregates) => a.player_id === player.id
    );
    const playerInsights = (insights || []).filter(
      (i: BaseballCoachInsight) => i.player_id === player.id
    );

    return {
      ...player,
      aggregates: playerAggregates || undefined,
      insights: playerInsights,
      // Add team member info
      jersey_number: member.jersey_number,
      team_position: member.position,
      team_status: member.status,
      joined_at: member.joined_at,
    };
  });

  // Team-level insights (not player-specific)
  const teamInsights = (insights || []).filter(
    (i: BaseballCoachInsight) => !i.player_id
  );

  return (
    <CommandCenterClient
      team={{
        id: team.id,
        name: team.name,
        teamType: team.team_type,
        inviteCode: team.invite_code,
      }}
      // Cast to expected type - the local type has the same shape
      players={players as unknown as import('@/lib/types').BaseballRosterPlayer[]}
      insights={teamInsights as BaseballCoachInsight[]}
      coachName={coach.full_name || 'Coach'}
    />
  );
}
