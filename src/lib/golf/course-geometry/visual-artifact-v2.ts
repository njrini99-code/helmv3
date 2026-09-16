/** Meridian V2 display world contract (V2 plan §105–108).
 *
 * A `MeridianVisualArtifactV2` is the precompiled display world for one
 * hole: base display LODs, hero patches, field atlases and object sets, all
 * derived from the hash-locked canonical package + terrain + context layer
 * and the frozen style. It sits beside the immutable canonical model and
 * never replaces it: nothing here feeds picking, framing, reconstruction,
 * lie truth or shot metrics (constraints 1, 3–6). Every packed mesh names
 * what it was derived from (`basis`), and interpolated display geometry is
 * never described as measured detail (constraint 16; §6 source pyramid:
 * S1 interpolates S0, S2 exists only when a finer source really does, V is
 * visual-only). The artifact keys on canonical package hash + terrain hash +
 * context layer hash + style hash, and the renderer refuses
 * (MERIDIAN_ARTIFACT_MISMATCH) any artifact whose keys, structure or packed
 * bytes disagree with the scene in front of it. V1 (`visual-artifact.ts`)
 * is untouched and remains the production/fallback path. */
import { z } from 'zod';
import type { TerrainMesh } from './terrain';
import type { HoleScene } from './types';
import { decodeBase64LE, encodeBase64LE, fnvBytes, MERIDIAN_CODES, SURFACE_CLASS_IDS } from './visual-artifact';
import { MERIDIAN_STYLE, styleHash, type MeridianStyle } from './visual-style';

export const MERIDIAN_VISUAL_COMPILER_V2_VERSION = 'meridian-visual-compiler-v2-1';

export const HERO_PATCH_KINDS = ['green_complex', 'bunker', 'path', 'water_edge', 'landing_edge', 'structure_pad'] as const;
export type HeroPatchKind = typeof HERO_PATCH_KINDS[number];
/** §107: where a hero patch's vertices came from. `interpolated_canonical`
 * densifies the canonical raster (S1); `higher_resolution_source` is real S2
 * detail and needs a listed source; `visual_only_deformation` is V. */
export const HERO_PATCH_BASES = ['interpolated_canonical', 'higher_resolution_source', 'visual_only_deformation'] as const;
export type HeroPatchBasis = typeof HERO_PATCH_BASES[number];
/** Field atlas texels never exceed the metric grid's own cap (terrain-source.ts). */
export const MAX_FIELD_ATLAS_SIZE = 4096;

/** A terrain source finer than the canonical raster (§6 level S2), listed
 * only when it exists and was used. Peek'n Peak has none: its metric grid is
 * USGS 3DEP 1 m resampled to 2 m, so `highResolutionTerrainSources` is `[]`. */
export interface SourceRef {
  provider: string;
  title: string;
  url: string;
  nativeResolutionM: number;
  acquisitionStart: string;
  acquisitionEnd: string;
}
/** One base display LOD (§106): the canonical terrain interpolated, never
 * re-measured, into an indexed mesh. lod0 is the finest. */
export interface PackedDisplayMesh {
  basis: 'interpolated_canonical';
  /** xyz per vertex, metres, in the hole's local frame. */
  positions: Float32Array;
  indices: Uint32Array;
  /** Per triangle: index into the terrain mesh's `featureIds`. */
  triangleFeatures: Uint16Array;
  /** Per vertex: index into SURFACE_CLASS_IDS (visual-artifact.ts). */
  surfaceClass: Uint8Array;
  vertexCount: number;
  triangleCount: number;
  /** Hero regions (Task 6): base triangles come first, then one contiguous
   * run per region, so drawing `[0, ranges[0].start)` shows the base with
   * every patch footprint excluded, and the full buffer shows the base
   * covering the footprints too (the no-patch fallback). */
  heroRanges?: HeroRange[];
}
/** A hero region's triangle run inside a base LOD's index buffer. */
export interface HeroRange { id: string; start: number; count: number }
/** §107. `positions` are the display vertices `basis` describes;
 * `canonicalHeightReference` is the canonical (S0) height under each vertex
 * and `visualOffsetMm` the render-only (V) offset above it, so canonical and
 * display can always be shown apart. `edgeErrorMaxM` is the largest distance
 * between the patch rim and the canonical boundary it follows (§15). */
