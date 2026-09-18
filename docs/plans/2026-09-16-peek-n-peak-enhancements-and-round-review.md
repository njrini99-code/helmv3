<!-- markdownlint-disable MD013 -->
# Peek'n Peak Upper: enhancement plan and round review integration

Date: September 16, 2026. Scope: the 18-hole Peek'n Peak Upper build on
`agent/golf-course-geometry` (package `fdec6ea8…`, plan §26), what to
improve next, and how the same geometry reaches Round Review. Every claim
about current behaviour below was verified by reading the code on this
branch; file references point at the line that decides it.

This plan extends `docs/plans/2026-09-12-golfhelm-course-geometry.md`. It
reuses that plan's storage design (§9), read path (§10), entry and review
layouts (§18.3, §18.4), putting rules (§7.5, §18.9, §25) and accuracy contract
(§1). Nothing here relaxes the rule that a visual may decorate but never
invent truth.

---

## 1. The three facts that decide the order of work

1. **No shot position can resolve on this course yet.** The reconstruction
   solver returns an empty result for every stroke when the package status is
   `source_candidate` (`src/lib/golf/course-geometry/reconstruct.ts:145`).
   Peek'n Peak is `source_candidate` because no OSM feature has been reviewed
   by a person and none carries a recorded horizontal uncertainty. Rendering
   is complete; evidence is not. Until a review flips the package to
   `reviewed_draft`, every hole shows the outline, the route, the Green flag
   and the typed distances, and every stroke says "Position unresolved".

2. **Rough never resolves on any course.** A result of "rough" maps to a
   `rough` surface kind (`reconstruct.ts:20`), and the solver needs a
   reviewed polygon of that kind to sample (`reconstruct.ts:222–223`). No
   package, Cacapon included, has one. A missed fairway is the most common
   recorded lie on a par 4 or 5, so even a fully reviewed course would leave
   roughly a third of strokes unresolved. A derived, honestly labelled rough
   corridor is the second unlock.

3. **Nothing in the app passes geometry yet.** The two live tracking screens
   never pass the `geometry` prop
   (`src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx:2676–2689`,
   `continue-round-client.tsx` has no reference). Round Review's `ReviewHero`
   accepts an optional `geometry` prop and already builds a scene per hole
   from persisted shots, feeds the filmstrip and the open-hole detail, and
   lazy-loads the 3D terrain canvas behind it
   (`src/components/golf/coachhelm/round-review/ReviewHero.tsx:233–244,
   338–347, 406–414, 464–466`), but nothing constructs the prop. There is no
   database column linking a course or round to a package `siteId`, and no
   runtime loader for a package. Without geometry, review's hole and green
   views render "Course outline unavailable"; only the abstract putting view
   works.

So the order is: review workflow (unlock 1), derived rough (unlock 2),
binding plus loader plus prop threading (unlock 3). Everything else is
polish that becomes visible only after those three.

---

## 2. What a player gets today, per screen

### 2.1 Shot entry with geometry present (the `?play=1` harness)

- Inputs, in order: club off the tee (par 4 and 5 only), putting break and
  slope (putts only, first), result, miss direction when the result implies
  a miss, distance remaining or leave distance (always last), then Next
  shot, +Penalty or Undo (`FairwayShotEntry.tsx:245–620`).
- No tap-to-place exists anywhere. The card and the 3D view are pan, zoom
  and pinch only (`FairwayHoleHero.tsx:20`, `HoleSceneFrame.tsx:246–281`).
  Position is derived from typed lie, result and distance by a constrained
  sampler: grid samples across every reviewed polygon of the matching kind,
  kept only when the distance to a sampled target on the green matches the
  typed distance within a rounding tolerance, and, when a miss direction
  exists, within an eight-way sector (`reconstruct.ts:34–57, 87–114`).
  Candidate chains survive across the whole hole so an ambiguous early
  stroke does not collapse to one guess (`reconstruct.ts:60–135`).
- A stroke draws a point only when exactly one candidate surface remains
  after the whole hole is solved and the hole's completeness is
  `reviewed_surfaces` (`quality.ts:8–19`). Otherwise it shows hatched
  "possible areas" or nothing. Penalties, putts and holed shots never draw
  a point (`reconstruct.ts:213–216`). Player-facing text for each state is
  in `describe-position.ts:1–26`.
