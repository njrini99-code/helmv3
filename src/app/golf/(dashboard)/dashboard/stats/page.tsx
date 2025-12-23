'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { IconChart, IconChevronRight, IconUser, IconTrendingUp } from '@/components/icons';

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
      
      // Load team players
      if (coach.team_id) {
        const { data: teamPlayers } = await supabase
          .from('golf_players')
          .select('id, first_name, last_name, avatar_url, year, handicap')
          .eq('team_id', coach.team_id)
          .order('last_name');

        if (teamPlayers) {
          // Get basic stats for each player
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

    // Fetch rounds
    const { data: rounds } = await supabase
      .from('golf_rounds')
      .select('*')
      .eq('player_id', playerId)
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    // Fetch holes
    const roundIds = rounds?.map(r => r.id) || [];
    let holesData: any[] = [];
    if (roundIds.length > 0) {
      const { data } = await supabase
        .from('golf_holes')
        .select('*')
        .in('round_id', roundIds);
      holesData = data || [];
    }

    // Calculate comprehensive stats
    const totalRounds = rounds?.length || 0;
    const scores = rounds?.map(r => r.total_score).filter(Boolean) as number[];
    
    const stats = {
      roundsPlayed: totalRounds,
      scoringAverage: scores.length > 0 
        ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
        : '--',
      bestRound: scores.length > 0 ? Math.min(...scores) : null,
      worstRound: scores.length > 0 ? Math.max(...scores) : null,
      
      // Scoring distribution
      eagles: holesData.filter(h => h.score && h.par && h.score <= h.par - 2).length,
      birdies: holesData.filter(h => h.score && h.par && h.score === h.par - 1).length,
      pars: holesData.filter(h => h.score && h.par && h.score === h.par).length,
      bogeys: holesData.filter(h => h.score && h.par && h.score === h.par + 1).length,
      doubles: holesData.filter(h => h.score && h.par && h.score >= h.par + 2).length,
      
      // Fairways & Greens
      fairwaysHit: holesData.filter(h => h.fairway_hit === true).length,
      fairwayOpps: holesData.filter(h => h.fairway_hit !== null).length,
      girsHit: holesData.filter(h => h.green_in_regulation === true).length,
      girOpps: holesData.filter(h => h.green_in_regulation !== null).length,
      
      // Putting
      totalPutts: holesData.reduce((sum, h) => sum + (h.putts || 0), 0),
      holesWithPutts: holesData.filter(h => h.putts !== null).length,
      threePutts: holesData.filter(h => h.putts && h.putts >= 3).length,
      
      // Scrambling
      scrambleAttempts: holesData.filter(h => h.scramble_attempt === true).length,
      scramblesMade: holesData.filter(h => h.scramble_made === true).length,
      
      // Sand saves
      sandAttempts: holesData.filter(h => h.sand_save_attempt === true).length,
      sandMade: holesData.filter(h => h.sand_save_made === true).length,
      
      // Recent rounds for display
      recentRounds: (rounds || []).slice(0, 10).map(r => ({
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Stats</h1>
          <p className="text-slate-500 mt-1">Select a player to view their detailed statistics</p>
        </div>

        {players.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconUser size={32} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
            <p className="text-slate-500">Add players to your roster to track their stats.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => handleSelectPlayer(player)}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-green-300 hover:shadow-md transition-all text-left flex items-center gap-4 group"
              >
                <Avatar 
                  name={`${player.first_name || ''} ${player.last_name || ''}`}
                  src={player.avatar_url}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 group-hover:text-green-600 transition-colors">
                    {player.first_name} {player.last_name}
                  </p>
                  <p className="text-sm text-slate-500 capitalize">
                    {player.year?.replace('_', ' ') || 'Player'} 
                    {player.handicap !== null && ` • ${player.handicap > 0 ? '+' : ''}${player.handicap} HCP`}
                  </p>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-slate-400 text-xs">Rounds</p>
                    <p className="font-semibold text-slate-900">{player.stats?.rounds_played || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 text-xs">Avg</p>
                    <p className="font-semibold text-slate-900">
                      {player.stats?.scoring_average?.toFixed(1) || '--'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 text-xs">Best</p>
                    <p className="font-semibold text-green-600">
                      {player.stats?.best_round || '--'}
                    </p>
                  </div>
                  <IconChevronRight size={20} className="text-slate-400 group-hover:text-green-600 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Player stats view (for both coaches viewing a player and players viewing their own)
  return (
    <div className="space-y-6">
      {/* Header with back button for coaches */}
      <div className="flex items-center gap-4">
        {userRole === 'coach' && (
          <button
            onClick={() => {
              setSelectedPlayerId(null);
              setPlayerStats(null);
            }}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <IconChevronRight size={20} className="rotate-180 text-slate-600" />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {playerName ? `${playerName}'s Stats` : 'Player Stats'}
          </h1>
          <p className="text-slate-500 mt-1">Comprehensive performance analytics</p>
        </div>
      </div>

      {loadingStats ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
        </div>
      ) : !playerStats ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <IconChart size={32} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Stats Yet</h3>
          <p className="text-slate-500">Complete some rounds to see statistics here.</p>
        </div>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Rounds Played" value={playerStats.roundsPlayed} />
            <StatCard label="Scoring Average" value={playerStats.scoringAverage} />
            <StatCard label="Best Round" value={playerStats.bestRound || '--'} highlight />
            <StatCard label="Worst Round" value={playerStats.worstRound || '--'} />
          </div>

          {/* Scoring Distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Scoring Distribution</h3>
            <div className="grid grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-yellow-600">{playerStats.eagles}</div>
                <div className="text-xs text-slate-500">Eagles</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{playerStats.birdies}</div>
                <div className="text-xs text-slate-500">Birdies</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-700">{playerStats.pars}</div>
                <div className="text-xs text-slate-500">Pars</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-500">{playerStats.bogeys}</div>
                <div className="text-xs text-slate-500">Bogeys</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{playerStats.doubles}</div>
                <div className="text-xs text-slate-500">Double+</div>
              </div>
            </div>
          </div>

          {/* Key Stats Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Fairways & Greens */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Fairways & Greens</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Fairways Hit</span>
                  <span className="font-semibold">
                    {playerStats.fairwaysHit}/{playerStats.fairwayOpps}
                    {playerStats.fairwayOpps > 0 && (
                      <span className="text-slate-400 ml-2">
                        ({((playerStats.fairwaysHit / playerStats.fairwayOpps) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Greens in Regulation</span>
                  <span className="font-semibold">
                    {playerStats.girsHit}/{playerStats.girOpps}
                    {playerStats.girOpps > 0 && (
                      <span className="text-slate-400 ml-2">
                        ({((playerStats.girsHit / playerStats.girOpps) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Putting */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Putting</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Putts per Round</span>
                  <span className="font-semibold">
                    {playerStats.roundsPlayed > 0 
                      ? (playerStats.totalPutts / playerStats.roundsPlayed).toFixed(1)
                      : '--'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">3-Putts</span>
                  <span className="font-semibold text-red-500">{playerStats.threePutts}</span>
                </div>
              </div>
            </div>

            {/* Short Game */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Short Game</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Scrambling</span>
                  <span className="font-semibold">
                    {playerStats.scramblesMade}/{playerStats.scrambleAttempts}
                    {playerStats.scrambleAttempts > 0 && (
                      <span className="text-slate-400 ml-2">
                        ({((playerStats.scramblesMade / playerStats.scrambleAttempts) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Sand Saves</span>
                  <span className="font-semibold">
                    {playerStats.sandMade}/{playerStats.sandAttempts}
                    {playerStats.sandAttempts > 0 && (
                      <span className="text-slate-400 ml-2">
                        ({((playerStats.sandMade / playerStats.sandAttempts) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Rounds */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Recent Rounds</h3>
              {playerStats.recentRounds.length === 0 ? (
                <p className="text-slate-500 text-sm">No rounds recorded yet</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {playerStats.recentRounds.map((round: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-sm py-1 border-b border-slate-100 last:border-0">
                      <div>
                        <span className="font-medium text-slate-900">{round.course}</span>
                        <span className="text-slate-400 ml-2 text-xs">
                          {new Date(round.date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{round.score}</span>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          round.toPar < 0 ? 'bg-green-100 text-green-700' :
                          round.toPar === 0 ? 'bg-slate-100 text-slate-700' :
                          'bg-red-100 text-red-700'
                        )}>
                          {round.toPar > 0 ? '+' : ''}{round.toPar}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={cn(
        "text-2xl font-bold",
        highlight ? "text-green-600" : "text-slate-900"
      )}>
        {value}
      </p>
    </div>
  );
}
