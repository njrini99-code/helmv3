'use client';

/**
 * ============================================================================
 * Motion primitives — the product's four verbs, and nothing else
 * ----------------------------------------------------------------------------
 * The whole marketing motion language is: things TRAVEL a path, they DRAW,
 * they GROW from a baseline, or they SETTLE. These are the only shared
 * utilities; anything section-specific lives in that section's own scene file.
 * This is deliberately NOT a `fadeInOnScroll` kit.
 *
 * THE LAW THIS FILE ENFORCES — a datum never fades. It draws, grows from a
 * baseline, or travels. Only decorative elements may use opacity.
 *
 * That is a craft rule first, but it also happens to solve a real constraint:
 * `e2e/accessibility.spec.ts` runs axe against `/` at WCAG 2.1 AA + 2.2 AA with
 * ZERO tolerance, and axe samples computed styles while scrolling nodes into
 * view — so fractionally-opaque text reads as a false colour-contrast failure.
 * The existing landing system worked around this by animating clip-path instead
 * of opacity (components/landing/motion.tsx:17-20). Adopting the product's own
 * verbs dissolves the problem instead of working around it: `strokeDashoffset`,
 * `scaleX` from a baseline and `transform` travel are all FULL OPACITY at every
 * frame.
 *
 * Which is also why `maskedLines()` below moves text under an overflow-hidden
 * mask rather than fading it, and why there is no per-character opacity helper
 * anywhere in this file. SplitText char-opacity ramps are exactly the pattern
 * the repo's own comments warn against.
 * ========================================================================== */

import { gsap, SplitText } from './register';
import { DUR, EASE, DIST, DRAW, staggerFor } from './tokens';

// ─── TRAVEL / SETTLE: text ──────────────────────────────────────────────────

export interface MaskedLinesResult {
  /** The line elements to tween. Full opacity throughout — translate only. */
  lines: HTMLElement[];
  /** Restores the original DOM. MUST be called from the scene's cleanup. */
  revert: () => void;
}

/**
 * SplitText's default `aria: "auto"` stamps `aria-label="<the text>"` onto the
 * element it splits. On a `<p>` — which every prose target here is — that is a
 * PROHIBITED attribute: `paragraph` does not support an accessible name, and
 * axe fails it `aria-prohibited-attr` (serious) on the landing page at every
 * breakpoint. `"none"` is the correct mode for running prose: the split leaves
 * real inline text in the DOM (this mode adds no `aria-hidden` either), so the
 * paragraph still reads normally — it just stops claiming a name it may not
 * have. Do not "fix" a future violation here by switching to `"hidden"`; that
 * hides the copy from assistive tech entirely.
 */
const ARIA_MODE = 'none' as const;

/**
 * Split an element into lines, each wrapped in an overflow-hidden mask, and set
 * them to their pre-entrance position (fully below the mask, fully opaque).
 *
 * Returns the line nodes rather than a tween so the caller decides whether they
 * are triggered or scrubbed, and how they sit in a larger timeline.
 *
 * `revert()` is not optional: SplitText rewrites the element's innerHTML, and
 * leaving that in place breaks text selection, copy/paste and — because the
 * wrappers change line-box metrics — re-measurement on resize.
 */
export function maskedLines(target: HTMLElement): MaskedLinesResult {
  const split = new SplitText(target, {
    type: 'lines',
    // Each line gets its own mask element, so `overflow: hidden` clips the
    // line's own travel without clipping descenders of neighbouring lines.
    mask: 'lines',
    linesClass: 'fw-line',
    aria: ARIA_MODE,
  });

  const lines = split.lines as HTMLElement[];
  gsap.set(lines, { yPercent: 110 });

  return {
    lines,
    revert: () => split.revert(),
  };
}

