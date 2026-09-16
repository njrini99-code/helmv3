# Course renderer redesign (digital twin direction): execution status

Tracks the "Helm Course Renderer Redesign — Detailed Visual Direction &
Asset Upgrade Plan" (30 sections, 2026-09-16) on `agent/golf-course-geometry`.
It is the third governing document beside the Meridian master plan
(`2026-09-16-meridian-visual-master-plan-status.md`) and the outside-world
spec (`2026-09-16-outside-world-status.md`); the 3D Course Fidelity Master
Spec is tracked in `2026-09-16-fidelity-status.md`. Where the redesign asks
for the same thing as those, the row points at the tracker that owns it.

Doctrine that does not change: evidence first, visuals decorate but never
invent, hash gates, `basis` markers, source-only context (§24 accuracy first).

Proof / hero hole (§28 phase 1): Peek’n Peak Upper hole 7 (varied terrain,
bunker complex, tree line, pond, buildings, road, ski slope beside it).

| § | Topic | Status | Where / remaining |
| --- | --- | --- | --- |
| 1–5 | Summary, failure modes, philosophy, north star | done | Encoded here and in `docs/design/meridian-outside-world.md`; the world model (package + terrain + context layer) is the source of truth, the renderer reveals it |
| 3.1 / 7 | Turf as a material system | done (v1; worn turf source-limited) | Turf roughness, macro/micro fields, mowing, edge types, first cut + three rough tiers, apron; blade-height/density cue: micro amplitude by class (rough ×1.6, surround ×1.25, fairway/tee ×1, apron ×.8, fringe ×.7, green ×.55). Worn turf would need a condition source; never painted from noise |
| 3.2 / 9 | Volumetric bunkers (shoulder → rim → lip → face → floor) | done (v1) | Bowl, rim ribbons, render-only turf lip (4–10 cm, seeded), per-bunker edge variation, floor macro; families (pot < 40 m², greenside within 25 m of a green ring, fairway) scale depth ×1.25/1/.85 and lip ×1.2/1.1/.9; overhang shadow: sand within 1.6 m inside the sun-facing rim darkens up to 32 % (hole 7 green state: 5 % of sand pixels ≥ 22 levels darker, all in rim crescents) (`SUN_GROUND` from the terrain light direction, display only). Compiler `meridian-visual-compiler-4`, style `meridian-v9` |
| 3.3 / 8 | Greens as landforms | partial | Green from DEM, collar ring, apron neck, edge lip, pad-setting shade; tier reading blocked without green-contour source |
| 3.4 / 10 | Vegetation hierarchy | partial | Seven families, edge/interior placement, mass, trunks, understory, context woodland; landmark-tree records and dead-space rhythm pending |
| 3.5 / 11 | Buildings as landmarks | partial | Footprint extrusions with source height/levels; roof form/ridge/pitch pending (needs source roof tags or a correction layer, never guessed) |
| 3.6 / 13 | Water basin and banks | partial (source-limited) | Static Fresnel, shoreline band, contact shade, water roughness .52 (no sun mirror); basin shaping v1: render-only bank berm (`water.bankLipM` .10 m over a 1.2 m band, zero on the shoreline vertex, shares `lipLiftMm` with the bunker lip) so the pond sits below its banks; bank vegetation needs a source (no shoreline tree/reed tags) |
| 3.7 / 6 | Terrain breaklines and multi-scale terrain | pending | Terrain compiler preserves feature edges; breakline conformance for paths/banks and meso mounding pending (compile-course-terrain.py) |
| 3.8 / 16 | Contact and shadow | done (v1) | Fitted shadow map, canopy contact shade, bunker/shore contact bands; ground contact under context objects (`contextContact`: 10 % within 1.5 m of a building footprint, 6 % under a path and fading over a .8 m shoulder; sand, water and uncertain zones untouched) |
| 3.9 / 18 | Camera modes | done (states) | Tee / approach / green / putting states + review flythrough pending (Meridian V6 storytelling) |
| 12 | Roads, paths, hardscape | partial | Class-typed ribbons with widths; shoulder shade on the ground beside every ribbon (`contextContact.pathShoulderM`); cut/fill pending (needs terrain breaklines, 3.7) |
| 14 | Native ground and secondary materials | partial | native / open field / wetland / parking / ski slope classes painted from source zones; soil, mulch, pine straw pending (need source) |
| 15 | Small assets | pending | Only tee markers/flag today; course-specific only, never clutter |
| 17 | Atmosphere | done | Capped haze, sky dome, distance desaturation (Meridian V5) |
| 19 | LOD | done (v1) | Formal rules: LOD0 near crowns (icosahedron detail 2 + detailed trunks) only when the camera scale > 4.5 px/m and the tier allows near crowns; LOD1 distant crowns (dominant lobes detail 1, minor lobes detail 0, ~460 tri) for the hole view; LOD2 forest mass lobes for interior woods beyond the crown budget; LOD3 hidden trunks; far crowns (every lobe at icosahedron detail 0, ~160 tri) beyond 300 m of the focus. All crowns render as one `BatchedMesh` and all trunks as another (per-tree LOD via `setGeometryIdAt`, per-instance culling), so LOD never changes the draw count; LRU terrain residency keeps three holes |
| 20 | Asset quality rules | partial | Seeded variation in scale/orientation/silhouette/colour; asset-level breakup pending |
| 21 | Pipeline | done | Sources → package → terrain → context layer → visual artifact → renderer |
| 22 | Accuracy priorities | done | Adopted as the fidelity work order (§65) |
| 23 | Manual correction workflow | partial | Sidecar format defined and generated by `scripts/golf/course-geometry/build-qgis-review-kit.py` (`review-adjustments.geojson`: featureId, decision accepted/adjust/reject, note, reviewer, reviewedAt; editable QGIS layer, source layers read-only). Import step that applies decisions with provenance pending |
| 24 | Accuracy over generic beauty | done | Doctrine; enforced by source-only zones and the uncertain-share gate |
| 25 | Visual acceptance tests | partial | Grayscale test run on hole 7 tee state (`scratchpad` → recorded in fidelity §48–50 row): green/fairway/bunker/tee/path separate, water–rough weakest; recognition/silhouette/landmark tests pending a human pass |
| 26 | Performance acceptance | done (v2, Mac Chromium) | Player view phone Terrain with the context layer bound, standard tier: hole 7 14 draws / 437 k triangles, hole 11 14 / 574 k, hole 17 14 / 635 k against the 160 budget (was 164 / 200 / 168 with per-tile-and-design instancing, ~350 originally); crowns and trunks are one batched mesh each. Frame P95 19–21 ms CPU in headless SwiftShader (not a device number). `multiDrawBasis` reports whether `WEBGL_multi_draw` backs the single call. Real-device numbers remain the §103 human step |
| 27–30 | What not to do, build sequence, definition of done, standard | done | Followed: phases map to fidelity §65 order; DoD adopted per hole |
