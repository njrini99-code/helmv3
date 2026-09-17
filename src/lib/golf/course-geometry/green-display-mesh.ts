/** Meridian V2 green-complex hero mesh (V2 plan §27–29, §107, §113, §115; Task 7).
 *
 * A hero patch replaces the base triangles of one hero region
 * (hero-patches.ts) with a denser display mesh. This compiler subdivides
 * the region's own canonical triangles, so:
 *
 *   • every canonical vertex stays, at its exact canonical height;
 *   • every feature boundary (green, fringe, collar, bunker, water) stays a
 *     chain of edges on the canonical segments — the §15 Hausdorff distance
 *     of a resampled edge is 0 up to float32 packing;
 *   • the rim is the region's rim loops, unsplit, so the patch shares exact
 *     vertices with every base LOD and stitches without a crack (R4, R14);
 *   • no T-junctions inside: each base edge carries one agreed sample count.
 *
 * Per base edge the sample count is ceil(length / spacing), where the
 * spacing follows §28–29: finest on green and bunker outlines, then green
 * interiors, collars, fairway, and coarsest in the outer rough; edges with a
 * strong local curvature or a base triangle that sits off the source grid
 * are refined further; spacing widens toward the rim so the unsplit rim
 * edges do not spawn needles. Each triangle then gets a hardware-tessellator
 * layout: an inner lattice at level L = max(edge counts) and a merge strip
 * per edge between its samples and the lattice. If the whole exceeds the
 * region's §11 budget every spacing scales up until it fits.
 *
 * Heights are interpolated canonical (§6 S1, constraint 16): a new vertex
 * takes the barycentric height of its base triangle plus the metric grid's
 * own deviation from that plane at the same point, so the canonical surface
 * is reproduced exactly at canonical vertices and the source's relief
 * between them is followed rather than invented. `canonicalHeightReference`
 * carries the barycentric (S0) height, `visualOffsetMm` is 0 (V offsets are
 * a bunker matter, Task 8). Peek'n Peak has no finer source, so the basis
 * is `interpolated_canonical`; a `higher_resolution_source` patch needs a
 * listed source (visual-artifact-v2.ts).
 *
 * Display only (constraint 6); deterministic from mesh + region (13);
 * three-free (R12). */
import { checkDisplayTopology, type DisplayMesh, type TopologyReport } from './display-mesh-v2';
import type { HeroRegion } from './hero-patches';
import type { TerrainMesh } from './terrain';
import { compileCurvatureFields, type CurvatureFields } from './terrain-curvature';
import { sampleMetricTerrain } from './terrain-source';
import { SURFACE_CLASS_IDS, type SurfaceClass } from './visual-artifact';
import type { PackedHeroPatch } from './visual-artifact-v2';

/** §28–29 display spacing, metres. `edge` applies to an edge between two
 * classes (a feature outline), `interior` inside one class. */
export interface PatchSpacing {
  edge: Readonly<Partial<Record<SurfaceClass, number>>> & { default: number };
  interior: Readonly<Partial<Record<SurfaceClass, number>>> & { default: number };
  /** Spacing shrinks by up to this share where the local curvature is strong. */
  curvatureBoost: number;
  /** Spacing shrinks by this share where the base triangle sits more than `errorM` off the grid. */
  errorBoost: number;
  errorM: number;
  /** Spacing grows toward the region rim over `rimTaperM`, by up to `rimTaper`×. */
  rimTaper: number;
  rimTaperM: number;
  /** Sample count cap per base edge. */
  maxSamples: number;
  /** Share of any budget scaling a class absorbs (1 = full); the green keeps its density longest. */
  scaleShare: Readonly<Partial<Record<SurfaceClass, number>>> & { default: number };
  /** Base triangles thinner than this (degrees) are never subdivided: splitting a sliver only multiplies needles. */
  sliverAngleDeg: number;
}
export const GREEN_PATCH_SPACING: Readonly<PatchSpacing> = Object.freeze({
  edge: Object.freeze({ green: .4, bunker: .4, fringe: .5, surround: .6, tee: .8, fairway: .8, water: .6, default: 1.2 }),
  interior: Object.freeze({ green: .75, bunker: .6, fringe: .75, surround: .9, tee: 1, fairway: 1, water: 1.5, default: 1.5 }),
  curvatureBoost: .35, errorBoost: .4, errorM: .05, rimTaper: 2, rimTaperM: 10, maxSamples: 64,
  scaleShare: Object.freeze({ green: .3, bunker: .4, fringe: .6, surround: .8, default: 1 }),
  sliverAngleDeg: 5,
});
/** A standalone bunker region is 3–10 m across: a green-scale taper would
 * flatten and coarsen the whole patch, so the band is one metre. */
