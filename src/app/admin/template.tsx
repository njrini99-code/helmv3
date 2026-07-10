'use client';

/**
 * Bridge (/admin) route template — fires on every route segment change.
 *
 * NEW in M1 (2026-07-10). Bridge previously had NO route-reveal architecture
 * at all: navigating between tabs (Overview → Errors → Golf) was an abrupt
 * content cut. Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md): "Tab switches are
 * instant — no cross-fade between bottom-tab roots; motion is reserved for
 * forward/detail pushes." This template gives Bridge the SAME shared
 * mechanism golf and baseball already use: instant swaps between the primary
 * tabs (Overview, Errors, Golf, Baseball, ...), and a single fast opacity
 * reveal on a genuine forward push into a detail leaf (a single error group,
 * a single deploy, a single user).
 *
 * Classification + timing live in the shared `useRouteRevealMotion` hook
 * (src/lib/motion/route-motion.ts — see that file for the full decision table
 * and why it depends only on the CURRENT pathname, never a previous/next
 * comparison a template.tsx's per-navigation remount would make impossible
 * anyway); `isBridgeLateralDestination` (src/lib/bridge/nav-registry.ts) is
 * the Bridge-specific classifier, derived directly from ADMIN_NAV so it can
 * never drift from the tab bar it classifies.
 *
 * Motion provider: `AdminLayout` already mounts `AdminMotionProvider`
 * (src/app/admin/_motion-provider.tsx), which wraps the ENTIRE /admin subtree
 * in `<LazyMotion features={loadFeatures}>` (non-strict `domAnimation`) — so
 * this template uses `m` directly and does NOT mount a second LazyMotion
 * (that would be pure waste; the first one already code-splits the feature
 * bundle once for the whole route group).
 *
 * Why opacity-only (no slide / no `will-change: transform`): a transform value
 * — or a persistent `will-change: transform` — establishes a CSS containing
 * block, which re-anchors every `position: fixed` descendant (toasts, the
 * mobile bottom-nav sheet, any in-tree action bar) to THIS wrapper instead of
 * the viewport. A pure crossfade sidesteps that hazard entirely.
 */

import { m } from 'framer-motion';
import { useRouteRevealMotion } from '@/lib/motion/route-motion';
import { isBridgeLateralDestination } from '@/lib/bridge/nav-registry';

export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  const reveal = useRouteRevealMotion(isBridgeLateralDestination);
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
