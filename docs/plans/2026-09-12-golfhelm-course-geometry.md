<!-- markdownlint-disable MD013 MD060 -->
# GolfHelm — Complete Course Geometry and Shot Visualization Implementation Plan

**Research and design date:** September 12, 2026.
**Verified repository:** `njrini99-code/helmv3`, `main` at `6ea9e2ce29a41b574f11b502fd164cb74b6e5e59`.
**Database observed read-only:** Helm production Supabase, project `qmnssrrolpinvwjjnufo`, shared by Golf, Baseball and Lift Lab.
**Status:** Stages 0–2 local implementation proof prepared; current findings, verification and remaining gates are recorded in section 18. No production writes, migrations, merge, deployment or external map edits.
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

## 18. Stages 0–2 implementation findings, September 12, 2026

This section records the local implementation against current main
`6ea9e2ce29a41b574f11b502fd164cb74b6e5e59`. PR #1937 was still open,
so its complete branch copy, including section 7.7, is the document updated
here. The canonical checkout contained concurrent work; implementation uses
an isolated worktree. No existing shot-entry, edit, save, statistics, putting,
review or CoachHelm consumer was changed. No production schema/data writes,
OSM edits, merge or deployment were performed.

### 18.1 Baseline and source contracts

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
| Penalties | Current `buildPenaltyShot` already encodes OB/lost replay at the offending stroke origin, and water/unplayable at the handler's drop state. Penalty rows retain score numbering and transition fields, with no flight. PR #1934 remains open and is not presumed deployed. |
| Edit / undo | Evidence is rebuilt from the surviving sequence, with neighbor distance/lie conflicts reported without rewriting it. No private overlay cache or async fetch is introduced in Stage 2. |
| Putting detail | Existing PuttingZoom is unchanged. New analytic tests cover 20ft/5ft short and long geometry and a true 1ft anchor; they do not certify the legacy renderer's radius floors. Its production integration remains a later gate. |

The read-only unit cohort audit found 17,751 ordinary green-to-green putting
rows tagged feet/feet, plus a putting green-to-green row tagged yards/feet,
five approach green-to-sand rows tagged yards/yards, and several putting rows
with rough/null lies. These observations establish compatibility cases, not
proven writer eras. The proof retains explicit tags and flags conflicts.
No player identifiers or individual round ledgers are included in fixtures.

### 18.2 Coverage audit and selected draft

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

### 18.3 Shared renderer and revised visual direction

The new pure renderer, scene builder, explicit-unit adapter and bounded package
validator live under `src/lib/golf/course-geometry/` and
`src/components/golf/course-geometry/`. The local harness mounts the actual
`FairwayShotEntry` with its existing controls and disabled mutation callbacks.
It is a composition proof, not a functioning round-save flow.

The user's supplied concept image superseded the first proof's sparse
presentation. The revised style uses a shared diagonal orientation, warmer
sand, shaded vector fills, cream numbered labels and a compact selected-shot
row. Entry now uses a square, responsive preview instead of the initial
168px horizontal strip; Review uses a 320:380 aspect ratio. These are display
choices only. Original feature coordinates, handedness, bunker dimensions and
green-to-fairway proportions remain unchanged. A bounded rotation search
maximizes uniform scale in a shared reference aspect, independent of events.
Hole 7 occupies over 80% of each diagram dimension in both contexts; tests
protect that fit and exclude neighboring-hole bunkers. No decorative trees were
invented, and no generated image was traced into geometry.

`pilotScene()` leaves ordinary event endpoints unresolved. The separately
named `illustrativeScene()` supplies explicit analytic test coordinates inside
real fairway/bunker polygons to demonstrate marker treatment. Both contexts
consume that identical scene. Its supplied positions are labeled illustrative,
are not fitted player locations, and are never returned by the ordinary scene
builder. The demo uses hole 7's actual 431yd scorecard and its compatible
short-right bunker, rather than moving a bunker to reproduce the mockup's
350yd/short-left story.

