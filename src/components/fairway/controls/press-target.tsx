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
 *   · the shared surface press response + a selection haptic on commit
 *
 * The press response and haptic live HERE rather than in each caller because
 * this primitive is the entire vocabulary of "tap a whole surface" in the app —
 * bento cells, matrix rows, filmstrip holes, notification and signal rows. Left
 * bare, every one of those acknowledged a tap with nothing at all, which is the
 * single loudest "this is a web page" tell in the product.
 *
 * The haptic fires on `click`, not `pointerdown`: a finger landing on a signal
 * row and dragging to scroll must not tick. The browser only dispatches `click`
 * for a tap that stayed put, so scroll gestures are filtered for free. The
 * VISUAL press needs no such guard — CSS `:active` releases on scroll by itself,
 * so the surface still responds the instant the finger lands.
 *
 * Everything else — layout, tint, radius — is the CALLER's className. This
 * file lives in `fairway/controls/` deliberately: the allowlisted primitive
 * family is where the one raw <button> per pattern is permitted to exist.
 * ========================================================================== */

import { type ButtonHTMLAttributes, type MouseEvent, forwardRef, useCallback } from 'react';
import { fwPressSurface, fwTransition } from './_internal';
import { fwHaptic } from '@/lib/fairway/haptics';
import { cn } from '@/lib/utils';

export type PressTargetProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Opt out of the selection haptic — for a target that fires its own
   *  outcome haptic (a commit/reject sequence) and would otherwise double-tick. */
  haptic?: boolean;
};

export const PressTarget = forwardRef<HTMLButtonElement, PressTargetProps>(
  function PressTarget({ className, type = 'button', haptic = true, onClick, ...props }, ref) {
    const handleClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        if (haptic) fwHaptic('selection');
        onClick?.(event);
      },
      [haptic, onClick],
    );

    return (
      <button
        ref={ref}
        type={type}
        onClick={handleClick}
        className={cn(
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:pointer-events-none disabled:opacity-50',
          fwTransition,
          fwPressSurface,
          className,
        )}
        {...props}
      />
    );
  },
);
