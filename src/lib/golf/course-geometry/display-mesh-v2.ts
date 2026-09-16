/** Meridian V2 base display LOD compiler (V2 plan §10, §13–15, §113).
 *
 * The canonical terrain mesh (terrain.ts) stays the only truth. From it and
 * its 2 m metric grid this module derives three indexed display meshes:
 *
 *   LOD1  the canonical triangles welded into an indexed mesh, with the
 *         millimetre noding slivers collapsed (`weldToleranceM`).
 *   LOD0  LOD1 refined one red–green level where the §13 importance is
 *         highest: every edge of a "red" triangle is split at its midpoint
 *         (1→4) and the neighbours that share a split edge close the
 *         hanging vertices (1→2, 1→3), so the result has no T-junctions.
 *         A new vertex's height is the linear midpoint plus the source
 *         grid's own deviation from linearity along that edge — source
 *         interpolation, never invented micro-topography (constraint 15).
 *   LOD2  LOD1 simplified by boundary-locked half-edge collapse (R13):
 *         only vertices interior to one feature and one semantic material
 *         may move, a collapse is rejected when it would flip or squash a
 *         triangle, and the height error it introduces at the removed
 *         vertex must stay under `collapseToleranceM`.
 *
 * Semantic boundaries are locked in every LOD (§14): a vertex on an edge
 * between two features, between fringe/surround material and anything else,
 * or on the mesh border never moves, and refinement splits boundary edges
 * at points on the segment. So the display boundary polylines are the
 * canonical ones up to sliver cleaning (`weldToleranceM`, 2 cm: a boundary
 * vertex on a sliver edge moves under that, and a collar strip narrower
 * than it can vanish) and float32 packing. The §15 Hausdorff gate is still
 * measured per boundary class against the raw canonical mesh, never assumed.
 *
 * Importance (§13) is precompiled without a camera (V = 0): height error of
 * the linear edges against the grid, normal error against the grid normal,
 * landform curvature (terrain-curvature.ts), boundary proximity weighted by
 * the feature classes the edge separates, and the strategic surface weight
 * of the triangle's own feature.
 *
 * Budgets (§10) are starting budgets: LOD1 is whatever the canonical mesh
 * is, LOD0 aims at ~1.9× within 35k–60k, LOD2 at ~0.65× within 15k–25k. The
 * report says whether each landed in budget; the §113 topology gates
 * (degenerate, flipped, non-finite normal, non-manifold edge, boundary
 * mismatch) are the hard failures, enforced by `assertBaseDisplayLods`.
 *
 * Display only (constraint 6): these meshes render; lie, distance, GPS
 * resolution, picking and analytics keep using the canonical mesh. Three-free
 * (R12); deterministic from the mesh alone (constraint 13). */
import type { TerrainMesh } from './terrain';
import { compileCurvatureFields } from './terrain-curvature';
import type { MetricTerrainGrid } from './terrain-source';
import { metricTerrainNormal, sampleMetricTerrain } from './terrain-source';
import { SURFACE_CLASS_IDS, type SurfaceClass } from './visual-artifact';
import type { HeroRange, PackedDisplayMesh } from './visual-artifact-v2';

type FeatureKind = TerrainMesh['featureKinds'][number];
export type DisplayLodName = 'lod0' | 'lod1' | 'lod2';

/** §10 starting budgets, triangles. */
export const DISPLAY_LOD_BUDGETS: Readonly<Record<DisplayLodName, readonly [number, number]>> = Object.freeze({
  lod0: [35_000, 60_000], lod1: [25_000, 45_000], lod2: [15_000, 25_000],
});
/** §13 weights. Height error per metre, normal error per radian, curvature
 * on the ±1 normalized landform field, boundary and surface on the class
 * tables below. View importance is 0 offline. */
export const REFINEMENT_WEIGHTS = Object.freeze({ height: 4, normal: 2, curvature: 2, boundary: 0.5, surface: 0.3 });
/** §13 example weights for the class a boundary belongs to. */
export const BOUNDARY_CLASS_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  green: 5, bunker: 5, fringe: 4, surround: 4, fairway: 2.5, water: 2.5, tee: 2.5, rough: 1, woods: 1, ground: 1,
});
/** §13 strategic weight of a triangle's own surface. */
export const SURFACE_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  green: 3.5, bunker: 3, tee: 2, fairway: 1.5, rough: 1, water: 1, ground: 0.8, woods: 0.6, context: 0.5,
});
/** §15 display tolerances per boundary class, metres. */
export const HAUSDORFF_TOLERANCES_M: Readonly<Record<string, number>> = Object.freeze({
  green: 0.15, bunker: 0.15, fringe: 0.25, surround: 0.25, fairway: 0.4, water: 0.4, tee: 0.4, other: 1,
});

export interface DisplayLodOptions {
  /** Triangle targets; defaults derive from the canonical count and §10. */
  lod0Target?: number;
  lod2Target?: number;
  /** Largest height error a LOD2 collapse may introduce at the removed vertex. */
  collapseToleranceM: number;
  /** Triangles whose longest edge is shorter than this are never refined. */
  minRefineEdgeM: number;
  /** Canonical edges shorter than this are noding slivers, collapsed for display. */
  weldToleranceM: number;
  /** Hero regions (Task 6): their rim edges are never split or moved, their
   * triangles are never refined (the patch replaces them), and each LOD
   * orders base triangles first, then one contiguous run per region. */
  heroPlan?: HeroPlanInput;
}
export const DISPLAY_LOD_OPTIONS: Readonly<DisplayLodOptions> = Object.freeze({ collapseToleranceM: 0.15, minRefineEdgeM: 1, weldToleranceM: 0.02 });

/** An indexed working mesh; positions are Float64 until packing. */
export interface DisplayMesh {
  positions: Float64Array;
  indices: Uint32Array;
  triangleFeatures: Uint16Array;
  triangleMaterials: Uint8Array;
  /** Sign of each triangle's XY area when it was created; flips are measured against it. */
  orientation: Int8Array;
  /** Per triangle: hero region index + 1 (hero-patches.ts), 0 for the base. Absent before a plan is applied. */
  triangleRegion?: Uint16Array;
  vertexCount: number;
  triangleCount: number;
}
/** A hero region plan applied to the base LODs: `triangleRegion` is per
 * triangle of the cleaned canonical mesh (`weldAndCleanTerrainMesh`). */
export interface HeroPlanInput { triangleRegion: Uint16Array; regionIds: readonly string[] }

export interface LodReport { triangles: number; vertices: number; budget: readonly [number, number]; withinBudget: boolean; refined: number; collapsed: number; maxHeightErrorM: number }
export interface HausdorffReport { class: string; canonicalSegments: number; toleranceM: number; distancesM: Record<DisplayLodName, number>; pass: boolean }
export interface TopologyReport { lod: DisplayLodName; degenerate: number; flipped: number; nonFiniteNormals: number; nonManifoldEdges: number; pass: boolean }
export interface DisplayLodReport {
  lods: Record<DisplayLodName, LodReport>;
  hausdorff: HausdorffReport[];
  topology: TopologyReport[];
  weld: { corners: number; vertices: number; lockedVertices: number; sliverEdges: number; needles: number; sliverTriangles: number; gridResidualRmsM: number | null; gridResidualMaxM: number | null };
  pass: boolean;
}
export interface BaseDisplayLods { lod0: PackedDisplayMesh; lod1: PackedDisplayMesh; lod2: PackedDisplayMesh; report: DisplayLodReport }

