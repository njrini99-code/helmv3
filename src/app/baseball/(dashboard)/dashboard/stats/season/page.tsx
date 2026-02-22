import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SeasonStatsTable } from '@/components/baseball/season-stats/SeasonStatsTable';
import { GamesList } from '@/components/baseball/games/GamesList';
import type { BaseballPlayerSeasonStats } from '@/lib/types';

export default async function SeasonStatsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/baseball/coach');
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') redirect('/baseball/dashboard');
  if (!coach.organization_id) redirect('/baseball/dashboard/program');

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single() as { data: { id: string; name: string } | null };

  if (!team) redirect('/baseball/dashboard/team');

  const currentYear = new Date().getFullYear();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seasonStats } = await (supabase as any)
    .from('baseball_player_season_stats')
    .select(`
      *,
      player:baseball_players!player_id(first_name, last_name, primary_position)
    `)
    .eq('team_id', team.id)
    .eq('season_year', currentYear) as { data: BaseballPlayerSeasonStats[] | null };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{team.name} — Stats</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Season stats auto-calculated from game and scrimmage box scores.
        </p>
      </div>

      {/* Season stats table */}
      <SeasonStatsTable
        stats={seasonStats ?? []}
        seasonYear={currentYear}
        teamId={team.id}
      />

      {/* Recent games */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Games</h2>
        <GamesList teamId={team.id} showAddButton={true} limit={5} title="" />
      </div>
    </div>
  );
}
