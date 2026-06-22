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
import { SelectablePill } from '@/components/fairway/controls/selectable-pill';

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
      className="sticky z-40 -mx-4 -mt-4 overflow-x-hidden border-b border-border-subtle bg-canvas px-4 py-4 shadow-flat sm:-mx-6 sm:px-6"
      style={{ top: 'var(--scorecard-height, 105px)' }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
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
                // P404 — the shared selectable-pill primitive (active/completed/
                // future/selected vocabulary) replaces the hand-rolled <button>
                // + class soup; same shape, same focus/disabled/motion contract.
                <SelectablePill
                  key={num}
                  active={isActive}
                  completed={isCompleted}
                  future={isFuture}
                  selected={isSelected}
                  disabled={!isRecorded}
                  onClick={() => isRecorded && onSelectShot(num)}
                  className={isRecorded ? 'cursor-pointer' : 'cursor-default'}
                  aria-label={isRecorded ? `View shot ${num}` : `Shot ${num} not recorded`}
                >
                  {num}
                </SelectablePill>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
