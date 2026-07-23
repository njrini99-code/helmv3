/**
 * HoleShotPath — the premium round-review hole visualization.
 *
 * What it shows: every shot on one hole, plotted geometrically from
 * the player's logged distance/lie/miss data, connected by Bezier
 * ball-flight arcs, with hazards rendered AT the actual endpoint
 * where the player's ball ended up.
 *
 * Reads the same canonical motion library + surface tokens as the
 * rest of v3 — drops into any surface tier (strip in a grid, card
 * inline, or hero in a hole detail page).
 *
 * MOTION MODEL — two distinct triggers, one shared timing budget:
 *   1. "Rich" sizes (card/inline/reviewCard/hero, `variant.interactive`)
 *      draw in shot-by-shot on MOUNT (segment `pathLength` 0→1, a small
 *      traveling ball marker riding the same Bezier the segment draws,
 *      then a landing-pulse on the numbered dot right as its segment
 *      finishes). A parent that wants this to REPLAY when the "active"
 *      hole changes without an unmount (e.g. `ReviewHero` scrubbing
 *      between holes) does so by remounting via `key` — see
 *      `ReviewHero`'s `key={openHole}` on its `<HoleShotPath>` call.
 *   2. The `strip` size (Filmstrip's 18-at-once grid) never remounts —
 *      it instead takes a CONTROLLED `active` prop. A `false → true`
 *      edge swaps the segments from a plain static `<path>` to an
 *      animated `m.path` (a key change, so React remounts that one
 *      node and Framer replays `initial → animate` fresh every time);
 *      `true → false` snaps back to the static path instantly — ready
 *      to replay on the next hover, never a loop while still hovered.
 *      Segments only at this scale (no ball, no tooltip — too small to
 *      read either) per the perf budget: 18 simultaneous instances,
 *      only the ONE actively-hovered cell ever renders a `m.*` node.
 *
 * Public API: see ./types.ts — HoleShotPathProps. The component is
 * purely presentational; data comes from server-fetched shot rows.
 *
 * GREEN DETAIL, 2026-07-22 redesign: `reviewCard`/`hero` no longer draw the
 * green-inset "lens" INSIDE this SVG (see `SIZES[*].showGreenZoom`) — the
 * detail circle that used to be crammed into the corner of this box, making
 * green→green putts on a par-3 collapse to a couple of illegible pixels, is
 * now its own sibling panel: `./PuttingZoom.tsx`. A caller that wants both
 * (the round-review detail panel does) renders them side by side; `card`/
 * `inline` keep the old crammed-lens behavior for now (untouched, unused in
 * production today — see HoleShotPath.render.test.tsx).
 *
 * LINE + MARKER REDESIGN, same day: flight segments no longer carry the lie
 * signal via color — every non-penalty segment is one bold, cased, warm
 * cream line (transit-map style, legible against `turf.tsx`'s new flat
 * ground); a penalty is the one lie signal a line still keeps, via dashed
 * red. The lie signal moved to the numbered dot's outer halo ring instead —
 * the dot's own FILL is now always the same golf-ball cream, never
 * lie-green, so a ball never disappears against a same-colored background.
 *
 * GREEN CORRIDOR DECLUTTER, Wave C (2026-07-23): with every on-green shot
 * now getting a full, legible treatment in `PuttingZoom` (min-separation
 * leader ticks, an explicit make/miss glyph, a break/slope read annotation,
 * per-putt SG), rendering the SAME full numbered-dot + always-on-SG-badge
 * treatment for each of them HERE too was actively harmful — putts collapse
 * toward the pin on this corridor's true-to-scale axis (see geometry.ts's
 * module doc), so their numbers and badges collided into an illegible smear
 * right under the flag. The main `plot.shots.map` below now renders NOTHING
 * for an on-green shot except the single green-ENTRY shot (the approach
 * that first reached the green), and even that marker is deliberately
 * simplified (no number, no SG badge, no miss glyph) — just enough to say
 * "the approach reached the green." See that map's own inline comment for
 * the exact rule.
 */

'use client';

import { useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { Turf, GreenInsetScenery } from './turf';
import { Hazards } from './hazards';
import {
  VB,
  plotHole,
  segmentPath,
  formatYards,
  formatFeet,
  scoreToParLabel,
  type PlottedShot,
} from './geometry';
import { normalizeLie, type HoleShotPathProps, type Lie } from './types';
import {
  EASE_CINEMATIC,
  enterVariants,
  enterTransition,
  liftHover,
  tapPress,
  useReducedMotionGuard,
} from '@/lib/coachhelm/v3/motion';

// -----------------------------------------------------------------------------
// Size variants — defined once, picked via `size` prop.
// -----------------------------------------------------------------------------

const SIZES = {
  strip: {
    /** ~28×112 — fits inside an 18-hole grid cell */
    className: 'w-7 h-28 md:w-8 md:h-32',
    showShotNumbers: false,
    showScore: false,
    showHeader: false,
    showFlag: false,
    interactive: false,
    // Too narrow to hold the "No shots logged" caption without overflow —
    // the turf/pin visual alone reads fine as an empty state at this scale.
    showEmptyLabel: false,
    // No room for a legible lens at this scale regardless — unchanged.
    showGreenZoom: false,
  },
  inline: {
    /** Compact round-review preview: enough room to read the flight without
     * turning the review hero into a full-height course map. */
    className: 'w-[112px] h-[240px] md:w-[124px] md:h-[264px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
    showGreenZoom: true,
  },
  card: {
    /** ~140×320 — inline next to per-hole text in round review */
    className: 'w-[140px] h-[320px] md:w-[160px] md:h-[360px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
    showGreenZoom: true,
  },
  reviewCard: {
    /** Fluid round-review card — fills its framed grid cell (capped by the
     *  parent's max-width) instead of a fixed 140px strip, so holes read as
     *  distinct, well-spaced cards rather than a butted-together dark wall.
     *  Aspect mirrors the fixed card (140:320).
     *
     *  Kept for back-compat/tests only — the live round-review detail panel
     *  now renders `review` instead (see below), a bigger ~1:2 box that
     *  shows the FULL corridor without cropping either end. */
    className: 'w-full aspect-[140/320]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
    // The round-review detail panel now renders the green detail as its OWN
    // adjacent panel (see `PuttingZoom.tsx`) instead of a lens crammed
    // inside this box — the thing that used to make green→green putts on a
    // par-3 vanish at hole scale. See index.tsx's render for the gate.
    showGreenZoom: false,
  },
  review: {
    /** THE STAR — the round-review detail panel's primary visual
     *  (2026-07-22 "make it bigger, put the hole aesthetically there"
     *  redesign, bumped again same day per "the whole visual is not big
     *  enough"). Roughly 1:2 (matches the canonical 100×200 corridor
     *  viewBox almost exactly), so `preserveAspectRatio="xMidYMid slice"`
     *  never crops the tee or the green off either end — the full hole
     *  corridor is always visible, just larger and easier to read than
     *  `reviewCard`. */
    className: 'w-full max-w-[300px] aspect-[100/200] md:max-w-[360px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
    // The putting-green detail is its own adjacent panel (`PuttingZoom`) —
    // never crammed back into this box.
    showGreenZoom: false,
  },
  hero: {
    /** ~280×560 — primary visual on a hole-detail page. Fluid on narrow
     *  screens (w-full) but capped at 280px so it never overflows a
     *  320px viewport, growing back to the desktop size at md. */
    className: 'w-full max-w-[280px] h-[560px] md:max-w-[320px] md:h-[640px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
    showGreenZoom: false,
  },
} as const;

// -----------------------------------------------------------------------------
// Lie → swatch color (matches DispersionStats palette so colors are
// consistent across the v3 stats surface).
//
// `LIE_COLOR` is now used ONLY by the legacy `card`/`inline` green-inset
// overlay further down (unused in production today — see that block's own
// comment) — the main shot markers no longer fill with the lie color; see
// CREAM MARKERS below.
// -----------------------------------------------------------------------------

const LIE_COLOR: Record<Lie | 'other', string> = {
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

// 2026-07-22 "cased lines, cream markers" redesign repurposed this map: it
// no longer colors the flight LINES (every non-penalty line is one
// consistent warm cream now, see SHOT_LINE_COLOR below) — it colors the
// numbered dot's outer HALO RING instead. A thin ring reads fine in a
// saturated hue where a filled dot wouldn't (that was the "ball is the same
// green as the background" complaint), so the lie signal moved there. Same
// hue family per lie (still "honest" lie coloring per the founder's brief),
// lifted in lightness/saturation just enough to stay legible on `#1a382e`.
const LIE_LINE_COLOR: Record<Lie | 'other', string> = {
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

// BOLD CASED SHOT LINES (2026-07-22 "lines must be more profound and easy
// to read" fix): every non-penalty flight segment renders in this one
// consistent, highly legible warm "golf-ball" cream, cased with a dark
// drop-shadow so it separates crisply from the fairway underneath it — a
// transit-map line, not a lie-colored hairline. A penalty is the ONE lie
// signal a line still carries, via `LIE_LINE_COLOR.penalty`'s dashed red.
const SHOT_LINE_COLOR = '#fbf3e0';

const LIE_LABEL: Record<Lie | 'other', string> = {
  tee: 'Tee',
  fairway: 'Fairway',
  rough: 'Rough',
  heavy_rough: 'Heavy rough',
  light_rough: 'Light rough',
  sand: 'Bunker',
  bunker: 'Bunker',
  green: 'Green',
  fringe: 'Fringe',
  water: 'Water',
  penalty: 'Penalty',
  other: '—',
};

// Tooltip-only labels for the richer shot fields (never drive geometry or
// color — see ShotInput's doc comment on the 3-bucket club model).
const CLUB_LABEL: Record<string, string> = {
  driver: 'Driver',
  non_driver: 'Approach',
  putter: 'Putter',
};

const PENALTY_LABEL: Record<string, string> = {
  ob: 'OB',
  water: 'water',
  unplayable: 'unplayable',
  lost: 'lost ball',
};

// Short codes for the compact putt-line tooltip row ("22 ft, R-to-L,
// downhill") — distinct from a hypothetical full-sentence form, since the
// putt line already carries feet + slope on the same row.
const PUTT_BREAK_SHORT: Record<string, string> = {
  right_to_left: 'R-to-L',
  left_to_right: 'L-to-R',
  straight: 'Straight',
  multiple: 'Multi-break',
};

const PUTT_SLOPE_LABEL: Record<string, string> = {
  uphill: 'uphill',
  downhill: 'downhill',
  level: 'level',
  severe: 'severe slope',
};

// -----------------------------------------------------------------------------
// HIT vs MISS — shape-based outcome classification (Wave B, Nick's #1
// complaint: "how do you know it is a miss — it looks the same"). The halo
// ring above still carries LIE (which specific bad/good thing) but a viewer
// had to already know "green=good, rough=bad" and spot a subtle ring-hue
// shift to read outcome at all — basketball's made-dot/missed-X lesson says
// layer a SHAPE signal on top that survives any glance, any size, colorblind
// vision. The wedge/burst's mere PRESENCE says "miss," independent of which
// halo hue it's paired with.
//
// GOOD: holed (`remaining_yards === 0`), or ended in fairway/green — the two
// lies that cost the player nothing. MISS: everything else (rough/sand/
// water/fringe/other — including a tee shot that missed the fairway, which
// this lie check already covers) OR any shot with a logged `miss_direction`,
// even one that technically ended in the fairway/green (a wide fairway can
// still carry a stylistically "left" logged miss) — the player's own logged
// direction always wins over the lie default. Symbolic (penalty) shots never
// reach this — they get their own marker, see PENALTY MARKER below.
// -----------------------------------------------------------------------------

function isMissOutcome(s: PlottedShot): boolean {
  if (s.remaining_yards === 0) return false; // holed — unambiguously good
  if (s.miss_direction) return true; // player-logged miss always wins
  return s.lie !== 'fairway' && s.lie !== 'green';
}

/** Unit direction vectors for the miss wedge, in the corridor's own viewBox
 *  axes — left/right are lateral (X); long/short are ALONG the corridor's
 *  tee→pin axis (Y decreases toward the pin, so "long" — flew past where it
 *  should have stopped — points toward the pin/−y; "short" points back
 *  toward the tee/+y). Mirrors the along-axis miss language geometry.ts's
 *  module doc already establishes for `miss_direction`. */
const MISS_DIRECTION_VECTOR: Record<'left' | 'right' | 'long' | 'short', { dx: number; dy: number }> = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  long: { dx: 0, dy: -1 },
  short: { dx: 0, dy: 1 },
};

const MISS_WEDGE_LENGTH = 3.6;
const MISS_WEDGE_HALF_WIDTH = 1.7;

/** A flat, filled chevron/wedge fused to the dot's halo edge, tip pointing
 *  outward along the shot's logged `miss_direction`. One crisp flat SVG
 *  polygon — no gradient, no glow — sized to read at the `review` size's
 *  ~300px mobile max-width. */
function missWedgePath(
  cx: number,
  cy: number,
  haloR: number,
  dir: { dx: number; dy: number },
): string {
  const perp = { dx: -dir.dy, dy: dir.dx };
  const base1 = {
    x: cx + dir.dx * haloR - perp.dx * MISS_WEDGE_HALF_WIDTH,
    y: cy + dir.dy * haloR - perp.dy * MISS_WEDGE_HALF_WIDTH,
  };
  const base2 = {
    x: cx + dir.dx * haloR + perp.dx * MISS_WEDGE_HALF_WIDTH,
    y: cy + dir.dy * haloR + perp.dy * MISS_WEDGE_HALF_WIDTH,
  };
  const tip = {
    x: cx + dir.dx * (haloR + MISS_WEDGE_LENGTH),
    y: cy + dir.dy * (haloR + MISS_WEDGE_LENGTH),
  };
  return `M ${base1.x.toFixed(2)} ${base1.y.toFixed(2)} L ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${base2.x.toFixed(2)} ${base2.y.toFixed(2)} Z`;
}

/** Diagonal angles (degrees, 0 = corridor "up"/toward the pin) for the
 *  neutral "miss, direction unlogged" burst — deliberately off the L/R/
 *  long/short axes the directional wedge uses, so a burst can never be
 *  mistaken for a directional claim the data doesn't support. */
const MISS_BURST_ANGLES = [45, 135, 225, 315] as const;
const MISS_BURST_INNER_PAD = 0.6;
const MISS_BURST_OUTER_PAD = 2.6;

interface BurstTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A small radiating tick burst — "this was a miss, but no direction was
 *  logged." Still unmistakably a miss (the shape departs from a clean
 *  good-outcome dot) — it just never claims a side the ledger never
 *  recorded. */
function missBurstTicks(cx: number, cy: number, haloR: number): BurstTick[] {
  return MISS_BURST_ANGLES.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    return {
      x1: cx + dx * (haloR + MISS_BURST_INNER_PAD),
      y1: cy + dy * (haloR + MISS_BURST_INNER_PAD),
      x2: cx + dx * (haloR + MISS_BURST_OUTER_PAD),
      y2: cy + dy * (haloR + MISS_BURST_OUTER_PAD),
    };
  });
}

