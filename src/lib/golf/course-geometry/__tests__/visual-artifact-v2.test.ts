import { describe, expect, it } from 'vitest';
import source from '@/test/fixtures/course-geometry/cacapon-07-terrain.json';
import { pilotPackage, pilotScene } from '@/test/fixtures/course-geometry/pilot';
import { parseTerrainMesh } from '../terrain';
import { MERIDIAN_CODES, SURFACE_CLASS_IDS } from '../visual-artifact';
import {
  assertVisualArtifactV2, emptyPackedSet, emptyRibbonSet, emptyVegetationSet, HERO_PATCH_BASES, HERO_PATCH_KINDS, MERIDIAN_VISUAL_COMPILER_V2_VERSION, parseVisualArtifactV2,
  serializeVisualArtifactV2, visualArtifactV2CachePath, visualArtifactV2ContentHash,
  type MeridianVisualArtifactV2, type PackedDisplayMesh, type PackedFieldAtlas, type PackedHeroPatch,
} from '../visual-artifact-v2';
import { MERIDIAN_STYLE, MERIDIAN_STYLE_HASH, styleHash } from '../visual-style';

const mesh = parseTerrainMesh(source, pilotPackage);
const scene = pilotScene('cacapon-07', false);

/** A quad (two triangles) or a single triangle, small enough to read. */
function displayMesh(triangles: 1 | 2, feature = 0): PackedDisplayMesh {
  const vertexCount = triangles === 2 ? 4 : 3;
  return {
    basis: 'interpolated_canonical',
    positions: Float32Array.from([0, 0, 100, 2, 0, 100.5, 2, 2, 101, 0, 2, 100.25].slice(0, vertexCount * 3)),
    indices: Uint32Array.from(triangles === 2 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]),
    triangleFeatures: Uint16Array.from(new Array<number>(triangles).fill(feature)),
    surfaceClass: Uint8Array.from(new Array<number>(vertexCount).fill(SURFACE_CLASS_IDS.indexOf('fairway'))),
    vertexCount, triangleCount: triangles,
  };
}
function heroPatch(id: string, overrides: Partial<PackedHeroPatch> = {}): PackedHeroPatch {
  return {
    id, kind: 'green_complex', boundsM: [0, 0, 2, 2], basis: 'interpolated_canonical',
    positions: Float32Array.from([0, 0, 100, 2, 0, 100.5, 2, 2, 101, 0, 2, 100.25]), indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    canonicalHeightReference: Float32Array.from([100, 100.5, 101, 100.25]), visualOffsetMm: Int16Array.from([0, 0, 0, 0]),
    edgeErrorMaxM: .02, ...overrides,
  };
}
function fieldAtlas(width = 2, height = 2, layers: string[] = ['green', 'bunker']): PackedFieldAtlas {
  const texels = width * height;
  return {
    width, height, boundsM: [0, 0, 2, 2],
    reliefRGBA16F: Uint16Array.from({ length: texels * 4 }, (_, i) => 0x3c00 + i), bentRGBA8: Uint8Array.from({ length: texels * 4 }, (_, i) => 128 + i),
    semanticRGBA8: Uint8Array.from({ length: texels * 4 }, (_, i) => i), sdfLayers: { layerNames: layers, data: Uint16Array.from({ length: texels * layers.length }, (_, i) => 1000 + i) },
    basis: 'source_derived_visual',
  };
}
type Unhashed = Omit<MeridianVisualArtifactV2, 'contentHash'>;
function unhashed(overrides: Partial<Unhashed> = {}): Unhashed {
  return {
    schemaVersion: 2, kind: 'meridian_visual_artifact_v2', compilerVersion: MERIDIAN_VISUAL_COMPILER_V2_VERSION,
    canonicalPackageHash: scene.packageHash, terrainHash: mesh.contentHash, physicalHoleKey: 'cacapon-07', contextLayerHash: null, styleHash: MERIDIAN_STYLE_HASH,
    meshes: { base: { lod0: displayMesh(2), lod1: displayMesh(2, 1), lod2: displayMesh(1) }, heroPatches: [heroPatch('green-complex-7')] },
    fields: { wholeHole: fieldAtlas(), heroes: [{ patchId: 'green-complex-7', atlas: fieldAtlas(1, 1, ['green']) }] },
    objects: { vegetation: emptyVegetationSet(), structures: emptyPackedSet('not_compiled'), ribbons: emptyRibbonSet() },
    provenance: { canonicalBasis: 'source_backed', displayBasis: 'derived_visual', highResolutionTerrainSources: [], sourceResolutionM: 1, displayGridSpacingM: 2 },
    budget: { trianglesByClass: { base_lod0: 2, hero_green_complex: 2 }, geometryBytes: 640, textureBytesEstimate: 96, expectedDrawCalls: 3, downloadBytes: 2048, gzipBytesEstimate: null },
    ...overrides,
  };
}
function sample(overrides: Partial<Unhashed> = {}): MeridianVisualArtifactV2 {
  const artifact = unhashed(overrides);
  return { ...artifact, contentHash: visualArtifactV2ContentHash(artifact) };
}
/** The wire JSON with one edit applied, for tamper tests. */
function edited(artifact: MeridianVisualArtifactV2, edit: (raw: Record<string, any>) => void): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const raw = JSON.parse(serializeVisualArtifactV2(artifact)) as Record<string, unknown>;
  edit(raw);
  return JSON.stringify(raw);
}
const views = (artifact: MeridianVisualArtifactV2) => [
  ...['lod0', 'lod1', 'lod2'].flatMap(lod => { const m = artifact.meshes.base[lod as 'lod0']; return [m.positions, m.indices, m.triangleFeatures, m.surfaceClass]; }),
  ...artifact.meshes.heroPatches.flatMap(p => [p.positions, p.indices, p.canonicalHeightReference, p.visualOffsetMm]),
  ...[artifact.fields.wholeHole, ...artifact.fields.heroes.map(h => h.atlas)].flatMap(a => [a.reliefRGBA16F, a.bentRGBA8, a.semanticRGBA8, ...(a.sdfLayers ? [a.sdfLayers.data] : [])]),
];

