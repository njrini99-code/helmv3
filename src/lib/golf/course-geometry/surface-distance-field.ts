/** Meridian V2 semantic boundary signed-distance fields (V2 plan §18–19,
 * §36, §46; feeding §32, §46, §80).
 *
 * A signed distance field rasterizes "how far is this texel from the nearest
 * green / bunker / fairway / path / water boundary" over a frame, so the
 * ground shader can blend fringe, first cut, sand rim or path shoulder at a
 * stable width whatever the triangle size (§46: no painted polygon edges).
 * Convention (§36): POSITIVE inside the surface, NEGATIVE outside, zero on
 * the boundary. Metres, texel centres, row 0 at the frame's south edge
 * (y0) and rows increasing northward — the same orientation a Three
 * DataTexture reads with `flipY` false, so Task 10 packs rows straight.
 *
 * Inputs are canonical rings and context centrelines, read only. Polygon
 * layers (green, bunker, fairway, water) take rings exactly as the package
 * carries them; a line layer (paths) is the union of round-capped capsules
 * of each line's width, and its signed distance is `halfWidth − distance to
 * the centreline` per line, combined with max. A union's interior distance
 * where two shapes overlap is the nearest single boundary, which can be
 * shorter than the true distance to the union's boundary; the shader only
 * spends the first few metres of any field, so that is harmless and noted.
 *
 * Exact, not flooded: every texel's distance is the true minimum over the
 * layer's segments. A rasterized pass first brackets it — the centrelines
 * are sampled at half-texel steps onto a grid padded by the reach, and an
 * exact Euclidean distance transform to those marked texels puts the true
 * centreline distance within a texel diagonal — so a texel with nothing
 * in reach is settled without a search, and every other texel scans only
 * the bucket-grid cells touching its thin annulus (coarser cells once the
 * annulus is wide, empty runs of cells skipped, the previous texel's own
 * segment as the starting bound, a bounding-box and squared-distance
 * rejection before each exact distance) for the exact minimum; the
 * transform itself sweeps each grid row's marks past the frame's columns
 * and runs the 1D transform only down the frame's own columns. Same
 * values as the plain outward ring search this replaced (bit-identical
 * over every layer of Peek'n Peak Upper holes 3, 7, 8 and 18 at 0.2–0.75 m
 * texels; `__tests__` brute-forces polygons and mixed-width lines at every
 * texel), at roughly a twentieth of the time, which is what the V2 world's
 * mount compile is made of (Meridian V2 Task 20). Distances beyond
 * `maxDistanceM` clamp (a texel with nothing in reach is −maxDistanceM).
 * `quantizeSignedDistance` packs to Uint16 with the boundary at exactly
 * 32768 (§108 sdfLayers), and the quantization step at the default 64 m
 * range is under 2 mm.
 *
 * Visual only (constraint 6): these fields blend albedo, roughness and
 * micro-normal; they never feed lie truth, distance, picking or analytics,
 * and canonical XY never moves (constraint 3). Deterministic (13). */
import type { LocalContextZone } from './context-layer';
import type { HoleScene, LocalFeature, PointM } from './types';

export interface FieldFrame { boundsM: readonly [number, number, number, number] }
export interface FieldResolution { width: number; height: number }
export interface SignedDistanceField {
  width: number;
  height: number;
  boundsM: [number, number, number, number];
  /** Texel size in metres, x and y. */
  texelM: [number, number];
  /** Signed metres per texel, row-major, row 0 at y0. */
  distanceM: Float32Array;
  maxDistanceM: number;
  basis: 'source_derived_visual';
}
/** One polygon: outer ring first, holes after (LocalFeature.parts[i]). */
export type PolygonRings = readonly (readonly PointM[])[];
export interface DistanceLine { points: readonly PointM[]; widthM: number }
export interface DistanceLayerInput { polygons?: readonly PolygonRings[]; lines?: readonly DistanceLine[] }

/** §108 packing range: ±64 m in Uint16 keeps the step under 2 mm. */
export const SDF_RANGE_M = 64;
export const SDF_ZERO = 32768;
/** The §18–19 layers, in packing order. `tee` (2026-09-17) is appended
 * after the original five so every earlier layer keeps its index (the
 * semantic channel's class ids, `GROUND_SDF_ATLAS_LAYERS`' channel picks):
 * the V2 rough hierarchy measures distance from the nearest *playing*
 * surface, and tee is the one playing kind V1's `PLAYING_KINDS` counts
 * that had no field yet. */
