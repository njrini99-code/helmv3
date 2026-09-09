'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConflictInboxRequest,
  ConflictInboxResult,
  ConflictInboxSnapshot,
} from '@/app/golf/actions/conflict-inbox';

/**
 * Loads the conflict inbox for one team + window (SCREEN-BUILD-PLAN.md §2.8).
 * Modelled on `use-schedule-window.ts`'s keyed request / stale-response /
 * retry shape, renamed and re-typed for the conflict inbox's own contract.
 *
 * Two behaviors this hook must get right, both from the plan's own words —
 * "keeps the last result visible while refreshing, and never presents a
 * cached result as a fresh all-clear":
 *
 * 1. A `refresh()` on the SAME key (team + window unchanged) keeps the prior
 *    `snapshot` in place while the new read is in flight — `loading` stays
 *    false, `refreshing` turns true instead, so a consumer showing a plain
 *    "no conflicts" empty state does not flash to a loading skeleton on every
 *    manual refresh. If that refresh FAILS, the prior snapshot (and its own
 *    `checkedAt`) is still what's returned — paired with `error` — so a
 *    caller can render "last checked HH:MM · couldn't re-check" instead of
 *    silently keeping (or worse, re-affirming) a clean empty state as if it
 *    were current.
 * 2. A key CHANGE (different team or window) always resets to `snapshot:
 *    null, loading: true` first — the previous window's list must never be
 *    shown, even briefly, as if it already covered the new window.
 */

export interface UseConflictInboxResult {
  snapshot: ConflictInboxSnapshot | null;
  /** True only while there is no snapshot yet for the current key. */
  loading: boolean;
  /** True while a snapshot is already showing and a new read is in flight
   * (a manual refresh, or a key change that reused an already-loaded key —
   * which cannot happen today since keys are freshly computed per render,
   * but the flag is derived rather than assumed for that reason). */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
}

interface ConflictInboxState {
  key: string | null;
  snapshot: ConflictInboxSnapshot | null;
  loading: boolean;
  error: string | null;
}

function requestKey(request: ConflictInboxRequest): string {
  return JSON.stringify([request.teamId, request.from, request.to]);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Conflicts could not be loaded.';
}

export function useConflictInbox(
  request: ConflictInboxRequest | null,
  load: (request: ConflictInboxRequest) => Promise<ConflictInboxResult>,
): UseConflictInboxResult {
  const key = request ? requestKey(request) : null;
  const requestRef = useRef<ConflictInboxRequest | null>(request);
  requestRef.current = request;

  const loadRef = useRef(load);
  loadRef.current = load;

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<ConflictInboxState>({
    key: null,
    snapshot: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(() => {
    setRefreshNonce((current) => current + 1);
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
        // Same window: keep whatever snapshot is already showing visible
        // while this refresh is in flight.
        ? { ...current, loading: true, error: null }
        // A different window: never let the old window's list stand in for
        // one it was never checked against.
        : { key, snapshot: null, loading: true, error: null },
    );

    void loadRef.current(requestForLoad).then(
      (result) => {
        if (cancelled) return;

        if (result.success) {
          setState({ key, snapshot: result.data, loading: false, error: null });
        } else {
          // A failed refresh must not clear a snapshot that was already
          // showing — the stale list (and its own `checkedAt`) stays, with
          // the error surfaced alongside it, never silently dropped into a
          // fresh "no conflicts" read.
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
  }, [key, refreshNonce]);

  const isCurrentKey = key !== null && state.key === key;
  const snapshot = isCurrentKey ? state.snapshot : null;
  const isFetching = key !== null && (!isCurrentKey || state.loading);

  return {
    snapshot,
    loading: isFetching && snapshot === null,
    refreshing: isFetching && snapshot !== null,
    error: isCurrentKey ? state.error : null,
    refresh,
  };
}
