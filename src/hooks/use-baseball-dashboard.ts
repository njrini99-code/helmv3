'use client';

/**
 * Consolidated Baseball Dashboard Hook
 *
 * Replaces multiple individual hooks (useWatchlist, useCoachStats, useActivityFeed, etc.)
 * with a single hook that fetches all data in parallel.
 *
 * Performance improvement: ~15 sequential queries → 5-6 parallel batches
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  getCoachDashboardData,
  getPlayerDashboardData,
  type CoachDashboardData,
  type PlayerDashboardData,
} from '@/lib/queries/baseball-dashboard';

// Cache the supabase client
const supabaseClient = createClient();

export function useBaseballCoachDashboard() {
  const [data, setData] = useState<CoachDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, coach } = useAuthStore();
  const supabase = useMemo(() => supabaseClient, []);

  const fetchData = useCallback(async () => {
    if (!user || !coach) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dashboardData = await getCoachDashboardData(supabase, user.id, coach.id);
      setData(dashboardData);
    } catch (err) {
      console.error('[BaseballCoachDashboard] Failed to fetch data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [user, coach, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    // Convenience accessors
    watchlist: data?.watchlist ?? [],
    stats: data?.stats ?? null,
    activities: data?.activities ?? [],
    chartData: data?.chartData ?? [],
    pipelineCounts: data?.pipelineCounts ?? {
      watchlist: 0,
      high_priority: 0,
      contacted: 0,
      campus_visit: 0,
      offer_extended: 0,
      committed: 0,
      uninterested: 0,
    },
  };
}

export function useBaseballPlayerDashboard() {
  const [data, setData] = useState<PlayerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, player } = useAuthStore();
  const supabase = useMemo(() => supabaseClient, []);

  const fetchData = useCallback(async () => {
    if (!user || !player) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const dashboardData = await getPlayerDashboardData(supabase, user.id, player.id);
      setData(dashboardData);
    } catch (err) {
      console.error('[BaseballPlayerDashboard] Failed to fetch data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [user, player, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    stats: data?.stats ?? null,
  };
}
