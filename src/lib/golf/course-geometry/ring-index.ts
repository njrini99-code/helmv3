import { ringBbox, type Bbox } from './bunker-profile';
import type { LocalFeature, PointM } from './types';

/** A ring's edges bucketed on a uniform grid over its bounding box, so a
 * point test reads the few edges near the point instead of the whole ring.
 * `contains` answers exactly what `inRing` answers and `distance` exactly
 * what `boundaryDistance` answers (`display-outline.ts`): both evaluate the
 * same per-edge expressions, in ring order, on a superset of the edges that
 * can matter — an edge is stored in every cell its box covers, a horizontal
 * ray only meets edges in its own row and an edge in an unread cell is
 * farther than the best distance already found. */
export interface RingIndex {
  readonly ring: readonly PointM[];
  readonly box: Bbox;
  readonly cellM: number;
  readonly columns: number;
  readonly rows: number;
  /** CSR cell → edge index; edge `i` (i ≥ 1) is ring[i-1]→ring[i], edge 0 is the closing edge ring[last]→ring[0] that only `inRing` walks. */
  readonly starts: Int32Array;
  readonly edges: Int32Array;
  /** Boxes over runs of `CHUNK` edges (1..n-1, the edges `boundaryDistance`
   * walks) and over runs of `CHUNK` chunks, as minX, minY, maxX, maxY
   * quads: the distance query tests boxes coarse to fine and reads only the
   * runs that can still beat the best distance found. */
  readonly chunkBoxes: Float64Array;
  readonly groupBoxes: Float64Array;
  /** Per-query stamps so an edge stored in several read cells is evaluated once (the crossing parity would otherwise count it twice). */
  readonly scratch: { seen: Int32Array; stamp: number };
}

/** Edges per cell target ~1 along the boundary: cells scale with the ring so
 * a small green and a kilometre of woods both stay cheap to read. */
const MAX_CELLS = 1 << 16;
const MIN_CELL_M = 1;
const CHUNK = 8;

/** Box of edges `from`..`to` (each edge i spanning ring[i-1], ring[i]). */
function edgeRunBox(ring: readonly PointM[], from: number, to: number, out: Float64Array, at: number): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = from - 1; i <= to; i++) { const [x, y] = ring[i]!; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  out[at] = minX; out[at + 1] = minY; out[at + 2] = maxX; out[at + 3] = maxY;
}
function quadDistance(x: number, y: number, quads: Float64Array, at: number): number {
  const dx = Math.max(quads[at]! - x, 0, x - quads[at + 2]!), dy = Math.max(quads[at + 1]! - y, 0, y - quads[at + 3]!);
  return Math.sqrt(dx * dx + dy * dy);
}

export function indexRing(ring: readonly PointM[]): RingIndex {
  const box = ringBbox(ring);
  const n = ring.length;
  const width = Math.max(box.maxX - box.minX, 0), height = Math.max(box.maxY - box.minY, 0);
  // Roughly one boundary edge per cell it crosses; never below a metre.
  const perimeterCells = Math.max(1, n - 1);
  let cellM = Math.max(MIN_CELL_M, (width + height) * 2 / perimeterCells);
  while (Math.ceil(width / cellM + 1) * Math.ceil(height / cellM + 1) > MAX_CELLS) cellM *= 2;
  const columns = Math.max(1, Math.ceil(width / cellM + 1)), rows = Math.max(1, Math.ceil(height / cellM + 1));
  const cellCount = columns * rows;
  const counts = new Int32Array(cellCount + 1);
  const col = (x: number) => Math.min(columns - 1, Math.max(0, Math.floor((x - box.minX) / cellM)));
  const row = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor((y - box.minY) / cellM)));
  const forEdgeCells = (e: number, visit: (cell: number) => void) => {
    const a = ring[e === 0 ? n - 1 : e - 1]!, b = ring[e]!;
    const c0 = col(Math.min(a[0], b[0])), c1 = col(Math.max(a[0], b[0])), r0 = row(Math.min(a[1], b[1])), r1 = row(Math.max(a[1], b[1]));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * columns + c);
  };
  for (let e = 0; e < n; e++) forEdgeCells(e, cell => { counts[cell + 1]!++; });
  for (let cell = 0; cell < cellCount; cell++) counts[cell + 1]! += counts[cell]!;
  const starts = counts.slice();
  const fill = counts.slice(0, cellCount);
  const edges = new Int32Array(starts[cellCount]!);
  // Ring order within a cell (edges are inserted in index order).
  for (let e = 0; e < n; e++) forEdgeCells(e, cell => { edges[fill[cell]!++] = e; });
  const chunkCount = Math.max(0, Math.ceil((n - 1) / CHUNK)), groupCount = Math.ceil(chunkCount / CHUNK);
  const chunkBoxes = new Float64Array(chunkCount * 4), groupBoxes = new Float64Array(groupCount * 4);
  for (let k = 0; k < chunkCount; k++) edgeRunBox(ring, 1 + k * CHUNK, Math.min(n - 1, (k + 1) * CHUNK), chunkBoxes, k * 4);
  for (let g = 0; g < groupCount; g++) edgeRunBox(ring, 1 + g * CHUNK * CHUNK, Math.min(n - 1, (g + 1) * CHUNK * CHUNK), groupBoxes, g * 4);
  return { ring, box, cellM, columns, rows, starts, edges, chunkBoxes, groupBoxes, scratch: { seen: new Int32Array(n), stamp: 0 } };
}

