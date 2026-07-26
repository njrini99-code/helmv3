'use client';

/**
 * ============================================================================
 * L5 · The stats page — read in the order it wants to be read
 * ----------------------------------------------------------------------------
 * This band was a still: a whole stats page arriving at once behind a parallax
 * tilt. A stats page arriving at once is a wall, and the section's own promise
 * is the opposite — "see exactly where the strokes leak", i.e. that the
 * product does the ranking FOR you.
 *
 * So the reveal is the ranking:
 *
 *   1. THE SPINE lands first. It carries the verdict — one number, −4.44
 *      strokes a round — and the verdict is what the page is for.
 *   2. THE PRIORITIES resolve beneath it, 01, 02, 03. This is GolfHelm's own
 *      ordering of where the strokes are going.
 *   3. THE BENTO then resolves IN THAT PRIORITY ORDER, not in DOM order. The
 *      putting cell — the one the spine named as the leak — arrives first,
 *      approach second, short game third, and the healthy cells last.
 *
 * The last point is the whole idea, and it is why the ranks are authored on
 * the cells rather than inferred from position: a reader who watches this once
 * has already been told where to look, without a single arrow or callout.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, SCRUB, DIST } from '@/lib/motion/gsap/tokens';
import { arrive, countTo } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const STAT = {
  spine: '[data-stat="spine"]',
  sg: '[data-stat="sg"]',
  priority: '[data-stat="priority"]',
  cell: '[data-stat="cell"]',
} as const;

export function statsScene({ root, reduced, compact }: SceneContext): void {
  const q = gsap.utils.selector(root);
  const spines = q(STAT.spine) as HTMLElement[];
  const sgs = q(STAT.sg) as HTMLElement[];
  const priorities = q(STAT.priority) as HTMLElement[];
  const cells = q(STAT.cell) as HTMLElement[];
  if (!spines.length && !cells.length) return;

  // ── Reduced motion: the whole page, ranked and legible. ──────────────────
  if (reduced) {
    gsap.set([...spines, ...priorities, ...cells], { autoAlpha: 1, x: 0, y: 0 });
    sgs.forEach((el) => {
      el.textContent = '−4.44';
    });
    return;
  }

  // Sorted by the AUTHORED rank, so the leak resolves first whatever order the
  // cells appear in the markup.
  const ranked = [...cells].sort(
    (a, b) => Number(a.dataset.rank ?? 0) - Number(b.dataset.rank ?? 0),
  );

  gsap.set(spines, { autoAlpha: 0, x: compact ? 0 : -DIST.instrument, y: compact ? DIST.textRise : 0 });
  gsap.set(priorities, { autoAlpha: 0, y: DIST.datum });
  gsap.set(ranked, { autoAlpha: 0, y: DIST.datum });
  // The headline figure starts as an em-dash, never a fabricated zero — the
  // same rule the product follows for a player with no rounds logged.
  sgs.forEach((el) => {
    el.textContent = '—';
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: compact ? 'top 80%' : 'top 72%',
      end: compact ? 'bottom 55%' : 'bottom 68%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  arrive(tl, spines, 0, { x: 0, y: 0, duration: DUR.long });
  // Counts the MAGNITUDE with an explicit minus prefix rather than counting to
  // a negative: `toFixed` would emit an ASCII hyphen, and this figure sits in
  // the mono face next to other numerals that use a real minus sign (U+2212).
  // The value also reads as a deficit at every frame, never briefly positive.
  sgs.forEach((el) => {
    tl.add(countTo(el, 4.44, { decimals: 2, prefix: '−', duration: DUR.long }), 0.12);
  });
  arrive(tl, priorities, 0.4, { y: 0, duration: DUR.short });
  arrive(tl, ranked, 0.66, { y: 0, duration: DUR.short });

  tl.to({}, { duration: 0.3 });
}
