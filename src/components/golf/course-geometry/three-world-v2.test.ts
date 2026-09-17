import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { CompiledBunkerPatch } from '@/lib/golf/course-geometry/bunker-display-mesh';
import { compileBunkerNormalField } from '@/lib/golf/course-geometry/bunker-normal-field';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { parseContextLayer } from '@/lib/golf/course-geometry/context-layer';
import { fieldAtlasBytes, sampleFieldAtlas } from '@/lib/golf/course-geometry/field-atlas';
import { greenBandsAt } from '@/lib/golf/course-geometry/green-surface-v2';
import { classAlbedoLinear, classifySurfaceFromAtlas, GROUND_V2_ATTRIBUTES, pickFinestAtlas, RELIEF_FIELD_BINDING } from '@/lib/golf/course-geometry/ground-shader-v2';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { parseTerrainMesh, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { MetricTerrainGrid } from '@/lib/golf/course-geometry/terrain-source';
import type { HoleScene, PointM } from '@/lib/golf/course-geometry/types';
import type { PackedDisplayMesh, PackedFieldAtlas, PackedHeroPatch } from '@/lib/golf/course-geometry/visual-artifact-v2';
import { MERIDIAN_STYLE } from '@/lib/golf/course-geometry/visual-style';
import { assembleV2World, buildV2World, greenPadSetting, rewindTrianglesCCW, type V2WorldInput } from './three-world-v2';

// Same hole-7 fixture bunker-display-mesh.test.ts and hero-patches.test.ts
// use: a real compiled course with a green complex owning three greenside
// bunkers plus three standalone fairway bunkers, so `compileHeroPatches`
// always returns exactly 4 patches for it (no context layer needed).
const fixtures = new URL('../../../test/fixtures/course-geometry/', import.meta.url);
function loadHole(key = 'peek-n-peak-upper-07', withContextLayer = false): { mesh: TerrainMesh; scene: HoleScene } {
  const pkg = parseGeometryPackage(JSON.parse(readFileSync(new URL('peek-n-peak-upper.json', fixtures), 'utf8')));
  const manifest = JSON.parse(readFileSync(new URL('compiled-peek-n-peak-upper/asset-manifest.json', fixtures), 'utf8')) as { holes: Record<string, { fileName: string }> };
  const fileName = manifest.holes[key]!.fileName;
  const raw = readFileSync(new URL(`compiled-peek-n-peak-upper/${fileName}`, fixtures));
  const mesh = parseTerrainMesh(JSON.parse((fileName.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')), pkg);
  const context = withContextLayer ? parseContextLayer(JSON.parse(readFileSync(new URL('peek-n-peak-upper-context.json', fixtures), 'utf8')), pkg) : undefined;
  const scene = buildHoleScene(pkg, key, [], mesh, context);
  return { mesh, scene };
}
const loadHole7 = (): { mesh: TerrainMesh; scene: HoleScene } => loadHole();

// A flat 10x10 m grid, for the synthetic `V2WorldInput` literals below —
// `metricTerrainNormal` on it always answers `[0, 0, 1]`, which is enough to
// exercise the normal-attribute wiring without needing a real DEM.
const FLAT_METRIC_GRID: MetricTerrainGrid = { originM: [0, 0], spacingM: 10, columns: 2, rows: 2, heightsM: [0, 0, 0, 0] };

describe('Meridian V2 runtime world (Task 11)', () => {
  it('assembles hole 7 into a non-null world with its 4 hero patches', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh);
    expect(input).not.toBeNull();
    expect(input!.patches.length).toBe(4);
    expect(input!.patchedRangeIds.size).toBe(4);
    expect(input!.boundsM.every(Number.isFinite)).toBe(true);
    // Task 11 follow-up: the atlas compiles alongside the mesh, and carries
    // the four tracked SDF layers plus path.
    expect(input!.atlas).not.toBeNull();
    expect(input!.atlas!.sdfLayers?.layerNames).toEqual(['green', 'bunker', 'fairway', 'path', 'water', 'tee']);
    expect(fieldAtlasBytes(input!.atlas!)).toBeGreaterThan(0);
  });

  it('compiles the whole-hole atlas over the tactical/hero bounds, not the full context mesh (edge-defect fix)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const atlas = input.atlas!;
    const [ax0, ay0, ax1, ay1] = atlas.boundsM;
    const [bx0, by0, bx1, by1] = input.boundsM;

    // The old behaviour compiled over `boundsM` itself (the entire context
    // mesh); the fixed behaviour is a much tighter frame around the hole —
    // hole 7's context mesh is 672 x 576 m, its tactical bounds 352 x 212 m.
    const atlasArea = (ax1 - ax0) * (ay1 - ay0), fullMeshArea = (bx1 - bx0) * (by1 - by0);
    expect(atlasArea).toBeLessThan(fullMeshArea / 2);

    // Resolution actually improves: at or under the plan's 0.75 m/texel
    // target (hole 7's old fixed-512-texel atlas over the full context mesh
    // came out to ~1.31 m/texel, the reported sawtooth).
    const texelSizeM = Math.max((ax1 - ax0) / atlas.width, (ay1 - ay0) / atlas.height);
    expect(texelSizeM).toBeLessThanOrEqual(0.76);
    expect(Math.max(atlas.width, atlas.height)).toBeLessThanOrEqual(1024);

    // Coverage: the tactical bounds and every hero patch's own bounds
    // (padding aside) sit fully inside the compiled atlas — a green complex
    // or bunker cluster reaching slightly past the tactical box (hole 7's
    // green complex does, by ~16 m) must not leave a base-mesh triangle
    // sampling this atlas out of bounds.
    const tactical = mesh.renderProfile!.tacticalBoundsM;
    expect(ax0).toBeLessThanOrEqual(tactical[0]); expect(ay0).toBeLessThanOrEqual(tactical[1]);
    expect(ax1).toBeGreaterThanOrEqual(tactical[2]); expect(ay1).toBeGreaterThanOrEqual(tactical[3]);
    for (const compiled of input.patches) {
      const [px0, py0, px1, py1] = compiled.patch.boundsM;
      expect(ax0).toBeLessThanOrEqual(px0); expect(ay0).toBeLessThanOrEqual(py0);
      expect(ax1).toBeGreaterThanOrEqual(px1); expect(ay1).toBeGreaterThanOrEqual(py1);
    }

    // Regression guard for that same gap: a point between the green
    // complex's own rim and the old (tactical-only, unpadded) atlas edge —
    // outside the old bounds, inside the new ones — must classify
    // coherently rather than sampling out of range.
    const probe: PointM = [-280, 1000];
    expect(probe[0]).toBeGreaterThan(tactical[2]); // outside the tactical box itself, not a random point
    expect(probe[0]).toBeGreaterThanOrEqual(ax0); expect(probe[0]).toBeLessThanOrEqual(ax1);
    const probeResult = classifySurfaceFromAtlas(atlas, probe[0], probe[1]);
    expect(Number.isFinite(probeResult.weight)).toBe(true);
    expect(probeResult.weight).toBeGreaterThanOrEqual(0);
    expect(probeResult.weight).toBeLessThanOrEqual(1);
  });

  it('compiles one hero atlas per hero patch, each at plan-budget resolution (Task 11 hero-atlas follow-up)', () => {
    const { scene, mesh } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    expect(input.heroAtlases.length).toBe(input.patches.length); // hero atlas count = patch count
    expect(input.heroAtlases.length).toBe(4);

    const patchById = new Map(input.patches.map(compiled => [compiled.patch.id, compiled.patch]));
    for (const hero of input.heroAtlases) {
      const patch = patchById.get(hero.patchId);
      expect(patch).toBeDefined();
      const [hx0, hy0, hx1, hy1] = hero.atlas.boundsM;
      const [px0, py0, px1, py1] = patch!.boundsM;
      // +1 m pad each side, exactly.
      expect(hx0).toBeCloseTo(px0 - 1, 6); expect(hy0).toBeCloseTo(py0 - 1, 6);
      expect(hx1).toBeCloseTo(px1 + 1, 6); expect(hy1).toBeCloseTo(py1 + 1, 6);
      // Plan §17 hero-field intent (~0.2 m/texel) and the hard budget gate
      // this module warns on (`HERO_ATLAS_MAX_TEXEL_SIZE_M`).
      const texelSizeM = Math.max((hx1 - hx0) / hero.atlas.width, (hy1 - hy0) / hero.atlas.height);
      expect(texelSizeM).toBeLessThanOrEqual(0.25);
      expect(Math.max(hero.atlas.width, hero.atlas.height)).toBeLessThanOrEqual(512);
      expect(fieldAtlasBytes(hero.atlas)).toBeGreaterThan(0);
    }
    // pickFinestAtlas prefers a hero atlas over the coarser whole-hole one
    // for a point only the hero atlas covers at its own finer resolution.
    const greenHero = input.heroAtlases.find(h => h.patchId.startsWith('green_complex'))!;
    const [gx0, gy0] = greenHero.atlas.boundsM;
    const picked = pickFinestAtlas([input.atlas!, greenHero.atlas], gx0 + 1, gy0 + 1);
    expect(picked).toBe(greenHero.atlas);
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
    // Task 11 follow-up: stats report the whole-hole atlas's packed byte
    // count plus every hero atlas's.
    expect(built.stats.heroAtlasCount).toBe(input.heroAtlases.length);
    expect(built.stats.heroAtlasCount).toBe(4);
    const expectedAtlasBytes = fieldAtlasBytes(input.atlas!) + input.heroAtlases.reduce((sum, hero) => sum + fieldAtlasBytes(hero.atlas), 0);
    expect(built.stats.atlasBytes).toBe(expectedAtlasBytes);
    expect(built.stats.atlasBytes).toBeGreaterThan(fieldAtlasBytes(input.atlas!)); // hero atlases add real bytes, not a no-op

    const [base, ...patchMeshes] = built.group.children as THREE.Mesh[];
    // A base draw relies on index groups to exclude patched hero ranges, and
    // three only honors geometry.groups when the mesh material is an array;
    // a patch mesh has no groups, and an array material with zero groups
    // would render nothing at all — so the two must be wired differently.
    // Every patch with its own hero atlas draws through its own instance of
    // the one ground material (same program cache key, own atlas uniforms).
    expect(Array.isArray(base!.material)).toBe(true);
    const baseMaterial = (base!.material as THREE.Material[])[0]!;
    expect((base!.geometry as THREE.BufferGeometry).groups.length).toBeGreaterThan(0);
    expect(patchMeshes.length).toBe(4);
    for (const patchMesh of patchMeshes) {
      expect(Array.isArray(patchMesh.material)).toBe(false);
      const patchMaterial = patchMesh.material as THREE.Material;
      expect(patchMaterial).not.toBe(baseMaterial);
      expect(patchMaterial.customProgramCacheKey()).toBe(baseMaterial.customProgramCacheKey());
      expect((patchMesh.geometry as THREE.BufferGeometry).groups.length).toBe(0);
    }

    const positions = (base!.geometry as THREE.BufferGeometry).getAttribute('position');
    for (let i = 0; i < positions.count; i += 997) {
      expect(Number.isFinite(positions.getX(i))).toBe(true);
      expect(Number.isFinite(positions.getY(i))).toBe(true);
      expect(Number.isFinite(positions.getZ(i))).toBe(true);
    }
    // Every mesh's own transform stays identity: hero-atlas UV frames map
    // world XY straight from `vGolfV2WorldXY = (modelMatrix * position).xy`,
    // so a translated/scaled patch mesh would silently sample the wrong
    // texel without this holding.
    for (const mesh of [base!, ...patchMeshes]) expect(new THREE.Matrix4().equals(mesh.matrix)).toBe(true);
    // The analytic metric-grid normal (`applyMetricGridNormals`) points up
    // (+Z) regardless of triangle winding; a dedicated test below pins this
    // down more tightly (unit length, mean z > 0.9). This is a coarser
    // sanity check that also covers the (realistically empty)
    // `computeVertexNormals()` fallback for a vertex outside the grid.
    const normal = (base!.geometry as THREE.BufferGeometry).getAttribute('normal');
    let sumZ = 0;
    for (let i = 0; i < normal.count; i++) sumZ += normal.getZ(i);
    expect(sumZ / normal.count).toBeGreaterThan(0.8);

    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    built.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1 + input.patches.length);
    expect(materialDispose).toHaveBeenCalledTimes(1 + input.heroAtlases.length); // one instance per atlas, one program
    // One SDF DataTexture upload for the whole-hole atlas plus one per hero
    // atlas, each with its relief (slope) texture beside it (Task 13 §34),
    // plus the one fairway-direction texture (Task 12) every material
    // instance shares — each a separate GPU resource from the material/
    // geometry disposes above.
    expect(built.stats.fairwayGrain).toBe(true);
    expect(built.stats.staticShadow).toBe(true);
    expect(built.stats.skyOcclusion).toBe(true);
    expect(built.stats.runoffRelief).toBe(true);
    expect(textureDispose).toHaveBeenCalledTimes(2 * (1 + input.heroAtlases.length) + 3); // + fairway direction + static shadow + sky
    geometryDispose.mockRestore(); materialDispose.mockRestore(); textureDispose.mockRestore();
  });

  it('binds every hero patch to its own hero atlas through its own material instance of the one ground program (Task 11 hero-atlas follow-up)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);
    const [base, ...patchMeshes] = built.group.children as THREE.Mesh[];
    const baseMaterial = (base!.material as THREE.Material[])[0]!;
    type Binding = { golfV2Sdf: { value: THREE.Texture }; golfV2SdfFrame: { value: THREE.Vector4 } };
    const bindingOf = (material: THREE.Material) => material.userData.golfV2AtlasBinding as Binding;
    const wholeHole = bindingOf(baseMaterial);
    expect(wholeHole).toBeDefined();
    const [x0, y0, x1, y1] = input.atlas!.boundsM;
    expect(wholeHole.golfV2SdfFrame.value.toArray()).toEqual([x0, y0, 1 / (x1 - x0), 1 / (y1 - y0)]);

    // three (WebGLRenderer.setProgram) only re-uploads a MeshStandardMaterial's
    // uniforms when the material id changes between draws, so a per-mesh
    // atlas can only be a per-mesh material *instance* — never a uniform
    // value swapped on one shared instance (that left every mesh drawing
    // with whichever atlas the first draw uploaded).
    const seenTextures = new Set<THREE.Texture>([wholeHole.golfV2Sdf.value]);
    const seenMaterials = new Set<THREE.Material>([baseMaterial]);
    for (const patchMesh of patchMeshes) {
      const material = patchMesh.material as THREE.Material;
      const binding = bindingOf(material);
      expect(binding.golfV2Sdf.value).not.toBe(wholeHole.golfV2Sdf.value); // every hole-7 patch gets its own hero atlas
      const hero = input.heroAtlases.find(h => `golf-v2-patch:${h.patchId}` === patchMesh.name)!;
      const [hx0, hy0, hx1, hy1] = hero.atlas.boundsM;
      expect(binding.golfV2SdfFrame.value.toArray()).toEqual([hx0, hy0, 1 / (hx1 - hx0), 1 / (hy1 - hy0)]);
      expect(material.customProgramCacheKey()).toBe(baseMaterial.customProgramCacheKey()); // one program
      expect(material.defines?.GOLF_V2_ATLAS).toBe(1);
      seenTextures.add(binding.golfV2Sdf.value); seenMaterials.add(material);
    }
    // 4 hero patches with 4 independently compiled atlases -> 4 distinct
    // hero textures and instances, all different from the whole-hole one.
    expect(seenTextures.size).toBe(1 + input.heroAtlases.length);
    expect(seenMaterials.size).toBe(1 + input.heroAtlases.length);
    built.dispose();
  });

  it('draws a patch with no compiled hero atlas using the whole-hole atlas instead (fallback path)', () => {
    const base: PackedDisplayMesh = {
      basis: 'interpolated_canonical', positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
      indices: new Uint32Array([0, 1, 2]), triangleFeatures: new Uint16Array([0]), surfaceClass: new Uint8Array([0, 0, 0]),
      vertexCount: 3, triangleCount: 1,
    };
    const patch: PackedHeroPatch = {
      id: 'bunker:orphan', kind: 'bunker', boundsM: [1, 1, 2, 2], basis: 'visual_only_deformation',
      positions: new Float32Array([1, 1, 0, 2, 1, 0, 1, 2, 0]), indices: new Uint32Array([0, 1, 2]),
      canonicalHeightReference: new Float32Array([0, 0, 0]), visualOffsetMm: new Int16Array([0, 0, 0]), edgeErrorMaxM: 0,
    };
    // Only `.patch` and `.triangleClass` are read by buildV2World/buildPatchGeometry.
    const compiled = { patch, triangleClass: new Uint8Array([0]) } as unknown as CompiledBunkerPatch;
    const texels = 16;
    const atlas: PackedFieldAtlas = {
      width: 4, height: 4, boundsM: [0, 0, 10, 10], basis: 'source_derived_visual',
      reliefRGBA16F: new Uint16Array(texels * 4), bentRGBA8: new Uint8Array(texels * 4), semanticRGBA8: new Uint8Array(texels * 4),
      sdfLayers: { layerNames: ['green', 'bunker', 'fairway', 'path', 'water'], data: new Uint16Array(texels * 5) },
    };
    // No entry for "bunker:orphan" in `heroAtlases` — simulates that patch's
    // own hero atlas failing to compile (a degenerate bounding box).
    const input: V2WorldInput = {
      base, patches: [compiled], patchedRangeIds: new Set(), seed: [0, 0], boundsM: [0, 0, 10, 10], atlas, heroAtlases: [],
      metricGrid: FLAT_METRIC_GRID, heroNormals: [new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])],
    };
    const built = buildV2World(input);
    const [baseMesh, patchMesh] = built.group.children as THREE.Mesh[];
    const baseMaterial = (baseMesh!.material as THREE.Material[])[0]!;
    // Same material instance (so the same whole-hole texture): the orphan
    // patch fell back to the whole-hole atlas rather than losing
    // GOLF_V2_ATLAS classification.
    expect(patchMesh!.material).toBe(baseMaterial);
    expect(baseMaterial.userData.golfV2AtlasBinding).toBeDefined();

    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    built.dispose();
    expect(textureDispose).toHaveBeenCalledTimes(2); // only the whole-hole SDF + relief textures were ever created
    textureDispose.mockRestore();
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

  it('binds each atlas\'s own relief texture (slope, tee SDF, curvature) beside its SDF texture (Task 13 §34 run-off), decoded to the same numbers sampleFieldAtlas answers, and the term fires on hole 7\'s real green surround', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);
    expect(built.stats.runoffRelief).toBe(true);
    const [base, ...patchMeshes] = built.group.children as THREE.Mesh[];
    type Relief = { golfV2Relief: { value: THREE.DataTexture } };
    const materials = [((base!.material as THREE.Material[])[0]!), ...patchMeshes.map(m => m.material as THREE.Material)];
    const seen = new Set<THREE.Texture>();
    for (const material of materials) {
      expect(material.defines?.[RELIEF_FIELD_BINDING.define]).toBe(1);
      const relief = (material.userData.golfV2ReliefBinding as Relief).golfV2Relief.value;
      expect(relief.format).toBe(THREE.RGBAFormat);
      expect(relief.type).toBe(THREE.HalfFloatType);
      expect(relief.image.width).toBe((material.userData.golfV2AtlasBinding as { golfV2Sdf: { value: THREE.DataTexture } }).golfV2Sdf.value.image.width);
      seen.add(relief);
    }
    expect(seen.size).toBe(1 + input.heroAtlases.length); // one relief texture per atlas, like the SDF textures
    // The texel values are the decoded slopes, not the packed fixed-point
    // codes (raw upload would read slope 0 as -0 and steep codes as NaN):
    // every texel centre must round-trip to sampleFieldAtlas within half-float
    // precision; B is the tee SDF in metres and A the landform curvature, the
    // same way (the rough hierarchy's play distance and §50 tone read them).
    const atlas = input.atlas!, data = (((base!.material as THREE.Material[])[0]!).userData.golfV2ReliefBinding as Relief).golfV2Relief.value.image.data as Uint16Array;
    const [x0, y0, x1, y1] = atlas.boundsM, texelW = (x1 - x0) / atlas.width, texelH = (y1 - y0) / atlas.height;
    let checked = 0, steep = 0, insideTee = 0, curved = 0;
    for (let row = 0; row < atlas.height; row += 37) for (let col = 0; col < atlas.width; col += 41) {
      const n = row * atlas.width + col, x = x0 + (col + .5) * texelW, y = y0 + (row + .5) * texelH;
      const dzdx = THREE.DataUtils.fromHalfFloat(data[n * 4]!), dzdy = THREE.DataUtils.fromHalfFloat(data[n * 4 + 1]!);
      const wantX = sampleFieldAtlas(atlas, 'dzdx', x, y)!, wantY = sampleFieldAtlas(atlas, 'dzdy', x, y)!;
      expect(Math.abs(dzdx - wantX)).toBeLessThanOrEqual(Math.abs(wantX) * 1e-3 + 1e-4);
      expect(Math.abs(dzdy - wantY)).toBeLessThanOrEqual(Math.abs(wantY) * 1e-3 + 1e-4);
      const tee = THREE.DataUtils.fromHalfFloat(data[n * 4 + 2]!), wantTee = sampleFieldAtlas(atlas, 'tee', x, y)!;
      expect(Math.abs(tee - wantTee)).toBeLessThanOrEqual(Math.abs(wantTee) * 1e-3 + 1e-3);
      const curvature = THREE.DataUtils.fromHalfFloat(data[n * 4 + 3]!), wantCurvature = sampleFieldAtlas(atlas, 'curvature', x, y)!;
      expect(Math.abs(curvature - wantCurvature)).toBeLessThanOrEqual(Math.abs(wantCurvature) * 1e-3 + 1e-3);
      if (Math.hypot(wantX, wantY) >= 0.05) steep++;
      if (wantTee > 0) insideTee++;
      if (Math.abs(wantCurvature) > 0.25) curved++;
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    expect(steep).toBeGreaterThan(0); // hole 7 is not flat: the term has real slope to read
    expect(curved).toBeGreaterThan(0); // and its landform curvature is not all zero
    // Hole 7's tees are small (the strided sample may miss them), so the tee
    // channel is checked at every texel instead: exactly the atlas layer.
    const teeLayer = atlas.sdfLayers!.layerNames.indexOf('tee'), texels = atlas.width * atlas.height;
    expect(teeLayer).toBeGreaterThanOrEqual(0);
    for (let n = 0; n < texels; n++) if (atlas.sdfLayers!.data[teeLayer * texels + n]! > 32768) insideTee++;
    expect(insideTee).toBeGreaterThan(0);
    // The CPU mirror of the shader term finds run-off on the real hero atlas
    // (green-surface-v2.ts runoffWeightAt) — the wiring is not decorative.
    const hero = input.heroAtlases.find(h => h.patchId.startsWith('green_complex'))!;
    let runoffTexels = 0, near = 0;
    const [hx0, hy0, hx1, hy1] = hero.atlas.boundsM;
    for (let y = hy0 + .5; y < hy1; y += 1) for (let x = hx0 + .5; x < hx1; x += 1) {
      const d = sampleFieldAtlas(hero.atlas, 'green', x, y);
      if (d == null || d > 0 || d < -16) continue;
      near++;
      if (greenBandsAt(hero.atlas, x, y).runoff > 0) runoffTexels++;
    }
    expect(near).toBeGreaterThan(100);
    expect(runoffTexels / near).toBeGreaterThan(0.1);
    expect(runoffTexels / near).toBeLessThan(0.9); // never "shaved banks everywhere" (§34)
    const textureDispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    built.dispose();
    expect(textureDispose.mock.instances).toEqual(expect.arrayContaining([...seen]));
    textureDispose.mockRestore();
  });

  it('carries the hole\'s own green pad (fidelity §20) — mean canonical z of its field triangles, a reach radius covering every green ring — into every ground material as golfV2GreenPad', () => {
    const { mesh, scene } = loadHole7();
    const pad = greenPadSetting(scene, mesh, MERIDIAN_STYLE)!;
    expect(pad).not.toBeNull();
    const [cx, cy, padZ, radius] = pad;
    const greens = scene.features.filter(f => f.kind === 'green');
    expect(greens.length).toBeGreaterThan(0);
    const ids = new Set(greens.map(f => f.id));
    let zMin = Infinity, zMax = -Infinity, extent = 0;
    for (let t = 0; t < mesh.triangleFeatures.length; t++) {
      if (!ids.has(mesh.featureIds[mesh.triangleFeatures[t]!]!) || mesh.triangleMaterials[t] !== 0) continue;
      for (let c = 0; c < 3; c++) { const z = mesh.vertices[(t * 3 + c) * 3 + 2]!; zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    }
    expect(padZ).toBeGreaterThanOrEqual(zMin); expect(padZ).toBeLessThanOrEqual(zMax);
    for (const feature of greens) for (const rings of feature.parts) for (const [x, y] of rings[0] ?? []) extent = Math.max(extent, Math.hypot(x - cx, y - cy));
    const reach = Math.max(MERIDIAN_STYLE.greenComplex.settingReachM, MERIDIAN_STYLE.greenComplex.runoff.reachM);
    expect(radius).toBeGreaterThanOrEqual(extent + reach); // nothing the setting or run-off could touch is outside the gate
    expect(radius).toBeLessThan(extent + reach + 2);
    const input = assembleV2World(scene, mesh)!;
    expect(input.greenPad).toEqual(pad);
    const built = buildV2World(input);
    const [base, ...patchMeshes] = built.group.children as THREE.Mesh[];
    const materials = [((base!.material as THREE.Material[])[0]!), ...patchMeshes.map(m => m.material as THREE.Material)] as THREE.MeshStandardMaterial[];
    for (const material of materials) {
      // Drive onBeforeCompile the way three would, with a stand-in shader object.
      const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>' };
      material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
      const value = shader.uniforms.golfV2GreenPad!.value as THREE.Vector4;
      expect([value.x, value.y, value.z, value.w]).toEqual([cx, cy, padZ, radius]);
      expect(shader.fragmentShader).toContain('uniform vec4 golfV2GreenPad;');
      expect(shader.fragmentShader).toContain('golfPadDrop * golfPadReach * golfOwnGreen * golfPadShare');
      expect(shader.vertexShader).toContain('vGolfV2WorldZ = golfV2WorldPos.z;');
    }
    built.dispose();
    // Without an own green the gate is off (w = 0): a scene with no green feature.
    expect(greenPadSetting({ ...scene, features: scene.features.filter(f => f.kind !== 'green') }, mesh, MERIDIAN_STYLE)).toBeNull();
  });

  it('renders without an atlas (fallback path) and reports zero atlas bytes', () => {
    const base: PackedDisplayMesh = {
      basis: 'interpolated_canonical', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]), triangleFeatures: new Uint16Array([0]), surfaceClass: new Uint8Array([0, 0, 0]),
      vertexCount: 3, triangleCount: 1,
    };
    const input: V2WorldInput = {
      base, patches: [], patchedRangeIds: new Set(), seed: [0, 0], boundsM: [0, 0, 1, 1], atlas: null, heroAtlases: [],
      metricGrid: FLAT_METRIC_GRID, heroNormals: [],
    };
    const built = buildV2World(input);
    expect(built.stats.atlasBytes).toBe(0);
    expect(built.stats.heroAtlasCount).toBe(0);
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
      const geometry = patchMesh.geometry as THREE.BufferGeometry;
      const normal = geometry.getAttribute('normal');
      expect(normal.count).toBeGreaterThan(0);
      // Guards against `heroNormals[i]` ever landing on the wrong patch (or
      // a short array): three does not validate attribute-count agreement
      // at construction, so a mismatch would otherwise only ever surface as
      // silently-wrong shading for a subset of vertices, not a thrown error.
      expect(normal.count).toBe(geometry.getAttribute('position').count);
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < normal.count; i++) {
        const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
        expect(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)).toBe(true);
        // `compileBunkerNormalField` always normalizes a non-zero vector
        // (`Math.hypot(...) || 1` guards the divide), so a near-zero length
        // would mean the analytic field itself broke down; a near-zero
        // length is exactly the "flat unlit" failure mode (normalize(0) is
        // NaN in the lighting chunk) — every patch here comes back a proper
        // unit normal instead.
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

  it('gives the base mesh unit-length, mostly-upward analytic normals (metric-grid basis)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);
    expect(built.stats.normalsBasis).toBe('metric_grid');
    const [base] = built.group.children as THREE.Mesh[];
    const normal = (base!.geometry as THREE.BufferGeometry).getAttribute('normal');
    let sumZ = 0;
    for (let i = 0; i < normal.count; i++) {
      const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      sumZ += nz;
    }
    expect(sumZ / normal.count).toBeGreaterThan(0.9);
    built.dispose();
  });

  it('gives two adjacent outline-fan sliver vertices nearly the same normal instead of the old sawtooth jump (sawtooth fix)', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const built = buildV2World(input);
    const [base] = built.group.children as THREE.Mesh[];
    const geometry = base!.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex()!;

    // Old behaviour (`computeVertexNormals()` alone, no analytic override),
    // rebuilt from the same rewound indices/positions this base mesh uses.
    const before = new THREE.BufferGeometry();
    before.setAttribute('position', new THREE.BufferAttribute(input.base.positions, 3));
    before.setIndex(new THREE.BufferAttribute(rewindTrianglesCCW(input.base.positions, input.base.indices), 1));
    before.computeVertexNormals();
    const beforeNormal = before.getAttribute('normal') as THREE.BufferAttribute;
    const angleDeg = (attr: THREE.BufferAttribute, a: number, b: number) =>
      new THREE.Vector3(attr.getX(a), attr.getY(a), attr.getZ(a)).angleTo(new THREE.Vector3(attr.getX(b), attr.getY(b), attr.getZ(b))) * 180 / Math.PI;

    // The canonical outline is triangulated as a fan of short slivers next
    // to the base mesh's much bigger (8-18 m) background triangles: search
    // every "fan scale" edge (< 3 m — short enough to be within one outline
    // fan, not a legitimate large-triangle slope change) for the one where
    // the *old* per-vertex normals disagreed most, i.e. an actual sawtooth
    // tooth rather than an arbitrarily-picked short edge that happens not to
    // sit on a class boundary.
    let worstBeforeDeg = -1, worstA = -1, worstB = -1;
    for (let t = 0; t < index.count; t += 3) {
      const ia = index.getX(t), ib = index.getX(t + 1), ic = index.getX(t + 2);
      for (const [a, b] of [[ia, ib], [ib, ic], [ic, ia]] as const) {
        const dx = position.getX(a) - position.getX(b), dy = position.getY(a) - position.getY(b), dz = position.getZ(a) - position.getZ(b);
        if (Math.hypot(dx, dy, dz) >= 3) continue;
        const d = angleDeg(beforeNormal, a, b);
        if (d > worstBeforeDeg) { worstBeforeDeg = d; worstA = a; worstB = b; }
      }
    }
    expect(worstA).toBeGreaterThanOrEqual(0);
    // Confirms this is a real sawtooth instance, not a false positive: the
    // old area-weighted average genuinely disagreed by a lot across one
    // short outline-fan edge.
    console.log(`[sawtooth fix] worst fan-scale edge: angle before (computeVertexNormals) ${worstBeforeDeg.toFixed(2)}deg`);
    expect(worstBeforeDeg).toBeGreaterThan(20);

    const angleAfterDeg = angleDeg(normal as THREE.BufferAttribute, worstA, worstB);
    console.log(`[sawtooth fix] same edge: angle after (metric grid) ${angleAfterDeg.toFixed(2)}deg`);
    expect(angleAfterDeg).toBeLessThan(5);
    before.dispose();
    built.dispose();
  });

  it('tilts a bunker bowl-wall normal toward the floor (steepest-descent direction) instead of straight up', () => {
    const { mesh, scene } = loadHole7();
    const input = assembleV2World(scene, mesh)!;
    const patchIndex = input.patches.findIndex(compiled => compiled.profiles.length > 0);
    expect(patchIndex).toBeGreaterThanOrEqual(0);
    const bowlPatch = input.patches[patchIndex]!;
    const field = compileBunkerNormalField(bowlPatch, mesh);

    // Steepest vertex: largest raw |gradient| (`field.gradient`, unblended).
    // Not the deepest offset — §37's quintic bowl profile "ties in flat" at
    // *both* ends (smootherstep's derivative is 0 at u=0, the outline, and
    // u=1, the flat bowl floor), so the deepest point is exactly where the
    // slope goes back to zero; the real tilt peaks partway up the wall.
    const vertexCount = bowlPatch.patch.positions.length / 3;
    let steepest = 0, bestSlope = -1;
    for (let v = 0; v < vertexCount; v++) {
      const slope = Math.hypot(field.gradient[v * 2]!, field.gradient[v * 2 + 1]!);
      if (slope > bestSlope) { bestSlope = slope; steepest = v; }
    }
    expect(bestSlope).toBeGreaterThan(0.02); // a real slope was found, not a flat patch

    // Read the normal back through the actual pipeline (`assembleV2World`'s
    // `heroNormals` -> `buildV2World` -> `buildPatchGeometry`'s `normal`
    // attribute), not `field.normals` directly — `compileBunkerNormalField`
    // itself has its own test file; what this module needs proven is that
    // the array it precomputed actually lands on the right patch mesh at the
    // right vertex index. `rewindTrianglesCCW` only permutes the index
    // buffer, never reorders vertices, so `steepest` stays a valid index
    // into the built geometry's attributes.
    const built = buildV2World(input);
    const patchMesh = built.group.children.find(o => o.name === `golf-v2-patch:${bowlPatch.patch.id}`) as THREE.Mesh;
    expect(patchMesh).toBeDefined();
    const attr = (patchMesh.geometry as THREE.BufferGeometry).getAttribute('normal');
    const nx = attr.getX(steepest), ny = attr.getY(steepest), nz = attr.getZ(steepest);
    const gx = field.gradient[steepest * 2]!, gy = field.gradient[steepest * 2 + 1]!;
    // Same field, not a coincidence: `heroNormals[patchIndex]` is exactly
    // `compileBunkerNormalField(bowlPatch, mesh).normals`.
    expect(nx).toBeCloseTo(field.normals[steepest * 3]!, 6);
    expect(ny).toBeCloseTo(field.normals[steepest * 3 + 1]!, 6);
    expect(nz).toBeCloseTo(field.normals[steepest * 3 + 2]!, 6);
    expect(nz).toBeGreaterThan(0);
    // A real tilt, not the straight-up default a forgotten normal would give.
    expect(Math.hypot(nx, ny)).toBeGreaterThan(0.02);
    // Heightfield identity n_xy = -grad(height): the horizontal normal
    // points opposite the (upward, out-of-bowl) gradient, i.e. toward
    // increasing depth — the floor.
    expect(nx * -gx + ny * -gy).toBeGreaterThan(0);
    built.dispose();
  });

  it('rewinds a clockwise triangle to counter-clockwise and leaves a counter-clockwise one alone', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]); // (0,0),(1,0),(0,1): CCW, signed area > 0
    expect(rewindTrianglesCCW(positions, new Uint32Array([0, 1, 2]))).toEqual(new Uint32Array([0, 1, 2]));
    expect(rewindTrianglesCCW(positions, new Uint32Array([0, 2, 1]))).toEqual(new Uint32Array([0, 1, 2]));
  });
});

