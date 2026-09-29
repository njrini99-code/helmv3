import type { Transition } from 'framer-motion';

/**
 * Clubhouse motion doctrine, mirrored from the tokens:
 *   four durations (90, 150, 220, 360ms), one curve (.2,.8,.2,1),
 *   pressed controls scale to 0.985.
 * Banned: count-ups and entrance staggers. Data is final on mount; motion
 * only ever communicates a change the user caused (navigate, open, select).
 */
export const CH_EASE = [0.2, 0.8, 0.2, 1] as const;

export const CH_DUR = {
  instant: 0.09,
  quick: 0.15,
  base: 0.22,
  slow: 0.36,
} as const;

export const CH_PRESS_SCALE = 0.985;

export function chTween(duration: keyof typeof CH_DUR = 'base'): Transition {
  return { duration: CH_DUR[duration], ease: CH_EASE };
}

/** Route change: a short fade with a 6px settle. Never on first paint. */
export const CH_ROUTE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: chTween('base'),
} as const;

/** Popovers and menus: scale from the anchor edge. */
export const CH_POP = {
  initial: { opacity: 0, scale: 0.97, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -2 },
  transition: chTween('quick'),
} as const;

/** Content swap inside a fixed frame (for example, paging rounds). */
export function chSwap(direction: 1 | -1) {
  return {
    initial: { opacity: 0, x: 12 * direction },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 * direction },
    transition: chTween('base'),
  } as const;
}
