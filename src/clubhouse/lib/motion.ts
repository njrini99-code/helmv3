import type { Transition } from 'motion/react';

/**
 * Clubhouse motion: the whole vocabulary (MOTION-AND-VISUAL 3.2; production audit 2026-11-15, S3), mirrored from
 * styles/tokens.css. Three things move: the page, the overlay and the control under the finger. Content never moves on
 * its own, first paint is still, nothing overshoots, and the working dots are the one loop.
 *   Durations (CH_DUR in seconds for motion/react, CH_DUR_MS in ms for WAAPI and timers): press 110 (press down, a menu
 *   out), quick 180 (fades, a menu in, crossfades, Reduce Motion), base 260 (the pill, the thumb, a toast in, a list
 *   insert, a FLIP), release 280 (a press let go, a sheet out), marks 360 (chart marks gliding, first-view bars),
 *   reveal 520 (a push, a pop, a sheet in).
 *   Curves: the iOS curve (.32,.72,0,1) for everything that travels (CH_EASE_IOS), ease-out (.22,1,.36,1) for a press
 *   going down and things leaving (CH_EASE_OUT). The overshooting (.34,1.3,.64,1) is gone (MOT-08).
 *   One spring (CH_SPRING): critically damped, for a released gesture, seeded with the finger's speed.
 *   Loading (CH_BUSY): nothing for 150 ms, then a static skeleton held at least 300 ms (lib/use-busy.ts).
 * Banned: count-ups and staggers, and first-paint motion. A chart's figures changing (a new window) glide its marks to
 * their new places over the marks beat (useGlide, lib/motion-glide.ts); the digits beside them take the new figure at once.
 */
/** A press going down and things leaving (--ch-ease-out). */
export const CH_EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Retiring: CH_EASE_OUT under its old name. */
export const CH_EASE = CH_EASE_OUT;
/** Retiring (3.2): the in-out curve. New code travels on CH_EASE_IOS or leaves on CH_EASE_OUT. */
export const CH_EASE_IO = [0.65, 0, 0.35, 1] as const;
/** A chart's marks gliding to a changed value, and a bar chart's first-view growth, in ms (--ch-dur-marks). */
export const CH_MARKS_MS = 360;
/** One pass of the progress sweep, in ms (--ch-dur-sweep). */
export const CH_SWEEP_MS = 900;

export const CH_DUR = {
  press: 0.11,
  quick: 0.18,
  base: 0.26,
  release: 0.28,
  marks: 0.36,
  reveal: 0.52,
} as const;
/** CH_DUR in milliseconds, the tokens' own unit, for WAAPI and timers. */
export const CH_DUR_MS = {
  press: 110,
  quick: 180,
  base: 260,
  release: 280,
  marks: 360,
  reveal: 520,
} as const;

/** The one spring (3.2): mass 1, stiffness 157.9, damping 25.13, exactly critically damped (WWDC23's 0.5 s, bounce 0). */
export const CH_SPRING = { mass: 1, stiffness: 157.9, damping: 25.13 } as const;
/** How far past its stop a dragged surface follows the finger (UIKit's rubber band coefficient). */
export const CH_RUBBER_BAND = 0.55;
/** The back swipe (S4.2): starts within `edge` px of the left edge, commits past `commitProgress` of the width or above `commitVelocity` px/ms. */
export const CH_SWIPE = { edge: 20, commitProgress: 0.5, commitVelocity: 0.7 } as const;
/** A sheet dragged down (3.4): dismisses past `commitFraction` of its height or above `commitVelocity` px/ms. */
export const CH_SHEET = { commitFraction: 0.25, commitVelocity: 0.4 } as const;
/** Loading (3.9), in ms: draw nothing new for `delay`; once a skeleton shows, hold it at least `min`. */
export const CH_BUSY = { delay: 150, min: 300 } as const;

/** Wheel easing on the desktop canvas (smooth-scroll.ts): how long a wheel step glides. Scrolling, not UI motion, so it
 *  sits outside CH_DUR; reduced motion and Animations off turn it off entirely. */
export const CH_SCROLL_DUR = 0.85;

/** Settings > Animations off, as ThemeScript marks it on <html> before hydration. */
const animationsOff = () => typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off';

/** Reduced is the 180ms fade, never a jump (MOT-22); with Animations off it is instant. Callers drop their transforms. */
export function chTween(duration: keyof typeof CH_DUR = 'base', reduced = false): Transition {
  if (reduced) return { duration: animationsOff() ? 0 : CH_DUR.quick, ease: CH_EASE };
  return { duration: CH_DUR[duration], ease: CH_EASE };
}

