/** Meridian V2 cart-path ribbon (V2 plan §11, §52-54, §113; Task 14).
 *
 * One batched ribbon geometry per hole covering every mobility zone the
 * context layer marks with a rideable width (cart_path, service_path, road
 * — whatever `pathLines` resolves a width for; §11 groups them under the
 * same "path" hero budget, 1 500 triangles/hole). A single draw call per
 * hole, not one per zone: the Task 14/18 note records 3-14 zones per hole,
 * so every zone's geometry is appended into one shared position/index
 * buffer and only recorded separately in `runs` for diagnostics.
 *
 * Each zone's centreline is resampled at <= `maxSegmentM` (1 m) along its
 * arc length, with a mandatory row at every original vertex whose turn
 * exceeds `turnSampleRad` (10°) so a corner is never smoothed away by
 * uniform spacing — the span between two such corners (or a gentle OSM
 * trace with many sub-10° vertices in between) is otherwise resampled
 * uniformly, so a dense source trace does not by itself inflate the count
 * (§53 "do not create road-engineering precision unsupported by source").
 *
 * The cross-section carries 4 columns either side of the centreline: the
 * path edge at `widthM/2` (attributes.widthM, default from `pathLines`,
 * 2.4 m for cart_path) and a `featherM` (0.25 m) strip beyond it. `edge` is
 * 0 across the solid path and ramps to 1 only across that outer strip (not
 * a normalized |t|, which would duplicate `t` and feather the whole width)
 * — the ground-blend shader reads it to fade path material into whatever
 * surface material the field atlas names underneath.
 *
 * Corners join by mitre when the turn is <= `bevelTurnRad` (60°): the
 * offset is the bisector of the incoming/outgoing perpendiculars, scaled
 * 1/cos(turn/2) (<= ~1.15x at the limit, never larger). Past that the
 * corner bevels into two independent rows, one built from the incoming
 * segment's own cross vector and one from the outgoing segment's — each is
 * identical in kind to an ordinary straight-run row, so the row just
 * before/after the corner joins to it as a trivial continuation, not a
 * second turn. Only the pivot between the two bevel rows themselves needs
 * care: the rail on the concave (inside) side of the turn nets zero signed
 * area between them (the two rows converge, not diverge) and is skipped
 * outright; the convex rail's quad is an ordinary two-triangle facet; the
 * middle quad is a degenerate (bowtie) quadrilateral contributing exactly
 * one real triangle, found by trying both of its diagonals. A defensive
 * positive-area check still gates every emitted triangle
 * (`droppedTriangles`); it should read zero for these joins, and the tests
 * assert that rather than trusting the filter to hide a fold.
 *
 * Heights come from the V2 display surface `base` (a uniform-grid triangle
 * locator + barycentric interpolation), falling back to
 * `sampleMetricTerrain` and then the nearest display vertex when a zone
 * point lands outside the triangulated footprint (a mobility line can
 * range past it before clipping to `contextBoundsM`, itself a rectangle
 * that need not match the triangulation's own outline) — `surfaceFallbacks`
 * counts how often that happened. A render-only `visualLiftM` (15 mm,
 * reported, never called measured) keeps the ribbon off the terrain it was
 * just sampled from (constraint 5); nothing here changes canonical
 * geometry or the base mesh (constraints 1-6). Deterministic from the
 * scene and meshes (13); three-free (R12). */
import type { DisplayMesh } from './display-mesh-v2';
import { pathLines } from './surface-distance-field';
import type { TerrainMesh } from './terrain';
import { sampleMetricTerrain, type MetricTerrainGrid } from './terrain-source';
import type { HoleScene, PointM } from './types';

