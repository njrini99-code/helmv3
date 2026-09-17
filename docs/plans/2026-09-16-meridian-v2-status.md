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
| 11 | V2 ground shader (+ runtime V2 world, ruling R7) | C | done | `ground-shader-v2.ts` (`meridian-ground-v2-4`): one ground program; the SDF atlas classifies every fragment (green/bunker/fairway/water + fringe and first-cut surround slabs) with 12 cm crisp bands (fairway/surround use the .8 m edge field), V1's 0.2/0.35 m green and bunker rings, sand grain, contact shade, bowl/lip shade, mow grain (Task 12), baked shadow (Task 16), landform occlusion from the Task 3 sky field (38a2288dd; `GOLF_V2_SKY`, same gain/cap rule as V1). `three-world-v2.ts`: `assembleV2World` compiles everything at runtime from the canonical mesh, `buildV2World` builds base LOD0 + hero patches with per-atlas material *instances* that share one program (`customProgramCacheKey`; three only re-uploads uniforms on a material change — the shared-material swap left a beige rectangle over the green). Lab view `debug=v2-world` (`terrain-debug.ts`). 15 + 38 tests (`three-world-v2.test.ts`, `__tests__/ground-shader-v2.test.ts`, `__tests__/visual-boundary.test.ts`). Curvature response bound since `meridian-ground-v2-7` (2026-09-17, rough hierarchy bullet below): the atlas's landform curvature rides the relief texture's A channel and tints the rough share per §50 |
| 12 | Fairway directional material | C | done | `fairway-direction-field.ts`: per-node mow direction from the fairway SDF (tangent of the nearest edge, stripe phase by distance along the hole), RG8 texture bound as `GOLF_V2_FAIRWAY`; GLSL sheen `floor + (1−floor)·pow(1−|v·t|, p)` with `sheenFloor` .75 and albedo amplitude .03 (the plan's .015 was invisible against the turf field). Weighted by the fairway SDF's own soft edge. Tests in `__tests__/fairway-direction-field.test.ts` |
| 13 | Green/fringe/apron material pass | C | done | `green-surface-v2.ts`: §27–34 band classifier (green/fringe/apron/run-off/rough) with CPU + GLSL mirrors, quiet-BRDF roughness per band, §31 micro-normal with a proven ≤1.14° tilt bound, slope-evidenced run-off weight; 20 tests. Wired in `ground-shader-v2` (`meridian-ground-v2-5`, c58a28a10): apron albedo on the fairway's last metres before the green (confined to the fairway winner — letting it reach the rough within `apronFairwayM` drew a lighter wedge with a hard seam at the hero-patch rim), band roughness, micro-normal spliced after `normal_fragment_maps` with a fwidth fade, V1's diagonal green mowing (route-relative uniform per hole). Run-off live since `meridian-ground-v2-6` (2026-09-17): the atlas's own relief channels (`dzdx`/`dzdy`, the 2 m grid's gradient resampled per texel — a bilinear field, independent of how the display mesh is triangulated, where the interpolated vertex normal changed slope at every decimated triangle edge and faceted the gate) go up as one RG16F texture per atlas beside its SDF texture (`GOLF_V2_RELIEF`, `RELIEF_FIELD_BINDING`, sampled through `golfV2SdfFrame`; decoded values via `fieldAtlasChannelTexels`, never the fixed-point codes); the fragment calls `golfV2GreenRunoff` with that slope and a four-tap SDF gradient at `GREEN_SDF_GRADIENT_STEP_M` (textureLod, no derivative in the branch), applies `runoff.mix` toward apron and the apron roughness, and only on the untracked rough share of the fragment (`1 - golfWeight` of a tracked winner, the 0.6 m surround in full, never woods — V1's rough/ground rule in shader terms), handed over gradually by the claiming band's fading confidence (`1 - golfGB.weight`; the cascade's hard hand-off, which V1 interpolates per vertex, drew a ring 3 m out on hole 5 per fragment). Proof: a CPU emulation of the shader from the uploaded texture data matches `greenBandsAt` on all 1540 near-green hero texels of hole 7 (831 vs 832 lit, worst 0.04); before/after lab frames (`v2-canaries/runoff-{before,after2}`, phone, green preset): holes 1 and 5 move 4.7 % / 5.5 % of the frame by 8–24 levels — a lighter close-mown band where the ground falls away from the green — hole 7 0.5 %: of its qualifying hero texels 67 % lie inside woods polygons and 13 % on fairway/sand/tee (both excluded, as in V1), 19 % on open rough. Known: the `awayDot` gate is a hard threshold (the mirror's own term), so a fall-away pocket can end in a soft-edged blob (hole 5 east side, a few levels); left as the plan's rule rather than smoothed. Compiler digests unchanged (upload-and-shade only); `sampleFieldAtlas` gained one CPU-side fix in the same commit — weights relative to the clamped texel, so the first texel's centre no longer reads its neighbour by a rounding hair (census counts unchanged). Hole 7 green/putting captured (front nine only per the owner) |
| 14 | Cart-path hero ribbon | D | done | `path-ribbon.ts`: one draped ribbon per hole from the context path runs (class widths, mitred corners, render-only Z lift), drawn as one `THREE.Mesh` by `three-world-v2-objects.ts`; ledger note honoured (one draw per hole, not per run — hole 18 has 14 runs). Tests `__tests__/path-ribbon.test.ts`, `three-world-v2-objects.test.ts` |
| 15 | Forest edge V2 | D | done (c58a28a10 fix) | `forest-edge-v2.ts` compiles crown/shrub/mass instances from the canopy symbols with V1's placement ratios; `three-world-v2-objects.ts` draws them as V1-style tree families with near/distant/far crown LODs ranked by distance to the tactical bounds (near cap 120), BatchedMesh crowns + trunks, InstancedMesh shrubs and near/far mass, crown self-shade (`canopyShade.self`), seeded lean and mirrored silhouettes. The first cut (lollipop crowns on thin trunks) was rejected on sight and rebuilt. Second defect (canary sheet): the woods read sparse next to V1 — a context woods polygon that runs kilometres past the hole widened the candidate scatter to ~30 m; the scatter is now clipped to the terrain extent and the budget trim prefers crowns nearest the played hole (V1 §38), hole 7: 710 crowns / 418 mass (was 513 / 258). Tests `__tests__/forest-edge-v2.test.ts`, `three-world-v2-objects.test.ts` |
| 16 | Static shadow field | C | done | `static-shadow-field.ts`: fixed-sun (TERRAIN_LIGHT_DIRECTION) terrain self-shadow by ray march over the metric grid plus canopy-crown sphere occluders from `canopySymbols` (stylized crowns, never tree observations), world-space blur 1.5 m, R8 layers terrain/canopy/combined, `sampleStaticShadow`, `staticShadowLayer` for the atlas; basis `art_directed_static` (§71: not physically exact). Tests: flat plane lit, 10 m wall shadow length = h/tan(elev) within a cell and none sun-facing, crown shadows only downstream of woods, hole 7 deterministic (<4 s). Dynamic-vs-static comparison deferred to the lab (Task 26) |
| 17 | Structure GLB pipeline | D | done (R8) | `structure-glb.ts` + `glb-writer.ts` + `scripts/golf/course-geometry/export-v2-glb.mts` / `report-structure-glb.mts`: footprint extrusions exported as world-scale GLB keyed by context structure id, ground-contact placement, loader contract for authored models. No authored Peek'n Peak models exist, so production keeps the extrusions (nothing invented); the V2 world draws V1's context structures and lines through `buildThreeContext` (ribbons dropped in favour of the V2 path ribbon; the lift pass applied — hole 9's condos were missing from V2 until c58a28a10). Tests `__tests__/structure-glb.test.ts`, `__tests__/glb-writer.test.ts`, `three-world-v2-objects.test.ts` |
| 18 | InstancedMesh/BatchedMesh allocation | E | done | `v2-batching.ts` (draw plan per object family, budget-aware LOD split) + `three-world-v2-objects.ts` (2 BatchedMesh + InstancedMesh families + 1 path mesh; hole 7 objects ≤ 12 draws, asserted). Tests `__tests__/v2-batching.test.ts`, `three-world-v2-objects.test.ts` |
| 19 | Artifact residency manager | E | done | `artifact-residency.ts`: `planArtifactResidency` keeps a nominal window of 3 holes resident around the current one under a per-tier byte budget (`defaultResidentBudgetBytes`), evicting the farthest holes first; deterministic. Tests `__tests__/artifact-residency.test.ts` |
| 20 | Shader precompile | E | partial (device before/after open) | `three-renderer.ts` runs `renderer.compileAsync(world, view)` after world setup and before the first paint, and the lab's debug views (`v2-lod*`, `v2-hero`, `v2-world`) install their materials before that call, so the V2 program set precompiles too; `shaderCompileMs` lands in the dataset (46–176 ms per hole on the Mac headless run below, software GL, so not a device number). Measured 2026-09-17: the hitch a phone pays at mount is not the shader compile but the synchronous world compile, now reported as `v2BuildMs` (canvas `data-v2-build-ms`, `terrain-debug.ts`): 4.6–13.4 s per hole (median 7.8 s) on the Mac before tonight's compile work, and it ran three times per hole because `HoleSceneFrame`'s stage presentation remounted the terrain per camera state (`<Drawing key={view}>`; fixed in c1f293a2f with `stageArea`/`snapPreset`, one build per hole, framing identical). bd010b92a then halved the compile itself: `buildSurfaceDistanceLayers` brackets each texel's centreline distance with a padded-grid EDT and scans only the segments a two-level bucket index places in that annulus (bit-identical on every production atlas of holes 3, 7 and 8 — 493×301, 285×717, 490×470 and the bunker frames, 6.08 M layer texels, 0 differing — and 6–9× faster), and `assembleV2World` compiles the atlas-default curvature and sky fields once for all five atlases. Hole 7: `assembleV2World` 9.8 → 4.1 s in Node, in-browser `v2BuildMs` 8.5 → 4.0 s (hole 8: 4.7 s); the ready frame diffs 0.30 % against the pre-change capture, exactly the run-to-run noise of two captures at the same commit (0.30 % ready, 1.0–3.4 % on the marked frames, all HUD and simulated-ball position), so the picture is unchanged. Then, output-identical (sha256 digests of every compiled array on holes 7 and 18 unchanged): b6053511b — the static shadow field bucketed crowns by "(z + r) / tan(elevation)" with absolute heights, so every node tested every crown (now a down-sun strip per crown; 0.88 → 0.07 s), forest-edge clearance tests pruned by ring boxes (0.6 → 0.15 s), sky-march offsets precomputed, typed-array percentile sort, LOD0-only runtime compile (`compileBaseDisplayLod0`), allocation-free grid sampler; ccad68c4e — the V1 artifact's cut/fill search and the canopy scatter pruned by boxes (the V1 landscape is still built under V2 for the surface sampler and context objects); 4b49cd033 — under the V2 world the V1 DEM shading texture and vegetation are skipped (`buildThreeLandscape({ underV2 })`, 0.78 → 0.45 s on hole 7) and the renderer reports `landscapeBuildMs`. 18-hole re-audit (`one-tap/audit-v2-fast`, Mac Chromium 390×844, 0 page errors): `v2BuildMs` 1.1–2.9 s (median 2.1 s; was 4.6–13.4 s, median 7.8 s), `landscapeBuildMs` .13–.77 s, ready 2.4–5.1 s after navigation (median 3.7 s), frames unchanged within capture noise. Still open: a compileAsync on/off first-frame measurement on a real device (Task 27); the remaining compile is the exact boundary SDF (~.85 s of hole 7's 2.2 s: the atlas tests assert exactness to 56 m), hero patches (~.35 s) and the whole/hero atlas texel loops |
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
- Owner approved the pilot on 2026-09-16 ("Yeah I approve. Don't deploy
  to production yet or do some testing"), and it shipped:
  599c1ea91 — the Upper package hash `fdec6ea8…` is approved in
  `peek-n-peak-policy.ts` with `pilotAcceptsSourceCandidate: true` (the
  package is still `source_candidate`; lie copy reads "Surface uncertain"
  on unreviewed boundaries and round-review shot resolution stays off);
  `public/course-geometry/peek-n-peak-upper/` carries the manifest, the
  package, the context layer and all 18 compiled terrains (51.6 MB,
  re-verified against the fixtures by the publisher);
  `peek_n_peak_one_tap_v1` is on for `preview` only — production stays
  off. 34 test files / 192 tests, tsc, eslint, flags and vercelignore
  checks green.
- 46e358357: the first CLI preview upload (908 MB) was rejected for the
  worktree's `supabase/.temp/pooler-url` symlink. Root cause: the Vercel
  CLI's `--archive=tgz` walker (ignore@4 + tar-fs) tests directory paths
  without a trailing slash, so every `dir/` rule in `.vercelignore` only
  matched children; an all-ignored directory came back empty, was added as
  an entry, and tar-fs packed its whole contents. Every directory rule is
  now repeated without the slash (upload 952 MB → 121 MB, verified with
  `vercel deploy --dry --archive=tgz`), and the docs/ carve-out gained the
  two no-slash negations it needed. From the canonical checkout the same
  walk had been shipping `playwright/.auth/`, `momentic/auth/` and
  `.claude/session-state/` in production archives — reported to the owner.
- Preview deployment 2026-09-17 00:35 EDT (never production; git deploys
  are disabled, so CLI `vercel deploy --archive=tgz` from 46e358357):
  https://helmv3-gzq7z9epz-nick-rinis-projects.vercel.app
  (dpl_DSoz5v3N1xuJk2gAuzLMVA5rYSwM, READY, 121 MB upload, 7149 files).
  Verified through `vercel curl`: the manifest, the package, hole 7's
  terrain and the context layer are served byte-identical to `public/`.
  Vercel Authentication is on for previews, so the phone browser signs in
  to Vercel once. Not verified on a phone yet (Task 27).
- Still owner-authorized and not done: the One-Tap sync migration (HUD
  shows "Sync issue" until then) and any production deploy.
- Whole-course One-Tap V2 audit (2026-09-17, `capture-one-tap.cjs --world=v2`,
  Mac Chromium 390×844, all 18 holes → `output/playwright/course-geometry/
  one-tap/audit-v2-world/hNN/`): 0 page errors on every hole; draws 10–29 at
  the tee state and 8–23 at the green state; 255 k–565 k render triangles at
  the tee, 49 k–203 k at the green (the BatchedMesh per-instance culling of
  a0d485d2b is what keeps the green frames under the tee frames; holes 4, 7,
  8 and 15 still sit above the §11 90 k close-frame envelope); geometry
  10.5–19.1 MB per hole; frame P95 ≤ 1.8 ms except two single spikes (hole 5
  38.5 ms, hole 7 35.1 ms, both on the first marked frame); mount compile
  `v2BuildMs` 4.6–13.4 s before the bd010b92a speed-up (hole 7 re-captured
  after it: 4.0 s; after the whole compile pass, 1.1–2.9 s on all 18 holes —
  Task 20 row). The last hole renders NEXT HOLE disabled, which the
  capture script now skips instead of timing out (hole 18 completed on the
  re-run). Contact sheets (tee state at mount, green state) sent to the
  owner.
- Task 20: the mount hitch is measured (row above); the device
  before/after of `compileAsync` itself waits on Task 27.
- 55829d7b8: when the V2 compile falls back to V1 (R7: no metric grid, or
  the compiler throws) the renderer now rebuilds the whole V1 landscape —
  `buildThreeLandscape`'s `underV2` build (no DEM shading texture, no
  crowns/trunks/mass) had left that fallback flat and treeless; regression
  test in `three-renderer-discipline.test.ts` (cacapon-07, 148 trees).
- Rough hierarchy in V2 (fidelity §65 #4, §32–36; plan §48–50; 2026-09-17,
  `meridian-ground-v2-7`, two commits). Plumbing first (d832d0753, no shader
  text change): `SURFACE_DISTANCE_LAYERS` gained `tee` (appended, every
  earlier index and semantic class id unchanged — tee is the one playing
  kind V1's `compileRoughHierarchy` measures from that had no field) and the
  relief texture widened RG16F → RGBA16F (dz/dx, dz/dy, tee SDF in metres,
  landform curvature ±1); digests moved only in `atlas`/`heroAtlases`, six
  front-nine phone frames pixel-identical (mean 0.00), assemble +6 %
  (hole 7 2311 → 2447 ms), ~1.7 MB more texture upload on hole 7. Then the
  GLSL: V1's own bands and blends per fragment (first cut 2.5 ± .8 m lifted
  toward the surround, secondary 10 ± 3, outer 28 ± 6) from the distance to
  the nearest fairway/green/tee (own and context, the SDF layers), applied
  as ratios to the rough albedo (`#6A8A42`/`#5A7638`/`#526D35` over
  `#607D3D`: 1.23×, 0.87×, 0.72× linear) so a partly-rough fragment keeps its
  own blend and no seam forms where the share changes; V1's slope darkening
  (12 % at 45 % slope, secondary/outer only, from the relief slope: `1 −
  inversesqrt(1 + |∇z|²)` = V1's `1 − |nz|`); §50 curvature tone (new style
  `curvatureTone`: concave ×(.955, .97, 1), convex ×(1.04, 1.03, .99), ±3 %
  luminance at |curvature| = 1, the plan's 1–4 %); outer roughness .98,
  outer macro ×1.6 and V1's `microByClass` (rough 1.6, surround 1.25,
  fringe .7, apron .8) through two turf-field scales. The share is the
  fragment's untracked remainder (`1 − golfWeight` of the atlas winner)
  minus the tee band (`smoothstep(±6 cm)` of the tee SDF) and the woods
  share (`clamp(class − 8, 0, 1)` of the interpolated vertex class —
  continuous, so V1's woods exclusion never steps mid-triangle); never gated
  on `atlasTrust` (the opposite set) or a discrete class test (the spiky
  chord). Beyond the atlas the SDF clamps to its edge texel, so the metres
  outside are added to the play distance and far ground settles into outer
  rough within one outer blend of the edge (four tee frames show no seam).
  CPU mirror `roughHierarchyAt` (tested against a synthetic fairway + tee
  scene at 0.25 m and hole 7's real atlas: every tier present, ≥ 30 % of the
  rough moves > 2 %). Frames (`v2-canaries/hierarchy-{before,after}`, phone,
  holes 7/1/5/4 tee + 7/1/5/4 green/approach): mean 2.8–7.5 levels moved,
  no pixel > 24 — the ladder now reads fairway → surround → first cut →
  primary → secondary → outer on every hole; tees carry a first-cut halo.
  Observed, not new: crown-less woods polygons on hole 4's open flank read
  as lighter angular patches against outer rough — the woods floor
  (`#29482B` mixed 78 % toward rough ≈ `#547139`) sits between primary and
  outer, exactly as V1's own frame of the same view shows
  (`hierarchy-v1ref`); a palette question, not this term's. Tee mow-grain
  stays off (V1 never mows the tee: `mown` is fairway/green only). Still
  missing from the V2 ground versus V1: context ground zones (§48
  classes), fairway edge types/terrain bias, context desaturation.
- §20 pad setting in V2 (`meridian-ground-v2-8`, 2026-09-17): `greenPadSetting`
  packs the hole's own green pad (mean canonical z of the green's field
  triangles, V1 compileGreenComplex) with a centre and reach radius into the
  per-hole `golfV2GreenPad` uniform; a new `vGolfV2WorldZ` varying gives the
  fragment its canonical height, and the bank below the pad darkens up to
  5 % (full at 1.5 m below), fading over 12 m of the atlas green SDF, on the
  rough share plus the fairway surround. The same uniform gates the §34
  run-off to the hole's OWN green (V1's rule) — the atlas green SDF also
  holds context greens, and hole 1's approach frame carried a run-off
  streak beside a neighbouring green (top-left of `hierarchy-after`), gone
  in `setting-after`. Evidence: fidelity tracker §20 row (census per hole);
  `three-world-v2.test.ts` drives `onBeforeCompile` with a stand-in shader
  and checks the uniform's four numbers on hole 7.
