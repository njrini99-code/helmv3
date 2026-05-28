/**
 * HoleShotPath — pure geometry.
 *
 * Maps the player's logged shot ledger into SVG coordinates inside a
 * canonical 100-wide × 200-tall viewBox (tee at bottom, pin at top).
 *
 * Coordinate system:
 *   x ∈ [0, 100]   — left/right across the fairway corridor
 *   y ∈ [0, 200]   — top (200=tee) to bottom (0=pin) wait — actually
 *     we use 0=top to match SVG convention. Higher y = closer to tee.
 *
 * Conventions:
 *   - Tee box centered at (50, 188)
 *   - Pin centered at (50, 14)
 *   - Fairway corridor runs vertically from ~y=180 → ~y=22, ~14 units wide
 *   - Green is a region at the top (rendered separately)
 *
 * The geometry is DERIVED from user-logged shot data:
 *   - shot endpoint Y is mapped from `distance_to_hole_after` (closer
 *     to pin = smaller y)
 *   - shot endpoint X is the accumulated lateral offset from each
 *     shot's miss_direction (left = -, right = +, straight = small
 *     drift toward center)
 *   - the LIE at each endpoint becomes a hazard the next shot has to
 *     play from — so "ended in bunker 112y out" plants the bunker at
 *     EXACTLY that endpoint position. The hole map IS the player's
 *     story.
 */

import { normalizeLie, normalizeMiss, type Lie, type ShotInput } from './types';

// -----------------------------------------------------------------------------
// Constants — the canonical viewBox + fairway geometry
// -----------------------------------------------------------------------------

export const VB = { width: 100, height: 200 } as const;

const FAIRWAY = {
  /** x-center of the fairway corridor */
  centerX: 50,
  /** half-width of the corridor at the tee (narrows slightly near green) */
  halfWidthTee: 9,
  halfWidthGreen: 7,
  /** vertical range the corridor spans */
  topY: 24, // just below the green
  bottomY: 178, // just above the tee box
} as const;

const TEE = { x: 50, y: 188 } as const;
const PIN = { x: 50, y: 14 } as const;

/** Maximum lateral offset (one direction) — how far off-corridor a
 *  miss can push the ball before the visual breaks. Calibrated so a
 *  "missed left" still reads as inside the SVG. */
const MAX_OFFSET_X = 32;
const MISS_OFFSET_PER_STEP = 11;
const STRAIGHT_DRIFT = 2;

// -----------------------------------------------------------------------------
// Public output shapes
// -----------------------------------------------------------------------------

export interface PlottedShot {
  shot_number: number;
  /** 1-based position within this hole (1, 2, 3…). Use this for any
   *  UI label — the raw `shot_number` from the DB may be round-wide
   *  or synthetic depending on the data source. */
  display_index: number;
  /** Endpoint position in the canonical viewBox. */
  x: number;
  y: number;
  /** Where the ball ended up (canonical Lie or 'other'). */
  lie: Lie | 'other';
  /** Distance to pin AFTER this shot, yards (or null when unknown). */
  distance_to_pin: number | null;
  /** True when this shot was logged as a penalty. */
  is_penalty: boolean;
  /** Useful for tooltips — what the player keyed in. */
  miss_direction: 'left' | 'right' | 'long' | 'short' | null;
  /** Yardage of this shot itself (start→end), if computable. */
  shot_yards: number | null;
}

export interface PlottedSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Quadratic Bezier control point — gives the line a subtle arc
   *  suggesting ball flight. */
  control: { x: number; y: number };
  /** Lie the ball ENDED in — colors the segment leaving the previous
   *  endpoint (i.e. "you went into rough — the line dimming reflects
   *  the consequence of the prior shot"). */
  to_lie: Lie | 'other';
  /** Index of the destination shot in shots[] — used for stable keys. */
  to_index: number;
}

export interface PlottedHazard {
  kind: 'sand' | 'rough' | 'water';
  /** Hazard center. */
  x: number;
  y: number;
  /** Approximate radius (viewBox units). */
  r: number;
  /** Source shot's number — useful for keys + a11y descriptions. */
  origin_shot: number;
}

