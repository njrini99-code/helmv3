'use client';

/**
 * ============================================================================
 * P3 · The capture loop — what a player actually does, tap by tap
 * ----------------------------------------------------------------------------
 * The phone was a screenshot: shot 2 already selected, "Green" already chosen,
 * the progress bar already at 60%, the distance already reading 12 feet. A
 * screenshot of a finished state cannot answer the question this section is for
 * — HOW does a player log a round without it becoming homework?
 *
 * The answer is that logging one shot is four taps, and the whole page's claim
 * of 85 stats rests on those four taps being fast enough to do 72 times in a
 * round. So the phone performs them, in the order the app asks for them:
 *
 *   1. SHOT     — the shot chip advances. This is the only thing that
 *                 auto-increments; everything else is a tap.
 *   2. LIE      — where the ball finished. One tap on a six-way selector.
 *   3. DISTANCE — the remaining distance resolves and its nearest preset
 *                 highlights, which is the tap that saves the typing.
 *   4. NEXT     — and the shot is committed; the loop is ready to run again.
 *
 * The progress bar advances WITH the distance rather than on its own beat,
 * because it is the same fact drawn twice — one as a number, one as a length.
 *
 * SELECTION IS DRAWN, NOT RECOLOURED. Each selectable control carries an
 * absolutely-positioned fill layer that scales in behind fully-opaque text,
 * rather than tweening `background-color` under text whose colour also has to
 * change. That keeps the work on the compositor and — more importantly — means
 * the label is never mid-way between two colours, which is where contrast
 * failures come from.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, STAGGER } from '@/lib/motion/gsap/tokens';
import { countTo } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const LR = {
  phone: '[data-lr="phone"]',
  shotFill: '[data-lr="shot-fill"]',
  lieFill: '[data-lr="lie-fill"]',
  presetFill: '[data-lr="preset-fill"]',
  distance: '[data-lr="distance"]',
  progress: '[data-lr="progress"]',
  next: '[data-lr="next"]',
} as const;

export function captureLoopScene({ root, reduced, compact }: SceneContext): void {
  const q = gsap.utils.selector(root);
  const phone = q(LR.phone)[0] as HTMLElement | undefined;
  const shotFills = q(LR.shotFill) as HTMLElement[];
  const lieFill = q(LR.lieFill)[0] as HTMLElement | undefined;
  const presetFill = q(LR.presetFill)[0] as HTMLElement | undefined;
  const distance = q(LR.distance)[0] as HTMLElement | undefined;
  const progress = q(LR.progress)[0] as HTMLElement | undefined;
  const next = q(LR.next)[0] as HTMLElement | undefined;
  if (!phone) return;

  const fills = [lieFill, presetFill].filter(Boolean) as HTMLElement[];

  // ── Reduced motion: the shot, already logged. Same end state, no taps. ────
  if (reduced) {
    gsap.set(shotFills, { autoAlpha: 1, scale: 1 });
    gsap.set(fills, { autoAlpha: 1, scale: 1 });
    if (progress) gsap.set(progress, { scaleX: 0.6 });
    if (next) gsap.set(next, { autoAlpha: 1, scale: 1 });
    if (distance) distance.textContent = '12';
    return;
  }

  gsap.set(shotFills, { autoAlpha: 0, scale: 0.6, transformOrigin: 'center' });
  gsap.set(fills, { autoAlpha: 0, scale: 0.7, transformOrigin: 'center' });
  if (progress) gsap.set(progress, { scaleX: 0, transformOrigin: 'left center' });
  if (next) gsap.set(next, { autoAlpha: 0, scale: 0.96, transformOrigin: 'center' });
  if (distance) distance.textContent = '—';

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: phone,
      start: compact ? 'top 82%' : 'top 72%',
      end: compact ? 'bottom 45%' : 'bottom 60%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  // 1. The shot chips fill in order — shots one and two are logged, three and
  //    four are still ahead. `emphasized` is the touch curve: these are taps.
  if (shotFills.length) {
    tl.to(
      shotFills,
      { autoAlpha: 1, scale: 1, duration: DUR.short, ease: EASE.emphasized, stagger: STAGGER.step },
      0,
    );
  }

  // 2. Where it finished.
  if (lieFill) tl.to(lieFill, { autoAlpha: 1, scale: 1, duration: DUR.short, ease: EASE.emphasized }, 0.34);

  // 3. What is left — the number and the bar are the same fact, so one beat.
  if (distance) tl.add(countTo(distance, 12, { duration: DUR.medium }), 0.56);
  if (progress) tl.to(progress, { scaleX: 0.6, duration: DUR.long, ease: EASE.glide }, 0.56);
  if (presetFill) tl.to(presetFill, { autoAlpha: 1, scale: 1, duration: DUR.short, ease: EASE.emphasized }, 0.74);

  // 4. Committed.
  if (next) tl.to(next, { autoAlpha: 1, scale: 1, duration: DUR.medium, ease: EASE.emphasized }, 0.92);

  tl.to({}, { duration: 0.3 });
}