export interface PathRibbonOptions {
  /** Longest arc-length step between resampled rows. */
  maxSegmentM: number;
  /** A source vertex turning by more than this always gets its own row. */
  turnSampleRad: number;
  /** Above this turn a corner bevels instead of mitring. */
  bevelTurnRad: number;
  /** Feather strip width beyond the path edge, each side. */
  featherM: number;
  /** Render-only height added above the sampled surface (constraint 5). */
  visualLiftM: number;
}
export const PATH_RIBBON_OPTIONS: Readonly<PathRibbonOptions> = Object.freeze({
  maxSegmentM: 1, turnSampleRad: (10 * Math.PI) / 180, bevelTurnRad: (60 * Math.PI) / 180, featherM: 0.25, visualLiftM: 0.015,
});

export interface PathRibbonRun { zoneId: string; start: number; count: number }
export interface PathRibbon {
  /** xyz, metres. */
  positions: Float32Array;
  indices: Uint32Array;
  /** s = arc length along the path (m), t = lateral position in [-1, 1] at the outer feather edge. */
  uv: Float32Array;
  /** 0 across the solid path width, ramping to 1 across the feather strip. */
  edge: Float32Array;
  /** One entry per zone that contributed triangles, in triangle-index units (start/count), like `HeroRange`. */
  runs: PathRibbonRun[];
  visualLiftM: number;
  triangleCount: number;
  vertexCount: number;
  boundsM: [number, number, number, number];
  /** Vertices the triangle locator could not answer directly (fell back to the metric grid or the nearest display vertex). */
  surfaceFallbacks: number;
  /** Triangles a defensive area/winding check rejected; should be 0 (see module doc). */
  droppedTriangles: number;
}

const norm = (x: number, y: number): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const perp = (x: number, y: number): [number, number] => [-y, x];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

