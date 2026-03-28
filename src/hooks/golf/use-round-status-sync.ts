'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { checkRoundStaleness } from '@/app/golf/actions/round-drafts';

interface UseRoundStatusSyncOptions {
  roundId?: string | null;
  expectedUpdatedAtRef: MutableRefObject<string | undefined>;
  enabled?: boolean;
  onRoundCompleted?: () => void | Promise<void>;
  onRoundStale?: (state: { currentUpdatedAt: string | null; status: string | null }) => void | Promise<void>;
  syncIntervalMs?: number;
}

// Circuit breaker constants for status sync polling
const SYNC_CIRCUIT_BREAKER_THRESHOLD = 3;
const SYNC_BACKOFF_BASE_MS = 30_000; // Start at 30s
const SYNC_BACKOFF_MAX_MS = 300_000; // Cap at 5 minutes

export function useRoundStatusSync({
  roundId,
  expectedUpdatedAtRef,
  enabled = true,
  onRoundCompleted,
  onRoundStale,
  syncIntervalMs = 30000,
}: UseRoundStatusSyncOptions) {
  const syncInFlightRef = useRef(false);
  const completionHandledRef = useRef(false);
  const lastStaleVersionRef = useRef<string | null>(null);
  const onRoundCompletedRef = useRef(onRoundCompleted);
  const onRoundStaleRef = useRef(onRoundStale);
  // Track consecutive failures for exponential backoff
  const consecutiveFailuresRef = useRef(0);

  onRoundCompletedRef.current = onRoundCompleted;
  onRoundStaleRef.current = onRoundStale;

  useEffect(() => {
    completionHandledRef.current = false;
    lastStaleVersionRef.current = null;
    consecutiveFailuresRef.current = 0;
  }, [roundId]);

  useEffect(() => {
    if (!enabled || !roundId) {
      return;
    }

    let isCancelled = false;
    let dynamicIntervalId: ReturnType<typeof setTimeout> | null = null;

    const getBackoffDelay = (): number => {
      const failures = consecutiveFailuresRef.current;
      if (failures === 0) return syncIntervalMs;
      // Exponential backoff: 30s, 60s, 120s, 240s, capped at 300s
      const delay = Math.min(
        SYNC_BACKOFF_BASE_MS * Math.pow(2, failures - 1),
        SYNC_BACKOFF_MAX_MS
      );
      return delay;
    };

    const scheduleNextSync = () => {
      if (isCancelled) return;
      if (dynamicIntervalId != null) clearTimeout(dynamicIntervalId);
      const delay = getBackoffDelay();
      dynamicIntervalId = setTimeout(() => {
        void syncRoundStatus();
      }, delay);
    };

    const syncRoundStatus = async () => {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      try {
        const result = await checkRoundStaleness(roundId, expectedUpdatedAtRef.current);
        if (isCancelled) return;

        if (!result.success) {
          // Server action returned an error — count as failure for backoff
          consecutiveFailuresRef.current++;
          return;
        }

        // Success — reset failure counter
        consecutiveFailuresRef.current = 0;

        const { currentUpdatedAt, status, isStale } = result.data;

        if (currentUpdatedAt) {
          expectedUpdatedAtRef.current = currentUpdatedAt;
        }

        if (status === 'completed') {
          if (!completionHandledRef.current) {
            completionHandledRef.current = true;
            await onRoundCompletedRef.current?.();
          }
          return;
        }

        if (isStale && currentUpdatedAt !== lastStaleVersionRef.current) {
          lastStaleVersionRef.current = currentUpdatedAt;
          await onRoundStaleRef.current?.({ currentUpdatedAt, status });
        }
      } catch {
        // Network error / "unexpected response" (e.g. deploy mismatch) — backoff
        consecutiveFailuresRef.current++;
      } finally {
        syncInFlightRef.current = false;
        // Schedule next sync with dynamic delay based on failure count
        scheduleNextSync();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // On tab re-focus, only sync if we're not in heavy backoff
        if (consecutiveFailuresRef.current < SYNC_CIRCUIT_BREAKER_THRESHOLD) {
          void syncRoundStatus();
        }
      }
    };

    const handleFocus = () => {
      if (consecutiveFailuresRef.current < SYNC_CIRCUIT_BREAKER_THRESHOLD) {
        void syncRoundStatus();
      }
    };

    const handlePageShow = () => {
      // Always attempt on pageshow (user returning to tab after long absence)
      void syncRoundStatus();
    };

    void syncRoundStatus();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      if (dynamicIntervalId != null) {
        clearTimeout(dynamicIntervalId);
      }
    };
  }, [enabled, expectedUpdatedAtRef, roundId, syncIntervalMs]);
}
