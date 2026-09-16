<!-- markdownlint-disable MD013 -->
# Meridian operations: processes, checklist, observability, risks

Companion to the master-plan status tracker
(`docs/plans/2026-09-16-meridian-visual-master-plan-status.md`) and the
visual language (`docs/design/meridian-visual-language.md`). This file
holds the sections of the master plan that are processes and rules rather
than code: §107, §111, §115–120, §123.

## Tools now vs later (§71–92, §111)

| Tool | Decision | Where |
| --- | --- | --- |
| Direct Three.js (r186) | keep; no R3F (§72) | `three-renderer.ts` |
| Spector.js | dev only, lab `?spector=1` | `meridian-lab.tsx` |
| three-mesh-bvh | benchmark only; picking is one mesh, one ray per tap | see status §74 |
| glTF Transform, gltfpack, glTF Validator | asset pipeline for Blender GLBs | `scripts/golf/course-geometry/optimize-glb.mjs` |
| KTX2 / Basis | when a texture appears (none today) | deferred |
| QGIS 4.2, GDAL 3.13, PROJ 9.9, mapshaper, Shapely | geometry review kit | `scripts/golf/course-geometry/build-qgis-review-kit.py` |
| PDAL, CloudCompare, OpenDroneMap | when a point cloud or drone flight exists | deferred |
| Blender Geometry Nodes | authored props only | deferred |
| MapLibre, Cesium / 3D Tiles | not for hole scenes | no |
| WebGPU | experiment route `?meridianRenderer=webgpu` | deferred until Three's WebGPU path is stable on WebView |
| Unity / Unreal | no | — |

## Per-course tooling process (§115)

1. Retain the OSM extract, USGS 1 m tile, NAIP export (immutable, hashed).
2. `prepare-osm-course` → package fixture + association report.
3. `compile-course-terrain` → per-hole meshes with source normals and metric grid.
4. `derive-canopy-naip` → reviewed woods; re-run 2 and 3.
5. `review-course-imagery` → dossier and contact sheet.
6. `build-course-world` → normalized study, physical world, truth gate, GLB.
7. Visual compile (§117) → `MeridianVisualArtifact` keyed by package hash + style hash.
8. Canary captures (§8) → compare against the previous label before merging.

## Geometry review process (§116)

- Review in QGIS against native NAIP with the review kit; record every
  correction as a source edit, never a render tweak.
- A boundary that disagrees with imagery by more than the recorded
  uncertainty blocks `reviewed: true`.
- A hole passes the truth gate only with a human review, a recorded
  uncertainty, and a tee/green endpoint pair.

## Visual compiler process (§117)

- Input: package (hash), terrain mesh (hash), style (version + hash).
- Output: `MeridianVisualArtifact` with `canonicalPackageHash`,
  `terrainHash`, `styleHash`, packed attributes, and `basis: 'visual_only'`.
- Gate: the runtime refuses an artifact whose `canonicalPackageHash` differs
  from the loaded package (`MERIDIAN_ARTIFACT_MISMATCH`).
- Cache: `geometry/<site>/<packageHash>/visual/<styleHash>/` (§101).

## Human visual review checklist (§107)

Run on the canary set for each style version. Each line is pass/fail with a
note; a fail on a hard line blocks the version.

Hard lines:

- Terrain reads as a real camera (convergence, near/far size change), not a tilted map.
- No invented truth: no bunker depth, tree, water depth or pin drawn as data.
- Shot markers sit on the drawn surface; ambiguous shots show a region, not a point.
- Green and tee are both visible inside the HUD-safe area in every preset.
- No shimmer or swimming of turf variation under orbit, zoom, or resize.
- Shadows come from the one world sun; no detached dark patches.

Soft lines:

- Fairway/rough boundary softness reads as mowing, not a stroke.
- Bunker bowls read as depressions, with a contact band and no rim halo.
- Trees vary in silhouette and tone; forest edge reads as trees, mass as mass.
- Water reads still and reflective, with a clean shoreline.
- Haze separates far context from the played hole without greying the green.
- Draw calls and triangles within the tier budget (§68) in the telemetry.

## Observability (§118)

Every code is emitted through the canvas dataset (`data-meridian-code`) in
the harness and through the runtime's `onUnavailable` reason in the app.

| Code | Meaning | Action |
| --- | --- | --- |
| `MERIDIAN_ARTIFACT_MISMATCH` | visual artifact hash ≠ loaded package | drop the artifact, render from canonical only |
| `MERIDIAN_ARTIFACT_MISSING` | no artifact for package + style | compile at runtime or render plain |
| `MERIDIAN_CONTEXT_LOST` | WebGL context lost | fall back to the SVG outline |
| `MERIDIAN_SHADER_FAILED` | program compile failure | fall back to the SVG outline |
| `MERIDIAN_BUDGET_EXCEEDED` | frame or draw-call budget exceeded for the tier | step the quality tier down |
| `MERIDIAN_FIT_FAILED` | perspective fit could not bracket a solution | fall back to orthographic Top |
| `MERIDIAN_COVERAGE_MISSING` | tactical point without elevation | Terrain/Side unavailable, Top only |

## Risk register (§119)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Perspective fit hides tee or green under HUD at unusual aspect ratios | medium | high | HUD-safe fit in `terrain-viewport.ts`; canaries at four viewports |
| Turf noise reads as data (wet patch, damage) | low | high | amplitude caps (§21), no noise on greens at Top, checklist hard line |
| Bunker bowls mistaken for surveyed depth | medium | high | `basis: visual_only`, markers via visual sampler only, no depth in metrics |
| Tree budget drops the forest edge on large holes | medium | medium | edge-first allocation, forest mass layer |
| Phone WebView frame time over budget | medium | high | quality tiers, DPR cap, telemetry, real-device test before release |
| Style change silently alters cached artifacts | low | medium | style hash in cache key and every capture |
| Compiler tessellation faceting persists | high | medium | normal-continuity audit; adaptive tessellation in the compiler is the fix, not smoothing |

## Things not to do (§120)

- Do not smooth, blur, or fake normals to hide faceting; fix tessellation.
- Do not exaggerate relief by default; 1.0 is the truth.
- Do not draw a pin, ball, or depth that no source supports.
- Do not move a boundary to make a ribbon look better.
- Do not add a post-processing stack for a look the material can carry.
- Do not add React Three Fiber, a game engine, or a map SDK for hole scenes.
- Do not let visual code import reconstruction internals to "adjust" them.
- Do not ship a debug view, the lab, or the harness to a player route.
- Do not rely on browser-side randomness; every seed is content-derived.
- Do not read the frame budget from a desktop; read it from the phone.

## Source and tool notes (§123)

- USGS 3DEP 1 m DEM (NAVD88), NAIP leaf-on imagery, OSM golf tags; all
  retained with hashes under `src/test/fixtures/course-geometry/sources/`.
- Blender 5.2.1, GDAL 3.13.3, PDAL, PROJ 9.9, QGIS 4.2.2, mapshaper, ruff on
  this machine; three 0.186.0, vitest 4, Playwright 1.62 in the repo.
