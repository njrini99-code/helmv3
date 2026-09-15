'use client';

/**
 * ============================================================================
 * Fairway · feedback · Progress — completion of a PROCESS
 * ----------------------------------------------------------------------------
 * "How far along is this thing that is happening" — an upload, a multi-step
 * wizard, an import, a sync. NOT a static measure against a target/band; that
 * is `Meter` (this same folder). If you're rendering "62% toward your goal"
 * against a fixed benchmark, reach for `Meter` instead — `role="progressbar"`
 * and `role="meter"` are semantically different to assistive tech and Progress
 * enforces the distinction by not accepting min/max/low/high/optimum.
 *
 * There is one page-local sibling this supersedes as the app migrates onto
 * Fairway: `fairway/pages/coachhelm/ProgressTrack.tsx` (goal/focus-area rails).
 * That component stays as-is for now (its call sites are out of scope for a
 * primitives pass) — new call sites should reach for THIS Progress instead of
 * hand-rolling or duplicating a third bar.
 *
 *   <Progress value={64} label="Uploading round data" />
 *   <Progress indeterminate label="Syncing" size="sm" />
 *
 * Track `bg-surface-sunken`, fill `bg-accent-650` (or a semantic `tone`).
 * Indeterminate: a shimmer sweep, reduced-motion aware (falls back to a
 * static 40%-filled bar so the process still reads as "in progress" without
 * motion).
 * ========================================================================== */

import { forwardRef, type HTMLAttributes } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { FeedbackTone } from './tone';

export type ProgressSize = 'sm' | 'md';
/** `accent` (default, brand green) or a semantic feedback tone. */
export type ProgressTone = 'accent' | FeedbackTone;

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label'> {
  /** 0–100. Ignored (and required to be omitted) when `indeterminate`. */
  value?: number;
  /** Unknown duration — renders a reduced-motion-aware shimmer sweep instead of a value. */
  indeterminate?: boolean;
  size?: ProgressSize;
  tone?: ProgressTone;
  /** Accessible label — REQUIRED, there is no visible caption by default. */
  label: string;
  className?: string;
  'data-slot'?: string;
}

const HEIGHT: Record<ProgressSize, string> = {
  sm: 'h-1.5',
  md: 'h-2',
};

const FILL: Record<ProgressTone, string> = {
  accent: 'bg-accent-650',
  info: 'bg-text-secondary',
  success: 'bg-fw-success',
  warning: 'bg-fw-warning',
  danger: 'bg-fw-danger',
};

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  {
    value,
    indeterminate = false,
    size = 'md',
    tone = 'accent',
    label,
    className,
    'data-slot': dataSlot = 'fw-progress',
    ...props
  },
  ref,
) {
  const reduced = useReducedMotion() ?? false;
  const clamped = indeterminate ? undefined : Math.max(0, Math.min(100, value ?? 0));

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped ?? 0)}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      data-slot={dataSlot}
      data-indeterminate={indeterminate ? '' : undefined}
      className={cn('relative w-full overflow-hidden rounded-full bg-surface-sunken', HEIGHT[size], className)}
      {...props}
    >
      {indeterminate ? (
        reduced ? (
          // No motion: a static partial fill reads "in progress" without a sweep.
          <div className={cn('absolute inset-y-0 left-0 w-2/5 rounded-full', FILL[tone])} aria-hidden="true" />
        ) : (
          <motion.div
            className={cn('absolute inset-y-0 w-2/5 rounded-full', FILL[tone])}
            initial={{ left: '-40%' }}
            animate={{ left: '100%' }}
            transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
            aria-hidden="true"
          />
        )
      ) : (
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', FILL[tone])}
          style={{ width: `${clamped}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});
