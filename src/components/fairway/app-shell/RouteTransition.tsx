'use client';

/**
 * ============================================================================
 * Fairway · RouteTransition (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The route-transition wrapper for the content region (DESIGN-SYSTEM §7.1).
 * Content settles in with a restrained route reveal: a small upward drift (≤4px)
 * + opacity, at --fw-dur-base (280ms) on the --fw-ease-glide curve. Page headers
 * own the larger visual emphasis, so route swaps stay responsive.
 *
 * Crossfade-on-key (no AnimatePresence `mode="wait"`) per §5.3 — that mode is the
 * verified flash bug. We render a single keyed `motion.div`; React swaps it on
 * route change and framer-motion runs the `initial`→`animate` reveal cleanly.
 *
 * Reduced motion (§7.3): collapses to opacity-only at --fw-dur-fast, no transform.
 * ========================================================================== */

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
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.18, ease: 'linear' as const },
      };
    }
    return {
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.28, ease: GLIDE },
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
      style={{ willChange: reduceMotion ? 'auto' : 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
});
