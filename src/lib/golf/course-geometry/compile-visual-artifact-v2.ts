/** Meridian V2 artifact orchestrator (V2 plan §105–108; Ruling R6, Task 10).
 *
 * `compileVisualArtifactV2` is the pipeline §105 describes with no named
 * owner: it runs the base display LOD compiler (Task 5), the hero region
 * planner (Task 6), the green-complex and bunker hero patch compilers
 * (Tasks 7–8) and the field atlas packer (this task) over one hole scene +
 * canonical mesh, packs the result into `MeridianVisualArtifactV2`, and
 * throws on any §113 gate failure before returning it — nothing this
 * function returns has been silently left broken.
 *
 * `fields.heroes` stays `[]`: hero field atlases (§17's finer per-patch
 * grids) have no content yet — Task 9's bunker gradient is the first real
 * candidate — and packing one per patch today would multiply an
 * already phone-budget-reported artifact for no consumer (field-atlas.ts's
 * `compileFieldAtlas` takes any bounds, so a later task fills this by
 * calling it again per patch). `objects` (vegetation/structures/ribbons)
 * stay empty placeholders: Tasks 14, 15 and 17 fill them.
 *
 * `budget.downloadBytes` is measured by serializing the artifact once with
 * `downloadBytes: 0` and taking that string's length — a documented
 * self-reference (visual-artifact-v2.ts §106 comment): embedding the real
 * number can change the string length by a few digits, which is accepted
 * rather than iterated to a fixed point. `gzipBytesEstimate` stays `null`;
 * the precompile script measures real gzip bytes for its own report,
 * without feeding them back into the artifact (gzip is not part of the
 * three-free lib layer, R12).
 *
 * Peek'n Peak has no source finer than its 2 m canonical grid (itself
 * resampled from 1 m USGS 3DEP), so `highResolutionTerrainSources` is
 * always `[]` here (§8 S2 is unavailable) and every mesh/patch/field basis
 * comes out `interpolated_canonical` / `source_derived_visual`.
 *
 * Deterministic from `scene` + `mesh` + `style` (constraint 13): every
 * sub-compiler it calls already is, and this module adds no randomness or
 * wall-clock state of its own. Three-free (R12). */
import { assertBunkerPatch, compileHeroPatches, type CompiledBunkerPatch } from './bunker-display-mesh';
import { assertBaseDisplayLods, compileBaseDisplayLods, weldAndCleanTerrainMesh, type DisplayLodOptions } from './display-mesh-v2';
import { compileFieldAtlas, fieldAtlasBytes, type FieldAtlasOptions } from './field-atlas';
import { assertHeroPatch } from './green-display-mesh';
import { assertHeroRegionPlan, compileHeroRegions, type HeroRegionOptions } from './hero-patches';
import type { TerrainMesh } from './terrain';
import type { HoleScene } from './types';
import {
  assertVisualArtifactV2, emptyPackedSet, MERIDIAN_VISUAL_COMPILER_V2_VERSION, serializeVisualArtifactV2, visualArtifactV2ContentHash,
  type MeridianVisualArtifactV2, type PackedFieldAtlas, type PackedHeroPatch,
} from './visual-artifact-v2';
import { MERIDIAN_CODES, SURFACE_CLASS_IDS } from './visual-artifact';
import { MERIDIAN_STYLE, styleHash, type MeridianStyle } from './visual-style';

export interface CompileVisualArtifactV2Options {
  style: MeridianStyle;
  /** Hero region planner options (hero-patches.ts); `HeroRegionOptions` defaults apply. */
  heroRegions: Partial<HeroRegionOptions>;
  /** Base LOD compiler options (display-mesh-v2.ts); `heroPlan` is always overridden with this compile's own plan. */
  displayLods: Partial<DisplayLodOptions>;
  /** Whole-hole field atlas options (field-atlas.ts). */
  fieldAtlas: Partial<FieldAtlasOptions>;
  /** Fallback margin (m) around the mesh's own vertices when `mesh.renderProfile` carries no context bounds. */
  contextMarginM: number;
}
const DEFAULT_CONTEXT_MARGIN_M = 20;

/** The field atlas's frame: the hole's own context bounds (renderProfile,
 * terrain-source.ts) when the mesh carries one, else the mesh's own vertex
 * extent grown by a margin so a legacy or synthetic mesh still gets a
 * usable atlas rather than a thrown error. */
function contextBoundsOf(mesh: TerrainMesh, marginM: number): [number, number, number, number] {
  if (mesh.renderProfile) return [...mesh.renderProfile.contextBoundsM] as [number, number, number, number];
  const v = mesh.vertices;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]!); y0 = Math.min(y0, v[i + 1]!); x1 = Math.max(x1, v[i]!); y1 = Math.max(y1, v[i + 1]!); }
  return [x0 - marginM, y0 - marginM, x1 + marginM, y1 + marginM];
}
type BaseLods = MeridianVisualArtifactV2['meshes']['base'];
/** §106 triangle/byte/draw-call budget. `trianglesByClass` counts the
 * triangles a normal render actually shows: LOD0's own triangles outside
 * every hero footprint (the buffer's base-only prefix, `heroRanges[0].start`)
 * plus each compiled hero patch's own triangles, by surface class —
 * never the LOD0 buffer's hero-footprint duplicate tail (the no-patch
 * fallback, unused whenever a patch exists). */
