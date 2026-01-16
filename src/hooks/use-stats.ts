'use client';

/**
 * Golf Stats Hook
 *
 * Client-side hook for fetching and managing golf statistics with:
 * - Loading states
 * - Error handling
 * - Automatic refresh
 * - Caching
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PlayerStats,
  MultiMetricTrend,
  ComparisonResult,
  ComparisonBaseline,
  WeakAreaIdentification,
  StrokesGainedTrend,
  RoundType,
  DataQuality,
} from '@/lib/types/golf';
import {
  getPlayerStats,
  getPlayerTrends,
  getPlayerTrendInsights,
  getPlayerComparison,
  identifyWeakAreas,
  getPlayerRounds,
} from '@/app/golf/actions/stats';

// ============================================
// TYPES
// ============================================

interface UseStatsOptions {
  playerId: string;
  includeStrokesGained?: boolean;
  includeTrends?: boolean;
  includeComparison?: boolean;
  comparisonBaseline?: ComparisonBaseline;
  includeWeakAreas?: boolean;
  roundTypes?: RoundType[];
  limit?: number;
  teamId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
}

interface UseStatsResult {
  // Data
  stats: PlayerStats | null;
  trends: MultiMetricTrend | null;
  strokesGainedTrends: StrokesGainedTrend[] | null;
  comparison: ComparisonResult | null;
  weakAreas: WeakAreaIdentification[] | null;
  trendInsights: string[] | null;
  prediction: {
    predicted_score: number;
    confidence: number;
    range_low: number;
    range_high: number;
  } | null;
  dataQuality: DataQuality | null;

  // State
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;

  // Actions
  refresh: () => Promise<void>;
  setComparisonBaseline: (baseline: ComparisonBaseline) => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useStats(options: UseStatsOptions): UseStatsResult {
  const {
    playerId,
    includeStrokesGained = true,
    includeTrends = true,
    includeComparison = false,
    comparisonBaseline: initialBaseline = 'scratch',
    includeWeakAreas = false,
    roundTypes,
    limit,
    teamId,
    autoRefresh = false,
    refreshInterval = 5 * 60 * 1000, // 5 minutes default
  } = options;

  // State
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [trends, setTrends] = useState<MultiMetricTrend | null>(null);
  const [strokesGainedTrends, setStrokesGainedTrends] = useState<StrokesGainedTrend[] | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [weakAreas, setWeakAreas] = useState<WeakAreaIdentification[] | null>(null);
  const [trendInsights, setTrendInsights] = useState<string[] | null>(null);
  const [prediction, setPrediction] = useState<{
    predicted_score: number;
    confidence: number;
    range_low: number;
    range_high: number;
  } | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [comparisonBaseline, setComparisonBaseline] = useState<ComparisonBaseline>(initialBaseline);

  // Refs for cleanup
  const mounted = useRef(true);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!playerId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch stats (always)
      const statsResponse = await getPlayerStats(playerId, {
        includeStrokesGained,
        includeTrends: false,
        roundTypes,
        limit,
      });

      if (!mounted.current) return;

      setStats(statsResponse.data);
      setDataQuality(statsResponse.data_quality);

      // Fetch trends if requested
      if (includeTrends && statsResponse.data.total_rounds >= 3) {
        const trendData = await getPlayerTrends(playerId, { limit, roundTypes });
        if (mounted.current && trendData) {
          setTrends(trendData);
        }

        // Get trend insights
        const insightsData = await getPlayerTrendInsights(playerId);
        if (mounted.current) {
          setTrendInsights(insightsData.insights);
          setPrediction(insightsData.prediction);
        }

        // Build SG trends from rounds
        const rounds = await getPlayerRounds(playerId, {
          limit: limit || 20,
          roundTypes,
          includeHoles: true,
        });
        if (mounted.current && rounds.length > 0) {
          const sgTrends: StrokesGainedTrend[] = rounds.map((r) => ({
            date: r.round_date,
            round_id: r.id,
            sg_total: r.sg_total || 0,
            sg_off_tee: r.sg_off_tee || 0,
            sg_approach: r.sg_approach || 0,
            sg_around_green: r.sg_around_green || 0,
            sg_putting: r.sg_putting || 0,
          }));
          setStrokesGainedTrends(sgTrends);
        }
      }

      // Fetch comparison if requested
      if (includeComparison) {
        const comparisonData = await getPlayerComparison(playerId, comparisonBaseline, teamId);
        if (mounted.current) {
          setComparison(comparisonData);
        }
      }

      // Fetch weak areas if requested
      if (includeWeakAreas) {
        const weakAreasData = await identifyWeakAreas(playerId);
        if (mounted.current) {
          setWeakAreas(weakAreasData);
        }
      }

      if (mounted.current) {
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [
    playerId,
    includeStrokesGained,
    includeTrends,
    includeComparison,
    comparisonBaseline,
    includeWeakAreas,
    roundTypes,
    limit,
    teamId,
  ]);

  // Initial fetch
  useEffect(() => {
    mounted.current = true;
    fetchData();

    return () => {
      mounted.current = false;
    };
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      refreshTimerRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, fetchData]);

  // Update comparison when baseline changes
  useEffect(() => {
    if (includeComparison && stats) {
      getPlayerComparison(playerId, comparisonBaseline, teamId).then((data) => {
        if (mounted.current) {
          setComparison(data);
        }
      });
    }
  }, [comparisonBaseline, includeComparison, playerId, teamId, stats]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    stats,
    trends,
    strokesGainedTrends,
    comparison,
    weakAreas,
    trendInsights,
    prediction,
    dataQuality,
    loading,
    error,
    lastUpdated,
    refresh,
    setComparisonBaseline,
  };
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Hook for just strokes gained data
 */
