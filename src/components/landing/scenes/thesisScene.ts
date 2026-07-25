'use client';

/**
 * ============================================================================
 * L2 · The thesis — three concerns becoming one view
 * ----------------------------------------------------------------------------
 * Three stacked `Reveal`s: eyebrow fades up, statement fades up, paragraph
 * fades up. That is the pattern the brief rules out by name, and on the page's
 * second section it sets the expectation that everything below is a list.
 *
 * The section's actual claim is in its last four words — "one coherent
 * operating view" — and its eyebrow already names the three things being made
 * coherent: Coaching / Performance / Program. So the eyebrow performs the
 * claim. The three terms begin STACKED, as three separate concerns a coach
 * juggles, and Flip resolves them into a single line.
 *
 * WHY THIS IS A REAL FLIP AND NOT A TRANSFORM. Column-to-row is a layout
 * change: the words' widths, their baselines and the separators between them
 * are all decided by the browser in the end state, and none of it is knowable
 * in advance at an arbitrary viewport or font-size. Flip records the stacked
 * layout, lets the browser compute the real inline one, and interpolates.
 * Hand-authoring it would mean hard-coding three x/y offsets that break at
 * every breakpoint and on every copy edit.
 *
 * The separators are the only thing here that fades, and they are `aria-hidden`
 * punctuation — they are not a datum, and there is nothing to read in them.
 * ========================================================================== */

import { gsap, Flip } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, STAGGER } from '@/lib/motion/gsap/tokens';
import { maskedLines } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const THESIS = {
  pillars: '[data-thesis="pillars"]',
  pillar: '[data-thesis="pillar"]',
  sep: '[data-thesis="sep"]',
  statement: '[data-thesis="statement"]',
  body: '[data-thesis="body"]',
} as const;

export function thesisScene({ root, reduced }: SceneContext): void | (() => void) {
  const q = gsap.utils.selector(root);
  const pillars = q(THESIS.pillars)[0] as HTMLElement | undefined;
  const words = q(THESIS.pillar) as HTMLElement[];
  const seps = q(THESIS.sep) as HTMLElement[];
  const statement = q(THESIS.statement)[0] as HTMLElement | undefined;
  const body = q(THESIS.body)[0] as HTMLElement | undefined;

  // ── Reduced motion: the resolved line, the statement, the paragraph. ─────
  if (reduced) {
    gsap.set(seps, { opacity: 1 });
    gsap.set([statement, body].filter(Boolean) as HTMLElement[], { opacity: 1, y: 0 });
    return;
  }

  const s = statement ? maskedLines(statement) : undefined;
  const b = body ? maskedLines(body) : undefined;
  const revert = () => {
    s?.revert();
    b?.revert();
  };

  if (!pillars || words.length < 2) {
    // Still run the type reveal even if the eyebrow is absent.
    if (s || b) {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 76%', end: 'center 56%', scrub: SCRUB.smooth },
      });
      if (s) tl.to(s.lines, { yPercent: 0, duration: DUR.long, ease: EASE.glide, stagger: STAGGER.step }, 0);
      if (b) tl.to(b.lines, { yPercent: 0, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.wideStep }, 0.3);
    }
    return revert;
  }

  // 1. FIRST — the three concerns, stacked and separate.
  gsap.set(seps, { opacity: 0 });
  gsap.set(pillars, { flexDirection: 'column', alignItems: 'flex-start', gap: '6px' });
  const stacked = Flip.getState(words);

  // 2. LAST — hand the layout back. The browser decides the real inline
  //    positions; nothing about them is written here.
  gsap.set(pillars, { clearProps: 'flexDirection,alignItems,gap' });

  const resolve = Flip.from(stacked, {
    duration: 1,
    ease: EASE.none,
    stagger: { each: STAGGER.wideStep },
    absolute: true,
    paused: true,
  });

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: 'top 76%',
      end: 'center 56%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
      // Same reason as the products dock: a `Flip.from` timeline cannot be
      // handed to ScrollTrigger's `animation` option — its refresh lifecycle
      // calls `animation.revert().invalidate()`, which that timeline does not
      // support. Driving progress directly is equivalent and safe.
      onUpdate: (self) => resolve.progress(Math.min(1, self.progress / 0.45)),
      onRefresh: (self) => resolve.progress(Math.min(1, self.progress / 0.45)),
    },
  });

  // The separators only appear once the words are on one line — before that
  // there is nothing for them to separate.
  tl.to(seps, { opacity: 1, duration: DUR.short, ease: EASE.glide, stagger: STAGGER.wideStep }, 0.42);
  if (s) tl.to(s.lines, { yPercent: 0, duration: DUR.long, ease: EASE.glide, stagger: STAGGER.step }, 0.46);
  if (b) tl.to(b.lines, { yPercent: 0, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.wideStep }, 0.78);

  return revert;
}
