import * as THREE from 'three';
import { allocateCrowns, canopySymbols, crownScale } from '@/lib/golf/course-geometry/canopy';
import { boundaryDistance } from '@/lib/golf/course-geometry/display-outline';
import { inFeature, pointBox, pointBoxDistance, type PointBox } from '@/lib/golf/course-geometry/spatial';
import { sourceVertexNormals, terrainHeight, type TerrainMesh } from '@/lib/golf/course-geometry/terrain';
import { typedGridHeights, type MetricTerrainGrid, type TypedGridHeights } from '@/lib/golf/course-geometry/terrain-source';
import type { HoleScene, LocalFeature, PointM } from '@/lib/golf/course-geometry/types';
import { assertVisualArtifact, BUNKER_SLOPE_SCALE, compileVisualArtifact, linearAlbedo, MERIDIAN_CODES, SURFACE_CLASS_IDS, type MeridianVisualArtifact } from '@/lib/golf/course-geometry/visual-artifact';
import { MERIDIAN_PALETTE, MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, MERIDIAN_STYLE_VERSION, type MeridianPaletteKey, type MeridianStyle, type MeridianStyleOverrides } from '@/lib/golf/course-geometry/visual-style';
import { buildThreeContext } from './three-context';
import { createForestMassGeometry, createTreeAssetAtlas, type TreeCrownAsset } from './tree-assets';

export type ThreeLandscapePalette = Readonly<Record<MeridianPaletteKey, THREE.ColorRepresentation>>;

/** sRGB surface albedos, separate from Fairway's application UI tokens.
 * No directional illumination is baked into these colors. The values live in
 * the Meridian visual kit (§112); the terrain's per-vertex albedo is compiled
 * from them into the visual artifact, so this palette drives crowns and trunks
 * here and the artifact compiler everywhere else. */
export const DEFAULT_THREE_LANDSCAPE_PALETTE: ThreeLandscapePalette = MERIDIAN_PALETTE;

/** A perspective lens in display space: the eye and the focal length in CSS
 * px. `frame`, when given, is the lens basis and the CSS-pixel picture about
 * its optical axis, so `projectedCrownPx` can tell that a crown lies outside
 * the picture (behind the eye, or off screen): such a crown never competes
 * for the near budget, which then goes to the largest crowns actually in
 * view (§37/§68) rather than to the trees at the camera's back. */
export interface PerspectiveLodView {
  readonly eye: readonly [number, number, number];
  readonly focalPx: number;
  readonly frame?: {
    readonly right: readonly [number, number, number]; readonly up: readonly [number, number, number]; readonly forward: readonly [number, number, number];
    /** Screen position (CSS px, y down) of the optical axis — `TerrainCamera.translation` — and the frame size. */
    readonly principalPx: readonly [number, number]; readonly widthPx: number; readonly heightPx: number;
  };
}
/** Projected radius in CSS px of a crown of `radiusM` centred at display
 * (x, y, z); 0 when `view.frame` places the crown's whole disc outside the
 * picture. Shared by V1's canopy and the V2 forest (`three-world-v2-objects.ts`). */
export function projectedCrownPx(view: PerspectiveLodView, x: number, y: number, z: number, radiusM: number): number {
  const dx = x - view.eye[0], dy = y - view.eye[1], dz = z - view.eye[2];
  const px = view.focalPx * radiusM / Math.max(1, Math.hypot(dx, dy, dz));
  const frame = view.frame;
  if (!frame) return px;
  const depth = dx * frame.forward[0] + dy * frame.forward[1] + dz * frame.forward[2];
  if (depth <= 0) return 0;
  const sx = frame.principalPx[0] + view.focalPx * (dx * frame.right[0] + dy * frame.right[1] + dz * frame.right[2]) / depth;
  const sy = frame.principalPx[1] - view.focalPx * (dx * frame.up[0] + dy * frame.up[1] + dz * frame.up[2]) / depth;
  return sx + px < 0 || sx - px > frame.widthPx || sy + px < 0 || sy - px > frame.heightPx ? 0 : px;
}

export interface ThreeLandscape {
  group: THREE.Group;
  /** The read-only inspection ray targets the terrain, never decorative crowns. */
  terrain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  setExaggeration(exaggeration: number, referenceElevationM: number): void;
  /** Swap shared crown assets without changing any instance transform. */
  /** Choose every crown's LOD. In a perspective `view` the projected crown
   * radius decides (`VEGETATION.lodScreenPx`); otherwise distance bands
   * around `focusM` do. Near crowns are granted only when `detail` is near. */
  setDetail(detail: 'distant' | 'near', focusM?: PointM, view?: PerspectiveLodView): boolean;
  /** Runtime amplitude overrides for the lab; never part of the artifact. */
  setStyleOverrides(overrides: MeridianStyleOverrides): void;
  dispose(): void;
  /** The visual world this landscape was built from (§6). */
  artifact: MeridianVisualArtifact;
  /** `runtime` = no cache supplied (MERIDIAN_ARTIFACT_MISSING); `recompiled`
   * = the supplied cache failed the §6 hash gate and was replaced (§105). */
  artifactSource: 'supplied' | 'runtime' | 'recompiled';
  /** The MERIDIAN_ARTIFACT_MISMATCH message when `artifactSource` is `recompiled`. */
  artifactRefusal: string | null;
  counts: { terrainTriangles: number; trees: number; crownInstances: number; crownTriangles: number; totalTriangles: number; canopyBatches: number; drawCalls: number;
    massLobes: number; trunksVisible: number; families: Record<string, number>;
    /** Pattern centres before the dead-space mask, and how many it cleared (§3.4). */
    patternCentres: number; rhythmCleared: number;
    /** Outside-world vegetation: lobes from context `forest_mass` zones and understory shrubs inside reviewed woods. */
    contextMassLobes: number; understory: number;
    /** Outside-world context objects drawn from the hash-locked layer. */
    contextRibbons: number; contextStructures: number; contextLines: number; contextZones: number;
    /** §68.3: one total hides the bottleneck; these split it by category. */
    crownNearTriangles: number; crownDistantTriangles: number; crownFarTriangles: number; trunkTriangles: number; massTriangles: number;
    /** Trees per crown LOD, plus trunks hidden beyond twice the near band. */
    lodTrees: { near: number; distant: number; far: number; hidden: number };
    /** Forest-mass clusters at the 400-triangle (near) and 220-triangle (far) build. */
    massLod: { near: number; far: number };
    /** How the last LOD pass chose: projected crown size (perspective) or focus-distance bands (orthographic). */
    crownLodBasis: 'screen_px' | 'focus_bands' };
}

const VEGETATION = MERIDIAN_STYLE.vegetation;
const TREE_LIMIT = VEGETATION.crownBudget;
const CANOPY_TILE_M = VEGETATION.tileM;
// Near crowns cost about five times a distant one, so only the tiles within
// this reach of the camera focus (the green a golfer is reading) take them;
// trunks follow the same band (§37) and vanish beyond twice of it.
const NEAR_DETAIL_RADIUS_M = VEGETATION.trunkBandM;
const CROWN_LODS = ['near', 'distant', 'far'] as const;
type CrownLod = typeof CROWN_LODS[number];
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

/** Rings with their boxes, for the candidate sieves below: a box is never
 * farther than the edges it holds, so a ring whose box is already past the
 * distance in question is skipped without reading an edge. `pointBoxDistance`
 * documents the one ulp its square root can round above `Math.hypot`; every
 * test here leaves that much slack, so the answers are exactly the plain
 * minimum and the plain `some`. */
interface BoxedRing { ring: readonly PointM[]; box: PointBox }
const BOX_SLACK_M = 1e-9;
function boxRings(rings: readonly (readonly PointM[])[]): BoxedRing[] { return rings.map(ring => ({ ring, box: pointBox(ring) })); }
/** The least `boundaryDistance` over the rings (`Infinity` for none). */
function nearestRingM(point: PointM, rings: readonly BoxedRing[]): number {
  let best = Infinity;
  for (const { ring, box } of rings) if (pointBoxDistance(point, box) <= best + BOX_SLACK_M) best = Math.min(best, boundaryDistance(point, ring));
  return best;
}
/** Whether any ring's boundary lies strictly within `reachM` of the point. */
function ringWithin(point: PointM, rings: readonly BoxedRing[], reachM: number): boolean {
  for (const { ring, box } of rings) if (pointBoxDistance(point, box) < reachM + BOX_SLACK_M && boundaryDistance(point, ring) < reachM) return true;
  return false;
}

/** Indices into SURFACE_CLASS_IDS; the shader compares the class attribute. */
const SURFACE_CLASS_GREEN = 4, SURFACE_CLASS_BUNKER = 7, SURFACE_CLASS_WATER = 8, SURFACE_CLASS_TURF = 1;
/** GPU class id: the three ids the shader tests, everything else the turf id. */
export function shaderSurfaceClass(id: number): number {
  return id === SURFACE_CLASS_GREEN || id === SURFACE_CLASS_BUNKER || id === SURFACE_CLASS_WATER ? id : SURFACE_CLASS_TURF;
}

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
/** Fidelity §8–9: the route-local mowing emphasis window for one hole. */
export interface LandingWindow { centreM: number; halfWidthM: number; boost: number }
export function landingWindow(scene: HoleScene, style: MeridianStyle = MERIDIAN_STYLE): LandingWindow | null {
  if (scene.hole.par < 4) return null;
  const route = scene.features.find(f => f.id === scene.hole.routeFeatureId)?.parts[0]?.[0];
  if (!route || route.length < 2) return null;
  let length = 0;
  for (let i = 1; i < route.length; i++) length += Math.hypot(route[i]![0] - route[i - 1]![0], route[i]![1] - route[i - 1]![1]);
  const { driveM, greenClearM, halfWidthM, boost } = style.mowing.landing;
  const centreM = Math.min(driveM, length - greenClearM);
  return centreM < 60 ? null : { centreM: Math.round(centreM * 10) / 10, halfWidthM, boost };
}

