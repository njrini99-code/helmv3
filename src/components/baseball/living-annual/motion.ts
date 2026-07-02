/**
 * motion.ts — the shared framer-motion language for "The Living Annual"
 * (spec §4.4 + §8). Six principles, deduped into the variants that the
 * component kit reuses so every surface breathes on one timing curve.
 *
 * Discipline (matches the GolfHelm craft bar):
 *   • Cinematic ease-out only — NO bouncy springs on chrome or numerals.
 *   • ONE signature move per view: rules draw, THEN ink settles, THEN a Trace
 *     draws. Never all three competing.
 *   • `prefers-reduced-motion` is a first-class path: every factory takes a
 *     `reduced` flag and, when true, renders the FINAL state instantly (rules
 *     drawn, numbers set, traces fully drawn, stamps/pulses shown without
 *     motion).
 *   • GPU transform / opacity / SVG pathLength only — no layout-thrashing props.
 *
 * Import `m` / `useReducedMotion` from 'framer-motion' in the consuming
 * components (as the golf HeroInsightCard exemplar does); this module only
 * produces the variants + one convenience hook.
 */
import { useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';

/** Cinematic settle — the house curve (mirrors --fw-ease-glide). */
export const EASE_GLIDE: [number, number, number, number] = [0.16, 1, 0.3, 1];
/** Gentle decelerate for default reveals (mirrors --fw-ease-soft). */
export const EASE_SOFT: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
/**
 * Quick, decisive curve for the INTERACTION layer — press feedback + hover
 * reveals (spec §7's `pressable`/`HoverReveal` primitives). Distinct family
 * from the two settle curves above: those choreograph content ARRIVING,
 * this one choreographs a hand touching the page. No overshoot — a press
 * should feel immediate, not cinematic.
 */
export const EASE_PRESS: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Duration budget (seconds) for the six motion principles. */
export const DUR = {
  rule: 0.2, // RULES DRAW — 200ms
  ink: 0.4, // INK SETTLES — 400ms
  stampDown: 0.12, // STAMP PRESS — fast down ~120ms
  stampSettle: 0.26, // STAMP PRESS — slow settle ~260ms
  trace: 0.5, // TRACES DRAW
} as const;

/**
 * Generic duration ladder for the interaction layer (press / hover-reveal /
 * section reveal). `DUR` above stays principle-named (rule/ink/stamp/trace)
 * and untouched — reach for `PACE` when a primitive needs a plain "how long"
 * rather than a named spec principle. The middle two tiers are pinned to the
 * existing principles so nothing forks into a second timing scale:
 * `PACE.base === DUR.rule`, `PACE.slow === DUR.ink`.
 */
export const PACE = {
  fast: 0.12, // press / tap feedback
  base: DUR.rule, // hover lift/tint, rule draws — 0.2
  slow: DUR.ink, // section reveal, ink settling — 0.4
  cinematic: 0.6, // hero masthead / stamp ceremony
} as const;

/** Sibling-to-sibling delay (seconds) for any staggered entrance in the kit —
 *  {@link inkColumn} and {@link Reveal}'s `staggerIndex` both key off this so
 *  a ruled column and a card grid settle at the same cadence. */
export const STAGGER_STEP = 0.06;

/** Vertical settle distance for serif numerals/names (spec "translateY ~2px";
 *  nudged to 6px so it reads on 80–160px hero figures without feeling springy). */
const INK_SETTLE_Y = 6;

/**
 * RULES DRAW — the signature transition. A hairline baseline rule scales in
 * from the left on mount (`scaleX 0→1`). Apply to an element with a left
 * transform origin (`className="origin-left"`). Reduced motion → drawn.
 */
export function rulesDraw(reduced = false): Variants {
  return {
    hidden: { scaleX: reduced ? 1 : 0 },
    visible: {
      scaleX: 1,
      transition: reduced ? { duration: 0 } : { duration: DUR.rule, ease: EASE_SOFT },
    },
  };
}

/**
 * INK SETTLES — serif hero numerals/names arrive `opacity 0→1 + translateY +
 * blur 2px→0`. Pair with {@link inkColumn} on the parent to stagger a ruled
 * column top-to-bottom. Reduced motion → set (final state, no transition).
 */
export function inkSettles(reduced = false): Variants {
  return {
    hidden: reduced
      ? { opacity: 1, y: 0, filter: 'blur(0px)' }
      : { opacity: 0, y: INK_SETTLE_Y, filter: 'blur(2px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: reduced ? { duration: 0 } : { duration: DUR.ink, ease: EASE_GLIDE },
    },
  };
}

/**
 * Stagger container for a settling ruled column. Put on the parent and give
 * each child the {@link inkSettles} variants; the column "sets" top-to-bottom.
 */
export function inkColumn(reduced = false): Variants {
  return {
    hidden: {},
    visible: {
      transition: reduced ? {} : { staggerChildren: STAGGER_STEP, delayChildren: 0.04 },
    },
  };
}

/**
 * STAMP PRESS — grade reveals, seals, completeness snaps. Fast down → slow
 * settle with a hair of overshoot, "pressed not popped." Reduced motion →
 * shown instantly. Compose an ink-bleed layer separately with {@link inkBleed}.
 */
export function stampPress(reduced = false): Variants {
  return {
    hidden: reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.55 },
    visible: reduced
      ? { opacity: 1, scale: 1, transition: { duration: 0 } }
      : {
          opacity: [0, 1, 1],
          scale: [1.55, 0.94, 1],
          transition: {
            duration: DUR.stampDown + DUR.stampSettle,
            times: [0, 0.32, 1],
            ease: EASE_GLIDE,
          },
        },
  };
}

/**
 * Ink-bleed halo that accompanies a {@link stampPress} — a soft tint that
 * blooms then soaks back. Apply to a blurred, absolutely-positioned layer
 * behind the stamp. Reduced motion → a faint static soak.
 */
export function inkBleed(reduced = false): Variants {
  return {
    hidden: reduced ? { opacity: 0.16, scale: 1.12 } : { opacity: 0, scale: 0.9 },
    visible: reduced
      ? { opacity: 0.16, scale: 1.12, transition: { duration: 0 } }
      : {
          opacity: [0, 0.34, 0.16],
          scale: [0.9, 1.24, 1.14],
          transition: { duration: DUR.trace, ease: EASE_GLIDE },
        },
  };
}

/**
 * TRACES DRAW — viz strokes render like a pen moving, via SVG `pathLength`
 * (framer-motion's stroke-dashoffset mechanism). Reduced motion → the stroke
 * renders fully drawn and static. (ClayCanvas is a frame only; the Trace
 * primitive lands in a later wave, but the language lives here now.)
 */
export function traceDraw(reduced = false): Variants {
  return {
    hidden: { pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: reduced
        ? { duration: 0 }
        : {
            pathLength: { duration: DUR.trace, ease: EASE_SOFT },
            opacity: { duration: 0.1 },
          },
    },
  };
}

/**
 * Convenience hook — the reduced-motion flag plus the ready-made column
 * variants, so a surface can settle a ruled stack with two lines:
 *
 *   const { reduced, container, item, rule } = useSettleStagger();
 *   <m.div variants={container} initial="hidden" animate="visible"> …
 *     <m.div variants={item}> … </m.div>
 *   </m.div>
 */
export function useSettleStagger(): {
  reduced: boolean;
  container: Variants;
  item: Variants;
  rule: Variants;
} {
  const reduced = useReducedMotion() ?? false;
  return {
    reduced,
    container: inkColumn(reduced),
    item: inkSettles(reduced),
    rule: rulesDraw(reduced),
  };
}