const VERTEX_KEY_BASE = 2 ** 21;
const edgeKey = (a: number, b: number): number => (a < b ? a * VERTEX_KEY_BASE + b : b * VERTEX_KEY_BASE + a);
const DEGENERATE_AREA_M2 = 1e-6;
const MIN_COLLAPSE_AREA_M2 = 1e-3;
/** A triangle whose apex sits within this of its longest edge is a needle:
 * colinear within source precision and liable to flip under float32 packing. */
const NEEDLE_HEIGHT_M = 1e-3;

/** Ribbon materials 1–2 are V1 paint; only fringe (4) and surround (3) are semantic. */
const semanticMaterial = (material: number): number => (material >= 3 ? material : 0);
function classOf(kind: FeatureKind, material: number): SurfaceClass {
  if (material === 3) return 'surround';
  if (material === 4) return 'fringe';
  return kind;
}
const CLASS_PRIORITY: readonly SurfaceClass[] = ['green', 'bunker', 'fringe', 'surround', 'water', 'tee', 'fairway', 'rough', 'woods', 'ground'];

/** Weld the canonical non-indexed triangles into an indexed mesh by exact position. */
export function weldTerrainMesh(mesh: TerrainMesh): DisplayMesh {
  const corners = mesh.triangleFeatures.length * 3, v = mesh.vertices;
  const keys = new Map<string, number>();
  const positions: number[] = [], indices = new Uint32Array(corners);
  for (let corner = 0; corner < corners; corner++) {
    const x = v[corner * 3]!, y = v[corner * 3 + 1]!, z = v[corner * 3 + 2]!;
    const key = `${x},${y},${z}`;
    let index = keys.get(key);
    if (index == null) { index = positions.length / 3; keys.set(key, index); positions.push(x, y, z); }
    indices[corner] = index;
  }
  const triangleCount = mesh.triangleFeatures.length;
  const out: DisplayMesh = {
    positions: Float64Array.from(positions), indices, triangleFeatures: Uint16Array.from(mesh.triangleFeatures), triangleMaterials: Uint8Array.from(mesh.triangleMaterials),
    orientation: new Int8Array(triangleCount), vertexCount: positions.length / 3, triangleCount,
  };
  for (let t = 0; t < triangleCount; t++) out.orientation[t] = Math.sign(signedArea(out, t)) || 1;
  return out;
}

function signedArea(mesh: DisplayMesh, t: number): number {
  const p = mesh.positions, a = mesh.indices[t * 3]! * 3, b = mesh.indices[t * 3 + 1]! * 3, c = mesh.indices[t * 3 + 2]! * 3;
  return 0.5 * ((p[b]! - p[a]!) * (p[c + 1]! - p[a + 1]!) - (p[c]! - p[a]!) * (p[b + 1]! - p[a + 1]!));
}
function signedAreaXY(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return 0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
}

export interface EdgeTable {
  /** edge key → triangle indices sharing it. */
  triangles: Map<number, number[]>;
  /** 1 where the vertex lies on a semantic boundary or the mesh border. */
  locked: Uint8Array;
  /** Edge key → boundary class ('' when the edge is interior to one surface). */
  boundaryClass: Map<number, string>;
  /** 1 for hero region triangles and the base triangles on their rims: never red in refinement. */
  frozen: Uint8Array;
}

const SEMANTIC_CLASSES: readonly string[] = ['green', 'bunker', 'fringe', 'surround', 'fairway', 'water', 'tee'];
/** Boundary class of an edge from the triangles on its two sides: '' when
 * the edge is interior to one feature and surface class, 'border' with one
 * side, the highest-priority §15 class where the classes differ, and 'other'
 * for same-class feature seams (context copies, adjacent woods) and
 * non-manifold edges. */
function edgeClass(sides: readonly { cls: SurfaceClass; feature: number }[]): string {
  if (sides.length === 1) return 'border';
  if (sides.length !== 2) return 'other';
  const [a, b] = sides as [typeof sides[0], typeof sides[0]];
  if (a.cls === b.cls) return a.feature === b.feature ? '' : SEMANTIC_CLASSES.includes(a.cls) ? a.cls : 'other';
  const cls = CLASS_PRIORITY.find(c => c === a.cls || c === b.cls) ?? 'other';
  return cls in HAUSDORFF_TOLERANCES_M ? cls : 'other';
}
function boundaryClassOf(mesh: TerrainMesh, welded: DisplayMesh, edge: number[]): string {
  return edgeClass(edge.map(t => ({ cls: classOf(mesh.featureKinds[welded.triangleFeatures[t]!]!, semanticMaterial(welded.triangleMaterials[t]!)), feature: welded.triangleFeatures[t]! })));
}

/** Edge → triangle table plus the §14 lock mask. */
export function buildEdgeTable(mesh: TerrainMesh, welded: DisplayMesh): EdgeTable {
  const triangles = new Map<number, number[]>();
  for (let t = 0; t < welded.triangleCount; t++) for (let k = 0; k < 3; k++) {
    const a = welded.indices[t * 3 + k]!, b = welded.indices[t * 3 + ((k + 1) % 3)]!, key = edgeKey(a, b);
    const list = triangles.get(key);
    if (list) list.push(t); else triangles.set(key, [t]);
  }
  const locked = new Uint8Array(welded.vertexCount), boundaryClass = new Map<number, string>(), frozen = new Uint8Array(welded.triangleCount);
  const region = welded.triangleRegion;
  for (const [key, list] of triangles) {
    const cls = boundaryClassOf(mesh, welded, list);
    // A hero region edge (region change, or a region triangle on the border)
    // is locked like a feature boundary so patches stitch to every LOD.
    const hero = region != null && (list.length === 1 ? region[list[0]!]! > 0 : list.length === 2 ? region[list[0]!] !== region[list[1]!] : true);
    if (hero) for (const t of list) frozen[t] = 1;
    if (!cls && !hero) continue;
    boundaryClass.set(key, cls || 'hero');
    const a = Math.floor(key / VERTEX_KEY_BASE), b = key % VERTEX_KEY_BASE;
    locked[a] = 1; locked[b] = 1;
  }
  // Hero footprints are replaced by their patches, so refining them is waste:
  // the base-only fallback keeps them at canonical density.
  if (region) for (let t = 0; t < welded.triangleCount; t++) if (region[t]) frozen[t] = 1;
  return { triangles, locked, boundaryClass, frozen };
}

/** Height along an edge from the source grid: the linear midpoint plus the
 * grid's own deviation from linearity between the endpoints. */
function midpointHeight(grid: MetricTerrainGrid | undefined, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const linear = (az + bz) / 2;
  if (!grid) return linear;
  const ga = sampleMetricTerrain(grid, [ax, ay]), gb = sampleMetricTerrain(grid, [bx, by]), gm = sampleMetricTerrain(grid, [(ax + bx) / 2, (ay + by) / 2]);
  if (ga == null || gb == null || gm == null) return linear;
  return linear + (gm - (ga + gb) / 2);
}