- Putting: break, slope, result, leave in feet. The compact card shows a
  whole-green plan on the real green polygon when a reviewed green exists
  (`HoleSceneFrame.tsx:139–142`), with the text "Mapped green · ball not
  marked"; no ball or roll is ever drawn from records (`types.ts:161–164`).
- 3D: "Expand course view" opens Top, Terrain and Side presets plus a
  Profile chart (`HoleSceneFrame.tsx:404–408`); putting opens in Terrain.
  Phone guards: device pixel ratio capped by a four-megapixel budget,
  context-loss fallback to SVG, crown detail swapped by camera scale and
  focus (`three-renderer.ts:98–150`), and the harness keeps only the current
  and next hole's mesh resident (`play-round.tsx:47–62`).
- Persistence: `ShotRecord` and `HoleStats` carry no position, surface or
  provenance field (`src/lib/types/golf.ts:126–182`). Scenes are rebuilt from
  records on every render and on resume; nothing geometric round-trips
  through Supabase.

### 2.2 Round Review

- Page: client-rendered Fairway shell; fetches the round, its holes, the
  stored review, detailed stats, and the round's `golf_shots` with putt and
  approach detail; renders hero, filmstrip, per-hole detail, narrative,
  breakdowns (`review/page.tsx:271–274, 702–775`;
  `FilmstripReview.tsx:176–183, 306–413`).
- Per-hole selection lives in `ReviewHero` (`openHole`/`activeHole`, filmstrip
  scrub, `?hole=` query). At the open hole the component has par, yardage,
  score and that hole's shots with strokes gained attached.
- `golf_shots` already carries lie before and after, distances with units,
  result, miss direction, putt break, slope, feet and miss tags, approach
  miss detail. That is the full input the scene builder consumes. No new
  shot columns are needed to render review against real geometry.
- three.js is imported only inside the course-geometry canvas behind a
  dynamic import (`CourseTerrainCanvas.tsx:51`); wiring geometry adds no
  weight to review's first load.

---

## 3. Hole by hole

Columns: how the hole renders now (from the 18-hole matrix captures and
the NAIP overlays), what shot tracking will do once the package is
`reviewed_draft`, what putting will do, and the review work that hole needs
before positions are honest. "Corridor" means an imagery-traced fairway
polygon with a stated ±10 m band, the hole 11 method.