/**
 * The Reduce Motion fade (owner decision 2, 2026-10-24, OQ-15): under the OS setting a page or a sheet fades in opacity
 * over the quick beat (180ms) instead of sliding or scaling, as iOS does; with Animations off (`'off'`) it is instant.
 * Opacity only: the caller drops every transform.
 */
export function chFade(mode: 'full' | 'fade' | 'off'): Transition {
  return { duration: mode === 'off' ? 0 : CH_DUR.quick, ease: CH_EASE };
}
/** The same fade in milliseconds, for WAAPI and a view transition (--ch-dur-vt-fade in tokens.css). */
export const CH_FADE_MS = CH_DUR.quick * 1000;

/**
 * Springs (D-64 extension, 2026-10-08; a lead decision under the owner's full-auto brief, for the owner to confirm).
 * Apple's perceptual model (WWDC23, "Animate with springs"): a visual duration and a bounce. The durations are D-64's,
 * so the doctrine's numbers hold, and the bounce stays between 0 and 0.1 (Masters restraint: an arrival settles, it
 * never wobbles; 0.1 overshoots by about 0.15%, under a pixel on anything Clubhouse moves). Given as stiffness and
 * damping (chSpring), a framer spring keeps its velocity when its target changes; a thrown sheet or toast and the nav
 * plate carry their speed through the sampled curve (chSpringCurve, sheet-drag's chThrownExit).
 *   smooth  anchored parts, which never pass their mark from rest: sheets, pushed screens, the nav plate.
 *   settle  a free part arriving: the segmented pill, a swap's incoming copy.
 *   reveal  a layer that comes over the whole screen and should glide, not snap: the phone notification drop
 *           (owner 2026-10-12, "ultra smooth"). D-64's reveal duration, no bounce. It leaves on smooth.
 */
const CH_SPRING_BASE = { visualDuration: CH_DUR.base, bounce: 0 } as const;
export const CH_SPRINGS = {
  smooth: CH_SPRING_BASE,
  /**
   * Bounce 0 on every tap-opened surface (production audit 2026-11-15, S3.1, MOT-08): settle (a free part arriving: the
   * reaction bar, a held bubble, a menu, the jump key, the Ask island) is the smooth spring.
   */
  settle: CH_SPRING_BASE,
  /**
   * Retiring (3.12): the smooth spring under its old name, kept only for the toast's pill (ui/Toast.tsx, the overlays
   * thread's), until it moves to settle. lift, launch and send are gone: a sent message is an insert (3.5), the base beat
   * on the iOS curve (ui/ListPresence), and every held or popped surface settles.
   */
  pop: CH_SPRING_BASE,
  reveal: { visualDuration: CH_DUR.reveal, bounce: 0 },
  /**
   * CH_SPRING, the one spring a released gesture finishes on (production audit 2026-11-15, S3.1, S4.2): Apple's 0.5 s
   * with no bounce, seeded with the finger's speed. framer reads a visual duration as 1.2 times shorter than Apple's,
   * so 0.5 s is written as 0.5 / 1.2 (stiffness (2π / 0.5)² = 157.9, damping 2√157.9 = 25.13). The back swipe's commit
   * and its spring home ride it.
   */
  gesture: { visualDuration: 0.5 / 1.2, bounce: 0 },
} as const;
/**
 * The iOS curve (--ch-ease-ios; audit spec S3.1, 15 Nov 2026): UIKit's own page push, sheet and keyboard curve, as the
 * best web replicas measure it. Every tap-started enter and exit rides it: a push and its pop over the reveal beat
 * (CH_PUSH_MS), a sheet, the keyboard.
 */
export const CH_EASE_IOS = [0.32, 0.72, 0, 1] as const;
/** The iOS curve as a CSS easing string. */
export const CH_EASE_IOS_CSS = `cubic-bezier(${CH_EASE_IOS.join(', ')})`;
/** The iOS sheet curve: the quick chat's close, live pill out, and the down half of press dips. The iOS curve itself. */
export const CH_EASE_SHEET = CH_EASE_IOS;
/** A tapped push and its pop (S4.1): the reveal beat, on the iOS curve. A released swipe finishes on a spring instead. */
export const CH_PUSH_MS = CH_DUR.reveal * 1000;

