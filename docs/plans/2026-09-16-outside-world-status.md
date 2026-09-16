# Outside-world / production player view: execution status

Tracks the production player-view, outside-world detail and non-playing
context rendering spec (2026-09-16) on `agent/golf-course-geometry`, in the
spec's own immediate action order (§42). Status values as in the Meridian
tracker: `done` (implemented and verified, evidence named), `partial`,
`pending`, `blocked` (needs a human review pass or a device).

Authoring contract: `docs/design/meridian-outside-world.md`.
Proof course: Peek’n Peak Upper (package `fdec6ea8…`).

## §42 immediate action list

| # | Action | Status | Evidence / remaining |
| --- | --- | --- | --- |
| 1 | Keep the current matrix as an internal QA artifact | done | Course matrix, canaries and the lab stay under `src/test/fixtures/course-geometry/browser` and `scripts/golf/course-geometry/capture-*.cjs`; nothing player-facing links to them (§2.1) |
| 2 | Define the outside-world taxonomy in code and authoring docs | done | `src/lib/golf/course-geometry/context-taxonomy.ts` (9 groups, 50 classes, fidelity tiers §33, render treatment, §39 prompts), shared OSM rules `context-rules.json`, doc `docs/design/meridian-outside-world.md`; test `context-layer.test.ts` |
| 3 | Add a context/landcover pass to the pipeline | done | `fetch-osm-context.py` (bounded, retained: `sources/peek-n-peak-upper-osm-context`, 607 elements) → `prepare-context-layer.py` → `peek-n-peak-upper-context.json` (`golfhelm-context-layer-v1`, 168 zones, locked to the package hash) + `peek-n-peak-upper-context-report.json`; `parseContextLayer` refuses other packages (`MERIDIAN_CONTEXT_LAYER_MISMATCH`); scenes carry `contextZones` |
| 4 | Review the worst “anonymous green space” holes first | partial | Report ranks holes by unexplained share of their drawn context (beyond the derived rough bands and every source zone): 2 (49 %), 8 (43 %), 7 (41 %), 4 (39 %), 6 (35 %), 3 (35 %). Rendering of the derived rough hierarchy and zones follows; the human §39 pass stays open |
| 5 | Add cart path and built-context support | done | `three-context.ts`: terrain-conforming ribbons (cart/service/road/crossing/bridge/stream/drainage, style `contextObjects.ribbons`), building/clubhouse/maintenance extrusions from the terrain, fence/wall/lift lines; counts in telemetry (`contextRibbons`, `contextStructures`, `contextZones`); lab `ow1-*`, `rh1-*` captures. Open: minor ribbon gaps at OSM way ends |
| 6 | Improve forest-edge generation and understory logic | done | Understory shrub clusters inside the reviewed forest edge (1.5–10 m band, budget 220, `three-landscape.ts`, style `vegetation.understory`); OSM `forest_mass` zones outside every reviewed mask carried by context-toned lobes only (budget 260; hole 9: 49, hole 10: 13; holes without OSM woods stay at 0 — source-only). Telemetry `understory`, `contextMassLobes`; captures `rh2-hole{07,09,10}-*` |
| 7 | Introduce rough hierarchy materials and masks | done | Compiler `compileRoughHierarchy` (visual-artifact.ts, compiler-2, style meridian-v8): `surroundDistanceCm` per rough/ground vertex, classes `rough_secondary` (≥10 m) / `rough_outer` (≥28 m) with ±3/±6 m blends, slope-only darkening, outer macro ×1.6 in the shader; ground zones painted from source-backed context zones (`GROUND_ZONE_CLASSES`: parking, wetland, ski slope, recreation, open field, buffer grass, native), `uncertain` zones paint nothing; `contextLayerHash` in the artifact + assert gate. Tests: visual-artifact.test.ts (bands, zones, gate). Captures `rh1-hole{02,07,11,17}-*` |
| 8 | Add production camera presets and state-based framing | done | `TERRAIN_PRESETS.tee/approach/green/putting` + `PRODUCTION_CAMERA_STATES` + `productionCameraState(view)` in terrain.ts; the entry context opens in the state for the current shot view; lab exposes the presets; captures `cs1-hole07-{tee,approach,green,putting}-desktop` |
| 9 | Remove permanent debug-style controls from the player view | done | Entry context now: hole pill (area chooser) · Close · View group Terrain / Top / Green · overflow (Reset view, Details and sources). Zoom rail, Side, Profile and the camera tools render only in review. `scripts/golf/course-geometry/capture-player-view.cjs` proves the chrome (`pv1-hole07-*-phone.json` → chrome=[Choose course area, Close, Terrain, Top, Green, More]) |
| 10 | Re-run whole-course signoff (lab + production mode) | partial | Production mode: the play-round fixture (the production player view harness) now binds the context layer like the lab (`contextLayerFor(course)` in `play-round.tsx`); the app's own geometry bundle loader (P6 bindings) does not assemble `terrainByHole`/`contextLayer` yet, so production binding stays a correctness-package item, not a visual one. Final signoff `canaries/fp-signoff` (96 captures, 0 errors, style `meridian-v8-e714b0ff`, context `92ee0605…`, standard tier, every capture within its draw-call budget; phone Terrain draws 1 78 · 7 69 · 9 88 · 11 129 · 12 72 · 15 51 · 17 108 · 18 119; pixel diff vs `ow2-signoff` shows the §11 re-yaw on holes 11/15/18 and ≤ 3 % elsewhere). Earlier signoff `canaries/ow2-signoff` (96 captures, 0 errors, context hash `92ee0605…`): zones painted on every canary hole (1: 66, 7: 32, 9: 72, 11: 40, 12: 17, 15: 13, 17: 17, 18: 66 vertices-classes), ribbons 6–20, structures 5–34, understory 185–220, context forest mass only where OSM woods exist (1: 6, 9: 49). Phone Terrain draws: 1 130 · 7 139 · 9 101 · 11 224 · 12 92 · 15 84 · 17 246 · 18 242. All-18 lab audit in the fidelity tracker (§56 table). Uncertain-share gate (< 15 %) passes only hole 15 (13.5 %) and 11 (15.4 %, borderline); 2/3/4/6/7/8 stay 35–49 % → the §39 human pass is the blocker, recorded honestly. Open: player view on phone ~350 draws / 460k tris for hole 7 (V7 budget) |