export const SURFACE_DISTANCE_LAYERS = ['green', 'bunker', 'fairway', 'path', 'water', 'tee'] as const;
export type SurfaceDistanceLayer = typeof SURFACE_DISTANCE_LAYERS[number];
/** Context classes that are path centrelines, with the width used when the zone carries none. */
export const PATH_CLASSES: Readonly<Record<string, number>> = Object.freeze({ cart_path: 2.4, service_path: 3, road: 6 });

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

interface SegmentEntry { a: PointM; b: PointM; halfWidth: number }
/** One uniform bucket level over the frame (expanded by the reach) holding
 * segment ids by bounding box (plus half width), packed CSR-style: the ids
 * of cell `k` are `ids[start[k] … start[k + 1])`. Most cells a far annulus
 * touches are empty, so the per-cell cost is what the search pays for. */
class BucketLevel {
  readonly columns: number; readonly rows: number;
  readonly start: Int32Array; readonly ids: Int32Array;
  constructor(readonly cellM: number, readonly x0: number, readonly y0: number, spanX: number, spanY: number, entries: readonly SegmentEntry[]) {
    this.columns = Math.max(1, Math.ceil(spanX / cellM)); this.rows = Math.max(1, Math.ceil(spanY / cellM));
    const cells = this.columns * this.rows, counts = new Int32Array(cells + 1);
    const boxes = new Int32Array(entries.length * 4);
    entries.forEach(({ a, b, halfWidth }, id) => {
      const c0 = this.column(Math.min(a[0], b[0]) - halfWidth), c1 = this.column(Math.max(a[0], b[0]) + halfWidth);
      const r0 = this.row(Math.min(a[1], b[1]) - halfWidth), r1 = this.row(Math.max(a[1], b[1]) + halfWidth);
      boxes[id * 4] = c0; boxes[id * 4 + 1] = c1; boxes[id * 4 + 2] = r0; boxes[id * 4 + 3] = r1;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) counts[r * this.columns + c + 1] = counts[r * this.columns + c + 1]! + 1;
    });
    for (let k = 0; k < cells; k++) counts[k + 1]! += counts[k]!;
    this.start = counts;
    const fill = counts.slice(0, cells), ids = new Int32Array(counts[cells]!);
    for (let id = 0; id < entries.length; id++) {
      const c0 = boxes[id * 4]!, c1 = boxes[id * 4 + 1]!, r0 = boxes[id * 4 + 2]!, r1 = boxes[id * 4 + 3]!;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ids[fill[r * this.columns + c]!++] = id;
    }
    this.ids = ids;
    // Most cells a far annulus touches hold nothing: `nextFilled[k]` is the
    // first cell at or after `k` in its row that holds a segment (or the
    // row's end), so a scan steps over the empty runs instead of testing
    // each cell.
    const nextFilled = new Int32Array(cells + 1);
    for (let r = 0; r < this.rows; r++) {
      let next = (r + 1) * this.columns;
      for (let c = this.columns - 1; c >= 0; c--) { const k = r * this.columns + c; if (counts[k + 1]! > counts[k]!) next = k; nextFilled[k] = next; }
    }
    this.nextFilled = nextFilled;
  }
  readonly nextFilled: Int32Array;
  column(x: number): number { return Math.max(0, Math.min(this.columns - 1, Math.floor((x - this.x0) / this.cellM))); }
  row(y: number): number { return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.y0) / this.cellM))); }
}
class SegmentIndex {
  private readonly segments: Float64Array; private readonly halfWidths: Float64Array;
  /** Per segment, for the cheap rejection before the exact distance: the
   * centreline's bounding box and the reciprocal of its squared length
   * (a multiplication where the exact path divides). */
  private readonly boxes: Float64Array; private readonly invLength2: Float64Array;
  readonly maxHalfWidth: number;
  /** Fine cells for near queries, coarse (4×) cells for far ones: a far annulus touches a quarter as many. */
  private readonly fine: BucketLevel; private readonly coarse: BucketLevel;
  readonly cellM: number;
  /** The segment the last query settled on (a valid upper bound for the
   * texel next door, which usually shares it). */
  lastId = -1;
  constructor(reachM: number, boundsM: readonly [number, number, number, number], texelM: number, entries: readonly SegmentEntry[]) {
    this.maxHalfWidth = entries.reduce((max, e) => Math.max(max, e.halfWidth), 0);
    this.cellM = Math.max(texelM * 2, 4);
    const x0 = boundsM[0] - reachM, y0 = boundsM[1] - reachM, spanX = boundsM[2] + reachM - x0, spanY = boundsM[3] + reachM - y0;
    this.fine = new BucketLevel(this.cellM, x0, y0, spanX, spanY, entries);
    this.coarse = new BucketLevel(this.cellM * 4, x0, y0, spanX, spanY, entries);
    this.segments = new Float64Array(entries.length * 4); this.halfWidths = new Float64Array(entries.length);
    this.boxes = new Float64Array(entries.length * 4); this.invLength2 = new Float64Array(entries.length);
    entries.forEach(({ a, b, halfWidth }, id) => {
      this.segments.set([a[0], a[1], b[0], b[1]], id * 4); this.halfWidths[id] = halfWidth;
      this.boxes.set([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], id * 4);
      const length2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      this.invLength2[id] = length2 ? 1 / length2 : 0;
    });
  }
  private segmentOffset(px: number, py: number, id: number): number {
    const s = id * 4;
    return distanceToSegment(px, py, this.segments[s]!, this.segments[s + 1]!, this.segments[s + 2]!, this.segments[s + 3]!) - this.halfWidths[id]!;
  }
  /** Exact minimum of (distance − halfWidth) when the nearest centreline
   * point is known to lie between `lower` and `upper` metres away. The
   * minimum cannot exceed `upper` (that nearest point's own segment has a
   * non-negative half width), and a segment beats a running `best` only if
   * its centreline comes within `best + halfWidth`: the scan covers the
   * annulus from `lower` out to `best + maxHalfWidth` (coarse cells once
   * that is wide), `best` starts at `upper`, tightened by the previous
   * query's own segment, and shrinks as segments are found, so every cell
   * lying wholly beyond it is skipped and the minimum over the segments
   * that remain is the minimum over all of them. */
  nearestWithin(px: number, py: number, lower: number, upper: number): number {
    const level = upper + this.maxHalfWidth > 2 * this.cellM ? this.coarse : this.fine, cellM = level.cellM, columns = level.columns;
    const start = level.start, ids = level.ids, nextFilled = level.nextFilled, segments = this.segments, halfWidths = this.halfWidths, maxHalfWidth = this.maxHalfWidth;
    const boxes = this.boxes, invLength2 = this.invLength2;
    let best = upper, bestId = -1;
    // The hint is tested once here and skipped in the scan (it cannot beat itself).
    const hintId = this.lastId;
    if (hintId >= 0) { const d = this.segmentOffset(px, py, hintId); if (d < best) { best = d; bestId = hintId; } }
    const rowLo = level.row(py - (best + maxHalfWidth)), rowHi = level.row(py + (best + maxHalfWidth));
    for (let r = rowLo; r <= rowHi; r++) {
      const reach = best + maxHalfWidth;
      const yb0 = level.y0 + r * cellM, yb1 = yb0 + cellM;
      const dyMin = Math.max(0, yb0 - py, py - yb1);
      if (dyMin > reach) continue;
      const half = Math.sqrt(reach * reach - dyMin * dyMin);
      const dyMax = Math.max(Math.abs(py - yb0), Math.abs(py - yb1));
      // Cells entirely nearer than `lower` hold no centreline point.
      const halfInner = lower > dyMax ? Math.sqrt(lower * lower - dyMax * dyMax) : -1;
      const rowStart = r * columns, kEnd = rowStart + level.column(px + half);
      for (let k = nextFilled[rowStart + level.column(px - half)]!; k <= kEnd; k = nextFilled[k + 1]!) {
        const from = start[k]!, to = start[k + 1]!;
        if (halfInner > 0) { const xb0 = level.x0 + (k - rowStart) * cellM; if (xb0 > px - halfInner && xb0 + cellM < px + halfInner) continue; }
        for (let i = from; i < to; i++) {
          const id = ids[i]!, s = id * 4;
          if (id === hintId) continue;
          // A segment beats `best` only if its centreline comes within
          // `best + halfWidth`: reject on the bounding box, then on an
          // approximate squared distance with slack far wider than its
          // rounding, and only then pay for the exact distance — the same
          // number the plain scan computed, for the same winner.
          const limit = best + halfWidths[id]!;
          if (limit <= 0) continue;
          const bx = Math.max(0, boxes[s]! - px, px - boxes[s + 2]!), by = Math.max(0, boxes[s + 1]! - py, py - boxes[s + 3]!);
          const limit2 = limit * limit;
          if (bx * bx + by * by > limit2) continue;
          const ax = segments[s]!, ay = segments[s + 1]!, dx = segments[s + 2]! - ax, dy = segments[s + 3]! - ay;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) * invLength2[id]!));
          const ex = px - ax - t * dx, ey = py - ay - t * dy;
          if (ex * ex + ey * ey > limit2 * (1 + 1e-9)) continue;
          const d = distanceToSegment(px, py, ax, ay, segments[s + 2]!, segments[s + 3]!) - halfWidths[id]!;
          if (d < best) { best = d; bestId = id; }
        }
      }
    }
    if (bestId >= 0) this.lastId = bestId;
    return best;
  }
}
/** Even-odd scanline fill of one polygon (outer + holes) into `inside`, OR-ed
 * with what is already there, sampling texel centres. */
