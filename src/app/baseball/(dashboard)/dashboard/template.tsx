'use client';

/**
 * Coach dashboard route template — fires on every route segment change.
 *
 * Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md): "Tab switches are instant — no
 * cross-fade between bottom-tab roots; motion is reserved for forward/detail
 * pushes." Until this wave every navigation ran the SAME 280ms opacity
 * cross-fade, so a lateral tab swap (Command → Roster) dissolved the whole
 * viewport exactly like a forward push into a detail leaf. The classification
 * + timing now live in the shared `useRouteRevealMotion` hook
 * (src/lib/motion/route-motion.ts — see that file for the full decision table
 * and why it depends only on the CURRENT pathname); `isBaseballLateralDestination`
 * (src/lib/baseball/nav-registry.ts) is the baseball-specific classifier:
 * every BASEBALL_NAV_REGISTRY href/playerHref + Messages is lateral (instant);
 * a dynamic detail leaf (players/[id], dev-plans/[id], stats/games/[gameId])
 * is absent from that registry and reveals.
 *
 * Ported VERBATIM in spirit from the GolfHelm route-reveal
 * (src/app/golf/(dashboard)/dashboard/template.tsx) to keep the two products
 * consistent — same shared hook, same classifier shape, same recipe.
 *
 * Self-contained motion provider: unlike the golf shell (which mounts LazyMotion +
 * MotionConfig in FairwayDashboardShell), the BaseballDashboardShell does not mount
 * a motion provider, so this template wraps its own LazyMotion (tree-shaken
 * `domAnimation`) + MotionConfig. This keeps the fix inside the template's file
 * ownership and means no shell edit is required.
 *
 * Why opacity-only (no slide / no `will-change: transform`): a transform value — or
 * a persistent `will-change: transform` — establishes a CSS containing block, which
 * re-anchors every `position: fixed` descendant (peek panels, the mobile sidebar
 * overlay, any in-tree action bar) to THIS wrapper instead of the viewport. A pure
 * crossfade sidesteps that hazard entirely while staying premium on the glide curve.
 *
 * Reduced-motion: honored TWO ways — MotionConfig reducedMotion="user" reads the OS
 * preference platform-wide, and useRouteRevealMotion's own useReducedMotion() check
 * collapses EVERY navigation (lateral and push alike) to zero motion. No
 * baseball-specific in-app animation toggle exists yet, so the OS preference is
 * the source of truth.
 */

import { LazyMotion, MotionConfig, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { useRouteRevealMotion } from '@/lib/motion/route-motion';
import { isBaseballLateralDestination } from '@/lib/baseball/nav-registry';

export default function BaseballDashboardTemplate({ children }: { children: React.ReactNode }) {
  // No `strict` on LazyMotion: descendant pages (e.g. dev-plan) render the full
  // `motion.*` component, which LazyMotion-strict forbids. Non-strict lets them load
  // their own features while this template stays on the tree-shaken `m`.
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
