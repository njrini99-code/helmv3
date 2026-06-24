'use client';

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from 'framer-motion';
import {
  DURATION,
  EASE_CINEMATIC,
  EASE_TAP,
  STAGGER_STEP,
  heroTransition,
  liftHover,
  tapPress,
} from '@/lib/coachhelm/v3/motion';

/** Parent — staggers children on mount / when `animate` key changes. */
export const statsStaggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: STAGGER_STEP, delayChildren: 0.03 },
  },
};

/** Child tile / row — soft rise + micro scale settle. */
export const statsStaggerItem: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.short, ease: EASE_CINEMATIC },
  },
};

/** Section header — slides accent rail in. */
export const statsSectionHeader: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.short, ease: EASE_CINEMATIC },
  },
};

/** Hero band — slower cinematic reveal. */
export const statsHeroReveal: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: heroTransition,
  },
};

/** Tab panel inner content — quick cascade after tab swap. */
export const statsPanelCascade: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.045, delayChildren: 0.06 },
  },
};

export function useStatsMotion() {
  const reduced = useReducedMotion();
  const off = reduced === true;

  return {
    reduced: off,
    container: off
      ? {}
      : ({
          variants: statsStaggerContainer,
          initial: 'hidden',
          animate: 'visible',
        } satisfies HTMLMotionProps<'div'>),
    item: off
      ? {}
      : ({
          variants: statsStaggerItem,
        } satisfies HTMLMotionProps<'div'>),
    section: off
      ? {}
      : ({
          initial: 'hidden',
          animate: 'visible',
          variants: statsSectionHeader,
        } satisfies HTMLMotionProps<'div'>),
    tile: off
      ? {}
      : ({
          whileHover: liftHover,
          whileTap: tapPress,
        } satisfies HTMLMotionProps<'div'>),
    panel: off
      ? {}
      : ({
          variants: statsPanelCascade,
          initial: 'hidden',
          animate: 'visible',
        } satisfies HTMLMotionProps<'div'>),
    hero: off
      ? {}
      : ({
          variants: statsHeroReveal,
          initial: 'hidden',
          animate: 'visible',
        } satisfies HTMLMotionProps<'div'>),
    /** Numeric pop when value mounts (subtle). */
    valuePop: off
      ? {}
      : ({
          initial: { opacity: 0, scale: 0.92 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: DURATION.short, ease: EASE_TAP },
        } satisfies HTMLMotionProps<'span'>),
  };
}

export const MotionDiv = motion.div;
export const MotionSection = motion.section;
export const MotionButton = motion.button;
export const MotionArticle = motion.article;
export const MotionSpan = motion.span;
