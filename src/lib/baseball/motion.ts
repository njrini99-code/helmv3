/**
 * BaseballHelm hover/tap micro-interaction helpers.
 *
 * Single source of truth for the `whileHover` / `whileTap` keyframes used by
 * baseball interactive surfaces (position planner, peek panel, command-center
 * pills, etc.). Every helper takes the `reduce` flag (from
 * framer-motion's `useReducedMotion`) and returns `undefined` when reduced
 * motion is on — so the gesture animation is *skipped entirely* rather than
 * fired with a 0-duration transition.
 *
 * Why `undefined` (not a 0-duration target): framer-motion treats a `whileHover`
 * target of `undefined` as "no hover animation" — the element never scales or
 * lifts. A 0-duration target would still snap to the scaled/translated state,
 * which a reduced-motion user explicitly does NOT want. This mirrors the
 * already-correct pattern in PeekPanel.tsx / UrgencyPicker.tsx:
 *   `whileHover={prefersReducedMotion ? undefined : { scale: ... }}`
 *
 * This file also exports the canonical `TAB_PANEL_MOTION` variant object used by
 * CommandCenterClient, PlayerProfileClient, and any future tabbed surface. Keeping
 * the keyframes here means every tab transition is consistent and a single edit
 * adjusts all of them.
 *
 * Distinct from the entrance/transition grammar in `@/lib/coachhelm/v3/motion`
 * (which is golf/coachhelm-scoped). This file is intentionally tiny and
 * baseball-local so the planner cluster matches the command-center surfaces
 * without crossing product boundaries.
 *
 * Usage (hover/tap):
 * ```tsx
 * import { useReducedMotion } from 'framer-motion';
 * import { hoverLift, tapPress } from '@/lib/baseball/motion';
 *
 * const reduce = useReducedMotion();
 * <motion.button whileHover={hoverLift(reduce)} whileTap={tapPress(reduce)} />
 * ```
 *
 * Usage (tab panel — pair with `<AnimatePresence mode="wait">`):
 * ```tsx
 * import { useReducedMotion } from 'framer-motion';
 * import { tabPanelMotion } from '@/lib/baseball/motion';
 *
 * const reduce = useReducedMotion();
 * <AnimatePresence mode="wait">
 *   {activeTab === 'foo' && (
 *     <motion.div key="foo" {...tabPanelMotion(reduce)}>...</motion.div>
 *   )}
 * </AnimatePresence>
 * ```
 */

import type { TargetAndTransition } from 'framer-motion';

/** Snappier curve for taps + hovers — settles fast, no overshoot. */
const EASE_TAP = [0.16, 1, 0.3, 1] as const;

export interface HoverLiftOptions {
  /** Scale multiplier on hover. Default 1.03 — a restrained, premium lift. */
  scale?: number;
  /** Vertical translate (px) on hover. Negative = rise. Default -2. */
  y?: number;
}

/**
 * Hover lift — a restrained scale + rise for interactive pills/markers/cards.
 * Returns `undefined` under reduced motion (no hover animation at all).
 *
 * The defaults (scale 1.03, y -2) are the calibrated baseball-pill values; pass
 * options to match a specific surface (e.g. the empty-position marker uses a
 * slightly larger pop).
 */
export function hoverLift(
  reduce: boolean | null | undefined,
  options: HoverLiftOptions = {},
): TargetAndTransition | undefined {
  if (reduce) return undefined;
  const { scale = 1.03, y = -2 } = options;
  return {
    scale,
    y,
    transition: { duration: 0.2, ease: EASE_TAP },
  };
}

/**
 * Tap press — a quick scale-down on press for tactile feedback.
 * Returns `undefined` under reduced motion (no tap animation at all).
 */
export function tapPress(
  reduce: boolean | null | undefined,
  scale = 0.97,
): TargetAndTransition | undefined {
  if (reduce) return undefined;
  return { scale };
}

/**
 * Decorative hover scale for non-interactive ornaments (e.g. legend dots) that
 * grow slightly on hover but have no tap state. Returns `undefined` under
 * reduced motion.
 */
export function hoverScale(
  reduce: boolean | null | undefined,
  scale = 1.2,
): TargetAndTransition | undefined {
  if (reduce) return undefined;
  return { scale };
}

/**
 * Canonical tab-panel entrance/exit props for `<motion.div>` wrapped in
 * `<AnimatePresence mode="wait">`. Under reduced motion the `initial` prop is
 * `false` (framer-motion skips the entrance entirely); exit is always `opacity: 0`
 * so the outgoing panel disappears cleanly without the slide.
 *
 * Calibrated values (y: 6, duration: 0.18) match the existing CommandCenter +
 * PlayerProfile tab surfaces. Use this helper so every tabbed surface in
 * BaseballHelm is consistent and a single edit adjusts all of them.
 */
export function tabPanelMotion(reduce: boolean | null | undefined): {
  initial: false | { opacity: number; y: number };
  animate: { opacity: number; y: number };
  exit: { opacity: number };
  transition: { duration: number };
} {
  return {
    initial: reduce ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.18 },
  };
}
