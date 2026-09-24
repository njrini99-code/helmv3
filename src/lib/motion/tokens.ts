/**
 * GolfHelm motion tokens (audit MOT-01; spec: motion-haptics §3).
 *
 * Motion is fast, interruptible and communicative. It never delays input.
 * Every spring re-targets from the current velocity, so anything a finger can
 * touch uses a spring from here, never a keyframe array.
 *
 * CSS partners live in `src/styles/design-tokens.css` (`--fw-ease-out`,
 * `--fw-dur-press`, `--fw-dur-push`). The older `--fw-dur-*` values are shared
 * with Baseball / Lift Lab, so they are NOT retimed here (owner OD-17); golf
 * code should reach for these tokens instead.
 *
 * Re-exported from `src/lib/coachhelm/v3/motion.ts`.
 */
import type { Transition } from 'framer-motion';

/** Framer springs. */
export const SPRING = {
  /** About 120ms, no visible overshoot: press release, segmented/switch thumb, shake. */
  snappy: { type: 'spring', stiffness: 700, damping: 40, mass: 0.6 },
  /** Bottom sheets and phone dialogs; seed `velocity` from the drag. */
  sheet: { type: 'spring', stiffness: 380, damping: 38, mass: 1 },
  /** About 350ms settle: detail push/pop, hole paging, picker course → tees. */
  push: { type: 'spring', stiffness: 420, damping: 42, mass: 1 },
  /** The one celebratory moment per flow (success badge). */
  gentle: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof SPRING;

/** Durations in milliseconds. No UI tween may exceed `push`. */
export const DURATION_MS = {
  press: 90,
  fast: 150,
  base: 200,
  medium: 240,
  push: 320,
} as const;

/** The same durations in seconds, for framer `transition.duration`. */
export const DURATION_S = {
  press: DURATION_MS.press / 1000,
  fast: DURATION_MS.fast / 1000,
  base: DURATION_MS.base / 1000,
  medium: DURATION_MS.medium / 1000,
  push: DURATION_MS.push / 1000,
} as const;

/** Cubic-bezier curves as framer arrays (match the CSS `--fw-ease-*`). */
export const EASE = {
  /** Default UI ease-out. */
  out: [0.2, 0, 0, 1],
  /** Colour / opacity. */
  soft: [0.22, 0.61, 0.36, 1],
  /** iOS sheet / push curve. */
  emph: [0.32, 0.72, 0, 1],
} as const;

/** Press-down scale per target class (spec §3.3). */
export const PRESS_SCALE = {
  /** Primary / secondary buttons, pills, chips. */
  button: 0.97,
  /** Icon buttons: the glyph only; the 44pt hit area stays still. */
  icon: 0.92,
  /** List rows / cells: tint only, never a transform. */
  row: 1,
  /** Cards and large surfaces. */
  surface: 0.985,
} as const;

/** Error shake: 3 × 6px over 240ms on the `snappy` curve (spec §4 #14). */
export const SHAKE = {
  distancePx: 6,
  cycles: 3,
  durationMs: 240,
} as const;

/** Success checkmark stroke draw (spec §4 #13). */
export const SUCCESS_CHECK_DRAW_MS = 260;

/** Skeleton → content: hard swap under this, 150ms crossfade at or above it (spec §4 #16). */
export const SKELETON_SWAP_THRESHOLD_MS = 300;
export const SKELETON_CROSSFADE_MS = 150;
