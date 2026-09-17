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
 * calling it again per patch). `objects.vegetation` and `objects.ribbons`
 * run Task 15's forest edge compiler and Task 14's path ribbon compiler
 * over the same scene/mesh/base and pack their real output; `objects.structures`
 * stays `emptyPackedSet('unfilled_task17')` — Task 17's structure GLB
 * pipeline has no authored-asset catalog to compile from here yet (Ruling R8:
 * no Peek'n Peak models are authored, so `buildStructurePlacements` would
 * skip every context zone regardless).
 *
 * `budget.expectedDrawCalls` (§93) comes from `planV2Batches`
 * (v2-batching.ts) run at the 'phone' tier over this same compile (LOD0
 * with hero footprints excluded, the merged hero patches, the vegetation
 * instances and the ribbon). `planV2Batches` is NOT the master plan's Task
 * 18 (see its own header for the disclaimer) — it is this dispatch's
 * three-free §93 accounting only; the plan's actual Task 18
 * (InstancedMesh/BatchedMesh allocation, `static-object-batches.ts`,
 * measured draw calls) is unimplemented and separate. `structures`
 * contributes no static-object placements yet (Task 17 unfilled), so the
 * plan's `staticObjects` input is always `[]` here.
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
import { assertForestEdgeV2, compileForestEdgeV2, FOREST_EDGE_V2_OPTIONS, type ForestEdgeV2Options } from './forest-edge-v2';
import { assertHeroPatch } from './green-display-mesh';
import { assertHeroRegionPlan, compileHeroRegions, type HeroRegionOptions } from './hero-patches';
import { assertPathRibbon, compilePathRibbon, type PathRibbonOptions } from './path-ribbon';
import type { TerrainMesh } from './terrain';
import type { HoleScene } from './types';
import { planV2Batches } from './v2-batching';
import {
  assertVisualArtifactV2, emptyPackedSet, emptyRibbonSet, MERIDIAN_VISUAL_COMPILER_V2_VERSION, ribbonSetContentHash, serializeVisualArtifactV2,
  vegetationSetContentHash, visualArtifactV2ContentHash,
  type MeridianVisualArtifactV2, type PackedFieldAtlas, type PackedHeroPatch, type PackedRibbonSet, type PackedVegetationSet,
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
  /** Forest edge V2 options (forest-edge-v2.ts); merged onto
   * `FOREST_EDGE_V2_OPTIONS` once and reused for both `compileForestEdgeV2`
   * and `assertForestEdgeV2` — the assert takes the full options type, not a
   * Partial, so the two calls must agree on what they were compiled with. */
  forestEdge: Partial<ForestEdgeV2Options>;
  /** Cart-path ribbon options (path-ribbon.ts). */
  pathRibbon: Partial<PathRibbonOptions>;
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
 * fallback, unused whenever a patch exists). `expectedDrawCalls` is
 * `planV2Batches`'s own count at the phone tier (§93; v2-batching.ts — not
 * the master plan's Task 18, see that module's header): one draw for LOD0
 * with hero footprints excluded, hero patches merged into one
 * ground-material draw, one draw for the whole-hole path ribbon, and one
 * instanced draw per forest kind/variant actually present — never a
 * hand-counted approximation that could drift from the real planner. */
function budgetOf(
  lods: BaseLods, heroPatches: readonly PackedHeroPatch[], compiledPatches: readonly CompiledBunkerPatch[], wholeHole: PackedFieldAtlas,
  vegetation: PackedVegetationSet, ribbons: PackedRibbonSet,
): MeridianVisualArtifactV2['budget'] {
  const trianglesByClass: Record<string, number> = {};
  const bump = (id: number) => { const name = SURFACE_CLASS_IDS[id] ?? 'ground'; trianglesByClass[name] = (trianglesByClass[name] ?? 0) + 1; };
  const lod0 = lods.lod0, prefix = lod0.heroRanges?.[0]?.start ?? lod0.triangleCount;
  for (let t = 0; t < prefix; t++) bump(lod0.surfaceClass[lod0.indices[t * 3]!]!);
  for (const compiled of compiledPatches) for (const cls of compiled.triangleClass) bump(cls);
  const meshBytes = (['lod0', 'lod1', 'lod2'] as const).reduce((sum, name) => { const m = lods[name]; return sum + m.positions.byteLength + m.indices.byteLength + m.triangleFeatures.byteLength + m.surfaceClass.byteLength; }, 0)
    + heroPatches.reduce((sum, p) => sum + p.positions.byteLength + p.indices.byteLength + p.canonicalHeightReference.byteLength + p.visualOffsetMm.byteLength, 0);
  const plan = planV2Batches({ baseLod: lod0, heroPatches, pathRibbon: ribbons, forestInstances: vegetation.instances, staticObjects: [] }, 'phone');
  return {
    trianglesByClass, geometryBytes: meshBytes, textureBytesEstimate: fieldAtlasBytes(wholeHole),
    expectedDrawCalls: plan.draws, downloadBytes: 0, gzipBytesEstimate: null,
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

  // Forest edge (Task 15) and path ribbon (Task 14) are both already-committed
  // compilers; wire their real output into the artifact rather than leaving
  // vegetation/ribbons as placeholders. `assertForestEdgeV2` takes the full
  // options type, so the merged options are computed once and reused for
  // both calls (a Partial override must be checked against itself).
  const forestOptions: ForestEdgeV2Options = { ...FOREST_EDGE_V2_OPTIONS, ...options.forestEdge };
  const forestEdge = compileForestEdgeV2(scene, mesh, forestOptions);
  assertForestEdgeV2(forestEdge, scene, forestOptions);
  const vegetation: PackedVegetationSet = {
    basis: forestEdge.basis, count: forestEdge.instances.length, contentHash: vegetationSetContentHash(forestEdge),
    instances: forestEdge.instances, edges: forestEdge.edges, understory: forestEdge.understory, budget: forestEdge.budget,
  };
  const ribbon = compilePathRibbon(scene, mesh, base, options.pathRibbon);
  if (ribbon) assertPathRibbon(ribbon, options.pathRibbon);
  const ribbons: PackedRibbonSet = ribbon ? { count: ribbon.runs.length, contentHash: ribbonSetContentHash(ribbon), ...ribbon } : emptyRibbonSet();

  const objects: MeridianVisualArtifactV2['objects'] = { vegetation, structures: emptyPackedSet('unfilled_task17'), ribbons };
  const provenance: MeridianVisualArtifactV2['provenance'] = {
    canonicalBasis: 'source_backed', displayBasis: 'derived_visual', highResolutionTerrainSources: [],
    sourceResolutionM: mesh.source.nativeResolutionM, displayGridSpacingM: mesh.metricGrid?.spacingM ?? mesh.source.nativeResolutionM,
  };
  const meshes: MeridianVisualArtifactV2['meshes'] = { base: { lod0: lods.lod0, lod1: lods.lod1, lod2: lods.lod2 }, heroPatches };
  const budget = budgetOf(meshes.base, heroPatches, compiledPatches, wholeHole, vegetation, ribbons);

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
