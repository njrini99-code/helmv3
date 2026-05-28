'use client';

/**
 * DrillChips — horizontal scroll row of drill chips rendered inline in the
 * collapsed default + hero densities of `<InsightCard>`. Tapping a chip opens
 * the shared `<DrillSheet>` with full detail + CTAs.
 *
 * Rule 3 of the Insight Delivery design contract — drills must be reachable
 * in one tap from the collapsed card, not two clicks deep behind an expand.
 *
 * Wave 1D change: we previously rendered a minimal drill detail inline in a
 * bottom sheet. That was a visual placeholder; `<DrillSheet>` now owns the
 * full presentation (video embed, "Add to practice plan", "Log drill"). We
 * also accept the parent `insight` so the sheet can render the "Recommended
 * because of:" breadcrumb without a second data fetch.
 */
import { useState, useTransition } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconPlay, IconTarget } from '@/components/icons';
import {
  recordDrillView as defaultRecordDrillView,
} from '@/app/golf/actions/drills';
import type {
  EvidenceInsight,
  InsightAttachedDrill,
} from '@/app/golf/actions/insight-delivery';
import { DrillSheet } from './DrillSheet';

export interface DrillChipsProps {
  insightId: string;
  drills: InsightAttachedDrill[];
  /**
   * Optional insight for the sheet's "Recommended because of:" line.
   * The primitive passes this automatically; tests often omit it.
   */
  insight?: Pick<EvidenceInsight, 'title' | 'category'>;
  /** Injected for tests — logs drill view. */
  onView?: (drillId: string) => Promise<void> | void;
  className?: string;
}

export function DrillChips({
  insightId,
  drills,
  insight,
  onView = defaultRecordDrillView,
  className,
}: DrillChipsProps) {
  const [openDrillId, setOpenDrillId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!drills || drills.length === 0) return null;

  const openDrill = drills.find((d) => d.id === openDrillId) ?? null;

  const handleChipClick = (drill: InsightAttachedDrill) => {
    setOpenDrillId(drill.id);
    // Log the view as soon as the sheet opens. Doing it here (not inside the
    // sheet) keeps DrillSheet fully testable in isolation — the sheet itself
    // doesn't need to know about the insight id.
    startTransition(() => {
      void Promise.resolve(onView(drill.id));
    });
  };

  return (
    <>
      <div
        data-testid="drill-chips"
        data-insight-id={insightId}
        className={cn(
          'flex items-center gap-2 overflow-x-auto',
          // Keep the chip row tidy on narrow screens — no wrap, soft scroll.
          'scrollbar-none -mx-1 px-1 pb-1',
          className,
        )}
      >
        <span className="flex items-center gap-1 text-eyebrow font-medium uppercase tracking-wide text-warm-500 flex-shrink-0">
          <IconTarget size={12} />
          Drills
        </span>
        {drills.map((drill) => (
          <DrillChipButton
            key={drill.id}
            drill={drill}
            onClick={() => handleChipClick(drill)}
          />
        ))}
        {drills.length < 3 && (
          <span className="text-eyebrow text-warm-400 flex-shrink-0">
            tap to expand
          </span>
        )}
      </div>

      {openDrill && (
        <DrillSheet
          open
          onClose={() => setOpenDrillId(null)}
          insightId={insightId}
          drill={{
            id: openDrill.id,
            title: openDrill.title,
            // `InsightAttachedDrill` intentionally doesn't carry the full
            // description — the primitive renders a short default when
            // that's missing so the sheet never looks empty.
            description:
              'Open this drill to work on the specific skill this insight flagged.\nEach rep counts — keep it under the time estimate and log it when you’re done so CoachHelm can re-evaluate your numbers.',
            duration_min: openDrill.duration_min,
            difficulty: openDrill.difficulty,
          }}
          insightContext={
            insight
              ? {
                  title: insight.title,
                  category: insight.category ?? '',
                }
              : undefined
          }
        />
      )}
    </>
  );
}

interface DrillChipButtonProps {
  drill: InsightAttachedDrill;
  onClick: () => void;
}

function DrillChipButton({ drill, onClick }: DrillChipButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <m.button
      type="button"
      data-testid="drill-chip"
      whileTap={prefersReducedMotion ? undefined : ({ scale: 0.98 })}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0',
        'bg-cream-100/82 border border-warm-200/35',
        'text-xs font-medium text-warm-800',
        'hover:bg-white hover:border-primary-200/60 hover:shadow-sm',
        'transition-colors',
      )}
    >
      <IconPlay size={12} className="text-primary-600" aria-hidden />
      <span className="truncate max-w-[140px]">{drill.title}</span>
      <span className="text-warm-500 tabular-nums">{drill.duration_min}m</span>
    </m.button>
  );
}
