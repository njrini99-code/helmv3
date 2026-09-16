<!-- markdownlint-disable MD013 MD060 -->
# GolfHelm — Complete Course Geometry and Shot Visualization Implementation Plan

**Research and design date:** September 12, 2026.
**Verified repository:** `njrini99-code/helmv3`, `main` at `6ea9e2ce29a41b574f11b502fd164cb74b6e5e59`.
**Database observed read-only:** Helm production Supabase, project `qmnssrrolpinvwjjnufo`, shared by Golf, Baseball and Lift Lab.
**Status:** Research, specification and proposed implementation only. No application code, migrations, production data, deployment or external map edits were performed.
**Authority:** This consolidated document replaces the earlier geometry plan and its appended alternatives. Source observations are distinguished from proposed code, schema and acceptance targets.

## 1. Product decision and scope

Build one versioned physical representation of each course layout, and one deterministic renderer that serves both the existing Round Review and manual shot-entry preview. The output is a clean, recognizable vector drawing of each real hole: correct routing, proportions, fairways, greens, tees and major hazards, styled in GolfHelm's existing design system.

The player continues using the current tracking controls. No GPS, automatic tracking, location marking, marker dragging, bunker-selection question, pin-placement question, club fitting, or new required shot-entry field is included. CoachHelm insights are outside this project.

The app should render SVG from reviewed geometry. **Do not generate a separate AI image for each production hole.** AI mockups are useful for visual exploration, but do not preserve topology, bunker coordinates, shared-hole identity, consistent dimensions or data-driven marker positions. The production equivalent of an image is a reproducible vector scene; optional PNG exports are rasterizations of that exact scene.

The recommended first release uses QGIS/QuickOSM for course preparation, OSM plus appropriately licensed recent orthophotography for source review, small immutable JSON geometry packages in Supabase, and React SVG rendering. Mapshaper can simplify display copies; d3-geo can serialize paths. Build neither a national segmentation service nor an interactive mapping platform to prove this feature.

### Non-negotiable accuracy contract

1. Real hole geometry and inferred shot positions are separate layers with separate uncertainty.
2. Preserve the player's original result, distances, units, direction and event order.
3. A derived shot length is not an independent measurement.
4. Surface geometry cannot identify an exact ball coordinate when the inputs permit several positions.
5. An unknown green/pin location, missing yardage or incomplete bunker map remains unknown.
6. One geometry version and one reconstruction result feed all sizes of a hole diagram.
7. Styling cannot move physical features or silently turn an inferred position into an observation.
8. Geometry failure never blocks shot entry, round saving, review access or putting detail.

## 2. What is verified, proposed and still unknown

**Verified:** the two supplied screenshots; current component boundaries and control options; several geometry defects described below; the course-library schema, selected policies and installed extensions; the repository dependency/tooling inventory. The repository tree still resolves to the commit above during this pass.

**Proposed:** new module names, geometry schema, SQL examples, rendering dimensions, performance budgets, QA thresholds, workflow states and release sequence. These are design decisions, not claims that implementation exists or has passed tests.

**Not yet established:** actual OSM completeness of the courses in the library, current independent positional accuracy at each course, whether a course has been renovated since imagery capture, source licensing suitability for every eventual asset, actual rendering performance, and empirical shot-position error. The source review and pilot have explicit gates to establish these. No percentage of geographic accuracy or universal time-to-enrich is promised.

The existing generated mockups are not acceptance fixtures. They use different fairway/bunker shapes across the two screens; the review's sand-result marker is not clearly inside the depicted bunker, and texture/tree decoration is stronger than the desired geometric style. Those are reasons to derive production visuals from data, not to trace the generated artwork.

## 3. Current app: exact implementation reference map

All paths below exist in the inspected tree. Unless noted, links are pinned to the verified commit. Line numbers are useful starting points, not stable APIs.

| Existing file | Observed responsibility | Planned change |
|---|---|---|
| `src/components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx` | Owns shot state and save flow; derives `shotDistance` in `handleNextShot`; computes live distance preview | Feed original events and geometry context to the new scene adapter; preserve scoring/save semantics |
| `src/components/fairway/pages/rounds-tracking/FairwayShotEntry.tsx` | Actual result, miss, distance, putting, penalty and undo controls | Preserve option sets and dispatch paths; label derived distances consistently if touched |
| `src/components/fairway/pages/rounds-tracking/FairwayHoleHero.tsx` | Nested `HoleViz`, straight corridor, synthetic tee/pin and circle intersection | Replace physical scenery/plotting with compact shared scene |
| `src/components/fairway/pages/rounds-tracking/FairwayScorecardHeader.tsx` | Sticky header and safe-area ownership | Verify compact layout using existing ownership; do not add a second inset |
| `src/components/golf/coachhelm/v3/HoleShotPath/index.tsx` | Review SVG, interactive markers, animation, multiple size variants; component around line 603 | Add accepted scene input and retain compatibility with current consumers |
| `src/components/golf/coachhelm/v3/HoleShotPath/geometry.ts` | `plotHole`, synthetic positions, hazard events and putting inset | Split course-aware reconstruction from legacy schematic behavior; preserve putting contract |
| `src/components/golf/coachhelm/v3/HoleShotPath/types.ts` | `ShotInput` at 45, props at 111, `normalizeMiss` around 180 | Preserve all eight approach directions and source semantics in new adapter |
| `src/components/golf/coachhelm/v3/HoleShotPath/turf.tsx` | Fixed turf/green/tee primitives | Retain as explicit fallback; render real features when available |
| `src/components/golf/coachhelm/v3/HoleShotPath/hazards.tsx` | Event-derived hazard glyphs; already uses `useId` | Distinguish physical polygons from symbolic penalty/event marks |
| `src/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom.tsx` | Separate putt visualization | Keep schematic and independent of physical green contours |
| `src/components/golf/coachhelm/round-review/ReviewHero.tsx` | Detail selection, `plotHole`, `HoleShotPath` and PuttingZoom; detail around 458 | Pass shared geometry/reconstruction without independently rebuilding it |
| `src/components/golf/coachhelm/round-review/FilmstripReview.tsx` | Loads shot ledger and nested putt/approach details; select around 179 | Add original fields needed by adapter; avoid dropping direction/result/provenance |
| `src/components/fairway/modules/Filmstrip.tsx` | Many simultaneous strip diagrams; dynamically loaded | Feed low-detail static scenes; keep one interaction owner |
| `src/components/golf/approach-miss-selector.tsx` | Eight-direction green-centered selector from player's perspective | Preserve exact semantics; no location interaction added |
| `src/components/golf/putt-miss-tag-selector.tsx` | Short/Long and Low/High mutually exclusive pairs | Keep putt-specific semantics |
| `src/lib/utils/shot-helpers.ts` | Distance calculation, lie derivation, fingerprints, hole stats | Audit impact of derived lengths; do not silently alter stored driving statistics |
| `src/hooks/golf/use-shot-state-machine.ts` | Event/state transitions | Consume read-only; verify undo/replay continuity |
| `src/hooks/golf/use-penalty-handler.ts`, `use-undo-manager.ts` | Penalty origin and undo behavior | New overlay must follow actual current event model |
| `src/app/golf/actions/course-library.ts` | Course/tee reads and coach edits; `getTeeWithHoles` ~690, `getTeeRoundDefaults` ~764 | Resolve optional geometry beside current tee defaults |
| `src/lib/golf/course-library.ts` | Normalizers, row mappers, completeness; course-image URL helpers | Reuse identity utilities without treating name equality as proof of geography |
| `src/components/golf/courses/CourseDetailDrawer.tsx` | Existing course details and tee management | Add outline preview/status and source details |
| `src/components/golf/courses/TeeFormDrawer.tsx` | Coach-maintained tee scorecard | Preserve yardages and par; never overwrite from route length |
| `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx` | Course/tee selection, round initialization, offline/draft integration | Resolve and retain geometry version as optional sidecar |
| `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx` | Restores DB events and course/tee context | Resolve same frozen sidecar; preserve eight-direction restore |
| `src/styles/design-tokens.css` and `.claude/rules/design-system.md` | Fairway mobile design authority | Reuse tokens and add only scoped diagram tokens |
| `src/lib/types/database.ts` | Generated DB types | Regenerate after future migration |
| `config/feature-flags.yml` | Existing flag registry | Register rollout flags through current generation workflow |

### Concrete accuracy issues found

**Dependent-distance reconstruction.** `FairwayShotTracking` computes `shotDistance` from before/after distance and direction. `FairwayHoleHero` intersects two circles using that derived distance and the same after-distance. This adds no independent evidence. For simple subtraction, it can yield a tangent solution with no lateral displacement.

**Left/right helper fallthrough.** `calculateShotDistanceWithDirection` special-cases long and diagonal directions, but plain left/right returns `max(0, before − after)`. Its lateral-case comment describes behavior the implementation does not perform.

**Diagonal information loss.** Review `normalizeMiss` tests for the substring left/right first. Both short-left and long-left become left. The stored eight-direction evidence is richer than the review's normalized type.

**Screen-coordinate side choice and clipping.** The live preview compares absolute Y for left/right and clamps display Y. Neither preserves a consistent player-to-target frame through rotation or successive shots.

**Inferred physical hazards.** The existing diagram creates hazard symbols from shot outcomes. A symbol explaining a sand event must not be mistaken for a measured bunker outline or duplicated on top of a real bunker polygon.

**Misleading source comments.** `ShotInput.shot_distance` is described as real point-to-point data, but the inspected current entry flow derives it. Update comments and adapters to match provenance; inspect other historical writers before applying universal historical interpretations.

**Unit-contract conflict.** Review types describe lie-driven green units that can override stored tags, whereas the canonical event data has independent before/after unit columns. Inventory historical writers and known defaults before changing this compatibility behavior. The new adapter needs explicit provenance-aware conversion and conflict states, not another universal lie-based guess.

**Other-to-rough conversion.** `deriveLieAfterFromResult('other')` returns rough, while `lieFromShotResult` falls back to other. Use the original result when making spatial claims; a derived rough label may be lossy.

**Small-type drift.** The review component locally widens its size union to include `review`, while the shared props type excludes it. Normalize this contract as part of the renderer integration rather than adding another local workaround.

**Additional inputs cannot be assumed.** `approachMissLieType` and `estimated_break_inches` appear in parts of the data model, but are not separate fields collected by the inspected current entry panel. Use historical values only when present and understood; do not infer that every player supplies them.

## 4. Actual library and database foundation

The read-only inventory during this session found **59 active course records, 98 active tee sets and 1,737 tee-hole rows**. These include test records and potentially several layouts at one facility. They do not represent 59 independently verified physical facilities.

There were 608 round rows in the inventory: 190 with both course and tee links, 187 with course only, and 231 with neither. These are all-round counts, not a completed-round cohort. Existing course and tee identities should be reused where valid; missing links require a separate reviewed match, not a name-only bulk assignment.

Twenty-eight active course records have NC state values after case normalization, eight VA, with smaller cohorts elsewhere. Prioritize actual usage rather than nationwide coverage. Candidates for coverage inspection include Bryan Park Champions, Cacapon, Winchester, The Cardinal, Starmount Forest, Big Blue Course (UK), Boonsboro, Grande Dunes, Cutter Creek, River Landing's distinct layouts and Landfall's Marsh nine. No OSM completeness claim is established for these yet.

| Existing database object | Verified useful columns/relationship | Contract to preserve |
|---|---|---|
| `golf_courses` | id, name, normalized_name, city, state, country, address, source, image_url, deleted_at | Shared identity; no lat/lon columns observed here |
| `golf_course_tees` | id, course_id, tee_name, category, holes_count, total_yards, rating/slope, is_draft | A scorecard tee set, not an exact daily physical marker |
| `golf_course_tee_holes` | id, tee_id, hole_number, par, nullable yardage, handicap_index | Unique tee/hole sequence; source of selected scorecard yardages |
| `golf_team_saved_courses` | team_id, course_id, default_tee_id, pinned, last_played_at, times_played | Team preference, not a duplicate physical geometry package |
| `golf_rounds` | course_id, tee_id, round_date, team_id, status, draft_data | Historical round identity and immutable lifecycle protections |
| `golf_holes` | round_id, hole_number and per-hole score data | A played hole; distinct from course tee-hole definitions |
| `golf_shots` | round_id, hole_id, hole_number, shot_number, result, before/after distances and units, shot_distance, miss_direction, lies, penalties, putt fields | Original event ledger; no shot GPS columns found in inspected schema |
| `golf_course_holes` | Legacy course-hole data used by some paths | Audit historical fallback reads; do not mistake it for new tee-aware authority |

The latest extension query found `pgmq` installed and **no installed PostGIS**. The bounded schema query found no existing public geometry/layout tables. This makes a JSON package approach the simpler first release. Spatial validation runs in preparation tools and application code; PostGIS remains a later migration if server-side spatial querying justifies it.

Observed course SELECT policies permit reads at the policy-expression level. Course/tee edit policies reference `is_golf_coach()` and `is_super_admin()`, with additional author fields on some writes. Policy expressions alone do not establish grants or anon access. Do not copy a permissive legacy INSERT policy into geometry publishing. Verify both grants and RLS when implementing new objects.

Existing migration references:

- `supabase/migrations/20260613160000_course_library_phase1.sql`
- `supabase/migrations/20260613170000_course_library_round_tee_id.sql`
- `supabase/migrations/20260613190000_course_library_normalize_unique.sql`
- `supabase/migrations/20260717120000_course_library_owner_gate.sql`
- `supabase/migrations/20260719120000_course_library_role_scoping.sql`
- `supabase/migrations/20260823213049_harden_golf_round_lifecycle_boundaries.sql`
- `supabase/migrations/20260825052141_restore_golf_round_lifecycle_contract.sql`

## 5. Design specification: recognizable, precise, premium

### 5.1 Visual hierarchy

The order of attention is the hole's shape, the selected shot, the numeric evidence, then secondary terrain. Use quiet scenery and crisp readable markers. Decorative detail must not compete with recorded information.

Use existing `bg-canvas`, `bg-surface`, borders, card shadows, `font-fw-*`, buttons, overlays and navigation. The source tokens define warm cream surfaces, a 20px card radius, 14px inset radius and 4px spacing rhythm. The app's locked green is represented by `--fw-color-accent-500`; selected controls already use stronger accent shades for legibility. Avoid importing another font or copying colors from raster mockups.

Propose a small diagram-specific token set in the existing token authority, with values approved during the pilot: ground, fairway, green, bunker, water, vegetation, event line and selected outline. These are scenery tokens, not replacements for application UI colors. Do not use success/danger meanings for physical surfaces.

| Element | Treatment | Accuracy constraint |
|---|---|---|
| Ground | Flat deep evergreen | Neutral backdrop, not a claim that all area is rough |
| Fairway | Slightly lighter, subdued green polygon | Preserve doglegs, narrowing and disconnected components |
| Green | More distinct green, restrained boundary | Preserve actual outline; no oversized ellipse inside a physical scene |
| Bunker | Warm sand fill and thin edge | Draw true accepted polygon; no random decorative sand shapes |
| Water | Muted blue-green with distinct outline | Physical water only; not equivalent to penalty-area rules |
| Trees/woods | Muted source-backed masses, optional | Never manufacture individual trees as strategic obstructions |
| Tee reference | Small symbol and optional accepted tee area | Daily markers unknown; symbol does not imply survey precision |
| Target | Restrained reference symbol | Use nominal green reference wording when pin is not known |
| Estimated endpoint | Hollow marker with solid readable number | Position remains estimated even if a surface match is unique |
| Shot connection | Thin dashed cream segment | Depicts event sequence, not measured flight/roll |
| Selected event | Slightly stronger outline and linked evidence row | Avoid large opaque halos obscuring a bunker |
| Penalty | Distinct small event symbol with text | No flight segment for the penalty stroke itself |

Target normal-text contrast of at least 4.5:1 and meaningful interactive boundaries/focus at least 3:1, measured in the implementation. Treat these as acceptance checks, not claims that proposed colors already pass. Do not distinguish states solely by hue.

### 5.2 Per-hole camera and composition

Normalize geometry into a local metric frame. Generate a stable review orientation with tee generally below and target above; allow a deterministic small rotation search to improve usable area while maintaining that direction. A compact preview may use a different rotation to fit a wide card, but must preserve the same geometry and handedness. The filmstrip should use a consistent orientation rule across holes.

Rotation and translation are allowed. **Uniform scaling only.** Never independently stretch X/Y, mirror a dogleg, drag bunkers away from labels, or rescale the green within the physical overview. A close green detail is a separate inset with its own scale.

Fit bounds to the relevant physical hole: selected tee reference, route, fairways, green and nearby major hazards. Do not include an entire facility lake if only its near edge matters. Clip a display copy with padding, preserve originals, and mark important features continuing beyond the crop in the expanded view. A shot estimated far outside the frame must not be clamped to an invented in-frame location: show an edge indicator linked to the evidence row, or expand the view on selection without changing its coordinate.

Camera selection is geometry-based, not dependent on current text labels or shot count. Once a hole opens, recording a shot should not flip the orientation or zoom unexpectedly. Use explicit expansion for inspection. An internal per-hole orientation/padding override is allowed when automated fitting fails; it changes presentation metadata, never feature coordinates.

Proposed review card height: approximately 360–440 CSS px on ordinary mobile widths, with a shorter responsive minimum for small screens. Proposed manual-entry preview: approximately 140–180 CSS px. These are starting constraints to test at 320, 375, 390 and 430px widths, landscape, desktop and increased text size. A difficult shape may need letterboxing and an expanded view rather than distortion.

### 5.3 Detail levels and simplification

Maintain canonical geometry plus display levels for strip, compact, review and expanded use. Preserve feature IDs across all levels. Choose simplification tolerance in local meters based on maximum permitted screen displacement, not a percentage of vertices.

Proposed initial limit: no more than 0.5 CSS px simplification displacement at the intended display size for major boundaries. If the scene renders at one meter per pixel, that corresponds to about 0.5m of added display error. This is not source accuracy. Measure the displacement after simplification; the tool's nominal tolerance is not a substitute for checking the result.

Keep polygon rings, multipolygons, small visible greenside bunkers and forced-carry gaps. Avoid unbounded curve smoothing; it can inflate a bunker, bridge a neck or move a fairway edge. Use accurate piecewise paths at sufficient resolution. A restrained border may visually emphasize a tiny hazard, but its coordinate geometry remains unchanged. Strip diagrams may omit fine scenery; they must not assert a hazard does not exist merely because it is too small to show.

### 5.4 Marker collisions, labels and typography

Separate physical anchor coordinates from marker-label positions. If shot numbers overlap, place the label outside the surface with a short leader to the unchanged anchor. Never move the underlying endpoint to make room. For shots sharing an origin, use a grouped label or selected event list. Preserve actual shot numbering including penalties; do not renumber non-penalty dots into a different score.

Aim for 20–24px visible selected markers in detailed views and at least 44px interaction targets where feasible; adjacent targets must not create conflicting overlays. On dense/tiny filmstrip views, the whole hole is the target and individual dots are not separately tappable. Numeric evidence also remains in an accessible text list.

Label priority: selected shot, hole/score, nominal target, then optional surface labels. Keep long strings out of the diagram. Use tabular numbers and existing typography. Avoid a vertical 'yards from tee' rail on a dogleg: screen Y is not distance along the course. Show recorded before/after distance in the selected-shot row instead.

### 5.5 Motion and performance feel

Static course surfaces appear first. Animate only lightweight event emphasis, using the existing reduced-motion guard and duration tokens. Do not animate terrain growth, morph one physical hole into another, or make a dotted line look like measured ball flight. On hole changes, crossfade the scene; retain stable data keys so identical geometry does not animate again on unrelated rerenders.

All 18 filmstrip diagrams are static unless deliberately selected. No infinite glowing or particle loops. A reduced-motion setting renders final positions immediately. Expand/review overlays use the existing focus trap, close behavior and safe-area system.

### 5.6 Screenshot-specific composition

**Round Review:** compact header with hole/par/selected-tee yardage/score, medium-height dark scene, a quiet 'Shot positions estimated' line, selected-shot evidence row and separate Putting Zoom. Keep the floating app navigation clear of text and controls. The generated review mockup's excessive texture and bunker/marker mismatch are explicitly rejected.

**Manual entry:** retain current header/shot pills, light hole header and compact course preview; prioritize existing result, miss and distance controls. Keep one primary 'Next shot' or 'Complete hole' action in the existing action bar. No 'mark finish', GPS switch, bunker selector or map editing. Preserve a stable current-position summary while entering a pending result. An uncommitted preview, if shown, must be distinct and must not alter the stored history; the first release can simply display committed events until save.

**No geometry:** the existing schematic remains available, with neutral wording. A fake QA course should not be matched to a real course. Missing yardage is a dash/unknown state; internal denominator guards must not appear as '1 yard'.

**Partial geometry:** show verified surfaces and routing; a synthetic corridor may be used only when visibly identified as a schematic component. Do not use a synthesized corridor to infer fairway membership or bunker accuracy.

## 6. Source acquisition and physical accuracy workflow

### 6.1 Identity comes before geometry

Resolve a Helm course record to facility, physical layout and played hole order. Account for two courses sharing a facility name, alternate nines, renamed layouts, par-3 courses, 9/18/27-hole facilities, combined tournament layouts and repeated visits to the same physical hole. Do not assume all facilities have 18 unique greens or that hole numbers alone identify geometry.

Use location, address, scorecard par/yardages and source identity jointly. Name normalization is useful for candidate retrieval, not acceptance. Keep ambiguous matches in a review queue. Tee names/colors also do not reliably identify a physical tee box; associate the chosen tee's hole to a reviewed tee region/reference with an explicit confidence state.

### 6.2 Source preference and review

1. Appropriately licensed current course-supplied georeferenced vectors, when obtainable and independently checked.
2. OSM routes and surfaces reviewed for identity, completeness and currentness.
3. Recent permitted orthophotography for tracing/correction where vectors are missing or wrong.
4. Imagery segmentation only as candidate generation after measured review effort justifies it.
5. Schematic fallback for insufficient evidence.