export const BUNKER_PATCH_SPACING: Readonly<PatchSpacing> = Object.freeze({ ...GREEN_PATCH_SPACING, rimTaper: 1, rimTaperM: 1,
  scaleShare: Object.freeze({ bunker: .4, green: .4, fringe: .7, surround: .8, default: 1 }) });
export const patchSpacingFor = (kind: HeroRegion['kind']): Readonly<PatchSpacing> => (kind === 'bunker' ? BUNKER_PATCH_SPACING : GREEN_PATCH_SPACING);

/** Hooks a patch kind adds to the subdivision (Task 8 bunkers): a spacing
 * cap by position (§35 ring density, metres; Infinity = none), a render-only
 * displacement by position (§37–39 bowl and lip, metres, carried in
 * `visualOffsetMm`), and the classes whose slivers are subdivided anyway
 * because a flat needle across a bowl would show. */
export interface RegionPatchOptions {
  spacing?: Readonly<PatchSpacing>;
  /** `compileCurvatureFields(mesh.metricGrid)` at the default scales when
   * the caller already holds it; compiled here when absent. */
  curvature?: CurvatureFields | null;
  spacingCap?: (x: number, y: number) => number;
  displacement?: (x: number, y: number) => number;
  subdivideSliverClasses?: ReadonlySet<SurfaceClass>;
}
const SUBDIVIDE_SLIVER_CLASSES: ReadonlySet<SurfaceClass> = new Set<SurfaceClass>(['bunker']);

export interface HeroPatchReport {
  id: string;
  triangles: number;
  vertices: number;
  budgetTriangles: number;
  /** Budget scale (1 = none) and the green interior spacing it left, metres. */
  spacingScale: number;
  greenSpacingM: number;
  /** Patch edges with one triangle; must equal the region's rim edges (no T-junctions). */
  borderEdges: number;
  rimVertices: number;
  /** Canonical sliver triangles in the region (kept whole). */
  baseSlivers: number;
  /** Largest |display − canonical plane| over new vertices: the interpolated relief, metres. */
  maxReliefM: number;
  /** Smallest interior angle in degrees and the count below 5°. */
  minAngleDeg: number;
  needles: number;
  topology: TopologyReport;
  /** §115: rim vertices are exact base vertices, so 0 by construction; measured anyway. */
  seamHeightMaxM: number;
  /** Render-only displacement range over the patch, metres (bowl below 0, lip above). */
  offsetMinM: number;
  offsetMaxM: number;
}
/** `triangleClass` is each patch triangle's surface class (SURFACE_CLASS_IDS index) from the base triangle it subdivides — diagnostics, not packed. */
export interface CompiledHeroPatch { patch: PackedHeroPatch; report: HeroPatchReport; orientation: Int8Array; triangleClass: Uint8Array }

type FeatureKind = TerrainMesh['featureKinds'][number];
const classOf = (kind: FeatureKind, material: number): SurfaceClass => (material === 3 ? 'surround' : material === 4 ? 'fringe' : kind);
const VERTEX_KEY_BASE = 2 ** 21;
const edgeKey = (a: number, b: number): number => (a < b ? a * VERTEX_KEY_BASE + b : b * VERTEX_KEY_BASE + a);