/** §13 importance per triangle of `welded`; 0 for triangles too small to refine. */
export function refinementImportance(mesh: TerrainMesh, welded: DisplayMesh, table: EdgeTable, options: DisplayLodOptions): Float64Array {
  const grid = mesh.metricGrid, p = welded.positions, importance = new Float64Array(welded.triangleCount);
  const curvature = grid ? compileCurvatureFields(grid) : null;
  const contextIds = new Set(mesh.contextFeatureIds ?? []);
  const curvatureAt = (x: number, y: number): number => {
    if (!grid || !curvature) return 0;
    const column = Math.round((x - grid.originM[0]) / grid.spacingM), row = Math.round((y - grid.originM[1]) / grid.spacingM);
    if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return 0;
    const n = row * grid.columns + column;
    return curvature.support[n] ? Math.abs(curvature.landformNormalized[n]!) : 0;
  };
  for (let t = 0; t < welded.triangleCount; t++) {
    const ia = welded.indices[t * 3]!, ib = welded.indices[t * 3 + 1]!, ic = welded.indices[t * 3 + 2]!;
    const corners = [ia, ib, ic] as const;
    let longest = 0, heightError = 0, boundary = 0;
    for (let k = 0; k < 3; k++) {
      const a = corners[k]! * 3, b = corners[(k + 1) % 3]! * 3;
      const length = Math.hypot(p[b]! - p[a]!, p[b + 1]! - p[a + 1]!);
      longest = Math.max(longest, length);
      const cls = table.boundaryClass.get(edgeKey(corners[k]!, corners[(k + 1) % 3]!));
      if (cls) boundary = Math.max(boundary, BOUNDARY_CLASS_WEIGHTS[cls] ?? 1);
      if (grid) {
        const ga = sampleMetricTerrain(grid, [p[a]!, p[a + 1]!]), gb = sampleMetricTerrain(grid, [p[b]!, p[b + 1]!]), gm = sampleMetricTerrain(grid, [(p[a]! + p[b]!) / 2, (p[a + 1]! + p[b + 1]!) / 2]);
        if (ga != null && gb != null && gm != null) heightError = Math.max(heightError, Math.abs(gm - (ga + gb) / 2));
      }
    }
    if (longest < options.minRefineEdgeM || table.frozen[t]) continue;
    const cx = (p[ia * 3]! + p[ib * 3]! + p[ic * 3]!) / 3, cy = (p[ia * 3 + 1]! + p[ib * 3 + 1]! + p[ic * 3 + 1]!) / 3;
    let normalError = 0;
    if (grid) {
      const source = metricTerrainNormal(grid, [cx, cy]);
      const n = triangleNormal(welded, t);
      if (source && n) normalError = Math.acos(Math.min(1, Math.max(-1, source[0] * n[0] + source[1] * n[1] + source[2] * n[2])));
    }
    const featureIndex = welded.triangleFeatures[t]!, kind = mesh.featureKinds[featureIndex]!, id = mesh.featureIds[featureIndex]!;
    const surface = contextIds.has(id) || id === 'terrain-context' ? SURFACE_WEIGHTS.context! : SURFACE_WEIGHTS[kind] ?? 1;
    const raw = REFINEMENT_WEIGHTS.height * heightError + REFINEMENT_WEIGHTS.normal * normalError + REFINEMENT_WEIGHTS.curvature * curvatureAt(cx, cy)
      + REFINEMENT_WEIGHTS.boundary * boundary + REFINEMENT_WEIGHTS.surface * surface;
    // Splitting a long edge buys more than splitting a short one.
    importance[t] = raw * Math.min(1.5, Math.max(0.2, longest / 6));
  }
  return importance;
}

function triangleNormal(mesh: DisplayMesh, t: number): [number, number, number] | null {
  const p = mesh.positions, a = mesh.indices[t * 3]! * 3, b = mesh.indices[t * 3 + 1]! * 3, c = mesh.indices[t * 3 + 2]! * 3;
  const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!;
  const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (!Number.isFinite(length) || length === 0) return null;
  nx /= length; ny /= length; nz /= length;
  // Face the sky regardless of winding so the comparison is about slope.
  return nz < 0 ? [-nx, -ny, -nz] : [nx, ny, nz];
}

/** One red–green refinement level. `red` marks the triangles whose three
 * edges split; neighbours sharing a split edge close the hanging vertices. */
export function refineDisplayMesh(mesh: TerrainMesh, welded: DisplayMesh, red: Uint8Array): { mesh: DisplayMesh; refined: number } {
  const grid = mesh.metricGrid, p = welded.positions;
  const splitVertex = new Map<number, number>();
  const positions = Array.from(p);
  let vertexCount = welded.vertexCount;
  const midpoint = (a: number, b: number): number => {
    const key = edgeKey(a, b);
    const existing = splitVertex.get(key);
    if (existing != null) return existing;
    const ax = p[a * 3]!, ay = p[a * 3 + 1]!, az = p[a * 3 + 2]!, bx = p[b * 3]!, by = p[b * 3 + 1]!, bz = p[b * 3 + 2]!;
    positions.push((ax + bx) / 2, (ay + by) / 2, midpointHeight(grid, ax, ay, az, bx, by, bz));
    const index = vertexCount++;
    splitVertex.set(key, index);
    return index;
  };
  for (let t = 0; t < welded.triangleCount; t++) {
    if (!red[t]) continue;
    for (let k = 0; k < 3; k++) midpoint(welded.indices[t * 3 + k]!, welded.indices[t * 3 + ((k + 1) % 3)]!);
  }
  const indices: number[] = [], features: number[] = [], materials: number[] = [], orientation: number[] = [], regions: number[] = [];
  const emit = (t: number, a: number, b: number, c: number) => {
    indices.push(a, b, c); features.push(welded.triangleFeatures[t]!); materials.push(welded.triangleMaterials[t]!); orientation.push(welded.orientation[t]!);
    if (welded.triangleRegion) regions.push(welded.triangleRegion[t]!);
  };
  let refined = 0;
  for (let t = 0; t < welded.triangleCount; t++) {
    const c = [welded.indices[t * 3]!, welded.indices[t * 3 + 1]!, welded.indices[t * 3 + 2]!];
    const m = [splitVertex.get(edgeKey(c[0]!, c[1]!)), splitVertex.get(edgeKey(c[1]!, c[2]!)), splitVertex.get(edgeKey(c[2]!, c[0]!))];
    const splits = m.filter(x => x != null).length;
    if (splits === 0) { emit(t, c[0]!, c[1]!, c[2]!); continue; }
    refined++;
    if (splits === 3) {
      emit(t, c[0]!, m[0]!, m[2]!); emit(t, m[0]!, c[1]!, m[1]!); emit(t, m[2]!, m[1]!, c[2]!); emit(t, m[0]!, m[1]!, m[2]!);
      continue;
    }
    // Rotate so edge 0 (c0→c1) is split; m[k] sits on edge (c[k], c[k+1]).
    let rotation = 0;
    while (m[rotation] == null) rotation++;
    if (splits === 2) while (m[rotation] == null || m[(rotation + 1) % 3] == null) rotation = (rotation + 1) % 3;
    const r = (k: number) => (rotation + k) % 3;
    const v0 = c[r(0)]!, v1 = c[r(1)]!, v2 = c[r(2)]!, m0 = m[r(0)]!;
    if (splits === 1) { emit(t, v0, m0, v2); emit(t, m0, v1, v2); continue; }
    // Two split edges: v0→v1 (m0) and v1→v2 (m1). Corner v1 keeps its own
    // triangle; the quad v0, m0, m1, v2 splits along the shorter diagonal.
    const m1 = m[r(1)]!;
    const d = (i: number, j: number) => Math.hypot(positions[i * 3]! - positions[j * 3]!, positions[i * 3 + 1]! - positions[j * 3 + 1]!);
    emit(t, m0, v1, m1);
    if (d(v0, m1) <= d(m0, v2)) { emit(t, v0, m0, m1); emit(t, v0, m1, v2); } else { emit(t, v0, m0, v2); emit(t, m0, m1, v2); }
  }
  return {
    mesh: {
      positions: Float64Array.from(positions), indices: Uint32Array.from(indices), triangleFeatures: Uint16Array.from(features), triangleMaterials: Uint8Array.from(materials),
      orientation: Int8Array.from(orientation), ...(welded.triangleRegion ? { triangleRegion: Uint16Array.from(regions) } : {}), vertexCount, triangleCount: indices.length / 3,
    },
    refined,
  };
}

