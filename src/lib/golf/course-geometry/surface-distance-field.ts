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
 * layer's segments, found through a uniform bucket grid that stops
 * expanding once no unvisited cell can hold a nearer segment. Distances
 * beyond `maxDistanceM` clamp (a texel with nothing in reach is
 * −maxDistanceM). `quantizeSignedDistance` packs to Uint16 with the boundary
 * at exactly 32768 (§108 sdfLayers), and the quantization step at the
 * default 64 m range is under 2 mm.
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
/** The five §18–19 layers, in packing order. */
export const SURFACE_DISTANCE_LAYERS = ['green', 'bunker', 'fairway', 'path', 'water'] as const;
export type SurfaceDistanceLayer = typeof SURFACE_DISTANCE_LAYERS[number];
/** Context classes that are path centrelines, with the width used when the zone carries none. */
export const PATH_CLASSES: Readonly<Record<string, number>> = Object.freeze({ cart_path: 2.4, service_path: 3, road: 6 });

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Uniform bucket grid over the frame (expanded by the reach) holding
 * segments with a per-segment half width; `nearest` returns the exact
 * minimum of (distance − halfWidth) or Infinity when nothing is in reach. */
class SegmentIndex {
  private readonly cells: number[][];
  private readonly segments: number[] = [];
  private readonly halfWidths: number[] = [];
  private readonly maxHalfWidth: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly x0: number;
  private readonly y0: number;
  readonly cellM: number;
  private readonly maxRing: number;
  constructor(reachM: number, boundsM: readonly [number, number, number, number], texelM: number,
    entries: readonly { a: PointM; b: PointM; halfWidth: number }[]) {
    this.maxHalfWidth = entries.reduce((max, e) => Math.max(max, e.halfWidth), 0);
    this.cellM = Math.max(texelM * 2, 4);
    this.x0 = boundsM[0] - reachM; this.y0 = boundsM[1] - reachM;
    this.columns = Math.max(1, Math.ceil((boundsM[2] + reachM - this.x0) / this.cellM));
    this.rows = Math.max(1, Math.ceil((boundsM[3] + reachM - this.y0) / this.cellM));
    this.cells = Array.from({ length: this.columns * this.rows }, () => []);
    this.maxRing = Math.ceil((reachM + this.maxHalfWidth) / this.cellM) + 1;
    for (const { a, b, halfWidth } of entries) {
      const id = this.segments.length / 4;
      this.segments.push(a[0], a[1], b[0], b[1]); this.halfWidths.push(halfWidth);
      const c0 = this.column(Math.min(a[0], b[0]) - halfWidth), c1 = this.column(Math.max(a[0], b[0]) + halfWidth);
      const r0 = this.row(Math.min(a[1], b[1]) - halfWidth), r1 = this.row(Math.max(a[1], b[1]) + halfWidth);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.columns + c]!.push(id);
    }
  }
  private column(x: number): number { return Math.max(0, Math.min(this.columns - 1, Math.floor((x - this.x0) / this.cellM))); }
  private row(y: number): number { return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.y0) / this.cellM))); }
  nearest(px: number, py: number): number {
    const cx = this.column(px), cy = this.row(py);
    let best = Number.POSITIVE_INFINITY;
    for (let ring = 0; ring <= this.maxRing; ring++) {
      // Cells at this ring or beyond start at least (ring − 1) cells from the
      // query point, so nothing unvisited can beat `best` once that gap does.
      if ((ring - 1) * this.cellM - this.maxHalfWidth >= best) break;
      const r0 = cy - ring, r1 = cy + ring, c0 = cx - ring, c1 = cx + ring;
      for (let r = r0; r <= r1; r++) {
        if (r < 0 || r >= this.rows) continue;
        const edge = r === r0 || r === r1;
        for (let c = c0; c <= c1; c += edge ? 1 : (c1 - c0 || 1)) {
          if (c < 0 || c >= this.columns) continue;
          for (const id of this.cells[r * this.columns + c]!) {
            const s = id * 4;
            const d = distanceToSegment(px, py, this.segments[s]!, this.segments[s + 1]!, this.segments[s + 2]!, this.segments[s + 3]!) - this.halfWidths[id]!;
            if (d < best) best = d;
          }
        }
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
  const index = new SegmentIndex(maxDistanceM, field.boundsM, Math.min(field.texelM[0], field.texelM[1]), entries);
  const [tw, th] = field.texelM;
  for (let row = 0; row < height; row++) {
    const y = y0 + (row + .5) * th;
    for (let column = 0; column < width; column++) {
      const n = row * width + column, g = index.nearest(x0 + (column + .5) * tw, y);
      // A line texel is inside its capsule when the offset distance is negative.
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
    water: { polygons: polygonsOfKind(scene, 'water') },
  };
  return { layerNames: [...SURFACE_DISTANCE_LAYERS], layers: SURFACE_DISTANCE_LAYERS.map(name => buildSignedDistanceField(inputs[name], frame, resolution, maxDistanceM)) };
}