function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

/** Planar distance from a point to the region rim, capped at `capM`: the
 * callers fade over the rim taper and read every distance at or beyond it
 * alike, so a rim segment further than the cap (by its bounding box) is
 * never measured. Uncapped when `capM` is not a positive number. */
function rimDistanceField(base: DisplayMesh, region: HeroRegion, capM = Infinity): (x: number, y: number) => number {
  const p = base.positions, segments: number[] = [], boxes: number[] = [];
  for (const loop of region.rimLoops) for (let i = 0; i < loop.length - 1; i++) {
    const ax = p[loop[i]! * 3]!, ay = p[loop[i]! * 3 + 1]!, bx = p[loop[i + 1]! * 3]!, by = p[loop[i + 1]! * 3 + 1]!;
    segments.push(ax, ay, bx, by); boxes.push(Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
  }
  const cap = capM > 0 ? capM : Infinity, slack = cap + 1e-6;
  return (x, y) => {
    let best = cap;
    for (let s = 0; s < segments.length; s += 4) {
      if (x < boxes[s]! - slack || y < boxes[s + 1]! - slack || x > boxes[s + 2]! + slack || y > boxes[s + 3]! + slack) continue;
      best = Math.min(best, segmentDistance(x, y, segments[s]!, segments[s + 1]!, segments[s + 2]!, segments[s + 3]!));
    }
    return best;
  };
}

/** Per-edge sample counts for a region, consistent across the triangles sharing each edge. */
interface EdgePlan { counts: Map<number, number>; rim: Set<number>; scale: number; estimate: number; slivers: number }

function planEdges(mesh: TerrainMesh, base: DisplayMesh, region: HeroRegion, spacing: PatchSpacing, curvature: CurvatureFields | null, rimDistance: (x: number, y: number) => number,
  hooks: Pick<RegionPatchOptions, 'spacingCap' | 'subdivideSliverClasses'>): EdgePlan {
  const p = base.positions, grid = mesh.metricGrid;
  const sliverClasses = hooks.subdivideSliverClasses ?? SUBDIVIDE_SLIVER_CLASSES;
  const classes = new Map<number, SurfaceClass>();
  const sides = new Map<number, number[]>();
  for (const t of region.triangles) {
    classes.set(t, classOf(mesh.featureKinds[base.triangleFeatures[t]!]!, base.triangleMaterials[t]!));
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(base.indices[t * 3 + k]!, base.indices[t * 3 + ((k + 1) % 3)]!), list = sides.get(key);
      if (list) list.push(t); else sides.set(key, [t]);
    }
  }
  const curvatureAt = (x: number, y: number): number => {
    if (!grid || !curvature) return 0;
    const column = Math.round((x - grid.originM[0]) / grid.spacingM), row = Math.round((y - grid.originM[1]) / grid.spacingM);
    if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return 0;
    const n = row * grid.columns + column;
    return curvature.support[n] ? Math.abs(curvature.localNormalized[n]!) : 0;
  };
  // A base triangle's deviation from the grid at its centroid.
  const planeError = new Map<number, number>();
  for (const t of region.triangles) {
    if (!grid) { planeError.set(t, 0); continue; }
    const a = base.indices[t * 3]!, b = base.indices[t * 3 + 1]!, c = base.indices[t * 3 + 2]!;
    const cx = (p[a * 3]! + p[b * 3]! + p[c * 3]!) / 3, cy = (p[a * 3 + 1]! + p[b * 3 + 1]! + p[c * 3 + 1]!) / 3;
    const ga = sampleMetricTerrain(grid, [p[a * 3]!, p[a * 3 + 1]!]), gb = sampleMetricTerrain(grid, [p[b * 3]!, p[b * 3 + 1]!]), gc = sampleMetricTerrain(grid, [p[c * 3]!, p[c * 3 + 1]!]);
    const gm = sampleMetricTerrain(grid, [cx, cy]);
    planeError.set(t, ga != null && gb != null && gc != null && gm != null ? Math.abs(gm - (ga + gb + gc) / 3) : 0);
  }
  const slivers = new Set<number>();
  for (const t of region.triangles) if (!sliverClasses.has(classes.get(t)!) && smallestAngle(p, base.indices[t * 3]!, base.indices[t * 3 + 1]!, base.indices[t * 3 + 2]!) < spacing.sliverAngleDeg) slivers.add(t);
  const baseSpacing = new Map<number, number>(), share = new Map<number, number>(), caps = new Map<number, number>();
  const rim = new Set<number>();
  for (const [key, list] of sides) {
    if (list.length === 1 || list.some(t => slivers.has(t))) { rim.add(key); continue; }
    const a = Math.floor(key / VERTEX_KEY_BASE), b = key % VERTEX_KEY_BASE;
    const [ca, cb] = [classes.get(list[0]!)!, classes.get(list[1]!)!];
    let target = ca === cb ? spacing.interior[ca] ?? spacing.interior.default : Math.min(spacing.edge[ca] ?? spacing.edge.default, spacing.edge[cb] ?? spacing.edge.default);
    share.set(key, Math.min(spacing.scaleShare[ca] ?? spacing.scaleShare.default, spacing.scaleShare[cb] ?? spacing.scaleShare.default));
    const mx = (p[a * 3]! + p[b * 3]!) / 2, my = (p[a * 3 + 1]! + p[b * 3 + 1]!) / 2;
    target *= 1 - spacing.curvatureBoost * Math.min(1, curvatureAt(mx, my));
    if (Math.max(planeError.get(list[0]!)!, planeError.get(list[1]!)!) > spacing.errorM) target *= 1 - spacing.errorBoost;
    target *= 1 + spacing.rimTaper * Math.max(0, 1 - rimDistance(mx, my) / spacing.rimTaperM);
    baseSpacing.set(key, target);
    if (hooks.spacingCap) caps.set(key, hooks.spacingCap(mx, my));
  }
  const capShare = spacing.scaleShare.bunker ?? spacing.scaleShare.default;
  const countsFor = (scale: number): Map<number, number> => {
    const counts = new Map<number, number>();
    for (const [key, target] of baseSpacing) {
      const a = Math.floor(key / VERTEX_KEY_BASE), b = key % VERTEX_KEY_BASE;
      const length = Math.hypot(p[b * 3]! - p[a * 3]!, p[b * 3 + 1]! - p[a * 3 + 1]!);
      const cap = caps.get(key) ?? Infinity;
      const effective = Math.min(target * (1 + (scale - 1) * share.get(key)!), cap * (1 + (scale - 1) * capShare));
      counts.set(key, Math.max(1, Math.min(spacing.maxSamples, Math.ceil(length / effective))));
    }
    for (const key of rim) counts.set(key, 1);
    return counts;
  };
  const estimate = (counts: Map<number, number>): number => {
    let total = 0;
    for (const t of region.triangles) {
      const n = [0, 1, 2].map(k => counts.get(edgeKey(base.indices[t * 3 + k]!, base.indices[t * 3 + ((k + 1) % 3)]!))!);
      const L = Math.max(...n);
      total += L === 1 ? 1 : L === 2 ? n[0]! + n[1]! + n[2]! - 2 : (L - 3) * (L - 3) + n.reduce((sum, count) => sum + count + L - 3, 0);
    }
    return total;
  };
  let scale = 1, counts = countsFor(scale), total = estimate(counts);
  for (let round = 0; round < 12 && total > region.budgetTriangles; round++) {
    scale *= Math.sqrt(total / region.budgetTriangles) * 1.02;
    counts = countsFor(scale); total = estimate(counts);
  }
  return { counts, rim, scale, estimate: total, slivers: slivers.size };
}

