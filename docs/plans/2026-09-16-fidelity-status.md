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
| 1 | Green-complex quality (shape, fringe/apron, bunker spacing, setting) | done (v1) | `compileGreenComplex` (compiler-3): derived apron neck between the hole's own fairway and green (`apron` class, `apronBasis: derived_neck`), green/collar edge lip (crispest edge in the scene), pad-setting shade on the bank below the green; bunker spacing is source geometry. Proof: `lab/fp3-hole07-putting-green-desktop.png` |
| 2 | Bunker system (depth, lip/rim, floor shading, edge behaviour) | done (v1) | Bowl (V3) + render-only grass lip (`lipLiftMm`, seeded 4–10 cm, zero on the rim so the mesh never cracks), per-bunker edge band/shade variation (±30 %), floor macro undulation in the shader; profiles carry `lipM`, `edgeBandM`, `edgeShade` |
| 3 | Fairway and approach (edge types, mowing logic, transition) | done (v1) | `compileFairwayEdges`: crisp lip within 8 m of a bunker or green, soft lip elsewhere (albedo only, outline never moves); approach transition is the apron neck; terrain-biased edge stays pending (needs breakline terrain) |
| 4 | Rough hierarchy (primary / secondary / outer / native) | done | Outside-world action 7: distance bands with blends, slope darkening, outer macro; native from source zones; first cut (2.5 m) lifts primary rough toward the surround (`distance-bands-v2`) |
| 5 | Outside-world context (paths, adjacent holes, terrain zones, structures) | done | Outside-world actions 5–7; terrain-context classes await the review pass |
| 6 | Forest system (edge, mass, understory, identity) | done | Meridian V4 + outside-world action 6 (understory band, context woodland) |
| 7 | Lighting / composition (shadow tuning, atmosphere, per-hole camera) | done (v1) | Tuning pass: sun 1.95 / sky fill 1.12 / shadow radius 3 (§48 calm, no crush), water roughness .52 so the pond no longer mirrors the sun into a white sheet at approach pitch, palette desaturated (fairway `#7DA24A`, green `#96B45F`, fringe/apron ordered inside the ladder); per-hole framing: the orientation search now penalises woods standing between the camera and the green/tee (Meridian §11 `woodsOcclusion`), re-audited all 18 tee frames (`lab/audit-v2`, pixel-diffed against `lab/audit`: hole 18 re-yawed away from the tree wall by the green, other holes within 3 %) |

## Spec sections

