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
| 9 | Bunker analytic normal field | B | pending | |
| 10 | Field atlas packer (+ V2 artifact compiler, ruling R6) | B | pending | |
| 11 | V2 ground shader (+ runtime V2 world, ruling R7) | C | pending | |
| 12 | Fairway directional material | C | pending | |
| 13 | Green/fringe/apron material pass | C | pending | |
| 14 | Cart-path hero ribbon | D | pending | |
| 15 | Forest edge V2 | D | pending | |
| 16 | Static shadow field | C | done | `static-shadow-field.ts`: fixed-sun (TERRAIN_LIGHT_DIRECTION) terrain self-shadow by ray march over the metric grid plus canopy-crown sphere occluders from `canopySymbols` (stylized crowns, never tree observations), world-space blur 1.5 m, R8 layers terrain/canopy/combined, `sampleStaticShadow`, `staticShadowLayer` for the atlas; basis `art_directed_static` (§71: not physically exact). Tests: flat plane lit, 10 m wall shadow length = h/tan(elev) within a cell and none sun-facing, crown shadows only downstream of woods, hole 7 deterministic (<4 s). Dynamic-vs-static comparison deferred to the lab (Task 26) |
| 17 | Structure GLB pipeline | D | pending | |
| 18 | InstancedMesh/BatchedMesh allocation | E | pending | |
| 19 | Artifact residency manager | E | pending | |
| 20 | Shader precompile | E | pending | |
| 21 | Shadow update discipline | E | pending | |
| 22 | CSM benchmark (high tier only) | E | pending | |
| 23 | Light-probe benchmark | E | pending | |
| 24 | Debug passes V2 | E | pending | |
| 25 | V2 budget validator | E | pending | |
| 26 | Canary visual suite | E | pending | |
| 27 | Physical iPhone calibration | E | blocked (hardware) | needs the owner's phone; protocol to be written with Task 26 |

## Rulings (plan defects decided during execution)

See the SDD ledger for the full text; the ones that change contracts are
repeated here as they land.
