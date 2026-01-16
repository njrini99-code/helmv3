'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPlayerAvailability, getCoachBlockedTime } from '@/app/golf/actions/golf';
import { BusyPeriod } from '@/lib/calendar/availability';

// ============================================================================
// TYPES
// ============================================================================

interface UseAvailabilityOptions {
  playerId?: string;
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
  enabled?: boolean; // Allow conditional fetching
}

interface UseAvailabilityResult {
  busyPeriods: BusyPeriod[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to fetch and manage player availability data
 *
 * @example
 * ```tsx
 * const { busyPeriods, isLoading, error, refetch } = useAvailability({
 *   playerId: selectedPlayer.id,
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-07',
 * });
 * ```
 */
export function useAvailability({
  playerId,
  startDate,
  endDate,
  enabled = true,
}: UseAvailabilityOptions): UseAvailabilityResult {
  const [busyPeriods, setBusyPeriods] = useState<BusyPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailability = useCallback(async () => {
    if (!enabled || !playerId) {
      setBusyPeriods([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getPlayerAvailability(playerId, startDate, endDate);

      if (result.success) {
        // Convert ISO strings back to Date objects and ensure required fields
        const periods: BusyPeriod[] = result.data.map((period: { start: string | Date; end: string | Date; title?: string; source?: string; type?: string }) => ({
          start: new Date(period.start),
          end: new Date(period.end),
          type: (period.type as 'event' | 'class' | 'blocked') || 'event',
          title: period.title,
        }));
        setBusyPeriods(periods);
      } else {
        setError(result.error);
        setBusyPeriods([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setBusyPeriods([]);
    } finally {
      setIsLoading(false);
    }
  }, [playerId, startDate, endDate, enabled]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  return {
    busyPeriods,
    isLoading,
    error,
    refetch: fetchAvailability,
  };
}

// ============================================================================
// COACH BLOCKED TIME HOOK
// ============================================================================

interface UseCoachBlockedTimeOptions {
  startDate: string;
  endDate: string;
  enabled?: boolean;
}

interface BlockedTime {
  id: string;
  start: string;
  end: string;
  title?: string;
  reason?: string;
}

interface UseCoachBlockedTimeResult {
  blockedTimes: BlockedTime[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage coach blocked time
 *
 * @example
 * ```tsx
 * const { blockedTimes, isLoading, refetch } = useCoachBlockedTime({
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-07',
 * });
 * ```
 */
export function useCoachBlockedTime({
  startDate,
  endDate,
  enabled = true,
}: UseCoachBlockedTimeOptions): UseCoachBlockedTimeResult {
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBlockedTime = useCallback(async () => {
    if (!enabled) {
      setBlockedTimes([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getCoachBlockedTime(startDate, endDate);

      if (result.success) {
        // Map BlockedTimePeriod to local BlockedTime
        const mappedBlockedTimes: BlockedTime[] = result.data.map((bt) => ({
          id: bt.id,
          start: bt.start_time ? `${bt.start_date}T${bt.start_time}` : bt.start_date,
          end: bt.end_time ? `${bt.end_date}T${bt.end_time}` : bt.end_date,
          reason: bt.reason ?? undefined,
        }));
        setBlockedTimes(mappedBlockedTimes);
      } else {
        setError(result.error);
        setBlockedTimes([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setBlockedTimes([]);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, enabled]);

  useEffect(() => {
    fetchBlockedTime();
  }, [fetchBlockedTime]);

  return {
    blockedTimes,
    isLoading,
    error,
    refetch: fetchBlockedTime,
  };
}
