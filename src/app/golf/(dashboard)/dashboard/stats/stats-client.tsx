'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ShineEffect } from '@/components/ui/shine-effect';
import { createClient } from '@/lib/supabase/client';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import {
  getDetailedStats,
  getFilterOptions,
  getCourseBreakdown,
  getWorstHoleAnalysis,
  getTrendAnalysis,
  type StatsSummary,
  type RoundSummary,
  type StatsFilter,
  type FilterOptions,
  type CourseBreakdownResponse,
  type WorstHoleResponse,
  type TrendAnalysisResponse,
} from '@/app/golf/actions/stats-data';
import GolfStatsDisplay from '@/components/golf/stats/GolfStatsDisplay';
import { DetailedStatsSkeleton } from '@/components/golf/GolfSkeletons';
import { IconChevronLeft, IconUser, IconRefresh } from '@/components/icons';

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'overview' | 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  grad_year: number | null;
  handicap: number | null;
}

interface PlayerStats {
  rounds_played: number;
  scoring_average: number | null;
  best_round: number | null;
}

// Note: StatsViewState could be used for more complex state machine
// keeping for potential future use
// type StatsViewState =
//   | { status: 'idle' }
//   | { status: 'loading-summary' }
//   | { status: 'summary-ready'; summary: StatsSummary; rounds: RoundSummary[] }
//   | { status: 'loading-detailed' }
//   | { status: 'detailed-ready'; stats: GolfStats };

// ============================================================================
// STATS CLIENT COMPONENT
// ============================================================================

interface StatsClientProps {
  initialPlayers?: (Player & { stats?: PlayerStats })[];
  initialUserRole?: 'coach' | 'player' | null;
  initialPlayerId?: string | null;
  initialPlayerName?: string;
  initialSummary?: StatsSummary;
  initialRounds?: RoundSummary[];
}

