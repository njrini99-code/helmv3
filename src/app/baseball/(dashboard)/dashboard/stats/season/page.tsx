import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SeasonStatsClient } from '@/components/baseball/season-stats/SeasonStatsClient';
import { GamesList } from '@/components/baseball/games/GamesList';
import { getTeamSeasonStats } from '@/app/baseball/actions/games';

export default async function SeasonStatsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) redirect('/baseball/dashboard/command-center');
  if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') redirect('/baseball/dashboard/command-center');
  if (!coach.organization_id) redirect('/baseball/dashboard/program');

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single() as { data: { id: string; name: string } | null };

  if (!team) redirect('/baseball/dashboard/program');

  const currentYear = new Date().getFullYear();
  const availableYears = [currentYear, currentYear - 1, currentYear - 2];

  const seasonStatsResult = await getTeamSeasonStats(team.id, currentYear);
  const seasonStats = seasonStatsResult.success ? (seasonStatsResult.data ?? []) : [];

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-warm-900">{team.name} — Stats</h1>
        <p className="text-warm-500 mt-1 text-sm">
          Season stats auto-calculated from game and scrimmage box scores.
        </p>
      </div>

      {/* Season stats table */}
      <SeasonStatsClient
        initialStats={seasonStats}
        initialSeasonYear={currentYear}
        teamId={team.id}
        availableYears={availableYears}
      />

      {/* Recent games */}
      <div>
        <h2 className="text-lg font-bold text-warm-900 mb-4">Recent Games</h2>
        <GamesList teamId={team.id} showAddButton={true} limit={5} title="" />
      </div>
    </div>
  );
}