/** Pick the red set whose refinement lands at or under `target` triangles:
 * the most important triangles first, count chosen by bisection. */
export function selectRedTriangles(welded: DisplayMesh, importance: Float64Array, target: number): Uint8Array {
  const order = Array.from(importance.keys()).filter(t => importance[t]! > 0).sort((a, b) => importance[b]! - importance[a]! || a - b);
  const countAfter = (n: number): number => {
    const split = new Set<number>();
    for (let i = 0; i < n; i++) {
      const t = order[i]!;
      for (let k = 0; k < 3; k++) split.add(edgeKey(welded.indices[t * 3 + k]!, welded.indices[t * 3 + ((k + 1) % 3)]!));
    }
    let total = 0;
    for (let t = 0; t < welded.triangleCount; t++) {
      let splits = 0;
      for (let k = 0; k < 3; k++) if (split.has(edgeKey(welded.indices[t * 3 + k]!, welded.indices[t * 3 + ((k + 1) % 3)]!))) splits++;
      total += splits === 0 ? 1 : splits === 1 ? 2 : splits === 2 ? 3 : 4;
    }
    return total;
  };
  let low = 0, high = order.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (countAfter(mid) <= target) low = mid; else high = mid - 1;
  }
  const red = new Uint8Array(welded.triangleCount);
  for (let i = 0; i < low; i++) red[order[i]!] = 1;
  return red;
}

/** Editable indexed mesh for collapses and needle splits: triangles die in
 * place (or are appended) and the mesh is compacted at the end, so triangle
 * indices and their parent orientation stay stable while editing. */