describe('Meridian V2 display artifact contract (V2 plan §105–108)', () => {
  it('parses a valid artifact and round-trips every packed array byte for byte', () => {
    const artifact = sample();
    const text = serializeVisualArtifactV2(artifact), parsed = parseVisualArtifactV2(text);
    expect(parsed.contentHash).toBe(artifact.contentHash);
    expect(parsed).toMatchObject({ schemaVersion: 2, kind: 'meridian_visual_artifact_v2', compilerVersion: MERIDIAN_VISUAL_COMPILER_V2_VERSION,
      canonicalPackageHash: scene.packageHash, terrainHash: mesh.contentHash, physicalHoleKey: 'cacapon-07', contextLayerHash: null, styleHash: MERIDIAN_STYLE_HASH,
      provenance: { canonicalBasis: 'source_backed', displayBasis: 'derived_visual', highResolutionTerrainSources: [], sourceResolutionM: 1, displayGridSpacingM: 2 },
      budget: artifact.budget });
    expect(parsed.meshes.base.lod0.basis).toBe('interpolated_canonical');
    expect(parsed.meshes.heroPatches[0]).toMatchObject({ id: 'green-complex-7', kind: 'green_complex', basis: 'interpolated_canonical', boundsM: [0, 0, 2, 2], edgeErrorMaxM: .02 });
    expect(parsed.fields.wholeHole.sdfLayers?.layerNames).toEqual(['green', 'bunker']);
    expect(parsed.fields.heroes[0]?.patchId).toBe('green-complex-7');
    const before = views(artifact), after = views(parsed);
    expect(after.length).toBe(before.length);
    before.forEach((view, i) => {
      expect(after[i]!.constructor).toBe(view.constructor);
      expect(Array.from(after[i] as ArrayLike<number>)).toEqual(Array.from(view as ArrayLike<number>));
    });
    // Nothing on the wire is an unknown encoding, and the wire is stable.
    expect((JSON.parse(text) as { encoding: string }).encoding).toBe('base64-le');
    expect(serializeVisualArtifactV2(parsed)).toBe(text);
    expect(serializeVisualArtifactV2(sample())).toBe(text);
    const reordered = sample({ budget: { ...artifact.budget, trianglesByClass: { hero_green_complex: 2, base_lod0: 2 } } });
    expect(serializeVisualArtifactV2(reordered)).toBe(text);
  });

  it('rejects malformed input with a clear MERIDIAN_ARTIFACT_MISMATCH reason', () => {
    const artifact = sample();
    expect(() => parseVisualArtifactV2('not json')).toThrow(new RegExp(`^${MERIDIAN_CODES.mismatch}: json$`));
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.kind = 'meridian_visual_artifact'; raw.schemaVersion = 1; }))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: kind/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.encoding = 'base64-be'; }))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: kind/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { delete raw.meshes; }))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: schema meshes/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.provenance.displayBasis = 'measured'; }))).toThrow(/schema provenance\.displayBasis/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.meshes.base.lod1.basis = 'higher_resolution_source'; }))).toThrow(/schema meshes\.base\.lod1\.basis/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.fields.wholeHole.basis = 'measured'; }))).toThrow(/schema fields\.wholeHole\.basis/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.meshes.base.lod0.positions = '!!notbase64'; }))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: meshes\.base\.lod0\.positions/);
    // Seven bytes is not a whole number of floats.
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.meshes.base.lod0.positions = btoa('abcdefg'); }))).toThrow(/meshes\.base\.lod0\.positions has a partial element/);
    // Internally inconsistent counts, indices and references are refused before the hash is even checked.
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.meshes.base.lod0.vertexCount = 5; }))).toThrow(/lod0 vertices/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.meshes.base.lod2.triangleCount = 2; }))).toThrow(/lod2 triangles/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.fields.wholeHole.width = 3; }))).toThrow(/wholeHole texels/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.fields.heroes[0].patchId = 'bunker-3'; }))).toThrow(/heroes\[0\] patch/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.objects.vegetation.count = 4; }))).toThrow(/vegetation count/);
    // Base LODs order from finest to coarsest.
    const noHeroes = { fields: { wholeHole: fieldAtlas(), heroes: [] } };
    const withBase = (lod0: PackedDisplayMesh, lod1 = displayMesh(2), lod2 = displayMesh(1)) => serializeVisualArtifactV2(sample({ meshes: { base: { lod0, lod1, lod2 }, heroPatches: [] }, ...noHeroes }));
    expect(() => parseVisualArtifactV2(withBase(displayMesh(1), displayMesh(2)))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: lod order$/);
    expect(() => parseVisualArtifactV2(withBase({ ...displayMesh(2), indices: Uint32Array.from([0, 1, 2, 0, 2, 9]) }))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: lod0 indices$/);
    expect(() => parseVisualArtifactV2(withBase({ ...displayMesh(2), surfaceClass: Uint8Array.from([0, 0, 0, SURFACE_CLASS_IDS.length]) }))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: lod0 surface classes$/);
    const twoPatches = sample({ meshes: { base: unhashed().meshes.base, heroPatches: [heroPatch('same'), heroPatch('same', { kind: 'bunker' })] }, ...noHeroes });
    expect(() => parseVisualArtifactV2(serializeVisualArtifactV2(twoPatches))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: hero patch ids$/);
    const withAtlas = (atlas: PackedFieldAtlas) => serializeVisualArtifactV2(sample({ fields: { wholeHole: atlas, heroes: [] } }));
    expect(() => parseVisualArtifactV2(withAtlas({ ...fieldAtlas(), boundsM: [2, 0, 0, 2] }))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: wholeHole bounds$/);
    expect(() => parseVisualArtifactV2(withAtlas(fieldAtlas(2, 2, ['green', 'green'])))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: wholeHole sdf layers$/);
    const twoFields = sample({ fields: { wholeHole: fieldAtlas(), heroes: [{ patchId: 'green-complex-7', atlas: fieldAtlas(1, 1) }, { patchId: 'green-complex-7', atlas: fieldAtlas(1, 1) }] } });
    expect(() => parseVisualArtifactV2(serializeVisualArtifactV2(twoFields))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: hero field ids$/);
    // Tampered bytes never pass the content hash.
    const flipped = new Uint8Array(artifact.meshes.base.lod2.surfaceClass); flipped[0] = SURFACE_CLASS_IDS.indexOf('rough');
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.meshes.base.lod2.surfaceClass = btoa(String.fromCharCode(...flipped)); }))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: content/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.contentHash = '00000000'; }))).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: content/);
  });

  it('makes every hash key mandatory and only the context layer nullable', () => {
    const artifact = sample();
    for (const key of ['canonicalPackageHash', 'terrainHash', 'styleHash', 'contentHash'] as const) {
      expect(() => parseVisualArtifactV2(edited(artifact, raw => { delete raw[key]; })), key).toThrow(new RegExp(`MERIDIAN_ARTIFACT_MISMATCH: schema ${key}`));
      expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw[key] = ''; })), key).toThrow(new RegExp(`MERIDIAN_ARTIFACT_MISMATCH: schema ${key}`));
      expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw[key] = null; })), key).toThrow(new RegExp(`MERIDIAN_ARTIFACT_MISMATCH: schema ${key}`));
    }
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { delete raw.contextLayerHash; }))).toThrow(/schema contextLayerHash/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.contextLayerHash = ''; }))).toThrow(/schema contextLayerHash/);
    expect(parseVisualArtifactV2(edited(artifact, raw => { raw.contextLayerHash = null; })).contextLayerHash).toBeNull();
    const withContext = sample({ contextLayerHash: 'c'.repeat(64) });
    expect(parseVisualArtifactV2(serializeVisualArtifactV2(withContext)).contextLayerHash).toBe('c'.repeat(64));
    // The object sets carry their own digest, which the schema also requires.
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { raw.objects.ribbons.contentHash = ''; }))).toThrow(/schema objects\.ribbons\.contentHash/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { delete raw.physicalHoleKey; }))).toThrow(/schema physicalHoleKey/);
    expect(() => parseVisualArtifactV2(edited(artifact, raw => { delete raw.compilerVersion; }))).toThrow(/schema compilerVersion/);
  });

  it('accepts exactly the §107 hero patch bases and kinds, and ties higher-resolution claims to a listed source', () => {
    expect(HERO_PATCH_BASES).toEqual(['interpolated_canonical', 'higher_resolution_source', 'visual_only_deformation']);
    expect(HERO_PATCH_KINDS).toEqual(['green_complex', 'bunker', 'path', 'water_edge', 'landing_edge', 'structure_pad']);
    const base = unhashed().meshes.base;
    const withPatch = (patch: PackedHeroPatch, overrides: Partial<Unhashed> = {}) =>
      serializeVisualArtifactV2(sample({ meshes: { base, heroPatches: [patch] }, fields: { wholeHole: fieldAtlas(), heroes: [] }, ...overrides }));
    for (const basis of ['interpolated_canonical', 'visual_only_deformation'] as const) {
      expect(parseVisualArtifactV2(withPatch(heroPatch('p', { basis }))).meshes.heroPatches[0]!.basis).toBe(basis);
    }
    for (const kind of HERO_PATCH_KINDS) expect(parseVisualArtifactV2(withPatch(heroPatch('p', { kind }))).meshes.heroPatches[0]!.kind).toBe(kind);
    const lidar = { provider: 'USGS 3DEP', title: 'USGS Lidar Point Cloud NY_3County_2019', url: 'https://example.invalid/laz', nativeResolutionM: .5, acquisitionStart: '2019-04-01', acquisitionEnd: '2019-05-01' };
    const claimed = heroPatch('p', { basis: 'higher_resolution_source' });
    // Constraint 16 / §6: S2 is only S2 when a higher-resolution source actually exists.
    expect(() => parseVisualArtifactV2(withPatch(claimed))).toThrow(/higher_resolution_source without a source/);
    expect(parseVisualArtifactV2(withPatch(claimed, { provenance: { ...unhashed().provenance, highResolutionTerrainSources: [lidar] } })).meshes.heroPatches[0]!.basis).toBe('higher_resolution_source');
    for (const bad of ['measured_lidar', 'visual_only', 'source_derived_visual', '']) {
      expect(() => parseVisualArtifactV2(withPatch(heroPatch('p', { basis: bad as PackedHeroPatch['basis'] }))), bad).toThrow(/schema meshes\.heroPatches\.0\.basis/);
    }
    expect(() => parseVisualArtifactV2(withPatch(heroPatch('p', { kind: 'tee_box' as PackedHeroPatch['kind'] })))).toThrow(/schema meshes\.heroPatches\.0\.kind/);
    expect(() => parseVisualArtifactV2(withPatch(heroPatch('p', { boundsM: [2, 0, 0, 2] })))).toThrow(/heroPatches\[0\] bounds/);
    expect(() => parseVisualArtifactV2(withPatch(heroPatch('p', { canonicalHeightReference: Float32Array.from([100, 100.5, 101]) })))).toThrow(/heroPatches\[0\] vertices/);
    expect(() => parseVisualArtifactV2(withPatch(heroPatch('p', { indices: Uint32Array.from([0, 1, 9]) })))).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: heroPatches\[0\] indices$/);
    expect(() => parseVisualArtifactV2(withPatch(heroPatch('p', { edgeErrorMaxM: -1 })))).toThrow(/schema meshes\.heroPatches\.0\.edgeErrorMaxM/);
  });

  it('hashes every packed array in a fixed order, so any byte or reordering changes the key', () => {
    const artifact = sample();
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{8}$/);
    expect(visualArtifactV2ContentHash(sample())).toBe(artifact.contentHash);
    const bumped = sample(), bent = bumped.fields.heroes[0]!.atlas.bentRGBA8; bent[3] = bent[3]! ^ 1;
    expect(visualArtifactV2ContentHash(bumped)).not.toBe(artifact.contentHash);
    const base = unhashed().meshes.base;
    const ab = sample({ meshes: { base, heroPatches: [heroPatch('a'), heroPatch('b', { kind: 'bunker', visualOffsetMm: Int16Array.from([-120, -300, -80, 0]) })] }, fields: { wholeHole: fieldAtlas(), heroes: [] } });
    const ba = sample({ meshes: { base, heroPatches: [...ab.meshes.heroPatches].reverse() }, fields: ab.fields });
    expect(ba.contentHash).not.toBe(ab.contentHash);
    // Header numbers are outside the packed hash; they are gated by the schema and the budget validator, not the digest.
    const rebudgeted: MeridianVisualArtifactV2 = { ...artifact, budget: { ...artifact.budget, downloadBytes: 1 } };
    expect(visualArtifactV2ContentHash(rebudgeted)).toBe(artifact.contentHash);
  });

  it('refuses an artifact whose keys disagree with the scene, terrain, style or context layer in front of it', () => {
    const artifact = sample();
    expect(() => assertVisualArtifactV2(artifact, scene, mesh)).not.toThrow();
    expect(() => assertVisualArtifactV2({ ...artifact, canonicalPackageHash: 'f'.repeat(64) }, scene, mesh)).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: package/);
    expect(() => assertVisualArtifactV2({ ...artifact, terrainHash: 'e'.repeat(64) }, scene, mesh)).toThrow(/MERIDIAN_ARTIFACT_MISMATCH: terrain/);
    expect(() => assertVisualArtifactV2(artifact, { ...scene, physicalHoleKey: 'cacapon-08' }, mesh)).toThrow(/hole/);
    expect(() => assertVisualArtifactV2({ ...artifact, styleHash: 'meridian-v9-00000000' }, scene, mesh)).toThrow(/style/);
    const restyled = { ...MERIDIAN_STYLE, mowing: { ...MERIDIAN_STYLE.mowing, bandWidthM: 7 } };
    expect(styleHash(restyled)).not.toBe(MERIDIAN_STYLE_HASH);
    expect(() => assertVisualArtifactV2(artifact, scene, mesh, restyled)).toThrow(/style/);
    expect(() => assertVisualArtifactV2({ ...artifact, compilerVersion: 'meridian-visual-compiler-8' }, scene, mesh)).toThrow(/compiler/);
    expect(() => assertVisualArtifactV2({ ...artifact, kind: 'meridian_visual_artifact' as 'meridian_visual_artifact_v2' }, scene, mesh)).toThrow(/kind/);
    expect(() => assertVisualArtifactV2({ ...artifact, provenance: { ...artifact.provenance, displayBasis: 'measured' as 'derived_visual' } }, scene, mesh)).toThrow(/^MERIDIAN_ARTIFACT_MISMATCH: kind$/);
    // Context layer (outside world §35): painted from another layer, or from none when the scene now carries one.
    expect(() => assertVisualArtifactV2(artifact, { ...scene, contextLayerHash: 'c'.repeat(64) }, mesh)).toThrow(/context/);
    expect(() => assertVisualArtifactV2({ ...artifact, contextLayerHash: 'c'.repeat(64) }, scene, mesh)).toThrow(/context/);
    expect(() => assertVisualArtifactV2(sample({ contextLayerHash: 'c'.repeat(64) }), { ...scene, contextLayerHash: 'c'.repeat(64) }, mesh)).not.toThrow();
    // Provenance must describe this terrain's source (constraint 16): the canonical source is 1 m, never finer.
    expect(() => assertVisualArtifactV2(sample({ provenance: { ...artifact.provenance, sourceResolutionM: .5 } }), scene, mesh)).toThrow(/provenance/);
    // Triangle features index this terrain mesh's features.
    const foreign = sample({ meshes: { base: { ...artifact.meshes.base, lod1: displayMesh(2, mesh.featureIds.length) }, heroPatches: [] }, fields: { wholeHole: fieldAtlas(), heroes: [] } });
    expect(() => assertVisualArtifactV2(foreign, scene, mesh)).toThrow(/features/);
    // The gate recomputes the digest, so an in-memory edit after parsing is refused too.
    const edited = sample(), positions = edited.meshes.base.lod0.positions; positions[2] = positions[2]! + 1;
    expect(() => assertVisualArtifactV2(edited, scene, mesh)).toThrow(/content/);
    const inconsistent = { ...artifact, meshes: { ...artifact.meshes, base: { ...artifact.meshes.base, lod0: { ...artifact.meshes.base.lod0, vertexCount: 7 } } } };
    expect(() => assertVisualArtifactV2(inconsistent, scene, mesh)).toThrow(/lod0 vertices/);
  });

  it('keys the cache path on site, package hash and style hash under a v2 directory', () => {
    expect(visualArtifactV2CachePath('cacapon', scene.packageHash, MERIDIAN_STYLE_HASH, 'cacapon-07'))
      .toBe(`geometry/cacapon/${scene.packageHash}/visual-v2/${MERIDIAN_STYLE_HASH}/cacapon-07.visual.json`);
    expect(emptyPackedSet('not_compiled')).toEqual({ basis: 'not_compiled', count: 0, contentHash: '811c9dc5', items: [] });
  });
});
