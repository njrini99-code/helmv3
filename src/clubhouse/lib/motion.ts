import type { Transition } from 'framer-motion';

/**
 * Clubhouse motion (D-64, the v2 design's gh-polish.css and gh-core.js),
 * mirrored from the tokens:
 *   press 110ms, quick 180ms (hover, toggles, the tab underline), base 260ms
 *   (sheets, panels, pushes, crossfades), release 280ms on the spring,
 *   reveal 520ms (the sign-in handoff curtain lifting, lib/handoff.ts; the staggered first-paint reveal ended on
 *   2026-10-01, so a page is visible at once under the page crossfade).
 *   Curves: ease-out (.22,1,.36,1), in-out (.65,0,.35,1), spring (.34,1.3,.64,1). Since 2026-10-08, real springs
 *   on the same durations for what moves and can be interrupted or thrown (CH_SPRINGS, below).
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

/** Wheel easing on the desktop canvas (smooth-scroll.ts): how long a wheel step glides. Scrolling, not UI motion, so it
 *  sits outside CH_DUR; reduced motion and Animations off turn it off entirely. */
export const CH_SCROLL_DUR = 0.85;

export function chTween(duration: keyof typeof CH_DUR = 'base', reduced = false): Transition {
  return { duration: reduced ? 0 : CH_DUR[duration], ease: CH_EASE };
}

/**
 * Springs (D-64 extension, 2026-10-08; a lead decision under the owner's full-auto brief, for the owner to confirm).
 * Apple's perceptual model (WWDC23, "Animate with springs"): a visual duration and a bounce. The durations are D-64's,
 * so the doctrine's numbers hold, and the bounce stays between 0 and 0.1 (Masters restraint: an arrival settles, it
 * never wobbles; 0.1 overshoots by about 0.15%, under a pixel on anything Clubhouse moves). Given as stiffness and
 * damping (chSpring), a framer spring keeps its velocity when its target changes; a thrown sheet or toast and the nav
 * plate carry their speed through the sampled curve (chSpringCurve, sheet-drag's chThrownExit).
 *   smooth  anchored parts, which never pass their mark from rest: sheets, pushed screens, the nav plate.
 *   settle  a free part arriving: the segmented pill, a swap's incoming copy.
 */
export const CH_SPRINGS = {
  smooth: { visualDuration: CH_DUR.base, bounce: 0 },
  settle: { visualDuration: CH_DUR.base, bounce: 0.1 },
} as const;
export type ChSpringKind = keyof typeof CH_SPRINGS;

/** framer's own reading of a visual duration and a bounce (motion-dom spring.mjs): ω = 2π / (1.2 × duration), ζ = 1 − bounce. */
function physics(kind: ChSpringKind): { omega: number; zeta: number } {
  const { visualDuration, bounce } = CH_SPRINGS[kind];
  return { omega: (2 * Math.PI) / (visualDuration * 1.2), zeta: Math.min(1, Math.max(0.05, 1 - bounce)) };
}

/**
 * A spring as a framer transition; instant when reduced. framer 13 drops the velocity of a spring given as
 * `visualDuration` and `bounce`, on a retarget and from a fling alike, so the same spring goes over as stiffness and
 * damping, which keep it. `velocity` is in the animated value's units per second.
 */
export function chSpring(kind: ChSpringKind = 'smooth', reduced = false, velocity?: number): Transition {
  if (reduced) return { duration: 0 };
  const { omega, zeta } = physics(kind);
  return { type: 'spring', stiffness: omega * omega, damping: 2 * zeta * omega, mass: 1, ...(velocity ? { velocity } : {}) };
}

/** Where the spring is at `t` seconds, as progress from 0 to 1, having started at `v0` progress per second (the closed form framer runs). */
export function chSpringAt(kind: ChSpringKind, t: number, v0 = 0): number {
  const { omega, zeta } = physics(kind);
  if (zeta >= 1) return 1 + (-1 + (v0 - omega) * t) * Math.exp(-omega * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 + Math.exp(-zeta * omega * t) * (-Math.cos(wd * t) + ((v0 - zeta * omega) / wd) * Math.sin(wd * t));
}

const SPRING_STEP_S = 1 / 240;
const SPRING_MAX_S = 1.5;

/**
 * The same spring as a timed curve, for what can't run a framer spring: a WAAPI exit, a CSS transition, the CSS
 * `linear()` token. `velocity` is in progress per second (a fling's pixels per second over the distance left). The
 * curve ends once it stays within `rest` of the mark, so an exit finishes as its part leaves sight rather than after
 * an invisible tail. `linear` samples it about once a frame. Thrown at its mark faster than the spring can stop in the
 * distance, a part passes it once and comes back, as a real one would. With `hold` (a drawer at its open edge, the nav
 * plate at its row) it passes by no more than `rest` instead, starting no faster than that allows; only the smooth
 * spring can promise it.
 */
export function chSpringCurve(
  kind: ChSpringKind = 'smooth',
  { velocity = 0, rest = 0.001, hold = false }: { velocity?: number; rest?: number; hold?: boolean } = {},
): { ms: number; ease: (p: number) => number; linear: string } {
  let v0 = Math.max(-60, Math.min(60, Number.isFinite(velocity) ? velocity : 0));
  // Critically damped, the spring passes its mark only when it starts toward it faster than ω, and then by
  // (a / ω) e^(-1 - ω / a) of the distance, where a = v0 - ω (the peak of its closed form).
  const { omega, zeta } = physics(kind);
  const pass = (v: number) => (v <= omega ? 0 : ((v - omega) / omega) * Math.exp(-1 - omega / (v - omega)));
  if (hold && zeta >= 1 && pass(v0) > rest) {
    let lo = omega;
    let hi = v0;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (pass(mid) > rest) hi = mid;
      else lo = mid;
    }
    v0 = lo;
  }
  let end = SPRING_STEP_S;
  for (let t = SPRING_STEP_S; t <= SPRING_MAX_S; t += SPRING_STEP_S) if (Math.abs(1 - chSpringAt(kind, t, v0)) > rest) end = t + SPRING_STEP_S;
  const ms = Math.round(end * 1000);
  const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : chSpringAt(kind, p * end, v0));
  const steps = Math.max(8, Math.round(ms / 16));
  const points = Array.from({ length: steps + 1 }, (_, i) => (i === 0 ? 0 : i === steps ? 1 : +ease(i / steps).toFixed(4)));
  return { ms, ease, linear: `linear(${points.join(', ')})` };
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
export function chSwap(direction: 1 | -1, reduced = false) {
  return {
    initial: { opacity: 0, x: 12 * direction },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -12 * direction },
    transition: chTween('base', reduced),
  } as const;
}