class CollapseMesh {
  readonly p: Float64Array;
  readonly tri: number[];
  readonly alive: number[];
  readonly features: number[];
  readonly materials: number[];
  readonly orientation: number[];
  readonly regions: number[] | null;
  readonly vertexAlive: Uint8Array;
  readonly incident: number[][];
  triangleCount: number;
  constructor(readonly source: DisplayMesh) {
    this.p = Float64Array.from(source.positions); this.tri = Array.from(source.indices); this.orientation = Array.from(source.orientation);
    this.features = Array.from(source.triangleFeatures); this.materials = Array.from(source.triangleMaterials); this.regions = source.triangleRegion ? Array.from(source.triangleRegion) : null;
    this.alive = new Array<number>(source.triangleCount).fill(1); this.vertexAlive = new Uint8Array(source.vertexCount).fill(1);
    this.incident = Array.from({ length: source.vertexCount }, () => []);
    for (let t = 0; t < source.triangleCount; t++) for (let k = 0; k < 3; k++) this.incident[this.tri[t * 3 + k]!]!.push(t);
    this.triangleCount = source.triangleCount;
  }
  fan(v: number): number[] { return (this.incident[v] = this.incident[v]!.filter(t => this.alive[t])); }
  neighbours(v: number): number[] {
    const set = new Set<number>();
    for (const t of this.fan(v)) for (let k = 0; k < 3; k++) { const w = this.tri[t * 3 + k]!; if (w !== v) set.add(w); }
    return Array.from(set).sort((a, b) => a - b);
  }
  area(t: number): number {
    const p = this.p, a = this.tri[t * 3]! * 3, b = this.tri[t * 3 + 1]! * 3, c = this.tri[t * 3 + 2]! * 3;
    return signedAreaXY(p[a]!, p[a + 1]!, p[b]!, p[b + 1]!, p[c]!, p[c + 1]!);
  }
  /** Height error at `v` of moving it onto `u`, or null when a surviving
   * triangle would flip, fold or squash below MIN_COLLAPSE_AREA_M2. */
  evaluate(v: number, u: number): number | null {
    const p = this.p, tri = this.tri, vx = p[v * 3]!, vy = p[v * 3 + 1]!, vz = p[v * 3 + 2]!;
    let error: number | null = null;
    for (const t of this.fan(v)) {
      const a = tri[t * 3]!, b = tri[t * 3 + 1]!, c = tri[t * 3 + 2]!;
      if (a === u || b === u || c === u) continue;
      const ra = a === v ? u : a, rb = b === v ? u : b, rc = c === v ? u : c;
      const ax = p[ra * 3]!, ay = p[ra * 3 + 1]!, bx = p[rb * 3]!, by = p[rb * 3 + 1]!, cx = p[rc * 3]!, cy = p[rc * 3 + 1]!;
      const area = signedAreaXY(ax, ay, bx, by, cx, cy);
      if (Math.sign(area) !== this.orientation[t]) return null;
      // A squashed result is rejected unless the triangle was already smaller (sliver next to sliver).
      if (Math.abs(area) < MIN_COLLAPSE_AREA_M2 && Math.abs(area) < Math.abs(this.area(t))) return null;
      // Barycentric height of the new surface at the removed vertex.
      const wa = signedAreaXY(vx, vy, bx, by, cx, cy) / area, wb = signedAreaXY(ax, ay, vx, vy, cx, cy) / area, wc = 1 - wa - wb;
      if (wa >= -1e-9 && wb >= -1e-9 && wc >= -1e-9) error = Math.abs(vz - (wa * p[ra * 3 + 2]! + wb * p[rb * 3 + 2]! + wc * p[rc * 3 + 2]!));
    }
    // The removed vertex must land inside the new fan; a collapse that leaves
    // no surviving triangle (a lone sliver) is a plain drop with no error.
    return error ?? (this.fan(v).every(t => [0, 1, 2].some(k => tri[t * 3 + k] === u)) ? 0 : null);
  }
  apply(v: number, u: number): void {
    const tri = this.tri;
    for (const t of this.fan(v)) {
      const a = tri[t * 3]!, b = tri[t * 3 + 1]!, c = tri[t * 3 + 2]!;
      if (a === u || b === u || c === u) { this.kill(t); continue; }
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === v) tri[t * 3 + k] = u;
      this.incident[u]!.push(t);
    }
    this.incident[v] = []; this.vertexAlive[v] = 0;
  }
  kill(t: number): void { this.alive[t] = 0; this.triangleCount--; }
  add(a: number, b: number, c: number, like: number): number {
    const t = this.tri.length / 3;
    this.tri.push(a, b, c); this.alive.push(1); this.features.push(this.features[like]!); this.materials.push(this.materials[like]!); this.orientation.push(this.orientation[like]!);
    if (this.regions) this.regions.push(this.regions[like]!);
    this.incident[a]!.push(t); this.incident[b]!.push(t); this.incident[c]!.push(t);
    this.triangleCount++;
    return t;
  }
  /** Remove a needle: a triangle whose apex sits within NEEDLE_HEIGHT_M of
   * its longest edge (itself at least `toleranceM`, or a collapse handles it).
   * The apex moves onto that edge (a sub-millimetre move), the needle dies,
   * and the neighbour across the edge splits at the apex so the mesh stays
   * watertight. Returns false when the move would flip a proper triangle at
   * the apex. */
  splitNeedle(t: number, toleranceM: number): boolean {
    const p = this.p, tri = this.tri, corners = [tri[t * 3]!, tri[t * 3 + 1]!, tri[t * 3 + 2]!];
    let longest = -1, longestK = 0;
    for (let k = 0; k < 3; k++) {
      const a = corners[k]! * 3, b = corners[(k + 1) % 3]! * 3, length = Math.hypot(p[b]! - p[a]!, p[b + 1]! - p[a + 1]!);
      if (length > longest) { longest = length; longestK = k; }
    }
    if (longest < toleranceM || 2 * Math.abs(this.area(t)) / longest >= NEEDLE_HEIGHT_M) return false;
    const a = corners[longestK]!, b = corners[(longestK + 1) % 3]!, c = corners[(longestK + 2) % 3]!;
    const ax = p[a * 3]!, ay = p[a * 3 + 1]!, bx = p[b * 3]!, by = p[b * 3 + 1]!;
    const s = Math.min(1, Math.max(0, ((p[c * 3]! - ax) * (bx - ax) + (p[c * 3 + 1]! - ay) * (by - ay)) / (longest * longest)));
    const saved = [p[c * 3]!, p[c * 3 + 1]!, p[c * 3 + 2]!] as const;
    p[c * 3] = ax + (bx - ax) * s; p[c * 3 + 1] = ay + (by - ay) * s; p[c * 3 + 2] = p[a * 3 + 2]! + (p[b * 3 + 2]! - p[a * 3 + 2]!) * s;
    for (const other of this.fan(c)) {
      if (other === t) continue;
      const area = this.area(other);
      if (Math.sign(area) !== this.orientation[other] || Math.abs(area) < DEGENERATE_AREA_M2) { p.set(saved, c * 3); return false; }
    }
    const across = this.fan(a).find(o => o !== t && this.alive[o] && [0, 1, 2].some(k => tri[o * 3 + k] === b));
    this.kill(t);
    if (across == null) return true;
    // Rotate the neighbour so the shared edge leads, keeping its winding.
    let rotation = 0;
    while (!((tri[across * 3 + rotation]! === a || tri[across * 3 + rotation]! === b) && (tri[across * 3 + ((rotation + 1) % 3)]! === a || tri[across * 3 + ((rotation + 1) % 3)]! === b))) rotation++;
    const x = tri[across * 3 + rotation]!, y = tri[across * 3 + ((rotation + 1) % 3)]!, d = tri[across * 3 + ((rotation + 2) % 3)]!;
    this.kill(across);
    this.add(x, c, d, across); this.add(c, y, d, across);
    return true;
  }
  compact(): DisplayMesh {
    const { source, p, tri } = this, remap = new Int32Array(source.vertexCount).fill(-1);
    const positions: number[] = [], indices: number[] = [], features: number[] = [], materials: number[] = [], orientation: number[] = [], regions: number[] = [];
    let vertexCount = 0;
    for (let t = 0; t < tri.length / 3; t++) {
      if (!this.alive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const v = tri[t * 3 + k]!;
        if (remap[v]! < 0) { remap[v] = vertexCount++; positions.push(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!); }
        indices.push(remap[v]!);
      }
      features.push(this.features[t]!); materials.push(this.materials[t]!); orientation.push(this.orientation[t]!);
      if (this.regions) regions.push(this.regions[t]!);
    }
    return {
      positions: Float64Array.from(positions), indices: Uint32Array.from(indices), triangleFeatures: Uint16Array.from(features), triangleMaterials: Uint8Array.from(materials),
      orientation: Int8Array.from(orientation), ...(this.regions ? { triangleRegion: Uint16Array.from(regions) } : {}), vertexCount, triangleCount: indices.length / 3,
    };
  }
}

/** Noding leaves the canonical mesh millimetre-to-centimetre slivers (edges
 * under `toleranceM`, areas under 1e-5 m²), needles (a long triangle thinner
 * than a millimetre) and the odd micro-island. They are display noise and
 * flip under float32 packing: collapse every edge shorter than `toleranceM`
 * onto its lower-index vertex in passes until nothing short is left (a
 * sliver chain frees its neighbours pass by pass), then split the remaining
 * needles. A collapse that would flip a proper triangle is skipped.
 * Boundaries move by less than the tolerance; the Hausdorff report measures
 * the result against the raw canonical mesh. */
export function cleanDisplayMesh(welded: DisplayMesh, toleranceM = DISPLAY_LOD_OPTIONS.weldToleranceM): { mesh: DisplayMesh; collapsedEdges: number; needles: number; droppedTriangles: number } {
  const editable = new CollapseMesh(welded), p = editable.p, tri = editable.tri;
  let collapsedEdges = 0, needles = 0;
  for (let pass = 0; pass < 8; pass++) {
    const edges = new Map<number, number>();
    for (let t = 0; t < tri.length / 3; t++) {
      if (!editable.alive[t]) continue;
      for (let k = 0; k < 3; k++) {
        const a = tri[t * 3 + k]!, b = tri[t * 3 + ((k + 1) % 3)]!, key = edgeKey(a, b);
        if (edges.has(key)) continue;
        const length = Math.hypot(p[b * 3]! - p[a * 3]!, p[b * 3 + 1]! - p[a * 3 + 1]!, p[b * 3 + 2]! - p[a * 3 + 2]!);
        if (length < toleranceM) edges.set(key, length);
      }
    }
    let applied = 0;
    for (const [key] of Array.from(edges).sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
      const u = Math.floor(key / VERTEX_KEY_BASE), v = key % VERTEX_KEY_BASE;
      if (!editable.vertexAlive[u] || !editable.vertexAlive[v]) continue;
      // Either direction is a sub-tolerance move; take the one that keeps the mesh valid.
      if (editable.evaluate(v, u) != null) editable.apply(v, u);
      else if (editable.evaluate(u, v) != null) editable.apply(u, v);
      else continue;
      collapsedEdges++; applied++;
    }
    for (let t = 0; t < tri.length / 3; t++) if (editable.alive[t] && editable.splitNeedle(t, toleranceM)) { needles++; applied++; }
    if (!applied) break;
  }
  return { mesh: editable.compact(), collapsedEdges, needles, droppedTriangles: welded.triangleCount - editable.triangleCount };
}

