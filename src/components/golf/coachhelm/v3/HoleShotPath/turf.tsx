/**
 * HoleShotPath — turf + scenery layer.
 *
 * 2026-07-22 FLAT SCHEMATIC REDESIGN — Nick rejected the previous textured
 * "photo of grass" ground layer three times ("looks sloppy", "not good
 * enough") and asked explicitly for a clean, confident, transit-map-style
 * DIAGRAM instead. There is no course GPS / hole-geometry data anywhere in
 * this app (see geometry.ts's own doc) — this was never a real aerial photo
 * and never claimed to be one, so the fix is to stop pretending: no mow
 * stripes, no grain, no seeded-wobble organic edges, no multi-stop
 * photoreal gradients, no drop-shadow filters faking depth. Every shape
 * below is a flat, confident vector primitive — a rectangle, an ellipse, a
 * smooth two-cap taper — calibrated to the SAME `VB` (100×200) and the SAME
 * FAIRWAY/GREEN/TEE/PIN constants the previous version used, so the shots
 * `index.tsx` plots on top still line up exactly.
 *
 * Composition (back → front):
 *   1. Field — one flat "out of bounds" fill, at most a subtle vertical
 *      gradient. No grain, no noise, no rough band.
 *   2. Fairway corridor — a straight taper from the tee (wide) to the green
 *      (narrow), closed with two smooth Bezier caps (never wobbled edges,
 *      never a fabricated dogleg — a straight corridor is the honest
 *      choice when the real shape isn't known). One flat fill + a subtle
 *      vertical gradient, plus ONE crisp top-edge highlight line.
 *   3. Green — a crisp ellipse with a subtle radial sheen toward the
 *      top-left, ringed by a clean concentric fringe line. No blob wobble.
 *   4. Tee — a small, understated rounded-rect marker.
 *   5. Yardage axis — a thin vertical guide line + ticks + quiet mono
 *      labels, straight from `PlottedHole.ticks` (the accuracy cue: the
 *      axis really is linear in yards, not merely asserted). 2026-07-23:
 *      the convention (distance-TO-PIN, decreasing toward the green) was
 *      always correct, but nothing SAID so — this is fixed with a one-time
 *      "YDS TO PIN" caption at the pin end, a "y" unit suffix on the
 *      50/100/150 sprinkler-head ticks, and the 0-yard tick itself kept
 *      (labeled "PIN") instead of filtered out, so the ruler's smallest
 *      anchor is explicit rather than implied.
 *   6. Pin + animated flag — cream mast, dark cup, the red flag kept as the
 *      one clean accent color.
 *
 * ONE `<defs>` block, three gradients, ZERO filters — no depth-faking
 * drop-shadows anywhere in this component. Every shape is a pure function
 * of this module's own constants (not `size`/props), so most of the
 * geometry below is computed ONCE at module load rather than per render —
 * deterministic and SSR-safe by construction, no seeded-noise machinery
 * needed at all.
 *
 * A separate export, `GreenInsetScenery`, draws the "detail circle" a real
 * scorecard prints beside the main hole diagram for the green — its own
 * feet-scale frame, visually leashed to the corridor's real pin position via
 * a lens ring + leader line. It takes `children`: the caller (index.tsx)
 * renders the actual inset shot dots/segments (from
 * `PlottedHole.greenInset.shots/segments`, already in the inset's own
 * `GREEN_INSET_VB` 0–100 coordinate space) as children with NO extra
 * transform math of its own — this component's nested `<svg>` viewport
 * handles placement/scale. Lightly cleaned in this pass (dropped its one
 * wobbled decorative sheen blob — the panel already has a plain glass-sheen
 * ellipse) but otherwise unchanged; its API/behavior is untouched.
 */

'use client';

