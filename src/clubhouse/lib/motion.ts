import type { Transition } from 'framer-motion';

/**
 * Clubhouse motion (D-64, the v2 design's gh-polish.css and gh-core.js),
 * mirrored from the tokens:
 *   press 110ms, quick 180ms (hover, toggles, the tab underline), base 260ms
 *   (sheets, panels, pushes, crossfades), release 280ms on the spring,
 *   reveal 520ms (a single deliberate rise; the routine staggered page reveal was retired 2026-10-01).
 *   Curves: ease-out (.22,1,.36,1), in-out (.65,0,.35,1), spring (.34,1.3,.64,1).
 * Banned: count-ups and staggers.
 */
export const CH_EASE = [0.22, 1, 0.36, 1] as const;
export const CH_EASE_IO = [0.65, 0, 0.35, 1] as const;
export const CH_SPRING = [0.34, 1.3, 0.64, 1] as const;

export const CH_DUR = {
  press: 0.11,
  quick: 0.18,
  base: 0.26,
  release: 0.28,
  reveal: 0.52,
} as const;

export function chTween(duration: keyof typeof CH_DUR = 'base'): Transition {
  return { duration: CH_DUR[duration], ease: CH_EASE };
}

/** A panel's content swap inside a fixed frame (a Settings section): a base crossfade with a 6px settle. */
export const CH_ROUTE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: chTween('base'),
} as const;

/** Popovers and menus: scale from the anchor edge (CH-1603). */
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
