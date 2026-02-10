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
  RoundType,
  DataQuality,
} from '@/lib/types/golf';
import { getPlayerStatsSummaryAction } from '@/app/golf/actions/stats';
import type { PlayerStatsSummary } from '@/lib/cache/golf-stats-calculator';

// Local type for strokes gained trend data
interface StrokesGainedTrend {
  date: string;
  round_id: string;
  sg_total: number;
  sg_off_tee: number;
  sg_approach: number;
  sg_around_green: number;
  sg_putting: number;
}

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
    includeTrends = true,
    comparisonBaseline: initialBaseline = 'scratch',
    autoRefresh = false,
    refreshInterval = 5 * 60 * 1000, // 5 minutes default
    // These options are currently unused but kept for API compatibility
     
    includeStrokesGained: _includeStrokesGained = true,
     
    includeComparison: _includeComparison = false,
     
    includeWeakAreas: _includeWeakAreas = false,
     
    roundTypes: _roundTypes,
     
    limit: _limit,
     
    teamId: _teamId,
  } = options;

  // State
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [trends, setTrends] = useState<MultiMetricTrend | null>(null);
  const [strokesGainedTrends] = useState<StrokesGainedTrend[] | null>(null);
  const [comparison] = useState<ComparisonResult | null>(null);
  const [weakAreas] = useState<WeakAreaIdentification[] | null>(null);
  const [trendInsights, setTrendInsights] = useState<string[] | null>(null);
  const [prediction] = useState<{
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
      // Fetch stats (always) - using available action
      const statsResponse = await getPlayerStatsSummaryAction(playerId);

      if (!mounted.current) return;

      if (!statsResponse.success || !statsResponse.data) {
        throw new Error(statsResponse.success ? 'No stats data' : statsResponse.error);
      }

      const summary = statsResponse.data;

      // Map PlayerStatsSummary to PlayerStats format
      const mappedStats: PlayerStats = {
        player_id: playerId,
        rounds_played: summary.roundsPlayed,
        total_rounds: summary.roundsPlayed,
        scoring_average: summary.scoringAverage ?? 0,
        scoring_avg: summary.scoringAverage ?? 0,
        best_round: summary.bestRound ?? 0,
        worst_round: summary.worstRound ?? 0,
        putts_per_round: summary.puttsPerRound ?? 0,
        avg_putts: summary.puttsPerRound ?? 0,
        fairways_hit_percentage: summary.fairwayPercentage ?? 0,
        fairway_percentage: summary.fairwayPercentage ?? 0,
        greens_in_regulation_percentage: summary.girPercentage ?? 0,
        gir_percentage: summary.girPercentage ?? 0,
        up_and_down_percentage: summary.scramblingPercentage ?? 0,
        strokes_gained: {
          sg_total: 0,
          sg_off_tee: 0,
          sg_approach: 0,
          sg_around_green: 0,
          sg_putting: 0,
        },
      };

      setStats(mappedStats);
      setDataQuality({
        roundCount: summary.roundsPlayed,
        isReliable: summary.roundsPlayed >= 5,
        message: summary.roundsPlayed < 5 ? 'Limited data for accurate statistics' : undefined,
      });

      // Fetch trends if requested and enough data
      if (includeTrends && summary.roundsPlayed >= 3) {
        // Build trend data from summary
        if (summary.improvementTrend !== null) {
          const trendData: MultiMetricTrend = {
            metric: 'scoring_average',
            values: [],
            trend: summary.trendDirection === 'improving' ? 'improving' :
                   summary.trendDirection === 'declining' ? 'declining' : 'stable',
            changePercent: summary.improvementTrend ?? 0,
          };
          if (mounted.current) {
            setTrends(trendData);
          }
        }

        // Generate basic insights based on available data
        const insights: string[] = [];
        if (summary.trendDirection === 'improving') {
          insights.push('Your scoring average is trending down - great progress!');
        } else if (summary.trendDirection === 'declining') {
          insights.push('Your scoring average has been trending up recently.');
        }
        if (summary.last5Average && summary.last10Average) {
          const diff = summary.last10Average - summary.last5Average;
          if (diff > 1) {
            insights.push(`Your last 5 rounds average ${diff.toFixed(1)} strokes better than your last 10.`);
          }
        }
        if (mounted.current) {
          setTrendInsights(insights.length > 0 ? insights : null);
        }
      }

      // Comparison data would require additional API calls - leave as null for now
      // Weak areas would require additional analysis - leave as null for now

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
    includeTrends,
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
  // Note: Comparison API not available in current stats actions, this is a no-op placeholder
  useEffect(() => {
    // Comparison would require additional API implementation
    // For now, this effect does nothing but preserves the interface
  }, [comparisonBaseline, playerId, stats]);

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
    comparisonBaseline: 'team',
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
  const { teamId } = options;

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
      const { getTeamStatsAction } = await import('@/app/golf/actions/stats');
      const result = await getTeamStatsAction();

      if (mounted.current) {
        if (result.success && result.data) {
          // Convert Map to the expected format
          const playerStatsArray: PlayerStats[] = [];
          result.data.forEach((summary: PlayerStatsSummary, playerId: string) => {
            playerStatsArray.push({
              player_id: playerId,
              rounds_played: summary.roundsPlayed,
              total_rounds: summary.roundsPlayed,
              scoring_average: summary.scoringAverage ?? 0,
              scoring_avg: summary.scoringAverage ?? 0,
              best_round: summary.bestRound ?? 0,
              worst_round: summary.worstRound ?? 0,
              putts_per_round: summary.puttsPerRound ?? 0,
              avg_putts: summary.puttsPerRound ?? 0,
              fairways_hit_percentage: summary.fairwayPercentage ?? 0,
              fairway_percentage: summary.fairwayPercentage ?? 0,
              greens_in_regulation_percentage: summary.girPercentage ?? 0,
              gir_percentage: summary.girPercentage ?? 0,
              up_and_down_percentage: summary.scramblingPercentage ?? 0,
              strokes_gained: {
                sg_total: 0,
                sg_off_tee: 0,
                sg_approach: 0,
                sg_around_green: 0,
                sg_putting: 0,
              },
            });
          });

          // Calculate team aggregates
          const totalRounds = playerStatsArray.reduce((sum, p) => sum + p.rounds_played, 0);
          const avgScore = playerStatsArray.length > 0
            ? playerStatsArray.reduce((sum, p) => sum + p.scoring_average, 0) / playerStatsArray.length
            : 0;

          setTeamStats({
            team_id: teamId,
            team_name: '',
            total_players: playerStatsArray.length,
            total_rounds: totalRounds,
            team_scoring_avg: avgScore,
            best_team_round: Math.min(...playerStatsArray.map(p => p.best_round).filter(v => v > 0), 999),
            avg_putts: playerStatsArray.length > 0
              ? playerStatsArray.reduce((sum, p) => sum + p.avg_putts, 0) / playerStatsArray.length
              : 0,
            fairway_percentage: playerStatsArray.length > 0
              ? playerStatsArray.reduce((sum, p) => sum + p.fairway_percentage, 0) / playerStatsArray.length
              : 0,
            gir_percentage: playerStatsArray.length > 0
              ? playerStatsArray.reduce((sum, p) => sum + p.gir_percentage, 0) / playerStatsArray.length
              : 0,
            strokes_gained: {
              sg_off_tee: 0,
              sg_approach: 0,
              sg_around_green: 0,
              sg_putting: 0,
              sg_total: 0,
            },
            player_stats: playerStatsArray,
          });
        }
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
  }, [teamId]);

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
