'use client';

/**
 * AnimatedPage — Shared page-level stagger animation wrappers
 *
 * Uses the premium fade-slide entrance animation from premium-components.tsx.
 * Wrap any page content to get the staggered entrance animation.
 *
 * Reduced motion is handled by MotionConfig in FairwayDashboardShell (the
 * successor to the deleted GolfDashboardShell), which sets
 * reducedMotion="always" when the user has disabled animations. We always
 * render the m.div (motion) path so that server and client produce identical
 * HTML during hydration — branching on useReducedMotion() produced different
 * inline styles (opacity/transform from initial="hidden" vs none) and caused
 * React hydration error #418 on pages like continue-round.
 *
 * Usage:
 * ```tsx
 * // Server component page
 * import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
 *
 * export default async function MyPage() {
 *   return (
 *     <AnimatedPage>
 *       <AnimatedItem>Header section</AnimatedItem>
 *       <AnimatedItem>Card 1</AnimatedItem>
 *       <AnimatedItem>Card 2</AnimatedItem>
 *     </AnimatedPage>
 *   );
 * }
 * ```
 */

import { ReactNode } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import {
  containerVariants,
  itemVariants,
} from '@/components/golf/dashboard/premium-components';

// ============================================================================
// ANIMATED PAGE — Stagger container for entire page
// ============================================================================

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedPage({ children, className }: AnimatedPageProps) {
  // Always render m.div so server and client produce the same HTML.
  // MotionConfig in the dashboard shell handles reduced-motion preference.
  return (
    <LazyMotion features={loadFeatures}>
      <m.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className={cn('min-h-full', className)}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

// ============================================================================
// ANIMATED ITEM — Child element with fade-slide entrance
// ============================================================================

interface AnimatedItemProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedItem({ children, className }: AnimatedItemProps) {
  return (
    <m.div variants={itemVariants} className={className}>
      {children}
    </m.div>
  );
}

// ============================================================================
// ANIMATED LIST — Nested stagger container for grids/lists inside a page
// ============================================================================

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function AnimatedList({ children, className, staggerDelay = 0.04 }: AnimatedListProps) {
  return (
    <m.div
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </m.div>
  );
}
