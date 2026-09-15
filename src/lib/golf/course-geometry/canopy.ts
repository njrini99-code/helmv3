import type { HoleScene, LocalFeature, PointM } from './types';
import { inFeature } from './spatial';
import { boundaryDistance } from './display-outline';

const cache = new WeakMap<HoleScene, Map<LocalFeature, readonly PointM[]>>();
const silhouettes = new Map<number, string>();
function variation(seed: number): number {
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
export function crownScale(index: number): number {
  return .74 + variation(index + 11) * .38;
}
/** Bounded stylized canopy silhouette. These lobes describe artwork only;
 * neither their centre nor their outline is an individual tree observation. */
export function crownOutline(seed: number): string {
  // A bounded artwork atlas avoids rebuilding curves on every camera frame.
  const variant = Math.abs(seed) % 32;
  const cached = silhouettes.get(variant);
  if (cached) return cached;
  const lobes = 5 + variant % 3;
  const phase = variation(variant + 3) * Math.PI * 2;
  const points: PointM[] = Array.from({ length: 24 }, (_, index) => {
    const angle = index * Math.PI / 12;
    const radius = .87 + .09 * Math.sin(angle * lobes + phase) + .025 * Math.sin(angle * 3 - phase);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius * (.88 + variation(variant + 19) * .12)];
  });
  const midpoint = (a: PointM, b: PointM) => `${((a[0] + b[0]) / 2).toFixed(3)},${((a[1] + b[1]) / 2).toFixed(3)}`;
  const path = `M${midpoint(points[points.length - 1]!, points[0]!)} ` + points.map((p, index) =>
    `Q${p[0].toFixed(3)},${p[1].toFixed(3)} ${midpoint(p, points[(index + 1) % points.length]!)}`).join(' ') + ' Z';
  silhouettes.set(variant, path);
  return path;
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
  const spacing = 9;
  const minX = Math.floor(Math.min(...xs) / spacing) * spacing, maxX = Math.max(...xs);
  const minY = Math.floor(Math.min(...ys) / spacing) * spacing, maxY = Math.max(...ys);
  const cols = Math.ceil((maxX - minX) / spacing), rows = Math.ceil((maxY - minY) / spacing);
  if (cols * rows > 6000) return []; // Large source masses stay plain silhouettes.
  rowsLoop: for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const seed = Math.imul(col + Math.round(minX), 73856093) ^ Math.imul(row + Math.round(minY), 19349663);
    const jitterX = ((seed >>> 0) % 1024 / 1024 - .5) * 7;
    const jitterY = ((Math.imul(seed, 1664525) >>> 0) % 1024 / 1024 - .5) * 7;
    const point: PointM = [minX + col * spacing + (row % 2 ? spacing / 2 : 0) + jitterX, minY + row * spacing + jitterY];
    if (!inFeature(point, feature) || feature.parts.flat().some(ring => boundaryDistance(point, ring) < 4.2)) continue;
    if (scene.features.some(f => f.kind !== 'woods' && f.kind !== 'route' && (inFeature(point, f) || f.parts.flat().some(ring => boundaryDistance(point, ring) < 4.2)))) continue;
    if (points.some(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < 5.4)) continue;
    points.push(point);
    if (points.length >= 220) break rowsLoop;
  }
  sceneCache.set(feature, points);
  cache.set(scene, sceneCache);
  return points;
}
