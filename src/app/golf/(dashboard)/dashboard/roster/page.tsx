import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { InvitePlayerButton } from '@/components/golf/roster/InvitePlayerButton';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import type { GolfPlayer, GolfRound } from '@/lib/types/golf';
import { IconUsers } from '@/components/icons';

interface PlayerWithStats extends GolfPlayer {
  rounds_count?: number;
  avg_score?: number;
}

export default async function GolfRosterPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get coach and team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id, team:golf_teams(name, invite_code)')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) {
    return <div className="p-6">No team found</div>;
  }

  // Get players
  const { data: players } = await supabase
    .from('golf_players')
    .select('*')
    .eq('team_id', coach.team_id)
    .order('last_name', { ascending: true });

  // Get rounds to calculate stats for each player
  const playersWithStats: PlayerWithStats[] = await Promise.all(
    (players || []).map(async (player) => {
      const { data: rounds } = await supabase
        .from('golf_rounds')
        .select('total_score')
        .eq('player_id', player.id)
        .not('total_score', 'is', null);

      const roundsCount = rounds?.length || 0;
      const avgScore = roundsCount > 0
        ? rounds!.reduce((sum, r) => sum + (r.total_score || 0), 0) / roundsCount
        : 0;

      return {
        ...player,
        rounds_count: roundsCount,
        avg_score: avgScore,
      };
    })
  );

  const teamName = typeof coach.team === 'object' && coach.team ? coach.team.name : 'Team';
  const inviteCode = typeof coach.team === 'object' && coach.team ? coach.team.invite_code : null;

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Team Roster</h1>
            <p className="text-slate-500 mt-1">
              {playersWithStats.length} {playersWithStats.length === 1 ? 'player' : 'players'} on {teamName}
            </p>
          </div>
          <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
        </div>

        {/* Roster Grid */}
        {playersWithStats.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm text-center">
            <IconUsers size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No Players Yet
            </h3>
            <p className="text-slate-500 mb-4">
              Invite players to join your team
            </p>
            <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Player</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Hometown</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Rounds</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Avg Score</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Handicap</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {playersWithStats.map((player) => (
                    <tr key={player.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-green-600 font-medium text-sm">
                              {player.first_name?.[0] || '?'}{player.last_name?.[0] || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {player.first_name} {player.last_name}
                            </p>
                            {player.email && (
                              <p className="text-xs text-slate-500">{player.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {player.year || '-'}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {player.hometown && player.state
                          ? `${player.hometown}, ${player.state}`
                          : '-'}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600 text-right">
                        {player.rounds_count || 0}
                      </td>

                      <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right">
                        {player.avg_score && player.avg_score > 0 ? player.avg_score.toFixed(1) : '-'}
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600 text-right">
                        {player.handicap !== null ? player.handicap.toFixed(1) : '-'}
                      </td>

                      <td className="px-6 py-4">
                        <PlayerStatusBadge playerId={player.id} currentStatus={player.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
