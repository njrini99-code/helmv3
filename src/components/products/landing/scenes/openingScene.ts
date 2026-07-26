'use client';

/**
 * ============================================================================
 * P1 / P7 · The opening and the close
 * ----------------------------------------------------------------------------
 * Both bands were built out of `.heroItem` CSS keyframes on staggered
 * `animation-delay`s — logo fades up, headline fades up, paragraph fades up,
 * buttons fade up. That is the exact pattern the brief rules out, and it has a
 * second problem beyond being generic: it ramps the OPACITY of the page's
 * largest text, so for most of its duration the h1 is grey-on-cream at a
 * contrast ratio no audit would accept and no reader can use.
 *
 * Both now use the house reveal: masked SplitText lines that TRANSLATE into
 * place under `overflow: hidden`. The type is fully opaque from the first
 * frame — it is simply not in view yet — which is both the better gesture and
 * the accessible one.
 *
 * The opening is NOT scrubbed. A hero is the one thing on the page that is
 * already in view when the reader arrives; tying it to scroll means it either
 * plays before they can see it or waits for an input they have not given. It
 * runs once, on load, on its own clock.
 *
 * The mark ARRIVES rather than fades: it scales up from 0.86 on the emphasized
 * curve, which is the same gesture the app uses when a sheet takes focus.
 * ========================================================================== */

import { gsap, ScrollTrigger } from '@/lib/motion/gsap/register';
import { DUR, EASE, STAGGER } from '@/lib/motion/gsap/tokens';
import { maskedLines } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const OPENING = {
  mark: '[data-open="mark"]',
  headline: '[data-open="headline"]',
  body: '[data-open="body"]',
  actions: '[data-open="actions"]',
  rule: '[data-open="rule"]',
} as const;

/**
 * Shared choreography for the two full-width statement bands.
 *
 * @param scrubbed `false` for the hero (runs on load), `true` for the closing
 *                 band (which the reader scrolls into).
 */
function statementBand({ root, reduced }: SceneContext, scrubbed: boolean): void | (() => void) {
  const q = gsap.utils.selector(root);
  const mark = q(OPENING.mark)[0] as HTMLElement | undefined;
  const headline = q(OPENING.headline)[0] as HTMLElement | undefined;
  const body = q(OPENING.body)[0] as HTMLElement | undefined;
  const actions = q(OPENING.actions)[0] as HTMLElement | undefined;
  const rule = q(OPENING.rule)[0] as HTMLElement | undefined;
  if (!headline) return;

  // ── Reduced motion: the band, already arrived. ───────────────────────────
  if (reduced) {
    gsap.set([mark, headline, body, actions].filter(Boolean) as HTMLElement[], { opacity: 1, y: 0, scale: 1 });
    if (rule) gsap.set(rule, { scaleX: 1 });
    return;
  }

  const h = maskedLines(headline);
  const b = body ? maskedLines(body) : undefined;

  if (mark) gsap.set(mark, { scale: 0.86, autoAlpha: 0, transformOrigin: 'center' });
  if (actions) gsap.set(actions, { autoAlpha: 0, y: 14 });
  if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: 'left center' });

  // Scrubbed or not, this band ARRIVES on a clock.
  //
  // The closing band used to hang off `scrub`, which meant its headline was
  // rendered at whatever fraction of its own travel the reader's scroll happened
  // to stop at — and a masked line is legible at 0% and at 100% and nowhere in
  // between. Park mid-window and you are reading a sentence sliced through the
  // middle of its own line-boxes. Scroll decides WHEN the band arrives; it does
  // not get to decide how far through arriving it is allowed to be. (Same change,
  // same reason, as the landing thesis.)
  const tl = gsap.timeline({ paused: scrubbed, delay: scrubbed ? 0 : 0.08 });

  if (mark) tl.to(mark, { scale: 1, autoAlpha: 1, duration: DUR.long, ease: EASE.emphasized }, 0);
  tl.to(h.lines, { yPercent: 0, duration: DUR.long, ease: EASE.glide, stagger: STAGGER.step }, mark ? 0.12 : 0);
  if (b) tl.to(b.lines, { yPercent: 0, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.wideStep }, '-=0.34');
  // `autoAlpha` on the actions, not opacity: a button at 40% opacity is a
  // button that looks disabled and reads as a contrast failure.
  if (actions) tl.to(actions, { autoAlpha: 1, y: 0, duration: DUR.medium, ease: EASE.glide }, '-=0.2');
  if (rule) tl.to(rule, { scaleX: 1, duration: DUR.long, ease: EASE.soft }, '-=0.4');

  if (scrubbed) {
    ScrollTrigger.create({
      trigger: root,
      start: 'top 72%',
      invalidateOnRefresh: true,
      onEnter: () => tl.play(),
      // Landing already past the trigger — a deep link, a restored scroll, or a
      // resize that re-runs this context — must show the arrived band. Without
      // this it would sit at progress 0 forever, because `onEnter` has no edge
      // left to fire on.
      onRefresh: (self) => {
        if (self.progress > 0) tl.progress(1);
      },
    });
  }

  return () => {
    h.revert();
    b?.revert();
  };
}

/** P1 · the hero. Runs on load — a hero should not wait for a scroll. */
export function openingScene(ctx: SceneContext): void | (() => void) {
  return statementBand(ctx, false);
}

/** P7 · the closing band. Triggered on the way in, then plays on its own clock. */
export function closingScene(ctx: SceneContext): void | (() => void) {
  return statementBand(ctx, true);
}