export function useStrokesGained(playerId: string) {
  return useStats({
    playerId,
    includeStrokesGained: true,
    includeTrends: true,
    includeComparison: false,
    includeWeakAreas: false,
  });
}

/**
 * Hook for trend analysis only
 */
export function useTrends(playerId: string, limit: number = 20) {
  return useStats({
    playerId,
    includeStrokesGained: true,
    includeTrends: true,
    includeComparison: false,
    includeWeakAreas: false,
    limit,
  });
}

/**
 * Hook for comparison view
 */
export function useStatsComparison(
  playerId: string,
  baseline: ComparisonBaseline,
  teamId?: string
) {
  return useStats({
    playerId,
    includeStrokesGained: true,
    includeTrends: false,
    includeComparison: true,
    comparisonBaseline: baseline,
    includeWeakAreas: false,
    teamId,
  });
}

/**
 * Hook for development/coaching view with weak areas
 */
export function useCoachingStats(playerId: string, teamId?: string) {
  return useStats({
    playerId,
    includeStrokesGained: true,
    includeTrends: true,
    includeComparison: true,
    comparisonBaseline: 'team_avg',
    includeWeakAreas: true,
    teamId,
  });
}

// ============================================
// TEAM STATS HOOK
// ============================================

interface UseTeamStatsOptions {
  teamId: string;
  includePlayerStats?: boolean;
  roundTypes?: RoundType[];
}

interface UseTeamStatsResult {
  teamStats: {
    team_id: string;
    team_name: string;
    total_players: number;
    total_rounds: number;
    team_scoring_avg: number;
    best_team_round: number;
    avg_putts: number;
    fairway_percentage: number;
    gir_percentage: number;
    strokes_gained: {
      sg_off_tee: number;
      sg_approach: number;
      sg_around_green: number;
      sg_putting: number;
      sg_total: number;
    };
    player_stats: PlayerStats[];
  } | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTeamStats(options: UseTeamStatsOptions): UseTeamStatsResult {
  const { teamId, includePlayerStats = true, roundTypes } = options;

  const [teamStats, setTeamStats] = useState<UseTeamStatsResult['teamStats']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);

  const fetchTeamStats = useCallback(async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    try {
      // Import dynamically to avoid circular dependencies
      const { getTeamStats } = await import('@/app/golf/actions/stats');
      const data = await getTeamStats(teamId, {
        includeStrokesGained: true,
        includeTrends: false,
        roundTypes,
      });

      if (mounted.current) {
        setTeamStats(data);
      }
    } catch (err) {
      console.error('Error fetching team stats:', err);
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Failed to load team stats');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [teamId, roundTypes]);

  useEffect(() => {
    mounted.current = true;
    fetchTeamStats();

    return () => {
      mounted.current = false;
    };
  }, [fetchTeamStats]);

  return {
    teamStats,
    loading,
    error,
    refresh: fetchTeamStats,
  };
}

export default useStats;
