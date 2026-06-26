'use server';

import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { CommandCenterClient } from '@/components/baseball/command-center/CommandCenterClient';
import { getCommandCenter } from '@/lib/baseball/read-models/command-center';
import type { BaseballPlayerAggregates } from '@/lib/types';

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

interface BaseballRosterPlayerLocal extends BaseballPlayerData {
  aggregates?: BaseballPlayerAggregates;
  jersey_number?: number | null;
  team_position?: string | null;
  team_status?: string | null;
  joined_at?: string | null;
}

export default async function CommandCenterPage() {
  const supabase = await createClient();

  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  const coach = session.coach;
  if (!coach) redirect('/baseball/player/today');

  if (!coach.organization_id) {
    return (
      <div className="min-h-dvh bg-cream-100">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-12">
          <div className="glass-standard rounded-2xl p-8 text-center">
            <h1 className="text-2xl font-semibold text-warm-900 mb-4">
              Set Up Your Program
            </h1>
            <p className="text-warm-600 mb-6">
              Before you can use the Command Center, you need to complete your program setup.
            </p>
            <a
              href="/baseball/dashboard/program"
              className="inline-flex items-center px-6 py-3 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-lg font-medium transition-colors"
            >
              Complete Setup
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type, join_code')
    .eq('organization_id', coach.organization_id)
    .single() as { data: { id: string; name: string; team_type: string; join_code: string | null } | null; error: unknown };

  if (teamError || !team) {
    return (
      <CommandCenterClient
        team={{ id: '', name: 'Your Program', teamType: coach.coach_type, inviteCode: null }}
        players={[]}
        coachId={coach.id}
        coachName={coach.full_name || 'Coach'}
        calendarEvents={[]}
        riskFeed={[]}
        riskFeedError={null}
      />
    );
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [commandCenter, teamMembersRes, calendarRes] = await Promise.all([
    getCommandCenter(team.id),
    supabase
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
      .eq('team_id', team.id),
    supabase
      .from('baseball_events')
      .select('id, title, event_type, start_time, end_time')
      .eq('team_id', team.id)
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString()),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aggregates } = await (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('team_id', team.id) as { data: BaseballPlayerAggregates[] | null };

  const teamMembers = teamMembersRes.data;

  const players: BaseballRosterPlayerLocal[] = (teamMembers || []).map((member) => {
    const player = member.baseball_players as unknown as BaseballPlayerData;
    const playerAggregates = (aggregates || []).find(
      (a: BaseballPlayerAggregates) => a.player_id === player.id,
    );

    return {
      ...player,
      aggregates: playerAggregates || undefined,
      jersey_number: member.jersey_number,
      team_position: member.position,
      team_status: member.status,
      joined_at: member.joined_at,
    };
  });

  return (
    <CommandCenterClient
      team={{
        id: team.id,
        name: team.name,
        teamType: team.team_type,
        inviteCode: team.join_code,
      }}
      players={players as unknown as import('@/lib/types').BaseballRosterPlayer[]}
      coachId={coach.id}
      coachName={coach.full_name || 'Coach'}
      calendarEvents={calendarRes.data ?? []}
      riskFeed={commandCenter.authorized ? commandCenter.riskFeed : []}
      riskFeedError={commandCenter.error}
    />
  );
}
