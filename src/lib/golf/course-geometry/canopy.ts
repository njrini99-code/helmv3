import type { HoleScene, LocalFeature, PointM } from './types';
import { inFeature } from './spatial';
import { boundaryDistance } from './display-outline';

const cache = new WeakMap<HoleScene, Map<LocalFeature, readonly PointM[]>>();
export function crownScale(index: number): number {
  return .78 + ((Math.imul(index + 11, 1664525) >>> 0) % 1024) / 1024 * .32;
}
/** Decorative crown pattern within reviewed canopy groups. Pattern centers are
 * not tree observations and are never accepted as ball/surface evidence. */
export function canopySymbols(feature: LocalFeature, scene: HoleScene): readonly PointM[] {
  if (feature.kind !== 'woods' || !feature.reviewed) return [];
  const sceneCache = cache.get(scene) ?? new Map<LocalFeature, readonly PointM[]>();
  const cached = sceneCache.get(feature);
  if (cached) return cached;
  const vertices = feature.parts.flat(2), xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1]);
  const points: PointM[] = [];
  const minX = Math.floor(Math.min(...xs) / 10) * 10, maxX = Math.max(...xs);
  const minY = Math.floor(Math.min(...ys) / 10) * 10, maxY = Math.max(...ys);
  const cols = Math.ceil((maxX - minX) / 10), rows = Math.ceil((maxY - minY) / 10);
  if (cols * rows > 6000) return []; // Large source masses stay plain silhouettes.
  rowsLoop: for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const seed = Math.imul(col + Math.round(minX), 73856093) ^ Math.imul(row + Math.round(minY), 19349663);
    const jitterX = ((seed >>> 0) % 1024 / 1024 - .5) * 7;
    const jitterY = ((Math.imul(seed, 1664525) >>> 0) % 1024 / 1024 - .5) * 7;
    const point: PointM = [minX + col * 10 + (row % 2 ? 5 : 0) + jitterX, minY + row * 10 + jitterY];
    if (!inFeature(point, feature) || feature.parts.flat().some(ring => boundaryDistance(point, ring) < 4)) continue;
    if (scene.features.some(f => f.kind !== 'woods' && f.kind !== 'route' && (inFeature(point, f) || f.parts.flat().some(ring => boundaryDistance(point, ring) < 4)))) continue;
    if (points.some(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < 6)) continue;
    points.push(point);
    if (points.length >= 220) break rowsLoop;
  }
  sceneCache.set(feature, points);
  cache.set(scene, sceneCache);
  return points;
}
