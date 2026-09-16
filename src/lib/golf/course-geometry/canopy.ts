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
  // A small group keeps the 9m pattern. A large forest mass widens the
  // pattern instead of dropping out, so its edge still reads as trees while
  // the cell count stays bounded.
  const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
  const spacing = Math.max(9, Math.ceil(Math.sqrt((spanX * spanY) / MAX_PATTERN_CELLS)));
  const minX = Math.floor(Math.min(...xs) / spacing) * spacing, maxX = Math.max(...xs);
  const minY = Math.floor(Math.min(...ys) / spacing) * spacing, maxY = Math.max(...ys);
  const cols = Math.ceil((maxX - minX) / spacing), rows = Math.ceil((maxY - minY) / spacing);
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const seed = Math.imul(col + Math.round(minX), 73856093) ^ Math.imul(row + Math.round(minY), 19349663);
    const jitterX = ((seed >>> 0) % 1024 / 1024 - .5) * 7;
    const jitterY = ((Math.imul(seed, 1664525) >>> 0) % 1024 / 1024 - .5) * 7;
    const point: PointM = [minX + col * spacing + (row % 2 ? spacing / 2 : 0) + jitterX, minY + row * spacing + jitterY];
    if (!inFeature(point, feature) || feature.parts.flat().some(ring => boundaryDistance(point, ring) < 4.2)) continue;
    if (scene.features.some(f => f.kind !== 'woods' && f.kind !== 'route' && (inFeature(point, f) || f.parts.flat().some(ring => boundaryDistance(point, ring) < 4.2)))) continue;
    if (points.some(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < 5.4)) continue;
    points.push(point);
  }
  // Over budget: keep an even spread across the whole group rather than the
  // first rows of the scan, which left large groups bare on one side.
  const kept = evenSubset(points, MAX_CROWNS_PER_GROUP);
  sceneCache.set(feature, kept);
  cache.set(scene, sceneCache);
  return kept;
}
const MAX_PATTERN_CELLS = 6000, MAX_CROWNS_PER_GROUP = 600;
export function evenSubset<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items];
  const stride = items.length / limit;
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * stride)]!);
}
/** Share one crown budget across several groups in proportion to each group's
 * own pattern, so a hole lined by forest on both sides gets trees on both.
 * With a `priority`, the lowest-scoring crowns of each group are kept (for
 * example the ones nearest the playing surfaces) instead of an even spread. */
export function allocateCrowns<T>(groups: readonly (readonly T[])[], limit: number, priority?: (item: T) => number): T[][] {
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  if (total <= limit) return groups.map(group => [...group]);
  const exact = groups.map(group => group.length / total * limit);
  const shares = exact.map(Math.floor);
  let remaining = limit - shares.reduce((sum, share) => sum + share, 0);
  // Leftover budget goes first to groups the floor left empty, so a small
  // copse beside a forest still shows a tree, then by largest remainder.
  const order = shares.map((_, index) => index).sort((a, b) =>
    (shares[a]! === 0 ? 0 : 1) - (shares[b]! === 0 ? 0 : 1) || (exact[b]! - shares[b]!) - (exact[a]! - shares[a]!) || a - b);
  for (const index of order) {
    if (remaining <= 0) break;
    if (shares[index]! < groups[index]!.length) { shares[index]!++; remaining--; }
  }
  return groups.map((group, index) => priority
    ? [...group].map((item, order) => ({ item, order, score: priority(item) }))
      .sort((a, b) => a.score - b.score || a.order - b.order).slice(0, shares[index]!).map(entry => entry.item)
    : evenSubset(group, shares[index]!));
}
