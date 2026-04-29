'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import {
  getDetailedStats,
  getSprayChartData,
  getFilterOptions,
  getCourseBreakdown,
  getWorstHoleAnalysis,
  getTrendAnalysis,
  getCoachRosterStats,
} from '@/app/golf/actions/stats-data';
import type {
  StatsSummary,
  RoundSummary,
  StatsFilter,
  FilterOptions,
  CourseBreakdownResponse,
  WorstHoleResponse,
  TrendAnalysisResponse,
  SprayChartResponse,
} from '@/app/golf/actions/stats-data-types';
import Image from 'next/image';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import GolfStatsDisplay, { Sparkline } from '@/components/golf/stats/GolfStatsDisplay';
import { generateStatisticalStrengthsWeaknesses } from '@/lib/golf/strokes-gained';
import { DetailedStatsSkeleton, StatsPageSkeleton } from '@/components/golf/GolfSkeletons';
import { StatsIntelligenceStrip } from '@/components/golf/stats/StatsIntelligenceStrip';
import { refreshPlayerAnalysisAsCoach } from '@/app/golf/actions/insights';
import {
  IconChevronLeft,
  IconUser,
  IconRefresh,
  IconSearch,
  IconChart,
  IconChevronRight,
  IconCalendar,
  IconUsers,
  IconTrendingUp,
  IconTrendingDown,
  IconTarget,
  IconGolf,
  IconPlus,
} from '@/components/icons';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { useGolfUser } from '@/contexts/golf-user-context';
import { cn } from '@/lib/utils';
import { FormatToggle } from '@/components/golf/stats/sections/shared-primitives';
import type { HoleFormat } from '@/components/golf/stats/sections/shared-primitives';

// ============================================================================
// TYPES
// ============================================================================

type StatsCategory = 'overview' | 'scoring' | 'driving' | 'approach' | 'putting' | 'scrambling' | 'strokes-gained' | 'progress' | 'dispersion' | 'analysis';

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
  equivalent_rounds_all?: number;
  // Per-format stats
  rounds_played_18: number;
  rounds_played_9: number;
  scoring_average_18: number | null;
  scoring_average_9: number | null;
  best_round_18: number | null;
  best_round_9: number | null;
}

