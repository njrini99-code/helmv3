/**
 * PuttingZoom — the round-review "putting green" side panel.
 *
 * Companion to `HoleShotPath`, not a variant of it. Before the 2026-07-22
 * redesign the green detail lived as a small lens CRAMMED inside the main
 * hole box (`turf.tsx`'s `GreenInsetScenery`, still used by `card`/`inline`
 * sizes) — at hole scale a par-3's green→green putts collapsed to a couple
 * of illegible pixels. This component is that same honest feet-scale plot
 * (`PlottedHole.greenInset`), rendered as its OWN clean top-down panel the
 * caller places NEXT TO the main shot-track, not inside it — a real
 * magnification, not an overlay.
 *
 * ONE COORDINATE FRAME (2026-07-23 Wave C bugfix): shots and the pin/flag
 * glyph are drawn from the SAME source, unshifted — `plot.greenInset.shots`
 * verbatim, pinned at `plot.greenInset.pin`. An earlier `deriveEntryShift`
 * translated every dot laterally (toward the main corridor's approach
 * landing side) WITHOUT moving the pin/flag glyph, which visibly floated a
 * holed putt's dot off the cup on any hole where the entry side was known —
 * lining up two stylizations (the corridor's lateral placement and this
 * panel's) is a net honesty LOSS, not a gain, when it comes at the cost of
 * "the made ball sits in the hole." Dropping it entirely means every dot,
 * including a holed one, renders exactly where `geometry.ts`'s honest
 * radius + miss-direction angle puts it — a made putt is always
 * bit-for-bit co-located with the pin.
 *
 * Small local duplicates (LIE_LINE_COLOR/label maps, the SG formatter)
 * mirror `index.tsx`'s versions rather than importing them —
 * same rationale `turf.tsx`/`hazards.tsx` already state: this file and
 * `index.tsx` stay independently editable without a shared-module
 * coordination point, and importing FROM `index.tsx` here would create a
 * cycle (index.tsx re-exports this component).
 *
 * MARKERS, 2026-07-22 redesign: putt dots use the SAME cream-ball +
 * lie-halo treatment as the main track's markers in `index.tsx` — the fill
 * is always the same golf-ball cream (never lie-green, the exact "ball is
 * the same green as the background" complaint at putting-green scale too),
 * the lie signal lives on the outer ring instead.
 *
 * WAVE C REBUILD, 2026-07-23 — this panel is now the AUTHORITATIVE putt
 * read (the main corridor no longer draws a numbered dot or SG badge for
 * any on-green shot except the single green-entry marker — see
 * `index.tsx`'s own module doc). Four additive layers on top of the
 * existing honest geometry, none of which ever changes a dot's position:
 *
 *   1. MIN-SEP LEADER TICKS — `geometry.ts`'s collision-resolve pass can
 *      floor a near-pin dot's radius outward and/or nudge its angle to fan
 *      it apart from a neighbor (`leader: true` flags exactly which dots
 *      were moved either way); `true_radius_units` — the shot's real
 *      distance from the pin — never changes. A thin dashed radial tick
 *      from a leadered dot back toward the pin, ending exactly at that
 *      honest `true_radius_units` point (computed from the dot's own
 *      actual rendered, unshifted coordinates), discloses precisely where
 *      it really sits without ever moving the dot itself.
 *   2. BREAK/SLOPE READ ANNOTATION — `putt_break`/`putt_slope` are the
 *      player's READ of the green, captured at entry; the solid segment
 *      line stays pure OUTCOME (where the ball actually finished). A thin,
 *      dashed, lower-opacity glyph layers the read on top — never bends the
 *      outcome line itself. See `puttReadGlyph` below.
 *   3. EXPLICIT MAKE/MISS — `putt_made` (not "is this the last dot") drives
 *      a filled dot + helm-green ring + one-shot pulse for a make, and a
 *      distinct hollow "unresolved" ring for a hole's last logged putt that
 *      did NOT go in (picked up / conceded — never silently drawn as an
 *      ordinary intermediate miss).
 *   4. SG-PER-PUTT — surfaced in the hover tooltip (signed, tabular-nums,
 *      colored), not as another always-on chip on the dot — an always-on
 *      per-dot numeral here would just relocate the exact "SG badges
 *      garble at the pin" problem this whole panel exists to fix.
 *
 * DEAD DATA: `putt_details.estimated_break_inches` and
 * `golf_player_stats_cache.putt_make_pct_{left_to_right,right_to_left,
 * straight}` are verified 0-population in prod as of this rebuild — neither
 * is rendered here, regardless of what older design research recommended.
 *
 * WAVE D — SEASON MAKE% CONTEXT (2026-07-23): the tooltip's optional
 * `puttMakePct` prop (`round-review-shots.ts`'s `fetchPlayerPuttMakePct`,
 * fetched once by `ReviewHero` and threaded down) adds ONE self-relative
 * line — "Your season: ~62% from 3-5 ft" — bucketing THIS putt's own real
 * `shot_feet` into the SAME band `golf_player_stats_cache.putt_make_pct_
 * {0_3,3_5,5_10,10_15,15_20,20_plus}ft` (BY DISTANCE, confirmed populated)
 * is keyed by, via `bandForPuttFeet`. Never the by-BREAK-direction columns
 * (dead, see above). Entirely optional/null-safe: no prop, no `shot_feet`,
 * or no attempts logged yet in that band all render nothing/an honest
 * "not logged yet" line — never a fabricated percentage.
 */

