'use client';

/**
 * Player dashboard route template — fires on every route segment change under
 * /baseball/player/*.
 *
 * Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md): "Tab switches are instant — no
 * cross-fade between bottom-tab roots; motion is reserved for forward/detail
 * pushes." Until this wave every navigation ran the SAME 280ms opacity
 * cross-fade, so a lateral tab swap (Today → Schedule) dissolved the whole
 * viewport exactly like a forward push into a detail leaf. The classification
 * + timing now live in the shared `useRouteRevealMotion` hook
 * (src/lib/motion/route-motion.ts — see that file for the full decision table
 * and why it depends only on the CURRENT pathname); `isBaseballLateralDestination`
 * (src/lib/baseball/nav-registry.ts) is the baseball-specific classifier:
 * every BASEBALL_NAV_REGISTRY href/playerHref + Messages is lateral (instant);
 * a dynamic detail leaf (lift/[sessionId], messages/[id]) is absent from that
 * registry and reveals.
 *
 * Ported VERBATIM in spirit from the GolfHelm route-reveal
 * (src/app/golf/(dashboard)/dashboard/template.tsx) to keep the two products
 * consistent — same shared hook, same classifier shape, same recipe.
 *
 * Self-contained motion provider: the BaseballDashboardShell does not mount a motion
 * provider, so this template wraps its own LazyMotion (tree-shaken `domAnimation`) +
 * MotionConfig. No shell edit required.
 *
 * Why opacity-only (no slide / no `will-change: transform`): a transform value
 * establishes a CSS containing block that would re-anchor `position: fixed`
 * descendants (peek panels, mobile sidebar overlay, in-tree action bars) to this
 * wrapper instead of the viewport. A pure crossfade sidesteps that hazard.
 *
 * Reduced-motion: honored TWO ways — MotionConfig reducedMotion="user" reads the OS
 * preference, and useRouteRevealMotion's own useReducedMotion() check collapses
 * EVERY navigation (lateral and push alike) to zero motion.
 */

import { LazyMotion, MotionConfig, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { useRouteRevealMotion } from '@/lib/motion/route-motion';
import { isBaseballLateralDestination } from '@/lib/baseball/nav-registry';

export default function BaseballPlayerDashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  // No `strict` on LazyMotion: descendant pages may render the full `motion.*`
  // component, which LazyMotion-strict forbids. Non-strict lets them load their own
  // features while this template stays on the tree-shaken `m`.
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">
        <RouteReveal>{children}</RouteReveal>
      </MotionConfig>
    </LazyMotion>
  );
}

function RouteReveal({ children }: { children: React.ReactNode }) {
  const reveal = useRouteRevealMotion(isBaseballLateralDestination);
  return (
    <m.div
      key={reveal.routeKey}
      initial={reveal.initial}
      animate={reveal.animate}
      transition={reveal.transition}
      className="min-h-full"
      // No `will-change: transform` — opacity-only never needs it, and asserting it
      // would create the containing block this recipe exists to avoid.
      style={{ willChange: 'auto' }}
    >
      {children}
    </m.div>
  );
}
