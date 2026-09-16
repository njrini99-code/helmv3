import * as THREE from 'three';
import { allocateCrowns, canopySymbols, crownScale } from '@/lib/golf/course-geometry/canopy';
import { boundaryDistance } from '@/lib/golf/course-geometry/display-outline';
import { inFeature } from '@/lib/golf/course-geometry/spatial';
import { terrainHeight, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { assertVisualArtifact, BUNKER_SLOPE_SCALE, compileVisualArtifact, linearAlbedo, type MeridianVisualArtifact } from '@/lib/golf/course-geometry/visual-artifact';
import { MERIDIAN_PALETTE, MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION, type MeridianPaletteKey, type MeridianStyleOverrides } from '@/lib/golf/course-geometry/visual-style';
import { buildThreeContext } from './three-context';
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
  counts: { terrainTriangles: number; trees: number; crownInstances: number; crownTriangles: number; totalTriangles: number; canopyBatches: number; drawCalls: number;
    massLobes: number; trunksVisible: number; families: Record<string, number>;
    /** Outside-world context objects drawn from the hash-locked layer. */
    contextRibbons: number; contextStructures: number; contextLines: number; contextZones: number };
}

const VEGETATION = MERIDIAN_STYLE.vegetation;
const TREE_LIMIT = VEGETATION.crownBudget;
const CANOPY_TILE_M = VEGETATION.tileM;
// Near crowns cost about five times a distant one, so only the tiles within
// this reach of the camera focus (the green a golfer is reading) take them;
// trunks follow the same band (§37) and vanish beyond twice of it.
const NEAR_DETAIL_RADIUS_M = VEGETATION.trunkBandM;
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

