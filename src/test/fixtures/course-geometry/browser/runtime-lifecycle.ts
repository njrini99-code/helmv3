/** Real WebGL replacement regression. Imported by the local browser harness
 * only; it does not register a player route or touch round persistence. */
import { createThreeTerrainRuntime, type ThreeTerrainRuntime } from '@/lib/golf/course-geometry/three-renderer';
import { fitTerrainCamera, parseTerrainMesh, TERRAIN_PRESETS } from '@/lib/golf/course-geometry/terrain';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { pilotPackage } from '../pilot';
import source from '../cacapon-07-terrain.json';

export async function verifyRuntimeReplacement() {
  const mesh = parseTerrainMesh(source, pilotPackage), original = buildHoleScene(pilotPackage, 'cacapon-07', [], mesh);
  const scene = { ...original, features: original.features.filter(feature => feature.kind !== 'woods'),
    contextFeatures: original.features.filter(feature => feature.kind === 'woods') };
  const camera = fitTerrainCamera(scene, mesh, 'hole', 390, 640, TERRAIN_PRESETS.terrain);
  const host = document.createElement('div'), canvas = document.createElement('canvas');
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.append(canvas, overlay); document.body.append(host);
  let active: ThreeTerrainRuntime | null = null;
  const failures: string[] = [];
  const options = { canvas, overlay, overlayId: 'replacement-regression', scene, mesh, camera, width: 390, height: 640,
    onUnavailable: () => { failures.push('unavailable'); } };
  try {
    active = createThreeTerrainRuntime(options); await active.ready;
    const first = { ...canvas.dataset }, gl = canvas.getContext('webgl2');
    if (!gl || first.terrainState !== 'ready' || Number(first.terrainTrees) < 1) throw new Error('Initial reviewed canopy did not render');
    active.dispose();
    if (gl.isContextLost()) throw new Error('Connected canvas lost its context during replacement');
    const revised = { ...scene, contextFeatures: scene.contextFeatures.map(feature => ({ ...feature, reviewed: false })) };
    active = createThreeTerrainRuntime({ ...options, scene: revised }); await active.ready;
    const second = { ...canvas.dataset };
    if (second.terrainState !== 'ready' || gl.isContextLost() || failures.length) throw new Error('Replacement runtime did not render');
    if (Number(second.terrainTrees) !== 0) throw new Error('Revoked canopy remains visible');
    host.remove(); active.dispose();
    if (!gl.isContextLost()) throw new Error('Removed canvas retained its context');
    return { first, second, connectedReplacement: 'passed', finalContextRelease: 'passed', failures };
  } finally { host.remove(); active?.dispose(); }
}
