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
 * (`droppedTriangles`) rather than trusting the construction to hide a
 * fold: single-corner joins (mitre and bevel alike) are proven fold-free
 * and the synthetic tests assert `droppedTriangles === 0` for them. Every
 * straight-run quad between two rows also gets a second chance at its
 * *other* diagonal before being dropped (only one diagonal of a simple
 * concave quad lies inside it; trying both is what turns a spurious drop
 * into a correct pair of triangles). A residual can still arise when
 * several individually-modest turns (each <= `bevelTurnRad`) chain
 * together, on a wide cross-section, faster than the arc-length between
 * them allows — the offset's concave side then overtakes the previous
 * row and the quad self-intersects (a true bowtie: both diagonals fail).
 * No per-corner join or local retriangulation can resolve that; those
 * triangles are dropped rather than emitted inverted, which is what keeps
 * `assertPathRibbon`'s winding check meaningful instead of vacuous.
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
  /** Longest arc-length step the adaptive resampler may use on a straight,
   * flat run — an upper bound it only reaches once every finer candidate
   * step already passes `chordToleranceM`/`heightToleranceM` (§11 budget
   * follow-up: curvature-adaptive resampling, Task 14). */
  maxSegmentM: number;
  /** Shortest arc-length step the adaptive resampler will refine down to,
   * and the spacing its probe points use when testing a candidate step
   * against the tolerances below. This is "the current 1 m result" those
   * tolerances are defined relative to, so it stays 1 by default. */
  minSegmentM: number;
  /** Max planar drift, in metres, a candidate step's straight row-to-row
   * chord may have from the true centreline (probed every `minSegmentM`)
   * before the resampler must halve the step and try again. */
  chordToleranceM: number;
  /** Max drift, in metres, a candidate step's linear inter-row height
   * interpolation may have from the sampled surface (also probed every
   * `minSegmentM`) before the resampler must halve the step and try again. */
  heightToleranceM: number;
  /** A source vertex turning by more than this always gets its own row. */
  turnSampleRad: number;
  /** Above this turn a corner bevels instead of mitring. */
  bevelTurnRad: number;
  /** Feather strip width beyond the path edge, each side. */
  featherM: number;
  /** Render-only height added above the sampled surface (constraint 5). */
  visualLiftM: number;
  /** §11 "path/water hero edges" per-hole ribbon triangle budget:
   * `assertPathRibbon`'s default hard ceiling (its own options can raise it). */
  triangleBudget: number;
}
export const PATH_RIBBON_OPTIONS: Readonly<PathRibbonOptions> = Object.freeze({
  maxSegmentM: 32, minSegmentM: 1, chordToleranceM: 0.05, heightToleranceM: 0.03,
  turnSampleRad: (10 * Math.PI) / 180, bevelTurnRad: (60 * Math.PI) / 180, featherM: 0.25, visualLiftM: 0.015,
  triangleBudget: 5000,
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
  /** Triangles a defensive area/winding check rejected: 0 for any single
   * corner join (synthetic tests assert this); a small positive count can
   * still arise from chained turns on a wide cross-section (see module doc). */
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
  private locate(x: number, y: number): { z: number; fellBack: boolean } {
    const c = this.column(x), r = this.row(y), maxRing = 8;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= this.rows || cc >= this.columns) continue;
        for (const t of this.cells.get(rr * this.columns + cc) ?? []) { const h = this.barycentricHeight(x, y, t); if (h != null) return { z: h, fellBack: false }; }
      }
    }
    if (this.grid) { const h = sampleMetricTerrain(this.grid, [x, y]); if (h != null) return { z: h, fellBack: true }; }
    let best = Infinity, bestZ = 0;
    const p = this.mesh.positions;
    for (let v = 0; v < this.mesh.vertexCount; v++) { const d = Math.hypot(p[v * 3]! - x, p[v * 3 + 1]! - y); if (d < best) { best = d; bestZ = p[v * 3 + 2]!; } }
    return { z: bestZ, fellBack: true };
  }
  height(x: number, y: number): number {
    const { z, fellBack } = this.locate(x, y);
    if (fellBack) this.fallbackCount++;
    return z;
  }
  /** Same lookup as `height`, for the adaptive resampler to probe candidate
   * rows that may never be emitted — must not perturb `surfaceFallbacks`,
   * which counts only actual output vertices, and must expose `fellBack` so
   * a probe outside the triangulated footprint can be treated as untrusted
   * rather than silently compared against the display surface. */
  peek(x: number, y: number): { z: number; fellBack: boolean } { return this.locate(x, y); }
  get surfaceFallbacks(): number { return this.fallbackCount; }
}

