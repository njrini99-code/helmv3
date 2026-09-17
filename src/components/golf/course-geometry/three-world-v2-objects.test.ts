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
import { buildV2Objects } from './three-world-v2-objects';

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
    expect(lod.near).toBeLessThanOrEqual(120);
    const draws = Object.values(objects.stats.draws).reduce((a, b) => a + b, 0);
    expect(draws).toBeLessThanOrEqual(12 + objects.stats.draws.context);
    let meshes = 0, instanced = 0, batched = 0;
    objects.group.traverse(o => { if (o instanceof THREE.InstancedMesh) instanced++; else if (o instanceof THREE.BatchedMesh) batched++; else if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBe(1 + objects.stats.draws.context - (objects.group.getObjectByName('golf-course-context')!.children.filter(c => c instanceof THREE.LineSegments).length)); // paths + context meshes
    expect(batched).toBe(2); // crowns, trunks
    expect(instanced).toBe(draws - 3 - objects.stats.draws.context);
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
  it('is empty without inputs', () => {
    const { scene } = loadHole7();
    const objects = buildV2Objects({ ribbon: null, forest: null, scene });
    expect(objects.group.children).toHaveLength(0);
    expect(objects.stats.triangles).toBe(0);
  });
});
