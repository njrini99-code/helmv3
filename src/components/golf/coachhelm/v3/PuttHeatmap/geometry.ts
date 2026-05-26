/**
 * PuttHeatmap — pure geometry + aggregation.
 *
 * Takes raw putt rows, buckets them by distance, projects each putt
 * into a top-down "green" coordinate space, and computes the summary
 * stats the heatmap renders (per-bucket make %, dominant miss side).
 */

import {
  normalizePuttMiss,
  PUTT_BUCKETS,
  type PuttBucketId,
  type PuttMissDirection,
  type PuttRecord,
} from './types';

// ---------------------------------------------------------------------------
// Canonical viewBox — square, hole at center.
// ---------------------------------------------------------------------------

export const VB = { width: 240, height: 240, cx: 120, cy: 120 } as const;
/** Outer playable radius — the dashed ring for "25 ft+" sits here. */
export const MAX_R = 104;
/** Inner hole radius. */
export const HOLE_R = 4;

/**
 * Distance → ring radius. Uses a square-root scaling so the inner
 * buckets get more visual real estate (where most putts are taken)
 * while the outer buckets still fit inside the green.
 */
export function distanceToRadius(distance_feet: number): number {
  const clamped = Math.max(0, Math.min(distance_feet, 40));
  return HOLE_R + Math.sqrt(clamped / 40) * (MAX_R - HOLE_R);
}

/** Bucket boundary radii — used to draw the topo rings. */
export const BUCKET_RADII = PUTT_BUCKETS
  .filter((b) => Number.isFinite(b.max))
  .map((b) => ({ id: b.id, r: distanceToRadius(b.max), label: b.short }));

// ---------------------------------------------------------------------------
// Angle conventions
// ---------------------------------------------------------------------------

// SVG: 0 rad points right (+x). We map golf miss directions to a
// player-POV compass with the hole "above" the player:
//   long  → north (top, angle = -π/2 in SVG)
//   short → south (bottom, +π/2)
//   left  → west (-π)
//   right → east (0)
const ANGLE_BY_MISS: Record<NonNullable<PuttMissDirection>, number> = {
  long: -Math.PI / 2,
  short: Math.PI / 2,
  left: Math.PI,
  right: 0,
};

/** Cheap deterministic jitter so dots in the same bucket don't stack. */
function seededAngle(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * Math.PI * 2;
}

function seededJitter(seed: number, range: number): number {
  const s = Math.sin(seed * 78.233) * 43758.5453;
  return ((s - Math.floor(s)) - 0.5) * range;
}

// ---------------------------------------------------------------------------
// Plotted shapes
// ---------------------------------------------------------------------------

export interface PlottedPutt {
  x: number;
  y: number;
  made: boolean;
  distance_feet: number;
  miss: PuttMissDirection;
  bucket_id: PuttBucketId;
  /** For React keys. */
  key: string;
}

export interface PuttBucketStats {
  id: PuttBucketId;
  label: string;
  short: string;
  attempts: number;
  made: number;
  make_pct: number | null;
}

export interface MissBias {
  /** Total missed putts considered. */
  total: number;
  /** Count per side. */
  left: number;
  right: number;
  long: number;
  short: number;
  /** Dominant side (highest count), or null if no clear bias / no data. */
  dominant: NonNullable<PuttMissDirection> | null;
  /** Share of misses on dominant side, 0–1. */
  share: number;
}

export interface PuttHeatmapData {
  total_putts: number;
  total_made: number;
  overall_make_pct: number | null;
  buckets: PuttBucketStats[];
  miss_bias: MissBias;
  plotted: PlottedPutt[];
}

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

function bucketFor(distance_feet: number): PuttBucketId {
  for (const b of PUTT_BUCKETS) {
    if (distance_feet >= b.min && distance_feet < b.max) return b.id;
  }
  // Final bucket (25+) catches Infinity max.
  return PUTT_BUCKETS[PUTT_BUCKETS.length - 1]!.id;
}

export function buildPuttHeatmap(putts: PuttRecord[]): PuttHeatmapData {
  const total_putts = putts.length;
  const total_made = putts.filter((p) => p.made).length;
  const overall_make_pct = total_putts > 0 ? total_made / total_putts : null;

  // Bucket stats
  const buckets: PuttBucketStats[] = PUTT_BUCKETS.map((b) => {
    const inBucket = putts.filter(
      (p) => p.distance_feet >= b.min && p.distance_feet < b.max,
    );
    const attempts = inBucket.length;
    const made = inBucket.filter((p) => p.made).length;
    return {
      id: b.id,
      label: b.label,
      short: b.short,
      attempts,
      made,
      make_pct: attempts > 0 ? made / attempts : null,
    };
  });

  // Miss bias
  const misses = putts.filter((p) => !p.made);
  const counts = { left: 0, right: 0, long: 0, short: 0 };
  for (const m of misses) {
    const d = normalizePuttMiss(m.miss_direction);
    if (d && d in counts) counts[d]++;
  }
  let dominant: NonNullable<PuttMissDirection> | null = null;
  let topCount = 0;
  (['left', 'right', 'long', 'short'] as const).forEach((k) => {
    if (counts[k] > topCount) {
      dominant = k;
      topCount = counts[k];
    }
  });
  const miss_bias: MissBias = {
    total: misses.length,
    ...counts,
    dominant,
    share: misses.length > 0 ? topCount / misses.length : 0,
  };

  // Plotted dots
  const plotted: PlottedPutt[] = putts.map((p, i) => {
    const miss = normalizePuttMiss(p.miss_direction);
    const r = distanceToRadius(p.distance_feet);
    let angle: number;
    if (miss && ANGLE_BY_MISS[miss] !== undefined) {
      // Anchored to the miss-side compass, with a small ±0.4 rad
      // spread so dots in the same direction don't perfectly overlap.
      angle = ANGLE_BY_MISS[miss] + seededJitter(i + 1, 0.8);
    } else {
      // Made putts (or unknown miss) — spread around the full ring.
      angle = seededAngle(i + 1);
    }
    // Add a small radial jitter (±2.5 SVG units) so dots in the same
    // bucket don't all sit on the exact ring boundary.
    const rJitter = seededJitter(i + 7, 5);
    const rPlot = Math.max(HOLE_R + 2, Math.min(MAX_R - 2, r + rJitter));
    return {
      x: VB.cx + Math.cos(angle) * rPlot,
      y: VB.cy + Math.sin(angle) * rPlot,
      made: p.made,
      distance_feet: p.distance_feet,
      miss,
      bucket_id: bucketFor(p.distance_feet),
      key: `${i}-${p.hole_number ?? 'h'}-${p.round_id ?? 'r'}`,
    };
  });

  return {
    total_putts,
    total_made,
    overall_make_pct,
    buckets,
    miss_bias,
    plotted,
  };
}

/** Format a make percentage for display ("64%", "—" for no attempts). */
export function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  return `${Math.round(pct * 100)}%`;
}

/** Human-readable label for a miss side. */
export const MISS_SIDE_LABEL: Record<NonNullable<PuttMissDirection>, string> = {
  left: 'Left',
  right: 'Right',
  long: 'Long (past the cup)',
  short: 'Short (left short)',
};
