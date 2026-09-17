# Meridian V2 (ultra-high-fidelity rendering): execution status

Tracks `docs/plans/2026-09-16-meridian-v2-master-plan.md` (27 tasks, stages
A–E) on `agent/golf-course-geometry`. Status values: `done` (implemented and
verified, evidence named), `partial`, `pending`, `blocked` (needs hardware,
source data or a human pass), `rejected` (benchmarked and not kept).

Doctrine that does not change: canonical truth immutable (constraints 1–6),
Top view orthographic, no invented objects or micro-topography (14–15),
interpolated display geometry is never called measured detail (16), one ground
material (19), event-driven rendering (12), everything deterministic from
package/style hashes (13).

Supersedes the V1 trackers for the same topics: `2026-09-16-fidelity-status.md`,
`2026-09-16-renderer-redesign-status.md`, `2026-09-16-meridian-visual-master-plan-status.md`
(V6/V7 draw-budget rows are carried by Task 25 here).

## Tasks

| # | Task | Stage | Status | Evidence / remaining |
| --- | --- | --- | --- | --- |
| 1 | V2 artifact schemas | A | done | `visual-artifact-v2.ts` (22ecc0674): `MeridianVisualArtifactV2` per §106 with base LOD0–2, hero patches (§107 kinds/bases verbatim), field atlases (§108), placeholder object sets for Tasks 14/15/17, provenance that records the interpolated display basis (source 1 m, display grid 2 m, `highResolutionTerrainSources: []` — no LiDAR exists for Peek'n Peak) and a budget that also gates download bytes; zod wire schema + structural checks + FNV-1a digest; `assertVisualArtifactV2` mirrors the V1 gate; cache path `visual-v2/`. 7 tests; review clean (4 minors deferred in the SDD ledger) |
| 2 | Terrain multi-scale curvature compiler | A | done | `terrain-curvature.ts` (d39dab2af): disc-mean smoothing then 5-point Laplacian at 2.5 m (local) and 12 m (landform), percentile-normalized ±1, nulls skipped, edges drop the axis; basis `source_derived_visual`. Tests in `__tests__/terrain-curvature.test.ts` |
| 3 | Bent-sky compiler | A | done | `terrain-sky-field.ts` (13d81e5c7): per-node open-sky fraction, bent normal (weighted open-cone centre) and fall-away exposure from a 40 m / 16-direction geometric march of the 2 m grid; absolute horizon per §25; unsupported nodes 0. 8 tests |
| 4 | Semantic boundary SDF compiler | A | done | `surface-distance-field.ts` (09d82a136): signed distance (inside positive) per layer green/bunker/fairway/path/water from scene features and mobility context zones (round-capped path capsules by class width), bucketed segment index, 16-bit quantization ±64 m. 9 tests incl. brute-force parity |
| 5 | Base display LOD compiler | A | done | `display-mesh-v2.ts`: exact weld → sliver/needle cleaning (2 cm, ≤1 mm apex) → LOD1; §13 importance (grid height error, grid normal error, landform curvature, boundary class, surface weight; V=0 offline) → one red–green level → LOD0 (35k–60k); boundary-locked half-edge collapse ≤0.15 m height error → LOD2 (15k–25k). §14 locks on feature/fringe/surround/border edges; §15 Hausdorff per class vs the raw canonical mesh; §113 degenerate/flipped/non-finite/non-manifold gates. `scripts/golf/course-geometry/compile-display-lods.mts`: all 18 Peek'n Peak holes pass, 0.35–0.85 s each, worst boundary move 0.079 m (a 1 cm fringe sliver strip on hole 7). 9 tests |
| 5b | Lab debug render of V2 base LODs (ruling R11) | A | done | `terrain-debug.ts` views `v2-lod0` / `v2-lod1` / `v2-lod2`: the LOD compiled at runtime from the same canonical mesh, class-tinted with its wire, replacing the V1 terrain (source Z, no relief). Captured hole 7 top/green via `capture-lab.cjs` (`output/playwright/course-geometry/visual-system/v2-lod/`, draw 2, 50 453 / 26 554 / 17 260 tris); screenshots sent to the owner |
| 6 | Hero patch extraction | B | done | `hero-patches.ts`: regions are triangle sets of the cleaned canonical base — green complex (35 m influence, clipped to tactical bounds + 12 m, absorbing touched bunkers), bunkers (+1.5 m turf ring), water edge (one-ring band ≤2.5 m of the shoreline), cart paths (half width + 1 m from context zones); connected components, holes filled, pinch points dilated, fragments under 4 tris / 30 m² dropped; §11 budgets shared by area. `display-mesh-v2` locks region rims, never refines region triangles, and orders each LOD base-first with `heroRanges` (new in the V2 mesh contract, wire + structural check) so the base excludes footprints by one index run — no overlap/z-fighting by construction. Gates: disjoint, mask-consistent, closed simple rims covering every rim edge; footprint area identical in LOD0/1/2 (≤1e-3 m²) on all 18 holes; deterministic. `compile-display-lods.mts` now plans regions with the context layer (hole 7: 1 green complex w/ 3 bunkers, 1 shoreline, 8 path runs). 8 tests |
| 7 | Green-complex hero mesh | B | done | `green-display-mesh.ts`: the patch subdivides the region's own canonical triangles — every canonical vertex, feature outline and rim vertex kept exactly (R14; §15 edge Hausdorff 0), per-edge sample counts from §28–29 class spacing (green/bunker outline 0.4 m, green interior 0.75 m, fringe 0.75, surround 0.9, fairway 1.0, rough 1.5) with curvature (−35 %) and off-grid (−40 %) refinement and a 10 m rim taper; tessellator lattice + merge strips per triangle (no T-junctions: patch border edges == region rim edges, gated), slivers (<5°) kept whole; class-weighted budget scaling (rough first, green last). Heights: barycentric canonical plane + metric-grid relief faded to 0 at the rim; basis `interpolated_canonical`, `canonicalHeightReference` per vertex, `visualOffsetMm` 0. `assertHeroPatch`: topology, seam 0, border/rim, budget, basis provenance. All 18 holes: 13.5–13.9k tris under the 14k budget, green interior 0.95–1.40 m (budget-bound; 0.75 m needs ~20k), relief ≤2.9 m (coarse surround triangles over real dips), seam 0, deterministic. Lab view `v2-hero` (base LOD0 minus the footprint + the patch, class tint, purple wire); hole 7 screenshots sent. 7 tests |
| 8 | Bunker V2 topology | B | done | `bunker-profile.ts` lifts the V1 bowl/lip/family/seed maths into a shared module (V1 artifact hashes byte-identical); `bunker-display-mesh.ts` treats §35's rings as sampling density (spacing caps by signed distance to the canonical outline: rim 0.25 m, lip band 0.3, wall 0.5, floor 0.9) on the Task 7 subdivision engine, and carries the §37 quintic bowl (depth by size class × family × seed) with the §38 shape field (elongation, downhill tilt, seeded variation, clamped 0.75–1.25) and the §39 sin² lip in `visualOffsetMm`; canonical outline stays an exact edge chain; displacement applied by whichever patch owns the bunker (green complex or standalone). Task 6 amended: bunker margins claim by vertex, band-touching bunkers are absorbed by the complex, overlapping bunker bands merge, complex budget +1.5k per absorbed bunker (cap 20k) — so no rim ever sits inside a lip band. Gates: seam 0, zero displacement on outline and rim, bowl ≥ 80 % of class depth × shape floor, lip ≤ lipM and closing inside the band, sign never crosses the outline. All 18 holes pass (bowls 0.52–1.04 m, lips 4–10 cm, standalone bunker patches ≤ 7.9k/hole). Lab `v2-hero` view shades bowls. 6 tests |
| 9 | Bunker analytic normal field | B | done | `bunker-normal-field.ts` (aadba2a49): per-vertex analytic normal on every hero patch = terrain normal + the §37–39 bowl/lip gradient of the bunker displacement (no finite differences over the mesh, so no sawtooth on the lip ring); degenerates to the plain terrain normal where nothing is displaced. Bound as the patch `normal` attribute in `buildV2World` (`stats.normalsBasis`). Tests in `__tests__/bunker-normal-field.test.ts` |
| 10 | Field atlas packer (+ V2 artifact compiler, ruling R6) | B | done | `field-atlas.ts`: one RGBA16F SDF atlas per hole (green, bunker, fairway, water; ±64 m, per-texel dominant class) plus one finer atlas per hero region; `compile-visual-artifact-v2.ts` + `scripts/golf/course-geometry/compile-visual-artifacts-v2.mts` orchestrate §105 (LODs → regions → patches → normals → atlases → static shadow → object sets → digest). Tests in `__tests__/field-atlas.test.ts`, `__tests__/compile-visual-artifact-v2.test.ts` |
| 11 | V2 ground shader (+ runtime V2 world, ruling R7) | C | done | `ground-shader-v2.ts` (`meridian-ground-v2-4`): one ground program; the SDF atlas classifies every fragment (green/bunker/fairway/water + fringe and first-cut surround slabs) with 12 cm crisp bands (fairway/surround use the .8 m edge field), V1's 0.2/0.35 m green and bunker rings, sand grain, contact shade, bowl/lip shade, mow grain (Task 12), baked shadow (Task 16), landform occlusion from the Task 3 sky field (38a2288dd; `GOLF_V2_SKY`, same gain/cap rule as V1). `three-world-v2.ts`: `assembleV2World` compiles everything at runtime from the canonical mesh, `buildV2World` builds base LOD0 + hero patches with per-atlas material *instances* that share one program (`customProgramCacheKey`; three only re-uploads uniforms on a material change — the shared-material swap left a beige rectangle over the green). Lab view `debug=v2-world` (`terrain-debug.ts`). 15 + 38 tests (`three-world-v2.test.ts`, `__tests__/ground-shader-v2.test.ts`, `__tests__/visual-boundary.test.ts`). Curvature response (Task 2 field) not bound — the V1 slope/curvature tone lives in the vertex colour bake |
| 12 | Fairway directional material | C | done | `fairway-direction-field.ts`: per-node mow direction from the fairway SDF (tangent of the nearest edge, stripe phase by distance along the hole), RG8 texture bound as `GOLF_V2_FAIRWAY`; GLSL sheen `floor + (1−floor)·pow(1−|v·t|, p)` with `sheenFloor` .75 and albedo amplitude .03 (the plan's .015 was invisible against the turf field). Weighted by the fairway SDF's own soft edge. Tests in `__tests__/fairway-direction-field.test.ts` |
| 13 | Green/fringe/apron material pass | C | done (run-off deferred) | `green-surface-v2.ts`: §27–34 band classifier (green/fringe/apron/run-off/rough) with CPU + GLSL mirrors, quiet-BRDF roughness per band, §31 micro-normal with a proven ≤1.14° tilt bound, slope-evidenced run-off weight; 20 tests. Wired in `ground-shader-v2` (`meridian-ground-v2-5`, c58a28a10): apron albedo on the fairway's last metres before the green (confined to the fairway winner — letting it reach the rough within `apronFairwayM` drew a lighter wedge with a hard seam at the hero-patch rim), band roughness, micro-normal spliced after `normal_fragment_maps` with a fwidth fade, V1's diagonal green mowing (route-relative uniform per hole). Run-off stays off: the only per-fragment slope (interpolated normal) facets the on/off gate triangle by triangle; needs V1's per-vertex smoothed weight baked as a patch attribute. Hole 7 green/putting captured (front nine only per the owner) |
| 14 | Cart-path hero ribbon | D | done | `path-ribbon.ts`: one draped ribbon per hole from the context path runs (class widths, mitred corners, render-only Z lift), drawn as one `THREE.Mesh` by `three-world-v2-objects.ts`; ledger note honoured (one draw per hole, not per run — hole 18 has 14 runs). Tests `__tests__/path-ribbon.test.ts`, `three-world-v2-objects.test.ts` |
| 15 | Forest edge V2 | D | done (c58a28a10 fix) | `forest-edge-v2.ts` compiles crown/shrub/mass instances from the canopy symbols with V1's placement ratios; `three-world-v2-objects.ts` draws them as V1-style tree families with near/distant/far crown LODs ranked by distance to the tactical bounds (near cap 120), BatchedMesh crowns + trunks, InstancedMesh shrubs and near/far mass, crown self-shade (`canopyShade.self`), seeded lean and mirrored silhouettes. The first cut (lollipop crowns on thin trunks) was rejected on sight and rebuilt. Second defect (canary sheet): the woods read sparse next to V1 — a context woods polygon that runs kilometres past the hole widened the candidate scatter to ~30 m; the scatter is now clipped to the terrain extent and the budget trim prefers crowns nearest the played hole (V1 §38), hole 7: 710 crowns / 418 mass (was 513 / 258). Tests `__tests__/forest-edge-v2.test.ts`, `three-world-v2-objects.test.ts` |
| 16 | Static shadow field | C | done | `static-shadow-field.ts`: fixed-sun (TERRAIN_LIGHT_DIRECTION) terrain self-shadow by ray march over the metric grid plus canopy-crown sphere occluders from `canopySymbols` (stylized crowns, never tree observations), world-space blur 1.5 m, R8 layers terrain/canopy/combined, `sampleStaticShadow`, `staticShadowLayer` for the atlas; basis `art_directed_static` (§71: not physically exact). Tests: flat plane lit, 10 m wall shadow length = h/tan(elev) within a cell and none sun-facing, crown shadows only downstream of woods, hole 7 deterministic (<4 s). Dynamic-vs-static comparison deferred to the lab (Task 26) |
| 17 | Structure GLB pipeline | D | done (R8) | `structure-glb.ts` + `glb-writer.ts` + `scripts/golf/course-geometry/export-v2-glb.mts` / `report-structure-glb.mts`: footprint extrusions exported as world-scale GLB keyed by context structure id, ground-contact placement, loader contract for authored models. No authored Peek'n Peak models exist, so production keeps the extrusions (nothing invented); the V2 world draws V1's context structures and lines through `buildThreeContext` (ribbons dropped in favour of the V2 path ribbon; the lift pass applied — hole 9's condos were missing from V2 until c58a28a10). Tests `__tests__/structure-glb.test.ts`, `__tests__/glb-writer.test.ts`, `three-world-v2-objects.test.ts` |
| 18 | InstancedMesh/BatchedMesh allocation | E | done | `v2-batching.ts` (draw plan per object family, budget-aware LOD split) + `three-world-v2-objects.ts` (2 BatchedMesh + InstancedMesh families + 1 path mesh; hole 7 objects ≤ 12 draws, asserted). Tests `__tests__/v2-batching.test.ts`, `three-world-v2-objects.test.ts` |
| 19 | Artifact residency manager | E | done | `artifact-residency.ts`: `planArtifactResidency` keeps a nominal window of 3 holes resident around the current one under a per-tier byte budget (`defaultResidentBudgetBytes`), evicting the farthest holes first; deterministic. Tests `__tests__/artifact-residency.test.ts` |
| 20 | Shader precompile | E | partial | `three-renderer.ts` runs `renderer.compileAsync(world, view)` after world setup and before the first paint, and the lab's debug views (`v2-lod*`, `v2-hero`, `v2-world`) install their materials before that call, so the V2 program set precompiles too; `shaderCompileMs` lands in the dataset. A before/after first-frame hitch measurement for V2 is not recorded |
| 21 | Shadow update discipline | E | done | `shadow-bounds.ts` + renderer discipline: the fitted shadow camera only refits on camera-state changes (event-driven, §12), never per frame; `__tests__/three-renderer-discipline.test.ts`, `__tests__/shadow-bounds.test.ts` |
| 22 | CSM benchmark (high tier only) | E | scaffold (274df81c8) | `three-csm-benchmark.ts` (`installCsmBenchmark`/`removeCsmBenchmark`, 2 cascades, per-material `USE_CSM` patching, incompatible materials skipped), `scripts/golf/course-geometry/bench-csm.cjs`, protocol `docs/golf/course-geometry/csm-benchmark.md` with the results table left blank — headless Chromium has no GPU timer worth recording, so the run needs a real desktop GPU session. Not wired into the standard render path |
| 23 | Light-probe benchmark | E | rejected for production (R9) | `three-light-probe-experiment.ts`: manual SH probe grid (three 0.186 has no grid class), bent-sky ambient comparison, cube-capture bake; `docs/golf/course-geometry/light-probe-experiment.md` measures SH bytes and grid build time headlessly and recommends **reject** for the V2 production path (the static sky field + baked shadow already carry the depth cue at a fraction of the cost). Visual judgment on a real GPU frame still open |
| 24 | Debug passes V2 | E | done | `terrain-debug.ts` views `v2-lod0/1/2`, `v2-hero`, `v2-world`; `terrain.userData.debugV2` telemetry (draws, triangles, patches, object stats, forest LOD split) alongside `buildV2World` stats (atlas bytes, hero atlas count, fairway grain, static shadow, sky occlusion) — read from the lab, not yet written into the capture JSON; `terrain-debug-v2.test.ts` |
| 25 | V2 budget validator | E | done | `v2-budgets.ts` + `scripts/golf/course-geometry/validate-v2-budgets.mts`: phone/desktop tier budgets (`V2_BUDGETS`: base LOD ranges, hero patch budgets, close-frame triangle envelope, draws) validated per hole against the display-LOD report (`validateHoleBudgets` → violations with plan section and severity); `__tests__/v2-budgets.test.ts` |
| 26 | Canary visual suite | E | done (front nine run) | `scripts/golf/course-geometry/capture-v2-canaries.cjs` captures V1 (`debug=final`) and V2 (`debug=v2-world`) for every canary hole × top/approach/green × phone/desktop into one `canaries.json`; `canary-compare.ts` + `compare-canaries.mts` diff the two worlds (`__tests__/canary-compare.test.ts`). Owner limited visible checks to the front nine: runs `front9-sky` and `front9-final` (holes 7, 9 × 3 shots × 2 viewports × 2 worlds = 24 captures each, 0 errors) under `output/playwright/course-geometry/visual-system/v2-canaries/` (uncommitted, output/ stays local). `compare-canaries.mts --run`: V2 draws 17–22 vs V1's 8–10 and 2–5× V1's triangles; four §11 `close-frame-visible-runtime` warnings (green frames 333k–491k vs 90k on `front9-final`, with the woods at full density) because the V2 world always draws base LOD0 plus every forest instance — the fix is a view-dependent base LOD (LOD2 at green/putting; the LODs exist) and per-instance culling for the InstancedMesh families. Headless frame-time numbers are noise (software GL) and are not used |
| 27 | Physical iPhone calibration | E | blocked (hardware) | needs the owner's phone; protocol to be written with Task 26 |

## Rulings (plan defects decided during execution)

See the SDD ledger for the full text; the ones that change contracts are
repeated here as they land.

- R7 (amended): "one ground material" (constraint 19) means one ground
  *program*. The base LOD and each hero patch hold their own
  `MeshStandardMaterial` instance bound to their own atlas; every instance
  returns the same `customProgramCacheKey`, so three compiles and caches one
  program. Swapping uniforms on a single shared material does not work: three
  only re-uploads `MeshStandardMaterial` uniforms when the material id
  changes (`uniformsNeedUpdate` is honoured for `ShaderMaterial` only).
- R15: the fairway's 0.6 m first-cut surround is an atlas slab
  (`min(dFairway + surroundBandM, −dFairway)`), not a mesh band — the
  canonical material-3 sliver triangles interpolated an untracked vertex
  colour through the fairway edge and read as spikes.
- R16: mow grain keeps a sheen floor (.75) and a .03 albedo amplitude; the
  plan's .015 with sheen→0 along the mow line was invisible at every preset.
- R17: crisp 12 cm bands on green/bunker/water/fringe edges; fairway and its
  surround keep the .8 m edge field so the fairway edge stays soft.
- R18: the Task 3 sky-visibility field is bound per fragment (`GOLF_V2_SKY`)
  with V1's `min(landform.max, landform.gain × (1 − visibility))` rule; the
  bent normal and exposure channels stay unused until a visual case needs
  them.
- R19: V2 reproduces V1's *rules* where V1 already had the right look —
  water (interior/shoreline/Fresnel), green mowing (45° route-relative
  bands), fairway band shape (filtered square wave), crown trim by nearness
  to the played hole, context structures — rather than inventing new ones.
  V2's differences are close-up: SDF-crisp edges, hero patches, baked
  shadows, per-fragment landform occlusion, tree families with real LODs.
- R20: forest candidate scatter is clipped to the terrain extent. A context
  polygon's area outside the terrain cannot carry an instance, so it must
  not spend the candidate budget.

## Open items after the front-nine pass

- §11 close-frame triangle budget (4 warnings): the forest families are
  BatchedMesh with per-instance culling (a0d485d2b); the view-dependent base
  LOD was tried and reverted — the hero-patch rims are stitched against
  LOD0, so a coarser base under the green would open seams. Still open.
- Task 13 run-off term (needs a per-vertex smoothed slope weight).

## Product wiring (R7 in the app, 2026-09-16 late)

- a0d485d2b: `world: 'v2'` is a render mode of the production terrain
  runtime (overlay and markers intact); threaded through CourseTerrainCanvas
  → CourseHoleScene → HoleSceneFrame → OneTapPlayerScreen; the One-Tap lab
  reads `?world=v2` and its bar switches worlds / opens the render lab.
- 699428f6b: the live One-Tap round renders `policy.renderWorld` ('v2') and
  `loadCourseAssets` now loads the manifest's context layer;
  `scripts/golf/course-geometry/publish-course-assets.mts` writes a course
  into `public/course-geometry/<courseId>/` (hash-named, re-verified).
- Phone-reachable review page (static build of the browser fixture, One-Tap
  hole 7 over V2): claude.ai artifact 7LQ9uPQ2VmZi1KY8jpq2Hk.
- Owner decisions still required before a preview deployment can play a
  real round (each refused by the session's auto-mode gate as a policy
  change): (1) run the publisher into `public/` (~52 MB, byte-identical to
  the committed fixtures); (2) approve the Upper package hash
  `fdec6ea8…` in `peek-n-peak-policy.ts` and accept that it is still
  `source_candidate` (no reviewed OSM features — lie copy already says
  "Surface uncertain" on unreviewed boundaries; round-review shot
  resolution stays off); (3) `peek_n_peak_one_tap_v1` on for `preview`.
  Then a CLI preview deploy (git deploys are disabled) and, separately, the
  One-Tap migration and a production deploy — both owner-authorized.
- Task 20: record the V2 first-frame hitch before/after `compileAsync`.
- Task 22: run the CSM protocol on a real desktop GPU; Task 23's visual
  judgment likewise.
- Task 27: blocked on the owner's phone.
- Back nine: not captured (owner: front nine only for the visual checks).
