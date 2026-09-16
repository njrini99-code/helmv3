/** Meridian V2 ground shader (V2 plan Part XIV §76–81; Task 11).
 *
 * GLSL source fragments and the uniform/attribute layout for the one V2
 * ground program (constraint 19: a single material covers the base terrain
 * and every hero patch). This module is three-free: it hands back plain
 * strings and pure colour/roughness functions; `three-world-v2.ts` (the
 * component layer) is the only place that touches a THREE.Material, wiring
 * these chunks in through `onBeforeCompile` over MeshStandardMaterial rather
 * than a bespoke ShaderMaterial, so the existing directional sun, hemisphere
 * light and PCF shadow map keep working with no renderer change (§76, §79).
 *
 * There is no field atlas yet (Task 10) and no analytic bunker gradient yet
 * (Task 9), so this program classifies every fragment from the per-vertex
 * `golfV2Class` attribute the geometry layer already carries (base:
 * `PackedDisplayMesh.surfaceClass`; hero patches: the dominant class of the
 * triangles touching each vertex, `dominantClass` below) and reads the bowl/
 * lip shape from the per-vertex `golfV2Offset` metres already baked into
 * `PackedHeroPatch.visualOffsetMm`. Both are §107 fields the compilers
 * already produce; nothing here sends a texture or a raw class id into a
 * per-fragment lookup that could sweep across unrelated classes the way a
 * bare id interpolation would (see the V1 comment this mirrors in
 * three-landscape.ts `shaderSurfaceClass`). The class *colour* the same way
 * V1 does: baked once as linear-light `color` vertex attributes
 * (`classAlbedoLinear`), so the boundary "blend" is the ordinary GPU
 * interpolation of two different vertex colours across the ribbon/collar
 * triangles the compilers already emit at every semantic edge (§107 stitches
 * a hero patch to the base at exact shared vertices) — screen-stable because
 * it is per-fragment barycentric interpolation of a static field, not a
 * screen-space or time-varying computation. */
import { SURFACE_CLASS_IDS, type SurfaceClass } from './visual-artifact';
import { hexToRgb, MERIDIAN_STYLE, srgbToLinear, type MeridianPaletteKey, type MeridianStyle } from './visual-style';

export const GROUND_SHADER_V2_VERSION = 'meridian-ground-v2-1';

/** Attribute names the component layer must upload on every V2 ground
 * geometry (base and hero patches alike, so the one material fits both). */
export const GROUND_V2_ATTRIBUTES = Object.freeze({
  surfaceClass: 'golfV2Class',
  /** Metres; the render-only bunker bowl/lip offset (0 elsewhere). */
  visualOffset: 'golfV2Offset',
  roughness: 'golfV2Roughness',
});

/** Priority a shared vertex resolves to when the triangles touching it carry
 * different classes — copied from display-mesh-v2.ts's private
 * `CLASS_PRIORITY` (green, bunker, fringe, surround, water, tee, fairway,
 * rough, woods, ground) so a base vertex and a hero-patch vertex at the same
 * kind of seam resolve the same way; the remaining SURFACE_CLASS_IDS entries
 * are appended for classes no V2 compiler emits yet. */
export const GROUND_CLASS_PRIORITY: readonly SurfaceClass[] = [
  'green', 'bunker', 'fringe', 'surround', 'water', 'tee', 'fairway', 'rough', 'woods', 'ground',
  ...SURFACE_CLASS_IDS.filter(cls => !(['green', 'bunker', 'fringe', 'surround', 'water', 'tee', 'fairway', 'rough', 'woods', 'ground'] as readonly SurfaceClass[]).includes(cls)),
];

/** Resolve one class for a vertex from the (possibly repeated) classes of
 * the triangles that touch it, by `GROUND_CLASS_PRIORITY`. Used to turn a
 * hero patch's per-triangle `triangleClass` (compileRegionPatch's diagnostic
 * field) into the per-vertex attribute this shader actually reads, mirroring
 * how `packDisplayMesh` already resolves the base mesh's per-vertex class. */
export function dominantClass(classes: Iterable<SurfaceClass>): SurfaceClass {
  let best: SurfaceClass = 'ground', bestRank = GROUND_CLASS_PRIORITY.length;
  for (const cls of classes) {
    const rank = GROUND_CLASS_PRIORITY.indexOf(cls);
    if (rank >= 0 && rank < bestRank) { bestRank = rank; best = cls; }
  }
  return best;
}

