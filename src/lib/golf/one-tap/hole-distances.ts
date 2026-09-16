import { ringArea } from '../course-geometry/spatial';
import type { LocalFeature, PointM } from '../course-geometry/types';
import type { Covariance2 } from './location-estimator';

/** Front / centre / back (master plan). The green centre is the area
 * centroid of the outer ring; front and back are where the approach axis
 * through the centre crosses the boundary (interpolated on the segments, not
 * a picked vertex). Never a cup distance: the daily pin is UNSPECIFIED. */
export interface GreenDistances {
  frontM: number;
  centreM: number;
  backM: number;
  centreENU: PointM;
  sigmaM: number;
  basis: 'approach_axis_boundary_intersection';
}
export function ringCentroid(ring: readonly PointM[]): PointM {
  let cx = 0, cy = 0, twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!, b = ring[i + 1]!, cross = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross; twice += cross;
  }
  if (Math.abs(twice) < 1e-9) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [cx / (3 * twice), cy / (3 * twice)];
}
export function largestOuterRing(feature: LocalFeature): readonly PointM[] | null {
  let best: readonly PointM[] | null = null, bestArea = -1;
  for (const rings of feature.parts) { const ring = rings[0]; if (ring) { const area = ringArea(ring); if (area > bestArea) { best = ring; bestArea = area; } } }
  return best;
}
/** Distances from the player to the green along the approach axis. `sigmaM`
 * is the player position σ projected on that axis plus the green edge σ. */
export function greenDistances(player: PointM, green: LocalFeature, playerCov: Covariance2, greenEdgeSigmaM: number): GreenDistances | null {
  const ring = largestOuterRing(green);
  if (!ring || ring.length < 4) return null;
  const centre = ringCentroid(ring), dx = centre[0] - player[0], dy = centre[1] - player[1], length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const a: PointM = [dx / length, dy / length];
  const projections: number[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const p = ring[i]!, q = ring[i + 1]!;
    // Signed distance of each vertex from the axis line through the centre.
    const sp = (p[0] - centre[0]) * -a[1] + (p[1] - centre[1]) * a[0], sq = (q[0] - centre[0]) * -a[1] + (q[1] - centre[1]) * a[0];
    if ((sp <= 0 && sq > 0) || (sq <= 0 && sp > 0)) {
      const t = sp / (sp - sq), x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
      projections.push((x - player[0]) * a[0] + (y - player[1]) * a[1]);
    }
  }
  if (projections.length < 2) for (let i = 0; i < ring.length - 1; i++) projections.push((ring[i]![0] - player[0]) * a[0] + (ring[i]![1] - player[1]) * a[1]);
  const sigmaPos = Math.sqrt(Math.max(0, a[0] * (playerCov[0][0] * a[0] + playerCov[0][1] * a[1]) + a[1] * (playerCov[1][0] * a[0] + playerCov[1][1] * a[1])));
  return { frontM: Math.min(...projections), centreM: length, backM: Math.max(...projections), centreENU: centre,
    sigmaM: Math.sqrt(sigmaPos * sigmaPos + greenEdgeSigmaM * greenEdgeSigmaM), basis: 'approach_axis_boundary_intersection' };
}
/** §15–16 green-aware readout. Off the green complex the golfer reads
 * front / centre / back; on the green those edges are behind or beside the
 * ball and the readout is ON GREEN with the centre distance — or, when the
 * putt is shorter than the uncertainty can resolve, no number at all. The
 * daily pin is UNSPECIFIED, so there is no pin distance to print; a later
 * pin estimate would print with a tilde (§15.3), never as exact feet. */
export type ReadoutMode = 'approach' | 'on_green';
export interface GreenReadout {
  mode: ReadoutMode;
  /** Approach only; null on the green (the edges are not targets there). */
  frontM: number | null;
  centreM: number;
  backM: number | null;
  sigmaM: number;
  /** §16: a putt shorter than max(4 m, 2.5 σ) shows no exact number. */
  centreDisplay: 'exact' | 'suppressed';
  pin: 'unspecified';
  basis: GreenDistances['basis'];
}
/** PROVISIONAL — TUNE ON PEEK'N PEAK (§16). */
export const PUTT_SUPPRESSION = Object.freeze({ minM: 4, sigmaMultiple: 2.5 });
export function shortPuttSuppressed(distanceM: number, sigmaM: number, rule = PUTT_SUPPRESSION): boolean {
  return distanceM < Math.max(rule.minM, rule.sigmaMultiple * sigmaM);
}
export function greenReadout(distances: GreenDistances, onGreen: boolean): GreenReadout {
  if (!onGreen) return { mode: 'approach', frontM: distances.frontM, centreM: distances.centreM, backM: distances.backM, sigmaM: distances.sigmaM, centreDisplay: 'exact', pin: 'unspecified', basis: distances.basis };
  return { mode: 'on_green', frontM: null, centreM: distances.centreM, backM: null, sigmaM: distances.sigmaM,
    centreDisplay: shortPuttSuppressed(distances.centreM, distances.sigmaM) ? 'suppressed' : 'exact', pin: 'unspecified', basis: distances.basis };
}
export const YARDS_PER_METRE = 1.0936132983377078;
export function metresToYards(m: number): number { return m * YARDS_PER_METRE; }
export function metresToFeet(m: number): number { return m * 3.280839895013123; }