/** Boundary-locked half-edge collapse down to `target` triangles (R13). */
export function simplifyDisplayMesh(welded: DisplayMesh, locked: Uint8Array, target: number, toleranceM: number): { mesh: DisplayMesh; collapsed: number; maxHeightErrorM: number } {
  const editable = new CollapseMesh(welded), p = editable.p;
  let collapsed = 0, maxError = 0;
  const cost = (v: number, u: number): number | null => {
    const error = editable.evaluate(v, u);
    if (error == null || error > toleranceM) return null;
    // Prefer short collapses among equal errors.
    return error + 0.002 * Math.hypot(p[u * 3]! - p[v * 3]!, p[u * 3 + 1]! - p[v * 3 + 1]!);
  };
  for (let pass = 0; pass < 12 && editable.triangleCount > target; pass++) {
    const candidates: { v: number; u: number; cost: number }[] = [];
    for (let v = 0; v < welded.vertexCount; v++) {
      if (locked[v] || !editable.vertexAlive[v]) continue;
      let best: { u: number; cost: number } | null = null;
      for (const u of editable.neighbours(v)) {
        const c = cost(v, u);
        if (c != null && (!best || c < best.cost)) best = { u, cost: c };
      }
      if (best) candidates.push({ v, u: best.u, cost: best.cost });
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => a.cost - b.cost || a.v - b.v);
    const touched = new Uint8Array(welded.vertexCount);
    let applied = 0;
    for (const candidate of candidates) {
      if (editable.triangleCount <= target) break;
      if (touched[candidate.v] || !editable.vertexAlive[candidate.v] || !editable.vertexAlive[candidate.u]) continue;
      const error = editable.evaluate(candidate.v, candidate.u);
      if (error == null || error > toleranceM) continue;
      const ring = editable.neighbours(candidate.v);
      editable.apply(candidate.v, candidate.u);
      for (const w of ring) touched[w] = 1;
      collapsed++; applied++; maxError = Math.max(maxError, error);
    }
    if (!applied) break;
  }
  return { mesh: editable.compact(), collapsed, maxHeightErrorM: maxError };
}

/** The cleaned canonical base every LOD and hero plan derives from. */
export function weldAndCleanTerrainMesh(mesh: TerrainMesh, weldToleranceM = DISPLAY_LOD_OPTIONS.weldToleranceM): DisplayMesh {
  return cleanDisplayMesh(weldTerrainMesh(mesh), weldToleranceM).mesh;
}

/** Neighbour across each triangle edge k (corners k, k+1), −1 on the border
 * or a non-manifold edge. */
export function triangleAdjacency(mesh: Pick<DisplayMesh, 'indices' | 'triangleCount'>): Int32Array {
  const edges = new Map<number, number[]>();
  for (let t = 0; t < mesh.triangleCount; t++) for (let k = 0; k < 3; k++) {
    const key = edgeKey(mesh.indices[t * 3 + k]!, mesh.indices[t * 3 + ((k + 1) % 3)]!), list = edges.get(key);
    if (list) list.push(t); else edges.set(key, [t]);
  }
  const adjacency = new Int32Array(mesh.triangleCount * 3).fill(-1);
  for (let t = 0; t < mesh.triangleCount; t++) for (let k = 0; k < 3; k++) {
    const list = edges.get(edgeKey(mesh.indices[t * 3 + k]!, mesh.indices[t * 3 + ((k + 1) % 3)]!))!;
    if (list.length === 2) adjacency[t * 3 + k] = list[0] === t ? list[1]! : list[0]!;
  }
  return adjacency;
}

/** Reorder triangles so the base comes first, then one contiguous run per
 * hero region in region order; vertices are untouched. */
export function orderHeroRegionsLast(working: DisplayMesh): DisplayMesh {
  const region = working.triangleRegion;
  if (!region) return working;
  const order = Array.from({ length: working.triangleCount }, (_, t) => t).sort((a, b) => region[a]! - region[b]! || a - b);
  const indices = new Uint32Array(working.triangleCount * 3), features = new Uint16Array(working.triangleCount), materials = new Uint8Array(working.triangleCount);
  const orientation = new Int8Array(working.triangleCount), regions = new Uint16Array(working.triangleCount);
  order.forEach((t, i) => {
    indices.set(working.indices.subarray(t * 3, t * 3 + 3), i * 3);
    features[i] = working.triangleFeatures[t]!; materials[i] = working.triangleMaterials[t]!; orientation[i] = working.orientation[t]!; regions[i] = region[t]!;
  });
  return { ...working, indices, triangleFeatures: features, triangleMaterials: materials, orientation, triangleRegion: regions };
}

/** Pack a working mesh into the V2 artifact contract. Surface class per
 * vertex takes the highest-priority class among its triangles. With a hero
 * plan the triangles must already be ordered (`orderHeroRegionsLast`) and
 * `heroRanges` names each region's run. */
export function packDisplayMesh(mesh: TerrainMesh, working: DisplayMesh, regionIds?: readonly string[]): PackedDisplayMesh {
  const surfaceClass = new Uint8Array(working.vertexCount), rank = new Uint8Array(working.vertexCount).fill(255);
  for (let t = 0; t < working.triangleCount; t++) {
    const cls = classOf(mesh.featureKinds[working.triangleFeatures[t]!]!, semanticMaterial(working.triangleMaterials[t]!));
    const priority = CLASS_PRIORITY.indexOf(cls), id = SURFACE_CLASS_IDS.indexOf(cls);
    for (let k = 0; k < 3; k++) {
      const v = working.indices[t * 3 + k]!;
      if (priority < rank[v]!) { rank[v] = priority; surfaceClass[v] = id; }
    }
  }
  const packed: PackedDisplayMesh = {
    basis: 'interpolated_canonical', positions: Float32Array.from(working.positions), indices: Uint32Array.from(working.indices),
    triangleFeatures: Uint16Array.from(working.triangleFeatures), surfaceClass, vertexCount: working.vertexCount, triangleCount: working.triangleCount,
  };
  const region = working.triangleRegion;
  if (region && regionIds) {
    const ranges: HeroRange[] = [];
    for (let t = 0; t < working.triangleCount; t++) {
      const r = region[t]!;
      if (!r) continue;
      if (t > 0 && region[t - 1]! > r) throw new Error('Hero regions must be ordered before packing');
      const last = ranges.at(-1);
      if (last && last.id === regionIds[r - 1]) last.count++;
      else ranges.push({ id: regionIds[r - 1] ?? `region-${r}`, start: t, count: 1 });
    }
    packed.heroRanges = ranges;
  }
  return packed;
}

/** Boundary segments per class of a packed mesh, using the canonical mesh's
 * feature/material semantics. Segments shorter than `minSegmentM` are skipped. */