| Hole | Par · yd | Render today | Shot tracking after review | Putting | Review work | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 4 · 409 | Long fairway strip, pond left, green with two bunkers right. Composition and trees read well. | Tee to fairway or rough resolves; pond is a penalty event, never drawn. The two greenside bunkers are adjacent, so a "sand" approach at one distance may stay as two possible areas. | Medium green, bunkers right. Green-backed plan works once the green is reviewed. | Confirm both bunkers (sand shares 0.83). Corridor not needed. | High: first hole every player sees |
| 2 | 4 · 483 | OSM fairway begins roughly 120 m past the tee; an adjacent hole's fairway sits in frame right. | A drive recorded as "fairway" at a distance short of the polygon start finds no compatible surface and stays unresolved. | Green with bunkers; fine. | Corridor from tee. Check the 9,040 m² of unclaimed sand in the extent (adjacent holes or a waste area). | High |
| 3 | 3 · 201 | Water carry, green with two bunkers. Clean. | Tee to green, rough or sand resolves; water is a penalty. | Green outline good. | Light. | Normal |
| 4 | 5 · 563 | Narrow fairway, heavy woods left of the green. One bunker flagged low-sand. | Long hole; fairway polygon appears continuous. | Green with bunkers; fine. | Reviewer decision on the flagged bunker; check 6,314 m² unclaimed sand. | Normal |
| 5 | 3 · 200 | Apron plus green, one bunker left, sparse trees. Smallest mesh. | Simple. | Large green polygon; verify against native imagery. | Light. | Normal |
| 6 | 4 · 430 | Fairway and green with two bunkers. One bunker flagged. | Resolves normally. | Fine. | Flagged bunker. | Normal |
| 7 | 4 · 400 | OSM fairway stops about 100 m short of the green; pond right. Used as the showcase hole. | An approach recorded from a "fairway" lie inside that gap stays unresolved. | Green with bunkers, woods behind; fine. | Corridor to the green. | High |
| 8 | 5 · 555 | Long fairway, six bunkers in two adjacent pairs. Largest mesh. | Adjacent bunker pairs will often leave "sand" as two possible areas near the green. | Fine. | Six bunkers pass; check 3,385 m² unclaimed sand. | Normal |
| 9 | 4 · 398 | Two ponds right, green top-left. Both bunkers flagged low-sand (shadow or grass face). Highest Top-preset draw calls (260). | Resolves normally. | Green with bunker right and water right. | Reviewer decision on both bunkers. | Normal |
| 10 | 4 · 414 | Two fairway polygons (OSM split), green with two bunkers. Two of three bunkers flagged. | Both polygons are `fairway`; the split does not matter to the solver. | Fine. | Flagged bunkers. | Normal |
| 11 | 5 · 523 | Fairway traced from NAIP, tee to green, ±10 m. Four of seven bunkers flagged; some are likely grass bunkers or mounds. | The trace is `reviewed: false`; the solver ignores it until the review accepts it. | Green with two small bunkers right. | Accept or adjust the trace; decide the seven bunkers. | High: only traced hole |
| 12 | 4 · 345 | Dogleg left, large bunker in front of the green. Camera fit handles the dogleg by rotation search (`camera.ts:47–58`). | Tee direction is treated as unknown aim on a dogleg (`reconstruct.ts` `unknownTeeAim`), so a tee miss keeps direction unresolved; distance still constrains. | Green large relative to the bunker; verify outline. | Light. | Normal |
| 13 | 3 · 190 | Crescent bunker wrapping the green; adjacent green in frame. | Simple. | Small green; crescent bunker gives good context. | Light. | Normal |
| 14 | 4 · 439 | Long fairway. Three of four bunkers flagged. | Resolves normally. | Fine. | Flagged bunkers. | Normal |
| 15 | 3 · 200 | Green polygon is a crude near-square from OSM; no bunkers mapped; four tees. | Simple, but a crude green polygon makes "green" samples wrong at the edges. | The putting plan is drawn on this square, so it is misleading today. | Re-trace the green from native 0.6 m NAIP. | High for putting |
| 16 | 4 · 330 | OSM fairway stops short of the green. Two of four bunkers flagged. | Same gap problem as hole 7. | Green small, bunkers around; fine. | Corridor to the green; flagged bunkers. | High |
| 17 | 4 · 403 | Most trees placed (578); green with three bunkers right. | Resolves normally. | Fine. | Light. | Normal |
| 18 | 5 · 575 | Long fairway; fragmented small bunker shapes mid-right (OSM splits). Two of six flagged. | Fragmented bunkers make several "sand" results ambiguous. | Green with bunker left; fine. | Merge or reject fragments; flagged bunkers. | Normal |

Course-wide: every green needs a reviewer's yes because putting draws on it;
holes 2, 7, 11 and 16 need corridor decisions before par 4 and 5 tracking
is useful; 17 bunker flags need a person. None of this is drawing work.

---

## 4. Enhancement packages

Each package names its unlock, the files it touches, and the check that
proves it. Packages 1 to 3 are prerequisites for the product; 4 to 8 are
independent of each other.

### P1. Boundary review workflow (unlock 1)

Goal: a person who knows the course reviews every OSM feature against the
imagery, records a horizontal uncertainty, and the package becomes
`reviewed_draft`.

- **Review file.** `pilots/peek-n-peak-upper-boundary-review.json`: one row
  per feature `{featureId, verdict: accept | adjust | reject, accuracyMeters,
  geometryWgs84?, reviewer, reviewedAt, evidence}` where `evidence` names the
  dossier overlay or the QGIS export used. Rows for the hole 11 trace and
  for every corridor trace from P2 use the same shape.
