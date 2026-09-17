/** Meridian V2 hero patch regions (V2 plan §5, §11, §27, §35, §107; Task 6).
 *
 * A hero patch is a dense display mesh that replaces part of the base terrain
 * where the eye lingers: the green complex, each bunker, the edge of water,
 * the cart path. This module decides *where* those patches go and how the
 * base gives way to them; Tasks 7, 8 and 14 build the patch meshes.
 *
 * A region is a set of triangles of the cleaned canonical base
 * (`weldAndCleanTerrainMesh`), never a free polygon: its rim is made of base
 * edges, so a patch whose rim reuses those exact vertices stitches to every
 * base LOD without a crack (R4), and the base excludes the region by
 * skipping one contiguous index run (`heroRanges` in the packed LODs).
 * display-mesh-v2 keeps region rims unsplit and their vertices locked when
 * it derives LOD0 and LOD2.
 *
 * Regions, in claim order (a triangle belongs to the first that takes it):
 *   green_complex  §27: triangles within `greenInfluenceM` (35 m) of the
 *                  hole's green, clipped to the tactical bounds plus a
 *                  margin, absorbing every bunker the influence touches.
 *   bunker         §35: the bunker and a `bunkerMarginM` turf band for the
 *                  outer ring and lip crest.
 *   water_edge     every triangle with a vertex within `waterEdgeM` of a
 *                  water outline: the shoreline is a canonical breakline, so
 *                  this is the one-ring band either side of it.
 *   path           every triangle with a vertex within the cart-path half
 *                  width plus `pathMarginM` of a mobility zone line from the
 *                  context layer (paths are not mesh breaklines).
 * Green and bunker regions are grown from their feature's own triangles as
 * one connected component; water and path bands split into one region per
 * connected component. Enclosed holes are filled and pinch points (a rim
 * vertex on four rim edges) are dilated away, so every rim is one or more
 * simple loops. Regions under `minTriangles` or `minAreaM2` are dropped.
 * Budgets follow §11 per hole, shared by area.
 *
 * Nothing here moves canonical geometry or invents features (constraints
 * 1–6, 14): a region only says which base triangles a patch may stand in
 * for. Deterministic from the scene and mesh (13); three-free (R12). */
import type { DisplayMesh } from './display-mesh-v2';
import { triangleAdjacency } from './display-mesh-v2';
import { inFeature } from './spatial';
import { pathLines, type DistanceLine } from './surface-distance-field';
import type { TerrainMesh } from './terrain';
import type { HoleScene, LocalFeature, PointM } from './types';
import type { HeroPatchKind } from './visual-artifact-v2';

export interface HeroRegionOptions {
  greenInfluenceM: number;
  bunkerMarginM: number;
  waterEdgeM: number;
  pathMarginM: number;
  /** The green influence is clipped to the tactical bounds grown by this. */
  clipMarginM: number;
  minTriangles: number;
  /** Fragments smaller than this (a few path or shore triangles) stay in the base. */
  minAreaM2: number;
}
export const HERO_REGION_OPTIONS: Readonly<HeroRegionOptions> = Object.freeze({
  greenInfluenceM: 35, bunkerMarginM: 1.5, waterEdgeM: 2.5, pathMarginM: 1, clipMarginM: 12, minTriangles: 4, minAreaM2: 30,
});
/** §11 standard-tier upper targets per hole, shared among a kind's regions by area. */
export const HERO_BUDGETS: Readonly<Record<HeroPatchKind, number>> = Object.freeze({
  green_complex: 14_000, bunker: 8_000, water_edge: 2_000, path: 1_500, landing_edge: 0, structure_pad: 0,
});
/** A green complex that absorbed bunkers carries their §35 ring density
 * too: each absorbed bunker moves this much of the bunker pool into the
 * complex, capped at §11's 20k upper target. */
export const ABSORBED_BUNKER_BUDGET = 1_500, GREEN_COMPLEX_BUDGET_CAP = 20_000;
const MIN_REGION_BUDGET = 200;