/**
 * Arrival for something that CANNOT be masked — a whole panel, a highlighted
 * row, a receipts block: visibility SNAPS once, then only the transform is
 * scrubbed.
 *
 * THE RULE THIS ENFORCES. Never interpolate opacity on a scrubbed timeline.
 * Scroll is not a clock: the reader stops wherever they stop, so a "fade" is
 * not a transition, it is a RESTING STATE at whatever fraction that was. This
 * shipped — "SG · App +0.4" sat permanently at `opacity: 0.27` on the live
 * landing page — and a sweep then found the same thing in two more scenes,
 * including ranked stat copy measured at 1.34:1. `autoAlpha` does not save you:
 * it only flips `visibility` at exactly 0 and interpolates normally in between.
 *
 * `set()` is a zero-duration tween, so it still scrubs cleanly in both
 * directions; the element is either absent or fully legible, and the movement
 * carries the arrival on its own. Masked text (see {@link maskedLines}) is the
 * better tool when the target IS text; this is for everything else.
 *
 * Guarded by `e2e/landing-motion-legibility.spec.ts`.
 */
export function arrive(
  tl: gsap.core.Timeline,
  // `Element`, not `HTMLElement`: the products dock brings in SVG nodes on the
  // same schedule as HTML readouts, and GSAP targets both identically.
  els: readonly Element[],
  at: number,
  vars: gsap.TweenVars = {},
): void {
  const step = staggerFor(els.length);
  els.forEach((el, i) => {
    const t = at + i * step;
    tl.set(el, { autoAlpha: 1 }, t);
    // A pure snap (no transform to animate) is a legitimate arrival for a
    // highlight/wash — but an empty tween would still be scheduled, so only add
    // one when there is actually something to move.
    if (Object.keys(vars).length) tl.to(el, { ease: EASE.glide, ...vars }, t);
  });
}

/** The standard arrival tween for masked lines. Translate only — never opacity. */
export function revealLines(lines: HTMLElement[], vars: gsap.TweenVars = {}): gsap.core.Tween {
  return gsap.to(lines, {
    yPercent: 0,
    duration: DUR.long,
    ease: EASE.glide,
    stagger: staggerFor(lines.length),
    ...vars,
  });
}

/** Word-level variant, for the one place a sentence assembles word by word. */
export function maskedWords(target: HTMLElement): MaskedLinesResult {
  const split = new SplitText(target, { type: 'words', mask: 'words', wordsClass: 'fw-word', aria: ARIA_MODE });
  const words = split.words as HTMLElement[];
  gsap.set(words, { yPercent: 110 });
  return { lines: words, revert: () => split.revert() };
}

// ─── DRAW: paths ────────────────────────────────────────────────────────────

/**
 * Prepare an SVG path for a draw-in, using stroke-dash rather than a paid
 * plugin. Returns the path length so callers can schedule by real geometry.
 */
export function prepareDraw(path: SVGPathElement): number {
  const length = path.getTotalLength();
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 1 });
  return length;
}

/**
 * Duration for one shot segment, scaled by its real yardage against the
 * reference — the same schedule the in-app renderer uses, so a marketing hole
 * and a real hole draw at the same rate.
 */
export function segmentDuration(yards: number): number {
  const ratio = Math.min(1, Math.max(0, yards / DRAW.referenceYards));
  return DRAW.segmentMin + (DRAW.segmentMax - DRAW.segmentMin) * ratio;
}

/**
 * Schedule a multi-segment path draw inside `DRAW.budget`, compressing
 * proportionally when the raw total would exceed it — so an 8-shot hole and a
 * 3-shot hole both finish in the same beat instead of the long one running
 * away. Mirrors HoleShotPath/index.tsx:494-529.
 */
export function drawSchedule(yardages: number[]): { at: number; duration: number }[] {
  const raw = yardages.map(segmentDuration);
  const total = raw.reduce((a, b) => a + b, 0);
  const scale = total > DRAW.budget ? DRAW.budget / total : 1;
  let cursor = DRAW.baseDelay;
  return raw.map((d) => {
    const duration = d * scale;
    const at = cursor;
    cursor += duration;
    return { at, duration };
  });
}

// ─── GROW: bars from a baseline ─────────────────────────────────────────────