OSM supports golf bunker areas, but completeness and mapping interpretation vary. [OSM bunker tagging](https://wiki.openstreetmap.org/wiki/Tag:golf=bunker). QGIS supports vertex editing, topology-aware operations and configurable snapping; overly broad snapping can pick the wrong feature, so set tolerances deliberately. [QGIS editing documentation](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_vector/editing_geometry_attributes.html).

North Carolina is a particularly relevant imagery source for this library. Its 2024–2027 service describes six-inch pixels and stated horizontal accuracy specifications. Inspect the actual acquisition date and coverage for each course; a multi-year service name does not imply future-year imagery already exists everywhere. Source specifications do not guarantee a traced polygon's accuracy. [Official NC service](https://services.gis.nc.gov/secure/rest/services/Imagery/Orthoimagery_20242027/ImageServer).

NAIP remains a broader U.S. fallback. Elevation/3DEP, green contours and terrain-adjusted yardages are deferred. A high-resolution DEM does not establish current pin placement or putting breaks.

### 6.3 Bunker and hazard validation

Review every major bunker affecting the hole at a scale where its boundary is discernible. Separate sand from cart paths, dry grass, waste areas and bright roofs. Specify whether the traced boundary represents visible sand or another course-defined edge. Shadow and canopy occlusion produce unknown segments; do not fabricate them.

Check layer registration using stable visible landmarks before tracing. A uniform offset across a source is different from a renovation. Preserve original coordinates and record any justified alignment transformation. Do not independently shift individual hazards until the screenshot looks attractive.

Allow one physical feature to associate with several holes. Nearest-route matching is a suggestion for review, especially with adjacent fairways, shared bunkers and shared greens. Store permanent source feature IDs and many-to-many associations inside the package. Do not force a bunker into exactly one hole.

Physical water is not automatically a rules-defined penalty area; visible sand is not sufficient to decide every rules classification. Store source surface type separately from official course/rules classification when supplied. The diagram may show a lake without assigning a penalty event to it.

Canonical polygons retain holes and disconnected parts. Validate ring closure, finite coordinates, expected CRS, self-intersection, bounds and plausible dimensions. Geometry validity is necessary but does not prove that the polygon is the right bunker. PostGIS `ST_IsValid`, if adopted later, is a topology check, not semantic verification. [PostGIS documentation](https://postgis.net/docs/ST_IsValid.html).

### 6.4 Hole acceptance dossier

For each physical hole retain: source IDs/dates, reference imagery metadata, tee/green reference definitions, accepted feature IDs, unresolved edges, facility/layout match rationale, route/scorecard comparison, topology report, simplification report, source-overlay screenshot, clean rendered screenshot and reviewer identity/date.

An independent person familiar with the course should review the pilot's 18-hole contact sheet. If independent geometric reference exists, measure positional residuals and boundary disagreement separately. Without it, call the geometry reviewed for visual/source agreement; do not claim survey accuracy.

### 6.5 Source freshness and correction

Published source geometry is immutable. Source updates create a candidate version with visual difference summaries: changed feature count, added/removed bunkers, green displacement and route changes. Large changes require review; a nightly import cannot silently redraw a completed round. Distinguish a source correction from a physical renovation and record effective dates when known.

Retain previous versions and allow an audited rollback of the current course binding. Player reports may identify a wrong outline through existing feedback or an internal queue, but must not add work to shot entry. No automatic writes to OSM are part of this project.

## 7. Shot reconstruction using existing controls only

### 7.1 Verified input inventory

| Input | Existing behavior | Geometry interpretation |
|---|---|---|
| Par 4/5 tee club | Driver / Non-Driver | Classification only; not a measured carry |
| General result | Fairway / Rough / Sand / Green / Hole / Other | Surface evidence; preserve original Other |
| Par-3 first-shot result | Green / Rough / Sand / Hole / Other | Green-oriented tee outcome; verify state-machine classification in tests |
| Tee miss | Left / Right for specified missed results | Broad side; no known intended aim line |
| Approach/around-green miss | Eight directions around a GREEN center, player below | Target-relative sector, not an exact bearing |
| Distance after | Yards off green; feet on green/putting; meters preference converted | Numerical radial constraint with rounding and target uncertainty |
| Putting break | L→R / Straight / R→L / Multiple | Relative schematic cue |
| Putting slope | Uphill / Level / Down / Severe | Annotation, not contour geometry |
| Putt miss tags | Short/Long and Low/High, mutually exclusive within each pair | Speed/read categories, not cardinal coordinates |
| Event history | Before distance, lie, shot type, sequence | Continuity and transition evidence |
| Penalties / Undo | Existing handlers | State transitions, not flying penalty strokes |

The current flow does not collect an exact target coordinate or independent carry/roll. Unknown pin location must therefore be modeled internally, not solved by adding a question. A nominal reference inside the accepted green supports orientation; it is not the actual cup.

### 7.2 Normalize conservatively

Create one adapter for live `ShotRecord` and persisted `golf_shots` plus available nested details. Preserve raw values with provenance. Normalize off-green calculations to meters; preserve feet for displayed putting values. Conversion uncertainty and rounding belong to derived geometry only.

Do not assume a missing distance is zero. Do not assume a missing miss is straight. Preserve diagonal directions exactly. Keep putting low/high in its own namespace. Use original result before lossy lie normalization. Treat conflicting stored unit/lie fields as a compatibility condition with a documented writer-era policy. Historical unit defaults need an audit fixture set before changing established readers.

### 7.3 Feasible regions and bounded candidates

For a candidate target T and remaining distance r, the endpoint lies in a radial band around T. The band's width must reflect actual input rounding and a separately documented error model; a rounding half-unit is only a minimum quantization uncertainty, not a full measurement-error estimate. With no empirical measurement error, avoid calling the band a statistical confidence interval.

Intersect with reviewed surface evidence when available. Sand restricts to compatible bunker regions, Green to the green, Fairway to reviewed fairway components. Rough requires actual rough evidence or a conservatively defined plausible region; the complement of a fairway includes lakes, roads and missing data. Other does not force any physical surface.

Apply approach directions in a frame from each preceding candidate toward the green reference, while allowing pin/reference uncertainty. The eight choices are sectors; exact 45/90-degree bearings would add false precision. On tee shots, left/right lacks an explicit aim point, so routing is only a weak orientation prior and constraints must remain broader.

Carry a bounded set of candidates through the shot sequence. Do not treat the previous illustrative point as exact. Use modest continuity priors to rank plausible sequences; do not prohibit backward recovery, cross-fairway shots or a longer next distance. Candidate scores are ranking scores, not calibrated probabilities.

For near-green geometry, marginalize over plausible target positions within the green rather than measuring every bunker from its centroid. A centroid can lie outside a concave green; any nominal reference must be validated inside. Without a dated pin, some seemingly precise bunker-distance comparisons remain unresolved.

The display representative must be deterministic and stable across opens. If all retained candidates lie in one bunker, the feature association may be presented as inferred, never confirmed. If alternatives span multiple bunkers, do not draw a dot inside one and quietly imply certainty. Use an uncertain sector/region or a separate symbolic event marker connected to the evidence row. That symbolic location has no physical coordinate claim.

No compatible candidate means source/input disagreement, not permission to silently widen constraints until a convenient point appears. Record the reason internally and use a schematic overlay. Preserve all original entries.

### 7.4 Remove circular evidence and protect statistics

Never constrain candidates using the current derived `shotDistance` as a second independent radius. It can be shown as the legacy estimate where necessary, but must not be counted again as evidence. A separate future refactor may improve the estimate after downstream auditing; it is not required to ship the visual layer.

An illustrative target-relative formula explains the current limitation: for before distance b, after distance r and assumed angle θ between target-to-player and target-to-endpoint, straight connection length is `sqrt(b² + r² − 2br cos θ)`. For b=150yd, r=20yd and an assumed lateral 90° direction, length is about 151.3yd rather than 130yd. This does not make every Left selection exactly 90°. Prefer sectors and geometry constraints.

`calculateHoleStats` uses the stored tee `shotDistance` for driving distance. Do not replace it with new display estimates, rewrite historical rounds or change SG/statistical outputs as a side effect. If users see two differently defined estimates, simplify the UI rather than exposing contradictory values: keep recorded before/after distances primary and label any derived length approximate.

### 7.5 Penalties, putts and editing

Penalty rows increment score but have no flight. The next non-penalty stroke must use the actual replay/drop origin represented by the current handlers. Skipping a penalty row in the renderer is insufficient if it also drops its state transition. The origin fix discussed in PR #1934 is a dependency to recheck during implementation; do not assume an unmerged PR's behavior is live.

Reconstruct after Undo, edit and delete from the surviving original event sequence. Keep geometry cache keys tied to all relevant fields, including units and penalty state. A late server response for another hole must not overwrite the currently selected scene.

Putting remains a separate schematic. Break, slope and low/high/short/long can improve that schematic without implying actual contours, green compass direction or measured roll path. Green-hit proximity alone does not determine a quadrant. A made putt is holed according to the recorded make/result, not proximity to a rendered flag.

### 7.6 Example without extra player input

Existing inputs: approach from 148yd, result Sand, miss Short left, remaining 18yd. Evaluate reviewed bunkers against the distance band over plausible target locations and the short-left sector from previous candidate positions. A unique compatible bunker allows an inferred association with a representative position in the feasible portion. Two compatible bunkers remain ambiguous. No compatible bunker triggers schematic fallback and an internal diagnostic. The player gets no new question.

### 7.7 Critical distance, lie, direction and green accuracy specification

**Added September 12, 2026 after re-inspecting the driving, general-shot, approach, putting, penalty and edit controls. This subsection is a required implementation and release contract. It adds no new player input.**

#### 7.7.1 What “always accurate” must mean

GolfHelm must always preserve the entered numeric evidence, the actual recorded lie/result, the recorded direction category, and the scale of its accepted physical geometry. It must not stretch a 150-yard segment to make an attractive picture, place a confirmed sand-result anchor on known fairway, turn short-left into left, or center every putt on an invented real-world pin.

However, these controls do not determine an exact physical endpoint in every case. The implementation cannot honestly guarantee exact drive length, world coordinates or flight direction from remaining distance and categorical miss direction alone. The product guarantee is **faithful evidence and geometrically consistent rendering, with explicit uncertainty where the evidence is incomplete**. Do not advertise every displayed shot as a measured trajectory.

Four distinct quantities must remain distinct in code and presentation:

| Quantity | Meaning | How it is known now |
|---|---|---|
| Selected-tee hole yardage | Scorecard definition for the selected hole/tee | Course library or round snapshot; not automatically today's tee-to-cup straight distance |
| Distance remaining/proximity | Player-entered distance to the target they used | Existing input; current labels usually say remaining/to pin/proximity |
| Shot length | Start-to-finish displacement, or carry/total travel depending on definition | Current flow calculates an estimate; it does not independently measure carry, roll or endpoint separation |
| Route progress | Distance along a chosen hole route | Derived only after choosing a route and station; not equal to shot length on a dogleg |

Preserve the original words/units where they establish reference. Do not retrospectively relabel a player's entered pin distance as distance to green center merely because center geometry is available.

#### 7.7.2 The 350-yard hole / 150-yard shot example

**Exact geometric fixture:** assume a known straight 350-yard start-to-target segment and a shot finishing exactly on that segment, 150 yards from the start. The endpoint is 150/350 = 42.857% of that segment, leaving 200 yards. If the drawing scale is 0.8 CSS pixels per yard, the start-to-end anchor separation must be 120 CSS pixels and the start-to-target separation 280 pixels. Padding and label placement do not change these distances. At another scale, both change proportionally. This is a mandatory numerical test.

**What the current app actually knows:** selecting a 350-yard hole and entering 200 yards remaining causes the existing helper to derive approximately 150 yards for an unqualified/ordinary result. That is a 150-yard reduction in target distance under the assumed common reference. It does not establish that the ball traveled exactly 150 yards or remained on the target line.

Even if the start really is exactly 350 yards from a known target, these two different endpoints can both leave 200 yards:

| Hypothetical endpoint | Forward component toward target | Lateral component | Straight start-to-end length |
|---|---:|---:|---:|
| Straight along target line | 150 yd | 0 yd | 150 yd |
| Off to one side | 164.143 yd | 73.872 yd | 180 yd |

This is a mathematical counterexample, not a proposed typical golf shot. It demonstrates why remaining distance alone cannot prove a 150-yard drive. A categorical right miss narrows the possible side but does not supply its lateral magnitude. On a dogleg, even the starting 350-yard scorecard value may not be the straight distance to the day's cup, increasing the uncertainty.

Implementation rules:

- Keep `350 yd` as the selected tee's recorded hole yardage; never stretch the physical hole to force that number to match unknown daily markers.
- Keep `200 yd remaining` exactly as entered, with its unit and reference provenance.
- Do not promote legacy `~150 yd` calculated distance into a measured length used to locate the endpoint.
- When a representative endpoint is inferred from geometry, its drawn line must agree with that representative's geometric distance. If that distance differs from the legacy estimate, prefer the authoritative before/after labels and omit the conflicting shot-length label rather than showing two incompatible numbers.
- A neutral progress indication can describe reduction in recorded distance, but cannot be labeled distance traveled or used as a physical map coordinate.
- Do not place every drive at `route.length * (holeYardage - remaining) / holeYardage`. That hides dogleg and target-reference errors behind an apparently precise formula.

If an independently measured shot length is ever present from another verified existing writer, its provenance must be established before using it. It still does not uniquely locate the endpoint without direction/reference information. No new length-entry control is proposed here.

#### 7.7.3 Rechecked controls: driving and every ball-lie option

The current Fairway entry panel and edit modal were read at the verified repository commit. The normal flow presents the following controls; the edit path can also change the before lie and distance.

| Situation / control | Current choices or behavior | Required depiction |
|---|---|---|
| Par 4/5 tee club | Driver, Non-Driver | No fixed drive length, launch angle, shot curvature or dispersion inferred from the club bucket |
| Par 4/5 tee result | Fairway, Rough, Sand, Green, Hole, Other | Use the original result as surface evidence; handle rare green/hole outcomes without ordinary-drive assumptions |
| Par-3 opening result | Green, Rough, Sand, Hole, Other | Treat as a green-oriented shot; verify actual state flags to avoid inconsistent tee/approach direction handling |
| General approach/recovery result | Fairway, Rough, Sand, Green, Hole, Other | Respect the selected ending surface and existing before lie |
| Tee miss | Left or Right for rough/sand/other in ordinary entry | Broad side of an assumed playing direction, not a known compass bearing or exact lateral offset |
| Approach/recovery miss | Long left, Long, Long right, Left, Right, Short left, Short, Short right | Preserve both components and the player's perspective toward the green |
| Distance input | Remaining off green; proximity on green | Use independent canonical before/after units; no magnitude-based guessing |
| Edit before lie | Tee, Fairway, Rough, Sand, Green, Other | Correct the start-state constraints and rebuild downstream display estimates |
| Edit before/after distance | Editable distance values with contextual unit behavior | Invalidate reconstruction, preserve other events and identify inconsistent neighbor distances |
| Edit tee direction | Existing modal exposes left/right for tee results other than green/hole | Historical edits may contain a fairway result plus direction; do not discard it simply because normal entry did not ask |
| Penalty type | Out of Bounds, Water Hazard, Unplayable Lie, Lost Ball | Event and next-origin semantics only; not proof of the physical point where the penalty occurred |

The edit path displays the same calculated approximate shot distance; it is not a separate measured-shot-length input. The geometry adapter must support both freshly entered and edited records without imposing the normal-entry option visibility rules on historical data.

**Fairway:** a physical representative must fall within a reviewed compatible fairway component. Do not automatically place it on the centerline; no directional miss does not mean center-fairway. Maintain a region when width is unresolved.

**Rough:** preserve rough as the recorded result, but do not infer heavy/light rough, grain, exact cut boundary, ball sitting down, stance slope or lie quality. If rough is not explicitly mapped, do not call every non-fairway point rough. A schematic event can correctly display 'Rough' without pretending its coordinate is known.

**Sand:** intersect candidate positions with reviewed bunker polygons. Place the physical anchor inside the compatible sand region, not on the edge of a large outside halo. Multiple compatible bunkers remain alternatives. A lie symbol can be used for unresolved sand without drawing a new fictitious bunker under it.

**Green:** anchor candidates must remain on the putting surface when that surface is trusted. Proximity to an unknown pin does not locate a particular side/quadrant. Do not silently shift the pin to make a preferred green point fit.

**Hole:** record the completed event from result/make evidence. In the whole-hole view with unknown pin, indicate holed status in the event list or abstract target reference; do not claim a precise geographic cup coordinate.

**Other:** maintain Other. Do not inherit a rough assumption from a lossy helper and use it to make location claims. For water/OB/lost/unplayable, use explicit penalty context where present; a lost ball has no observed endpoint.

**Start versus finish:** `lieBefore` constrains the start of a stroke; result/lie-after constrains its finish. A penalty may change the next start without representing a hit. Edited start lie and preceding end lie may conflict; record the inconsistency and fall back locally rather than rewriting either to make the diagram continuous.

#### 7.7.4 Direction must survive geometry and screen rotation

Use local metric coordinates with positive Y defined consistently, independent of SVG's downward screen Y. For a candidate previous position P and nominal target reference T, define `forward = normalize(T - P)` and `left = (-forward.y, forward.x)` in an east/north plane. Right is negative left. Transform these vectors with the same display rotation as the hole.

Approach sectors relate the endpoint to the green/target region from the player's view: Short is on the player-facing side, Long on the far side, Left/Right lateral, and diagonal choices retain both signs. Boundaries are tolerant because the selector gives categorical descriptions, not surveyed azimuths. Do not assume exact 45-degree angles.

Tee Left/Right can describe a miss relative to an intended fairway line that differs from the straight tee-to-green line on a dogleg. Since the UI does not collect aim, use routing only as a weak hypothesis, carry alternatives and keep the result approximate. Do not call a player's right miss a draw/fade or hook/slice; finish direction does not describe the ball's flight shape.

Use straight/dashed event connectors. A decorative curve falsely suggests known flight/roll and can make the visual path length disagree with its label. When showing a break-read glyph for putting, keep it separate from any claimed endpoint connection.

#### 7.7.5 Rendering distances and lies without distortion

Accepted world geometry is projected into a local metric plane; the screen applies a similarity transform `screen(p) = scale * rotation(p) + translation`. The absolute scale is identical for both axes. Reflection is allowed only for the deliberate Y-up to Y-down coordinate convention, handled consistently; arbitrary mirroring to improve composition is forbidden.

For any two metric anchors, screen distance equals local distance times scale within the tested numerical tolerance. One yard equals 0.9144m; one foot equals 0.3048m. Perform conversions once, keep calculation precision and round only displayed numbers. Do not clamp a lateral coordinate independently, give long drives a minimum visual segment length, or move a bunker to accommodate text.

Markers have two positions: physical/estimated anchor and screen-space label center. Collision handling may move only the label, with a leader to the unchanged anchor. A small 1-foot putt or a cluster of shots may therefore have large readable number badges while its true radial anchor remains close to the reference. Hit-target padding must not be included in geometry measurements.

Clip overflowing scene content or offer the existing expanded view; do not translate an off-screen ball back into a convenient fairway point. A displayed 150-yard physical segment cannot become 170 yards just because the card is narrow. Different screen sizes may have different scales, but each must preserve ratios within its own view.

If the known result and the source polygons cannot coexist under the numerical/directional constraints, render the recorded evidence with a locally schematic overlay. Never change Sand to Rough, move the green, or invent a new bunker to hide the conflict.

#### 7.7.6 Pin research: the cup is not a permanent course coordinate

**Research finding:** pin/cup locations can change between rounds. The R&A's competition guidance discusses selecting new hole locations and maintaining a common setup within a round, with specific exceptions; it also describes hole-location sheets. A course library's permanent green outline therefore cannot supply a universal pin. Tee-marker locations can also vary between rounds. [R&A Committee Procedures, Section 5F and 5J](https://www.randa.org/rog/committee-procedures/5).

The guidance generally seeks consistent holes and tee markers during a stroke-play round, but documents exceptional relocations. GolfHelm should not infer immutability merely from a shared calendar date. [R&A Committee Procedures, Section 6B(2)](https://www.randa.org/rog/committee-procedures/6).

Required design:

- Default physical map state is `pinLocation = unknown`. The green outline can still be accurate.
- An interior nominal green reference may orient the hole or support an approximate model, but must not be represented as the actual cup or substituted into recorded pin-distance labels.
- Prefer no precise pin glyph on the real green when the pin is unknown. If visual orientation requires a reference symbol, label it a green reference and keep its iconography distinct from a confirmed flag.
- Keep the current `to pin` numeric evidence as the player's recorded distance, with a brief contextual explanation that the map's position is estimated; do not display a measured-looking line from the ball to a fictional pin.
- Internally, evaluate plausible pin locations jointly with endpoint candidates, using a consistent latent pin for a hole/round. Do not choose a different convenient pin for each stroke to force every entry to fit.
- With no actual pin data, the latent solution remains hypothetical even if only one candidate wins the heuristic ranking. Do not store or display it as the day's hole location.
- A future trusted tournament/course pin feed would be a separate dated source, not a new player input and not part of this release. It would need physical-hole/version matching and session/round validity. A front/left offset sheet is not automatically a world coordinate without an agreed green reference frame.
- A green polygon from OSM or imagery, a scorecard and the day's round date are insufficient to recover the pin. Do not search imagery for the flag and assume it represents the date played.

This changes the artwork specification where necessary: the mockup's flag is a concept symbol, not a production promise. Actual course overviews with an unknown pin show the accepted green; abstract putting panels can show an abstract cup origin as described next.

#### 7.7.7 Green shape and putting: two coordinated views

**Physical green context:** use the accepted actual green outline, correctly oriented and uniformly scaled with the hole. An approximate source outline remains labeled approximate at the geometry-information level. If only a crude/partial shape is available, preserve that capability state rather than dressing a generic ellipse as a verified green. Fringe and rough are separate surfaces when sourced; neither can be manufactured by a fixed decorative buffer and then treated as measured.

**Abstract putting detail:** a separate feet-scale plot shows a mathematical cup at the origin and the player's logged distances, read and results. It is not geographically anchored to a location inside the real green. The real outline can appear as a small separate context thumbnail; do not put a centered cup and exact-looking putt path inside it without evidence of the cup/orientation. This provides the desired green shape while keeping putt distances honest.

Rechecked putting options:

| Existing option | Preserve in the visual | Do not invent |
|---|---|---|
| Break L→R | Player's left-to-right read glyph/text | Exact break amount or world compass orientation |
| Break Straight | Recorded straight read | Proof of flat ground or exact straight roll |
| Break R→L | Player's right-to-left read glyph/text | Exact arc/aim point |
| Break Multiple | Multi-break annotation | A specific S-curve with known inflection points |
| Slope Uphill / Level / Down / Severe | The recorded slope description | Slope percent, elevation profile, Stimp or adjusted distance |
| Result Hole | Holed event/make marker at abstract origin | Actual cup coordinate on the physical green |
| Result Green | Still on putting surface with entered leave | A geographically determined endpoint |
| Result Rough / Sand | Rolled-off outcome, retaining result and entered units | A new physical fringe/bunker position just to fit the abstract plot |
| Miss Short / Long | Recorded speed/depth category | Exact bearing solely from the tag |
| Miss Low / High | Recorded read-side category with break context | Fixed screen left/right or north/south |
| Leave distance and quick selections | Exact selected value in canonical feet/meters conversion | Higher precision than a quick-select/input provides |

The current putting flow locks the distance-after unit to feet even when a putt rolls into rough or sand. A lie-only rule that switches every off-green after-distance to yards would misread that event by a factor of three. The adapter must preserve the writer's explicit unit semantics and handle historical conflicts deliberately.

For a 20-foot putt leaving 5 feet, the abstract start is 20 feet from its cup origin and the next lie 5 feet from that same origin. The remaining distance is exact to the player's entry precision; the connection's angle and actual roll distance are not known. A straight short putt is a 15-foot start/end connection only under that explicit straight-short assumption. A putt five feet past the cup on the same line is a 25-foot connection; do not treat both as 15 feet. Break categories alone cannot determine the length of a curved roll path.

For successive putts, preserve one feet scale while inspecting the same hole; a one-foot leave must not be drawn as ten feet because of a minimum badge radius. Use a small true anchor, offset label and leader. Keep `putt_made`/result authoritative: the last visible point is not necessarily holed. If the record is incomplete, do not snap it into the cup.

Low/High is relative to the read/break and not a direct geographic side. With straight or multiple-break reads, the side may remain especially ambiguous. Preserve text and uncertainty rather than generating a physically specific line. Apply the same discipline to missing slope/break; missing is not Level/Straight.

#### 7.7.8 Implementation additions to the existing plan

Add these fields to the proposed normalized evidence/scene contracts rather than to raw shot measurements by inference:

```ts
type DistanceBasis =
  | 'recorded_before' | 'recorded_remaining' | 'recorded_proximity'
  | 'scorecard_yardage' | 'legacy_derived_length'
  | 'inferred_endpoint_separation';

type TargetContext =
  | { kind: 'unknown_pin'; greenFeatureId: string | null }
  | { kind: 'abstract_cup'; units: 'feet' };

interface DiagramDistance {
  valueM: number | null;
  basis: DistanceBasis;
  originalValue: number | null;
  originalUnit: 'yards' | 'feet' | 'meters' | null;
  referenceKnown: boolean;
  estimated: boolean;
}

interface DiagramAnchor {
  // These are derived local coordinates, never observed GPS.
  positionM: readonly [number, number] | null;
  labelOffsetPx: readonly [number, number];
  recordedLie: string | null;
  inferredSurfaceFeatureId: string | null;
  placement: 'compatible_estimate' | 'ambiguous' | 'schematic' | 'unknown';
}
```

The `abstract_cup` context belongs only to Putting Zoom. It cannot be converted into a physical pin simply by attaching a green feature ID. A future externally verified pin type would require a separate source/session contract and is deliberately absent from V1.

Modify proposed `normalize.ts` to preserve distance basis, original result, eight directions and writer-compatible explicit units. Modify `reconstruct.ts` to jointly retain plausible target/endpoint states without counting derived lengths twice. Modify `build-scene.ts` to keep anchor and label positions separate and enforce a single similarity transform. Modify `quality.ts` to downgrade incompatible lie/distance/target cases. Modify the review/live wrappers to display recorded numbers and inferred geometry without conflicting length claims.

Database effects remain limited to the proposed geometry packages/bindings and derived cache metadata. `golf_shots.distance_to_hole_before`, `distance_to_hole_after`, `distance_unit_before`, `distance_unit_after`, `result`, `lie_before`, `lie_after`, `miss_direction`, `shot_distance`, `putt_made`, `putt_break`, `putt_slope` and nested putt tags remain original evidence. Do not populate a fictitious pin column or overwrite existing driving averages to match a drawing. A cache may store estimated anchors only with algorithm version, target-unknown state and explicit derived provenance.

Relevant current files to change or test:

- `FairwayShotTracking.tsx`: creation and conversion of original events; no independent shot-distance input exists here.
- `FairwayShotEntry.tsx`: all entry option sets and calculated approximate distance preview, including putting unit locks.
- `FairwayEditShotModal.tsx`: before lie/distance and result/direction corrections; derived distance preview; invalidate dependent scenes.
- `shot-helpers.ts`: estimated distance and downstream stat use; treat the helper's existing output as derived.
- `HoleShotPath/types.ts`: remove direction loss in the new adapter and correct misleading distance provenance comments.
- `HoleShotPath/geometry.ts` and `PuttingZoom.tsx`: preserve true radial anchors; isolate label separation and abstract putting context.
- `approach-miss-selector.tsx` and `putt-miss-tag-selector.tsx`: source of categorical semantics; preserve existing controls.

#### 7.7.9 Mandatory numerical and visual acceptance tests

| Fixture | Required assertion |
|---|---|
| Known straight 350yd reference, true 150yd collinear endpoint | 42.857% anchor progress; exact 150/200 proportions under uniform scale; no minimum-length adjustment |
| Only 350yd before and 200yd remaining known | 150yd reduction is preserved, but no measured 150yd drive claim or uniquely observed endpoint |
| Off-axis counterexample above | Same remaining distance can produce different shot lengths; candidate system must not collapse it through the derived helper |
| Dogleg with scorecard yardage | No `(yardage−remaining)/yardage` physical station or stretched hole |
| Sand + direction + distance, one compatible bunker | Estimated physical anchor inside the feasible sand region; label may be offset with a leader |
| Sand with two compatible bunkers | Ambiguity remains; no confirmed bunker assignment |
| Rough/Other with incomplete mapping | No automatic placement into water, road or falsely classified rough |
| Short-left versus long-left | Both axes preserved through normalization and every screen rotation |
| Fairway hit without miss direction | No invented exact center-fairway coordinate |
| Tee direction edited onto a fairway result | Existing stored direction retained; normal-entry visibility does not erase it |
| Green shape known, pin unknown | No real-world cup assertion, fake pin-distance line or forced centered putt track |
| 20ft before, 5ft short leave | Correct radial distances; 15ft connection only in the explicit collinear test |
| 20ft before, 5ft long leave | Correct radial distances; 25ft connection in the explicit collinear test |
| Putt rolls off green, after value in feet | Unit remains feet despite rough/sand result |
| 1ft leave with overlapping badges | True anchor remains 1ft; only number label moves |
| Multiple break / severe slope | No invented S-curve geometry, slope percent or elevation-adjusted distance |
| Same hole in compact, review and export | Identical physical coordinates and derived anchors after inverse display transform; independent label layout only |
| Pin hypothetically varies within the accepted green | Plausible region may change; original player distances and source green geometry never change |
| Penalty / undo / edit | Event numbering, origin transition and surviving evidence remain coherent without inventing flight |

Measure numerical error in pure geometry separately from source uncertainty and player input accuracy. Property tests should check preservation of distances under rotations/scales, both-axis direction retention, unit equivalence and no physical coordinate claim for unknown/ambiguous state. Pixel snapshots check presentation; they cannot prove the ball actually stopped at an inferred point.

#### 7.7.10 Primary research and code references for this subsection

- [R&A: teeing areas, selecting hole locations and location sheets](https://www.randa.org/rog/committee-procedures/5).
- [R&A: maintaining or exceptionally relocating holes during competition](https://www.randa.org/rog/committee-procedures/6).
- [Current entry controls](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/fairway/pages/rounds-tracking/FairwayShotEntry.tsx).
- [Current edit controls](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/fairway/pages/rounds-tracking/FairwayEditShotModal.tsx).
- [Current distance helper](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/lib/utils/shot-helpers.ts).
- [Current Putting Zoom](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom.tsx).

## 8. Canonical packages and rendering contracts

### 8.1 Proposed module boundaries

All paths in this subsection are new proposals unless explicitly listed earlier.

| Proposed file | Responsibility |
|---|---|
| `src/lib/golf/course-geometry/types.ts` | Geographic/package, provenance, quality and derived scene types |
| `src/lib/golf/course-geometry/schema.ts` | Zod parsing; bounds/limits; no arbitrary SVG accepted |
| `src/lib/golf/course-geometry/normalize.ts` | Raw inputs and units to canonical evidence |
| `src/lib/golf/course-geometry/project.ts` | WGS84 to a documented local metric frame |
| `src/lib/golf/course-geometry/reconstruct.ts` | Bounded candidate sequence from existing evidence |
| `src/lib/golf/course-geometry/build-scene.ts` | Feature selection, camera, paths, labels and detail levels |
| `src/lib/golf/course-geometry/quality.ts` | Capability selection and fallback reasons |
| `src/lib/golf/course-geometry/cache-key.ts` | Version/tee/event/algorithm/style identity |
| `src/components/golf/course-geometry/CourseHoleScene.tsx` | Pure presentational SVG and accessible description |
| `src/components/golf/course-geometry/HoleSceneFrame.tsx` | Reuses Fairway card/expansion controls |
| `src/app/golf/actions/course-geometry.ts` | Authorized course/round geometry reads |
| `src/lib/golf/course-geometry/server/resolve.ts` | Binding, version and history resolution, server-only |
| `scripts/golf/course-geometry/import.ts` | Validate prepared packages and stage candidates |
| `scripts/golf/course-geometry/review-report.ts` | Contact sheets and change reports |
| `scripts/golf/course-geometry/publish.ts` | Audited transactional activation after acceptance |

Use selected geometry dependencies, not entire libraries by default. Current `package.json` has React, Framer Motion, Zod, Vitest, Playwright and fast-check, and some d3/visx packages. It does not list d3-geo, Turf or MapLibre as direct dependencies. Add and pin only the modules required after a small bundle evaluation.

### 8.2 Proposed TypeScript contracts

These are implementation sketches, not compiled code. Complete validators, geometry primitives and adapters in the implementation PR.

```ts
type PointM = readonly [number, number];
type Direction8 =
  | 'short' | 'short_left' | 'left' | 'long_left'
  | 'long' | 'long_right' | 'right' | 'short_right';

type SceneCapability = 'reviewed_surfaces' | 'partial' | 'route_only' | 'schematic';
type PositionState = 'inferred_region' | 'ambiguous' | 'schematic' | 'unknown';

interface SourceRef {
  id: string;
  provider: string;
  licenseId: string;
  capturedAt: string | null;
  retrievedAt: string;
  attribution: string;
}
interface GeometryFeature {
  id: string;                         // stable physical feature identity
  kind: 'route' | 'tee' | 'fairway' | 'green' | 'bunker' | 'water' | 'rough' | 'woods';
  sourceIds: string[];
  holeKeys: string[];                 // shared features allowed
  geometryWgs84: GeoJSON.Geometry;   // strict geometry-kind validation required
  reviewed: boolean;
  accuracyMeters: number | null;      // only source-supported values
}
interface PhysicalHole {
  key: string;                        // stable beyond displayed hole number
  featureIds: string[];
  routeFeatureId: string | null;
  nominalTargetWgs84: readonly [number, number] | null;
  completeness: Partial<Record<GeometryFeature['kind'], 'reviewed' | 'partial' | 'unknown'>>;
}
interface CourseGeometryPackage {
  schemaVersion: 1;
  siteId: string;
  contentHash: string;
  features: GeometryFeature[];
  holes: PhysicalHole[];
  sources: SourceRef[];
}
interface ShotEvidence {
  eventKey: string;
  shotNumber: number;
  shotType: string | null;
  result: string | null;
  lieBefore: string | null;
  beforeM: number | null;
  afterM: number | null;
  miss: Direction8 | null;
  rawMiss: string | null;
  penalty: { type: string | null; nextLie: string | null } | null;
  issues: string[];
}
interface EstimatedEvent {
  eventKey: string;
  shotNumber: number;
  state: PositionState;
  anchorM: PointM | null;
  candidateFeatureIds: string[];
  inferredFeatureId: string | null;
  reasons: string[];
}
interface HoleScene {
  geometryVersionId: string | null;
  bindingId: string | null;
  algorithmVersion: string;
  physicalHoleKey: string | null;
  capability: SceneCapability;
  events: EstimatedEvent[];
  // Screen paths/label anchors are derived separately for each viewport.
}
```

Physical features and source identity remain separate from per-round event estimates. No generated point is written into `golf_shots` as observed coordinates. Preserve historical nested fields in the adapter where available; the sketch omits putt-specific details for readability, not from the implementation.

### 8.3 Camera/path sketch

```ts
import { geoIdentity, geoPath } from 'd3-geo';

// Input has already been projected to local meters and rotated as one scene.
// This identity transform is a display fit, not a geographic projection.
const display = geoIdentity()
  .reflectY(true)
  .fitExtent([[padding, padding], [width - padding, height - padding]], fitFeatures);
const path = geoPath(display);

// React owns DOM; do not use D3 selections/transitions to mutate React nodes.
const d = path(localFeature) ?? '';
const anchor = display(estimatedPointM);
```

Reject degenerate/empty fit bounds before fitting. Use the same transform for physical paths and estimated anchors. Render polygon interiors correctly, for example with validated ring orientation and SVG `fillRule="evenodd"`. All `<defs>` IDs must be unique per mounted scene using `useId`; the current live preview's fixed gradient IDs must not be propagated into an 18-hole grid. [D3 projection documentation](https://d3js.org/d3-geo/projection), [path documentation](https://d3js.org/d3-geo/path).

Projection choice must be explicit and tested for each course extent. QGIS can prepare local coordinates in a suitable projected CRS; retain CRS metadata and original WGS84 for interchange. Do not use raw longitude/latitude with meter-based buffers. Geographic Turf functions and planar display utilities must not receive each other's coordinate types.

### 8.4 Fallback and loading result contract

Return a discriminated result: ready, partial, unavailable, or error. Unavailable is expected missing coverage; error indicates an actual failed request and is observable. Both can render the schematic, but must not be conflated in operations. Reserve layout space to prevent jumps. Abort stale requests on hole/course change. Scope caches by geometry and authorized context, not just course-name strings.

## 9. Database design: versioned packages first

### 9.1 Recommended storage model

Use relational identity/version metadata with JSONB canonical geometry and a generated local display bundle. Avoid one row containing every tee's duplicated polygons, and avoid hundreds of mutable SVG files without provenance.

Proposed objects:

| New object | Purpose |
|---|---|
| `golf_geometry_sites` | Physical facility identity independent of Helm course aliases/layouts |
| `golf_geometry_versions` | Immutable accepted/rejected candidate package and version metadata |
| `golf_geometry_sources` | Source identifiers, licensing, capture dates and private raw-object references |
| `golf_geometry_version_sources` | Enforced relation from package versions to source records |
| `golf_course_geometry_bindings` | Versioned mapping from Helm course to physical hole order/tee references; one current binding |
| `golf_round_geometry_bindings` | Frozen round-to-binding association, separate from immutable completed rounds |
| `golf_geometry_import_runs` | Idempotent preparation status, error codes, payload hashes and review report pointers |
| `golf_geometry_audit_events` | Append-only publication, quarantine, rollback and historical binding-correction history |

A binding's hole map stores played ordinal → physical hole key, and tee mappings keyed by existing tee ID. Multiple course records at one facility can share the same physical package. The mapping supports a physical hole appearing more than once in a played sequence. Historical bindings remain immutable; replacing the current binding creates a new row.

For a small initial library, validated JSONB is sufficient. Put raw imagery, original extracts and large review artifacts in dedicated private storage, not `course-images`. That existing bucket is for course photography and has its own URL validation. Store approved public-facing attribution separately from private reviewer notes.

### 9.2 Proposed DDL foundation

The following is a coherent starting schema for a migration PR, not an applied migration. Repository migration headers, grants, authorization functions, immutable-content triggers, validators and regression tests are required before deployment. The JSON checks below are structural only; publishing must run the full validator. UUID defaults and shared schema conventions should be checked against current migration practice.

```sql
create table public.golf_geometry_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  identity jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(identity) = 'object')
);

create table public.golf_geometry_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_key text not null,
  license_id text not null,
  attribution text not null,
  captured_at timestamptz,
  retrieved_at timestamptz not null,
  raw_object_key text,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, source_key, content_hash),
  check (jsonb_typeof(metadata) = 'object')
);

create table public.golf_geometry_versions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.golf_geometry_sites(id),
  version_no integer not null check (version_no > 0),
  schema_version integer not null check (schema_version > 0),
  state text not null default 'candidate'
    check (state in ('candidate', 'accepted', 'rejected')),
  content_hash text not null,
  package jsonb not null,
  validation jsonb not null default '{}'::jsonb,
  effective_from date,
  effective_to date,
  accepted_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text,
  accepted_by text, -- server-verified audit identity; retain after account deletion
  created_at timestamptz not null default now(),
  unique (site_id, version_no),
  unique (site_id, content_hash),
  check (jsonb_typeof(package) = 'object'),
  check (jsonb_typeof(validation) = 'object'),
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (state <> 'accepted' or (accepted_at is not null and accepted_by is not null))
);

create table public.golf_geometry_version_sources (
  version_id uuid not null references public.golf_geometry_versions(id),
  source_id uuid not null references public.golf_geometry_sources(id),
  primary key (version_id, source_id)
);

create table public.golf_course_geometry_bindings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.golf_courses(id),
  geometry_version_id uuid not null references public.golf_geometry_versions(id),
  hole_map jsonb not null,
  tee_map jsonb not null default '{}'::jsonb,
  is_current boolean not null default false,
  published_at timestamptz,
  published_by text, -- server-verified audit identity; never trusted client input
  created_at timestamptz not null default now(),
  check (jsonb_typeof(hole_map) = 'array'),
  check (jsonb_typeof(tee_map) = 'object'),
  check (not is_current or (published_at is not null and published_by is not null))
);
create unique index golf_course_geometry_one_current
  on public.golf_course_geometry_bindings(course_id) where is_current;
create index golf_course_geometry_version_idx
  on public.golf_course_geometry_bindings(geometry_version_id);

create table public.golf_round_geometry_bindings (
  round_id uuid primary key references public.golf_rounds(id),
  binding_id uuid not null references public.golf_course_geometry_bindings(id),
  resolution text not null
    check (resolution in ('selected_at_start', 'historical_match', 'corrected_match')),
  resolved_at timestamptz not null default now(),
  algorithm_version text not null,
  match_notes jsonb not null default '{}'::jsonb,
  check (jsonb_typeof(match_notes) = 'object')
);
create index golf_round_geometry_binding_idx
  on public.golf_round_geometry_bindings(binding_id);

create table public.golf_geometry_import_runs (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  course_id uuid references public.golf_courses(id),
  state text not null
    check (state in ('queued','running','needs_review','accepted','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_until timestamptz,
  error_code text,
  report_object_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index golf_geometry_runs_queue_idx
  on public.golf_geometry_import_runs(state, created_at);

create table public.golf_geometry_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'accept','publish','rollback','quarantine','unquarantine','round_bind','round_correct'
  )),
  actor_key text not null,
  course_id uuid references public.golf_courses(id),
  round_id uuid references public.golf_rounds(id),
  previous_binding_id uuid references public.golf_course_geometry_bindings(id),
  next_binding_id uuid references public.golf_course_geometry_bindings(id),
  geometry_version_id uuid references public.golf_geometry_versions(id),
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(evidence) = 'object')
);
create index golf_geometry_audit_round_idx
  on public.golf_geometry_audit_events(round_id, created_at desc);
create index golf_geometry_audit_course_idx
  on public.golf_geometry_audit_events(course_id, created_at desc);
```

Do not cascade a course/site deletion through historical geometry or rounds. Initial FK defaults restrict deletion. Publication attribution uses a server-verified audit identity string rather than an auth-user foreign key, so deleting an account does not erase provenance or fail through a new restrictive FK. Resolve the actor from the authenticated session or authenticated job identity; never accept a caller-selected identity. Apply the existing retention policy to audit data without storing unnecessary profile information.

### 9.3 Access, publication and invariants

Enable RLS on all eight new tables. Revoke anon/authenticated direct writes and keep raw sources, candidate packages, reviewer notes and import jobs private. The simplest V1 read architecture is server-only resolution: authenticate the caller, authorize round access with the existing user-scoped Supabase client, then use a narrowly scoped server-only admin read for the accepted physical package. Never send service credentials to the browser. Do not cache raw authorization results globally.

For course-library outlines, require a legitimate signed-in Golf identity and return only sanitized accepted physical geometry bound to that course. If direct client SELECT is introduced later, implement and test explicit policies; RLS cannot be replaced by an assumed hidden UI. Approved geometry may be shared across Golf teams; round events and round binding access remain governed by existing ownership/team access.

A future `publish_golf_course_geometry` RPC must validate a real authorized publisher, accepted package, valid physical hole keys, nonduplicate played ordinals, compatible tee IDs owned by the course, source availability and all acceptance checks. Acquire a per-course lock, clear the previous current flag, create/activate the new immutable binding and record an audit event in one transaction. The unique partial index prevents two current bindings; the lock provides deterministic publication. Do not trust an arbitrary caller-supplied reviewer ID as authorization.

Enforce immutability of accepted package content and published binding maps with DB triggers, not comments. Only lifecycle/current-pointer metadata changes through controlled functions. Reject content-hash mismatches and missing referenced feature IDs. Candidate content can be replaced before acceptance only with explicit version/hash checks to avoid concurrent review overwrites.

Round binding resolution must validate that course and tee context agree with the round, then use idempotent insert-on-conflict behavior so two opens cannot pin different versions. Do not modify completed `golf_rounds` to add geometry. If the round changes course/tee while still a draft, clear/re-resolve the draft sidecar in the existing authorized lifecycle path. Completed historical corrections require an audited binding replacement policy with retained history, not silent upsert.

A completed-round correction must lock the round sidecar, verify authorized historical correction, append a `round_correct` audit event with previous/next bindings and rationale, and replace the sidecar pointer in the same transaction. Preserve the old immutable binding. Enforce append-only audit rows with grants and triggers. Normal page reads may create an initial authorized binding but may not correct an existing one.

### 9.4 Migration security and function completion checklist

The migration PR must add the following to the foundation DDL; none is optional for production:

```sql
-- Apply this pattern to each of the eight new tables.
alter table public.golf_geometry_versions enable row level security;
revoke all on public.golf_geometry_versions from anon, authenticated;
grant select, insert, update on public.golf_geometry_versions to service_role;
-- No authenticated direct SELECT policy in the server-only V1 architecture.
-- Audit events receive SELECT/INSERT only; reject UPDATE/DELETE in a trigger too.
```

Use explicit table statements in the checked-in migration so the grant review is visible. The server-only reader returns a sanitized DTO, never the entire version row. Candidate data and private source keys never enter a public response. Security-definer functions must set an explicit safe search path, fully qualify referenced objects and restrict EXECUTE to their intended roles. Service-role entry points still require prior application authorization; a supplied round ID is not authorization.

| Proposed operation | Allowed actor | Transaction and return contract |
|---|---|---|
| Accept candidate | Verified internal publisher | Lock candidate; validate hash/report/source refs; set accepted actor/date; append audit; return version ID |
| Publish binding | Verified internal publisher | Lock course; validate accepted nonquarantined package and maps; atomically change current pointer; append audit; return binding ID |
| Resolve round binding | Server after existing round-access check | Read existing sidecar; otherwise verify round/course/tee and insert idempotently; return winning binding, never an arbitrary client binding |
| Correct historical binding | Explicit authorized internal correction operation | Lock sidecar; validate target; audit previous/next/reason; update pointer; invalidate private render cache |
| Quarantine version | Verified internal publisher | Set quarantine metadata and append audit atomically; invalidate version eligibility cache |
| Roll back course | Verified internal publisher | Activate an existing valid historical binding through the same publication lock; append audit; leave round bindings unchanged |

The SQL acceptance validator must check cross-record binding references, while the preparation validator handles detailed geometry. Persist validator version and report hash. Publication verifies the report belongs to the exact package hash rather than trusting a caller-provided success boolean. Do not expose a callable bypass that accepts any arbitrary JSON simply because it has a report field.

Compute content hashes over a canonical serialization of immutable geometry, identities, source references and relevant package metadata. Exclude the hash field itself, volatile timestamps and acceptance state. Style, projection and reconstruction versions get separate derived artifact hashes. This avoids circular hashing and ensures a style update cannot be mistaken for a physical course renovation.

## 10. Read paths, cache, offline behavior and export

### 10.1 Resolution sequence

At course selection, resolve the accepted current binding beside `getTeeRoundDefaults`; the lack of geometry must not reject a valid tee. Before a server round ID exists, retain binding ID in separate client display context. Once the round is durably created, attempt idempotent sidecar binding without making geometry availability part of score-save success.

On resume, use the frozen round binding first. For legacy unbound history, require a verified course/tee mapping and a geometry version appropriate to the round date. When source timing is unknown, identify the outline as current course context or use a schematic; do not represent a post-renovation package as the historical layout.

Fetch metadata/low-detail bundles once for the round and full detail for the selected hole, or fetch one modest bundle when under measured limits. Avoid 18 independent course/provider requests. No Overpass, geocoding or imagery calls originate from the player screen.

Both `ReviewHero` and `FairwayHoleHero` receive the same canonical evidence adapter and reconstruction contract. The Filmstrip receives simplified static scenes from the same version. Keep the existing dynamic-import strategy so a shared type import does not pull motion, editor or ingestion dependencies into initial page JS.

### 10.2 Cache identity

Use a cache key incorporating content hash, binding ID/hole order, selected tee reference, physical hole key, schema version, projection version, reconstruction algorithm version, style version and relevant original event fingerprint. A course-name-only cache is invalid. Saved events and pending preview events must have distinct keys.

Cache immutable physical packages independently of private event overlays. Do not store personalized shot SVGs in a public course bucket. On logout clear account-scoped cached event overlays according to existing offline policy. A package may remain reusable only if its access/license permits shared caching.

The app already imports offline IndexedDB/sync infrastructure in `new-round-client`. Reuse established infrastructure only after inspecting its versioning/quota contracts; do not create a second score queue. Geometry downloads are optional, can be evicted first, and cannot evict unsynced rounds. An offline cache miss renders the schematic immediately. No PMTiles is required for a small vector package.

### 10.3 Deterministic images and exports

For each accepted hole version, produce review/compact/strip previews through the real component or the same pure scene serializer. The review report can rasterize them into a contact sheet. Capture at consistent device scale and fonts. Store the geometry hash, style version and viewport with every QA/export artifact.

If user-facing image export is added, use the exact scene paths and labels, preserve attribution and 'estimated positions' wording, include hole/par/tee context, and obtain private round data through the same authorization. Do not use an image-generation model or re-infer coordinates during export. Pin fonts and device scale; avoid external assets that cause tainted-canvas failures. Exports are optional after the first interactive release, but the render architecture should support them.

## 11. Tool and repository decisions

| Tool/repository | Adopt/reference decision | Specific use and limit |
|---|---|---|
| [QGIS / QuickOSM](https://github.com/3liz/QuickOSM) | Recommended initial workflow | Acquire/review/trace at library scale; it does not automatically resolve course identity |
| [OpenGolfApp](https://github.com/cner-smith/opengolfapp) | Bounded reference | Route/tee/green acquisition and association patterns; revalidate snapping heuristics |
| [Open-Birdie](https://github.com/rroojrooj/Open-Birdie) | Bounded reference | Surface parsing and local geometry; simulator is unnecessary |
| [osmtogeojson](https://github.com/tyrasd/osmtogeojson) | Optional importer dependency | OSM conversion including relation geometry; unnecessary if preparation already exports GeoJSON |
| [Mapshaper](https://github.com/mbloch/mapshaper) | Recommended preparation utility | Simplification/filtering; preserve original data and measure display error; README documents MPL 2.0 |
| [d3-geo](https://github.com/d3/d3-geo) | Evaluate small rendering dependency | GeoJSON/local scene to SVG path; does not supply geometry |
| [Turf](https://github.com/Turfjs/turf) | Selected helpers only | Distances/containment; respect coordinate semantics and bundle size |
| [Terra Draw](https://github.com/JamesLMilner/terra-draw) | Deferred internal editor | Manual course-polygon corrections only; MIT metadata observed; no player location UI |
| [Golf-GeoJSON-Tool](https://github.com/rsm-dsciarrino/Golf-GeoJSON-Tool) | Workflow reference | OSM import, hole assignment, editing/export; Mapbox viewer and unverified declared code license prevent treating it as ready-to-copy infrastructure |
| [FairwayMapper](https://github.com/FairwayMapper/fairwaymapper) | Ecosystem reference only | Earlier inspection did not establish a usable implementation to integrate |
| [OpenGolfAPI data](https://github.com/opengolfapi/data) | Optional identity enrichment | Metadata may help candidate matching; not a guaranteed source of bunker/fairway polygons |
| [SamGeo](https://github.com/opengeos/segment-geospatial) | Deferred experiment | Candidate segmentation only; classify and review outputs before use |
| [MapLibre](https://github.com/maplibre/maplibre-gl-js), [deck.gl](https://github.com/visgl/deck.gl), [PMTiles](https://github.com/protomaps/PMTiles) | Deferred | No need for a full map engine, large overlay stack or tile package for SVG diagrams |

Repositories were inspected as code/documentation references; no claim is made that they were installed or tested against the production library. Pin commit/version and review licenses before code reuse. Code licenses and source data rights are independent.

Commercial geometry can be evaluated later if reviewed open-data coverage is too costly. Golf Intelligence documents polygon data, but its usage/cache terms need review for a shared reusable course library. Do not assume a per-user allowance permits permanent shared redistribution. No purchase or contact is part of this plan. [Provider documentation](https://golfintelligence.com/golf-courses-for-developers/).

OSM-derived data requires attribution and applicable ODbL compliance; keep source lineage and determine derivative-database obligations before distribution. Raw imagery may have different rights from OSM. Do not infer permission to trace and republish from permission to view an imagery service. [OSM copyright and license](https://www.openstreetmap.org/copyright).

Use public Overpass politely for bounded preparation and cache extracts; do not treat community instances as a serving SLA. Large-scale acquisition should use appropriate extracts or a suitable hosted service. [Overpass documentation](https://wiki.openstreetmap.org/wiki/Overpass_API).

## 12. Implementation sequence and reviewable deliverables

The order below is the implementation plan. Each step produces a concrete artifact and a gate. Time estimates are deliberately deferred until the first course's coverage and review effort are measured; earlier 1–2-day or 5–8-day guesses are not delivery commitments.

| Stage | Work | Deliverable / completion gate |
|---|---|---|
| 0 — Baseline | Inspect latest main, relevant memory registry and dirty state; refresh bounded inventory; catalog writers/units/penalty state | Source contract and fixtures; confirm this plan's references remain current |
| 1 — Source pilot | Audit 3–5 high-use candidate courses, choose one with usable coverage; review physical geometry and mappings | One accepted draft package, source dossier and unresolved-gap list |
| 2 — Pure renderer proof | Implement local scene transform, real polygons, style tokens and responsive variants using fixture data | Same hole rendered in both screenshots' contexts, plus all-hole contact sheet; no live DB requirement |
| 3 — Storage/access | Add schema, validators, immutable triggers, controlled publication, RLS/grants and generated types | Local migration/RLS tests and idempotent publish/read tests |
| 4 — App wiring | Resolve bindings at selection/resume/review, adapt both consumers and strip, add fallback/cache | End-to-end course→tee→round→review behavior without blocking saves |
| 5 — Reconstruction | Preserve original eight directions/units; bounded surface-aware candidates; penalty and edit rebuilds | Existing-controls-only fixtures, ambiguity handling and shared live/review output |
| 6 — Library rollout | Add course drawer outline/status; import queue/reports; review most-used courses | Per-course/per-hole acceptance report, rollout flags and ops dashboard |
| 7 — Hardening | Offline, accessibility, slow devices, export/contact-sheet determinism, rollback drill | Release gates below pass on the accepted pilot; then progressive expansion |

Keep code PRs reviewable: separate source fixtures/contracts, renderer, storage, read wiring, reconstruction and library operations. Do not interleave these with unrelated CoachHelm fixes or changes to saved statistical definitions. Reconcile concurrent UI work/PRs against current main rather than overwriting them.

### Precise migration and code tasks

- Add migration(s) with current repository headers; update schema docs/type generation and relevant memory feature mapping.
- Implement schema validators including JSON size/count limits, feature IDs, finite bounds, geometry-kind compatibility, ring validity, sources and hole/tee references.
- Implement publication authorization and locking, accepted-content immutability and sidecar round binding.
- Add `course-geometry.ts` actions with discriminated errors; narrow admin reads after user-scoped access checks.
- Adapt raw live and persisted events into one normalized representation without reusing `normalizeMiss`'s lossy behavior.
- Add one pure scene renderer; reuse existing motion/overlay components and avoid importing editor code into player routes.
- Thread geometry through course defaults and round contexts; preserve current draft and completed-round lifecycle.
- Add outline/status to the course drawer with an internal review seam; normal coaches need not become GIS editors.
- Add bounded importer/report/publisher scripts; do not seed the entire library from unreviewed matching.
- Register flags through `config/feature-flags.yml` and generator scripts rather than scattering ad hoc environment checks.

Proposed flags: accepted course backgrounds, reconstructed event overlay, and internal review tools. Choose names through the existing registry. Backgrounds and overlay need separate rollback controls so a placement issue can revert to the established schematic while reviewed course data remains intact.

## 13. Verification and release acceptance

### 13.1 Physical geometry suite

Fixtures must include straight hole, both doglegs, par 3, forced carry, disconnected fairway, shared bunker, shared green, concave green, polygon hole, multiple tees, adjacent course, reversed route, renamed layout, repeated physical hole, partial coverage and changed imagery date.

Tests verify coordinate-system conversion, preserved topology, hole-order mapping, feature associations, uniform scale, no accidental mirroring, bounded simplification error and a stable camera. Independently inspect source-overlay and clean render contact sheets. A topology pass cannot replace geographic review.

### 13.2 Event suite

Cases: before/after feet and yards mixed independently; meters preference; unknown unit provenance; left versus short-left versus long-left; Other; no miss on a green hit; two compatible bunkers; zero compatible bunkers; unknown target; sideways/backward recovery; same-origin strokes; penalty and replay; edit/delete/undo; made putt; low/high with both breaks; uncommitted input; stale response after hole navigation.

Property tests with existing fast-check should verify rotation invariance, deterministic output for identical inputs, preserved event count/numbering, no measured-coordinate state produced from inferred evidence, and stable fallback under bounded malformed inputs. Do not write tests that merely assert the implementation's guessed coordinates. Test semantic invariants and known analytic cases.

### 13.3 Database/access suite

- Anonymous and ordinary clients cannot publish or read private source/review data.
- User A cannot resolve User B's private round binding unless current round RLS permits it.
- A team switch does not reuse cached private events from another team.
- Two publication attempts produce exactly one current binding.
- Unaccepted package and invalid tee/physical-hole map cannot publish.
- Accepted content and published mappings cannot be edited directly.
- Two opens bind a round once; a later import does not change the binding.
- Geometry failure cannot roll back a successfully saved shot or completed round.
- Historical geometry correction retains audit history; unsupported correction is rejected.
- Golf changes do not expand Baseball/Lift Lab table access.

Existing suites to extend/reuse: `supabase/tests/rls/golf_course_library.sql`, `golf_course_library_write_scoping.sql`, `golf_round_lifecycle_contract.sql`; current HoleShotPath, turf, hazards and PuttingZoom tests; `src/app/golf/actions/__tests__/course-library.test.ts`; course-library coach-gate/guards tests.

### 13.4 Visual and interaction suite

Capture deterministic Playwright images from the accepted package at 320/375/390/430px, desktop, increased text size and reduced motion. Freeze fonts, clock, data and animations for snapshots. Check real device safe areas and virtual keyboard behavior; screenshot whitespace alone does not establish its CSS cause.

Release must show: unchanged physical shape across views after accounting for rotation/scale; no sand marker outside its retained compatible region when presented as an inferred physical point; no hidden hazard underneath an opaque label; no clipping of selected markers; no stretched greens; no duplicated synthetic/physical bunkers; readable text; accessible evidence alternative; one primary action; functioning existing keyboard/focus behavior; no bottom-nav obstruction.

The full-hole diagram should not distort green dimensions to make putts visible. Putting Zoom handles the small scale separately. Route-only backgrounds must look intentionally schematic and not pretend to show exact boundaries.

### 13.5 Initial performance budgets

These are proposed targets to measure on a representative midrange phone, not observed performance:

- Geometry rendering must not delay focus/input or the existing save action.
- Aim for <50ms p95 selected-hole reconstruction on the agreed fixture set; use a worker or server-prepared context if measured work exceeds the main-thread budget.
- Aim for <100KB compressed selected-hole display payload and <1MB compressed ordinary full-course package, with hard ingestion caps and explicit exceptions for complex geometry.
- Keep editor/import dependencies out of player bundles; record the actual incremental JS size before accepting dependencies.
- All-hole strips are static and cheap; no 18 parallel provider fetches or continuously animated canvases.
- On failed/slow geometry load, show the fixed-size schematic immediately and keep the input responsive.

Enforce reasonable numeric/feature/vertex limits at validation to prevent malformed GeoJSON causing memory/CPU exhaustion. Construct SVG from validated numbers, not arbitrary uploaded markup or scripts. Restrict importer URLs to intended sources and control redirects/size/timeouts; untrusted source descriptions are data, not instructions.

### 13.6 Verification commands in implementation

The current package exposes `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:file -- <paths>`, `npm run test:rls`, `npm run db:types`, `npm run db:types:check`, `npm run flags:check`, and `npm run test:e2e -- <paths>`. Run targeted checks for each PR, build for changed server-action surfaces, and migration/RLS tests in the proper local environment. GitHub owns required merge checks. No implementation tests were run for this prose-only task.

### 13.7 Repeatable per-hole image acceptance process

For each candidate package, the report generator produces a row per physical hole and columns for source overlay, clean review, clean compact, strip and selected-event detail. Use a geometry-only row first, then controlled event fixtures. Label every cell with physical-hole key, displayed hole ordinal, tee reference, package hash and render version outside the diagram.

Run geometric assertions before pixel snapshots: identical feature coordinates and IDs across modes, transformed anchor containment where claimed, ring/component preservation, no mirror transform, and permitted simplification displacement. Then inspect aesthetics: fairway silhouette legibility, recognizable dogleg, bunker contrast, green proportion, whitespace, line weight, label overlap and navigation clearance. Compare screenshots to approved vectors, not to AI-generated mockups.

Accept all major mapped green/bunker/water features for every hole presented as reviewed; unresolved critical features lower that hole's capability to partial. A course may contain both reviewed and partial holes. Do not average a bad hole into a good course-level percentage. Publish a contact sheet only after discrepancies have an explicit resolution or fallback.

Source accuracy must be evaluated separately from reconstruction quality. Until independent shot-position ground truth exists, validate reconstruction's constraint consistency and ambiguity behavior, and do not report a meter-level endpoint-accuracy score. Existing player-entered distances cannot serve as independent validation of a reconstruction fitted to those same distances.

## 14. Operations, rollout, rollback and historical behavior

Track per course: matched identity, accepted holes/expected played slots, reviewed bunker/green coverage, partial features, source date, last review, import failures and time spent reviewing. Track per render: capability/fallback reason, package version, load/reconstruction latency and candidate ambiguity bucket. Do not log raw player coordinates/events or course provider secrets in telemetry.

Import jobs use bounded retries, leases, explicit failure reasons and content-hash deduplication. The existing pgmq installation is available, but a controlled offline importer is enough for the pilot. If automated jobs are added, integrate with the actual queue registry/consumer after inspecting it; do not create an unmonitored second scheduler. Standing source failures must not trigger an import on every player open.

Rollout: internal fixtures → one accepted course → a small active-course cohort → prioritized library expansion. Compare live and review screenshots for each accepted version before exposure. A course with poor coverage can remain schematic indefinitely without blocking the rest.

Rollback: disable the reconstruction flag first for a placement regression; disable accepted backgrounds for a renderer regression; restore a previous current course binding for a bad source publication. Keep version data and round sidecars for diagnosis. Never drop new tables or rewrite scores as an emergency rollback. If an accepted source is discovered materially wrong, set `quarantined_at` and `quarantine_reason` through a controlled audited action and serve schematic fallback for bound rounds until reviewed. Publication and resolver paths reject quarantined versions; unquarantine is also audited. Quarantine does not delete the accepted content or rewrite the bound round.

Historical rounds retain bound versions. Legacy unlinked rounds stay schematic until reviewed matching. Current geometry may be shown as current context only when clearly distinguished from historical fidelity. Do not reconstruct an old course from a newer renovated outline without disclosure.

## 15. Decisions resolved and remaining pilot questions

Resolved: geometry-only; existing shot controls; no manual location/pin/bunker inputs; SVG; shared scene across consumers; reviewed source pipeline; JSON packages before PostGIS; preserved score/SG definitions; no Google Maps; no AI-generated production hole images; separate physical and inferred layers; immutable history and fallbacks.

Pilot must establish, without blocking this plan:

1. Which high-use course has the strongest immediately reviewable coverage?
2. What error/rounding characteristics can be justified for the existing distance inputs? Until measured, use conservative uncalibrated uncertainty and no accuracy percentage.
3. Which historical writer-era unit defaults require compatibility handling?
4. What target-location uncertainty model performs acceptably without collecting pin positions?
5. How much human review is needed per accepted hole, and when would an internal editor save time?
6. Confirm that the proposed retained publisher audit identity matches the existing account-deletion and audit policy.
7. What source access and redistribution terms apply to the chosen pilot imagery?
8. Which shape/detail/marker choices pass actual phone and course-familiar review?

These are evidence collection tasks assigned to Stages 0–2 and the storage PR. They are not invitations to add new player inputs or expand into automatic tracking.

## 16. Definition of done

The project is complete for a course when every playable slot maps to a reviewed physical hole or explicit fallback; the selected tee association is understood; major visible bunkers/greens/fairways agree with accepted sources; both app surfaces render the same version without distortion; the existing shot controls drive the strongest defensible reconstruction; ambiguity never becomes false precision; score/save/undo/putting behavior remains correct; access, offline, performance and visual gates pass; and updates/rollback/history have an operating workflow.

A beautiful screenshot alone does not satisfy this definition. A numerically valid polygon alone does not satisfy it either. The release artifact is the accepted source package, deterministic renderer, preserved event contract, passing checks and repeatable library workflow together.

## 17. Source index

### GolfHelm code and database references

Repository base for all existing paths above: [verified commit](https://github.com/njrini99-code/helmv3/tree/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59).

- [Manual tracking parent](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx)
- [Current control options](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/fairway/pages/rounds-tracking/FairwayShotEntry.tsx)
- [Live preview geometry](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/fairway/pages/rounds-tracking/FairwayHoleHero.tsx)
- [Review geometry/types](https://github.com/njrini99-code/helmv3/tree/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/golf/coachhelm/v3/HoleShotPath)
- [ReviewHero](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/components/golf/coachhelm/round-review/ReviewHero.tsx)
- [Shot distance/lie/stat helpers](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/lib/utils/shot-helpers.ts)
- [Course library actions](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/app/golf/actions/course-library.ts)
- [Fairway design tokens](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/src/styles/design-tokens.css)
- [Library schema migration](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/supabase/migrations/20260613160000_course_library_phase1.sql)
- [Library RLS tests](https://github.com/njrini99-code/helmv3/blob/6ea9e2ce29a41b574f11b502fd164cb74b6e5e59/supabase/tests/rls/golf_course_library.sql)

Live schema evidence came from read-only `information_schema.columns`, `pg_policies`, `pg_extension` and earlier aggregate library/round queries in this session. No screenshot-only inference is presented as a database fact.

### Primary external sources

- [QGIS geometry editing](https://docs.qgis.org/3.44/en/docs/user_manual/working_with_vector/editing_geometry_attributes.html)
- [OSM golf bunker schema](https://wiki.openstreetmap.org/wiki/Tag:golf=bunker)
- [OSM hole routing schema](https://wiki.openstreetmap.org/wiki/Tag:golf=hole)
- [OSM data license](https://www.openstreetmap.org/copyright)
- [Overpass service documentation](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [NC official orthophotography service](https://services.gis.nc.gov/secure/rest/services/Imagery/Orthoimagery_20242027/ImageServer)
- [D3 projections](https://d3js.org/d3-geo/projection)
- [D3 paths](https://d3js.org/d3-geo/path)
- [Mapshaper repository and documentation links](https://github.com/mbloch/mapshaper)
- [PostGIS validity semantics](https://postgis.net/docs/ST_IsValid.html)

Repository-specific sources and adoption decisions appear in Section 11. Their availability does not establish golf-course coverage, source accuracy or production readiness.

## 18. SVG UI/UX correction after the Cacapon proof — researched design specification

**Added 2026-09-12. Status: proposed design; no application implementation or device validation in this research pass.** This section responds to the owner's screenshot of “Cacapon · shared geometry proof.” It refines the visual and interaction acceptance criteria in Sections 5, 12 and 13. Where earlier sizing or presentation suggestions conflict, this section takes precedence. Section 7.7's measurement, lie, direction and unknown-pin contracts remain mandatory.

### 18.1 What failed, and what the screenshot does not establish

The proof has a useful distinction between source geometry and unresolved shots, but its presentation leaves most of the product job undone. The hole surfaces are small, similar in visual weight and surrounded by unused space. Debugging copy occupies substantial vertical space. Neither diagram tells a clear shot story. The entry example repeats historical shot prose before the controls. It looks like a geometry inspection harness.

This screenshot does not establish that the source polygons are wrong, that the tee-to-fairway gap is a bug, or that separate bunkers should be merged. Actual golf holes can have disconnected fairways and long gaps from tees. Do not “fix” physical geography to make the drawing fuller.

The proof's horizontal entry view and vertical review view are not, by themselves, a geometry error. Different cameras can render the same coordinates accurately. Their framing needs a deliberate policy and consistent directional semantics, not identical pixels.

Research and repository scope: re-read the existing main components and the plan branch. The geometry implementation behind the uploaded proof was not identified in the accessible branch/PR results. Therefore this is a source-grounded design prescription for the existing integration points, not a line-by-line review of that unpublished implementation.

### 18.2 Design decision: one scene, separate layouts, purposeful detail

Use one normalized physical scene and one shot-evidence adapter. Let the container decide the visible extent, annotation density, selected shot and interaction mode.

Three approaches were considered:

| Approach | Benefit | Limitation | Decision |
| --- | --- | --- | --- |
| Full hole in every small panel | Always shows routing | Greens and bunkers remain tiny; makes entry taller without resolving legibility | Keep as overview |
| Permanently large interactive map | Plenty of detail | Competes with entry controls, creates gesture and keyboard problems | Expanded view only |
| Compact contextual view with explicit overview/detail controls | Preserves form space and gives relevant geometry enough pixels | Requires camera state and clear context | Recommended |

A useful calculation: a 25-yard-wide green on a 383-yard hole spanning 320 pixels is only about 21 pixels wide, before padding. A 10-yard bunker is about 8 pixels. Changing fill colors cannot make several numbered shots readable inside that space. Enlarging the geographic features independently would corrupt scale. A closer view is the correct solution.

Apple's layout guidance supports organizing content by importance, grouping related controls and revealing secondary detail on demand. The dimensions below are GolfHelm design targets, not Apple mandates. [Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout).

### 18.3 Shot entry: compact context above the existing form

The form remains the primary task. The map should answer “Which hole and which part of the hole am I recording?” without forcing map interaction.

Initial design targets, measured in CSS pixels:

| Region | Normal phone target | Behavior |
| --- | --- | --- |
| Shared round/hole/shot chrome | Preserve one compact sticky region | Remove repeated hole and shot headings; retain saved state and exit |
| Current shot context row | About 48–64 px at normal text size | Shot number/type/lie on left; existing entered remaining distance on right |
| Inline geometry | 144–176 px; up to 184 on taller available viewports | Fixed-size slot per layout; camera changes inside it |
| Controls immediately following scene | Existing 44–48 px minimum design targets | Result first; relevant direction/distance/putting fields follow |
| Commit action | Existing approximately 48–52 px button | One action area, clear of keyboard and home indicator |
| Map during distance keyboard entry | Optional 44–56 px collapsed context row | Collapse without moving or obscuring the focused field; preserve draft and scroll position |

The combined context row and map should normally stay around 210–240 px, instead of becoming a 500–700 px hero. These are starting targets, subject to actual 320–430 px width, small-height, large-text and keyboard checks. Do not make an entire card fixed-height when text needs to wrap.

Keep labels in the light Fairway header. Do not float the large distance readout over fairway geometry. Use one cream surface or a continuous grouped surface; avoid a card around a card around the map.

**Context modes:**

- Tee shot: show the complete hole route with tee and green identifiable. Number only recorded shots; no decorative future shot dots on the map.
- Approach: default to the approach portion when a committed prior shot provides useful context. If the position is unresolved, frame the green and its surrounding surfaces as course context, without pretending the camera is centered on the ball.
- Around green: enlarge the actual green and adjacent hazards. Maintain visible indication that this is a close view, and offer “Whole hole.”
- Putting: show a compact distance schematic based on the existing feet, make/miss, break and slope fields. Actual green outline is available through the geometry view; do not insert an unknown cup into it.
- Penalty: keep the penalty event and existing origin/replay behavior. No line representing a penalty as a travelled stroke.

Use a quiet existing Segmented control or labeled button for “Whole hole / Approach” when both are meaningful. “Expand” opens a read-only viewer. These are viewing controls, not new data-entry questions. No map placement, pin selection or “where it landed” prompts.

**State stability:** choose the default camera when the hole or committed shot changes. Do not reframe on every result selection, digit or hover. A player typing 18 must not watch a scene first fit 1 yard and then 18 yards. Preserve an explicitly chosen mode until the next hole, unless the user resets it. Distinguish an unsaved preview from committed history.

**Scroll and gestures:** the inline SVG must allow normal page scrolling and browser zoom. No wheel zoom, drag-to-pan or capture of vertical swipes in the inline card. Expanded view may provide pan/zoom, with visible zoom/reset/close buttons so gestures are not the only way to operate it. MDN explains how touch-action governs browser gesture handling; W3C requires an alternative to dragging when dragging is not essential. [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action), [W3C dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

### 18.4 Round review: one selected-hole panel, not a wall of maps

Preserve the actual ReviewHero/Filmstrip composition: round summary, hole selector, one selected-hole detail. Do not replace the round review with 18 full-size geometry cards.

Recommended mobile detail sequence:

1. Compact hole header: hole number, par, yardage and score together.
2. One 280–340 px geometry panel at normal phone dimensions.
3. One compact recorded-shot selector.
4. One selected-shot row with lie, entered before/after distances and relevant miss information.
5. Putting detail revealed in the same visual slot or as a compact sibling when selected.
6. Existing review narrative and areas remain reachable below.

The 280–340 px target is the whole main drawing viewport, not a promise that a long, narrow fairway can fill both its dimensions. Overview uses uniform scale and fit padding. Approach mode changes the extent. The interface must say which view is active. A small overview locator may appear in expanded detail, but should be omitted from the inline view if it makes the panel crowded.

Use a restrained “Hole / Green / Putting” view switch only for available views. “Green” shows actual outline and surrounding course geometry. “Putting” shows logged putts relative to an abstract cup; it is not a geographically registered green map. Do not give an abstract schematic a geographic scale bar or compass.

On desktop, retain the current two-column detail pattern: geometry on the left, selected-shot explanation and putting on the right. Use available container space rather than a single device breakpoint to decide when both columns have enough room.

Selecting a shot should highlight it and update its explanation. A tap on a small visual marker may select it where hit targets are unambiguous; the shot strip and next/previous controls provide the reliable alternative. Never move a physical anchor just to make its marker easier to tap.

No duplicate hole heading inside the SVG, no permanent per-shot SG labels scattered over the scene, and no hover-only access to essential shot information.

### 18.5 SVG visual language: styled vector cartography

The target is a carefully drawn yardage-book diagram in Fairway's palette. Geometry carries location; visual treatment establishes hierarchy.

| Layer | Rendering prescription | Accuracy restriction |
| --- | --- | --- |
| Background | Quiet deep evergreen, flat or extremely restrained wash | Means backdrop, not proof that all surrounding ground is rough |
| Fairway | Medium evergreen fill with subtle tonal separation and a fine boundary | Preserve disconnected sections and actual widths |
| Green | Brighter muted sage, crisp outline and very restrained interior tone | Actual polygon; no invented cup or pin-centered glow |
| Bunker | Warm sand fill, darker thin boundary and subtle highlight clipped inside | Do not expand the footprint or suggest measured lip elevation |
| Water | Muted blue-green, distinct from playable ground | Source-backed water only |
| Tee | Source outline with quiet neutral fill | Tee area does not establish daily tee-marker position |
| Shot sequence | Warm cream, selected segment emphasized, previous segments quieter | Estimated connections are not ball-flight trajectories |
| Shot anchor | Small hollow point or evidence region according to evidence state | No exact point for an unresolved shot |
| Label | Screen-sized cream/charcoal badge, placed separately from anchor | Label movement never moves the underlying point |
| Uncertainty | Restrained boundary or hatching for a supported candidate region | Not a statistical confidence contour unless actually calculated |

Order the drawing as background, validated surfaces, surface edge treatment, evidence regions, shot connections, physical anchors and labels. Resolve overlapping source features through validated topology and intended surface semantics; merely drawing one polygon last is not a data repair.

Remove the default dashed centerline from the finished full-geometry scene. It competes with the actual shot sequence and can be mistaken for a travelled path. Route-only fallback may show a faint route guide with clear semantics.

Do not add random trees, rough islands, mowing strips or shadows implying terrain. A subtle clipped material treatment can provide polish, but no amount of texture substitutes for useful scale, labels and composition.

### 18.6 Camera geometry and screen geometry must be separate

Maintain canonical coordinates in a local metric frame. The camera applies rotation, uniform scale and translation. Both axes use the same scale. Convert north-up world coordinates to the SVG's downward-positive y convention once; never reflect the physical scene to make a dogleg fit.

For rotated bounds of width bw and height bh, a drawable viewport W by H with padding px and py uses:

```ts
// Design pseudocode: viewport is measured in CSS pixels.
// Rotate the geometry first, then compute these bounds.
const scale = Math.min(
  (W - 2 * px) / bw,
  (H - 2 * py) / bh,
);
const tx = (W - scale * bw) / 2 - scale * minX;
const ty = (H - scale * bh) / 2 - scale * minY;
```

Reject empty/non-finite bounds before applying the calculation. Account for any controls or annotations occupying the viewport by reserving padding, rather than clipping meaningful features beneath them.

Use meet semantics for overview. Slice can crop a tee or hazard when the actual hole's aspect differs from the old synthetic corridor; it should not be the default whole-hole policy. Explicit close views may crop geography intentionally. [MDN preserveAspectRatio](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/preserveAspectRatio).

Choose the overview orientation once per hole and presentation mode, then keep it stable while selecting shots. A landscape entry overview may rotate relative to a portrait review overview, provided the physical relationships and shot-direction frame remain unchanged. Direction is relative to the shot/target reference frame, never the phone's left edge. Close views should preserve the overview's rotation where practical.

All displayed anchors must pass through the same camera transform as surfaces. Keep badges, hit regions and label text in a separate screen-coordinate overlay. The map can shrink; a 13–14 px label must not become 4 px.

Use vector-effect="non-scaling-stroke" for appropriate outlines. It preserves stroke weight, **not** circle radius or font size. Screen-sized markers still require a separate overlay or inverse-scale handling. [MDN vector-effect](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/vector-effect).

SVG ids for gradients, masks and clips must be unique per mounted scene. Repeated hard-coded ids can produce cross-instance styling problems when the filmstrip, review and expanded viewer are mounted together.

### 18.7 Contours, simplification and labels

Do not fit a smooth spline through every raw polygon vertex in React. This can round away a bunker neck, cross a boundary or change green area. Retain canonical geometry for calculations, derive display geometry separately, and record the display revision.

Mapshaper is useful for offline display simplification. Its weighted Visvalingam option preferentially removes acute vertices; its repair and keep-shapes behavior can help, but keep-shapes does not preserve every part of a multipart feature. Preserve important bunker parts and holes explicitly and validate the result. Start conservatively, comparing source/display boundaries at the intended rendered sizes. [Mapshaper repository](https://github.com/mbloch/mapshaper), [simplification reference](https://mapshaper.org/docs/reference.html#-simplify).

A proposed initial visual tolerance is approximately 0.5 CSS pixels of boundary displacement at the intended view, with stricter treatment for greens, narrow bunker connections and known shot anchors near an edge. This is an acceptance target to measure, not a guarantee from the simplifier. Prefer the unsimplified polygon if a candidate changes topology, loses a material feature or changes a shot's apparent lie.

Maintain interior rings. Explicitly configure SVG fill-rule/clip-rule appropriate to the normalized ring contract; evenodd is useful for polygon holes. Do not fill bunker/green cutouts accidentally. [MDN fill-rule](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/fill-rule).

Label priority is selected shot first, other recorded shots second, optional surface labels last. Try a small fixed set of badge positions; avoid overlapping labels, controls and key anchors. Use a fine leader from displaced badge to unchanged anchor. If no readable position fits, suppress the badge and retain the shot's strip entry.

Mapbox's guidance on collision detection, variable anchors and ordered label priority is directly useful as an algorithmic pattern; installing Mapbox is unnecessary. [Mapbox label placement](https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/).

Polylabel provides an internal polygon label anchor, useful for an optional surface label within an irregular green or bunker. It is not a pin locator, ball-position solver or a reason to move a shot to the polygon center. [Polylabel repository](https://github.com/mapbox/polylabel).

### 18.8 Restore the shot story without inventing precision

Use three distinct presentation states:

| Evidence state | Geographic scene | Shot detail |
| --- | --- | --- |
| Supported estimated location or region | Hollow anchor or candidate region, selected on demand | Entered measurements plus compact “Estimated position” status |
| Several plausible regions | Highlight supported alternatives on selection, without false probability weights | Recorded lie/direction/distance remain readable |
| Unresolved or contradictory | Course context remains; do not insert a fabricated location | Keep numbered shot ledger and offer clearly separate distance schematic |

Never choose the nearest bunker solely because result=sand. Unknown cup position, ambiguous target frame and rounded input distances must be considered under Section 7.7. The same unknown target state must remain consistent across the shot sequence.

Do not draw a normal cream connection through an unresolved gap as though it were reconstructed. A non-geographic shot sequence can still connect numbered events outside the map. Geographic path and shot-order diagram have different meanings.

Keep one unobtrusive explanation of estimated placement. Remove repeated “Position unresolved · no exact endpoint shown” paragraphs from the default player view. Details belong behind the selected shot's information control. Keep required source attribution visible and readable in a compact map footer.

### 18.9 Putting deserves its own scale and interaction

Actual green shape adds context, but a moving cup prevents automatic registration of logged putts to that shape.

The default putting view should show the first-putt distance, subsequent leave distances, make/miss and selected break/slope metadata from existing inputs. Radial distance must remain correct within the abstract schematic. Putts crossing or sharing an anchor use badge leaders; do not push the measured point outwards for separation.

Use one clear selected-putt detail instead of annotating every putt with break, slope and SG simultaneously. Show a plain connection or evidence-appropriate symbolic path; break read alone does not establish actual curvature or speed. A rolled-off-green putt preserves its entered feet unit and resulting lie.

In entry, the putting schematic replaces the full-hole drawing inside the same compact slot. In review, selecting Putting replaces the main detail view or uses the existing adjacent PuttingZoom area on desktop. Avoid stacked overview + green view + putting view that requires several screens of scrolling.

### 18.10 Code integration and dependency choices

References below were re-read on main during this pass. Paths name existing files unless marked proposed.

| Existing file | Observed implementation | Target change |
| --- | --- | --- |
| src/components/fairway/pages/rounds-tracking/FairwayHoleHero.tsx | Nested HoleViz; viewBox 320×120; aspect 8:3; light header; fixed synthetic scenery | Keep the header and distance contract; replace nested scenery with shared scene plus compact camera policy |
| src/components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx | Phone stack; desktop two columns; one sticky round chrome; Hero before Entry | Preserve save/state handlers; own committed-shot selection and keyboard-aware compact layout |
| src/components/fairway/pages/rounds-tracking/FairwayShotEntry.tsx | Existing manual form and dispatch | Preserve option sets, validation and unit behavior; no geometry prompts |
| src/components/golf/coachhelm/round-review/ReviewHero.tsx | Filmstrip; one open hole; mobile stacked detail; desktop geometry/putting/ledger columns | Bound the drawing slot, add view selection and selected-shot detail, preserve narrative flow |
| src/components/golf/coachhelm/v3/HoleShotPath/index.tsx | Review aspect 100:200, max width 300/360; rich markers, animations and tooltip | Replace fixed physical assumptions; screen-space labels, explicit selection, bounded viewport |
| src/components/golf/coachhelm/v3/HoleShotPath/turf.tsx | Synthetic corridor, green ellipse, rail and flag | Data-driven surface renderer; retain safe schematic fallback under a distinct mode |
| src/components/golf/coachhelm/v3/HoleShotPath/PuttingZoom.tsx | Existing separate putting panel | Preserve useful distance treatment while avoiding physical pin registration |
| src/components/fairway/modules/Filmstrip.tsx | Small per-hole previews | Static low-detail scene; no dense labels, active-cell-only motion |
| src/styles/design-tokens.css | Fairway material/type/spacing authority | Use current tokens; surface colors may be dedicated scoped cartographic tokens |

Proposed seams, aligned with the shared renderer from Section 8: HoleScene for surfaces; HoleSceneViewport for camera and extent; ShotOverlay for anchors/regions; ShotAnnotations for screen-space labels; SelectedShotSummary for HTML detail. Consolidate names with the active implementation rather than creating parallel variants.

Dependency decisions:

- Native SVG and React remain sufficient for the inline drawing.
- d3-geo's geoPath and geoIdentity are an optional small, established path/fit toolset for already projected planar data. Do not apply a spherical projection to local-meter coordinates. Existing equivalent helpers can be retained. [D3 paths](https://d3js.org/d3-geo/path), [D3 planar identity and fitting](https://d3js.org/d3-geo/projection#geoIdentity).
- Mapshaper belongs in offline preparation/QA, not the phone's initial bundle.
- Polylabel is optional preprocessing for surface labels.
- svg-pan-zoom is a candidate only if the expanded viewer needs its capabilities. Evaluate React ownership, touch behavior and teardown before adoption; inline use does not need it. [svg-pan-zoom](https://github.com/bumbu/svg-pan-zoom).
- No MapLibre, deck.gl, tile server or canvas/WebGL migration is needed for this visual correction.

### 18.11 Accessibility, performance and acceptance gates

A small dot can be visually elegant without being the only control. Use at least 44×44 CSS-pixel design targets for meaningful touch controls where possible, and resolve overlapping hit regions through the shot selector rather than invisible overlap. WCAG 2.2 AA's general minimum is 24×24 CSS pixels with stated exceptions; 44 is our stronger design target here. Provide selected state, keyboard access and equivalent text. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

A static scene can be an SVG image with title/description plus adjacent accessible shot details. Do not hide interactive descendants inside an aria-hidden SVG. Selected/estimated/penalty states need shape or text distinctions in addition to color.

Render prepared geometry, not ingestion operations. Memoize the scene by geometry version, level of detail and dimensions. Typing updates form state without rebuilding every polygon. Keep filmstrip thumbnails static. Respect reduced motion; no looping ball pulses, decorative flight animation or camera zoom on every digit. Reserve skeleton dimensions equal to the real slot.

Required evidence before declaring this visual pass complete:

1. Render the **actual components and compiled Fairway styles**, not approximating HTML or another generated image.
2. Capture the exact same reviewed hole and shot fixture in entry, review, expanded and thumbnail modes.
3. Test 320, 375, 390 and 430 CSS-pixel widths; a short phone viewport; large text; Safari keyboard open; reduced motion.
4. Show tee shot, approach, bunker result, ambiguous bunker, putting, rolled-off putt, penalty and missing geometry.
5. Confirm the normal entry map stays within its size target; essential inputs remain reachable without nested scrolling or shrinking touch controls.
6. Confirm overview fits the relevant tee/green/hazards; close view is explicitly indicated; no anisotropic scaling or anchor clamping.
7. Confirm lie and distance fixtures still pass when changing camera, label positions or display geometry.
8. Compare source outline and styled outline at close zoom. Reject lost holes, merged bunkers, altered narrow features or labels covering the selected anchor.
9. Test rapid shot switching, keyboard focus, returning from Expand and unsaved input preservation.
10. Obtain owner review of real phone captures before bulk course enrichment.

### 18.12 Fold this into the existing implementation order

Complete this as a Stage 2 visual acceptance correction, before widening the source pipeline. Keep the reviewed Cacapon fixture if its source checks pass; the screenshot alone is not grounds to replace its geography.

Delivery sequence: (A) bounded actual-screen layout and shared viewport, (B) deliberate surface styling and screen-space annotations, (C) evidence-aware shot selection plus green/putting detail, (D) device and numerical acceptance. Database changes are not a prerequisite for this fixture-based UI pass.

The exit condition is not “the polygons rendered.” It is: the real app screens present the hole recognizably, keep manual entry efficient, make the selected shot understandable, and retain the measurement limits in Section 7.7.

## 19. Stages 0–2 implementation findings, September 12, 2026

This section records the local implementation against current main
`6ea9e2ce29a41b574f11b502fd164cb74b6e5e59`. PR #1937 was still open,
so its complete branch copy, including section 7.7, is the document updated
here. The canonical checkout contained concurrent work; implementation uses
an isolated worktree. No existing shot-entry, edit, save, statistics, putting,
review or CoachHelm consumer was changed. No production schema/data writes,
OSM edits, merge or deployment were performed.

### 19.1 Baseline and source contracts

Read-only Helm inventory remains 59 active course records, 98 active tee sets,
1,737 tee-hole rows and 608 round rows. Of those rounds, 190 link course and
tee, 187 course only, and 231 neither. These are all-round counts, including
drafts and test records, not a completed-round usage cohort.

| Contract rechecked on main | Evidence / treatment in this proof |
|---|---|
| Entry and edit distance writers | Both derive `shotDistance`; the new adapter preserves it as `legacy_derived_length`, never an independent radius. Existing helpers and driving statistics are untouched. |
| Eight approach directions | Preserved exactly by the new adapter; legacy `normalizeMiss` is not reused. Missing direction stays null. Edited tee directions survive even when the result is Fairway. |
| Independent units | Before/after tags convert independently without rounding again. Meters preference is converted by the current entry boundary. Missing or conflicting historical tags become issues, not a universal lie-based conversion. |
| Putt rolls off green | Current writer retains feet after Rough/Sand outcomes; fixtures cover this explicitly. |
| Other result | Original Other remains Other even where a stored derived lie says rough. Unknown rough coverage cannot imply a surface. |
| Penalties | Current `buildPenaltyShot` already encodes OB/lost replay at the offending stroke origin, and water/unplayable at the handler's drop state. Penalty rows retain score numbering and transition fields, with no flight. At baseline PR #1934 was open. It merged during UI correction and is preserved via main `878d203abbd30d9304897ba94cbff1a7f41d999d`; the current origin-choice controls and un-entered offending-stroke behavior are retained. No deployment status is inferred. |
| Edit / undo | Evidence is rebuilt from the surviving sequence, with neighbor distance/lie conflicts reported without rewriting it. No private overlay cache or async fetch is introduced in Stage 2. |
| Putting detail | Existing PuttingZoom is unchanged. New analytic tests cover 20ft/5ft short and long geometry and a true 1ft anchor; they do not certify the legacy renderer's radius floors. Its production integration remains a later gate. |

The read-only unit cohort audit found 17,751 ordinary green-to-green putting
rows tagged feet/feet, plus a putting green-to-green row tagged yards/feet,
five approach green-to-sand rows tagged yards/yards, and several putting rows
with rough/null lies. These observations establish compatibility cases, not
proven writer eras. The proof retains explicit tags and flags conflicts.
No player identifiers or individual round ledgers are included in fixtures.

### 19.2 Coverage audit and selected draft

The reproducible bounded extract inventory is
[`coverage-audit.json`](../../src/test/fixtures/course-geometry/coverage-audit.json).
Overpass timeouts led to bounded read-only OSM core map GET requests; a timeout
was never interpreted as missing geometry. Counts below are golf-tagged ways
inside each documented crop, not a facility-completeness claim.

| Course | Linked rounds | Routes / greens / bunkers / fairways / tees | Finding |
|---|---:|---|---|
| Bryan Park Champions | 46 | 1 / 23 / 87 / 22 / 79 | Several layouts in the crop; Champions identity/assignment insufficient. |
| Cacapon State Park | 39 | 18 / 18 / 71 / 18 / 22 | Selected: all route ordinals and pars match the complete Men's Blue scorecard. |
| The Cardinal | 33 | 0 / 20 / 52 / 0 / 0 | Alias complication: OSM facility relation says Sedgefield Country Club Dye Course with old_name Cardinal. |
| Winchester Country Club | 33 | 18 / 18 / 45 / 19 / 39 | Strong alternate source candidate; per-hole geographic review deferred. |

Cacapon has 18 playable slots and **17 distinct playing greens**: holes 4 and
8 share `osm-way-885719177`, as the
[official park description](https://wvstateparks.com/parks/cacapon-resort-state-park/activities/)
also describes. The extra source green is not assigned to a played slot.
The source description's approximate shared-green dimensions are not used to
reshape the OSM polygon. Men's Blue is the complete 18-hole library scorecard;
a second similarly named tee has missing back-nine yardages and is not repaired
or silently substituted. Route starts remain nominal references, not identified
daily Blue markers. Scorecard yardages never rescale geometry.

The draft retains **144 physical features**, stable source IDs, original
WGS84 vertices, route-to-hole mapping and many-to-many explicit per-hole feature
associations. All retained polygons pass Shapely 2.1.2 validity and the local
parser. No smoothing or simplification was applied, so added simplification
displacement is zero. Source agreement is not measured positional accuracy.

All 18 source comparisons were visually reviewed against a bounded USDA NAIP
2022 export via GeoPlatform. The point metadata query returned the WV tile
`m_3907830_se_17_060_20221020_20230117`, year 2022, nominal 0.6m pixels,
`public=yes`. The date embedded in that filename is retained as source metadata,
not separately certified as an acquisition timestamp. The source dossier
records service, bbox and export dimensions. USDA describes its acquired
orthophotography as public domain in its
[imagery customer-service documentation](https://www.fpacbc.usda.gov/geospatial-services/customer-services).
OSM vectors remain separately attributed under ODbL 1.0; their source extract
is included. No NAIP tracing or external map correction was performed.

Routing and major green/bunker groups agree visually. Canopy, coarse comparison
scale and imagery age leave exact/current edges unverified. In particular,
**tee way 885719212 near hole 10 overlaps the pond in the comparison**: it is
retained in the source dossier, excluded from the drawing and recorded as an
unknown tee region. Bunker membership is explicitly recorded in `cacapon-associations.json`.
The first 50m proximity-based draft incorrectly included neighboring-hole
bunkers; that rule was rejected. All 18 assignments were rechecked against
source comparisons, with all four shared-green bunkers retained for holes
4 and 8. Hole 7 includes only ways 885719197–885719200. This is source-review
evidence, not independent course-familiar acceptance or rules ownership.

Every hole remains **partial**. The package is accepted only as a local
source-reviewed draft for renderer testing. Independent course-familiar review,
current boundary acceptance, selected-tee association and source accuracy
remain open; there is no production-accepted package or publication binding.

### 19.3 Actual-screen correction against the updated plan

Read the complete plan at PR #1937 revision
`bcac4026b2fc238d441575f95f0c6359ff6232b8`, including Sections 7.7 and 18.
The previous proof failed Section 18's contextual entry camera, bounded review
composition, actual-shell evidence, useful detail interaction and surface
hierarchy. This section replaces the superseded square-entry presentation
findings; the original source audit above remains historical evidence.

The actual `FairwayShotTracking` / `FairwayHoleHero` now use the existing shared
`HoleSceneFrame`. Entry has a 160 CSS-pixel drawing and a normally 56px header.
Defaults follow committed tee/approach/around-green/putting state. The supplied
Shot 3 / Sand / 17 yd example opens the actual green complex. Whole hole and
Expand are viewing controls. Ordinary document scrolling is retained inline;
expanded viewing uses the existing Fairway modal, focus trap and restoration,
zoom/pan buttons and reset. Form values survive opening/closing it. Current
Shot 3 is distinct from the latest committed event, Shot 2.

`ReviewHero` preserves round summary, hole filmstrip, narrative and one selected
hole. One 310px drawing has Hole / Green / Putting controls, recorded-shot
selection and one evidence explanation; desktop places the drawing beside the
detail. The strip stays static. `PuttingZoom` provides a separate radial-distance
schematic, preserving independently tagged units and recorded makes. A remaining
radius with no bearing is a ring, never an invented endpoint or green quadrant.
Legacy callers retain the existing HoleShotPath / PuttingZoom contracts.

Both consumers accept the same optional package and original-event adapter.
No production course binding, provider fetch, migration or geometry write is
introduced. Missing geometry keeps a bounded neutral context and the existing
controls and event evidence. Scene failures do not join save/checkpoint success.
The tracking, edit, undo, penalty and statistics handlers are unchanged.

### 19.4 Sharper surfaces, vegetation and source fidelity

The renderer uses quiet evergreen ground, a distinct fairway, muted-sage green
with a crisp boundary, warm sand with a fine dark edge and restrained highlight,
and cream event annotations. No cart paths were added. Routing centerlines are
removed when surfaces are available; a route guide cannot masquerade as shot
history. Ordinary unresolved events have no geographic dot or connection.
Analytic anchor fixtures remain explicitly separate from player reconstruction.

Canonical OSM vertices, polygon holes, disconnected components, handedness and
uniform scaling remain intact. Display-only corner cleanup samples at <=0.8m,
limits bidirectional boundary displacement to 0.5m and ring-area change to 1.5%,
validates topology and falls back to the original ring if it fails. This is a
bounded styling approximation, not a source-accuracy claim or spline fitting.
Source views use the original geometry. Expanded display can exceed the earlier
0.5 screen-pixel simplification target; this explicit 0.5m styling allowance
follows the owner's request to infer small edges for cleaner presentation.

The deeper-green fairway surround and green collar are illustrative mowing
shading, not surveyed rough/fringe polygons. They cannot constrain a ball lie.
Tree crowns are decorative symbols inside source-reviewed approximate canopy
groups, not individual tree observations. Their positions never alter camera
bounds or ball evidence. Uncertain foliage edges and detached shadows are
omitted; independent course-familiar review is still pending.

The original 2048px whole-course NAIP export reduced the actual 0.6m source
detail to roughly 1.05m east-west / 1.36m north-south per output pixel. It was
insufficient for confident tree/shadow delineation. The current hole-7 canopy
review uses USDA FPAC tile `m_3907830_SE_17_60_20240910`, captured September 10,
2024. A 360×855 hole crop covers `[-78.2952,39.5145,-78.2927,39.5191]`, about
0.6m per output pixel. Export is locked to raster 206581 with nearest-neighbor
sampling; enlarging a PNG is not claimed to add information.

The Morgan 2024 leaf-off county service was viewed to inspect branches and cast
shadows. Its service description restricts redistribution; no county raster or
traced county coordinates are committed or used as distributable geometry.
The newer 2026 county directory was discovered but not imported. Source review
stays bounded to this pilot. Public NAIP canopy metadata, bbox, pixel masks,
review date and limitations are retained in `cacapon-canopy-review.json`.

Sources: [USDA FPAC NAIP service](https://apps.geo.fpac.usda.gov/geo-imagery/rest/services/naip/conus_naip/ImageServer),
[WV imagery catalogue](https://mapwv.gov/gis_services.html),
[County viewing terms](https://services.wvgis.wvu.edu/arcgis/rest/services/Imagery_BaseMaps_EarthCover/wv_imagery_WVGISTC_leaf_off_mosaic/MapServer).

### 19.5 Review artifacts and reproduction

- [Around-green entry, 390 CSS px](assets/course-geometry-2026-09-12/entry-around-390.png)
- [Tee overview, 390 CSS px](assets/course-geometry-2026-09-12/entry-tee-390.png)
- [Putting entry](assets/course-geometry-2026-09-12/entry-putting-390.png)
- [Selected-shot green detail](assets/course-geometry-2026-09-12/review-green-390.png)
- [Review putting detail](assets/course-geometry-2026-09-12/review-putting-390.png)
- [Expanded entry](assets/course-geometry-2026-09-12/entry-expanded-390.png)
- [Focused distance input](assets/course-geometry-2026-09-12/entry-distance-focused-390.png)
- [Narrow/short entry](assets/course-geometry-2026-09-12/entry-around-320.png)
- [Missing geometry](assets/course-geometry-2026-09-12/entry-missing-390.png)
- [Ambiguous position](assets/course-geometry-2026-09-12/entry-ambiguous-390.png)
- [Source-reviewed canopy groups](assets/course-geometry-2026-09-12/cacapon-07-canopy-overlay.png)
- [All 18 physical holes](assets/course-geometry-2026-09-12/contact-sheet.png)
- [SVG manifest](assets/course-geometry-2026-09-12/manifest.json)
- [Browser dimensions and interaction report](assets/course-geometry-2026-09-12/browser-verification.json)
- [Package and per-hole source dossier](../../src/test/fixtures/course-geometry/cacapon-quality.json)

Run `npx vite --config scripts/golf/course-geometry/browser.config.ts` locally.
The entry URL is `/golf/dashboard/rounds/continue/fixture?case=around`; review is
`/golf/dashboard/rounds/fixture/review?hole=7`. Cases include tee, approach,
around, putting, ambiguous, missing, penalty and review rolloff. This mounts
actual React tracking/review components, FairwayDashboardShell, providers and
Fairway CSS; only external infrastructure and data boundaries are inert local
adapters. It has no production credentials or working database client. Local
callbacks exercise the actual state handlers without writing a real round.

Run Playwright CLI `run-code --filename=scripts/golf/course-geometry/capture-screens.cjs`
and `verify-interactions.cjs` against that server. Captures use fixed fixture data,
locally pinned Fragment Mono, system UI fonts, reduced motion and device scale 2.
They are actual-component screenshots, not the earlier SSR presentation board.
The focused-input capture does not show or certify a native virtual keyboard.

`npx tsx scripts/golf/course-geometry/review-report.tsx` produces 72 deterministic
SVG previews and a contact sheet without DB/provider calls. `prepare-pilot.py`
rebuilds from cached OSM XML and the explicit canopy review. `source-overlay.py`
uses the documented 2022 export by default, or the native 2024 hole crop with
`--canopy`. Source-review pixel coordinates are never used for metre calculations.

Package hash: `69ac58c8cc4e29403101c931abf50c8f1fe4305aea474c3e63bd509083c28bfe`.
151 physical/source-context features; 18 partial holes; 31,388 bytes compressed.
Projection `wgs84-local-enu-v1`; style `fairway-vector-v7`;
ordinary scene algorithm `evidence-only-v1`.

### 19.6 Verification and remaining gates

- 100 geometry/review test files: 1,290 tests passed after the surface/tree UI
  changes. Additional canopy invariants check reviewed-source membership,
  playing-surface clearance, camera stability and absence of invented anchors.
- Existing tracking/state/penalty/unit/schema regression cohort: 8 files,
  174 tests passed. Original save, undo, edit, penalty and statistical writers
  have no implementation changes in this UI correction.
- Full TypeScript and targeted ESLint checks passed.
- Browser capture covers 375×812, 390×844, 430×932 and 320×568 CSS viewports.
  All entry drawings are 160px; review drawings are 310px with one selected
  viewport. Entry checks found no horizontal overflow or nested vertical scroll.
  Default camera stayed identical while typing; Expand/zoom/reset/close preserved
  the unsaved value and restored focus. Committing Sand 17yd → Green 12ft retained
  those original units and advanced to Shot 4 / Putting.
- Native Safari keyboard/safe-area interaction remains unverified: the Mac was
  locked and could not be operated through Computer Use. Browser-focused input
  is recorded separately and is not represented as native keyboard evidence.
- Final build, interaction replay and review-gate results are appended below
  after completion; a started check is not counted as a pass.

Every hole remains partial pending independent course-familiar/current-boundary
acceptance and selected-tee mapping. Full latent-target reconstruction is still
Stage 5: the UI does not manufacture precise endpoints to create a pretty path.
Storage/access/version binding and production geometry resolution remain later
stages. No source positional accuracy or empirical shot endpoint error is claimed.
No production migration, bulk enrichment, merge or deployment was performed.

### 19.7 Per-hole visual audit and shared refinements

All 18 clean review PNGs were individually inspected at their native 320×310
size after inspecting the full contact sheet. This is a rendering/clarity review,
not a new acceptance of geographic currentness or independent accuracy.

| Hole | Observed clarity opportunity | Treatment / remaining limit |
|---|---|---|
| 1 | Small greenside bunker lobes; long gap from tee to fairway | Fine sand edges, lighter strip strokes; retain real gap and use Green detail |
| 2 | Water sits close to a narrow fairway/green complex | Preserve water separation and blue fill; continuous green collar improves hierarchy |
| 3 | Long par 5 with two disconnected water features and tiny terminal green | Preserve both water components; Green/Expand supplies detail without widening the hole |
| 4 | Long shared green can look like an incorrectly colored fairway | Explicit shared-green status for holes 4/8; do not split or shorten the accepted polygon |
| 5 | Small lobed bunkers and angular fairway transition | Bounded corner cleanup and crisp sand border; preserve strategic narrowing |
| 6 | Bunker group nearly touches the inside dogleg | Preserve separate features and their coordinates; no opaque badge covering the group |
| 7 | Tree crowns appeared in a mechanical grid; angular canopy-mask edge visible | Deterministic stagger/jitter, modest crown-size variation and quieter group fill; source masks unchanged |
| 8 | Same shared green viewed from the other routing direction | Same feature ID/shape and shared-green wording; preserve handedness |
| 9 | Very long fairway, water beside a tiny terminal green | Keep uniform scale and whole-hole context; selected greenside event defaults to Green |
| 10 | Rejected tee is absent, with separate near-tee water | Keep tee unknown; do not fabricate a tee to balance the composition |
| 11 | Several tiny greenside bunkers merge visually in strip size | Reduce strip border weight; detailed view retains individual polygons |
| 12 | Narrow fairway-to-green transition makes the collar disappear | Render the green collar above fairway fill and below the true green/bunkers |
| 13 | Green boundary blends into the fairway on the upper edge | Restore continuous collar and preserve actual green proportions |
| 14 | Simple large fairway risks looking flat or over-decorated | Keep quiet fill/edge hierarchy; no trees without reviewed source groups |
| 15 | Bunker islands/holes and disconnected fairway are essential | Retain even-odd polygon interiors and real gap; no spline bridging |
| 16 | Dogleg bunker group has narrow separations | Same sharper sand treatment; no individual bunker enlargement |
| 17 | Large green relative to short par-3 fairway | Preserve that real proportion and a separate putting view |
| 18 | Long par 5 makes greenside sand very small in overview | Keep overview honest; Green/Expand supplies readable detail, lighter strip edges |

The audit also exposed redundant collinear points generated by corner cleanup.
They are now removed before validation/serialization, preserving the same
boundary within 1e-8m collinearity tolerance. Local macOS/Node timing over 54
cold scene instances fell from 146ms to 13.9ms p95 SVG serialization; median
fell from 59.5ms to 6.8ms. Scene construction p95 was 0.73ms. These are local
measurements, not a claim of representative-phone performance or endpoint accuracy.
The source geometry, scorecard distances and recorded event values did not change.

## 20. Interactive terrain extension — September 13, 2026

### 20.1 Authority and current scope

Read plan PR #1937 at `bcac4026b2fc238d441575f95f0c6359ff6232b8`, including
Sections 7.7 and 18 completely. The owner subsequently selected **extend the
renderer, retain manual entry, and omit cart paths**. This authorizes a bounded
terrain feasibility extension of this plan. It does not adopt the pasted
proposal's GPS capture, target/pin placement questions, native-app rewrite or
CoachHelm insight changes. Production storage, publication and deployment
remain outside this pass.

At the start of the UI correction, Section 18's contextual crops, actual-screen
proof and shared surface hierarchy were incomplete. Section 19 records those
corrections. This pass adds restrained view/selected-evidence motion and
finishes a one-hole terrain prototype in the existing expanded viewer. The
remaining Section 18 release gates include native keyboard/safe-area checks,
course-familiar acceptance and empirically defensible reconstruction. The
existing manual data still cannot establish exact ball positions or a daily
pin, so a flight replay is not fabricated to demonstrate camera motion.

Current GolfHelm is Next.js with Capacitor, not React Native. A small WebGL
backend reuses `CourseHoleScene` and the existing Fairway `ModalShell` for this
feasibility pass. It uses a real depth buffer, fixed buffers and a camera
uniform, with no new npm dependency. React Native Skia would require a native
integration; Skia's web/CanvasKit route can be benchmarked separately. Neither
backend is being declared the final production winner without device evidence.

### 20.2 Source dossier and coordinate contract

The pilot is **Cacapon physical hole 7**, with the same versioned OSM geometry
and NAIP canopy context used in Section 19. This initial terrain pass used one hole; Section 21 records the subsequent
four-course source trial. A bounded, read-only USGS catalogue query identified:

| Field | Observed value / limitation |
|---|---|
| Product | USGS 1 Meter 17 x73y438 MD_Western_2021_D21 |
| Catalogue identity | 3DEPElevation ImageServer OBJECTID 129279; title and source URL retained |
| Acquisition | December 4–21, 2021 |
| Vertical datum | NAVD88 orthometric metres |
| Native DEM resolution | 1m; not a promise of metre positional accuracy |
| Export | F32, 256×512 pixels, bilinear sampling, locked to that raster |
| Returned extent | −78.2958, 39.5132 to −78.2922, 39.5204 in EPSG:4326 |
| Runtime terrain | 8m cell subdivision, with constrained boundary triangles |
| Mesh | 7,796 triangles; 106,326 bytes gzip (compact JSON, Node gzip) |
| Sampled mesh elevations | 262.8568–275.2988m NAVD88; this is a crop range, not a shot elevation change |
| Acceptance | `source_candidate`; independent registration and renovation review pending |
| Accuracy fields | Vertical accuracy and registration residual remain null |

Sources: [USGS elevation service](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer),
[original DEM product](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/MD_Western_2021_D21/TIFF/USGS_1M_17_x73y438_MD_Western_2021_D21.tif),
[USGS product access and use terms](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services).
The 2024 NAIP imagery is newer than this terrain. No putting-break, bunker-lip,
tree-height, survey-grade accuracy or renovation-currentness claim is made.

The initial TNMAccess request timed out; the official ImageServer supplied the
bounded fallback. A comma-delimited point query returned unrelated catalogue
results and was discarded. The successful query specifies the point as JSON
with an explicit spatial reference and verifies the chosen product. The export
service expands the requested extent to its aspect ratio; sampling uses its
**returned extent and pixel centres**, not the request's bounds.

The horizontal coordinates are the existing local East/North frame; Z is
explicitly NAVD88 height, **not ellipsoidal ENU Up or phone altitude**. All
surface regions use the same DEM. The source mesh is immutable display data;
camera exaggeration references a local height and never changes original
vertices, distances, units, lies, scores or statistics.

Geometry hash: `69ac58c8cc4e29403101c931abf50c8f1fe4305aea474c3e63bd509083c28bfe`.
Terrain hash: `9f0615b6945ac6274a6ddbc46a1a19ef0c0b4b02dea4186173211560d1915f0f`.
The cached raster hash, source metadata, area reports and remaining limits are
in `src/test/fixtures/course-geometry/cacapon-07-terrain-report.json`.

### 20.3 Rendering and interaction

- Top is orthographic at 90°; Terrain defaults to 50°; Side is a low-angle 20°
  view. Drag stays within 20–90° pitch and ±45° yaw, with 0.5–4× zoom (updated in Section 22) and bounded
  pan. One fixed base bearing per viewport improves whole-hole framing without
  counter-rotating during gestures. Only the expanded viewer captures gestures.
- Top preserves uniform metric XY scale. Tilt naturally foreshortens the
  projected ground; this explicitly extends the earlier 2D camera contract.
  Original metrics are always computed outside this visual projection.
- Height emphasis is visibly labelled 1.0× or 1.5×. No DEM reading or camera
  change feeds `calculateShotDistance`, scoring or CoachHelm logic.
- Fairway/green/sand footprints and polygon interiors are preserved. Inward
  colour ribbons improve green and bunker edges. They are material treatment,
  not new fringe polygons or surveyed bunker lips. Muted world-space lighting
  uses the real mesh normals. Source-backed canopy masses support layered illustrative crowns in both
  views. Crown positions within the mask, heights and shading are decorative;
  they are not measured individual trees or terrain-obstruction evidence.
- A missing or lost WebGL context removes unavailable terrain controls and
  returns to the SVG outline. Source coverage failures remain separate from
  ordinary absence of terrain. Abstract putting is independent of the DEM.
- The existing inline entry is 160px and review 310px. Expanded detail uses
  the existing full-workspace ModalShell, compact controls and a bounded drawing.
  Its accessible content may scroll on short screens or increased text sizes.
  Inline diagrams permit normal page scrolling and add no nested scroll area.
- View transitions and selected evidence use short scoped animations; reduced
  motion settles camera presets immediately. Filmstrip diagrams remain static.
- SVG terrain export uses the same projected vertices and materials as the
  GPU. Planar depth comparisons remove hidden regions before serialization.
  Per-visible-surface underpainting fixes triangle antialias seams while
  preserving polygon holes and outer boundaries. No raster image is embedded.

### 20.4 Reproduction and evidence

The real-screen harness still mounts FairwayDashboardShell, FairwayShotTracking,
FairwayShotEntry and ReviewHero with inert external adapters. It is not an
authenticated production session and does not certify database writes.

```sh
# Existing public-source cache is sufficient; no provider calls at runtime.
python3 scripts/golf/course-geometry/fetch-terrain-pilot.py /tmp/golf-terrain-pilot
python3 scripts/golf/course-geometry/prepare-terrain-pilot.py /tmp/golf-terrain-pilot
npx tsx scripts/golf/course-geometry/review-report.tsx
npx tsx scripts/golf/course-geometry/render-terrain-pilot.ts
python3 scripts/golf/course-geometry/vectorize-terrain.py output/course-geometry/terrain
python3 scripts/golf/course-geometry/test-terrain-vectorize.py
npx vite --config scripts/golf/course-geometry/browser.config.ts
```

Using Playwright CLI against that server, run `capture-screens.cjs`,
`verify-interactions.cjs`, `verify-terrain.cjs`, `capture-motion.cjs`,
`capture-terrain-motion.cjs` and `capture-terrain-exports.cjs` from
`scripts/golf/course-geometry/`. Then run
`node scripts/golf/course-geometry/compare-terrain-exports.mjs`.
The exporter comparison fixture at `/?export=terrain` is a controlled parity
test; the entry/review URLs in Section 19 remain the actual-screen evidence.

- [Around-green entry](assets/course-geometry-2026-09-13/entry-around-390.png)
- [Entry putting](assets/course-geometry-2026-09-13/entry-putting-390.png)
- [Review selected-shot green detail](assets/course-geometry-2026-09-13/review-green-390.png)
- [Expanded Terrain](assets/course-geometry-2026-09-13/review-terrain-390.png)
- [Expanded Side](assets/course-geometry-2026-09-13/terrain-side-390.png)
- [Whole-hole Terrain](assets/course-geometry-2026-09-13/terrain-whole-hole-390.png)
- [Camera demonstration](assets/course-geometry-2026-09-13/terrain-motion.mp4)
- [GPU failure fallback](assets/course-geometry-2026-09-13/terrain-gpu-fallback-390.png)
- [Short focused-input viewport](assets/course-geometry-2026-09-13/entry-short-focused-390.png)
- [All 18 holes, style v9](assets/course-geometry-2026-09-13/contact-sheet.png)
- [Browser verification](assets/course-geometry-2026-09-13/browser-verification.json)
- [Terrain and motion verification](assets/course-geometry-2026-09-13/terrain-verification.json)
- [SVG/GPU parity](assets/course-geometry-2026-09-13/export-comparison.json)
- [Top SVG](assets/course-geometry-2026-09-13/cacapon-07-top.svg),
  [Terrain SVG](assets/course-geometry-2026-09-13/cacapon-07-terrain.svg),
  [Side SVG](assets/course-geometry-2026-09-13/cacapon-07-side.svg)

Current verification: 309 tests across fourteen geometry/shot-helper/state-machine/
penalty/unit, entry-distance and save-schema files pass; four analytic depth/hash tests pass. Targeted
ESLint, full TypeScript and the isolated real-component production bundle pass.
Browser checks at 375×812, 390×844, 430×932 and 320×568 retain original
measurements, save/edit/undo/penalty replay, stable inline cameras, unfinished
12ft input and focus restoration. WebGL context-loss injection falls back
without losing the form. Missing geometry and putting expose no terrain UI.
At 620×480, fewer than 0.004% of SVG/GPU pixels differ by more than 32/255 in
any RGB channel across the three presets. This is rendering agreement only.
The manifest retains the exact observations and viewport dimensions.

The earlier full Next build predates this extension; it is not claimed as a
current pass. A 4GB TypeScript attempt exhausted its heap; the serialized 6GB
retry passed. The isolated fixture bundle uses real components but deliberately
stubs external infrastructure; its size is not the incremental player-route JS
budget. GitHub owns the full required application build and CodeQL checks.

Native virtual-keyboard/safe-area behavior, supported-phone GPU performance,
120Hz feasibility, thermal response, independent terrain registration and
course-familiar source approval remain **unverified**. A shortened desktop
viewport with a focused field is labelled separately from a native keyboard.
Desktop RAF observations are not GPU frame timings or a phone performance SLO.
Library expansion, production resolution and full manual-input reconstruction
remain subsequent gates; this pass introduces no production mutation.

## 21. Four-course high-fidelity source trial — September 13, 2026

### 21.1 Scope and usage selection

The owner narrowed the expansion to the top courses and requested high-fidelity
imagery only. The authoritative plan revision remains PR #1937 at
`bcac4026b2fc238d441575f95f0c6359ff6232b8`, including Sections 7.7 and 18;
Sections 19–21 record implementation findings rather than competing plans.
Manual entry, no cart paths, no GPS, unknown pin and immutable original shot
measurements remain unchanged.

A read-only production query on September 13 found 21 linked course records
with more than one **completed** round outside the two explicit demo teams.
It excluded direct demo-team rounds and players with demo memberships, including
rounds whose team field was null. Null teams were resolved only through a sole
active team membership. Both demo IDs come from the existing demo-team authority,
not a name-substring guess. In-progress rounds do not count as completed play.
The four highest counts were:

| Course record | Completed rounds | Trial result |
|---|---:|---|
| Bryan Park Champs | 45 | Unassigned green complex; layout and renovation review pending |
| Cacapon State Park | 36 | Existing 18-hole partial SVG package; hole 7 terrain/canopy proof |
| The Cardinal | 30 | Unassigned green complex; routing/fairway/tee coverage missing |
| Winchester CC | 30 | 18-hole candidate SVG package; hole 7 terrain/canopy proof |

The complete aggregate query and result are retained as `cohort-query.sql` and
`course-cohort-2026-09-13.json`. No player shot ledger or personal profile was
queried. There were 105 completed rounds without a course link; their names
remain unresolved candidates and were not silently attached to library courses.
No production write, migration, binding, enrichment, merge or deployment occurs.

### 21.2 Native image quality and source dates

| Study | Native resolution and capture | Use / unresolved limitation |
|---|---|---|
| Bryan Park | Six inches / 0.1524m, February 11, 2022 | NC Latest imagery; current bunker agreement unresolved |
| The Cardinal | Six inches / 0.1524m, February 9, 2022 | NC Latest imagery; played-hole order unresolved |
| Winchester 7 | Twelve inches / 0.3048m, 2022 | VA VBMP tile `DO_N17_5180_20.2022`; day unavailable |
| Cacapon comparison | Morgan County 2024; native GSD not established | View-only; requested six-inch export is not claimed as native six-inch data |

The NC 2024–2027 service returned blank crops at these points. The Latest
service returned the actual 2022 photographs; seamline metadata established the
capture dates. The fetcher rejects blank or provider-resized responses instead
of silently reducing fidelity. Image pixel size and requested output scale are
recorded separately from source accuracy. No sharpening/upscaling is presented
as new geographic evidence.

The [NC image service](https://services.gis.nc.gov/secure/rest/services/Imagery/Orthoimagery_Latest/ImageServer)
and [acquisition seamlines](https://services.nconemap.gov/secure/rest/services/NC1Map_Ortho_Acquisition_Related/FeatureServer/13)
support the NC dates. The [VA imagery index](https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS_Tile_Index/MapServer/2)
identifies Winchester's native twelve-inch product. [Bryan Park's official site](https://bryanpark.com/)
reports Champions bunker renovations; sharp 2022 imagery cannot establish the
current renovated boundaries. NC and county photographs remain local inspection
files, not redistributed pixels or unverified tracing inputs.

### 21.3 Geometry, terrain and tree findings

Winchester's 18 OSM route ordinals and pars match the existing Gold tee scorecard.
Recorded tee yardages remain unchanged; hole 7 remains 355yd irrespective of
route length or camera. The package contains 160 features, including two OSM
multipolygon fairway relations with preserved inner rings. Candidate hazard
associations omit ambiguous nearby-hole matches and retain the omitted IDs in
`winchester-review.json`; all 18 holes remain partial source candidates.

Only hole 7's canopy groups and two greenside bunkers received this crop review.
Visible crown texture was distinguished from detached shadows; other holes do
not gain invented trees to fill space. Crowns are illustrations inside supported
canopy masks, not measured tree bases/heights. Shadow pixels do not become rough
or bunker polygons. A course-familiar independent reviewer has not accepted the
package or established currentness/registration error.

Winchester 7 uses **USGS 1 Meter 17 x74y434 VA_NorthernShenandoah_2020_D20**,
captured November 29, 2020–January 12, 2021, in NAVD88. Its 5,484-triangle mesh
has sampled elevations 192.8197–216.3616m and a 78,249-byte compact JSON gzip
payload. Those are mesh characteristics, not shot elevation or accuracy claims.
Geometry hash: `0bb452f127b08568a8a7a41be537af7cdbcabf39b0c7562ecfa047d8f88373c0`.
Terrain hash: `8eb95c69001283eb67c860d81a3f894ba6834893f0fb2851174f570fd34dd743`.

The bounded USGS ImageServer catalogue query found no `USGS 1 Meter` product at
the two NC study points. This is not a claim that all state/local elevation is
unavailable. No older coarse DEM was substituted to manufacture an angled view.
Bryan and Cardinal therefore remain original-OSM green studies with no physical
pin, route, tee, full-hole claim or playable binding. The validator permits an
unrouted study only as an explicitly labelled partial `source_candidate` with a
green; it rejects relabelling that study as `reviewed_draft`. Internal placeholder
ordinal/par fields are not exposed as a real scorecard. The source review view
has only Green/Expand viewing controls and reuses `HoleSceneFrame`.

### 21.4 Reproduction, actual screens and verification

`src/test/fixtures/course-geometry/sources/README.md` documents reproduction from
immutable compressed OSM extracts and public USGS raster caches. Original source
hashes, native image metadata and unresolved edges remain beside the fixtures.
`render-top-courses.tsx` produces 38 deterministic SVG previews using the same
React `CourseHoleScene`: 18 Cacapon, 18 Winchester and two unassigned studies.
Contact sheets label played hole/yardage when known, package hash, style and
partial status outside the physical scene. No image-generation model is used.

The actual Fairway entry/review harness accepts `?course=winchester`; Cacapon is
the default. `?study=bryan` and `?study=cardinal` open the internal acceptance
view. It mounts the actual shared app shell and scene component, but does not
pretend an unassigned green is a playable round. External service adapters are
inert and the example shot ledger is synthetic.

- [Winchester interactive terrain](assets/course-geometry-2026-09-13/winchester-terrain.png)
- [Winchester entry](assets/course-geometry-2026-09-13/winchester-entry.png)
- [Winchester review detail](assets/course-geometry-2026-09-13/winchester-review-green.png)
- [Winchester 18-hole contact sheet](assets/course-geometry-2026-09-13/winchester-contact.png)
- [Bryan Park source study](assets/course-geometry-2026-09-13/bryan-source-study.png)
- [Cardinal source study](assets/course-geometry-2026-09-13/cardinal-source-study.png)
- [Four-course browser report](assets/course-geometry-2026-09-13/top-course-verification.json)
- [Per-hole hashes and sizes](assets/course-geometry-2026-09-13/top-course-manifest.json)

The four-course browser check at 390×844 records zero page errors. Cacapon and
Winchester preserve the unfinished 12ft entry and unchanged saved ledger when
Expand opens/closes; both use the same scene/reconstruction. The two unassigned
studies expose no Hole routing control. Targeted ESLint, all preparation-script
Ruff checks, full TypeScript, 309 tests across fourteen relevant files and four
analytic vector visibility/hash tests pass. The isolated real-component Vite
production bundle passes; it is not the full Next application build or a phone
bundle-size benchmark. Current Cacapon SVG/GPU comparison at 620×480 has fewer
than 0.004% of pixels differing by more than 32/255 across all three presets.
This measures renderer agreement only, not geographic accuracy.

This trial is **not four fully accepted courses**. Only Cacapon 7 and Winchester
7 have terrain studies; other holes lack equivalent detailed source review.
Bryan/Cardinal need layout/currentness resolution and suitable terrain sources.
Native phone keyboard/safe-area tests, supported-device frame-time benchmarks,
independent registration, course-familiar approval and production access/storage
remain outstanding. Neither source resolution nor attractive trees closes those
gates. The trial demonstrates reuse and exposes the per-course review work;
it does not establish a universal enrichment time or national coverage rate.

## 22. Camera, shot-scale and visual review — September 13, 2026

### 22.1 Reviewed revision and scope

This pass reread plan PR #1937 at `bcac4026b2fc238d441575f95f0c6359ff6232b8`,
including the complete Sections 7.7 and 18, plus the accumulated Sections 19–21,
current AGENTS.md, design tokens and mapped shot/lifecycle documentation. The
implementation branch preserves current-main work through merge `f5d994b01`.
Three agents reviewed camera/motion, shot accuracy and visual craft independently;
the primary agent integrated and verified the actual Fairway components.

The fifth supplied image establishes the visual direction: generous map space,
clear fairway/green hierarchy, dimensional tree groups and readable shot evidence.
It does not supply geometry, individual tree positions, shot coordinates or club
measurements. The existing manual controls, no-cart-path decision and production
mutation restrictions continue to apply.

| Section 18 gap found in the current implementation | Correction in this pass |
|---|---|
| Expanded chrome and controls consumed map space | Compact hole header, one view row, floating 44px zoom/reset controls, secondary camera tools and collapsible source detail |
| Orbit refitted bounds every frame, cancelling part of the drag and changing scale | One geometry-derived world focus and orthographic lens; only explicit zoom changes scale |
| Tree lift and shadows partly followed screen axes | Project bases, elevated crown centres, world light and ground shadows through the same terrain camera |
| All ordinary manual shots were unresolved | Bounded distance/surface/direction regions with one latent target model, conservative gates and explicit ambiguity |
| A pretty adjacent pair of points could suggest a shot connection | Shared overlay requires a validated connection from one coherent retained sequence |
| Selected greenside detail remained below the visible review area | Deliberate hole/shot selection brings its detail into view; hover/focus scrubbing does not scroll |
| Flat surface definition and mechanical crown shapes | Stronger muted-sage/rough separation, crisp green/sand edges, varied layered crowns and consistent light direction |
| Tiny region cells resembled ball dots in whole-hole views | Suppress cells below 24 CSS-pixel² instead of enlarging their geographic extent; retain the evidence explanation and Green/zoom inspection |

### 22.2 Physical scale, camera and gestures

`fitTerrainCamera` now selects its base bearing, world focus and scale from the
physical context and viewport once. Yaw/pitch no longer trigger a fresh fit.
Top uses equal East/North metric scale; terrain tilt intentionally foreshortens
the ground. The Top scale bar is hidden in angled views. Scorecard tee yardage
remains the original value; it does not stretch the course or masquerade as a
measured straight distance to today's cup.

Expanded interaction supports 20–90° pitch, ±45° yaw, explicit 0.5–4× zoom and
bounded pan. Off-centre pinch preserves its midpoint, pointer release removes
only the released finger, and wheel input normalizes pixel/line/page units.
Camera buttons flush queued motion and rebase active pointers. Rotate, tilt,
pan, zoom and reset all have button alternatives. A missing/failed terrain fit
uses SVG pan; it never captures a drag into an invisible terrain camera.
Inline entry stays 160px and scroll-friendly; review stays one 310px viewport.
At standard text size, expanded drawing height is `100dvh - 250px`, constrained
to 200–720px. Accessible content may scroll in the existing modal body.

The implementation follows the separation of touch actions and per-pointer
capture in [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/) and the
requirement for alternatives to dragging in
[WCAG 2.2 dragging guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
The stable-lens choice follows ordinary
[orthographic camera semantics](https://threejs.org/docs/pages/OrthographicCamera.html),
without adding Three.js or a second camera backend.

### 22.3 Strongest defensible manual-shot overlay

`manual-bounds-v1` replaces the earlier evidence-only scene adapter. It retains
at most 36 hypothetical target samples within the reviewed green, eight states
per target, 96 region cells per event, 72 events and 250,000 point checks. The
same hypothetical target is retained through a compatible sequence; it is never
exported or rendered as an actual pin. The remaining-distance allowance includes
half the original unit plus an explicitly uncalibrated 2m off-green or 0.3048m
on-green allowance. These are illustration hypotheses, not empirical error
estimates, exhaustive feasible sets or statistical confidence intervals.

Approach direction remains one of all eight sectors in the player's target
frame. An unknown origin or tee aim leaves direction unresolved. Backward
recovery remains possible. Original `Other`, missing units/distances and
conflicting neighbors remain explicit conditions. Derived `shotDistance` is
retained for legacy display/statistics but is never a second radius.

A compatible sampled region must remain inside the relevant reviewed surface.
A new independent surface guard also limits every cell's full circular extent
against overlapping sand, green, water and incompatible lies. A fairway polygon
overlapping a bunker does not justify a fairway position inside that bunker.
Canonical source polygons remain unchanged.

Current package behavior is deliberately different by source readiness:

- **Cacapon partial reviewed draft:** possible regions only; no exact point or
  line. The supplied 158yd approach, Sand, Short right, 17yd remaining fits two
  mapped bunkers. Later green/putting events do not silently choose one.
- **Winchester source candidate:** course context only, with source acceptance
  pending. No geographic shot region or marker is asserted.
- **Complete reviewed analytic fixtures:** a unique compatible surface can
  receive a deterministic estimated representative from a coherent retained
  sequence. Its straight dashed connection depicts endpoint separation, not
  measured flight, carry, roll or a curve along the routing centreline.

Both SVG and terrain now use `CourseShotOverlay`. Anchors share the surface
camera; numbered badges stay readable in CSS pixels and may move independently
with leaders. Invalid, penalty, gap-spanning or incoherent connections do not
render. Penalty transition origins, edit/delete/undo, original units/results,
scores and driving statistics remain controlled by their existing writers.
`describePosition` supplies the same truthful status to review and expanded
entry: possible areas, estimated position, unresolved position, penalty event,
holed with unknown pin, or abstract putting schematic.

### 22.4 Visual craft and source limits

Style `fairway-vector-v10` strengthens fairway/ground contrast, muted-sage greens,
warm sand rims and source-backed canopy layers. Canonical feature footprints,
polygon holes and disconnected fairways are unchanged. Thirty-two cached crown
silhouettes replace repeated identical shapes with fewer drawing primitives.
Their heights and individual crown placement remain illustrative within reviewed
canopy masks. They do not establish real strategic trees or measured shadows.
No canopy is added to unreviewed holes merely to resemble the reference image.

This follows cartographic emphasis on contrast, hierarchy and proportion in
[Esri's design principles](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/primary-design-principles-for-cartography)
and explicit interior/painting behavior in
[SVG painting rules](https://www.w3.org/TR/SVG/painting.html).
The cream/ground palette contrast measures 13.69:1; fairway/ground measures
3.60:1. Those comparisons do not constitute a full application contrast audit.
GPU buffers and cached crown preparation avoid per-frame rebuilds, consistent
with [WebGL performance guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

The reference's dense woodland requires substantially more reviewed canopy
coverage. Only the two pilot holes currently have matching terrain/canopy
studies. Tree billboards are not a full 3D tree volume/occlusion system, and
USGS macro terrain does not support putting-break claims. The rest of the
four-course source trial remains at the acceptance levels recorded in Section 21.

### 22.5 Pin and putting correction

The owner's clarification replaces the technical “cup reference” UI with an
ordinary ball-to-hole putting diagram and an **Estimated pin** flag. The flag
uses the same retained target hypothesis as the reconstructed shots, or a
validated interior green reference when that sequence is unavailable. The
canonical target remains `unknown_pin`: tee selection and remaining yardage
support an estimate, not a unique observation of the day's hole location. A
scorecard routing distance is not a measured tee-to-pin chord and cannot stretch
the real course. The inferred flag never becomes new evidence fed back into the
solver. Source candidates without accepted green geometry receive no flag.

The putting diagram uses one feet scale for the recorded starting distance and
remaining-distance ring. Its illustrated bearing does not claim putting break.
A zero leave does not mark a putt made without the explicit result. Roll-off
values retain their original yard/foot conversion. Par-3 first approaches now
respect the explicit approach direction instead of being mistaken for an
ordinary tee-direction observation. A test-only ledger replacement also resets
its target provenance instead of inheriting a pin from the previous ledger.

## 23. Web/Capacitor premium landscape vertical slice

### 23.1 Reuse and runtime decision

The owner's 29-section specification is adopted within this existing plan. The
previously unidentified USGS screen is in this task worktree, behind
`CourseHoleScene`, `CourseTerrainCanvas` and `HoleSceneFrame`. Its real data
already lives in the shared geometry packages, `TerrainMesh`, course source
manifests and manual-shot adapter. No second course catalog, score ledger,
coordinate model or source acquisition pipeline is introduced.

Helm's runtime is React DOM/Next.js with Capacitor. This slice pins Three.js
0.186.0 behind the existing expanded-renderer boundary. Raw Three is sufficient;
React Three Fiber and camera-control dependencies are unnecessary for the
existing constrained camera controller. The Three module loads only when an
expanded terrain view is requested. Inline maps and filmstrip previews remain
SVG, with one live GPU canvas for the expanded hole.

### 23.2 Landscape and interaction contract

The live landscape reuses terrain triangles already split and draped across
source surface boundaries. It does not triangulate only a polygon outline and
bridge over its interior relief. Course-local horizontal meters and orthometric
NAVD88 elevation remain explicitly distinct from rigorous topocentric ENU Up.

The display adapter owns lighting, opaque instanced crown volumes, mowing and
material variation. It uses the supplied brighter grass/sand palette with one
world-space sun. Terrain relief may be exaggerated; tree height is preserved
above its displayed base. Changing display height must update normals, shadow
geometry and picking consistently without changing the canonical vertices,
remaining-distance evidence or terrain queries. Tree placement/height is still
illustrative inside reviewed canopy masks, not surveyed strategic-tree data.
No cart paths are added.

The expanded phone view is a landscape with a compact floating header and a
normal-flow inspector below; desktop uses a 320px right inspector. The inspector
is nonmodal relative to the course and has no overlay intercepting canvas input.
The enclosing Fairway workspace retains focus/escape/restore behavior while
protecting the underlying unsaved shot-entry form. Sources and extra camera
controls stay behind secondary disclosure controls.

The drawing's measured rectangle excludes the inspector. A safe-viewport camera
wrapper additionally reserves the floating header. Camera updates are sent to an
imperative runtime controller; React stores committed camera/selection/UI state,
not every animation frame. GPU terrain and retained SVG shot annotations update
from the same camera in the same call. There is no continuous idle render loop.
Manual shot entry, existing penalty/undo/edit behavior and source-readiness gates
remain authoritative. Geographic target editing and location capture are not
added by this slice.

### 23.3 Export and release boundaries

The supplied specification correctly distinguishes orthographic projection from
an undistorted screen ruler at low pitch, and real depth testing from painter
sorting. Current Three uses WebGL2; failed or lost contexts retain the SVG
fallback. See [Three's WebGL renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html).

The shared SVG adapter remains a vector-styled illustration of the same geometry,
camera and evidence. Its designed shading does not promise pixel identity with
Three's lit volume shadows. Earlier Section 20/22 GPU-to-SVG comparisons describe
the preceding flat-color backend only. Three's own SVG adapter explicitly lacks
shadow/advanced-material fidelity; see [SVGRenderer limitations](https://threejs.org/docs/pages/SVGRenderer.html).
Browser captures show the full live interface. Exporting identical GPU shading
plus DOM labels into a product PNG remains a separate capture contract.

The first physical-hole slice uses existing Cacapon 7 and Winchester 7 source
studies. Their acceptance/provenance limits in Section 21 are unchanged. The
broader specification's source automation, GPS provider, spatial persistence,
CoachHelm analysis and native offline durability are subsequent work packages,
not implied additions to this manual-entry renderer task. No production source,
round, schema or deployment changes are made. Real-device thermal/FPS and native
cold-start offline checks remain required before production readiness claims.

## 24. Shared visual correction and course-scale evidence

The September 13 renderer-correction brief extends Section 23. The source
package and manual ledger remain unchanged. `compile-course-terrain.py` now
compiles all 18 Cacapon holes from one locked native-1m USGS source acquisition
(December 4–21, 2021), with immutable request/source checksums. Each package
contains source-gradient normals, an independent aligned 2m metric query grid,
actual neighboring context feature IDs and explicit render/source-quality
metadata. The 2m grid does not improve the source's measurement accuracy.

The original dark band survives both shadow-disabled lighting and a controlled
normal-buffer comparison on unchanged geometry. Imported source normals remove
some local surface-cut discontinuities, but they do **not** erase the broad
source slope. The old 8m mesh and tightly cropped context exposed that slope as
an angular boundary. No zero-filled terrain samples, skirts or vertical crop
walls were found. Do not describe a palette adjustment as proof that the source
terrain is wrong or that all remaining faceting is fixed.

The old convex-hull-plus-24m context and 6.5m fairway surround are replaced by
wider rectangular source coverage and narrow illustrative transitions. Context
feature IDs only expand rendering; they never expand the played-hole inference
or lie-classification domain. Crown geometry stays complete above the ground,
in spatial batches with stable source-based IDs. Grass bands are world-aligned,
6m art treatments, with derivative filtering. Lighting remains fixed in world
space. Shadow coverage includes source relief and complete nearby casting
objects; no context mask clips crowns.

Compiled terrain spans 14,179–32,050 triangles per hole, within a deliberately
revised 40,000-triangle validation cap. Source/query accuracy remains independent
of this display budget. All 18 serialized packages have valid cells, no omitted
triangles and identical heights/normals at duplicated XY positions. Compressed
packages total 16,456,410 bytes; the largest decoded package is 6,606,233 bytes.
They are loaded one hole at a time in the local comparison harness. Hash-checked
gzip delivery in that harness is not an offline activation protocol.

The shared camera now evaluates both sides of the route bearing and fits Top,
Terrain and Side independently. Gestures preserve the settled baseline lens;
preset transitions blend it under the same controller. The safe region excludes
the measured inspector, floating header and 64px control rail. Numerical checks
pass for 810 combinations of 18 source-backed holes, five viewport sizes, three
presets and three areas. A separately labelled Profile charts source elevation
against real horizontal route distance and breaks at unsupported samples.

These artifacts remain source candidates. Registration and renovation/currentness
are unverified. Hole 10 lacks a usable tee polygon; existing tee polygons are
approximate, not invented replacements. Only Hole 7 has reviewed canopy masks.
Absent canopy evidence is not evidence that the other holes are open links.
The matrix cannot establish desert/links/mountain visual acceptance, physical
mobile FPS, thermal stability or Capacitor offline restart. Those are explicit
remaining acceptance tasks, not inferred passes from desktop phone-sized images.

### 24.1 Review artifacts and verification limits

The [visual review gallery](assets/course-geometry-2026-09-13/visual-system/index.html)
contains the frozen-camera debug comparison, unchanged-geometry normal study,
original-resolution phone captures and all 18 holes in Top, Terrain, Profile
and green-complex views. The [Top contact sheet](assets/course-geometry-2026-09-13/visual-system/contact-top.png)
and [Terrain contact sheet](assets/course-geometry-2026-09-13/visual-system/contact-terrain.png)
are review aids; originals preserve the 780×1688 drawing capture.

The [machine-readable exception report](assets/course-geometry-2026-09-13/visual-system/failure-report.json)
deliberately does not mark the course visually approved or production-ready.
The [browser report](assets/course-geometry-2026-09-13/visual-system/browser-verification.json)
records 72 canonical captures, zero JavaScript errors in that run, responsive
controls, selection, cancellation, reduced motion and idle rendering. These
use real Fairway components with inert external adapters in a local harness,
not an authenticated native app shell. The recorded Mac Chrome camera study
has 167 frame intervals, 10ms median, 11.9ms p95 and 12.4ms maximum; these are
browser cadence observations, not GPU completion timings or mobile guarantees.

Final review also exercises replacing a runtime on the same connected canvas,
revoking context-only canopy eligibility, and releasing the removed canvas.
The [real WebGL regression report](assets/course-geometry-2026-09-13/visual-system/final-review-regressions.json)
confirms a usable replacement, removal of revoked crowns and final context
release. Elevation diagnostic colors follow the renderer's rewound triangle
vertices; affected wireframe captures were regenerated. The controlled normals
and shadow-disabled comparisons did not depend on that color correction.

Verification covers 153 focused tests before final review and 17 affected tests
after the lifecycle/diagnostic corrections, plus eight compiler tests and the
810 camera invariants. The full Next.js webpack build passed, including
TypeScript and 179 generated routes. Available local Review Gate checks passed;
Ruff/Pylint were unavailable and skipped. GitHub CodeQL/required CI remain
separate checks. Real-device performance, current source registration, broader
canopy review and native offline restart remain explicit next gates.

## 25. Actual-green overview and putting redesign — implementation plan

**Status: planned, not implemented by this brief.** This is the requested plan
for IMG_6114/IMG_6115. It supersedes Section 22.5's abstract putting default and
any earlier automatic tight ball-to-cup crop. Existing renderer work in Section
24 is separate. This also supersedes abstract-default wording in Sections 7.5,
7.7.7, 18.3 and 18.9. The new optional Set pin/Mark ball package supersedes the
no-placement scope in Sections 1, 18.3 and 20.1 only for those explicit secondary
actions. No GPS, mandatory placement questions or cart paths are introduced.
No new pin/ball persistence or production migration is executed by this plan.
Manual scoring remains usable without coordinate entry.

### 25.1 Current code and confirmed reuse

| Existing seam | Verified behavior | Planned change |
| --- | --- | --- |
| `src/lib/golf/course-geometry/build-scene.ts` / `types.ts` | One source revision, physical green feature ID and common target hypothesis | Keep this geometry/target authority for hole, green and putting |
| `src/lib/golf/course-geometry/camera.ts` `contextPoints` | Green includes the entire green and every qualifying bunker within 45m; a whole multipart hazard can substantially enlarge the fit | Add an explicit whole-green scope, distinct from the existing green-complex scope |
| `terrain.ts` / `terrain-viewport.ts` | Shared metric projector, preset fitting and measured safe viewport | Reuse for physical green; harmonize inline and expanded heading |
| `FairwayHoleHero.tsx` → `entryView('putting')` | Tracking requests the putting view | Route course-backed putting to whole-green Top |
| `ReviewHero.tsx` → `HoleShotPath/index.tsx` | Review selects the same view family | Use one active event key across map, inspector, timeline and replay |
| `HoleSceneFrame.tsx` | Putting bypasses terrain and always renders `PuttingZoom(distanceView)` | Show the physical green when present; keep relative distances as an explicit fallback/disclosure |
| `PuttingZoom.tsx` distance-only branch | Rounded capsules, fixed horizontal start and abstract cup; receives no physical green or shared target | Retain only for missing geometry or explicitly requested relative information |
| `quality.ts` / `reconstruct.ts` | Putting has no authorized physical anchor; ordinary flight overlays reject putts | Add a separate shared putting-evidence adapter, without weakening full-swing eligibility checks |
| `normalize.ts` / `distance-units.ts` | Preserve attempted/remaining values and original units | Build explicit attempt/read/result/leave labels from the selected event |

The existing green-complex camera is broader than the requested green overview.
In the compiled 390×640 drawing study, the actual green bounding box occupies
about 5.7% of the drawing on Hole 7 and 4.3% on Hole 15. These are bounding-box
ratios, not source-accuracy measurements. The green polygon already matches the
hole scene's feature ID/revision; screenshot resemblance alone is not provenance.

### 25.2 First package: synchronized selection and distance semantics

1. Introduce one parent-owned `activeShotKey`, resolved to a single event view
   model for all map labels, inspector values and replay. Eliminate independent
   putting indices and fallback to the previous/last shot while a new event is
   unavailable. Keep selection distinct from array order and putt ordinal.
2. Headline attempted distance from `before`, with explicit result/leave from
   `after`; never derive attempt or traveled roll from their difference. Example:
   **Putt 1 · 12 ft**, **Left to right · Downhill**, **Missed long · 2 ft left**.
   Selecting the following 2ft putt shows its own 2ft attempt; a holed event shows
   **Made** only from its recorded result.
3. Label approach metrics by time: **Start · Sand · 17 yd to play** describes an
   origin; **Finish · Sand · 17 yd left** describes the previous shot's result.
   Do not relabel a 17yd approach finish as that approach's starting distance.
4. Preserve existing miss/read fields. A long miss may finish beyond the cup
   even with a much smaller leave. Read direction/slope is player-reported
   evidence, never a surveyed curve, speed or slope percentage.

Exit evidence: rapid shot/putt selection, undo and loading cases show one event
in every dependent surface; 12ft attempted/2ft left remains 12ft attempted.

### 25.3 Second package: the actual whole-green camera

Add a serializable green-view state with `scope: whole_green | focused_putt`,
`cameraMode: top | terrain`, `activeShotKey`, `editMode` and `guidesVisible`.
Selection is shared domain-view state; scope/mode are camera intent. Do not
store a second green polygon or normalize its X/Y independently.

Whole-green fitting starts from every ring/component of the canonical green,
a narrow visual collar, and genuinely located selected nearby points. Use
uniform scale and the actual safe region. Nearby hazards and a short approach
entrance render as context; distant bunker components, long approach strips and
woodland do not force the main lens outward. At explicit scope entry/reset, include bounded nearby off-green positions
without moving them inside. Afterward, a newly selected offscreen position gets
an edge indicator and explicit View ball/Focus putt action; selection alone
never refits the whole-green baseline. Preserve the full connected double green when mapped.

On scope entry and Whole green reset use exact Top with a stable approach/course
heading. Reconcile current inline SVG and expanded Three orientation so opening
detail does not swivel the green. Selecting putts or refreshing data preserves
the user's overview camera. Inspector detents update the safe region, without
continuous automatic recentering. Terrain is the same scene at an oblique angle.

**Focus putt** is an explicit secondary action, available only with sufficient
located evidence. Save and restore the previous whole-green camera. Expand for
long putts; never clamp points or cut a concave green into an ellipse.

Exit evidence: actual Hole 7, wide, narrow, concave and shared-green cases all
retain source proportions and full outlines; Top, Terrain and hole views use
identical feature IDs and canonical coordinates.

### 25.4 Third package: honest cup, ball and putt overlays

Extend the common target contract to distinguish unknown cup, green-center
reference, retained estimated pin and confirmed/versioned cup. The current
`nominal_green_reference` must not silently become a dated pin observation.
The current nominal resolver can choose a maximum-clearance interior sample,
which is not necessarily a center. Label that **Green reference**. Use **Green
center** only when the adapter records a defined center construction; otherwise
retain **Pin unknown** or the explicit estimated-pin status. A real green remains viewable with no cup.

The shared resolver accepts a confirmed/versioned round-hole cup before any
inference. A retained estimated hypothesis is secondary; a nominal green
reference is only a reference. Pin correction invalidates derived hypotheses
once across every view, without moving stored ball positions or rewriting their
recorded distances. Every putt refers to that single pin-observation identity
and revision; it cannot keep its own independently solved cup.

Resolve ball locations and putt endpoints once in the shared adapter. Known or
explicitly accepted positions can use screen-sized markers anchored in course
meters. Unknown bearing remains null. A reported 12ft distance can drive an
optional labelled placement guide; it does not select an exact point on the
circle. Guides are distinct from uncertainty regions. Neither the component nor
the renderer independently reconstructs putting coordinates.

Keep past putts quiet and the selected event prominent. Show reliable endpoints
or candidate regions when the path is unknown. Measured surface-roll samples,
explicit estimates and player reads retain different provenance. All paths use
the common terrain transform, and no full-swing airborne arc enters putting.
Replay is optional and interruptible; it cannot infer a make from a curve
crossing the cup or manufacture a lip-out. Whole-green framing stays stable.

Reuse the existing label solver, reserved UI rectangles and leader lines.
Move labels or hide secondary labels, never the cup/balls. The accessible shot
list carries every event even when its overlay is hidden.

### 25.5 Fourth package: optional placement and durable identity

Expose Set pin and Mark ball as secondary tasks; neither blocks score entry.
They use the same course-meter pick/inverse transform and shared target/shot
view model. Mark ball explicitly identifies origin versus resting finish on the
durable shot key; user-placed coordinates are user-confirmed estimates, not
surveyed measurements. Keep the original reported distance when a placed position differs;
show the discrepancy and let the golfer explicitly correct it. Commit on
confirmation, not every pointer move. No automatic location capture is added.

**Identity is a prerequisite to enabling persisted placement.** The current
`ShotRecord` has optional `id` and `shotNumber`; `normalize.ts` uses the database
ID or `shot-N` as its event key. These are not durable spatial identities across
all saves: the checked round-save implementation and baseline atomic RPC replace
hole/shot rows. Do not attach new observations solely to those rotating IDs or
to a renumberable array index.

Before editing persistence, trace `golf.ts` save/submit/edit, the active RPC
migration chain, generated database types, `shot-storage.ts`, recovery snapshots
and `sync-engine.ts` together. Introduce or reuse a durable client shot key
minted once at shot creation, carried through undo/edit, draft serialization,
recovery and server acknowledgement. Pair it with the stable round/hole slot;
keep transient database IDs as mappings. For historical snapshots with no such
key, allocate a persisted mapping once under revision control rather than
reconstructing identity from mutable distance/score fields.

Use the existing round authorization and atomic write contract for both shot
mutation and spatial observation. A versioned pin observation belongs to the
round/hole scene revision, with source, editor, timestamp and correction history.
Validate finite coordinates, revision/frame compatibility and idempotent mutation
IDs. Audit serializers for dropped fields and RLS against the parent round.
Select an additive sidecar or schema extension only after that current-schema
inspection. This plan supplies no speculative production SQL.

Exit evidence: mark/correct/undo → save → reload → final submit → reconnect
preserves the same accepted positions and stable keys exactly once. A snapshot
replacement cannot orphan pin/ball observations. Camera, selection and replay
produce no scoring writes.

### 25.6 Fifth package: green-specific polish and acceptance

Tune the shared green/fringe/sand styles after geometry and selection pass.
Inspect edge offsets, joins, overlapping surfaces and diagnostic passes for
accidental wedges; preserve source lobes, shoulders and concavity. Use narrow
quiet fringe, subdued approach stripes and readable sand without luminous rims.
Source terrain supplies broad relief only; no generic raised plate or implied
putting-break precision. Nearby trees stay contextual and cannot dictate framing.

Default controls: Top / Terrain, Whole green reset, compact synchronized putt
card and previous/next. Focus putt, placement and guides remain contextual or
secondary. Details retain source and uncertainty information. No default Side
control is needed in this scope. Focus, keyboard and screen-reader navigation
use the existing Fairway primitives.

Capture original-resolution Top/Terrain/whole-green/explicit focus comparisons
at matching phone sizes; include large text, expanded inspector, landscape and
desktop. Use Hole 7, wide/narrow/concave/shared greens, long putt, off-green finish,
unknown cup/bearing and missing-geometry cases. Test stable coordinates across
scope changes, correct make/leave semantics, no label/control collisions,
reduced motion, pointer cancellation and zero score writes from viewing. Record
real supported-device rendering and native restart evidence separately from
desktop viewport emulation. Require a coherent result on every representative
case; a restyled capsule or an attractive crop is not the exit gate.

## 26. Peek'n Peak Upper whole-course build — September 15, 2026

**Status:** Local fixtures, ignored review output and harness wiring only.
No production write, migration, course binding, merge or deployment is
implied by this section.

### 26.1 Toolchain

The plan's free toolchain is installed and verified on the build machine:
Blender 5.2.1, GDAL 3.13.3 with the `osgeo` Python bindings, PDAL, PROJ
9.9.0, QGIS 4.2.2, mapshaper 0.7.61, ruff 0.16.7; Python numpy 2.5.2,
shapely 2.1.2 (GEOS 3.13.1), pyproj 3.7.2, Pillow 12.1.1, geopandas, scipy.
Raster decoding in `compile-course-terrain.py` and `normalize-study.py` now
goes through `elevation_raster.py`, which prefers GDAL and names the decoder
in the source manifest. Pillow silently mis-decoded the tiled Float32 3DEP
export (3.4M of 6.05M pixels differed; values up to 3e38); GDAL and Pillow
agree on the Cacapon and New York exports, so the Cacapon fixtures remain
byte-identical.

### 26.2 Sources

- OSM via Overpass, retained once as an immutable gzip with a manifest
  (`sources/peek-n-peak-upper-osm`): 155 features — 18 routes, 36 tees,
  16 fairways, 18 greens, 63 bunkers, 4 water. Hole 11 has no fairway way in
  OSM and stays `partial`. Package hash `eeacfb7b…` matches the earlier
  ad-hoc extract exactly.
- Terrain: USGS 3DEP `USGS one meter x60y466 NY Southwest East 2017`
  (OBJECTID 76329, NAVD88, EPSG:32617, 2279×2656 px at 1 m). Two native-1m
  catalog tiles cover the bbox on paper. The newer
  `PA_WesternPA_2019_D20` tile exports 61.5% zero fill because the project
  stops at the Pennsylvania line and the course is in Clymer, NY. The
  compiler now exports each covering candidate newest-first, measures empty
  fill, rejects anything above 0.1%, and records the rejection in
  `source-manifest.json`. Both `USGS 1 Meter` and `USGS one meter` product
  titles are accepted as native 1m.
- Canopy: USDA NAIP four-band imagery (0.6 m native, exported at 1 m on the
  terrain grid; tiles captured 2024-05-24 and 2024-08-24) classified by
  `derive-canopy-naip.py` into 144 per-hole canopy groups (417 m² to
  19.95 ha; 46.9% of the export is canopy). NDVI > 0.28 and a 7 px
  near-infrared texture threshold separate crowns from turf, roofs, sand and
  water; every OSM surface is masked with a 3 px buffer; a 6 m vector closing
  and 2 m opening turn classification speckle into forest masses; groups are
  clipped to each hole's 160 m compile context. The review fixture
  (`peek-n-peak-upper-canopy-review.json`) records method, thresholds, tiles,
  raster hash and reviewer. `prepare-osm-course.py --canopy-review` merges the
  groups as reviewed woods features (package hash `6db57eff…`, 299
  features). The reviewer note names the visual comparison performed and the
  pending independent course review; the groups bound crown artwork only and
  carry no height, currentness or obstruction claim.
- Compiled meshes: 18 holes, 10,458–28,605 triangles with woods tessellated
  as a material, zero omitted triangles and zero metric nodata cells
  (`compiled-peek-n-peak-upper`). `normalize-study.py` excludes woods from
  the crop footprint, so canopy never grows the metric grid (hole 18 exceeded
  the study budget before that rule).

### 26.3 Per-hole chain

`build-course-world.py` runs, for every hole: `normalize-study.py`
(canonical local-metre study, 2 m grid, 60 m padding) →
`compile-physical-world.py` → `course-truth-gate.py` → Blender
`generate_hole.py` (GLB + preview) → `validate_glb.py` (span round trip
≤ 0.02 m; measured ≤ 3.5e-5 m). `course-world-manifest.json` records every
hash and verdict. The truth gate now accepts a whole-course package and
reports each hole; every Peek'n Peak hole fails because OSM boundaries are
not human reviewed and carry no recorded horizontal uncertainty, and no
reviewed tee/green endpoint pair backs the hole distance. That is the
intended outcome: the GLBs and app previews are visual review products.

### 26.4 Harness and evidence

The fixture harness selects compiled courses by `?course=`; the loader keys
each course to its own hash-locked directory and package.
`render-top-courses.tsx`, `capture-top-courses.cjs` and
`capture-course-matrix.cjs` (`COURSE=peek-n-peak-upper`) include the course.
The 18-hole matrix capture completed with 72 captures, no page errors, idle
rendering stopped and the canvas released on every hole.

Crown rendering was rebalanced for whole-course forest: `canopySymbols`
widens its pattern spacing (≤ 6,000 cells, ≤ 600 crowns per group) instead
of truncating a large group in scan order, `allocateCrowns` shares one budget
across groups in proportion to their patterns with leftover crowns going
first to groups the floor left empty, the 3D landscape keeps the 720 crowns
nearest the played hole's own surfaces and the SVG card keeps 240, and
near-detail crowns swap in only for batch tiles within 150 m of the camera
focus. Per hole the landscape places 311–578 trees; captured draw calls run
36–204 in Top and Terrain and 126–309 in the Green preset, with rendered
triangles ≤ 261k in Terrain and ≤ 719k in Green (down from 930k before the
focus rule). Tree centres, pattern spacing and clearance from playing
surfaces are unchanged by any of this; only which authored crowns are drawn
within a reviewed group.

`?play=1&course=peek-n-peak-upper` drives the real `FairwayShotTracking`
screen hole by hole with the compiled terrain for the current and next hole
resident. Shots, scores and the current hole persist in `localStorage` for
that browser only; a scripted play-through recorded a drive, an approach and
a made putt on hole 1, advanced to hole 2 with terrain ready, and restored
"Hole 2 / 18" after reload. No round, statistic or production record is
written, positions stay estimates, and a two-tap control clears the round.

- [Entry approach, hole 7](assets/course-geometry-2026-09-15/peek-n-peak-upper-07-entry-approach-390.png)
- [Expanded Terrain, whole hole 7](assets/course-geometry-2026-09-15/peek-n-peak-upper-07-terrain-whole-hole-390.png)
- [Expanded Top, whole hole 7](assets/course-geometry-2026-09-15/peek-n-peak-upper-07-top-whole-hole-390.png)
- [Review green, hole 7](assets/course-geometry-2026-09-15/peek-n-peak-upper-07-review-green-390.png)
- [Terrain, hole 1 (pond)](assets/course-geometry-2026-09-15/peek-n-peak-upper-01-terrain-390.png)
- [Terrain, hole 11 (no OSM fairway)](assets/course-geometry-2026-09-15/peek-n-peak-upper-11-terrain-390.png)
- [Blender preview, hole 7](assets/course-geometry-2026-09-15/peek-n-peak-upper-07-blender-preview.png)
- [Shared-renderer contact sheet](assets/course-geometry-2026-09-15/peek-n-peak-upper-contact.png)
- [Course world manifest](assets/course-geometry-2026-09-15/course-world-manifest.json)
- [Truth gate, hole 7](assets/course-geometry-2026-09-15/peek-n-peak-upper-07-course-truth.md)
- [Matrix capture report](assets/course-geometry-2026-09-15/course-matrix-report.json)
- [Terrain with derived canopy, hole 16](assets/course-geometry-2026-09-15/peek-n-peak-upper-16-terrain-canopy.png)
- [Green preset with near crowns, hole 6](assets/course-geometry-2026-09-15/peek-n-peak-upper-06-green-canopy.png)
- [Play mode, hole 1 putt](assets/course-geometry-2026-09-15/peek-n-peak-upper-play-hole-01-putt.png)
- [Play mode, hole 2 after hole-out](assets/course-geometry-2026-09-15/peek-n-peak-upper-play-hole-02.png)

### 26.5 Remaining gaps

Course-familiar review with recorded boundary uncertainty for every OSM
feature; a reviewed tee/green endpoint pair per hole; an independent course
review of the derived canopy groups (the current reviewer is a visual
comparison against the same imagery); hole 11 fairway; a real-device capture
of play mode. None of these is a rendering problem, and none may be closed
by drawing.
