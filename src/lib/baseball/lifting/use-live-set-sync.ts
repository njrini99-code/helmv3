'use client';

// =============================================================================
// src/lib/baseball/lifting/use-live-set-sync.ts
//
// React lifecycle around the Live Weight Room offline set buffer. Owns the
// flush loop so the component just calls `queueAndFlush(...)` and renders the
// returned `pending`/`isOnline` state — mirroring how GolfHelm's round-entry
// screens lean on the sync-engine rather than open-coding retry logic per page.
//
// Flush triggers (any one drains the durable queue, backoff-gated per entry):
//   * mount             — recover sets stranded by a prior tab close / reload.
//   * `online` event    — the moment connectivity returns, push what we have.
//   * periodic tick     — covers the "still technically online but the request
//                         failed" case (flaky room Wi-Fi never fires `offline`).
//   * after a new log   — try immediately so the happy path stays instant.
//
// NON-DESTRUCTIVE: a failed flush bumps backoff and keeps the entry; only a
// confirmed server success removes it. Idempotent server upsert makes replay safe.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  enqueueSet,
  readPendingSets,
  removeSet,
  recordSetFailure,
  shouldRetrySet,
  pendingSetCount,
  type LiveSetEntryInput,
} from './live-set-offline-buffer';

/** The capability-enforced server action shape (logSetResult), narrowed. */
export type FlushSetFn = (input: {
  sessionId: string;
  sessionExerciseId: string;
  setNumber: number;
  actualReps: number | null;
  actualLoad: number | null;
  loadUnit: string | null;
  rpe: number | null;
}) => Promise<{ success: boolean; error?: string }>;

const FLUSH_INTERVAL_MS = 15_000;

export interface LiveSetSync {
  /** Number of sets buffered locally and not yet confirmed by the server. */
  pending: number;
  /** Best-effort connectivity (navigator.onLine + last flush outcome). */
  isOnline: boolean;
  /**
   * Durably buffer a set, then attempt to flush. Returns immediately — the
   * caller already applied the optimistic UI change. The set is safe whether or
   * not the network is up; if the flush fails it stays queued for the next tick.
   */
  queueAndFlush: (input: LiveSetEntryInput) => void;
  /** Manually drain the queue (e.g. a "retry now" affordance). */
  flushNow: () => void;
}

export function useLiveSetSync(flushFn: FlushSetFn): LiveSetSync {
  const [pending, setPending] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  // A flush in progress — prevents overlapping drains racing the same entries.
  const flushingRef = useRef(false);
  // Hold the latest flushFn without making the flush callback identity churn.
  const flushFnRef = useRef(flushFn);
  flushFnRef.current = flushFn;

  const flushNow = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setPending(pendingSetCount());
      return;
    }
    flushingRef.current = true;
    try {
      const entries = readPendingSets();
      for (const entry of entries) {
        if (!shouldRetrySet(entry)) continue; // inside backoff or budget spent
        try {
          const r = await flushFnRef.current({
            sessionId: entry.sessionId,
            sessionExerciseId: entry.sessionExerciseId,
            setNumber: entry.setNumber,
            actualReps: entry.actualReps,
            actualLoad: entry.actualLoad,
            loadUnit: entry.loadUnit,
            rpe: entry.rpe,
          });
          if (r.success) {
            removeSet(entry.id); // confirmed — the ONLY destructive op
            setIsOnline(true);
          } else {
            // Server rejected (validation, RLS) — non-destructive backoff.
            recordSetFailure(entry.id);
          }
        } catch {
          // Network/transport failure — keep the entry, mark offline, stop the
          // pass (the rest will share the same dead network this tick).
          recordSetFailure(entry.id);
          setIsOnline(false);
          break;
        }
      }
    } finally {
      flushingRef.current = false;
      setPending(pendingSetCount());
    }
  }, []);

  const queueAndFlush = useCallback(
    (input: LiveSetEntryInput) => {
      enqueueSet(input);
      setPending(pendingSetCount());
      void flushNow();
    },
    [flushNow],
  );

  // Recover stranded sets on mount + reflect real connectivity.
  useEffect(() => {
    setPending(pendingSetCount());
    if (typeof navigator !== 'undefined') setIsOnline(navigator.onLine);
    void flushNow();
  }, [flushNow]);

  // Reconnect + offline listeners.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setIsOnline(true);
      void flushNow();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushNow]);

  // Periodic drain — catches failed-while-online (flaky Wi-Fi never fires `offline`).
  useEffect(() => {
    const t = setInterval(() => void flushNow(), FLUSH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [flushNow]);

  return { pending, isOnline, queueAndFlush, flushNow };
}
