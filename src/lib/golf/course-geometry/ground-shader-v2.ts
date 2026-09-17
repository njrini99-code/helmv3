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
 * screen-space or time-varying computation.
 *
 * Task 11 follow-up (first hole-7 capture): the per-vertex class above is
 * exactly what makes a bunker's sand edge fan into spikes. A bunker ring
 * topology (bunker-display-mesh.ts) carries turf and sand vertices on the
 * same long ribbon triangle, and a straight GPU colour interpolation between
 * them draws the 50% boundary as that triangle's own chord, not the true
 * curved outline — the chord fans out wherever the ribbon runs long or the
 * outline curves. Field-atlas SDFs (field-atlas.ts, Task 10) exist
 * independently of this triangulation and stay accurate at sub-triangle
 * resolution, so `classifySurfaceFromAtlas` below (and its GLSL mirror in
 * `groundShaderV2Chunks`'s `#ifdef GOLF_V2_ATLAS` block) reclassifies every
 * fragment from the green/bunker/fairway/water SDFs plus a derived
 * fringe/apron collar (§27–33) at the fragment's own world position, with a
 * soft edge sized by the plan's own edge-band widths (§28 green edge, §39
 * bunker lip band, §46 fairway edge SDF) rather than by whatever triangle
 * happens to cross the boundary. It only overrides a fragment whose *vertex*
 * class is itself one the atlas tracks (`GROUND_ATLAS_TRACKED_CLASSES`) —
 * classes the atlas has no SDF for (woods, tee, surround, ground, rough, …)
 * keep exactly today's vertex-colour behaviour, atlas or not, so a woods
 * edge next to a fairway cannot be repainted with fairway colour by a
 * boundary it was never told about. Where no atlas was compiled for the
 * hole (or the compile failed — a hole with a degenerate bounding box), the
 * material never sets `GOLF_V2_ATLAS` and this file's original vertex-colour
 * path is the only path — the fallback the class comment above describes. */
import { FAIRWAY_DIRECTION_UNIFORMS, fairwayDirectionShaderChunk, fairwayGrainAt, type FairwayDirectionField } from './fairway-direction-field';
import { sampleFieldAtlas } from './field-atlas';
import type { SurfaceDistanceLayer } from './surface-distance-field';
import { SURFACE_CLASS_IDS, type SurfaceClass } from './visual-artifact';
import type { PackedFieldAtlas } from './visual-artifact-v2';
import { hexToRgb, MERIDIAN_STYLE, srgbToLinear, type MeridianPaletteKey, type MeridianStyle } from './visual-style';

// Task 12 wiring bumped the shader structure (GOLF_V2_FAIRWAY, below) — a
// genuine program-shape change (§77 permits this in `customProgramCacheKey`,
// same as `GOLF_V2_ATLAS` before it), so the version string changes too.
export const GROUND_SHADER_V2_VERSION = 'meridian-ground-v2-4';

/** Attribute names the component layer must upload on every V2 ground
 * geometry (base and hero patches alike, so the one material fits both). */
export const GROUND_V2_ATTRIBUTES = Object.freeze({
  surfaceClass: 'golfV2Class',
  /** Metres; the render-only bunker bowl/lip offset (0 elsewhere). */
  visualOffset: 'golfV2Offset',
  roughness: 'golfV2Roughness',
  /** 1 when this vertex's own class is one the field atlas can classify
   * (`GROUND_ATLAS_TRACKED_CLASSES`), 0 otherwise. Interpolated like every
   * other attribute, so a ribbon triangle with one tracked and one untracked
   * corner only lets the atlas override the half of the triangle nearer the
   * tracked corner — the untracked corner's own neighbourhood keeps its
   * vertex colour regardless of what the atlas would say there. */
  atlasTrust: 'golfV2AtlasTrust',
});
/** Classes the field atlas can classify (the four tracked SDF layers plus
 * the derived fringe/apron collar); anything else — woods, tee, surround,
 * ground, rough and the context ground-zone classes — has no SDF and always
 * keeps its baked vertex colour, atlas or not (see `atlasTrust` above). */
