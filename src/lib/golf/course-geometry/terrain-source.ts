import { z } from 'zod';
import type { PointM } from './types';

/** An aligned, metric source grid. null is unsupported terrain, never zero. */
export const metricTerrainGridSchema = z.object({
  originM: z.tuple([z.number().finite(), z.number().finite()]),
  spacingM: z.number().positive().max(32),
  columns: z.number().int().min(2).max(4096), rows: z.number().int().min(2).max(4096),
  heightsM: z.array(z.number().finite().min(-1000).max(9000).nullable()).max(1_000_000),
}).refine(grid => grid.heightsM.length === grid.columns * grid.rows, 'Metric grid dimensions do not match samples');
export type MetricTerrainGrid = z.infer<typeof metricTerrainGridSchema>;
export const holeRenderProfileSchema = z.object({
  compilerVersion: z.string().min(1).max(100), styleVersion: z.string().min(1).max(100),
  tacticalBoundsM: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  contextBoundsM: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  terrainAvailable: z.boolean(), contextCoverage: z.enum(['complete', 'partial']),
  teeGeometry: z.enum(['reviewed', 'approximate', 'missing']), treeEvidence: z.enum(['canopy_only', 'none']),
  limitations: z.array(z.string().max(400)).max(24),
}).refine(profile => {
  const [x0, y0, x1, y1] = profile.tacticalBoundsM, [cx0, cy0, cx1, cy1] = profile.contextBoundsM;
  return x0 < x1 && y0 < y1 && cx0 <= x0 && cy0 <= y0 && cx1 >= x1 && cy1 >= y1;
}, 'Context must contain nondegenerate tactical bounds');
export const terrainSourceFields = {
  metricGrid: metricTerrainGridSchema.optional(),
  sourceNormals: z.array(z.number().finite().min(-1.001).max(1.001)).max(360_000).optional(),
  contextFeatureIds: z.array(z.string().min(1).max(100)).max(256).optional(),
  renderProfile: holeRenderProfileSchema.optional(),
};

/** `heightsM` as typed arrays: the heights (0 where unsupported, never read
 * there) and a support mask. The parsed grid holds `number | null` in a
 * plain array, which V8 keeps as boxed elements, so a compiler that walks
 * it per node (curvature, sky) paid an unbox per read; the same doubles
 * read from a Float64Array are the same doubles. Extracted per call — a
 * grid pass, well under a millisecond — rather than cached, so a grid
 * edited in place (the tests do) is never read stale. */
export interface TypedGridHeights { heights: Float64Array; support: Uint8Array }
export function typedGridHeights(grid: MetricTerrainGrid): TypedGridHeights {
  const count = grid.heightsM.length, heights = new Float64Array(count), support = new Uint8Array(count);
  for (let i = 0; i < count; i++) { const h = grid.heightsM[i]; if (h != null) { heights[i] = h; support[i] = 1; } }
  return { heights, support };
}

export function sampleMetricTerrain(grid: MetricTerrainGrid, [x, y]: PointM): number | null {
  return sampleMetricTerrainAt(grid, x, y);
}
/** `sampleMetricTerrain` on plain coordinates, for a loop that would
 * otherwise allocate a point per sample. */
export function sampleMetricTerrainAt(grid: MetricTerrainGrid, x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const gx = (x - grid.originM[0]) / grid.spacingM, gy = (y - grid.originM[1]) / grid.spacingM;
  if (gx < 0 || gy < 0 || gx > grid.columns - 1 || gy > grid.rows - 1) return null;
  const ix = Math.min(Math.floor(gx), grid.columns - 2), iy = Math.min(Math.floor(gy), grid.rows - 2);
  const fx = gx - ix, fy = gy - iy, i = iy * grid.columns + ix;
  const a = grid.heightsM[i], b = grid.heightsM[i + 1], c = grid.heightsM[i + grid.columns], d = grid.heightsM[i + grid.columns + 1];
  if (a == null || b == null || c == null || d == null) return null;
  return (1 - fx) * ((1 - fy) * a + fy * c) + fx * ((1 - fy) * b + fy * d);
}

/** Source-derived gradient independent of display triangle size or color seams. */
export function metricTerrainNormal(grid: MetricTerrainGrid, point: PointM): readonly [number, number, number] | null {
  const step = grid.spacingM, z = sampleMetricTerrain(grid, point);
  if (z == null) return null;
  const l = sampleMetricTerrainAt(grid, point[0] - step, point[1]), r = sampleMetricTerrainAt(grid, point[0] + step, point[1]);
  const b = sampleMetricTerrainAt(grid, point[0], point[1] - step), t = sampleMetricTerrainAt(grid, point[0], point[1] + step);
  const dx = l != null && r != null ? (r - l) / (2 * step) : r != null ? (r - z) / step : l != null ? (z - l) / step : null;
  const dy = b != null && t != null ? (t - b) / (2 * step) : t != null ? (t - z) / step : b != null ? (z - b) / step : null;
  if (dx == null || dy == null) return null;
  const length = Math.hypot(dx, dy, 1);
  return [-dx / length, -dy / length, 1 / length];
}