- Bunker system in V2 (`meridian-ground-v2-9`, 2026-09-17, fidelity §65 #2 /
  §26–28, redesign §9): the sand branch adds V1's lip overhang shadow — the
  rim's inward normal is the bunker SDF's central-difference gradient
  (`BUNKER_RIM_GRADIENT_STEP_M` 0.4 m, four `texture2DLodEXT` taps inside the
  branch), `sunFacing = max(0, outward · SUN_GROUND_XY)`, 32 % over 1.6 m;
  the sand floor carries the macro field at 1.2 % (V1 `golfSand`); the §37
  contact shade becomes V1's turf-only linear ramp (the sand side keeps its
  rings, boundary shade and now the overhang), with band and shade spread
  ±30 % on two slow world sines (`bunkerContactAt`) in place of V1's
  per-feature seeds. Mirrors `bunkerOverhangAt` / `bunkerContactAt` plus the
  hole-7 census live in `ground-shader-v2.test.ts`. Frames: `bunker-before`
  (V1 + V2) vs `bunker-after` on holes 7/1/5 green/approach — ≤ 0.45 % of
  pixels move by > 24 levels, all at bunker rims; the shaded side matches
  V1's (upper-right inner rim on hole 7's left greenside bunker at the green
  preset).
- Task 22: run the CSM protocol on a real desktop GPU; Task 23's visual
  judgment likewise.
- Task 27: blocked on the owner's phone.
- Back nine: not captured (owner: front nine only for the visual checks).