export interface PackedHeroPatch {
  id: string;
  kind: HeroPatchKind;
  boundsM: [number, number, number, number];
  basis: HeroPatchBasis;
  positions: Float32Array;
  indices: Uint32Array;
  canonicalHeightReference: Float32Array;
  visualOffsetMm: Int16Array;
  edgeErrorMaxM: number;
}
/** §108. Source-derived shading fields over `boundsM`, four channels per
 * texel: relief (half floats), bent normal / sky visibility and semantic
 * weights (bytes), plus optional named signed-distance layers, one Uint16
 * texel per layer. Everything here shades; nothing is picked or measured. */
export interface PackedFieldAtlas {
  width: number;
  height: number;
  boundsM: [number, number, number, number];
  reliefRGBA16F: Uint16Array;
  bentRGBA8: Uint8Array;
  semanticRGBA8: Uint8Array;
  sdfLayers?: { layerNames: string[]; data: Uint16Array };
  basis: 'source_derived_visual';
}
/** A hero patch's own atlas, keyed by the patch it shades. */
export interface PackedHeroField { patchId: string; atlas: PackedFieldAtlas }
/** Object sets are typed placeholders until their compilers land; each
 * carries its own digest of `items`, which the artifact digest does not cover. */
export interface PackedObjectSet { basis: string; count: number; contentHash: string; items: unknown[] }
/** Filled by Task 15 (forest edge V2). */
export type PackedVegetationSet = PackedObjectSet;
/** Filled by Task 17 (structure GLB pipeline). */
export type PackedStaticObjectSet = PackedObjectSet;
/** Filled by Task 14 (cart-path hero ribbon). */
export type PackedRibbonSet = PackedObjectSet;
/** An object set no compiler has filled yet. */
export function emptyPackedSet(basis: string): PackedObjectSet {
  return { basis, count: 0, contentHash: fnvBytes([]), items: [] };
}

export interface MeridianVisualArtifactV2 {
  schemaVersion: 2;
  kind: 'meridian_visual_artifact_v2';
  compilerVersion: string;
  canonicalPackageHash: string;
  terrainHash: string;
  physicalHoleKey: string;
  /** Context layer the fields were painted from (null when the scene carried none). */
  contextLayerHash: string | null;
  styleHash: string;
  meshes: {
    base: { lod0: PackedDisplayMesh; lod1: PackedDisplayMesh; lod2: PackedDisplayMesh };
    heroPatches: PackedHeroPatch[];
  };
  fields: { wholeHole: PackedFieldAtlas; heroes: PackedHeroField[] };
  objects: { vegetation: PackedVegetationSet; structures: PackedStaticObjectSet; ribbons: PackedRibbonSet };
  /** §7: the canonical source stays the physical ground truth; display
   * geometry interpolates it at `displayGridSpacingM` from a source whose
   * native resolution is `sourceResolutionM` (2 m from 1 m for Peek'n Peak). */
  provenance: {
    canonicalBasis: 'source_backed';
    displayBasis: 'derived_visual';
    highResolutionTerrainSources: SourceRef[];
    sourceResolutionM: number;
    displayGridSpacingM: number;
  };
  /** §106 plus download size: `downloadBytes` is the serialized JSON size the
   * build script measured (self-referential to within a few digits, so a gate
   * for Task 25, never a checksum) and `gzipBytesEstimate` its gzip size, null
   * until measured. */
  budget: {
    trianglesByClass: Record<string, number>;
    geometryBytes: number;
    textureBytesEstimate: number;
    expectedDrawCalls: number;
    downloadBytes: number;
    gzipBytesEstimate: number | null;
  };
  /** FNV-1a over every packed typed array in `packedViews` order. */
  contentHash: string;
}