export const GROUND_ATLAS_TRACKED_CLASSES: ReadonlySet<SurfaceClass> = new Set<SurfaceClass>(['green', 'bunker', 'fairway', 'water', 'fringe', 'surround']);
/** The field atlas's tracked SDF layers this shader actually samples, and
 * the RGBA channel order `three-world-v2.ts` must pack them into (path is
 * left out: cart paths render as their own hero ribbon, not a ground class). */
export const GROUND_SDF_ATLAS_LAYERS: readonly SurfaceDistanceLayer[] = ['green', 'bunker', 'fairway', 'water'];

/** Task 12 wiring: the binding contract `three-world-v2.ts` must satisfy for
 * `groundShaderV2Chunks`'s `GOLF_V2_FAIRWAY` block — fairway-direction-
 * field.ts's own `fairwayDirectionShaderChunk` GLSL, spliced in unmodified —
 * to compile and sample correctly. `sampler`/`frame`/`texelM` are re-exports
 * of that module's own `FAIRWAY_DIRECTION_UNIFORMS` (its GLSL text declares
 * all three uniforms itself; nothing here re-declares or renames them) so
 * the two modules can never drift out of agreement about what the compiled
 * program actually expects — deliberately NOT the shorter `golfV2Fairway` /
 * `golfV2FairwayFrame` names an earlier version of this task's brief guessed
 * at, before the field module's real GLSL existed to read.
 *
 * `encode` mirrors `buildGroundSdfTexture`'s own DataTexture convention
 * (three-world-v2.ts) wherever the two agree, and calls out the two places
 * they must not, because this layer is a direct per-node grid rather than a
 * pre-resampled atlas:
 *   - the frame needs the texel-CENTRE half-spacing nudge fairway-direction-
 *     field.ts's own header spells out (`frame.xy = originM - 0.5*spacingM`,
 *     not the atlas's own already-nudged `boundsM`), and a separate texelM
 *     uniform the SDF texture has no equivalent of;
 *   - an odd `columns` (the metric grid's own `floor(...) + 1`) leaves each
 *     row's byte length (`columns * 2`, one R+G byte pair per texel) not a
 *     multiple of 4, so WebGL's default 4-byte row alignment would skew
 *     every row after the first; the RGBA SDF texture never hits this
 *     (4 bytes/texel is always aligned) so `buildGroundSdfTexture` has no
 *     precedent for it. */
/** Task 16/21 wiring: the baked static shadow field (`static-shadow-field.ts`
 * `staticShadowLayer`, R8, 255 = lit) as one LinearFilter texture whose
 * frame is nudged by half a node like the fairway field's (a node's value
 * sits at its centre). `three-world-v2.ts` sets the define and binds both. */
export const STATIC_SHADOW_BINDING = Object.freeze({
  define: 'GOLF_V2_SHADOW',
  sampler: 'golfV2StaticShadow',
  frame: 'golfV2StaticShadowFrame',
} as const);

export const FAIRWAY_GRAIN_BINDING = Object.freeze({
  define: 'GOLF_V2_FAIRWAY',
  sampler: FAIRWAY_DIRECTION_UNIFORMS.sampler,
  frame: FAIRWAY_DIRECTION_UNIFORMS.frame,
  texelM: FAIRWAY_DIRECTION_UNIFORMS.texelM,
  encode: 'new THREE.DataTexture(fairwayDirectionLayer(field).values, field.columns, field.rows, THREE.RGFormat, '
    + 'THREE.UnsignedByteType); magFilter = minFilter = THREE.NearestFilter (never Linear: both channels wrap, mod '
    + 'π / mod 1 — bilinear across the seam is a visible streak, fairway-direction-field.ts file header); '
    + 'generateMipmaps = false; wrapS = wrapT = THREE.ClampToEdgeWrapping (matches buildGroundSdfTexture); '
    + 'unpackAlignment = 1 (RG8 rows are not 4-byte aligned when columns is odd — see this constant\'s own '
    + 'header). frame = vec4(originM[0] - 0.5*spacingM, originM[1] - 0.5*spacingM, 1/(columns*spacingM), '
    + '1/(rows*spacingM)) — NOT boundsM like golfV2SdfFrame. texelM = vec2(spacingM, spacingM).',
} as const);

