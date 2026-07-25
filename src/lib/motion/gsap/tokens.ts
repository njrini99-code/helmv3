/**
 * ============================================================================
 * Marketing motion tokens — the ONE timing/easing language for / and /products
 * ----------------------------------------------------------------------------
 * Every GSAP timeline on the marketing surfaces reads its numbers from here.
 * No magic numbers in scene files.
 *
 * THE HOUSE CURVE. Helm already had one signature easing before this system
 * existed, used by the golf app, the baseball app AND both marketing pages:
 *
 *   cubic-bezier(0.16, 1, 0.3, 1)
 *
 * It appears byte-identical in five places — `--fw-ease-glide`
 * (styles/design-tokens.css), `EASE_CINEMATIC` (lib/coachhelm/v3/motion.ts),
 * `EASE_GLIDE` (components/baseball/living-annual/motion.ts),
 * `--ease-cinematic` (styles/tokens.css) and `LANDING_EASE`
 * (components/landing/motion.tsx). Building on it is what makes these pages
 * read as Helm rather than as an animation template.
 *
 * TWO FAMILIES, NEVER MIXED:
 *   • ARRIVAL — anything the page brings to you. `glide`.
 *   • TOUCH   — anything a hand causes (hover, tap, chip, toggle). `emphasized`.
 * Living Annual's motion module states the distinction outright: those
 * choreograph content ARRIVING, this one choreographs a hand touching the page.
 *
 * BANNED: every overshoot curve in the repo (`--fw-ease-spring`,
 * `--ease-bounce`, `--ease-spring`). Overshoot on marketing chrome is precisely
 * what reads as template. There is no spring token in this file on purpose.
 *
 * DURATION LADDER — an honest conflict, resolved. The repo carries two ladders
 * that agree only at 280ms: `--fw-dur-*` (180/280/380/520) and v3's
 * `DURATION` (120/280/440/680). We adopt the v3 ladder because it is written as
 * an explicit contract ("four duration tiers, no in-between values allowed")
 * and because it is the ladder the actually-animated product surfaces
 * (HoleShotPath, Filmstrip, RoundSGSummary) already run on. `--fw-dur-*` stays
 * the CSS-level chrome ladder; these are the JS-level scene ladder.
 * ========================================================================== */

/** Easing curves, as GSAP `CustomEase`-free cubic-bezier strings. */
export const EASE = {
  /** Arrival. Cinematic ease-out-expo — hero, section enter, instrument settle. */
  glide: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Touch. Apple "emphasized" — simulated taps, chips, toggles, hovers. */
  emphasized: 'cubic-bezier(0.32, 0.72, 0, 1)',
  /** Hairlines and rules drawing ONLY. Gentle decelerate. */
  soft: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  /** Constant rate — only for scrubbed timelines, where scroll IS the easing. */
  none: 'none',
} as const;

/** Seconds. Four tiers, no in-between values. */
export const DUR = {
  /** 120ms — tap feedback, hover state change, chip flip. */
  micro: 0.12,
  /** 280ms — small content swap, badge in/out, single datum landing. */
  short: 0.28,
  /** 440ms — section enter, panel transition, instrument settle. */
  medium: 0.44,
  /** 680ms — hero reveal, page enter, the one big arrival per chapter. */
  long: 0.68,
  /** 900ms — a full multi-part sequence's TOTAL budget (see DRAW below). */
  sequence: 0.9,
} as const;

/**
 * Stagger between sibling entrances. 70ms is calibrated to feel like a wave,
 * not a stutter (lib/coachhelm/v3/motion.ts:60).
 */
export const STAGGER = {
  step: 0.07,
  /**
   * Wide rows compress and cap rather than letting total entrance time grow
   * unbounded — the exact escape hatch Filmstrip uses (FILM_STAGGER_STEP 0.02,
   * FILM_STAGGER_CAP 12), which keeps a long row inside the <600ms budget:
   * 12 × 20ms + 280ms ≈ 520ms.
   */
  wideStep: 0.02,
  wideCap: 12,
} as const;

/** Stagger for a row of `count` items — compresses automatically when wide. */
export function staggerFor(count: number): number {
  return count > STAGGER.wideCap ? STAGGER.wideStep : STAGGER.step;
}

/**
 * Shot-path draw budget, lifted verbatim from the in-app renderer
 * (HoleShotPath/index.tsx:494-529). A full shot sequence draws in under ~900ms
 * NO MATTER how many strokes: per-segment duration scales by real yardage
 * against a 280yd reference, and everything compresses proportionally rather
 * than the total growing. Scroll simply replaces the clock.
 */
export const DRAW = {
  baseDelay: 0.05,
  budget: 0.85,
  segmentMin: 0.12,
  segmentMax: 0.18,
  referenceYards: 280,
  /** Landing pulse on a shot dot the instant its segment finishes. */
  arrivalPulse: 0.22,
} as const;

/**
 * Travel distances (px). Deliberately small — this system moves things along
 * paths and grows them from baselines; it does not fling them.
 */
export const DIST = {
  /** Text line rising under an overflow-hidden mask. */
  textRise: 28,
  /** A datum arriving. */
  datum: 16,
  /** An instrument settling into place. */
  instrument: 40,
} as const;

/**
 * Perspective is allowed on the INSTRUMENT plane only, and each instrument
 * gets exactly ONE settle — never a continuous tilt tracking the cursor or the
 * scrollbar, which is the tell of a template parallax kit. 1700px matches the
 * existing DashboardReveal settle.
 */
export const DEPTH = {
  perspective: 1700,
  /** Max rotationX for an instrument settle, degrees. */
  settleTilt: 7,
} as const;

/** ScrollTrigger scrub values. `smooth` lags the timeline behind the scroll. */
export const SCRUB = {
  /** Tight — discrete/stepped sequences where lag would feel broken. */
  tight: 0.35,
  /** Default for continuous scrubs (path draw, bar growth). */
  smooth: 1,
  /** Long cinematic pins where the instrument should trail the scroll. */
  cinematic: 1.5,
} as const;

/**
 * Pin lengths, expressed in viewport heights, per responsive context. Mobile is
 * DESIGNED, not disabled: every concept keeps its meaning at reduced amplitude,
 * and no CTA ever sits behind a pin.
 */
export const PIN_VH = {
  desktop: { chapter: 2.4, deep: 3.2 },
  tablet: { chapter: 1.8, deep: 2.4 },
  mobile: { chapter: 1.5, deep: 2.0 },
} as const;

/** The single source of truth for the "stats from one round" figure. */
export const STATS_PER_ROUND = 85;
