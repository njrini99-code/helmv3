'use client';

/**
 * Dashboard route template — fires on every route segment change.
 *
 * Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md): "Tab switches are instant — no
 * cross-fade between bottom-tab roots; motion is reserved for forward/detail
 * pushes." Until this wave every navigation ran the SAME 280ms opacity
 * cross-fade, so a lateral tab swap (Dashboard → Roster) dissolved the whole
 * viewport exactly like a forward push into a detail leaf — the "not native,
 * laggy SPA" tell. The classification + timing now live in the shared
 * `useRouteRevealMotion` hook (src/lib/motion/route-motion.ts — see that file
 * for the full decision table and why it depends only on the CURRENT
 * pathname, never a previous/next comparison a template.tsx's per-navigation
 * remount would make impossible anyway); `isGolfLateralDestination`
 * (src/lib/golf/nav-registry.ts) is the golf-specific classifier: every rail
 * item, hub sub-tab, bottom-nav item, and CoachHelm cluster tab is lateral
 * (instant); a dynamic detail leaf (roster/[id], rounds/[id]/review,
 * players/[playerId]) is absent from that registry and reveals.
 *
 * SINGLE SOURCE OF TRUTH (June 2026, unchanged by this wave): this template
 * is the only route-reveal in the dashboard. The Fairway AppShell's own
 * <RouteTransition> is disabled there (FairwayDashboardShell passes
 * `disableRouteTransition`) so the content is not wrapped by TWO keyed motion
 * divs that each fade on navigation — that compounded the opacity (p·p at the
 * midpoint) and read as a heavy, laggy fade. One reveal now, and for lateral
 * swaps zero motion at all.
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
 * in the dashboard shell. Reduced-motion collapses every navigation — lateral
 * AND push — to zero motion (handled inside useRouteRevealMotion).
 */

import { m } from 'framer-motion';
import { useRouteRevealMotion } from '@/lib/motion/route-motion';
import { isGolfLateralDestination } from '@/lib/golf/nav-registry';

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const reveal = useRouteRevealMotion(isGolfLateralDestination);
  return (
    <m.div
      key={reveal.routeKey}
      initial={reveal.initial}
      animate={reveal.animate}
      transition={reveal.transition}
      className="min-h-full"
      // No `will-change: transform` — opacity-only never needs it, and asserting
      // it would create the containing block this recipe exists to avoid.
      style={{ willChange: 'auto' }}
    >
      {children}
    </m.div>
  );
}