function nextStamp(index: RingIndex): number {
  const { scratch } = index;
  if (scratch.stamp === 0x7fffffff) { scratch.seen.fill(0); scratch.stamp = 0; }
  return ++scratch.stamp;
}

/** Exactly `inRing(point, index.ring)`. */
export function indexContains(index: RingIndex, [x, y]: PointM): boolean {
  const { ring, box, cellM, columns, rows, starts, edges } = index;
  // No edge spans a y outside the box and no edge lies right of it: the
  // full walk toggles nothing and matches no edge.
  if (!(y >= box.minY && y <= box.maxY && x <= box.maxX)) return false;
  const r = Math.min(rows - 1, Math.max(0, Math.floor((y - box.minY) / cellM)));
  // The ray's crossings lie right of the point, in its row; the column left
  // of the point's own covers an intersection abscissa that rounds a hair
  // past the edge's box, and the on-boundary match sits in the point's cell.
  const c0 = Math.max(0, Math.min(columns - 1, Math.floor((x - box.minX) / cellM) - 1));
  const seen = index.scratch.seen, stamp = nextStamp(index);
  const n = ring.length;
  let inside = false;
  for (let c = c0; c < columns; c++) {
    const cell = r * columns + c;
    for (let k = starts[cell]!; k < starts[cell + 1]!; k++) {
      const e = edges[k]!;
      if (seen[e] === stamp) continue;
      seen[e] = stamp;
      const a = ring[e === 0 ? n - 1 : e - 1]!, b = ring[e]!;
      const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0]);
      if (Math.abs(cross) < 1e-9 && x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]) &&
        y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])) return true;
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

/** A cell-box distance rounds at most one ulp above the boundary distance it
 * bounds; the slack keeps every stop conservative. */
const SLACK_M = 1e-9;

/** Exactly `boundaryDistance(point, index.ring)` whenever that is below
 * `cap`; otherwise some value at or above `cap`. The nearest group's nearest
 * chunk is read first for a bound, then only the groups and chunks whose box
 * can still beat it (a box is never farther than the edges it holds; one ulp
 * of slack for the square root), so a cap bounds the work for a caller that
 * only keeps a running minimum. */
export function indexDistance(index: RingIndex, p: PointM, cap = Infinity): number {
  const { ring, chunkBoxes, groupBoxes } = index;
  const n = ring.length, chunkCount = chunkBoxes.length / 4, groupCount = groupBoxes.length / 4;
  if (n < 2) return Infinity;
  const [x, y] = p;
  // The nearest group by box, then its nearest chunk: the first bound.
  let nearGroup = -1, nearGroupD = Infinity;
  for (let g = 0; g < groupCount; g++) { const d = quadDistance(x, y, groupBoxes, g * 4); if (d < nearGroupD) { nearGroupD = d; nearGroup = g; } }
  if (nearGroup < 0 || nearGroupD >= cap + SLACK_M) return Infinity;
  let nearChunk = -1, nearChunkD = Infinity;
  for (let k = nearGroup * CHUNK, end = Math.min(chunkCount, (nearGroup + 1) * CHUNK); k < end; k++) { const d = quadDistance(x, y, chunkBoxes, k * 4); if (d < nearChunkD) { nearChunkD = d; nearChunk = k; } }
  let best = scanChunk(ring, x, y, nearChunk, Infinity);
  for (let g = 0; g < groupCount; g++) {
    if (quadDistance(x, y, groupBoxes, g * 4) > Math.min(best, cap) + SLACK_M) continue;
    for (let k = g * CHUNK, end = Math.min(chunkCount, (g + 1) * CHUNK); k < end; k++) {
      if (k === nearChunk || quadDistance(x, y, chunkBoxes, k * 4) > Math.min(best, cap) + SLACK_M) continue;
      best = scanChunk(ring, x, y, k, best);
    }
  }
  return best;
}
/** `boundaryDistance`'s own per-edge expression over chunk `k`, folded into `best`. */
function scanChunk(ring: readonly PointM[], x: number, y: number, k: number, best: number): number {
  const to = Math.min(ring.length - 1, (k + 1) * CHUNK);
  for (let i = 1 + k * CHUNK; i <= to; i++) {
    const a = ring[i - 1]!, b = ring[i]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length2)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
  }
  return best;
}

/** A polygon feature's rings indexed, in `inFeature`'s structure (parts of
 * outer ring then holes); a LineString has no parts to index. */
export interface FeatureIndex { readonly box: Bbox; readonly parts: readonly (readonly RingIndex[])[] }

export function indexFeature(feature: Pick<LocalFeature, 'type' | 'parts'>): FeatureIndex {
  const parts = feature.type === 'LineString' ? [] : feature.parts.map(rings => rings.map(indexRing));
  return { box: ringBbox(feature.parts.flat(2)), parts };
}

/** Exactly `inFeature(point, feature)` for the indexed feature. */
export function featureContains(index: FeatureIndex, point: PointM): boolean {
  for (const rings of index.parts) {
    if (!rings[0] || !indexContains(rings[0], point)) continue;
    let inHole = false;
    for (let h = 1; h < rings.length && !inHole; h++) inHole = indexContains(rings[h]!, point);
    if (!inHole) return true;
  }
  return false;
}

/** The minimum `boundaryDistance` over every ring of the feature. */
export function featureBoundaryDistance(index: FeatureIndex, point: PointM): number {
  let min = Infinity;
  for (const rings of index.parts) for (const ring of rings) min = Math.min(min, indexDistance(ring, point, min));
  return min;
}
