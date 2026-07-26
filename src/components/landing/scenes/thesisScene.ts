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

import { gsap, Flip, ScrollTrigger } from '@/lib/motion/gsap/register';
import { DUR, EASE, STAGGER } from '@/lib/motion/gsap/tokens';
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
    // Still run the type reveal even if the eyebrow is absent — on the clock,
    // for the same reason the main path is: a masked line is only legible at
    // the two ends of its travel.
    if (s || b) {
      const tl = gsap.timeline({ paused: true });
      if (s) tl.to(s.lines, { yPercent: 0, duration: DUR.long, ease: EASE.glide, stagger: STAGGER.step }, 0);
      if (b) tl.to(b.lines, { yPercent: 0, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.step }, 0.3);
      ScrollTrigger.create({
        trigger: root,
        start: 'top 76%',
        onEnter: () => tl.play(),
        onRefresh: (self) => {
          if (self.progress > 0) tl.progress(1);
        },
      });
    }
    return revert;
  }

  // The row's resolved height, reserved BEFORE anything moves. `absolute: true`
  // lifts all three words out of flow for the duration of the resolve, and
  // without a floor the row collapses to zero — which shunts the statement and
  // the paragraph below it upward and then drops them back. Reserving the height
  // costs nothing and keeps the column still.
  gsap.set(pillars, { minHeight: pillars.getBoundingClientRect().height });

  // 1. FIRST — the three concerns, stacked and separate.
  gsap.set(seps, { opacity: 0 });
  gsap.set(pillars, { flexDirection: 'column', alignItems: 'flex-start', gap: '6px' });
  const stacked = Flip.getState(words);

  // 2. LAST — hand the layout back. The browser decides the real inline
  //    positions; nothing about them is written here.
  gsap.set(pillars, { clearProps: 'flexDirection,alignItems,gap' });

  // PLAYED, NOT SCRUBBED. This was driven off scroll progress, which meant the
  // words spent the whole trigger window mid-flight: three absolutely-positioned
  // labels sitting at staggered diagonal offsets, parked there for as long as
  // the reader stopped scrolling. A resolve you can halt halfway is a resolve
  // that reads as breakage — the shape only says "three things becoming one"
  // if it completes. Scroll starts it; the clock finishes it.
  const resolve = Flip.from(stacked, {
    duration: DUR.long,
    ease: EASE.glide,
    stagger: { each: STAGGER.step },
    absolute: true,
    paused: true,
    // Flip leaves the words absolute until the tween ends; once they are back
    // in flow the reserved floor is no longer needed and would fight a resize.
    onComplete: () => gsap.set(pillars, { clearProps: 'minHeight' }),
  });

  // ONE arrival, on the clock. Everything here used to hang off a scrub, which
  // meant a reader who stopped mid-window was left looking at half-resolved
  // words above a headline sliced through the middle of its own line-boxes. A
  // masked line reveal is legible at 0% and at 100% and at no point between, so
  // tying it to scroll position tied LEGIBILITY to scroll position.
  //
  // Scroll decides WHEN the section arrives; it no longer decides how far
  // through its own arrival the section is allowed to be.
  const tl = gsap.timeline({ paused: true });

  // The separators only appear once the words are on one line — before that
  // there is nothing for them to separate. They ride the tail of the resolve.
  tl.to(seps, { opacity: 1, duration: DUR.short, ease: EASE.glide, stagger: STAGGER.step }, DUR.long * 0.7);
  if (s) tl.to(s.lines, { yPercent: 0, duration: DUR.long, ease: EASE.glide, stagger: STAGGER.step }, DUR.long * 0.75);
  if (b) tl.to(b.lines, { yPercent: 0, duration: DUR.medium, ease: EASE.glide, stagger: STAGGER.step }, DUR.long * 1.15);

  const settle = () => {
    resolve.progress(1);
    tl.progress(1);
  };

  ScrollTrigger.create({
    trigger: root,
    start: 'top 76%',
    invalidateOnRefresh: true,
    // `Flip.from` cannot be handed to ScrollTrigger's `animation` option — its
    // refresh lifecycle calls `animation.revert().invalidate()`, which that
    // timeline does not support — so both are started by hand.
    onEnter: () => {
      resolve.play();
      tl.play();
    },
    // Arriving already past the trigger (deep link, restored scroll, a resize
    // that re-runs this context) must show the settled section, never a
    // half-resolved one frozen forever because `onEnter` will not fire again.
    onRefresh: (self) => {
      if (self.progress > 0) settle();
    },
  });

  return revert;
}
