'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · ProgressTrack — the ONE progress-bar rail
 * ----------------------------------------------------------------------------
 * The shared flat track + accent fill behind BOTH "how far along" bars on the
 * development surfaces:
 *   - FocusAreaCard's per-area ProgressMeter (current/target measurable)
 *   - FairwayGoalCard's goal-progress bar (baseline→target trajectory)
 *
 * Before this extraction the two were hand-rolled, visually-divergent tracks
 * (h-2 `bg-surface-sunken` + framer-motion fill vs h-1.5 `bg-warm-100` +
 * static fill, with different "met" fill shades). This is the single flat
 * track + fill recipe both now render through, so the plan surface's two
 * progress bars read as ONE system rather than two near-duplicates.
 *
 * Presentation ONLY — pct math, aria semantics, and the `role="progressbar"`
 * label text are owned entirely by the caller; this renders whatever `pct`
 * it's given (defensively clamped to 0–100).
 *
 * ADDITIVE — imported by FocusAreaCard.tsx + FairwayGoalCard.tsx only.
 * ========================================================================== */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Track + fill height. `sm` matches the goal card; `md` matches the focus-area meter. */
export type ProgressTrackSize = 'sm' | 'md';

/** Fill tone — `done` (success green) when the target/goal is met, `active` otherwise. */
export type ProgressTrackTone = 'active' | 'done';

const HEIGHT: Record<ProgressTrackSize, string> = {
  sm: 'h-1.5',
  md: 'h-2',
};

const FILL: Record<ProgressTrackTone, string> = {
  active: 'bg-accent-500',
  done: 'bg-fw-success',
};

export interface ProgressTrackProps {
  /** 0–100 reading. Clamped defensively; the caller owns the real math. */
  pct: number;
  /** Track/fill height. Default `md`. */
  size?: ProgressTrackSize;
  /** Fill color tone. Default `active`. */
  tone?: ProgressTrackTone;
  /**
   * Animate the fill's width in on mount (framer-motion). Off by default so a
   * static caller (e.g. a card re-rendering from fresh server data) doesn't
   * replay the sweep on every navigation.
   */
  animateIn?: boolean;
  /** Skip the width transition under `prefers-reduced-motion`. Only relevant when `animateIn`. */
  reduced?: boolean;
  /** Accessible label for the `role="progressbar"` (e.g. "Putts: 62% toward target"). */
  label: string;
  className?: string;
}

export function ProgressTrack({
  pct,
  size = 'md',
  tone = 'active',
  animateIn = false,
  reduced = false,
  label,
  className,
}: ProgressTrackProps) {
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-surface-sunken',
        HEIGHT[size],
        className,
      )}
    >
      {animateIn ? (
        <motion.div
          className={cn('h-full rounded-full', FILL[tone])}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden="true"
        />
      ) : (
        <div
          className={cn('absolute left-0 top-0 h-full rounded-full', FILL[tone])}
          style={{ width: `${clamped}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