- **Preparer flag.** `prepare-osm-course.py --boundary-review <file>`:
  applies verdicts (sets `reviewed: true` and `accuracyMeters`, swaps the
  ring for `adjust`, drops `reject` and its hole reference), records the
  reviewer in `sources`, and flips the package to `reviewed_draft` only when
  every hole's route, tees and green are reviewed. Holes with any
  unreviewed surface stay `partial`.
- **Endpoint pairs.** The review file also records, per hole, the reviewed
  tee polygon and green used for the scorecard distance. The truth gate's
  distance row (`course-truth-gate.py:102–131`) compares route length to the
  scorecard without stretching the route.
- **Reviewer aid.** A generated QGIS project per course (native 0.6 m NAIP,
  OSM layers, dossier flags as a styled layer) so the reviewer adjusts rings
  in QGIS and exports GeoJSON that the review file references. mapshaper
  simplifies adjusted rings to the package tolerance. This is where the
  plan's QGIS and mapshaper choices do real work.
- **Native green exports.** `review-course-imagery.py --greens-native`
  exports each green complex at 0.6 m for outline verification; hole 15
  first.
- **Check.** `course-truth-gate.py --require-pass` succeeds per reviewed
  hole; in the harness, a scripted hole 1 round shows "Estimated position"
  for a fairway drive and a green approach. The plan's §13.7 image
  acceptance runs on the reviewed package.

### P2. Corridor traces (feeds P1)

Trace the mowed corridor for holes 2, 7 and 16 with the hole 11 method
(3–4× NAIP, anchored to cart paths, bunkers and greens, ±10 m, 6 m corner
smoothing). Candidates after those: any par 4 or 5 whose route share inside
mapped surfaces is below 0.5 (holes 4, 8, 12 at 0.42–0.48). Each trace
enters as `reviewed: false` and waits for a P1 verdict.

Check: the imagery overlay for each traced hole shows the polygon inside
the mowed corridor; route share rises above 0.6.

### P3. Derived rough corridor (unlock 2)

Add a `rough` feature per hole, derived, not observed: the route buffered
to a stated half-width (60 m to start), clipped to the compile context,
minus every mapped surface, woods and water. It carries
`derivation: 'route_corridor'`, the half-width, and the accuracy of the
surfaces it was cut from. It is reviewed when the hole's surfaces are
reviewed, because it contains no new boundary claim of its own.

- Package: `schema.ts:22` and `types.ts:7` already allow kind `rough`; the
  preparer emits it after P1 verdicts. Add a `derivation` field to the
  feature schema.
- Solver: no change; `rough` is already in the surface map.
- Render: no fill. Rough is the ground. The card's legend names it only
  when a stroke resolves into it ("Estimated position · rough corridor").
- Compile: the corridor is not tessellated; it is a sampling region only.

Check: in the harness, a drive recorded as "rough, 165 yd remaining" on
hole 1 shows a possible area on the correct side when a miss direction is
given, and a corridor-wide band when it is not.

### P4. Entry-flow fixes found by the audit

All small, all independent of geometry review.

- **Unsaved distance.** `hasUnsavedInput` is `!!resultOfShot`
  (`FairwayShotTracking.tsx:226–229`); a typed distance with no result can be
  lost by tapping a hole pill. Include the distance draft.
- **View memory across holes.** `FairwayHoleHero.tsx:32` remounts the frame
  on every hole, resetting the chosen view, expansion and camera pose.
  Keep the chosen view for the round (plan §18.3 "preserve an explicitly
  chosen mode until the next hole, unless the user resets it" is satisfied
  today; the enhancement is a round-level preference).
- **Same disclosure in 2D and 3D.** The retained-DOM overlay inside the
  expanded terrain view gates regions and segments on
  `isInteractivePreview` (`shot-overlay-controller.ts:99–129`), which is true
  for every routed hole, so possible-area hatching never shows in 3D; the
  3D flight builder applies no source filter (`three-flight-path.ts:56–141`).
  Make both consumers use the same filtered decision as
  `shot-overlay-layout.ts:88`.
- **Terrain for pill navigation.** The harness preloads current and next
  only (`play-round.tsx:49`); jumping back shows a loading state. Load the
  tapped hole on demand with the existing "unavailable" fallback, and keep
  three meshes resident at most.