// -----------------------------------------------------------------------------
// Strokes Gained — signed per-shot badge. PGA/Data Golf convention: the SIGN
// is the legend (+ good, − bad), no invented iconography needed. Colors
// reuse the existing on-canvas-legible bright hues (the halo-ring palette)
// rather than introducing new raw values — `LIE_LINE_COLOR.fairway` (already
// proven legible against `#1a382e`) for gained, `LIE_LINE_COLOR.penalty`
// (already proven legible) for lost.
// -----------------------------------------------------------------------------

const SG_GAINED_COLOR = LIE_LINE_COLOR.fairway;
const SG_LOST_COLOR = LIE_LINE_COLOR.penalty;
const SG_NEUTRAL_COLOR = 'rgba(251,243,224,0.6)'; // muted cream — SHOT_LINE_COLOR at reduced opacity
const SG_NEAR_ZERO_THRESHOLD = 0.05;

/** Signed, two-decimal SG label ("+0.31" / "-0.42"); near-zero renders the
 *  same "E"(ven) convention the score badge already uses, rather than a
 *  falsely-precise "+0.00"/"-0.01". Caller gates on `sg != null` first —
 *  this never fabricates a value for a null/uncomputed shot. */
function formatSG(sg: number): string {
  if (Math.abs(sg) < SG_NEAR_ZERO_THRESHOLD) return 'E';
  return `${sg > 0 ? '+' : '-'}${Math.abs(sg).toFixed(2)}`;
}

/** ON-CANVAS ONLY — the always-on SVG SG badge/chip at review/hero scale
 *  (dark `#1a382e` scene). `SG_NEUTRAL_COLOR` above is a muted CREAM tuned
 *  for that dark background; DO NOT reuse this for the light HTML tooltip
 *  (see `sgTooltipColor` below — Wave C BUG 4: this exact neutral, reused
 *  verbatim as inline tooltip text color, rendered "SG E" near-invisible
 *  near-white-on-cream). */
function sgColor(sg: number): string {
  if (Math.abs(sg) < SG_NEAR_ZERO_THRESHOLD) return SG_NEUTRAL_COLOR;
  return sg > 0 ? SG_GAINED_COLOR : SG_LOST_COLOR;
}

/** TOOLTIP ONLY — the light `surface-lift` HTML card on cream. A separate
 *  color set from `sgColor` above: neutral resolves to the design system's
 *  dark-muted text-secondary token (not the canvas cream), gain reuses the
 *  same helm-green var() `PuttingZoom.tsx`'s own tooltip already relies on
 *  for its "made" putt line (already vetted readable on this exact
 *  `surface-lift` card).
 *
 * WAVE D BUG FIX (2026-07-23): loss previously reused `SG_LOST_COLOR`
 * ('#f0715c', the on-canvas penalty red) verbatim — that measures only
 * ~2.1:1 against this tooltip's real background (both the translucent-
 * over-dark-canvas composite the tooltip actually renders against, and its
 * opaque cream reading), well under WCAG AA's 4.5:1 floor for normal text.
 * '#9B2226' is a deliberately DARKER, still unmistakably red TOOLTIP-ONLY
 * color — ≥5.2:1 even in the worst-case dark composite, ≥7.4:1 against
 * opaque cream (same value `PuttingZoom.tsx`'s tooltip now uses, so the two
 * panels' loss reds match). `SG_LOST_COLOR`/`sgColor()` above — the
 * on-canvas SVG badge — are UNCHANGED; this constant only feeds
 * `sgTooltipColor`, never an SVG presentation attribute. */
const SG_TOOLTIP_NEUTRAL_COLOR = 'var(--fw-color-text-secondary)';
const SG_TOOLTIP_GAINED_COLOR = 'var(--fw-color-accent-500)';
const SG_TOOLTIP_LOST_COLOR = '#9B2226';

function sgTooltipColor(sg: number): string {
  if (Math.abs(sg) < SG_NEAR_ZERO_THRESHOLD) return SG_TOOLTIP_NEUTRAL_COLOR;
  return sg > 0 ? SG_TOOLTIP_GAINED_COLOR : SG_TOOLTIP_LOST_COLOR;
}

// -----------------------------------------------------------------------------
// SYMBOLIC PENALTY MARKER — a small hexagon "+1" badge, deliberately
// ANGULAR (never a circle) so it can't be mistaken for a ball/flight-dot at
// a glance — the direct fix for "shot 1 did nothing" (a penalty never had a
// real flight to plot; see geometry.ts's module doc). Planted at the
// shot's plotted START position; no flight segment connects to it (the
// geometry layer already omits one), and the NEXT real shot's own segment
// still connects from this same point.
// -----------------------------------------------------------------------------

const PENALTY_MARKER_RADIUS = 3.8;
const PENALTY_MARKER_FILL = LIE_LINE_COLOR.penalty;

/** Hexagon vertices (pointy-top), as an SVG `points` string. */
function hexagonPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

// -----------------------------------------------------------------------------
// Draw-in schedule — shot-by-shot reveal timing.
//
// Local to this component (distinct from the shared v3 `stagger()`, which is
// a flat 70ms step meant for sibling CARDS, not shots within one hole): the
// budget here has to hold regardless of how many strokes a hole logged — a
// blow-up par 5 with a dozen shots still has to finish inside the ~900ms
// cinematic ceiling Nick asked for, so per-segment duration compresses
// proportionally rather than the total just growing unbounded.
// -----------------------------------------------------------------------------

const DRAW_BASE_DELAY_SEC = 0.05;
const DRAW_BUDGET_SEC = 0.85; // + DRAW_BASE_DELAY_SEC ≈ 900ms hard ceiling
const DRAW_MIN_SEGMENT_SEC = 0.12;
const DRAW_MAX_SEGMENT_SEC = 0.18;
const DRAW_REFERENCE_YARDS = 280; // a driver-length shot draws at the slow end
const DRAW_FALLBACK_SEC = (DRAW_MIN_SEGMENT_SEC + DRAW_MAX_SEGMENT_SEC) / 2;