export interface PlottedHole {
  total_yardage: number;
  tee: { x: number; y: number };
  pin: { x: number; y: number };
  shots: PlottedShot[];
  segments: PlottedSegment[];
  hazards: PlottedHazard[];
  /** Convenience — par-relative score string ("+1", "-2", "E", null). */
  // (consumer computes this; we don't put score in geometry to keep
  //  this pure data-only.)
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Infer the hole's total yardage. Priority:
 *   1. shot 1's `distance_to_hole_before`
 *   2. par-based fallback
 *   3. final fallback: 360y
 */
export function inferHoleYardage(
  shots: ShotInput[],
  par: number | undefined,
  yardage: number | null | undefined,
): number {
  if (typeof yardage === 'number' && yardage > 0) return yardage;
  const first = shots[0];
  const fromShot = first?.distance_to_hole_before;
  if (typeof fromShot === 'number' && fromShot > 0) return fromShot;
  if (par === 3) return 175;
  if (par === 4) return 380;
  if (par === 5) return 525;
  return 360;
}

/** Map a yards-to-pin value onto the fairway corridor's Y axis.
 *  yards = totalYardage → y = bottomY (tee)
 *  yards = 0            → y = topY (pin) */
function projectY(yardsToPin: number, totalYardage: number): number {
  const t = clamp(yardsToPin / Math.max(1, totalYardage), 0, 1);
  return FAIRWAY.topY + t * (FAIRWAY.bottomY - FAIRWAY.topY);
}

/**
 * Compute the lateral offset (signed) for one shot. Left = negative,
 * right = positive. A "long"/"short" miss has no lateral component;
 * those still drift slightly toward center to suggest "in the corridor
 * but past/short of target."
 */
function lateralOffset(
  miss: 'left' | 'right' | 'long' | 'short' | null,
): number {
  if (miss === 'left') return -MISS_OFFSET_PER_STEP;
  if (miss === 'right') return MISS_OFFSET_PER_STEP;
  return STRAIGHT_DRIFT * (Math.random() < 0.5 ? -1 : 1);
}

// -----------------------------------------------------------------------------
// The main plotter
// -----------------------------------------------------------------------------

export function plotHole(args: {
  shots: ShotInput[];
  par?: 3 | 4 | 5;
  yardage?: number | null;
}): PlottedHole {
  const total_yardage = inferHoleYardage(args.shots, args.par, args.yardage);

  const ordered = [...args.shots].sort((a, b) => a.shot_number - b.shot_number);

  const plotted: PlottedShot[] = [];
  const segments: PlottedSegment[] = [];
  const hazards: PlottedHazard[] = [];

  let cumulativeX: number = TEE.x;
  let prev: { x: number; y: number } = { x: TEE.x, y: TEE.y };

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (!s) continue;

    const miss = normalizeMiss(s.miss_direction);
    const lie = normalizeLie(s.lie_after);

    // Y projection from distance-to-pin. When unknown, interpolate
    // along the corridor based on shot index (graceful degradation
    // so the visual still draws something coherent).
    let y: number;
    if (typeof s.distance_to_hole_after === 'number' && total_yardage > 0) {
      y = projectY(s.distance_to_hole_after, total_yardage);
    } else {
      const t = (i + 1) / Math.max(1, ordered.length);
      y = FAIRWAY.bottomY - t * (FAIRWAY.bottomY - FAIRWAY.topY);
    }

    // X = accumulated lateral drift. Putts (consecutive shots inside
    // the green) cluster near the pin — collapse their lateral offset.
    if (lie === 'green' && i > 0) {
      // Snap into the green cluster — small drift only.
      cumulativeX = PIN.x + (cumulativeX - PIN.x) * 0.35;
    } else {
      cumulativeX = clamp(
        cumulativeX + lateralOffset(miss),
        FAIRWAY.centerX - MAX_OFFSET_X,
        FAIRWAY.centerX + MAX_OFFSET_X,
      );
    }
    let x = cumulativeX;

    // Final putt → snap to pin (visually "made it").
    const isFinalPutt =
      lie === 'green' &&
      i === ordered.length - 1 &&
      (s.distance_to_hole_after ?? 99) <= 2;
    if (isFinalPutt) {
      x = PIN.x;
      y = PIN.y;
    }

    const distanceBefore = s.distance_to_hole_before;
    const shot_yards =
      typeof distanceBefore === 'number' &&
      typeof s.distance_to_hole_after === 'number'
        ? Math.max(0, distanceBefore - s.distance_to_hole_after)
        : null;

    plotted.push({
      shot_number: s.shot_number,
      display_index: i + 1,
      x,
      y,
      lie,
      distance_to_pin: s.distance_to_hole_after ?? null,
      is_penalty: !!s.is_penalty,
      miss_direction: miss,
      shot_yards,
    });

    // Segment from previous endpoint to this one — Bezier control above
    // the midpoint for a gentle arc that reads as "ball flight."
    const midX = (prev.x + x) / 2;
    const midY = (prev.y + y) / 2;
    const distance = Math.hypot(x - prev.x, y - prev.y);
    const arcLift = Math.min(14, distance * 0.18); // longer shots arc more
    const control = { x: midX, y: midY - arcLift };
    segments.push({ from: prev, to: { x, y }, control, to_lie: lie, to_index: i });

    // If this shot ended in a hazard, plant the hazard AT the endpoint.
    if (lie === 'sand') {
      hazards.push({
        kind: 'sand',
        x,
        y,
        r: 6.5,
        origin_shot: s.shot_number,
      });
    } else if (lie === 'rough') {
      hazards.push({
        kind: 'rough',
        x,
        y,
        r: 8,
        origin_shot: s.shot_number,
      });
    } else if (lie === 'water' || s.is_penalty) {
      hazards.push({
        kind: 'water',
        x,
        y,
        r: 7,
        origin_shot: s.shot_number,
      });
    }

    prev = { x, y };
  }

  return {
    total_yardage,
    tee: TEE,
    pin: PIN,
    shots: plotted,
    segments,
    hazards,
  };
}

/** Format a yards value for the segment tooltip ("147 yds"). */
export function formatYards(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n < 1) return '<1 yd';
  return `${Math.round(n)} yd${n >= 2 ? 's' : ''}`;
}

/** Build the SVG Bezier path "d" for a segment. */
export function segmentPath(seg: PlottedSegment): string {
  return `M ${seg.from.x.toFixed(2)} ${seg.from.y.toFixed(2)} Q ${seg.control.x.toFixed(2)} ${seg.control.y.toFixed(2)} ${seg.to.x.toFixed(2)} ${seg.to.y.toFixed(2)}`;
}

/** Score-to-par string used by the score badge. */
export function scoreToParLabel(score: number | null | undefined, par: number | undefined): string | null {
  if (typeof score !== 'number' || typeof par !== 'number') return null;
  const d = score - par;
  if (d === 0) return 'E';
  if (d === -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double';
  if (d === 3) return 'Triple';
  return d > 0 ? `+${d}` : String(d);
}
