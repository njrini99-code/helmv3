'use client';

/**
 * DrillChips — horizontal scroll row of drill chips rendered inline in the
 * collapsed default + hero densities of `<InsightCard>`. Tapping a chip
 * opens a bottom sheet with the drill's full detail (reused via
 * `<DrillAttachment>` body).
 *
 * Rule 3 of the Insight Delivery design contract — drills must be reachable
 * in one tap from the collapsed card, not two clicks deep behind an expand.
 */
import { useState, useTransition } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconPlay, IconTarget } from '@/components/icons';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import {
  recordDrillView as defaultRecordDrillView,
} from '@/app/golf/actions/drills';
import type { InsightAttachedDrill } from '@/app/golf/actions/insight-delivery';

export interface DrillChipsProps {
  insightId: string;
  drills: InsightAttachedDrill[];
  /** Injected for tests. */
  onView?: (drillId: string) => Promise<void> | void;
  className?: string;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export function DrillChips({
  insightId,
  drills,
  onView = defaultRecordDrillView,
  className,
}: DrillChipsProps) {
  const [activeDrill, setActiveDrill] = useState<InsightAttachedDrill | null>(null);
  const [, startTransition] = useTransition();

  if (!drills || drills.length === 0) return null;

  const handleChipClick = (drill: InsightAttachedDrill) => {
    setActiveDrill(drill);
    startTransition(() => {
      void Promise.resolve(onView(drill.id));
    });
  };

  return (
    <>
      <div
        data-testid="drill-chips"
        className={cn(
          'flex items-center gap-2 overflow-x-auto',
          // Keep the chip row tidy on narrow screens — no wrap, soft scroll.
          'scrollbar-none -mx-1 px-1 pb-1',
          className,
        )}
      >
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-warm-500 flex-shrink-0">
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
          <span className="text-[11px] text-warm-400 flex-shrink-0">
            tap to expand
          </span>
        )}
      </div>

      <BottomSheet
        open={!!activeDrill}
        onClose={() => setActiveDrill(null)}
        title={activeDrill?.title}
        description="Drill detail"
      >
        {activeDrill && (
          <DrillDetail drill={activeDrill} insightId={insightId} />
        )}
      </BottomSheet>
    </>
  );
}

interface DrillChipButtonProps {
  drill: InsightAttachedDrill;
  onClick: () => void;
}

function DrillChipButton({ drill, onClick }: DrillChipButtonProps) {
  return (
    <m.button
      type="button"
      data-testid="drill-chip"
      whileTap={{ scale: 0.98 }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0',
        'bg-white/80 border border-white/50',
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

interface DrillDetailProps {
  drill: InsightAttachedDrill;
  insightId: string;
}

function DrillDetail({ drill, insightId }: DrillDetailProps) {
  const difficultyLabel = DIFFICULTY_LABEL[drill.difficulty] ?? drill.difficulty;
  return (
    <div className="space-y-4" data-testid="drill-detail" data-insight-id={insightId}>
      <div className="flex items-center gap-2 text-xs text-warm-600">
        <span className="px-2 py-0.5 rounded-full bg-warm-100">{difficultyLabel}</span>
        <span className="tabular-nums">{drill.duration_min} min</span>
      </div>
      <p className="text-sm text-warm-700 leading-relaxed">
        Open this drill to work on the specific skill this insight flagged.
        Each rep counts — keep it under {drill.duration_min} minutes and log
        it when you&apos;re done so CoachHelm can re-evaluate your numbers.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn(
            'flex-1 px-4 py-2 rounded-xl bg-primary-500 text-white',
            'text-sm font-medium hover:bg-primary-600 active:scale-[0.98] transition-all',
          )}
        >
          Add to my plan
        </button>
      </div>
    </div>
  );
}