export function boundarySegments(mesh: TerrainMesh, packed: { positions: ArrayLike<number>; indices: ArrayLike<number>; triangleFeatures: ArrayLike<number>; triangleCount: number }, materials: ArrayLike<number>, minSegmentM = 0): Map<string, number[]> {
  const edges = new Map<number, number[]>();
  for (let t = 0; t < packed.triangleCount; t++) for (let k = 0; k < 3; k++) {
    const key = edgeKey(packed.indices[t * 3 + k]!, packed.indices[t * 3 + ((k + 1) % 3)]!);
    const list = edges.get(key);
    if (list) list.push(t); else edges.set(key, [t]);
  }
  const out = new Map<string, number[]>();
  const push = (cls: string, a: number, b: number) => {
    // Sub-tolerance segments are sliver edges and micro-islands, not boundary.
    if (minSegmentM > 0 && Math.hypot(packed.positions[b * 3]! - packed.positions[a * 3]!, packed.positions[b * 3 + 1]! - packed.positions[a * 3 + 1]!) < minSegmentM) return;
    const list = out.get(cls) ?? [];
    list.push(packed.positions[a * 3]!, packed.positions[a * 3 + 1]!, packed.positions[b * 3]!, packed.positions[b * 3 + 1]!);
    out.set(cls, list);
  };
  for (const [key, list] of edges) {
    const cls = edgeClass(list.map(t => ({ cls: classOf(mesh.featureKinds[packed.triangleFeatures[t]!]!, semanticMaterial(materials[t]!)), feature: packed.triangleFeatures[t]! })));
    if (cls) push(cls, Math.floor(key / VERTEX_KEY_BASE), key % VERTEX_KEY_BASE);
  }
  return out;
}

/** §15 symmetric Hausdorff distance between two segment sets (x0, y0, x1, y1 …),
 * sampled every `stepM` along the segments (endpoints always included). */
export function hausdorffDistance(a: readonly number[], b: readonly number[], stepM = 0.25): number {
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return Number.POSITIVE_INFINITY;
  return Math.max(directedHausdorff(a, b, stepM), directedHausdorff(b, a, stepM));
}
function directedHausdorff(from: readonly number[], to: readonly number[], stepM: number): number {
  const index = new SegmentGrid(to);
  let worst = 0;
  for (let s = 0; s < from.length; s += 4) {
    const x0 = from[s]!, y0 = from[s + 1]!, x1 = from[s + 2]!, y1 = from[s + 3]!;
    const samples = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stepM));
    for (let i = 0; i <= samples; i++) {
      const f = i / samples;
      worst = Math.max(worst, index.distance(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f));
    }
  }
  return worst;
}
/** Uniform bucket grid over segments for nearest-segment queries. */
class SegmentGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly cellM: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly columns: number;
  private readonly rows: number;
  constructor(private readonly segments: readonly number[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, longest = 0;
    for (let s = 0; s < segments.length; s += 4) {
      minX = Math.min(minX, segments[s]!, segments[s + 2]!); maxX = Math.max(maxX, segments[s]!, segments[s + 2]!);
      minY = Math.min(minY, segments[s + 1]!, segments[s + 3]!); maxY = Math.max(maxY, segments[s + 1]!, segments[s + 3]!);
      longest = Math.max(longest, Math.hypot(segments[s + 2]! - segments[s]!, segments[s + 3]! - segments[s + 1]!));
    }
    this.cellM = Math.max(4, longest);
    this.minX = minX - this.cellM; this.minY = minY - this.cellM;
    this.columns = Math.ceil((maxX - this.minX) / this.cellM) + 2;
    this.rows = Math.ceil((maxY - this.minY) / this.cellM) + 2;
    for (let s = 0; s < segments.length; s += 4) {
      const c0 = this.column(Math.min(segments[s]!, segments[s + 2]!)), c1 = this.column(Math.max(segments[s]!, segments[s + 2]!));
      const r0 = this.row(Math.min(segments[s + 1]!, segments[s + 3]!)), r1 = this.row(Math.max(segments[s + 1]!, segments[s + 3]!));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const key = r * this.columns + c, list = this.cells.get(key);
        if (list) list.push(s); else this.cells.set(key, [s]);
      }
    }
  }
  private column(x: number): number { return Math.floor((x - this.minX) / this.cellM); }
  private row(y: number): number { return Math.floor((y - this.minY) / this.cellM); }
  distance(x: number, y: number): number {
    const c = this.column(x), r = this.row(y);
    let best = Infinity;
    // Rings until every cell within the query's own distance to the grid has been seen.
    const maxRing = Math.max(this.columns, this.rows) + Math.max(Math.abs(c), Math.abs(r)) + 1;
    for (let ring = 0; ring <= maxRing; ring++) {
      if ((ring - 1) * this.cellM >= best) break;
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= this.rows || cc >= this.columns) continue;
        const list = this.cells.get(rr * this.columns + cc);
        if (!list) continue;
        for (const s of list) best = Math.min(best, segmentDistance(x, y, this.segments[s]!, this.segments[s + 1]!, this.segments[s + 2]!, this.segments[s + 3]!));
      }
    }
    return best;
  }
}
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