function distinctPoints(points: readonly PointM[]): PointM[] {
  const out: PointM[] = [];
  for (const p of points) if (!out.length || Math.hypot(p[0] - out.at(-1)![0], p[1] - out.at(-1)![1]) > 1e-6) out.push(p);
  return out;
}
/** Liang-Barsky clip of one segment against an axis-aligned box. */
function clipSegment(a: PointM, b: PointM, box: readonly [number, number, number, number]): [PointM, PointM] | null {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const edges: readonly [number, number][] = [[-dx, a[0] - box[0]], [dx, box[2] - a[0]], [-dy, a[1] - box[1]], [dy, box[3] - a[1]]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t0 > t1 ? null : [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
/** Split a polyline into the pieces that lie inside `box`, so a zone whose
 * line wanders far past the hole (it need only have one point near it to be
 * attached, `contextZonesForHole`) does not drag distant geometry in. */
function clipPolyline(points: readonly PointM[], box: readonly [number, number, number, number]): PointM[][] {
  const pieces: PointM[][] = [];
  let current: PointM[] = [];
  const near = (a: PointM, b: PointM) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
  for (let i = 0; i < points.length - 1; i++) {
    const clipped = clipSegment(points[i]!, points[i + 1]!, box);
    if (!clipped) { if (current.length > 1) pieces.push(current); current = []; continue; }
    const [ca, cb] = clipped;
    if (!current.length || !near(current.at(-1)!, ca)) { if (current.length > 1) pieces.push(current); current = [ca]; }
    current.push(cb);
  }
  if (current.length > 1) pieces.push(current);
  return pieces;
}

/** Uniform-grid triangle locator over a display mesh: bbox-bucketed
 * triangles, barycentric height, ring search outward from the query cell
 * (capped — this answers "which nearby triangle", not "any triangle in the
 * mesh"). Falls back to the metric grid, then the nearest vertex. */
class SurfaceLocator {
  private readonly cellM: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly cells = new Map<number, number[]>();
  readonly boundsM: [number, number, number, number];
  private fallbackCount = 0;
  constructor(private readonly mesh: DisplayMesh, private readonly grid: MetricTerrainGrid | undefined) {
    const p = mesh.positions;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let v = 0; v < mesh.vertexCount; v++) { const x = p[v * 3]!, y = p[v * 3 + 1]!; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    this.boundsM = [minX, minY, maxX, maxY];
    const area = Math.max(1e-6, (maxX - minX) * (maxY - minY));
    this.cellM = Math.max(2, Math.sqrt((4 * area) / Math.max(1, mesh.triangleCount)));
    this.columns = Math.max(1, Math.ceil((maxX - minX) / this.cellM) + 1);
    this.rows = Math.max(1, Math.ceil((maxY - minY) / this.cellM) + 1);
    for (let t = 0; t < mesh.triangleCount; t++) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < 3; k++) { const v = mesh.indices[t * 3 + k]!, x = p[v * 3]!, y = p[v * 3 + 1]!; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const c0 = this.column(x0), c1 = this.column(x1), r0 = this.row(y0), r1 = this.row(y1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const key = r * this.columns + c, list = this.cells.get(key); if (list) list.push(t); else this.cells.set(key, [t]); }
    }
  }
  private column(x: number): number { return Math.min(this.columns - 1, Math.max(0, Math.floor((x - this.boundsM[0]) / this.cellM))); }
  private row(y: number): number { return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.boundsM[1]) / this.cellM))); }
  private barycentricHeight(x: number, y: number, t: number): number | null {
    const p = this.mesh.positions, ia = this.mesh.indices[t * 3]!, ib = this.mesh.indices[t * 3 + 1]!, ic = this.mesh.indices[t * 3 + 2]!;
    const ax = p[ia * 3]!, ay = p[ia * 3 + 1]!, az = p[ia * 3 + 2]!, bx = p[ib * 3]!, by = p[ib * 3 + 1]!, bz = p[ib * 3 + 2]!, cx = p[ic * 3]!, cy = p[ic * 3 + 1]!, cz = p[ic * 3 + 2]!;
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) return null;
    const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, wc = 1 - wa - wb, eps = 1e-4;
    return wa >= -eps && wb >= -eps && wc >= -eps ? wa * az + wb * bz + wc * cz : null;
  }
  height(x: number, y: number): number {
    const c = this.column(x), r = this.row(y), maxRing = 8;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= this.rows || cc >= this.columns) continue;
        for (const t of this.cells.get(rr * this.columns + cc) ?? []) { const h = this.barycentricHeight(x, y, t); if (h != null) return h; }
      }
    }
    this.fallbackCount++;
    if (this.grid) { const h = sampleMetricTerrain(this.grid, [x, y]); if (h != null) return h; }
    let best = Infinity, bestZ = 0;
    const p = this.mesh.positions;
    for (let v = 0; v < this.mesh.vertexCount; v++) { const d = Math.hypot(p[v * 3]! - x, p[v * 3 + 1]! - y); if (d < best) { best = d; bestZ = p[v * 3 + 2]!; } }
    return bestZ;
  }
  get surfaceFallbacks(): number { return this.fallbackCount; }
}

/** Vertex indices of one cross-section: outer-left, inner-left, inner-right, outer-right. */
type Cols = readonly [number, number, number, number];
interface Strip { xy: number[]; s: number[]; t: number[]; edge: number[]; indices: number[]; dropped: number }
const MIN_SIGNED_AREA2_M2 = 2e-4; // 2x the 1e-4 m^2 floor `assertPathRibbon` gates on (signed area x2 = the cross product below).

/** Resample one clipped centreline piece into a batched cross-section strip
 * (module doc: mitre <= bevelTurnRad, one-sided bevel above it). XY only;
 * height is sampled by the caller once every zone's strips are assembled. */