/**
 * A cubic-bezier easing as a function of progress, `x` to `y` (the curve a CSS `cubic-bezier()` draws): where a running
 * WAAPI animation on that curve stands, read from its time. Newton's method, then bisection where it stalls.
 */
export function chBezier([x1, y1, x2, y2]: readonly [number, number, number, number]): (p: number) => number {
  const at = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const slope = (a: number, b: number, t: number) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 8; i++) {
      const dx = at(x1, x2, t) - p;
      if (Math.abs(dx) < 1e-6) return at(y1, y2, t);
      const d = slope(x1, x2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    let lo = 0;
    let hi = 1;
    t = p;
    for (let i = 0; i < 30; i++) {
      const x = at(x1, x2, t);
      if (Math.abs(x - p) < 1e-6) break;
      if (x < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return at(y1, y2, t);
  };
}
export type ChSpringKind = keyof typeof CH_SPRINGS;

/**
 * Messages v2 beats in milliseconds (MOTION.md), named so a TSX file never carries a literal `duration:` or timer
 * length (clubhouse:check rejects the literal; a CSS use goes through a token in tokens.css instead). They are the
 * artifact's own numbers, not steps on the CH_DUR scale; `crossfade` is not here because Reduce Motion uses the shared
 * CH_FADE_MS (Q-05).
 *   fill      150  the words becoming the bubble: the green fill and ink coming up (MOT-SEND-6); a file or poll fades in
 *   fillInk   160  the same fill's ink, and an attach menu closing (MOT-ATT-2)
 *   arrow     200  the send arrow leaving the key (MOT-SEND-6), the desktop bar's hairline (MOT-THR-1)
 *   field     220  the field's placeholder fading back (MOT-SEND-8), the hover bar's slide (MSG-224)
 *   receipt   260  Delivered rising into place after the bubble lands (MOT-SEND-8)
 *   keyboard  480  the iOS keyboard's ride (MOT-KB-1), on CH_KEYBOARD_EASE
 *   reveal    520  content opening out (the reveal spring's own length)
 */
export const CH_MS = { fill: 150, fillInk: 160, arrow: 200, field: 220, receipt: 260, keyboard: 480, reveal: 520 } as const;
/** The iOS keyboard curve as a CSS easing string (--ch-ease-sheet in tokens.css is the same curve). */
export const CH_KEYBOARD_EASE = `cubic-bezier(${CH_EASE_SHEET.join(', ')})`;

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
  // iOS before 17.2 throws on a linear() easing in animate(), so an older phone gets the house curve in its place.
  const hasLinear = typeof CSS === 'undefined' || !CSS.supports || CSS.supports('transition-timing-function', 'linear(0, 1)');
  return { ms, ease, linear: hasLinear ? `linear(${points.join(', ')})` : `cubic-bezier(${CH_EASE.join(', ')})` };
}

/** How long the shared smooth spring takes to settle, in ms (462): its physics, read from the curve so a caller timing a
 *  WAAPI copy of it never drifts from the spring. CSS has no spring durations (S3.1). */
export const CH_SPRING_SETTLE_MS = chSpringCurve('smooth').ms;

/** A panel's content swap inside a fixed frame (a Settings section): a base crossfade with a 6px settle. */
// The presets below move by transform strings, not framer's x, y and scale: framer runs those on the main thread, and
// a transform string goes to the compositor (WAAPI) with the opacity, so a busy frame doesn't hold the move back
// (motion audit 2026-10-12). Same distances, same timing.
export const CH_ROUTE = {
  initial: { opacity: 0, transform: 'translateY(6px)' },
  animate: { opacity: 1, transform: 'translateY(0px)' },
  exit: { opacity: 0, transform: 'translateY(-4px)' },
  transition: chTween('base'),
} as const;

/** Popovers and menus: scale from the anchor edge (CH-1603). */
export const CH_POP = {
  initial: { opacity: 0, transform: 'translateY(-4px) scale(0.97)' },
  animate: { opacity: 1, transform: 'translateY(0px) scale(1)' },
  exit: { opacity: 0, transform: 'translateY(-2px) scale(0.98)' },
  transition: chTween('quick'),
} as const;

/** Content swap inside a fixed frame (for example, paging rounds). */
export function chSwap(direction: 1 | -1, reduced = false) {
  return {
    initial: { opacity: 0, transform: `translateX(${12 * direction}px)` },
    animate: { opacity: 1, transform: 'translateX(0px)' },
    exit: { opacity: 0, transform: `translateX(${-12 * direction}px)` },
    transition: chTween('base', reduced),
  } as const;
}