'use client';

import { Fragment, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ReactNode } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import {
  GREEN_INSET_VB,
  segmentPath,
  formatFeet,
  type PlottedHole,
  type PlottedSegment,
  type PlottedShot,
} from './geometry';
import type { Lie } from './types';
import { EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import {
  bandForPuttFeet,
  puttMakePctBandLabel,
  type PuttMakePctByBand,
} from '@/components/golf/coachhelm/round-review/round-review-shots';

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
// MAKE/MISS — explicit, via `putt_made` (never positional — a "last dot in
// the ledger" heuristic silently mis-renders a picked-up/conceded putt as an
// ordinary make). Helm green is the app's one success/accent color
// (`--fw-color-accent-500`, #16A34A, "locked" per design-tokens.css) — SVG
// presentation attributes here stay plain hex (matching every other color
// in this file) rather than `var()`; the HTML tooltip below uses the real
// token via `var()` since it's a normal DOM element.
// -----------------------------------------------------------------------------
const MADE_COLOR = '#16A34A';

// -----------------------------------------------------------------------------
// Strokes Gained — same signed-badge convention as `index.tsx`'s corridor
// (duplicated locally per this file's own no-cross-import rule above),
// surfaced in the TOOLTIP only (never an always-on chip on the dot itself —
// see the module doc's point 4).
//
// The tooltip is a LIGHT `surface-lift` HTML card on cream, NOT the dark
// SVG canvas — `SG_TOOLTIP_*` is its own color set, deliberately separate
// from any future dark-canvas SG badge this file might add. The old single
// `sgColor()` reused a dark-canvas-tuned neutral (`rgba(251,243,224,0.6)`,
// near-white cream at 60% opacity) verbatim as inline tooltip text color —
// "SG E" rendered near-invisible near-white-on-cream, and the light-mint
// gain color was low-contrast there too (Wave C BUG 4).
// -----------------------------------------------------------------------------
const SG_NEAR_ZERO_THRESHOLD = 0.05;
const SG_TOOLTIP_NEUTRAL_COLOR = 'var(--fw-color-text-secondary)'; // dark muted, readable on cream
const SG_TOOLTIP_GAINED_COLOR = 'var(--fw-color-accent-500)'; // helm green — same token this tooltip's "made" line already uses
// WAVE D BUG FIX (2026-07-23): the on-canvas penalty red (`LIE_LINE_COLOR.
// penalty`, '#f0715c') measures only ~2.1:1 against this tooltip's real
// `surface-lift` background — well under WCAG AA's 4.5:1 floor for normal
// text (verified against both the card's own translucent-over-dark-canvas
// composite and its opaque cream reading; see index.tsx's matching note for
// the full contrast workup). '#9B2226' is a deliberately DARKER, still
// unmistakably red tooltip-only color — ≥5.2:1 even in the worst-case
// composite, ≥7.4:1 against the card's opaque cream reading. The on-canvas
// SVG badge/segment red (`LIE_LINE_COLOR.penalty`, dashed lines, the
// hexagon "+1" marker) is UNCHANGED — this constant only feeds
// `sgTooltipColor`, never SVG presentation attributes.
const SG_TOOLTIP_LOST_COLOR = '#9B2226';

function formatSG(sg: number): string {
  if (Math.abs(sg) < SG_NEAR_ZERO_THRESHOLD) return 'E';
  return `${sg > 0 ? '+' : '-'}${Math.abs(sg).toFixed(2)}`;
}

function sgTooltipColor(sg: number): string {
  if (Math.abs(sg) < SG_NEAR_ZERO_THRESHOLD) return SG_TOOLTIP_NEUTRAL_COLOR;
  return sg > 0 ? SG_TOOLTIP_GAINED_COLOR : SG_TOOLTIP_LOST_COLOR;
}

/** "missed short & low" from `putt_details.miss_tags` — null when unlogged
 *  or empty, never a fabricated read. */
function formatMissTags(tags: string[] | null | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  return `missed ${tags.join(' & ')}`;
}

/** "Your season: ~62% from 3-5 ft" — see the module doc's WAVE D note.
 *  `feet` is THIS putt's own real logged length (never the entry shot's
 *  approach length — callers gate on `!isEntryHovered` first). Null-safe at
 *  every step: no `puttMakePct` prop, no `feet`, or a band with zero
 *  attempts logged yet ALL return an honest line (never a fabricated
 *  percentage) — the last case says so explicitly rather than silently
 *  omitting the row (so a reader never wonders whether the app forgot to
 *  fetch). Percentages are stored 0-100 already (see
 *  `fetchPlayerPuttMakePct`'s doc) — round, don't re-scale. */
function formatPuttMakePctContext(
  puttMakePct: PuttMakePctByBand | null | undefined,
  feet: number | null,
): string | null {
  if (!puttMakePct || feet === null) return null;
  const band = bandForPuttFeet(feet);
  const label = puttMakePctBandLabel(band);
  const pct = puttMakePct[band];
  if (pct === null) return `Your season: no ${label} putts logged yet`;
  return `Your season: ~${Math.round(pct)}% from ${label}`;
}

/** Per-dot classification, shared between the marker render and the
 *  tooltip so the two never drift. `i === 0` is always the green-entry
 *  shot (chronologically first inset shot — see `index.tsx`'s matching
 *  comment); it never counts as made/unresolved even if `putt_made`
 *  happens to be set on it (entry shots aren't putts). */
function classifyPutt(
  i: number,
  rich: PlottedShot | null | undefined,
  totalInset: number,
): { isEntry: boolean; isMade: boolean; isUnresolved: boolean } {
  const isEntry = i === 0;
  const puttMade = rich?.putt_made ?? null;
  const isMade = !isEntry && puttMade === true;
  const isUnresolved = !isEntry && i === totalInset - 1 && puttMade === false;
  return { isEntry, isMade, isUnresolved };
}

// -----------------------------------------------------------------------------
// MIN-SEP LEADER TICKS — geometry.ts's collision-resolve pass can floor a
// near-pin dot's radius outward and/or nudge its angle to fan it apart from
// a neighbor; `true_radius_units` (its real distance from the pin) never
// changes either way. `leader: true` marks exactly which dots were moved.
// This renders that honesty check as a thin dashed radial tick FROM the
// dot's actual DRAWN position back toward the pin, ending exactly at the
// point `true_radius_units` away from the pin along that same line — a
// floored dot's tick is genuinely long (it discloses how far outward the
// floor pushed it); an angle-only nudge's tick is ~zero-length (nothing
// radial to disclose — its drawn radius already equals its true one).
// Computed from the ACTUAL rendered (post-fix, no-shift) coordinates, which
// since the entryShift removal are always `plot.greenInset`'s own honest
// values — never a stand-in constant length.
// -----------------------------------------------------------------------------
function leaderTickEnd(
  dot: { x: number; y: number },
  pin: { x: number; y: number },
  trueRadiusUnits: number,
): { x: number; y: number } | null {
  const dx = dot.x - pin.x;
  const dy = dot.y - pin.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return null; // too close to the pin for a tick to read as anything but noise
  const ux = dx / dist;
  const uy = dy / dist;
  return { x: pin.x + ux * trueRadiusUnits, y: pin.y + uy * trueRadiusUnits };
}

// -----------------------------------------------------------------------------
// BREAK/SLOPE READ ANNOTATION — the "more accurate read" ask. `putt_break`/
// `putt_slope` are the PLAYER'S READ of the green, captured at entry —
// distinct from the solid segment line (pure OUTCOME: where the ball
// actually finished, from `distance_to_hole_after` + the geometry layer's
// miss-direction nudge). This never touches that line's own path — it
// draws a second, thin/dashed/lower-opacity mark so "read" and "fact" can
// never be mistaken for one another (path = fact, glyph = read). Straight/
// level reads are intentionally suppressed per-axis (nothing to draw for
// "no break" / "no slope"). `putt_slope` carries no DB CHECK constraint
// (unlike `putt_break`) — both are defensive-normalized on read here.
// -----------------------------------------------------------------------------
type PuttBreakRead = 'left_to_right' | 'right_to_left' | 'straight' | 'multiple';
type PuttSlopeRead = 'uphill' | 'downhill' | 'level' | 'severe';

function normalizePuttBreakRead(raw: string | null | undefined): PuttBreakRead | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s === 'left_to_right' || s === 'right_to_left' || s === 'straight' || s === 'multiple') return s;
  return null;
}

