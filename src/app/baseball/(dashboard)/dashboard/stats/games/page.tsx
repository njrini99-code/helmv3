import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GamesList } from '@/components/baseball/games/GamesList';
import { getTeamGames, getTeamSeasonRecord } from '@/app/baseball/actions/games';

export default async function GamesPage() {
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

  // Fetch the initial games + season record server-side (matching GamesList's
  // default filters: all game types, current season year, no limit) so a
  // revalidated RSC payload after a box-score save actually reaches the
  // client — see GamesList's initialGames/initialRecord sync effect.
  const defaultSeasonYear = new Date().getFullYear();
  const [gamesResult, recordResult] = await Promise.all([
    getTeamGames(team.id, { seasonYear: defaultSeasonYear }),
    getTeamSeasonRecord(team.id, defaultSeasonYear),
  ]);

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
      <GamesList
        teamId={team.id}
        title="Games & Scrimmages"
        showAddButton={true}
        initialGames={gamesResult.success ? (gamesResult.data ?? []) : []}
        initialRecord={recordResult.success ? (recordResult.data ?? null) : null}
      />
    </div>
  );
}