// Wire shape: JSON with every typed array as little-endian base64 (V1's
// encoding). Zod validates the wire, then the arrays are decoded and the
// structure and digest checked in code, as terrain.ts does for the mesh.
const packed = z.string().max(64_000_000);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative();
const boundsM = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
const heroRangeWire = z.object({ id: z.string().min(1).max(160), start: count, count: z.number().int().min(1) });
const displayMeshWire = z.object({
  basis: z.literal('interpolated_canonical'), vertexCount: z.number().int().min(3), triangleCount: z.number().int().min(1),
  positions: packed, indices: packed, triangleFeatures: packed, surfaceClass: packed,
  heroRanges: z.array(heroRangeWire).max(256).optional(),
});
const heroPatchWire = z.object({
  id: z.string().min(1).max(160), kind: z.enum(HERO_PATCH_KINDS), boundsM, basis: z.enum(HERO_PATCH_BASES), edgeErrorMaxM: z.number().finite().nonnegative(),
  positions: packed, indices: packed, canonicalHeightReference: packed, visualOffsetMm: packed,
});
const fieldAtlasWire = z.object({
  width: z.number().int().min(1).max(MAX_FIELD_ATLAS_SIZE), height: z.number().int().min(1).max(MAX_FIELD_ATLAS_SIZE), boundsM, basis: z.literal('source_derived_visual'),
  reliefRGBA16F: packed, bentRGBA8: packed, semanticRGBA8: packed,
  sdfLayers: z.object({ layerNames: z.array(z.string().min(1).max(100)).min(1).max(16), data: packed }).optional(),
});
const objectSetWire = z.object({ basis: z.string().min(1).max(100), count, contentHash: z.string().min(1).max(100), items: z.array(z.unknown()) });
const sourceRefWire = z.object({
  provider: z.string().min(1).max(100), title: z.string().max(300), url: z.string().url().max(2000), nativeResolutionM: z.number().positive(),
  acquisitionStart: z.string().max(20), acquisitionEnd: z.string().max(20),
});
const wireSchema = z.object({
  schemaVersion: z.literal(2), kind: z.literal('meridian_visual_artifact_v2'), encoding: z.literal('base64-le'),
  compilerVersion: z.string().min(1).max(100), canonicalPackageHash: sha256, terrainHash: sha256, physicalHoleKey: z.string().min(1).max(100),
  contextLayerHash: sha256.nullable(), styleHash: z.string().min(1).max(100),
  meshes: z.object({ base: z.object({ lod0: displayMeshWire, lod1: displayMeshWire, lod2: displayMeshWire }), heroPatches: z.array(heroPatchWire).max(512) }),
  fields: z.object({ wholeHole: fieldAtlasWire, heroes: z.array(z.object({ patchId: z.string().min(1).max(160), atlas: fieldAtlasWire })).max(512) }),
  objects: z.object({ vegetation: objectSetWire, structures: objectSetWire, ribbons: objectSetWire }),
  provenance: z.object({
    canonicalBasis: z.literal('source_backed'), displayBasis: z.literal('derived_visual'), highResolutionTerrainSources: z.array(sourceRefWire).max(16),
    sourceResolutionM: z.number().positive(), displayGridSpacingM: z.number().positive(),
  }),
  budget: z.object({
    trianglesByClass: z.record(z.string().max(100), count), geometryBytes: count, textureBytesEstimate: count, expectedDrawCalls: count,
    downloadBytes: count, gzipBytesEstimate: count.nullable(),
  }),
  contentHash: z.string().regex(/^[a-f0-9]{8}$/),
});
type WireArtifact = z.infer<typeof wireSchema>;