## Spec sections

| § | Title | Status | Evidence / remaining |
| --- | --- | --- | --- |
| 0–1 | Summary, product direction | done | Encoded in `meridian-outside-world.md` (two products, hybrid immersive view) |
| 2 | Two products on one world | done | Lab/QA vs `HoleSceneFrame` entry context; separation documented; chrome reduction pending (§36) |
| 3 | Player UI/UX spec | partial | Sparse chrome + View control + state camera landed (actions 8–9); drag/pinch gestures existed; bottom-sheet details remain the inspector aside (overflow → Details) |
| 4 | The outside-world problem | done | Measured: per-hole unexplained share in the context report |
| 5 | Taxonomy | done | `context-taxonomy.ts` |
| 6 | Do not fill with random stuff | done | Layer zones are source-only (`basis: source`), every default recorded; doctrine in the doc |
| 7 | What “more full” means | done | Semantic (taxonomy), spatial (zones per hole), textural (rough hierarchy, pending render), environmental (buildings/roads/lifts in the layer) |
| 8 | Landcover reconstruction pass | done | `prepare-context-layer.py` + report; human review pass open |
| 9 | Rough hierarchy | done | Action 7: distance bands, blends, slope darkening, outer macro; palette `roughSecondary`/`roughOuter`/`native` |
| 10 | Forest hierarchy | done | Mass / edge / edge trees (V4) + understory band + context forest mass (action 6); isolated trees come from OSM `natural=tree` when present (none retained for this course) |
| 11 | Forest placement principles | done | Source-backed masks, edge rhythm, taper by depth (V4) |
| 12 | Adjacent-hole context | done | Context features drawn quieter (Meridian V2/V5) |
| 13 | Structures | done | Extrusions with source heights/levels or class defaults (§13.3 default recorded per zone); walls + flat roofs, base sunk into the terrain |
| 14 | Cart paths | done | Terrain-conforming ribbons with a shoulder tone, widths from the layer; crossings/bridges as ribbon classes |
| 15–16 | Terrain storytelling, non-playing terrain zones | partial | Slope darkening on secondary/outer rough and zones (slope only, no aspect, so albedo stays light-free); ski slopes painted from OSM `landuse=winter_sports`; terrain-context classes (ridge/swale/…) await the review pass |
| 17 | “Not basic slop” rule | partial | Rule in the doc; enforced by the uncertain-share gate once rendering lands |
| 18 | Open rough visual language | done | Three tiers with distinct albedo, roughness and macro scale; blends over metres, never one pixel |
| 19 | Green-complex exterior context | partial | Surround/fringe rings, bunker bowls, edge trees exist; back bank / run-off zones await the review pass |
| 20–21 | Hole identity, per-hole context pass | partial | Report per hole; identity audit after rendering |
| 22–23 | Production camera composition and shot-context states | done | Action 8 |
| 24 | Labels and overlays | done | Only Green / shot badges are drawn; no category labels |
| 25–27 | Surface differentiation, edge treatment, ground breakup | done | Playing surfaces, bunkers, water, woods (Meridian V2–V5) + rough tiers, ground zones, paths and structures (actions 5, 7) |
| 28–30 | Shadow design, atmospheric depth, colour discipline | done | Fitted shadows, contact shade, capped haze, restrained palette (Meridian V1–V5) |
| 31–33 | Authoring pass, workflow, fidelity tiers | done | Doc + taxonomy + prep script |
| 34 | World-detail rule | done | Uncertain share measured per hole |
| 35 | Quality gates | partial | Gate defined (uncertain < 15 %, sources present, prompts answered); no hole passes yet |
| 36–37 | Player-mode controls, core promise | done | Action 9 |
| 38–43 | Priorities, prompts, definition of good, principle, action list, short version | done | This tracker follows §42 in order; prompts coded |