| § | Title | Status | Evidence / remaining |
| --- | --- | --- | --- |
| 0–4 | Purpose, thesis, differentiator, what feels special, visual stack | done | Adopted; the stack maps to the compiler layers (turf, mowing, boundary, context, bunkerBowl, water, roughHierarchy, groundZones) and the landscape/context groups |
| 5–7 | Terrain depth, principles, depth cues | partial | Canonical DEM terrain, slope darkening, canopy shade, haze; macro landform is source-limited (§6.3 honoured: no invented relief) |
| 8–9 | Fairway as storytelling, fidelity standard | done (v1) | Route-local mowing reads direction; width rhythm, pinches and approach character are the source geometry (crisp/soft edge types, apron neck); landing-area emphasis: on par 4/5 the band contrast rises 50 % inside a route-local window 30 m either side of the drive distance (235 m, never within 70 m of the route end), blending over 25 m — illustrative style like the bands, none on par 3s (`landingWindow`) |
| 10 | Fairway edge treatment (crisp / soft / terrain-biased) | partial | Crisp near bunkers/greens, soft elsewhere (`fairwayEdges` layer, `edge-types-v1`); terrain-biased pending (breaklines) |
| 11–12 | Striping language, material richness | done | Bands scale with the hole, follow the route, fade at edges; macro/micro fields; no pasted texture |
| 13 | Approach transition | done | Apron neck blends fairway → apron → collar → green over 2 m |
| 14–16 | Fringe as differentiator, goals, edge relationships | partial | Collar ring with its own tone/roughness and edge lip (§16 green→fringe, fringe→apron via the neck); fringe→bunker edge shares the bunker lip band; fringe→rough stays a soft tone step |
| 17–19 | Green premium, edge precision, surface behaviour | partial | Source shape preserved; green edge lip (4.5 % over .5 m) is the sharpest edge in the scene; surface tiers/undulation blocked (no green-contour source) |
| 20 | Green pad / setting | done (v1) | Bank below the pad mean elevation darkens up to 5 % within 12 m (`settingVertices`); reads perch/shelf where the DEM has it, nothing where it does not |
| 21 | Apron and approach | done | Derived neck (≤ 10 m from the green, ≤ 5 m from the fairway), `basis: visual_only`, `apronBasis: derived_neck` |
| 22–24 | Bunkers as differentiator, requirements, plan shape | done | Source outlines preserved exactly; rim ribbons from the compiler |
| 25 | Bunker depth | done | Render-only bowl by size class, seeded per bunker, `depthBasis: visual_class` |
| 26 | Lip and rim | done (v1) | Render-only turf lip around every rim (`lipLiftMm`), seeded 4–10 cm, zero on the shared rim vertex; sampler includes it |
| 27 | Bunker floor | done | Floor darkening, grain, and the macro field at 1.2 % on sand |
| 28 | Edge sharpness variation | done | Contact band and shade vary ±30 % per bunker by seed; no two edges match |
| 29–31 | Placement relationships, choreography, spacing | done | Source geometry; nothing is moved |
| 32–36 | Rough tiers | done | First cut / primary / secondary / outer + native from source zones |
| 37–38 | Mowing hierarchy, ground transitions | done (v1) | green → fringe → apron → fairway → first cut → primary → secondary → outer → native/zones → woods, all present with ordered tones; edge types per transition (crisp/soft/lip) |
| 39–40 | Depth around the green, collection areas | pending | Only where terrain supports it; no invented runoffs |
| 41 | Water edges | done (v1, bank vegetation source-limited) | Shoreline contact band, interior gradient, Fresnel (sky lift `#A9C3DB` × .4), roughness .52 (no sun mirror), render-only bank berm (10 cm over 1.2 m, zero on the shoreline vertex) so the pond sits in its basin; bank vegetation needs a shoreline source |
| 42–43 | Cart paths, adjacent-hole context | done | Outside-world actions 5 and 12 |
| 44–46 | Vegetation structure, forest edge, distant mass | done | Seven families, edge/interior placement, understory, mass, context woodland |
| 47 | Built context | done | Extrusions from OSM footprints; roof forms blocked (no roof tags in source) |
| 48–50 | Lighting, shadow as modelling, haze | partial | Tuned with the green complex (sun 1.95, sky 1.12, shadow radius 3); grayscale test on hole 7 separates green/fairway/bunker/tee/path, rough tiers visible, water vs rough weakest |
| 51 | Hole identity | partial | Emerges from the layers; per-hole audit after §56 |
| 52 | QA vs production | done | Lab vs entry context (outside-world action 9) |
| 53 | Rendering tiers | partial (tier 3 source-limited) | Tier 1 done; tier 2 done (fringe/apron, lip, setting, edge types, path integration with shoulder shade, forest hierarchy, open-rough bands, adjacent-hole context); tier 3: understory ✓, structures (footprint extrusions + contact shade, roofs source-limited), hole-specific composition (§11 visibility scoring, state cameras) ✓, atmosphere/light tuning ✓, runoffs/collection areas only where a source exists (none yet) |
| 54 | Source-backed vs visual-only | done | `basis` markers on every layer |
| 55–56 | Mirrored-in-3D test, hole-by-hole checklist | partial | First run on all 18 holes (`lab/audit/hNN-{tee-hole,putting-green}.png`, 2026-09-16); table below |
| 57–58 | Layer architecture, data model | done | Compiler layers + `SURFACE_CLASS_IDS` carry fringe, apron, rough tiers, zones; paths/structures in the context layer |
| 59 | Camera as quality multiplier | done | Production states (outside-world action 8) |
| 60 | No dead zones | partial | Every ground vertex classified; the audit still finds source-limited anonymous rough on 2, 3, 4 (long open flanks) and the par-3 carries on 5, 13, 15 — the context layer marks them `uncertain`, so nothing is painted (honest); needs the §39 human classification pass |
| 61–64 | Hero / signature / intelligence / outside-world rules | partial | Green-complex hero and bunker signature have their v1 (apron neck, lips, edge variation); per-hole audit next |
| 65 | Priority order | done | This tracker |
| 66–70 | Quality targets, standard, summary, checklist, thesis | partial (item 10 human) | Checklist §69: 1–6 done (v1); 7 lighting/shadow tuned (sun 1.95, sky 1.12, radius 3, overhang and contact shade); 8 every hole reframed with the production camera states + §11 visibility term (`lab/audit-v2`); 9 no-dead-zones review run on all 18 (source-limited zones listed in §56/§60); 10 sign-off is the owner's call after the device pass |

## §56 hole-by-hole audit (Peek’n Peak Upper, tee state + putting state, 2026-09-16)

Legend: ✓ reads as intended · ~ reads but weak · ✗ fails · src = source-limited (needs data or the §39 review pass, never invented).

| Hole | Terrain | Fairway / edges | Approach → green | Green + setting | Bunkers | Rough / outer | Vegetation | Context | Composition | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ ponds, houses, road | ✓ | — |
| 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ src | ~ | ✓ pond | ✓ | Open flank left is unclassified (uncertain 49 %) |
| 3 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ src | ~ src | ✓ big pond | ✓ | Few woods polygons in source; 49 draws |
| 4 | ✓ | ✓ | ✓ | ✓ | ✓ | ~ src | ✓ | ✓ | ✓ | Long open flank right |
| 5 | ✓ | n/a par 3 | ✓ | ✓ | ✓ | ~ src | ✓ | ✓ | ✓ | Carry rough reads as one tone; 558k tris (near crowns → V7 LOD) |
| 6 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 7 | ✓ | ✓ | ✓ apron neck | ✓ | ✓ | ✓ first cut visible | ✓ | ✓ pond, houses, path | ✓ | Hero hole |
| 8 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ houses, pond | ✓ | — |
| 9 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ ponds, houses | ✓ | — |
| 10 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ forest wall | ✓ | ✓ | — |
| 11 | ✓ | ✓ stripes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ houses, forest | ✓ | — |
| 12 | ✓ | ✓ | ✓ | ✓ large green | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 13 | ✓ | n/a par 3 | ✓ | ✓ | ✓ crescent | ~ src | ✓ | ✓ path | ✓ | Lower half open rough |
| 14 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 15 | ✓ | n/a par 3 | ✓ | ✓ | n/a | ~ src | ✓ | ~ | ✓ | Tee-to-green carry is one rough tone; 489k tris (near crowns → V7 LOD) |
| 16 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| 17 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Heaviest draws (227) |
| 18 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |

Findings carried forward: (1) V7 LOD must cap near-crown detail on short holes
(5, 15 exceed 480k triangles at 80 draws); (2) the anonymous-rough holes need
the §39 human pass on the context layer before any tone can be painted there;
(3) green surfaces stay flat pads without a contour source (§19 blocked).
