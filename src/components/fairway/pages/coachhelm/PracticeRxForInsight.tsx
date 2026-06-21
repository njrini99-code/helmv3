'use client';

/**
 * ============================================================================
 * Fairway · pages · coachhelm · PracticeRxForInsight
 * ----------------------------------------------------------------------------
 * Self-fetching wrapper around `PracticeRxPanel` for surfaces that only hold an
 * `insightId` rather than the pre-joined drills (the secondary My-Development
 * path: a focus area that carries `from_insight_id`).
 *
 * P176 — N+1 elimination: rather than one `getDrillsForInsight` round-trip PER
 * mounted card (an N-deep client→server waterfall after hydration), every card
 * that mounts inside the same microtask is COALESCED into a single batched
 * `getDrillsForInsights([...])` call. A module-level cache also dedupes repeat /
 * concurrent requests for the same insight. The card keeps its self-fetch
 * contract (no parent/route refactor) while the wire cost collapses to one call.
 *
 * LOADING STATE: while unresolved the card now renders a small token Skeleton
 * placeholder (not `null`), so a development page no longer pops drills in with
 * no intervening loading affordance.
 *
 * HONEST-EMPTY: once loaded, an empty drill array renders nothing (PracticeRxPanel
 * collapses to null on `[]`), and a falsy `insightId` renders nothing. On the
 * demo, focus-area→insight→drill coverage is empty, so this stays invisible —
 * the correct state, NOT a bug.
 *
 * RENDER-ONLY — the only server action it touches is the read-side
 * drills loader; the `recordDrillView` telemetry flows through the inner panel.
 * No plan-write is ever wired.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import {
  getDrillsForInsights as defaultGetDrillsForInsights,
  recordDrillView as defaultRecordDrillView,
  type InsightDrill,
} from '@/app/golf/actions/drills';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { PracticeRxPanel, type PracticeRxPanelProps } from './PracticeRxPanel';

/* ───────────────────────────────────────────────────────────────────────────
 * Microtask request-coalescing batcher.
 *
 * Cards that mount in the same tick each call `loadDrillsBatched(insightId)`.
 * The first call schedules a microtask flush; every call before that flush is
 * buffered. When the microtask runs, ALL buffered ids go out as one
 * `getDrillsForInsights` request, and each waiting promise is resolved from the
 * returned map. A persistent result cache short-circuits subsequent mounts so
 * remounts (or sibling cards for the same insight) never re-hit the server.
 * ─────────────────────────────────────────────────────────────────────────── */

type BatchFn = (ids: string[]) => Promise<Record<string, InsightDrill[]>>;

interface PendingEntry {
  resolve: (drills: InsightDrill[]) => void;
  reject: (err: unknown) => void;
}

const resultCache = new Map<string, InsightDrill[]>();
const inFlight = new Map<string, Promise<InsightDrill[]>>();
let queue = new Map<string, PendingEntry[]>();
let flushScheduled = false;

function scheduleFlush(batchFn: BatchFn) {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    const batch = queue;
    queue = new Map();
    flushScheduled = false;
    const ids = Array.from(batch.keys());
    if (ids.length === 0) return;
    batchFn(ids)
      .then((map) => {
        for (const id of ids) {
          const drills = map[id] ?? [];
          resultCache.set(id, drills);
          for (const entry of batch.get(id) ?? []) entry.resolve(drills);
        }
      })
      .catch((err) => {
        for (const id of ids) {
          for (const entry of batch.get(id) ?? []) entry.reject(err);
        }
      })
      .finally(() => {
        for (const id of ids) inFlight.delete(id);
      });
  });
}

/** Coalesced, deduped loader for a single insight's drills. */
function loadDrillsBatched(insightId: string, batchFn: BatchFn): Promise<InsightDrill[]> {
  const cached = resultCache.get(insightId);
  if (cached) return Promise.resolve(cached);

  const existing = inFlight.get(insightId);
  if (existing) return existing;

  const promise = new Promise<InsightDrill[]>((resolve, reject) => {
    const entry: PendingEntry = { resolve, reject };
    const entries = queue.get(insightId);
    if (entries) entries.push(entry);
    else queue.set(insightId, [entry]);
  });
  inFlight.set(insightId, promise);
  scheduleFlush(batchFn);
  return promise;
}

/** Test-only: reset the module batcher caches so suites stay isolated. */
export function __resetPracticeRxBatcher() {
  resultCache.clear();
  inFlight.clear();
  queue = new Map();
  flushScheduled = false;
}

export interface PracticeRxForInsightProps {
  /** Insight to prescribe drills for. When falsy, the component renders nothing. */
  insightId: string | null | undefined;
  /** Forwarded to the inner panel — framing only. */
  variant?: PracticeRxPanelProps['variant'];
  /** Telemetry hook, forwarded to the inner panel. Defaults to `recordDrillView`. */
  onView?: PracticeRxPanelProps['onView'];
  /**
   * Injected for tests — a SINGLE-insight fetch. When provided it bypasses the
   * batcher (used by unit tests to stub one card). Production leaves it
   * undefined so cards coalesce through {@link getDrillsForInsights}.
   */
  getDrills?: (insightId: string) => Promise<InsightDrill[]>;
  /** Injected for tests — the batched fetch the batcher dispatches through. */
  getDrillsBatch?: BatchFn;
  className?: string;
}

export function PracticeRxForInsight({
  insightId,
  variant = 'sheet',
  onView = defaultRecordDrillView,
  getDrills,
  getDrillsBatch = defaultGetDrillsForInsights,
  className,
}: PracticeRxForInsightProps) {
  const [drills, setDrills] = useState<InsightDrill[] | null>(null);

  useEffect(() => {
    if (!insightId) {
      setDrills(null);
      return;
    }
    let alive = true;
    setDrills(null);
    void (async () => {
      try {
        // A custom single-insight `getDrills` (tests) bypasses the batcher;
        // production coalesces through the microtask batcher → one server call.
        const result = getDrills
          ? await getDrills(insightId)
          : await loadDrillsBatched(insightId, getDrillsBatch);
        if (alive) setDrills(result);
      } catch {
        // Honest-empty on failure — collapse to nothing rather than error in
        // a secondary surface (mirrors getDrillsForInsight's swallow-and-[]).
        if (alive) setDrills([]);
      }
    })();
    return () => {
      alive = false;
    };
    // `getDrills*` are external server actions / stable injections — identity
    // changes should not refetch. Depend only on the insight that meaningfully
    // changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightId]);

  // No insight → render nothing.
  if (!insightId) return null;

  // Loading → a small token placeholder (replaces the prior silent `null`).
  if (drills === null) {
    return (
      <div className={className} aria-hidden="true">
        <Skeleton className="h-16 w-full rounded-fw-md" />
      </div>
    );
  }

  // Loaded-but-empty collapses to null inside PracticeRxPanel.
  return (
    <PracticeRxPanel
      drills={drills}
      variant={variant}
      onView={onView}
      className={className}
    />
  );
}

export default PracticeRxForInsight;