/** Compile one hero patch by subdividing a region's canonical triangles. */
export function compileRegionPatch(mesh: TerrainMesh, base: DisplayMesh, region: HeroRegion, options: RegionPatchOptions = {}): CompiledHeroPatch {
  const spacing = options.spacing ?? patchSpacingFor(region.kind);
  const p = base.positions, grid = mesh.metricGrid;
  const curvature = options.curvature !== undefined ? options.curvature : grid ? compileCurvatureFields(grid) : null;
  const rimDistance = rimDistanceField(base, region, spacing.rimTaperM);
  const plan = planEdges(mesh, base, region, spacing, curvature, rimDistance, options);
  // Vertices: base vertices first (by base index), then edge samples, then lattice points.
  const positions: number[] = [], reference: number[] = [];
  const baseIndex = new Map<number, number>();
  let maxRelief = 0;
  const addBase = (v: number): number => {
    const existing = baseIndex.get(v);
    if (existing != null) return existing;
    const index = positions.length / 3;
    positions.push(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!); reference.push(p[v * 3 + 2]!);
    baseIndex.set(v, index);
    return index;
  };
  /** A new vertex at barycentric (u, v, w) of base triangle t: canonical plane
   * plus the grid's relief, faded out over `rimTaperM` so the patch meets the
   * planar (frozen, unrefined) base triangles outside the rim without a crease. */
  const addInterpolated = (t: number, u: number, v: number, w: number): number => {
    const a = base.indices[t * 3]!, b = base.indices[t * 3 + 1]!, c = base.indices[t * 3 + 2]!;
    const x = u * p[a * 3]! + v * p[b * 3]! + w * p[c * 3]!, y = u * p[a * 3 + 1]! + v * p[b * 3 + 1]! + w * p[c * 3 + 1]!;
    const linear = u * p[a * 3 + 2]! + v * p[b * 3 + 2]! + w * p[c * 3 + 2]!;
    let z = linear;
    if (grid) {
      const ga = sampleMetricTerrain(grid, [p[a * 3]!, p[a * 3 + 1]!]), gb = sampleMetricTerrain(grid, [p[b * 3]!, p[b * 3 + 1]!]), gc = sampleMetricTerrain(grid, [p[c * 3]!, p[c * 3 + 1]!]);
      const g = sampleMetricTerrain(grid, [x, y]);
      if (ga != null && gb != null && gc != null && g != null) z = linear + (g - (u * ga + v * gb + w * gc)) * Math.min(1, rimDistance(x, y) / spacing.rimTaperM);
    }
    maxRelief = Math.max(maxRelief, Math.abs(z - linear));
    const index = positions.length / 3;
    positions.push(x, y, z); reference.push(linear);
    return index;
  };
  // Edge samples, keyed by edge, ordered from the lower base index to the higher.
  const edgeSamples = new Map<number, number[]>();
  const samplesAlong = (t: number, from: number, to: number, cornerFrom: number, cornerTo: number): number[] => {
    // Returns the full chain from `from` to `to` including both base vertices.
    const key = edgeKey(from, to), count = plan.counts.get(key)!;
    let chain = edgeSamples.get(key);
    if (!chain) {
      const low = Math.min(from, to), high = Math.max(from, to);
      const lowCorner = low === from ? cornerFrom : cornerTo, highCorner = low === from ? cornerTo : cornerFrom;
      chain = [addBase(low)];
      for (let k = 1; k < count; k++) {
        const bary = [0, 0, 0]; bary[lowCorner] = 1 - k / count; bary[highCorner] = k / count;
        chain.push(addInterpolated(t, bary[0]!, bary[1]!, bary[2]!));
      }
      chain.push(addBase(high));
      edgeSamples.set(key, chain);
    }
    return from < to ? chain : chain.slice().reverse();
  };
  const indices: number[] = [], orientation: number[] = [], triangleClass: number[] = [];
  for (const t of region.triangles) {
    const corners = [base.indices[t * 3]!, base.indices[t * 3 + 1]!, base.indices[t * 3 + 2]!];
    const counts = [0, 1, 2].map(k => plan.counts.get(edgeKey(corners[k]!, corners[(k + 1) % 3]!))!);
    const L = Math.max(...counts);
    // Sub-triangles are built in the base's own corner order; the affine map
    // from the reference triangle keeps the base winding, so they inherit its sign.
    const classIndex = Math.max(0, SURFACE_CLASS_IDS.indexOf(classOf(mesh.featureKinds[base.triangleFeatures[t]!]!, base.triangleMaterials[t]!)));
    const push = (a: number, b: number, c: number) => { indices.push(a, b, c); orientation.push(base.orientation[t]!); triangleClass.push(classIndex); };
    if (L <= 2) {
      // No inner point: the outer polygon (corners plus at most one midpoint per
      // edge) is convex, so fan it from a midpoint, or keep the base triangle.
      const polygon: number[] = [];
      let pivot = -1;
      for (let k = 0; k < 3; k++) {
        const chain = samplesAlong(t, corners[k]!, corners[(k + 1) % 3]!, k, (k + 1) % 3);
        if (chain.length === 3 && pivot < 0) pivot = polygon.length + 1;
        polygon.push(...chain.slice(0, -1));
      }
      if (pivot < 0) push(polygon[0]!, polygon[1]!, polygon[2]!);
      else for (let i = 1; i < polygon.length - 1; i++) push(polygon[pivot]!, polygon[(pivot + i) % polygon.length]!, polygon[(pivot + i + 1) % polygon.length]!);
      continue;
    }
    // Inner lattice: (i, j, k) / L with i, j, k ≥ 1; point (a = j, b = k).
    const lattice = new Map<number, number>();
    const latticeKey = (a: number, b: number) => a * 128 + b;
    const latticePoint = (a: number, b: number): number => {
      const key = latticeKey(a, b), existing = lattice.get(key);
      if (existing != null) return existing;
      const index = L === 3 && a === 1 && b === 1 ? addInterpolated(t, 1 / 3, 1 / 3, 1 / 3) : addInterpolated(t, (L - a - b) / L, a / L, b / L);
      lattice.set(key, index);
      return index;
    };
    for (let a = 1; a + 1 <= L - 2; a++) for (let b = 1; a + b <= L - 2; b++) {
      push(latticePoint(a, b), latticePoint(a + 1, b), latticePoint(a, b + 1));
      if (a + b <= L - 3) push(latticePoint(a + 1, b), latticePoint(a + 1, b + 1), latticePoint(a, b + 1));
    }
    // Strips: outer chain of edge k (corner k → corner k+1) against the inner
    // lattice line one step in, from the corner near k to the corner near k+1.
    for (let k = 0; k < 3; k++) {
      const from = corners[k]!, to = corners[(k + 1) % 3]!;
      const outer = samplesAlong(t, from, to, k, (k + 1) % 3);
      const inner: number[] = [];
      for (let m = 0; m <= L - 3; m++) {
        // Lattice coordinates of the m-th inner point along edge k.
        const near = L - 2 - m, far = m + 1; // weights of corner k and corner k+1
        const bary = [0, 0, 0]; bary[k] = near; bary[(k + 1) % 3] = far; bary[(k + 2) % 3] = 1;
        inner.push(latticePoint(bary[1]!, bary[2]!));
      }
      let o = 0, i = 0;
      const outerT = (index: number) => index / (outer.length - 1), innerT = (index: number) => (index + 1) / (L - 1);
      while (o < outer.length - 1 || i < inner.length - 1) {
        const advanceOuter = i >= inner.length - 1 || (o < outer.length - 1 && outerT(o) + outerT(o + 1) <= innerT(i) + innerT(i + 1));
        if (advanceOuter) { push(outer[o]!, outer[o + 1]!, inner[i]!); o++; } else { push(outer[o]!, inner[i + 1]!, inner[i]!); i++; }
      }
    }
  }
  const vertexCount = positions.length / 3, triangleCount = indices.length / 3;
  // Render-only displacement (V): quantised to millimetres, added to the
  // drawn height and carried separately so canonical and display stay apart.
  const visualOffsetMm = new Int16Array(vertexCount);
  let offsetMin = 0, offsetMax = 0;
  if (options.displacement) for (let v = 0; v < vertexCount; v++) {
    const mm = Math.max(-32767, Math.min(32767, Math.round(options.displacement(positions[v * 3]!, positions[v * 3 + 1]!) * 1000)));
    visualOffsetMm[v] = mm;
    positions[v * 3 + 2] = positions[v * 3 + 2]! + mm / 1000;
    offsetMin = Math.min(offsetMin, mm / 1000); offsetMax = Math.max(offsetMax, mm / 1000);
  }
  const packed: PackedHeroPatch = {
    id: region.id, kind: region.kind, boundsM: region.boundsM, basis: 'interpolated_canonical',
    positions: Float32Array.from(positions), indices: Uint32Array.from(indices), canonicalHeightReference: Float32Array.from(reference), visualOffsetMm,
    edgeErrorMaxM: 0,
  };
  // Quality.
  let minAngle = 180, needles = 0;
  for (let t = 0; t < triangleCount; t++) {
    const a = indices[t * 3]!, b = indices[t * 3 + 1]!, c = indices[t * 3 + 2]!;
    const angle = smallestAngle(positions, a, b, c);
    minAngle = Math.min(minAngle, angle);
    if (angle < 5) needles++;
  }
  const topology = checkDisplayTopology('lod0', { basis: 'interpolated_canonical', positions: packed.positions, indices: packed.indices, triangleFeatures: new Uint16Array(triangleCount), surfaceClass: new Uint8Array(vertexCount), vertexCount, triangleCount }, Int8Array.from(orientation));
  const edgeUse = new Map<number, number>();
  for (let t = 0; t < triangleCount; t++) for (let k = 0; k < 3; k++) {
    const key = edgeKey(indices[t * 3 + k]!, indices[t * 3 + ((k + 1) % 3)]!);
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
  }
  let borderEdges = 0;
  for (const uses of edgeUse.values()) if (uses === 1) borderEdges++;
  let seam = 0, rimVertices = 0;
  for (const loop of region.rimLoops) for (let i = 0; i < loop.length - 1; i++) {
    const index = baseIndex.get(loop[i]!);
    if (index == null) { seam = Infinity; continue; }
    rimVertices++;
    seam = Math.max(seam, Math.abs(packed.positions[index * 3 + 2]! - Math.fround(p[loop[i]! * 3 + 2]!)));
  }
  return {
    patch: packed, orientation: Int8Array.from(orientation), triangleClass: Uint8Array.from(triangleClass),
    report: { id: region.id, triangles: triangleCount, vertices: vertexCount, budgetTriangles: region.budgetTriangles, spacingScale: plan.scale, greenSpacingM: (spacing.interior.green ?? spacing.interior.default) * (1 + (plan.scale - 1) * (spacing.scaleShare.green ?? spacing.scaleShare.default)), borderEdges, rimVertices, baseSlivers: plan.slivers, maxReliefM: maxRelief, minAngleDeg: minAngle, needles, topology, seamHeightMaxM: seam, offsetMinM: offsetMin, offsetMaxM: offsetMax },
  };
}
function smallestAngle(p: ArrayLike<number>, a: number, b: number, c: number): number {
  const ax = p[a * 3]!, ay = p[a * 3 + 1]!, bx = p[b * 3]!, by = p[b * 3 + 1]!, cx = p[c * 3]!, cy = p[c * 3 + 1]!;
  const la = Math.hypot(bx - cx, by - cy), lb = Math.hypot(ax - cx, ay - cy), lc = Math.hypot(ax - bx, ay - by);
  const angle = (opposite: number, s1: number, s2: number) => Math.acos(Math.max(-1, Math.min(1, (s1 * s1 + s2 * s2 - opposite * opposite) / (2 * s1 * s2)))) * 180 / Math.PI;
  if (!(la > 0 && lb > 0 && lc > 0)) return 0;
  return Math.min(angle(la, lb, lc), angle(lb, la, lc), angle(lc, la, lb));
}

