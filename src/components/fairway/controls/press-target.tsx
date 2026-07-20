'use client';

/**
 * ============================================================================
 * Fairway · PressTarget — the UNSTYLED pressable primitive
 * ----------------------------------------------------------------------------
 * For interactive surfaces that are structurally NOT buttons-with-a-label —
 * a whole bento cell, a matrix-board row, a filmstrip hole column, a spine
 * CTA pill — where `Button`'s variant styling/children contract would fight
 * the composition's own layout. PressTarget owns only the baseline semantics
 * every pressable must carry (the reason `helm/no-raw-button` exists):
 *
 *   · `type="button"` default (never submits a stray form)
 *   · a green focus-visible ring that survives cream + green grounds
 *   · `motion-reduce:transition-none` safety for consumers' transitions
 *   · disabled → `opacity-50` + pointer-events guard
 *
 * Everything else — layout, tint, radius — is the CALLER's className. This
 * file lives in `fairway/controls/` deliberately: the allowlisted primitive
 * family is where the one raw <button> per pattern is permitted to exist.
 * ========================================================================== */

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type PressTargetProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const PressTarget = forwardRef<HTMLButtonElement, PressTargetProps>(
  function PressTarget({ className, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