function normalizePuttSlopeRead(raw: string | null | undefined): PuttSlopeRead | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s === 'uphill' || s === 'downhill' || s === 'level' || s === 'severe') return s;
  return null;
}

const READ_COLOR = 'rgba(248,242,221,0.55)';
const READ_COLOR_SEVERE = 'rgba(248,242,221,0.85)';
const BREAK_ARC_BULGE = 3.0;
const BREAK_ARC_BULGE_SEVERE = 4.4;
const SLOPE_TICK_SIZE = 1.5;
const SLOPE_TICK_SIZE_SEVERE = 2.2;

/**
 * Builds the read-annotation SVG nodes for one putt segment, or `null` when
 * the read is `straight`/`level` on both axes (nothing to draw) or the
 * destination shot never logged a read at all. Only ADDS marks near the
 * segment's midpoint — never reads or mutates `seg.from`/`seg.to`.
 */
function puttReadGlyph(seg: PlottedSegment, rich: PlottedShot, key: string): ReactNode {
  const breakRead = normalizePuttBreakRead(rich.putt_break ?? null);
  const slopeRead = normalizePuttSlopeRead(rich.putt_slope ?? null);
  if (!breakRead && !slopeRead) return null;

  const severe = slopeRead === 'severe';
  const midX = (seg.from.x + seg.to.x) / 2;
  const midY = (seg.from.y + seg.to.y) / 2;
  const dx = seg.to.x - seg.from.x;
  const dy = seg.to.y - seg.from.y;
  const len = Math.hypot(dx, dy);
  const nodes: ReactNode[] = [];
  let hasBreakGlyph = false;

  if ((breakRead === 'left_to_right' || breakRead === 'right_to_left') && len > 0.05) {
    const ux = dx / len;
    const uy = dy / len;
    // Fixed screen-space "right-hand of travel" normal — a symbolic read
    // glyph, same honesty tier as the corridor's miss-direction wedge: it
    // never claims a literal lateral yardage, only a break DIRECTION.
    const nx = uy;
    const ny = -ux;
    const bulge = (severe ? BREAK_ARC_BULGE_SEVERE : BREAK_ARC_BULGE) * (breakRead === 'left_to_right' ? 1 : -1);
    const cx = midX + nx * bulge;
    const cy = midY + ny * bulge;
    nodes.push(
      <path
        key={`${key}-break`}
        data-putt-read="break"
        data-putt-read-direction={breakRead}
        d={`M ${seg.from.x.toFixed(2)} ${seg.from.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${seg.to.x.toFixed(2)} ${seg.to.y.toFixed(2)}`}
        fill="none"
        stroke={severe ? READ_COLOR_SEVERE : READ_COLOR}
        strokeWidth={severe ? 0.85 : 0.55}
        strokeDasharray="1.3 1.1"
        strokeLinecap="round"
      />,
    );
    hasBreakGlyph = true;
  } else if (breakRead === 'multiple') {
    // A compound break never gets a single-direction chevron — a small
    // direction-agnostic S-curve glyph instead (don't fabricate a curve
    // shape more specific than what the player actually logged).
    const scale = severe ? 1.35 : 1;
    const armX = 1.7 * scale;
    const armY = 1.1 * scale;
    nodes.push(
      <path
        key={`${key}-multi`}
        data-putt-read="multiple"
        d={`M ${(midX - armX).toFixed(2)} ${(midY - armY).toFixed(2)} Q ${midX.toFixed(2)} ${(midY - armY).toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)} Q ${midX.toFixed(2)} ${(midY + armY).toFixed(2)} ${(midX + armX).toFixed(2)} ${(midY + armY).toFixed(2)}`}
        fill="none"
        stroke={severe ? READ_COLOR_SEVERE : READ_COLOR}
        strokeWidth={severe ? 0.85 : 0.55}
        strokeLinecap="round"
      />,
    );
    hasBreakGlyph = true;
  }

  if (slopeRead === 'uphill' || slopeRead === 'downhill') {
    const size = severe ? SLOPE_TICK_SIZE_SEVERE : SLOPE_TICK_SIZE;
    // Offset below any break arc so the two reads never overlap; screen
    // "up" (smaller y) = uphill tick, screen "down" = downhill tick — a
    // literal, honest up/down glyph (no real elevation data exists to
    // orient it any more precisely than the logged category itself).
    const tickY = midY + (hasBreakGlyph ? 3.2 : 0);
    const apexY = slopeRead === 'uphill' ? tickY - size : tickY + size;
    nodes.push(
      <path
        key={`${key}-slope`}
        data-putt-read={slopeRead}
        d={`M ${(midX - size).toFixed(2)} ${tickY.toFixed(2)} L ${midX.toFixed(2)} ${apexY.toFixed(2)} L ${(midX + size).toFixed(2)} ${tickY.toFixed(2)}`}
        fill="none"
        stroke={READ_COLOR}
        strokeWidth={0.55}
        strokeLinecap="round"
        strokeLinejoin="round"
      />,
    );
  } else if (severe && !hasBreakGlyph) {
    // "severe" carries no direction of its own (a separate category from
    // uphill/downhill, not a magnitude on top of them) — when there's no
    // break arc to bolden instead, a standalone bold double-chevron marks
    // "significant slope" without fabricating an up/down claim the
    // category doesn't carry.
    const size = SLOPE_TICK_SIZE_SEVERE;
    nodes.push(
      <g key={`${key}-severe`} data-putt-read="severe" aria-hidden="true">
        <path
          d={`M ${(midX - size).toFixed(2)} ${(midY - 1.2).toFixed(2)} L ${midX.toFixed(2)} ${(midY - size - 1.2).toFixed(2)} L ${(midX + size).toFixed(2)} ${(midY - 1.2).toFixed(2)}`}
          fill="none"
          stroke={READ_COLOR_SEVERE}
          strokeWidth={0.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={`M ${(midX - size).toFixed(2)} ${(midY + 1.2).toFixed(2)} L ${midX.toFixed(2)} ${(midY + size + 1.2).toFixed(2)} L ${(midX + size).toFixed(2)} ${(midY + 1.2).toFixed(2)}`}
          fill="none"
          stroke={READ_COLOR_SEVERE}
          strokeWidth={0.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>,
    );
  }

  if (nodes.length === 0) return null;
  // `puttReadGlyph` is invoked from inside `segments.map(...)` (see the call
  // site below) — a bare `<>...</>` shorthand fragment can't carry a `key`
  // prop, which produced a real "each child in a list should have a unique
  // key" console warning. `Fragment` (not the shorthand) accepts the caller's
  // own per-segment `key`.
  return <Fragment key={key}>{nodes}</Fragment>;
}

function tooltipPlacement(x: number, y: number): { left: string; top: string; transform: string } {
  const leftPct = (x / GREEN_INSET_VB.width) * 100;
  const topPct = (y / GREEN_INSET_VB.height) * 100;
  const above = topPct > 60;
  const alignX: 'start' | 'center' | 'end' = leftPct < 25 ? 'start' : leftPct > 75 ? 'end' : 'center';
  const translateX = alignX === 'start' ? '0%' : alignX === 'end' ? '-100%' : '-50%';
  const translateY = above ? '-100%' : '0%';
  const gapPx = 8;
  const top = above ? `calc(${topPct}% - ${gapPx}px)` : `calc(${topPct}% + ${gapPx}px)`;
  return { left: `${leftPct}%`, top, transform: `translate(${translateX}, ${translateY})` };
}

export interface PuttingZoomProps {
  /** Already-plotted hole data — the caller (round review) computes this
   *  once via `plotHole()` and shares it with both this panel and the emptiness
   *  check, rather than each consumer re-deriving it from raw shots. */
  plot: PlottedHole;
  className?: string;
  /** Player's SEASON putt make% by distance band (`golf_player_stats_cache
   *  .putt_make_pct_{0_3,3_5,5_10,10_15,15_20,20_plus}ft`, fetched once by
   *  the caller via `fetchPlayerPuttMakePct`) — powers ONLY the tooltip's
   *  "your season" context line (see the module doc's WAVE D note).
   *  `null`/`undefined` (not yet fetched, or fetch failed) simply omits the
   *  line — never a fabricated percentage. */
  puttMakePct?: PuttMakePctByBand | null;
}

/**
 * The putting-green zoom panel. Returns `null` when nothing on this hole
 * qualifies for the green inset (e.g. every shot stayed well off the green)
 * — never renders an empty floating panel.
 */
export function PuttingZoom({ plot, className, puttMakePct }: PuttingZoomProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { greenInset } = plot;

  // ONE COORDINATE FRAME — see the module doc. `greenInset.shots`/
  // `.segments` verbatim, never translated: the pin/flag glyph below is
  // drawn at this same `greenInset.pin`, so a holed putt's dot is always
  // bit-for-bit co-located with the cup.
  const { shots, segments } = greenInset;

  if (shots.length === 0) return null;

  const hovered = hoveredIndex != null ? shots[hoveredIndex] ?? null : null;
  const hoveredRich = hovered ? plot.shots[hovered.shot_index] : null;
  const isEntryHovered = hoveredIndex === 0;
  const hoveredMeta =
    hoveredIndex != null ? classifyPutt(hoveredIndex, hoveredRich, shots.length) : null;

  function handleTouchCycle(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType !== 'touch' || shots.length === 0) return;
    setHoveredIndex((cur) => (cur === null ? 0 : (cur + 1) % shots.length));
  }

  return (
    <LazyMotion features={loadFeatures}>
      <div className={['group relative', className ?? ''].filter(Boolean).join(' ')}>
        <div
          className={[
            'absolute inset-0 rounded-2xl overflow-hidden',
            'shadow-[0_18px_40px_-22px_rgba(15,42,30,0.55)] ring-1 ring-white/10',
            'bg-[#132a20]',
          ].join(' ')}
        >
          <svg
            viewBox={`0 0 ${GREEN_INSET_VB.width} ${GREEN_INSET_VB.height}`}
            className="h-full w-full"
            onPointerUp={handleTouchCycle}
            aria-label="Putting green detail"
          >
            <defs>
              <radialGradient id="puttingZoomGreen" cx="45%" cy="40%" r="72%">
                <stop offset="0%" stopColor="#8fcda3" />
                <stop offset="60%" stopColor="#5fa87e" />
                <stop offset="100%" stopColor="#3d7d5c" />
              </radialGradient>
            </defs>

            {/* Top-down green — fills the whole panel (no lens chrome; this
                IS the panel, not a floating overlay). */}
            <circle cx="50" cy="50" r="49" fill="url(#puttingZoomGreen)" />
            <ellipse cx="38" cy="32" rx="20" ry="12" fill="#ffffff" opacity="0.08" />

            {/* Distance rings — the same honest feet-scale ticks the old
                crammed inset drew, now with room to carry real labels. */}
            {greenInset.ticks.map((t) => {
              const r = greenInset.pin.y - t.y;
              return (
                <g key={t.feet}>
                  <circle
                    cx={greenInset.pin.x}
                    cy={greenInset.pin.y}
                    r={r}
                    fill="none"
                    stroke="#0d1f17"
                    strokeOpacity="0.25"
                    strokeWidth="0.5"
                    strokeDasharray="1.6 1.4"
                  />
                  <text
                    x={greenInset.pin.x + 1.4}
                    y={greenInset.pin.y - r + 3.4}
                    fontSize="3.4"
                    fontWeight={500}
                    fill="#f4ecd8"
                    fillOpacity="0.4"
                    fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {t.feet}ft
                  </text>
                </g>
              );
            })}

            {/* Pin + flag, centered — matches the main track's pin exactly
                in concept (cup at the plot's honest zero point). */}
            <circle cx={greenInset.pin.x} cy={greenInset.pin.y} r="2.3" fill="#0a1a13" />
            <line
              x1={greenInset.pin.x}
              y1={greenInset.pin.y}
              x2={greenInset.pin.x}
              y2={greenInset.pin.y - 10}
              stroke="#f4ecd8"
              strokeWidth="0.6"
              strokeLinecap="round"
            />
            <m.path
              d={`M ${greenInset.pin.x} ${greenInset.pin.y - 10} L ${greenInset.pin.x + 7} ${greenInset.pin.y - 8.4} L ${greenInset.pin.x} ${greenInset.pin.y - 6.8} Z`}
              fill="#e3543b"
              animate={prefersReducedMotion ? undefined : { skewX: [0, -3, 0, 3, 0] }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: `${greenInset.pin.x}px ${greenInset.pin.y - 9}px` }}
            />

            {/* Putt lines — thick, bright, lie-colored, arced (same Bezier
                shape the main track uses via the shared `segmentPath`),
                drawing in shot-by-shot on mount. Pure OUTCOME — where the
                ball actually finished. Never bent by the read annotation
                below (path = fact, glyph = read). */}
            <g>
              {segments.map((seg, i) => {
                const destShot = shots[seg.to_index];
                const rich = destShot ? plot.shots[destShot.shot_index] : null;
                const isPenalty = !!rich?.is_penalty;
                const stroke = isPenalty ? LIE_LINE_COLOR.penalty : LIE_LINE_COLOR[destShot?.lie ?? 'other'];
                const delaySec = 0.1 + i * 0.14;
                const durationSec = 0.16;
                return (
                  <m.path
                    key={`zoom-seg-${i}`}
                    d={segmentPath(seg)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    strokeDasharray={isPenalty ? '2 1.5' : undefined}
                    opacity={0.95}
                    initial={prefersReducedMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={
                      prefersReducedMotion ? { duration: 0 } : { duration: durationSec, delay: delaySec, ease: EASE_CINEMATIC }
                    }
                  />
                );
              })}
            </g>

            {/* Break/slope READ annotation — additive, distinct from the
                solid outcome line above (see the module doc's point 2).
                Never rendered for the entry segment (an approach shot never
                carries a putt read) — `puttReadGlyph` itself also no-ops
                when neither axis has a usable value. */}
            <g aria-hidden="true">
              {segments.map((seg, i) => {
                const destShot = shots[seg.to_index];
                const rich = destShot ? plot.shots[destShot.shot_index] : null;
                if (!rich || seg.to_index === 0) return null;
                return puttReadGlyph(seg, rich, `zoom-read-${i}`);
              })}
            </g>

            {/* Min-separation leader ticks — see the module doc's point 1.
                Rendered beneath the dots so the dot itself stays the clean,
                unobstructed focal point. */}
            <g aria-hidden="true">
              {shots
                .filter((s) => s.leader)
                .map((s) => {
                  const end = leaderTickEnd(s, greenInset.pin, s.true_radius_units);
                  if (!end) return null;
                  return (
                    <line
                      key={`leader-${s.shot_index}`}
                      data-leader-tick="true"
                      x1={s.x}
                      y1={s.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="#f4ecd8"
                      strokeOpacity={0.5}
                      strokeWidth={0.5}
                      strokeDasharray="0.8 0.8"
                      strokeLinecap="round"
                    />
                  );
                })}
            </g>

            {/* Putt dots — numbered, landing-pulse on arrival, explicit
                make/miss/unresolved styling from `putt_made` (see the
                module doc's point 3 — never positional). */}
            <g>
              {shots.map((s, i) => {
                const rich = plot.shots[s.shot_index];
                const { isEntry, isMade, isUnresolved } = classifyPutt(i, rich, shots.length);
                const puttOutcome: 'entry' | 'made' | 'unresolved' | 'miss' = isEntry
                  ? 'entry'
                  : isMade
                    ? 'made'
                    : isUnresolved
                      ? 'unresolved'
                      : 'miss';

                // Same cream-ball + lie-halo treatment as the main track's
                // markers — see the module doc's 2026-07-22 note. A MADE
                // putt swaps the ring to helm green (never the fill — the
                // ball itself always stays golf-ball cream); an UNRESOLVED
                // putt (the hole's last logged putt, explicitly NOT holed)
                // opens the fill into a hollow/dashed ring instead, clearly
                // distinct from an ordinary intermediate miss.
                const lieHalo = LIE_LINE_COLOR[s.lie] ?? LIE_LINE_COLOR.other;
                const ringColor = isMade ? MADE_COLOR : lieHalo;
                const ballFill = isUnresolved ? 'none' : '#fbf3e0';
                const dotStroke = isUnresolved ? '#f8f2dd' : '#132a20';
                const dotStrokeWidth = isUnresolved ? 0.55 : 0.35;
                const numberFill = isUnresolved ? '#f8f2dd' : '#132a20';
                const r = isMade ? 3.1 : isUnresolved ? 3 : 2.5;
                const pulseColor = isMade ? MADE_COLOR : ringColor;
                const pulseScale = isMade ? 2.8 : 2.4;
                const pulseDuration = isMade ? 0.6 : 0.5;
                const delaySec = i === 0 ? 0.05 : 0.1 + (i - 1) * 0.14 + 0.16;
                return (
                  <m.g
                    key={`zoom-dot-${s.shot_index}`}
                    data-putt-outcome={puttOutcome}
                    initial={prefersReducedMotion ? false : { scale: 0, opacity: 0 }}
                    animate={prefersReducedMotion ? { scale: 1, opacity: 1 } : { scale: [0, 1.35, 1], opacity: 1 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.22, delay: delaySec, ease: EASE_CINEMATIC }}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setHoveredIndex(i)}
                    onBlur={() => setHoveredIndex(null)}
                    style={{ transformOrigin: `${s.x}px ${s.y}px` }}
                    tabIndex={0}
                    aria-label={
                      isMade
                        ? `Putt ${s.display_index}, made`
                        : isUnresolved
                          ? `Putt ${s.display_index}, not holed out`
                          : undefined
                    }
                  >
                    {!prefersReducedMotion && (
                      <m.circle
                        cx={s.x}
                        cy={s.y}
                        r={r}
                        fill="none"
                        stroke={pulseColor}
                        strokeWidth={0.7}
                        aria-hidden="true"
                        initial={{ scale: 1, opacity: 0 }}
                        animate={{ scale: [1, pulseScale], opacity: [0.85, 0] }}
                        transition={{ duration: pulseDuration, delay: delaySec + 0.16, ease: EASE_CINEMATIC }}
                        style={{ transformOrigin: `${s.x}px ${s.y}px` }}
                      />
                    )}
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={r + 0.8}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth={isMade ? 0.6 : 0.45}
                      strokeDasharray={isUnresolved ? '1.2 1' : undefined}
                      opacity={0.9}
                    />
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={r}
                      fill={ballFill}
                      stroke={dotStroke}
                      strokeWidth={dotStrokeWidth}
                      strokeDasharray={isUnresolved ? '1 0.8' : undefined}
                    />
                    <text
                      x={s.x}
                      y={s.y + 1}
                      textAnchor="middle"
                      fontSize="3"
                      fontWeight={600}
                      fill={numberFill}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {s.display_index}
                    </text>
                    {rich?.is_penalty && (
                      <circle cx={s.x + r + 1.6} cy={s.y - r - 1.6} r="1.1" fill="#e3543b" stroke="#132a20" strokeWidth="0.3" />
                    )}
                  </m.g>
                );
              })}
            </g>
          </svg>
        </div>

        {hovered && hoveredIndex !== null && hoveredMeta && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: EASE_CINEMATIC }}
            style={tooltipPlacement(hovered.x, hovered.y)}
            className="absolute z-10 pointer-events-none surface-lift rounded-xl px-3 py-2 text-eyebrow text-warm-800 whitespace-nowrap shadow-lg"
            role="tooltip"
          >
            <div className="font-medium text-warm-900">
              {isEntryHovered ? `Shot ${hovered.display_index} · reached green` : `Putt ${hovered.display_index}`}
            </div>
            <div
              className="text-warm-500 tabular-nums"
              style={hoveredMeta.isMade ? { color: 'var(--fw-color-accent-500)' } : undefined}
            >
              {isEntryHovered
                ? `${formatFeet(hovered.remaining_feet)} from pin`
                : hovered.remaining_feet === 0
                  ? 'holed'
                  : `${formatFeet(hovered.shot_feet)} putt`}
            </div>
            {hoveredMeta.isUnresolved && <div className="text-warm-500">Not holed out</div>}
            {hoveredRich?.putt_break || hoveredRich?.putt_slope ? (
              <div className="text-warm-500">
                {hoveredRich.putt_break ? PUTT_BREAK_SHORT[hoveredRich.putt_break] ?? hoveredRich.putt_break : ''}
                {hoveredRich.putt_break && hoveredRich.putt_slope ? ', ' : ''}
                {hoveredRich.putt_slope ? PUTT_SLOPE_LABEL[hoveredRich.putt_slope] ?? hoveredRich.putt_slope : ''}
              </div>
            ) : null}
            {!isEntryHovered && formatPuttMakePctContext(puttMakePct, hovered.shot_feet) && (
              <div className="text-warm-500">
                {formatPuttMakePctContext(puttMakePct, hovered.shot_feet)}
              </div>
            )}
            {!isEntryHovered && formatMissTags(hoveredRich?.miss_tags) && (
              <div className="text-warm-500">{formatMissTags(hoveredRich?.miss_tags)}</div>
            )}
            {typeof hoveredRich?.sg === 'number' && Number.isFinite(hoveredRich.sg) && (
              <div className="tabular-nums" style={{ color: sgTooltipColor(hoveredRich.sg) }}>
                SG {formatSG(hoveredRich.sg)}
              </div>
            )}
          </m.div>
        )}
      </div>
    </LazyMotion>
  );
}