Labels have separate screen coordinates and leaders; physical anchors do not
move for legibility. Unknown pins have no flag/cup in the physical overview.
No full feasible-region/latent-target reconstruction is claimed in this PR.
Stage 5 remains responsible for that algorithm and its ambiguity gates.

### 18.4 Review artifacts and reproduction

- [Shared review / entry proof](assets/course-geometry-2026-09-12/shared-contexts.png)
- [390px phone proof](assets/course-geometry-2026-09-12/phone-390.png)
- [All 18 physical holes](assets/course-geometry-2026-09-12/contact-sheet.png)
- [Source comparisons 1–6](assets/course-geometry-2026-09-12/source-sheet-01.jpg)
- [Source comparisons 7–12](assets/course-geometry-2026-09-12/source-sheet-07.jpg)
- [Source comparisons 13–18](assets/course-geometry-2026-09-12/source-sheet-13.jpg)
- [SVG hash / version manifest](assets/course-geometry-2026-09-12/manifest.json)
- [Package and per-hole source dossier](../../src/test/fixtures/course-geometry/cacapon-quality.json)

From repository root, `npx tsx scripts/golf/course-geometry/review-report.tsx`
requires no DB, provider call or credentials. It produces 72 individual SVGs,
the contact sheet, manifest and shared-context HTML in `output/course-geometry`.
The HTML proof uses the existing CSS, generated with
`npx tailwindcss -i src/app/globals.css -o output/course-geometry/proof.css --minify`.
Serve that directory locally to inspect the two contexts.

`prepare-pilot.py` reproduces the package from the bounded original OSM XML
with Python 3 and Shapely 2.1.2. `source-overlay.py` uses Pillow and the documented
2048×2048 NAIP geographic export (bbox in the dossier, aspect adjustment off).
That comparison image's geographic pixel frame is only for source review;
all renderer distances use the WGS84 ellipsoid local ENU frame in metres.
No production importer, migration or publisher is included.

Canonical package hash:
`ff204f4a091c12cd805944cde9180e3100ed7cd76e669e01c4e29c83e9c74120`.
Projection: `wgs84-local-enu-v1`; style: `fairway-vector-v3`;
ordinary scene algorithm: `evidence-only-v1`. Compressed package: 30,146 bytes.
Report SVG output is deterministic on repeated serialization. Browser PNGs
are evidence from this Chromium/macOS environment, not a cross-platform font
or pixel-baseline guarantee. No new dependency or production-route import is
introduced; incremental live-route bundle cost is not yet measured.

### 18.5 Verification and remaining gates

- Baseline: 229 tests passed across shot helpers, unit conversions, state
  machine, penalty handler and existing PuttingZoom.
- New proof: 43 tests passed across evidence, geometry and SVG suites, including
  seeded uniform-transform properties; the 350/150-yard 120px/280px test;
  the off-axis counterexample; all eight directions; mixed/unknown units;
  Other; penalty transitions; edit/undo replay; polygon holes/disconnected
  parts; all-hole green-area scale; shared green identity; malformed packages;
  deterministic rendering; unique mounted SVG IDs; and supplied bunker-anchor
  containment with separate labels.
- Full TypeScript check passed with the existing 8GB heap setting. Targeted
  ESLint passed for the new TypeScript, TSX and report files.
- Chromium screenshots at 320/375/390/430/1000px: no horizontal overflow;
  both contexts carry the same package hash. At 200% root text size and reduced
  motion: no horizontal overflow and zero active animations. These static
  fixture checks do not certify native safe areas, a virtual keyboard, actual
  saving, hydration, or the full application's focus behavior.
- Geometry is static vector output with no provider calls in player paths.
  Production build/RLS tests are not used as evidence here: no server action,
  DB schema, authorization surface or existing route was changed.

Before progressing to production, retain the independent source acceptance,
currentness/tee mapping, immutable storage and access, shared application
wiring, full reconstruction, abstract-putting integration, offline, actual
mobile-device and performance gates from Stages 3–7. The enlarged entry
preview also needs a live keyboard/safe-area check during Stage 4. All source
and event ambiguity remains explicit; no survey or endpoint accuracy metric
is claimed.
