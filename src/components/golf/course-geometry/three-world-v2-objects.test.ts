import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseContextLayer } from '@/lib/golf/course-geometry/context-layer';
import { weldAndCleanTerrainMesh } from '@/lib/golf/course-geometry/display-mesh-v2';
import { compileForestEdgeV2 } from '@/lib/golf/course-geometry/forest-edge-v2';
import { compilePathRibbon } from '@/lib/golf/course-geometry/path-ribbon';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { buildV2Objects, V2_CROWN_LOD_SCREEN_PX } from './three-world-v2-objects';

const fixtures = new URL('../../../test/fixtures/course-geometry/', import.meta.url);
function loadHole7() {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const mesh = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const context = parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg);
  const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], mesh, context);
  return { mesh, scene };
}

describe('V2 world objects (§52–62; Task 18)', () => {
  it('draws hole 7 paths in one draw and every forest instance in a handful of instanced draws, then disposes', () => {
    const { mesh, scene } = loadHole7();
    const base = weldAndCleanTerrainMesh(mesh);
    const ribbon = compilePathRibbon(scene, mesh, base);
    const forest = compileForestEdgeV2(scene, mesh);
    const focusBoundsM = mesh.renderProfile!.tacticalBoundsM;
    const objects = buildV2Objects({ ribbon, forest, scene, mesh, focusBoundsM });
    expect(objects.stats.draws.paths).toBe(1);
    // Task 17 (R8): V1's footprint extrusions ride along; its ribbons do not.
    expect(objects.stats.structures).toBeGreaterThan(0);
    // ...and stand up: some structure vertex sits above its ground sample (lift applied).
    const structures = objects.group.getObjectByName('golf-course-context')!.children.find(c => c.name.startsWith('context-structures-')) as THREE.Mesh;
    const sp = structures.geometry.getAttribute('position');
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < sp.count; i++) { zMin = Math.min(zMin, sp.getZ(i)); zMax = Math.max(zMax, sp.getZ(i)); }
    expect(zMax - zMin).toBeGreaterThan(2);
    expect(objects.group.getObjectByName('golf-course-context')!.children.some(c => c.name.startsWith('context-ribbons-'))).toBe(false);
    expect(objects.stats.pathRuns).toBe(ribbon!.runs.length);
    expect(objects.stats.instances.crown + objects.stats.instances.shrub + objects.stats.instances.mass).toBe(forest.instances.length);
    // §37: trunks stand under near and distant crowns only, never far ones.
    const lod = objects.forestStats!.crownLod;
    expect(lod.near + lod.distant + lod.far).toBe(objects.stats.instances.crown);
    expect(objects.stats.instances.trunks).toBe(lod.near + lod.distant);
    expect(lod.near).toBeGreaterThan(0);
    expect(lod.near).toBeLessThanOrEqual(V2_CROWN_LOD_SCREEN_PX.nearBudget);
    const draws = Object.values(objects.stats.draws).reduce((a, b) => a + b, 0);
    expect(draws).toBeLessThanOrEqual(12 + objects.stats.draws.context);
    let meshes = 0, instanced = 0, batched = 0;
    objects.group.traverse(o => { if (o instanceof THREE.InstancedMesh) instanced++; else if (o instanceof THREE.BatchedMesh) batched++; else if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(1 + objects.stats.draws.context - (objects.group.getObjectByName('golf-course-context')!.children.filter(c => c instanceof THREE.LineSegments).length)); // paths + context meshes
    // Every forest family is a BatchedMesh (per-instance frustum culling, §11); nothing is an InstancedMesh.
    expect(batched).toBe(draws - 1 - objects.stats.draws.context); // crowns, trunks, shrubs, mass (both cluster builds in one draw)
    expect(objects.stats.draws.mass).toBe(1);
    expect(instanced).toBe(0);
    // Every crown LOD is a deterministic function of the focus: the same input builds the same split.
    const again = buildV2Objects({ ribbon, forest, scene, mesh, focusBoundsM });
    expect(again.forestStats).toEqual(objects.forestStats);
    expect(again.stats.triangles).toBe(objects.stats.triangles);
    again.dispose();
    // Trees stand on the terrain: every crown instance sits above its ground sample.
    const crowns = objects.group.getObjectByName('v2-crowns') as THREE.BatchedMesh;
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    crowns.getMatrixAt(0, m); p.setFromMatrixPosition(m);
    const first = forest.instances.find(i => i.kind === 'crown')!;
    expect(p.z).toBeGreaterThan(first.z);
    expect(() => objects.dispose()).not.toThrow();
  });
  it('re-LODs crowns, trunks and mass per camera by projected size (§37/§68, V1\'s rule) and books the change', () => {
    const { mesh, scene } = loadHole7();
    const forest = compileForestEdgeV2(scene, mesh);
    const focusBoundsM = mesh.renderProfile!.tacticalBoundsM;
    const objects = buildV2Objects({ ribbon: null, forest, scene, focusBoundsM });
    const crownCount = objects.stats.instances.crown;
    const built = { triangles: objects.stats.triangles, forest: structuredClone(objects.forestStats!), trunks: objects.stats.instances.trunks };
    expect(built.forest.crownLodBasis).toBe('focus_bands');
    // The build's split is the no-lens rule: re-judging it without a camera changes nothing.
    expect(objects.setDetail('near')).toBe(false);
    expect(objects.stats.triangles).toBe(built.triangles);
    // A phone standing among the trees: eye 1.7 m over the ground beside the
    // crown nearest the focus, a phone's focal length in CSS px.
    const centre: [number, number] = [(focusBoundsM[0] + focusBoundsM[2]) / 2, (focusBoundsM[1] + focusBoundsM[3]) / 2];
    const crowns = forest.instances.filter(i => i.kind === 'crown');
    const nearest = crowns.reduce((best, i) => Math.hypot(i.x - centre[0], i.y - centre[1]) < Math.hypot(best.x - centre[0], best.y - centre[1]) ? i : best);
    const eye: [number, number, number] = [nearest.x + 12, nearest.y, nearest.z + 1.7];
    expect(objects.setDetail('near', centre, { eye, focalPx: 1575 })).toBe(true);
    const near = objects.forestStats!;
    expect(near.crownLodBasis).toBe('screen_px');
    expect(near.crownLod.near).toBeGreaterThan(0);
    expect(near.crownLod.near).toBeLessThanOrEqual(V2_CROWN_LOD_SCREEN_PX.nearBudget);
    expect(near.crownLod.near + near.crownLod.distant + near.crownLod.far).toBe(crownCount);
    // Trunks stand under near and distant crowns only; far crowns keep theirs hidden, not deleted.
    expect(objects.stats.instances.trunks).toBe(near.crownLod.near + near.crownLod.distant);
    const trunks = objects.group.getObjectByName('v2-trunks') as THREE.BatchedMesh;
    let visible = 0;
    for (let i = 0; i < crownCount; i++) if (trunks.getVisibleAt(i)) visible++;
    expect(visible).toBe(objects.stats.instances.trunks);
    // The nearest crown itself projects hundreds of px: it is near, with its 7-sided trunk.
    const crownMesh = objects.group.getObjectByName('v2-crowns') as THREE.BatchedMesh;
    const nearestIndex = crowns.indexOf(nearest);
    expect(crownMesh.getGeometryIdAt(nearestIndex) % 3).toBe(0); // geometry ids are added near, distant, far per variant
    expect(trunks.getGeometryIdAt(nearestIndex)).toBe(0);
    // Mass lobes that project at least `mass.lodScreenPx` keep the full cluster.
    expect(near.massLod.near).toBeGreaterThan(0);
    // The same lens with a picture frame looking straight away from that
    // crown: it is at the camera's back, so it leaves the near budget to the
    // trees in view and drops to the far card with no trunk.
    const frame = { right: [0, -1, 0] as const, up: [0, 0, 1] as const, forward: [1, 0, 0] as const, principalPx: [195, 422] as const, widthPx: 390, heightPx: 844 };
    expect(objects.setDetail('near', centre, { eye, focalPx: 1575, frame })).toBe(true);
    expect(crownMesh.getGeometryIdAt(nearestIndex) % 3).toBe(2);
    expect(trunks.getVisibleAt(nearestIndex)).toBe(false);
    expect(objects.forestStats!.crownLod.near).toBeLessThanOrEqual(V2_CROWN_LOD_SCREEN_PX.nearBudget);
    // A tier without near crowns, seen from 50 km away: everything far, no trunk drawn, no full cluster.
    expect(objects.setDetail('distant', centre, { eye: [eye[0] + 50_000, eye[1], eye[2]], focalPx: 1575 })).toBe(true);
    expect(objects.forestStats!.crownLod).toEqual({ near: 0, distant: 0, far: crownCount });
    expect(objects.stats.instances.trunks).toBe(0);
    expect(objects.stats.draws.trunks).toBe(0);
    expect(objects.forestStats!.massLod.near).toBe(0);
    const farTriangles = objects.stats.triangles;
    expect(farTriangles).toBeLessThan(built.triangles);
    // Back to the build's rule: the incremental books return exactly to the build.
    expect(objects.setDetail('near')).toBe(true);
    expect(objects.stats.triangles).toBe(built.triangles);
    expect(objects.stats.instances.trunks).toBe(built.trunks);
    expect(objects.stats.draws.trunks).toBe(1);
    expect(objects.forestStats).toEqual(built.forest);
    // The same view on a fresh build lands on the same split (deterministic ties).
    const again = buildV2Objects({ ribbon: null, forest, scene, focusBoundsM });
    again.setDetail('near', centre, { eye, focalPx: 1575 });
    objects.setDetail('near', centre, { eye, focalPx: 1575 });
    expect(again.forestStats).toEqual(objects.forestStats);
    expect(again.stats.triangles).toBe(objects.stats.triangles);
    again.dispose(); objects.dispose();
    expect(objects.setDetail('distant')).toBe(false);
  });
  it('is empty without inputs', () => {
    const { scene } = loadHole7();
    const objects = buildV2Objects({ ribbon: null, forest: null, scene });
    expect(objects.group.children).toHaveLength(0);
    expect(objects.stats.triangles).toBe(0);
    expect(objects.setDetail('near', [0, 0], { eye: [0, 0, 2], focalPx: 1000 })).toBe(false);
  });
});
