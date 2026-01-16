'use client';

/**
 * Cached Stats Hook
 *
 * React hook for accessing cached player stats with automatic
 * refresh on stale data. Provides instant dashboard loads.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPlayerStatsSummaryAction,
  getFullPlayerStatsAction,
  refreshStatsCacheAction,
  type PlayerStatsSummary,
  type PlayerStatsCache,
} from '@/app/golf/actions/stats';

interface UseCachedStatsOptions {
  /**
   * Player ID to fetch stats for. If not provided, fetches current user's stats.
   */
  playerId?: string;

  /**
   * Whether to auto-refresh when stats are stale
   * @default true
   */
  autoRefresh?: boolean;

  /**
   * Interval in ms to check for stale data
   * @default 60000 (1 minute)
   */
  refreshInterval?: number;
}

interface UseCachedStatsResult {
  /**
   * Summary stats for quick display
   */
  stats: PlayerStatsSummary | null;

  /**
   * Loading state
   */
  loading: boolean;

  /**
   * Error message if fetch failed
   */
  error: string | null;

  /**
   * Whether cached data is stale
   */
  isStale: boolean;

  /**
   * Force refresh the stats cache
   */
  refresh: () => Promise<void>;

  /**
   * Last time stats were updated
   */
  lastUpdated: string | null;
}

/**
 * Hook to access cached player stats with auto-refresh
 */
export function useCachedStats(options: UseCachedStatsOptions = {}): UseCachedStatsResult {
  const { playerId, autoRefresh = true, refreshInterval = 60000 } = options;

  const [stats, setStats] = useState<PlayerStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getPlayerStatsSummaryAction(playerId);

    if (result.success) {
      setStats(result.data);
    } else {
      setError(result.error);
    }

    setLoading(false);
  }, [playerId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await refreshStatsCacheAction(playerId);

    if (result.success) {
      // Re-fetch after refresh
      await fetchStats();
    } else {
      setError(result.error);
      setLoading(false);
    }
  }, [playerId, fetchStats]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh when stale
  useEffect(() => {
    if (!autoRefresh || !stats?.isStale) return;

    // Refresh stale data in background
    refresh().catch(() => {
      // Silently fail - we have stale data to show
    });
  }, [autoRefresh, stats?.isStale, refresh]);

  // Periodic refresh check
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;

    const interval = setInterval(() => {
      fetchStats();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStats]);

  return {
    stats,
    loading,
    error,
    isStale: stats?.isStale || false,
    refresh,
    lastUpdated: stats?.lastUpdated || null,
  };
}

/**
 * Hook to access full cached player stats
 */
export function useFullCachedStats(playerId?: string) {
  const [stats, setStats] = useState<PlayerStatsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const result = await getFullPlayerStatsAction(playerId);

      if (result.success) {
        setStats(result.data);
      } else {
        setError(result.error);
      }

      setLoading(false);
    }

    fetch();
  }, [playerId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const refreshResult = await refreshStatsCacheAction(playerId);

    if (refreshResult.success) {
      const result = await getFullPlayerStatsAction(playerId);
      if (result.success) {
        setStats(result.data);
      }
    }

    setLoading(false);
  }, [playerId]);

  return { stats, loading, error, refresh };
}

/**
 * Quick hook for just scoring average and trend
 */
export function useScoringTrend(playerId?: string) {
  const { stats, loading, error } = useCachedStats({ playerId, autoRefresh: false });

  return {
    scoringAverage: stats?.scoringAverage,
    last5Average: stats?.last5Average,
    last10Average: stats?.last10Average,
    trend: stats?.trendDirection,
    improvementAmount: stats?.improvementTrend,
    loading,
    error,
  };
}

export type { PlayerStatsSummary, PlayerStatsCache };
