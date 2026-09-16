# Meridian visual master plan: execution status

Tracks every numbered section of the Meridian visual master plan
(September 16, 2026 directive) against what has landed on
`agent/golf-course-geometry`. Status values: `done` (implemented and
verified, with the evidence named), `partial` (part landed; remainder
named), `deferred` (the directive itself marks it later or conditional, and
the trigger is named), `blocked` (needs something outside this machine, such
as a physical phone), `pending`.

Doctrine sections (rules rather than tasks) are marked `done` when the rule
is encoded somewhere enforceable: a schema, a test, a dependency guard, or
the visual-language document.

| § | Title | Status | Evidence / remaining |
| --- | --- | --- | --- |
| 0 | Executive directive | partial | V0–V1 landed (`95792455e`→ this commit); V2–V7 in progress. Tracker rows below are the per-section record. |
| 1 | What the current plan gets right (1.1–1.5) | done | Doctrine encoded in `docs/design/meridian-visual-language.md` (Layer A/B/C) and enforced by §7 guard |
| 2 | What the screenshots say | done | Baseline canaries `output/playwright/course-geometry/visual-system/canaries/v0-baseline` (96 captures) + sheet `docs/plans/assets/meridian-2026-09-16/canaries-v0-390x844.png` |
| 3 | Terrain is not truly perspective | done | Confirmed: V0 Terrain was orthographic pitch 50 / relief 1.5. Replaced by perspective in `terrain.ts` (`TERRAIN_PRESETS.terrain`) |
| 4 | Visual north star | done | North star written in `docs/design/meridian-visual-language.md` |
| 5 | Visual doctrine layers A/B/C | done | Layers A/B/C in the visual-language doc; `basis` markers on illustrative layers |
| 6 | Visual world contract (MeridianVisualArtifact) | pending | |
| 7 | Visual code boundary | done | ESLint `no-restricted-imports` block for canonical modules (`eslint.config.mjs`) + `visual-boundary.test.ts` (classification, no Three/component imports, no canonical writes) |
| 8 | Visual baseline captures | done | `scripts/golf/course-geometry/capture-visual-canaries.cjs`: holes 1,7,9,11,12,15,17,18 × Top/Terrain/Side × 390×844/430×932/768×1024/1440×1000 with `canaries.json` metadata; labels `v0-baseline`, `v1-perspective` |
| 9 | Camera system redesign (9.1–9.3) | done | Top orthographic; Terrain perspective FOV 32 pitch 44 relief 1.0; Side perspective pitch 20 yaw 30 relief 1.0 (`TERRAIN_PRESETS`); dual Three cameras in `three-renderer.ts` |
| 10 | Perspective camera fitting (10.1–10.3) | done | `perspectiveFit` bisection on eye distance, HUD-safe footprint, shift-lens principal point; target 45% route-mid / 55% green (`weightedTarget`); telephoto zoom; `framing.projection/fovDegrees/eyeDistanceM/targetBasis` |
| 11 | Camera orientation scoring | partial | Orientation search (±70°, fitted-footprint score, upright preference, green far) and HUD rejection via safe-area fit are in `orientation()`; canopy-occlusion scoring not implemented |
| 12 | Camera transitions | done | 260 ms cubic-out preset transition; ortho endpoints approached through a 0.5° FOV so projection never pops (`HoleSceneFrame.presetView`); auto-focus settle 320 ms |
| 13 | Faceting before polish | done | Audit before polish: `docs/plans/assets/meridian-2026-09-16/normal-continuity/*.json` show vertex-normal seams = 0°, dihedral P99 16–25° ⇒ faceting is tessellation, not lighting |
| 14 | Faceting debug kit | done | `terrain-debug.ts`: final, unlit, unlit-white, albedo, vertex-color, wireframe-elevation, display/source/flat normals, slope, curvature, no-shadow, shadow-only, feature/triangle/material IDs, context-mask; sheet `faceting-kit-hole-07.png` |
| 15 | Faceting isolation workflow | done | Isolation workflow: `?matrix=1&debug=<view>` and the lab; capture set `output/playwright/course-geometry/visual-system/debug-meridian/` |
| 16 | Normal continuity audit | done | `scripts/golf/course-geometry/audit-normal-continuity.mjs` reports P50/P95/P99/max by edge class (interior, material, feature, context) and vertex seams; run on holes 7 and 11 |
| 17 | Terrain material system | pending | |
| 18 | Macro turf variation | pending | |
| 19 | Micro turf response | pending | |
| 20 | World-space coordinates | pending | |
| 21 | Do not overuse noise | pending | |
| 22 | Fairway mowing redesign (22.1–22.3) | pending | |
| 23 | Green material | pending | |
| 24 | Fringe / collar | pending | |
| 25 | Boundary softness (25.1 ribbons, 25.2 fields) | pending | |
| 26 | Bunkers opportunity | pending | |
| 27 | Bunker truth architecture | pending | |
| 28 | Render-only bunker bowl math | pending | |
| 29 | Bunker visual depth policy | pending | |
| 30 | Future source-supported depth | pending | |
| 31 | Sand material | pending | |
| 32 | Bunker contact darkening | pending | |
| 33 | Visual surface sampler | pending | |
| 34 | Shot marker rule | pending | |
| 35 | Trees too uniform | pending | |
| 36 | Visual tree families | pending | |
| 37 | Trunks where they matter | pending | |
| 38 | Forest-edge-first rendering | pending | |
| 39 | Forest mass layer | pending | |
| 40 | Tree color redesign | pending | |
| 41 | Tree deterministic seed | pending | |
| 42 | Water system | pending | |
| 43 | Static water | pending | |
| 44 | Shoreline integration | pending | |
| 45 | Water depth not known | pending | |
| 46 | Lighting base | pending | |
| 47 | Lower presentation sun | done | `TERRAIN_LIGHT_DIRECTION = [.47, −.53, .706]` (elevation ≈45°, was ≈53°) |
| 48 | Warm sun + cooler sky | pending | |
| 49 | Reduce ambient flattening | pending | |
| 50 | Ambient occlusion | pending | |
| 51 | Atmospheric perspective | pending | |
| 52 | Background behavior | pending | |
| 53 | Context rendering | pending | |
| 54 | Cart paths | pending | |
| 55 | Structures | pending | |
| 56 | Surface hierarchy | pending | |
| 57 | Shot evidence in 3D | pending | |
| 58 | Resolved shot marker | pending | |
| 59 | Ambiguous position | pending | |
| 60 | Shot lines | pending | |
| 61 | Round Review filmstrip + active hole | pending | |
| 62 | Selected-shot camera | pending | |
| 63 | Putting visuals (63.1, 63.2) | pending | |
| 64 | Quality tiers | pending | |
| 65 | Low quality | pending | |
| 66 | Standard quality | pending | |
| 67 | High quality | pending | |
| 68 | Performance budget (68.1–68.4) | pending | |
| 69 | Runtime residency | pending | |
| 70 | Render telemetry | partial | Canvas dataset now carries projection, design/frame FOV, eye distance, style version, quality tier, shadow map size/type, light direction, CPU frame ms, draw calls, triangles, trees, DPR; GPU time (timer query) not yet |
| 71 | Development toolkit | done | Toolkit table in `docs/plans/2026-09-16-meridian-operations.md` |
| 72 | Direct Three.js remains | done | Direct Three.js r186 retained; no R3F (guarded by §7 boundary) |
| 73 | Spector.js | pending | |
| 74 | three-mesh-bvh | pending | |
| 75 | glTF Transform | pending | |
| 76 | gltfpack / meshoptimizer | pending | |
| 77 | KTX2 + Basis | pending | |
| 78 | glTF Validator | pending | |
| 79 | QGIS | pending | |
| 80 | QGIS review kit | pending | |
| 81 | GDAL | pending | |
| 82 | PROJ | pending | |
| 83 | mapshaper | pending | |
| 84 | Shapely / GEOS | pending | |
| 85 | PDAL | pending | |
| 86 | CloudCompare | pending | |
| 87 | OpenDroneMap | pending | |
| 88 | Blender Geometry Nodes | pending | |
| 89 | MapLibre | pending | |
| 90 | Cesium / 3D Tiles | pending | |
| 91 | WebGPU | pending | |
| 92 | WebGPU experiment route | pending | |
| 93 | Post-processing | pending | |
| 94 | Render-quality lab | done | Lab route `?lab=1&course=&hole=` (`src/test/fixtures/course-geometry/browser/meridian-lab.tsx`), URL-scriptable state, telemetry panel |
| 95 | Inspector controls | partial | Inspector: hole, area, preset, projection, FOV, pitch, yaw, relief, zoom, debug view, viewport, telemetry; light/material/seed/budget/tree toggles arrive with V2–V7 style overrides |
| 96 | Visual artifact compiler | pending | |
| 97 | Packed render attributes | pending | |
| 98 | Field textures vs attributes | pending | |
| 99 | Asset optimization pipeline | pending | |
| 100 | Visual versions | pending | |
| 101 | Cache policy | pending | |
| 102 | Offline packs | pending | |
| 103 | Phone/WebView testing | pending | |
| 104 | Battery test | pending | |
| 105 | Failure behavior | pending | |
| 106 | Testing architecture (106.1–106.4) | pending | |
| 107 | Human visual review checklist | done | Checklist in `docs/plans/2026-09-16-meridian-operations.md` |
| 108 | Implementation sequence V0–V7 | pending | |
| 109 | Which product packages first | pending | |
| 110 | Top five visual moves | pending | |
| 111 | Tools now vs later | done | Now/later table in the operations doc |
| 112 | Meridian visual kit | pending | |
| 113 | Style versions | pending | |
| 114 | Art direction centralized | partial | `docs/design/meridian-visual-language.md` written; `visual-style.ts` constant consolidation lands with V2 |
| 115 | Tooling process per course | done | Operations doc |
| 116 | Geometry review process | done | Operations doc |
| 117 | Visual compiler process | done | Operations doc; compiler lands with V2 |
| 118 | Observability | done | Codes table in the operations doc; emitted via `data-meridian-code` once the runtime paths land (V2/V7) |
| 119 | Risk register | done | Risk register in the operations doc |
| 120 | Things not to do | done | Don'ts in the operations doc |
| 121 | Near-term experiment (perspective spike) | done | Spike sheet `docs/plans/assets/meridian-2026-09-16/spike-121-holes-07-11.png`: V0 ortho vs V1 perspective for holes 7 and 11 (Terrain and Side) |
| 122 | Follow-up experiment (bunker spike) | pending | |
| 123 | Source and tool notes | done | Operations doc |
| 124 | Final success definition | pending | |
| 125 | Agent implementation brief A–I | partial | A (baseline + lab), B (perspective camera, all holes), C (faceting kit + audit) done; D–I pending |
| 126 | Closing product thesis | pending | |
