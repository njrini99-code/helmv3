'use client';

/**
 * Coach-HOME route template — fires on every route segment change under
 * /baseball/coach/*.
 *
 * The (coach-dashboard)/coach group renders the four coach-home verticals —
 * College (/baseball/coach/college), High School (/high-school), JUCO (/juco)
 * and Showcase (/showcase) — all through the SAME BaseballDashboardShell mounted
 * in coach/layout.tsx. Before this template existed, the (dashboard) and
 * (player-dashboard) groups each had a template.tsx that crossfaded on nav, but
 * this group had none — so navigating INTO or BETWEEN the four coach homes was an
 * abrupt content snap while every other dashboard tab faded. That is exactly the
 * "transitions present but not everywhere" inconsistency the owner flagged. This
 * 1-file port closes it and satisfies the V10 shell requirement "Route transitions
 * with reduced-motion respect."
 * (docs/.../25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md line 33).
 *
 * Ported VERBATIM in spirit from the sibling templates
 * ((dashboard)/dashboard/template.tsx, (player-dashboard)/player/template.tsx),
 * which themselves track the GolfHelm route-reveal — same curve, same duration,
 * same opacity-only recipe — so all four BaseballHelm dashboard groups transition
 * identically. Do NOT diverge the recipe here; uniform motion across the groups is
 * the whole point of the fix.
 *
 * Self-contained motion provider: the BaseballDashboardShell does not mount a motion
 * provider, so this template wraps its own LazyMotion (tree-shaken `domAnimation`) +
 * MotionConfig. No shell edit required — the fix stays inside this group's file
 * ownership.
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
 * Keyed on pathname (NOT search params): switching a coach vertical's in-page mode
 * via query string (e.g. JUCO recruit↔team toggle, Showcase team selection) keeps
 * the same route segment, so it does NOT re-fire the reveal — only true cross-home
 * navigation crossfades, which is the intended behavior.
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

export default function BaseballCoachDashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  // No `strict` on LazyMotion: descendant pages may render the full `motion.*`
  // component, which LazyMotion-strict forbids. Non-strict lets them load their own
  // features while this template stays on the tree-shaken `m`.
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
