/**
 * Course illustration palette (DS-HEX).
 *
 * These colours paint a golf course: turf, sand, water, the pin and flag, the
 * ball and its lie. They describe real-world surfaces, not UI, so they
 * intentionally do NOT follow the Fairway theme: they are the same in light
 * and dark mode, and they are not design tokens. Keep every course
 * illustration hex in this one module; the SVG call sites import from here
 * instead of holding their own literals.
 *
 * Two scenes, because they were tuned separately and must not drift into each
 * other:
 *
 *   - COURSE_SCENE: the dark CoachHelm hole view (HoleShotPath: the corridor,
 *     turf, hazards and the PuttingZoom green panel).
 *   - HOLE_HERO_SCENE: the bright live-round hole hero (FairwayHoleHero).
 *
 * SVG presentation attributes take a plain value, so these stay literal hex.
 * The two dark canvases also appear as Tailwind arbitrary classes
 * (`bg-[#1a382e]`, `bg-[#132a20]`) at their call sites; Tailwind's JIT cannot
 * read an interpolated class, so those stay literal and point back here.
 *
 * Values are case-exact on purpose (`#16A34A`, `#9B2226`): tests assert the
 * rendered attribute strings, so consolidating must not change a single byte.
 */

/** Every lie key the HoleShotPath palettes carry (mirrors its `Lie` union). */
export type CourseLieKey =
  | 'tee'
  | 'fairway'
  | 'rough'
  | 'heavy_rough'
  | 'light_rough'
  | 'sand'
  | 'bunker'
  | 'green'
  | 'fringe'
  | 'water'
  | 'penalty'
  | 'other';

// ─── Dark CoachHelm hole view (HoleShotPath) ────────────────────────────────

export const COURSE_SCENE = {
  /** The hole view's dark canvas (Tailwind literal `bg-[#1a382e]` at the call site). */
  sceneCanvas: '#1a382e',
  /** The putting panel's dark canvas (Tailwind literal `bg-[#132a20]`); also its dot ink. */
  puttingCanvas: '#132a20',

  // Turf
  fieldTop: '#12241b',
  fieldBottom: '#0e1c15',
  fairwayTop: '#2c6248',
  fairwayBottom: '#245139',
  greenLight: '#4fa676',
  greenShade: '#3d8a63',
  fringeEdge: '#2f6b4f',
  teeBox: '#6f5a3f',

  // Green inset / putting panel
  insetGreenLight: '#8fcda3',
  insetGreenMid: '#5fa87e',
  insetGreenShade: '#3d7d5c',
  insetShadow: '#07140f',
  panelInk: '#122720',

  // Hazards
  waterTop: '#4aa6cc',
  waterBottom: '#2f7ba0',
  waterBank: '#1f5d80',
  waterGlint: '#d8f1fb',
  sand: '#d9be7f',
  sandEdge: '#a8915a',
  sandHighlight: '#f2e1af',
  roughPatch: '#2f5a44',
  roughPatchEdge: '#3a6b50',
  outOfBoundsFill: '#16332a',
  penaltyRed: '#f0715c',
  penaltyFlagEdge: '#7a2e22',

  // Pin, flag, ball, ink
  cream: '#f4ecd8',
  creamBright: '#f8f2dd',
  /** Golf-ball cream: the ball fill and every non-penalty shot line. */
  ballCream: '#fbf3e0',
  /** The deliberately subtle "reached the green" ball. */
  ballSubtle: '#fff9ec',
  white: '#ffffff',
  /** Dark punch stroke and label ink over the turf. */
  punch: '#10241c',
  pinShadow: '#0d1f17',
  cup: '#0a1a13',
  flag: '#e3543b',
  stone: '#a8a39a',

  /** The locked helm green (`--fw-color-accent-500`); a made putt's ring. */
  helmGreen: '#16A34A',
  /** Tooltip-only loss red: dark enough for AA on the light tooltip card. */
  sgTooltipLost: '#9B2226',
} as const;

/** Lie swatch fill (the legacy green-inset overlay in HoleShotPath). */
export const COURSE_LIE_SWATCH: Readonly<Record<CourseLieKey, string>> = {
  tee: '#f4ecd8',
  fairway: '#86c89e',
  rough: '#3a6b50',
  heavy_rough: '#2a5040', // unused after normalize but kept for safety
  light_rough: '#4a7d62',
  sand: '#d4b97a',
  bunker: '#d4b97a',
  green: '#86c89e',
  fringe: '#a8c89a',
  water: '#3a8fb8',
  penalty: '#c14a3a',
  other: '#a8a39a',
};

/**
 * Lie halo ring and penalty line on the dark scene: the same hue family per
 * lie, lifted just enough to stay legible on `COURSE_SCENE.sceneCanvas`.
 * Shared by HoleShotPath and PuttingZoom, which each used to hold a copy.
 */
export const COURSE_LIE_RING: Readonly<Record<CourseLieKey, string>> = {
  tee: '#f8f2dd',
  fairway: '#8fe3ae',
  rough: '#9bc47f',
  heavy_rough: '#84b06a',
  light_rough: '#a8d190',
  sand: '#eecf8f',
  bunker: '#eecf8f',
  green: '#9fe0b6',
  fringe: '#bcdcae',
  water: '#6cc3e2',
  penalty: '#f0715c',
  other: '#f8f2dd',
};

// ─── Bright live-round hole hero (FairwayHoleHero) ──────────────────────────

export const HOLE_HERO_SCENE = {
  /** The LOCKED helm green (#16A34A); the turf and fairway ring anchor on it. */
  helmGreen: '#16A34A',
  turfTop: '#1a6e44',
  /** Deep turf: the turf wash's bottom stop and the rough ring. */
  deepTurf: '#0f5a36',
  mownLane: '#2e9b63',
  greenLight: '#3fd585',
  greenShade: '#0e7034',
  ballLight: '#ffffff',
  ballShade: '#dfe4df',
  flag: '#e0563b',
  cup: '#0a1410',
  teeBox: '#d8c79e',
} as const;

/** Ball and landing ring tint per lie on the hole hero. */
export const HOLE_HERO_LIE_RING: Readonly<Record<string, string>> = {
  tee: '#cbb892',
  fairway: HOLE_HERO_SCENE.helmGreen,
  rough: HOLE_HERO_SCENE.deepTurf,
  sand: '#e8d9a6',
  green: '#34d17a',
  other: '#cfcac3',
};
