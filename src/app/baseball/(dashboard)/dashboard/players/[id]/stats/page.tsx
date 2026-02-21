import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { PlayerStatsClient } from '@/components/baseball/player-stats';
import type { BaseballPlayerStats, BaseballPlayerAggregates } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerStatsPage({ params }: PageProps) {
  const { id: playerId } = await params;
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect('/baseball/login');
  }

  // Get coach profile
  const { data: coach, error: coachError } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    redirect('/baseball/coach');
  }

  // Only college and JUCO coaches have access to player stats
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
    redirect('/baseball/dashboard');
  }

  if (!coach.organization_id) {
    redirect('/baseball/dashboard/program');
  }

  // Get team for this organization
  type TeamInfo = { id: string; name: string };
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single() as { data: TeamInfo | null };

  if (!team) {
    redirect('/baseball/dashboard/team');
  }

  // Verify player is on this team
  const { data: membership } = await supabase
    .from('baseball_team_members')
    .select('player_id, jersey_number, position, status')
    .eq('team_id', team.id)
    .eq('player_id', playerId)
    .single();

  if (!membership) {
    notFound();
  }

  // Get player info
  const { data: player } = await supabase
    .from('baseball_players')
    .select(`
      id,
      first_name,
      last_name,
      avatar_url,
      primary_position,
      secondary_position,
      grad_year
    `)
    .eq('id', playerId)
    .single();

  if (!player) {
    notFound();
  }

  // Get player stats (using type assertion to avoid deep instantiation issues)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stats } = await (supabase as any)
    .from('baseball_player_stats')
    .select('*')
    .eq('player_id', playerId)
    .eq('team_id', team.id)
    .order('session_date', { ascending: false })
    .limit(100) as { data: BaseballPlayerStats[] | null };

  // Get aggregates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: aggregates } = await (supabase as any)
    .from('baseball_player_aggregates')
    .select('*')
    .eq('player_id', playerId)
    .eq('team_id', team.id)
    .single() as { data: BaseballPlayerAggregates | null };

  return (
    <PlayerStatsClient
      player={{
        id: player.id,
        first_name: player.first_name || 'Unknown',
        last_name: player.last_name || 'Player',
        avatar_url: player.avatar_url,
        primary_position: player.primary_position,
        secondary_position: player.secondary_position,
        grad_year: player.grad_year,
        jersey_number: membership.jersey_number?.toString() || null,
      }}
      stats={stats || []}
      aggregates={aggregates}
      teamName={team.name}
    />
  );
}
