/** Meridian V2 runtime world (V2 plan Part XXI Task 11; ruling R7).
 *
 * Assembles and renders the V2 render world for one hole from the existing
 * Task 5–8 compiler pipeline: base display LOD0 (display-mesh-v2.ts) with
 * green/bunker hero patches (hero-patches.ts, bunker-display-mesh.ts) cut
 * out of it and drawn in their place. There is no precompiled
 * `MeridianVisualArtifactV2` yet (Task 10), so `assembleV2World` compiles at
 * runtime from canonical truth every time it is called; once Task 10 lands,
 * it can hand this module a decoded artifact instead with the same bundle
 * shape (`V2WorldInput` stays close to `PackedDisplayMesh`/`PackedHeroPatch`
 * on purpose) and nothing downstream needs to change.
 *
 * R7: this module owns the only runtime decision between V1 and V2 — a
 * `null` from `assembleV2World` (no `metricGrid`, or any compiler step
 * throwing) means "render V1", and the V1 path in three-landscape.ts is
 * untouched by this file. */
import * as THREE from 'three';
import { compileHeroPatches, type CompiledBunkerPatch } from '@/lib/golf/course-geometry/bunker-display-mesh';
import { compileBaseDisplayLods, weldAndCleanTerrainMesh } from '@/lib/golf/course-geometry/display-mesh-v2';
import {
  classAlbedoLinear, classRoughness, dominantClass, GROUND_SHADER_V2_VERSION, groundShaderV2Chunks,
  GROUND_V2_ATTRIBUTES, seedFromPackageHash,
} from '@/lib/golf/course-geometry/ground-shader-v2';
import { compileHeroRegions } from '@/lib/golf/course-geometry/hero-patches';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { SURFACE_CLASS_IDS, type SurfaceClass } from '@/lib/golf/course-geometry/visual-artifact';
import type { PackedDisplayMesh, PackedHeroPatch } from '@/lib/golf/course-geometry/visual-artifact-v2';
import { MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, type MeridianStyle } from '@/lib/golf/course-geometry/visual-style';

/** The geometry bundle `buildV2World` needs: base LOD0 (with the hero
 * ranges a patch replaces, so they can be excluded from its draw groups)
 * plus the compiled patches themselves. `base.surfaceClass` already carries
 * the base's per-vertex class and each patch's `triangleClass` its
 * per-triangle class — nothing here recomputes them, this just collects the
 * compiler outputs the shader/geometry layer needs and the turf seed/world
 * bounds alongside them. */
export interface V2WorldInput {
  base: PackedDisplayMesh;
  patches: CompiledBunkerPatch[];
  /** `PackedHeroPatch.id` of every patch, i.e. the `base.heroRanges` entries
   * a patch already covers and the base mesh must not also draw. */
  patchedRangeIds: ReadonlySet<string>;
  /** World-space turf-field offset, stable per course (keyed on the
   * package/course hash so every hole of one course shares one turf world). */
  seed: readonly [number, number];
  /** XY bounds of the base mesh, metres, `[minX, minY, maxX, maxY]`. */
  boundsM: [number, number, number, number];
}

let warnedFallback = false;
/** Logs the V1-fallback reason once per process, not once per call, so a
 * hole that keeps failing to compile does not spam the console every time
 * the debug view or runtime re-renders it. */
function warnFallbackOnce(reason: string, error?: unknown): void {
  if (warnedFallback) return;
  warnedFallback = true;
  console.warn(`[golf/three-world-v2] falling back to V1 terrain: ${reason}`, error ?? '');
}

function boundsOfPositions(positions: Float32Array): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Run the Task 5–8 pipeline for one hole and collect what the V2 ground
 * needs to draw it. Returns `null` (V1 fallback, R7) if the mesh has no
 * `metricGrid` (the V2 compilers all need one) or any compiler step throws;
 * either path logs once via `warnFallbackOnce` rather than throwing, so a
 * caller can always fall back to the V1 landscape unconditionally. */
export function assembleV2World(scene: HoleScene, mesh: TerrainMesh): V2WorldInput | null {
  if (!mesh.metricGrid) { warnFallbackOnce('mesh has no metricGrid'); return null; }
  try {
    const welded = weldAndCleanTerrainMesh(mesh);
    const plan = compileHeroRegions(scene, mesh, welded);
    const lods = compileBaseDisplayLods(mesh, { heroPlan: { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds } });
    const patches = compileHeroPatches(scene, mesh, welded, plan);
    const base = lods.lod0;
    return {
      base, patches, patchedRangeIds: new Set(patches.map(compiled => compiled.patch.id)),
      seed: seedFromPackageHash(mesh.geometryHash), boundsM: boundsOfPositions(base.positions),
    };
  } catch (error) {
    warnFallbackOnce('V2 compile pipeline threw', error);
    return null;
  }
}

