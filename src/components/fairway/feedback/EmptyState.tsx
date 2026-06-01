'use client';

/**
 * ============================================================================
 * Fairway · feedback · EmptyState (DESIGN-SYSTEM.md §6 "EmptyState", §0 #8)
 * ----------------------------------------------------------------------------
 * The honest "nothing here yet" surface — explains WHAT belongs in the empty
 * region and offers ONE clear primary CTA to fill it (plus an optional quiet
 * secondary action). Replaces the 70 bespoke empty states (§6).
 *
 * Anatomy (§6): centered soft-tinted icon chip · Fraunces title (h3-ish) · one
 * line of body guidance · single primary CTA · optional secondary link. Calm,
 * airy, low-density (§A): generous vertical padding, one idea per region.
 *
 * Variants:
 *   `default`  — a true empty collection ("No rounds yet — log your first").
 *   `search`   — a query returned nothing ("No matches for …").
 *   `subtle`   — inline/compact placeholder for small regions (less padding).
 *
 * For the stats/CoachHelm "not enough data to be meaningful YET" case, use the
 * sibling <InsufficientData /> — it is deliberately separate so authoritative
 * fake zeros are never rendered as real metrics (§0 #8, §5.4).
 *
 * The primary action renders as a button by default, but `asChild`-style slots
 * are avoided here to keep the primitive dependency-free: pass any node to
 * `action` (e.g. your own <Button> or <Link>) and it sits in the CTA slot.
 * ========================================================================== */

import { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Inbox, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { revealVariants } from './motion';

export type EmptyStateVariant = 'default' | 'search' | 'subtle';

export interface EmptyStateProps {
  /** Layout / default-icon variant. */
  variant?: EmptyStateVariant;
  /** Lucide icon for the chip. Defaults per variant; pass `null` to hide. */
  icon?: LucideIcon | null;
  /** The headline — "No rounds yet", "No matches found". */
  title: React.ReactNode;
  /** One line explaining what belongs here / how to proceed. */
  description?: React.ReactNode;
  /** Primary CTA node (your <Button>/<Link>). Sits in the single CTA slot. */
  action?: React.ReactNode;
  /** Optional quiet secondary action (link voice) under the primary CTA. */
  secondaryAction?: React.ReactNode;
  className?: string;
}

const DEFAULT_ICON: Record<EmptyStateVariant, LucideIcon> = {
  default: Inbox,
  search: SearchX,
  subtle: Inbox,
};

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    variant = 'default',
    icon,
    title,
    description,
    action,
    secondaryAction,
    className,
  },
  ref,
) {
  const reduced = useReducedMotion() ?? false;
  const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[variant]);
  const isSubtle = variant === 'subtle';

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
        isSubtle ? 'gap-3 px-6 py-10' : 'gap-4 px-8 py-16',
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className={cn(
            'grid place-items-center rounded-full bg-surface-sunken text-text-tertiary',
            isSubtle ? 'h-12 w-12' : 'h-16 w-16',
          )}
        >
          <Icon className={cn(isSubtle ? 'h-5 w-5' : 'h-7 w-7')} strokeWidth={1.75} />
        </span>
      )}

      <div className={cn('max-w-sm', isSubtle ? 'space-y-1' : 'space-y-2')}>
        <h3
          className={cn(
            'font-fw-display font-medium text-text-primary',
            isSubtle ? 'text-body-lg leading-6' : 'text-h2 font-medium leading-7 tracking-[-0.01em]',
          )}
        >
          {title}
        </h3>
        {description && (
          <p className="text-body leading-6 text-text-secondary">{description}</p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className={cn('flex flex-col items-center gap-3', isSubtle ? 'mt-1' : 'mt-2')}>
          {action}
          {secondaryAction}
        </div>
      )}
    </motion.div>
  );
});
