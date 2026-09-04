'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayShotPills (shot PROGRESS, not six buttons)
 * ----------------------------------------------------------------------------
 * These controls were six equally-weighted 44px pills, and they did not fit an
 * iPhone. `Math.max(6, currentShot + 1)` always rendered at least six cells,
 * each a full `SelectablePill`, plus 8px gaps, plus a fixed "Shot" label, plus
 * the row's own padding — past 390px before a seventh shot even existed. The
 * strip lived in an `overflow-x-hidden` wrapper around an `overflow-x-auto`
 * child, so the overflow became a silent horizontal scroll with no scrollbar
 * and no swipe hint: on a disaster hole the later shots were simply gone.
 *
 * The conceptual model was the bug. These are not six buttons of equal
 * importance — they are ONE reading of progress through a hole. A shot that
 * has not been played yet is not a disabled button the player might press; it
 * is a mark on a track. Spending a 44px touch target on it, six times over, on
 * the narrowest screen in the product, is what broke the geometry.
 *
 * So the weight now follows the meaning:
 *   • RECORDED shots  — a small accent dot, still tappable for review/edit.
 *     The marker is small; the button around it is 44px tall, so the hit area
 *     is honest even though the mark is not (the touch target is invisible,
 *     which is exactly what the spec allows).
 *   • CURRENT shot    — dominant. A real labelled chip, the one thing the eye
 *     should land on, sized as a comfortable target.
 *   • FUTURE shots    — a hairline ring. Not a control at all: no button, no
 *     tab stop, `aria-hidden`. It cannot be pressed because there is nothing
 *     there to press yet.
 *
 * Because only the current shot claims real width, a 12-shot hole costs less
 * horizontal room than the old six-pill strip did, and the count no longer
 * drives the layout off-screen. The track still scrolls for genuinely absurd
 * counts, but it now KEEPS THE CURRENT SHOT IN VIEW (`scrollIntoView` on
 * change) instead of stranding the player at shot 1 while they play shot 9 —
 * the scroll is a safety net rather than the mechanism.
 *
 * PRESERVED EXACTLY: the props contract, the recorded/active/completed/future
 * derivation, `onSelectShot` firing only for recorded shots, and the sticky
 * offset at `var(--scorecard-height, 105px)` that pins this beneath the
 * scorecard header.
 * ========================================================================== */

import { memo, useEffect, useRef } from 'react';
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
  const currentRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Keep the live shot on screen when the track is long enough to scroll.
  // `block: 'nearest'` so a track that already fits is never nudged, and the
  // page itself is never scrolled by this.
  useEffect(() => {
    const node = currentRef.current;
    const track = trackRef.current;
    if (!node || !track) return;
    if (track.scrollWidth <= track.clientWidth) return;
    node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentShot]);

  // Same derivation the pills used: at least six marks so a fresh hole reads as
  // a track rather than a single lonely dot, and always one mark past the
  // current shot so there is somewhere to go.
  const shots = Array.from({ length: Math.max(6, currentShot + 1) }, (_, i) => i + 1);

  return (
    <div
      className="sticky z-40 -mx-4 -mt-4 border-b border-border-subtle bg-canvas px-4 py-3 shadow-flat sm:-mx-6 sm:px-6"
      style={{ top: 'var(--scorecard-height, 105px)' }}
    >
      {/* The label carries the live count now, so the number is readable
          without counting dots — and it replaces the old fixed "SHOT" eyebrow
          that consumed width beside the strip on every hole. */}
      <p className="mb-1.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        Shot <span className="tabular-nums text-text-secondary">{currentShot}</span>
      </p>

      <div
        ref={trackRef}
        className="scrollbar-hide flex items-center gap-1.5 overflow-x-auto overscroll-x-contain touch-pan-x"
        style={{ WebkitOverflowScrolling: 'touch' }}
        role="group"
        aria-label="Shot progress"
      >
        {shots.map((num) => {
          const isActive = num === currentShot;
          const isRecorded = num <= recordedShotCount;
          const isSelected = selectedShotNumber === num;

          // FUTURE — a mark, not a control. No button, no tab stop, nothing to
          // press. This is the change that gives the row its width back.
          if (!isRecorded && !isActive) {
            return (
              <span
                key={num}
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full border border-border-subtle"
              />
            );
          }

          // CURRENT — the dominant element, and a comfortable target.
          if (isActive) {
            return (
              <div key={num} ref={currentRef} className="shrink-0">
                <button
                  type="button"
                  onClick={() => isRecorded && onSelectShot(num)}
                  disabled={!isRecorded}
                  aria-current="step"
                  aria-label={isRecorded ? `View shot ${num}` : `Shot ${num}, in progress`}
                  className={cn(
                    'flex h-11 min-w-[2.75rem] items-center justify-center rounded-fw-md px-3',
                    'font-fw-mono text-body-sm font-semibold tabular-nums',
                    'outline-none transition-colors duration-150',
                    'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                    'bg-accent-650 text-text-on-accent',
                    isRecorded ? 'cursor-pointer active:scale-95 motion-reduce:active:scale-100' : 'cursor-default',
                  )}
                >
                  {num}
                </button>
              </div>
            );
          }

          // RECORDED — a small mark with an honest 44px-tall hit area around it.
          return (
            <button
              key={num}
              type="button"
              onClick={() => onSelectShot(num)}
              aria-label={`View shot ${num}`}
              aria-pressed={isSelected}
              className={cn(
                'group flex h-11 w-7 shrink-0 cursor-pointer items-center justify-center rounded-fw-sm',
                'outline-none transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              )}
            >
              <span
                className={cn(
                  'rounded-full transition-all duration-150',
                  isSelected
                    ? 'h-3 w-3 bg-accent-650 ring-2 ring-accent-500/30'
                    : 'h-2 w-2 bg-accent-500 group-active:h-2.5 group-active:w-2.5',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
});