const packMesh = (m: PackedDisplayMesh): WireArtifact['meshes']['base']['lod0'] => ({
  basis: m.basis, vertexCount: m.vertexCount, triangleCount: m.triangleCount,
  positions: encodeBase64LE(m.positions), indices: encodeBase64LE(m.indices), triangleFeatures: encodeBase64LE(m.triangleFeatures), surfaceClass: encodeBase64LE(m.surfaceClass),
  ...(m.heroRanges ? { heroRanges: m.heroRanges.map(r => ({ ...r })) } : {}),
});
const packPatch = (p: PackedHeroPatch): WireArtifact['meshes']['heroPatches'][number] => ({
  id: p.id, kind: p.kind, boundsM: p.boundsM, basis: p.basis, edgeErrorMaxM: p.edgeErrorMaxM,
  positions: encodeBase64LE(p.positions), indices: encodeBase64LE(p.indices), canonicalHeightReference: encodeBase64LE(p.canonicalHeightReference), visualOffsetMm: encodeBase64LE(p.visualOffsetMm),
});
const packAtlas = (a: PackedFieldAtlas): WireArtifact['fields']['wholeHole'] => ({
  width: a.width, height: a.height, boundsM: a.boundsM, basis: a.basis,
  reliefRGBA16F: encodeBase64LE(a.reliefRGBA16F), bentRGBA8: encodeBase64LE(a.bentRGBA8), semanticRGBA8: encodeBase64LE(a.semanticRGBA8),
  ...(a.sdfLayers ? { sdfLayers: { layerNames: a.sdfLayers.layerNames, data: encodeBase64LE(a.sdfLayers.data) } } : {}),
});
const packSet = (set: PackedObjectSet): WireArtifact['objects']['vegetation'] => ({ basis: set.basis, count: set.count, contentHash: set.contentHash, items: set.items });
const packSource = (source: SourceRef): WireArtifact['provenance']['highResolutionTerrainSources'][number] => ({
  provider: source.provider, title: source.title, url: source.url, nativeResolutionM: source.nativeResolutionM, acquisitionStart: source.acquisitionStart, acquisitionEnd: source.acquisitionEnd,
});
/** JSON with little-endian base64 typed arrays, keys in schema order (the
 * one free-form record, `trianglesByClass`, sorted): byte-identical for
 * identical artifacts however they were built. Object set `items` are
 * emitted as given; their compilers own their order. */