/** Compile every green-complex region of a plan (no bunker displacement; bunker-display-mesh.ts adds it). */
export function compileGreenComplexPatches(mesh: TerrainMesh, base: DisplayMesh, regions: readonly HeroRegion[], options: RegionPatchOptions = {}): CompiledHeroPatch[] {
  return regions.filter(r => r.kind === 'green_complex').map(r => compileRegionPatch(mesh, base, r, options));
}

/** §113 / §115 gates for a compiled patch against its region and base. */
export function assertHeroPatch(compiled: CompiledHeroPatch, base: DisplayMesh, region: HeroRegion, seamToleranceM = 0): void {
  const { patch, report } = compiled, problems: string[] = [];
  if (!report.topology.pass) problems.push(`${report.topology.degenerate} degenerate, ${report.topology.flipped} flipped, ${report.topology.nonFiniteNormals} non-finite, ${report.topology.nonManifoldEdges} non-manifold`);
  if (patch.positions.length % 3 || patch.indices.length % 3 || patch.canonicalHeightReference.length !== patch.positions.length / 3) problems.push('buffer lengths');
  if (patch.visualOffsetMm.length !== patch.positions.length / 3) problems.push('visual offsets');
  for (let i = 0; i < patch.indices.length; i++) if (patch.indices[i]! * 3 >= patch.positions.length) { problems.push('index out of range'); break; }
  if (!(report.seamHeightMaxM <= seamToleranceM)) problems.push(`seam ${report.seamHeightMaxM} m`);
  if (report.borderEdges !== region.rimEdges) problems.push(`${report.borderEdges} border edges for ${region.rimEdges} rim edges (T-junction or hole)`);
  if (report.triangles > region.budgetTriangles) problems.push(`${report.triangles} triangles over the ${region.budgetTriangles} budget`);
  // Every rim edge of the region is an edge of the patch, unsplit.
  const edges = new Set<number>();
  for (let t = 0; t < patch.indices.length / 3; t++) for (let k = 0; k < 3; k++) edges.add(edgeKey(patch.indices[t * 3 + k]!, patch.indices[t * 3 + ((k + 1) % 3)]!));
  const key = (x: number, y: number) => `${x},${y}`;
  const patchIndex = new Map<string, number>();
  for (let v = 0; v < patch.positions.length / 3; v++) patchIndex.set(key(patch.positions[v * 3]!, patch.positions[v * 3 + 1]!), v);
  let missing = 0;
  for (const loop of region.rimLoops) for (let i = 0; i < loop.length - 1; i++) {
    const a = patchIndex.get(key(Math.fround(base.positions[loop[i]! * 3]!), Math.fround(base.positions[loop[i]! * 3 + 1]!)));
    const b = patchIndex.get(key(Math.fround(base.positions[loop[i + 1]! * 3]!), Math.fround(base.positions[loop[i + 1]! * 3 + 1]!)));
    if (a == null || b == null || !edges.has(edgeKey(a, b))) missing++;
  }
  if (missing) problems.push(`${missing} rim edges not stitched`);
  if (patch.basis === 'higher_resolution_source') problems.push('no higher-resolution source is listed for this course');
  if (problems.length) throw new Error(`Hero patch ${patch.id} failed: ${problems.join('; ')}`);
}
