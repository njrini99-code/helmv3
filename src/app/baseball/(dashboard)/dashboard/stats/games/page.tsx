import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GamesList } from '@/components/baseball/games/GamesList';
import { getTeamGames, getTeamSeasonRecord } from '@/app/baseball/actions/games';
import { logServerError } from '@/lib/server-error-logger';

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

  // A failed fetch must not collapse into an ordinary empty season — log it
  // server-side and thread a distinct error message into GamesList so a
  // transient DB/RLS failure renders as "couldn't load" rather than an
  // indistinguishable "No games yet".
  if (!gamesResult.success) {
    await logServerError(`[GamesPage] getTeamGames failed: ${gamesResult.error}`, {
      action: 'baseball.games-page.getTeamGames',
      userId: user.id,
      teamId: team.id,
      metadata: { seasonYear: defaultSeasonYear },
    });
  }
  if (!recordResult.success) {
    await logServerError(`[GamesPage] getTeamSeasonRecord failed: ${recordResult.error}`, {
      action: 'baseball.games-page.getTeamSeasonRecord',
      userId: user.id,
      teamId: team.id,
      metadata: { seasonYear: defaultSeasonYear },
    });
  }

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8">
      <GamesList
        teamId={team.id}
        title="Games & Scrimmages"
        showAddButton={true}
        initialGames={gamesResult.success ? (gamesResult.data ?? []) : []}
        initialRecord={recordResult.success ? (recordResult.data ?? null) : null}
        initialError={gamesResult.success ? null : (gamesResult.error ?? 'Failed to load games')}
        initialRecordError={recordResult.success ? null : (recordResult.error ?? 'Failed to load season record')}
      />
    </div>
  );
}