export function serializeVisualArtifactV2(artifact: MeridianVisualArtifactV2): string {
  const { budget } = artifact;
  const wire: WireArtifact = {
    schemaVersion: 2, kind: 'meridian_visual_artifact_v2', encoding: 'base64-le',
    compilerVersion: artifact.compilerVersion, canonicalPackageHash: artifact.canonicalPackageHash, terrainHash: artifact.terrainHash, physicalHoleKey: artifact.physicalHoleKey,
    contextLayerHash: artifact.contextLayerHash, styleHash: artifact.styleHash,
    meshes: { base: { lod0: packMesh(artifact.meshes.base.lod0), lod1: packMesh(artifact.meshes.base.lod1), lod2: packMesh(artifact.meshes.base.lod2) }, heroPatches: artifact.meshes.heroPatches.map(packPatch) },
    fields: { wholeHole: packAtlas(artifact.fields.wholeHole), heroes: artifact.fields.heroes.map(hero => ({ patchId: hero.patchId, atlas: packAtlas(hero.atlas) })) },
    objects: { vegetation: packSet(artifact.objects.vegetation), structures: packSet(artifact.objects.structures), ribbons: packSet(artifact.objects.ribbons) },
    provenance: {
      canonicalBasis: artifact.provenance.canonicalBasis, displayBasis: artifact.provenance.displayBasis, highResolutionTerrainSources: artifact.provenance.highResolutionTerrainSources.map(packSource),
      sourceResolutionM: artifact.provenance.sourceResolutionM, displayGridSpacingM: artifact.provenance.displayGridSpacingM,
    },
    budget: {
      trianglesByClass: Object.fromEntries(Object.entries(budget.trianglesByClass).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      geometryBytes: budget.geometryBytes, textureBytesEstimate: budget.textureBytesEstimate, expectedDrawCalls: budget.expectedDrawCalls, downloadBytes: budget.downloadBytes, gzipBytesEstimate: budget.gzipBytesEstimate,
    },
    contentHash: artifact.contentHash,
  };
  return JSON.stringify(wire);
}

interface PackedCtor<T> { new (buffer: ArrayBuffer): T; readonly BYTES_PER_ELEMENT: number }
function unpack<T>(path: string, text: string, Ctor: PackedCtor<T>): T {
  let bytes: Uint8Array;
  try { bytes = decodeBase64LE(text); } catch { throw new Error(`${MERIDIAN_CODES.mismatch}: ${path} is not base64`); }
  if (bytes.length % Ctor.BYTES_PER_ELEMENT) throw new Error(`${MERIDIAN_CODES.mismatch}: ${path} has a partial element`);
  // Copy into a fresh buffer so multi-byte views are aligned.
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return new Ctor(buffer);
}
const unpackMesh = (path: string, m: WireArtifact['meshes']['base']['lod0']): PackedDisplayMesh => ({
  basis: m.basis, positions: unpack(`${path}.positions`, m.positions, Float32Array), indices: unpack(`${path}.indices`, m.indices, Uint32Array),
  triangleFeatures: unpack(`${path}.triangleFeatures`, m.triangleFeatures, Uint16Array), surfaceClass: unpack(`${path}.surfaceClass`, m.surfaceClass, Uint8Array),
  vertexCount: m.vertexCount, triangleCount: m.triangleCount, ...(m.heroRanges ? { heroRanges: m.heroRanges.map(r => ({ ...r })) } : {}),
});
const unpackPatch = (path: string, p: WireArtifact['meshes']['heroPatches'][number]): PackedHeroPatch => ({
  id: p.id, kind: p.kind, boundsM: p.boundsM, basis: p.basis,
  positions: unpack(`${path}.positions`, p.positions, Float32Array), indices: unpack(`${path}.indices`, p.indices, Uint32Array),
  canonicalHeightReference: unpack(`${path}.canonicalHeightReference`, p.canonicalHeightReference, Float32Array), visualOffsetMm: unpack(`${path}.visualOffsetMm`, p.visualOffsetMm, Int16Array),
  edgeErrorMaxM: p.edgeErrorMaxM,
});
const unpackAtlas = (path: string, a: WireArtifact['fields']['wholeHole']): PackedFieldAtlas => ({
  width: a.width, height: a.height, boundsM: a.boundsM,
  reliefRGBA16F: unpack(`${path}.reliefRGBA16F`, a.reliefRGBA16F, Uint16Array), bentRGBA8: unpack(`${path}.bentRGBA8`, a.bentRGBA8, Uint8Array), semanticRGBA8: unpack(`${path}.semanticRGBA8`, a.semanticRGBA8, Uint8Array),
  ...(a.sdfLayers ? { sdfLayers: { layerNames: a.sdfLayers.layerNames, data: unpack(`${path}.sdfLayers.data`, a.sdfLayers.data, Uint16Array) } } : {}),
  basis: a.basis,
});
export function parseVisualArtifactV2(text: string): MeridianVisualArtifactV2 {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error(`${MERIDIAN_CODES.mismatch}: json`); }
  const head = raw as { kind?: unknown; schemaVersion?: unknown; encoding?: unknown } | null;
  if (!head || typeof head !== 'object' || head.kind !== 'meridian_visual_artifact_v2' || head.schemaVersion !== 2 || head.encoding !== 'base64-le') throw new Error(`${MERIDIAN_CODES.mismatch}: kind`);
  const result = wireSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(`${MERIDIAN_CODES.mismatch}: schema ${issue.path.join('.')}: ${issue.message}`);
  }
  const { encoding: _encoding, meshes, fields, ...header } = result.data;
  const artifact: MeridianVisualArtifactV2 = {
    ...header,
    meshes: {
      base: { lod0: unpackMesh('meshes.base.lod0', meshes.base.lod0), lod1: unpackMesh('meshes.base.lod1', meshes.base.lod1), lod2: unpackMesh('meshes.base.lod2', meshes.base.lod2) },
      heroPatches: meshes.heroPatches.map((patch, i) => unpackPatch(`meshes.heroPatches.${i}`, patch)),
    },
    fields: { wholeHole: unpackAtlas('fields.wholeHole', fields.wholeHole), heroes: fields.heroes.map((hero, i) => ({ patchId: hero.patchId, atlas: unpackAtlas(`fields.heroes.${i}.atlas`, hero.atlas) })) },
  };
  const problems = structuralProblems(artifact);
  if (problems.length) throw new Error(`${MERIDIAN_CODES.mismatch}: ${problems.join(',')}`);
  if (artifact.contentHash !== visualArtifactV2ContentHash(artifact)) throw new Error(`${MERIDIAN_CODES.mismatch}: content`);
  return artifact;
}

