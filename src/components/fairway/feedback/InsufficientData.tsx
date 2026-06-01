'use client';

/**
 * ============================================================================
 * Fairway · feedback · InsufficientData (DESIGN-SYSTEM.md §0 #8, §5.4, §7.4)
 * ----------------------------------------------------------------------------
 * The HONEST "not enough data yet" state — the system's hard rule is that a
 * surface with no meaningful data says so, and NEVER renders authoritative-
 * looking zeros or placeholder shells as content (§0 #8). This is the canonical
 * replacement for fake `0%` effectiveness scores, empty SG rows, and "100% of 2"
 * confidence traps across stats / CoachHelm (§5.2 scrambling, §5.4 data reality:
 * 29/50 players have zero rounds — this state is the NORM, not an edge case).
 *
 * It differs from <EmptyState /> in intent: EmptyState = "nothing exists, go
 * create it"; InsufficientData = "data exists but there isn't ENOUGH of it yet
 * to compute a trustworthy number." So it surfaces the GAP explicitly — current
 * vs required count, with an optional honest progress meter — instead of a CTA.
 *
 * Tone is calm and warm (not an error): a quiet dashed-bordered inset on the
 * matte surface, an hourglass/gauge icon, the plain-language requirement, and an
 * accessible progress bar (`role="progressbar"` with value/min/max). It is sized
 * to drop directly into a ChartCard / MetricCard body where a chart would go.
 *
 * A11y: `role="status"` + polite live region; the progress meter carries
 * `aria-valuenow/min/max` + a text label so the gap is announced, not implied
 * by color. Honors `prefers-reduced-motion` for the reveal + the meter fill.
 * ========================================================================== */

import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Hourglass, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { revealVariants } from './motion';

export interface InsufficientDataProps {
  /** Headline — defaults to a calm, honest standard line. */
  title?: React.ReactNode;
  /**
   * Plain-language explanation of what's needed. If omitted and `current` /
   * `required` are provided, a sensible default sentence is generated.
   */
  description?: React.ReactNode;
  /** The metric/units being counted, e.g. "rounds", "shots", "attempts". */
  unit?: string;
  /** How many data points exist so far. */
  current?: number;
  /** How many are needed before the metric is trustworthy. */
  required?: number;
  /** Override the default hourglass icon. Pass `null` to hide. */
  icon?: LucideIcon | null;
  /** Render compact (inline in a small tile) vs roomy (chart body). */
  compact?: boolean;
  className?: string;
}

export const InsufficientData = forwardRef<HTMLDivElement, InsufficientDataProps>(
  function InsufficientData(
    {
      title = 'Not enough data yet',
      description,
      unit = 'data points',
      current,
      required,
      icon,
      compact = false,
      className,
    },
    ref,
  ) {
    const reduced = useReducedMotion() ?? false;
    const Icon = icon === null ? null : (icon ?? Hourglass);

    const hasCounts =
      typeof current === 'number' && typeof required === 'number' && required > 0;
    const clampedCurrent = hasCounts ? Math.max(0, Math.min(current, required)) : 0;
    const remaining = hasCounts ? Math.max(0, required - clampedCurrent) : 0;
    const pct = hasCounts ? Math.round((clampedCurrent / required) * 100) : 0;

    const resolvedDescription =
      description ??
      (hasCounts
        ? remaining > 0
          ? `${remaining} more ${unit} needed before this is meaningful.`
          : `Crunching the numbers — your ${unit} are in.`
        : `Log a few more ${unit} and this will fill in.`);

    return (
      <motion.div
        ref={ref}
        role="status"
        aria-live="polite"
        variants={revealVariants(reduced)}
        initial="hidden"
        animate="visible"
        className={cn(
          'flex flex-col items-center justify-center text-center font-fw-sans',
          'rounded-fw-md border border-dashed border-border-strong bg-surface-sunken',
          compact ? 'gap-2 px-5 py-6' : 'gap-3 px-8 py-12',
          className,
        )}
      >
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              'grid place-items-center rounded-full bg-surface text-text-tertiary',
              compact ? 'h-10 w-10' : 'h-12 w-12',
            )}
          >
            <Icon className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} strokeWidth={1.75} />
          </span>
        )}

        <div className={cn('max-w-xs', compact ? 'space-y-0.5' : 'space-y-1')}>
          <p
            className={cn(
              'font-medium text-text-primary',
              compact ? 'text-body leading-5' : 'text-body-lg leading-6',
            )}
          >
            {title}
          </p>
          <p className="text-body-sm leading-5 text-text-secondary">{resolvedDescription}</p>
        </div>

        {hasCounts && (
          <div className={cn('w-full', compact ? 'max-w-[180px]' : 'max-w-[240px]')}>
            <div
              role="progressbar"
              aria-valuenow={clampedCurrent}
              aria-valuemin={0}
              aria-valuemax={required}
              aria-label={`${clampedCurrent} of ${required} ${unit}`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
            >
              <motion.div
                className="h-full rounded-full bg-accent-400"
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.52, ease: [0.16, 1, 0.3, 1] }
                }
              />
            </div>
            <p className="mt-2 font-fw-mono text-caption font-normal tabular-nums text-text-tertiary">
              {clampedCurrent} / {required} {unit}
            </p>
          </div>
        )}
      </motion.div>
    );
  },
);
