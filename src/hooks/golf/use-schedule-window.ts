'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ScheduleSnapshot,
  ScheduleWindowRequest,
  ScheduleWindowResult,
} from '@/lib/calendar/scheduling-contracts';

export interface UseScheduleWindowResult {
  snapshot: ScheduleSnapshot | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

interface ScheduleWindowState {
  key: string | null;
  snapshot: ScheduleSnapshot | null;
  loading: boolean;
  error: string | null;
}

function normalizeRequest(request: ScheduleWindowRequest): ScheduleWindowRequest {
  return {
    ...request,
    participantIds: [...new Set(request.participantIds)].sort(),
  };
}

function requestKey(request: ScheduleWindowRequest): string {
  const normalized = normalizeRequest(request);
  return JSON.stringify([
    normalized.teamId,
    normalized.date,
    normalized.participantIds,
    normalized.excludeEventId ?? null,
  ]);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Unable to load schedule window.';
}

/**
 * Loads one authorized schedule window and keeps responses scoped to its
 * request key. The loader is injected so server adapters and tests can share
 * the same stale-response and retry behavior without coupling this hook to a
 * transport.
 */
export function useScheduleWindow(
  request: ScheduleWindowRequest | null,
  load: (request: ScheduleWindowRequest) => Promise<ScheduleWindowResult>,
): UseScheduleWindowResult {
  const key = request ? requestKey(request) : null;
  const requestRef = useRef<ScheduleWindowRequest | null>(
    request ? normalizeRequest(request) : null,
  );
  requestRef.current = request ? normalizeRequest(request) : null;

  const loadRef = useRef(load);
  loadRef.current = load;

  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<ScheduleWindowState>({
    key: null,
    snapshot: null,
    loading: false,
    error: null,
  });

  const retry = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const requestForLoad = requestRef.current;

    if (!key || !requestForLoad) {
      setState({ key: null, snapshot: null, loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    setState((current) =>
      current.key === key
        ? { ...current, loading: true, error: null }
        : { key, snapshot: null, loading: true, error: null },
    );

    void loadRef.current(requestForLoad).then(
      (result) => {
        if (cancelled) return;

        if (result.success) {
          setState({ key, snapshot: result.data, loading: false, error: null });
        } else {
          setState((current) =>
            current.key === key
              ? { ...current, loading: false, error: result.error }
              : current,
          );
        }
      },
      (error: unknown) => {
        if (cancelled) return;

        setState((current) =>
          current.key === key
            ? { ...current, loading: false, error: errorMessage(error) }
            : current,
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [key, retryNonce]);

  const isCurrentKey = key !== null && state.key === key;

  return {
    snapshot: isCurrentKey ? state.snapshot : null,
    loading: key !== null && (!isCurrentKey || state.loading),
    error: isCurrentKey ? state.error : null,
    retry,
  };
}
