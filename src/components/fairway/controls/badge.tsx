'use client';

/**
 * ============================================================================
 * Fairway · Badge / Chip
 * ----------------------------------------------------------------------------
 * Badge   — a compact label/count token (counts, tags, metadata). Non-interactive.
 * Chip    — a slightly larger, optionally removable token (e.g. an applied
 *           filter value); when `onRemove` is provided it renders an accessible
 *           dismiss button with its own hover/focus/active states.
 *
 * Tones reuse the shared status families. Variants: soft (tinted fill, default)
 * | outline (hairline only). Sizes sm | md.
 * ========================================================================== */

import { type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwFocusRing, fwTransition } from './_internal';
import type { FwStatusTone } from './_internal';

type BadgeVariant = 'soft' | 'outline';

const toneSoft: Record<FwStatusTone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  accent: 'bg-accent-50 text-accent-700',
  success: 'bg-fw-success-bg text-accent-700',
  warning: 'bg-fw-warning-bg text-fw-warning-ink',
  danger: 'bg-fw-danger-bg text-fw-danger-ink',
  info: 'bg-surface-sunken text-text-secondary',
};

const toneOutline: Record<FwStatusTone, string> = {
  neutral: 'border-border-subtle text-text-secondary',
  accent: 'border-accent-200 text-accent-700',
  success: 'border-accent-200 text-accent-700',
  warning: 'border-fw-warning-ring text-fw-warning-ink',
  danger: 'border-fw-danger/30 text-fw-danger-ink',
  info: 'border-border-subtle text-text-secondary',
};

const badgeSize: Record<'sm' | 'md', string> = {
  sm: 'h-5 px-2 text-[11px] gap-1',
  md: 'h-6 px-2.5 text-[12px] gap-1',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: FwStatusTone;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  /** Render numeric content with tabular figures (counts that may change). */
  numeric?: boolean;
  leadingIcon?: ReactNode;
  children: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone = 'neutral', variant = 'soft', size = 'md', numeric = false, leadingIcon, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      data-slot="fw-badge"
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full font-fw-sans font-medium align-middle whitespace-nowrap',
        variant === 'outline' ? cn('border', toneOutline[tone]) : toneSoft[tone],
        badgeSize[size],
        numeric && 'tabular-nums font-fw-mono',
        className,
      )}
      {...props}
    >
      {leadingIcon && <span className="flex-shrink-0 [&_svg]:h-3 [&_svg]:w-3">{leadingIcon}</span>}
      {children}
    </span>
  );
});

/* ────────────────────────────────────────────────────────────────────────── */

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onClick'> {
  tone?: FwStatusTone;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  leadingIcon?: ReactNode;
  /** When provided, renders a dismiss button; called on click/Enter/Space. */
  onRemove?: () => void;
  /** Accessible label for the remove button (defaults to "Remove"). */
  removeLabel?: string;
  children: ReactNode;
}

// P060: the dismiss button's HIT AREA must clear WCAG 2.2 §2.5.8 (>=24x24),
// but the visible glyph stays small so the chip reads as a compact token. We
// size the clickable <button> to 24px (sm) / 28px (md) and pull it in with a
// negative right margin so it consumes the chip's right padding instead of
// pushing the chip taller/wider. The X svg keeps its small h-3 / h-3.5 size.
const chipSize: Record<'sm' | 'md', { chip: string; remove: string }> = {
  sm: { chip: 'h-6 pl-2.5 pr-1 text-[12px] gap-1', remove: 'h-6 w-6 -mr-1 [&_svg]:h-3 [&_svg]:w-3' },
  md: { chip: 'h-7 pl-3 pr-1.5 text-[13px] gap-1.5', remove: 'h-7 w-7 -mr-1 [&_svg]:h-3.5 [&_svg]:w-3.5' },
};

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { className, tone = 'neutral', variant = 'soft', size = 'md', leadingIcon, onRemove, removeLabel = 'Remove', children, ...props },
  ref,
) {
  const removable = typeof onRemove === 'function';
  const s = chipSize[size];
  return (
    <span
      ref={ref}
      data-slot="fw-chip"
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full font-fw-sans font-medium align-middle whitespace-nowrap',
        variant === 'outline' ? cn('border', toneOutline[tone]) : toneSoft[tone],
        !removable && (size === 'sm' ? 'pr-2.5' : 'pr-3'),
        s.chip,
        className,
      )}
      {...props}
    >
      {leadingIcon && <span className="flex-shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{leadingIcon}</span>}
      <span className="truncate">{children}</span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className={cn(
            'ml-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-full',
            'text-current/70 hover:text-current hover:bg-warm-900/10 active:bg-warm-900/15',
            fwTransition,
            fwFocusRing,
            s.remove,
          )}
        >
          <X strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}
    </span>
  );
});
