<!-- markdownlint-disable MD013 -->
# Meridian outside world: taxonomy, authoring pass and quality gates

Source: production player-view spec (2026-09-16), §4–§35. This document is
the authoring contract for everything the production camera sees outside the
playing surfaces. The hard rule (§34): **everything visible in the production
camera must belong to a meaningful world category.** A region the model
cannot explain is reported as `uncertain`, never painted as generic green.

## Two products, one world (§2)

- **Meridian Lab / QA** (`src/test/fixtures/course-geometry/browser`, the
  course matrix, canaries, debug views) answers "is the geometry honest, did
  the render regress?". It keeps every control.
- **Production player view** (`HoleSceneFrame`, entry context) answers
  "where am I going, what matters on this shot?". It is full-bleed,
  Terrain-first, with a hole pill, one View control and an overflow. Side,
  Profile, zoom rails and debug overlays stay in the lab and review contexts.

## Taxonomy (§5)

Coded in `src/lib/golf/course-geometry/context-taxonomy.ts`
(`CONTEXT_CLASS_GROUPS`). Groups: playing, surrounds, woodland, terrain,
built, mobility, adjacent, water, unknown. Each class carries a fidelity
tier (§33: `CONTEXT_FIDELITY`) and a render treatment (`CONTEXT_RENDER`:
ground tone, draped ribbon, extruded footprint, vegetation, line, none).

## Sources and the context layer (§8, §31–32)

1. **Golf extract** (`fetch-osm-course.py`): golf=* surfaces, holes, water,
   cart paths. Retained once, immutable.
2. **Context extract** (`fetch-osm-context.py`): buildings, woods, wetlands,
   streams, roads, service roads, paths, parking, fences, walls, bridges,
   lifts, recreation, landuse. Retained once with a manifest (tag counts,
   query, sha256), 250 m margin around the course bbox.
3. **`prepare-context-layer.py`** classifies both extracts with
   `OSM_CONTEXT_RULES` (tag → class, geometry, default width/height) into
   `<course>-context.json` (`golfhelm-context-layer-v1`), locked to the
   package `contentHash`, and attaches each zone to the holes whose compiled
   terrain context bounds it intersects. It writes
   `<course>-context-report.json`: per-hole class areas, the uncovered
   ("uncertain") share of the context bounds, and the worst-first ranking the
   spec asks for (§42.4).
4. **Review.** Zones start `reviewed: false`, `basis: source`. A reviewer
   walks §39 prompts per hole (`CONTEXT_REVIEW_PROMPTS`; the sheet
   `build-context-prompt-sheet.py` writes puts the evidence and a
   data-derived draft answer beside every prompt, marking which ones only a
   reviewer can answer), corrects classes,
   adds `derived` zones for terrain-context classes the sources cannot give
   (ridge, swale, bank …) and marks the layer `partial` or `reviewed`.
   Nothing is added because a space looks empty (§6).

The renderer refuses a layer whose package hash, site or origin differ
(`MERIDIAN_CONTEXT_LAYER_MISMATCH`), exactly like the visual artifact.

## Rendering rules (§9–§14, §25–§30)

- **Rough hierarchy (§9).** Derived in the visual compiler from distance to
  the nearest playing surface: primary (≤ 10 m), secondary (10–28 m), outer
  (beyond). Native/open field/wetland/ski slope come from zones. Tone,
  texture scale and macro breakup differ; colour stays disciplined (§30).
- **Forest hierarchy (§10).** Reviewed canopy masks drive crowns (edge-first
  families, V4). `forest_mass` zones from OSM wood outside the reviewed masks
  draw mass lobes only, toned as context. Understory shrubs sit inside the
  first metres of a reviewed edge so the edge is not a wall.
- **Cart paths and access (§14).** `cart_path`, `service_path`, `road`:
  draped ribbons on the canonical terrain, source width or the rule default
  (recorded in `attributes.defaults`), muted mineral tones, a darker shoulder,
  never bright lines.
- **Structures (§13).** `building`, `clubhouse`, `maintenance`: extruded
  footprints at terrain height, source `height`/`building:levels` or the rule
  default, flat roof, restrained material. Omitted where absent.
- **Water (§5.8).** Streams as narrow dark ribbons; wetlands as a ground
  tone; pond edges already carry the V5 shoreline treatment.
