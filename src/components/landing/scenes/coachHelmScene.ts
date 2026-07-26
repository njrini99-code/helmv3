'use client';

/**
 * ============================================================================
 * L4+L5 · CoachHelm scene — "the bars resolve into a sentence"
 * ----------------------------------------------------------------------------
 * The math chapter and the cause chapter are ONE section, because the artefact
 * that carries both is one panel: the diverging strokes-gained tornado.
 *
 * The order is the product's guarantee made visible. CoachHelm hard-gates an
 * insight behind its confidence and lifecycle state before it can reach any
 * screen — nothing ships without its receipts. So here nothing ARRIVES without
 * its receipts either:
 *
 *   1. The four category bars GROW FROM THE ZERO BASELINE — right/green for
 *      gained, left/amber for lost. This is the literal picture of
 *      `SG = E[strokes before] − E[strokes after] − 1`, so the motion is the
 *      explanation rather than decoration on top of it.
 *   2. The losing row is FLAGGED as the leak, only once its own bar has
 *      finished growing — you cannot name the leak before you have measured it.
 *   3. The insight SENTENCE assembles word by word (SplitText, masked — never
 *      a glyph opacity ramp).
 *   4. The RECEIPTS land: source window, confidence.
 *   5. The RECOMMENDATION stamps in last, because it is the only thing here
 *      that is a conclusion.
 *
 * Growth from a fixed baseline is the ideal scrub subject: legible at any
 * scroll position, perfectly reversible, and full-opacity at every frame.
 *
 * Replaces the legacy `useSequence` on-enter stagger, which fired once on
 * intersection and played on a clock unrelated to the reader.
 * ========================================================================== */

import { gsap, ScrollTrigger } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, STAGGER, DIST } from '@/lib/motion/gsap/tokens';
import { maskedWords } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const CH = {
  bar: '[data-sg-bar]',
  leakRow: '[data-sg-row="leak"]',
  insight: '[data-ch="insight"]',
  receipts: '[data-ch="receipts"]',
  recommendation: '[data-ch="recommendation"]',
  copy: '[data-ch="copy"]',
} as const;

export function coachHelmScene({ root, reduced, compact }: SceneContext): void | (() => void) {
  const q = gsap.utils.selector(root);
  const bars = q(CH.bar) as HTMLElement[];
  const leakRow = q(CH.leakRow)[0] as HTMLElement | undefined;
  const insight = q(CH.insight)[0] as HTMLElement | undefined;
  const receipts = q(CH.receipts)[0] as HTMLElement | undefined;
  const recommendation = q(CH.recommendation)[0] as HTMLElement | undefined;

  // ── Reduced motion: the finished analysis, stated plainly ────────────────
  if (reduced) {
    gsap.set(bars, { scaleX: 1 });
    if (leakRow) gsap.set(leakRow, { opacity: 1 });
    gsap.set([insight, receipts, recommendation].filter(Boolean) as HTMLElement[], { opacity: 1, y: 0 });
    return;
  }

  // ── Prep ─────────────────────────────────────────────────────────────────
  // The bars are absolutely positioned off the 50% centre line — `left:50%`
  // for gained, `right:50%` for lost — so the transform origin has to follow
  // the side or a "lost" bar would grow the wrong way out of the baseline.
  bars.forEach((bar) => {
    const gained = bar.dataset.sgBar === 'gain';
    gsap.set(bar, { scaleX: 0, transformOrigin: gained ? 'left center' : 'right center' });
  });

  // The leak highlight is a background wash + ring on the ROW, so it is chrome,
  // not a datum — opacity is legitimate here.
  if (leakRow) gsap.set(leakRow, { opacity: 0 });

  let revertWords: (() => void) | undefined;
  let insightTargets: HTMLElement[] = [];
  if (insight) {
    const split = maskedWords(insight);
    revertWords = split.revert;
    insightTargets = split.lines;
  }

  if (receipts) gsap.set(receipts, { opacity: 0, y: DIST.datum });
  if (recommendation) gsap.set(recommendation, { opacity: 0, y: DIST.datum });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: compact ? 'top 80%' : 'top 68%',
      end: compact ? 'bottom 65%' : 'bottom 45%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  // 1. Measure.
  tl.to(bars, { scaleX: 1, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.step }, 0);

  const barsEnd = DUR.medium + STAGGER.step * Math.max(0, bars.length - 1);

  // 2. Name the leak — only after the bar that proves it has finished.
  if (leakRow) tl.to(leakRow, { opacity: 1, duration: DUR.short, ease: EASE.glide }, barsEnd);

  // 3. The sentence — on a clock, NOT on the scrub that drives everything else
  //    in this timeline.
  //
  //    The bars belong on the scrub: a bar at half its length is an honest,
  //    readable state, and letting the reader's scroll grow it is the point.
  //    A masked word is the opposite — at half its travel it is a word sliced
  //    through the middle, and parking there is not a state anyone should be
  //    able to hold. So the measurement scrubs and the sentence arrives.
  if (insightTargets.length) {
    const sentence = gsap.timeline({ paused: true });
    sentence.to(insightTargets, {
      yPercent: 0,
      duration: DUR.medium,
      ease: EASE.glide,
      stagger: STAGGER.wideStep,
    });
    ScrollTrigger.create({
      trigger: root,
      // Late enough that the bars it is describing have grown first — the
      // sentence names a leak the reader has already watched appear.
      start: compact ? 'top 55%' : 'top 42%',
      invalidateOnRefresh: true,
      onEnter: () => sentence.play(),
      onRefresh: (self) => {
        if (self.progress > 0) sentence.progress(1);
      },
    });
  }

  // 4. The receipts.
  if (receipts) tl.to(receipts, { opacity: 1, y: 0, duration: DUR.short, ease: EASE.glide }, barsEnd + 0.34);

  // 5. The conclusion, last.
  if (recommendation) {
    tl.to(recommendation, { opacity: 1, y: 0, duration: DUR.medium, ease: EASE.glide }, barsEnd + 0.46);
  }

  return revertWords;
}
