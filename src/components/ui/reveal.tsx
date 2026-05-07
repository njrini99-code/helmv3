'use client';

/**
 * Reveal — entrance animation wrapper.
 *
 * Wraps any child element so it fades in + slides up 8px on mount.
 * Modeled after the Apple/Rivian/NEO scroll choreography where every
 * section composes itself into place as the user walks down the page.
 *
 * Defaults are conservative — 380ms duration, cubic-bezier(0.16, 1, 0.3, 1).
 * Reduced-motion users get an instant render.
 *
 * Use sparingly:
 *   - YES: hero sections, insight cards, room-style page bands, stat rows
 *   - NO: every list item, table rows, modal contents (already animated)
 *
 * Implementation note (May 2026): switched from `whileInView` to plain
 * `animate` because the dashboard uses an inner scroll container
 * (`<main role="main">`), and IntersectionObserver against the document
 * viewport never fired for content below the visible main area —
 * resulting in entire pages stuck at opacity 0 if their hero band was
 * below the inner scroll. Animating on mount is more robust and the
 * cinematic feel is preserved by the staggerIndex cascade.
 */

import * as React from 'react';
import { m, useReducedMotion } from 'framer-motion';

type RevealProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration'
  | 'onDrag'
  | 'onDragEnd'
  | 'onDragStart'
  | 'onDragOver'
  | 'onDragEnter'
  | 'onDragLeave'
  | 'onDragExit'
  | 'onTransitionEnd'
> & {
  /** Stagger this Reveal behind sibling Reveals in the same row. Each step adds 80ms. */
  staggerIndex?: number;
  /** Pixels to slide up from. Default 8. Set 0 for fade-only. */
  slide?: number;
  /** Animation duration in seconds. Default 0.38. */
  duration?: number;
};

const PREMIUM_EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  staggerIndex = 0,
  slide = 8,
  duration = 0.38,
  className,
  children,
  ...props
}: RevealProps) {
  const reduce = useReducedMotion();

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: slide }}
      animate={reduce ? false : { opacity: 1, y: 0 }}
      transition={{
        duration,
        ease: PREMIUM_EASE,
        delay: Math.max(0, staggerIndex) * 0.08,
      }}
      className={className}
      {...props}
    >
      {children}
    </m.div>
  );
}
