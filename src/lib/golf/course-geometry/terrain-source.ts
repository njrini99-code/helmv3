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

export function sampleMetricTerrain(grid: MetricTerrainGrid, [x, y]: PointM): number | null {
  if (![x, y].every(Number.isFinite)) return null;
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
  const l = sampleMetricTerrain(grid, [point[0] - step, point[1]]), r = sampleMetricTerrain(grid, [point[0] + step, point[1]]);
  const b = sampleMetricTerrain(grid, [point[0], point[1] - step]), t = sampleMetricTerrain(grid, [point[0], point[1] + step]);
  const dx = l != null && r != null ? (r - l) / (2 * step) : r != null ? (r - z) / step : l != null ? (z - l) / step : null;
  const dy = b != null && t != null ? (t - b) / (2 * step) : t != null ? (t - z) / step : b != null ? (z - b) / step : null;
  if (dx == null || dy == null) return null;
  const length = Math.hypot(dx, dy, 1);
  return [-dx / length, -dy / length, 1 / length];
}
