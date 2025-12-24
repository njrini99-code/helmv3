'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  calculateStatsFromShots,
  type GolfStats,
  type RawShot,
  type HoleInfo,
  type RoundInfo
} from '@/lib/utils/golf-stats-calculator-shots';
import GolfStatsDisplay from '@/components/golf/stats/GolfStatsDisplay';
import { IconChevronLeft, IconUser } from '@/components/icons';

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
  const [comprehensiveStats, setComprehensiveStats] = useState<GolfStats | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [loadingStats, setLoadingStats] = useState(false);
  const [rounds, setRounds] = useState<any[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | 'overall'>('overall');

  useEffect(() => {
    loadData();
  }, []);

  // Reload stats when round selection changes
  useEffect(() => {
    if (selectedPlayerId) {
      loadPlayerStats(selectedPlayerId);
    } else if (userRole === 'player') {
      // Reload player's own stats
      const reloadPlayerStats = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: player } = await supabase
            .from('golf_players')
            .select('id')
            .eq('user_id', user.id)
            .single();
          if (player) {
            await loadPlayerStats(player.id);
          }
        }
      };
      reloadPlayerStats();
    }
  }, [selectedRoundId]);

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
          // Calculate basic stats for each player
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
      setPlayerName(`${player.first_name} ${player.last_name}`);
      await loadPlayerStats(player.id);
      setLoading(false);
    }
  }

  async function loadPlayerStats(playerId: string) {
    setLoadingStats(true);
    const supabase = createClient();

    // Fetch all rounds with their IDs
    const { data: roundsData } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        round_date,
        course_name,
        round_type,
        total_score,
        total_to_par
      `)
      .eq('player_id', playerId)
      .order('round_date', { ascending: false });

    // Store rounds for selector
    setRounds(roundsData || []);

    // Initialize empty stats if no rounds
    if (!roundsData || roundsData.length === 0) {
      const stats = calculateStatsFromShots([], [], []);
      setComprehensiveStats(stats);
      setLoadingStats(false);
      return;
    }

    // Determine which rounds to include based on selection
    const roundIds = selectedRoundId === 'overall'
      ? roundsData.map(r => r.id)
      : [selectedRoundId];

    // Fetch holes (par and yardage only - no pre-calculated stats needed)
    const { data: holesData } = await supabase
      .from('golf_holes')
      .select('id, round_id, hole_number, par, yardage')
      .in('round_id', roundIds);

    // Fetch ALL shots (source of truth)
    const { data: shotsData } = await supabase
      .from('golf_shots')
      .select('*')
      .in('round_id', roundIds)
      .order('hole_number')
      .order('shot_number');

    // Transform to types expected by calculator (only filtered rounds)
    const filteredRoundsData = selectedRoundId === 'overall'
      ? roundsData
      : roundsData.filter(r => r.id === selectedRoundId);

    const roundsInfo: RoundInfo[] = filteredRoundsData.map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name,
      round_type: r.round_type as 'practice' | 'qualifying' | 'tournament',
    }));

    const holesInfo: HoleInfo[] = (holesData || []).map(h => ({
      id: h.id,
      round_id: h.round_id,
      hole_number: h.hole_number,
      par: h.par,
      yardage: h.yardage,
    }));

    const shots: RawShot[] = (shotsData || [])
      .filter(s =>
        s.distance_to_hole_before !== null &&
        s.distance_to_hole_after !== null &&
        s.shot_distance !== null
      )
      .map(s => ({
        id: s.id,
        round_id: s.round_id,
        hole_id: s.hole_id,
        hole_number: s.hole_number,
        shot_number: s.shot_number,
        shot_type: s.shot_type as 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty',
        club_type: s.club_type as 'driver' | 'non_driver' | 'putter',
        lie_before: s.lie_before as 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other',
        distance_to_hole_before: s.distance_to_hole_before!,
        distance_unit_before: s.distance_unit_before as 'yards' | 'feet',
        result: s.result as 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty',
        distance_to_hole_after: s.distance_to_hole_after!,
        distance_unit_after: s.distance_unit_after as 'yards' | 'feet',
        shot_distance: s.shot_distance!,
        miss_direction: s.miss_direction,
        putt_break: s.putt_break,
        putt_slope: s.putt_slope,
        is_penalty: s.is_penalty ?? false,
        penalty_type: s.penalty_type,
      }));

    // Calculate stats from raw shots ONLY (pure shot-based approach)
    const stats = calculateStatsFromShots(shots, holesInfo, roundsInfo);
    setComprehensiveStats(stats);
    setLoadingStats(false);
  }

  async function handlePlayerClick(playerId: string) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    setSelectedPlayerId(playerId);
    setPlayerName(`${player.first_name} ${player.last_name}`);
    await loadPlayerStats(playerId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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
            <p className="text-slate-500 mt-0.5">Select a player to view comprehensive analytics</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {players.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconUser size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
              <p className="text-slate-500">Add players to your team to view their statistics.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {players.map((player, index) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerClick(player.id)}
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
                          {player.stats?.scoring_average ? player.stats.scoring_average.toFixed(1) : '--'}
                        </p>
                      </div>
                      <div className="text-center px-3">
                        <p className="text-xs text-slate-400 mb-0.5">Best</p>
                        <p className="font-semibold text-emerald-600 tabular-nums">
                          {player.stats?.best_round || '--'}
                        </p>
                      </div>
                    </div>
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
    <div className="relative">
      {/* Floating Back Button for Coaches */}
      {userRole === 'coach' && (
        <button
          onClick={() => {
            setSelectedPlayerId(null);
            setComprehensiveStats(null);
          }}
          className="fixed top-6 left-6 z-50 p-3 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg hover:shadow-xl hover:bg-white transition-all group"
        >
          <IconChevronLeft size={20} className="text-slate-600 group-hover:text-green-600 transition-colors" />
        </button>
      )}

      {loadingStats ? (
        <div className="flex items-center justify-center min-h-screen bg-[#FAF6F1]">
          <div className="animate-spin h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" />
        </div>
      ) : comprehensiveStats ? (
        <GolfStatsDisplay
          stats={comprehensiveStats}
          playerName={playerName}
          rounds={rounds}
          selectedRoundId={selectedRoundId}
          onRoundChange={setSelectedRoundId}
        />
      ) : null}
    </div>
  );
}
