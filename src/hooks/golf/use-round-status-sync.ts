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

  onRoundCompletedRef.current = onRoundCompleted;
  onRoundStaleRef.current = onRoundStale;

  useEffect(() => {
    completionHandledRef.current = false;
    lastStaleVersionRef.current = null;
  }, [roundId]);

  useEffect(() => {
    if (!enabled || !roundId) {
      return;
    }

    let isCancelled = false;

    const syncRoundStatus = async () => {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      try {
        const result = await checkRoundStaleness(roundId, expectedUpdatedAtRef.current);
        if (isCancelled || !result.success) {
          return;
        }

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
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncRoundStatus();
      }
    };

    const handleFocus = () => {
      void syncRoundStatus();
    };

    const handlePageShow = () => {
      void syncRoundStatus();
    };

    void syncRoundStatus();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    const intervalId = syncIntervalMs > 0
      ? window.setInterval(() => {
          void syncRoundStatus();
        }, syncIntervalMs)
      : null;

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      if (intervalId != null) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, expectedUpdatedAtRef, roundId, syncIntervalMs]);
}