/** CPU mirror of the one GLSL line `groundShaderV2Chunks` emits under
 * `GOLF_V2_FAIRWAY` to blend the mow-grain into the fragment's albedo —
 * `diffuseColor.rgb *= mix(1.0, golfFwGrain.x, golfFwWeight)` — where
 * `golfFwGrain` is fairway-direction-field.ts's own `golfV2FairwayGrain`
 * (mirrored on the CPU by that module's `fairwayGrainAt`, reused here
 * unchanged) and `golfFwWeight` is the field atlas's own fairway soft-edge
 * weight (`classifySurfaceFromAtlas`'s `weight` when `surfaceClass ===
 * 'fairway'`) — never a duplicate of that edge, per the field module's own
 * "deliberately out of scope" note on edge fade. `weight` defaults to 1 (the
 * unfaded value) so a caller with no atlas handy can still probe the raw
 * on/off factor. Returns exactly 1 at `weight = 0` (no visible effect) and
 * off-fairway or inactive nodes (`fairwayGrainAt`'s own neutral `albedo: 1`),
 * regardless of `weight`. */
export function fairwayGrainFactorAt(field: FairwayDirectionField, x: number, y: number, viewDir: readonly [number, number, number], weight = 1): number {
  const { albedo } = fairwayGrainAt(field, x, y, viewDir);
  return 1 + weight * (albedo - 1);
}

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

/** Per-class soft-edge width for the atlas SDF classification below, metres
 * — reused from the numbers visual-style.ts already carries for the
 * mesh-based lip/edge effects rather than invented for this task: §28 green
 * edge (`greenComplex.edgeFieldM`, also the fringe/apron collar's own width
 * — a narrow cut-height band, not a full realistic fringe strip), §39
 * bunker lip/edge band (`bunker.lipBandM`), §46 fairway edge SDF
 * (`fairwayEdge.fieldM`). No plan section names a water edge width yet, so
 * water reuses the green-edge softness rather than inventing one. */
/** Width of each tracked class's soft edge, centred on its true outline.
 * Green, fringe, bunker and water edges are crisp in the authored style
 * (V1 cuts them as 0.2 m mesh rings), so their band is only an anti-alias
 * width; the fairway (and its surround) keeps the style's mown-transition
 * field, the one edge that reads as a blend. */
const CRISP_EDGE_BAND_M = 0.12;
function edgeBandsM(style: MeridianStyle): Record<'green' | 'fringe' | 'bunker' | 'fairway' | 'water', number> {
  return {
    green: CRISP_EDGE_BAND_M, fringe: CRISP_EDGE_BAND_M,
    bunker: CRISP_EDGE_BAND_M, fairway: style.fairwayEdge.fieldM, water: CRISP_EDGE_BAND_M,
  };
}
/** Largest of the per-class soft-edge bands above (`edgeBandsM`) — the
 * margin `three-world-v2.ts` pads around the whole-hole atlas's own bounds
 * (the hole's tactical/hero-patch bounds, plan §17) so a fragment sitting
 * right at that boundary still finds its *entire* soft-edge band inside the
 * atlas, rather than being clamped to whatever the edge texel says
 * (`ClampToEdgeWrapping`). */
