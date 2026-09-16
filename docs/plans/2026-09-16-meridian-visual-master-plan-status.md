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
| 0 | Executive directive | partial | V0–V3 landed (`95792455e` → `7d83a11c4` → `ea34cdb63` → this commit); V4–V7 in progress. Tracker rows below are the per-section record. |
| 1 | What the current plan gets right (1.1–1.5) | done | Doctrine encoded in `docs/design/meridian-visual-language.md` (Layer A/B/C) and enforced by §7 guard |
| 2 | What the screenshots say | done | Baseline canaries `output/playwright/course-geometry/visual-system/canaries/v0-baseline` (96 captures) + sheet `docs/plans/assets/meridian-2026-09-16/canaries-v0-390x844.png` |
| 3 | Terrain is not truly perspective | done | Confirmed: V0 Terrain was orthographic pitch 50 / relief 1.5. Replaced by perspective in `terrain.ts` (`TERRAIN_PRESETS.terrain`) |
| 4 | Visual north star | done | North star written in `docs/design/meridian-visual-language.md` |
| 5 | Visual doctrine layers A/B/C | done | Layers A/B/C in the visual-language doc; `basis` markers on illustrative layers |
| 6 | Visual world contract (MeridianVisualArtifact) | done | `visual-artifact.ts`: `MeridianVisualArtifact` (schemaVersion 1, `basis: visual_only`, package/terrain/style hashes, packed attributes, layer basis markers); `assertVisualArtifact` hash gate → `MERIDIAN_ARTIFACT_MISMATCH`; tests in `visual-artifact.test.ts` |
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
| 17 | Terrain material system | done | One ground shader (`attachTurfStyle`) fed by artifact attributes: macro, micro, route-local mowing, boundary lip, context, per-surface roughness; shared by lit material and `albedo` debug view |
| 18 | Macro turf variation | done | Macro turf 28/44/66 m, 2.5%, three directions, package-seeded (`MERIDIAN_STYLE.turf.macro`) |
| 19 | Micro turf response | done | Micro turf 0.4/1.2 m, 1.2%, derivative-filtered fade (`turf.micro`, `microFadeFwidth`) |
| 20 | World-space coordinates | done | All fields in world-space XY + package seed (`artifact.seed`); nothing swims under camera motion |
| 21 | Do not overuse noise | done | Per-layer amplitude caps guarded by `visual-style.test.ts` (macro ≤3%, micro ≤1.5%, mowing ≤3%); greens at 40%/55% of macro/micro |
| 22 | Fairway mowing redesign (22.1–22.3) | done | 22.1 route-local `(s, t)` attribute from the hole route; 22.2 bands along the play line, 6.5 m, 0.16 skew; 22.3 weight ramps to 0 over the last 3.5 m before the fairway edge, context fairways unmown |
| 23 | Green material | done | Green: roughness .78, quieter macro/micro, no mowing; class id in `golfSurfaceClass` |
| 24 | Fringe / collar | done | Collar (compiler material 4) keeps the fringe albedo, roughness .93; surround ribbon (material 3) roughness .95 |
| 25 | Boundary softness (25.1 ribbons, 25.2 fields) | done | 25.1 ribbons keep compiler width and albedo; 25.2 fields get a 0.6 m −5% lip from `golfBoundaryDistance` (cm-packed) |
| 26 | Bunkers opportunity | done | Bunkers now read as bowls in Terrain/Side (spike sheet `docs/plans/assets/meridian-2026-09-16/spike-122-bunkers-holes-07-11.png`) |
| 27 | Bunker truth architecture | done | Canonical outline + DEM stay; bowl lives in `artifact.layers.bunkerBowl` (`basis: visual_only`, `depthBasis: visual_class`) with a `VisualBunkerProfile` per bunker |
| 28 | Render-only bunker bowl math | done | Quintic smoothstep 6u⁵−15u⁴+10u³ of boundary distance / bowl radius (clamp .85×inradius to .6–3.5 m); zero on boundary vertices; gradient packed for normals (`compileBunkerBowls`) |
| 29 | Bunker visual depth policy | done | Size classes small <60 m² .30–.45, medium .45–.70, large >260 m² .60–.90 m, deterministic per feature id; context bunkers ×0.6 (`MERIDIAN_STYLE.bunker`) |
| 30 | Future source-supported depth | done | `depthBasis` field + `effectiveDepthM` honesty; a source-supported depth arrives as a new basis with provenance (visual-language doc) |
| 31 | Sand material | done | Sand roughness .82, 0.15–0.35 m grain at 1.5% (distance-filtered), floor darkens ≤8% with depth; rim ribbons keep sand-edge/highlight albedo |
| 32 | Bunker contact darkening | done | Turf within 0.6 m of a rim darkens ≤22% (baked into artifact albedo) |
| 33 | Visual surface sampler | done | `createVisualSurfaceSampler(mesh, artifact)`: elevation − bowl depth; `terrainHeight` unchanged for picks, outlines, framing |
| 34 | Shot marker rule | done | Markers, badges, segments and tracks project through the surface sampler (`projectSurface` in `shot-overlay-layout`; flight paths take the sampler); regions/outlines stay canonical |
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
| 46 | Lighting base | done | Light block in `MERIDIAN_STYLE.light` (sun colour/intensity, sky, ground, exposure); renderer reads it |
| 47 | Lower presentation sun | done | `TERRAIN_LIGHT_DIRECTION = [.47, −.53, .706]` (elevation ≈45°, was ≈53°) |
| 48 | Warm sun + cooler sky | done | Warm sun `#FFF4E2` 2.05 + cooler sky `#CFE0FF` |
| 49 | Reduce ambient flattening | done | Hemisphere intensity 1.2 → 1.05 |
| 50 | Ambient occlusion | pending | |
| 51 | Atmospheric perspective | pending | |
| 52 | Background behavior | pending | |
| 53 | Context rendering | done | Context features keep real surfaces, mixed 58% toward rough and desaturated 15% via `golfContextWeight` (albedo only, opaque) |
| 54 | Cart paths | pending | |
| 55 | Structures | pending | |
| 56 | Surface hierarchy | done | Brightness hierarchy green → tee → fairway → fringe → surround → rough → woods guarded by `visual-style.test.ts` |
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
| 70 | Render telemetry | partial | Canvas dataset carries projection, design/frame FOV, eye distance, style version + hash, artifact hash + source, meridian code, quality tier, shadow map size/type, light direction, CPU frame ms, draw calls, triangles, trees, DPR; GPU time (timer query) not yet |
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
| 95 | Inspector controls | partial | Inspector: hole, area, preset, projection, FOV, pitch, yaw, relief, zoom, debug view (+ bunker-depth), viewport, material layer multipliers, telemetry; light/seed/budget/tree toggles arrive with V4–V7 |
| 96 | Visual artifact compiler | done | `scripts/golf/course-geometry/compile-visual-artifacts.mts` (tsx): 18 holes, determinism check, cache round-trip, pack manifest |
| 97 | Packed render attributes | done | Packed attributes: Uint8 albedo/weights/roughness/class, Uint16 boundary cm + bunker mm, Float32 route (s,t); 19 B/vertex, 160–460 KB gzip per hole |
| 98 | Field textures vs attributes | done | Decision recorded in the operations doc: attributes now; field textures only if bunker rims / shorelines need sub-triangle detail |
| 99 | Asset optimization pipeline | pending | |
| 100 | Visual versions | done | `MERIDIAN_STYLE_VERSION` + `styleHash()` (by value) + `compilerVersion`; all carried in the artifact and telemetry |
| 101 | Cache policy | done | `visualArtifactCachePath`: `geometry/<site>/<packageHash>/visual/<styleHash>/<hole>.visual.json`; runtime compiles when missing, refuses when mismatched |
| 102 | Offline packs | done | `offlinePackManifest` + `pack-manifest.json` per course/package/style with hash-addressed terrain and visual entries |
| 103 | Phone/WebView testing | pending | |
| 104 | Battery test | pending | |
| 105 | Failure behavior | pending | |
| 106 | Testing architecture (106.1–106.4) | partial | 106.1 determinism + hash gate + cache round-trip (`visual-artifact.test.ts`); 106.2 camera round-trip (`three-camera.test.ts`); 106.3 style invariants (`visual-style.test.ts`); 106.4 visual canaries captured per label, automated pixel diff not yet |
| 107 | Human visual review checklist | done | Checklist in `docs/plans/2026-09-16-meridian-operations.md` |
| 108 | Implementation sequence V0–V7 | pending | |
| 109 | Which product packages first | pending | |
| 110 | Top five visual moves | pending | |
| 111 | Tools now vs later | done | Now/later table in the operations doc |
| 112 | Meridian visual kit | done | `src/lib/golf/course-geometry/visual-style.ts`: `MERIDIAN_STYLE` (palette, light, shadow, turf, mowing, boundary, surface, context, bunker, vegetation, water, haze) |
| 113 | Style versions | done | `meridian-v6` + value hash `meridian-v6-<fnv>`; captures carry `visualStyleHash` |
| 114 | Art direction centralized | done | Every taste constant lives in `visual-style.ts`; `docs/design/meridian-visual-language.md` describes each |
| 115 | Tooling process per course | done | Operations doc |
| 116 | Geometry review process | done | Operations doc |
| 117 | Visual compiler process | done | Operations doc + compiler script; Node ↔ Chromium hash parity verified |
| 118 | Observability | done | Codes table in the operations doc; emitted via `data-meridian-code` (MISSING/MISMATCH/SHADER_FAILED/CONTEXT_LOST) and recorded by the capture scripts |
| 119 | Risk register | done | Risk register in the operations doc |
| 120 | Things not to do | done | Don'ts in the operations doc |
| 121 | Near-term experiment (perspective spike) | done | Spike sheet `docs/plans/assets/meridian-2026-09-16/spike-121-holes-07-11.png`: V0 ortho vs V1 perspective for holes 7 and 11 (Terrain and Side) |
| 122 | Follow-up experiment (bunker spike) | done | Bunker spike: hole 7 and 11 Terrain/Side before (v2-material) vs after (v3-bunkers), sheet `spike-122-bunkers-holes-07-11.png`; profiles printed by the compiler |
| 123 | Source and tool notes | done | Operations doc |
| 124 | Final success definition | pending | |
| 125 | Agent implementation brief A–I | partial | A (baseline + lab), B (perspective camera, all holes), C (faceting kit + audit), D (ground material + artifact), E (bunker bowls) done; F–I pending |
| 126 | Closing product thesis | pending | |