/** §113 topology gates for one LOD. */
export function checkDisplayTopology(lod: DisplayLodName, packed: PackedDisplayMesh, orientation: Int8Array): TopologyReport {
  const p = packed.positions, edges = new Map<number, number>();
  let degenerate = 0, flipped = 0, nonFiniteNormals = 0;
  for (let t = 0; t < packed.triangleCount; t++) {
    const a = packed.indices[t * 3]!, b = packed.indices[t * 3 + 1]!, c = packed.indices[t * 3 + 2]!;
    const area = signedAreaXY(p[a * 3]!, p[a * 3 + 1]!, p[b * 3]!, p[b * 3 + 1]!, p[c * 3]!, p[c * 3 + 1]!);
    if (!Number.isFinite(area) || Math.abs(area) < DEGENERATE_AREA_M2 || a === b || b === c || a === c) degenerate++;
    else if (Math.sign(area) !== orientation[t]) flipped++;
    const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
    const vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
    const length = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (!Number.isFinite(length) || length === 0) nonFiniteNormals++;
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(packed.indices[t * 3 + k]!, packed.indices[t * 3 + ((k + 1) % 3)]!);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let nonManifoldEdges = 0;
  for (const count of edges.values()) if (count > 2) nonManifoldEdges++;
  return { lod, degenerate, flipped, nonFiniteNormals, nonManifoldEdges, pass: degenerate === 0 && flipped === 0 && nonFiniteNormals === 0 && nonManifoldEdges === 0 };
}

function lodTargets(canonical: number, options: DisplayLodOptions): { lod0: number; lod2: number } {
  const [lod0Min, lod0Max] = DISPLAY_LOD_BUDGETS.lod0, [lod2Min, lod2Max] = DISPLAY_LOD_BUDGETS.lod2;
  // Bisection lands at or under the target, so aim a little above the floor.
  const lod0 = options.lod0Target ?? Math.max(canonical, Math.min(lod0Max, Math.max(lod0Min + 500, Math.round(canonical * 1.9))));
  const lod2 = options.lod2Target ?? Math.min(canonical, Math.min(lod2Max, Math.max(lod2Min, Math.round(canonical * 0.65))));
  return { lod0, lod2 };
}

/** Compile LOD0/1/2 from the canonical mesh and its source grid. */
export function compileBaseDisplayLods(mesh: TerrainMesh, options: Partial<DisplayLodOptions> = {}): BaseDisplayLods {
  const opts: DisplayLodOptions = { ...DISPLAY_LOD_OPTIONS, ...options };
  const raw = weldTerrainMesh(mesh);
  const cleaned = cleanDisplayMesh(raw, opts.weldToleranceM);
  const welded = cleaned.mesh;
  if (opts.heroPlan) {
    if (opts.heroPlan.triangleRegion.length !== welded.triangleCount) throw new Error('Hero plan does not match the cleaned canonical mesh');
    welded.triangleRegion = opts.heroPlan.triangleRegion;
  }
  const table = buildEdgeTable(mesh, welded);
  const targets = lodTargets(welded.triangleCount, opts);
  const importance = refinementImportance(mesh, welded, table, opts);
  const red = selectRedTriangles(welded, importance, targets.lod0);
  const refinedResult = refineDisplayMesh(mesh, welded, red);
  const simplified = simplifyDisplayMesh(welded, table.locked, targets.lod2, opts.collapseToleranceM);
  const regionIds = opts.heroPlan?.regionIds;
  const working: Record<DisplayLodName, DisplayMesh> = { lod0: orderHeroRegionsLast(refinedResult.mesh), lod1: orderHeroRegionsLast(welded), lod2: orderHeroRegionsLast(simplified.mesh) };
  const packed: Record<DisplayLodName, PackedDisplayMesh> = {
    lod0: packDisplayMesh(mesh, working.lod0, regionIds), lod1: packDisplayMesh(mesh, working.lod1, regionIds), lod2: packDisplayMesh(mesh, working.lod2, regionIds),
  };

  const grid = mesh.metricGrid;
  let residualSum = 0, residualCount = 0, residualMax = 0;
  if (grid) for (let v = 0; v < raw.vertexCount; v++) {
    const z = sampleMetricTerrain(grid, [raw.positions[v * 3]!, raw.positions[v * 3 + 1]!]);
    if (z == null) continue;
    const d = Math.abs(z - raw.positions[v * 3 + 2]!);
    residualSum += d * d; residualCount++; residualMax = Math.max(residualMax, d);
  }
  let locked = 0;
  for (let v = 0; v < welded.vertexCount; v++) locked += table.locked[v]!;

  // The reference boundary is the raw canonical mesh, before sliver cleaning.
  const canonicalSegments = boundarySegments(mesh, raw, raw.triangleMaterials, opts.weldToleranceM);
  const lodSegments: Record<DisplayLodName, Map<string, number[]>> = {
    lod0: boundarySegments(mesh, packed.lod0, working.lod0.triangleMaterials, opts.weldToleranceM), lod1: boundarySegments(mesh, packed.lod1, working.lod1.triangleMaterials, opts.weldToleranceM),
    lod2: boundarySegments(mesh, packed.lod2, working.lod2.triangleMaterials, opts.weldToleranceM),
  };
  const classes = Array.from(new Set([...canonicalSegments.keys(), ...lodSegments.lod0.keys(), ...lodSegments.lod1.keys(), ...lodSegments.lod2.keys()])).sort();
  const hausdorff: HausdorffReport[] = classes.map(cls => {
    const canonical = canonicalSegments.get(cls) ?? [];
    const toleranceM = HAUSDORFF_TOLERANCES_M[cls] ?? HAUSDORFF_TOLERANCES_M.other!;
    const distancesM = {
      lod0: hausdorffDistance(canonical, lodSegments.lod0.get(cls) ?? []), lod1: hausdorffDistance(canonical, lodSegments.lod1.get(cls) ?? []),
      lod2: hausdorffDistance(canonical, lodSegments.lod2.get(cls) ?? []),
    };
    return { class: cls, canonicalSegments: canonical.length / 4, toleranceM, distancesM, pass: distancesM.lod0 <= toleranceM && distancesM.lod1 <= toleranceM && distancesM.lod2 <= toleranceM };
  });
  const topology = (['lod0', 'lod1', 'lod2'] as const).map(lod => checkDisplayTopology(lod, packed[lod], working[lod].orientation));
  const lodReport = (lod: DisplayLodName, refined: number, collapsed: number, maxHeightErrorM: number): LodReport => {
    const budget = DISPLAY_LOD_BUDGETS[lod], triangles = packed[lod].triangleCount;
    return { triangles, vertices: packed[lod].vertexCount, budget, withinBudget: triangles >= budget[0] && triangles <= budget[1], refined, collapsed, maxHeightErrorM };
  };
  const report: DisplayLodReport = {
    lods: { lod0: lodReport('lod0', refinedResult.refined, 0, 0), lod1: lodReport('lod1', 0, cleaned.collapsedEdges, 0), lod2: lodReport('lod2', 0, simplified.collapsed, simplified.maxHeightErrorM) },
    hausdorff, topology,
    weld: {
      corners: mesh.triangleFeatures.length * 3, vertices: raw.vertexCount, lockedVertices: locked, sliverEdges: cleaned.collapsedEdges, needles: cleaned.needles, sliverTriangles: cleaned.droppedTriangles,
      gridResidualRmsM: residualCount ? Math.sqrt(residualSum / residualCount) : null, gridResidualMaxM: residualCount ? residualMax : null,
    },
    pass: hausdorff.every(h => h.pass) && topology.every(t => t.pass),
  };
  return { ...packed, report };
}

/** Throw on any §113 / §15 gate failure. Budgets are advisory and only reported. */
export function assertBaseDisplayLods(result: BaseDisplayLods): void {
  const problems: string[] = [];
  for (const t of result.report.topology) if (!t.pass) problems.push(`${t.lod}: ${t.degenerate} degenerate, ${t.flipped} flipped, ${t.nonFiniteNormals} non-finite normals, ${t.nonManifoldEdges} non-manifold edges`);
  for (const h of result.report.hausdorff) if (!h.pass) problems.push(`${h.class} boundary: lod0 ${h.distancesM.lod0.toFixed(3)} m, lod2 ${h.distancesM.lod2.toFixed(3)} m > ${h.toleranceM} m`);
  for (const lod of ['lod0', 'lod1', 'lod2'] as const) {
    const m = lod === 'lod0' ? result.lod0 : lod === 'lod1' ? result.lod1 : result.lod2;
    if (m.positions.length !== m.vertexCount * 3 || m.indices.length !== m.triangleCount * 3 || m.triangleFeatures.length !== m.triangleCount || m.surfaceClass.length !== m.vertexCount) problems.push(`${lod}: inconsistent buffers`);
    for (let i = 0; i < m.indices.length; i++) if (m.indices[i]! >= m.vertexCount) { problems.push(`${lod}: index out of range`); break; }
  }
  if (problems.length) throw new Error(`Display LOD gates failed: ${problems.join('; ')}`);
}