// Sparkline is imported from GolfStatsDisplay

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
  const dotColor = trend === 'up' ? 'bg-primary-500' : trend === 'down' ? 'bg-red-400' : 'bg-warm-300';

  return (
    <div className="relative flex-shrink-0">
      {avatarUrl ? (
        <div className="relative w-12 h-12 rounded-2xl overflow-hidden ring-1 ring-warm-200 shadow-sm">
          <Image src={avatarUrl} alt="" fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="w-12 h-12 rounded-2xl bg-warm-100/65 flex items-center justify-center">
          <span className="text-lg font-semibold text-warm-500">{initials}</span>
        </div>
      )}
      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${dotColor}`} />
    </div>
  );
}

// ============================================================================
// TREND INDICATOR
// ============================================================================

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-primary-600 text-sm font-medium">
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
    <span className="inline-flex items-center gap-1 text-warm-500 text-sm font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-warm-400" />
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
    <div className="relative overflow-clip surface-matte rounded-3xl p-5 hover:shadow-glass-md hover:-translate-y-0.5 transition-[transform,box-shadow] duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-warm-500 font-medium">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-warm-900 mt-1">{value}</p>
          {subtext && (
            <p className="text-sm text-warm-500 mt-1 flex items-center gap-1">
              {trend === 'up' && <IconTrendingUp size={14} className="text-primary-600" />}
              {trend === 'down' && <IconTrendingDown size={14} className="text-red-500" />}
              {subtext}
            </p>
          )}
        </div>
        <div className="p-2.5 bg-primary-50/70 rounded-xl">
          <Icon size={20} className="text-primary-600" />
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
  holeFormat = 'all',
}: {
  player: Player & { stats?: PlayerStats };
  rank: number;
  onClick: () => void;
  holeFormat?: HoleFormat;
}) {
  const initials = `${player.first_name?.[0] || '?'}${player.last_name?.[0] || '?'}`;
  const trend = player.stats?.trend || 'stable';
  const recentScores = player.stats?.recent_scores || [];

  // Resolve format-aware stats
  const scoringAvg = holeFormat === '18' ? player.stats?.scoring_average_18
    : holeFormat === '9' ? player.stats?.scoring_average_9
    : player.stats?.scoring_average;
  const bestRound = holeFormat === '18' ? player.stats?.best_round_18
    : holeFormat === '9' ? player.stats?.best_round_9
    : player.stats?.best_round;

  return (
    <button
      onClick={onClick}
      className="w-full group surface-matte rounded-3xl p-4 hover:shadow-glass-md hover:-translate-y-0.5 hover:bg-cream-100/82 active:bg-cream-50/92 transition-[transform,box-shadow,background-color] duration-200 text-left"
    >
      <div className="flex items-center gap-4">
        {/* Rank badge */}
        <div className="w-8 text-center flex-shrink-0">
          <span className={`text-sm font-bold ${rank <= 3 ? 'text-primary-600' : 'text-warm-400'}`}>
            #{rank}
          </span>
        </div>

        {/* Avatar with performance ring */}
        <AvatarWithRing initials={initials} avatarUrl={player.avatar_url} trend={trend} />

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-warm-900 truncate group-hover:text-primary-600 transition-colors">
              {player.first_name} {player.last_name}
            </h3>
            {player.graduation_year && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600">
                &apos;{String(player.graduation_year).slice(-2)}
              </span>
            )}
          </div>
          <p className="text-sm text-warm-500 truncate">
            {player.handicap !== null ? `${player.handicap < 0 ? '+' : ''}${player.handicap < 0 ? Math.abs(player.handicap).toFixed(1) : player.handicap.toFixed(1)} HCP` : 'No handicap'}
          </p>
        </div>

        {/* Sparkline */}
        {recentScores.length >= 2 && (
          <div className="hidden sm:flex flex-col items-center px-4">
            <Sparkline data={recentScores} width={60} showDots lowerIsBetter />
            <span className="text-xs text-warm-400 mt-1">Last {recentScores.length} rounds</span>
          </div>
        )}

        {/* Stats block */}
        <div className="flex items-center gap-3 md:gap-6">
          <div className="text-center">
            <p className="text-[28px] md:text-[32px] font-light text-warm-900 tabular-nums tracking-[-0.025em]">
              {scoringAvg?.toFixed(1) || '--'}
            </p>
            <p className="text-xs text-warm-500 uppercase tracking-wide">Avg</p>
          </div>

          <div className="text-center hidden md:block">
            <p className="text-lg font-semibold text-warm-700 tabular-nums">
              {bestRound || '--'}
            </p>
            <p className="text-xs text-warm-500 uppercase tracking-wide">Best</p>
          </div>

          <div className="text-center min-w-[80px] hidden md:block">
            <TrendIndicator trend={trend} />
            {player.stats?.last_played && (
              <p className="text-xs text-warm-400 mt-0.5">{player.stats.last_played}</p>
            )}
          </div>
        </div>

        {/* Arrow indicator */}
        <div className="hidden md:flex items-center pl-4 border-l border-warm-200/45">
          <IconChevronRight size={20} className="text-warm-300 group-hover:text-warm-500 transition-colors" />
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
  initialRounds = [],
}: StatsClientProps) {
  // Core state
  const [userRole, setUserRole] = useState<'coach' | 'player' | null>(initialUserRole ?? null);
  const [players, setPlayers] = useState<(Player & { stats?: PlayerStats })[]>(initialPlayers);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(initialPlayerId ?? null);
  const [selectedPlayer, setSelectedPlayer] = useState<(Player & { stats?: PlayerStats }) | null>(null);
  const [playerName, setPlayerName] = useState(initialPlayerName);

  // Format toggle for coach roster view
  const [coachHoleFormat, setCoachHoleFormat] = useState<HoleFormat>('all');

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'avg' | 'name' | 'improved' | 'recent'>('avg');

  // Stats state
  const [rounds, setRounds] = useState<RoundSummary[]>(initialRounds);
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [sprayChartData, setSprayChartData] = useState<SprayChartResponse | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState<string | 'overall'>('overall');

  // Loading states — context is always available, but we still load player data
  const [loading, setLoading] = useState(!initialUserRole);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  const [loadingSprayChart, setLoadingSprayChart] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
   
  const [activeTab, setActiveTab] = useState<StatsCategory>('scoring');

  // Filter state
  const [activeFilter, setActiveFilter] = useState<StatsFilter | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);

  // Additional analytics data
  const [courseBreakdown, setCourseBreakdown] = useState<CourseBreakdownResponse | null>(null);
  const [worstHoleData, setWorstHoleData] = useState<WorstHoleResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);

  // Bumped every time Refresh runs — the CoachHelm AI strip re-reads engine
  // output (category ratings + evidence insights) off this key.
  const [intelligenceRefreshKey, setIntelligenceRefreshKey] = useState(0);
  const [intelligenceRefreshing, setIntelligenceRefreshing] = useState(false);

  // Cache for detailed stats
  const detailedStatsCache = useRef<Map<string, GolfStats>>(new Map());
  const sprayChartCache = useRef<Map<string, SprayChartResponse>>(new Map());
  const lastFetchedPlayerId = useRef<string | null>(null);
  const lastFetchedRoundId = useRef<string | 'overall'>('overall');

  // Shared context — eliminates auth/role/team queries
  const golfUser = useGolfUser();

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
        result.sort((a, b) => {
          const aDate = a.stats?.last_played || '';
          const bDate = b.stats?.last_played || '';
          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;
          // Parse "X days ago" or "Today"/"Yesterday" for comparison
          const parseDaysAgo = (s: string) => {
            if (s === 'Today') return 0;
            if (s === 'Yesterday') return 1;
            const match = s.match(/^(\d+) days ago$/);
            return match?.[1] ? parseInt(match[1], 10) : 9999;
          };
          return parseDaysAgo(aDate) - parseDaysAgo(bDate);
        });
        break;
    }

    return result;
  }, [players, searchQuery, classFilter, sortBy]);

  // Calculate team stats (format-aware)
  const teamStats = useMemo(() => {
    // Pick the right scoring average based on format
    const getScoringAvg = (p: Player & { stats?: PlayerStats }) => {
      if (coachHoleFormat === '18') return p.stats?.scoring_average_18 ?? null;
      if (coachHoleFormat === '9') return p.stats?.scoring_average_9 ?? null;
      return p.stats?.scoring_average ?? null;
    };
    const getRounds = (p: Player & { stats?: PlayerStats }) => {
      if (coachHoleFormat === '18') return p.stats?.rounds_played_18 ?? 0;
      if (coachHoleFormat === '9') return p.stats?.rounds_played_9 ?? 0;
      return p.stats?.rounds_played ?? 0;
    };
    const getAverageWeight = (p: Player & { stats?: PlayerStats }) => {
      if (coachHoleFormat === '18') return p.stats?.rounds_played_18 ?? 0;
      if (coachHoleFormat === '9') return p.stats?.rounds_played_9 ?? 0;
      return p.stats?.equivalent_rounds_all ?? 0;
    };

    const playersWithStats = players.filter(p => getScoringAvg(p) !== null);
    const totalRounds = players.reduce((sum, p) => sum + getRounds(p), 0);
    const totalAverageWeight = playersWithStats.reduce((sum, p) => sum + getAverageWeight(p), 0);
    const teamAvg = totalAverageWeight > 0
      ? playersWithStats.reduce((sum, p) => sum + ((getScoringAvg(p) || 0) * getAverageWeight(p)), 0) / totalAverageWeight
      : 0;

    const sortedByAvg = [...playersWithStats].sort((a, b) =>
      (getScoringAvg(a) || 999) - (getScoringAvg(b) || 999)
    );
    const top5 = sortedByAvg.slice(0, 5);
    const top5Avg = top5.length > 0
      ? top5.reduce((sum, p) => sum + (getScoringAvg(p) || 0), 0) / top5.length
      : 0;

    const improvingCount = players.filter(p => p.stats?.trend === 'up').length;

    // Format counts for the toggle
    let h18 = 0;
    let h9 = 0;
    let all = 0;
    for (const p of players) {
      h18 += p.stats?.rounds_played_18 ?? 0;
      h9 += p.stats?.rounds_played_9 ?? 0;
      all += p.stats?.rounds_played ?? 0;
    }

    return {
      teamAvg: teamAvg.toFixed(1),
      totalRounds,
      top5Avg: top5Avg.toFixed(1),
      improvingCount,
      totalPlayers: players.length,
      formatCounts: { all, h18, h9 },
    };
  }, [players, coachHoleFormat]);

  // Get unique graduation years for filter
  const graduationYears = useMemo(() => {
    const years = new Set<number>();
    players.forEach(p => {
      if (p.graduation_year) years.add(p.graduation_year);
    });
    return Array.from(years).sort();
  }, [players]);

  // Compute statistical strengths/weaknesses from detailed stats
  const strengthsWeaknesses = useMemo(() => {
    if (!detailedStats || detailedStats.roundsPlayed < 3) return null;
    try {
      return generateStatisticalStrengthsWeaknesses(detailedStats);
    } catch (err) {
      // Strengths/weaknesses computation failed — degrade gracefully
      return null;
    }
  }, [detailedStats]);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    if (!initialUserRole) {
      loadInitialData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadInitialData() {
    if (golfUser.role === 'coach') {
      setUserRole('coach');
      const loadedPlayers = await loadCoachPlayers(golfUser.teamId);

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

    if (golfUser.role === 'player' && golfUser.playerId) {
      setUserRole('player');
      setPlayerName(golfUser.name);

      // Load summary and detailed stats in parallel for faster initial render
      const [, detailedResult] = await Promise.allSettled([
        loadPlayerSummary(golfUser.playerId),
        getDetailedStats(golfUser.playerId, 'overall'),
      ]);

      if (detailedResult.status === 'fulfilled') {
        const cacheKey = `${golfUser.playerId}-overall-none`;
        detailedStatsCache.current.set(cacheKey, detailedResult.value);
        setDetailedStats(detailedResult.value);
      }

      setLoading(false);
    }
  }

  async function loadCoachPlayers(teamId: string | undefined): Promise<(Player & { stats?: PlayerStats })[]> {
    if (!teamId) return [];

    // Use server action to bypass client-side RLS restrictions on golf_team_members
    const playersWithStats = await getCoachRosterStats(teamId);

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
        total_putts,
        holes_played
      `)
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('total_score', 'is', null)
      .order('round_date', { ascending: false });

    if (!roundsData || roundsData.length === 0) {
      setRounds([]);
      return;
    }

    setRounds(roundsData.map(r => ({
      id: r.id,
      round_date: r.round_date,
      course_name: r.course_name,
      round_type: r.round_type,
      total_score: r.total_score,
      score_to_par: r.score_to_par,
    })));
  }

  const loadingDetailedRef = useRef(false);

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

    if (lastFetchedPlayerId.current === playerId && lastFetchedRoundId.current === roundId && loadingDetailedRef.current) {
      return;
    }

    loadingDetailedRef.current = true;
    setLoadingDetailed(true);
    lastFetchedPlayerId.current = playerId;
    lastFetchedRoundId.current = roundId;

    setStatsError(null);
    try {
      const stats = await getDetailedStats(playerId, roundId, filter || undefined);
      detailedStatsCache.current.set(cacheKey, stats);
      setDetailedStats(stats);
    } catch (error) {
      setStatsError('Failed to load stats. Please try again.');
    } finally {
      loadingDetailedRef.current = false;
      setLoadingDetailed(false);
    }
  }, []);

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
      setStatsError('Failed to load analytics data.');
    }
  }, []);

  const handleFilterChange = useCallback((filter: StatsFilter | null) => {
    setActiveFilter(filter);
    setDetailedStats(null);
    setSprayChartData(null);
  }, []);

  const latestSprayChartRequest = useRef<string | null>(null);

  const loadSprayChart = useCallback(async (
    playerId: string,
    roundId: string | 'overall' = 'overall',
    filter?: StatsFilter | null
  ) => {
    const filterKey = filter ? JSON.stringify(filter) : 'none';
    const cacheKey = `${playerId}-${roundId}-${filterKey}`;

    if (sprayChartCache.current.has(cacheKey)) {
      setSprayChartData(sprayChartCache.current.get(cacheKey)!);
      return;
    }

    latestSprayChartRequest.current = cacheKey;
    setLoadingSprayChart(true);
    try {
      const response = await getSprayChartData(playerId, roundId, filter || undefined);
      sprayChartCache.current.set(cacheKey, response);
      if (latestSprayChartRequest.current === cacheKey) {
        setSprayChartData(response);
      }
    } catch (error) {
      // Spray chart load failed — handled by null state below
      if (latestSprayChartRequest.current === cacheKey) {
        setSprayChartData(null);
      }
    } finally {
      if (latestSprayChartRequest.current === cacheKey) {
        setLoadingSprayChart(false);
      }
    }
  }, []);

  // Resolve the active player ID — for coaches it's the selected player,
  // for players it's their own ID from context (or URL param)
  const resolvedPlayerId = selectedPlayerId
    || (userRole === 'player' ? (initialPlayerId || golfUser.playerId) : null);

  useEffect(() => {
    if (!resolvedPlayerId) return;

    const detailedTabs: StatsCategory[] = ['scoring', 'driving', 'approach', 'putting', 'scrambling', 'strokes-gained', 'progress', 'dispersion', 'analysis'];
    if (detailedTabs.includes(activeTab) && !detailedStats) {
      loadDetailedStats(resolvedPlayerId, selectedRoundId, activeFilter);
    }
  }, [activeTab, resolvedPlayerId, selectedRoundId, detailedStats, loadDetailedStats, activeFilter]);

  useEffect(() => {
    if (!resolvedPlayerId || activeTab !== 'dispersion') return;

    const filterKey = activeFilter ? JSON.stringify(activeFilter) : 'none';
    const cacheKey = `${resolvedPlayerId}-${selectedRoundId}-${filterKey}`;

    if (sprayChartCache.current.has(cacheKey)) {
      setSprayChartData(sprayChartCache.current.get(cacheKey)!);
      return;
    }

    loadSprayChart(resolvedPlayerId, selectedRoundId, activeFilter);
  }, [activeTab, resolvedPlayerId, selectedRoundId, activeFilter, loadSprayChart]);

  useEffect(() => {
    if (!resolvedPlayerId) return;

    const filterKey = activeFilter ? JSON.stringify(activeFilter) : 'none';
    const cacheKey = `${resolvedPlayerId}-${selectedRoundId}-${filterKey}`;

    if (detailedStatsCache.current.has(cacheKey)) {
      setDetailedStats(detailedStatsCache.current.get(cacheKey)!);
    } else if (detailedStats) {
      loadDetailedStats(resolvedPlayerId, selectedRoundId, activeFilter);
    }
  }, [selectedRoundId, activeFilter, resolvedPlayerId, detailedStats, loadDetailedStats]);

  useEffect(() => {
    if (!resolvedPlayerId || activeTab !== 'dispersion') return;

    const filterKey = activeFilter ? JSON.stringify(activeFilter) : 'none';
    const cacheKey = `${resolvedPlayerId}-${selectedRoundId}-${filterKey}`;

    if (sprayChartCache.current.has(cacheKey)) {
      setSprayChartData(sprayChartCache.current.get(cacheKey)!);
    } else {
      loadSprayChart(resolvedPlayerId, selectedRoundId, activeFilter);
    }
  }, [selectedRoundId, activeFilter, resolvedPlayerId, activeTab, loadSprayChart]);

  // Defer analytics loading — only fetch after detailed stats are ready
  // This prevents 4 heavy queries from firing on initial page load
  const analyticsLoadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resolvedPlayerId || !detailedStats) return;
    if (analyticsLoadedForRef.current === resolvedPlayerId) return;
    analyticsLoadedForRef.current = resolvedPlayerId;
    loadPlayerAnalytics(resolvedPlayerId);
  }, [resolvedPlayerId, detailedStats, loadPlayerAnalytics]);

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
    setSprayChartData(null);
    setLoadingDetailed(true); // Show skeleton immediately — prevents empty state flash
    setActiveFilter(null);
    setCourseBreakdown(null);
    setWorstHoleData(null);
    setFilterOptions(null);
    setTrendData(null);
    analyticsLoadedForRef.current = null;

    await loadPlayerSummary(playerId);
  }

  function handleBackClick() {
    setSelectedPlayerId(null);
    setSelectedPlayer(null);
    setDetailedStats(null);
    setSprayChartData(null);
    setLoadingDetailed(false);
    setRounds([]);
    setActiveFilter(null);
    setCourseBreakdown(null);
    setWorstHoleData(null);
    setFilterOptions(null);
    setTrendData(null);
    analyticsLoadedForRef.current = null;
  }

  async function handleRefresh() {
    const playerId = resolvedPlayerId;
    if (!playerId) return;

    for (const key of detailedStatsCache.current.keys()) {
      if (key.startsWith(playerId)) {
        detailedStatsCache.current.delete(key);
      }
    }
    for (const key of sprayChartCache.current.keys()) {
      if (key.startsWith(playerId)) {
        sprayChartCache.current.delete(key);
      }
    }

    setDetailedStats(null);
    setSprayChartData(null);
    analyticsLoadedForRef.current = null;
    loadPlayerSummary(playerId);
    loadDetailedStats(playerId, selectedRoundId, activeFilter);
    if (activeTab === 'dispersion') {
      loadSprayChart(playerId, selectedRoundId, activeFilter);
    }
    loadPlayerAnalytics(playerId);

    // If a coach is viewing a player, re-run the CoachHelm engine so the AI
    // strip reflects the latest rounds instead of whatever was cached.
    // Player-self refresh skips this — the engine runs automatically on
    // round submit + nightly sweep; re-running on every Refresh click would
    // be wasteful.
    if (userRole === 'coach') {
      setIntelligenceRefreshing(true);
      try {
        await refreshPlayerAnalysisAsCoach(playerId);
      } catch {
        // Swallow — the strip will just show stale data rather than erroring.
      } finally {
        setIntelligenceRefreshing(false);
      }
    }
    setIntelligenceRefreshKey((n) => n + 1);
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    // Show the same skeleton that matches the view the user will see,
    // so there's no position jump when content loads
    if (golfUser.role === 'coach') {
      return <StatsPageSkeleton />;
    }
    return <DetailedStatsSkeleton />;
  }

  // Coach view - show roster with premium design
  if (userRole === 'coach' && !selectedPlayerId) {
    return (
      <div className="min-h-full bg-transparent">
        <LargeTitleHeader
          title="Team Stats"
          subtitle={`${players.length} players on your roster`}
        />
        <div className="max-w-6xl mx-auto p-4 md:p-6">

          {/* Format Toggle */}
          <div className="flex items-center mb-4">
            <FormatToggle
              value={coachHoleFormat}
              onChange={setCoachHoleFormat}
              counts={teamStats.formatCounts}
            />
          </div>

          {/* KPI Summary Row */}
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

          {/* Team Insights Bar */}
          {players.length >= 3 && (() => {
            const getAvg = (p: Player & { stats?: PlayerStats }) =>
              coachHoleFormat === '18' ? p.stats?.scoring_average_18
                : coachHoleFormat === '9' ? p.stats?.scoring_average_9
                : p.stats?.scoring_average;
            const playersWithScores = players.filter(p => getAvg(p) != null);
            const bestPlayer = playersWithScores.length > 0
              ? [...playersWithScores].sort((a, b) => (getAvg(a) || 999) - (getAvg(b) || 999))[0]
              : null;
            const mostImproved = playersWithScores.filter(p => p.stats?.trend === 'up');
            const needsAttention = playersWithScores.filter(p => p.stats?.trend === 'down');
            const inactivePlayers = players.filter(p => !p.stats?.rounds_played || p.stats.rounds_played === 0);

            return (
              <div className="bg-cream-100/68 backdrop-blur-sm rounded-2xl border border-warm-200/45 p-4 mb-4 shadow-glass-sm">
                <h3 className="text-xs font-semibold text-primary-800 uppercase tracking-wider mb-3">Team Insights</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  {bestPlayer && (
                    <div className="flex items-center gap-2">
                      <span className="text-primary-600 font-medium">Top Performer:</span>
                      <span className="text-warm-700">
                        {bestPlayer.first_name} {bestPlayer.last_name} ({getAvg(bestPlayer)?.toFixed(1)} avg)
                      </span>
                    </div>
                  )}
                  {mostImproved.length > 0 && (
                    <div className="flex items-center gap-2">
                      <IconTrendingUp size={14} className="text-primary-500" />
                      <span className="text-warm-700">
                        <span className="font-medium text-primary-600">{mostImproved.length}</span> player{mostImproved.length !== 1 ? 's' : ''} improving
                      </span>
                    </div>
                  )}
                  {needsAttention.length > 0 && (
                    <div className="flex items-center gap-2">
                      <IconTrendingDown size={14} className="text-red-500" />
                      <span className="text-warm-700">
                        <span className="font-medium text-red-600">{needsAttention.length}</span> declining -- may need coaching
                      </span>
                    </div>
                  )}
                  {inactivePlayers.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-warm-400" />
                      <span className="text-warm-600">
                        {inactivePlayers.length} player{inactivePlayers.length !== 1 ? 's' : ''} with no rounds
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Filters Bar */}
          <div className="bg-cream-100/60 backdrop-blur-sm rounded-2xl border border-warm-200/45 p-4 mb-4 shadow-glass-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px] relative">
                <IconSearch size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
                <input
                  type="search"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  enterKeyHint="search"
                  autoComplete="off"
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-warm-200/55 bg-cream-100/68 text-base md:text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-colors"
                />
              </div>

              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-warm-200/55 bg-cream-100/68 text-base md:text-sm text-warm-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
              >
                <option value="all">All Classes</option>
                {graduationYears.map(year => (
                  <option key={year} value={year}>Class of {year}</option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-2 rounded-xl border border-warm-200/55 bg-cream-100/68 text-base md:text-sm text-warm-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none"
              >
                <option value="avg">Sort: Best Avg</option>
                <option value="name">Sort: Name A-Z</option>
                <option value="improved">Sort: Most Improved</option>
                <option value="recent">Sort: Recent Activity</option>
              </select>
            </div>
          </div>

          {/* Player Cards */}
          {filteredPlayers.length === 0 ? (
            <div className="relative surface-matte rounded-3xl overflow-clip p-8 md:p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
                <IconUser size={28} className="text-warm-400" />
              </div>
              {players.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold text-warm-900 mb-2">No Players Yet</h3>
                  <p className="text-warm-500">Add players to your team to view their statistics.</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-warm-900 mb-2">No Matching Players</h3>
                  <p className="text-warm-500">Try adjusting your search or filters.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPlayers.map((player, index) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  rank={index + 1}
                  onClick={() => handlePlayerClick(player.id)}
                  holeFormat={coachHoleFormat}
                />
              ))}
            </div>
          )}

          {/* Results count */}
          {filteredPlayers.length > 0 && filteredPlayers.length !== players.length && (
            <div className="mt-6 text-center">
              <p className="text-warm-500 text-sm">
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
      <LargeTitleHeader
        title={userRole === 'coach' ? (playerName ? `${playerName}'s Stats` : 'Player Stats') : 'My Stats'}
        subtitle={
          rounds.length > 0
            ? `${rounds.length} round${rounds.length === 1 ? '' : 's'} available`
            : 'Detailed performance view'
        }
        backHref={userRole === 'coach' ? '/golf/dashboard/stats' : undefined}
        backLabel={userRole === 'coach' ? 'Team Stats' : undefined}
      >
        <button
          onClick={handleRefresh}
          disabled={loadingDetailed || intelligenceRefreshing}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-warm-200 bg-cream-100/82 text-warm-600 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600 disabled:opacity-50"
          title={intelligenceRefreshing ? 'Running CoachHelm engine…' : 'Refresh stats'}
          aria-label="Refresh stats"
        >
          <IconRefresh
            size={18}
            className={loadingDetailed || intelligenceRefreshing ? 'animate-spin' : undefined}
          />
        </button>
      </LargeTitleHeader>

      {/* Floating Back Button for Coaches */}
      {userRole === 'coach' && (
        <button
          onClick={handleBackClick}
          aria-label="Go back"
          className="group fixed left-4 z-50 hidden h-12 w-12 items-center justify-center rounded-xl border border-warm-200 bg-cream-50/92 backdrop-blur-sm shadow-lg transition-colors hover:bg-white hover:shadow-xl lg:flex"
          style={{ top: 'max(1rem, env(safe-area-inset-top, 0.5rem))' }}
        >
          <IconChevronLeft size={20} className="text-warm-600 group-hover:text-primary-600 transition-colors" />
        </button>
      )}

      {/* CoachHelm AI strip — engine-derived ratings + evidence insights,
          rendered above raw stats so the "what matters" layer reads first. */}
      {resolvedPlayerId && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 md:pt-6">
          <StatsIntelligenceStrip
            playerId={resolvedPlayerId}
            audience={userRole === 'coach' ? 'coach' : 'player'}
            refreshKey={intelligenceRefreshKey}
          />
        </div>
      )}

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
          statisticalStrengths={strengthsWeaknesses?.strengths}
          statisticalWeaknesses={strengthsWeaknesses?.weaknesses}
          sprayChartData={sprayChartData}
          sprayChartLoading={loadingSprayChart}
          activeCategory={activeTab}
          onCategoryChange={setActiveTab}
        />
      ) : statsError ? (
        /* Error state when server action fails */
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-16 pb-8">
          <div className="relative surface-matte rounded-3xl border border-red-200/50 p-8 md:p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
              <IconChart size={36} className="text-red-300" />
            </div>
            <h2 className="text-xl font-semibold text-warm-900 mb-2">Something Went Wrong</h2>
            <p className="text-warm-500 max-w-sm mx-auto mb-6">{statsError}</p>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
            >
              <IconRefresh size={16} />
              Try Again
            </button>
          </div>
        </div>
      ) : (
        /* Empty state when no stats available */
        <LazyMotion features={domAnimation}>
          <div className="max-w-6xl mx-auto px-4 md:px-6 pt-16 pb-8">
            <m.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative surface-matte rounded-3xl p-10 md:p-16 text-center overflow-clip"
            >
              <m.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
                className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mx-auto mb-6"
              >
                <IconGolf size={36} className="text-primary-500" />
              </m.div>
              <m.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.4 }}
                className="text-2xl font-semibold text-warm-900 mb-3"
              >
                Your Stats Dashboard
              </m.h2>
              <m.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="text-warm-500 max-w-md mx-auto mb-8 leading-relaxed"
              >
                Play your first round to unlock detailed performance analytics. Track your scoring trends, strokes gained, and identify areas to improve.
              </m.p>

              {/* Feature preview cards */}
              <m.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="grid grid-cols-3 gap-3 max-w-sm mx-auto mb-8"
              >
                <div className="p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                  <IconChart size={18} className="text-warm-300 mx-auto mb-1.5" />
                  <p className="text-[11px] font-medium text-warm-400">Scoring Trends</p>
                </div>
                <div className="p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                  <IconTarget size={18} className="text-warm-300 mx-auto mb-1.5" />
                  <p className="text-[11px] font-medium text-warm-400">Strokes Gained</p>
                </div>
                <div className="p-3 rounded-xl bg-warm-50/80 border border-warm-100">
                  <IconTrendingUp size={18} className="text-warm-300 mx-auto mb-1.5" />
                  <p className="text-[11px] font-medium text-warm-400">Progress</p>
                </div>
              </m.div>

              {userRole === 'player' && (
                <m.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                >
                  <a
                    href="/golf/dashboard/rounds/new"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-colors duration-200 min-h-[44px]"
                  >
                    <IconPlus size={16} />
                    Start Your First Round
                  </a>
                </m.div>
              )}
            </m.div>
          </div>
        </LazyMotion>
      )}

      {/* Recent Rounds Section */}
      {rounds.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pb-8 mt-6">
          <h3 className="text-lg font-semibold text-warm-900 mb-3">Recent Rounds</h3>
          <div className="space-y-2">
            {rounds.slice(0, 10).map((round) => {
              const toPar = round.score_to_par ?? 0;
              const scoreColor = toPar < 0 ? 'text-primary-600' : toPar > 0 ? 'text-red-600' : 'text-warm-600';
              const scoreBg = toPar < 0 ? 'bg-primary-50 ring-primary-200' : toPar > 0 ? 'bg-red-50 ring-red-200' : 'bg-warm-50 ring-warm-200';
              const formattedDate = new Date(round.round_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              return (
                <a
                  key={round.id}
                  href={`/golf/dashboard/rounds/${round.id}`}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl bg-cream-100/68 border border-warm-200/45 hover:bg-cream-100/82 active:bg-cream-50/92 hover:shadow-sm transition-colors duration-200 group"
                >
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg ring-1', scoreBg, scoreColor)}>
                    {round.total_score ?? '--'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-warm-900 truncate group-hover:text-primary-600 transition-colors">
                        {round.course_name || 'Unknown Course'}
                      </span>
                      {round.round_type && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-warm-100 text-warm-500 capitalize">
                          {round.round_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-warm-400">{formattedDate}</p>
                  </div>
                  <div className={cn('text-sm font-semibold tabular-nums', scoreColor)}>
                    {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                  </div>
                  <IconChevronRight size={16} className="text-warm-300 group-hover:text-warm-400 transition-colors" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
