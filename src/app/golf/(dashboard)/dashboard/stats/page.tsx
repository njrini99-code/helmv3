import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { calculatePlayerStats, calculateScoringTrend, getScoringDistribution, calculateTeamStats, getRecentRounds, getAverageByRoundType } from '@/lib/golf/stats';
import type { GolfRound, GolfHole } from '@/lib/types/golf';

interface RoundWithHoles extends GolfRound {
  holes?: GolfHole[];
}

export default async function GolfStatsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = userData?.role;

  if (userRole === 'coach') {
    return <CoachStatsView />;
  } else {
    return <PlayerStatsView />;
  }
}

async function CoachStatsView() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get coach and team
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach?.team_id) {
    return <div className="p-6">No team found</div>;
  }

  // Get team players
  const { data: players } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, status')
    .eq('team_id', coach.team_id)
    .order('last_name');

  const activePlayers = players?.filter(p => p.status === 'active') || [];

  // Get all team rounds with holes
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      player:golf_players!inner(id, first_name, last_name, team_id),
      holes:golf_holes(*)
    `)
    .eq('player.team_id', coach.team_id)
    .order('round_date', { ascending: false });

  const teamRounds = (rounds || []) as RoundWithHoles[];

  // Calculate team stats
  const teamStats = calculateTeamStats(
    players?.length || 0,
    activePlayers.length,
    teamRounds
  );

  // Get top performers (by scoring average, min 3 rounds)
  const playerStats = activePlayers
    .map(player => {
      const playerRounds = teamRounds.filter(r => r.player_id === player.id);
      const stats = calculatePlayerStats(playerRounds);
      return {
        player,
        stats,
        rounds: playerRounds,
      };
    })
    .filter(p => p.stats.rounds_played >= 3)
    .sort((a, b) => a.stats.scoring_average - b.stats.scoring_average)
    .slice(0, 10);

  // Recent team rounds
  const recentRounds = getRecentRounds(teamRounds, 10);

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Team Statistics</h1>
          <p className="text-slate-500 mt-1">Performance metrics and insights</p>
        </div>

        {/* Team Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            label="Total Rounds"
            value={teamStats.total_rounds.toString()}
            trend={`${teamStats.rounds_this_month} this month`}
          />
          <StatCard
            label="Team Avg Score"
            value={teamStats.team_scoring_average > 0 ? teamStats.team_scoring_average.toFixed(1) : '-'}
          />
          <StatCard
            label="Active Players"
            value={`${teamStats.active_players} / ${teamStats.total_players}`}
          />
          <StatCard
            label="Best Team Round"
            value={teamStats.best_team_round !== null ? teamStats.best_team_round.toString() : '-'}
          />
        </div>

        {/* Top Performers */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Performers</h2>
          <p className="text-sm text-slate-500 mb-4">Players with at least 3 rounds, ranked by scoring average</p>

          {playerStats.length === 0 ? (
            <p className="text-slate-400 text-sm">No player data available yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase">Rank</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase">Player</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase text-right">Rounds</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase text-right">Avg Score</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase text-right">Best</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase text-right">FIR %</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase text-right">GIR %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {playerStats.map((p, index) => (
                    <tr key={p.player.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 text-sm text-slate-600">{index + 1}</td>
                      <td className="py-3 pr-4 text-sm font-medium text-slate-900">
                        {p.player.first_name} {p.player.last_name}
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-600 text-right">{p.stats.rounds_played}</td>
                      <td className="py-3 pr-4 text-sm text-slate-900 font-medium text-right">
                        {p.stats.scoring_average.toFixed(1)}
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-600 text-right">{p.stats.best_round}</td>
                      <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                        {p.stats.fairways_hit_percentage.toFixed(0)}%
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                        {p.stats.greens_in_regulation_percentage.toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Team Rounds */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Team Rounds</h2>

          {recentRounds.length === 0 ? (
            <p className="text-slate-400 text-sm">No rounds recorded yet</p>
          ) : (
            <div className="space-y-3">
              {recentRounds.map((round) => {
                const player = round.player as { first_name: string; last_name: string } | null;
                return (
                  <div key={round.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900">
                        {player?.first_name} {player?.last_name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {round.course_name} • {new Date(round.round_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-slate-900">{round.total_score}</p>
                      <p className="text-sm text-slate-500">
                        {round.total_to_par !== null && round.total_to_par !== undefined ? (
                          round.total_to_par > 0 ? `+${round.total_to_par}` :
                          round.total_to_par === 0 ? 'E' :
                          round.total_to_par.toString()
                        ) : '-'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function PlayerStatsView() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Get player
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return <div className="p-6">Player profile not found</div>;
  }

  // Get player rounds with holes
  const { data: rounds } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      holes:golf_holes(*)
    `)
    .eq('player_id', player.id)
    .order('round_date', { ascending: false });

  const playerRounds = (rounds || []) as RoundWithHoles[];

  // Calculate stats
  const stats = calculatePlayerStats(playerRounds);
  const trend = calculateScoringTrend(playerRounds);
  const recentRounds = getRecentRounds(playerRounds, 5);
  const averageByType = getAverageByRoundType(playerRounds);

  // Get all holes for scoring distribution
  const allHoles = playerRounds.flatMap(r => r.holes || []);
  const scoringDist = getScoringDistribution(allHoles);

  // Trend indicator
  const trendIndicator = trend === 'improving' ? '↗' : trend === 'declining' ? '↘' : '→';
  const trendColor = trend === 'improving' ? 'text-green-600' : trend === 'declining' ? 'text-red-600' : 'text-slate-400';

  return (
    <div className="min-h-screen bg-[#FAF6F1]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">My Statistics</h1>
          <p className="text-slate-500 mt-1">Your performance metrics and insights</p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard label="Rounds Played" value={stats.rounds_played.toString()} />
          <StatCard
            label="Scoring Average"
            value={stats.scoring_average > 0 ? stats.scoring_average.toFixed(1) : '-'}
            trend={
              <span className={trendColor}>
                {trendIndicator} {trend}
              </span>
            }
          />
          <StatCard label="Best Round" value={stats.best_round > 0 ? stats.best_round.toString() : '-'} />
          <StatCard
            label="Handicap Index"
            value={stats.handicap_index !== undefined ? stats.handicap_index.toFixed(1) : '-'}
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            label="Fairways Hit"
            value={stats.fairways_hit_percentage > 0 ? `${stats.fairways_hit_percentage.toFixed(0)}%` : '-'}
          />
          <StatCard
            label="Greens in Regulation"
            value={stats.greens_in_regulation_percentage > 0 ? `${stats.greens_in_regulation_percentage.toFixed(0)}%` : '-'}
          />
          <StatCard
            label="Putts per Round"
            value={stats.putts_per_round > 0 ? stats.putts_per_round.toFixed(1) : '-'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scoring Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Scoring Distribution</h2>

            {allHoles.length === 0 ? (
              <p className="text-slate-400 text-sm">No hole data available yet</p>
            ) : (
              <div className="space-y-3">
                <ScoreDistributionRow label="Eagles" count={scoringDist.eagles} total={allHoles.length} color="bg-green-600" />
                <ScoreDistributionRow label="Birdies" count={scoringDist.birdies} total={allHoles.length} color="bg-green-500" />
                <ScoreDistributionRow label="Pars" count={scoringDist.pars} total={allHoles.length} color="bg-slate-400" />
                <ScoreDistributionRow label="Bogeys" count={scoringDist.bogeys} total={allHoles.length} color="bg-amber-500" />
                <ScoreDistributionRow label="Double+" count={scoringDist.doublePlus} total={allHoles.length} color="bg-red-500" />
              </div>
            )}
          </div>

          {/* Average by Round Type */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Average by Round Type</h2>

            {Object.keys(averageByType).length === 0 ? (
              <p className="text-slate-400 text-sm">No round type data available yet</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(averageByType).map(([type, avg]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 capitalize">{type}</span>
                    <span className="text-lg font-semibold text-slate-900">{avg.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Rounds */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Rounds</h2>

          {recentRounds.length === 0 ? (
            <p className="text-slate-400 text-sm">No rounds recorded yet</p>
          ) : (
            <div className="space-y-3">
              {recentRounds.map((round) => (
                <div key={round.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{round.course_name}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(round.round_date).toLocaleDateString()} • {round.round_type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-slate-900">{round.total_score}</p>
                    <p className="text-sm text-slate-500">
                      {round.total_to_par !== null && round.total_to_par !== undefined ? (
                        round.total_to_par > 0 ? `+${round.total_to_par}` :
                        round.total_to_par === 0 ? 'E' :
                        round.total_to_par.toString()
                      ) : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, trend }: { label: string; value: string; trend?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      {trend && <div className="text-xs mt-1">{trend}</div>}
    </div>
  );
}

function ScoreDistributionRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-sm text-slate-600">{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