/** Per-fragment shading source (master §14–15 faceting, redesign §12): the
 * DEM's slope (dz/dx, dz/dy at every grid node; central differences over one
 * spacing, one-sided at nulls and edges) uploaded once as a half-float RGBA
 * texture in the terrain's local metres (RG slope, B the relative sky
 * occlusion below, A unused). Lighting then follows the source grid instead
 * of the display triangle size, so a steep road bank stays a bank instead of
 * fanning across a 4 m context triangle from one vertex normal. Display
 * only: it never moves a vertex or feeds picking. */
export interface DemSlopeRelief { texture: THREE.DataTexture; frame: THREE.Vector4; texel: THREE.Vector2; exaggeration: { value: number }; spacingM: number }
export function buildDemSlopeTexture(grid: MetricTerrainGrid, landform: { radiusM: number; directions: number } = MERIDIAN_STYLE.landform): DemSlopeRelief {
  const { columns, rows, spacingM } = grid;
  const data = new Uint16Array(columns * rows * 4);
  // Typed copies of the heights: the source array holds nulls, so its
  // numbers are boxed and every read of the march below would chase a
  // pointer. The doubles are the same; `support` carries the nulls.
  const typed = typedGridHeights(grid), { heights, support } = typed;
  const half = (value: number) => THREE.DataUtils.toHalfFloat(Math.max(-16, Math.min(16, value)));
  const slopeX = new Float32Array(columns * rows), slopeY = new Float32Array(columns * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const n = r * columns + c, here = support[n] === 1, z = heights[n]!;
    const left = c > 0 && support[n - 1] === 1, right = c + 1 < columns && support[n + 1] === 1;
    const below = r > 0 && support[n - columns] === 1, above = r + 1 < rows && support[n + columns] === 1;
    slopeX[n] = left && right ? (heights[n + 1]! - heights[n - 1]!) / (2 * spacingM) : here && right ? (heights[n + 1]! - z) / spacingM : here && left ? (z - heights[n - 1]!) / spacingM : 0;
    slopeY[n] = below && above ? (heights[n + columns]! - heights[n - columns]!) / (2 * spacingM) : here && above ? (heights[n + columns]! - z) / spacingM : here && below ? (z - heights[n - columns]!) / spacingM : 0;
  }
  const { occlusion, exposure } = relativeSkyRelief(grid, slopeX, slopeY, landform, typed);
  for (let n = 0; n < columns * rows; n++) {
    data[n * 4] = half(slopeX[n]!); data[n * 4 + 1] = half(slopeY[n]!);
    data[n * 4 + 2] = half(occlusion[n]!); data[n * 4 + 3] = half(exposure[n]!);
  }
  const texture = new THREE.DataTexture(data, columns, rows, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'dem-slope';
  texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
  texture.userData = { basis: 'source_gradient', spacingM, columns, rows, occlusion: { basis: 'dem_relative_sky_view', radiusM: landform.radiusM, directions: landform.directions }, exposure: { basis: 'dem_relative_sky_view', radiusM: landform.radiusM, directions: landform.directions, channel: 'a' } };
  return { texture, frame: new THREE.Vector4(grid.originM[0], grid.originM[1], 1 / (columns * spacingM), 1 / (rows * spacingM)),
    texel: new THREE.Vector2(.5 / columns, .5 / rows), exaggeration: { value: 1 }, spacingM };
}

/** Relative sky occlusion per grid node (fidelity §5–7, `MERIDIAN_STYLE.landform`):
 * the mean over `directions` of sin(horizon elevation above the node's own
 * tangent plane) within `radiusM`. A uniform slope scores 0 because its
 * horizon *is* its plane; a swale or hollow scores by how far the ground
 * around it rises above that plane. Samples step geometrically (1, 2, 3, 4,
 * 6, 8, 12 … nodes) so a 2 m grid costs about a hundred reads a node.
 * Unsupported nodes and the grid edge simply end a ray. */
export function relativeSkyOcclusion(grid: MetricTerrainGrid, slopeX: Float32Array, slopeY: Float32Array, landform: { radiusM: number; directions: number }): Float32Array {
  return relativeSkyRelief(grid, slopeX, slopeY, landform).occlusion;
}

/** Relative sky occlusion and exposure per grid node from one horizon march.
 * Each direction's horizon is the signed maximum elevation of the ground
 * above the node's tangent plane: where it is positive the sky is occluded
 * (swale, hollow, valley floor); where it stays negative the ground falls
 * away in that direction (knoll, convex shoulder) and the node is exposed.
 * Both are the mean sine over `directions`; a uniform slope scores 0 on both. */
export function relativeSkyRelief(grid: MetricTerrainGrid, slopeX: Float32Array, slopeY: Float32Array, landform: { radiusM: number; directions: number }, typed: TypedGridHeights = typedGridHeights(grid)): { occlusion: Float32Array; exposure: Float32Array } {
  const { columns, rows, spacingM } = grid, { heights, support } = typed;
  const occlusion = new Float32Array(columns * rows), exposure = new Float32Array(columns * rows);
  const radiusNodes = Math.max(1, Math.round(landform.radiusM / spacingM));
  const steps: number[] = [];
  for (let d = 1; d < radiusNodes; d = d < 4 ? d + 1 : Math.round(d * 1.5)) steps.push(d);
  steps.push(radiusNodes);
  // A ray's node offsets and sample distances do not depend on the node, so
  // they are tabled once per direction instead of rounded and measured again
  // at every node: the offsets are integers, so a sample's `cc - c` is
  // exactly the tabled offset and its distance the same double. A zero
  // offset (the node itself) never contributes and is left out of the table.
  const rays = Array.from({ length: landform.directions }, (_, k) => {
    const a = 2 * Math.PI * k / landform.directions, ux = Math.cos(a), uy = Math.sin(a);
    const dc: number[] = [], dr: number[] = [], distance: number[] = [];
    for (const d of steps) {
      const oc = Math.round(ux * d), or = Math.round(uy * d), m = Math.hypot(oc, or) * spacingM;
      if (m <= 0) continue;
      dc.push(oc); dr.push(or); distance.push(m);
    }
    return { ux, uy, dc: Int32Array.from(dc), dr: Int32Array.from(dr), distance: Float64Array.from(distance) };
  });
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const n = r * columns + c;
    if (support[n] !== 1) continue;
    const z0 = heights[n]!;
    let occluded = 0, exposed = 0;
    for (const { ux, uy, dc, dr, distance } of rays) {
      const plane = slopeX[n]! * ux + slopeY[n]! * uy;
      let maxTan = Number.NEGATIVE_INFINITY;
      for (let k = 0; k < dc.length; k++) {
        const cc = c + dc[k]!, rr = r + dr[k]!;
        if (cc < 0 || rr < 0 || cc >= columns || rr >= rows) break;
        const m = rr * columns + cc;
        if (support[m] !== 1) continue;
        maxTan = Math.max(maxTan, (heights[m]! - z0) / distance[k]! - plane);
      }
      // A ray with no supported sample (grid edge, unsupported neighbours) scores nothing.
      if (!Number.isFinite(maxTan)) continue;
      const up = Math.max(0, maxTan), down = Math.max(0, -maxTan);
      occluded += up / Math.sqrt(1 + up * up);
      exposed += down / Math.sqrt(1 + down * down);
    }
    occlusion[n] = occluded / landform.directions;
    exposure[n] = exposed / landform.directions;
  }
  return { occlusion, exposure };
}

