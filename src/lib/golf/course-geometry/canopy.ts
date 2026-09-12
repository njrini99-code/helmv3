import type { HoleScene, LocalFeature, PointM } from './types';
import { inFeature } from './spatial';
import { boundaryDistance } from './display-outline';

const cache = new WeakMap<HoleScene, Map<LocalFeature, readonly PointM[]>>();
/** Decorative crown pattern within reviewed canopy groups. Pattern centers are
 * not tree observations and are never accepted as ball/surface evidence. */
export function canopySymbols(feature: LocalFeature, scene: HoleScene): readonly PointM[] {
  if (feature.kind !== 'woods' || !feature.reviewed) return [];
  const sceneCache = cache.get(scene) ?? new Map<LocalFeature, readonly PointM[]>();
  const cached = sceneCache.get(feature);
  if (cached) return cached;
  const vertices = feature.parts.flat(2), xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1]);
  const points: PointM[] = [];
  const minX = Math.floor(Math.min(...xs) / 7.5) * 7.5, maxX = Math.max(...xs);
  const minY = Math.floor(Math.min(...ys) / 7.5) * 7.5, maxY = Math.max(...ys);
  const cols = Math.ceil((maxX - minX) / 7.5), rows = Math.ceil((maxY - minY) / 7.5);
  if (cols * rows > 6000) return []; // Large source masses stay plain silhouettes.
  rowsLoop: for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const point: PointM = [minX + col * 7.5 + (row % 2 ? 3.75 : 0), minY + row * 7.5];
    if (!inFeature(point, feature) || feature.parts.flat().some(ring => boundaryDistance(point, ring) < 2.8)) continue;
    if (scene.features.some(f => f.kind !== 'woods' && f.kind !== 'route' && (inFeature(point, f) || f.parts.flat().some(ring => boundaryDistance(point, ring) < 3)))) continue;
    points.push(point);
    if (points.length >= 220) break rowsLoop;
  }
  sceneCache.set(feature, points);
  cache.set(scene, sceneCache);
  return points;
}
