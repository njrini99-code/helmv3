# 3D Course Fidelity Master Spec: execution status

Tracks "Peek’n Peak Meridian — 3D Course Fidelity Master Spec" (70 sections,
2026-09-16) on `agent/golf-course-geometry`, worked in the §65 priority order.
Status values as in the other trackers: `done`, `partial`, `pending`,
`blocked` (needs source data or a human review pass). The renderer-redesign
direction (`2026-09-16-renderer-redesign-status.md`) is folded into the same
work order; the outside-world spec (`2026-09-16-outside-world-status.md`)
owns paths, structures, context zones and the player chrome.

Doctrine (§54): source-backed detail (green shape, fairway boundary, bunker
perimeter, path, water, structures, broad terrain) stays canonical; visual-only
enhancement (bowl nuance, rough breakup, shading, atmosphere) is marked
`basis: visual_only` and never claims putting-grade certainty (§6.3).

Hero hole: Peek’n Peak Upper hole 7.

## §65 priority order

| # | Priority | Status | Evidence / remaining |
| --- | --- | --- | --- |
| 1 | Green-complex quality (shape, fringe/apron, bunker spacing, setting) | pending | Green/fringe/surround rings exist from the terrain compiler; apron class + fringe edge rules + green-setting cues next |
| 2 | Bunker system (depth, lip/rim, floor shading, edge behaviour) | partial | Render-only bowl, rim ribbons, floor darkening, contact band (Meridian V3); lip, edge variation, floor undulation next |
| 3 | Fairway and approach (edge types, mowing logic, transition) | partial | Route-local mowing with edge fade, boundary lip (Meridian V2); crisp/soft/terrain-biased edges and approach transition next |
| 4 | Rough hierarchy (primary / secondary / outer / native) | done | Outside-world action 7: distance bands with blends, slope darkening, outer macro; native from source zones |
| 5 | Outside-world context (paths, adjacent holes, terrain zones, structures) | done | Outside-world actions 5–7; terrain-context classes await the review pass |
| 6 | Forest system (edge, mass, understory, identity) | done | Meridian V4 + outside-world action 6 (understory band, context woodland) |
| 7 | Lighting / composition (shadow tuning, atmosphere, per-hole camera) | partial | Sun, fitted shadows, canopy contact shade, haze, sky dome, production camera states; per-hole framing polish next |

## Spec sections

| § | Title | Status | Evidence / remaining |
| --- | --- | --- | --- |
| 0–4 | Purpose, thesis, differentiator, what feels special, visual stack | done | Adopted; the stack maps to the compiler layers (turf, mowing, boundary, context, bunkerBowl, water, roughHierarchy, groundZones) and the landscape/context groups |
| 5–7 | Terrain depth, principles, depth cues | partial | Canonical DEM terrain, slope darkening, canopy shade, haze; macro landform is source-limited (§6.3 honoured: no invented relief) |
| 8–9 | Fairway as storytelling, fidelity standard | partial | Route-local mowing reads direction; width rhythm is source geometry; landing-area emphasis pending (Meridian V6) |
| 10 | Fairway edge treatment (crisp / soft / terrain-biased) | pending | Boundary lip is uniform today; edge type by neighbour next |
| 11–12 | Striping language, material richness | done | Bands scale with the hole, follow the route, fade at edges; macro/micro fields; no pasted texture |
| 13 | Approach transition | pending | With the apron class |
| 14–16 | Fringe as differentiator, goals, edge relationships | partial | Fringe (collar) ring exists with its own albedo/roughness; green→fringe / fringe→apron / fringe→rough / fringe→bunker edge rules next |
| 17–19 | Green premium, edge precision, surface behaviour | partial | Source green shape preserved; quieter micro field and no macro at Top (§23 Meridian); green edge crispness rule next |
| 20 | Green pad / setting | pending | Setting cues (shelf/perch/cut) from terrain around the green next |
| 21 | Apron and approach | pending | Derived apron class (visual-only, geometry-supported) next |
| 22–24 | Bunkers as differentiator, requirements, plan shape | done | Source outlines preserved exactly; rim ribbons from the compiler |
| 25 | Bunker depth | done | Render-only bowl by size class, seeded per bunker, `depthBasis: visual_class` |
| 26 | Lip and rim | partial | Rim ribbon albedo + boundary lip; geometric lip next |
| 27 | Bunker floor | partial | Floor darkening + sand grain; low-frequency undulation next |
| 28 | Edge sharpness variation | pending | Seeded per-bunker edge shade/width variation next |
| 29–31 | Placement relationships, choreography, spacing | done | Source geometry; nothing is moved |
| 32–36 | Rough tiers | done | Primary / secondary / outer + native from source zones |
| 37–38 | Mowing hierarchy, ground transitions | partial | green → fringe → fairway → rough tiers → woods exist; apron and per-transition edge types next |
| 39–40 | Depth around the green, collection areas | pending | Only where terrain supports it; no invented runoffs |
| 41 | Water edges | partial | Shoreline contact band, interior gradient, Fresnel; bank vegetation pending (needs source) |
| 42–43 | Cart paths, adjacent-hole context | done | Outside-world actions 5 and 12 |
| 44–46 | Vegetation structure, forest edge, distant mass | done | Seven families, edge/interior placement, understory, mass, context woodland |
| 47 | Built context | done | Extrusions from OSM footprints; roof forms blocked (no roof tags in source) |
| 48–50 | Lighting, shadow as modelling, haze | partial | Sun/hemisphere/fitted shadows/haze; tuning pass with the green complex |
| 51 | Hole identity | partial | Emerges from the layers; per-hole audit after §56 |
| 52 | QA vs production | done | Lab vs entry context (outside-world action 9) |
| 53 | Rendering tiers | partial | Tier 1 done; tier 2 in progress (fringe/apron, lip, setting); tier 3 pending |
| 54 | Source-backed vs visual-only | done | `basis` markers on every layer |
| 55–56 | Mirrored-in-3D test, hole-by-hole checklist | pending | Run after priorities 1–3 land |
| 57–58 | Layer architecture, data model | done | Compiler layers + `SURFACE_CLASS_IDS` carry fringe, apron, rough tiers, zones; paths/structures in the context layer |
| 59 | Camera as quality multiplier | done | Production states (outside-world action 8) |
| 60 | No dead zones | partial | Every ground vertex classified (rough tiers, zones); per-hole review pending |
| 61–64 | Hero / signature / intelligence / outside-world rules | partial | Bunker and fringe signatures depend on priorities 1–2 |
| 65 | Priority order | done | This tracker |
| 66–70 | Quality targets, standard, summary, checklist, thesis | pending | Checklist §69 items 1–3 open, 4–6 done, 7–10 pending |