/** Reorders a copy of `indices` so every triangle's 2D (XY) winding is
 * counter-clockwise, i.e. its `(b-a)×(c-a)` Z component is positive and its
 * `computeVertexNormals()` normal points toward +Z ("up"). The canonical
 * terrain mesh's winding is not globally consistent — V1 corrects it with
 * the same per-triangle signed-area test before uploading positions
 * (three-landscape.ts), and the existing V2 debug views sidestep it
 * entirely with `DoubleSide` unlit materials. A lit MeshStandardMaterial
 * needs real per-vertex normals, so this runs once before
 * `computeVertexNormals()` on both the base mesh and every hero patch
 * (patch sub-triangles inherit their parent triangle's orientation, so they
 * carry the same inconsistency). */
export function rewindTrianglesCCW(positions: ArrayLike<number>, indices: Uint32Array): Uint32Array {
  const out = Uint32Array.from(indices);
  const triangleCount = out.length / 3;
  for (let t = 0; t < triangleCount; t++) {
    const ia = out[t * 3]!, ib = out[t * 3 + 1]!, ic = out[t * 3 + 2]!;
    const ax = positions[ia * 3]!, ay = positions[ia * 3 + 1]!;
    const bx = positions[ib * 3]!, by = positions[ib * 3 + 1]!;
    const cx = positions[ic * 3]!, cy = positions[ic * 3 + 1]!;
    const signedArea2 = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (signedArea2 < 0) { out[t * 3 + 1] = ic; out[t * 3 + 2] = ib; }
  }
  return out;
}

/** One class per patch vertex, resolved from the classes of the triangles
 * touching it by `GROUND_CLASS_PRIORITY` (`dominantClass`) — the same
 * vertex-level resolution `packDisplayMesh` already applies to the base
 * mesh, reproduced here because a hero patch carries only a per-triangle
 * `triangleClass` and a shared (indexed) vertex can hold only one shader
 * attribute value. Keeping patches indexed (rather than de-indexing to a
 * per-corner class) is what lets `computeVertexNormals()` produce genuine
 * smooth shading and lets the class boundary blend the same way the base
 * mesh's does: by GPU interpolation of two vertex colours across a shared
 * edge. */
function resolvePatchVertexClasses(patch: PackedHeroPatch, triangleClass: Uint8Array): Uint8Array {
  const vertexCount = patch.positions.length / 3;
  const touching: SurfaceClass[][] = Array.from({ length: vertexCount }, () => []);
  for (let t = 0; t < triangleClass.length; t++) {
    const cls = SURFACE_CLASS_IDS[triangleClass[t]!]!;
    touching[patch.indices[t * 3]!]!.push(cls);
    touching[patch.indices[t * 3 + 1]!]!.push(cls);
    touching[patch.indices[t * 3 + 2]!]!.push(cls);
  }
  const out = new Uint8Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) out[v] = SURFACE_CLASS_IDS.indexOf(touching[v]!.length ? dominantClass(touching[v]!) : 'ground');
  return out;
}

function classAttributes(classIds: Uint8Array, style: MeridianStyle): { classFloat: Float32Array; color: Float32Array; roughness: Float32Array } {
  const vertexCount = classIds.length;
  const classFloat = new Float32Array(vertexCount), color = new Float32Array(vertexCount * 3), roughness = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const cls = SURFACE_CLASS_IDS[classIds[v]!] ?? 'ground';
    classFloat[v] = classIds[v]!;
    color.set(classAlbedoLinear(cls, style), v * 3);
    roughness[v] = classRoughness(cls, style);
  }
  return { classFloat, color, roughness };
}

/** The one ground `MeshStandardMaterial` shared by the base mesh and every
 * hero patch (constraint: one ground material system). `onBeforeCompile`
 * injection over MeshStandardMaterial rather than a bespoke ShaderMaterial:
 * it inherits the renderer's shadow map and hemisphere/directional lighting
 * (three-renderer.ts) and ACES tonemapping for free, matching V1's own
 * `attachTurfStyle` pattern (three-landscape.ts) — the least code that keeps
 * lighting working. `customProgramCacheKey` (plan §77) is stable across
 * holes (shader version + style hash only, no per-hole seed or geometry
 * number), so three can still reuse one compiled program across every hole
 * that shares this shader structure even though each gets its own seed
 * uniform value. */
