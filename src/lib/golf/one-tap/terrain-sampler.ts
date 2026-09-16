import { terrainHeight, type TerrainMesh } from '../course-geometry/terrain';
import type { PointM } from '../course-geometry/types';

/** Terrain interaction (master plan "Terrain interaction"): elevation, slope,
 * aspect and the terrain normal from the canonical metric grid by central
 * differences with δ = max(cell size, 0.5 m). The visual mesh is never asked.
 * Heights are NAVD88 orthometric metres (the package's vertical datum); shot
 * ΔU between two samples of the same grid is datum-free. */
export interface TerrainSample {
  elevationM: number;
  /** Null when neither neighbour along an axis is inside the grid. */
  slopeDegrees: number | null;
  /** Downhill bearing, degrees clockwise from grid north; null on flat or unknown ground. */
  aspectDegrees: number | null;
  gradient: readonly [dzdE: number, dzdN: number] | null;
  normal: readonly [number, number, number] | null;
  deltaM: number;
  elevationQuality: 'LIDAR' | 'INTERPOLATED';
  verticalDatum: 'NAVD88';
  basis: 'central_differences_metric_grid' | 'central_differences_display_triangles';
}
export function terrainDeltaM(mesh: Pick<TerrainMesh, 'metricGrid'>): number {
  return Math.max(mesh.metricGrid?.spacingM ?? 0, .5);
}
export function sampleTerrain(mesh: TerrainMesh, [e, n]: PointM): TerrainSample | null {
  const z = terrainHeight(mesh, [e, n]);
  if (z == null) return null;
  const delta = terrainDeltaM(mesh);
  const east = terrainHeight(mesh, [e + delta, n]), west = terrainHeight(mesh, [e - delta, n]);
  const north = terrainHeight(mesh, [e, n + delta]), south = terrainHeight(mesh, [e, n - delta]);
  const dzdE = east != null && west != null ? (east - west) / (2 * delta) : east != null ? (east - z) / delta : west != null ? (z - west) / delta : null;
  const dzdN = north != null && south != null ? (north - south) / (2 * delta) : north != null ? (north - z) / delta : south != null ? (z - south) / delta : null;
  const gradient = dzdE != null && dzdN != null ? [dzdE, dzdN] as const : null;
  const slope = gradient ? Math.atan(Math.hypot(gradient[0], gradient[1])) * 180 / Math.PI : null;
  const length = gradient ? Math.hypot(gradient[0], gradient[1], 1) : 0;
  const normal = gradient ? [-gradient[0] / length, -gradient[1] / length, 1 / length] as const : null;
  const aspect = gradient && Math.hypot(gradient[0], gradient[1]) > 1e-9 ? (Math.atan2(-gradient[0], -gradient[1]) * 180 / Math.PI + 360) % 360 : null;
  return { elevationM: z, slopeDegrees: slope, aspectDegrees: aspect, gradient, normal, deltaM: delta,
    elevationQuality: mesh.metricGrid ? 'LIDAR' : 'INTERPOLATED', verticalDatum: 'NAVD88',
    basis: mesh.metricGrid ? 'central_differences_metric_grid' : 'central_differences_display_triangles' };
}
