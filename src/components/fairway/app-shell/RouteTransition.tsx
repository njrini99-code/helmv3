'use client';

/** A brief, nonblanking route reveal. Keeping the initial content visible avoids
 * a second perceived load, and omitting transforms preserves fixed descendants.
 * Reduced motion renders the destination immediately. */

import { forwardRef, useMemo } from 'react';
import { motion, useReducedMotion, type Transition } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface RouteTransitionProps {
  /**
   * A value that changes on navigation (typically the pathname). When it
   * changes, the reveal re-runs. Omit to animate only on first mount.
   */
  routeKey?: string;
  children: React.ReactNode;
  className?: string;
}

// --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1); --fw-dur-base = 280ms.
const GLIDE: Transition['ease'] = [0.16, 1, 0.3, 1];

export const RouteTransition = forwardRef<HTMLDivElement, RouteTransitionProps>(function RouteTransition(
  { routeKey, children, className },
  ref,
) {
  const reduceMotion = useReducedMotion();

  const { initial, animate, transition } = useMemo(() => {
    if (reduceMotion) {
      return {
        initial: false,
        animate: { opacity: 1 },
        transition: { duration: 0, ease: 'linear' as const },
      };
    }
    return {
      // Opacity-ONLY reveal (no transform). A transform value / `will-change:
      // transform` establishes a CSS containing block, which would anchor every
      // page's position:fixed UI (modals, FABs, bottom action bars) to THIS
      // wrapper instead of the viewport. Fading sidesteps that entirely.
      initial: { opacity: 0.72 },
      animate: { opacity: 1 },
      transition: { duration: 0.18, ease: GLIDE },
    };
  }, [reduceMotion]);

  return (
    <motion.div
      ref={ref}
      key={routeKey}
      initial={initial}
      animate={animate}
      transition={transition}
      className={cn('min-h-full', className)}
      style={{ willChange: 'auto' }}
    >
      {children}
    </motion.div>
  );
});