function createGroundMaterialV2(seed: readonly [number, number], style: MeridianStyle): THREE.MeshStandardMaterial {
  const chunks = groundShaderV2Chunks(style);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.FrontSide });
  material.name = 'meridian-ground-v2';
  material.onBeforeCompile = shader => {
    shader.uniforms.golfV2Seed = { value: new THREE.Vector2(seed[0], seed[1]) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${chunks.vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${chunks.vertexMain}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${chunks.fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${chunks.fragmentColor}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${chunks.fragmentRoughness}`);
  };
  material.customProgramCacheKey = () => `${GROUND_SHADER_V2_VERSION}:${MERIDIAN_STYLE_HASH}`;
  return material;
}

function buildBaseGeometry(base: PackedDisplayMesh, patchedRangeIds: ReadonlySet<string>, style: MeridianStyle): { geometry: THREE.BufferGeometry; drawnTriangles: number } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(rewindTrianglesCCW(base.positions, base.indices), 1));
  geometry.computeVertexNormals();
  const { classFloat, color, roughness } = classAttributes(base.surfaceClass, style);
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.surfaceClass, new THREE.BufferAttribute(classFloat, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.visualOffset, new THREE.BufferAttribute(new Float32Array(base.vertexCount), 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.roughness, new THREE.BufferAttribute(roughness, 1));
  // Index groups: everything before the first hero range, then each range
  // that has no compiled patch (water/path regions today). `orderHeroRegionsLast`
  // guarantees every hero-range triangle sorts after every base triangle, so
  // the one leading gap is the only gap possible; a patched range is simply
  // never added as a group, which — because the mesh below uses an ARRAY
  // material — is what excludes it from the base draw (a non-array material
  // would ignore these groups and draw the whole index buffer regardless).
  let drawnTriangles = 0;
  const addGroup = (startTri: number, countTri: number) => {
    if (countTri <= 0) return;
    geometry.addGroup(startTri * 3, countTri * 3, 0);
    drawnTriangles += countTri;
  };
  const ranges = base.heroRanges ?? [];
  if (!ranges.length) addGroup(0, base.triangleCount);
  else {
    addGroup(0, ranges[0]!.start);
    for (const range of ranges) if (!patchedRangeIds.has(range.id)) addGroup(range.start, range.count);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, drawnTriangles };
}

function buildPatchGeometry(compiled: CompiledBunkerPatch, style: MeridianStyle): THREE.BufferGeometry {
  const { patch, triangleClass } = compiled;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(patch.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(rewindTrianglesCCW(patch.positions, patch.indices), 1));
  geometry.computeVertexNormals();
  const classIds = resolvePatchVertexClasses(patch, triangleClass);
  const { classFloat, color, roughness } = classAttributes(classIds, style);
  const vertexCount = patch.positions.length / 3, offset = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) offset[v] = patch.visualOffsetMm[v]! / 1000;
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.surfaceClass, new THREE.BufferAttribute(classFloat, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.visualOffset, new THREE.BufferAttribute(offset, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.roughness, new THREE.BufferAttribute(roughness, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface V2WorldOptions { style?: MeridianStyle }
export interface V2WorldStats {
  /** Draw calls: the base mesh plus one per hero patch. */
  draws: number;
  /** Total triangles actually drawn (base, hero ranges excluded, plus every patch). */
  triangles: number;
  /** Hero patches drawn. */
  patches: number;
  /** Base triangles drawn (hero ranges with a compiled patch excluded). */
  baseTriangles: number;
  /** Triangles drawn across every hero patch. */
  patchTriangles: number;
}

/** Build the V2 render world for one hole: one ground material (constraint),
 * the base LOD0 as an indexed BufferGeometry with hero ranges that have a
 * compiled patch excluded via index groups, and one indexed mesh per hero
 * patch with computed smooth vertex normals from its displaced positions
 * (`computeVertexNormals`; an analytic bunker normal replaces this later —
 * Task 9 — via the `orientation`/gradient fields already on the compiled
 * patch, not modelled here). No render loop: this returns static geometry
 * and a disposer, nothing here schedules a frame. */
export function buildV2World(input: V2WorldInput, options: V2WorldOptions = {}): { group: THREE.Group; dispose(): void; stats: V2WorldStats } {
  const style = options.style ?? MERIDIAN_STYLE;
  const material = createGroundMaterialV2(input.seed, style);
  const { geometry: baseGeometry, drawnTriangles: baseTriangles } = buildBaseGeometry(input.base, input.patchedRangeIds, style);
  const baseMesh = new THREE.Mesh(baseGeometry, [material]);
  baseMesh.castShadow = true; baseMesh.receiveShadow = true; baseMesh.name = 'golf-v2-base';

  const patchGeometries: THREE.BufferGeometry[] = [];
  const patchMeshes: THREE.Mesh[] = [];
  let patchTriangles = 0;
  for (const compiled of input.patches) {
    const geometry = buildPatchGeometry(compiled, style);
    patchGeometries.push(geometry);
    patchTriangles += compiled.patch.indices.length / 3;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `golf-v2-patch:${compiled.patch.id}`;
    patchMeshes.push(mesh);
  }

  const group = new THREE.Group();
  group.name = 'golf-v2-world';
  group.add(baseMesh, ...patchMeshes);

  const stats: V2WorldStats = {
    draws: 1 + patchMeshes.length, triangles: baseTriangles + patchTriangles,
    patches: patchMeshes.length, baseTriangles, patchTriangles,
  };
  const dispose = () => {
    baseGeometry.dispose();
    for (const geometry of patchGeometries) geometry.dispose();
    material.dispose();
  };
  return { group, dispose, stats };
}
