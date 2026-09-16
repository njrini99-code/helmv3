/** Meridian V2 bent-sky field (V2 plan §24–25, feeding §18 and §70).
 *
 * Per metric grid node, from the source grid only: how much open sky the
 * node sees, which direction that sky lies in, and how far the ground falls
 * away around it. The shader spends this as bent-sky ambient — valley floors
 * and forest edges a little darker and enclosed, exposed shelves a little
 * brighter — instead of one hemisphere light shading every point alike.
 *
 * Horizon (§25): for each azimuth θ the horizon elevation is the largest
 * angle to the ground along the ray within `radiusM`,
 *   α_h(θ) = max_r atan((z(r,θ) − z0) / r),
 * and the direction's open-sky fraction is v(θ) = 1 − max(0, α_h) / (π/2).
 * This is measured against the horizontal, not the local tangent plane, so a
 * node at the foot of a slope reads less sky than one on the crest
 * (`relativeSkyRelief` in three-landscape.ts keeps its tangent-plane form for
 * the V1 landform occlusion; the two are different quantities on purpose).
 *
 * Bent normal (§24): the direction of the open sky. Each ray contributes its
 * open cone's centre direction — elevation (max(0, α_h) + π/2) / 2 along θ —
 * weighted by v(θ); the normalized sum is the bent normal. On a horizontal
 * plane every ray is fully open and the horizontal parts cancel, so the bent
 * normal is straight up (`bentXY` = 0); next to a wall the occluded rays
 * contribute less and it tilts away from the wall. It is not a surface
 * normal and never replaces the source normal (§26).
 *
 * Exposure: the mean over directions of how steeply the ground falls away,
 * max(0, −min_r atan((z − z0) / r)) / (π/2) — a knoll or shoulder scores
 * high, a floor scores 0. Packed as §18 bent-light B.
 *
 * Rays march the grid at geometric steps (1, 2, 3, 4, 6, 9 … nodes) like the
 * V1 march, so a 20-node radius costs about a dozen reads a direction. A ray
 * ends at the grid edge; an unsupported (null) sample is skipped; a ray with
 * no supported sample contributes nothing (it is neither open nor occluded).
 * Unsupported nodes output 0 everywhere and `support` 0.
 *
 * Visual only (constraint 6): this field lights ground. It never feeds lie
 * truth, distance, GPS resolution, picking or analytics, and never moves
 * canonical Z (constraint 4). Deterministic from the grid alone (13). */
import type { MetricTerrainGrid } from './terrain-source';

/** §25: a limited radius, 20–60 m; §24: 8–16 azimuth directions. */
export const SKY_FIELD_OPTIONS = Object.freeze({ radiusM: 40, directions: 16 });
export interface SkyFieldOptions { radiusM: number; directions: number }

export interface SkyField {
  /** Mean open-sky fraction per node, 0–1, grid layout. */
  visibility: Float32Array;
  /** x, y of the unit bent normal per node (z = sqrt(1 − x² − y²)); 0, 0 straight up. */
  bentXY: Float32Array;
  /** Mean fall-away per node, 0–1. */
  exposure: Float32Array;
  /** 1 where the source grid answers, 0 where it does not. */
  support: Uint8Array;
  options: SkyFieldOptions;
  basis: 'source_derived_visual';
}

const HALF_PI = Math.PI / 2;

/** Geometric march offsets in nodes: 1, 2, 3, 4, 6, 9, 14 … then the radius. */
export function marchSteps(radiusNodes: number): number[] {
  const steps: number[] = [];
  for (let d = 1; d < radiusNodes; d = d < 4 ? d + 1 : Math.round(d * 1.5)) steps.push(d);
  steps.push(radiusNodes);
  return steps;
}

/** Open sky per node of `grid` within `options.radiusM`, `options.directions`
 * azimuths. Arrays are in the grid's own row-major layout. */
export function compileSkyField(grid: MetricTerrainGrid, options: SkyFieldOptions = SKY_FIELD_OPTIONS): SkyField {
  const { columns, rows, spacingM, heightsM } = grid;
  const count = columns * rows;
  const visibility = new Float32Array(count), bentXY = new Float32Array(count * 2), exposure = new Float32Array(count), support = new Uint8Array(count);
  const radiusNodes = Math.max(1, Math.round(options.radiusM / spacingM));
  const steps = marchSteps(radiusNodes);
  const directions = Math.max(1, Math.round(options.directions));
  const azimuths = Array.from({ length: directions }, (_, k) => { const a = 2 * Math.PI * k / directions; return [Math.cos(a), Math.sin(a)] as const; });
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const n = r * columns + c, z0 = heightsM[n];
    if (z0 == null) continue;
    support[n] = 1;
    let rays = 0, open = 0, fall = 0, bx = 0, by = 0, bz = 0;
    for (const [ux, uy] of azimuths) {
      let maxTan = Number.NEGATIVE_INFINITY, minTan = Number.POSITIVE_INFINITY;
      for (const d of steps) {
        const cc = c + Math.round(ux * d), rr = r + Math.round(uy * d);
        if (cc < 0 || rr < 0 || cc >= columns || rr >= rows) break;
        const z = heightsM[rr * columns + cc];
        if (z == null) continue;
        const distance = Math.hypot(cc - c, rr - r) * spacingM;
        if (distance <= 0) continue;
        const tan = (z - z0) / distance;
        if (tan > maxTan) maxTan = tan;
        if (tan < minTan) minTan = tan;
      }
      // A ray with no supported sample (grid edge, unsupported neighbours) scores nothing.
      if (!Number.isFinite(maxTan)) continue;
      const horizon = Math.max(0, Math.atan(maxTan)), v = 1 - horizon / HALF_PI;
      const cone = (horizon + HALF_PI) / 2;
      rays++; open += v; fall += Math.max(0, -Math.atan(minTan)) / HALF_PI;
      bx += v * Math.cos(cone) * ux; by += v * Math.cos(cone) * uy; bz += v * Math.sin(cone);
    }
    if (!rays) { visibility[n] = 1; continue; }
    visibility[n] = open / rays;
    exposure[n] = fall / rays;
    const length = Math.hypot(bx, by, bz);
    if (length > 0) { bentXY[n * 2] = bx / length; bentXY[n * 2 + 1] = by / length; }
  }
  return { visibility, bentXY, exposure, support, options: { radiusM: options.radiusM, directions }, basis: 'source_derived_visual' };
}