function buildPolylineStrip(points: readonly PointM[], halfWidthM: number, opts: PathRibbonOptions, debugZoneId = ''): Strip {
  const DEBUG = process.env.PATH_RIBBON_DEBUG === '1';
  const feather = opts.featherM, outer = halfWidthM + feather;
  const xy: number[] = [], sArr: number[] = [], tArr: number[] = [], edgeArr: number[] = [], indices: number[] = [];
  let dropped = 0;
  const push = (x: number, y: number, cx: number, cy: number, lateral: number, s: number): number => {
    xy.push(x + cx * lateral, y + cy * lateral); sArr.push(s); tArr.push(lateral / outer); edgeArr.push(clamp01((Math.abs(lateral) - halfWidthM) / feather));
    return xy.length / 2 - 1;
  };
  const area2 = (a: number, b: number, c: number): number => {
    const ax = xy[a * 2]!, ay = xy[a * 2 + 1]!, bx = xy[b * 2]!, by = xy[b * 2 + 1]!, cx = xy[c * 2]!, cy = xy[c * 2 + 1]!;
    return (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  };
  // Emitted triangles are always meant to be positive (module doc); this is
  // the one hard gate, not a mask — real problems show up as `dropped`.
  const dbg = (tag: string, a: number, b: number, c: number): void => {
    if (!DEBUG) return;
    console.error('DROP', debugZoneId, tag, 'area2=', area2(a, b, c), [xy[a * 2], xy[a * 2 + 1]], [xy[b * 2], xy[b * 2 + 1]], [xy[c * 2], xy[c * 2 + 1]]);
  };
  const emit = (a: number, b: number, c: number, tag = ''): void => { if (area2(a, b, c) > MIN_SIGNED_AREA2_M2) indices.push(a, b, c); else { dropped++; dbg(tag, a, b, c); } };
  // The bevel's middle triangle (shared concave point + the two differing
  // inner points) is the one place either winding is legitimately correct
  // depending on turn direction (module doc); try both before counting it lost.
  const emitEither = (a: number, b: number, c: number, tag = ''): void => {
    if (area2(a, b, c) > MIN_SIGNED_AREA2_M2) indices.push(a, b, c); else if (area2(a, c, b) > MIN_SIGNED_AREA2_M2) indices.push(a, c, b); else { dropped++; dbg(tag, a, b, c); }
  };
  const mitreRow = (s: number, x: number, y: number, cx: number, cy: number): Cols => [push(x, y, cx, cy, outer, s), push(x, y, cx, cy, halfWidthM, s), push(x, y, cx, cy, -halfWidthM, s), push(x, y, cx, cy, -outer, s)];
  const connect = (a: Cols, b: Cols, tag = 'connect'): void => { for (let k = 0; k < 3; k++) { emit(a[k]!, a[k + 1]!, b[k + 1]!, tag); emit(a[k]!, b[k + 1]!, b[k]!, tag); } };

  const tangents: [number, number][] = [];
  for (let i = 1; i < points.length; i++) tangents.push(norm(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = cumulative.at(-1)!;
  // Mandatory rows: both ends, plus any interior vertex turning past turnSampleRad.
  const breakVertex = new Map<number, number>([[0, 0], [total, points.length - 1]]);
  for (let i = 1; i < points.length - 1; i++) {
    const [inX, inY] = tangents[i - 1]!, [outX, outY] = tangents[i]!;
    if (Math.acos(Math.min(1, Math.max(-1, inX * outX + inY * outY))) > opts.turnSampleRad) breakVertex.set(cumulative[i]!, i);
  }
  const breaks = Array.from(breakVertex.keys()).sort((a, b) => a - b);
  const sampleS: number[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i]!, b = breaks[i + 1]!, n = Math.max(1, Math.ceil((b - a) / opts.maxSegmentM));
    for (let k = 0; k < n; k++) sampleS.push(a + ((b - a) * k) / n);
  }
  sampleS.push(total);
  const positionAt = (s: number): PointM => {
    let i = 1; while (i < cumulative.length - 1 && cumulative[i]! < s) i++;
    const s0 = cumulative[i - 1]!, s1 = cumulative[i]!, f = s1 > s0 ? (s - s0) / (s1 - s0) : 0, a = points[i - 1]!, b = points[i]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const tangentAt = (s: number): [number, number] => { let i = 1; while (i < cumulative.length - 1 && cumulative[i]! < s) i++; return tangents[i - 1]!; };

  let previous: Cols | null = null;
  for (const s of sampleS) {
    const [x, y] = positionAt(s);
    const vertex = breakVertex.get(s);
    if (vertex == null || vertex === 0 || vertex === points.length - 1) {
      const [cx, cy] = perp(...tangentAt(s));
      const row = mitreRow(s, x, y, cx, cy);
      if (previous) connect(previous, row, 'uniform');
      previous = row;
      continue;
    }
    const [inX, inY] = tangents[vertex - 1]!, [outX, outY] = tangents[vertex]!;
    const [cInX, cInY] = perp(inX, inY), [cOutX, cOutY] = perp(outX, outY);
    const turn = Math.acos(Math.min(1, Math.max(-1, inX * outX + inY * outY)));
    if (turn <= opts.bevelTurnRad) {
      const [bx, by] = norm(cInX + cOutX, cInY + cOutY), scale = 1 / Math.cos(turn / 2);
      const row = mitreRow(s, x, y, bx * scale, by * scale);
      if (previous) connect(previous, row, 'mitre');
      previous = row;
      continue;
    }
    // Bevel: both rows are plain, independent mitreRow()s — rowIn uses cIn
    // (the same cross vector the straight rows before it already use, so
    // that boundary is a trivial straight continuation) and rowOut uses
    // cOut likewise for what follows. Only the rowIn<->rowOut pivot at the
    // shared corner point needs special handling: the concave rail's own
    // quad nets zero signed area (its two rows converge, not diverge) and
    // is skipped outright rather than emitted-then-dropped; the convex
    // rail's quad is a normal 2-triangle facet; the middle quad is a
    // degenerate (bowtie) quadrilateral that contributes exactly one real
    // triangle, found by trying both of its diagonals (verified empirically
    // against straight/90-degree/hairpin synthetic cases — see the test).
    const leftIsConcave = cInX * cOutY - cInY * cOutX > 0;
    const rowIn = mitreRow(s, x, y, cInX, cInY), rowOut = mitreRow(s, x, y, cOutX, cOutY);
    if (previous) connect(previous, rowIn, 'pre-bevel');
    if (leftIsConcave) { emitEither(rowIn[1]!, rowIn[2]!, rowOut[2]!, 'bevel-mid'); emit(rowIn[2]!, rowIn[3]!, rowOut[3]!, 'bevel-convex-a'); emit(rowIn[2]!, rowOut[3]!, rowOut[2]!, 'bevel-convex-b'); }
    else { emit(rowIn[0]!, rowIn[1]!, rowOut[1]!, 'bevel-convex-a'); emit(rowIn[0]!, rowOut[1]!, rowOut[0]!, 'bevel-convex-b'); emitEither(rowIn[2]!, rowIn[1]!, rowOut[1]!, 'bevel-mid'); }
    previous = rowOut;
  }
  return { xy, s: sArr, t: tArr, edge: edgeArr, indices, dropped };
}

/** Every mobility zone of the hole batched into one ribbon geometry, or
 * null when the hole carries none. Zones with fewer than 2 usable points
 * (after de-duplication and clipping to `contextBoundsM`) are skipped. */
export function compilePathRibbon(scene: HoleScene, mesh: TerrainMesh, base: DisplayMesh, options: Partial<PathRibbonOptions> = {}): PathRibbon | null {
  const opts: PathRibbonOptions = { ...PATH_RIBBON_OPTIONS, ...options };
  const zones = (scene.contextZones ?? []).filter(z => pathLines([z]).length).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!zones.length) return null;
  const locator = new SurfaceLocator(base, mesh.metricGrid);
  const box = mesh.renderProfile?.contextBoundsM ?? locator.boundsM;
  const positions: number[] = [], uv: number[] = [], edge: number[] = [], indices: number[] = [], runs: PathRibbonRun[] = [];
  let dropped = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const zone of zones) {
    const startTriangle = indices.length / 3;
    for (const line of pathLines([zone])) {
      const halfWidthM = line.widthM / 2;
      for (const piece of clipPolyline(distinctPoints(line.points), box)) {
        if (piece.length < 2) continue;
        const strip = buildPolylineStrip(piece, halfWidthM, opts, zone.id);
        if (!strip.indices.length) { dropped += strip.dropped; continue; }
        const vertexBase = positions.length / 3;
        for (let v = 0; v < strip.xy.length / 2; v++) {
          const x = strip.xy[v * 2]!, y = strip.xy[v * 2 + 1]!, z = locator.height(x, y) + opts.visualLiftM;
          positions.push(x, y, z); uv.push(strip.s[v]!, strip.t[v]!); edge.push(strip.edge[v]!);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        for (const i of strip.indices) indices.push(i + vertexBase);
        dropped += strip.dropped;
      }
    }
    const count = indices.length / 3 - startTriangle;
    if (count > 0) runs.push({ zoneId: zone.id, start: startTriangle, count });
  }
  if (!indices.length) return null;
  return {
    positions: Float32Array.from(positions), indices: Uint32Array.from(indices), uv: Float32Array.from(uv), edge: Float32Array.from(edge),
    runs, visualLiftM: opts.visualLiftM, triangleCount: indices.length / 3, vertexCount: positions.length / 3, boundsM: [minX, minY, maxX, maxY],
    surfaceFallbacks: locator.surfaceFallbacks, droppedTriangles: dropped,
  };
}

/** §113-style gates: finite buffers, indices in range, no degenerate
 * triangle, no flipped winding within a run, and the runs partition every
 * triangle exactly once. */
export function assertPathRibbon(ribbon: PathRibbon): void {
  const { positions, indices, uv, edge, runs, triangleCount, vertexCount } = ribbon;
  const problems: string[] = [];
  if (positions.length !== vertexCount * 3 || uv.length !== vertexCount * 2 || edge.length !== vertexCount || indices.length !== triangleCount * 3) problems.push('buffer length mismatch');
  for (const buf of [positions, uv, edge]) for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) { problems.push('non-finite value'); break; }
  for (let i = 0; i < indices.length; i++) if (indices[i]! >= vertexCount) { problems.push('index out of range'); break; }
  // The normal's z-component (signed — this is what "shares a sign" means)
  // and its full 3D magnitude (for the area gate) are different things: a
  // triangle that is merely steep still has a small |nz| but a normal
  // 3D area, so the degenerate gate must use the magnitude, not nz alone.
  const normal = (t: number): { nx: number; ny: number; nz: number } => {
    const a = indices[t * 3]!, b = indices[t * 3 + 1]!, c = indices[t * 3 + 2]!;
    const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!;
    const bx = positions[b * 3]!, by = positions[b * 3 + 1]!, bz = positions[b * 3 + 2]!;
    const cx = positions[c * 3]!, cy = positions[c * 3 + 1]!, cz = positions[c * 3 + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    return { nx: uy * vz - uz * vy, ny: uz * vx - ux * vz, nz: ux * vy - uy * vx };
  };
  for (let t = 0; t < triangleCount; t++) { const { nx, ny, nz } = normal(t); if (!(Math.hypot(nx, ny, nz) / 2 > 1e-4)) { problems.push(`degenerate triangle ${t}`); break; } }
  for (const run of [...runs].sort((a, b) => a.start - b.start)) {
    let sign = 0;
    for (let t = run.start; t < run.start + run.count; t++) {
      const s = Math.sign(normal(t).nz);
      if (s === 0) continue;
      if (sign === 0) sign = s; else if (s !== sign) { problems.push(`${run.zoneId}: flipped winding`); break; }
    }
  }
  let covered = 0;
  for (const run of [...runs].sort((a, b) => a.start - b.start)) { if (run.start !== covered) problems.push('runs do not cover all indices'); covered = run.start + run.count; }
  if (covered !== triangleCount) problems.push('runs do not cover all indices');
  if (problems.length) throw new Error(`Path ribbon failed: ${Array.from(new Set(problems)).slice(0, 8).join('; ')}`);
}
