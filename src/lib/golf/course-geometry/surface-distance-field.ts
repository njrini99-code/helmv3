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
 * centreline distance within one texel diagonal — so a texel with nothing
 * in reach is settled without a search, and every other texel scans only
 * the bucket-grid cells touching its thin annulus (coarser cells once the
 * annulus is wide) for the exact minimum. Same values as the plain
 * outward ring search it replaced (bit-identical over every layer of
 * Peek'n Peak Upper holes 7 and 8 at 0.36–0.75 m texels), at roughly an
 * eighth of the time, which is what the V2 world's mount compile is made
 * of (Meridian V2 Task 20). Distances beyond `maxDistanceM` clamp (a texel
 * with nothing in reach is −maxDistanceM). `quantizeSignedDistance` packs
 * to Uint16 with the boundary at exactly 32768 (§108 sdfLayers), and the
 * quantization step at the default 64 m range is under 2 mm.
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

/** One uniform bucket level over the frame (expanded by the reach) holding
 * segment ids by bounding box (plus half width). */
class BucketLevel {
  readonly cells: number[][]; readonly columns: number; readonly rows: number;
  constructor(readonly cellM: number, readonly x0: number, readonly y0: number, spanX: number, spanY: number) {
    this.columns = Math.max(1, Math.ceil(spanX / cellM)); this.rows = Math.max(1, Math.ceil(spanY / cellM));
    this.cells = Array.from({ length: this.columns * this.rows }, () => []);
  }
  column(x: number): number { return Math.max(0, Math.min(this.columns - 1, Math.floor((x - this.x0) / this.cellM))); }
  row(y: number): number { return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.y0) / this.cellM))); }
  add(id: number, minX: number, minY: number, maxX: number, maxY: number): void {
    const c0 = this.column(minX), c1 = this.column(maxX), r0 = this.row(minY), r1 = this.row(maxY);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.columns + c]!.push(id);
  }
}
class SegmentIndex {
  private readonly segments: number[] = []; private readonly halfWidths: number[] = [];
  readonly maxHalfWidth: number;
  /** Fine cells for near queries, coarse (4×) cells for far ones: a far annulus touches a quarter as many. */
  private readonly fine: BucketLevel; private readonly coarse: BucketLevel;
  readonly cellM: number;
  constructor(reachM: number, boundsM: readonly [number, number, number, number], texelM: number, entries: readonly { a: PointM; b: PointM; halfWidth: number }[]) {
    this.maxHalfWidth = entries.reduce((max, e) => Math.max(max, e.halfWidth), 0);
    this.cellM = Math.max(texelM * 2, 4);
    const x0 = boundsM[0] - reachM, y0 = boundsM[1] - reachM, spanX = boundsM[2] + reachM - x0, spanY = boundsM[3] + reachM - y0;
    this.fine = new BucketLevel(this.cellM, x0, y0, spanX, spanY);
    this.coarse = new BucketLevel(this.cellM * 4, x0, y0, spanX, spanY);
    for (const { a, b, halfWidth } of entries) {
      const id = this.segments.length / 4;
      this.segments.push(a[0], a[1], b[0], b[1]); this.halfWidths.push(halfWidth);
      const minX = Math.min(a[0], b[0]) - halfWidth, maxX = Math.max(a[0], b[0]) + halfWidth, minY = Math.min(a[1], b[1]) - halfWidth, maxY = Math.max(a[1], b[1]) + halfWidth;
      this.fine.add(id, minX, minY, maxX, maxY); this.coarse.add(id, minX, minY, maxX, maxY);
    }
  }
  private segmentOffset(px: number, py: number, id: number): number {
    const s = id * 4;
    return distanceToSegment(px, py, this.segments[s]!, this.segments[s + 1]!, this.segments[s + 2]!, this.segments[s + 3]!) - this.halfWidths[id]!;
  }
  /** Exact minimum of (distance − halfWidth) when the nearest centreline
   * point is known to lie between `lower` and `upper` metres away: only the
   * cells that touch that annulus are scanned (coarse cells once the annulus
   * is wide), and `best` starts at the upper bound, which the minimum cannot exceed. */
  nearestWithin(px: number, py: number, lower: number, upper: number): number {
    const level = upper > 3 * this.cellM ? this.coarse : this.fine, cellM = level.cellM;
    let best = upper;
    const rowLo = level.row(py - upper), rowHi = level.row(py + upper);
    for (let r = rowLo; r <= rowHi; r++) {
      const yb0 = level.y0 + r * cellM, yb1 = yb0 + cellM;
      const dyMin = Math.max(0, yb0 - py, py - yb1);
      if (dyMin > upper) continue;
      const half = Math.sqrt(upper * upper - dyMin * dyMin);
      const dyMax = Math.max(Math.abs(py - yb0), Math.abs(py - yb1));
      // Cells entirely nearer than `lower` hold no centreline point.
      const halfInner = lower > dyMax ? Math.sqrt(lower * lower - dyMax * dyMax) : -1;
      const c0 = level.column(px - half), c1 = level.column(px + half);
      for (let c = c0; c <= c1; c++) {
        if (halfInner > 0) { const xb0 = level.x0 + c * cellM; if (xb0 > px - halfInner && xb0 + cellM < px + halfInner) continue; }
        for (const id of level.cells[r * level.columns + c]!) { const d = this.segmentOffset(px, py, id); if (d < best) best = d; }
      }
    }
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
/** Exact Euclidean distance (metres) from every texel centre to the nearest marked texel centre. */
function distanceToMarked(marked: Uint8Array, width: number, height: number, tw: number, th: number): Float32Array {
  const g = new Float64Array(width * height);
  const n = Math.max(width, height), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) f[row] = marked[row * width + col] ? 0 : FAR;
    edt1d(f, height, th, d, v, z);
    for (let row = 0; row < height; row++) g[row * width + col] = d[row]!;
  }
  const out = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) f[col] = g[row * width + col]!;
    edt1d(f, width, tw, d, v, z);
    for (let col = 0; col < width; col++) out[row * width + col] = Math.sqrt(d[col]!);
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
  const entries: { a: PointM; b: PointM; halfWidth: number }[] = [];
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
  // marked texels brackets each texel's true centreline distance within one
  // texel diagonal (a sample lies inside the marked texel; every centreline
  // point is within half a step of a sample). Texels with nothing in reach
  // are settled from the bracket alone; the rest take the exact minimum over
  // the annulus the bracket allows. The grid is the frame padded by the
  // reach, so a centreline outside the frame still marks the texels it is
  // nearest to, and anything beyond the padding is beyond the reach.
  const margin = Math.hypot(tw, th);
  const padM = maxDistanceM + index.maxHalfWidth + 2 * margin;
  const padCols = Math.ceil(padM / tw), padRows = Math.ceil(padM / th);
  const gridWidth = width + 2 * padCols, gridHeight = height + 2 * padRows;
  const gx0 = x0 - padCols * tw, gy0 = y0 - padRows * th;
  const marked = new Uint8Array(gridWidth * gridHeight);
  const step = Math.min(tw, th) / 2;
  const markAt = (x: number, y: number) => {
    const col = Math.floor((x - gx0) / tw), row = Math.floor((y - gy0) / th);
    if (col >= 0 && col < gridWidth && row >= 0 && row < gridHeight) marked[row * gridWidth + col] = 1;
  };
  for (const { a, b } of entries) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), samples = Math.max(1, Math.ceil(length / step));
    for (let i = 0; i <= samples; i++) { const t = i / samples; markAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
  }
  const bracket = distanceToMarked(marked, gridWidth, gridHeight, tw, th);
  for (let row = 0; row < height; row++) {
    const y = y0 + (row + .5) * th;
    for (let column = 0; column < width; column++) {
      const n = row * width + column, near = bracket[(row + padRows) * gridWidth + column + padCols]!;
      // Nothing marked within the padding (an empty layer, or one entirely
      // outside the frame's reach) is nothing in reach.
      const lower = near >= FAR / 2 ? padM : Math.max(0, Math.min(padM, near - margin));
      const g = lower - index.maxHalfWidth >= maxDistanceM ? Number.POSITIVE_INFINITY : index.nearestWithin(x0 + (column + .5) * tw, y, lower, near + margin);
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