function fillPolygon(rings: PolygonRings, frame: SignedDistanceField, inside: Uint8Array): void {
  const [x0, y0] = frame.boundsM, [tw, th] = frame.texelM;
  for (let row = 0; row < frame.height; row++) {
    const y = y0 + (row + .5) * th, crossings: number[] = [];
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!, b = ring[i]!;
      if ((a[1] > y) !== (b[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil((crossings[k]! - x0) / tw - .5)), to = Math.min(frame.width - 1, Math.floor((crossings[k + 1]! - x0) / tw - .5));
      for (let column = from; column <= to; column++) inside[row * frame.width + column] = 1;
    }
  }
}

const FAR = 1e20;
/** Felzenszwalb–Huttenlocher 1D squared-distance transform along one axis with texel spacing `s` (metres). */
function edt1d(f: Float64Array, n: number, s: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  const s2 = s * s;
  for (let q = 1; q < n; q++) {
    let p = v[k]!;
    let inter = ((f[q]! - f[p]!) / s2 + q * q - p * p) / (2 * (q - p));
    while (inter <= z[k]!) { k--; p = v[k]!; inter = ((f[q]! - f[p]!) / s2 + q * q - p * p) / (2 * (q - p)); }
    k++; v[k] = q; z[k] = inter; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1]! < q) k++; const p = v[k]!; d[q] = (q - p) * (q - p) * s2 + f[p]!; }
}
/** The marks of one bracket grid: per grid row, the marked columns in the
 * order they were marked (sorted and de-duplicated when read). Rows the
 * centrelines never touch stay empty, which is what makes the bracket
 * cheap on a small frame with a wide reach — the padded grid is mostly
 * empty rows. */