import { m } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import { VB, GREEN_INSET_VB, type YardageTick, type PlottedGreenInset } from './geometry';
import type { HoleShotPathProps } from './types';
import { EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

// `types.ts` is a read-only shared contract this redesign doesn't touch, so
// the new `review` size variant (see index.tsx's `SizeKey`) is added HERE,
// locally, as an additive widening rather than editing that union.
export type TurfSize = NonNullable<HoleShotPathProps['size']> | 'review';

// -----------------------------------------------------------------------------
// Ground layout — calibrated to the canonical corridor viewBox (100×200).
// Mirrors `geometry.ts`'s FAIRWAY/TEE/PIN constants closely enough that the
// decorative scenery and the real plotted shots read as the same place.
// UNCHANGED from the previous version — the redesign is purely about HOW
// these positions are drawn, never where.
// -----------------------------------------------------------------------------

const FAIRWAY_CENTER_X = 50;
const FAIRWAY_TOP_HALF = 7;
const FAIRWAY_BOTTOM_HALF = 9;
const FAIRWAY_TOP_Y = 24;
const FAIRWAY_BOTTOM_Y = 178;
/** Bezier control-point Y for the corridor's two end caps — how far the
 *  taper "rounds off" into the green (top) / toward the tee (bottom). */
const FAIRWAY_TOP_CAP_Y = FAIRWAY_TOP_Y - 2.4;
const FAIRWAY_BOTTOM_CAP_Y = FAIRWAY_BOTTOM_Y + 2.8;

const GREEN_CX = 50;
const GREEN_CY = 17;
const GREEN_RX = 22;
const GREEN_RY = 11;
/** The concentric fringe ring sits just outside the green ellipse. */
const FRINGE_RX = GREEN_RX + 1.6;
const FRINGE_RY = GREEN_RY + 1.6;

const TEE_X = 43;
const TEE_Y = 183;
const TEE_W = 14;
const TEE_H = 7;

/** The decorative pin sits exactly on `geometry.ts`'s `PIN` constant (50,14)
 *  — every holed putt's plotted dot lands here too, so the cup + flag always
 *  line up with the real data instead of just approximating it. Also reused
 *  as `GreenInsetScenery`'s default leader-line anchor. */
const PIN_X = 50;
const PIN_BASE_Y = 14;
const PIN_TOP_Y = 3;

// -----------------------------------------------------------------------------
// Yardage axis layout — quiet mono labels, per size. `x: 8` puts the guide
// line/ticks just inside the corridor's left margin at every rich size;
// `strip` has no entry (too small to hold legible marks) and `inline` only
// shows the 50/100/150 "sprinkler head" emphasis ticks.
// -----------------------------------------------------------------------------

const RULER_LAYOUT: Partial<Record<TurfSize, { x: number; fontSize: number; emphasisOnly: boolean }>> = {
  inline: { x: 8, fontSize: 6.4, emphasisOnly: true },
  card: { x: 8, fontSize: 5, emphasisOnly: false },
  reviewCard: { x: 8, fontSize: 5, emphasisOnly: false },
  review: { x: 8, fontSize: 3.6, emphasisOnly: false },
  hero: { x: 8, fontSize: 3.6, emphasisOnly: false },
};

const fmt = (n: number) => n.toFixed(2);

// -----------------------------------------------------------------------------
// Flat corridor geometry — a pure function of the constants above, so it's
// computed ONCE at module load rather than per-render/per-size. A straight
// taper (never a wobbled organic edge, never a fabricated dogleg) is the
// honest choice: this app has no real hole-geometry data, so a neutral
// schematic shape is what's actually true, not an invented "natural" curve.
// -----------------------------------------------------------------------------

const FAIRWAY_LEFT_BOTTOM = FAIRWAY_CENTER_X - FAIRWAY_BOTTOM_HALF;
const FAIRWAY_RIGHT_BOTTOM = FAIRWAY_CENTER_X + FAIRWAY_BOTTOM_HALF;
const FAIRWAY_LEFT_TOP = FAIRWAY_CENTER_X - FAIRWAY_TOP_HALF;
const FAIRWAY_RIGHT_TOP = FAIRWAY_CENTER_X + FAIRWAY_TOP_HALF;

/** The full corridor silhouette — straight tapered sides, two smooth Bezier
 *  caps closing it off at the green end and the tee end. */
const FAIRWAY_PATH_D = [
  `M ${fmt(FAIRWAY_LEFT_BOTTOM)} ${fmt(FAIRWAY_BOTTOM_Y)}`,
  `L ${fmt(FAIRWAY_LEFT_TOP)} ${fmt(FAIRWAY_TOP_Y)}`,
  `Q ${fmt(FAIRWAY_CENTER_X)} ${fmt(FAIRWAY_TOP_CAP_Y)} ${fmt(FAIRWAY_RIGHT_TOP)} ${fmt(FAIRWAY_TOP_Y)}`,
  `L ${fmt(FAIRWAY_RIGHT_BOTTOM)} ${fmt(FAIRWAY_BOTTOM_Y)}`,
  `Q ${fmt(FAIRWAY_CENTER_X)} ${fmt(FAIRWAY_BOTTOM_CAP_Y)} ${fmt(FAIRWAY_LEFT_BOTTOM)} ${fmt(FAIRWAY_BOTTOM_Y)}`,
  'Z',
].join(' ');

/** Just the top arc of the corridor silhouette — the ONE crisp highlight
 *  stroke that separates the fairway from the green. A stroke-only path
 *  (never filled), so it reads as a hairline edge, never a shadow. */
const FAIRWAY_TOP_EDGE_D = [
  `M ${fmt(FAIRWAY_LEFT_TOP)} ${fmt(FAIRWAY_TOP_Y)}`,
  `Q ${fmt(FAIRWAY_CENTER_X)} ${fmt(FAIRWAY_TOP_CAP_Y)} ${fmt(FAIRWAY_RIGHT_TOP)} ${fmt(FAIRWAY_TOP_Y)}`,
].join(' ');

// -----------------------------------------------------------------------------
// Turf
// -----------------------------------------------------------------------------

export interface TurfProps {
  /** Density/scale variant — mirrors `HoleShotPathProps['size']`. */
  size?: TurfSize;
  /** Drawn behind the rest of the SVG — index.tsx wraps it inside the same
   *  <svg>, so we don't repeat the viewBox here. */
  showPinFlag?: boolean;
  /** Corridor yardage ruler marks (`PlottedHole.ticks`). Omit to skip the
   *  ruler entirely; always skipped at `size="strip"` regardless (too small
   *  to hold legible labels). */
  ticks?: YardageTick[];
}

export function Turf({ size = 'card', showPinFlag = true, ticks }: TurfProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  // useId so multiple HoleShotPath instances on the same page don't clash on
  // gradient ids (e.g. the 18-hole grid renders 18 of these).
  const rawId = useId();
  const id = rawId.replace(/:/g, '-');
  const fieldGrad = `turfField-${id}`;
  const fairwayGrad = `turfFairway-${id}`;
  const greenGrad = `turfGreen-${id}`;

  const ruler = RULER_LAYOUT[size];
  const hasTicks = !!(ruler && ticks && ticks.length > 0);
  // The 0-yard tick is the pin — the ruler's smallest, most important
  // anchor. It's ALWAYS kept (even at `inline`'s emphasis-only filter),
  // never dropped the way it previously was: an emphasis-only ruler whose
  // smallest visible label was "50" — with nothing marking which end is
  // the pin — is exactly what read as "the yardage is backwards."
  const visibleTicks = hasTicks
    ? ticks!.filter((t) => t.yards === 0 || !ruler!.emphasisOnly || t.emphasis)
    : [];
  // The vertical guide line spans the FULL tick range (not just the visible
  // emphasis-only subset at `inline`) — it's the axis itself, not a mark.
  const guideSpan = hasTicks && ticks!.length > 1 ? { y1: ticks![0]!.y, y2: ticks![ticks!.length - 1]!.y } : null;

  return (
    <>
      <defs>
        {/* Field — the flat "out of bounds" canvas beyond the corridor. */}
        <linearGradient id={fieldGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12241b" />
          <stop offset="100%" stopColor="#0e1c15" />
        </linearGradient>

        {/* Fairway corridor — one flat fill, a subtle vertical gradient. */}
        <linearGradient id={fairwayGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c6248" />
          <stop offset="100%" stopColor="#245139" />
        </linearGradient>

        {/* Green — a subtle radial sheen toward the top-left light source. */}
        <radialGradient id={greenGrad} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#4fa676" />
          <stop offset="100%" stopColor="#3d8a63" />
        </radialGradient>
      </defs>

      {/* 1. Field — one flat calm fill. No grain, no noise, no rough band. */}
      <rect x="0" y="0" width={VB.width} height={VB.height} fill={`url(#${fieldGrad})`} />

      {/* 2. Fairway corridor — flat taper + ONE crisp top-edge highlight. */}
      <path d={FAIRWAY_PATH_D} fill={`url(#${fairwayGrad})`} />
      <path d={FAIRWAY_TOP_EDGE_D} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

      {/* 3. Green — crisp ellipse with a radial sheen, ringed by a clean
          concentric fringe line (drawn first so the green's own edge sits
          crisply on top of it, not the other way around). */}
      <ellipse cx={GREEN_CX} cy={GREEN_CY} rx={FRINGE_RX} ry={FRINGE_RY} fill="none" stroke="#2f6b4f" strokeWidth="1" />
      <ellipse cx={GREEN_CX} cy={GREEN_CY} rx={GREEN_RX} ry={GREEN_RY} fill={`url(#${greenGrad})`} />

      {/* 4. Tee — a small, understated marker. */}
      <rect x={TEE_X} y={TEE_Y} width={TEE_W} height={TEE_H} rx="1.4" fill="#6f5a3f" />

      {/* 5. Yardage axis — the true-to-scale accuracy cue. Hidden entirely
          at `strip` (no room for legible marks); emphasis-only (50/100/150)
          at `inline`; full ruler at card/reviewCard/review/hero. */}
      {hasTicks && (
        <g aria-hidden="true">
          {guideSpan && (
            <>
              <line
                x1={ruler!.x}
                y1={guideSpan.y1}
                x2={ruler!.x}
                y2={guideSpan.y2}
                stroke="rgba(244,236,216,0.16)"
                strokeWidth="0.4"
              />
              {/* The one thing the ruler was missing: which end is which.
                  A quiet caption at the pin/green end, once per ruler —
                  never repeated per-tick (that would be clutter) — so the
                  axis reads as "distance TO the pin," not an unlabeled
                  column of numbers a viewer has to guess the direction of. */}
              <text
                x={ruler!.x}
                y={guideSpan.y1 - 4.4}
                fontSize={ruler!.fontSize * 0.8}
                fontWeight={600}
                fill="#f4ecd8"
                fillOpacity="0.5"
                fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
                style={{ pointerEvents: 'none', userSelect: 'none', letterSpacing: '0.05em' }}
              >
                YDS TO PIN
              </text>
            </>
          )}
          {visibleTicks.map((t) => {
            // The 0-yard tick IS the pin — render it with the same visual
            // weight as the 50/100/150 sprinkler-head ticks (never the
            // bare, easy-to-miss "0" a casual glance would read as just
            // another small number) so the ruler's own smallest anchor is
            // unambiguous without relying on the caption alone.
            const isPin = t.yards === 0;
            const strong = t.emphasis || isPin;
            const len = strong ? 3.4 : 2.1;
            // Unit suffix on the emphasized "sprinkler head" ticks only —
            // "150" reads as ambiguous (feet? meters? a score?) in
            // isolation; "150y" doesn't. Plain intermediate ticks (25y
            // steps at the finer sizes) stay bare to avoid clutter.
            const label = isPin ? 'PIN' : t.emphasis ? `${t.yards}y` : t.yards;
            return (
              <g key={t.yards}>
                <line
                  x1={ruler!.x}
                  y1={t.y}
                  x2={ruler!.x + len}
                  y2={t.y}
                  stroke="#f4ecd8"
                  strokeOpacity={strong ? 0.6 : 0.32}
                  strokeWidth="0.5"
                  strokeLinecap="round"
                />
                {strong && <circle cx={ruler!.x - 1.1} cy={t.y} r="0.6" fill="#f4ecd8" opacity="0.6" />}
                <text
                  x={ruler!.x + len + 1.2}
                  y={t.y + ruler!.fontSize * 0.32}
                  fontSize={ruler!.fontSize}
                  fontWeight={strong ? 700 : 500}
                  fill="#f4ecd8"
                  fillOpacity={strong ? 0.82 : 0.45}
                  fontFamily="ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* 6. Pin — mast + animated flag triangle. Cup sits exactly on
          geometry.ts's PIN (50,14), so a holed putt's dot lands on it. */}
      <circle cx={PIN_X} cy={PIN_BASE_Y} r="1.3" fill="#0d1f17" />
      <line
        x1={PIN_X}
        y1={PIN_BASE_Y}
        x2={PIN_X}
        y2={PIN_TOP_Y}
        stroke="#f4ecd8"
        strokeWidth="0.4"
        strokeLinecap="round"
      />
      {showPinFlag && (
        <m.g
          animate={{ skewX: [0, -3, 0, 3, 0] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${PIN_X}px ${PIN_TOP_Y + 1}px` }}
        >
          <path
            d={`M ${PIN_X} ${PIN_TOP_Y} L ${PIN_X + 7} ${PIN_TOP_Y + 1.6} L ${PIN_X} ${PIN_TOP_Y + 3.2} Z`}
            fill="#e3543b"
          />
          <path
            d={`M ${PIN_X} ${PIN_TOP_Y} L ${PIN_X + 7} ${PIN_TOP_Y + 1.6} L ${PIN_X} ${PIN_TOP_Y + 1.6} Z`}
            fill="#f8f2dd"
            opacity="0.18"
          />
        </m.g>
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// GreenInsetScenery — the "detail circle" printed beside the main hole
// diagram on a real scorecard. Frame only: the caller renders the actual
// inset shot dots/segments as `children`, in `GREEN_INSET_VB` (0–100,
// 0–100) coordinates — this component's nested <svg> viewport does the
// placement/scale, so no transform math is needed on the caller's side.
// -----------------------------------------------------------------------------

/** Where the lens box sits inside the main 100×200 corridor, per size —
 *  always to the right of the fairway, roughly hole-mid-height, so it never
 *  competes with the green shape itself for space. `strip` has no entry —
 *  the component returns null there (no room for a legible lens). */
const INSET_BOX: Partial<Record<TurfSize, { x: number; y: number; size: number }>> = {
  inline: { x: 58, y: 48, size: 36 },
  card: { x: 58, y: 50, size: 40 },
  reviewCard: { x: 58, y: 50, size: 40 },
  hero: { x: 55, y: 50, size: 44 },
};

const DEFAULT_INSET_ANCHOR = { x: PIN_X, y: PIN_BASE_Y };

export interface GreenInsetSceneryProps {
  size?: TurfSize;
  greenInset: PlottedGreenInset;
  /** Corridor point (in `VB` coordinates) the leader line springs from.
   *  Defaults to the canonical pin position — already exactly where the
   *  decorative corridor pin (and every holed putt) sits, so this rarely
   *  needs overriding. */
  anchor?: { x: number; y: number };
  /** The caller's inset shot dots/segments, in `GREEN_INSET_VB` (0–100)
   *  coordinates — rendered inside this component's nested <svg> viewport. */
  children?: ReactNode;
}

export function GreenInsetScenery({
  size = 'card',
  greenInset,
  anchor = DEFAULT_INSET_ANCHOR,
  children,
}: GreenInsetSceneryProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const rawId = useId();
  const id = rawId.replace(/:/g, '-');

  const box = size === 'strip' ? undefined : INSET_BOX[size];
  if (!box) return null;

  const cx = box.x + box.size / 2;
  const cy = box.y + box.size / 2;
  const panelR = box.size / 2 + 2.4;
  const nearCorner = { x: box.x + box.size * 0.12, y: box.y };

  const insetGreenGrad = `insetGreen-${id}`;
  const insetShadow = `insetShadow-${id}`;

  // Concentric "N feet from pin" guide rings, straight from the inset's own
  // honest feet-scale ticks — the thing that makes the lens's scale
  // checkable instead of a "trust me" zoom. (No per-ring text label: at this
  // physical size a couple of pixels of mono digits would be illegible —
  // exact numbers already live in the existing hover tooltip.)
  const ringRadii = greenInset.ticks.map((t) => greenInset.pin.y - t.y);

  const panelInitial = prefersReducedMotion ? (false as const) : { opacity: 0, scale: 0.9 };
  const panelTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.5, delay: 0.15, ease: EASE_CINEMATIC };

  return (
    <m.g aria-hidden="true" initial={panelInitial} animate={{ opacity: 1, scale: 1 }} transition={panelTransition} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <defs>
        <radialGradient id={insetGreenGrad} cx="45%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#8fcda3" />
          <stop offset="60%" stopColor="#5fa87e" />
          <stop offset="100%" stopColor="#3d7d5c" />
        </radialGradient>
        <filter id={insetShadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="1" floodColor="#07140f" floodOpacity="0.42" />
        </filter>
      </defs>

      {/* Lens ring at the real pin position, + a leader line to the panel —
          the "this is what's zoomed" cue that ties the two coordinate
          systems together visually. */}
      <circle cx={anchor.x} cy={anchor.y} r="4.2" fill="none" stroke="#f4ecd8" strokeOpacity="0.38" strokeWidth="0.4" strokeDasharray="1.1 1.3" />
      <path
        d={`M ${fmt(anchor.x)} ${fmt(anchor.y)} Q ${fmt((anchor.x + nearCorner.x) / 2)} ${fmt(anchor.y + (nearCorner.y - anchor.y) * 0.72)} ${fmt(nearCorner.x)} ${fmt(nearCorner.y)}`}
        fill="none"
        stroke="#f4ecd8"
        strokeOpacity="0.26"
        strokeWidth="0.35"
        strokeDasharray="1.4 1.6"
      />

      {/* Panel backing — reads as a floating "card" over the corridor. */}
      <g filter={`url(#${insetShadow})`}>
        <circle cx={cx} cy={cy} r={panelR} fill="#122720" fillOpacity="0.84" stroke="#f4ecd8" strokeOpacity="0.16" strokeWidth="0.5" />
      </g>

      {/* The zoomed detail — its own 100×100 viewport. Children plot in
          GREEN_INSET_VB coordinates with no further transform. */}
      <svg
        x={box.x}
        y={box.y}
        width={box.size}
        height={box.size}
        viewBox={`0 0 ${GREEN_INSET_VB.width} ${GREEN_INSET_VB.height}`}
      >
        <circle cx="50" cy="50" r="49" fill={`url(#${insetGreenGrad})`} />

        {ringRadii.map((r, i) => (
          <circle
            key={i}
            cx={greenInset.pin.x}
            cy={greenInset.pin.y}
            r={r}
            fill="none"
            stroke="#0d1f17"
            strokeOpacity="0.22"
            strokeWidth="0.5"
            strokeDasharray="1.6 1.4"
          />
        ))}

        {/* Hole + a small flag, echoing the corridor pin at inset scale. */}
        <circle cx={greenInset.pin.x} cy={greenInset.pin.y} r="2.1" fill="#0a1a13" />
        <line
          x1={greenInset.pin.x}
          y1={greenInset.pin.y}
          x2={greenInset.pin.x}
          y2={greenInset.pin.y - 9}
          stroke="#f4ecd8"
          strokeWidth="0.6"
          strokeLinecap="round"
        />
        <m.path
          d={`M ${greenInset.pin.x} ${greenInset.pin.y - 9} L ${greenInset.pin.x + 6.5} ${greenInset.pin.y - 7.6} L ${greenInset.pin.x} ${greenInset.pin.y - 6.2} Z`}
          fill="#e3543b"
          animate={{ skewX: [0, -3, 0, 3, 0] }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${greenInset.pin.x}px ${greenInset.pin.y - 8}px` }}
        />

        {children}
      </svg>

      {/* Glass sheen — drawn after children so it stays a subtle overlay,
          never obscuring the plotted dots. */}
      <ellipse
        cx={cx - box.size * 0.18}
        cy={cy - box.size * 0.22}
        rx={box.size * 0.34}
        ry={box.size * 0.18}
        fill="#f8f2dd"
        opacity="0.05"
      />
    </m.g>
  );
}