- **Adjacent holes (§12).** Already present as context features (quieter
  tone, V2/V5).
- **Edges (§26).** Forest edges soft and irregular, bunker edges crisp,
  rough transitions blended over metres; ribbons lift 5 cm and fade at the
  shoulder.

## Quality gates (§35) and signoff (§42.10)

A hole passes production signoff only when its context report shows the
uncertain share below 15 % of the context bounds, its major paths,
structures and water are present where the sources have them, forest edges
and open land read as intentional in the production camera, and the §39
prompts have written answers in the review notes.

## Rough hierarchy and ground zones (implemented)

Rough is never one flat green. The visual compiler (`visual-artifact.ts`,
`compileRoughHierarchy`) stores, for every rough and unfeatured-ground vertex,
`surroundDistanceCm`: metres to the nearest playing surface (fairway, tee,
green, including adjacent holes), capped at the 60 m search radius.

| Band | Distance | Class | Tone | Extra |
| --- | --- | --- | --- | --- |
| First cut | < 2.5 m | `rough` / `ground` | palette `roughFirstCut` → `rough` | maintained strip beside the short grass (fidelity §33) |
| Primary | 2.5–10 m | `rough` / `ground` | palette `rough` | mowing-adjacent, calm |
| Secondary | 10–28 m | `rough_secondary` | palette `roughSecondary` | slope darkening |
| Outer | ≥ 28 m | `rough_outer` | palette `roughOuter` | slope darkening, macro field ×1.6 |

Albedo blends across ±3 m (secondary) and ±6 m (outer) so no band edge lands
on a pixel; the class id switches at the band distance itself. Slope
darkening is slope-only (`1 − 0.12 · min(1, slope / 0.45)`), never aspect,
so no directional light is baked into albedo (§56 of the visual language).
Surround and collar ribbons belong to the green complex and are skipped.

Ground zones from the context layer whose render treatment is `ground`
(parking, wetland, ski slope, recreation, open field, buffer grass,
rough_native, rough_secondary) paint their class tone and roughness inside
the zone polygon, blended in over 1.5 m from the zone edge. Only
source-backed or derived zones paint; `basis: uncertain` zones paint nothing,
so an unexplained region stays honestly unexplained rather than filled.
Overlaps resolve to the more specific class (parking > wetland > ski slope
> recreation > open field > buffer grass > native > secondary).

The artifact records `contextLayerHash` and `layers.groundZones`
(painted vertex count, per-class counts, skipped uncertain zones);
`assertVisualArtifact` refuses an artifact whose context hash differs from the
scene's, so a context edit always recompiles.

## Production camera states and player chrome (implemented)

`TERRAIN_PRESETS` carries the lab presets (`top`, `terrain`, `side`) and
the production states (`tee`, `approach`, `green`, `putting`).
`PRODUCTION_CAMERA_STATES` maps each state to the area it frames and
`productionCameraState(view)` picks the state for a scene view, so the
player never chooses a debug preset: opening the course view during a tee
shot lands in the tee state, an approach in the approach state, and so on.

| State | Pitch | Yaw | Lens | Frames |
| --- | --- | --- | --- | --- |
| tee | 36° | 0° | 30° | whole hole down the corridor |
| approach | 40° | +12° | 30° | landing zone toward the green |
| green | 50° | −18° | 30° | green complex |
| putting | 64° | 0° | 28° | green, near overhead, still terrain |

The entry-context chrome is the hole pill (area chooser), Close, the View
group (Terrain / Top / Green) and an overflow menu (Reset view, Details and
sources). The zoom rail, Side, Profile and the camera tools render only in
the review context and the lab. `capture-player-view.cjs` opens the real
expanded player view from the play fixture and records the chrome it finds.

## Forest edge, understory and context woodland (implemented)

Inside every reviewed woods mask, understory shrub clusters stand between
1.5 m and 10 m of the boundary on a jittered 7 m grid (budget 220, nearest
the hole first), reusing the low cluster crown with no trunk. OSM
`forest_mass` / `forest_interior` zones are drawn as context-toned mass lobes
only, and only where the zone lies outside every reviewed mask and clear of
playing surfaces; a hole with no OSM woodland keeps zero context lobes.
