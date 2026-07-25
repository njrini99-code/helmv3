'use client';

/**
 * ============================================================================
 * L1 · Hero scene — "establish the axis"
 * ----------------------------------------------------------------------------
 * The hero's job is not to be impressive on its own; it is to teach the reader
 * how the rest of the page moves. Everything below travels a corridor, so the
 * hero has to establish that a corridor exists.
 *
 * Two movements:
 *
 *   1. ARRIVAL (on load, not on scroll). The headline enters as masked LINES —
 *      each line translating up out of its own overflow-hidden box at full
 *      opacity. The subhead and CTA row follow on the house stagger. This is the
 *      "settle" verb, stated once, cleanly.
 *
 *   2. THE TEE SHOT (scroll-scrubbed). A flight arc draws from the horizon of
 *      the photograph down toward the page below, with a ball riding its head.
 *      The arc is the page's spine: the corridor every later chapter travels.
 *      Scrubbed, so the reader's own scroll is what hits the shot — the first
 *      and cheapest way to teach "this page responds to you".
 *
 * WHY NOT A FADE-UP. The existing hero animates a 14px translateY fade on a
 * 0.1/0.3/0.4s stagger — the most generic move that exists, spent on the most
 * valuable frame. The photograph stays (it is the one genuinely non-generic
 * asset on the page: a real course, real players, not a gradient or a floating
 * wordmark); what changes is its JOB — from decoration to ground plane.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, EASE, STAGGER, SCRUB, DIST } from '@/lib/motion/gsap/tokens';
import { maskedLines, prepareDraw } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

/** Stable hooks the component stamps; no brittle class selectors. */
export const HERO = {
  headline: '[data-hero="headline"]',
  sub: '[data-hero="sub"]',
  actions: '[data-hero="actions"]',
  plate: '[data-hero="plate"]',
  arc: '[data-hero="arc"]',
  ball: '[data-hero="ball"]',
} as const;

export function heroScene({ root, reduced }: SceneContext): void | (() => void) {
  const q = gsap.utils.selector(root);
  const headline = q(HERO.headline)[0] as HTMLElement | undefined;
  const sub = q(HERO.sub)[0] as HTMLElement | undefined;
  const actions = q(HERO.actions)[0] as HTMLElement | undefined;
  const plate = q(HERO.plate)[0] as HTMLElement | undefined;
  const arc = q(HERO.arc)[0] as SVGPathElement | undefined;
  const ball = q(HERO.ball)[0] as SVGElement | undefined;

  // ── Reduced motion: everything settled, nothing scrubbed, arc fully drawn ──
  if (reduced) {
    if (arc) gsap.set(arc, { strokeDasharray: 'none', strokeDashoffset: 0, opacity: 1 });
    if (ball) gsap.set(ball, { opacity: 1 });
    return;
  }

  // ── 1. Arrival ────────────────────────────────────────────────────────────
  const enter = gsap.timeline({ defaults: { ease: EASE.glide } });

  // SplitText rewrites innerHTML, so its undo is returned as this scene's
  // cleanup (see SceneBody) rather than left to GSAP's own revert, which only
  // restores inline styles.
  let revertSplit: (() => void) | undefined;

  if (headline) {
    const split = maskedLines(headline);
    revertSplit = split.revert;
    enter.to(split.lines, { yPercent: 0, duration: DUR.long, stagger: STAGGER.step }, 0);
  }

  // Sub + actions are supporting detail, so they get the quiet version of the
  // same move rather than a competing idea.
  if (sub) {
    gsap.set(sub, { y: DIST.datum, opacity: 0 });
    enter.to(sub, { y: 0, opacity: 1, duration: DUR.medium }, 0.18);
  }
  if (actions) {
    gsap.set(actions, { y: DIST.datum, opacity: 0 });
    enter.to(actions, { y: 0, opacity: 1, duration: DUR.medium }, 0.28);
  }

  // The photograph is the ground plane: it arrives by settling, never by
  // sliding in from an edge.
  if (plate) {
    gsap.set(plate, { scale: 1.04, opacity: 0 });
    enter.to(plate, { scale: 1, opacity: 1, duration: DUR.long }, 0.06);
  }

  // ── 2. The tee shot ───────────────────────────────────────────────────────
  if (!arc) return revertSplit;

  const length = prepareDraw(arc);
  if (ball) gsap.set(ball, { opacity: 0 });

  // One scrubbed proxy drives BOTH the stroke reveal and the ball's position,
  // so the ball can never desync from the head of the line it is supposed to be
  // cutting. `getPointAtLength` is read once per frame off a value GSAP already
  // computed — no layout is measured during scroll.
  const head = { progress: 0 };

  const shot = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: 'top top',
      // The arc draws across the hero's own exit — by the time the next chapter
      // arrives the corridor exists and the page can travel down it.
      end: 'bottom top',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  shot.to(
    head,
    {
      progress: 1,
      duration: 1,
      ease: EASE.none,
      onUpdate: () => {
        gsap.set(arc, { strokeDashoffset: length * (1 - head.progress) });
        if (!ball) return;
        // The ball is a <g> holding halo + core, translated as one node. Using
        // `attr: {cx, cy}` here would move only whichever circle the selector
        // matched and leave the other behind.
        const point = arc.getPointAtLength(length * head.progress);
        gsap.set(ball, { x: point.x, y: point.y, opacity: head.progress > 0.02 ? 1 : 0 });
      },
    },
    0,
  );

  return revertSplit;
}
