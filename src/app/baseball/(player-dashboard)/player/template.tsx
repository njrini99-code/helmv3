'use client';

/**
 * Player dashboard route template — fires on every route segment change under
 * /baseball/player/*.
 *
 * Provides the ONE cinematic transition when a player navigates between their
 * dashboard tabs. Previously these transitions were an abrupt content snap. This
 * mirrors the coach-side template and satisfies the V10 spec's shell requirement
 * "Route transitions with reduced-motion respect."
 * (docs/.../25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md line 33).
 *
 * Ported VERBATIM in spirit from the GolfHelm route-reveal
 * (src/app/golf/(dashboard)/dashboard/template.tsx) to keep the two products
 * consistent — same curve, same duration, same opacity-only recipe.
 *
 * Self-contained motion provider: the BaseballDashboardShell does not mount a motion
 * provider, so this template wraps its own LazyMotion (tree-shaken `domAnimation`) +
 * MotionConfig. No shell edit required.
 *
 * Recipe — matches the canonical Fairway RouteTransition primitive EXACTLY:
 *   - Opacity-ONLY crossfade 0 → 1 over --fw-dur-base (280ms)
 *   - --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1) (the iOS out-quint)
 *
 * Why opacity-only (no slide / no `will-change: transform`): a transform value
 * establishes a CSS containing block that would re-anchor `position: fixed`
 * descendants (peek panels, mobile sidebar overlay, in-tree action bars) to this
 * wrapper instead of the viewport. A pure crossfade sidesteps that hazard.
 *
 * Reduced-motion: honored TWO ways — MotionConfig reducedMotion="user" reads the OS
 * preference, and useReducedMotion() collapses this reveal to a faster linear fade.
 */

import { LazyMotion, MotionConfig, m, useReducedMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { usePathname } from 'next/navigation';

// --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1); --fw-dur-base = 280ms.
const GLIDE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.28;

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
  const prefersReducedMotion = useReducedMotion();
  const pathname = usePathname();
  return (
    <m.div
      key={pathname}
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        prefersReducedMotion
          ? { duration: 0.18, ease: 'linear' }
          : { duration: DURATION, ease: GLIDE }
      }
      className="min-h-full"
      // No `will-change: transform` — opacity-only never needs it, and asserting it
      // would create the containing block this recipe exists to avoid.
      style={{ willChange: 'auto' }}
    >
      {children}
    </m.div>
  );
}
