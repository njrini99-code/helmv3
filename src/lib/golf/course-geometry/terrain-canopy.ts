import type { HoleScene } from './types';
import { canopySymbols, crownScale } from './canopy';
import { displayOutline } from './display-outline';
import { projectTerrainPoint, terrainHeight, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';

interface CanopyWorld { crowns: { id: string; point: Point3M; seed: number }[]; guards: Point3M[][][] }
const cache = new WeakMap<TerrainMesh, CanopyWorld>();
/** Source-mask decoration only. Crown centres/size/lift are illustrative,
 * never tree observations, obstacle heights or ball-position evidence. */
export function terrainCanopy(scene: HoleScene, mesh: TerrainMesh, camera: TerrainCamera) {
  let world = cache.get(mesh);
  if (!world) {
    const crowns: CanopyWorld['crowns'] = [];
    for (const feature of scene.features.filter(f => f.kind === 'woods')) {
      for (const [seed, point] of canopySymbols(feature, scene).entries()) {
        const z = terrainHeight(mesh, point);
        if (z != null && crowns.length < 240) crowns.push({ id: `${feature.id}:${seed}`, point: [point[0], point[1], z], seed });
      }
    }
    const guards = scene.features.filter(f => f.kind !== 'woods' && f.kind !== 'route' && f.kind !== 'rough')
      .flatMap(f => displayOutline(f).parts).map(part => part.map(ring => ring.map(point => {
        const z = terrainHeight(mesh, point);
        return z == null ? null : [point[0], point[1], z] as Point3M;
      }))).filter((part): part is Point3M[][] => part.every(ring => ring.every(p => p != null)));
    world = { crowns, guards }; cache.set(mesh, world);
  }
  const crowns = world.crowns.map(crown => {
    const [x, y, depth] = projectTerrainPoint(crown.point, camera);
    return { id: crown.id, x, y, depth, seed: crown.seed, radius: camera.scale * 3.6 * crownScale(crown.seed) };
  }).sort((a, b) => b.depth - a.depth);
  const guardPaths = world.guards.map(part => part.map(ring => ring.map((point, i) => {
    const [x, y] = projectTerrainPoint(point, camera);
    return `${i ? 'L' : 'M'}${x.toFixed(4)},${y.toFixed(4)}`;
  }).join(' ') + ' Z').join(' '));
  return { crowns, guardPaths, tilt: 1 - Math.sin(camera.pitch * Math.PI / 180) };
}
export type TerrainCanopy = ReturnType<typeof terrainCanopy>;
