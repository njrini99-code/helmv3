'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayShotPills
 * ----------------------------------------------------------------------------
 * PRESENTATION-ONLY re-skin of the legacy <ShotPillsBar>. The pill-generation
 * logic (Array.from({ length: Math.max(6, currentShot + 1) }) + the
 * active/completed/future/recorded/selected booleans) is copied VERBATIM.
 *
 * RISKY BEHAVIOR PRESERVED: the strip stays sticky at
 * `top: var(--scorecard-height, 105px)` — the same offset the legacy uses so it
 * pins directly beneath the scorecard header.
 * ========================================================================== */

import { memo } from 'react';
import { cn } from '@/lib/utils';

interface FairwayShotPillsProps {
  currentShot: number;
  recordedShotCount: number;
  selectedShotNumber: number | null;
  onSelectShot: (shotNumber: number) => void;
}

export const FairwayShotPills = memo(function FairwayShotPills({
  currentShot,
  recordedShotCount,
  selectedShotNumber,
  onSelectShot,
}: FairwayShotPillsProps) {
  return (
    <div
      className="sticky z-40 -mx-4 -mt-4 border-b border-border-subtle bg-canvas px-4 py-4 shadow-flat sm:-mx-6 sm:px-6"
      style={{ top: 'var(--scorecard-height, 105px)' }}
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 font-fw-sans text-eyebrow font-medium uppercase tracking-[0.12em] text-text-tertiary">
          Shot
        </span>
        <div
          className="scrollbar-hide flex-1 overflow-x-auto overscroll-x-contain touch-pan-x"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex min-w-max items-center gap-2 pr-1">
            {Array.from({ length: Math.max(6, currentShot + 1) }, (_, i) => i + 1).map((num) => {
              const isActive = num === currentShot;
              const isCompleted = num < currentShot;
              const isFuture = num > currentShot;
              const isRecorded = num <= recordedShotCount;
              const isSelected = selectedShotNumber === num;

              return (
                <button
                  key={num}
                  type="button"
                  disabled={!isRecorded}
                  onClick={() => isRecorded && onSelectShot(num)}
                  className={cn(
                    'flex h-10 min-w-[44px] items-center justify-center rounded-fw-md px-3 font-fw-sans text-sm font-medium tabular-nums transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                    isActive && 'bg-accent-500 text-text-on-accent shadow-flat',
                    isCompleted && 'bg-accent-50 text-accent-700 ring-1 ring-accent-200',
                    isFuture && 'bg-surface-sunken text-text-tertiary ring-1 ring-border-subtle',
                    isSelected && 'ring-2 ring-accent-500',
                    isRecorded ? 'cursor-pointer' : 'cursor-default',
                  )}
                  aria-label={isRecorded ? `View shot ${num}` : `Shot ${num} not recorded`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
