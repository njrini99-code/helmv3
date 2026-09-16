import type { HoleScene, LocalFeature, PointM } from './types';
import { allocateCrowns, canopySymbols, crownScale } from './canopy';

const SVG_CROWN_LIMIT = 240;
import { displayOutline } from './display-outline';
import { projectTerrainPoint, terrainHeight, TERRAIN_LIGHT_DIRECTION, type Point3M, type TerrainCamera, type TerrainMesh } from './terrain';

interface WorldCrown {
  id: string;
  point: Point3M;
  radiusM: number;
  illustrativeHeightM: number;
  shadow: { point: Point3M; east: Point3M; north: Point3M } | null;
  seed: number;
}
interface CanopyWorld { crowns: WorldCrown[]; guards: Point3M[][][] }
const cache = new WeakMap<readonly LocalFeature[], WeakMap<TerrainMesh, CanopyWorld>>();
const screenPoint = (point: Point3M, camera: TerrainCamera): PointM => {
  const [x, y] = projectTerrainPoint(point, camera);
  return [x, y];
};
const difference = (a: PointM, b: PointM): PointM => [a[0] - b[0], a[1] - b[1]];

function prepareCanopy(scene: HoleScene, mesh: TerrainMesh): CanopyWorld {
  const crowns: WorldCrown[] = [];
  const groups = scene.features.filter(f => f.kind === 'woods');
  const allocated = allocateCrowns(groups.map(feature => canopySymbols(feature, scene)), SVG_CROWN_LIMIT);
  for (const [groupIndex, feature] of groups.entries()) {
    for (const [seed, point] of allocated[groupIndex]!.entries()) {
      const z = terrainHeight(mesh, point);
      if (z == null || crowns.length >= SVG_CROWN_LIMIT) continue;
      const radiusM = 3.6 * crownScale(seed), illustrativeHeightM = radiusM * 1.55;
      // A stylistic shadow uses the same world light as the terrain, never an
      // image's detached dark patch. Sample its actual ground; omit it outside
      // coverage rather than drawing a floating shadow at a guessed height.
      const sx = point[0] - TERRAIN_LIGHT_DIRECTION[0] / TERRAIN_LIGHT_DIRECTION[2] * illustrativeHeightM;
      const sy = point[1] - TERRAIN_LIGHT_DIRECTION[1] / TERRAIN_LIGHT_DIRECTION[2] * illustrativeHeightM;
      const sz = terrainHeight(mesh, [sx, sy]);
      const eastZ = terrainHeight(mesh, [sx + radiusM, sy]);
      const northZ = terrainHeight(mesh, [sx, sy + radiusM]);
      const shadow = sz != null && eastZ != null && northZ != null ? {
        point: [sx, sy, sz] as Point3M,
        east: [sx + radiusM, sy, eastZ] as Point3M,
        north: [sx, sy + radiusM, northZ] as Point3M,
      } : null;
      crowns.push({ id: `${feature.id}:${seed}`, point: [point[0], point[1], z], radiusM, illustrativeHeightM, shadow, seed });
    }
  }
  const guards = scene.features.filter(f => f.kind !== 'woods' && f.kind !== 'route' && f.kind !== 'rough')
    .flatMap(f => displayOutline(f).parts).map(part => part.map(ring => ring.map(point => {
      const z = terrainHeight(mesh, point);
      return z == null ? null : [point[0], point[1], z] as Point3M;
    }))).filter((part): part is Point3M[][] => part.every(ring => ring.every(p => p != null)));
  return { crowns, guards };
}

/** Source-mask decoration only. Crown centres, dimensions and light are
 * illustrative, never tree observations, obstacle heights or ball evidence.
 * Every base, lifted centre and ground shadow uses the physical camera. Ground
 * elevation alone is exaggerated; local canopy height and sunlight are not. */
export function terrainCanopy(scene: HoleScene, mesh: TerrainMesh, camera: TerrainCamera) {
  let featureCache = cache.get(scene.features);
  if (!featureCache) { featureCache = new WeakMap(); cache.set(scene.features, featureCache); }
  let world = featureCache.get(mesh);
  if (!world) { world = prepareCanopy(scene, mesh); featureCache.set(mesh, world); }
  const { right, up, forward, scale } = camera;
  const light: PointM = [right[0] * TERRAIN_LIGHT_DIRECTION[0] + right[1] * TERRAIN_LIGHT_DIRECTION[1] + right[2] * TERRAIN_LIGHT_DIRECTION[2],
    -(up[0] * TERRAIN_LIGHT_DIRECTION[0] + up[1] * TERRAIN_LIGHT_DIRECTION[1] + up[2] * TERRAIN_LIGHT_DIRECTION[2])];
  const lightLength = Math.hypot(...light);
  const lightScreen: PointM = lightLength > 1e-8 ? [light[0] / lightLength, light[1] / lightLength] : [0, -1];
  const crowns = world.crowns.map(crown => {
    const [bx, by, baseDepth] = projectTerrainPoint(crown.point, camera);
    const base: PointM = [bx, by];
    // Project displayed ground first, then add a world-up local height using
    // the camera basis. Feeding tree height into the ground projector would
    // incorrectly stretch it whenever visual terrain exaggeration changes.
    const cx = bx + right[2] * crown.illustrativeHeightM * scale;
    const cy = by - up[2] * crown.illustrativeHeightM * scale;
    const depth = baseDepth + forward[2] * crown.illustrativeHeightM;
    const centre: PointM = [cx, cy];
    const shadow = crown.shadow ? screenPoint(crown.shadow.point, camera) : null;
    const shadowBasis = crown.shadow && shadow ? {
      right: difference(screenPoint(crown.shadow.east, camera), shadow),
      up: difference(screenPoint(crown.shadow.north, camera), shadow),
    } : null;
    return { id: crown.id, x: base[0], y: base[1], base, centre, shadow, shadowBasis, lightScreen,
      depth, seed: crown.seed, radius: camera.scale * crown.radiusM,
      heightPx: Math.hypot(cx - base[0], cy - base[1]),
      worldBaseM: crown.point, illustrativeHeightM: crown.illustrativeHeightM };
  }).sort((a, b) => b.depth - a.depth);
  const guardPaths = world.guards.map(part => part.map(ring => ring.map((point, i) => {
    const [x, y] = projectTerrainPoint(point, camera);
    return `${i ? 'L' : 'M'}${x.toFixed(4)},${y.toFixed(4)}`;
  }).join(' ') + ' Z').join(' '));
  return { crowns, guardPaths, tilt: 1 - Math.sin(camera.pitch * Math.PI / 180) };
}
export type TerrainCanopy = ReturnType<typeof terrainCanopy>;
