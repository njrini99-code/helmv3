'use client';

/**
 * HoverReveal — row/card hover-reveal wrapper, with a touch fallback.
 *
 * Wraps content plus a `reveal` slot (typically trailing actions — "view →",
 * a `CommitSeal` shortcut, an edit affordance) that fades in on hover/focus.
 * The primary content ALWAYS renders; only the reveal slot's visibility is
 * gated.
 *
 * TOUCH FALLBACK — the reason this exists as a primitive rather than a bare
 * `group-hover:opacity-100` inline everywhere: a `:hover`-only reveal never
 * fires on a touch device, so the slot would sit at `opacity-0` forever —
 * invisible but still occupying (or worse, still tappable in) its layout
 * box. `[@media(pointer:coarse)]:opacity-100` forces it always-visible on
 * coarse pointers (touch), and `group-focus-within` covers keyboard users
 * tabbing through the reveal slot's own controls. Never invisible-but-tappable.
 *
 * `position="inline"` (default) reserves the slot's layout space so nothing
 * shifts when it fades in — the safe default for a row's trailing actions.
 * `position="overlay"` absolutely-positions the slot (e.g. an image hover
 * caption) — the caller is responsible for `relative` sizing on `children`.
 *
 * CSS-only opacity transition (no framer-motion) — this is chrome visibility,
 * not a spec motion principle, so it stays off the animation budget.
 *
 * ```tsx
 * <HoverReveal reveal={<ChevronRight className="text-grade-plus" size={16} />}>
 *   <PlayerRowPlate {...row} />
 * </HoverReveal>
 * ```
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface HoverRevealProps {
  children: ReactNode;
  /** The content that reveals on hover/focus — always visible on touch. */
  reveal: ReactNode;
  /** `'inline'` (default, reserves layout space) or `'overlay'` (absolute). */
  position?: 'inline' | 'overlay';
  className?: string;
  revealClassName?: string;
}

export function HoverReveal({
  children,
  reveal,
  position = 'inline',
  className,
  revealClassName,
}: HoverRevealProps) {
  return (
    <div className={cn('group/reveal relative', className)}>
      {children}
      <div
        aria-hidden={false}
        className={cn(
          position === 'overlay' && 'absolute inset-0',
          'opacity-0 transition-opacity duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)]', // EASE_PRESS
          'group-hover/reveal:opacity-100 group-focus-within/reveal:opacity-100',
          '[@media(pointer:coarse)]:opacity-100',
          revealClassName,
        )}
      >
        {reveal}
      </div>
    </div>
  );
}