export function maxGroundEdgeBandM(style: MeridianStyle = MERIDIAN_STYLE): number {
  return Math.max(...Object.values(edgeBandsM(style)));
}
/** Clamped Hermite smoothstep (GLSL's own definition), 0 at/below `lo`, 1 at/above `hi`. */
function smoothstepEdge(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

export type GroundAtlasClass = 'green' | 'bunker' | 'fairway' | 'water' | 'fringe' | 'surround' | 'rough';
export interface GroundAtlasClassification {
  surfaceClass: GroundAtlasClass;
  /** 0 at the losing edge of `surfaceClass`'s own soft-edge band, 1 once
   * fully inside it (0.5 exactly on the true canonical boundary); 0 (and
   * `surfaceClass: 'rough'`) once nothing tracked reaches this point. */
  weight: number;
}
/** Three-free CPU mirror of the `#ifdef GOLF_V2_ATLAS` GLSL block in
 * `groundShaderV2Chunks`: classify one world point from the field atlas's
 * green/bunker/fairway/water SDFs (`sampleFieldAtlas`, already decoded to
 * metres, positive = inside — surface-distance-field.ts) plus a derived
 * fringe/apron collar, by which tracked boundary this point is nearest to
 * being inside (the same dominance rule field-atlas.ts's own
 * `compileFieldAtlas` already applies per texel for its semantic channel,
 * here continuous rather than pre-quantized). The fringe/apron collar is not
 * its own tracked SDF (§27–33: it is a derived cut-height band, not a
 * surveyed boundary), so it is built as a slab SDF over the interval
 * `[-fringeBandM, 0]` of the green distance itself, using the same
 * `min(d − lo, hi − d)` interval trick §36's own bunker SDF definition
 * generalizes to: positive (and largest at the collar's midpoint) inside the
 * band, negative inside the green or beyond the collar's outer edge, so it
 * can compete in the same dominance comparison as the four real layers
 * without ever winning over the green itself. Used by the ground shader only
 * where the fragment's own vertex class is itself tracked
 * (`GROUND_ATLAS_TRACKED_CLASSES`, `atlasTrust`); this function has no
 * vertex to gate on, so it always answers for the point given. */
export function classifySurfaceFromAtlas(atlas: PackedFieldAtlas, x: number, y: number, style: MeridianStyle = MERIDIAN_STYLE): GroundAtlasClassification {
  const bands = edgeBandsM(style);
  const dGreen = sampleFieldAtlas(atlas, 'green', x, y) ?? -Infinity;
  const dBunker = sampleFieldAtlas(atlas, 'bunker', x, y) ?? -Infinity;
  const dFairway = sampleFieldAtlas(atlas, 'fairway', x, y) ?? -Infinity;
  const dWater = sampleFieldAtlas(atlas, 'water', x, y) ?? -Infinity;
  const dFringe = Math.min(dGreen + bands.fringe, -dGreen);
  // The fairway's first-cut surround is the same kind of derived slab, over
  // `[-surroundBandM, 0]` of the fairway distance (style `fairwayEdge`).
  const dSurround = Math.min(dFairway + style.fairwayEdge.surroundBandM, -dFairway);
  const candidates: readonly (readonly [GroundAtlasClass, number, number])[] = [
    ['green', dGreen, bands.green], ['bunker', dBunker, bands.bunker], ['fairway', dFairway, bands.fairway],
    ['water', dWater, bands.water], ['fringe', dFringe, bands.fringe], ['surround', dSurround, bands.fairway],
  ];
  let best = candidates[0]!;
  for (const candidate of candidates) if (candidate[1] > best[1]) best = candidate;
  const [surfaceClass, distanceM, bandM] = best;
  const weight = smoothstepEdge(-bandM / 2, bandM / 2, distanceM);
  return weight > 0 ? { surfaceClass, weight } : { surfaceClass: 'rough', weight: 0 };
}

/** Task 11 follow-up (hero atlases, §17): the whole-hole atlas and every
 * hero patch atlas each cover their own `boundsM` independently and can
 * overlap (a hero patch's finer atlas sits "inside" the coarser whole-hole
 * one that also spans that area). `classifySurfaceFromAtlas` itself still
 * takes exactly one atlas — the GPU path never needs to choose, since each
 * mesh is simply drawn with its own atlas bound (three-world-v2.ts's
 * per-mesh `onBeforeRender`) — but a CPU caller holding several (tests,
 * debug tooling) wants whichever containing atlas has the smallest texel
 * (finest), since that is always at least as accurate as a coarser one over
 * the same point. Returns null when no given atlas contains (x, y). */
export function pickFinestAtlas(atlases: readonly PackedFieldAtlas[], x: number, y: number): PackedFieldAtlas | null {
  let best: PackedFieldAtlas | null = null, bestTexelM = Infinity;
  for (const atlas of atlases) {
    const [x0, y0, x1, y1] = atlas.boundsM;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const texelM = Math.max((x1 - x0) / atlas.width, (y1 - y0) / atlas.height);
    if (texelM < bestTexelM) { bestTexelM = texelM; best = atlas; }
  }
  return best;
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
  const { surfaceClass, visualOffset, roughness, atlasTrust } = GROUND_V2_ATTRIBUTES;
  // Task 11 follow-up: atlas SDF classification (see the file header and
  // `classifySurfaceFromAtlas`, which this GLSL block mirrors term for term).
  const bands = edgeBandsM(style);
  const atlasColorGlsl = (cls: SurfaceClass) => { const [r, g, b] = classAlbedoLinear(cls, style); return `vec3(${r.toFixed(6)}, ${g.toFixed(6)}, ${b.toFixed(6)})`; };
  const paletteGlsl = (hex: string) => { const [r, g, b] = hexToRgb(hex); return `vec3(${srgbToLinear(r).toFixed(6)}, ${srgbToLinear(g).toFixed(6)}, ${srgbToLinear(b).toFixed(6)})`; };
  // V1's authored edge ribbons (compile-course-terrain.py: a 0.2 m outer ring
  // and a 0.35 m inner ring on every played bunker and green), reproduced as
  // bands of the atlas SDF instead of mesh rings — the same look, no slivers.
  const RING_EDGE_M = 0.2, RING_LIGHT_M = 0.35, RING_SOFT_M = 0.05;
  const [g0 = .15, g1 = .35] = style.bunker.sandGrainM;
  const atlasRoughGlsl = (cls: SurfaceClass) => classRoughness(cls, style).toFixed(5);
  // Task 12 wiring: fairway-direction-field.ts's own self-contained GLSL
  // (golfV2-prefixed, declares its own sampler/frame/texelM uniforms —
  // FAIRWAY_GRAIN_BINDING) spliced in behind GOLF_V2_FAIRWAY, below.
  const fairway = fairwayDirectionShaderChunk(style);

  const vertexHead = `attribute float ${surfaceClass};
attribute float ${visualOffset};
attribute float ${roughness};
attribute float ${atlasTrust};
varying float vGolfV2Class;
varying float vGolfV2Offset;
varying float vGolfV2Roughness;
varying float vGolfV2AtlasTrust;
varying vec2 vGolfV2WorldXY;`;
  const vertexMain = `vGolfV2Class = ${surfaceClass};
vGolfV2Offset = ${visualOffset};
vGolfV2Roughness = ${roughness};
vGolfV2AtlasTrust = ${atlasTrust};
vGolfV2WorldXY = (modelMatrix * vec4(position, 1.0)).xy;`;
  const fragmentHead = `uniform vec2 golfV2Seed;
varying float vGolfV2Class;
varying float vGolfV2Offset;
varying float vGolfV2Roughness;
varying float vGolfV2AtlasTrust;
varying vec2 vGolfV2WorldXY;
#ifdef GOLF_V2_ATLAS
uniform sampler2D golfV2Sdf;
uniform vec4 golfV2SdfFrame;
vec3 golfAtlasClassColor(int golfI) {
  if (golfI == 0) return ${atlasColorGlsl('green')};
  if (golfI == 1) return ${atlasColorGlsl('bunker')};
  if (golfI == 2) return ${atlasColorGlsl('fairway')};
  if (golfI == 3) return ${atlasColorGlsl('water')};
  if (golfI == 5) return ${atlasColorGlsl('surround')};
  return ${atlasColorGlsl('fringe')};
}
float golfAtlasClassRoughness(int golfI) {
  if (golfI == 0) return ${atlasRoughGlsl('green')};
  if (golfI == 1) return ${atlasRoughGlsl('bunker')};
  if (golfI == 2) return ${atlasRoughGlsl('fairway')};
  if (golfI == 3) return ${atlasRoughGlsl('water')};
  if (golfI == 5) return ${atlasRoughGlsl('surround')};
  return ${atlasRoughGlsl('fringe')};
}
#endif
// Task 12 wiring: the fairway/tee mow-grain function. Declared independently
// of GOLF_V2_ATLAS (it has its own sampler, not the SDF one) — fragmentColor
// below only ever calls it under GOLF_V2_FAIRWAY, and only ever blends it in
// where GOLF_V2_ATLAS also classified the fragment as fairway, but the
// function/uniform declarations themselves don't need that atlas to exist.
#ifdef GOLF_V2_FAIRWAY
${fairway.glsl}
#endif
#ifdef ${STATIC_SHADOW_BINDING.define}
uniform sampler2D ${STATIC_SHADOW_BINDING.sampler};
uniform vec4 ${STATIC_SHADOW_BINDING.frame};
#endif
float golfV2ResolvedRoughness;`;
  const fragmentColor = `{
  float golfClass = vGolfV2Class;
  bool golfGreen = abs(golfClass - ${GREEN}) < 0.5;
  bool golfBunker = abs(golfClass - ${BUNKER}) < 0.5;
  bool golfWater = abs(golfClass - ${WATER}) < 0.5;
  bool golfWoods = abs(golfClass - ${WOODS}) < 0.5;
  golfV2ResolvedRoughness = vGolfV2Roughness;
#ifdef GOLF_V2_FAIRWAY
  // Sampled unconditionally (never inside an \`if\`): golfV2FairwayGrain uses
  // fwidth() internally, and derivatives inside non-uniform control flow are
  // undefined in GLSL ES. Only the blend weight below is conditional.
  // transformDirectionByInverseViewMatrix is three's own <common> helper
  // (upper-left 3x3 of viewMatrix is orthogonal, so its transpose is its
  // inverse — the standard trick, applied by three's own name for it rather
  // than hand-rolled) turning MeshStandardMaterial's own view-space
  // vViewPosition into the world-space view vector golfV2FairwayGrain wants.
  vec2 golfFwGrain = golfV2FairwayGrain(vGolfV2WorldXY, transformDirectionByInverseViewMatrix(vViewPosition, viewMatrix));
  // No SDF exists for tee (GROUND_ATLAS_TRACKED_CLASSES), so unlike fairway
  // below this can only ever be resolved from the interpolated per-vertex
  // class — and that class is unsafe to test directly here: a rough(1)-to-
  // bunker(7) or rough-to-water(8) ribbon triangle interpolates *through*
  // 3.0 (tee's own id) at some interior point with no tee anywhere nearby,
  // the same "spiky chord" hazard GOLF_V2_ATLAS exists to fix for the
  // classes that have an SDF (file header) — tee just doesn't have one to
  // fix it with. Left at 0 (no grain) until a tee SDF layer makes this safe;
  // "and tee if the field covers tee" is deliberately not done here.
  float golfFwWeight = 0.0;
#endif
#ifdef GOLF_V2_ATLAS
  // Every fragment consults the atlas; the baked vertex colour (sand-free
  // for tracked classes, see three-world-v2.ts classAttributes) is the
  // background the tracked class is painted over, so woods/tee/rough keep
  // their own colour wherever no tracked boundary is near.
  {
    vec2 golfSdfUv = (vGolfV2WorldXY - golfV2SdfFrame.xy) * golfV2SdfFrame.zw;
    vec4 golfSdf = texture2D(golfV2Sdf, golfSdfUv);
    float golfDGreen = golfSdf.r, golfDBunker = golfSdf.g, golfDFairway = golfSdf.b, golfDWaterAtlas = golfSdf.a;
    // §27–33 fringe/apron: a slab SDF over [-fringeBandM, 0] of the green
    // distance itself (the same interval trick §36's bunker SDF generalizes).
    float golfDFringe = min(golfDGreen + ${bands.fringe.toFixed(4)}, -golfDGreen);
    // The fairway's 0.6 m first-cut surround, the same slab trick over the
    // fairway distance (style fairwayEdge.surroundBandM; the canonical mesh
    // cuts the identical band as material 3, whose sliver triangles this
    // atlas-painted band replaces).
    float golfDSurround = min(golfDFairway + ${style.fairwayEdge.surroundBandM.toFixed(4)}, -golfDFairway);
    // Dominance: whichever tracked boundary this fragment is nearest to
    // being inside (field-atlas.ts's own per-texel rule, made continuous).
    int golfWin = 0; float golfWinD = golfDGreen, golfWinBand = ${bands.green.toFixed(4)};
    if (golfDBunker > golfWinD) { golfWinD = golfDBunker; golfWin = 1; golfWinBand = ${bands.bunker.toFixed(4)}; }
    if (golfDFairway > golfWinD) { golfWinD = golfDFairway; golfWin = 2; golfWinBand = ${bands.fairway.toFixed(4)}; }
    if (golfDWaterAtlas > golfWinD) { golfWinD = golfDWaterAtlas; golfWin = 3; golfWinBand = ${bands.water.toFixed(4)}; }
    if (golfDFringe > golfWinD) { golfWinD = golfDFringe; golfWin = 4; golfWinBand = ${bands.fringe.toFixed(4)}; }
    if (golfDSurround > golfWinD) { golfWinD = golfDSurround; golfWin = 5; golfWinBand = ${bands.fairway.toFixed(4)}; }
    // Soft edge (§28 green edge / §39 bunker lip band / §46 fairway edge
    // SDF): 0 at the losing edge of the winner's own band, 1 once fully
    // inside it, straddling the true SDF boundary symmetrically for
    // anti-aliasing — the plan's §46 formula instead fades one-sided from an
    // already-crisp edge; this is what makes the edge crisp in the first
    // place, so the two are deliberately different shapes over the same idea.
    float golfWeight = clamp(golfWinD / golfWinBand + 0.5, 0.0, 1.0);
    golfWeight = golfWeight * golfWeight * (3.0 - 2.0 * golfWeight);
#ifdef GOLF_V2_FAIRWAY
    // Reuse the fairway SDF's own soft edge rather than invent a second one
    // (fairway-direction-field.ts's own "deliberately out of scope" note).
    if (golfWin == 2) golfFwWeight = golfWeight;
#endif
    vec3 golfAtlasCol = golfAtlasClassColor(golfWin);
    // Sand grain (§31), evaluated unconditionally: fwidth() is undefined
    // inside a divergent branch, so only its use below is branched.
    vec2 golfSandP = vGolfV2WorldXY + golfV2Seed;
    float golfGrainPhase = dot(golfSandP, vec2(0.83, 0.56) * ${k(g0)});
    float golfGrain = 0.5 * sin(golfGrainPhase) + 0.5 * sin(dot(golfSandP, vec2(-0.37, 0.93) * ${k(g1)}) + 1.1);
    golfGrain *= 1.0 - smoothstep(${fade0.toFixed(3)}, ${fade1.toFixed(3)}, fwidth(golfGrainPhase));
    if (golfWin == 1) {
      // Sand: V1's sandEdge ring (0–0.2 m inside the outline) then its
      // sandHighlight ring (0.2–0.55 m), V1's boundary sand shade over the
      // same edge field, and the floor's grain/macro fields (§31).
      float golfRingEdge = 1.0 - smoothstep(${(RING_EDGE_M - RING_SOFT_M).toFixed(3)}, ${(RING_EDGE_M + RING_SOFT_M).toFixed(3)}, golfDBunker);
      float golfRingLight = smoothstep(${(RING_EDGE_M - RING_SOFT_M).toFixed(3)}, ${(RING_EDGE_M + RING_SOFT_M).toFixed(3)}, golfDBunker)
        * (1.0 - smoothstep(${(RING_EDGE_M + RING_LIGHT_M - RING_SOFT_M).toFixed(3)}, ${(RING_EDGE_M + RING_LIGHT_M + RING_SOFT_M).toFixed(3)}, golfDBunker));
      golfAtlasCol = mix(golfAtlasCol, ${paletteGlsl(style.palette.sandEdge)}, golfRingEdge);
      golfAtlasCol = mix(golfAtlasCol, ${paletteGlsl(style.palette.sandHighlight)}, golfRingLight);
      golfAtlasCol *= 1.0 - ${style.boundary.sandShade.toFixed(4)} * (1.0 - smoothstep(0.0, ${style.boundary.fieldM.toFixed(3)}, golfDBunker));
      golfAtlasCol *= 1.0 + golfGrain * ${style.bunker.sandGrainAmplitude.toFixed(4)};
    } else if (golfWin == 0) {
      // Green: V1's 0.2 m edge ring (toward ground) and 0.35 m light ring.
      float golfRingEdge = 1.0 - smoothstep(${(RING_EDGE_M - RING_SOFT_M).toFixed(3)}, ${(RING_EDGE_M + RING_SOFT_M).toFixed(3)}, golfDGreen);
      float golfRingLight = smoothstep(${(RING_EDGE_M - RING_SOFT_M).toFixed(3)}, ${(RING_EDGE_M + RING_SOFT_M).toFixed(3)}, golfDGreen)
        * (1.0 - smoothstep(${(RING_EDGE_M + RING_LIGHT_M - RING_SOFT_M).toFixed(3)}, ${(RING_EDGE_M + RING_LIGHT_M + RING_SOFT_M).toFixed(3)}, golfDGreen));
      golfAtlasCol = mix(golfAtlasCol, ${atlasColorGlsl('ground')}, golfRingEdge * 0.24);
      golfAtlasCol = mix(golfAtlasCol, ${paletteGlsl('#D5DEA9')}, golfRingLight * 0.1);
    }
    // The vertex colour is the background: tracked-class vertices bake the
    // rough albedo when an atlas paints them, so nothing sand- or
    // green-tinted can leak in from outside the true outline.
    diffuseColor.rgb = mix(diffuseColor.rgb, golfAtlasCol, golfWeight);
    // §37 contact shade (V1 bunker.contactBandM/contactShade): the sand and
    // the turf beside it darken toward the rim, the lip's own shadow.
    float golfContact = 1.0 - clamp(abs(golfDBunker) / ${style.bunker.contactBandM.toFixed(3)}, 0.0, 1.0);
    diffuseColor.rgb *= 1.0 - ${style.bunker.contactShade.toFixed(4)} * golfContact * golfContact;
    golfV2ResolvedRoughness = mix(vGolfV2Roughness, golfAtlasClassRoughness(golfWin), golfWeight);
    if (golfWeight > 0.5) { golfGreen = golfWin == 0; golfBunker = golfWin == 1; golfWater = golfWin == 3; }
  }
#endif
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
#ifdef GOLF_V2_FAIRWAY
  // §43–44 fairway/tee mow-grain, after the class (golfWin) and its soft
  // edge (golfWeight -> golfFwWeight) are both resolved above: 0 at the
  // losing edge of the fairway SDF band (no visible effect), 1 once fully
  // inside it — the same shape classifySurfaceFromAtlas's own weight has.
  diffuseColor.rgb *= mix(1.0, golfFwGrain.x, golfFwWeight);
  golfV2ResolvedRoughness = clamp(golfV2ResolvedRoughness + golfFwGrain.y * golfFwWeight, 0.0, 1.0);
#endif
  // §37–39 render-only bunker bowl/lip shade from the offset alone (no field
  // atlas or analytic gradient reaches the shader yet — Task 9/10 replace this).
#ifdef ${STATIC_SHADOW_BINDING.define}
  // §68/§71 baked static shadow (terrain self-shadow × canopy cast shadow,
  // bilinear over the node grid): darkens the ground where the sun is
  // blocked, art-directed strength, never moving any Z.
  float golfStaticLit = texture2D(${STATIC_SHADOW_BINDING.sampler}, (vGolfV2WorldXY - ${STATIC_SHADOW_BINDING.frame}.xy) * ${STATIC_SHADOW_BINDING.frame}.zw).r;
  diffuseColor.rgb *= 1.0 - ${style.canopyShade.staticShadow.toFixed(4)} * (1.0 - golfStaticLit);
#endif
  // The raised grass lip (positive offset, turf side of the rim) catches
  // light: brighten it in place rather than wash it toward white, and only a
  // quarter as much where the interpolated offset bleeds onto the sand edge
  // (the sand rings above already carry the sand's own rim).
  float golfLipLighten = clamp(vGolfV2Offset / ${norm.lipM.toFixed(3)}, 0.0, 1.0) * ${norm.lipLighten.toFixed(3)};
  diffuseColor.rgb *= 1.0 + golfLipLighten * (golfBunker ? 0.25 : 0.6);
  if (golfBunker) {
    float golfDepthShade = clamp(-vGolfV2Offset / ${norm.depthM.toFixed(3)}, 0.0, 1.0) * ${norm.floorShade.toFixed(4)};
    diffuseColor.rgb *= 1.0 - golfDepthShade;
  }
}`;
  const fragmentRoughness = `roughnessFactor = golfV2ResolvedRoughness;`;
  return { vertexHead, vertexMain, fragmentHead, fragmentColor, fragmentRoughness };
}