const baseLods = (artifact: Pick<MeridianVisualArtifactV2, 'meshes'>) => (['lod0', 'lod1', 'lod2'] as const).map(name => [name, artifact.meshes.base[name]] as const);
const atlases = (artifact: Pick<MeridianVisualArtifactV2, 'fields'>) =>
  [['wholeHole', artifact.fields.wholeHole] as const, ...artifact.fields.heroes.map((hero, i) => [`heroes[${i}]`, hero.atlas] as const)];
/** Every packed typed array in the digest order: base LODs (positions,
 * indices, triangle features, surface classes), hero patches in array order
 * (positions, indices, canonical heights, visual offsets), then the
 * whole-hole atlas and each hero atlas (relief, bent, semantic, SDF data when
 * present). Header numbers and the object sets are outside the digest: the
 * schema and the budget validator (Task 25) gate those. */
function packedViews(artifact: Pick<MeridianVisualArtifactV2, 'meshes' | 'fields'>): ArrayBufferView[] {
  return [
    ...baseLods(artifact).flatMap(([, lod]) => [lod.positions, lod.indices, lod.triangleFeatures, lod.surfaceClass]),
    ...artifact.meshes.heroPatches.flatMap(patch => [patch.positions, patch.indices, patch.canonicalHeightReference, patch.visualOffsetMm]),
    ...atlases(artifact).flatMap(([, atlas]) => [atlas.reliefRGBA16F, atlas.bentRGBA8, atlas.semanticRGBA8, ...(atlas.sdfLayers ? [atlas.sdfLayers.data] : [])]),
  ];
}
export function visualArtifactV2ContentHash(artifact: Pick<MeridianVisualArtifactV2, 'meshes' | 'fields'>): string {
  return fnvBytes(packedViews(artifact));
}

const exceeds = (view: ArrayLike<number>, limit: number) => { for (let i = 0; i < view.length; i++) if (view[i]! >= limit) return true; return false; };
const unordered = ([x0, y0, x1, y1]: readonly [number, number, number, number]) => !(x0 < x1 && y0 < y1);
/** Internal consistency: counts match arrays, indices address their own
 * vertices, classes and references resolve. §113's geometric checks
 * (degenerate/flipped triangles, seams, cracks, offset bounds) belong to the
 * compilers (Tasks 5–9) and the budget thresholds to Task 25. */
function structuralProblems(artifact: MeridianVisualArtifactV2): string[] {
  const problems: string[] = [];
  for (const [name, lod] of baseLods(artifact)) {
    if (lod.positions.length !== lod.vertexCount * 3 || lod.surfaceClass.length !== lod.vertexCount) problems.push(`${name} vertices`);
    if (lod.indices.length !== lod.triangleCount * 3 || lod.triangleFeatures.length !== lod.triangleCount) problems.push(`${name} triangles`);
    if (exceeds(lod.indices, lod.vertexCount)) problems.push(`${name} indices`);
    if (exceeds(lod.surfaceClass, SURFACE_CLASS_IDS.length)) problems.push(`${name} surface classes`);
    // Hero runs are disjoint, ascending and inside the buffer; ids are unique per LOD.
    let end = -1;
    const runIds = new Set<string>();
    for (const range of lod.heroRanges ?? []) {
      if (range.start < Math.max(end, 0) || range.start + range.count > lod.triangleCount || runIds.has(range.id)) { problems.push(`${name} hero ranges`); break; }
      runIds.add(range.id); end = range.start + range.count;
    }
  }
  const { lod0, lod1, lod2 } = artifact.meshes.base;
  if (lod0.triangleCount < lod1.triangleCount || lod1.triangleCount < lod2.triangleCount) problems.push('lod order');
  const ids = new Set<string>();
  artifact.meshes.heroPatches.forEach((patch, i) => {
    ids.add(patch.id);
    const vertices = patch.positions.length / 3;
    if (unordered(patch.boundsM)) problems.push(`heroPatches[${i}] bounds`);
    if (patch.positions.length % 3 || vertices < 3 || patch.canonicalHeightReference.length !== vertices || patch.visualOffsetMm.length !== vertices) problems.push(`heroPatches[${i}] vertices`);
    if (patch.indices.length % 3 || patch.indices.length < 3 || exceeds(patch.indices, vertices)) problems.push(`heroPatches[${i}] indices`);
    if (patch.basis === 'higher_resolution_source' && !artifact.provenance.highResolutionTerrainSources.length) problems.push(`heroPatches[${i}] higher_resolution_source without a source`);
  });
  if (ids.size !== artifact.meshes.heroPatches.length) problems.push('hero patch ids');
  for (const [name, atlas] of atlases(artifact)) {
    const texels = atlas.width * atlas.height;
    if (unordered(atlas.boundsM)) problems.push(`${name} bounds`);
    if (atlas.reliefRGBA16F.length !== texels * 4 || atlas.bentRGBA8.length !== texels * 4 || atlas.semanticRGBA8.length !== texels * 4) problems.push(`${name} texels`);
    if (atlas.sdfLayers && (atlas.sdfLayers.data.length !== texels * atlas.sdfLayers.layerNames.length || new Set(atlas.sdfLayers.layerNames).size !== atlas.sdfLayers.layerNames.length)) problems.push(`${name} sdf layers`);
  }
  artifact.fields.heroes.forEach((hero, i) => { if (!ids.has(hero.patchId)) problems.push(`heroes[${i}] patch`); });
  if (new Set(artifact.fields.heroes.map(hero => hero.patchId)).size !== artifact.fields.heroes.length) problems.push('hero field ids');
  for (const name of ['vegetation', 'structures', 'ribbons'] as const) {
    if (artifact.objects[name].count !== artifact.objects[name].items.length) problems.push(`${name} count`);
  }
  return problems;
}