/**
 * Prepare a bar to grow from a zero baseline. `direction` matters: the strokes-
 * gained tornado grows RIGHT for gained and LEFT for lost from a shared dashed
 * centre line, so the transform origin has to follow the sign.
 *
 * scaleX (not width) keeps this on the compositor and off the layout thread.
 */
export function prepareBar(el: HTMLElement, direction: 'right' | 'left'): void {
  gsap.set(el, {
    scaleX: 0,
    transformOrigin: direction === 'right' ? 'left center' : 'right center',
    opacity: 1,
  });
}

export function growBar(el: HTMLElement | HTMLElement[], vars: gsap.TweenVars = {}): gsap.core.Tween {
  return gsap.to(el, {
    scaleX: 1,
    duration: DUR.medium,
    ease: EASE.glide,
    ...vars,
  });
}

// ─── COUNT: earned numerals ─────────────────────────────────────────────────

/**
 * Count a numeric readout up to `value`. Used where a number should be EARNED
 * on screen rather than asserted — the derivation of one round into its stats,
 * the strokes-at-stake total, the resolved-signals count.
 *
 * `snap` keeps it on integers (or to `decimals`) so it never paints a
 * meaningless fractional frame, and the element gets `tabular-nums` at the call
 * site so the width does not jitter as digits change.
 */
export function countTo(
  el: HTMLElement,
  value: number,
  {
    decimals = 0,
    prefix = '',
    suffix = '',
    /**
     * What to render while the count is still at zero. Defaults to an em-dash
     * rather than "0", because on a SCRUBBED timeline the reader can sit at
     * progress 0 indefinitely — and a readout that says "0 ft" when no shot has
     * been logged is a fabricated measurement. The product itself makes exactly
     * this choice: a qualifier player with no rounds shows an em-dash, never a
     * fake "E". Pass `null` to allow a real zero.
     */
    zeroPlaceholder = '—',
    ...vars
  }: gsap.TweenVars & {
    decimals?: number;
    prefix?: string;
    suffix?: string;
    zeroPlaceholder?: string | null;
  } = {},
): gsap.core.Tween {
  const state = { v: 0 };
  const factor = 10 ** decimals;
  return gsap.to(state, {
    v: value,
    duration: DUR.long,
    ease: EASE.glide,
    snap: { v: 1 / factor },
    onUpdate: () => {
      if (state.v === 0 && zeroPlaceholder !== null) {
        el.textContent = zeroPlaceholder;
        return;
      }
      el.textContent = `${prefix}${state.v.toFixed(decimals)}${suffix}`;
    },
    ...vars,
  });
}

// ─── SETTLE: instruments ────────────────────────────────────────────────────

/**
 * The single settle an instrument (a glass-bezelled product surface) is allowed.
 * Perspective lives on the INSTRUMENT plane only, and each instrument settles
 * exactly ONCE — never a continuous tilt tracking the cursor or the scrollbar,
 * which is the tell of a template parallax kit.
 */
export function prepareSettle(el: HTMLElement, tilt: number): void {
  gsap.set(el, {
    rotationX: tilt,
    y: DIST.instrument,
    transformPerspective: 1700,
    transformOrigin: 'center top',
    opacity: 1,
  });
}

export function settle(el: HTMLElement, vars: gsap.TweenVars = {}): gsap.core.Tween {
  return gsap.to(el, {
    rotationX: 0,
    y: 0,
    duration: DUR.long,
    ease: EASE.glide,
    ...vars,
  });
}

/**
 * Render every prepared element at its settled end state, with no animation.
 * Reduced-motion scene bodies call this instead of building a timeline — the
 * information survives in full, only the choreography goes.
 */
export function renderSettled(targets: gsap.TweenTarget): void {
  gsap.set(targets, {
    clearProps: 'transform,opacity,strokeDasharray,strokeDashoffset',
    yPercent: 0,
    scaleX: 1,
    rotationX: 0,
    y: 0,
    opacity: 1,
  });
}
