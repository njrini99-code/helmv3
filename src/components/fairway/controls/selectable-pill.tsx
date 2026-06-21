'use client';

/**
 * ============================================================================
 * Fairway · SelectablePill (P404)
 * ----------------------------------------------------------------------------
 * The ONE shared selectable-cell/pill primitive for the recurring "stepper /
 * progress chip" vocabulary that several features had hand-rolled with raw
 * <button>s and a copy-pasted active/completed/future/selected class soup (shot
 * pills, and the same active/completed pattern echoed elsewhere). Consolidating
 * it here removes the subtle per-feature drift in pill height / padding / ring
 * and gives every callsite the same focus ring, disabled contract, and motion.
 *
 * STATE VOCABULARY (mutually layered, not exclusive):
 *   • active     — the current step (solid accent fill).
 *   • completed  — a finished step behind the cursor (accent tint + ring).
 *   • future     — a step not yet reached (sunken well, dim).
 *   • selected   — the user is *viewing* this pill (accent focus ring overlay);
 *                  layers on top of any of the above.
 * When no state flag is set the pill rests as a neutral matte surface cell.
 *
 * A real <button> (lives in the allowlisted `controls/` dir) so it carries the
 * shared `fwFocusRing` + `fwDisabled` + `fwTransition` contracts. Square-ish
 * `rounded-fw-md` cell by default (the stepper shape); pass `shape="round"` for
 * a fully-pill chip. Min target ≥44px wide / 40px tall.
 * ========================================================================== */

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { fwDisabled, fwFocusRing, fwTransition } from './_internal';

export interface SelectablePillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  /** The current step — solid accent fill. */
  active?: boolean;
  /** A finished step — accent tint + ring. */
  completed?: boolean;
  /** A not-yet-reached step — sunken, dim. */
  future?: boolean;
  /** The user is currently viewing this pill — accent ring overlay. */
  selected?: boolean;
  /** `cell` (default, rounded-fw-md stepper) or `round` (full pill). */
  shape?: 'cell' | 'round';
  children: ReactNode;
}

const shapeStyles: Record<'cell' | 'round', string> = {
  cell: 'rounded-fw-md',
  round: 'rounded-full',
};

export const SelectablePill = forwardRef<HTMLButtonElement, SelectablePillProps>(
  function SelectablePill(
    { className, active, completed, future, selected, shape = 'cell', disabled, type, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        data-slot="fw-selectable-pill"
        data-active={active || undefined}
        data-completed={completed || undefined}
        data-future={future || undefined}
        data-selected={selected || undefined}
        aria-pressed={selected}
        disabled={disabled}
        className={cn(
          'flex h-10 min-w-[44px] items-center justify-center px-3 font-fw-sans text-sm font-medium tabular-nums',
          shapeStyles[shape],
          fwTransition,
          fwFocusRing,
          fwDisabled,
          // Resting (no state) — neutral matte cell.
          !active && !completed && !future && 'bg-surface text-text-secondary ring-1 ring-border-subtle',
          active && 'bg-accent-500 text-text-on-accent shadow-flat',
          completed && 'bg-accent-50 text-accent-700 ring-1 ring-accent-200',
          future && 'bg-surface-sunken text-text-tertiary ring-1 ring-border-subtle',
          // selected layers a stronger accent ring on top of whatever state.
          selected && 'ring-2 ring-accent-500',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
