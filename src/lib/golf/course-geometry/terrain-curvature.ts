/** Meridian V2 multi-scale terrain curvature (V2 plan §21–23, feeding §50).
 *
 * Two source-derived scalar fields per metric grid node: `local` (~2–3 m
 * radius — bunker tie-ins, green shoulders, small swales) and `landform`
 * (~8–15 m — hills, valleys, exposed shelves). Each is the Laplacian ∇²z of
 * the source grid smoothed to that scale, in 1/m.
 *
 * Form (§22): smooth, then differentiate. A node takes the mean of the
 * supported heights inside a disc of `max(1, round(radiusM / spacingM))`
 * nodes, and the 5-point stencil
 *   ∇²z ≈ (z(x+h,y) + z(x−h,y) + z(x,y+h) + z(x,y−h) − 4z(x,y)) / h²
 * runs on that smoothed field at the grid spacing h. The alternative scale
 * form (disc mean − centre, ×8/R²) is the same operator in the continuum,
 * but at the local scale the disc is one node wide and its second moment is
 * nothing like a continuous disc's R²/2, so it reads ~60% high there.
 * Smoothing first stays exact for a quadratic at either scale — a
 * paraboloid's disc mean differs from it by a constant — and the smoothing
 * is what honours constraint 15: the local scale smooths even though its
 * radius rounds to a single node, so its effective stencil spans ±2 nodes
 * (±4 m on Peek'n Peak's 2 m grid, itself resampled from 1 m USGS 3DEP) and
 * never amplifies a bare one-node difference of DEM noise into topography.
 *
 * Sign: POSITIVE is concave — a bowl, valley floor or swale, neighbours
 * above the centre. NEGATIVE is convex — a hill, knoll or shoulder. §50
 * spends that on 1–4% luminance: concave a touch darker and cooler, convex
 * a touch lighter and warmer.
 *
 * Nulls: `heightsM` null is unsupported terrain, never zero
 * (terrain-source.ts). A node the grid cannot answer contributes nothing —
 * skipped in the disc mean, and an axis missing either neighbour is dropped
 * from the Laplacian rather than made one-sided (a one-sided second
 * difference needs three supported nodes in a row and reads slope as
 * curvature). Dropping an axis roughly halves the magnitude; it never flips
 * the sign. Unsupported nodes output 0 and a supported node is always
 * finite. Grid edges end a stencil the same way `relativeSkyRelief`'s
 * horizon march ends a ray. Known limit: a truncated disc — the grid edge,
 * or the rim of a hole of nulls — no longer sits centred on its node, so
 * its mean leans towards the supported side and uniform slope there can
 * register as a little apparent curvature.
 *
 * Visual only (constraint 6): this field tints ground. It never feeds lie
 * truth, shot distance, GPS resolution, canonical picking or analytics, and
 * it never moves canonical Z (constraint 4). */
import type { MetricTerrainGrid } from './terrain-source';

/** §21: one curvature scale is insufficient. Local catches bunker tie-ins,
 * green shoulders and small swales; landform catches hills, valleys and
 * exposed shelves. */
export const CURVATURE_SCALES = Object.freeze({ localRadiusM: 2.5, landformRadiusM: 12 });
export type CurvatureScales = { localRadiusM: number; landformRadiusM: number };

export interface CurvatureFields {
  /** Raw ∇²z (1/m) at the local and landform scales, grid layout. */
  local: Float32Array;
  landform: Float32Array;
  /** The same fields on §23's robust percentile scale, −1…+1. */
  localNormalized: Float32Array;
  landformNormalized: Float32Array;
  /** 1 where the source grid answers, 0 where it does not. */
  support: Uint8Array;
  scales: CurvatureScales;
  basis: 'source_derived_visual';
}

/** Mean of the supported heights within `radiusNodes` of each node; 0 (unread)
 * where the node itself is unsupported. Kept in doubles so the second
 * difference below is not differencing Float32-rounded heights. */