/** The hash gate, mirroring V1's: throws MERIDIAN_ARTIFACT_MISMATCH naming
 * every way the artifact disagrees with the package, terrain, hole, style,
 * context layer or compiler in front of it, is internally inconsistent, or
 * carries packed bytes that no longer match its digest. */
export function assertVisualArtifactV2(artifact: MeridianVisualArtifactV2, scene: HoleScene, mesh: TerrainMesh, style: MeridianStyle = MERIDIAN_STYLE): void {
  const problems: string[] = [];
  if (artifact.kind !== 'meridian_visual_artifact_v2' || artifact.schemaVersion !== 2 ||
    artifact.provenance.canonicalBasis !== 'source_backed' || artifact.provenance.displayBasis !== 'derived_visual') problems.push('kind');
  if (artifact.compilerVersion !== MERIDIAN_VISUAL_COMPILER_V2_VERSION) problems.push('compiler');
  if (artifact.canonicalPackageHash !== scene.packageHash || artifact.canonicalPackageHash !== mesh.geometryHash) problems.push('package');
  if (artifact.terrainHash !== mesh.contentHash) problems.push('terrain');
  if (artifact.physicalHoleKey !== scene.physicalHoleKey || artifact.physicalHoleKey !== mesh.physicalHoleKey) problems.push('hole');
  if (artifact.styleHash !== styleHash(style)) problems.push('style');
  // Context gate (outside world §35): fields painted from another context
  // layer, or from none when the scene now carries one, are stale.
  if ((artifact.contextLayerHash ?? null) !== (scene.contextLayerHash ?? null)) problems.push('context');
  // Constraint 16: the documented canonical source resolution is the terrain's own.
  if (artifact.provenance.sourceResolutionM !== mesh.source.nativeResolutionM) problems.push('provenance');
  problems.push(...structuralProblems(artifact));
  for (const [name, lod] of baseLods(artifact)) if (exceeds(lod.triangleFeatures, mesh.featureIds.length)) problems.push(`${name} features`);
  if (artifact.contentHash !== visualArtifactV2ContentHash(artifact)) problems.push('content');
  if (problems.length) throw new Error(`${MERIDIAN_CODES.mismatch}: ${problems.join(',')}`);
}

/** Cache path beside V1's (§101 keying): site, canonical package hash and
 * style hash, under `visual-v2` so the two worlds never share a slot. */
export function visualArtifactV2CachePath(siteId: string, packageHash: string, hash: string, physicalHoleKey: string): string {
  return `geometry/${siteId}/${packageHash}/visual-v2/${hash}/${physicalHoleKey}.visual.json`;
}
