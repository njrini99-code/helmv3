import * as THREE from 'three';
import { allocateCrowns, canopySymbols, crownScale } from '@/lib/golf/course-geometry/canopy';
import { boundaryDistance } from '@/lib/golf/course-geometry/display-outline';
import { terrainHeight, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { assertVisualArtifact, compileVisualArtifact, linearAlbedo, type MeridianVisualArtifact } from '@/lib/golf/course-geometry/visual-artifact';
import { MERIDIAN_PALETTE, MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION, type MeridianPaletteKey, type MeridianStyleOverrides } from '@/lib/golf/course-geometry/visual-style';
import { createTreeAssetAtlas, type TreeCrownAsset } from './tree-assets';

export type ThreeLandscapePalette = Readonly<Record<MeridianPaletteKey, THREE.ColorRepresentation>>;

/** sRGB surface albedos, separate from Fairway's application UI tokens.
 * No directional illumination is baked into these colors. The values live in
 * the Meridian visual kit (§112); the terrain's per-vertex albedo is compiled
 * from them into the visual artifact, so this palette drives crowns and trunks
 * here and the artifact compiler everywhere else. */
export const DEFAULT_THREE_LANDSCAPE_PALETTE: ThreeLandscapePalette = MERIDIAN_PALETTE;

export interface ThreeLandscape {
  group: THREE.Group;
  /** The read-only inspection ray targets the terrain, never decorative crowns. */
  terrain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  setExaggeration(exaggeration: number, referenceElevationM: number): void;
  /** Swap shared crown assets without changing any instance transform. */
  /** Near crowns are swapped in only for batch tiles around `focusM`; without
   * a focus every crown takes the requested level. Returns whether anything changed. */
  setDetail(detail: 'distant' | 'near', focusM?: PointM): boolean;
  /** Runtime amplitude overrides for the lab; never part of the artifact. */
  setStyleOverrides(overrides: MeridianStyleOverrides): void;
  dispose(): void;
  /** The visual world this landscape was built from (§6). */
  artifact: MeridianVisualArtifact;
  artifactSource: 'supplied' | 'runtime';
  counts: { terrainTriangles: number; trees: number; crownInstances: number; crownTriangles: number; totalTriangles: number; canopyBatches: number; drawCalls: number };
}

const TREE_LIMIT = 720;
const CANOPY_TILE_M = 64;
// Near crowns cost about five times a distant one, so only the tiles within
// this reach of the camera focus (the green a golfer is reading) take them.
const NEAR_DETAIL_RADIUS_M = 150;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function variation(seed: number): number {
  let n = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}

function featureSeed(id: string): number {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  return seed;
}

/** Index of 'green' in SURFACE_CLASS_IDS; the shader compares the class attribute. */
const SURFACE_CLASS_GREEN = 4;

export interface TurfStyleTarget extends THREE.Material { onBeforeCompile: THREE.Material['onBeforeCompile']; customProgramCacheKey: THREE.Material['customProgramCacheKey'] }
export interface TurfStyleHandle { setOverrides(overrides: MeridianStyleOverrides): void }

/** Attach the Meridian ground material (§17–25, §53, §56) to any material that
 * includes `color_fragment`, so the unlit albedo debug view and the lit
 * production material share exactly one colour pipeline. Everything here is
 * decoration in world-space metres: macro turf variation (25–70 m), micro
 * turf response (0.25–1.5 m, filtered out at distance), route-local mowing
 * bands that fade before the fairway edge, a short boundary lip, context
 * desaturation, and per-surface roughness. None of it moves an edge, encodes
 * a real surface condition, or participates in picking or reconstruction. */
export function attachTurfStyle(material: TurfStyleTarget, seed: readonly [number, number], overrides: MeridianStyleOverrides = {}): TurfStyleHandle {
  const style = MERIDIAN_STYLE;
  const amplitudes = new THREE.Vector4(style.turf.macro.amplitude, style.turf.micro.amplitude, style.mowing.amplitude, style.boundary.shade);
  const contextMix: { value: number } = { value: style.context.desaturate };
  const apply = (next: MeridianStyleOverrides) => {
    amplitudes.set(style.turf.macro.amplitude * (next.macro ?? 1), style.turf.micro.amplitude * (next.micro ?? 1),
      style.mowing.amplitude * (next.mowing ?? 1), style.boundary.shade * (next.boundary ?? 1));
    contextMix.value = style.context.desaturate * (next.context ?? 1);
  };
  apply(overrides);
  const [m0, m1, m2] = style.turf.macro.wavelengthsM, [u0, u1] = style.turf.micro.wavelengthsM;
  const k = (wavelength: number) => (2 * Math.PI / wavelength).toFixed(6);
  material.onBeforeCompile = shader => {
    shader.uniforms.golfSeed = { value: new THREE.Vector2(seed[0], seed[1]) };
    shader.uniforms.golfAmplitudes = { value: amplitudes };
    shader.uniforms.golfContextDesaturate = contextMix;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float golfMowingWeight;
attribute float golfTurfWeight;
attribute float golfContextWeight;
attribute float golfRoughness;
attribute float golfSurfaceClass;
attribute float golfBoundaryDistance;
attribute vec2 golfRouteST;
varying vec2 vGolfWorldXY;
varying vec2 vGolfRouteST;
varying vec4 vGolfWeights;
varying vec3 vGolfSurface;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGolfWorldXY = (modelMatrix * vec4(position, 1.0)).xy;
vGolfRouteST = golfRouteST;
vGolfWeights = vec4(golfMowingWeight, golfTurfWeight, golfContextWeight, golfBoundaryDistance);
vGolfSurface = vec3(golfRoughness, golfSurfaceClass, 0.0);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform vec2 golfSeed;
uniform vec4 golfAmplitudes;
uniform float golfContextDesaturate;
varying vec2 vGolfWorldXY;
varying vec2 vGolfRouteST;
varying vec4 vGolfWeights;
varying vec3 vGolfSurface;`).replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 golfP = vGolfWorldXY + golfSeed;
  float golfMowingWeight = vGolfWeights.x, golfTurfWeight = vGolfWeights.y, golfContextWeight = vGolfWeights.z, golfBoundary = vGolfWeights.w;
  bool golfGreen = abs(vGolfSurface.y - ${SURFACE_CLASS_GREEN}.0) < 0.5;
  // Macro turf variation (§18): three world-space wavelengths, 25–70 m,
  // seeded per package so the same course always shows the same field.
  float golfMacro = (sin(dot(golfP, vec2(0.87, 0.49) * ${k(m0)}))
    + sin(dot(golfP, vec2(-0.32, 0.95) * ${k(m1)}) + 1.3)
    + sin(dot(golfP, vec2(0.61, -0.79) * ${k(m2)}) + 2.1)) / 3.0;
  golfMacro *= golfGreen ? ${style.turf.greenMacroScale.toFixed(3)} : 1.0;
  // Micro turf response (§19): 0.25–1.5 m, filtered by screen-space
  // derivative so it fades before it can shimmer at distance.
  float golfMicroPhase = dot(golfP, vec2(0.71, 0.70) * ${k(u0)});
  float golfMicro = 0.5 * sin(golfMicroPhase) + 0.5 * sin(dot(golfP, vec2(-0.44, 0.90) * ${k(u1)}) + 0.7);
  float golfMicroVisible = 1.0 - smoothstep(${style.turf.microFadeFwidth[0].toFixed(3)}, ${style.turf.microFadeFwidth[1].toFixed(3)}, fwidth(golfMicroPhase));
  golfMicro *= golfMicroVisible * (golfGreen ? ${style.turf.greenMicroScale.toFixed(3)} : 1.0);
  // Mowing (§22): bands along the play line in route-local metres with a
  // small skew; derivative-filtered edges; weight already fades at the edge.
  float golfPhase = (vGolfRouteST.y + vGolfRouteST.x * ${style.mowing.skew.toFixed(3)}) / ${style.mowing.bandWidthM.toFixed(3)};
  float golfWave = sin(golfPhase * 3.141592653589793);
  float golfFilter = max(fwidth(golfWave), 0.025);
  float golfBand = smoothstep(-golfFilter, golfFilter, golfWave) * 2.0 - 1.0;
  float golfBandVisible = 1.0 - smoothstep(${style.mowing.fadeFwidth[0].toFixed(3)}, ${style.mowing.fadeFwidth[1].toFixed(3)}, fwidth(golfPhase));
  // Boundary softness (§25): a short darker lip inside every feature edge.
  float golfEdge = 1.0 - smoothstep(0.0, ${style.boundary.fieldM.toFixed(3)}, golfBoundary);
  diffuseColor.rgb *= 1.0
    + golfMacro * golfAmplitudes.x * golfTurfWeight
    + golfMicro * golfAmplitudes.y * golfTurfWeight
    + golfBand * golfBandVisible * golfAmplitudes.z * golfMowingWeight
    - golfEdge * golfAmplitudes.w;
  // Context (§53): real surfaces, quieter. Albedo only; never alpha.
  float golfLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(golfLuma), golfContextWeight * golfContextDesaturate);
}`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = vGolfSurface.x;`);
  };
  material.customProgramCacheKey = () => `golf-landscape-turf-${MERIDIAN_STYLE_HASH}:${material.type}`;
  material.userData.mowing = { basis: 'illustrative_style', bandWidthM: style.mowing.bandWidthM, frame: 'route_local' };
  material.userData.turf = { basis: 'visual_only', macroM: style.turf.macro.wavelengthsM, microM: style.turf.micro.wavelengthsM };
  material.userData.styleVersion = MERIDIAN_STYLE_VERSION; material.userData.styleHash = MERIDIAN_STYLE_HASH;
  return { setOverrides: apply };
}
function terrainMaterial(seed: readonly [number, number], overrides: MeridianStyleOverrides): { material: THREE.MeshStandardMaterial; turf: TurfStyleHandle } {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.name = 'course-lit-albedo';
  return { material, turf: attachTurfStyle(material, seed, overrides) };
}

/** Build a scene-owned landscape once. Camera gestures only move the camera;
 * geometry changes here only when visual Z exaggeration changes. Every XY and
 * source Z stays in its source frame, and the input package is never mutated. */
export function buildThreeLandscape(
  scene: HoleScene,
  mesh: TerrainMesh,
  palette: ThreeLandscapePalette = DEFAULT_THREE_LANDSCAPE_PALETTE,
  options: { artifact?: MeridianVisualArtifact; overrides?: MeridianStyleOverrides } = {},
): ThreeLandscape {
  // The visual world (§6): supplied from the cache and hash-gated, or compiled
  // now from the same canonical inputs. Either way it decorates; it never
  // becomes a source for picking, framing or shot math.
  let artifact = options.artifact, artifactSource: ThreeLandscape['artifactSource'] = 'supplied';
  if (artifact) assertVisualArtifact(artifact, scene, mesh);
  else { artifact = compileVisualArtifact(scene, mesh); artifactSource = 'runtime'; }
  const group = new THREE.Group();
  group.name = 'golf-course-landscape';
  group.userData = { geometryHash: mesh.geometryHash, terrainHash: mesh.contentHash,
    styleVersion: MERIDIAN_STYLE_VERSION, styleHash: MERIDIAN_STYLE_HASH, artifactHash: artifact.contentHash, artifactSource,
    canopyHeightBasis: 'illustrative', mowingBasis: 'illustrative_style' };
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const instances: THREE.InstancedMesh[] = [];

  // Conforming triangles already preserve multipart features and polygon holes.
  // Normalize winding on this display copy, without triangulating again.
  const source = new Float64Array(mesh.vertices.length);
  const sourceNormals = mesh.sourceNormals ? new Float32Array(source.length) : null;
  if (mesh.sourceNormals && mesh.sourceNormals.length !== source.length) throw new Error('Terrain normal/source vertex mismatch');
  const vertexCount = mesh.vertices.length / 3, albedo = linearAlbedo(artifact), attributes = artifact.attributes;
  const colors = new Float32Array(mesh.vertices.length), mowing = new Float32Array(vertexCount), turf = new Float32Array(vertexCount);
  const contextWeight = new Float32Array(vertexCount), roughness = new Float32Array(vertexCount), surfaceClass = new Float32Array(vertexCount);
  const boundary = new Float32Array(vertexCount), routeST = new Float32Array(vertexCount * 2);
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const offset = t * 9, v = mesh.vertices;
    const winding = (v[offset + 3]! - v[offset]!) * (v[offset + 7]! - v[offset + 1]!) -
      (v[offset + 6]! - v[offset]!) * (v[offset + 4]! - v[offset + 1]!);
    const order = winding < 0 ? [0, 2, 1] : [0, 1, 2];
    for (let corner = 0; corner < 3; corner++) {
      const index = offset + corner * 3, original = offset + order[corner]! * 3, vertex = index / 3, from = original / 3;
      source.set(v.slice(original, original + 3), index);
      if (sourceNormals) sourceNormals.set(mesh.sourceNormals!.slice(original, original + 3), index);
      // Artifact attributes follow the same corner permutation as the positions.
      colors.set(albedo.subarray(original, original + 3), index);
      mowing[vertex] = attributes.mowingWeight[from]! / 255;
      turf[vertex] = attributes.turfWeight[from]! / 255;
      contextWeight[vertex] = attributes.contextWeight[from]! / 255;
      roughness[vertex] = attributes.roughness[from]! / 255;
      surfaceClass[vertex] = attributes.surfaceClass[from]!;
      boundary[vertex] = attributes.boundaryDistanceCm[from]! / 100;
      routeST[vertex * 2] = attributes.routeST[from * 2]!; routeST[vertex * 2 + 1] = attributes.routeST[from * 2 + 1]!;
    }
  }

  const terrainGeometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(source), 3).setUsage(THREE.DynamicDrawUsage);
  const normals = new THREE.BufferAttribute(new Float32Array(source.length), 3).setUsage(THREE.DynamicDrawUsage);
  terrainGeometry.setAttribute('position', positions);
  terrainGeometry.setAttribute('normal', normals);
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeometry.setAttribute('golfMowingWeight', new THREE.BufferAttribute(mowing, 1));
  terrainGeometry.setAttribute('golfTurfWeight', new THREE.BufferAttribute(turf, 1));
  terrainGeometry.setAttribute('golfContextWeight', new THREE.BufferAttribute(contextWeight, 1));
  terrainGeometry.setAttribute('golfRoughness', new THREE.BufferAttribute(roughness, 1));
  terrainGeometry.setAttribute('golfSurfaceClass', new THREE.BufferAttribute(surfaceClass, 1));
  terrainGeometry.setAttribute('golfBoundaryDistance', new THREE.BufferAttribute(boundary, 1));
  terrainGeometry.setAttribute('golfRouteST', new THREE.BufferAttribute(routeST, 2));
  geometries.add(terrainGeometry);
  const { material, turf: turfStyle } = terrainMaterial(artifact.seed, options.overrides ?? {});
  materials.add(material);
  const terrain = new THREE.Mesh(terrainGeometry, material);
  terrain.name = 'course-terrain';
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  group.add(terrain);

  // Legacy meshes retain their existing coincident-vertex fallback. Compiled
  // DEM gradient normals bypass it so polygon cuts cannot introduce lighting
  // discontinuities at T-junctions or material boundaries.
  const normalGroups = new Int32Array(source.length / 3), normalKeys = new Map<string, number>();
  if (!sourceNormals) for (let i = 0; i < source.length; i += 3) {
    const key = `${Math.round(source[i]! * 1e4)},${Math.round(source[i + 1]! * 1e4)},${Math.round(source[i + 2]! * 1e4)}`;
    let index = normalKeys.get(key);
    if (index == null) { index = normalKeys.size; normalKeys.set(key, index); }
    normalGroups[i / 3] = index;
  }
  const summedNormals = new Float64Array(normalKeys.size * 3);

  interface Tree { id: string; tile: string; x: number; y: number; groundZ: number; radius: number; trunkRadius: number; height: number; yaw: number; aspect: number; family: number; color: THREE.Color }
  const treeAtlas = createTreeAssetAtlas();
  const trees: Tree[] = [];
  const crownPalette = [palette.tree, palette.treeLight, palette.treeHighlight].map(color => new THREE.Color(color));
  // Context belongs to scenery and collision exclusions only. It never expands
  // the hole's shot-reconstruction or inferred-surface domain.
  const canopyFeatures = new Map<string, LocalFeature>();
  for (const feature of scene.contextFeatures ?? []) canopyFeatures.set(feature.id, feature);
  for (const feature of scene.features) canopyFeatures.set(feature.id, feature);
  const canopyScene = { ...scene, features: [...canopyFeatures.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  const excludedRings = canopyScene.features.filter(feature => feature.kind !== 'woods' && feature.kind !== 'route')
    .flatMap(feature => feature.parts.flat());
  const courseFrame = mesh.originWgs84.join(',');
  const canopyGroups = canopyScene.features.filter(feature => feature.kind === 'woods' && feature.reviewed);
  // Over budget, keep the crowns nearest the played hole's own surfaces: the
  // forest edge a golfer sees, not the interior of a mass behind it.
  const ownRings = scene.features.filter(feature => feature.kind !== 'woods' && feature.kind !== 'route').flatMap(feature => feature.parts.flat());
  const nearness = (point: PointM) => ownRings.reduce((minimum, ring) => Math.min(minimum, boundaryDistance(point, ring)), Infinity);
  const allocated = allocateCrowns(canopyGroups.map(feature => canopySymbols(feature, canopyScene)), TREE_LIMIT, nearness);
  for (const [groupIndex, feature] of canopyGroups.entries()) {
    const clearanceRings = [...feature.parts.flat(), ...excludedRings];
    for (const point of allocated[groupIndex]!) {
      if (trees.some(tree => Math.hypot(tree.x - point[0], tree.y - point[1]) < 5.4)) continue;
      const groundZ = terrainHeight(mesh, point);
      if (groundZ == null) continue;
      const id = `canopy:${courseFrame}:${feature.id}:${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}`;
      const n = featureSeed(id), baseRadius = 3.6 * crownScale(n);
      // Broaden the artwork at the same accepted pattern centers. The complete
      // crown stays inside its reviewed mask, including holes, and clear of
      // playing surfaces. Width never changes the illustrative height or trunk.
      const clearance = clearanceRings.reduce((minimum, ring) =>
        Math.min(minimum, boundaryDistance(point, ring)), Infinity);
      const radius = Math.min(baseRadius * 1.5, Math.max(0, clearance - .15));
      const family = Math.floor(variation(n + 71) * treeAtlas.variants.length) % treeAtlas.variants.length;
      const colorIndex = Math.floor(variation(n + 127) * crownPalette.length) % crownPalette.length;
      const color = crownPalette[colorIndex]!.clone().lerp(crownPalette[(colorIndex + 1) % crownPalette.length]!, variation(n + 233) * .2);
      trees.push({ id, tile: `${Math.floor(point[0] / CANOPY_TILE_M)},${Math.floor(point[1] / CANOPY_TILE_M)}`,
        x: point[0], y: point[1], groundZ, radius, trunkRadius: baseRadius * .055, height: baseRadius * (2.4 + variation(n + 19) * .8),
        aspect: .84 + variation(n + 37) * .16, yaw: variation(n + 41) * Math.PI * 2, family, color });
      if (trees.length >= TREE_LIMIT) break;
    }
  }

  const crownMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  crownMaterial.name = 'opaque-canopy';
  materials.add(crownMaterial);
  const crownBatches: { mesh: THREE.InstancedMesh; trees: Tree[]; asset: TreeCrownAsset; center: PointM; lod: 'distant' | 'near' }[] = [];
  const tiles = new Map<string, Tree[]>();
  for (const tree of trees) {
    const tile = tiles.get(tree.tile) ?? [];
    tile.push(tree); tiles.set(tree.tile, tile);
  }
  // Spatial batches let the normal Three frustum cull off-screen canopy. The
  // same authored asset is shared across all tiles and all its instances.
  for (const [tile, tileTrees] of tiles) for (const [family, asset] of treeAtlas.variants.entries()) {
    const familyTrees = tileTrees.filter(tree => tree.family === family);
    if (!familyTrees.length) continue;
    const crowns = new THREE.InstancedMesh(asset.distant, crownMaterial, familyTrees.length);
    crowns.name = `source-canopy-crowns-${tile}-${asset.id}`;
    crowns.userData = { canopyBasis: 'reviewed_group_illustration', heightBasis: 'illustrative',
      family: asset.id, tile, treeIds: familyTrees.map(tree => tree.id), lod: 'distant' };
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    familyTrees.forEach((tree, index) => crowns.setColorAt(index, tree.color));
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    const [column, row] = tile.split(',').map(Number) as [number, number];
    group.add(crowns); instances.push(crowns);
    crownBatches.push({ mesh: crowns, trees: familyTrees, asset, lod: 'distant', center: [(column + .5) * CANOPY_TILE_M, (row + .5) * CANOPY_TILE_M] });
  }
  const trunkBatches: { mesh: THREE.InstancedMesh; trees: Tree[] }[] = [];
  let trunkTriangles = 0;
  if (trees.length) {
    const geometry = new THREE.CylinderGeometry(.7, 1, 1, 7, 1);
    geometry.rotateX(Math.PI / 2);
    geometries.add(geometry);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: palette.treeShadow, roughness: 1, metalness: 0 });
    trunkMaterial.name = 'opaque-canopy-trunk';
    materials.add(trunkMaterial);
    trunkTriangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3 * trees.length;
    for (const [tile, tileTrees] of tiles) {
      const trunks = new THREE.InstancedMesh(geometry, trunkMaterial, tileTrees.length);
      trunks.name = `source-canopy-trunks-${tile}`;
      trunks.userData = { tile, treeIds: tileTrees.map(tree => tree.id), heightBasis: 'illustrative' };
      trunks.castShadow = true;
      trunks.receiveShadow = true;
      trunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(trunks); instances.push(trunks); trunkBatches.push({ mesh: trunks, trees: tileTrees });
    }
  }

  const counts = { terrainTriangles: mesh.triangleFeatures.length, trees: trees.length,
    crownInstances: trees.length, crownTriangles: 0, totalTriangles: 0, canopyBatches: crownBatches.length, drawCalls: 1 + instances.length };
  const updateTriangleCounts = () => {
    counts.crownTriangles = crownBatches.reduce((total, batch) => total + batch.asset.triangleCounts[batch.lod] * batch.trees.length, 0);
    counts.totalTriangles = counts.terrainTriangles + counts.crownTriangles + trunkTriangles;
  };
  updateTriangleCounts();
  const transform = new THREE.Matrix4(), translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  let lastExaggeration = NaN, lastReference = NaN, disposed = false;
  function setDetail(next: 'distant' | 'near', focusM?: PointM): boolean {
    if (disposed) return false;
    const reach = NEAR_DETAIL_RADIUS_M + CANOPY_TILE_M * Math.SQRT1_2;
    let changed = false;
    for (const batch of crownBatches) {
      const near = next === 'near' && (!focusM || Math.hypot(batch.center[0] - focusM[0], batch.center[1] - focusM[1]) <= reach);
      const lod = near ? 'near' : 'distant';
      if (batch.lod === lod) continue;
      batch.mesh.geometry = batch.asset[lod];
      batch.lod = lod; batch.mesh.userData.lod = lod;
      batch.mesh.computeBoundingBox(); batch.mesh.computeBoundingSphere();
      changed = true;
    }
    if (changed) updateTriangleCounts();
    return changed;
  }
  function setExaggeration(exaggeration: number, referenceElevationM: number) {
    if (disposed) return;
    if (!Number.isFinite(exaggeration) || exaggeration <= 0 || exaggeration > 3 || !Number.isFinite(referenceElevationM)) {
      throw new Error('Invalid visual terrain exaggeration');
    }
    if (exaggeration === lastExaggeration && referenceElevationM === lastReference) return;
    const displayZ = (z: number) => referenceElevationM + (z - referenceElevationM) * exaggeration;
    for (let i = 0; i < positions.count; i++) positions.setZ(i, displayZ(source[i * 3 + 2]!));
    positions.needsUpdate = true;
    if (sourceNormals) {
      for (let i = 0; i < positions.count; i++) {
        const j = i * 3, nx = sourceNormals[j]!, ny = sourceNormals[j + 1]!, nz = sourceNormals[j + 2]! / exaggeration;
        const length = Math.hypot(nx, ny, nz);
        normals.setXYZ(i, nx / length, ny / length, nz / length);
      }
    } else {
      summedNormals.fill(0);
      for (let i = 0; i < positions.count; i += 3) {
        const ax = positions.getX(i + 1) - positions.getX(i), ay = positions.getY(i + 1) - positions.getY(i), az = positions.getZ(i + 1) - positions.getZ(i);
        const bx = positions.getX(i + 2) - positions.getX(i), by = positions.getY(i + 2) - positions.getY(i), bz = positions.getZ(i + 2) - positions.getZ(i);
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        for (let corner = 0; corner < 3; corner++) {
          const j = normalGroups[i + corner]! * 3;
          summedNormals[j]! += nx; summedNormals[j + 1]! += ny; summedNormals[j + 2]! += nz;
        }
      }
      for (let i = 0; i < positions.count; i++) {
        const j = normalGroups[i]! * 3, length = Math.hypot(summedNormals[j]!, summedNormals[j + 1]!, summedNormals[j + 2]!);
        normals.setXYZ(i, summedNormals[j]! / length, summedNormals[j + 1]! / length, summedNormals[j + 2]! / length);
      }
    }
    normals.needsUpdate = true;
    terrainGeometry.computeBoundingBox();
    terrainGeometry.computeBoundingSphere();
    for (const batch of crownBatches) {
      batch.trees.forEach((tree, index) => {
        translation.set(tree.x, tree.y, displayZ(tree.groundZ) + tree.height * .64);
        rotation.setFromAxisAngle(Z_AXIS, tree.yaw);
        scale.set(tree.radius, tree.radius * tree.aspect, tree.height * .72);
        batch.mesh.setMatrixAt(index, transform.compose(translation, rotation, scale));
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingBox(); batch.mesh.computeBoundingSphere();
    }
    for (const batch of trunkBatches) {
      batch.trees.forEach((tree, index) => {
        translation.set(tree.x, tree.y, displayZ(tree.groundZ) + tree.height * .18);
        rotation.setFromAxisAngle(Z_AXIS, tree.yaw);
        scale.set(tree.trunkRadius, tree.trunkRadius, tree.height * .36);
        batch.mesh.setMatrixAt(index, transform.compose(translation, rotation, scale));
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingBox(); batch.mesh.computeBoundingSphere();
    }
    lastExaggeration = exaggeration; lastReference = referenceElevationM;
  }
  setExaggeration(1, mesh.referenceElevationM);

  return {
    group, terrain, setExaggeration, setDetail, counts, artifact, artifactSource,
    setStyleOverrides(overrides) { if (!disposed) turfStyle.setOverrides(overrides); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const instance of instances) instance.dispose();
      treeAtlas.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const ownedMaterial of materials) ownedMaterial.dispose();
      group.removeFromParent(); group.clear();
    },
  };
}