export function attachTurfStyle(material: TurfStyleTarget, seed: readonly [number, number], overrides: MeridianStyleOverrides = {}, landing: LandingWindow | null = null, relief: DemSlopeRelief | null = null): TurfStyleHandle {
  const style = MERIDIAN_STYLE;
  const landingUniform = new THREE.Vector3(landing?.centreM ?? 0, landing?.halfWidthM ?? 0, landing?.boost ?? 0);
  const classId = (name: string) => SURFACE_CLASS_IDS.indexOf(name as never);
  const roughClasses = ['rough', 'rough_secondary', 'rough_outer', 'native', 'open_field', 'buffer_grass'].map(classId).filter(id => id >= 0);
  const isClass = (ids: readonly number[]) => ids.map(id => `abs(golfClass - ${id}.0) < 0.5`).join(' || ');
  // Fidelity §35 terrain response applies to the rough hierarchy and the plain ground class.
  const toneClasses = [...roughClasses, classId('ground')].filter(id => id >= 0);
  const vec3 = (rgb: readonly [number, number, number]) => rgb.map(v => v.toFixed(3)).join(', ');
  const amplitudes = new THREE.Vector4(style.turf.macro.amplitude, style.turf.micro.amplitude, style.mowing.amplitude, style.boundary.shade);
  const contextMix: { value: number } = { value: style.context.desaturate };
  // §42–45 water terms (sky mix, interior mix, ripple, shoreline shade) and the §50 contact shade.
  const waterMix = new THREE.Vector4(style.water.skyMix, style.water.deepMix, style.water.rippleAmplitude, style.water.shorelineShade);
  const shadeAmount: { value: number } = { value: style.canopyShade.amount };
  // Fidelity §5–7 landform occlusion: gain (scaled by the lab override) and cap.
  const landformAmount = new THREE.Vector2(style.landform.gain, style.landform.max);
  // Fidelity §35 terrain response: shelter/exposure tint gain (lab-scaled) and cap.
  const terrainToneAmount = new THREE.Vector3(style.terrainTone.gain[0], style.terrainTone.gain[1], style.terrainTone.max);
  const apply = (next: MeridianStyleOverrides) => {
    amplitudes.set(style.turf.macro.amplitude * (next.macro ?? 1), style.turf.micro.amplitude * (next.micro ?? 1),
      style.mowing.amplitude * (next.mowing ?? 1), style.boundary.shade * (next.boundary ?? 1));
    contextMix.value = style.context.desaturate * (next.context ?? 1);
    const water = next.water ?? 1;
    waterMix.set(style.water.skyMix * water, style.water.deepMix * water, style.water.rippleAmplitude * water, style.water.shorelineShade * water);
    shadeAmount.value = style.canopyShade.amount * (next.shade ?? 1);
    landformAmount.set(style.landform.gain * (next.landform ?? 1), style.landform.max);
    terrainToneAmount.set(style.terrainTone.gain[0] * (next.terrainTone ?? 1), style.terrainTone.gain[1] * (next.terrainTone ?? 1), style.terrainTone.max);
  };
  apply(overrides);
  const [m0, m1, m2] = style.turf.macro.wavelengthsM, [u0, u1] = style.turf.micro.wavelengthsM, [g0, g1] = style.bunker.sandGrainM;
  const [r0, r1] = style.water.rippleM;
  const k = (wavelength: number) => (2 * Math.PI / wavelength).toFixed(6);
  // Fresnel and the ripple normal need view-space normals, which only the lit
  // materials carry; the unlit albedo view keeps the flat water gradient.
  const lit = material.type === 'MeshStandardMaterial' || material.type === 'MeshPhysicalMaterial';
  // Per-fragment DEM shading needs the lit normal path; the unlit views keep
  // their vertex normals, as does a mesh without a metric grid.
  const demShading = lit && relief != null;
  material.onBeforeCompile = shader => {
    shader.uniforms.golfSeed = { value: new THREE.Vector2(seed[0], seed[1]) };
    if (demShading) {
      shader.uniforms.golfDemSlope = { value: relief.texture };
      shader.uniforms.golfDemFrame = { value: relief.frame };
      shader.uniforms.golfDemTexel = { value: relief.texel };
      shader.uniforms.golfRelief = relief.exaggeration;
      shader.uniforms.golfLandform = { value: landformAmount };
      shader.uniforms.golfTerrainTone = { value: terrainToneAmount };
    }
    shader.uniforms.golfAmplitudes = { value: amplitudes };
    shader.uniforms.golfContextDesaturate = contextMix;
    shader.uniforms.golfWaterMix = { value: waterMix };
    shader.uniforms.golfWaterDeep = { value: new THREE.Color(style.water.deepColor) };
    shader.uniforms.golfWaterSky = { value: new THREE.Color(style.water.skyColor) };
    shader.uniforms.golfShadeAmount = shadeAmount;
    shader.uniforms.golfLanding = { value: landingUniform };
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
varying vec4 vGolfSurface;${demShading ? `
attribute vec2 golfDisplaySlope;
varying vec2 vGolfDisplaySlope;
varying vec2 vGolfLocalXY;` : ''}`).replace('#include <begin_vertex>', `#include <begin_vertex>
vGolfWorldXY = (modelMatrix * vec4(position, 1.0)).xy;${demShading ? `
vGolfLocalXY = position.xy;
vGolfDisplaySlope = golfDisplaySlope;` : ''}
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
uniform vec3 golfLanding;
varying vec2 vGolfWorldXY;
varying vec2 vGolfRouteST;
varying vec4 vGolfWeights;
varying vec4 vGolfSurface;${demShading ? `
uniform sampler2D golfDemSlope;
uniform vec4 golfDemFrame;
uniform vec2 golfDemTexel;
uniform float golfRelief;
uniform vec2 golfLandform;
uniform vec3 golfTerrainTone;
varying vec2 vGolfDisplaySlope;
varying vec2 vGolfLocalXY;
float golfLandformAo = 1.0;` : ''}`).replace('#include <color_fragment>', `#include <color_fragment>
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
  // Blade-height / density cue (renderer redesign §7): rough carries a
  // stronger micro response than mown turf; apron and fringe are quieter.
  float golfClass = vGolfSurface.y;
  golfMicro *= (${isClass(roughClasses)}) ? ${style.turf.microByClass.rough.toFixed(3)}
    : abs(golfClass - ${classId('surround')}.0) < 0.5 ? ${style.turf.microByClass.surround.toFixed(3)}
    : abs(golfClass - ${classId('apron')}.0) < 0.5 ? ${style.turf.microByClass.apron.toFixed(3)}
    : abs(golfClass - ${classId('fringe')}.0) < 0.5 ? ${style.turf.microByClass.fringe.toFixed(3)} : 1.0;
${demShading ? `
  // Terrain response (fidelity §35): the DEM relative sky view tints the
  // rough hierarchy by shelter (hollows: richer, cooler) and exposure
  // (knolls, convex shoulders: warmer, drier). Albedo only, capped, never on
  // playing surfaces, water or context; it says nothing about what grows.
  {
    vec4 golfToneDem = texture2D(golfDemSlope, (vGolfLocalXY - golfDemFrame.xy) * golfDemFrame.zw + golfDemTexel);
    float golfToneWeight = (${isClass(toneClasses)}) ? golfTurfWeight : 0.0;
    float golfShelter = min(golfTerrainTone.z, max(0.0, golfToneDem.z - ${style.terrainTone.floor[0].toFixed(4)}) * golfTerrainTone.x) * golfToneWeight;
    float golfExposure = min(golfTerrainTone.z, max(0.0, golfToneDem.w - ${style.terrainTone.floor[1].toFixed(4)}) * golfTerrainTone.y) * golfToneWeight;
    diffuseColor.rgb *= mix(vec3(1.0), vec3(${vec3(style.terrainTone.sheltered)}), golfShelter) * mix(vec3(1.0), vec3(${vec3(style.terrainTone.exposed)}), golfExposure);
  }` : ''}
  // Mowing (§22): bands along the play line in route-local metres with a
  // small skew; derivative-filtered edges; weight already fades at the edge.
  // The green (§23) takes narrower bands on one diagonal of the same frame at
  // a fraction of the contrast: discovered, not shouted; art, not grain.
  float golfPhase = golfGreen
    ? (vGolfRouteST.y * ${Math.cos(style.mowing.green.angleDeg * Math.PI / 180).toFixed(4)} + vGolfRouteST.x * ${Math.sin(style.mowing.green.angleDeg * Math.PI / 180).toFixed(4)}) / ${style.mowing.green.bandWidthM.toFixed(3)}
    : (vGolfRouteST.y + vGolfRouteST.x * ${style.mowing.skew.toFixed(3)}) / ${style.mowing.bandWidthM.toFixed(3)};
  float golfBandAmplitude = golfGreen ? ${style.mowing.green.amplitudeShare.toFixed(3)} : 1.0;
  float golfWave = sin(golfPhase * 3.141592653589793);
  float golfFilter = max(fwidth(golfWave), 0.025);
  float golfBand = smoothstep(-golfFilter, golfFilter, golfWave) * 2.0 - 1.0;
  float golfBandVisible = 1.0 - smoothstep(${style.mowing.fadeFwidth[0].toFixed(3)}, ${style.mowing.fadeFwidth[1].toFixed(3)}, fwidth(golfPhase));
  // Landing-area emphasis (fidelity §8–9): stronger band contrast inside the
  // route-local window; zero boost on par 3s. Illustrative, like the bands.
  float golfLandingWindow = golfLanding.z > 0.0 ? 1.0 - smoothstep(golfLanding.y, golfLanding.y + ${style.mowing.landing.blendM.toFixed(3)}, abs(vGolfRouteST.x - golfLanding.x)) : 0.0;
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
    + golfMacro * ${style.bunker.floorMacroAmplitude.toFixed(3)} * golfSand
    + golfBand * golfBandVisible * golfAmplitudes.z * golfBandAmplitude * golfMowingWeight * (1.0 + (golfGreen ? 0.0 : golfLanding.z * golfLandingWindow))
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
    diffuseColor.rgb = mix(diffuseColor.rgb, golfWaterSky, (${style.water.skyBase.toFixed(3)} + ${(1 - style.water.skyBase).toFixed(3)} * golfFresnel) * golfWaterMix.x);` : ''}
  }
  // Canopy contact shade (§50): analytic, from the placed crowns and mass.
  diffuseColor.rgb *= 1.0 - vGolfSurface.z * golfShadeAmount;
}`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = vGolfSurface.x;`).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>${demShading ? `
// Source-gradient shading: the DEM slope sampled per fragment in local
// metres (bilinear across the grid), plus the render-only bowl and cut/fill
// gradients carried per vertex, under the same relief exaggeration as the
// display heights. Replaces the interpolated vertex normal.
{
  vec2 golfDemUv = (vGolfLocalXY - golfDemFrame.xy) * golfDemFrame.zw + golfDemTexel;
  vec3 golfDem = texture2D(golfDemSlope, golfDemUv).xyz;
  vec2 golfSlope = golfDem.xy + vGolfDisplaySlope;
  vec3 golfGround = normalize(vec3(-golfSlope * golfRelief, 1.0));
  normal = normalize(mat3(viewMatrix) * golfGround);
  nonPerturbedNormal = normal;
  // Landform occlusion (fidelity §5–7): the DEM's relative sky view takes
  // indirect light away in swales and hollows; applied at <aomap_fragment>.
  golfLandformAo = 1.0 - min(golfLandform.y, golfDem.z * golfLandform.x);
}` : ''}
// Static water ripple (§43): a small world-space normal field, filtered out at distance.
if (abs(vGolfSurface.y - ${SURFACE_CLASS_WATER}.0) < 0.5) {
  vec2 golfRp = vGolfWorldXY + golfSeed;
  float golfR0 = dot(golfRp, vec2(0.77, 0.64) * ${k(r0)}), golfR1 = dot(golfRp, vec2(-0.55, 0.83) * ${k(r1)});
  // Each wave fades by its own pixel footprint (a cycle needs ~16 px), so
  // neither reads as corduroy at desktop or distant scales, and a slow
  // envelope gathers the ripples into patches instead of one plane wave.
  float golfRipple0 = 1.0 - smoothstep(0.15, 0.4, fwidth(golfR0)), golfRipple1 = 1.0 - smoothstep(0.15, 0.4, fwidth(golfR1));
  float golfRippleEnvelope = 0.35 + 0.65 * (0.5 + 0.5 * sin(dot(golfRp, vec2(0.31, 0.95)) * 0.27 + cos(dot(golfRp, vec2(-0.87, 0.49)) * 0.19)));
  vec3 golfRipple = vec3(cos(golfR0) * 0.77 * golfRipple0 - cos(golfR1) * 0.55 * golfRipple1, cos(golfR0) * 0.64 * golfRipple0 + cos(golfR1) * 0.83 * golfRipple1, 0.0) * golfWaterMix.z * golfRippleEnvelope;
  normal = normalize(normal + mat3(viewMatrix) * golfRipple);
}`);
    if (demShading) shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= golfLandformAo;`);
  };
  material.customProgramCacheKey = () => `golf-landscape-turf-${MERIDIAN_STYLE_HASH}:${material.type}:${demShading ? 'dem' : 'vertex'}`;
  material.userData.shading = demShading ? { basis: 'dem_slope_texture', spacingM: relief.spacingM, landform: { basis: 'dem_relative_sky_view', radiusM: style.landform.radiusM, gain: style.landform.gain, max: style.landform.max },
    terrainTone: { basis: 'visual_only', evidence: 'dem_relative_sky_view', sheltered: style.terrainTone.sheltered, exposed: style.terrainTone.exposed, floor: style.terrainTone.floor, gain: style.terrainTone.gain, max: style.terrainTone.max } } : { basis: 'vertex_normals' };
  material.userData.mowing = { basis: 'illustrative_style', bandWidthM: style.mowing.bandWidthM, frame: 'route_local', green: { bandWidthM: style.mowing.green.bandWidthM, amplitudeShare: style.mowing.green.amplitudeShare, angleDeg: style.mowing.green.angleDeg } };
  material.userData.turf = { basis: 'visual_only', macroM: style.turf.macro.wavelengthsM, microM: style.turf.micro.wavelengthsM, microByClass: style.turf.microByClass };
  material.userData.landing = landing ? { basis: 'illustrative_style', ...landing } : null;
  material.userData.water = { basis: 'visual_only', depthBasis: 'shoreline_distance', reflection: lit ? 'fresnel_static' : 'none' };
  material.userData.canopyShade = { basis: 'analytic_contact', amount: style.canopyShade.amount };
  material.userData.styleVersion = MERIDIAN_STYLE_VERSION; material.userData.styleHash = MERIDIAN_STYLE_HASH;
  return { setOverrides: apply };
}
function terrainMaterial(seed: readonly [number, number], overrides: MeridianStyleOverrides, landing: LandingWindow | null = null, relief: DemSlopeRelief | null = null): { material: THREE.MeshStandardMaterial; turf: TurfStyleHandle } {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.name = 'course-lit-albedo';
  return { material, turf: attachTurfStyle(material, seed, overrides, landing, relief) };
}

/** Build a scene-owned landscape once. Camera gestures only move the camera;
 * geometry changes here only when visual Z exaggeration changes. Every XY and
 * source Z stays in its source frame, and the input package is never mutated. */
export function buildThreeLandscape(
  scene: HoleScene,
  mesh: TerrainMesh,
  palette: ThreeLandscapePalette = DEFAULT_THREE_LANDSCAPE_PALETTE,
  options: { artifact?: MeridianVisualArtifact; overrides?: MeridianStyleOverrides;
    /** The V2 world (`installTerrainDebugView('v2-world')`) replaces this
     * landscape's terrain shading and vegetation the moment it is installed,
     * so under it the DEM shading texture and every crown, trunk, mass lobe
     * and understory placement are skipped (Task 20: they were a third of
     * the One-Tap mount). The artifact, the terrain mesh (picking, telemetry)
     * and the context objects are still built. When the V2 compile falls
     * back to V1 (R7) the renderer rebuilds the landscape without this flag,
     * so the fallback is the real V1 hole. */
    underV2?: boolean } = {},
): ThreeLandscape {
  // The visual world (§6): supplied from the cache and hash-gated, or compiled
  // now from the same canonical inputs. Either way it decorates; it never
  // becomes a source for picking, framing or shot math.
  // A stale cache (§105) is refused, but the hole keeps its canonical terrain
  // visual: the same compiler runs now from the canonical inputs and the
  // refusal is reported instead of dropping to the schematic.
  let artifact = options.artifact, artifactSource: ThreeLandscape['artifactSource'] = 'supplied', artifactRefusal: string | null = null;
  if (artifact) {
    try { assertVisualArtifact(artifact, scene, mesh); }
    catch (error) {
      if (!(error instanceof Error && error.message.startsWith(MERIDIAN_CODES.mismatch))) throw error;
      artifactRefusal = error.message; artifact = undefined;
    }
  }
  if (!artifact) { artifact = compileVisualArtifact(scene, mesh); artifactSource = artifactRefusal ? 'recompiled' : 'runtime'; }
  const group = new THREE.Group();
  group.name = 'golf-course-landscape';
  group.userData = { geometryHash: mesh.geometryHash, terrainHash: mesh.contentHash,
    styleVersion: MERIDIAN_STYLE_VERSION, styleHash: MERIDIAN_STYLE_HASH, artifactHash: artifact.contentHash, artifactSource,
    canopyHeightBasis: 'illustrative', mowingBasis: 'illustrative_style' };
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const instances: (THREE.InstancedMesh | THREE.BatchedMesh)[] = [];

  // Conforming triangles already preserve multipart features and polygon holes.
  // Normalize winding on this display copy, without triangulating again.
  const source = new Float64Array(mesh.vertices.length);
  // Per-vertex DEM normals: the legacy array, or the metric grid's gradient
  // at every vertex (course-terrain-v4 packages carry no array). They feed
  // the vertex `normal` attribute (water Fresnel, debug views, the no-grid
  // fallback); lit ground shading samples the grid per fragment instead.
  const gridNormals = sourceVertexNormals(mesh);
  const sourceNormals = gridNormals ? new Float32Array(source.length) : null;
  if (gridNormals && gridNormals.length !== source.length) throw new Error('Terrain normal/source vertex mismatch');
  const vertexCount = mesh.vertices.length / 3, albedo = linearAlbedo(artifact), attributes = artifact.attributes;
  const colors = new Float32Array(mesh.vertices.length), mowing = new Float32Array(vertexCount), turf = new Float32Array(vertexCount);
  const contextWeight = new Float32Array(vertexCount), roughness = new Float32Array(vertexCount), surfaceClass = new Float32Array(vertexCount);
  const boundary = new Float32Array(vertexCount), routeST = new Float32Array(vertexCount * 2), surround = new Float32Array(vertexCount);
  // Render-only bunker bowl (§28): depth and its gradient per display vertex.
  const bowlDepth = new Float32Array(vertexCount), bowlSlope = new Float32Array(vertexCount * 2), lipLift = new Float32Array(vertexCount);
  // Render-only path cut/fill (redesign 12): signed offset and its gradient.
  const groundLevel = new Float32Array(vertexCount), levelSlope = new Float32Array(vertexCount * 2);
  for (let t = 0; t < mesh.triangleFeatures.length; t++) {
    const offset = t * 9, v = mesh.vertices;
    const winding = (v[offset + 3]! - v[offset]!) * (v[offset + 7]! - v[offset + 1]!) -
      (v[offset + 6]! - v[offset]!) * (v[offset + 4]! - v[offset + 1]!);
    const order = winding < 0 ? [0, 2, 1] : [0, 1, 2];
    for (let corner = 0; corner < 3; corner++) {
      const index = offset + corner * 3, original = offset + order[corner]! * 3, vertex = index / 3, from = original / 3;
      source.set(v.slice(original, original + 3), index);
      if (sourceNormals) sourceNormals.set(gridNormals!.subarray(original, original + 3), index);
      // Artifact attributes follow the same corner permutation as the positions.
      colors.set(albedo.subarray(original, original + 3), index);
      mowing[vertex] = attributes.mowingWeight[from]! / 255;
      turf[vertex] = attributes.turfWeight[from]! / 255;
      contextWeight[vertex] = attributes.contextWeight[from]! / 255;
      roughness[vertex] = attributes.roughness[from]! / 255;
      // The class attribute interpolates across a triangle. Since the rough
      // hierarchy and ground zones change class per vertex inside one feature,
      // a raw id would sweep through the green / bunker / water ids between
      // rough (1) and rough_secondary (10) and paint water fragments along
      // band edges. Only those three ids matter to the shader, so every other
      // class uploads as the turf id; interpolation then never crosses them.
      surfaceClass[vertex] = shaderSurfaceClass(attributes.surfaceClass[from]!);
      boundary[vertex] = attributes.boundaryDistanceCm[from]! / 100;
      surround[vertex] = attributes.surroundDistanceCm[from]! / 100;
      routeST[vertex * 2] = attributes.routeST[from * 2]!; routeST[vertex * 2 + 1] = attributes.routeST[from * 2 + 1]!;
      bowlDepth[vertex] = attributes.bunkerDepthMm[from]! / 1000;
      lipLift[vertex] = attributes.lipLiftMm[from]! / 1000;
      bowlSlope[vertex * 2] = attributes.bunkerSlope[from * 2]! / BUNKER_SLOPE_SCALE; bowlSlope[vertex * 2 + 1] = attributes.bunkerSlope[from * 2 + 1]! / BUNKER_SLOPE_SCALE;
      groundLevel[vertex] = attributes.groundLevelMm[from]! / 1000;
      levelSlope[vertex * 2] = attributes.groundLevelSlope[from * 2]! / BUNKER_SLOPE_SCALE; levelSlope[vertex * 2 + 1] = attributes.groundLevelSlope[from * 2 + 1]! / BUNKER_SLOPE_SCALE;
    }
  }

  const terrainGeometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(source), 3).setUsage(THREE.DynamicDrawUsage);
  const normals = new THREE.BufferAttribute(new Float32Array(source.length), 3).setUsage(THREE.DynamicDrawUsage);
  terrainGeometry.setAttribute('position', positions);
  terrainGeometry.setAttribute('normal', normals);
  // Per-fragment DEM shading when the source grid is present: the vertex
  // carries only the render-only bowl and cut/fill gradients (the display
  // surface is z_dem − depth + level); the DEM slope comes from the texture.
  const relief = mesh.metricGrid && !options.underV2 ? buildDemSlopeTexture(mesh.metricGrid) : null;
  if (relief) {
    const displaySlope = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertexCount * 2; i++) displaySlope[i] = -bowlSlope[i]! + levelSlope[i]!;
    terrainGeometry.setAttribute('golfDisplaySlope', new THREE.BufferAttribute(displaySlope, 2));
  }
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
  const { material, turf: turfStyle } = terrainMaterial(artifact.seed, options.overrides ?? {}, landingWindow(scene), relief);
  materials.add(material);
  group.userData.shadingBasis = relief ? 'dem_slope_texture' : sourceNormals ? 'vertex_source_normals' : 'vertex_face_normals';
  group.userData.vertexNormalBasis = mesh.sourceNormals ? 'package_array' : gridNormals ? 'metric_grid' : 'triangles';
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

  interface Tree { id: string; tile: string; x: number; y: number; groundZ: number; radius: number; trunkRadius: number; height: number; yaw: number; aspect: number; lean: number; leanYaw: number; asset: TreeCrownAsset; familyId: string; color: THREE.Color;
    instance: number; trunkInstance: number; lod: CrownLod; trunkLod: 'near' | 'distant' | 'hidden' }
  interface MassLobe { id: string; tile: string; x: number; y: number; groundZ: number; radius: number; aspect: number; height: number; yaw: number; color: THREE.Color; lod: 'near' | 'far'; instance: number }
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
  const excludedRings = boxRings(excludedFeatures.flatMap(feature => feature.parts.flat()));
  const courseFrame = mesh.originWgs84.join(',');
  const canopyGroups = options.underV2 ? [] : canopyScene.features.filter(feature => feature.kind === 'woods' && feature.reviewed);
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
  const ownRings = boxRings(scene.features.filter(feature => feature.kind !== 'woods' && feature.kind !== 'route').flatMap(feature => feature.parts.flat()));
  const nearness = (point: PointM) => nearestRingM(point, ownRings);
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
  // Renderer redesign §3.4: dead-space rhythm. A seeded cell mask clears a
  // share of the pattern centres in larger groups, so a woods edge gets
  // notches and an interior gets dips (the forest mass still stands there)
  // instead of one uniform hedge. Seeded like the trees, so gaps are stable.
  const rhythm = VEGETATION.rhythm;
  let patternCentres = 0, rhythmCleared = 0;
  const clearing = (point: PointM) => variation(featureSeed(
    `clearing:${courseFrame}:${scene.packageHash.slice(0, 12)}:${Math.floor(point[0] / rhythm.cellM)},${Math.floor(point[1] / rhythm.cellM)}:${MERIDIAN_STYLE_VERSION}`)) < rhythm.share;
  const patterns = canopyGroups.map(feature => {
    const points = canopySymbols(feature, canopyScene);
    patternCentres += points.length;
    if (points.length < rhythm.minGroup) return points;
    const kept = points.filter(point => !clearing(point));
    rhythmCleared += points.length - kept.length;
    return kept;
  });
  const allocated = allocateCrowns(patterns, crownBudget, nearness);
  for (const [groupIndex, feature] of canopyGroups.entries()) {
    const ownBoundary = boxRings(feature.parts.flat());
    const clearanceRings = [...ownBoundary, ...excludedRings];
    for (const point of allocated[groupIndex]!) {
      if (trees.some(tree => Math.hypot(tree.x - point[0], tree.y - point[1]) < 5.4)) continue;
      const groundZ = terrainHeight(mesh, point);
      if (groundZ == null) continue;
      // §41: identity = course frame + package + feature + pattern centre + style version.
      const id = `canopy:${courseFrame}:${scene.packageHash.slice(0, 12)}:${feature.id}:${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}:${MERIDIAN_STYLE_VERSION}`;
      const n = featureSeed(id), baseRadius = 3.6 * crownScale(n);
      const edgeM = nearestRingM(point, ownBoundary);
      const family = pickFamily(edgeM, variation(n + 71));
      const design = family.designs[Math.floor(variation(n + 97) * family.designs.length) % family.designs.length]!;
      // §20.1: half the trees take the mirrored silhouette of their design.
      const asset = assetById.get(variation(n + 131) < .5 ? `${design}-mirror` : design) ?? assetById.get(design) ?? treeAtlas.variants[0]!;
      const proportion = family.radius[0] + (family.radius[1] - family.radius[0]) * variation(n + 83);
      const heightRatio = family.heightRatio[0] + (family.heightRatio[1] - family.heightRatio[0]) * variation(n + 19);
      // Broaden the artwork at the same accepted pattern centers. The complete
      // crown stays inside its reviewed mask, including holes, and clear of
      // playing surfaces. Width never changes the illustrative height or trunk.
      const clearance = nearestRingM(point, clearanceRings);
      const designRadius = baseRadius * proportion * 1.25, height = designRadius * heightRatio;
      // §20: a seeded lean (crown and trunk together, pivot at the ground)
      // only well inside the mask; the crown radius gives up the shift.
      const lean = clearance > VEGETATION.lean.clearanceM && edgeM > VEGETATION.lean.clearanceM ? VEGETATION.lean.maxDegrees * Math.PI / 180 * variation(n + 151) : 0;
      const leanShift = Math.sin(lean) * height * .64;
      const radius = Math.min(designRadius, Math.max(0, clearance - .15 - leanShift));
      // §40: family base → light by seed, lifted toward the lit colour at the edge.
      const edgeLift = Math.max(0, 1 - edgeM / VEGETATION.edgeLightM) * VEGETATION.edgeLightMix;
      const color = contextTone(new THREE.Color(family.base).lerp(new THREE.Color(family.light), Math.min(1, variation(n + 233) * .6 + edgeLift)), feature);
      trees.push({ id, tile: `${Math.floor(point[0] / CANOPY_TILE_M)},${Math.floor(point[1] / CANOPY_TILE_M)}`,
        x: point[0], y: point[1], groundZ, radius, trunkRadius: designRadius * family.trunkRatio, height,
        aspect: .84 + variation(n + 37) * .16, yaw: variation(n + 41) * Math.PI * 2, lean, leanYaw: variation(n + 157) * Math.PI * 2,
        asset, familyId: family.id, color, instance: -1, trunkInstance: -1, lod: 'distant', trunkLod: 'hidden' });
      if (trees.length >= crownBudget) break;
    }
  }
  // §39 forest mass: beyond the edge band a reviewed woods polygon is carried
  // by low-poly canopy lobes on a coarse grid, budgeted nearest the hole first.
  const massCandidates = canopyGroups.map(feature => {
    const rings = boxRings(feature.parts.flat()), vertices = feature.parts.flat(2);
    if (!vertices.length) return [] as PointM[];
    const spacing = VEGETATION.mass.spacingM;
    const minX = Math.floor(Math.min(...vertices.map(p => p[0])) / spacing) * spacing, maxX = Math.max(...vertices.map(p => p[0]));
    const minY = Math.floor(Math.min(...vertices.map(p => p[1])) / spacing) * spacing, maxY = Math.max(...vertices.map(p => p[1]));
    const points: PointM[] = [];
    for (let y = minY, row = 0; y <= maxY && points.length < 2000; y += spacing, row++) for (let x = minX + (row % 2 ? spacing / 2 : 0); x <= maxX; x += spacing) {
      const seed = featureSeed(`${feature.id}:${Math.round(x)}:${Math.round(y)}`);
      const point: PointM = [x + (variation(seed) - .5) * spacing * .5, y + (variation(seed + 5) - .5) * spacing * .5];
      if (!inFeature(point, feature)) continue;
      if (ringWithin(point, rings, VEGETATION.mass.insetM)) continue;
      if (excludedFeatures.some(other => inFeature(point, other)) || ringWithin(point, excludedRings, VEGETATION.mass.lobeRadiusM[1])) continue;
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
        color: contextTone(new THREE.Color(VEGETATION.mass.color).lerp(new THREE.Color(VEGETATION.mass.light), variation(n + 17) * .7), feature), lod: 'far', instance: -1 });
      if (lobes.length >= massBudget) break;
    }
  }

  // Outside world §10.3: OSM woodland (`forest_mass` / `forest_interior`
  // zones) beyond every reviewed woods mask is carried by context-toned mass
  // lobes only. Reviewed masks keep their crowns; nothing here adds a crown,
  // and a zone point inside a reviewed mask or any playing surface is skipped.
  const contextWoods = (options.underV2 ? [] : scene.contextZones ?? []).filter(zone => (zone.class === 'forest_mass' || zone.class === 'forest_interior') && zone.type !== 'LineString' && zone.basis !== 'uncertain')
    .map(zone => ({ id: zone.id, kind: 'woods', type: zone.type, parts: zone.parts, reviewed: false }) as LocalFeature);
  const contextMassBudget = Math.max(0, Math.round(VEGETATION.mass.contextBudget * (options.overrides?.mass ?? 1)));
  const contextMassCandidates = contextWoods.map(feature => {
    const rings = boxRings(feature.parts.flat()), vertices = feature.parts.flat(2);
    if (!vertices.length) return [] as PointM[];
    const spacing = VEGETATION.mass.spacingM;
    const minX = Math.floor(Math.min(...vertices.map(p => p[0])) / spacing) * spacing, maxX = Math.max(...vertices.map(p => p[0]));
    const minY = Math.floor(Math.min(...vertices.map(p => p[1])) / spacing) * spacing, maxY = Math.max(...vertices.map(p => p[1]));
    const points: PointM[] = [];
    for (let y = minY, row = 0; y <= maxY && points.length < 2000; y += spacing, row++) for (let x = minX + (row % 2 ? spacing / 2 : 0); x <= maxX; x += spacing) {
      const seed = featureSeed(`${feature.id}:${Math.round(x)}:${Math.round(y)}`);
      const point: PointM = [x + (variation(seed) - .5) * spacing * .5, y + (variation(seed + 5) - .5) * spacing * .5];
      if (!inFeature(point, feature)) continue;
      if (ringWithin(point, rings, VEGETATION.mass.lobeRadiusM[0])) continue;
      if (canopyGroups.some(other => inFeature(point, other))) continue;
      if (excludedFeatures.some(other => inFeature(point, other)) || ringWithin(point, excludedRings, VEGETATION.mass.lobeRadiusM[1])) continue;
      points.push(point);
    }
    return points;
  });
  let contextMassLobes = 0;
  const contextMassAllocated = allocateCrowns(contextMassCandidates, contextMassBudget, nearness);
  for (const [groupIndex, feature] of contextWoods.entries()) {
    for (const point of contextMassAllocated[groupIndex]!) {
      const groundZ = terrainHeight(mesh, point);
      if (groundZ == null) continue;
      const id = `mass:${courseFrame}:${scene.packageHash.slice(0, 12)}:${feature.id}:${Math.round(point[0])},${Math.round(point[1])}:${MERIDIAN_STYLE_VERSION}`;
      const n = featureSeed(id);
      const radius = VEGETATION.mass.lobeRadiusM[0] + (VEGETATION.mass.lobeRadiusM[1] - VEGETATION.mass.lobeRadiusM[0]) * variation(n + 3);
      const height = VEGETATION.mass.canopyHeightM[0] + (VEGETATION.mass.canopyHeightM[1] - VEGETATION.mass.canopyHeightM[0]) * variation(n + 7);
      lobes.push({ id, tile: `${Math.floor(point[0] / CANOPY_TILE_M)},${Math.floor(point[1] / CANOPY_TILE_M)}`, x: point[0], y: point[1], groundZ,
        radius, aspect: .8 + variation(n + 11) * .3, height, yaw: variation(n + 13) * Math.PI * 2,
        color: contextTone(new THREE.Color(VEGETATION.mass.color).lerp(new THREE.Color(VEGETATION.mass.light), variation(n + 17) * .7), feature), lod: 'far', instance: -1 });
      contextMassLobes++;
      if (contextMassLobes >= contextMassBudget) break;
    }
  }
  // Outside world §10.4 understory: low shrub clusters inside the reviewed
  // forest edge (between `innerM` and `bandM` from the boundary), on a
  // jittered grid, budgeted nearest the hole first. They reuse the low
  // cluster crown design with no trunk and never leave their mask.
  const understory = VEGETATION.understory, shrubAsset = assetById.get('broad-low-cluster') ?? treeAtlas.variants[0]!;
  const understoryBudget = Math.max(0, Math.round(understory.budget * (options.overrides?.crowns ?? 1)));
  const understoryCandidates = canopyGroups.map(feature => {
    const rings = boxRings(feature.parts.flat()), vertices = feature.parts.flat(2);
    if (!vertices.length) return [] as PointM[];
    const spacing = understory.spacingM;
    const minX = Math.floor(Math.min(...vertices.map(p => p[0])) / spacing) * spacing, maxX = Math.max(...vertices.map(p => p[0]));
    const minY = Math.floor(Math.min(...vertices.map(p => p[1])) / spacing) * spacing, maxY = Math.max(...vertices.map(p => p[1]));
    const points: PointM[] = [];
    for (let y = minY, row = 0; y <= maxY && points.length < 3000; y += spacing, row++) for (let x = minX + (row % 2 ? spacing / 2 : 0); x <= maxX; x += spacing) {
      const seed = featureSeed(`understory:${feature.id}:${Math.round(x)}:${Math.round(y)}`);
      const point: PointM = [x + (variation(seed) - .5) * spacing * .6, y + (variation(seed + 5) - .5) * spacing * .6];
      if (!inFeature(point, feature)) continue;
      const edgeM = nearestRingM(point, rings);
      if (edgeM < understory.innerM || edgeM > understory.bandM) continue;
      if (excludedFeatures.some(other => inFeature(point, other)) || ringWithin(point, excludedRings, understory.radiusM[1])) continue;
      points.push(point);
    }
    return points;
  });
  let understoryCount = 0;
  const understoryAllocated = allocateCrowns(understoryCandidates, understoryBudget, nearness);
  for (const [groupIndex, feature] of canopyGroups.entries()) {
    const ownBoundary = boxRings(feature.parts.flat()), clearanceRings = [...ownBoundary, ...excludedRings];
    for (const point of understoryAllocated[groupIndex]!) {
      const groundZ = terrainHeight(mesh, point);
      if (groundZ == null) continue;
      const id = `understory:${courseFrame}:${scene.packageHash.slice(0, 12)}:${feature.id}:${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)}:${MERIDIAN_STYLE_VERSION}`;
      const n = featureSeed(id);
      const clearance = nearestRingM(point, clearanceRings);
      const designRadius = understory.radiusM[0] + (understory.radiusM[1] - understory.radiusM[0]) * variation(n + 3);
      const radius = Math.min(designRadius, Math.max(0, clearance - .15));
      if (radius < .5) continue;
      const height = understory.heightM[0] + (understory.heightM[1] - understory.heightM[0]) * variation(n + 7);
      const color = contextTone(new THREE.Color(understory.base).lerp(new THREE.Color(understory.light), variation(n + 17) * .7), feature);
      trees.push({ id, tile: `${Math.floor(point[0] / CANOPY_TILE_M)},${Math.floor(point[1] / CANOPY_TILE_M)}`, x: point[0], y: point[1], groundZ,
        radius, trunkRadius: 0, height, aspect: .8 + variation(n + 37) * .3, lean: 0, leanYaw: 0, yaw: variation(n + 41) * Math.PI * 2, asset: shrubAsset, familyId: 'understory', color, instance: -1, trunkInstance: -1, lod: 'distant', trunkLod: 'hidden' });
      understoryCount++;
      if (understoryCount >= understoryBudget) break;
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

  // Crown self-occlusion (§50): the atlas carries a per-vertex occlusion ramp
  // (base and undersides of every lobe cluster); the material takes that much
  // albedo away, scaled by the style amount and the lab `crownShade` override.
  const crownShade: { value: number } = { value: MERIDIAN_STYLE.canopyShade.self * (options.overrides?.crownShade ?? 1) };
  const attachCrownShade = (material: THREE.MeshStandardMaterial) => {
    material.onBeforeCompile = shader => {
      shader.uniforms.golfCrownShade = crownShade;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute float crownOcclusion;
varying float vCrownOcclusion;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vCrownOcclusion = crownOcclusion;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform float golfCrownShade;
varying float vCrownOcclusion;`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= 1.0 - golfCrownShade * vCrownOcclusion;`);
    };
    material.customProgramCacheKey = () => `golf-crown-shade-${MERIDIAN_STYLE_HASH}`;
    material.userData.selfShade = { basis: 'analytic_height_and_underside', amount: MERIDIAN_STYLE.canopyShade.self };
  };
  const crownMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  crownMaterial.name = 'opaque-canopy';
  attachCrownShade(crownMaterial);
  materials.add(crownMaterial);
  // §68.2: one BatchedMesh holds every crown. Each authored design contributes
  // its three LOD geometries once and every tree is one instance that points
  // at the geometry for its current LOD. Three culls and depth-sorts the
  // instances itself, so the crown layer costs one draw call (plus one in the
  // shadow pass) instead of tiles × designs × 2. The single call needs
  // WEBGL_multi_draw (Safari 15+, Chrome 86+); without it Three issues one
  // call per visible instance and the renderer reports it as `multiDrawBasis`.
  const crownGeometryIds = new Map<TreeCrownAsset, Record<CrownLod, number>>();
  let crownVertexCount = 0, crownIndexCount = 0;
  for (const asset of treeAtlas.variants) for (const lod of CROWN_LODS) {
    crownVertexCount += asset[lod].getAttribute('position').count; crownIndexCount += asset[lod].getIndex()?.count ?? 0;
  }
  let crowns: THREE.BatchedMesh | null = null;
  if (trees.length) {
    crowns = new THREE.BatchedMesh(trees.length, crownVertexCount, crownIndexCount, crownMaterial);
    for (const asset of treeAtlas.variants) {
      crownGeometryIds.set(asset, { near: crowns.addGeometry(asset.near), distant: crowns.addGeometry(asset.distant), far: crowns.addGeometry(asset.far) });
    }
    crowns.name = 'source-canopy-crowns';
    crowns.userData = { canopyBasis: 'reviewed_group_illustration', heightBasis: 'illustrative', treeIds: trees.map(tree => tree.id),
      families: trees.map(tree => tree.familyId), designs: trees.map(tree => tree.asset.id), lods: trees.map(() => 'distant') };
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    for (const tree of trees) {
      tree.instance = crowns.addInstance(crownGeometryIds.get(tree.asset)!.distant);
      crowns.setColorAt(tree.instance, tree.color);
    }
    group.add(crowns); instances.push(crowns);
  }
  const trunkGeometry = { near: new THREE.CylinderGeometry(.7, 1, 1, 7, 1), distant: new THREE.CylinderGeometry(.7, 1, 1, 3, 1) };
  const trunkTriangleCount = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  for (const geometry of Object.values(trunkGeometry)) { geometry.rotateX(Math.PI / 2); geometries.add(geometry); }
  // Trunks batch the same way: two cylinder geometries, one instance per
  // trunked tree, hidden instances beyond twice the near band (§37).
  const trunkTrees = trees.filter(tree => tree.trunkRadius > 0);
  const trunkGeometryIds = { near: -1, distant: -1 };
  let trunks: THREE.BatchedMesh | null = null;
  if (trunkTrees.length) {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: palette.treeShadow, roughness: 1, metalness: 0 });
    trunkMaterial.name = 'opaque-canopy-trunk';
    materials.add(trunkMaterial);
    const vertexCount = trunkGeometry.near.getAttribute('position').count + trunkGeometry.distant.getAttribute('position').count;
    const indexCount = (trunkGeometry.near.getIndex()?.count ?? 0) + (trunkGeometry.distant.getIndex()?.count ?? 0);
    trunks = new THREE.BatchedMesh(trunkTrees.length, vertexCount, indexCount, trunkMaterial);
    trunkGeometryIds.near = trunks.addGeometry(trunkGeometry.near); trunkGeometryIds.distant = trunks.addGeometry(trunkGeometry.distant);
    trunks.name = 'source-canopy-trunks';
    trunks.userData = { treeIds: trunkTrees.map(tree => tree.id), heightBasis: 'illustrative', lods: trunkTrees.map(() => 'distant') };
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    for (const tree of trunkTrees) { tree.trunkInstance = trunks.addInstance(trunkGeometryIds.distant); tree.trunkLod = 'distant'; }
    group.add(trunks); instances.push(trunks);
  }
  // §39 / redesign §10: an authored five-lobe canopy cluster per mass cell,
  // so the interior reads as canopy tops beside the edge crowns rather than
  // as one large faceted dome. Like the crowns (§68.2), one BatchedMesh holds
  // both builds of the outline, the 400-triangle cluster and its 220-triangle
  // far version, and every lobe is one instance pointing at the geometry for
  // its LOD (`setDetail`), so the layer stays one draw call at every split.
  const massGeometry = createForestMassGeometry('near'), massFarGeometry = createForestMassGeometry('far');
  geometries.add(massGeometry); geometries.add(massFarGeometry);
  const massGeometryIds = { near: -1, far: -1 };
  let mass: THREE.BatchedMesh | null = null;
  if (lobes.length) {
    const massMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
    massMaterial.name = 'opaque-forest-mass';
    attachCrownShade(massMaterial);
    materials.add(massMaterial);
    mass = new THREE.BatchedMesh(lobes.length, massGeometry.getAttribute('position').count + massFarGeometry.getAttribute('position').count, 0, massMaterial);
    massGeometryIds.near = mass.addGeometry(massGeometry); massGeometryIds.far = mass.addGeometry(massFarGeometry);
    mass.name = 'source-forest-mass';
    mass.userData = { canopyBasis: 'reviewed_group_illustration', heightBasis: 'illustrative', layer: 'forest_mass', lobeIds: lobes.map(lobe => lobe.id), lods: lobes.map(() => 'far') };
    mass.castShadow = true;
    mass.receiveShadow = true;
    for (const lobe of lobes) {
      lobe.instance = mass.addInstance(massGeometryIds.far);
      mass.setColorAt(lobe.instance, lobe.color);
    }
    group.add(mass); instances.push(mass);
  }

  const familyCounts: Record<string, number> = {};
  for (const tree of trees) familyCounts[tree.familyId] = (familyCounts[tree.familyId] ?? 0) + 1;
  // Outside-world context objects (paths, structures, lines) ride in the same
  // group so exaggeration and disposal flow through one landscape.
  const context = buildThreeContext(scene, mesh);
  group.add(context.group);
  const counts: ThreeLandscape['counts'] = { terrainTriangles: mesh.triangleFeatures.length, trees: trees.length,
    crownInstances: trees.length, crownTriangles: 0, totalTriangles: 0, canopyBatches: crowns ? 1 : 0, drawCalls: 0,
    massLobes: lobes.length, trunksVisible: 0, families: familyCounts, patternCentres, rhythmCleared, contextMassLobes, understory: understoryCount,
    contextRibbons: context.counts.ribbons, contextStructures: context.counts.structures, contextLines: context.counts.lines, contextZones: context.counts.zones,
    crownNearTriangles: 0, crownDistantTriangles: 0, crownFarTriangles: 0, trunkTriangles: 0, massTriangles: 0, lodTrees: { near: 0, distant: 0, far: 0, hidden: 0 }, massLod: { near: 0, far: 0 }, crownLodBasis: 'focus_bands' };
  const massNearTriangles = trunkTriangleCount(massGeometry), massFarTriangles = trunkTriangleCount(massFarGeometry);
  const updateTriangleCounts = () => {
    let near = 0, distant = 0, far = 0, nearTrees = 0, distantTrees = 0, farTrees = 0, trunkTriangles = 0, trunksVisible = 0, hiddenTrunks = 0;
    for (const tree of trees) {
      if (tree.lod === 'near') { near += tree.asset.triangleCounts.near; nearTrees++; }
      else if (tree.lod === 'distant') { distant += tree.asset.triangleCounts.distant; distantTrees++; }
      else { far += tree.asset.triangleCounts.far; farTrees++; }
      if (tree.trunkInstance < 0) continue;
      if (tree.trunkLod === 'hidden') hiddenTrunks++;
      else { trunkTriangles += trunkTriangleCount(trunkGeometry[tree.trunkLod]); trunksVisible++; }
    }
    counts.crownNearTriangles = near; counts.crownDistantTriangles = distant; counts.crownFarTriangles = far;
    counts.crownTriangles = near + distant + far;
    let massNear = 0;
    for (const lobe of lobes) if (lobe.lod === 'near') massNear++;
    const massTriangles = massNear * massNearTriangles + (lobes.length - massNear) * massFarTriangles;
    counts.trunkTriangles = trunkTriangles; counts.massTriangles = massTriangles;
    counts.lodTrees = { near: nearTrees, distant: distantTrees, far: farTrees, hidden: hiddenTrunks };
    counts.massLod = { near: massNear, far: lobes.length - massNear };
    counts.trunksVisible = trunksVisible;
    counts.totalTriangles = counts.terrainTriangles + counts.crownTriangles + trunkTriangles + massTriangles;
    counts.drawCalls = 1 + (crowns ? 1 : 0) + (trunks && trunksVisible ? 1 : 0) + (mass ? 1 : 0);
  };
  updateTriangleCounts();
  const transform = new THREE.Matrix4(), translation = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  /** Place every mass lobe: cluster top at groundZ + height, and every lobe
   * underside (cluster z <= -.8) at least .12 * height below ground so no
   * belly shows from Side. */
  function layoutMass(displayZ: (z: number) => number) {
    if (!mass) return;
    for (const lobe of lobes) {
      translation.set(lobe.x, lobe.y, displayZ(lobe.groundZ) + lobe.height * .38);
      rotation.setFromAxisAngle(Z_AXIS, lobe.yaw);
      scale.set(lobe.radius, lobe.radius * lobe.aspect, lobe.height * .62);
      mass.setMatrixAt(lobe.instance, transform.compose(translation, rotation, scale));
    }
    mass.computeBoundingBox(); mass.computeBoundingSphere();
  }
  const tilt = new THREE.Quaternion(), leanAxis = new THREE.Vector3(), up = new THREE.Vector3();
  let lastExaggeration = NaN, lastReference = NaN, disposed = false;
  function setDetail(next: 'distant' | 'near', focusM?: PointM, view?: PerspectiveLodView): boolean {
    if (disposed) return false;
    let changed = false;
    // Per tree (§37/§68). Perspective: by the crown's projected radius, so a
    // tree beside the eye keeps its full crown and 7-sided trunk while the
    // far end of the hole drops to the coarse silhouette with no trunk.
    // Orthographic: by distance from the focus, near inside the band, mid
    // inside twice of it, far beyond.
    const exaggeration = Number.isFinite(lastExaggeration) ? lastExaggeration : 1, reference = Number.isFinite(lastReference) ? lastReference : 0;
    counts.crownLodBasis = view ? 'screen_px' : 'focus_bands';
    // Perspective: projected crown radius per tree; the near band goes to the
    // `nearBudget` largest crowns that clear the near threshold, so the cost
    // of a view stays bounded whatever the camera does.
    const projected = view ? trees.map(tree => projectedCrownPx(view, tree.x, tree.y, reference + (tree.groundZ - reference) * exaggeration + tree.height * .64, tree.radius)) : null;
    const nearSet = new Set<number>();
    if (projected && next === 'near') {
      const candidates = projected.map((px, index) => [px, index] as const).filter(([px]) => px >= VEGETATION.lodScreenPx.near);
      candidates.sort((a, b) => b[0] - a[0]);
      for (const [, index] of candidates.slice(0, VEGETATION.lodScreenPx.nearBudget)) nearSet.add(index);
    }
    for (const [index, tree] of trees.entries()) {
      let lod: CrownLod;
      if (projected) {
        const px = projected[index]!;
        lod = nearSet.has(index) ? 'near' : px >= VEGETATION.lodScreenPx.distant ? 'distant' : 'far';
      } else {
        const distance = focusM ? Math.hypot(tree.x - focusM[0], tree.y - focusM[1]) : 0;
        lod = next === 'near' && distance <= NEAR_DETAIL_RADIUS_M ? 'near' : distance <= NEAR_DETAIL_RADIUS_M * 2 ? 'distant' : 'far';
      }
      if (crowns && tree.lod !== lod) {
        crowns.setGeometryIdAt(tree.instance, crownGeometryIds.get(tree.asset)![lod]);
        (crowns.userData.lods as string[])[tree.instance] = lod;
        tree.lod = lod; changed = true;
      }
      if (!trunks || tree.trunkInstance < 0) continue;
      const trunkLod = lod === 'far' ? 'hidden' : lod;
      if (tree.trunkLod === trunkLod) continue;
      if (trunkLod !== 'hidden') trunks.setGeometryIdAt(tree.trunkInstance, trunkGeometryIds[trunkLod]);
      trunks.setVisibleAt(tree.trunkInstance, trunkLod !== 'hidden');
      (trunks.userData.lods as string[])[tree.trunkInstance] = trunkLod;
      tree.trunkLod = trunkLod; changed = true;
    }
    // Forest mass (§39): the full cluster only where it projects at least
    // `mass.lodScreenPx` (perspective) or inside twice the near band
    // (orthographic), and only when the tier grants near detail at all.
    let massChanged = false;
    for (const lobe of lobes) {
      let lod: 'near' | 'far';
      if (view) {
        const px = projectedCrownPx(view, lobe.x, lobe.y, reference + (lobe.groundZ - reference) * exaggeration + lobe.height * .6, lobe.radius);
        lod = next === 'near' && px >= VEGETATION.mass.lodScreenPx ? 'near' : 'far';
      } else {
        const distance = focusM ? Math.hypot(lobe.x - focusM[0], lobe.y - focusM[1]) : 0;
        lod = next === 'near' && distance <= NEAR_DETAIL_RADIUS_M * 2 ? 'near' : 'far';
      }
      if (!mass || lobe.lod === lod) continue;
      mass.setGeometryIdAt(lobe.instance, massGeometryIds[lod]);
      (mass.userData.lods as string[])[lobe.instance] = lod;
      lobe.lod = lod; massChanged = true;
    }
    if (massChanged) { mass?.computeBoundingBox(); mass?.computeBoundingSphere(); changed = true; }
    if (changed) {
      crowns?.computeBoundingBox(); crowns?.computeBoundingSphere();
      trunks?.computeBoundingBox(); trunks?.computeBoundingSphere();
      updateTriangleCounts();
    }
    return changed;
  }
  const bowlScale = Math.max(0, options.overrides?.bowl ?? 1);
  function setExaggeration(exaggeration: number, referenceElevationM: number) {
    if (disposed) return;
    if (!Number.isFinite(exaggeration) || exaggeration <= 0 || exaggeration > 3 || !Number.isFinite(referenceElevationM)) {
      throw new Error('Invalid visual terrain exaggeration');
    }
    if (exaggeration === lastExaggeration && referenceElevationM === lastReference) return;
    const displayZ = (z: number) => referenceElevationM + (z - referenceElevationM) * exaggeration;
    if (relief) relief.exaggeration.value = exaggeration;
    // The bowl is a display offset below the canonical surface; it scales
    // with relief like every other display height and never touches `source`.
    for (let i = 0; i < positions.count; i++) positions.setZ(i, displayZ(source[i * 3 + 2]!) + ((lipLift[i]! - bowlDepth[i]!) * bowlScale + groundLevel[i]!) * exaggeration);
    positions.needsUpdate = true;
    if (sourceNormals) {
      for (let i = 0; i < positions.count; i++) {
        const j = i * 3, nx = sourceNormals[j]!, ny = sourceNormals[j + 1]!, nz0 = Math.max(1e-3, sourceNormals[j + 2]!);
        // DEM slope, then the bowl gradient (z = z_dem − depth), then relief.
        const zx = -nx / nz0 - bowlSlope[i * 2]! + levelSlope[i * 2]!, zy = -ny / nz0 - bowlSlope[i * 2 + 1]! + levelSlope[i * 2 + 1]!;
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
    for (const tree of trees) {
      rotation.setFromAxisAngle(Z_AXIS, tree.yaw);
      // §20: crown and trunk share one lean about the ground point, so the
      // trunk still meets the ground where the tree stands.
      if (tree.lean > 0) {
        leanAxis.set(Math.cos(tree.leanYaw), Math.sin(tree.leanYaw), 0);
        tilt.setFromAxisAngle(leanAxis, tree.lean); rotation.premultiply(tilt);
        up.set(0, 0, 1).applyQuaternion(tilt);
      } else up.set(0, 0, 1);
      const base = displayZ(tree.groundZ);
      if (crowns) {
        const lift = tree.height * .64;
        translation.set(tree.x + up.x * lift, tree.y + up.y * lift, base + up.z * lift);
        scale.set(tree.radius, tree.radius * tree.aspect, tree.height * .72);
        crowns.setMatrixAt(tree.instance, transform.compose(translation, rotation, scale));
      }
      if (trunks && tree.trunkInstance >= 0) {
        const lift = tree.height * .18;
        translation.set(tree.x + up.x * lift, tree.y + up.y * lift, base + up.z * lift);
        scale.set(tree.trunkRadius, tree.trunkRadius, tree.height * .36);
        trunks.setMatrixAt(tree.trunkInstance, transform.compose(translation, rotation, scale));
      }
    }
    crowns?.computeBoundingBox(); crowns?.computeBoundingSphere();
    trunks?.computeBoundingBox(); trunks?.computeBoundingSphere();
    layoutMass(displayZ);
    context.setExaggeration(exaggeration, referenceElevationM);
    lastExaggeration = exaggeration; lastReference = referenceElevationM;
  }
  setExaggeration(1, mesh.referenceElevationM);

  return {
    group, terrain, setExaggeration, setDetail, counts, artifact, artifactSource, artifactRefusal,
    setStyleOverrides(overrides) {
      if (disposed) return;
      turfStyle.setOverrides(overrides);
      crownShade.value = MERIDIAN_STYLE.canopyShade.self * (overrides.crownShade ?? 1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context.dispose();
      for (const instance of instances) instance.dispose();
      treeAtlas.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const ownedMaterial of materials) ownedMaterial.dispose();
      relief?.texture.dispose();
      group.removeFromParent(); group.clear();
    },
  };
}
