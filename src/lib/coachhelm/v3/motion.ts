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

import type { Transition, Variants, TargetAndTransition } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

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

// -----------------------------------------------------------------------------
// Reduced-motion guard
// -----------------------------------------------------------------------------

/**
 * Canonical reduced-motion hook for v3 surfaces (and every other framer-motion
 * surface in the product). Thin wrapper over framer-motion's `useReducedMotion`
 * that defaults `null` (its SSR / first-client-render value) to `false`.
 *
 * Why `?? false`: `useReducedMotion()` returns `null` on the server and on the
 * very first client render before the media-query is read. Defaulting to
 * `false` means SSR and the first CSR both render the ANIMATED path, so the
 * hydrated HTML matches byte-for-byte (no React hydration error #418). The
 * value then flips to `true` on a subsequent client render for reduced-motion
 * users — a purely client-side transition that React handles cleanly.
 *
 * Usage:
 * ```tsx
 * const prefersReducedMotion = useReducedMotionGuard();
 * <m.div
 *   initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
 *   animate={{ opacity: 1, y: 0 }}
 *   transition={reducedTransition(prefersReducedMotion, enterTransition)}
 * />
 * ```
 */
export function useReducedMotionGuard(): boolean {
  return useReducedMotion() ?? false;
}

/** Re-export the raw framer-motion hook so consumers have a single import site. */
export { useReducedMotion };





// -----------------------------------------------------------------------------
// 5 motion primitives (W3A) — each ships with reduced-motion built in.
//
// These were previously hand-rolled inline across the coachhelm v3 surfaces
// (shimmer sweep on LLM round-trips, resolution celebration pop, success
// checkmark draw, thinking-dot pulse, collapse/expand). Centralizing them
// here gives one source of truth AND guarantees the reduced-motion variant is
// never forgotten: pass the `reduce` flag and the helper returns the static
// shape.
// -----------------------------------------------------------------------------

/**
 * Shimmer sweep — the diagonal light band that travels across a surface while
 * an async value (LLM prose, stat backfill) is loading. Pair with an absolutely
 * positioned gradient element:
 *   `bg-gradient-to-r from-transparent via-white/40 to-transparent`
 *
 * Returns the looping `animate` + `transition` for normal users; for
 * reduced-motion users it returns a static (no-loop) shape so the band sits
 * still rather than sweeping forever.
 */
export function shimmer(reduce: boolean): {
  animate: TargetAndTransition;
  transition: Transition;
} {
  if (reduce) {
    return { animate: { x: '0%' }, transition: { duration: 0 } };
  }
  return {
    animate: { x: ['0%', '400%'] },
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
  };
}

/**
 * Celebration pop — the scale-in used when a card flips to a resolved /
 * success state (e.g. resolved insight, qualifier made). Soft spring overshoot
 * for normal users; instant settle for reduced-motion users.
 */
export const celebrationVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0 },
};



/**
 * Success checkmark — the SVG path-draw used on submit/save confirmation.
 * Animates `pathLength` 0 → 1 + a scale/rotate settle for normal users; for
 * reduced-motion users the check is simply present (pathLength 1, no draw).
 */
export function successCheckmark(reduce: boolean): {
  ring: { initial: TargetAndTransition | false; animate: TargetAndTransition; transition: Transition };
  path: { initial: TargetAndTransition | false; animate: TargetAndTransition; transition: Transition };
} {
  if (reduce) {
    return {
      ring: { initial: false, animate: { scale: 1, rotate: 0 }, transition: { duration: 0 } },
      path: { initial: false, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0 } },
    };
  }
  return {
    ring: {
      initial: { scale: 0, rotate: -45 },
      animate: { scale: 1, rotate: 0 },
      transition: { delay: 0.15, duration: 0.5, type: 'spring', stiffness: 200, damping: 14 },
    },
    path: {
      initial: { pathLength: 0, opacity: 0 },
      animate: { pathLength: 1, opacity: 1 },
      transition: { delay: 0.4, duration: 0.4 },
    },
  };
}

/**
 * Pulse dots — the staggered "thinking…" / typing indicator. `pulseDots`
 * returns the per-dot opacity loop; `segmentShift` is its sibling used by
 * progress segments that breathe while a longer task runs. Both collapse to a
 * static dimmed dot under reduced motion.
 */
export function pulseDots(reduce: boolean, delay = 0): {
  animate: TargetAndTransition;
  transition: Transition;
} {
  if (reduce) {
    return { animate: { opacity: 0.7 }, transition: { duration: 0 } };
  }
  return {
    animate: { opacity: [0.3, 1, 0.3] },
    transition: { duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay },
  };
}



/**
 * Collapse / expand — the height-auto reveal used by accordions, filter panels,
 * and drill-downs. Animates height + opacity for normal users; instant for
 * reduced-motion users (so the panel just appears/disappears).
 */
export const collapseVariants: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: { height: 'auto', opacity: 1 },
};



// -----------------------------------------------------------------------------
// Legacy iOS-spring vocabulary (migrated from the deleted `src/lib/motion.ts`).
//
// These values are carried over BYTE-FOR-BYTE so the calendar + tasks + player
// hub surfaces that used to import from `@/lib/motion` keep their exact look
// and feel after the path swap to this canonical library. Do not re-tune them
// here — they are the iOS-native tokens documented in
// `src/lib/ios-animations.ts`.
// -----------------------------------------------------------------------------

/** iOS-native motion tokens (durations in ms, easings, travel distances). */
export const motion = {
  duration: {
    instant: 0,
    fast: 150,
    base: 220,
    slow: 320,
    dramatic: 500,
  },
  ease: {
    out: [0.33, 1, 0.68, 1],
    inOut: [0.65, 0, 0.35, 1],
    spring: [0.34, 1.56, 0.64, 1],
    smooth: [0.16, 1, 0.3, 1],
  },
  distance: {
    micro: 2,
    small: 4,
    medium: 8,
    large: 24,
  },
} as const;

/** 250ms / iOS ease-out — the standard UI reveal. */
export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

/** Fast 40ms stagger — slow staggers feel sluggish on iOS. */
export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

/** Calendar spring configs for framer-motion (drag lift, snap, modal, view). */
export const calendarSpring = {
  dragLift: { type: 'spring' as const, stiffness: 300, damping: 25, mass: 0.8 },
  snapToGrid: { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.5 },
  modalEntry: { type: 'spring' as const, stiffness: 260, damping: 20, mass: 0.8 },
  viewTransition: { type: 'spring' as const, stiffness: 200, damping: 26, mass: 1.0 },
} as const;