describe('outside-world context attributes on the V2 ground (ground-context-v2.ts; meridian-ground-v2-11)', () => {
  it('uploads golfV2Context / golfV2Zone on the base and every hero patch, marks hole 1\'s neighbouring features and bakes its ski-slope zone into the vertex colour', () => {
    const { mesh, scene } = loadHole('peek-n-peak-upper-01', true);
    const input = assembleV2World(scene, mesh)!;
    expect(input.scene).toBe(scene);
    expect(input.featureIds).toBe(mesh.featureIds);
    const built = buildV2World(input);
    try {
      const meshes = built.group.children as THREE.Mesh[];
      expect(meshes.length).toBeGreaterThan(1);
      for (const m of meshes) {
        const geometry = m.geometry as THREE.BufferGeometry;
        const context = geometry.getAttribute(GROUND_V2_ATTRIBUTES.context), zone = geometry.getAttribute(GROUND_V2_ATTRIBUTES.zone);
        expect(context.count).toBe(geometry.getAttribute('position').count);
        expect(zone.count).toBe(context.count);
        for (let v = 0; v < zone.count; v++) { expect(zone.getX(v)).toBeGreaterThanOrEqual(-1); expect(zone.getX(v)).toBeLessThanOrEqual(1); }
      }
      const base = meshes[0]!.geometry as THREE.BufferGeometry;
      const context = base.getAttribute(GROUND_V2_ATTRIBUTES.context), zone = base.getAttribute(GROUND_V2_ATTRIBUTES.zone), color = base.getAttribute('color');
      let contextVertices = 0, zoneVertices = 0, fullZone = -1;
      for (let v = 0; v < context.count; v++) {
        if (context.getX(v) === 1) contextVertices++;
        if (zone.getX(v) !== 0) { zoneVertices++; if (zone.getX(v) === 1 && fullZone < 0) fullZone = v; }
      }
      expect(contextVertices).toBeGreaterThan(100); // hole 1's context mesh carries neighbouring fairways, greens, tees
      expect(zoneVertices).toBeGreaterThan(100); // the Upper context layer's ski slope reaches hole 1's mesh (708 vertices in the census)
      expect(fullZone).toBeGreaterThanOrEqual(0);
      // A fully-inside ski-slope vertex carries the zone's own albedo (turf zone: positive weight).
      const [r, g, b] = classAlbedoLinear('ski_slope', MERIDIAN_STYLE);
      expect(color.getX(fullZone)).toBeCloseTo(r, 5); expect(color.getY(fullZone)).toBeCloseTo(g, 5); expect(color.getZ(fullZone)).toBeCloseTo(b, 5);
    } finally { built.dispose(); }
  });

  it('gives a synthetic input without a scene all-zero context and zone attributes', () => {
    const base: PackedDisplayMesh = {
      basis: 'interpolated_canonical', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]), triangleFeatures: new Uint16Array([0]), surfaceClass: new Uint8Array([1, 1, 1]),
      vertexCount: 3, triangleCount: 1,
    };
    const built = buildV2World({ base, patches: [], patchedRangeIds: new Set(), seed: [0, 0], boundsM: [0, 0, 1, 1], atlas: null, heroAtlases: [], metricGrid: FLAT_METRIC_GRID, heroNormals: [] });
    try {
      const geometry = (built.group.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
      expect([...(geometry.getAttribute(GROUND_V2_ATTRIBUTES.context).array as Float32Array)]).toEqual([0, 0, 0]);
      expect([...(geometry.getAttribute(GROUND_V2_ATTRIBUTES.zone).array as Float32Array)]).toEqual([0, 0, 0]);
    } finally { built.dispose(); }
  });
});
