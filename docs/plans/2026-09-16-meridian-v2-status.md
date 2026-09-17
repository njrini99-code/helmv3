<!-- markdownlint-disable MD013 MD060 -->
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
| 12 | Fairway directional material | C | done | `fairway-direction-field.ts`: per-node mow direction from the fairway SDF (tangent of the nearest edge, stripe phase by distance along the hole), RG8 texture bound as `GOLF_V2_FAIRWAY`; GLSL sheen `floor + (1−floor)·pow(1−\|v·t\|, p)` with `sheenFloor` .75 and albedo amplitude .03 (the plan's .015 was invisible against the turf field). Weighted by the fairway SDF's own soft edge. Tests in `__tests__/fairway-direction-field.test.ts` |
| 13 | Green/fringe/apron material pass | C | done | `green-surface-v2.ts`: §27–34 band classifier (green/fringe/apron/run-off/rough) with CPU + GLSL mirrors, quiet-BRDF roughness per band, §31 micro-normal with a proven ≤1.14° tilt bound, slope-evidenced run-off weight; 20 tests. Wired in `ground-shader-v2` (`meridian-ground-v2-5`, c58a28a10): apron albedo on the fairway's last metres before the green (confined to the fairway winner — letting it reach the rough within `apronFairwayM` drew a lighter wedge with a hard seam at the hero-patch rim), band roughness, micro-normal spliced after `normal_fragment_maps` with a fwidth fade, V1's diagonal green mowing (route-relative uniform per hole). Run-off live since `meridian-ground-v2-6` (2026-09-17): the atlas's own relief channels (`dzdx`/`dzdy`, the 2 m grid's gradient resampled per texel — a bilinear field, independent of how the display mesh is triangulated, where the interpolated vertex normal changed slope at every decimated triangle edge and faceted the gate) go up as one RG16F texture per atlas beside its SDF texture (`GOLF_V2_RELIEF`, `RELIEF_FIELD_BINDING`, sampled through `golfV2SdfFrame`; decoded values via `fieldAtlasChannelTexels`, never the fixed-point codes); the fragment calls `golfV2GreenRunoff` with that slope and a four-tap SDF gradient at `GREEN_SDF_GRADIENT_STEP_M` (textureLod, no derivative in the branch), applies `runoff.mix` toward apron and the apron roughness, and only on the untracked rough share of the fragment (`1 - golfWeight` of a tracked winner, the 0.6 m surround in full, never woods — V1's rough/ground rule in shader terms), handed over gradually by the claiming band's fading confidence (`1 - golfGB.weight`; the cascade's hard hand-off, which V1 interpolates per vertex, drew a ring 3 m out on hole 5 per fragment). Proof: a CPU emulation of the shader from the uploaded texture data matches `greenBandsAt` on all 1540 near-green hero texels of hole 7 (831 vs 832 lit, worst 0.04); before/after lab frames (`v2-canaries/runoff-{before,after2}`, phone, green preset): holes 1 and 5 move 4.7 % / 5.5 % of the frame by 8–24 levels — a lighter close-mown band where the ground falls away from the green — hole 7 0.5 %: of its qualifying hero texels 67 % lie inside woods polygons and 13 % on fairway/sand/tee (both excluded, as in V1), 19 % on open rough. Known: the `awayDot` gate is a hard threshold (the mirror's own term), so a fall-away pocket can end in a soft-edged blob (hole 5 east side, a few levels); left as the plan's rule rather than smoothed. Compiler digests unchanged (upload-and-shade only); `sampleFieldAtlas` gained one CPU-side fix in the same commit — weights relative to the clamped texel, so the first texel's centre no longer reads its neighbour by a rounding hair (census counts unchanged). Hole 7 green/putting captured (front nine only per the owner) |
| 14 | Cart-path hero ribbon | D | done | `path-ribbon.ts`: one draped ribbon per hole from the context path runs (class widths, mitred corners, render-only Z lift), drawn as one `THREE.Mesh` by `three-world-v2-objects.ts`; ledger note honoured (one draw per hole, not per run — hole 18 has 14 runs). Tests `__tests__/path-ribbon.test.ts`, `three-world-v2-objects.test.ts` |
| 15 | Forest edge V2 | D | done (c58a28a10 fix) | `forest-edge-v2.ts` compiles crown/shrub/mass instances from the canopy symbols with V1's placement ratios; `three-world-v2-objects.ts` draws them as V1-style tree families with near/distant/far crown LODs ranked by distance to the tactical bounds (near cap 120), BatchedMesh crowns + trunks, InstancedMesh shrubs and near/far mass, crown self-shade (`canopyShade.self`), seeded lean and mirrored silhouettes. The first cut (lollipop crowns on thin trunks) was rejected on sight and rebuilt. Second defect (canary sheet): the woods read sparse next to V1 — a context woods polygon that runs kilometres past the hole widened the candidate scatter to ~30 m; the scatter is now clipped to the terrain extent and the budget trim prefers crowns nearest the played hole (V1 §38), hole 7: 710 crowns / 418 mass (was 513 / 258). Tests `__tests__/forest-edge-v2.test.ts`, `three-world-v2-objects.test.ts` |
| 16 | Static shadow field | C | done | `static-shadow-field.ts`: fixed-sun (TERRAIN_LIGHT_DIRECTION) terrain self-shadow by ray march over the metric grid plus canopy-crown sphere occluders from `canopySymbols` (stylized crowns, never tree observations), world-space blur 1.5 m, R8 layers terrain/canopy/combined, `sampleStaticShadow`, `staticShadowLayer` for the atlas; basis `art_directed_static` (§71: not physically exact). Tests: flat plane lit, 10 m wall shadow length = h/tan(elev) within a cell and none sun-facing, crown shadows only downstream of woods, hole 7 deterministic (<4 s). Dynamic-vs-static comparison deferred to the lab (Task 26) |
| 17 | Structure GLB pipeline | D | done (R8) | `structure-glb.ts` + `glb-writer.ts` + `scripts/golf/course-geometry/export-v2-glb.mts` / `report-structure-glb.mts`: footprint extrusions exported as world-scale GLB keyed by context structure id, ground-contact placement, loader contract for authored models. No authored Peek'n Peak models exist, so production keeps the extrusions (nothing invented); the V2 world draws V1's context structures and lines through `buildThreeContext` (ribbons dropped in favour of the V2 path ribbon; the lift pass applied — hole 9's condos were missing from V2 until c58a28a10). Tests `__tests__/structure-glb.test.ts`, `__tests__/glb-writer.test.ts`, `three-world-v2-objects.test.ts` |
| 18 | InstancedMesh/BatchedMesh allocation | E | done | `v2-batching.ts` (draw plan per object family, budget-aware LOD split) + `three-world-v2-objects.ts` (crowns, trunks, shrubs and mass one BatchedMesh each — the mass holds both cluster builds in the one draw — + 1 path mesh; hole 7 objects ≤ 12 draws, asserted). Per-camera crown LOD (§37/§68, renderer-redesign row 19 for V2): `buildForestEdgeObjects` records every crown/trunk/lobe and exposes `setDetail(next, focusM, view)` — V1's projected-radius rule over the batched forest (`setGeometryIdAt` / `setVisibleAt`, trunks sized for every crown and hidden under far ones, incremental triangle/LOD books) — the `v2-world` installer puts it on `debugV2.setDetail` and `three-renderer.ts` calls it beside `landscape.setDetail` on every 12 m eye move, 4 % focal change or 3° turn (`fitSun` + shadow rebake on change); the canvas dataset reports `v2TreeLod` / `v2Triangles`. New `PerspectiveLodView.frame` (lens basis + CSS frame, `projectedCrownPx`; the renderer hands it to the V2 forest only, V1's canopy keeps its eye-distance reading and stays pixel-identical): a crown behind the eye or off screen projects 0 px and never takes a near slot — without it, hole 7's approach spent the budget on the trees at the camera's back (13 near crowns in the picture) and hole 5's approach drew 80 px crowns faceted. V2's own thresholds (`V2_CROWN_LOD_SCREEN_PX`, V1's `vegetation.lodScreenPx` untouched), tuned for a 2–3× phone: near 8 CSS px (V1: 16), distant 6, `nearBudget` 240 (V1: 120), mass 8 (V1: 28) — the mid crown's and the mass outline's 20-triangle lobes read as facets from ~8 px, and hole 7's tee stands most crowns and its mid-hole mass clusters at 9–15 px. Hole 7 phone tee 485 k → 593 k render triangles (near 240 / distant 204 / far 266, mass near 122), green 327 k → 470 k, approach 409 k → 529 k; hole 1 tee 532 k → 377 k, hole 5 green 76 k → 64 k — inside V1's established phone envelope (608–675 k, master §39). `nearBudget` is the phone's cost knob if the §103 device run wants it lower. (`frameP95Ms` in these lab captures is the mount hitch — a P95 over the first ~24 renders — not a steady-state frame time.) Tests `__tests__/v2-batching.test.ts`, `three-world-v2-objects.test.ts` (per-view re-LOD, frame gate, books return to the build), `three-landscape.test.ts` (`projectedCrownPx`) |
| 19 | Artifact residency manager | E | done | `artifact-residency.ts`: `planArtifactResidency` keeps a nominal window of 3 holes resident around the current one under a per-tier byte budget (`defaultResidentBudgetBytes`), evicting the farthest holes first; deterministic. Tests `__tests__/artifact-residency.test.ts` |
| 20 | Shader precompile | E | partial (device before/after open) | `three-renderer.ts` runs `renderer.compileAsync(world, view)` after world setup and before the first paint, and the lab's debug views (`v2-lod*`, `v2-hero`, `v2-world`) install their materials before that call, so the V2 program set precompiles too; `shaderCompileMs` lands in the dataset (46–176 ms per hole on the Mac headless run below, software GL, so not a device number). Measured 2026-09-17: the hitch a phone pays at mount is not the shader compile but the synchronous world compile, now reported as `v2BuildMs` (canvas `data-v2-build-ms`, `terrain-debug.ts`): 4.6–13.4 s per hole (median 7.8 s) on the Mac before tonight's compile work, and it ran three times per hole because `HoleSceneFrame`'s stage presentation remounted the terrain per camera state (`<Drawing key={view}>`; fixed in c1f293a2f with `stageArea`/`snapPreset`, one build per hole, framing identical). bd010b92a then halved the compile itself: `buildSurfaceDistanceLayers` brackets each texel's centreline distance with a padded-grid EDT and scans only the segments a two-level bucket index places in that annulus (bit-identical on every production atlas of holes 3, 7 and 8 — 493×301, 285×717, 490×470 and the bunker frames, 6.08 M layer texels, 0 differing — and 6–9× faster), and `assembleV2World` compiles the atlas-default curvature and sky fields once for all five atlases. Hole 7: `assembleV2World` 9.8 → 4.1 s in Node, in-browser `v2BuildMs` 8.5 → 4.0 s (hole 8: 4.7 s); the ready frame diffs 0.30 % against the pre-change capture, exactly the run-to-run noise of two captures at the same commit (0.30 % ready, 1.0–3.4 % on the marked frames, all HUD and simulated-ball position), so the picture is unchanged. Then, output-identical (sha256 digests of every compiled array on holes 7 and 18 unchanged): b6053511b — the static shadow field bucketed crowns by "(z + r) / tan(elevation)" with absolute heights, so every node tested every crown (now a down-sun strip per crown; 0.88 → 0.07 s), forest-edge clearance tests pruned by ring boxes (0.6 → 0.15 s), sky-march offsets precomputed, typed-array percentile sort, LOD0-only runtime compile (`compileBaseDisplayLod0`), allocation-free grid sampler; ccad68c4e — the V1 artifact's cut/fill search and the canopy scatter pruned by boxes (the V1 landscape is still built under V2 for the surface sampler and context objects); 4b49cd033 — under the V2 world the V1 DEM shading texture and vegetation are skipped (`buildThreeLandscape({ underV2 })`, 0.78 → 0.45 s on hole 7) and the renderer reports `landscapeBuildMs`. 18-hole re-audit (`one-tap/audit-v2-fast`, Mac Chromium 390×844, 0 page errors): `v2BuildMs` 1.1–2.9 s (median 2.1 s; was 4.6–13.4 s, median 7.8 s), `landscapeBuildMs` .13–.77 s, ready 2.4–5.1 s after navigation (median 3.7 s), frames unchanged within capture noise. Still open: a compileAsync on/off first-frame measurement on a real device (Task 27); the remaining compile is the exact boundary SDF (~.85 s of hole 7's 2.2 s: the atlas tests assert exactness to 56 m), hero patches (~.35 s) and the whole/hero atlas texel loops. Per-stage split of the mount (Node on the Mac, `output/lab-build/mount-split.ts`, second run of each hole): hole 7 forest 158 / assemble 2209 / buildV2World 73 / weld 32 / ribbon 34 / objects 21 ms; hole 1 163 / 1692 / 44 / 36 / 43 / 12; hole 18 300 / 2643 / 61 / 61 / 85 / 14; hole 8 201 / 2471 / 64 / 51 / 63 / 13 — `assembleV2World` is 90–93 % of the mount and every stage before the THREE build is pure data (the compiled `V2WorldInput` is 17–24 MB, almost all typed arrays; the scene it carries is 3–4 MB of plain JSON). Proposal for the owner, not started: move `compileForestEdgeV2` + `assembleV2World` (+ weld/ribbon) into a module Web Worker (`new Worker(new URL('./v2-world.worker.ts', import.meta.url), { type: 'module' })` bundles under both the Vite lab and Next's webpack), transfer the typed arrays back, keep `buildV2World`/`buildV2Objects` on the main thread, and precompile the round's next hole while the current one is played, so the phone's UI stays responsive through the first hole's compile and later holes mount instantly. It changes the R7 fallback (today synchronous inside `createThreeTerrainRuntime`'s try block; `ready` would wait on the worker) and adds a bundler surface the app has no precedent for, and its payoff can only be measured on the phone (Task 27) — hence a proposal. The alternative is to keep shaving the exact boundary SDF and the atlas loops on the main thread. Two such passes landed after the split, each output-identical (sha256 digests of every compiled array — base, hero patches, whole-hole and hero atlases, bunker normals, fairway, shadow, sky, forest — unchanged on holes 3, 7, 8 and 18, `output/lab-build/v2-digest.ts`): 87f139c41 rewrites the boundary SDF's segment search — the bracket EDT runs as a two-pass sweep on the padded grid, the bucket index is CSR with a next-filled-cell skip list, the previous texel's nearest segment seeds the search radius, and each segment is rejected by its own `best + halfWidth` bound (a first cut that pruned by `best` alone as a centreline radius missed wider path segments; a brute-force texel test now guards the mixed-width case in `surface-distance-field.test.ts`) — hole 7's five atlases 1077 → 436 ms, `assembleV2World` 2.3 → 1.7 s (hole 18 2.7 → 2.0 s, hole 3 1.5 → 1.1 s); 4384e22cc reads the curvature and sky compiles from typed heights (`typedGridHeights`, extracted per call, not cached), walks the smoothing disc as clipped row spans in the original summation order and skips the atan/cos/sin of a sky ray with nothing above its level line — hole 7's curvature fields ~300 → ~27 ms, its two sky compiles ~283 → ~230 ms, `assembleV2World` ~1.7 → ~1.4 s (hole 18 ~1.65 s, hole 3 ~1.05 s, hole 8 ~1.65 s; Node on the Mac, warm). What remains of hole 7's ~1.4 s: the boundary SDF ~.38 s (segment search ~.31), the two sky marches ~.23, hero patches ~.23 (`compileBunkerAwarePatch`), the whole/hero atlas texel loops ~.13, `compileBaseDisplayLod0` ~.15, and a long tail of samplers under 60 ms each. In the lab (`v2-13-compile2`, Mac Chromium 390×844) hole 7's in-browser `v2BuildMs` is 1563–1670 ms against 2301–2313 ms in `v2-12-front9`, and its green, approach and tee frames match that run at 0.00 % pixel mismatch. Three more output-identical passes the same morning (e872fe50e, f636e5352, 31c110387; digests unchanged on holes 3, 7, 8 and 18): one curvature compile and one weld per mount instead of six and two (`DisplayLodOptions.curvature`/`welded`, `RegionPatchOptions.curvature`); the hero region compiler's "within reach?" tests by segment with a bounding-box reject, the patch rim taper capped at the taper, the fairway direction field's ring tests boxed, the bunker displacement and spacing-cap hooks answering beyond their bands without a signed distance; the field atlas sampling its five source fields through one bilinear footprint per texel and the samplers taking plain coordinates (`sampleMetricTerrainAt`, no point per sample); `selectRedTriangles` sweeping the split count once instead of recounting the mesh per binary-search step; the shadow march and the sky march on typed heights (the sky's interior nodes without edge tests). Tried and dropped as no faster: fusing the two sky compiles over their eight shared azimuths, and multiplying by a reciprocal in the sky march (8 %, and not identical). Warm `assembleV2World` in Node on the Mac now: hole 7 ~.96 s (2.2 s when the compile work began), hole 18 ~1.06 s, hole 3 ~.73 s, hole 8 ~1.07 s; the hole 7 stages: weld 48 / regions 70 / curvature 29 / sky 97 + 65 / LOD0 69 / patches 79 / bunker normals 20 / fairway 3 / shadow 69 ms, the five atlases ~450 (their boundary SDF ~330). Lab (`v2-14-compile3`): hole 7 `v2BuildMs` 1179–1198 ms and hole 8 1371–1389 ms (2597–2633 in `v2-12-front9`), all six frames at 0.00 % pixel mismatch against `v2-12-front9`. The SDF is now at a local optimum of its design (per texel: a hint from the previous texel, then a scan of the bracket's annulus over a two-level cell index; ~165 ns a call over ~1.6 M calls on hole 7); an exact answer needs that scan, and the next real step down is the Web Worker proposal above, or shipping precompiled fields. Closing checks on bc13929a9: the digests of every compiled array are identical on all 18 holes against c4d8080df (the commit before the compile work; `output/lab-build/v2-digest-base18.json` vs `v2-digest-now18.json`), three tests pin the equivalences the passes rely on (the incremental red-triangle sweep against a full recount at every budget, LOD0 from a caller's welded mesh and curvature fields against its own, hero patches from a caller's curvature fields against their own), and the 18-hole player-path re-audit (`one-tap/audit-v2-compile3`, same script, Mac Chromium 390×844) completes every hole with 0 page errors and the same seven steps as `audit-v2-fast`: `v2BuildMs` .71–1.46 s (median 1.14 s; `audit-v2-fast` 1.14–2.91 s, median 2.05 s), ready 2.1–3.8 s after navigation (median 2.8 s; was 2.4–5.1 s, median 3.7 s), `landscapeBuildMs` unchanged at .13–.77 s. Draw calls and triangle counts differ from `audit-v2-fast` by the forest re-LOD that landed between the two runs (a085a9fcc; the re-audit's records carry `v2TreeLod`, the baseline's do not), not by the compile passes, whose frames were checked against `v2-12-front9` above. The V1 landscape build under V2 (`landscapeBuildMs`, .13–.77 s: the visual artifact, the terrain mesh for picking and the context objects) was then the largest mount cost outside `assembleV2World`; profiled, it was the V1 visual artifact's `compileContextContact` (its cut/fill and shoulder pass ran the road/path polyline search once per triangle corner) and, behind it, the bunker contact bands testing every bunker's box per corner and three `sourceVertexNormals` per build. c8972408b answers the contact pass once per position (x, y, z) with a chunk-box reach reject before the polyline search, puts the bunker contact boxes on a coarse box grid and shares one normals array between the green complex and the fairway edges — every attribute array, the layers record and the artifact content hash identical on all 18 holes (`output/lab-build/artifact-digest.ts`, `artifact-digest-base18.json` vs `-now18.json`), compile 94–731 → 57–194 ms per hole in Node, in-browser `landscapeBuildMs` hole 8 769 → 255 ms and hole 7 442 → 179 ms (`one-tap/artifact-h08`, `-h07`; ready frames 0.01 % / 0.27 % from `audit-v2-compile3`, the marked frames differ only in the HUD toast and the walker's link line); fd8e048e3 pins the two prefilters (`boxGrid` lists every box holding a point, `withinChunks` never rejects a line within reach). Behind it, the forest compile (~140 ms on hole 7, ~260 on hole 18, outside `assembleV2World`) spent most of its time asking a region's rings "inside?" and "how far from the edge?" for every candidate, edge sample and band probe; e2b90fb7e puts each ring's edges on a cell grid for the crossing test (a horizontal ray only meets edges in its own row) and under two levels of run boxes for the boundary distance (the nearest run bounds the search; only runs whose box can still beat it are read) — `ring-index.ts`, exact by construction and asserted equal to `inRing`/`boundaryDistance` on vertices, edge points, box edges and a scatter over closed, open and degenerate rings; `assertForestEdgeV2` keeps the un-indexed `inFeature` as the independent check. A first cut that walked grid cells outward for the distance was slower than the plain scan for interior candidates (a point 100 m inside a woods polygon visits thousands of cells) and was replaced by the run boxes before landing. Every compiled array digest-identical on all 18 holes; forest compile hole 7 138 → 56 ms, hole 18 259 → 90, hole 8 170 → 86, hole 1 144 → 67 (Node, warm); in-browser `v2BuildMs` hole 18 1461 → 1341 ms, hole 7 1197 → 1149, ready frames unchanged within noise (`one-tap/forest-h07`, `-h18`) |
| 21 | Shadow update discipline | E | done | `shadow-bounds.ts` + renderer discipline: the fitted shadow camera only refits on camera-state changes (event-driven, §12), never per frame; `__tests__/three-renderer-discipline.test.ts`, `__tests__/shadow-bounds.test.ts` |
| 22 | CSM benchmark (high tier only) | E | scaffold (274df81c8) | `three-csm-benchmark.ts` (`installCsmBenchmark`/`removeCsmBenchmark`, 2 cascades, per-material `USE_CSM` patching, incompatible materials skipped), `scripts/golf/course-geometry/bench-csm.cjs`, protocol `docs/golf/course-geometry/csm-benchmark.md` with the results table left blank — headless Chromium has no GPU timer worth recording, so the run needs a real desktop GPU session. Not wired into the standard render path |
| 23 | Light-probe benchmark | E | rejected for production (R9) | `three-light-probe-experiment.ts`: manual SH probe grid (three 0.186 has no grid class), bent-sky ambient comparison, cube-capture bake; `docs/golf/course-geometry/light-probe-experiment.md` measures SH bytes and grid build time headlessly and recommends **reject** for the V2 production path (the static sky field + baked shadow already carry the depth cue at a fraction of the cost). Visual judgment on a real GPU frame still open |
| 24 | Debug passes V2 | E | done | `terrain-debug.ts` views `v2-lod0/1/2`, `v2-hero`, `v2-world`; `terrain.userData.debugV2` telemetry (draws, triangles, patches, object stats, forest LOD split) alongside `buildV2World` stats (atlas bytes, hero atlas count, fairway grain, static shadow, sky occlusion) — read from the lab, not yet written into the capture JSON; `terrain-debug-v2.test.ts` |
| 25 | V2 budget validator | E | done | `v2-budgets.ts` + `scripts/golf/course-geometry/validate-v2-budgets.mts`: phone/desktop tier budgets (`V2_BUDGETS`: base LOD ranges, hero patch budgets, close-frame triangle envelope, draws) validated per hole against the display-LOD report (`validateHoleBudgets` → violations with plan section and severity); `__tests__/v2-budgets.test.ts` |
| 26 | Canary visual suite | E | done (front nine run) | `scripts/golf/course-geometry/capture-v2-canaries.cjs` captures V1 (`debug=final`) and V2 (`debug=v2-world`) for every canary hole × top/approach/green × phone/desktop into one `canaries.json`; `canary-compare.ts` + `compare-canaries.mts` diff the two worlds (`__tests__/canary-compare.test.ts`). Owner limited visible checks to the front nine: runs `front9-sky` and `front9-final` (holes 7, 9 × 3 shots × 2 viewports × 2 worlds = 24 captures each, 0 errors) under `output/playwright/course-geometry/visual-system/v2-canaries/` (uncommitted, output/ stays local). `compare-canaries.mts --run`: V2 draws 17–22 vs V1's 8–10 and 2–5× V1's triangles; four §11 `close-frame-visible-runtime` warnings (green frames 333k–491k vs 90k on `front9-final`, with the woods at full density) because the V2 world always draws base LOD0 plus every forest instance — the fix is a view-dependent base LOD (LOD2 at green/putting; the LODs exist) and per-instance culling for the InstancedMesh families. Headless frame-time numbers are noise (software GL) and are not used. Whole-front-nine V2 run `v2-12-front9` (2026-09-17, ground shader -12 + per-camera crown LOD): holes 1–9 × green/approach/tee × phone, 27 captures, 0 errors; 10–23 draws (hole 5: 10, hole 8 tee: 23), 64 k–593 k rendered triangles (hole 5 green low, hole 7 tee high; the world estimate `v2Triangles` peaks at 714 k before culling), every frame `within` the 180 draw budget, V2 build 1.2–2.6 s |
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

- §11 close-frame triangle budget: the forest families are BatchedMesh with
  per-instance culling (a0d485d2b); the view-dependent base LOD was tried
  and reverted — the hero-patch rims are stitched against LOD0, so a
  coarser base under the green would open seams. Re-read 2026-09-17
  (`validate-v2-budgets.mts --tier phone` over the current display-LOD
  reports): on the *visible* reading (LOD0 minus the placeholders a patch
  replaces, plus the patches) every hole is inside §11's 90 k — hole 8 the
  highest at 81,483 (90.5 %), then 4 at 80,393, 2 at 80,078, 18 at 78,010,
  11 at 78,185, 7 at 72,653; the conservative envelope (LOD0 + every hero
  budget, a double count by design) warns only on hole 8 at 90,800 (101 %).
  The other twelve warnings are §10 LOD1/LOD2 *lower*-range advisories on
  small holes (a par 3 has fewer triangles than the range floor), not
  overruns. Closed on the visible reading; the envelope warn stays advisory.
- Crown LOD on the phone: the V2 forest now re-LODs per camera like V1's
  (row 18); the retuned thresholds cost 20–40 % more triangles on the dense
  hole 7 frames than the old static focus split and save 15–30 % on holes 1
  and 5 — all inside the phone loads V1 already carried. If the §103 device
  run shows the tee view dropping frames, lower `vegetation.lodScreenPx.nearBudget`
  (240) first; the rule and the frame gate stay. `v2-12-front9` (row 26)
  is the whole-front-nine reading with the new LOD: 64 k–593 k rendered
  triangles, 10–23 draws, nothing over budget.
- Player-view draw budget (§93): the "~350 draws" figure predates the
  batching work — renderer-redesign status row 26 recorded 14 draws for the
  hole 7/11/17 player view at the standard tier, and the One-Tap audit
  (`output/playwright/course-geometry/one-tap/audit-v2-fast.log`, player
  mode, world=v2) shows 10–29 draws across all 18 holes (hole 7: 22, build
  2.3 s; after the forest re-LOD and the compile passes, `audit-v2-compile3`:
  10–28 draws, hole 7: 21, build 1.2 s). Within the 160 target / 180 hard
  budget; nothing left to do here short of the §103 device run.

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
  <https://helmv3-gzq7z9epz-nick-rinis-projects.vercel.app>
  (dpl_DSoz5v3N1xuJk2gAuzLMVA5rYSwM, READY, 121 MB upload, 7149 files).
  Verified through `vercel curl`: the manifest, the package, hole 7's
  terrain and the context layer are served byte-identical to `public/`.
  Vercel Authentication is on for previews, so the phone browser signs in
  to Vercel once. Not verified on a phone yet (Task 27). Superseded
  2026-09-17 09:18 EDT by a preview from f6e67e6b4 (the same CLI path;
  116 MB upload), which carries the one-build-per-hole fix, the compile
  passes and the forest re-LOD the 00:35 preview predates:
  <https://helmv3-dparkfrkr-nick-rinis-projects.vercel.app>
  (dpl_2VEGmV2oRS3WyiEBSYWeXcfcyDaT, READY; manifest, package and hole 7
  terrain byte-identical to `public/` through `vercel curl`). Superseded
  again at 09:44 EDT by a preview from ce050158c, which adds the visual
  artifact pass (c8972408b): <https://helmv3-42lran28z-nick-rinis-projects.vercel.app>
  (dpl_AxTqLE8MWQr5kf3XbsmWHoWSoZpV, READY; manifest, package, hole 7
  terrain and the context layer byte-identical to `public/`). Superseded
  at 10:30 EDT by a preview from f655171a9 (adds the forest ring index,
  e2b90fb7e; the CI workflow completed green on that commit — TypeScript,
  Lint, Static checks, three unit shards, Supabase lint + RLS, Next build):
  <https://helmv3-4o21r2jb6-nick-rinis-projects.vercel.app>
  (dpl_DP7dZiKLZjVDBMfcLP2G7egRH1vm, READY; manifest, package, hole 7
  terrain and the context layer byte-identical to `public/`). This is the
  phone URL; the earlier previews are stale.
- First on-course phone run, 2026-09-17 13:31 EDT (Safari, Private tab, the
  4o21r2jb6 preview): the Upper round (`golf_rounds` 91301a75, course name
  "Peek’n Peak Resort — Upper Course", pars matching the package) opened on
  the standard tracker ("Course outline unavailable · Schematic context")
  and stayed there — no Meridian Live. Ruled out from the machine: the
  shipped policy accepts the shipped manifest/package (real
  `PEEK_N_PEAK_ONE_TAP_V1`, no override — now a unit test), the deployed
  commit carries the approved hash and `preview: true`, `standardOverride`
  is plain component state. Not distinguishable remotely: a fetch failure
  under Vercel SSO, a denied location, or simply the load — the hook fetched
  the package plus all 18 terrain meshes (52 MB raw, ~12 MB brotli)
  sequentially, twice (preflight, then load), before it could resolve, and
  dropped the eligibility verdict, so the phone had nothing to say.
  0b56ac819: Live now resolves after the package and the current hole's
  terrain (~1.2 MB compressed), streams the other holes behind it (same
  pkg/holeKeys/location/transport references, so the live hole's round
  state is never re-initialised), and the standard tracker shows one status
  line for an Upper round — "loading course…", "loading hole terrain n/18…",
  or "Meridian Live off · <reason>" (location blocked, course files did not
  load, flag off, package mismatch, error) — `OneTapLiveStatusRow`. The
  next phone screenshot names the cause.
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
  after it: 4.0 s; after the whole compile pass, 1.1–2.9 s on all 18 holes,
  then .7–1.5 s after the five output-identical passes — Task 20 row). The last hole renders NEXT HOLE disabled, which the
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
  missing from the V2 ground versus V1 after v2-11: nothing on this list
  (fairway edge types landed in v2-10, context zones and desaturation in
  v2-11).
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
  preset). `meridian-ground-v2-12`: the floor shade divides each bowl
  vertex's offset by its own bunker's profile depth (`golfV2Floor`,
  `bunkerFloorShares` in three-world-v2.ts, owner = the profile the vertex
  lies deepest inside, as `bunkerDisplacement` chose) instead of one 0.7 m
  range, V1's `floorShade · depth / bowlDepthM`; `lod-final` vs
  `floor-after` on 7/1/5 green/approach moves ≤ 1.1 % of pixels by > 1
  level and none by > 3, all on bunker floors.