class MarkGrid {
  readonly rows: number[][];
  constructor(readonly width: number, readonly height: number) { this.rows = Array.from({ length: height }, () => []); }
  mark(col: number, row: number): void { if (col >= 0 && col < this.width && row >= 0 && row < this.height) this.rows[row]!.push(col); }
}
/** Exact Euclidean distance (metres) from every texel centre of the frame
 * window `[colOffset, colOffset + width) × [rowOffset, rowOffset + height)`
 * to the nearest marked texel centre anywhere on the grid. Separable: the
 * first pass sweeps each grid row's sorted marks past the window's columns
 * (the row's nearest mark per column, the same `(Δcol · tw)²` the 1D
 * transform would produce with no envelope to build); the second runs the
 * exact 1D transform down each window column over every grid row and
 * keeps the window rows. Same values as a transform over the whole grid in
 * either axis order (the two squared terms are summed in the other order,
 * which IEEE addition does not distinguish), for the window's texels alone
 * and skipping the rows and columns no mark can reach. `undefined` when
 * nothing is marked at all. */
function distanceToMarked(marks: MarkGrid, tw: number, th: number, colOffset: number, rowOffset: number, width: number, height: number): Float32Array | undefined {
  const gridHeight = marks.height, tw2 = tw * tw;
  const g = new Float64Array(width * gridHeight);
  let any = false;
  for (let row = 0; row < gridHeight; row++) {
    const list = marks.rows[row]!, base = row * width;
    if (!list.length) { g.fill(FAR, base, base + width); continue; }
    any = true;
    list.sort((p, q) => p - q);
    // Sweep: for each window column, the nearest of the mark just before
    // and the mark at or after it.
    let k = 0;
    for (let c = 0; c < width; c++) {
      const col = colOffset + c;
      while (k < list.length && list[k]! < col) k++;
      let best = Infinity;
      if (k < list.length) { const d = list[k]! - col; best = d * d * tw2; }
      if (k > 0) { const d = col - list[k - 1]!; const e = d * d * tw2; if (e < best) best = e; }
      g[base + c] = best;
    }
  }
  if (!any) return undefined;
  const out = new Float32Array(width * height);
  const f = new Float64Array(gridHeight), d = new Float64Array(gridHeight), v = new Int32Array(gridHeight), z = new Float64Array(gridHeight + 1);
  for (let c = 0; c < width; c++) {
    let finite = false;
    for (let row = 0; row < gridHeight; row++) { const value = g[row * width + c]!; f[row] = value; if (value < FAR) finite = true; }
    if (!finite) { for (let row = 0; row < height; row++) out[row * width + c] = Math.sqrt(FAR); continue; }
    edt1d(f, gridHeight, th, d, v, z);
    for (let row = 0; row < height; row++) out[row * width + c] = Math.sqrt(d[row + rowOffset]!);
  }
  return out;
}
/** Signed distance (§36 convention) of a polygon and/or line layer over `frame`. */
export function buildSignedDistanceField(input: DistanceLayerInput | readonly PolygonRings[], frame: FieldFrame, resolution: FieldResolution, maxDistanceM = SDF_RANGE_M): SignedDistanceField {
  const layer: DistanceLayerInput = Array.isArray(input) ? { polygons: input as readonly PolygonRings[] } : input as DistanceLayerInput;
  const width = Math.max(1, Math.floor(resolution.width)), height = Math.max(1, Math.floor(resolution.height));
  const [x0, y0, x1, y1] = frame.boundsM;
  if (!(x1 > x0 && y1 > y0) || !(maxDistanceM > 0)) throw new Error('Signed distance field needs ordered bounds and a positive reach');
  const field: SignedDistanceField = { width, height, boundsM: [x0, y0, x1, y1], texelM: [(x1 - x0) / width, (y1 - y0) / height],
    distanceM: new Float32Array(width * height), maxDistanceM, basis: 'source_derived_visual' };
  const entries: SegmentEntry[] = [];
  const polygons = layer.polygons ?? [];
  for (const rings of polygons) for (const ring of rings) {
    if (ring.length < 2) continue;
    const closed = ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1];
    for (let i = 1; i < ring.length; i++) entries.push({ a: ring[i - 1]!, b: ring[i]!, halfWidth: 0 });
    if (!closed && ring.length > 2) entries.push({ a: ring[ring.length - 1]!, b: ring[0]!, halfWidth: 0 });
  }
  for (const line of layer.lines ?? []) {
    const halfWidth = Math.max(0, line.widthM / 2);
    if (line.points.length === 1) entries.push({ a: line.points[0]!, b: line.points[0]!, halfWidth });
    for (let i = 1; i < line.points.length; i++) entries.push({ a: line.points[i - 1]!, b: line.points[i]!, halfWidth });
  }
  const inside = new Uint8Array(width * height);
  for (const rings of polygons) fillPolygon(rings, field, inside);
  const [tw, th] = field.texelM;
  const index = new SegmentIndex(maxDistanceM, field.boundsM, Math.min(tw, th), entries);
  // Bounding pass: every centreline is sampled at half-texel steps and the
  // texel under each sample marked, so the exact Euclidean transform to the
  // marked texels brackets each texel's true centreline distance: the
  // nearest marked centre's own sample is a centreline point at most half
  // a texel diagonal from it (the upper bound), and the nearest centreline
  // point is within half a step of a sample lying at most half a diagonal
  // from the centre it marked (the lower bound). Texels with nothing in
  // reach are settled from the bracket alone; the rest take the exact
  // minimum over the annulus the bracket allows. The grid is the frame
  // padded by the reach, so a centreline outside the frame still marks the
  // texels it is nearest to, and anything beyond the padding is beyond the
  // reach.
  const margin = Math.hypot(tw, th), step = Math.min(tw, th) / 2;
  // 10 µm of slack covers the bracket's own float32 storage.
  const marginUpper = margin / 2 + 1e-5, marginLower = margin / 2 + step / 2 + 1e-5;
  const padM = maxDistanceM + index.maxHalfWidth + 2 * margin;
  const padCols = Math.ceil(padM / tw), padRows = Math.ceil(padM / th);
  const gridWidth = width + 2 * padCols, gridHeight = height + 2 * padRows;
  const gx0 = x0 - padCols * tw, gy0 = y0 - padRows * th;
  const marks = new MarkGrid(gridWidth, gridHeight);
  for (const { a, b } of entries) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), samples = Math.max(1, Math.ceil(length / step));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      marks.mark(Math.floor((x - gx0) / tw), Math.floor((y - gy0) / th));
    }
  }
  const bracket = distanceToMarked(marks, tw, th, padCols, padRows, width, height);
  if (!bracket) {
    // Nothing marked within the padding (an empty layer, or one entirely
    // outside the frame's reach) is nothing in reach: the reach itself,
    // signed by the fill alone.
    for (let n = 0; n < width * height; n++) field.distanceM[n] = inside[n] === 1 ? maxDistanceM : -maxDistanceM;
    return field;
  }
  for (let row = 0; row < height; row++) {
    const y = y0 + (row + .5) * th;
    for (let column = 0; column < width; column++) {
      const n = row * width + column, near = bracket[n]!;
      const lower = near >= FAR / 2 ? padM : Math.max(0, Math.min(padM, near - marginLower));
      const g = lower - index.maxHalfWidth >= maxDistanceM ? Number.POSITIVE_INFINITY : index.nearestWithin(x0 + (column + .5) * tw, y, lower, near + marginUpper);
      const within = inside[n] === 1 || g < 0;
      const magnitude = Number.isFinite(g) ? Math.abs(g) : maxDistanceM;
      field.distanceM[n] = (within ? 1 : -1) * Math.min(maxDistanceM, magnitude);
    }
  }
  return field;
}

