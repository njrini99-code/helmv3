'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { IconChartBar, IconChevronRight, IconChevronLeft, IconUser, IconTrendingUp, IconTrendingDown, IconFlag, IconGolf } from '@/components/icons';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  year: string | null;
  handicap: number | null;
}

interface PlayerStats {
  rounds_played: number;
  scoring_average: number | null;
  best_round: number | null;
}

export default function GolfStatsPage() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(null);
  const [players, setPlayers] = useState<(Player & { stats?: PlayerStats })[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playerStats, setPlayerStats] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      window.location.href = '/golf/login';
      return;
    }

    // Check if coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, team_id')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      setUserRole('coach');
      
      if (coach.team_id) {
        const { data: teamPlayers } = await supabase
          .from('golf_players')
          .select('id, first_name, last_name, avatar_url, year, handicap')
          .eq('team_id', coach.team_id)
          .order('last_name');

        if (teamPlayers) {
          const playersWithStats = await Promise.all(
            teamPlayers.map(async (player) => {
              const { data: rounds } = await supabase
                .from('golf_rounds')
                .select('total_score')
                .eq('player_id', player.id)
                .not('total_score', 'is', null);

              const roundsPlayed = rounds?.length || 0;
              const scores = rounds?.map(r => r.total_score).filter(Boolean) as number[];
              const scoringAvg = scores.length > 0 
                ? scores.reduce((a, b) => a + b, 0) / scores.length 
                : null;
              const bestRound = scores.length > 0 ? Math.min(...scores) : null;

              return {
                ...player,
                stats: {
                  rounds_played: roundsPlayed,
                  scoring_average: scoringAvg,
                  best_round: bestRound,
                }
              };
            })
          );

          setPlayers(playersWithStats);
        }
      }
      
      setLoading(false);
      return;
    }

    // Check if player
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name')
      .eq('user_id', user.id)
      .single();

    if (player) {
      setUserRole('player');
      setSelectedPlayerId(player.id);
      setPlayerName(`${player.first_name || ''} ${player.last_name || ''}`.trim());
      await loadPlayerStats(player.id);
    }

    setLoading(false);
  }

  async function loadPlayerStats(playerId: string) {
    setLoadingStats(true);
    const supabase = createClient();

    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    const roundIds = rounds?.map(r => r.id) || [];
    let holesData: any[] = [];
    if (roundIds.length > 0) {
      const { data } = await supabase
        .from('golf_holes')
        .select('*')
        .in('round_id', roundIds);
      holesData = data || [];
    }

    const totalRounds = rounds?.length || 0;
    const scores = rounds?.map(r => r.total_score).filter(Boolean) as number[];
    
    const stats = {
      roundsPlayed: totalRounds,
      scoringAverage: scores.length > 0 
        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
        : '--',
      bestRound: scores.length > 0 ? Math.min(...scores) : null,
      worstRound: scores.length > 0 ? Math.max(...scores) : null,
      
      eagles: holesData.filter(h => h.score && h.par && h.score <= h.par - 2).length,
      birdies: holesData.filter(h => h.score && h.par && h.score === h.par - 1).length,
      pars: holesData.filter(h => h.score && h.par && h.score === h.par).length,
      bogeys: holesData.filter(h => h.score && h.par && h.score === h.par + 1).length,
      doubles: holesData.filter(h => h.score && h.par && h.score >= h.par + 2).length,
      
      fairwaysHit: holesData.filter(h => h.fairway_hit === true).length,
      fairwayOpps: holesData.filter(h => h.fairway_hit !== null).length,
      girsHit: holesData.filter(h => h.green_in_regulation === true).length,
      girOpps: holesData.filter(h => h.green_in_regulation !== null).length,
      
      totalPutts: holesData.reduce((sum, h) => sum + (h.putts || 0), 0),
      holesWithPutts: holesData.filter(h => h.putts !== null).length,
      threePutts: holesData.filter(h => h.putts && h.putts >= 3).length,
      
      scrambleAttempts: holesData.filter(h => h.scramble_attempt === true).length,
      scramblesMade: holesData.filter(h => h.scramble_made === true).length,
      
      sandAttempts: holesData.filter(h => h.sand_save_attempt === true).length,
      sandMade: holesData.filter(h => h.sand_save_made === true).length,
      
      recentRounds: (rounds || []).slice(0, 10).map(r => ({
        id: r.id,
        date: r.round_date,
        course: r.course_name,
        score: r.total_score,
        toPar: r.total_to_par,
        type: r.round_type,
      })),
    };

    setPlayerStats(stats);
    setLoadingStats(false);
  }

  async function handleSelectPlayer(player: Player) {
    setSelectedPlayerId(player.id);
    setPlayerName(`${player.first_name || ''} ${player.last_name || ''}`.trim());
    await loadPlayerStats(player.id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Coach view - show roster
  if (userRole === 'coach' && !selectedPlayerId) {
    return (
      <div className="min-h-screen">
        {/* Header */}
        <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team Stats</h1>
            <p className="text-slate-500 mt-0.5">Select a player to view detailed analytics</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {players.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconUser size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
              <p className="text-slate-500">Add players to your roster to track their stats.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {players.map((player, index) => (
                <button
                  key={player.id}
                  onClick={() => handleSelectPlayer(player)}
                  className="w-full group bg-white rounded-xl border border-slate-200/60 hover:border-slate-300 hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all duration-200 text-left"
                  style={{
                    animation: 'fadeInUp 0.4s ease-out forwards',
                    animationDelay: `${index * 30}ms`,
                    opacity: 0,
                  }}
                >
                  <div className="flex items-center gap-4 p-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-white font-semibold text-sm">
                        {player.first_name?.[0] || '?'}{player.last_name?.[0] || '?'}
                      </span>
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-sm text-slate-500 capitalize">
                        {player.year?.replace('_', ' ') || 'Player'} 
                        {player.handicap !== null && ` • ${player.handicap > 0 ? '+' : ''}${player.handicap} HCP`}
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex items-center gap-6">
                      <div className="text-center px-3">
                        <p className="text-xs text-slate-400 mb-0.5">Rounds</p>
                        <p className="font-semibold text-slate-900 tabular-nums">{player.stats?.rounds_played || 0}</p>
                      </div>
                      <div className="text-center px-3">
                        <p className="text-xs text-slate-400 mb-0.5">Avg Score</p>
                        <p className="font-semibold text-slate-900 tabular-nums">
                          {player.stats?.scoring_average?.toFixed(1) || '--'}
                        </p>
                      </div>
                      <div className="text-center px-3">
                        <p className="text-xs text-slate-400 mb-0.5">Best</p>
                        <p className="font-semibold text-emerald-600 tabular-nums">
                          {player.stats?.best_round || '--'}
                        </p>
                      </div>
                    </div>

                    <IconChevronRight size={20} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <style jsx>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // Player stats view
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200/60 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-4">
            {userRole === 'coach' && (
              <button
                onClick={() => {
                  setSelectedPlayerId(null);
                  setPlayerStats(null);
                }}
                className="p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <IconChevronLeft size={20} className="text-slate-600" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                {playerName ? `${playerName}'s Stats` : 'My Stats'}
              </h1>
              <p className="text-slate-500 mt-0.5">Performance analytics & insights</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {loadingStats ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
          </div>
        ) : !playerStats ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconChartBar size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Stats Yet</h3>
            <p className="text-slate-500">Complete some rounds to see statistics here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard 
                icon={<IconGolf size={20} className="text-emerald-600" />}
                iconColor="bg-emerald-50"
                label="Rounds Played"
                value={playerStats.roundsPlayed}
                delay={0}
              />
              <MetricCard 
                icon={<IconChartBar size={20} className="text-blue-600" />}
                iconColor="bg-blue-50"
                label="Scoring Average"
                value={playerStats.scoringAverage}
                delay={50}
              />
              <MetricCard 
                icon={<IconTrendingDown size={20} className="text-violet-600" />}
                iconColor="bg-violet-50"
                label="Best Round"
                value={playerStats.bestRound || '--'}
                highlight
                delay={100}
              />
              <MetricCard 
                icon={<IconTrendingUp size={20} className="text-amber-600" />}
                iconColor="bg-amber-50"
                label="Worst Round"
                value={playerStats.worstRound || '--'}
                delay={150}
              />
            </div>

            {/* Scoring Distribution */}
            <div 
              className="bg-white rounded-2xl border border-slate-200/60 p-6"
              style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '200ms', opacity: 0 }}
            >
              <h3 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-5">Scoring Distribution</h3>
              <div className="grid grid-cols-5 gap-4">
                <ScoreDistributionItem label="Eagles" value={playerStats.eagles} color="text-amber-500" bgColor="bg-amber-50" />
                <ScoreDistributionItem label="Birdies" value={playerStats.birdies} color="text-emerald-600" bgColor="bg-emerald-50" />
                <ScoreDistributionItem label="Pars" value={playerStats.pars} color="text-slate-700" bgColor="bg-slate-100" />
                <ScoreDistributionItem label="Bogeys" value={playerStats.bogeys} color="text-orange-500" bgColor="bg-orange-50" />
                <ScoreDistributionItem label="Double+" value={playerStats.doubles} color="text-red-500" bgColor="bg-red-50" />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Fairways & Greens */}
              <StatsCard 
                title="Fairways & Greens" 
                delay={250}
                items={[
                  { 
                    label: 'Fairways Hit', 
                    value: `${playerStats.fairwaysHit}/${playerStats.fairwayOpps}`,
                    percentage: playerStats.fairwayOpps > 0 ? ((playerStats.fairwaysHit / playerStats.fairwayOpps) * 100).toFixed(0) : null
                  },
                  { 
                    label: 'Greens in Regulation', 
                    value: `${playerStats.girsHit}/${playerStats.girOpps}`,
                    percentage: playerStats.girOpps > 0 ? ((playerStats.girsHit / playerStats.girOpps) * 100).toFixed(0) : null
                  },
                ]}
              />

              {/* Putting */}
              <StatsCard 
                title="Putting" 
                delay={300}
                items={[
                  { 
                    label: 'Putts per Round', 
                    value: playerStats.roundsPlayed > 0 
                      ? (playerStats.totalPutts / playerStats.roundsPlayed).toFixed(1)
                      : '--'
                  },
                  { 
                    label: '3-Putts', 
                    value: playerStats.threePutts,
                    negative: true
                  },
                ]}
              />

              {/* Short Game */}
              <StatsCard 
                title="Short Game" 
                delay={350}
                items={[
                  { 
                    label: 'Scrambling', 
                    value: `${playerStats.scramblesMade}/${playerStats.scrambleAttempts}`,
                    percentage: playerStats.scrambleAttempts > 0 ? ((playerStats.scramblesMade / playerStats.scrambleAttempts) * 100).toFixed(0) : null
                  },
                  { 
                    label: 'Sand Saves', 
                    value: `${playerStats.sandMade}/${playerStats.sandAttempts}`,
                    percentage: playerStats.sandAttempts > 0 ? ((playerStats.sandMade / playerStats.sandAttempts) * 100).toFixed(0) : null
                  },
                ]}
              />

              {/* Recent Rounds */}
              <div 
                className="bg-white rounded-2xl border border-slate-200/60 p-6"
                style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: '400ms', opacity: 0 }}
              >
                <h3 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Recent Rounds</h3>
                {playerStats.recentRounds.length === 0 ? (
                  <p className="text-slate-500 text-sm">No rounds recorded yet</p>
                ) : (
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {playerStats.recentRounds.map((round: any, i: number) => (
                      <div key={round.id || i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0',
                          round.toPar < 0 ? 'bg-emerald-50' : round.toPar === 0 ? 'bg-slate-100' : 'bg-amber-50'
                        )}>
                          <span className={cn(
                            'text-sm font-bold',
                            round.toPar < 0 ? 'text-emerald-600' : round.toPar === 0 ? 'text-slate-700' : 'text-amber-600'
                          )}>
                            {round.score}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{round.course}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(round.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <span className={cn(
                          'text-xs font-medium px-2 py-1 rounded-full',
                          round.toPar < 0 ? 'bg-emerald-100 text-emerald-700' :
                          round.toPar === 0 ? 'bg-slate-100 text-slate-700' :
                          'bg-amber-100 text-amber-700'
                        )}>
                          {round.toPar > 0 ? '+' : ''}{round.toPar}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Components
function MetricCard({ 
  icon, 
  iconColor,
  label, 
  value, 
  highlight = false,
  delay = 0 
}: { 
  icon: React.ReactNode; 
  iconColor: string;
  label: string; 
  value: string | number;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <div 
      className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all"
      style={{ 
        animationDelay: `${delay}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[13px] font-medium text-slate-500 mb-1">{label}</p>
          <p className={cn(
            'text-[28px] font-semibold tracking-tight',
            highlight ? 'text-emerald-600' : 'text-slate-900'
          )}>
            {value}
          </p>
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', iconColor)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function ScoreDistributionItem({ 
  label, 
  value, 
  color, 
  bgColor 
}: { 
  label: string; 
  value: number; 
  color: string;
  bgColor: string;
}) {
  return (
    <div className="text-center">
      <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-2', bgColor)}>
        <span className={cn('text-xl font-bold', color)}>{value}</span>
      </div>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function StatsCard({ 
  title, 
  items,
  delay = 0 
}: { 
  title: string; 
  items: Array<{ label: string; value: string | number; percentage?: string | null; negative?: boolean }>;
  delay?: number;
}) {
  return (
    <div 
      className="bg-white rounded-2xl border border-slate-200/60 p-6"
      style={{ animation: 'fadeInUp 0.4s ease-out forwards', animationDelay: `${delay}ms`, opacity: 0 }}
    >
      <h3 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-4">{title}</h3>
      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between items-center">
            <span className="text-slate-600">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className={cn('font-semibold', item.negative ? 'text-red-500' : 'text-slate-900')}>
                {item.value}
              </span>
              {item.percentage && (
                <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  {item.percentage}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
