'use client';

/**
 * ============================================================================
 * DrivingDotStrip — 18-hole off-the-tee accuracy strip (round-review.v2.md R6-01)
 * ----------------------------------------------------------------------------
 * One dot per hole along its own miniature lane: centered and filled
 * accent-500 for a fairway hit, offset left/right and filled amber
 * (`bg-fw-warning`) for a miss (biased toward the logged direction — a
 * miss whose direction isn't left/right, i.e. short/long/unparsed, renders
 * centered rather than guessing a side, a named, documented simplification,
 * see the spec's Risks section), and a centered hollow warm-300 ring for a
 * hole with no fairway target at all (par-3, `fairwayHit === null`).
 *
 * Dots are decorative, not individually interactive (no `PressTarget`), so
 * unlike `Filmstrip`'s per-hole buttons they carry no tap-target floor —
 * the row compresses smoothly at narrow widths instead of ever needing
 * horizontal scroll.
 *
 * Entrance: dots scale in left→right on mount using the SAME compressed,
 * capped stagger `Filmstrip`/`TickerStrip` already use for wide rows of
 * many siblings, to stay inside the <600ms motion budget.
 * ========================================================================== */

import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { DrivingDotStripProps } from './types';

// See Filmstrip.tsx / TickerStrip.tsx for the same reasoning — a wide row of
// siblings needs a tighter step than the canonical 70ms one to keep the
// whole reveal fast.
const DOT_STAGGER_STEP = 0.02;
const DOT_STAGGER_CAP = 12;
function dotStagger(i: number): number {
  return Math.min(i, DOT_STAGGER_CAP) * DOT_STAGGER_STEP;
}

/** Horizontal lane position (0-100) for a hole's marker. */
function laneOffsetPct(fairwayHit: boolean | null, missSide: 'left' | 'right' | null): number {
  if (fairwayHit === false) {
    if (missSide === 'left') return 26;
    if (missSide === 'right') return 74;
  }
  return 50;
}

export function DrivingDotStrip({ holes }: DrivingDotStripProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  return (
    <LazyMotion features={loadFeatures}>
      <div
        role="group"
        aria-label="Fairway accuracy by hole"
        data-slot="driving-dot-strip"
        className="flex items-center gap-0.5"
      >
        {holes.map((hole, i) => {
          const noTarget = hole.fairwayHit === null;
          const missed = hole.fairwayHit === false;
          const left = laneOffsetPct(hole.fairwayHit, hole.missSide);
          const srLabel = noTarget
            ? `Hole ${hole.n}, no fairway target`
            : missed
              ? `Hole ${hole.n}, missed fairway${hole.missSide ? ` ${hole.missSide}` : ''}`
              : `Hole ${hole.n}, fairway hit`;
          return (
            <div key={hole.n} className="relative h-6 min-w-0 flex-1">
              <span className="sr-only">{srLabel}</span>
              <m.span
                aria-hidden="true"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: DURATION.short, delay: dotStagger(i), ease: EASE_CINEMATIC }}
                className={cn(
                  'absolute top-1/2 block h-2.5 w-2.5 rounded-full',
                  noTarget && 'bg-transparent ring-2 ring-warm-300',
                  missed && 'bg-fw-warning',
                  !noTarget && !missed && 'bg-accent-500',
                )}
                style={{ left: `${left}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
          );
        })}
      </div>
    </LazyMotion>
  );
}