interface SegmentTiming {
  delaySec: number;
  durationSec: number;
}

/**
 * One timing entry per segment/shot, in shot order. A longer real shot
 * draws slightly slower (within the 120–180ms band) than a short putt —
 * mirrors the arc-lift scaling geometry.ts already does by real yardage.
 * When the combined raw durations would blow the total budget, every
 * duration scales down proportionally so the whole hole still finishes
 * inside ~900ms, however many shots it logged.
 */
function computeDrawTimings(shotYardsList: ReadonlyArray<number | null>): SegmentTiming[] {
  const rawDurations = shotYardsList.map((yards) => {
    if (yards === null || !Number.isFinite(yards)) return DRAW_FALLBACK_SEC;
    const t = Math.max(0, Math.min(1, yards / DRAW_REFERENCE_YARDS));
    return DRAW_MIN_SEGMENT_SEC + t * (DRAW_MAX_SEGMENT_SEC - DRAW_MIN_SEGMENT_SEC);
  });
  const rawTotal = rawDurations.reduce((sum, d) => sum + d, 0);
  const scale = rawTotal > DRAW_BUDGET_SEC && rawTotal > 0 ? DRAW_BUDGET_SEC / rawTotal : 1;
  const timings: SegmentTiming[] = [];
  let acc = 0;
  for (const raw of rawDurations) {
    const durationSec = raw * scale;
    timings.push({ delaySec: DRAW_BASE_DELAY_SEC + acc, durationSec });
    acc += durationSec;
  }
  return timings;
}

/** Sample a quadratic Bezier (the same curve `segmentPath` renders) into a
 *  short keyframe run for the traveling "ball" marker. Only computed for
 *  the rich interactive sizes with motion enabled — cheap (4 points) and
 *  never memoized separately since `plot` itself already is. */
function sampleQuadratic(
  from: { x: number; y: number },
  control: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    xs.push(mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x);
    ys.push(mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y);
  }
  return { xs, ys };
}

/**
 * Tooltip anchor, in percentages of the SVG box, flipped to stay inside the
 * box near an edge. The tooltip renders as a sibling of the clipped SVG
 * chrome (not a descendant of the `overflow-hidden` div) so it's free to
 * extend outside that box without being clipped — see the positioning host
 * in the render below.
 */
function tooltipPlacement(x: number, y: number): { left: string; top: string; transform: string } {
  const leftPct = (x / VB.width) * 100;
  const topPct = (y / VB.height) * 100;
  const above = topPct > 60;
  const alignX: 'start' | 'center' | 'end' = leftPct < 25 ? 'start' : leftPct > 75 ? 'end' : 'center';
  const translateX = alignX === 'start' ? '0%' : alignX === 'end' ? '-100%' : '-50%';
  const translateY = above ? '-100%' : '0%';
  const gapPx = 8;
  const top = above ? `calc(${topPct}% - ${gapPx}px)` : `calc(${topPct}% + ${gapPx}px)`;
  return { left: `${leftPct}%`, top, transform: `translate(${translateX}, ${translateY})` };
}

/** Compact "remaining to pin" readout for the near-dot hover label — the
 *  yardage-book "sprinkler head" number, right next to the marker instead
 *  of buried only in the tooltip box. Feet for a green-inset shot (the true
 *  logged feet value, never re-derived from the yards conversion), yards
 *  otherwise. Null-honest: no logged distance → no readout, never a guess;
 *  a holed shot skips it too (the tooltip already says "holed" plainly, an
 *  inline "0 yd" next to the pin would just be clutter). */
function formatRemainingReadout(shot: PlottedShot, insetFeet: number | null): string | null {
  if (shot.remaining_yards === null) return null;
  if (shot.remaining_yards === 0) return null;
  if (shot.in_green_inset && insetFeet !== null) return formatFeet(insetFeet);
  return formatYards(shot.remaining_yards);
}

// -----------------------------------------------------------------------------
// Component
//
// `size` here is widened LOCALLY to `keyof typeof SIZES` (includes the new
// `review` variant) rather than the narrower union `types.ts` still declares
// — `types.ts` is a read-only shared contract this redesign deliberately
// doesn't touch. This is additive-only (every existing size keeps working
// exactly as typed); the component's real, checked prop type is this local
// `HoleShotPathComponentProps`, so callers like `ReviewHero` can pass
// `size="review"` and still get full type-checking.
// -----------------------------------------------------------------------------

type SizeKey = keyof typeof SIZES;
type HoleShotPathComponentProps = Omit<HoleShotPathProps, 'size'> & { size?: SizeKey };