export default function StatsClient({
  initialPlayers = [],
  initialUserRole,
  initialPlayerId,
  initialPlayerName = '',
  initialSummary,
  initialRounds = [],
}: StatsClientProps) {
  // Core state
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(initialUserRole ?? null);
  const [players, setPlayers] = useState<(Player & { stats?: PlayerStats })[]>(initialPlayers);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(initialPlayerId ?? null);
  const [selectedPlayer, setSelectedPlayer] = useState<(Player & { stats?: PlayerStats }) | null>(null);
  const [playerName, setPlayerName] = useState(initialPlayerName);

  // Stats state - separating summary from detailed
  // Summary is kept for potential future display during detailed loading
  const [_summary, setSummary] = useState<StatsSummary | null>(initialSummary ?? null);
  const [rounds, setRounds] = useState<RoundSummary[]>(initialRounds);
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | 'overall'>('overall');

  // Loading states
  const [loading, setLoading] = useState(!initialUserRole);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  // Active tab is tracked for potential category-specific lazy loading
  const [activeTab, _setActiveTab] = useState<StatsCategory>('scoring');

  // Filter state
  const [activeFilter, setActiveFilter] = useState<StatsFilter | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  // Additional analytics data
  const [courseBreakdown, setCourseBreakdown] = useState<CourseBreakdownResponse | null>(null);
  const [worstHoleData, setWorstHoleData] = useState<WorstHoleResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);

  // Cache for detailed stats to prevent re-fetching
  const detailedStatsCache = useRef<Map<string, GolfStats>>(new Map());
  const lastFetchedPlayerId = useRef<string | null>(null);
  const lastFetchedRoundId = useRef<string | 'overall'>('overall');

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  // Load initial data if not provided via props
  useEffect(() => {
    if (!initialUserRole) {
      loadInitialData();
    }
  }, [initialUserRole]);

  async function loadInitialData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = '/golf/login';
      return;
    }

    // Check if coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      setUserRole('coach');
      await loadCoachPlayers(coach.organization_id);
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
      await loadPlayerSummary(player.id);
      setLoading(false);
    }
  }

  async function loadCoachPlayers(organizationId: string | null) {
    if (!organizationId) return;

    const supabase = createClient();

    // Get team_id from organization
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!orgTeam?.id) return;

    // Get player IDs from team_members
    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', orgTeam.id);

    const playerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (playerIds.length === 0) return;

    const { data: teamPlayers } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, grad_year, handicap')
      .in('id', playerIds)
      .order('last_name');

    if (!teamPlayers || teamPlayers.length === 0) return;

    // Fetch ALL rounds for ALL players in ONE query
    const { data: allRounds } = await supabase
      .from('golf_rounds')
      .select('player_id, total_score')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .not('total_score', 'is', null);

    // Group rounds by player
    const roundsByPlayer = (allRounds || []).reduce((acc, round) => {
      if (!acc[round.player_id]) acc[round.player_id] = [];
      if (round.total_score !== null) {
        acc[round.player_id]!.push(round.total_score);
      }
      return acc;
    }, {} as Record<string, number[]>);

    // Calculate stats for each player
    const playersWithStats = teamPlayers.map(player => {
      const scores = roundsByPlayer[player.id] || [];
      return {
        ...player,
        stats: {
          rounds_played: scores.length,
          scoring_average: scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null,
          best_round: scores.length > 0 ? Math.min(...scores) : null,
        }
      };
    });

    setPlayers(playersWithStats);
  }

  /**
   * Load lightweight summary stats (fast initial load)
   */
  async function loadPlayerSummary(playerId: string) {
    const supabase = createClient();

    // Fast query - no shot data
    // Note: scramble stats are only in golf_round_stats_cache, not in golf_rounds
    const { data: roundsData } = await supabase
      .from('golf_rounds')
      .select(`
        id,
        round_date,
        course_name,
        round_type,
        total_score,
        score_to_par,
        total_fairways_hit,
        total_fairways,
        total_gir,
        total_gir_possible,
        total_putts
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    if (!roundsData || roundsData.length === 0) {
      setSummary({
        roundsPlayed: 0,
        holesPlayed: 0,
        scoringAverage: null,
        bestRound: null,
        worstRound: null,
        girPercentage: null,
        fairwayPercentage: null,
        puttsPerRound: null,
        scramblingPercentage: null,
      });
      setRounds([]);
      return;
    }

    // Calculate summary from rounds data
    const scores = roundsData.map(r => r.total_score).filter((s): s is number => s !== null);
    let totalFairwaysHit = 0, totalFairwayOpp = 0;
    let totalGir = 0, totalGirOpp = 0;
    let totalPutts = 0;

    for (const round of roundsData) {
      if (round.total_fairways_hit !== null && round.total_fairways !== null) {
        totalFairwaysHit += round.total_fairways_hit;
        totalFairwayOpp += round.total_fairways;
      }
      if (round.total_gir !== null && round.total_gir_possible !== null) {
        totalGir += round.total_gir;
        totalGirOpp += round.total_gir_possible;
      }
      if (round.total_putts !== null) {
        totalPutts += round.total_putts;
      }
    }

    setSummary({
      roundsPlayed: scores.length,
      holesPlayed: scores.length * 18,
      scoringAverage: scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      bestRound: scores.length > 0 ? Math.min(...scores) : null,
      worstRound: scores.length > 0 ? Math.max(...scores) : null,
      girPercentage: totalGirOpp > 0
        ? Math.round((totalGir / totalGirOpp) * 1000) / 10
        : null,
      fairwayPercentage: totalFairwayOpp > 0
        ? Math.round((totalFairwaysHit / totalFairwayOpp) * 1000) / 10
        : null,
      puttsPerRound: scores.length > 0
        ? Math.round((totalPutts / scores.length) * 10) / 10
        : null,
      // Note: scramblingPercentage requires data from golf_round_stats_cache
      scramblingPercentage: null,
    });

    setRounds(roundsData.map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name,
      round_type: r.round_type,
      total_score: r.total_score,
      score_to_par: r.score_to_par,
    })));
  }

  /**
   * Load detailed shot-level stats (lazy loaded when needed)
   */
  const loadDetailedStats = useCallback(async (
    playerId: string,
    roundId: string | 'overall' = 'overall',
    filter?: StatsFilter | null
  ) => {
    // Build cache key including filter
    const filterKey = filter ? JSON.stringify(filter) : 'none';
    const cacheKey = `${playerId}-${roundId}-${filterKey}`;

    // Check cache first
    if (detailedStatsCache.current.has(cacheKey)) {
      setDetailedStats(detailedStatsCache.current.get(cacheKey)!);
      return;
    }

    // Skip if already loading this exact data
    if (lastFetchedPlayerId.current === playerId && lastFetchedRoundId.current === roundId && loadingDetailed) {
      return;
    }

    setLoadingDetailed(true);
    lastFetchedPlayerId.current = playerId;
    lastFetchedRoundId.current = roundId;

    try {
      const stats = await getDetailedStats(playerId, roundId, filter || undefined);
      detailedStatsCache.current.set(cacheKey, stats);
      setDetailedStats(stats);
    } catch (error) {
      console.error('Failed to load detailed stats:', error);
    } finally {
      setLoadingDetailed(false);
    }
  }, [loadingDetailed]);

  /**
   * Load filter options and additional analytics for a player
   */
  const loadPlayerAnalytics = useCallback(async (playerId: string) => {
    try {
      const [options, courses, holes, trends] = await Promise.all([
        getFilterOptions(playerId),
        getCourseBreakdown(playerId),
        getWorstHoleAnalysis(playerId),
        getTrendAnalysis(playerId),
      ]);
      setFilterOptions(options);
      setCourseBreakdown(courses);
      setWorstHoleData(holes);
      setTrendData(trends);
    } catch (error) {
      console.error('Failed to load player analytics:', error);
    }
  }, []);

  /**
   * Handle filter change
   */
  const handleFilterChange = useCallback((filter: StatsFilter | null) => {
    setActiveFilter(filter);
    // Clear detailed stats to force reload with new filter
    setDetailedStats(null);
  }, []);

  // Load detailed stats when needed (player selected or tab changed to detailed view)
  useEffect(() => {
    const playerId = selectedPlayerId || (userRole === 'player' ? initialPlayerId : null);
    if (!playerId) return;

    // Load detailed stats when viewing detailed tabs
    const detailedTabs: StatsCategory[] = ['scoring', 'driving', 'approach', 'putting', 'scrambling', 'strokes-gained', 'progress'];
    if (detailedTabs.includes(activeTab) && !detailedStats) {
      loadDetailedStats(playerId, selectedRoundId, activeFilter);
    }
  }, [activeTab, selectedPlayerId, selectedRoundId, initialPlayerId, userRole, detailedStats, loadDetailedStats, activeFilter]);

  // Reload detailed stats when round selection or filter changes
  useEffect(() => {
    const playerId = selectedPlayerId || (userRole === 'player' ? initialPlayerId : null);
    if (!playerId) return;

    // Build cache key including filter
    const filterKey = activeFilter ? JSON.stringify(activeFilter) : 'none';
    const cacheKey = `${playerId}-${selectedRoundId}-${filterKey}`;

    if (detailedStatsCache.current.has(cacheKey)) {
      setDetailedStats(detailedStatsCache.current.get(cacheKey)!);
    } else if (detailedStats) {
      // Reload with new filter/round
      loadDetailedStats(playerId, selectedRoundId, activeFilter);
    }
  }, [selectedRoundId, activeFilter]);

  // Load filter options and analytics when player is selected
  useEffect(() => {
    const playerId = selectedPlayerId || (userRole === 'player' ? initialPlayerId : null);
    if (!playerId) return;

    loadPlayerAnalytics(playerId);
  }, [selectedPlayerId, initialPlayerId, userRole, loadPlayerAnalytics]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  async function handlePlayerClick(playerId: string) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    setSelectedPlayerId(playerId);
    setSelectedPlayer(player);
    setPlayerName(`${player.first_name} ${player.last_name}`);
    setDetailedStats(null); // Clear previous detailed stats
    setActiveFilter(null); // Reset filter for new player
    setCourseBreakdown(null);
    setWorstHoleData(null);
    setFilterOptions(null);
    setTrendData(null);

    await loadPlayerSummary(playerId);
    // Don't load detailed stats immediately - wait for tab activation
  }

  function handleBackClick() {
    setSelectedPlayerId(null);
    setSelectedPlayer(null);
    setDetailedStats(null);
    setSummary(null);
    setRounds([]);
    setActiveFilter(null);
    setCourseBreakdown(null);
    setWorstHoleData(null);
    setFilterOptions(null);
    setTrendData(null);
  }

  function handleRefresh() {
    const playerId = selectedPlayerId || (userRole === 'player' ? initialPlayerId : null);
    if (!playerId) return;

    // Clear cache for this player
    for (const key of detailedStatsCache.current.keys()) {
      if (key.startsWith(playerId)) {
        detailedStatsCache.current.delete(key);
      }
    }

    setDetailedStats(null);
    loadPlayerSummary(playerId);
    loadDetailedStats(playerId, selectedRoundId, activeFilter);
    loadPlayerAnalytics(playerId);
  }

  // ============================================================================
  // RENDER
  // ============================================================================

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
            <div className="relative glass-standard rounded-2xl overflow-hidden p-16 text-center">
              <ShineEffect />
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
                  className="w-full group relative glass-standard rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-left"
                  style={{
                    animation: 'fadeInUp 0.4s ease-out forwards',
                    animationDelay: `${index * 30}ms`,
                    opacity: 0,
                  }}
                >
                  <ShineEffect />
                  <div className="flex items-center gap-4 p-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-white font-semibold text-sm">
                        {player.first_name?.[0] || '?'}{player.last_name?.[0] || '?'}
                      </span>
                    </div>

                    {/* Player Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 group-hover:text-green-600 transition-colors">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-sm text-slate-500 capitalize">
                        {player.grad_year ? `Class of ${player.grad_year}` : 'Player'}
                        {player.handicap !== null && ` | ${player.handicap > 0 ? '+' : ''}${player.handicap} HCP`}
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
                        <p className="font-semibold text-green-600 tabular-nums">
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
          onClick={handleBackClick}
          className="fixed top-6 left-6 z-50 p-3 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg hover:shadow-xl hover:bg-white transition-all group"
        >
          <IconChevronLeft size={20} className="text-slate-600 group-hover:text-green-600 transition-colors" />
        </button>
      )}

      {/* Refresh Button */}
      <button
        onClick={handleRefresh}
        disabled={loadingDetailed}
        className="fixed top-6 right-6 z-50 p-3 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg hover:shadow-xl hover:bg-white transition-all group disabled:opacity-50"
        title="Refresh stats"
      >
        <IconRefresh
          size={20}
          className={`text-slate-600 group-hover:text-green-600 transition-colors ${loadingDetailed ? 'animate-spin' : ''}`}
        />
      </button>

      {/* Stats Display */}
      {loadingDetailed && !detailedStats ? (
        <DetailedStatsSkeleton />
      ) : detailedStats ? (
        <GolfStatsDisplay
          stats={detailedStats}
          playerName={playerName}
          // Player profile (for coach view)
          playerProfile={userRole === 'coach' && selectedPlayer ? {
            avatarUrl: selectedPlayer.avatar_url,
            gradYear: selectedPlayer.grad_year,
            handicap: selectedPlayer.handicap,
            roundsPlayed: selectedPlayer.stats?.rounds_played,
            scoringAverage: selectedPlayer.stats?.scoring_average,
            bestRound: selectedPlayer.stats?.best_round,
          } : undefined}
          isCoachView={userRole === 'coach'}
          rounds={rounds.filter((r): r is RoundSummary & { total_score: number; score_to_par: number } =>
            r.total_score !== null && r.score_to_par !== null
          ).map(r => ({
            id: r.id,
            round_date: r.round_date,
            course_name: r.course_name || 'Unknown Course',
            total_score: r.total_score,
            total_to_par: r.score_to_par,
          }))}
          selectedRoundId={selectedRoundId}
          onRoundChange={setSelectedRoundId}
          // Filter props
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          filterOptions={filterOptions}
          // Analytics props
          courseBreakdown={courseBreakdown}
          worstHoleData={worstHoleData}
          trendData={trendData}
        />
      ) : null}
    </div>
  );
}
