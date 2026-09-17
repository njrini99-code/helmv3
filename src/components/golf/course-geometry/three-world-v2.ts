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
 * untouched by this file.
 *
 * Task 11 follow-up: this module also compiles the hole's whole-hole field
 * atlas (field-atlas.ts, Task 10) and uploads its tracked SDF layers as one
 * `DataTexture` (`buildGroundSdfTexture`), so `ground-shader-v2.ts` can
 * classify fragments from it instead of the per-vertex class alone. Atlas
 * compile failure (a degenerate mesh bounding box; realistically never on a
 * real hole) does not fall back to V1 the way the rest of the pipeline
 * does — it degrades to `atlas: null`, and the ground material simply never
 * sets `GOLF_V2_ATLAS`, leaving the pre-atlas vertex-colour path exactly as
 * it was (ground-shader-v2.ts's own fallback contract). */
import * as THREE from 'three';
import { compileHeroPatches, type CompiledBunkerPatch } from '@/lib/golf/course-geometry/bunker-display-mesh';
import { compileBunkerNormalField } from '@/lib/golf/course-geometry/bunker-normal-field';
import { compileBaseDisplayLods, weldAndCleanTerrainMesh } from '@/lib/golf/course-geometry/display-mesh-v2';
import { compileFairwayDirectionField, fairwayDirectionLayer, type FairwayDirectionField } from '@/lib/golf/course-geometry/fairway-direction-field';
import { compileFieldAtlas, fieldAtlasBytes } from '@/lib/golf/course-geometry/field-atlas';
import type { ForestEdgeV2Result } from '@/lib/golf/course-geometry/forest-edge-v2';
import {
  classAlbedoLinear, classRoughness, dominantClass, FAIRWAY_GRAIN_BINDING, GROUND_ATLAS_TRACKED_CLASSES, GROUND_SDF_ATLAS_LAYERS,
  GROUND_SHADER_V2_VERSION, groundShaderV2Chunks, GROUND_V2_ATTRIBUTES, maxGroundEdgeBandM, seedFromPackageHash, STATIC_SHADOW_BINDING,
} from '@/lib/golf/course-geometry/ground-shader-v2';
import { compileHeroRegions } from '@/lib/golf/course-geometry/hero-patches';
import { compileStaticShadowField, staticShadowLayer, type StaticShadowField } from '@/lib/golf/course-geometry/static-shadow-field';
import { dequantizeSignedDistance, SDF_RANGE_M } from '@/lib/golf/course-geometry/surface-distance-field';
import type { TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { metricTerrainNormal, type MetricTerrainGrid } from '@/lib/golf/course-geometry/terrain-source';
import type { HoleScene } from '@/lib/golf/course-geometry/types';
import { SURFACE_CLASS_IDS, type SurfaceClass } from '@/lib/golf/course-geometry/visual-artifact';
import type { PackedDisplayMesh, PackedFieldAtlas, PackedHeroField, PackedHeroPatch } from '@/lib/golf/course-geometry/visual-artifact-v2';
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
  /** Whole-hole field atlas (field-atlas.ts) over the hole's own tactical/
   * hero bounds (not `boundsM`'s full context-mesh extent — see
   * `wholeHoleAtlasBoundsM`), or `null` when it could not be compiled — the
   * ground material then keeps its pre-atlas vertex-colour classification
   * (ground-shader-v2.ts's own fallback). */
  atlas: PackedFieldAtlas | null;
  /** One finer atlas per hero patch (plan §17 hero field), independent of
   * `atlas` above — a patch whose own atlas failed to compile (a degenerate
   * bounding box; realistically never on a real hole, like `atlas` itself)
   * simply has no entry here, and `buildV2World` draws it with the
   * whole-hole atlas's own texture instead of losing classification for
   * just that patch. */
  heroAtlases: PackedHeroField[];
  /** The mesh's own metric source grid (guaranteed non-null: `assembleV2World`
   * already falls back to V1 when it is absent) — the single source of truth
   * for shading normals (`applyMetricGridNormals`'s `metricTerrainNormal`
   * calls), so lighting reads the same smooth analytic surface everywhere
   * instead of the display triangulation's own (uneven,
   * canonical-outline-fan-sized) faceting. */
  metricGrid: MetricTerrainGrid;
  /** One analytic per-vertex normal array per entry in `patches`, same order
   * and vertex count (`compileBunkerNormalField`, computed in
   * `assembleV2World` rather than `buildV2World` because only this module
   * has the live `TerrainMesh` that call needs) — terrain slope blended with
   * the bunker bowl/lip's own analytic gradient near an outline or rim; a
   * pure green-complex patch (no `profiles`) degenerates to the plain
   * terrain normal, so one code path covers both. */
  heroNormals: readonly Float32Array[];
  /** Task 12 (§43–44): the hole's fairway/tee mow-direction field, or null
   * when it could not compile (no metric grid, no route) — then the material
   * simply never sets `GOLF_V2_FAIRWAY` and draws no mow grain. */
  fairwayField?: FairwayDirectionField | null;
  /** Task 16/21 (§68, §71): the baked static shadow field over the drawn
   * crowns (`assembleV2World`'s `forest` option) and the terrain, or null
   * when it could not compile — then no `GOLF_V2_SHADOW` and no bake. */
  shadowField?: StaticShadowField | null;
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

let warnedAtlasFallback = false;
/** Logs once that the field atlas is unavailable for this process — unlike
 * `warnFallbackOnce`, this never sends the hole back to V1: the V2 world
 * still renders, just with the pre-atlas vertex-colour classification. */
function warnAtlasFallbackOnce(reason: string, error?: unknown): void {
  if (warnedAtlasFallback) return;
  warnedAtlasFallback = true;
  console.warn(`[golf/three-world-v2] rendering V2 without a field atlas: ${reason}`, error ?? '');
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

// Task 11 follow-up (edge-defect fix): the whole-hole atlas used to be
// compiled at a fixed 512-texel target over `boundsOfPositions(base.positions)`
// — the *entire* context mesh, holes away from this one — which is what
// stretched one atlas to ~1.5 m/texel at hole 7 (the reported sawtooth on the
// fairway edge and every boundary far from a hero patch). These targets pick
// a texel *size* instead of a fixed texel *count*, over a much tighter frame
// (see `wholeHoleAtlasBoundsM`/`assembleV2World` below), so resolution no
// longer degrades with an unrelated context mesh's own size.
const WHOLE_HOLE_ATLAS_TEXEL_TARGET_M = 0.75;
const WHOLE_HOLE_ATLAS_MAX_TEXELS = 1024;
// Plan §17's own hero-field example (~0.195 m/texel over 100 m bounds).
const HERO_ATLAS_TEXEL_TARGET_M = 0.2;
const HERO_ATLAS_MAX_TEXELS = 512;
const HERO_ATLAS_PAD_M = 1;
/** Plan §17's hero-field intent ("excellent for SDF/material transitions" at
 * ~0.2 m/texel); every hero atlas this module compiles is checked against
 * this once (`warnHeroTexelTooCoarseOnce`) the same way `warnAtlasFallbackOnce`
 * flags a whole-hole compile problem — logged, never a V1/atlas fallback. */
const HERO_ATLAS_MAX_TEXEL_SIZE_M = 0.25;

/** Texel count along the longer bound axis that keeps texels at or under
 * `texelTargetM`, capped at `capTexels` (`atlasSize` in field-atlas.ts then
 * applies this same count uniformly to both axes). */
function targetTexelCount(longAxisM: number, texelTargetM: number, capTexels: number): number {
  return Math.min(capTexels, Math.max(1, Math.ceil(longAxisM / Math.max(1e-6, texelTargetM))));
}
function padBoundsM([x0, y0, x1, y1]: readonly [number, number, number, number], padM: number): [number, number, number, number] {
  return [x0 - padM, y0 - padM, x1 + padM, y1 + padM];
}
function unionBoundsM(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
function atlasTexelSizeM(atlas: PackedFieldAtlas): number {
  const [x0, y0, x1, y1] = atlas.boundsM;
  return Math.max((x1 - x0) / atlas.width, (y1 - y0) / atlas.height);
}

/** The whole-hole atlas's own frame: the hole's tactical (played) bounds
 * when the mesh carries a render profile, else the same full-mesh fallback
 * this used before (a legacy/synthetic mesh with no render profile), unioned
 * with every hero patch's own bounds — a green complex or bunker cluster can
 * reach slightly past the tactical box on whichever side the routing bends
 * toward (hole 7's own green complex does, by about 16 m), and this keeps
 * every base-mesh triangle adjacent to a hero patch inside the whole-hole
 * atlas too, never sampling it out of bounds (`ClampToEdgeWrapping`) —
 * before finally padding by the largest edge-band width for the same reason
 * at the tactical boundary itself. */
function wholeHoleAtlasBoundsM(mesh: TerrainMesh, fallbackBoundsM: [number, number, number, number], patches: readonly CompiledBunkerPatch[]): [number, number, number, number] {
  const tactical = mesh.renderProfile?.tacticalBoundsM ?? fallbackBoundsM;
  const raw = patches.reduce<[number, number, number, number]>((acc, compiled) => unionBoundsM(acc, compiled.patch.boundsM), tactical);
  return padBoundsM(raw, maxGroundEdgeBandM());
}

let warnedHeroTexelCoarse = false;
/** Logs once (never per-patch, never per-frame) that a hero atlas came out
 * coarser than the plan's own ~0.2 m/texel intent — still used, just flagged,
 * matching `warnAtlasFallbackOnce`'s severity for the whole-hole atlas. */
function warnHeroTexelTooCoarseOnce(patchId: string, texelM: number): void {
  if (warnedHeroTexelCoarse) return;
  warnedHeroTexelCoarse = true;
  console.warn(`[golf/three-world-v2] hero atlas for patch "${patchId}" is coarser than the ${HERO_ATLAS_MAX_TEXEL_SIZE_M}m/texel target: ${texelM.toFixed(3)}m/texel`);
}

/** Run the Task 5–8 pipeline for one hole and collect what the V2 ground
 * needs to draw it. Returns `null` (V1 fallback, R7) if the mesh has no
 * `metricGrid` (the V2 compilers all need one) or any compiler step throws;
 * either path logs once via `warnFallbackOnce` rather than throwing, so a
 * caller can always fall back to the V1 landscape unconditionally. */
export interface AssembleV2WorldOptions {
  /** The forest the world will draw (`compileForestEdgeV2`), so the static
   * shadow bake shadows exactly those crowns; without it the bake falls
   * back to V1's canopy symbols. */
  forest?: ForestEdgeV2Result | null;
}
export function assembleV2World(scene: HoleScene, mesh: TerrainMesh, options: AssembleV2WorldOptions = {}): V2WorldInput | null {
  const metricGrid = mesh.metricGrid;
  if (!metricGrid) { warnFallbackOnce('mesh has no metricGrid'); return null; }
  try {
    const welded = weldAndCleanTerrainMesh(mesh);
    const plan = compileHeroRegions(scene, mesh, welded);
    const lods = compileBaseDisplayLods(mesh, { heroPlan: { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds } });
    const patches = compileHeroPatches(scene, mesh, welded, plan);
    const base = lods.lod0;
    const boundsM = boundsOfPositions(base.positions);

    let atlas: PackedFieldAtlas | null = null;
    try {
      const atlasBoundsM = wholeHoleAtlasBoundsM(mesh, boundsM, patches);
      const longAxisM = Math.max(atlasBoundsM[2] - atlasBoundsM[0], atlasBoundsM[3] - atlasBoundsM[1]);
      const targetSize = targetTexelCount(longAxisM, WHOLE_HOLE_ATLAS_TEXEL_TARGET_M, WHOLE_HOLE_ATLAS_MAX_TEXELS);
      atlas = compileFieldAtlas(scene, mesh, atlasBoundsM, { targetSize });
    } catch (error) { warnAtlasFallbackOnce('field atlas compile threw', error); }

    // Task 11 follow-up: one finer atlas per hero patch (plan §17 hero
    // field), independent of the whole-hole compile above — a hero patch
    // keeps its own crisp edges even where the whole-hole atlas cannot
    // reach (e.g. a green complex's own bounds extending past the tactical
    // frame, absorbed above only up to its padding).
    const heroAtlases: PackedHeroField[] = [];
    for (const compiled of patches) {
      const patch = compiled.patch;
      try {
        const heroBoundsM = padBoundsM(patch.boundsM, HERO_ATLAS_PAD_M);
        const longAxisM = Math.max(heroBoundsM[2] - heroBoundsM[0], heroBoundsM[3] - heroBoundsM[1]);
        const targetSize = targetTexelCount(longAxisM, HERO_ATLAS_TEXEL_TARGET_M, HERO_ATLAS_MAX_TEXELS);
        const heroAtlas = compileFieldAtlas(scene, mesh, heroBoundsM, { targetSize });
        const texelM = atlasTexelSizeM(heroAtlas);
        if (texelM > HERO_ATLAS_MAX_TEXEL_SIZE_M) warnHeroTexelTooCoarseOnce(patch.id, texelM);
        heroAtlases.push({ patchId: patch.id, atlas: heroAtlas });
      } catch (error) { warnAtlasFallbackOnce(`hero atlas compile threw for patch "${patch.id}"`, error); }
    }

    // Analytic per-vertex shading normal for each patch (sawtooth fix,
    // follow-up to Task 9): terrain slope from the same metric grid, blended
    // with the bunker's own analytic bowl/lip gradient near an outline/rim.
    // Never throws (pure arithmetic; `assertBunkerNormalField`'s gates are
    // for tests, not called here) and needs no per-patch try/catch of its
    // own — a hero patch with no bunker `profiles` (a plain green complex)
    // degenerates to the plain terrain normal automatically.
    const heroNormals = patches.map(compiled => compileBunkerNormalField(compiled, mesh).normals);
    let fairwayField: FairwayDirectionField | null = null;
    try { fairwayField = compileFairwayDirectionField(mesh, scene); } catch (error) { warnAtlasFallbackOnce('fairway direction field compile threw', error); }
    let shadowField: StaticShadowField | null = null;
    try {
      const crowns = options.forest?.instances.filter(inst => inst.kind === 'crown' || inst.kind === 'mass') ?? null;
      shadowField = compileStaticShadowField(mesh, scene, { crowns });
    } catch (error) { warnAtlasFallbackOnce('static shadow field compile threw', error); }

    return {
      base, patches, patchedRangeIds: new Set(patches.map(compiled => compiled.patch.id)),
      seed: seedFromPackageHash(mesh.geometryHash), boundsM, atlas, heroAtlases, metricGrid, heroNormals, fairwayField, shadowField,
    };
  } catch (error) {
    warnFallbackOnce('V2 compile pipeline threw', error);
    return null;
  }
}

/** Reorders a copy of `indices` so every triangle's 2D (XY) winding is
 * counter-clockwise, i.e. its `(b-a)×(c-a)` Z component is positive. The
 * canonical terrain mesh's winding is not globally consistent — V1 corrects
 * it with the same per-triangle signed-area test before uploading positions
 * (three-landscape.ts), and the existing V2 debug views sidestep it entirely
 * with `DoubleSide` unlit materials. The ground material is `FrontSide`
 * (`createGroundMaterialV2`), so consistent CCW winding is what keeps every
 * triangle facing the camera instead of half the mesh being silently culled;
 * it is also still what makes `computeVertexNormals()`'s fallback average
 * point toward +Z ("up") rather than down, for the (realistically never)
 * vertices `applyMetricGridNormals`/`compileBunkerNormalField` cannot answer
 * from the metric grid. This runs once before geometry upload on both the
 * base mesh and every hero patch (patch sub-triangles inherit their parent
 * triangle's orientation, so they carry the same inconsistency). */
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

/** Overwrites a geometry's `normal` attribute with the metric grid's own
 * analytic gradient (`metricTerrainNormal`) at each vertex's world (x, y),
 * everywhere the grid can answer it. This is the fix for the faceted
 * "sawtooth" lighting along every fairway/rough/class boundary: the
 * canonical outline there is triangulated as a fan of dense slivers sitting
 * next to the base mesh's much bigger (8–18 m) triangles, and
 * `computeVertexNormals()`'s area-weighted average flips between
 * neighbouring slivers depending on which handful of triangles happen to
 * touch each one — a lighting discontinuity with no physical terrain
 * feature behind it. The analytic normal instead depends only on world XY
 * (via the same source grid the display mesh was interpolated from), so two
 * vertices on either side of one outline edge — same or nearly the same
 * position — get the same normal regardless of how the triangulator sliced
 * the fan around them. `geometry`'s `normal` attribute must already hold a
 * `computeVertexNormals()`-style face-average baseline (called by every
 * caller before this): a vertex the grid cannot answer (outside its bounds —
 * realistically never for a well-formed hole, since the grid covers at
 * least the mesh's own tactical/context bounds) keeps that baseline instead
 * of being left undefined. */
function applyMetricGridNormals(geometry: THREE.BufferGeometry, positions: Float32Array, grid: MetricTerrainGrid): void {
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const vertexCount = positions.length / 3;
  for (let v = 0; v < vertexCount; v++) {
    const n = metricTerrainNormal(grid, [positions[v * 3]!, positions[v * 3 + 1]!]);
    if (n) normal.setXYZ(v, n[0], n[1], n[2]);
  }
  normal.needsUpdate = true;
}

/** Uploads the field atlas's tracked SDF layers (`GROUND_SDF_ATLAS_LAYERS`:
 * green, bunker, fairway, water) as one RGBA `DataTexture`, decoded from
 * their fixed-point Uint16 codes into metres exactly as `sampleFieldAtlas`
 * does (`dequantizeSignedDistance`, §108) — the raw per-texel value, not a
 * bilinear resample of it, so the texture itself carries the same numbers a
 * CPU-side `sampleFieldAtlas` call would answer for the same texel.
 * `HalfFloatType` (not `FloatType`): WebGL2 filters 16-bit float textures
 * natively (`LinearFilter` below needs no `OES_texture_float_linear`
 * extension the way 32-bit float would), and half-float precision near zero
 * — where every classification boundary actually lives — is a few
 * millimetres; the same choice `buildDemSlopeTexture` (three-landscape.ts)
 * already made for this codebase's other DEM field texture. `frame` maps a
 * world XY straight to a normalized [0,1] UV (`(xy - frame.xy) * frame.zw`):
 * unlike that DEM texture's node-grid frame, the atlas's own bounds already
 * span exactly `width` × `height` texels (field-atlas.ts's `texelM`), so no
 * half-texel nudge is needed for the UV to land on the same texel centres
 * `sampleFieldAtlas`'s manual bilinear does. */
function buildGroundSdfTexture(atlas: PackedFieldAtlas): { texture: THREE.DataTexture; frame: THREE.Vector4 } {
  const { width, height, boundsM, sdfLayers } = atlas;
  const texels = width * height;
  const layerIndex = GROUND_SDF_ATLAS_LAYERS.map(name => sdfLayers?.layerNames.indexOf(name) ?? -1);
  const half = (value: number) => THREE.DataUtils.toHalfFloat(value);
  const data = new Uint16Array(texels * 4);
  for (let n = 0; n < texels; n++) for (let c = 0; c < 4; c++) {
    const index = layerIndex[c]!;
    // No layer (should not happen: compileFieldAtlas always packs all five)
    // decodes to a fully-outside distance, so it can never win a fragment.
    const code = index >= 0 && sdfLayers ? sdfLayers.data[index * texels + n]! : 1;
    data[n * 4 + c] = half(dequantizeSignedDistance(code, SDF_RANGE_M));
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'golf-v2-ground-sdf';
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
  texture.userData = { basis: 'source_derived_visual', layers: [...GROUND_SDF_ATLAS_LAYERS] };
  const [x0, y0, x1, y1] = boundsM;
  const frame = new THREE.Vector4(x0, y0, 1 / (x1 - x0), 1 / (y1 - y0));
  return { texture, frame };
}

/** Task 12 wiring, exactly `FAIRWAY_GRAIN_BINDING.encode` (ground-shader-v2.ts):
 * the field's direction/phase codes as one RG8 texture sampled NEAREST (both
 * channels wrap, so bilinear across a seam would streak), rows unpacked at
 * 1-byte alignment (an odd `columns` leaves RG8 rows unaligned to 4 bytes),
 * a frame nudged by half a texel so a world XY lands on its node's centre,
 * and the node spacing as `texelM`. */
function buildFairwayDirectionTexture(field: FairwayDirectionField): { texture: THREE.DataTexture; frame: THREE.Vector4; texelM: THREE.Vector2 } {
  const layer = fairwayDirectionLayer(field);
  const texture = new THREE.DataTexture(layer.values, layer.columns, layer.rows, THREE.RGFormat, THREE.UnsignedByteType);
  texture.name = 'golf-v2-fairway-direction';
  texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.unpackAlignment = 1; texture.needsUpdate = true;
  texture.userData = { basis: layer.basis, layer: layer.name };
  const half = layer.spacingM / 2;
  const frame = new THREE.Vector4(layer.originM[0] - half, layer.originM[1] - half, 1 / (layer.columns * layer.spacingM), 1 / (layer.rows * layer.spacingM));
  return { texture, frame, texelM: new THREE.Vector2(layer.spacingM, layer.spacingM) };
}

/** Task 16/21 wiring (`STATIC_SHADOW_BINDING`): the bake's combined layer
 * as one R8 texture, bilinear (a smooth penumbra is the point), frame
 * nudged by half a node so a node's value sits at its centre. */
function buildStaticShadowTexture(field: StaticShadowField): { texture: THREE.DataTexture; frame: THREE.Vector4 } {
  const layer = staticShadowLayer(field);
  const texture = new THREE.DataTexture(layer.values, layer.columns, layer.rows, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = 'golf-v2-static-shadow';
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.unpackAlignment = 1; texture.needsUpdate = true;
  texture.userData = { basis: layer.basis, layer: layer.name };
  const half = layer.spacingM / 2;
  return { texture, frame: new THREE.Vector4(layer.originM[0] - half, layer.originM[1] - half, 1 / (layer.columns * layer.spacingM), 1 / (layer.rows * layer.spacingM)) };
}

/** One class per patch vertex, resolved from the classes of the triangles
 * touching it by `GROUND_CLASS_PRIORITY` (`dominantClass`) — the same
 * vertex-level resolution `packDisplayMesh` already applies to the base
 * mesh, reproduced here because a hero patch carries only a per-triangle
 * `triangleClass` and a shared (indexed) vertex can hold only one shader
 * attribute value. Keeping patches indexed (rather than de-indexing to a
 * per-corner class) is what lets a shared vertex carry one shading normal
 * (the analytic terrain/bunker field, `compileBunkerNormalField`) that every
 * triangle touching it interpolates identically, and lets the class
 * boundary blend the same way the base mesh's does: by GPU interpolation of
 * two vertex colours across a shared edge. */
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

/** Per-vertex class attributes. With an atlas the tracked classes (green,
 * bunker, fairway, water, fringe) are painted by the SDF path, so their
 * vertices bake the *rough* albedo instead of their own: a mixed-class base
 * triangle then never interpolates sand or green into the fragments outside
 * the true outline (the "spiky rim" halo of the first v2-world capture).
 * Without an atlas every class keeps its own colour (the V1-equivalent path). */
function classAttributes(classIds: Uint8Array, style: MeridianStyle, atlasPainted = false): { classFloat: Float32Array; color: Float32Array; roughness: Float32Array; atlasTrust: Float32Array } {
  const vertexCount = classIds.length;
  const classFloat = new Float32Array(vertexCount), color = new Float32Array(vertexCount * 3), roughness = new Float32Array(vertexCount);
  const atlasTrust = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const cls = SURFACE_CLASS_IDS[classIds[v]!] ?? 'ground';
    const tracked = GROUND_ATLAS_TRACKED_CLASSES.has(cls);
    classFloat[v] = classIds[v]!;
    color.set(classAlbedoLinear(atlasPainted && tracked ? 'rough' : cls, style), v * 3);
    roughness[v] = classRoughness(atlasPainted && tracked ? 'rough' : cls, style);
    atlasTrust[v] = tracked ? 1 : 0;
  }
  return { classFloat, color, roughness, atlasTrust };
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
 * uniform value.
 *
 * Task 11 follow-up: `atlas`, when present, becomes one `golfV2Sdf`
 * `DataTexture` uniform (`buildGroundSdfTexture`) and sets the
 * `GOLF_V2_ATLAS` define that unlocks `ground-shader-v2.ts`'s atlas
 * classification block — a genuine shader-structure switch (§77 permits
 * this in `customProgramCacheKey`; it changes which GLSL exists, not a
 * per-hole number), so the cache key folds in whether it is set.
 *
 * Hero-atlas follow-up: `golfV2Sdf`/`golfV2SdfFrame` are per-material
 * uniforms, and `buildV2World` creates one material *instance* per atlas it
 * draws with (the whole-hole atlas for the base mesh, one per hero atlas
 * for its patch). Every instance is built here from the same chunks with
 * the same `customProgramCacheKey`, so three compiles ONE program and the
 * instances only differ in the two atlas uniform values — the "one ground
 * material" constraint holds at the program/look level, which is the level
 * it exists for. The earlier design (one shared instance whose uniform
 * values a mesh's `onBeforeRender` swapped) silently did nothing: three
 * (WebGLRenderer.setProgram) only re-uploads a MeshStandardMaterial's
 * uniforms when the material *id* changes between draws (`refreshMaterial`;
 * `uniformsNeedUpdate` is honoured for ShaderMaterial only), so every
 * consecutive draw of the shared instance kept whichever atlas the first
 * draw uploaded — the green-complex patch rendered with a bunker patch's
 * 20 m atlas, clamped to its edge texels, as one beige rectangle. Distinct
 * ids are exactly what make three upload each mesh's own atlas. */
function createGroundMaterialV2(seed: readonly [number, number], style: MeridianStyle, sdf: GroundSdfBinding | null, fairway: FairwayGrainBinding | null = null, shadow: GroundSdfBinding | null = null): THREE.MeshStandardMaterial {
  const chunks = groundShaderV2Chunks(style);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.FrontSide });
  material.name = 'meridian-ground-v2';
  // Merge, never overwrite: MeshStandardMaterial's constructor already sets
  // `defines = { STANDARD: '' }`, which a shared lighting chunk
  // (lights_fragment_begin) reads to pick the standard (not physical)
  // branch — losing it would silently mis-light every V2 ground fragment.
  if (sdf) material.defines = { ...material.defines, GOLF_V2_ATLAS: 1 };
  if (fairway) material.defines = { ...material.defines, [FAIRWAY_GRAIN_BINDING.define]: 1 };
  if (shadow) material.defines = { ...material.defines, [STATIC_SHADOW_BINDING.define]: 1 };
  const shadowUniforms = shadow ? { [STATIC_SHADOW_BINDING.sampler]: { value: shadow.texture }, [STATIC_SHADOW_BINDING.frame]: { value: shadow.frame } } : null;
  const sdfUniforms = sdf ? { golfV2Sdf: { value: sdf.texture }, golfV2SdfFrame: { value: sdf.frame } } : null;
  const fairwayUniforms = fairway ? {
    [FAIRWAY_GRAIN_BINDING.sampler]: { value: fairway.texture }, [FAIRWAY_GRAIN_BINDING.frame]: { value: fairway.frame }, [FAIRWAY_GRAIN_BINDING.texelM]: { value: fairway.texelM },
  } : null;
  material.onBeforeCompile = shader => {
    shader.uniforms.golfV2Seed = { value: new THREE.Vector2(seed[0], seed[1]) };
    if (sdfUniforms) Object.assign(shader.uniforms, sdfUniforms);
    if (fairwayUniforms) Object.assign(shader.uniforms, fairwayUniforms);
    if (shadowUniforms) Object.assign(shader.uniforms, shadowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${chunks.vertexHead}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${chunks.vertexMain}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${chunks.fragmentHead}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${chunks.fragmentColor}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${chunks.fragmentRoughness}`);
  };
  material.customProgramCacheKey = () => `${GROUND_SHADER_V2_VERSION}:${MERIDIAN_STYLE_HASH}:atlas=${sdf ? 1 : 0}:fairway=${fairway ? 1 : 0}:shadow=${shadow ? 1 : 0}`;
  // Exposed for tests/debug tooling only (terrain-debug.ts's own
  // `userData.debugV2` pattern) — the material does not read this back;
  // three reads the identical objects merged into `shader.uniforms` above.
  if (sdfUniforms) material.userData = { ...material.userData, golfV2AtlasBinding: sdfUniforms };
  if (fairwayUniforms) material.userData = { ...material.userData, golfV2FairwayBinding: fairwayUniforms };
  return material;
}

/** One uploaded SDF atlas: the texture plus the world→UV frame the shader
 * samples it through (`buildGroundSdfTexture`). */
interface GroundSdfBinding { texture: THREE.DataTexture; frame: THREE.Vector4 }
/** One uploaded fairway-direction field (`buildFairwayDirectionTexture`). */
interface FairwayGrainBinding { texture: THREE.DataTexture; frame: THREE.Vector4; texelM: THREE.Vector2 }

function buildBaseGeometry(base: PackedDisplayMesh, patchedRangeIds: ReadonlySet<string>, style: MeridianStyle, atlasPainted: boolean, metricGrid: MetricTerrainGrid): { geometry: THREE.BufferGeometry; drawnTriangles: number } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(rewindTrianglesCCW(base.positions, base.indices), 1));
  // Face-average baseline, then the analytic metric-grid normal wherever the
  // grid can answer it (sawtooth fix — see `applyMetricGridNormals`).
  geometry.computeVertexNormals();
  applyMetricGridNormals(geometry, base.positions, metricGrid);
  const { classFloat, color, roughness, atlasTrust } = classAttributes(base.surfaceClass, style, atlasPainted);
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.surfaceClass, new THREE.BufferAttribute(classFloat, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.visualOffset, new THREE.BufferAttribute(new Float32Array(base.vertexCount), 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.roughness, new THREE.BufferAttribute(roughness, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.atlasTrust, new THREE.BufferAttribute(atlasTrust, 1));
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

function buildPatchGeometry(compiled: CompiledBunkerPatch, style: MeridianStyle, atlasPainted: boolean, normals: Float32Array): THREE.BufferGeometry {
  const { patch, triangleClass } = compiled;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(patch.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(rewindTrianglesCCW(patch.positions, patch.indices), 1));
  // Analytic terrain/bunker normal field (`compileBunkerNormalField`,
  // precomputed in `assembleV2World` where the live `TerrainMesh` is
  // available) replaces `computeVertexNormals()`: it already matches the
  // base mesh's own metric-grid normal at the shared outline, so the two
  // meshes shade continuously across the seam a hero patch cuts out of the
  // base (the same sawtooth this fixes there).
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const classIds = resolvePatchVertexClasses(patch, triangleClass);
  const { classFloat, color, roughness, atlasTrust } = classAttributes(classIds, style, atlasPainted);
  const vertexCount = patch.positions.length / 3, offset = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) offset[v] = patch.visualOffsetMm[v]! / 1000;
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.surfaceClass, new THREE.BufferAttribute(classFloat, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.visualOffset, new THREE.BufferAttribute(offset, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.roughness, new THREE.BufferAttribute(roughness, 1));
  geometry.setAttribute(GROUND_V2_ATTRIBUTES.atlasTrust, new THREE.BufferAttribute(atlasTrust, 1));
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
  /** Task 12: whether the ground program draws the fairway/tee mow grain
   * (`GOLF_V2_FAIRWAY` set: an atlas compiled and the direction field too). */
  fairwayGrain: boolean;
  /** Task 16/21: whether the baked static shadow field is bound (`GOLF_V2_SHADOW`). */
  staticShadow: boolean;
  /** Packed bytes of the whole-hole field atlas plus every hero atlas
   * (`fieldAtlasBytes`, §94 — the same estimator `compileVisualArtifactV2`'s
   * own budget uses), 0 when no atlas was compiled for this hole. This is
   * the packed-struct estimate, not the smaller amount actually uploaded to
   * the GPU today (only the four tracked SDF layers become a texture,
   * `buildGroundSdfTexture`); see the Task 11 hero-atlas report for both
   * numbers on hole 7. */
  atlasBytes: number;
  /** Hero atlases actually compiled (`V2WorldInput.heroAtlases.length`) —
   * equal to `patches` on a real hole (a hero atlas only fails to compile on
   * a degenerate patch bounding box, realistically never). */
  heroAtlasCount: number;
  /** Source of the `normal` attribute on every mesh this call built
   * (sawtooth fix): the metric source grid's own analytic gradient
   * (`applyMetricGridNormals`/`compileBunkerNormalField`), not
   * `computeVertexNormals()`'s per-triangle area-weighted average. Always
   * `'metric_grid'` today — `V2WorldInput.metricGrid` is guaranteed non-null
   * (R7: `assembleV2World` falls back to V1 otherwise) — kept as a labelled
   * field rather than a bare assumption so a debug view or capture report
   * can assert it directly, the same way `three-landscape.ts` exposes
   * `group.userData.vertexNormalBasis`. */
  normalsBasis: 'metric_grid';
}

/** Build the V2 render world for one hole: one ground material (constraint),
 * the base LOD0 as an indexed BufferGeometry with hero ranges that have a
 * compiled patch excluded via index groups, and one indexed mesh per hero
 * patch — every vertex normal analytic (the metric grid's own gradient,
 * blended with the bunker bowl/lip's analytic gradient on a patch,
 * `V2WorldInput.metricGrid`/`heroNormals`; see `applyMetricGridNormals` and
 * `bunker-normal-field.ts`), not `computeVertexNormals()`'s triangle-average
 * (kept only as its base-mesh fallback for a vertex outside the grid).
 * No render loop: this returns static geometry and a disposer, nothing here
 * schedules a frame. */
export function buildV2World(input: V2WorldInput, options: V2WorldOptions = {}): { group: THREE.Group; dispose(): void; stats: V2WorldStats } {
  const style = options.style ?? MERIDIAN_STYLE;
  const wholeHoleSdf = input.atlas ? buildGroundSdfTexture(input.atlas) : null;
  // Task 12: the mow grain reads its own field texture, shared by every
  // material instance (the field is per hole, not per atlas), and only
  // where the atlas classified the fragment as fairway — no atlas, no grain.
  const fairway = wholeHoleSdf && input.fairwayField ? buildFairwayDirectionTexture(input.fairwayField) : null;
  const shadow = input.shadowField ? buildStaticShadowTexture(input.shadowField) : null;
  const material = createGroundMaterialV2(input.seed, style, wholeHoleSdf, fairway, shadow);
  const atlasPainted = wholeHoleSdf !== null;
  const { geometry: baseGeometry, drawnTriangles: baseTriangles } = buildBaseGeometry(input.base, input.patchedRangeIds, style, atlasPainted, input.metricGrid);
  const baseMesh = new THREE.Mesh(baseGeometry, [material]);
  baseMesh.castShadow = true; baseMesh.receiveShadow = true; baseMesh.name = 'golf-v2-base';

  // Hero-atlas follow-up: one finer SDF texture per compiled hero atlas,
  // keyed by the patch id it shades (`buildGroundSdfTexture` is already
  // atlas-shape-agnostic — the same function the whole-hole atlas uses
  // above), each bound through its own instance of the one ground material
  // (see `createGroundMaterialV2`'s header for why an instance, not a
  // uniform swap). A patch with no entry (its own atlas failed to compile)
  // simply draws with the base mesh's whole-hole material instead.
  const heroSdfByPatchId = new Map<string, GroundSdfBinding>();
  const heroMaterialByPatchId = new Map<string, THREE.MeshStandardMaterial>();
  if (wholeHoleSdf) for (const hero of input.heroAtlases) {
    const sdf = buildGroundSdfTexture(hero.atlas);
    heroSdfByPatchId.set(hero.patchId, sdf);
    heroMaterialByPatchId.set(hero.patchId, createGroundMaterialV2(input.seed, style, sdf, fairway, shadow));
  }

  const patchGeometries: THREE.BufferGeometry[] = [];
  const patchMeshes: THREE.Mesh[] = [];
  let patchTriangles = 0;
  // `input.heroNormals` is index-aligned with `input.patches` (same order,
  // both produced by one `.map()` over `patches` in `assembleV2World`).
  input.patches.forEach((compiled, i) => {
    const geometry = buildPatchGeometry(compiled, style, atlasPainted, input.heroNormals[i]!);
    patchGeometries.push(geometry);
    patchTriangles += compiled.patch.indices.length / 3;
    const mesh = new THREE.Mesh(geometry, heroMaterialByPatchId.get(compiled.patch.id) ?? material);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `golf-v2-patch:${compiled.patch.id}`;
    patchMeshes.push(mesh);
  });

  const group = new THREE.Group();
  group.name = 'golf-v2-world';
  group.add(baseMesh, ...patchMeshes);

  const heroAtlasBytes = input.heroAtlases.reduce((sum, hero) => sum + fieldAtlasBytes(hero.atlas), 0);
  const stats: V2WorldStats = {
    draws: 1 + patchMeshes.length, triangles: baseTriangles + patchTriangles,
    patches: patchMeshes.length, baseTriangles, patchTriangles,
    atlasBytes: (input.atlas ? fieldAtlasBytes(input.atlas) : 0) + heroAtlasBytes,
    heroAtlasCount: input.heroAtlases.length,
    fairwayGrain: fairway !== null,
    staticShadow: shadow !== null,
    normalsBasis: 'metric_grid',
  };
  const dispose = () => {
    baseGeometry.dispose();
    for (const geometry of patchGeometries) geometry.dispose();
    material.dispose();
    for (const heroMaterial of heroMaterialByPatchId.values()) heroMaterial.dispose();
    wholeHoleSdf?.texture.dispose();
    fairway?.texture.dispose();
    shadow?.texture.dispose();
    for (const { texture } of heroSdfByPatchId.values()) texture.dispose();
  };
  return { group, dispose, stats };
}