const PALETTE_KEY_BY_CLASS: Partial<Record<SurfaceClass, MeridianPaletteKey>> = {
  ground: 'ground', rough: 'rough', fairway: 'fairway', tee: 'tee', green: 'green', fringe: 'fringe', surround: 'surround',
  bunker: 'bunker', water: 'water', woods: 'woods', rough_secondary: 'roughSecondary', rough_outer: 'roughOuter', native: 'native',
  apron: 'apron', open_field: 'openField', wetland: 'wetland', parking: 'parking', ski_slope: 'skiSlope', recreation: 'recreation',
  buffer_grass: 'bufferGrass',
};
const mix3 = (a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Linear-light albedo for one surface class, straight from the Meridian
 * palette (§56 hierarchy: green → tee → fairway → fringe → surround →
 * rough/ground → woods); the woods floor keeps V1's one-line mix toward
 * rough (`woodsUnderstoryMix`) so a canopy floor tile never reads as pure
 * understory green. A class with no palette entry yet (`runoff`) falls back
 * to ground rather than inventing a colour. */
export function classAlbedoLinear(surfaceClass: SurfaceClass, style: MeridianStyle = MERIDIAN_STYLE): [number, number, number] {
  const palette = style.palette, key = PALETTE_KEY_BY_CLASS[surfaceClass] ?? 'ground';
  let rgb = hexToRgb(palette[key]);
  if (surfaceClass === 'woods') rgb = mix3(rgb, hexToRgb(palette.rough), style.surface.woodsUnderstoryMix);
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

/** MeshStandard roughness for one surface class (§23–24, "quiet BRDF"); a
 * class the table does not carry yet falls back to the ground value. */
export function classRoughness(surfaceClass: SurfaceClass, style: MeridianStyle = MERIDIAN_STYLE): number {
  const roughness = style.surface.roughness;
  return surfaceClass in roughness ? roughness[surfaceClass as keyof typeof roughness] : roughness.ground;
}

/** A stable per-package world-space offset for the macro/micro turf fields,
 * so two holes of the same course share one turf world and never swim under
 * the camera (mirrors visual-artifact.ts's private `seedFromHash` — the same
 * derivation, kept here because that function is not exported). `hash` is
 * the terrain/package sha256 hex digest (`TerrainMesh.geometryHash`). */
export function seedFromPackageHash(hash: string): readonly [number, number] {
  const a = Number.parseInt(hash.slice(0, 8), 16) || 0, b = Number.parseInt(hash.slice(8, 16), 16) || 0;
  return [(a % 100_000) / 100, (b % 100_000) / 100];
}

/** §37–39 normalization for the bunker offset shading below: how many metres
 * of bowl depth / lip lift reach full shade. The shader only has the offset
 * at each fragment, not the owning bunker's own profile, so this is a single
 * reasonable range across every bunker rather than a per-bunker normalized
 * one; Task 9's analytic gradient can replace it with the real field. */
export const BUNKER_SHADE_NORM = Object.freeze({
  depthM: 0.7, lipM: 0.08, floorShade: MERIDIAN_STYLE.bunker.floorShade, lipLighten: 0.4,
});

export interface GroundShaderV2Chunks {
  /** Appended after `#include <common>` in the vertex shader. */
  vertexHead: string;
  /** Appended after `#include <begin_vertex>` in the vertex shader. */
  vertexMain: string;
  /** Appended after `#include <common>` in the fragment shader. */
  fragmentHead: string;
  /** Appended after `#include <color_fragment>` in the fragment shader. */
  fragmentColor: string;
  /** Appended after `#include <roughnessmap_fragment>` in the fragment shader. */
  fragmentRoughness: string;
}

/** Build the GLSL chunks for the one V2 ground program. Colour comes from
 * the baked vertex `color` attribute (three's own `vertexColors` path,
 * untouched here); this only adds: world-space macro/micro turf variation
 * (§17–21, copied from the V1 ground material verbatim: same wavelengths,
 * same green scale-down, same `fwidth` micro fade so it never aliases at
 * distance — "screen-stable" in the sense that a static per-fragment field
 * cannot swim under camera motion the way a dithered blend could), and the
 * §37–39 bunker bowl/lip shade from the offset attribute. Wavelengths and
 * amplitudes are baked as GLSL literals (they are style, not runtime state);
 * `three-world-v2.ts` includes `MERIDIAN_STYLE_HASH` in the material's
 * `customProgramCacheKey()` so a style change still gets a fresh program
 * (§77) even though nothing here is a per-hole number. */
export function groundShaderV2Chunks(style: MeridianStyle = MERIDIAN_STYLE): GroundShaderV2Chunks {
  const GREEN = SURFACE_CLASS_IDS.indexOf('green').toFixed(1), BUNKER = SURFACE_CLASS_IDS.indexOf('bunker').toFixed(1);
  const WATER = SURFACE_CLASS_IDS.indexOf('water').toFixed(1), WOODS = SURFACE_CLASS_IDS.indexOf('woods').toFixed(1);
  const [m0 = 1, m1 = 1, m2 = 1] = style.turf.macro.wavelengthsM, [u0 = 1, u1 = 1] = style.turf.micro.wavelengthsM;
  const k = (wavelength: number) => (2 * Math.PI / wavelength).toFixed(6);
  const [fade0 = 0, fade1 = 1] = style.turf.microFadeFwidth;
  const macroAmp = style.turf.macro.amplitude.toFixed(4), microAmp = style.turf.micro.amplitude.toFixed(4);
  const greenMacro = style.turf.greenMacroScale.toFixed(3), greenMicro = style.turf.greenMicroScale.toFixed(3);
  const norm = BUNKER_SHADE_NORM;
  const { surfaceClass, visualOffset, roughness } = GROUND_V2_ATTRIBUTES;

  const vertexHead = `attribute float ${surfaceClass};
attribute float ${visualOffset};
attribute float ${roughness};
varying float vGolfV2Class;
varying float vGolfV2Offset;
varying float vGolfV2Roughness;
varying vec2 vGolfV2WorldXY;`;
  const vertexMain = `vGolfV2Class = ${surfaceClass};
vGolfV2Offset = ${visualOffset};
vGolfV2Roughness = ${roughness};
vGolfV2WorldXY = (modelMatrix * vec4(position, 1.0)).xy;`;
  const fragmentHead = `uniform vec2 golfV2Seed;
varying float vGolfV2Class;
varying float vGolfV2Offset;
varying float vGolfV2Roughness;
varying vec2 vGolfV2WorldXY;`;
  const fragmentColor = `{
  float golfClass = vGolfV2Class;
  bool golfGreen = abs(golfClass - ${GREEN}) < 0.5;
  bool golfBunker = abs(golfClass - ${BUNKER}) < 0.5;
  bool golfWater = abs(golfClass - ${WATER}) < 0.5;
  bool golfWoods = abs(golfClass - ${WOODS}) < 0.5;
  float golfTurfWeight = (golfBunker || golfWater || golfWoods) ? 0.0 : 1.0;
  vec2 golfP = vGolfV2WorldXY + golfV2Seed;
  // §17–21 world-space turf variation (copied from the V1 ground material).
  float golfMacro = (sin(dot(golfP, vec2(0.87, 0.49) * ${k(m0)}))
    + sin(dot(golfP, vec2(-0.32, 0.95) * ${k(m1)}) + 1.3)
    + sin(dot(golfP, vec2(0.61, -0.79) * ${k(m2)}) + 2.1)) / 3.0;
  golfMacro *= golfGreen ? ${greenMacro} : 1.0;
  float golfMicroPhase = dot(golfP, vec2(0.71, 0.70) * ${k(u0)});
  float golfMicro = 0.5 * sin(golfMicroPhase) + 0.5 * sin(dot(golfP, vec2(-0.44, 0.90) * ${k(u1)}) + 0.7);
  float golfMicroVisible = 1.0 - smoothstep(${fade0.toFixed(3)}, ${fade1.toFixed(3)}, fwidth(golfMicroPhase));
  golfMicro *= golfMicroVisible * (golfGreen ? ${greenMicro} : 1.0);
  diffuseColor.rgb *= 1.0 + golfMacro * ${macroAmp} * golfTurfWeight + golfMicro * ${microAmp} * golfTurfWeight;
  // §37–39 render-only bunker bowl/lip shade from the offset alone (no field
  // atlas or analytic gradient reaches the shader yet — Task 9/10 replace this).
  if (golfBunker) {
    float golfDepthShade = clamp(-vGolfV2Offset / ${norm.depthM.toFixed(3)}, 0.0, 1.0) * ${norm.floorShade.toFixed(4)};
    float golfLipLighten = clamp(vGolfV2Offset / ${norm.lipM.toFixed(3)}, 0.0, 1.0) * ${norm.lipLighten.toFixed(3)};
    diffuseColor.rgb *= 1.0 - golfDepthShade;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), golfLipLighten);
  }
}`;
  const fragmentRoughness = `roughnessFactor = vGolfV2Roughness;`;
  return { vertexHead, vertexMain, fragmentHead, fragmentColor, fragmentRoughness };
}