- **Sixteenth stroke.** The message at `FairwayShotEntry.tsx:522–528` does
  not disable entry; confirm the state machine blocks it or disable the
  result buttons.

Check: the existing entry tests plus one test per bullet.

*Status (2026-09-18).* "Terrain for pill navigation" is done for the app by
`useCourseGeometry` (the tapped hole loads on demand, three meshes resident
at most; the lab harness keeps its own preload). "Sixteenth stroke" is
confirmed **not** blocked: no shot cap exists in `use-shot-state-machine.ts`,
the round actions or the schema (`golf_holes.score` carries no check), so
the notice is the only guard. That fix, the unsaved-distance guard and the
2D/3D disclosure change reach every course, so they wait for the owner's
go-ahead under the Upper-only rule (2026-09-17); view memory across holes is
a round-level preference the owner should choose.

### P5. Putting on the real green (plan §25.4–25.6)

The green reference glyph (§25.4) is in. The honest next steps, in order:

1. **Optional Set pin and Mark ball** (§25.5). Secondary tasks, never
   blocking score entry, using the existing course-metre pick and inverse
   transform. A placed pin is a user-confirmed estimate with a date; a
   marked ball distinguishes origin from finish on the durable shot key.
   The typed distance is kept alongside the placed position. This is the
   only path by which a putt can be drawn on the real green.
2. **Green-specific polish** (§25.6): fringe, sand rims, overlap joins,
   diagnostic passes for accidental wedges, on the reviewed outlines.
3. **Terrain tilt as a labelled hint, gated on evidence review.** The 2017
   1 m DEM gives a macro slope across a 30 m green (median hole context
   slopes are 3–9°, greens flatter). A single arrow with "terrain tilt from
   2017 lidar, not a break read" is defensible; contour lines are not. Do
   not ship without the plan's evidence review, and never feed it into the
   abstract putting schematic.

Check: §25's acceptance list; the abstract schematic stays authoritative
for distance and make/miss.

### P6. Round Review integration (unlock 3)

Build on plan §9 and §10; do not invent a second design.

- **Data.** Minimum tables from §9.2: `golf_geometry_sites`,
  `golf_geometry_versions` (content hash, status, schema version, source
  list, license), `golf_course_geometry_bindings` (one current binding per
  course, reviewed queue, never a name-only match), and
  `golf_round_geometry_bindings` (frozen at round creation). RLS: sites,
  versions and bindings are readable by authenticated golf users; writes are
  owner or service only. Migration needs the db reviewer and RLS
  verification per AGENTS.md.
- **Delivery.** Immutable objects keyed by content hash in a Supabase
  Storage bucket: the package JSON, the per-hole terrain gzip, and the
  canopy review. Long cache headers; the hash in the path is the cache
  identity (§10.2). Licenses allow shared caching (OSM ODbL with attribution,
  NAIP and 3DEP public domain). A loader
  `loadCourseGeometry(siteId, versionHash)` validates with `schema.ts`,
  returns the package, and exposes `loadHoleTerrain(holeKey)` for lazy
  meshes. No Overpass, geocoding or imagery call ever originates from a
  player screen.
- **Threading.** Review page → `FilmstripReview` → `ReviewHero.geometry`
  with `package` and `holeKeys`; `terrainByHole` filled only for the open
  hole, on demand, when the player expands to 3D. Entry: `new-round-client`
  and `continue-round-client` resolve the round binding and pass `geometry`
  with the harness's residency rule (`play-round.tsx` is the reference
  implementation). Geometry availability is never part of score-save
  success (§10.1).
- **Historical rounds.** Unbound legacy rounds keep the schematic unless a
  verified course and tee mapping exists and the version suits the round
  date; never present a post-renovation package as the historical layout.
- **What review shows per hole, by stage.** With a `source_candidate`
  package: outline, route, Green flag, typed distances, and "Position
  unresolved" per stroke, which already replaces "Course outline
  unavailable". After P1: estimated positions and possible areas, display
  flight arcs between resolved anchors. After P3: rough strokes resolve to
  corridor areas. After P5: user-placed pins and balls.
