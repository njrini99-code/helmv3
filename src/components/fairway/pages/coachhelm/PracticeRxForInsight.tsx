'use client';

/**
 * ============================================================================
 * Fairway · pages · coachhelm · PracticeRxForInsight
 * ----------------------------------------------------------------------------
 * Self-fetching wrapper around `PracticeRxPanel` for surfaces that only hold an
 * `insightId` rather than the pre-joined drills (the secondary My-Development
 * path: a focus area that carries `from_insight_id`).
 *
 * It calls the existing `getDrillsForInsight` server action ONCE on mount inside
 * a transition, then renders `<PracticeRxPanel drills={...} />`. Same self-fetch
 * pattern as the legacy DrillAttachment, but rendered in Fairway tokens.
 *
 * HONEST-EMPTY: returns null while unloaded AND when the action returns `[]`
 * (which it does for missing/inaccessible insights, or insights with no drills).
 * On the demo, focus-area→insight→drill coverage is empty, so this renders
 * nothing — that is the correct invisible state, NOT a bug.
 *
 * RENDER-ONLY — the only server action it touches is the read-side
 * `getDrillsForInsight`; the `recordDrillView` telemetry flows through the
 * inner panel. No plan-write is ever wired.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import {
  getDrillsForInsight as defaultGetDrillsForInsight,
  recordDrillView as defaultRecordDrillView,
  type InsightDrill,
} from '@/app/golf/actions/drills';
import { PracticeRxPanel, type PracticeRxPanelProps } from './PracticeRxPanel';

export interface PracticeRxForInsightProps {
  /** Insight to prescribe drills for. When falsy, the component renders nothing. */
  insightId: string | null | undefined;
  /** Forwarded to the inner panel — framing only. */
  variant?: PracticeRxPanelProps['variant'];
  /** Telemetry hook, forwarded to the inner panel. Defaults to `recordDrillView`. */
  onView?: PracticeRxPanelProps['onView'];
  /** Injected for tests — defaults to the real `getDrillsForInsight` action. */
  getDrills?: (insightId: string) => Promise<InsightDrill[]>;
  className?: string;
}

export function PracticeRxForInsight({
  insightId,
  variant = 'sheet',
  onView = defaultRecordDrillView,
  getDrills = defaultGetDrillsForInsight,
  className,
}: PracticeRxForInsightProps) {
  const [drills, setDrills] = useState<InsightDrill[] | null>(null);

  useEffect(() => {
    if (!insightId) {
      setDrills(null);
      return;
    }
    let alive = true;
    void (async () => {
      const result = await getDrills(insightId);
      if (alive) setDrills(result);
    })();
    return () => {
      alive = false;
    };
    // `getDrills` is an external server action — identity changes should not
    // refetch. Depend only on the insight that meaningfully changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightId]);

  // Unloaded (or no insight) → nothing. PracticeRxPanel itself collapses to null
  // on an empty array, so the loaded-but-empty case also renders nothing.
  if (!insightId || drills === null) return null;

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
