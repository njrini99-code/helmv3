'use client';

/**
 * Dashboard route template — fires on every route segment change.
 *
 * Provides the ONE cinematic transition when the user navigates between
 * dashboard tabs (Dashboard → Roster → Calendar, etc.). Previously these
 * transitions were an abrupt cut.
 *
 * SINGLE SOURCE OF TRUTH (June 2026): this template is the only route-reveal in
 * the dashboard. The Fairway AppShell's own <RouteTransition> is disabled there
 * (FairwayDashboardShell passes `disableRouteTransition`) so the content is not
 * wrapped by TWO keyed motion divs that each fade on navigation — that compounded
 * the opacity (p·p at the midpoint) and read as a heavy, laggy fade. One fade now.
 *
 * Recipe — matches the canonical Fairway RouteTransition primitive EXACTLY:
 *   - Opacity-ONLY crossfade 0 → 1 over --fw-dur-base (280ms)
 *   - --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1) (the iOS out-quint used
 *     system-wide for DropdownMenu / Tooltip / Popover / Sheet / Tabs)
 *
 * Why opacity-only (no slide / no `will-change: transform`): a transform value —
 * or a persistent `will-change: transform` — establishes a CSS containing block,
 * which re-anchors every `position: fixed` descendant (the immersive round-submit
 * overlay, document-loading scrims, any in-tree FAB / bottom action bar) to THIS
 * wrapper instead of the viewport. The portaled overlays (Sheet / ModalShell /
 * Popover / toasts) escape it, but the in-tree fixed surfaces do not. A pure
 * crossfade sidesteps the hazard entirely while staying premium on the glide curve.
 *
 * This uses framer-motion's `m` (tree-shaken) via the LazyMotion already mounted
 * in the dashboard shell. Reduced-motion is honored by the parent MotionConfig
 * AND collapsed here to a faster linear fade.
 */

import { m, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';

// --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1); --fw-dur-base = 280ms.
const GLIDE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.28;

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const pathname = usePathname();
  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        prefersReducedMotion
          ? { duration: 0.18, ease: 'linear' }
          : { duration: DURATION, ease: GLIDE }
      }
      className="min-h-full"
      // No `will-change: transform` — opacity-only never needs it, and asserting
      // it would create the containing block this recipe exists to avoid.
      style={{ willChange: 'auto' }}
    >
      {children}
    </m.div>
  );
}