/** §108 Uint16 packing: boundary at exactly SDF_ZERO, ±rangeM at the ends. */
export function quantizeSignedDistance(distanceM: Float32Array, rangeM = SDF_RANGE_M): Uint16Array {
  const out = new Uint16Array(distanceM.length), scale = (SDF_ZERO - 1) / rangeM;
  // 1…65535 keeps the packed range symmetric about the boundary; 0 is never written.
  for (let i = 0; i < distanceM.length; i++) out[i] = Math.max(1, Math.min(65535, Math.round(SDF_ZERO + (distanceM[i] ?? 0) * scale)));
  return out;
}
export function dequantizeSignedDistance(value: number, rangeM = SDF_RANGE_M): number {
  return (value - SDF_ZERO) * rangeM / (SDF_ZERO - 1);
}

/** Polygon rings of every feature of `kind` in the scene (own and context). */
function polygonsOfKind(scene: HoleScene, kind: LocalFeature['kind']): PolygonRings[] {
  const features = [...scene.features, ...(scene.contextFeatures ?? [])].filter(feature => feature.kind === kind && feature.type !== 'LineString');
  return features.flatMap(feature => feature.parts);
}
/** Path centrelines from the context layer's mobility classes. */
export function pathLines(zones: readonly LocalContextZone[] | undefined): DistanceLine[] {
  const lines: DistanceLine[] = [];
  for (const zone of zones ?? []) {
    const defaultWidth = PATH_CLASSES[zone.class];
    if (defaultWidth == null) continue;
    const widthM = zone.attributes.widthM ?? defaultWidth;
    for (const part of zone.parts) for (const line of part) if (line.length >= 1) lines.push({ points: line, widthM });
  }
  return lines;
}
export interface SurfaceDistanceLayers { layerNames: SurfaceDistanceLayer[]; layers: SignedDistanceField[] }
/** The §18–19 layer set for one hole scene over `frame`. */
export function buildSurfaceDistanceLayers(scene: HoleScene, frame: FieldFrame, resolution: FieldResolution, maxDistanceM = SDF_RANGE_M): SurfaceDistanceLayers {
  const inputs: Record<SurfaceDistanceLayer, DistanceLayerInput> = {
    green: { polygons: polygonsOfKind(scene, 'green') }, bunker: { polygons: polygonsOfKind(scene, 'bunker') },
    fairway: { polygons: polygonsOfKind(scene, 'fairway') }, path: { lines: pathLines(scene.contextZones) },
    water: { polygons: polygonsOfKind(scene, 'water') }, tee: { polygons: polygonsOfKind(scene, 'tee') },
  };
  return { layerNames: [...SURFACE_DISTANCE_LAYERS], layers: SURFACE_DISTANCE_LAYERS.map(name => buildSignedDistanceField(inputs[name], frame, resolution, maxDistanceM)) };
}
