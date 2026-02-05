'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
import {
  IconChevronLeft,
  IconUser,
  IconRefresh,
  IconSearch,
  IconChart,
  IconChevronRight,
  IconMessageSquare,
  IconCalendar,
  IconUsers,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconMenu,
} from '@/components/icons';
import { useSidebar } from '@/contexts/sidebar-context';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'overview' | 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
}

interface PlayerStats {
  rounds_played: number;
  scoring_average: number | null;
  best_round: number | null;
  recent_scores?: number[];
  trend?: 'up' | 'down' | 'stable';
  last_played?: string;
}

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================

function Sparkline({ data, trend }: { data: number[]; trend: 'up' | 'down' | 'stable' }) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const height = 24;
  const width = 60;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#94a3b8';

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === data.length - 1 ? 3 : 2}
            fill={i === data.length - 1 ? color : 'white'}
            stroke={color}
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

// ============================================================================
// AVATAR WITH PERFORMANCE RING
// ============================================================================

function AvatarWithRing({
  initials,
  avatarUrl,
  trend,
}: {
  initials: string;
  avatarUrl?: string | null;
  trend: 'up' | 'down' | 'stable';
}) {
  const ringColor = trend === 'up' ? 'ring-green-400' : trend === 'down' ? 'ring-red-400' : 'ring-slate-300';

  return (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center ring-2 ${ringColor} ring-offset-2 overflow-hidden`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-green-600 flex items-center justify-center">
          <span className="text-white font-semibold text-sm">{initials}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TREND INDICATOR
// ============================================================================

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
        <IconTrendingUp size={14} />
        <span>Improving</span>
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center gap-1 text-red-500 text-sm font-medium">
        <IconTrendingDown size={14} />
        <span>Declining</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-500 text-sm font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      <span>Steady</span>
    </span>
  );
}

// ============================================================================
// KPI CARD
// ============================================================================

function KPICard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtext && (
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
              {trend === 'up' && <IconTrendingUp size={14} className="text-green-500" />}
              {trend === 'down' && <IconTrendingDown size={14} className="text-red-500" />}
              {subtext}
            </p>
          )}
        </div>
        <div className="p-2 bg-slate-100 rounded-lg">
          <Icon size={20} className="text-slate-600" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PLAYER CARD
// ============================================================================

function PlayerCard({
  player,
  rank,
  onClick,
}: {
  player: Player & { stats?: PlayerStats };
  rank: number;
  onClick: () => void;
}) {
  const initials = `${player.first_name?.[0] || '?'}${player.last_name?.[0] || '?'}`;
  const trend = player.stats?.trend || 'stable';
  const recentScores = player.stats?.recent_scores || [];

  return (
    <button
      onClick={onClick}
      className="w-full group bg-white rounded-xl border border-slate-200 p-4 hover:shadow-lg hover:border-slate-300 transition-all text-left"
    >
      <div className="flex items-center gap-4">
        {/* Rank badge */}
        <div className="w-8 text-center flex-shrink-0">
          <span className={`text-sm font-bold ${rank <= 3 ? 'text-green-600' : 'text-slate-400'}`}>
            #{rank}
          </span>
        </div>

        {/* Avatar with performance ring */}
        <AvatarWithRing initials={initials} avatarUrl={player.avatar_url} trend={trend} />

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 truncate group-hover:text-green-600 transition-colors">
              {player.first_name} {player.last_name}
            </h3>
            {player.graduation_year && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                &apos;{String(player.graduation_year).slice(-2)}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 truncate">
            {player.handicap !== null ? `+${player.handicap.toFixed(1)} HCP` : 'No handicap'}
          </p>
        </div>

        {/* Sparkline */}
        {recentScores.length >= 2 && (
          <div className="hidden sm:flex flex-col items-center px-4">
            <Sparkline data={recentScores} trend={trend} />
            <span className="text-xs text-slate-400 mt-1">Last {recentScores.length} rounds</span>
          </div>
        )}

        {/* Stats block */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {player.stats?.scoring_average?.toFixed(1) || '--'}
            </p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Avg</p>
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-slate-700 tabular-nums">
              {player.stats?.best_round || '--'}
            </p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Best</p>
          </div>

          <div className="text-center min-w-[80px]">
            <TrendIndicator trend={trend} />
            {player.stats?.last_played && (
              <p className="text-xs text-slate-400 mt-0.5">{player.stats.last_played}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pl-4 border-l border-slate-200">
          <span className="p-2 rounded-lg text-slate-400 group-hover:text-slate-600 transition-colors">
            <IconChart size={20} />
          </span>
          <span className="p-2 rounded-lg text-slate-400 group-hover:text-slate-600 transition-colors">
            <IconMessageSquare size={20} />
          </span>
          <IconChevronRight size={20} className="text-slate-300 ml-2" />
        </div>
      </div>
    </button>
  );
}

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

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'avg' | 'name' | 'improved' | 'recent'>('avg');

  // Stats state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_summary, setSummary] = useState<StatsSummary | null>(initialSummary ?? null);
  const [rounds, setRounds] = useState<RoundSummary[]>(initialRounds);
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | 'overall'>('overall');

  // Loading states
  const [loading, setLoading] = useState(!initialUserRole);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeTab, _setActiveTab] = useState<StatsCategory>('scoring');

  // Filter state
  const [activeFilter, setActiveFilter] = useState<StatsFilter | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  // Additional analytics data
  const [courseBreakdown, setCourseBreakdown] = useState<CourseBreakdownResponse | null>(null);
  const [worstHoleData, setWorstHoleData] = useState<WorstHoleResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);

  // Cache for detailed stats
  const detailedStatsCache = useRef<Map<string, GolfStats>>(new Map());
  const lastFetchedPlayerId = useRef<string | null>(null);
  const lastFetchedRoundId = useRef<string | 'overall'>('overall');

  // Mobile navigation
  const { toggleMobile } = useSidebar();

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = [...players];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(query)
      );
    }

    // Class filter
    if (classFilter !== 'all') {
      const year = parseInt(classFilter);
      result = result.filter(p => p.graduation_year === year);
    }

    // Sort
    switch (sortBy) {
      case 'avg':
        result.sort((a, b) => (a.stats?.scoring_average || 999) - (b.stats?.scoring_average || 999));
        break;
      case 'name':
        result.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        break;
      case 'improved':
        result.sort((a, b) => {
          const aImproved = a.stats?.trend === 'up' ? 0 : a.stats?.trend === 'stable' ? 1 : 2;
          const bImproved = b.stats?.trend === 'up' ? 0 : b.stats?.trend === 'stable' ? 1 : 2;
          return aImproved - bImproved;
        });
        break;
      case 'recent':
        // Sort by last played (would need actual dates)
        break;
    }

    return result;
  }, [players, searchQuery, classFilter, sortBy]);

  // Calculate team stats
  const teamStats = useMemo(() => {
    const playersWithStats = players.filter(p => p.stats?.scoring_average);
    const totalRounds = players.reduce((sum, p) => sum + (p.stats?.rounds_played || 0), 0);
    const teamAvg = playersWithStats.length > 0
      ? playersWithStats.reduce((sum, p) => sum + (p.stats?.scoring_average || 0), 0) / playersWithStats.length
      : 0;

    const sortedByAvg = [...playersWithStats].sort((a, b) =>
      (a.stats?.scoring_average || 999) - (b.stats?.scoring_average || 999)
    );
    const top5 = sortedByAvg.slice(0, 5);
    const top5Avg = top5.length > 0
      ? top5.reduce((sum, p) => sum + (p.stats?.scoring_average || 0), 0) / top5.length
      : 0;

    const improvingCount = players.filter(p => p.stats?.trend === 'up').length;

    return {
      teamAvg: teamAvg.toFixed(1),
      totalRounds,
      top5Avg: top5Avg.toFixed(1),
      improvingCount,
      totalPlayers: players.length,
    };
  }, [players]);

  // Get unique graduation years for filter
  const graduationYears = useMemo(() => {
    const years = new Set<number>();
    players.forEach(p => {
      if (p.graduation_year) years.add(p.graduation_year);
    });
    return Array.from(years).sort();
  }, [players]);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

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

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      setUserRole('coach');
      const loadedPlayers = await loadCoachPlayers(coach.organization_id);

      // If a specific player was requested via URL param, auto-select them
      if (initialPlayerId) {
        const target = loadedPlayers.find(p => p.id === initialPlayerId);
        if (target) {
          setSelectedPlayer(target);
          setPlayerName(`${target.first_name} ${target.last_name}`);
          await loadPlayerSummary(initialPlayerId);
        }
      }

      setLoading(false);
      return;
    }

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

  async function loadCoachPlayers(organizationId: string | null): Promise<(Player & { stats?: PlayerStats })[]> {
    if (!organizationId) return [];

    const supabase = createClient();

    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!orgTeam?.id) return [];

    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', orgTeam.id)
      .eq('status', 'active');

    const playerIds = teamMembers?.map(tm => tm.player_id) || [];

    if (playerIds.length === 0) return [];

    const { data: teamPlayers } = await supabase
      .from('golf_players')
      .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
      .in('id', playerIds)
      .order('last_name');

    if (!teamPlayers || teamPlayers.length === 0) return [];

    // Fetch ALL rounds for ALL players
    const { data: allRounds } = await supabase
      .from('golf_rounds')
      .select('player_id, total_score, round_date')
      .in('player_id', playerIds)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    // Group rounds by player
    const roundsByPlayer = (allRounds || []).reduce((acc, round) => {
      if (!acc[round.player_id]) acc[round.player_id] = [];
      if (round.total_score !== null) {
        acc[round.player_id]!.push({
          score: round.total_score,
          date: round.round_date,
        });
      }
      return acc;
    }, {} as Record<string, { score: number; date: string }[]>);

    // Calculate stats for each player including trend
    const playersWithStats = teamPlayers.map(player => {
      const rounds = roundsByPlayer[player.id] || [];
      const scores = rounds.map(r => r.score);
      const recentScores = scores.slice(0, 5);

      // Calculate trend based on recent scores
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (recentScores.length >= 3) {
        const firstHalf = recentScores.slice(Math.floor(recentScores.length / 2));
        const secondHalf = recentScores.slice(0, Math.floor(recentScores.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        // Lower is better in golf
        if (secondAvg < firstAvg - 1) trend = 'up';
        else if (secondAvg > firstAvg + 1) trend = 'down';
      }

      // Format last played
      let lastPlayed = '';
      if (rounds[0]?.date) {
        const daysAgo = Math.floor((Date.now() - new Date(rounds[0].date).getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo === 0) lastPlayed = 'Today';
        else if (daysAgo === 1) lastPlayed = 'Yesterday';
        else lastPlayed = `${daysAgo} days ago`;
      }

      return {
        ...player,
        stats: {
          rounds_played: scores.length,
          scoring_average: scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null,
          best_round: scores.length > 0 ? Math.min(...scores) : null,
          recent_scores: recentScores.reverse(), // Oldest to newest for sparkline
          trend,
          last_played: lastPlayed,
        }
      };
    });

    setPlayers(playersWithStats);
    return playersWithStats;
  }

  async function loadPlayerSummary(playerId: string) {
    const supabase = createClient();

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

    const roundIds = roundsData.map(r => r.id);
    const { data: statsCache } = await supabase
      .from('golf_round_stats_cache')
      .select('scramble_attempts, scrambles_converted')
      .in('round_id', roundIds);

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

    let totalScrambleAttempts = 0;
    let totalScramblesMade = 0;
    if (statsCache) {
      for (const cache of statsCache) {
        if (cache.scramble_attempts !== null) totalScrambleAttempts += cache.scramble_attempts;
        if (cache.scrambles_converted !== null) totalScramblesMade += cache.scrambles_converted;
      }
    }
    const scramblingPercentage = totalScrambleAttempts > 0
      ? Math.round((totalScramblesMade / totalScrambleAttempts) * 1000) / 10
      : null;

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
      scramblingPercentage,
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

  const loadDetailedStats = useCallback(async (
    playerId: string,
    roundId: string | 'overall' = 'overall',
    filter?: StatsFilter | null
  ) => {
    const filterKey = filter ? JSON.stringify(filter) : 'none';
    const cacheKey = `${playerId}-${roundId}-${filterKey}`;

    if (detailedStatsCache.current.has(cacheKey)) {
      setDetailedStats(detailedStatsCache.current.get(cacheKey)!);
      return;
    }

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

  const handleFilterChange = useCallback((filter: StatsFilter | null) => {
    setActiveFilter(filter);
    setDetailedStats(null);
  }, []);

  useEffect(() => {
    const playerId = selectedPlayerId || (userRole === 'player' ? initialPlayerId : null);
    if (!playerId) return;

    const detailedTabs: StatsCategory[] = ['scoring', 'driving', 'approach', 'putting', 'scrambling', 'strokes-gained', 'progress'];
    if (detailedTabs.includes(activeTab) && !detailedStats) {
      loadDetailedStats(playerId, selectedRoundId, activeFilter);
    }
  }, [activeTab, selectedPlayerId, selectedRoundId, initialPlayerId, userRole, detailedStats, loadDetailedStats, activeFilter]);

  useEffect(() => {
    const playerId = selectedPlayerId || (userRole === 'player' ? initialPlayerId : null);
    if (!playerId) return;

    const filterKey = activeFilter ? JSON.stringify(activeFilter) : 'none';
    const cacheKey = `${playerId}-${selectedRoundId}-${filterKey}`;

    if (detailedStatsCache.current.has(cacheKey)) {
      setDetailedStats(detailedStatsCache.current.get(cacheKey)!);
    } else if (detailedStats) {
      loadDetailedStats(playerId, selectedRoundId, activeFilter);
    }
  }, [selectedRoundId, activeFilter]);

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
    setDetailedStats(null);
    setActiveFilter(null);
    setCourseBreakdown(null);
    setWorstHoleData(null);
    setFilterOptions(null);
    setTrendData(null);

    await loadPlayerSummary(playerId);
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

  // Coach view - show roster with premium design
  if (userRole === 'coach' && !selectedPlayerId) {
    return (
      <div className="min-h-screen bg-[#FAF6F1]">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger menu */}
              <button
                onClick={toggleMobile}
                className={cn(
                  'lg:hidden p-2 -ml-2 rounded-xl',
                  'text-slate-500 hover:text-slate-700 hover:bg-slate-100/80',
                  'transition-colors duration-150 active:scale-95',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
                )}
                aria-label="Open navigation menu"
              >
                <IconMenu size={22} />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-900">Team Stats</h1>
                <p className="text-slate-500 text-sm md:text-base">{players.length} players on your roster</p>
              </div>
            </div>
          </div>

          {/* KPI Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard
              label="Team Average"
              value={teamStats.teamAvg}
              subtext="scoring average"
              icon={IconTarget}
            />
            <KPICard
              label="Total Rounds"
              value={teamStats.totalRounds}
              subtext="this season"
              icon={IconCalendar}
            />
            <KPICard
              label="Top 5 Average"
              value={teamStats.top5Avg}
              subtext="lineup ready"
              icon={IconChart}
            />
            <KPICard
              label="Improving"
              value={`${teamStats.improvingCount}/${teamStats.totalPlayers}`}
              subtext="trending up"
              trend="up"
              icon={IconUsers}
            />
          </div>

          {/* Filters Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px] relative">
                <IconSearch size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors"
                />
              </div>

              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
              >
                <option value="all">All Classes</option>
                {graduationYears.map(year => (
                  <option key={year} value={year}>Class of {year}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
              >
                <option value="avg">Sort: Best Avg</option>
                <option value="name">Sort: Name A-Z</option>
                <option value="improved">Sort: Most Improved</option>
                <option value="recent">Sort: Recent Activity</option>
              </select>
            </div>
          </div>

          {/* Player Cards */}
          {players.length === 0 ? (
            <div className="relative bg-white rounded-2xl border border-slate-200 overflow-hidden p-16 text-center">
              <ShineEffect />
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <IconUser size={28} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No Players Yet</h3>
              <p className="text-slate-500">Add players to your team to view their statistics.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPlayers.map((player, index) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  rank={index + 1}
                  onClick={() => handlePlayerClick(player.id)}
                />
              ))}
            </div>
          )}

          {/* Results count */}
          {filteredPlayers.length > 0 && filteredPlayers.length !== players.length && (
            <div className="mt-6 text-center">
              <p className="text-slate-500 text-sm">
                Showing {filteredPlayers.length} of {players.length} players
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Player stats view
  return (
    <div className="relative">
      {/* Floating Mobile Nav Button */}
      <button
        onClick={toggleMobile}
        className={cn(
          'fixed top-6 z-50 p-3 rounded-xl bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg hover:shadow-xl hover:bg-white transition-all group',
          'lg:hidden',
          userRole === 'coach' ? 'left-20' : 'left-6'
        )}
        aria-label="Open navigation menu"
      >
        <IconMenu size={20} className="text-slate-600 group-hover:text-green-600 transition-colors" />
      </button>

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
          playerProfile={userRole === 'coach' && selectedPlayer ? {
            avatarUrl: selectedPlayer.avatar_url,
            gradYear: selectedPlayer.graduation_year,
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
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
          filterOptions={filterOptions}
          courseBreakdown={courseBreakdown}
          worstHoleData={worstHoleData}
          trendData={trendData}
        />
      ) : null}
    </div>
  );
}
