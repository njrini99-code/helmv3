'use client';

/**
 * ============================================================================
 * L7 · The close — the shot finishes
 * ----------------------------------------------------------------------------
 * The closing band was two concentric hairline rings: decorative geometry that
 * could sit behind any product's final CTA without changing meaning. It is the
 * one place on the page where a generic flourish is most expensive, because it
 * is the last thing the reader sees before deciding.
 *
 * It is now the other half of the hero. The hero draws a shot leaving the tee;
 * this draws it arriving. Same subject, opposite end — and between them sits
 * the entire argument about what the product does with that shot.
 *
 * Three beats, in the order they happen on a golf hole:
 *   1. THE PIN stands. The target exists before the shot does.
 *   2. THE FLAG catches.
 *   3. THE BALL arrives along its final arc and settles by the cup — travelling
 *      on the path itself via `getPointAtLength`, so it follows the drawn line
 *      exactly rather than approximating it with hand-tuned keyframes.
 *
 * Nothing loops. The ball lands and stays landed, which is the point of the
 * band it sits behind.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB } from '@/lib/motion/gsap/tokens';
import { prepareDraw } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const PIN = {
  pole: '[data-pin="pole"]',
  flag: '[data-pin="flag"]',
  cup: '[data-pin="cup"]',
  approach: '[data-pin="approach"]',
  ball: '[data-pin="ball"]',
} as const;

export function pinScene({ root, reduced }: SceneContext): void {
  const q = gsap.utils.selector(root);
  const pole = q(PIN.pole)[0] as SVGPathElement | undefined;
  const flag = q(PIN.flag)[0] as SVGPathElement | undefined;
  const cup = q(PIN.cup)[0] as SVGPathElement | undefined;
  const approach = q(PIN.approach)[0] as SVGPathElement | undefined;
  const ball = q(PIN.ball)[0] as SVGGElement | undefined;
  if (!pole || !approach || !ball) return;

  const settle = (x: number, y: number) => gsap.set(ball, { x, y });

  // ── Reduced motion: the ball, already at the pin. The image is complete and
  //    carries the same meaning; only the flight goes. ───────────────────────
  if (reduced) {
    [pole, flag, cup, approach].forEach((el) => {
      if (el) gsap.set(el, { strokeDashoffset: 0, opacity: 1 });
    });
    const end = approach.getPointAtLength(approach.getTotalLength());
    settle(end.x, end.y);
    gsap.set(ball, { autoAlpha: 1 });
    return;
  }

  prepareDraw(pole);
  const approachLen = prepareDraw(approach);
  if (cup) prepareDraw(cup);
  if (flag) gsap.set(flag, { scaleX: 0, transformOrigin: 'left center', opacity: 1 });

  const start = approach.getPointAtLength(0);
  settle(start.x, start.y);
  gsap.set(ball, { autoAlpha: 0 });

  // A proxy the ball rides: the path is the single source of truth for where it
  // is, so the flight and the drawn line can never disagree.
  const head = { progress: 0 };

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: 'top 78%',
      end: 'center 52%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  tl.to(pole, { strokeDashoffset: 0, duration: DUR.long, ease: EASE.glide }, 0);
  if (flag) tl.to(flag, { scaleX: 1, duration: DUR.medium, ease: EASE.emphasized }, 0.28);
  if (cup) tl.to(cup, { strokeDashoffset: 0, duration: DUR.medium, ease: EASE.glide }, 0.34);
  tl.to(ball, { autoAlpha: 1, duration: DUR.micro, ease: EASE.none }, 0.5);
  tl.to(approach, { strokeDashoffset: 0, duration: DUR.sequence, ease: EASE.glide }, 0.5);
  tl.to(
    head,
    {
      progress: 1,
      duration: DUR.sequence,
      ease: EASE.glide,
      onUpdate: () => {
        const pt = approach.getPointAtLength(approachLen * head.progress);
        settle(pt.x, pt.y);
      },
    },
    0.5,
  );

  tl.to({}, { duration: 0.3 });
}
