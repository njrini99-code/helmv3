import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getGameBoxScore } from '@/app/baseball/actions/games';
import { BoxScoreView } from '@/components/baseball/box-score/BoxScoreView';
import { BoxScoreUpload } from '@/components/baseball/box-score/BoxScoreUpload';
import { mapBattingToInput, mapPitchingToInput } from '@/components/baseball/box-score/mappers';
import type { BaseballGame } from '@/lib/types';

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

  const { data: team } = await supabase
    .from('baseball_teams')
    .select('id, name')
    .eq('organization_id', coach.organization_id)
    .single() as { data: { id: string; name: string } | null };

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

  return (
    <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-warm-400">
        <Link href="/baseball/dashboard/stats/games" className="hover:text-warm-600 transition-colors">
          Games
        </Link>
        <span>›</span>
        <span className="text-warm-600">
          {game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'} vs {game.opponent_name ?? 'TBD'}
        </span>
      </div>

      {/* Completed game with stats: show box score, then offer to edit */}
      {isCompleted && hasStats ? (
        <div className="space-y-6">
          <BoxScoreView
            game={game as BaseballGame}
            batting={batting}
            pitching={pitching}
          />
          {/* Option to re-enter stats */}
          <div className="glass-standard rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-warm-700 mb-3">Update Box Score</h3>
            <BoxScoreUpload
              game={game as BaseballGame}
              teamPlayers={teamPlayers}
              initialBatting={initialBatting}
              initialPitching={initialPitching}
            />
          </div>
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