/** Vertex indices of one cross-section: outer-left, inner-left, inner-right, outer-right. */
type Cols = readonly [number, number, number, number];
interface Strip { xy: number[]; s: number[]; t: number[]; edge: number[]; indices: number[]; dropped: number }
const MIN_SIGNED_AREA2_M2 = 2e-4; // 2x the 1e-4 m^2 floor `assertPathRibbon` gates on (signed area x2 = the cross product below).

/** Resample one clipped centreline piece into a batched cross-section strip
 * (module doc: mitre <= bevelTurnRad, one-sided bevel above it). XY only;
 * height is sampled by the caller once every zone's strips are assembled. */
function buildPolylineStrip(points: readonly PointM[], halfWidthM: number, opts: PathRibbonOptions, heightAt: (x: number, y: number) => { z: number; fellBack: boolean }): Strip {
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
  // The bevel's middle triangle (shared concave point + the two differing
  // inner points) is the one place either winding is legitimately correct
  // depending on turn direction (module doc); try both before counting it lost.
  const emitEither = (a: number, b: number, c: number): void => {
    if (area2(a, b, c) > MIN_SIGNED_AREA2_M2) indices.push(a, b, c); else if (area2(a, c, b) > MIN_SIGNED_AREA2_M2) indices.push(a, c, b); else dropped++;
  };
  const mitreRow = (s: number, x: number, y: number, cx: number, cy: number): Cols => [push(x, y, cx, cy, outer, s), push(x, y, cx, cy, halfWidthM, s), push(x, y, cx, cy, -halfWidthM, s), push(x, y, cx, cy, -outer, s)];
  // A run of individually-modest turns (each well under bevelTurnRad) can still
  // chain together, on a wide cross-section, faster than the arc-length between
  // them — the offset's concave side then advances past where the previous row
  // already put it, and the quad a0,a1,b1,b0 (boundary order) turns concave at
  // one of its corners. The fixed diagonal (a0,b1) used to split every quad
  // still works for the ordinary case (checked first, so nothing changes when
  // it already holds) but produces one negative-area triangle there; the
  // quad's *other* diagonal (a1,b0) is then the one that lies inside it and
  // splits it correctly (a fact of simple, non-self-intersecting polygons).
  // Only a true self-crossing (bowtie) quad — the offset radius exceeding the
  // centreline's local curvature radius over several corners at once, seen on
  // real OSM-digitised roads/paths — fails both and is still dropped.
  const quad = (a0: number, a1: number, b0: number, b1: number): void => {
    if (area2(a0, a1, b1) > MIN_SIGNED_AREA2_M2 && area2(a0, b1, b0) > MIN_SIGNED_AREA2_M2) { indices.push(a0, a1, b1, a0, b1, b0); return; }
    if (area2(a0, a1, b0) > MIN_SIGNED_AREA2_M2 && area2(a1, b1, b0) > MIN_SIGNED_AREA2_M2) { indices.push(a0, a1, b0, a1, b1, b0); return; }
    dropped += 2;
  };
  const connect = (a: Cols, b: Cols): void => { for (let k = 0; k < 3; k++) quad(a[k]!, a[k + 1]!, b[k]!, b[k + 1]!); };

  const tangents: [number, number][] = [];
  for (let i = 1; i < points.length; i++) tangents.push(norm(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = cumulative.at(-1)!;
  const positionAt = (s: number): PointM => {
    let i = 1; while (i < cumulative.length - 1 && cumulative[i]! < s) i++;
    const s0 = cumulative[i - 1]!, s1 = cumulative[i]!, f = s1 > s0 ? (s - s0) / (s1 - s0) : 0, a = points[i - 1]!, b = points[i]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const tangentAt = (s: number): [number, number] => { let i = 1; while (i < cumulative.length - 1 && cumulative[i]! < s) i++; return tangents[i - 1]!; };
  // Mandatory rows: both ends, plus any interior vertex turning past turnSampleRad.
  const breakVertex = new Map<number, number>([[0, 0], [total, points.length - 1]]);
  for (let i = 1; i < points.length - 1; i++) {
    const [inX, inY] = tangents[i - 1]!, [outX, outY] = tangents[i]!;
    if (Math.acos(Math.min(1, Math.max(-1, inX * outX + inY * outY))) > opts.turnSampleRad) breakVertex.set(cumulative[i]!, i);
  }
  const breaks = Array.from(breakVertex.keys()).sort((a, b) => a - b);

  // Curvature-adaptive row spacing between two mandatory breaks (§11 budget
  // follow-up, Task 14): a greedy forward walk, not a uniform subdivision —
  // an interval-wide uniform step means one tight spot anywhere in a long
  // interval halves *every* row in it, which measured out to throwing away
  // most of the budget for no fidelity gain (raising maxSegmentM alone
  // plateaued around 14k triangles on hole 7 no matter how high, because
  // the interval-uniform rule re-refined stretches that were already fine).
  // From the last accepted row at `s`, `stepFrom` finds the largest next row
  // `s' <= min(s + maxSegmentM, b)` whose straight chord and linear height
  // interpolation still track the true centreline/surface within
  // chordToleranceM/heightToleranceM — probed at every original vertex in
  // range (the only place the piecewise-linear centreline can actually bend
  // between two mandatory breaks) and every minSegmentM along it (matching
  // "the current 1 m result" those tolerances are defined against) — or
  // `s + minSegmentM` unconditionally, the floor below which the resampler
  // defers to that same reference rather than second-guessing it. A
  // dead-straight, flat run walks in maxSegmentM hops; a bend or a slope
  // change shortens the hop on its own, same as the historical fixed step
  // did everywhere, but only exactly where it is needed.
  const EPS_M = 1e-9;
  const probeArcLengths = (s0: number, s1: number, interior: readonly number[]): number[] => {
    const probes: number[] = [];
    for (const c of interior) if (c > s0 + EPS_M && c < s1 - EPS_M) probes.push(c);
    const steps = Math.max(1, Math.round((s1 - s0) / opts.minSegmentM));
    for (let k = 1; k < steps; k++) probes.push(s0 + ((s1 - s0) * k) / steps);
    return probes;
  };
  // A candidate row's cross-section perpendicular rotates with the local
  // tangent (`tangentAt`, same as every ordinary emitted row — mitre/bevel
  // corners are mandatory breaks and never fall inside a candidate span),
  // so a gradual bend the centreline's own chord deviation barely notices
  // can still swing the *outer* rail — the widest, most visible edge —
  // further than chordToleranceM: a small angle times the outer radius, not
  // times the much smaller sagitta a centreline-only check would see. The
  // two outer rails bound every inner column's *rotation* term (a smaller
  // offset on the same rotating perpendicular swings less), but not its
  // height: `±halfWidthM` sits at its own (x, y), and cross-sloped terrain
  // can vary differently there than at `±outer` — so all four emitted
  // columns are checked, not just the widest two.
  const railAt = (s: number, lateral: number): PointM => {
    const [x, y] = positionAt(s), [cx, cy] = perp(...tangentAt(s));
    return [x + cx * lateral, y + cy * lateral];
  };
  const railLaterals: readonly number[] = [0, outer, -outer, halfWidthM, -halfWidthM];
  // A probe that fell back to the metric grid or nearest vertex (outside the
  // triangulated footprint) is not comparable to the display-surface height
  // the tolerance is meant to bound — a different source can legitimately
  // differ by far more than heightToleranceM without the surface itself
  // changing quickly. Treat any fallback as an automatic fail so the budget
  // is never bought with that noise; it only ever forces *more* refinement,
  // matching what `compilePathRibbon` already does at 1 m today.
  const segmentOk = (s0: number, s1: number, interior: readonly number[]): boolean => {
    for (const lateral of railLaterals) {
      const p0 = railAt(s0, lateral), p1 = railAt(s1, lateral);
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len2 = Math.max(1e-12, dx * dx + dy * dy);
      const height0 = heightAt(p0[0], p0[1]), height1 = heightAt(p1[0], p1[1]);
      if (height0.fellBack || height1.fellBack) return false;
      const h0 = height0.z, h1 = height1.z;
      for (const s of probeArcLengths(s0, s1, interior)) {
        const [px, py] = railAt(s, lateral);
        const t = ((px - p0[0]) * dx + (py - p0[1]) * dy) / len2;
        if (Math.hypot(px - (p0[0] + t * dx), py - (p0[1] + t * dy)) > opts.chordToleranceM) return false;
        const probeHeight = heightAt(px, py);
        if (probeHeight.fellBack || Math.abs(probeHeight.z - (h0 + (h1 - h0) * t)) > opts.heightToleranceM) return false;
      }
    }
    return true;
  };
  // Largest next row from `s`: exponential probing outward (minSegmentM,
  // 2x, 4x, ...) to bracket the failure point cheaply, then a fixed 6-step
  // bisection between the last accepted probe and the first failed one — a
  // bounded, deterministic search, not a fixed-precision one. The result is
  // then snapped down to a whole minSegmentM multiple from `s` (re-verified,
  // falling back to the last exponentially-probed point if the snap itself
  // somehow fails) so the row grid stays legible and stable against tiny
  // numerical jitter in the surface sample, rather than landing on an
  // arbitrary bisected fraction of a metre.
  const stepFrom = (s: number, b: number, interior: readonly number[]): number => {
    const cap = Math.min(s + opts.maxSegmentM, b);
    if (cap - s <= opts.minSegmentM + EPS_M) return cap;
    let lastOk = s + opts.minSegmentM, mult = 2, probe = Math.min(s + opts.minSegmentM * mult, cap);
    for (;;) {
      if (!segmentOk(s, probe, interior)) break;
      lastOk = probe;
      if (probe >= cap - EPS_M) return cap;
      mult *= 2;
      probe = Math.min(s + opts.minSegmentM * mult, cap);
    }
    let lo = lastOk, hi = probe;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (segmentOk(s, mid, interior)) lo = mid; else hi = mid;
    }
    const snappedSteps = Math.max(1, Math.floor((lo - s + EPS_M) / opts.minSegmentM));
    const snapped = Math.min(cap, s + snappedSteps * opts.minSegmentM);
    return segmentOk(s, snapped, interior) ? snapped : lastOk;
  };
  const sampleS: number[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i]!, b = breaks[i + 1]!, ia = breakVertex.get(a)!, ib = breakVertex.get(b)!;
    const interior = cumulative.slice(ia + 1, ib);
    for (let s = a; s < b - EPS_M; s = stepFrom(s, b, interior)) sampleS.push(s);
  }
  sampleS.push(total);

  let previous: Cols | null = null;
  for (const s of sampleS) {
    const [x, y] = positionAt(s);
    const vertex = breakVertex.get(s);
    if (vertex == null || vertex === 0 || vertex === points.length - 1) {
      const [cx, cy] = perp(...tangentAt(s));
      const row = mitreRow(s, x, y, cx, cy);
      if (previous) connect(previous, row);
      previous = row;
      continue;
    }
    const [inX, inY] = tangents[vertex - 1]!, [outX, outY] = tangents[vertex]!;
    const [cInX, cInY] = perp(inX, inY), [cOutX, cOutY] = perp(outX, outY);
    const turn = Math.acos(Math.min(1, Math.max(-1, inX * outX + inY * outY)));
    if (turn <= opts.bevelTurnRad) {
      const [bx, by] = norm(cInX + cOutX, cInY + cOutY), scale = 1 / Math.cos(turn / 2);
      const row = mitreRow(s, x, y, bx * scale, by * scale);
      if (previous) connect(previous, row);
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
    if (previous) connect(previous, rowIn);
    if (leftIsConcave) { emitEither(rowIn[1]!, rowIn[2]!, rowOut[2]!); quad(rowIn[2]!, rowIn[3]!, rowOut[2]!, rowOut[3]!); }
    else { quad(rowIn[0]!, rowIn[1]!, rowOut[0]!, rowOut[1]!); emitEither(rowIn[2]!, rowIn[1]!, rowOut[1]!); }
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
        const strip = buildPolylineStrip(piece, halfWidthM, opts, (x, y) => locator.peek(x, y));
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

export interface PathRibbonBudgetReport {
  triangleCount: number;
  /** §11 "path/water hero edges" hard ceiling this ribbon was checked against. */
  triangleBudget: number;
  /** Below the hard ceiling but past this, `assertPathRibbon` still passes — it only sets `warn`. */
  warnBudget: number;
  withinBudget: boolean;
  warn: boolean;
}

/** §113-style gates: finite buffers, indices in range, no degenerate
 * triangle, no flipped winding within a run, and the runs partition every
 * triangle exactly once — plus the §11 "path/water hero edges" triangle
 * budget (Task 14 follow-up): a hard error above `triangleBudget` (default
 * `PATH_RIBBON_OPTIONS.triangleBudget`, 5 000 — pass a larger one to raise
 * it deliberately) and a non-throwing `warn` in the returned report once
 * the count passes 80% of whichever budget applies, so a hole trending
 * toward the ceiling shows up before it actually crosses it. */
export function assertPathRibbon(ribbon: PathRibbon, options: Partial<Pick<PathRibbonOptions, 'triangleBudget'>> = {}): PathRibbonBudgetReport {
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
  const triangleBudget = options.triangleBudget ?? PATH_RIBBON_OPTIONS.triangleBudget;
  const warnBudget = Math.round(triangleBudget * 0.8);
  if (triangleCount > triangleBudget) problems.push(`${triangleCount} triangles exceed the ${triangleBudget}-triangle path-ribbon budget (§11)`);
  if (problems.length) throw new Error(`Path ribbon failed: ${Array.from(new Set(problems)).slice(0, 8).join('; ')}`);
  return { triangleCount, triangleBudget, warnBudget, withinBudget: triangleCount <= triangleBudget, warn: triangleCount > warnBudget };
}
