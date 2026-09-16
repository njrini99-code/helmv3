/** Shared bunker profile maths (V2 plan §37–39; Task 8, ledger note for
 * Tasks 8/9: "the SAME bowl/lip maths lifted from V1, do not fork
 * constants"). These helpers were private to visual-artifact.ts; the V1
 * per-vertex bowl and the V2 hero displacement both call them, with the
 * constants in visual-style.ts. Everything here is render-only (V) and
 * says so: no measured bunker depth exists in the package. */
import { boundaryDistance } from './display-outline';
import type { LocalFeature, PointM } from './types';
import type { MeridianStyle } from './visual-style';

export interface Bbox { minX: number; minY: number; maxX: number; maxY: number }
export interface Ring { ring: readonly PointM[]; box: Bbox }
export function ringBbox(ring: readonly PointM[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { minX, minY, maxX, maxY };
}
export function bboxDistance([x, y]: PointM, box: Bbox): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX), dy = Math.max(box.minY - y, 0, y - box.maxY);
  return Math.sqrt(dx * dx + dy * dy);
}
/** A polygon feature's rings with their bboxes (outer first, then holes). */
export function featureRings(feature: LocalFeature | undefined): Ring[] {
  return feature && feature.type !== 'LineString' ? feature.parts.flat().map(ring => ({ ring, box: ringBbox(ring) })) : [];
}

/** Nearest point on a ring's boundary (segments), with its distance. */
export function nearestOnRings(p: PointM, rings: readonly Ring[]): { distance: number; point: PointM; ringIndex: number; segment: number } {
  let best = Infinity, bx = p[0], by = p[1], ringIndex = 0, segment = 0;
  rings.forEach(({ ring, box }, r) => {
    if (bboxDistance(p, box) >= best) return;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!, b = ring[i]!, dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
      const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
      const qx = a[0] + t * dx, qy = a[1] + t * dy, d = Math.sqrt((p[0] - qx) ** 2 + (p[1] - qy) ** 2);
      if (d < best) { best = d; bx = qx; by = qy; ringIndex = r; segment = i - 1; }
    }
  });
  return { distance: best, point: [bx, by], ringIndex, segment };
}
/** Nearest distance from a point to any ring in a list, capped; bbox-pruned. */
export function nearestRingDistance(point: PointM, rings: readonly Ring[], cap: number): number {
  let best = cap;
  for (const { ring, box } of rings) {
    if (bboxDistance(point, box) >= best) continue;
    best = Math.min(best, boundaryDistance(point, ring));
  }
  return best;
}
/** Inward (toward the sand) unit normal per ring segment, length-weighted
 * over a five-segment window so a wiggly source rim yields one steady
 * facing per stretch of edge instead of a facing that flips vertex to
 * vertex. Ring 0 is the outer boundary; later rings are holes, whose sand
 * lies on the other side. */
export function smoothedInwardNormals(rings: readonly { ring: readonly PointM[] }[]): PointM[][] {
  const outer = rings[0]?.ring ?? [];
  let signedArea = 0;
  for (let i = 1; i < outer.length; i++) signedArea += outer[i - 1]![0] * outer[i]![1] - outer[i]![0] * outer[i - 1]![1];
  const leftIsInside = signedArea > 0;
  return rings.map(({ ring }, r) => {
    const count = Math.max(0, ring.length - 1), raw: PointM[] = [], weights: number[] = [];
    const sign = (r === 0) === leftIsInside ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const a = ring[i]!, b = ring[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1;
      raw.push([-dy / length * sign, dx / length * sign]); weights.push(length);
    }
    return raw.map((_, i) => {
      let x = 0, y = 0;
      for (let k = -2; k <= 2; k++) { const j = ((i + k) % count + count) % count; x += raw[j]![0] * weights[j]!; y += raw[j]![1] * weights[j]!; }
      const length = Math.hypot(x, y) || 1;
      return [x / length, y / length] as PointM;
    });
  });
}

/** Quintic smoothstep 6u⁵ − 15u⁴ + 10u³ and its derivative (§37). */
export const smootherstep = (u: number): number => u * u * u * (u * (u * 6 - 15) + 10);
export const smootherstepSlope = (u: number): number => 30 * u * u * (u - 1) * (u - 1);
/** Deterministic 0–1 seed from a feature id (FNV-1a mixed). */
export function featureSeed(id: string): number {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
export function polygonArea(feature: LocalFeature): number {
  if (feature.type === 'LineString') return 0;
  return feature.parts.reduce((total, rings) => total + rings.reduce((sum, ring, index) => {
    const area = Math.abs(ring.reduce((acc, a, i) => { const b = ring[(i + 1) % ring.length]!; return acc + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
    return index === 0 ? sum + area : sum - area;
  }, 0), 0);
}

/** The render-only numbers one bunker asks for (V1 `VisualBunkerProfile`
 * minus the mesh-dependent fields): class and family from the style, depth
 * and lip seeded per feature id inside the style ranges, contact band and
 * shade varied by seed, bowl radius from the inradius the caller measured. */
export interface BunkerProfileNumbers {
  areaM2: number;
  sizeClass: 'small' | 'medium' | 'large';
  family: 'pot' | 'greenside' | 'fairway';
  depthM: number;
  lipM: number;
  edgeBandM: number;
  edgeShade: number;
  bowlRadiusM: number;
}
export function bunkerProfileNumbers(feature: LocalFeature, style: MeridianStyle, options: { contextOnly: boolean; greenRings: readonly Ring[]; inradiusM: number }): BunkerProfileNumbers {
  const id = feature.id, areaM2 = polygonArea(feature);
  const sizeClass: BunkerProfileNumbers['sizeClass'] = areaM2 < style.bunker.smallAreaM2 ? 'small' : areaM2 > style.bunker.largeAreaM2 ? 'large' : 'medium';
  const outer = featureRings(feature)[0]?.ring ?? [];
  const centroid: PointM = outer.length ? [outer.reduce((sum, q) => sum + q[0], 0) / outer.length, outer.reduce((sum, q) => sum + q[1], 0) / outer.length] : [0, 0];
  const family: BunkerProfileNumbers['family'] = areaM2 < style.bunker.potAreaM2 ? 'pot'
    : nearestRingDistance(centroid, options.greenRings, Infinity) < style.bunker.greensideReachM ? 'greenside' : 'fairway';
  const [low = 0, high = 0] = style.bunker.depthM[sizeClass];
  const depthM = (low + (high - low) * featureSeed(id)) * (options.contextOnly ? style.bunker.contextDepthScale : 1) * style.bunker.familyDepthScale[family];
  const edgeSeed = featureSeed(`${id}:edge`), lipSeed = featureSeed(`${id}:lip`);
  const [lipLow = 0, lipHigh = 0] = style.bunker.lipM;
  const lipM = (lipLow + (lipHigh - lipLow) * lipSeed) * (options.contextOnly ? style.bunker.contextDepthScale : 1) * style.bunker.familyLipScale[family];
  const edgeBandM = style.bunker.contactBandM * (1 + (edgeSeed - .5) * 2 * style.bunker.edgeVariation);
  const edgeShade = style.bunker.contactShade * (1 + (featureSeed(`${id}:shade`) - .5) * 2 * style.bunker.edgeVariation);
  const [radiusMin = .6, radiusMax = 3.5] = style.bunker.bowlRadiusM;
  const bowlRadiusM = Math.min(radiusMax, Math.max(radiusMin, options.inradiusM * style.bunker.bowlRadiusFraction));
  return { areaM2, sizeClass, family, depthM, lipM, edgeBandM, edgeShade, bowlRadiusM };
}
