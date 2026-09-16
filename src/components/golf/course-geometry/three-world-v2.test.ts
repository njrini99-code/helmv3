import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { assembleV2World, buildV2World, rewindTrianglesCCW } from './three-world-v2';

// Same hole-7 fixture bunker-display-mesh.test.ts and hero-patches.test.ts
// use: a real compiled course with a green complex owning three greenside
// bunkers plus three standalone fairway bunkers, so `compileHeroPatches`
// always returns exactly 4 patches for it (no context layer needed).
const fixtures = new URL('../../../test/fixtures/course-geometry/', import.meta.url);
function loadHole7(): { mesh: TerrainMesh; scene: HoleScene } {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes['peek-n-peak-upper-07']!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const mesh = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const scene = buildHoleScene(pkg, 'peek-n-peak-upper-07', [], mesh);
  return { mesh, scene };
}

describe('Meridian V2 runtime world (Task 11)', () => {
  it('assembles hole 7 into a non-null world with its 4 hero patches', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh);
    expect(input).not.toBeNull();
    expect(input!.patches.length).toBe(4);
    expect(input!.patchedRangeIds.size).toBe(4);
    expect(input!.boundsM.every(Number.isFinite)).toBe(true);
  });

  it('falls back to null (V1, R7) when the mesh has no metricGrid, warning once', () => {
    const { mesh, scene } = loadHole7();
    const stripped: TerrainMesh = { ...mesh, metricGrid: undefined };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(assembleV2World(scene, stripped)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('builds one shared ground material, >40k base triangles excluding hero ranges, 4 patches, finite upward-lit geometry', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);

    expect(built.stats.patches).toBe(4);
    expect(built.stats.draws).toBe(5);
    expect(built.stats.baseTriangles).toBeGreaterThan(40_000);
    expect(built.stats.triangles).toBe(built.stats.baseTriangles + built.stats.patchTriangles);

    const [base, ...patchMeshes] = built.group.children as THREE.Mesh[];
    // A base draw relies on index groups to exclude patched hero ranges, and
    // three only honors geometry.groups when the mesh material is an array;
    // a patch mesh has no groups, and an array material with zero groups
    // would render nothing at all — so the two must be wired differently
    // even though they share the same underlying material instance.
    expect(Array.isArray(base!.material)).toBe(true);
    const baseMaterial = (base!.material as THREE.Material[])[0]!;
    expect((base!.geometry as THREE.BufferGeometry).groups.length).toBeGreaterThan(0);
    expect(patchMeshes.length).toBe(4);
    for (const patchMesh of patchMeshes) {
      expect(Array.isArray(patchMesh.material)).toBe(false);
      expect(patchMesh.material).toBe(baseMaterial);
      expect((patchMesh.geometry as THREE.BufferGeometry).groups.length).toBe(0);
    }

    const positions = (base!.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < positions.count; i += 997) {
      expect(Number.isFinite(positions.getX(i))).toBe(true);
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
    }
    // Consistent CCW winding after `rewindTrianglesCCW` means
    // computeVertexNormals() points the base mesh's normals up (+Z); half
    // the mesh would point down and this mean would collapse toward 0 if
    // the canonical mesh's mixed winding went uncorrected.
    const normal = (base!.geometry as THREE.BufferGeometry).getAttribute('normal');
    let sumZ = 0;
    for (let i = 0; i < normal.count; i++) sumZ += normal.getZ(i);
    expect(sumZ / normal.count).toBeGreaterThan(0.8);

    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    built.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1 + input.patches.length);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    geometryDispose.mockRestore(); materialDispose.mockRestore();
  });

  it('rewinds a clockwise triangle to counter-clockwise and leaves a counter-clockwise one alone', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]); // (0,0),(1,0),(0,1): CCW, signed area > 0
    expect(rewindTrianglesCCW(positions, new Uint32Array([0, 1, 2]))).toEqual(new Uint32Array([0, 1, 2]));
    expect(rewindTrianglesCCW(positions, new Uint32Array([0, 2, 1]))).toEqual(new Uint32Array([0, 1, 2]));
  });
});