function smoothToScale(grid: MetricTerrainGrid, radiusNodes: number): Float64Array {
  const { columns, rows, heightsM } = grid;
  const smoothed = new Float64Array(columns * rows);
  const disc: (readonly [number, number])[] = [];
  for (let dr = -radiusNodes; dr <= radiusNodes; dr++) for (let dc = -radiusNodes; dc <= radiusNodes; dc++) if (dc * dc + dr * dr <= radiusNodes * radiusNodes) disc.push([dc, dr]);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const node = row * columns + column;
    if (heightsM[node] == null) continue;
    let sum = 0, count = 0;
    for (const [dc, dr] of disc) {
      const cc = column + dc, rr = row + dr;
      if (cc < 0 || rr < 0 || cc >= columns || rr >= rows) continue;
      const height = heightsM[rr * columns + cc];
      if (height == null) continue;
      sum += height; count++;
    }
    smoothed[node] = sum / count; // The node's own supported height is in the disc, so count >= 1.
  }
  return smoothed;
}

/** ∇²z (1/m) of `grid` at scale `radiusM`, one value per node in the grid's
 * own row-major layout. Positive is concave, negative convex. */
export function compileCurvature(grid: MetricTerrainGrid, radiusM: number): Float32Array {
  const { columns, rows, spacingM, heightsM } = grid;
  const smoothed = smoothToScale(grid, Math.max(1, Math.round(radiusM / spacingM)));
  const curvature = new Float32Array(columns * rows);
  const spacingSquared = spacingM * spacingM;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const node = row * columns + column;
    if (heightsM[node] == null) continue;
    const centre = smoothed[node] ?? 0;
    let laplacian = 0;
    if (column > 0 && column < columns - 1 && heightsM[node - 1] != null && heightsM[node + 1] != null) laplacian += ((smoothed[node - 1] ?? 0) + (smoothed[node + 1] ?? 0) - 2 * centre) / spacingSquared;
    if (row > 0 && row < rows - 1 && heightsM[node - columns] != null && heightsM[node + columns] != null) laplacian += ((smoothed[node - columns] ?? 0) + (smoothed[node + columns] ?? 0) - 2 * centre) / spacingSquared;
    curvature[node] = laplacian;
  }
  return curvature;
}

/** §23: p05 → −1, p95 → +1, linear between, clamped outside, so one noisy
 * cell cannot destroy the field's range. Percentiles are type-7 (linear
 * interpolation between order statistics, rank = (n − 1)·p/100) over the
 * supported nodes only — `support` 1 is supported, a null mask means every
 * node is. Unsupported nodes read 0, the same no-tint value a degenerate
 * range (p95 − p05 < 1e-9) gives every node. */
export function normalizeCurvature(values: Float32Array, support: Uint8Array | null, percentiles = { low: 5, high: 95 }): Float32Array {
  const normalized = new Float32Array(values.length);
  const collected: number[] = [];
  for (let node = 0; node < values.length; node++) if (support == null || support[node] === 1) collected.push(values[node] ?? 0);
  if (collected.length === 0) return normalized;
  // Typed-array sort: numeric ascending without a comparator call per pair
  // (the comparator sort was a fifth of the whole curvature compile).
  const supported = Float64Array.from(collected).sort();
  const low = percentileOf(supported, percentiles.low), range = percentileOf(supported, percentiles.high) - low;
  if (!(range >= 1e-9)) return normalized;
  for (let node = 0; node < values.length; node++) {
    if (support != null && support[node] !== 1) continue;
    normalized[node] = Math.max(-1, Math.min(1, 2 * ((values[node] ?? 0) - low) / range - 1));
  }
  return normalized;
}

function percentileOf(ascending: ArrayLike<number>, percentile: number): number {
  const rank = Math.max(0, Math.min(ascending.length - 1, (ascending.length - 1) * percentile / 100));
  const lower = Math.floor(rank), upper = Math.min(lower + 1, ascending.length - 1);
  return (ascending[lower] ?? 0) + (rank - lower) * ((ascending[upper] ?? 0) - (ascending[lower] ?? 0));
}

/** Both §21 scales of one grid, raw and normalized, with the support mask the
 * field atlas packer needs to keep unsupported ground untinted. */
export function compileCurvatureFields(grid: MetricTerrainGrid, scales: CurvatureScales = CURVATURE_SCALES): CurvatureFields {
  const support = Uint8Array.from(grid.heightsM, height => (height == null ? 0 : 1));
  const local = compileCurvature(grid, scales.localRadiusM), landform = compileCurvature(grid, scales.landformRadiusM);
  return {
    local, landform,
    localNormalized: normalizeCurvature(local, support), landformNormalized: normalizeCurvature(landform, support),
    support, scales: { localRadiusM: scales.localRadiusM, landformRadiusM: scales.landformRadiusM }, basis: 'source_derived_visual',
  };
}
