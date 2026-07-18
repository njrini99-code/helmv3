'use client';

/**
 * AnimatedPage — Shared page-level entrance reveal for the round-entry
 * surfaces (New Round / Continue Round — the hole-1 shot-tracking screen).
 *
 * -----------------------------------------------------------------------
 * ROOT CAUSE (audit W1 "shot-blank", 2026-07-18)
 * -----------------------------------------------------------------------
 * AnimatedPage/AnimatedItem used to render a framer-motion `m.div` (via
 * `<LazyMotion features={loadFeatures}>`) with `initial="hidden"` /
 * `animate="visible"` variants — `hidden` is `opacity: 0`. Framer-motion
 * computes that inline style on the SERVER too (that's what its SSR-safe
 * initial-style calculation is for), so the HTML shipped to the browser
 * already had `opacity: 0` baked in before a single byte of client JS ran.
 * `LazyMotion`'s `features` loader then code-splits the actual animation
 * engine into its own async chunk (`@/lib/motion/load-features`) — until
 * THAT chunk resolves, framer-motion has no visual element to drive the
 * hidden→visible transition, so the content sits frozen at `opacity: 0`
 * with nothing animating. On a slow or cold connection — exactly the
 * condition a player starting/continuing a round on a course is likely to
 * hit — that fetch can take several seconds, or stall outright, leaving the
 * hole-1 shot-tracking screen completely blank for however long it takes.
 * There was no guaranteed terminal state: visibility was hostage to a
 * network request for a JS chunk that had nothing to do with the page's
 * actual data.
 *
 * FIX: the reveal is now a pure CSS animation — `.animate-fade-in-up`
 * (globals.css), the same entrance utility already used elsewhere in
 * Fairway (e.g. MessageConversationRail's conversation rows). A CSS
 * `@keyframes` animation starts painting on the very first frame with zero
 * JS dependency, and `animation-fill-mode: forwards` guarantees it lands on
 * `opacity: 1` from its own wall-clock timeline — there is nothing left to
 * get stuck on. `prefers-reduced-motion` is honored twice over:
 * globals.css collapses `.animate-fade-in-up` to a 1ms duration, and the
 * `motion-reduce:animate-none` class below drops the animation outright —
 * both land on full opacity immediately, no JS required either way.
 *
 * Usage:
 * ```tsx
 * // Server component page
 * import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
 *
 * export default async function MyPage() {
 *   return (
 *     <AnimatedPage>
 *       <AnimatedItem>Content</AnimatedItem>
 *     </AnimatedPage>
 *   );
 * }
 * ```
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// ANIMATED PAGE — Layout wrapper. Carries no animation of its own so nested
// content never inherits a JS-gated initial state — AnimatedItem below is
// the sole source of the entrance, and it is pure CSS.
// ============================================================================

interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedPage({ children, className }: AnimatedPageProps) {
  return <div className={cn('min-h-full', className)}>{children}</div>;
}

// ============================================================================
// ANIMATED ITEM — CSS fade-slide entrance, no async engine in the critical
// path and a guaranteed terminal opacity:1 state.
// ============================================================================

interface AnimatedItemProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedItem({ children, className }: AnimatedItemProps) {
  return (
    <div className={cn('animate-fade-in-up motion-reduce:animate-none', className)}>
      {children}
    </div>
  );
}

// AnimatedList (a framer-motion `m.div` stagger container) was removed here —
// it had zero importers anywhere in the app and carried the exact same
// JS-chunk-gated `opacity: 0` root cause fixed above. Reintroduce it as a
// CSS-driven stagger (e.g. `animationDelay` per child, the pattern already
// used by MessageConversationRail) if a future page needs a nested list
// reveal — never bring back the framer-motion variants version.
