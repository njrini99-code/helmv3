import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getGameBoxScore } from '@/app/baseball/actions/games';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';
import { BreadcrumbLabel } from '@/app/baseball/(dashboard)/_components/breadcrumb-label';
import { BoxScoreView } from '@/components/baseball/box-score/BoxScoreView';
import { BoxScoreUpload } from '@/components/baseball/box-score/BoxScoreUpload';
import { GameDetailHeader } from '@/components/baseball/games/GameDetailHeader';
import { mapBattingToInput, mapPitchingToInput } from '@/components/baseball/box-score/mappers';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import type { BaseballGame } from '@/lib/types';
import { PaperCard } from '@/components/baseball/living-annual';

interface PageProps {
  params: Promise<{ gameId: string }>;
}

export default async function GameDetailPage({ params }: PageProps) {
  const { gameId } = await params;
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

  // Cookie-aware, multi-row-safe team resolution (matches Command Center).
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  if (!teamId) redirect('/baseball/dashboard/program');

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('id', teamId)
    .maybeSingle() as { data: { id: string; name: string } | null };

  if (!team) redirect('/baseball/dashboard/program');

  // Get game + box score
  const boxScoreResult = await getGameBoxScore(gameId);

  if (!boxScoreResult.success || !boxScoreResult.game) {
    notFound();
  }

  const { game, batting = [], pitching = [] } = boxScoreResult;

  // Get team players for entry form
  const { data: teamMembers } = await supabase
    .from('baseball_team_members')
    .select(`
      player_id,
      jersey_number,
      baseball_players!inner(id, first_name, last_name, primary_position)
    `)
    .eq('team_id', team.id)
    .eq('status', 'active');

  type MemberRow = {
    player_id: string;
    jersey_number: number | null;
    baseball_players: { id: string; first_name: string | null; last_name: string | null; primary_position: string | null };
  };

  const teamPlayers = (teamMembers as MemberRow[] ?? []).map((tm) => ({
    id: tm.baseball_players.id,
    first_name: tm.baseball_players.first_name,
    last_name: tm.baseball_players.last_name,
    primary_position: tm.baseball_players.primary_position,
    jersey_number: tm.jersey_number?.toString() ?? null,
  }));

  const isCompleted = game.status === 'completed';
  const hasStats = batting.length > 0 || pitching.length > 0;

  // Preload existing box-score lines into the manual entry form so editing
  // a completed game doesn't open a blank form and risk overwriting the
  // saved stats on the next save (#433).
  const initialBatting = batting.map(mapBattingToInput);
  const initialPitching = pitching.map(mapPitchingToInput);

  const opponentLabel = `${game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'} vs ${game.opponent_name ?? 'TBD'}`;
  const canManageStats = await hasBaseballCapability(team.id, 'can_manage_stats');

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Ruling 4: the shell's breadcrumb has no registry entry for a dynamic
          game id — this supplies the real matchup name so the trail never
          falls back to a raw UUID segment. */}
      <BreadcrumbLabel name={opponentLabel} />
      {/* Breadcrumb + coach-only Edit affordance (P2: fix a mistyped
          date/opponent/location/notes without deleting the game, which
          cascade-destroys its box score). */}
      <GameDetailHeader game={game as BaseballGame} opponentLabel={opponentLabel} canManageStats={canManageStats} />

      {/* Completed game with stats: show box score, then offer to edit */}
      {isCompleted && hasStats ? (
        <div className="space-y-6">
          <BoxScoreView
            game={game as BaseballGame}
            batting={batting}
            pitching={pitching}
          />
          {/* Option to re-enter stats */}
          <PaperCard className="p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-warm-700 mb-3">Update Box Score</h3>
            <BoxScoreUpload
              game={game as BaseballGame}
              teamPlayers={teamPlayers}
              initialBatting={initialBatting}
              initialPitching={initialPitching}
            />
          </PaperCard>
        </div>
      ) : (
        /* Not completed or no stats: show entry form */
        <BoxScoreUpload
          game={game as BaseballGame}
          teamPlayers={teamPlayers}
          initialBatting={initialBatting}
          initialPitching={initialPitching}
        />
      )}
    </div>
  );
}