/** Indices into SURFACE_CLASS_IDS; the shader compares the class attribute. */
const SURFACE_CLASS_GREEN = 4, SURFACE_CLASS_BUNKER = 7, SURFACE_CLASS_WATER = 8;

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
  // §42–45 water terms (sky mix, interior mix, ripple, shoreline shade) and the §50 contact shade.
  const waterMix = new THREE.Vector4(style.water.skyMix, style.water.deepMix, style.water.rippleAmplitude, style.water.shorelineShade);
  const shadeAmount: { value: number } = { value: style.canopyShade.amount };
  const apply = (next: MeridianStyleOverrides) => {
    amplitudes.set(style.turf.macro.amplitude * (next.macro ?? 1), style.turf.micro.amplitude * (next.micro ?? 1),
      style.mowing.amplitude * (next.mowing ?? 1), style.boundary.shade * (next.boundary ?? 1));
    contextMix.value = style.context.desaturate * (next.context ?? 1);
    const water = next.water ?? 1;
    waterMix.set(style.water.skyMix * water, style.water.deepMix * water, style.water.rippleAmplitude * water, style.water.shorelineShade * water);
    shadeAmount.value = style.canopyShade.amount * (next.shade ?? 1);
  };
  apply(overrides);
  const [m0, m1, m2] = style.turf.macro.wavelengthsM, [u0, u1] = style.turf.micro.wavelengthsM, [g0, g1] = style.bunker.sandGrainM;
  const [r0, r1] = style.water.rippleM;
  const k = (wavelength: number) => (2 * Math.PI / wavelength).toFixed(6);
  // Fresnel and the ripple normal need view-space normals, which only the lit
  // materials carry; the unlit albedo view keeps the flat water gradient.
  const lit = material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial';
  material.onBeforeCompile = shader => {
    shader.uniforms.golfSeed = { value: new THREE.Vector2(seed[0], seed[1]) };
    shader.uniforms.golfAmplitudes = { value: amplitudes };
    shader.uniforms.golfContextDesaturate = contextMix;
    shader.uniforms.golfWaterMix = { value: waterMix };
    shader.uniforms.golfWaterDeep = { value: new THREE.Color(style.water.deepColor) };
    shader.uniforms.golfWaterSky = { value: new THREE.Color(style.water.skyColor) };
    shader.uniforms.golfShadeAmount = shadeAmount;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float golfMowingWeight;
attribute float golfTurfWeight;
attribute float golfContextWeight;
attribute float golfRoughness;
attribute float golfSurfaceClass;
attribute float golfBoundaryDistance;
attribute float golfSurroundDistance;
attribute vec2 golfRouteST;
attribute float golfCanopyShade;
varying vec2 vGolfWorldXY;
varying vec2 vGolfRouteST;
varying vec4 vGolfWeights;
varying vec4 vGolfSurface;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGolfWorldXY = (modelMatrix * vec4(position, 1.0)).xy;
vGolfRouteST = golfRouteST;
vGolfWeights = vec4(golfMowingWeight, golfTurfWeight, golfContextWeight, golfBoundaryDistance);
vGolfSurface = vec4(golfRoughness, golfSurfaceClass, golfCanopyShade, golfSurroundDistance);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform vec2 golfSeed;
uniform vec4 golfAmplitudes;
uniform float golfContextDesaturate;
uniform vec4 golfWaterMix;
uniform vec3 golfWaterDeep;
uniform vec3 golfWaterSky;
uniform float golfShadeAmount;
varying vec2 vGolfWorldXY;
varying vec2 vGolfRouteST;
varying vec4 vGolfWeights;
varying vec4 vGolfSurface;`).replace('#include <color_fragment>', `#include <color_fragment>
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
  // Outer rough (outside world §21) carries a larger macro field than the
  // rough beside the play line, by distance from the nearest playing surface.
  golfMacro *= mix(1.0, ${style.roughHierarchy.outerMacroScale.toFixed(3)}, smoothstep(${(style.roughHierarchy.outerM - style.roughHierarchy.outerBlendM).toFixed(3)}, ${(style.roughHierarchy.outerM + style.roughHierarchy.outerBlendM).toFixed(3)}, vGolfSurface.w));
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
  // Sand grain (§31): a fine world-space field on bunker vertices only,
  // filtered out at distance like the turf micro field.
  float golfSand = abs(vGolfSurface.y - ${SURFACE_CLASS_BUNKER}.0) < 0.5 ? 1.0 : 0.0;
  float golfGrainPhase = dot(golfP, vec2(0.83, 0.56) * ${k(g0)});
  float golfGrain = 0.5 * sin(golfGrainPhase) + 0.5 * sin(dot(golfP, vec2(-0.37, 0.93) * ${k(g1)}) + 1.1);
  golfGrain *= 1.0 - smoothstep(${style.turf.microFadeFwidth[0].toFixed(3)}, ${style.turf.microFadeFwidth[1].toFixed(3)}, fwidth(golfGrainPhase));
  diffuseColor.rgb *= 1.0
    + golfMacro * golfAmplitudes.x * golfTurfWeight
    + golfMicro * golfAmplitudes.y * golfTurfWeight
    + golfGrain * ${style.bunker.sandGrainAmplitude.toFixed(3)} * golfSand
    + golfBand * golfBandVisible * golfAmplitudes.z * golfMowingWeight
    - golfEdge * golfAmplitudes.w;
  // Context (§53): real surfaces, quieter. Albedo only; never alpha.
  float golfLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(golfLuma), golfContextWeight * golfContextDesaturate);
  // Water (§42–45): the interior darkens with distance from the drawn
  // shoreline (visual only, never depth), the shoreline band darkens the
  // edge, and lit materials lift toward the sky colour by Fresnel (§43).
  if (abs(vGolfSurface.y - ${SURFACE_CLASS_WATER}.0) < 0.5) {
    float golfInterior = smoothstep(0.0, ${style.water.interiorM.toFixed(3)}, golfBoundary);
    diffuseColor.rgb = mix(diffuseColor.rgb, golfWaterDeep, golfInterior * golfWaterMix.y);
    diffuseColor.rgb *= 1.0 - golfWaterMix.w * (1.0 - smoothstep(0.0, ${style.water.shorelineM.toFixed(3)}, golfBoundary));
${lit ? `    float golfFresnel = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), ${style.water.fresnelPower.toFixed(3)});
    diffuseColor.rgb = mix(diffuseColor.rgb, golfWaterSky, golfFresnel * golfWaterMix.x);` : ''}
  }
  // Canopy contact shade (§50): analytic, from the placed crowns and mass.
  diffuseColor.rgb *= 1.0 - vGolfSurface.z * golfShadeAmount;
}`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = vGolfSurface.x;`).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
// Static water ripple (§43): a small world-space normal field, filtered out at distance.
if (abs(vGolfSurface.y - ${SURFACE_CLASS_WATER}.0) < 0.5) {
  vec2 golfRp = vGolfWorldXY + golfSeed;
  float golfR0 = dot(golfRp, vec2(0.77, 0.64) * ${k(r0)}), golfR1 = dot(golfRp, vec2(-0.55, 0.83) * ${k(r1)});
  float golfRippleVisible = 1.0 - smoothstep(0.6, 1.4, fwidth(golfR0));
  vec3 golfRipple = vec3(cos(golfR0) * 0.77 - cos(golfR1) * 0.55, cos(golfR0) * 0.64 + cos(golfR1) * 0.83, 0.0) * golfWaterMix.z * golfRippleVisible;
  normal = normalize(normal + mat3(viewMatrix) * golfRipple);
}`);
  };
  material.customProgramCacheKey = () => `golf-landscape-turf-${MERIDIAN_STYLE_HASH}:${material.type}`;
  material.userData.mowing = { basis: 'illustrative_style', bandWidthM: style.mowing.bandWidthM, frame: 'route_local' };
  material.userData.turf = { basis: 'visual_only', macroM: style.turf.macro.wavelengthsM, microM: style.turf.micro.wavelengthsM };
  material.userData.water = { basis: 'visual_only', depthBasis: 'shoreline_distance', reflection: lit ? 'fresnel_static' : 'none' };
  material.userData.canopyShade = { basis: 'analytic_contact', amount: style.canopyShade.amount };
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
  const boundary = new Float32Array(vertexCount), routeST = new Float32Array(vertexCount * 2), surround = new Float32Array(vertexCount);
  // Render-only bunker bowl (§28): depth and its gradient per display vertex.
  const bowlDepth = new Float32Array(vertexCount), bowlSlope = new Float32Array(vertexCount * 2);
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
      surround[vertex] = attributes.surroundDistanceCm[from]! / 100;
      routeST[vertex * 2] = attributes.routeST[from * 2]!; routeST[vertex * 2 + 1] = attributes.routeST[from * 2 + 1]!;
      bowlDepth[vertex] = attributes.bunkerDepthMm[from]! / 1000;
      bowlSlope[vertex * 2] = attributes.bunkerSlope[from * 2]! / BUNKER_SLOPE_SCALE; bowlSlope[vertex * 2 + 1] = attributes.bunkerSlope[from * 2 + 1]! / BUNKER_SLOPE_SCALE;
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
  terrainGeometry.setAttribute('golfSurroundDistance', new THREE.BufferAttribute(surround, 1));
  terrainGeometry.setAttribute('golfRouteST', new THREE.BufferAttribute(routeST, 2));
  terrainGeometry.setAttribute('golfBunkerDepth', new THREE.BufferAttribute(bowlDepth, 1));
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

  interface Tree { id: string; tile: string; x: number; y: number; groundZ: number; radius: number; trunkRadius: number; height: number; yaw: number; aspect: number; asset: TreeCrownAsset; familyId: string; color: THREE.Color }
  interface MassLobe { id: string; tile: string; x: number; y: number; groundZ: number; radius: number; aspect: number; height: number; yaw: number; color: THREE.Color }
  const treeAtlas = createTreeAssetAtlas();
  const trees: Tree[] = [], lobes: MassLobe[] = [];
  const crownBudget = Math.max(0, Math.round(TREE_LIMIT * (options.overrides?.crowns ?? 1)));
  const massBudget = Math.max(0, Math.round(VEGETATION.mass.budget * (options.overrides?.mass ?? 1)));
  // Context belongs to scenery and collision exclusions only. It never expands
  // the hole's shot-reconstruction or inferred-surface domain.
  const canopyFeatures = new Map<string, LocalFeature>();
  for (const feature of scene.contextFeatures ?? []) canopyFeatures.set(feature.id, feature);
  for (const feature of scene.features) canopyFeatures.set(feature.id, feature);
  const canopyScene = { ...scene, features: [...canopyFeatures.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
  const excludedFeatures = canopyScene.features.filter(feature => feature.kind !== 'woods' && feature.kind !== 'route');
  const excludedRings = excludedFeatures.flatMap(feature => feature.parts.flat());
  const courseFrame = mesh.originWgs84.join(',');
  const canopyGroups = canopyScene.features.filter(feature => feature.kind === 'woods' && feature.reviewed);
  // §53: context woods keep their trees but lose saturation and a little
  // light so they never compete with the played hole. Colour only.
  const ownIds = new Set(scene.features.map(feature => feature.id));
  const contextTone = (color: THREE.Color, feature: LocalFeature) => {
    if (ownIds.has(feature.id)) return color;
    const luma = color.r * .2126 + color.g * .7152 + color.b * .0722;
    return color.lerp(new THREE.Color(luma, luma, luma), MERIDIAN_STYLE.context.treeDesaturate).multiplyScalar(1 - MERIDIAN_STYLE.context.treeDarken);
  };
  // Over budget, keep the crowns nearest the played hole's own surfaces: the
  // forest edge a golfer sees, not the interior of a mass behind it (§38).
  const ownRings = scene.features.filter(feature => feature.kind !== 'woods' && feature.kind !== 'route').flatMap(feature => feature.parts.flat());
  const nearness = (point: PointM) => ownRings.reduce((minimum, ring) => Math.min(minimum, boundaryDistance(point, ring)), Infinity);
  const families = VEGETATION.families, familyWeight = families.reduce((sum, family) => sum + family.weight, 0);
  const assetById = new Map(treeAtlas.variants.map(asset => [asset.id, asset]));
  const pickFamily = (edgeM: number, roll: number) => {
    // §36: edge families stand only near the woods boundary, interior
    // families only beyond it, so the silhouette mix changes with depth.
    const eligible = families.filter(family => family.placement === 'any' || (family.placement === 'edge') === edgeM < VEGETATION.edgeBandM);
    const total = eligible.reduce((sum, family) => sum + family.weight, 0) || familyWeight;
    let cursor = roll * total;
    for (const family of eligible) { cursor -= family.weight; if (cursor <= 0) return family; }
    return eligible.at(-1) ?? families[0]!;
  };
  const allocated = allocateCrowns(canopyGroups.map(feature => canopySymbols(feature, canopyScene)), crownBudget, nearness);
  for (const [groupIndex, feature] of canopyGroups.entries()) {
    const ownBoundary = feature.parts.flat();
    const clearanceRings = [...ownBoundary, ...excludedRings];
    for (const point of allocated[groupIndex]!) {
      if (trees.some(tree => Math.hypot(tree.x - point[0], tree.y - point[1]) < 5.4)) continue;
      const groundZ = terrainHeight(mesh, point);
      if (groundZ == null) continue;
      // §41: identity = course frame + package + feature + pattern centre + style version.
      const id = `canopy:${courseFrame}:${scene.packageHash.slice(0, 12)}:${feature.id}:${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}:${MERIDIAN_STYLE_VERSION}`;
      const n = featureSeed(id), baseRadius = 3.6 * crownScale(n);
      const edgeM = ownBoundary.reduce((minimum, ring) => Math.min(minimum, boundaryDistance(point, ring)), Infinity);
      const family = pickFamily(edgeM, variation(n + 71));
      const asset = assetById.get(family.designs[Math.floor(variation(n + 97) * family.designs.length) % family.designs.length]!) ?? treeAtlas.variants[0]!;
      const proportion = family.radius[0] + (family.radius[1] - family.radius[0]) * variation(n + 83);
      const heightRatio = family.heightRatio[0] + (family.heightRatio[1] - family.heightRatio[0]) * variation(n + 19);
      // Broaden the artwork at the same accepted pattern centers. The complete
      // crown stays inside its reviewed mask, including holes, and clear of
      // playing surfaces. Width never changes the illustrative height or trunk.
      const clearance = clearanceRings.reduce((minimum, ring) =>
        Math.min(minimum, boundaryDistance(point, ring)), Infinity);
      const designRadius = baseRadius * proportion * 1.25;
      const radius = Math.min(designRadius, Math.max(0, clearance - .15));
      // §40: family base → light by seed, lifted toward the lit colour at the edge.
      const edgeLift = Math.max(0, 1 - edgeM / VEGETATION.edgeLightM) * VEGETATION.edgeLightMix;
      const color = contextTone(new THREE.Color(family.base).lerp(new THREE.Color(family.light), Math.min(1, variation(n + 233) * .6 + edgeLift)), feature);
      trees.push({ id, tile: `${Math.floor(point[0] / CANOPY_TILE_M)},${Math.floor(point[1] / CANOPY_TILE_M)}`,
        x: point[0], y: point[1], groundZ, radius, trunkRadius: designRadius * family.trunkRatio, height: designRadius * heightRatio,
        aspect: .84 + variation(n + 37) * .16, yaw: variation(n + 41) * Math.PI * 2, asset, familyId: family.id, color });
      if (trees.length >= crownBudget) break;
    }
  }
  // §39 forest mass: beyond the edge band a reviewed woods polygon is carried
  // by low-poly canopy lobes on a coarse grid, budgeted nearest the hole first.
  const massCandidates = canopyGroups.map(feature => {
    const rings = feature.parts.flat(), vertices = feature.parts.flat(2);
    if (!vertices.length) return [] as PointM[];
    const spacing = VEGETATION.mass.spacingM;
    const minX = Math.floor(Math.min(...vertices.map(p => p[0])) / spacing) * spacing, maxX = Math.max(...vertices.map(p => p[0]));
    const minY = Math.floor(Math.min(...vertices.map(p => p[1])) / spacing) * spacing, maxY = Math.max(...vertices.map(p => p[1]));
    const points: PointM[] = [];
    for (let y = minY, row = 0; y <= maxY && points.length < 2000; y += spacing, row++) for (let x = minX + (row % 2 ? spacing / 2 : 0); x <= maxX; x += spacing) {
      const seed = featureSeed(`${feature.id}:${Math.round(x)}:${Math.round(y)}`);
      const point: PointM = [x + (variation(seed) - .5) * spacing * .5, y + (variation(seed + 5) - .5) * spacing * .5];
      if (!inFeature(point, feature)) continue;
      if (rings.some(ring => boundaryDistance(point, ring) < VEGETATION.mass.insetM)) continue;
      if (excludedFeatures.some(other => inFeature(point, other)) || excludedRings.some(ring => boundaryDistance(point, ring) < VEGETATION.mass.lobeRadiusM[1])) continue;
      points.push(point);
    }
    return points;
  });
  const massAllocated = allocateCrowns(massCandidates, massBudget, nearness);
  for (const [groupIndex, feature] of canopyGroups.entries()) {
    for (const point of massAllocated[groupIndex]!) {
      const groundZ = terrainHeight(mesh, point);
      if (groundZ == null) continue;
      const id = `mass:${courseFrame}:${scene.packageHash.slice(0, 12)}:${feature.id}:${Math.round(point[0])},${Math.round(point[1])}:${MERIDIAN_STYLE_VERSION}`;
      const n = featureSeed(id);
      const radius = VEGETATION.mass.lobeRadiusM[0] + (VEGETATION.mass.lobeRadiusM[1] - VEGETATION.mass.lobeRadiusM[0]) * variation(n + 3);
      const height = VEGETATION.mass.canopyHeightM[0] + (VEGETATION.mass.canopyHeightM[1] - VEGETATION.mass.canopyHeightM[0]) * variation(n + 7);
      lobes.push({ id, tile: `${Math.floor(point[0] / CANOPY_TILE_M)},${Math.floor(point[1] / CANOPY_TILE_M)}`, x: point[0], y: point[1], groundZ,
        radius, aspect: .8 + variation(n + 11) * .3, height, yaw: variation(n + 13) * Math.PI * 2,
        color: contextTone(new THREE.Color(VEGETATION.mass.color).lerp(new THREE.Color(VEGETATION.mass.light), variation(n + 17) * .7), feature) });
      if (lobes.length >= massBudget) break;
    }
  }

  // §50 analytic contact shading: every display vertex accumulates a soft
  // disc under each nearby crown and mass lobe; the ground shader darkens
  // albedo by it. Derived from the seeded placement above, never the DEM,
  // and never a screen-space pass at the base tier.
  const canopyShade = new Float32Array(vertexCount);
  {
    const cellM = 32, cells = new Map<string, { x: number; y: number; r: number; w: number }[]>();
    const put = (x: number, y: number, r: number, w: number) => {
      if (r <= 0) return;
      const key = `${Math.floor(x / cellM)},${Math.floor(y / cellM)}`;
      const list = cells.get(key) ?? []; list.push({ x, y, r, w }); cells.set(key, list);
    };
    for (const tree of trees) put(tree.x, tree.y, tree.radius * MERIDIAN_STYLE.canopyShade.crownRadiusScale, 1);
    for (const lobe of lobes) put(lobe.x, lobe.y, lobe.radius * MERIDIAN_STYLE.canopyShade.massRadiusScale, MERIDIAN_STYLE.canopyShade.massWeight);
    if (cells.size) for (let vertex = 0; vertex < vertexCount; vertex++) {
      const x = source[vertex * 3]!, y = source[vertex * 3 + 1]!, cx = Math.floor(x / cellM), cy = Math.floor(y / cellM);
      let total = 0;
      for (let dx = -1; dx <= 1 && total < 1; dx++) for (let dy = -1; dy <= 1 && total < 1; dy++) {
        for (const item of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const u = Math.sqrt((item.x - x) ** 2 + (item.y - y) ** 2) / item.r;
          if (u >= 1) continue;
          const t = Math.min(1, Math.max(0, (u - .3) / .7));
          total += (1 - t * t * (3 - 2 * t)) * item.w;
        }
      }
      canopyShade[vertex] = Math.min(1, total);
    }
  }
  terrainGeometry.setAttribute('golfCanopyShade', new THREE.BufferAttribute(canopyShade, 1));

  const crownMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  crownMaterial.name = 'opaque-canopy';
  materials.add(crownMaterial);
  const crownBatches: { mesh: THREE.InstancedMesh; trees: Tree[]; asset: TreeCrownAsset; center: PointM; lod: 'distant' | 'near' }[] = [];
  const tiles = new Map<string, Tree[]>();
  for (const tree of trees) {
    const tile = tiles.get(tree.tile) ?? [];
    tile.push(tree); tiles.set(tree.tile, tile);
  }
  const tileCenter = (tile: string): PointM => {
    const [column, row] = tile.split(',').map(Number) as [number, number];
    return [(column + .5) * CANOPY_TILE_M, (row + .5) * CANOPY_TILE_M];
  };
  // Spatial batches let the normal Three frustum cull off-screen canopy. The
  // same authored asset is shared across all tiles and all its instances.
  for (const [tile, tileTrees] of tiles) for (const asset of treeAtlas.variants) {
    const familyTrees = tileTrees.filter(tree => tree.asset === asset);
    if (!familyTrees.length) continue;
    const crowns = new THREE.InstancedMesh(asset.distant, crownMaterial, familyTrees.length);
    crowns.name = `source-canopy-crowns-${tile}-${asset.id}`;
    crowns.userData = { canopyBasis: 'reviewed_group_illustration', heightBasis: 'illustrative',
      family: asset.id, families: familyTrees.map(tree => tree.familyId), tile, treeIds: familyTrees.map(tree => tree.id), lod: 'distant' };
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    familyTrees.forEach((tree, index) => crowns.setColorAt(index, tree.color));
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    group.add(crowns); instances.push(crowns);
    crownBatches.push({ mesh: crowns, trees: familyTrees, asset, lod: 'distant', center: tileCenter(tile) });
  }
  const trunkBatches: { mesh: THREE.InstancedMesh; trees: Tree[]; center: PointM; lod: 'near' | 'distant' | 'hidden' }[] = [];
  const trunkGeometry = { near: new THREE.CylinderGeometry(.7, 1, 1, 7, 1), distant: new THREE.CylinderGeometry(.7, 1, 1, 3, 1) };
  const trunkTriangleCount = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  for (const geometry of Object.values(trunkGeometry)) { geometry.rotateX(Math.PI / 2); geometries.add(geometry); }
  if (trees.some(tree => tree.trunkRadius > 0)) {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: palette.treeShadow, roughness: 1, metalness: 0 });
    trunkMaterial.name = 'opaque-canopy-trunk';
    materials.add(trunkMaterial);
    for (const [tile, tileTrees] of tiles) {
      const trunkTrees = tileTrees.filter(tree => tree.trunkRadius > 0);
      if (!trunkTrees.length) continue;
      const trunks = new THREE.InstancedMesh(trunkGeometry.distant, trunkMaterial, trunkTrees.length);
      trunks.name = `source-canopy-trunks-${tile}`;
      trunks.userData = { tile, treeIds: trunkTrees.map(tree => tree.id), heightBasis: 'illustrative', lod: 'distant' };
      trunks.castShadow = true;
      trunks.receiveShadow = true;
      trunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(trunks); instances.push(trunks); trunkBatches.push({ mesh: trunks, trees: trunkTrees, center: tileCenter(tile), lod: 'distant' });
    }
  }
  const massBatches: { mesh: THREE.InstancedMesh; lobes: MassLobe[] }[] = [];
  const massGeometry = new THREE.IcosahedronGeometry(1, 1);
  geometries.add(massGeometry);
  if (lobes.length) {
    const massMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
    massMaterial.name = 'opaque-forest-mass';
    materials.add(massMaterial);
    const massTiles = new Map<string, MassLobe[]>();
    for (const lobe of lobes) { const tile = massTiles.get(lobe.tile) ?? []; tile.push(lobe); massTiles.set(lobe.tile, tile); }
    for (const [tile, tileLobes] of massTiles) {
      const mass = new THREE.InstancedMesh(massGeometry, massMaterial, tileLobes.length);
      mass.name = `source-forest-mass-${tile}`;
      mass.userData = { canopyBasis: 'reviewed_group_illustration', heightBasis: 'illustrative', layer: 'forest_mass', tile, lobeIds: tileLobes.map(lobe => lobe.id) };
      mass.castShadow = true;
      mass.receiveShadow = true;
      mass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      tileLobes.forEach((lobe, index) => mass.setColorAt(index, lobe.color));
      if (mass.instanceColor) mass.instanceColor.needsUpdate = true;
      group.add(mass); instances.push(mass); massBatches.push({ mesh: mass, lobes: tileLobes });
    }
  }

  const familyCounts: Record<string, number> = {};
  for (const tree of trees) familyCounts[tree.familyId] = (familyCounts[tree.familyId] ?? 0) + 1;
  // Outside-world context objects (paths, structures, lines) ride in the same
  // group so exaggeration and disposal flow through one landscape.
  const context = buildThreeContext(scene, mesh);
  group.add(context.group);
  const counts: ThreeLandscape['counts'] = { terrainTriangles: mesh.triangleFeatures.length, trees: trees.length,
    crownInstances: trees.length, crownTriangles: 0, totalTriangles: 0, canopyBatches: crownBatches.length, drawCalls: 0,
    massLobes: lobes.length, trunksVisible: 0, families: familyCounts,
    contextRibbons: context.counts.ribbons, contextStructures: context.counts.structures, contextLines: context.counts.lines, contextZones: context.counts.zones };
  const massTriangles = trunkTriangleCount(massGeometry) * lobes.length;
  const updateTriangleCounts = () => {
    counts.crownTriangles = crownBatches.reduce((total, batch) => total + batch.asset.triangleCounts[batch.lod] * batch.trees.length, 0);
    const trunkTriangles = trunkBatches.reduce((total, batch) => total + (batch.lod === 'hidden' ? 0 : trunkTriangleCount(trunkGeometry[batch.lod]) * batch.trees.length), 0);
    counts.trunksVisible = trunkBatches.reduce((total, batch) => total + (batch.lod === 'hidden' ? 0 : batch.trees.length), 0);
    counts.totalTriangles = counts.terrainTriangles + counts.crownTriangles + trunkTriangles + massTriangles;
    counts.drawCalls = 1 + crownBatches.length + trunkBatches.filter(batch => batch.lod !== 'hidden').length + massBatches.length;
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
    // §37: trunks are detailed inside the near band, cheap inside twice of
    // it, and absent beyond, where the gap under a crown is sub-pixel anyway.
    for (const batch of trunkBatches) {
      const distance = focusM ? Math.hypot(batch.center[0] - focusM[0], batch.center[1] - focusM[1]) : 0;
      const lod = next === 'near' && distance <= reach ? 'near' : distance <= reach * 2 ? 'distant' : 'hidden';
      if (batch.lod === lod) continue;
      if (lod !== 'hidden') batch.mesh.geometry = trunkGeometry[lod];
      batch.mesh.visible = lod !== 'hidden';
      batch.lod = lod; batch.mesh.userData.lod = lod;
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
    // The bowl is a display offset below the canonical surface; it scales
    // with relief like every other display height and never touches `source`.
    for (let i = 0; i < positions.count; i++) positions.setZ(i, displayZ(source[i * 3 + 2]!) - bowlDepth[i]! * exaggeration);
    positions.needsUpdate = true;
    if (sourceNormals) {
      for (let i = 0; i < positions.count; i++) {
        const j = i * 3, nx = sourceNormals[j]!, ny = sourceNormals[j + 1]!, nz0 = Math.max(1e-3, sourceNormals[j + 2]!);
        // DEM slope, then the bowl gradient (z = z_dem − depth), then relief.
        const zx = -nx / nz0 - bowlSlope[i * 2]!, zy = -ny / nz0 - bowlSlope[i * 2 + 1]!;
        const x = -zx, y = -zy, nz = 1 / exaggeration, length = Math.hypot(x, y, nz);
        normals.setXYZ(i, x / length, y / length, nz / length);
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
    for (const batch of massBatches) {
      batch.lobes.forEach((lobe, index) => {
        // Sunk a little below ground so no underside ever shows from Side.
        translation.set(lobe.x, lobe.y, displayZ(lobe.groundZ) + lobe.height * .42);
        rotation.setFromAxisAngle(Z_AXIS, lobe.yaw);
        scale.set(lobe.radius, lobe.radius * lobe.aspect, lobe.height * .58);
        batch.mesh.setMatrixAt(index, transform.compose(translation, rotation, scale));
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingBox(); batch.mesh.computeBoundingSphere();
    }
    context.setExaggeration(exaggeration, referenceElevationM);
    lastExaggeration = exaggeration; lastReference = referenceElevationM;
  }
  setExaggeration(1, mesh.referenceElevationM);

  return {
    group, terrain, setExaggeration, setDetail, counts, artifact, artifactSource,
    setStyleOverrides(overrides) { if (!disposed) turfStyle.setOverrides(overrides); },
    dispose() {
      if (disposed) return;
      disposed = true;
      context.dispose();
      for (const instance of instances) instance.dispose();
      treeAtlas.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const ownedMaterial of materials) ownedMaterial.dispose();
      group.removeFromParent(); group.clear();
    },
  };
}