- Fairway edge types in V2 (`meridian-ground-v2-10`, 2026-09-17, fidelity §65
  #3 / §10 / §10.3): fairway fragments within `fairwayEdge.fieldM` (0.8 m) of
  the outline darken by V1's crisp lip (4.5 %) within 8 m of a bunker or
  green outline (either atlas SDF, own and context) and by the soft lip
  (1.5 %) elsewhere, full on the outline, linear to nothing at 0.8 m; under
  GOLF_V2_RELIEF the lip strengthens by up to 80 % where the relief slope
  rises outward from the fairway (the shoulder; outward = minus the fairway
  SDF's four-tap gradient) and softens where it falls away. Mirror
  `fairwayEdgeAt` + hole-7 census in `ground-shader-v2.test.ts`. The term is
  as quiet as V1's: a 1–3 level line along the whole outline (0.14 % of a
  phone frame's pixels move by > 1 level, none by > 4), so no before/after
  sheet was sent.
- Outside-world context in V2 (`meridian-ground-v2-11`, 2026-09-17, fidelity
  §65 #5, master §53, outside-world §10–16/§21): `ground-context-v2.ts`
  compiles two per-vertex floats at world build (no V2 artifact change) —
  `golfV2Context` = V1's `contextWeight` by feature identity (the base
  mesh's `triangleFeatures` against `scene.contextFeatures`; a hero patch,
  which has no features, falls back to point-in-polygon minus woods), and
  `golfV2Zone` = V1's zone blend `min(1, edge / 5 m)` for rough/ground
  vertices inside a painted context zone (`GROUND_ZONE_PRIORITY`, uncertain
  skipped), negative for a non-turf zone (parking). The vertex colour and
  roughness take the zone's own by that weight. Shader: a context
  fairway/green/collar's atlas colour mixes `context.roughMix` (58 %) toward
  rough, every context fragment desaturates `context.desaturate` (15 %) as
  the last colour step, the rough hierarchy's share and the §20 setting give
  way by the zone weight (the zone keeps V1's full slope darkening), and a
  non-turf zone drops the turf fields. `V2WorldInput` gains `scene` and
  `featureIds` (optional; synthetic inputs get zeros). Tests:
  `ground-context-v2.test.ts` (synthetic + Upper holes), shader structure,
  and a hole-1 world test (ski-slope vertex carries the zone albedo).
  Frames `context-after` vs `fwedge-after`: neighbouring holes' greens and
  fairways go quiet on 7/1/5 while the hole's own stay.
- Task 22: run the CSM protocol on a real desktop GPU; Task 23's visual
  judgment likewise.
- Task 27: blocked on the owner's phone.
- Back nine: not captured (owner: front nine only for the visual checks).

## Owner handoff — 2026-09-17 morning

What landed overnight on `agent/golf-course-geometry` (PR #1939), all
pushed, `output/` uncommitted:

- V2 forest re-LODs per camera with a picture-frame gate (a085a9fcc, row
  18); V2 bunker floors shade per bunker (fce6348a7, ground shader -12).
- The branch's CI gates cleared: registry glob for the held migration,
  generated docs, dead-ref baseline, lint ratchet, the semgrep RLS rule
  (529ce7c28); the markdownlint ratchet, exactly at baseline (617efba5f);
  squawk on the held migration and the World Model (41dbaef7f); CodeQL's
  one alert on the PR, a `--course`-built RegExp in
  `validate-v2-budgets.mts`, replaced by prefix/suffix matching (8d57b1020).
  On 8d57b1020 the CI aggregate, the Review Gate aggregate, Static checks,
  Supabase lint + RLS, TypeScript, Lint, the three unit-test shards and the
  Next build all pass and CodeQL reports no open alert for the PR. The only
  red seen overnight that this branch did not cause was the edge-functions
  Deno check on one earlier run (a minimum-dependency-age transient).
- Whole-front-nine V2 run `v2-12-front9` recorded in row 26.
- Task 20 carries the per-stage mount-compile split and a Web Worker
  proposal (not built), plus five output-identical compile passes that
  landed after it (87f139c41, 4384e22cc, e872fe50e, f636e5352,
  31c110387): hole 7's `assembleV2World` ~2.2 → ~.96 s in Node and its
  in-browser `v2BuildMs` 2.3 → 1.2 s, every compiled array
  digest-identical on all 18 holes against c4d8080df and every lab frame
  at 0.00 % pixel mismatch; bc13929a9 pins the equivalences in tests, and
  the 18-hole player-path re-audit (`one-tap/audit-v2-compile3`) completes
  with 0 page errors at `v2BuildMs` .71–1.46 s (was 1.14–2.91 s).
- The V1 visual artifact still compiled under V2 was the next mount cost
  (`landscapeBuildMs` .13–.77 s); c8972408b cuts it to about a third,
  artifact content hash identical on all 18 holes (hole 8 in-browser
  769 → 255 ms); e2b90fb7e then halves the forest compile on a ring index
  (hole 18 259 → 90 ms), every compiled array still digest-identical on
  all 18 holes. The phone preview is from f655171a9 and carries both:
  <https://helmv3-4o21r2jb6-nick-rinis-projects.vercel.app> (never
  production; the One-Tap migration is still unapplied, so the HUD shows
  "Sync issue" until the owner says migrate).

Not done, and not mine to do: landing PR #1939 (CI green is not
authorisation), the production deploy, applying the One-Tap migration,
the §39 per-hole confirmation, and the phone runs behind Tasks 20/27 and
master §103/104 (`vegetation.lodScreenPx.nearBudget` retune waits on them).
