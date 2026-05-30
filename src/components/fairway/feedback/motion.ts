/**
 * ============================================================================
 * Fairway · feedback · motion variants (LOCAL helper — feedback group)
 * ----------------------------------------------------------------------------
 * Slow, cinematic framer-motion variants for the feedback primitives, built to
 * honor `prefers-reduced-motion` (DESIGN-SYSTEM.md §7.1/§7.3). The reveal is a
 * gentle ≤8px upward drift + opacity over `--fw-dur-base` (280ms) with the
 * `--fw-ease-soft` curve; reduced motion collapses to an opacity-only fade at
 * `--fw-dur-fast` (180ms) with NO transform.
 *
 * `useReducedMotion()` from framer-motion is read by the consuming component
 * (CI mandates the mock includes it — see project memory) and passed in, so this
 * stays a pure, testable helper with no React dependency.
 * ========================================================================== */

import type { Variants, Transition } from 'framer-motion';

/** Spec easing curves (mirrors the --fw-ease-* tokens). */
const EASE_SOFT = [0.22, 0.61, 0.36, 1] as const;

const REVEAL: Transition = { duration: 0.28, ease: EASE_SOFT };
const REVEAL_REDUCED: Transition = { duration: 0.18, ease: 'linear' };

/**
 * Reveal variants for an in-flow feedback surface (InlineNotice, EmptyState,
 * InsufficientData, OnboardingStep). Reduced motion → opacity-only, no drift.
 */
export function revealVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: REVEAL_REDUCED },
      exit: { opacity: 0, transition: REVEAL_REDUCED },
    };
  }
  return {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: REVEAL },
    exit: { opacity: 0, y: -4, transition: { duration: 0.18, ease: EASE_SOFT } },
  };
}

/**
 * Staggered child reveal for ordered content (e.g. OnboardingStep groups can
 * opt in). Returns a container + item pair sharing the same reduced-motion rule.
 */
export function staggerVariants(reduced: boolean): {
  container: Variants;
  item: Variants;
} {
  return {
    container: {
      hidden: {},
      visible: {
        transition: { staggerChildren: reduced ? 0 : 0.06 },
      },
    },
    item: revealVariants(reduced),
  };
}
