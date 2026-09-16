import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { fieldAtlasBytes } from '@/lib/golf/course-geometry/field-atlas';
import { classifySurfaceFromAtlas } from '@/lib/golf/course-geometry/ground-shader-v2';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene, PointM } from '@/lib/golf/course-geometry/types';
import type { PackedDisplayMesh } from '@/lib/golf/course-geometry/visual-artifact-v2';
import { assembleV2World, buildV2World, rewindTrianglesCCW, type V2WorldInput } from './three-world-v2';

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
    // Task 11 follow-up: the atlas compiles alongside the mesh, over the
    // same bounds, and carries the four tracked SDF layers plus path.
    expect(input!.atlas).not.toBeNull();
    expect(input!.atlas!.boundsM).toEqual(input!.boundsM);
    expect(input!.atlas!.sdfLayers?.layerNames).toEqual(['green', 'bunker', 'fairway', 'path', 'water']);
    expect(fieldAtlasBytes(input!.atlas!)).toBeGreaterThan(0);
  });

  it('classifies every real hole-7 bunker centroid as sand and the green centroid as green (containment: plain argmax over signed distances has no built-in precedence, so a small bunker polygon sitting inside — or overlapping — the much larger green/fairway polygon it belongs to is exactly the case that could make the bigger feature win by raw distance; this is hole 7\'s actual "green complex owning three greenside bunkers" shape, not the synthetic fixture\'s well-separated pair)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const centroidOf = (ring: readonly PointM[]): PointM => {
      const n = ring.length - (ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? 1 : 0);
      let sx = 0, sy = 0;
      for (let i = 0; i < n; i++) { sx += ring[i]![0]; sy += ring[i]![1]; }
      return [sx / n, sy / n];
    };
    const bunkers = scene.features.filter(f => f.kind === 'bunker');
    const greens = scene.features.filter(f => f.kind === 'green');
    expect(bunkers.length).toBeGreaterThan(0);
    expect(greens.length).toBeGreaterThan(0);
    for (const bunker of bunkers) {
      const [cx, cy] = centroidOf(bunker.parts[0]![0]!);
      const result = classifySurfaceFromAtlas(input.atlas!, cx, cy);
      expect(result.surfaceClass).toBe('bunker');
      expect(result.weight).toBeCloseTo(1, 3);
    }
    for (const green of greens) {
      const [cx, cy] = centroidOf(green.parts[0]![0]!);
      const result = classifySurfaceFromAtlas(input.atlas!, cx, cy);
      expect(result.surfaceClass).toBe('green');
      expect(result.weight).toBeCloseTo(1, 3);
    }
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
    // Task 11 follow-up: stats report the atlas's own packed byte count.
    expect(built.stats.atlasBytes).toBe(fieldAtlasBytes(input.atlas!));
    expect(built.stats.atlasBytes).toBeGreaterThan(0);

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
    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    built.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1 + input.patches.length);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    // The uploaded SDF DataTexture is a separate GPU resource from the
    // material and geometry disposes above; nothing else on this material
    // holds a texture, so this spy only fires for that one upload.
    expect(textureDispose).toHaveBeenCalledTimes(1);
    geometryDispose.mockRestore(); materialDispose.mockRestore(); textureDispose.mockRestore();
  });

  it('sets GOLF_V2_ATLAS on the shared material when an atlas compiled (Task 11 follow-up)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);
    const baseMaterial = ((built.group.children[0] as THREE.Mesh).material as THREE.Material[])[0]!;
    expect(baseMaterial.defines?.GOLF_V2_ATLAS).toBe(1);
    // MeshStandardMaterial's own STANDARD define must survive the merge —
    // overwriting it would silently mis-light every V2 ground fragment via
    // the shared lights_fragment_begin chunk.
    expect(baseMaterial.defines?.STANDARD).toBe('');
    built.dispose();
  });

  it('renders without an atlas (fallback path) and reports zero atlas bytes', () => {
    const base: PackedDisplayMesh = {
      basis: 'interpolated_canonical', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]), triangleFeatures: new Uint16Array([0]), surfaceClass: new Uint8Array([0, 0, 0]),
      vertexCount: 3, triangleCount: 1,
    };
    const input: V2WorldInput = { base, patches: [], patchedRangeIds: new Set(), seed: [0, 0], boundsM: [0, 0, 1, 1], atlas: null };
    const built = buildV2World(input);
    expect(built.stats.atlasBytes).toBe(0);
    expect(built.stats.draws).toBe(1);
    const baseMaterial = ((built.group.children[0] as THREE.Mesh).material as THREE.Material[])[0]!;
    expect(baseMaterial.defines?.GOLF_V2_ATLAS).toBeUndefined();
    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    built.dispose();
    expect(textureDispose).not.toHaveBeenCalled(); // no SDF texture was ever created
    textureDispose.mockRestore();
  });

  it('gives every hero patch — including the green complex — finite, non-degenerate vertex normals (checked hypothesis: a flat/unlit green patch; not reproduced)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);
    const patchMeshes = built.group.children.slice(1) as THREE.Mesh[];
    expect(patchMeshes.length).toBe(4);
    for (const patchMesh of patchMeshes) {
      const normal = (patchMesh.geometry as THREE.BufferGeometry).getAttribute('normal');
      expect(normal.count).toBeGreaterThan(0);
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < normal.count; i++) {
        const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
        expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)).toBe(true);
        // computeVertexNormals() leaves a zero vector only for a vertex whose
        // triangles were all zero-area; a near-zero length is exactly the
        // "flat unlit" failure mode (normalize(0) is NaN in the lighting
        // chunk) — every patch here comes back a proper unit normal instead.
        expect(nx * nx + ny * ny + nz * nz).toBeGreaterThan(0.25);
        minZ = Math.min(minZ, nz); maxZ = Math.max(maxZ, nz);
      }
      // A real disproof of "flat unlit", not just non-zero: every patch
      // (including the green complex) sits on genuinely undulating terrain,
      // so its normals must vary across the patch rather than all pointing
      // identically up, which is what a forgotten/placeholder normal would
      // look like even though it would pass the non-degenerate check above.
      expect(maxZ - minZ).toBeGreaterThan(1e-4);
    }
    built.dispose();
  });

  it('rewinds a clockwise triangle to counter-clockwise and leaves a counter-clockwise one alone', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]); // (0,0),(1,0),(0,1): CCW, signed area > 0
    expect(rewindTrianglesCCW(positions, new Uint32Array([0, 1, 2]))).toEqual(new Uint32Array([0, 1, 2]));
    expect(rewindTrianglesCCW(positions, new Uint32Array([0, 2, 1]))).toEqual(new Uint32Array([0, 1, 2]));
  });
});