export function HoleShotPath({
  hole_number,
  par,
  yardage,
  score,
  shots,
  size = 'card',
  onClick,
  className,
  ringClassName,
  active,
}: HoleShotPathComponentProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const variant = SIZES[size];
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Plot once per (shots, par, yardage) — memoize so re-renders from
  // hover state don't recompute the Bezier control points.
  const plot = useMemo(
    () => plotHole({ shots, par, yardage }),
    [shots, par, yardage],
  );

  // Sorted the same way `plotHole` sorts internally (shot_number ascending)
  // so `orderedShots[i]` lines up 1:1 with `plot.shots[i]` — needed to read
  // the raw `lie_before` off shot 1 for the tooltip's lie-transition line
  // (geometry.ts's PlottedShot doesn't carry lie_before; every OTHER shot's
  // "from" lie is simply the previous shot's plotted `lie`, which the
  // geometry contract does expose).
  const orderedShots = useMemo(
    () => [...shots].sort((a, b) => a.shot_number - b.shot_number),
    [shots],
  );

  // shot_index (into plot.shots) → real logged feet remaining, for the
  // green-inset shots — the ONLY place a true feet distance lives (see
  // geometry.ts's PlottedGreenInset). Never recompute a feet value here.
  const insetFeetByShotIndex = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const ins of plot.greenInset.shots) map.set(ins.shot_index, ins.remaining_feet);
    return map;
  }, [plot]);

  // GREEN CORRIDOR DECLUTTER (Wave C, 2026-07-23): `plot.greenInset.shots`
  // is already in chronological order (geometry.ts pushes inset work items
  // as it walks the hole forward — the collision-resolve pass that follows
  // only reorders ANGLES, never the array itself), so `[0]` is always the
  // first real shot that qualified for the inset — the approach that
  // reached the green, never a putt. That's the one shot the corridor keeps
  // a marker for; see the render below.
  const insetEntryShotIndex = useMemo(
    () => plot.greenInset.shots[0]?.shot_index ?? null,
    [plot],
  );

  const drawTimings = useMemo(
    () => computeDrawTimings(plot.shots.map((s) => s.shot_yards)),
    [plot],
  );

  function lieBeforeShot(i: number): Lie | 'other' {
    if (i === 0) {
      const raw = normalizeLie(orderedShots[0]?.lie_before);
      // Shot 1's "from" is virtually always the tee — only fall through to
      // the raw (probably-unlogged) value when it resolves to something
      // more specific than the "no data" bucket.
      return raw === 'other' ? 'tee' : raw;
    }
    return plot.shots[i - 1]?.lie ?? 'other';
  }

  const hovered = hoveredIndex != null ? plot.shots[hoveredIndex] ?? null : null;

  // SG badge is ALWAYS-ON only at the two "hero"-scale sizes where there's
  // room for a legible extra numeral next to every dot at once — everywhere
  // else (strip/inline/card/reviewCard) it's hover-only, via the tooltip's
  // own SG line below.
  const showSgBadge = size === 'review' || size === 'hero';

  // Controlled "this hole is active" signal (Filmstrip's strip cells) vs.
  // uncontrolled/mount-triggered (every other size — see the module doc).
  const hasActiveControl = active !== undefined;
  const stripDrawing = hasActiveControl && !!active && !prefersReducedMotion;

  const scoreLabel = scoreToParLabel(score, par);
  const scoreColor =
    scoreLabel === null
      ? 'text-warm-500'
      : scoreLabel === 'E'
        ? 'text-warm-700'
        : scoreLabel.startsWith('-') || ['Albatross', 'Eagle', 'Birdie'].includes(scoreLabel)
          ? 'text-primary-600'
          : 'text-rose-600';

  // Touch fallback: pixel-precise dot targeting is impractical at strip/
  // inline scale, so a tap anywhere on the SVG advances the tooltip to the
  // next shot. Only reacts to `pointerType === 'touch'` so mouse clicks
  // (which already drive the tooltip via hover) aren't affected, and never
  // calls stopPropagation — the root `onClick` (e.g. a strip cell's
  // tap-to-expand) still fires exactly as before.
  function handleTouchCycle(e: ReactPointerEvent<SVGSVGElement>) {
    if (!variant.interactive || e.pointerType !== 'touch' || plot.shots.length === 0) return;
    setHoveredIndex((cur) => (cur === null ? 0 : (cur + 1) % plot.shots.length));
  }

  return (
    <LazyMotion features={loadFeatures}>
      <m.div
        className={[
          'group relative',
          variant.interactive ? 'cursor-pointer' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        whileHover={variant.interactive && onClick ? liftHover : undefined}
        whileTap={variant.interactive && onClick ? tapPress : undefined}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        aria-label={
          hole_number
            ? `Hole ${hole_number}${par ? ` par ${par}` : ''}${score ? `, scored ${score}` : ''}`
            : 'Hole shot path'
        }
      >
        {/* Header — hole number, par, yardage, score */}
        {variant.showHeader && (
          <div className="mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-0.5 overflow-clip px-1">
            <div className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap">
              {hole_number !== undefined && (
                <span className="shrink-0 text-eyebrow uppercase tracking-[0.12em] text-warm-500">
                  Hole {hole_number}
                </span>
              )}
              {par !== undefined && (
                <span className="shrink-0 text-eyebrow text-warm-400 tabular-nums">
                  Par {par}
                </span>
              )}
            </div>
            {scoreLabel && (
              <span className={`min-w-0 max-w-full truncate text-caption font-semibold tabular-nums tracking-[-0.01em] ${scoreColor}`}>
                {scoreLabel}
              </span>
            )}
            {plot.total_yardage > 0 && (
              <span className="col-span-2 truncate text-eyebrow text-warm-400 tabular-nums">
                {Math.round(plot.total_yardage)}y
              </span>
            )}
          </div>
        )}

        {/* Positioning host — sized exactly like the SVG box (matches
            `variant.className`) but WITHOUT overflow-hidden, so the hover
            tooltip (a sibling of the clipped chrome below) can render
            outside the box's edges without being clipped. */}
        <div className={[variant.className, 'relative'].join(' ')}>
          <div
            className={[
              'absolute inset-0',
              'rounded-2xl overflow-hidden shadow-[0_18px_40px_-22px_rgba(15,42,30,0.55)]',
              ringClassName ?? 'ring-1 ring-white/10',
              'bg-[#1a382e]',
            ].join(' ')}
          >
            <svg
              viewBox={`0 0 ${VB.width} ${VB.height}`}
              preserveAspectRatio="xMidYMid slice"
              className="h-full w-full"
              onPointerUp={handleTouchCycle}
            >
              <Turf showPinFlag={variant.showFlag} size={size} ticks={plot.ticks} />
              <Hazards
                hazards={plot.hazards}
                staticRender={!variant.interactive}
                // `Hazards` (hazards.tsx) is read-only — its `Size` type
                // still comes straight from `types.ts` and doesn't know
                // about the new `review` variant. Map it onto `hero`, the
                // other 'rich'-tier size, so hazard density/detail matches
                // what `turf.tsx`'s own `tierOf()` resolves `review` to.
                size={size === 'review' ? 'hero' : size}
                activeOriginShot={hovered?.shot_number ?? null}
              />

              {/* Shot connection paths — drawn from previous endpoint to
                  this one. Rich sizes draw in shot-by-shot on mount (see
                  the module doc); the controlled-active strip mode swaps
                  between a plain static path and an animated one on hover;
                  a hovered shot's own incoming segment thickens/brightens
                  while its siblings dim. */}
              <g>
                {plot.segments.map((seg, _i) => {
                  const destShot = plot.shots[seg.to_index];
                  const isPenalty = destShot?.is_penalty;
                  // CASED SHOT LINES: one consistent cream for every
                  // non-penalty segment (the lie signal lives on the
                  // marker halo now, see the dots block below) — a penalty
                  // is the ONE lie signal a line still carries, dashed red.
                  // (In practice `isPenalty` is always false post-Wave-A —
                  // a penalty shot never emits a segment at all — kept as a
                  // defensive fallback, never removed, per the module's
                  // "never default to the wrong glyph" discipline.)
                  const stroke = isPenalty ? LIE_LINE_COLOR.penalty : SHOT_LINE_COLOR;
                  const dash = isPenalty ? '2.2 1.6' : undefined;
                  const d = segmentPath(seg);
                  // ROBUSTNESS (Wave B): `plot.segments` is NOT 1:1 with
                  // `plot.shots`/`drawTimings` once a hole has a penalty —
                  // penalty shots emit no segment, so the segment array can
                  // have GAPS relative to shot index. `seg.to_index` is the
                  // one reliable cross-reference into `plot.shots`/
                  // `drawTimings`/`hoveredIndex` — the segment ARRAY index
                  // (`_i`, deliberately unused below) is never a safe stand-in.
                  const timing = drawTimings[seg.to_index] ?? { delaySec: 0, durationSec: DRAW_FALLBACK_SEC };

                  // Strip's controlled-active mode: cheap by default (a
                  // plain, unanimated <path>) — only the ONE cell currently
                  // hovered ever mounts an `m.path`, and the key swap
                  // between the two modes is what makes Framer replay the
                  // draw-in fresh on every hover-in.
                  if (hasActiveControl && !variant.interactive) {
                    if (stripDrawing) {
                      return (
                        <m.path
                          key={`seg-${seg.to_index}-drawing`}
                          d={d}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={1.1}
                          strokeLinecap="round"
                          strokeDasharray={dash}
                          opacity={0.95}
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: timing.durationSec, delay: timing.delaySec, ease: EASE_CINEMATIC }}
                        />
                      );
                    }
                    return (
                      <path
                        key={`seg-${seg.to_index}-static`}
                        d={d}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={1.1}
                        strokeLinecap="round"
                        strokeDasharray={dash}
                        opacity={0.95}
                      />
                    );
                  }

                  if (!variant.interactive) {
                    // No active control wired and not an interactive size —
                    // e.g. a bare strip usage — render fully drawn, static.
                    return (
                      <path
                        key={`seg-${seg.to_index}-static`}
                        d={d}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={1.1}
                        strokeLinecap="round"
                        strokeDasharray={dash}
                        opacity={0.95}
                      />
                    );
                  }

                  // Rich sizes — mount-triggered draw-in; hover thickens +
                  // brightens THIS segment while siblings dim. Opacity/
                  // strokeWidth are plain (CSS-transitioned) props, not
                  // Framer `animate` targets, so the hover feedback stays
                  // instant and independent of the draw-in schedule.
                  // Keyed by `seg.to_index` (the shot this segment lands
                  // on), not the segment array index — see the ROBUSTNESS
                  // note above. Hovering a shot with no incoming segment
                  // (a penalty marker) correctly dims every segment rather
                  // than silently highlighting the wrong one.
                  const isHoveredSeg = hoveredIndex === seg.to_index;
                  const dimmed = hoveredIndex != null && hoveredIndex !== seg.to_index;
                  return (
                    <m.path
                      key={`seg-${seg.to_index}`}
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isHoveredSeg ? 3.4 : 2.4}
                      strokeLinecap="round"
                      strokeDasharray={dash}
                      opacity={isHoveredSeg ? 1 : dimmed ? 0.45 : 1}
                      className="transition-[stroke-width,opacity] duration-150 ease-out"
                      style={{
                        // A permanent dark "casing" (transit-map style) so
                        // the bright line separates crisply from the
                        // fairway underneath it at every state, not just on
                        // hover.
                        filter: 'drop-shadow(0 0 1.3px rgba(8,20,15,0.95))',
                      }}
                      initial={!prefersReducedMotion ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { duration: timing.durationSec, delay: timing.delaySec, ease: EASE_CINEMATIC }
                      }
                    />
                  );
                })}
              </g>

              {/* Traveling ball marker — rides the same Bezier the segment
                  above draws, synced to the identical schedule, fading out
                  right as the numbered dot lands. Rich sizes only, and
                  never under reduced motion. */}
              {variant.interactive && !prefersReducedMotion && (
                <g aria-hidden="true">
                  {plot.segments.map((seg) => {
                    // Same `seg.to_index` keying as the segment paths above
                    // — never the segment array's own index.
                    const timing = drawTimings[seg.to_index] ?? { delaySec: 0, durationSec: DRAW_FALLBACK_SEC };
                    const { xs, ys } = sampleQuadratic(seg.from, seg.control, seg.to, 3);
                    return (
                      <m.circle
                        key={`ball-${seg.to_index}`}
                        data-shot-ball="true"
                        r={1}
                        fill="#fff9ec"
                        style={{ pointerEvents: 'none' }}
                        initial={{ cx: xs[0], cy: ys[0], opacity: 0 }}
                        animate={{ cx: xs, cy: ys, opacity: [0, 1, 1, 0] }}
                        transition={{ duration: timing.durationSec, delay: timing.delaySec, ease: EASE_CINEMATIC }}
                      />
                    );
                  })}
                </g>
              )}

              {/* Numbered shot dots — land with a small pulse timed to
                  their incoming segment's draw completion. A SYMBOLIC
                  (penalty) shot never reaches the ball-dot branch below —
                  see the hexagon "+1" marker branch instead. */}
              <g>
                {plot.shots.map((s, i) => {
                  // GREEN CORRIDOR DECLUTTER (Wave C, 2026-07-23): every
                  // on-green shot — a putt, or the approach that first
                  // reached the green — now gets its full, legible detail
                  // in the sibling `PuttingZoom` panel (see that module's
                  // doc). Rendering a full numbered dot + always-on SG
                  // badge for EACH of them here is exactly what caused the
                  // "smear under the flag" Nick called out: colliding
                  // numbers, garbled SG badges mashing together at the pin.
                  // At most ONE marker survives in the corridor per hole —
                  // the green-ENTRY shot (the first chronological inset
                  // shot, i.e. the approach that reached the green) — and
                  // even that marker is deliberately SIMPLIFIED (no number,
                  // no SG badge, no miss wedge/burst) below, just enough to
                  // say "the approach reached the green," never enough to
                  // collide with a neighbor. Every OTHER inset shot (the
                  // putts themselves) renders NOTHING here. Symbolic
                  // (penalty) shots are exempt — they use an entirely
                  // different glyph (the hexagon "+1" badge, see below)
                  // that never collides with a putt dot, so they stay
                  // governed by the existing Wave-B rule regardless of
                  // `in_green_inset`.
                  const isInsetShot = s.in_green_inset && !s.symbolic;
                  const isEntryShot = isInsetShot && i === insetEntryShotIndex;
                  if (isInsetShot && !isEntryShot) return null;

                  // CREAM MARKERS (2026-07-22 redesign): the ball fill is
                  // ALWAYS the same golf-ball cream — never lie-green — so a
                  // dot never disappears against the fairway/green fill
                  // behind it. The lie signal moves to the halo ring
                  // instead; the finishing ball keeps a pure-white halo so
                  // "where it ended up" always reads as the one distinct
                  // marker on the hole. The green-entry marker is the one
                  // exception — it never gets the "final" white-halo/bigger
                  // treatment even when it also happens to be the hole's
                  // last logged shot (a synthetic/partial ledger with no
                  // putts following it): it must always read as the
                  // deliberately SUBTLE "reached the green" marker, not the
                  // hero landing spot.
                  const ballFill = '#fbf3e0';
                  const isLast = i === plot.shots.length - 1;
                  const lieHalo = LIE_LINE_COLOR[s.lie] ?? LIE_LINE_COLOR.other;
                  const ringColor = isEntryShot ? lieHalo : isLast ? '#ffffff' : lieHalo;
                  const r = isEntryShot ? 2.4 : isLast ? 3.8 : 3.2;
                  const timing = drawTimings[i] ?? { delaySec: 0, durationSec: DRAW_FALLBACK_SEC };
                  const landDelay = timing.delaySec + timing.durationSec;

                  // HIT vs MISS (Wave B) — see `isMissOutcome`'s doc above.
                  // Symbolic shots skip this entirely; they get their own
                  // marker, never a good/miss ball dot. The entry marker
                  // keeps the CLASSIFICATION (`data-shot-outcome` stays
                  // accurate metadata) but never paints the wedge/burst
                  // GLYPH — see the gated render below.
                  const isMiss = !s.symbolic && isMissOutcome(s);
                  const missDir = s.miss_direction ? MISS_DIRECTION_VECTOR[s.miss_direction] : null;
                  const sgValue = typeof s.sg === 'number' && Number.isFinite(s.sg) ? s.sg : null;
                  const isHoveredDot = variant.interactive && hoveredIndex === i;
                  const distanceReadout = isHoveredDot
                    ? formatRemainingReadout(s, insetFeetByShotIndex.get(i) ?? null)
                    : null;

                  return (
                    <m.g
                      key={s.symbolic ? `penalty-${s.shot_number}` : `dot-${s.shot_number}`}
                      data-shot-outcome={s.symbolic ? 'penalty' : isMiss ? 'miss' : 'good'}
                      data-miss-direction={isMiss ? (s.miss_direction ?? undefined) : undefined}
                      initial={variant.interactive && !prefersReducedMotion ? { scale: 0, opacity: 0 } : false}
                      animate={
                        variant.interactive
                          ? prefersReducedMotion
                            ? { scale: 1, opacity: 1 }
                            : { scale: [0, 1.35, 1], opacity: 1 }
                          : undefined
                      }
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : variant.interactive
                            ? { duration: 0.22, delay: landDelay, ease: EASE_CINEMATIC }
                            : undefined
                      }
                      onMouseEnter={() => variant.interactive && setHoveredIndex(i)}
                      onMouseLeave={() => variant.interactive && setHoveredIndex(null)}
                      onFocus={() => variant.interactive && setHoveredIndex(i)}
                      onBlur={() => variant.interactive && setHoveredIndex(null)}
                      style={{ transformOrigin: `${s.x}px ${s.y}px` }}
                      tabIndex={variant.interactive ? 0 : undefined}
                      aria-label={
                        s.symbolic
                          ? `Penalty, shot ${s.display_index}`
                          : isEntryShot
                            ? `Reached the green, shot ${s.display_index} — see putting detail`
                            : undefined
                      }
                    >
                      {s.symbolic ? (
                        <>
                          {/* SYMBOLIC PENALTY MARKER — a hexagon "+1" badge,
                              deliberately angular (never a circle) so it can
                              never read as a ball/flight dot. Planted at the
                              shot's plotted START position; no flight
                              segment connects to it (geometry.ts already
                              omits one — see the module doc). */}
                          <polygon
                            data-penalty-marker="true"
                            points={hexagonPoints(s.x, s.y, PENALTY_MARKER_RADIUS)}
                            fill={PENALTY_MARKER_FILL}
                            stroke="#10241c"
                            strokeWidth={0.6}
                          />
                          <text
                            x={s.x}
                            y={s.y + 1.1}
                            textAnchor="middle"
                            fontSize="3.0"
                            fontWeight={700}
                            fill="#ffffff"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            +1
                          </text>
                          {/* Penalty's own SG chip — usually ≈ −1, the cost
                              of the stroke — shown under the marker at
                              review/hero scale, same gating as a real
                              shot's badge below. */}
                          {sgValue !== null && showSgBadge && (
                            <text
                              data-sg-badge="true"
                              x={s.x}
                              y={s.y + PENALTY_MARKER_RADIUS + 4.2}
                              textAnchor="middle"
                              fontSize="2.6"
                              fontWeight={600}
                              fill={sgColor(sgValue)}
                              style={{
                                pointerEvents: 'none',
                                userSelect: 'none',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatSG(sgValue)}
                            </text>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Landing pulse — a ring that expands + fades right
                              as this shot's segment finishes drawing, so
                              where the ball ACTUALLY finished is unmissable
                              rather than just a static dot. One-shot (never
                              loops), skipped entirely under reduced motion or
                              for non-interactive sizes (strip has its own
                              cheaper draw-in path). */}
                          {variant.interactive && !prefersReducedMotion && (
                            <m.circle
                              cx={s.x}
                              cy={s.y}
                              r={r}
                              fill="none"
                              stroke={ringColor}
                              strokeWidth={0.6}
                              aria-hidden="true"
                              initial={{ scale: 1, opacity: 0 }}
                              // Bigger + a touch longer (2026-07-22) — where
                              // the ball actually landed needs to be
                              // unmissable at the new, bigger diagram scale
                              // too.
                              animate={{ scale: [1, 3.2], opacity: [0.85, 0] }}
                              transition={{ duration: 0.6, delay: landDelay, ease: EASE_CINEMATIC }}
                              style={{ transformOrigin: `${s.x}px ${s.y}px` }}
                            />
                          )}
                          {/* Outer ring — the lie halo. Every non-final ball
                              carries its lie's bright sibling color; the
                              final ball's halo is pure white so where the
                              hole ended always reads as the one distinct
                              marker. */}
                          <circle
                            cx={s.x}
                            cy={s.y}
                            r={r + 1.0}
                            fill="none"
                            stroke={ringColor}
                            strokeWidth={0.9}
                            opacity={1}
                          />
                          {/* Filled dot — consistent golf-ball cream, NEVER
                              lie-green (that was the "ball is the same green
                              as the background" complaint), with a dark
                              punch-stroke for contrast against the turf. */}
                          <circle cx={s.x} cy={s.y} r={r} fill={ballFill} stroke="#10241c" strokeWidth={0.5} />
                          {/* HIT vs MISS shape signal — a wedge fused to the
                              halo edge, pointing `miss_direction`, when one
                              was logged; a neutral radiating burst when the
                              lie/direction says "miss" but no direction was
                              logged. GOOD outcomes get neither — the clean
                              dot + halo IS the "on target" signal. */}
                          {!isEntryShot && isMiss &&
                            (missDir ? (
                              <path
                                data-miss-wedge="true"
                                d={missWedgePath(s.x, s.y, r + 1.0, missDir)}
                                fill={lieHalo}
                                stroke="#10241c"
                                strokeWidth={0.35}
                              />
                            ) : (
                              <g data-miss-burst="true" aria-hidden="true">
                                {missBurstTicks(s.x, s.y, r + 1.0).map((tick, tickIndex) => (
                                  <line
                                    key={`burst-${s.shot_number}-${tickIndex}`}
                                    x1={tick.x1}
                                    y1={tick.y1}
                                    x2={tick.x2}
                                    y2={tick.y2}
                                    stroke={lieHalo}
                                    strokeWidth={0.7}
                                    strokeLinecap="round"
                                  />
                                ))}
                              </g>
                            ))}
                          {/* Number — per-hole position (1, 2, 3…), not the
                              raw DB shot_number which may be round-wide or
                              synthetic. */}
                          {variant.showShotNumbers && !isEntryShot && (
                            <text
                              x={s.x}
                              y={s.y + 1.1}
                              textAnchor="middle"
                              fontSize="3.4"
                              fontWeight={700}
                              fill="#10241c"
                              style={{ pointerEvents: 'none', userSelect: 'none' }}
                            >
                              {s.display_index}
                            </text>
                          )}
                          {/* Per-shot Strokes Gained — signed, ALWAYS-ON only
                              at review/hero scale (elsewhere it's hover-only,
                              via the tooltip's own SG line). Positioned
                              outside the dot/halo so it never overlaps the
                              number. Suppressed on the green-entry marker —
                              its SG (and every putt's) is shown in
                              PuttingZoom instead; a badge here would just
                              relocate the exact garbling this declutter
                              fixes. */}
                          {sgValue !== null && showSgBadge && !isEntryShot && (
                            <text
                              data-sg-badge="true"
                              x={s.x + r + 4.4}
                              y={s.y - r - 1.2}
                              textAnchor="start"
                              fontSize="2.6"
                              fontWeight={600}
                              fill={sgColor(sgValue)}
                              style={{
                                pointerEvents: 'none',
                                userSelect: 'none',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatSG(sgValue)}
                            </text>
                          )}
                          {/* Distance-to-pin readout — a yardage-book
                              "sprinkler head" number right beside the
                              hovered/focused dot (all interactive sizes,
                              not just review/hero — the tooltip flips edge-
                              to-edge and can land far from the marker; this
                              stays fused to it). */}
                          {distanceReadout && (
                            <text
                              data-distance-readout="true"
                              x={s.x}
                              y={s.y + r + 7.4}
                              textAnchor="middle"
                              fontSize="2.4"
                              fontWeight={600}
                              fill="#fbf3e0"
                              style={{
                                pointerEvents: 'none',
                                userSelect: 'none',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {distanceReadout}
                            </text>
                          )}
                        </>
                      )}
                    </m.g>
                  );
                })}
              </g>

              {/* Green-inset "detail lens" — the scorecard-style zoomed feet
                  scale plot for putts/short shots (see turf.tsx's
                  GreenInsetScenery). Renders as an overlay card on top of
                  the corridor, so it mounts last; skipped entirely when
                  nothing on this hole qualifies for it (never an empty
                  floating lens). Plain, unanimated markup for the dots/
                  segments themselves — the panel's own entrance motion
                  (from GreenInsetScenery) is what makes it "arrive". */}
              {variant.showGreenZoom && plot.greenInset.shots.length > 0 && (
                <GreenInsetScenery size={size} greenInset={plot.greenInset}>
                  {plot.greenInset.segments.map((seg, i) => (
                    <path
                      key={`inset-seg-${i}`}
                      d={segmentPath(seg)}
                      fill="none"
                      stroke="#f8f2dd"
                      strokeWidth={0.8}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  ))}
                  {plot.greenInset.shots.map((s) => {
                    const fill = LIE_COLOR[s.lie] ?? '#a8a39a';
                    const isFinal = s.shot_index === plot.shots.length - 1;
                    return (
                      <circle
                        key={`inset-dot-${s.shot_index}`}
                        cx={s.x}
                        cy={s.y}
                        r={isFinal ? 2.4 : 1.9}
                        fill={fill}
                        stroke="#122720"
                        strokeWidth={0.3}
                      />
                    );
                  })}
                </GreenInsetScenery>
              )}
            </svg>
          </div>

          {/* Hover tooltip — anchored to the hovered dot's own position
              (flips edge-to-edge to stay inside the visible box), not
              descended from the clipped SVG chrome so it's free to
              overflow past the box without being cut off. */}
          {variant.interactive && hovered !== null && hoveredIndex !== null && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: EASE_CINEMATIC }}
              style={tooltipPlacement(hovered.x, hovered.y)}
              className="absolute z-10 pointer-events-none surface-lift rounded-xl px-3 py-2 text-eyebrow text-warm-800 whitespace-nowrap shadow-lg"
              role="tooltip"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-warm-900">
                  Shot {hovered.display_index} of {plot.shots.length}
                </span>
                {hovered.club_type && (
                  <span className="text-warm-400">· {CLUB_LABEL[hovered.club_type] ?? hovered.club_type}</span>
                )}
              </div>
              <div className="text-warm-500 tabular-nums">
                {formatYards(hovered.shot_yards)}
                {hovered.distance_to_pin === 0 ? (
                  <> · holed</>
                ) : hovered.distance_to_pin !== null ? (
                  <> · → {formatYards(hovered.distance_to_pin)} to pin</>
                ) : null}
                {hovered.miss_direction && <> · missed {hovered.miss_direction}</>}
                {hovered.is_penalty && (
                  <span className="ml-1.5 font-medium text-danger">
                    {hovered.penalty_type
                      ? `penalty: ${PENALTY_LABEL[hovered.penalty_type] ?? hovered.penalty_type}`
                      : 'penalty'}
                    {/* Symbolic shots never got a real flight to measure —
                        say so explicitly rather than leaving the reader to
                        infer it from the bare "—" above. */}
                    {hovered.symbolic ? ' — no distance recorded' : ''}
                  </span>
                )}
              </div>
              {/* Signed Strokes Gained — on hover, at every size (the
                  always-on SVG badge only exists at review/hero scale; the
                  tooltip is the universal fallback). */}
              {typeof hovered.sg === 'number' && Number.isFinite(hovered.sg) && (
                <div className="tabular-nums" style={{ color: sgTooltipColor(hovered.sg) }}>
                  SG {formatSG(hovered.sg)}
                </div>
              )}
              <div className="text-warm-500">
                {LIE_LABEL[lieBeforeShot(hoveredIndex)]} → {LIE_LABEL[hovered.lie]}
              </div>
              {hovered.lie === 'green' &&
                (insetFeetByShotIndex.get(hoveredIndex) != null || hovered.putt_break || hovered.putt_slope) && (
                  <div className="text-warm-500">
                    {formatFeet(insetFeetByShotIndex.get(hoveredIndex) ?? null)}
                    {hovered.putt_break ? `, ${PUTT_BREAK_SHORT[hovered.putt_break] ?? hovered.putt_break}` : ''}
                    {hovered.putt_slope ? `, ${PUTT_SLOPE_LABEL[hovered.putt_slope] ?? hovered.putt_slope}` : ''}
                  </div>
                )}
              {hovered.lie === 'green' && hovered.miss_tags && hovered.miss_tags.length > 0 && (
                <div className="text-warm-500">Miss: {hovered.miss_tags.join(', ')}</div>
              )}
              {hovered.notes && (
                <div className="mt-0.5 max-w-[200px] whitespace-normal text-warm-500 italic">
                  “{hovered.notes}”
                </div>
              )}
            </m.div>
          )}
        </div>

        {/* Footer disclosure — the one honesty caption every rich size
            carries: every distance on this diagram is what the player
            typed in, not a GPS/laser reading. Skipped at `strip` (no room,
            18 simultaneous copies would just be noise). */}
        {variant.showHeader && (
          <p className="mt-1.5 px-1 text-eyebrow leading-snug text-warm-400/80">
            Distances are player-logged, not GPS-measured.
          </p>
        )}

        {/* Empty state */}
        {variant.showEmptyLabel && plot.shots.length === 0 && (
          <m.div
            variants={enterVariants}
            initial="hidden"
            animate="visible"
            transition={prefersReducedMotion ? { duration: 0 } : (enterTransition)}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span className="text-eyebrow uppercase tracking-[0.14em] text-warm-100/70">
              No shots logged
            </span>
          </m.div>
        )}
      </m.div>
    </LazyMotion>
  );
}

export type { HoleShotPathProps } from './types';
export { PuttingZoom } from './PuttingZoom';
export type { PuttingZoomProps } from './PuttingZoom';
