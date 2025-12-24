import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { InvitePlayerButton } from '@/components/golf/roster/InvitePlayerButton';
import { PlayerStatusBadge } from '@/components/golf/roster/PlayerStatusBadge';
import type { GolfPlayer } from '@/lib/types/golf';
import { IconUsers, IconSearch, IconChartBar, IconMessage, IconChevronRight } from '@/components/icons';

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
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team Roster</h1>
              <p className="text-slate-500 mt-0.5">
                {playersWithStats.length} {playersWithStats.length === 1 ? 'player' : 'players'} on {teamName}
              </p>
            </div>
            <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {playersWithStats.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconUsers size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
            <p className="text-slate-500 mb-6 max-w-sm mx-auto">
              Start building your team by inviting players to join your roster
            </p>
            <InvitePlayerButton teamName={teamName} existingCode={inviteCode} />
          </div>
        ) : (
          <div className="space-y-3">
            {playersWithStats.map((player, index) => (
              <div
                key={player.id}
                className="group bg-white rounded-xl border border-slate-200/60 hover:border-slate-300 hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-200"
                style={{
                  animation: 'fadeInUp 0.4s ease-out forwards',
                  animationDelay: `${index * 30}ms`,
                  opacity: 0,
                }}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Avatar */}
                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-white font-semibold text-sm">
                        {player.first_name?.[0] || '?'}{player.last_name?.[0] || '?'}
                      </span>
                    </div>
                    {/* Status indicator */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-emerald-500" />
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {player.first_name} {player.last_name}
                      </p>
                      <PlayerStatusBadge playerId={player.id} currentStatus={player.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-sm text-slate-500 capitalize">
                        {player.year?.replace('_', ' ') || 'Player'}
                      </span>
                      {player.hometown && player.state && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-sm text-slate-500">
                            {player.hometown}, {player.state}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="hidden md:flex items-center gap-6">
                    <div className="text-center px-3">
                      <p className="text-xs text-slate-400 mb-0.5">Rounds</p>
                      <p className="font-semibold text-slate-900 tabular-nums">{player.rounds_count || 0}</p>
                    </div>
                    <div className="text-center px-3">
                      <p className="text-xs text-slate-400 mb-0.5">Avg Score</p>
                      <p className="font-semibold text-slate-900 tabular-nums">
                        {player.avg_score && player.avg_score > 0 ? player.avg_score.toFixed(1) : '--'}
                      </p>
                    </div>
                    <div className="text-center px-3">
                      <p className="text-xs text-slate-400 mb-0.5">Handicap</p>
                      <p className="font-semibold text-slate-900 tabular-nums">
                        {player.handicap !== null ? player.handicap.toFixed(1) : '--'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/golf/dashboard/stats?player=${player.id}`}>
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="View Stats">
                        <IconChartBar size={18} className="text-slate-500" />
                      </button>
                    </Link>
                    <Link href={`/golf/dashboard/messages?player=${player.id}`}>
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="Send Message">
                        <IconMessage size={18} className="text-slate-500" />
                      </button>
                    </Link>
                    <Link href={`/golf/dashboard/roster/${player.id}`}>
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title="View Profile">
                        <IconChevronRight size={18} className="text-slate-400" />
                      </button>
                    </Link>
                  </div>
                </div>

                {/* Mobile Stats Row */}
                <div className="md:hidden flex items-center justify-around px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Rounds</p>
                    <p className="font-semibold text-slate-900 text-sm">{player.rounds_count || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Avg</p>
                    <p className="font-semibold text-slate-900 text-sm">
                      {player.avg_score && player.avg_score > 0 ? player.avg_score.toFixed(1) : '--'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">HCP</p>
                    <p className="font-semibold text-slate-900 text-sm">
                      {player.handicap !== null ? player.handicap.toFixed(1) : '--'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CSS Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
