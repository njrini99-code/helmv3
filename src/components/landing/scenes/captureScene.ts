'use client';

/**
 * ============================================================================
 * L3 · Capture scene — "every shot, in its place"
 * ----------------------------------------------------------------------------
 * This is the chapter the hero's trace was promising. The hero draws an
 * abstract flight line over a photograph; here the SAME gesture happens inside
 * real product UI, on a real hole, on the product's own schedule. That handoff
 * is what stops the hero trace from being decoration.
 *
 * The single largest delta between what Helm does and what its homepage showed:
 * the app animates a ball down a hole shot-by-shot (HoleShotPath draws each
 * segment's `pathLength` 0→1 on a yardage-scaled schedule, with a ball riding
 * the curve and a landing pulse on arrival) — while the landing page rendered
 * the whole thing as ONE static dashed polyline with dots fading in on a timer
 * unrelated to scroll. This scene closes that gap.
 *
 * Scroll replaces the clock. Each segment draws in sequence, the ball rides the
 * head of whichever segment is currently drawing, each numbered dot pulses the
 * instant its segment lands, and only then does the result chip resolve to
 * "Green" and the proximity readout count to 18 ft — because that is the order
 * the data is actually produced. Nothing appears before the shot that caused it.
 *
 * Everything here is full opacity at every frame (stroke-dash, transform,
 * scale) — the datum-never-fades law, which also keeps axe's colour-contrast
 * sampling deterministic.
 * ========================================================================== */

import { gsap } from '@/lib/motion/gsap/register';
import { DUR, EASE, SCRUB, DRAW, STAGGER } from '@/lib/motion/gsap/tokens';
import { prepareDraw, drawSchedule, countTo } from '@/lib/motion/gsap/primitives';
import type { SceneContext } from '@/lib/motion/gsap/useScene';

export const CAPTURE = {
  stage: '[data-capture="stage"]',
  segment: '[data-shot-seg]',
  dot: '[data-shot-dot]',
  ball: '[data-shot-ball]',
  chipActive: '[data-capture="chip-active"]',
  proximity: '[data-capture="proximity"]',
  readout: '[data-capture="readout"]',
  copy: '[data-capture="copy"]',
} as const;

const PROXIMITY_FEET = 18;

export function captureScene({ root, reduced, compact }: SceneContext): void {
  const q = gsap.utils.selector(root);
  // `gsap.utils.selector` is typed for HTML; these targets are SVG, so the
  // cast goes through `unknown` rather than pretending the types overlap.
  const segments = q(CAPTURE.segment) as unknown as SVGPathElement[];
  const dots = q(CAPTURE.dot) as unknown as SVGCircleElement[];
  const ball = q(CAPTURE.ball)[0] as unknown as SVGCircleElement | undefined;
  const chip = q(CAPTURE.chipActive)[0] as HTMLElement | undefined;
  const proximity = q(CAPTURE.proximity)[0] as HTMLElement | undefined;
  const readouts = q(CAPTURE.readout) as HTMLElement[];

  if (!segments.length) return;

  // ── Reduced motion: the whole hole drawn, every readout final ─────────────
  if (reduced) {
    segments.forEach((s) => gsap.set(s, { strokeDasharray: 'none', strokeDashoffset: 0 }));
    gsap.set(dots, { scale: 1, opacity: 1, transformOrigin: 'center' });
    if (ball) gsap.set(ball, { opacity: 0 });
    if (chip) gsap.set(chip, { scale: 1, autoAlpha: 1 });
    if (proximity) proximity.textContent = `${PROXIMITY_FEET} ft`;
    gsap.set(readouts, { opacity: 1, y: 0 });
    return;
  }

  // ── Prep ──────────────────────────────────────────────────────────────────
  const lengths = segments.map(prepareDraw);
  const yardages = segments.map((s) => Number(s.dataset.yards) || DRAW.referenceYards);
  const schedule = drawSchedule(yardages);

  // Dots are scaled from 0 rather than faded — a datum never fades.
  gsap.set(dots, { scale: 0, transformOrigin: 'center', opacity: 1 });
  if (ball) gsap.set(ball, { opacity: 0 });
  // The chip is a LABEL — it says which surface the shot finished on. Ramping
  // its opacity means that for most of the scrub it is white text on a
  // part-transparent green, which axe measures (correctly) as 4.46:1 against
  // the cream behind it. The same "a datum never fades" rule the rest of this
  // page follows applies here: it arrives by scaling from the tap point, and
  // its own text is fully opaque the entire time.
  if (chip) gsap.set(chip, { scale: 0.82, autoAlpha: 0, transformOrigin: 'center' });
  if (proximity) proximity.textContent = '—';
  gsap.set(readouts, { opacity: 0, y: 12 });

  // The whole chapter is one scrubbed timeline. `end` is generous enough that
  // the sequence reads as deliberate rather than flicking past, but the section
  // is NOT pinned on phone — a pinned corridor on a 390px screen costs more in
  // reachability than it buys in drama.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: root,
      start: compact ? 'top 78%' : 'top 65%',
      end: compact ? 'bottom 70%' : 'bottom 55%',
      scrub: SCRUB.smooth,
      invalidateOnRefresh: true,
    },
  });

  // ── The shot sequence ─────────────────────────────────────────────────────
  segments.forEach((segment, i) => {
    const step = schedule[i];
    const length = lengths[i];
    if (!step || length === undefined) return;
    const { at, duration } = step;
    const head = { p: 0 };

    tl.to(
      head,
      {
        p: 1,
        duration,
        ease: EASE.none,
        onUpdate: () => {
          gsap.set(segment, { strokeDashoffset: length * (1 - head.p) });
          if (!ball) return;
          const point = segment.getPointAtLength(length * head.p);
          gsap.set(ball, { attr: { cx: point.x, cy: point.y }, opacity: 1 });
        },
      },
      at,
    );

    // The landing pulse fires the instant its own segment finishes — the dot
    // is the RESULT of that shot, so it cannot exist before the shot lands.
    const dot = dots[i];
    if (dot) {
      tl.to(dot, { scale: 1, duration: DRAW.arrivalPulse, ease: EASE.glide }, at + duration);
    }
  });

  const last = schedule[schedule.length - 1];
  const sequenceEnd = last ? last.at + last.duration + DRAW.arrivalPulse : 0;

  // Park the ball once the last shot has landed: the numbered dot takes over as
  // the record of where it finished.
  if (ball) tl.to(ball, { opacity: 0, duration: DUR.micro, ease: EASE.none }, sequenceEnd);

  // ── The result resolves ───────────────────────────────────────────────────
  // Only NOW does the UI know the shot finished on the green, so only now does
  // the chip select and the proximity resolve. This ordering is the product's
  // actual write path, not a decorative stagger.
  if (chip) {
    // `autoAlpha` toggles VISIBILITY alongside opacity, so the chip is either
    // absent from the accessibility tree or fully rendered — never a
    // half-transparent swatch that reads as a contrast failure.
    tl.to(chip, { scale: 1, autoAlpha: 1, duration: DUR.short, ease: EASE.emphasized }, sequenceEnd + 0.05);
  }
  if (proximity) {
    tl.add(
      countTo(proximity, PROXIMITY_FEET, { suffix: ' ft', duration: DUR.medium, ease: EASE.glide }),
      sequenceEnd + 0.12,
    );
  }

  // The derived stats land last — they are downstream of the result.
  if (readouts.length) {
    tl.to(
      readouts,
      { opacity: 1, y: 0, duration: DUR.short, ease: EASE.glide, stagger: STAGGER.step },
      sequenceEnd + 0.24,
    );
  }
}
