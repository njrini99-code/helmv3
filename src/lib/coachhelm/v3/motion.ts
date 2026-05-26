/**
 * v3 motion language — the canonical animation grammar for the
 * coachhelm v3 surfaces.
 *
 * Every v3 surface imports from here. The goal is coherence: when a
 * coach hovers a card on the genome page, it should lift the EXACT
 * same amount, at the EXACT same speed, with the EXACT same easing
 * curve as a card on the qualifying workspace. That subconscious
 * consistency is what reads as "premium" — the same way every door
 * in an Apple Park building closes with the same soft latch.
 *
 * Distinct from `src/lib/motion.ts` (the older iOS-spring oriented
 * library used by calendar + non-coachhelm surfaces). Both can coexist;
 * v3 surfaces use this file, legacy surfaces use the other.
 *
 * Design constraints:
 *   - One easing curve for entrances + most transitions:
 *       cubic-bezier(0.16, 1, 0.3, 1) — Apple cinematic easeOutExpo
 *   - One snappier curve for taps + hovers:
 *       cubic-bezier(0.32, 0.72, 0, 1) — slightly faster settle
 *   - Four duration tiers (no in-between values allowed):
 *       MICRO (120ms)  — tap feedback, hover state change
 *       SHORT (280ms)  — small content swap, toggle, badge in/out
 *       MEDIUM (440ms) — section enter, panel transitions
 *       LONG (680ms)   — hero reveal, page enter
 *   - Stagger between sibling entrances: 70ms — calibrated to feel
 *     like a wave, not a stutter.
 *   - Hover lift: 2px translateY + soft shadow growth — never scale.
 *     (Scale on a card looks cheap; lift looks architectural.)
 */

import type { Transition, Variants } from 'framer-motion';

// -----------------------------------------------------------------------------
// Easing curves
// -----------------------------------------------------------------------------

/** Apple cinematic easeOutExpo. Default for entrances + content swaps. */
export const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;

/** Snappier curve for taps + hovers — settles faster, no overshoot. */
export const EASE_TAP = [0.32, 0.72, 0, 1] as const;

// -----------------------------------------------------------------------------
// Durations (seconds, for framer-motion)
// -----------------------------------------------------------------------------

export const DURATION = {
  micro: 0.12,
  short: 0.28,
  medium: 0.44,
  long: 0.68,
} as const;

// -----------------------------------------------------------------------------
// Stagger
// -----------------------------------------------------------------------------

export const STAGGER_STEP = 0.07; // 70ms

export function stagger(i: number): number {
  return Math.max(0, i) * STAGGER_STEP;
}

// -----------------------------------------------------------------------------
// Reusable variants
// -----------------------------------------------------------------------------

/** Section enter — soft rise + fade. For primary content blocks. */
export const enterVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export const enterTransition: Transition = {
  duration: DURATION.medium,
  ease: EASE_CINEMATIC,
};

/** Hero reveal — longer + more travel. For above-the-fold heroes only. */
export const heroVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const heroTransition: Transition = {
  duration: DURATION.long,
  ease: EASE_CINEMATIC,
};

/** Hover lift — 2px rise. Pair with whileHover on interactive cards. */
export const liftHover = {
  y: -2,
  transition: { duration: DURATION.short, ease: EASE_TAP },
};

/** Tap press — quick scale-down. Pair with whileTap. */
export const tapPress = {
  scale: 0.97,
  transition: { duration: DURATION.micro, ease: EASE_TAP },
};

/** Drawer slide-in from right (desktop) / fullscreen sweep (mobile). */
export const drawerVariants: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0 },
  exit: { x: '100%' },
};

export const drawerTransition: Transition = {
  duration: 0.42,
  ease: EASE_CINEMATIC,
};

/** Crossfade for content swaps (LLM prose, message rerender, route flips). */
export const crossfadeVariants: Variants = {
  hidden: { opacity: 0.5, y: 2 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export const crossfadeTransition: Transition = {
  duration: DURATION.short,
  ease: EASE_TAP,
};

/** Badge / pill entrance — quick scale-in. */
export const badgeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
};

export const badgeTransition: Transition = {
  duration: DURATION.short,
  ease: EASE_TAP,
};

/** Modal/drawer backdrop fade. */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const backdropTransition: Transition = {
  duration: DURATION.short,
  ease: EASE_TAP,
};