- **Layout.** §18.4 stands: one selected-hole panel of 280–340 px, a shot
  selector, a selected-shot row, putting in the same slot, Hole / Green /
  Putting switch only for available views. No wall of 18 maps; the strip
  stays schematic-sized.

Check: a Peek'n Peak round recorded on the real entry screen and reopened
in review shows the same per-hole scenes; review first-load JS is
unchanged (three.js stays behind its dynamic import); the §13.3 access suite
passes for the new tables.

**Status (2026-09-17, 56b67b07a).** Threading is wired for the one
approved course without the binding tables: `useCourseGeometry`
(`src/components/golf/course-geometry/use-course-geometry.ts`) resolves the
round's course through the One-Tap identity (`productCourseIdForRound`:
bound `golf_courses` id or a name reading Peek'n Peak *Upper*), loads the
published package through the task-15 asset cache and hands `geometry` to
`FairwayShotTracking` (both round clients) and `ReviewHero` (review page →
`FilmstripReview`). Terrain follows the residency rule on entry (hole on
screen + next) and the open hole only in review (`onOpenHoleChange`).
Every other course resolves nothing. The data and delivery bullets above
(`golf_geometry_*` tables, Storage bucket, `loadCourseGeometry(siteId,
versionHash)`) remain the design for a launch beyond one course.

### P7. Rendering and phone budget

- Hole 9's Top preset draws 260 calls where the rest draw under 200; merge
  distant crown batches per tile material to bring the Top ceiling under
  200 without moving crowns.
- Keep the matrix capture as the acceptance record; add draw-call and
  triangle ceilings to `capture-course-matrix.cjs` so a regression fails the
  run rather than a reader.
  *Status (2026-09-18):* done for draw calls on the acceptance records
  that are actually kept — `capture-visual-canaries.cjs` (the 96-capture
  matrix) and `capture-player-view.cjs` exit 1 when a capture's
  `drawCallStatus` is not `within` (§68.2 budgets by pitch: top 140,
  terrain 180, side 160). Triangles carry no ceiling in
  `RENDER_BUDGETS`, so none is enforced; the counts stay in the metadata.
  The hole-9 Top figure above is historical: since the V7 batching every
  capture draws 6–10 calls (`v29-package`).
- Real-device capture of play mode on your phone after deploy: the one
  verification this build lacks.

### P8. Pipeline scale-out

- One orchestrator, `scripts/golf/course-geometry/build-course.sh <slug>`,
  running steps 1 to 5 of the README in order with the hash checks between
  them, so a second course is a scorecard file plus a site id.
- A per-course checklist in the README: scorecard, OSM site id, DEM
  candidate check, NAIP dates, canopy thresholds review, dossier, corridor
  traces, boundary review, truth gate, matrix capture.
- Expected effort per course after tooling: pipeline under an hour of
  machine time; review is the human cost and scales with bunker count.

---

## 5. Sequence

1. **P1 review tooling and P2 traces** (holes 2, 7, 16 traced; review file
   and preparer flag; QGIS project generator; native green exports). Start
   the hole-by-hole review with holes 1, 2, 7, 11, 15, 16.
2. **P3 derived rough**, once P1 verdicts exist for at least hole 1, so the
   check in P3 can run.
3. **P6 data and loader** in parallel with 1 and 2. The review page can
   be wired against the `source_candidate` package immediately; positions
   appear as holes pass review.
4. **P4 fixes** in parallel, small PRs.
5. **P5 putting** after P1, because it draws on reviewed greens.
6. **P7 and P8** as the course goes live and a second course is chosen.

Verification per step: the package's own tests and lint (vitest
course-geometry suites, tsc, eslint, ruff, the Python unittests), the truth
gate for P1, the matrix capture for anything that touches rendering, the db
reviewer and RLS verification for P6's migration, and a real-device check
before the course is bound for real players.

---

## 6. Not in scope

Production deploy of the harness, the Vercel side project, or any course
binding for real rounds until P1 completes for the holes involved and the
owner authorizes it. No GPS, no automatic tee marker, no automatic pin.
