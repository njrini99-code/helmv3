'use client';

/**
 * ============================================================================
 * Fairway · StatusPill
 * ----------------------------------------------------------------------------
 * A small, non-interactive status indicator: a tinted pill with an optional
 * leading dot. Tones map to the Fairway status tokens (green-forward; amber +
 * red the only off-green hues — color is never the ONLY channel: the text label
 * always carries the meaning too).
 *
 * Tones: neutral | accent | success | warning | danger | info
 * Sizes: sm | md
 * Optional `dot` and `pulse` (a quiet "live" indicator; honors reduced-motion).
 * ========================================================================== */

import { type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { FwStatusTone } from './_internal';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: FwStatusTone;
  size?: 'sm' | 'md';
  /** Show a leading status dot. */
  dot?: boolean;
  /** Animate the dot (a quiet "live" ping). No-op under prefers-reduced-motion. */
  pulse?: boolean;
  children: ReactNode;
}

const toneStyles: Record<FwStatusTone, { pill: string; dot: string }> = {
  neutral: { pill: 'bg-surface-sunken text-text-secondary border-border-subtle', dot: 'bg-text-tertiary' },
  accent: { pill: 'bg-accent-50 text-accent-700 border-accent-200', dot: 'bg-accent-500' },
  success: { pill: 'bg-fw-success-bg text-accent-700 border-accent-200', dot: 'bg-fw-success' },
  warning: { pill: 'bg-fw-warning-bg text-warm-800 border-warm-300', dot: 'bg-fw-warning' },
  danger: { pill: 'bg-fw-danger-bg text-fw-danger border-fw-danger/25', dot: 'bg-fw-danger' },
  info: { pill: 'bg-surface-sunken text-text-primary border-border-strong', dot: 'bg-text-primary' },
};

const sizeStyles: Record<'sm' | 'md', string> = {
  sm: 'h-5 px-2 text-caption gap-1',
  md: 'h-6 px-2.5 text-caption gap-1.5',
};

export const StatusPill = forwardRef<HTMLSpanElement, StatusPillProps>(function StatusPill(
  { className, tone = 'neutral', size = 'md', dot = true, pulse = false, children, ...props },
  ref,
) {
  const t = toneStyles[tone];
  return (
    <span
      ref={ref}
      data-slot="fw-status-pill"
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full border font-fw-sans font-medium',
        'whitespace-nowrap align-middle',
        sizeStyles[size],
        t.pill,
        className,
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex flex-shrink-0 items-center justify-center" aria-hidden="true">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex h-2 w-2 rounded-full opacity-60',
                'motion-safe:animate-ping motion-reduce:hidden',
                t.dot,
              )}
            />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', t.dot)} />
        </span>
      )}
      {children}
    </span>
  );
});