export interface HeroRegion {
  id: string;
  kind: HeroPatchKind;
  /** Canonical features the region stands in for (green, absorbed bunkers, the water body…). */
  featureIds: string[];
  /** Triangle indices into the cleaned canonical base, ascending. */
  triangles: Uint32Array;
  /** Rim loops as base vertex indices (closed: first vertex repeated last), outer loops counter-clockwise. */
  rimLoops: Uint32Array[];
  boundsM: [number, number, number, number];
  areaM2: number;
  /** Base edges on the rim; the loops account for every one of them. */
  rimEdges: number;
  /** Rim vertices still shared by more than two rim edges after dilation (should be 0). */
  pinchVertices: number;
  /** §11 triangle budget for the patch mesh. */
  budgetTriangles: number;
}
export interface HeroRegionPlan {
  regions: HeroRegion[];
  /** Per base triangle: region index + 1, 0 for the base. */
  triangleRegion: Uint16Array;
  regionIds: string[];
  options: HeroRegionOptions;
  basis: 'canonical_regions';
}

function distanceToSegment(p: PointM, a: PointM, b: PointM): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** Distance to a closed ring's outline whether or not the ring repeats its first point. */
function ringDistance(p: PointM, ring: readonly PointM[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, distanceToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return best;
}
/** 0 inside the feature, else the distance to its nearest outline. */
export function featureDistance(p: PointM, feature: LocalFeature): number {
  if (inFeature(p, feature)) return 0;
  let best = Infinity;
  for (const part of feature.parts) for (const ring of part) if (ring.length >= 2) best = Math.min(best, ringDistance(p, ring));
  return best;
}
/** Whether `p` lies within `reach` of segment `a`–`b`: the same test as
 * `distanceToSegment(p, a, b) <= reach`, after a rejection on the segment's
 * bounding box (a point more than `reach` — plus a micron over any
 * rounding — outside the box is further than `reach` from the segment).
 * The region tests below only ever ask "within reach?", never the
 * distance, so an outline of hundreds of segments costs four compares a
 * segment instead of a square root. */
function segmentWithin(p: PointM, a: PointM, b: PointM, reach: number): boolean {
  const slack = reach + 1e-6;
  if (p[0] < Math.min(a[0], b[0]) - slack || p[0] > Math.max(a[0], b[0]) + slack || p[1] < Math.min(a[1], b[1]) - slack || p[1] > Math.max(a[1], b[1]) + slack) return false;
  return distanceToSegment(p, a, b) <= reach;
}
/** `ringDistance(p, ring) <= reach`, by segment. */
function ringWithin(p: PointM, ring: readonly PointM[], reach: number): boolean {
  for (let i = 0; i < ring.length; i++) if (segmentWithin(p, ring[i]!, ring[(i + 1) % ring.length]!, reach)) return true;
  return false;
}
/** `featureDistance(p, feature) <= reach`, by segment. */
function featureWithin(p: PointM, feature: LocalFeature, reach: number): boolean {
  if (inFeature(p, feature)) return true;
  for (const part of feature.parts) for (const ring of part) if (ring.length >= 2 && ringWithin(p, ring, reach)) return true;
  return false;
}
/** Whether `p` lies within `reach` of a line (a single point, or its nearest segment). */
function lineWithin(p: PointM, line: DistanceLine, reach: number): boolean {
  if (line.points.length === 1) return Math.hypot(p[0] - line.points[0]![0], p[1] - line.points[0]![1]) <= reach;
  for (let i = 1; i < line.points.length; i++) if (segmentWithin(p, line.points[i - 1]!, line.points[i]!, reach)) return true;
  return false;
}
const bboxOf = (feature: LocalFeature): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of feature.parts.flat(2)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
const outsideBox = (p: PointM, box: readonly [number, number, number, number], reach: number) =>
  p[0] < box[0] - reach || p[1] < box[1] - reach || p[0] > box[2] + reach || p[1] > box[3] + reach;

/** Working view of the base for region growing. */
class RegionBase {
  readonly centroids: Float64Array;
  readonly adjacency: Int32Array;
  readonly claimed: Uint16Array;
  constructor(readonly mesh: DisplayMesh, readonly featureOf: (t: number) => string) {
    const p = mesh.positions, n = mesh.triangleCount;
    this.centroids = new Float64Array(n * 2);
    for (let t = 0; t < n; t++) {
      const a = mesh.indices[t * 3]! * 3, b = mesh.indices[t * 3 + 1]! * 3, c = mesh.indices[t * 3 + 2]! * 3;
      this.centroids[t * 2] = (p[a]! + p[b]! + p[c]!) / 3; this.centroids[t * 2 + 1] = (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3;
    }
    this.adjacency = triangleAdjacency(mesh);
    this.claimed = new Uint16Array(n);
  }
  centroid(t: number): PointM { return [this.centroids[t * 2]!, this.centroids[t * 2 + 1]!]; }
  /** Mark every triangle with a vertex for which `near` holds. */
  markByVertex(member: Uint8Array, near: (p: PointM) => boolean): void {
    const p = this.mesh.positions, vertexNear = new Uint8Array(this.mesh.vertexCount);
    for (let v = 0; v < this.mesh.vertexCount; v++) if (near([p[v * 3]!, p[v * 3 + 1]!])) vertexNear[v] = 1;
    for (let t = 0; t < this.mesh.triangleCount; t++) for (let k = 0; k < 3; k++) if (vertexNear[this.mesh.indices[t * 3 + k]!]) { member[t] = 1; break; }
  }
  /** Connected component of `seed` triangles inside `member`, by shared edges. */
  component(member: Uint8Array, seeds: Iterable<number>): Set<number> {
    const out = new Set<number>(), queue: number[] = [];
    for (const s of seeds) if (member[s] && !out.has(s)) { out.add(s); queue.push(s); }
    while (queue.length) {
      const t = queue.pop()!;
      for (let k = 0; k < 3; k++) {
        const n = this.adjacency[t * 3 + k]!;
        if (n >= 0 && member[n] && !out.has(n)) { out.add(n); queue.push(n); }
      }
    }
    return out;
  }
  /** Add every unclaimed enclosed pocket: a complement component with no border edge. */
  fillHoles(region: Set<number>): void {
    const n = this.mesh.triangleCount, seen = new Uint8Array(n);
    for (let start = 0; start < n; start++) {
      if (region.has(start) || seen[start]) continue;
      const pocket: number[] = [start], queue = [start];
      seen[start] = 1;
      let touchesBorder = false, claimedByOther = false;
      while (queue.length) {
        const t = queue.pop()!;
        if (this.claimed[t]) claimedByOther = true;
        for (let k = 0; k < 3; k++) {
          const m = this.adjacency[t * 3 + k]!;
          if (m < 0) { touchesBorder = true; continue; }
          if (region.has(m) || seen[m]) continue;
          seen[m] = 1; pocket.push(m); queue.push(m);
        }
      }
      if (!touchesBorder && !claimedByOther) for (const t of pocket) region.add(t);
    }
  }
  /** Rim edges (a, b) of a region: triangle edges whose other side is outside it. */
  rimEdges(region: Set<number>): [number, number][] {
    const edges: [number, number][] = [];
    for (const t of Array.from(region).sort((a, b) => a - b)) for (let k = 0; k < 3; k++) {
      const n = this.adjacency[t * 3 + k]!;
      if (n < 0 || !region.has(n)) edges.push([this.mesh.indices[t * 3 + k]!, this.mesh.indices[t * 3 + ((k + 1) % 3)]!]);
    }
    return edges;
  }
  /** Dilate at rim vertices shared by more than two rim edges until none remain (or nothing more can be claimed). */
  resolvePinches(region: Set<number>): number {
    for (let round = 0; round < 12; round++) {
      const valence = new Map<number, number>();
      for (const [a, b] of this.rimEdges(region)) { valence.set(a, (valence.get(a) ?? 0) + 1); valence.set(b, (valence.get(b) ?? 0) + 1); }
      const pinched = Array.from(valence).filter(([, v]) => v > 2).map(([v]) => v).sort((a, b) => a - b);
      if (!pinched.length) return 0;
      let grown = 0;
      const pinchSet = new Set(pinched);
      for (let t = 0; t < this.mesh.triangleCount; t++) {
        if (region.has(t) || this.claimed[t]) continue;
        if ([0, 1, 2].some(k => pinchSet.has(this.mesh.indices[t * 3 + k]!))) { region.add(t); grown++; }
      }
      if (!grown) return pinched.length;
    }
    const valence = new Map<number, number>();
    for (const [a, b] of this.rimEdges(region)) { valence.set(a, (valence.get(a) ?? 0) + 1); valence.set(b, (valence.get(b) ?? 0) + 1); }
    return Array.from(valence.values()).filter(v => v > 2).length;
  }
  /** Chain rim edges into closed loops; outer loops counter-clockwise. */
  rimLoops(region: Set<number>): Uint32Array[] {
    const p = this.mesh.positions, links = new Map<number, number[]>();
    for (const [a, b] of this.rimEdges(region)) { (links.get(a) ?? links.set(a, []).get(a)!).push(b); (links.get(b) ?? links.set(b, []).get(b)!).push(a); }
    const used = new Set<string>(), loops: Uint32Array[] = [];
    const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    for (const start of Array.from(links.keys()).sort((a, b) => a - b)) {
      for (const first of links.get(start)!.slice().sort((a, b) => a - b)) {
        if (used.has(key(start, first))) continue;
        const loop = [start, first];
        used.add(key(start, first));
        let previous = start, current = first;
        while (current !== start) {
          const next = links.get(current)!.filter(v => v !== previous && !used.has(key(current, v))).sort((a, b) => a - b)[0];
          if (next == null) break;
          used.add(key(current, next)); loop.push(next); previous = current; current = next;
        }
        if (current !== start) continue;
        let area = 0;
        for (let i = 0; i < loop.length - 1; i++) area += p[loop[i]! * 3]! * p[loop[i + 1]! * 3 + 1]! - p[loop[i + 1]! * 3]! * p[loop[i]! * 3 + 1]!;
        loops.push(Uint32Array.from(area < 0 ? loop.reverse() : loop));
      }
    }
    // Largest loop first; it is the outer rim of a filled region.
    return loops.sort((a, b) => b.length - a.length);
  }
}

interface Candidate { id: string; kind: HeroPatchKind; featureIds: string[]; seeds: Set<number>; member: Uint8Array }

/** Plan the hero regions of a hole over the cleaned canonical base. */
export function compileHeroRegions(scene: HoleScene, mesh: TerrainMesh, base: DisplayMesh, options: Partial<HeroRegionOptions> = {}): HeroRegionPlan {
  const opts: HeroRegionOptions = { ...HERO_REGION_OPTIONS, ...options };
  const featureOf = (t: number) => mesh.featureIds[base.triangleFeatures[t]!]!;
  const work = new RegionBase(base, featureOf);
  const n = base.triangleCount;
  const contextIds = new Set(mesh.contextFeatureIds ?? []);
  const played = (feature: LocalFeature) => scene.hole.featureIds.includes(feature.id) && !contextIds.has(feature.id);
  const clip = mesh.renderProfile ? mesh.renderProfile.tacticalBoundsM.map((v, i) => v + (i < 2 ? -opts.clipMarginM : opts.clipMarginM)) as [number, number, number, number] : null;
  const insideClip = (p: PointM) => !clip || (p[0] >= clip[0] && p[1] >= clip[1] && p[0] <= clip[2] && p[1] <= clip[3]);
  const trianglesOf = (featureId: string): number[] => { const out: number[] = []; for (let t = 0; t < n; t++) if (featureOf(t) === featureId) out.push(t); return out; };
  // A triangle joins when its centroid or any corner lies within reach, so
  // no rim vertex can sit nearer the outline than `reach` (Task 8 needs the
  // bunker lip band, 0.7 m, to close inside the region).
  const within = (feature: LocalFeature, reach: number, member: Uint8Array): void => {
    const box = bboxOf(feature), p = base.positions;
    for (let t = 0; t < n; t++) {
      if (member[t]) continue;
      const c = work.centroid(t);
      if (!outsideBox(c, box, reach) && featureWithin(c, feature, reach)) { member[t] = 1; continue; }
      for (let k = 0; k < 3; k++) {
        const v = base.indices[t * 3 + k]!, q: PointM = [p[v * 3]!, p[v * 3 + 1]!];
        if (!outsideBox(q, box, reach) && featureWithin(q, feature, reach)) { member[t] = 1; break; }
      }
    }
  };

  const candidates: Candidate[] = [];
  const greens = scene.features.filter(f => f.kind === 'green' && played(f)).sort((a, b) => a.id.localeCompare(b.id));
  const bunkers = scene.features.filter(f => f.kind === 'bunker' && played(f)).sort((a, b) => a.id.localeCompare(b.id));
  /** A bunker's own triangles plus its margin band. */
  const bunkerBand = (bunker: LocalFeature): Uint8Array => {
    const band = new Uint8Array(n);
    for (const t of trianglesOf(bunker.id)) band[t] = 1;
    within(bunker, opts.bunkerMarginM, band);
    return band;
  };
  const absorbed = new Set<string>();
  for (const green of greens) {
    const member = new Uint8Array(n);
    within(green, opts.greenInfluenceM, member);
    for (let t = 0; t < n; t++) if (member[t] && !insideClip(work.centroid(t)) && !featureWithin(work.centroid(t), green, 0)) member[t] = 0;
    const featureIds = [green.id];
    // A bunker whose own triangles or margin band touch the complex is
    // absorbed whole, so a standalone bunker region never borders the
    // complex with a rim inside its own lip band (Task 8 seam).
    for (const bunker of bunkers) {
      if (absorbed.has(bunker.id)) continue;
      const band = bunkerBand(bunker);
      let touches = false;
      for (let t = 0; t < n && !touches; t++) touches = band[t] === 1 && member[t] === 1;
      if (!touches) continue;
      absorbed.add(bunker.id); featureIds.push(bunker.id);
      for (let t = 0; t < n; t++) if (band[t]) member[t] = 1;
    }
    candidates.push({ id: `green_complex:${green.id}`, kind: 'green_complex', featureIds, seeds: new Set(trianglesOf(green.id)), member });
  }
  // Standalone bunkers whose bands overlap merge into one region for the
  // same reason: a shared rim inside either lip band would carry two
  // different displacements.
  const bands = bunkers.filter(b => !absorbed.has(b.id)).map(b => ({ featureIds: [b.id], member: bunkerBand(b), seeds: new Set(trianglesOf(b.id)) }));
  const parent = bands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const overlaps = (a: Uint8Array, b: Uint8Array): boolean => { for (let t = 0; t < n; t++) if (a[t] && b[t]) return true; return false; };
  for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) if (find(i) !== find(j) && overlaps(bands[i]!.member, bands[j]!.member)) parent[find(j)] = find(i);
  const groups = new Map<number, { featureIds: string[]; member: Uint8Array; seeds: Set<number> }>();
  bands.forEach((band, i) => {
    const root = find(i), group = groups.get(root);
    if (!group) { groups.set(root, band); return; }
    for (let t = 0; t < n; t++) if (band.member[t]) group.member[t] = 1;
    group.featureIds.push(...band.featureIds); for (const s of band.seeds) group.seeds.add(s);
  });
  for (const group of groups.values()) {
    group.featureIds.sort((a, b) => a.localeCompare(b));
    candidates.push({ id: `bunker:${group.featureIds.join('+')}`, kind: 'bunker', featureIds: group.featureIds, seeds: group.seeds, member: group.member });
  }
  const seen = new Set<string>();
  const waters = [...scene.features, ...(scene.contextFeatures ?? [])].filter(f => f.kind === 'water' && !seen.has(f.id) && seen.add(f.id)).sort((a, b) => a.id.localeCompare(b.id));
  for (const water of waters) {
    const member = new Uint8Array(n), box = bboxOf(water);
    work.markByVertex(member, p => {
      if (outsideBox(p, box, opts.waterEdgeM) || !insideClip(p)) return false;
      for (const part of water.parts) for (const ring of part) if (ring.length >= 2 && ringWithin(p, ring, opts.waterEdgeM)) return true;
      return false;
    });
    candidates.push({ id: `water_edge:${water.id}`, kind: 'water_edge', featureIds: [water.id], seeds: new Set(), member });
  }
  const zones = (scene.contextZones ?? []).filter(z => pathLines([z]).length).sort((a, b) => a.id.localeCompare(b.id));
  for (const zone of zones) {
    const lines = pathLines([zone]), member = new Uint8Array(n);
    const reach = Math.max(...lines.map(line => line.widthM / 2 + opts.pathMarginM));
    const box = bboxOf(zone as unknown as LocalFeature);
    work.markByVertex(member, p => !outsideBox(p, box, reach) && insideClip(p) && lines.some(line => lineWithin(p, line, line.widthM / 2 + opts.pathMarginM)));
    candidates.push({ id: `path:${zone.id}`, kind: 'path', featureIds: [zone.id], seeds: new Set(), member });
  }

  // Claim in order: a triangle belongs to the first region that takes it.
  // Water and path bands split into one region per connected component.
  const regions: HeroRegion[] = [];
  const claim = (candidate: Candidate, component: Set<number>, suffix: string) => {
    work.fillHoles(component);
    const pinchVertices = work.resolvePinches(component);
    if (component.size < opts.minTriangles) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, areaM2 = 0;
    const p = base.positions;
    for (const t of component) {
      const a = base.indices[t * 3]! * 3, b = base.indices[t * 3 + 1]! * 3, c = base.indices[t * 3 + 2]! * 3;
      areaM2 += Math.abs((p[b]! - p[a]!) * (p[c + 1]! - p[a + 1]!) - (p[c]! - p[a]!) * (p[b + 1]! - p[a + 1]!)) / 2;
      for (const v of [a, b, c]) { x0 = Math.min(x0, p[v]!); y0 = Math.min(y0, p[v + 1]!); x1 = Math.max(x1, p[v]!); y1 = Math.max(y1, p[v + 1]!); }
    }
    if (areaM2 < opts.minAreaM2) return;
    const index = regions.length + 1;
    for (const t of component) work.claimed[t] = index;
    regions.push({
      id: suffix ? `${candidate.id}:${suffix}` : candidate.id, kind: candidate.kind, featureIds: candidate.featureIds, triangles: Uint32Array.from(Array.from(component).sort((a, b) => a - b)),
      rimLoops: work.rimLoops(component), boundsM: [x0, y0, x1, y1], areaM2, rimEdges: work.rimEdges(component).length, pinchVertices, budgetTriangles: 0,
    });
  };
  for (const candidate of candidates) {
    for (let t = 0; t < n; t++) if (work.claimed[t]) candidate.member[t] = 0;
    if (candidate.kind === 'green_complex' || candidate.kind === 'bunker') {
      const component = work.component(candidate.member, candidate.seeds);
      if (component.size) claim(candidate, component, '');
      continue;
    }
    const remaining = new Uint8Array(candidate.member);
    let part = 0;
    for (let t = 0; t < n; t++) {
      if (!remaining[t]) continue;
      const component = work.component(remaining, [t]);
      for (const s of component) remaining[s] = 0;
      claim(candidate, component, String(part++));
    }
  }
  // §11 budgets: each kind's per-hole total shared by area, never under the floor.
  for (const kind of new Set(regions.map(r => r.kind))) {
    const same = regions.filter(r => r.kind === kind), total = same.reduce((sum, r) => sum + r.areaM2, 0);
    for (const r of same) r.budgetTriangles = Math.max(MIN_REGION_BUDGET, Math.round(HERO_BUDGETS[kind] * (total ? r.areaM2 / total : 1 / same.length)));
    if (kind === 'green_complex') for (const r of same) r.budgetTriangles = Math.min(GREEN_COMPLEX_BUDGET_CAP, r.budgetTriangles + ABSORBED_BUNKER_BUDGET * (r.featureIds.length - 1));
  }
  const triangleRegion = new Uint16Array(n);
  regions.forEach((r, i) => { for (const t of r.triangles) triangleRegion[t] = i + 1; });
  return { regions, triangleRegion, regionIds: regions.map(r => r.id), options: opts, basis: 'canonical_regions' };
}

/** §113-style gate for a plan: regions are disjoint, non-empty, their rims
 * close into simple loops with no pinch, and every rim vertex is a base vertex. */
export function assertHeroRegionPlan(plan: HeroRegionPlan, base: DisplayMesh): void {
  const problems: string[] = [];
  const owner = new Uint16Array(base.triangleCount);
  plan.regions.forEach((region, i) => {
    if (!region.triangles.length) problems.push(`${region.id}: empty`);
    for (const t of region.triangles) {
      if (t >= base.triangleCount) { problems.push(`${region.id}: triangle out of range`); break; }
      if (owner[t]) problems.push(`${region.id}: overlaps ${plan.regions[owner[t]! - 1]!.id}`);
      owner[t] = i + 1;
      if (plan.triangleRegion[t] !== i + 1) problems.push(`${region.id}: mask mismatch`);
    }
    if (region.pinchVertices) problems.push(`${region.id}: ${region.pinchVertices} pinch vertices`);
    if (!region.rimLoops.length) problems.push(`${region.id}: no rim`);
    if (region.rimLoops.reduce((sum, loop) => sum + loop.length - 1, 0) !== region.rimEdges) problems.push(`${region.id}: rim loops do not close every rim edge`);
    for (const loop of region.rimLoops) {
      if (loop.length < 4 || loop[0] !== loop[loop.length - 1]) { problems.push(`${region.id}: open rim`); continue; }
      const seen = new Set<number>();
      for (let i = 0; i < loop.length - 1; i++) {
        if (loop[i]! >= base.vertexCount) { problems.push(`${region.id}: rim vertex out of range`); break; }
        if (seen.has(loop[i]!)) { problems.push(`${region.id}: rim revisits a vertex`); break; }
        seen.add(loop[i]!);
      }
    }
  });
  for (let t = 0; t < base.triangleCount; t++) if (plan.triangleRegion[t] !== owner[t]) { problems.push('mask names a triangle no region owns'); break; }
  if (problems.length) throw new Error(`Hero region plan failed: ${Array.from(new Set(problems)).slice(0, 8).join('; ')}`);
}
