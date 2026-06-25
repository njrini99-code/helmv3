'use client';

/**
 * Coach dashboard route template — fires on every route segment change.
 *
 * Provides the ONE cinematic transition when a coach navigates between dashboard
 * tabs (Command → Roster → Stats Lab, etc.). Previously these transitions were an
 * abrupt content snap, which read as a generic SPA. This satisfies the V10 spec's
 * Desktop Coach Shell requirement: "Route transitions with reduced-motion respect."
 * (docs/.../25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md line 33).
 *
 * Ported VERBATIM in spirit from the GolfHelm route-reveal
 * (src/app/golf/(dashboard)/dashboard/template.tsx) to keep the two products
 * consistent — same curve, same duration, same opacity-only recipe.
 *
 * Self-contained motion provider: unlike the golf shell (which mounts LazyMotion +
 * MotionConfig in FairwayDashboardShell), the BaseballDashboardShell does not mount
 * a motion provider, so this template wraps its own LazyMotion (tree-shaken
 * `domAnimation`) + MotionConfig. This keeps the fix inside the template's file
 * ownership and means no shell edit is required.
 *
 * Recipe — matches the canonical Fairway RouteTransition primitive EXACTLY:
 *   - Opacity-ONLY crossfade 0 → 1 over --fw-dur-base (280ms)
 *   - --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1) (the iOS out-quint)
 *
 * Why opacity-only (no slide / no `will-change: transform`): a transform value — or
 * a persistent `will-change: transform` — establishes a CSS containing block, which
 * re-anchors every `position: fixed` descendant (peek panels, the mobile sidebar
 * overlay, any in-tree action bar) to THIS wrapper instead of the viewport. A pure
 * crossfade sidesteps that hazard entirely while staying premium on the glide curve.
 *
 * Reduced-motion: honored TWO ways — MotionConfig reducedMotion="user" reads the OS
 * preference platform-wide, and useReducedMotion() collapses this reveal to a faster
 * linear fade. No baseball-specific in-app animation toggle exists yet, so the OS
 * preference is the source of truth.
 */

import { LazyMotion, domAnimation, MotionConfig, m, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';

// --fw-ease-glide = cubic-bezier(0.16, 1, 0.3, 1); --fw-dur-base = 280ms.
const GLIDE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.28;

export default function BaseballDashboardTemplate({ children }: { children: React.ReactNode }) {
  // No `strict` on LazyMotion: descendant pages (e.g. dev-plan) render the full
  // `motion.*` component, which LazyMotion-strict forbids. Non-strict lets them load
  // their own features while this template stays on the tree-shaken `m`.
  return (
    <LazyMotion features={domAnimation}>
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