function budgetOf(lods: BaseLods, heroPatches: readonly PackedHeroPatch[], compiledPatches: readonly CompiledBunkerPatch[], wholeHole: PackedFieldAtlas): MeridianVisualArtifactV2['budget'] {
  const trianglesByClass: Record<string, number> = {};
  const bump = (id: number) => { const name = SURFACE_CLASS_IDS[id] ?? 'ground'; trianglesByClass[name] = (trianglesByClass[name] ?? 0) + 1; };
  const lod0 = lods.lod0, prefix = lod0.heroRanges?.[0]?.start ?? lod0.triangleCount;
  for (let t = 0; t < prefix; t++) bump(lod0.surfaceClass[lod0.indices[t * 3]!]!);
  for (const compiled of compiledPatches) for (const cls of compiled.triangleClass) bump(cls);
  const meshBytes = (['lod0', 'lod1', 'lod2'] as const).reduce((sum, name) => { const m = lods[name]; return sum + m.positions.byteLength + m.indices.byteLength + m.triangleFeatures.byteLength + m.surfaceClass.byteLength; }, 0)
    + heroPatches.reduce((sum, p) => sum + p.positions.byteLength + p.indices.byteLength + p.canonicalHeightReference.byteLength + p.visualOffsetMm.byteLength, 0);
  return {
    trianglesByClass, geometryBytes: meshBytes, textureBytesEstimate: fieldAtlasBytes(wholeHole),
    // One draw for the base LOD in use, one more per hero patch (each its own indexed mesh).
    expectedDrawCalls: 1 + heroPatches.length, downloadBytes: 0, gzipBytesEstimate: null,
  };
}

/** Compile the V2 display world for one hole. Throws MERIDIAN_ARTIFACT_MISMATCH
 * or a compiler's own gate error (never returns a half-built or gate-failing
 * artifact); see the header for what stays deliberately empty. */
export function compileVisualArtifactV2(scene: HoleScene, mesh: TerrainMesh, options: Partial<CompileVisualArtifactV2Options> = {}): MeridianVisualArtifactV2 {
  if (mesh.physicalHoleKey !== scene.physicalHoleKey || mesh.geometryHash !== scene.packageHash) throw new Error(MERIDIAN_CODES.mismatch);
  const style = options.style ?? MERIDIAN_STYLE;

  const base = weldAndCleanTerrainMesh(mesh);
  const plan = compileHeroRegions(scene, mesh, base, options.heroRegions);
  assertHeroRegionPlan(plan, base);
  const heroPlan = { triangleRegion: plan.triangleRegion, regionIds: plan.regionIds };
  const lods = compileBaseDisplayLods(mesh, { ...options.displayLods, heroPlan });
  assertBaseDisplayLods(lods);

  const compiledPatches = compileHeroPatches(scene, mesh, base, plan, style);
  for (const compiled of compiledPatches) {
    assertHeroPatch(compiled, base, plan.regions.find(r => r.id === compiled.patch.id)!);
    assertBunkerPatch(compiled, style);
  }
  const heroPatches = compiledPatches.map(c => c.patch);

  const boundsM = contextBoundsOf(mesh, options.contextMarginM ?? DEFAULT_CONTEXT_MARGIN_M);
  const wholeHole = compileFieldAtlas(scene, mesh, boundsM, options.fieldAtlas);
  const fields: MeridianVisualArtifactV2['fields'] = { wholeHole, heroes: [] };

  const objects: MeridianVisualArtifactV2['objects'] = {
    vegetation: emptyPackedSet('unfilled_task15'), structures: emptyPackedSet('unfilled_task17'), ribbons: emptyPackedSet('unfilled_task14'),
  };
  const provenance: MeridianVisualArtifactV2['provenance'] = {
    canonicalBasis: 'source_backed', displayBasis: 'derived_visual', highResolutionTerrainSources: [],
    sourceResolutionM: mesh.source.nativeResolutionM, displayGridSpacingM: mesh.metricGrid?.spacingM ?? mesh.source.nativeResolutionM,
  };
  const meshes: MeridianVisualArtifactV2['meshes'] = { base: { lod0: lods.lod0, lod1: lods.lod1, lod2: lods.lod2 }, heroPatches };
  const budget = budgetOf(meshes.base, heroPatches, compiledPatches, wholeHole);

  const header = {
    schemaVersion: 2 as const, kind: 'meridian_visual_artifact_v2' as const, compilerVersion: MERIDIAN_VISUAL_COMPILER_V2_VERSION,
    canonicalPackageHash: scene.packageHash, terrainHash: mesh.contentHash, physicalHoleKey: scene.physicalHoleKey,
    contextLayerHash: scene.contextLayerHash ?? null, styleHash: styleHash(style),
  };
  const contentHash = visualArtifactV2ContentHash({ meshes, fields });
  const provisional: MeridianVisualArtifactV2 = { ...header, meshes, fields, objects, provenance, budget, contentHash };
  const downloadBytes = serializeVisualArtifactV2(provisional).length; // Self-referential measurement; see header.
  const artifact: MeridianVisualArtifactV2 = { ...provisional, budget: { ...budget, downloadBytes } };

  assertVisualArtifactV2(artifact, scene, mesh, style);
  return artifact;
}
